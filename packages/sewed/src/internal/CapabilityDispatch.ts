import { Context, Deferred, Effect, Layer, Scope, Stream } from "effect";
import { Rpc, RpcSchema } from "effect/rpc";
import * as Headers from "effect/http/Headers";
import { RequestId } from "effect/rpc/RpcMessage";
import * as Binding from "../Binding.ts";
import type { Operations } from "../Capability.ts";
import { SewedError } from "../SewedError.ts";
import { handlerLayer, type HandlerLayer } from "./HandlerLayer.ts";

// The handler entry shape, pinned by test/capability-dispatch.test.ts: a built handler layer
// holds one entry per RPC in its context under that RPC's own key (`effect/rpc/Rpc/<tag>`),
// shaped `{ tag, handler, context }`, where `context` is the context the layer was built with.
// RpcServer calls `entry.handler(payload, metadata)` and runs the result under
// `Context.merge(entry.context, <the calling fiber's context>)`, so the caller's services take
// precedence over the entry's own. Dispatching in process makes the same call with the same
// precedence, which is all a native capability needs: no encoding, no connection, no client.

type UnknownEffect = Effect.Effect<unknown, unknown, unknown>;
type UnknownStream = Stream.Stream<unknown, unknown, unknown>;
type UnknownResult = UnknownEffect | UnknownStream;

interface Metadata {
  readonly client: Rpc.ServerClient;
  readonly requestId: RequestId;
  readonly headers: Headers.Headers;
  readonly rpc: Rpc.Any;
  readonly payload: unknown;
}

interface HandlerEntry {
  readonly handler: (
    payload: unknown,
    metadata: Metadata,
  ) => UnknownResult | Rpc.Wrapper<UnknownResult>;
  readonly context: Context.Context<never>;
}

// Entries are stored by RPC key, so the key names the entry's own shape rather than a service.
const entryKey = (key: string): Context.Key<unknown, HandlerEntry> =>
  Context.Service<unknown, HandlerEntry>(key);

// The entry's build scope has already served its purpose; the caller's scope governs the call.
const withoutScope = (context: Context.Context<never>): Context.Context<never> =>
  Context.omit(Scope.Scope)(context);

interface Procedure {
  readonly rpc: Rpc.AnyWithProps;
  readonly streaming: boolean;
  readonly entry: HandlerEntry | undefined;
}

export const dispatch = <Rpcs extends Rpc.Any, E, R>(
  slot: Binding.Slot<Rpcs>,
  handlers: HandlerLayer<Rpcs, E, R>,
): Effect.Effect<Operations<Rpcs>, E, R | Scope.Scope> =>
  Effect.gen(function* () {
    const protocol = slot.protocol;
    const services = yield* Layer.build(handlerLayer(protocol, handlers));
    const procedures = new Map<string, Procedure>();
    for (const [tag, request] of protocol.requests) {
      const rpc = Binding.propsOf(request);
      procedures.set(tag, {
        rpc,
        streaming: RpcSchema.isStreamSchema(rpc.successSchema),
        entry: Context.getOrUndefined(services, entryKey(rpc.key)),
      });
    }
    const client = new Rpc.ServerClient(0);
    let requests = 0;
    return Binding.methods<Rpcs, Operations<Rpcs>>(protocol, (tag, input) => {
      const missing = (message: string) => new SewedError({ code: "Protocol", message });
      const absent = `Capability ${slot.key} has no handler for ${tag}`;
      const procedure = procedures.get(tag);
      if (procedure === undefined) return Effect.fail(missing(absent));
      const fail = (message: string) =>
        procedure.streaming ? Stream.fail(missing(message)) : Effect.fail(missing(message));
      const entry = procedure.entry;
      if (entry === undefined) return fail(absent);
      const metadata: Metadata = {
        client,
        requestId: RequestId(String(requests++)),
        headers: Headers.empty,
        rpc: procedure.rpc,
        payload: input,
      };
      const produced = entry.handler(input, metadata);
      // A handler may wrap its result to ask the server for fork or uninterruptible execution.
      // In process there is no request fiber to schedule, so the wrapped result itself runs.
      const result: UnknownResult = Rpc.isWrapper(produced) ? produced.value : produced;
      const handlerContext = withoutScope(entry.context);
      if (procedure.streaming) {
        if (!Stream.isStream(result)) {
          return fail(`Capability ${slot.key} handler for ${tag} returned no stream`);
        }
        return Stream.unwrap(
          Effect.map(Effect.context<never>(), (caller) =>
            Stream.provideContext(result, Context.merge(handlerContext, caller)),
          ),
        );
      }
      if (!Effect.isEffect(result)) {
        return fail(`Capability ${slot.key} handler for ${tag} returned no effect`);
      }
      return Effect.flatMap(Effect.context<never>(), (caller) =>
        Effect.provideContext(
          // A handler may answer with a Deferred the server awaits in place of the value. That is
          // a branch between two successes, not a filter that can fail.
          // @effect-diagnostics-next-line flatMapConditionalToFilterOrFail:off
          Effect.flatMap(result, (success) =>
            Deferred.isDeferred(success) ? Deferred.await(success) : Effect.succeed(success),
          ),
          Context.merge(handlerContext, caller),
        ),
      );
    });
  });
