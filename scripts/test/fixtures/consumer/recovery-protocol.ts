import { Context, Deferred, Effect, Schema, SchemaGetter } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binding, SewedError } from "sewed";

export const Encoding = Context.Service<
  "walkthrough/Encoding",
  {
    readonly entered: Deferred.Deferred<void>;
    readonly release: Deferred.Deferred<void>;
    readonly finalized: Deferred.Deferred<void>;
  }
>("walkthrough/Encoding");

const Value = Schema.String.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.passthrough(),
    encode: SchemaGetter.transformEffect((value) =>
      value !== "hold-encode"
        ? Effect.succeed(value)
        : Effect.flatMap(Encoding, ({ entered, release, finalized }) =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.as(value),
              Effect.ensuring(Deferred.succeed(finalized, undefined)),
            ),
          ),
    ),
  }),
);

export class Rejected extends Schema.TaggedError<Rejected>()("Rejected", {
  message: Schema.String,
}) {}

export const RecoveryProtocol = RpcGroup.make(
  Rpc.make("save", {
    payload: { value: Value },
    success: Schema.Finite,
    error: Schema.Union([Rejected, SewedError]),
  }),
  Rpc.make("committed", { success: Schema.Finite }),
  Rpc.make("count", { success: Schema.Finite }),
);
export const Documents = Binding.slot("walkthrough/documents", RecoveryProtocol);
