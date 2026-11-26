import { Context, Effect, Layer, Schema, Stream } from "effect";
import { RpcSchema, type Rpc } from "effect/rpc";
import * as Binding from "../Binding.ts";
import type { Capability, Operations } from "../Capability.ts";
import { SewedError } from "../SewedError.ts";
import * as CapabilityDispatch from "./CapabilityDispatch.ts";
import type { HandlerLayer } from "./HandlerLayer.ts";

/** One operation a memory capability was asked for, in the order the calls were made. */
export interface Call {
  readonly tag: string;
  readonly payload: unknown;
}

/** What a memory capability recorded. `calls` is a snapshot, so a test can read it repeatedly. */
export class Recorder extends Context.Service<
  Recorder,
  { readonly calls: Effect.Effect<readonly Call[]> }
>()("sewed/CapabilityRecorder") {}

/** Options for {@link memory}. */
export interface MemoryOptions {
  /**
   * Validates call payloads and handler answers against the capability's protocol schemas.
   * Enabled by default so tests catch schema drift that in-process native dispatch skips.
   */
  readonly validate?: boolean;
}

/**
 * The in-memory Layer for a capability: the same dispatch the native Layer uses, over handlers a
 * test supplies, with every call recorded when it runs. The recorder observes the operation the
 * caller asked for, before the handler decides it, so a denial is recorded exactly like a call
 * that succeeds. The record happens inside the returned Effect or Stream rather than when the
 * operation is merely built, so building a call without running it records nothing, and running
 * a built call twice records it twice.
 *
 * By default (`validate: true`), payloads and handler answers are validated against the protocol's
 * schemas so tests catch schema drift early; pass `{ validate: false }` to opt out.
 */
export const memory = <Rpcs extends Rpc.Any, Key extends string, E, R>(
  capability: Capability<Rpcs, Key>,
  handlers: HandlerLayer<Rpcs, E, R>,
  options: MemoryOptions = {},
): Layer.Layer<Capability<Rpcs, Key> | Recorder, E, R> => {
  const validate = options.validate ?? true;
  const calls: Call[] = [];
  const recorded = Layer.effect(
    capability,
    Effect.map(CapabilityDispatch.dispatch(capability.slot, handlers), (operations) => {
      // The same dynamic method table `Binding.methods` and `Binding.table` already are: the tags
      // are only known once the protocol is inspected, so the recorded shape is built, and the
      // dispatched one read, through `unknown`. A missing tag is reported, never asserted away.
      const table = Binding.table<Rpcs, Operations<Rpcs>>(operations);
      return Binding.methods<Rpcs, Operations<Rpcs>>(capability.protocol, (tag, rpc) => {
        const streaming = RpcSchema.isStreamSchema(rpc.successSchema);
        const encodePayload = validate ? Schema.encodeUnknownEffect(rpc.payloadSchema) : undefined;
        const answerSchema = streaming ? rpc.successSchema.success : rpc.successSchema;
        const encodeAnswer = validate ? Schema.encodeUnknownEffect(answerSchema) : undefined;
        const checkPayload = (input: unknown) =>
          encodePayload === undefined
            ? Effect.void
            : Effect.asVoid(
                Effect.mapError(
                  encodePayload(input),
                  (cause) =>
                    new SewedError({
                      code: "Protocol",
                      message: `Invalid payload for ${tag}`,
                      cause: cause.issue,
                    }),
                ),
              );
        const checkAnswer = (value: unknown) =>
          encodeAnswer === undefined
            ? Effect.succeed(value)
            : Effect.as(
                Effect.mapError(
                  encodeAnswer(value),
                  (cause) =>
                    new SewedError({
                      code: "Protocol",
                      reason: "transport/answer-refused",
                      message: `Invalid answer for ${tag}`,
                      cause: cause.issue,
                    }),
                ),
                value,
              );
        return (input) => {
          const method = table[tag];
          if (method === undefined) {
            return Effect.fail(
              new SewedError({
                code: "Protocol",
                message: `Capability ${capability.key} has no handler for ${tag}`,
              }),
            );
          }
          const record = () => calls.push({ tag, payload: input });
          const result = method(input);
          if (Stream.isStream(result)) {
            return Stream.suspend(() => {
              record();
              const checked =
                encodePayload === undefined
                  ? result
                  : Stream.unwrap(Effect.as(checkPayload(input), result));
              return encodeAnswer === undefined ? checked : Stream.mapEffect(checked, checkAnswer);
            });
          }
          return Effect.suspend(() => {
            record();
            const checked =
              encodePayload === undefined ? result : Effect.andThen(checkPayload(input), result);
            return encodeAnswer === undefined ? checked : Effect.flatMap(checked, checkAnswer);
          });
        };
      });
    }),
  );
  return Layer.mergeAll(
    recorded,
    Layer.succeed(Recorder, { calls: Effect.sync(() => [...calls]) }),
  );
};
