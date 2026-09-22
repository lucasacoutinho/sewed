import { Effect, Schema, Scope } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binding, ClientContext, SewedError } from "sewed";

const Protocol = RpcGroup.make(
  Rpc.make("echo", { payload: { value: Schema.String }, success: Schema.String }),
);
type Rpcs = RpcGroup.Rpcs<typeof Protocol>;
const Tasks = Binding.slot("binding-types", Protocol);

declare const context: Effect.Effect<ClientContext["Service"], SewedError>;

// `pending`'s own return is the ordinary `Client<Rpcs>` every other Binding constructor returns:
// one call object, not a promise of one, so a consumer needs no unwrapping to hold it before its
// context resolves.
const pendingClient = Binding.pending(Tasks, { context });
const pendingClientShape: Binding.Client<Rpcs> = pendingClient;
void pendingClientShape;

// `connection` is optional and, when given, the same two strings `deferred` accepts.
Binding.pending(Tasks, { context, connection: "per-call" });
Binding.pending(Tasks, { context, connection: "shared" });
// @ts-expect-error `context` is required; `pending` cannot park a call with nothing to wait on.
Binding.pending(Tasks, {});
// @ts-expect-error `connection` accepts only the two named strings `deferred` also accepts.
Binding.pending(Tasks, { context, connection: "eager" });
// @ts-expect-error `pending` takes a context Effect and options, not a bare `Slot`.
Binding.pending(Tasks);

// A call's error type includes `SewedError`, so a context that failed `Closed` — or a transport
// failure once the context resolves — surfaces through the same channel a caller already narrows.
const call: Effect.Effect<string, SewedError, ClientContext | Scope.Scope> = pendingClient.echo({
  value: "x",
});
void call;
// @ts-expect-error `SewedError` is not erasable from a pending client's call.
const noSewedError: Effect.Effect<string, never, ClientContext | Scope.Scope> = pendingClient.echo({
  value: "x",
});
void noSewedError;
// @ts-expect-error `ClientContext` remains a requirement even though `context` was supplied.
const noClientContext: Effect.Effect<string, SewedError, Scope.Scope> = pendingClient.echo({
  value: "x",
});
void noClientContext;

Effect.gen(function* () {
  const value = yield* pendingClient.echo({ value: "x" });
  const typed: string = value;
  void typed;
  // @ts-expect-error The RPC payload remains constrained by its public schema.
  yield* pendingClient.echo({ value: 1 });
});
