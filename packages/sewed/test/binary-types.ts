import { Context, Effect, Schema, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binary, Binding, ClientContext } from "../src/index.ts";
import type { Scope } from "effect";

class Source extends Context.Service<Source, { readonly bytes: Uint8Array }>()("BinarySource") {}
class Failed extends Schema.TaggedError<Failed>()("ByteSourceFailed", {}) {}

const source: Stream.Stream<Uint8Array, Failed, Source> = Stream.fromEffect(
  Effect.map(Source, ({ bytes }) => bytes),
);
const split: Stream.Stream<Uint8Array, Failed, Source> = Binary.chunks(source);
// @ts-expect-error Splitting bytes does not supply the source service.
const missingSource: Stream.Stream<Uint8Array, Failed> = split;

// A byte field is `Uint8Array` on both sides of the codec: what a handler is handed, and what
// reaches the packer. The re-view that makes another realm's bytes this realm's happens inside
// that encode, so it is invisible to a consumer's types.
const declared: Uint8Array = undefined as unknown as typeof Binary.Bytes.Type;
const encoded: Uint8Array = undefined as unknown as typeof Binary.Bytes.Encoded;
// @ts-expect-error A byte field is not a base64 string; `Binary.Bytes` keeps bytes as bytes.
const notText: string = undefined as unknown as typeof Binary.Bytes.Encoded;

const group = Binary.protocol(
  RpcGroup.make(Rpc.make("echo", { payload: { bytes: Binary.Bytes }, success: Binary.Bytes })),
);
const bytes = Binding.slot("binary-types", group);
const echo = Effect.gen(function* () {
  const client = yield* bytes();
  const output: Uint8Array = yield* client.echo({ bytes: new Uint8Array([1]) });
  // @ts-expect-error Byte protocols still check payloads.
  client.echo({ bytes: "1" });
  return output;
});
const requiresRuntime: Effect.Effect<Uint8Array, unknown, ClientContext | Scope.Scope> = echo;
// @ts-expect-error Binary annotations do not provide a client runtime or scope.
const unbound: Effect.Effect<Uint8Array, unknown> = echo;
void [missingSource, requiresRuntime, unbound, declared, encoded, notText];
