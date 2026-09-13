import { Context, Effect, Layer, Schema, SchemaGetter, Scope, Stream } from "effect";
import { Rpc, RpcClient, RpcGroup, RpcMiddleware } from "effect/unstable/rpc";
import * as Binding from "../src/Binding.ts";
import type { ClientContext } from "../src/RuntimeContext.ts";
import type { HandlerServices } from "../src/Runtime.ts";
import { SewedError } from "../src/SewedError.ts";
import * as Remote from "../src/Remote.ts";

class CodecEncode extends Context.Service<CodecEncode, { readonly direction: "encode" }>()(
  "remote-types/CodecEncode",
) {}

class CodecDecode extends Context.Service<CodecDecode, { readonly direction: "decode" }>()(
  "remote-types/CodecDecode",
) {}

const CodedString = Schema.String.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transformEffect((value) => Effect.as(CodecDecode, value)),
    encode: SchemaGetter.transformEffect((value) => Effect.as(CodecEncode, value)),
  }),
);

const CodedFailure = Schema.Struct({
  _tag: Schema.Literal("RemoteAcquisitionFailure"),
  message: CodedString,
});
type AcquisitionFailure = Schema.Schema.Type<typeof CodedFailure>;

class ResourceServices extends Context.Service<ResourceServices, { readonly prefix: string }>()(
  "remote-types/ResourceServices",
) {}

class Auth extends RpcMiddleware.Service<Auth>()("remote-types/Auth", {
  requiredForClient: true,
}) {}

const Methods = RpcGroup.make(
  Rpc.make("read", {
    payload: { size: Schema.Number },
    success: CodedString,
  }).middleware(Auth),
  Rpc.make("watch", {
    success: CodedString,
    stream: true,
  }).middleware(Auth),
);
type MethodsRpcs = RpcGroup.Rpcs<typeof Methods>;

const Reader = Remote.make({
  payload: Schema.Struct({ path: CodedString }),
  protocol: Methods,
  error: CodedFailure,
});
type ReaderWireRpcs = RpcGroup.Rpcs<typeof Reader.protocol>;
const Readers = Binding.slot("remote-types/readers", Reader.protocol);
const authMiddleware = Layer.succeed(Auth, (effect) => effect);

const resourceLayer = Remote.layer(Reader, ({ path }) =>
  Layer.mergeAll(
    Methods.toLayer(
      Effect.gen(function* () {
        const services = yield* ResourceServices;
        return {
          read: ({ size }) => Effect.succeed(`${services.prefix}:${path}:${size}`),
          watch: () => Stream.never,
        };
      }),
    ),
    authMiddleware,
  ),
);

const resourceLayerShape: Layer.Layer<
  HandlerServices<ReaderWireRpcs>,
  AcquisitionFailure | SewedError,
  ResourceServices | CodecEncode | Rpc.ServicesServer<ReaderWireRpcs>
> = resourceLayer;
void resourceLayerShape;

// The resource factory retains its handler-layer service requirement.
// @ts-expect-error ResourceServices cannot be erased from Remote.layer.
const missingResourceServices: Layer.Layer<
  HandlerServices<ReaderWireRpcs>,
  AcquisitionFailure | SewedError
> = resourceLayer;
void missingResourceServices;

const acquired = Remote.acquire(Reader, Readers, { path: "/tmp/example" });
const acquiredShape: Effect.Effect<
  Remote.Handle<MethodsRpcs, typeof CodedFailure>,
  AcquisitionFailure | SewedError,
  ClientContext | Scope.Scope | Rpc.MiddlewareClient<ReaderWireRpcs> | CodecEncode | CodecDecode
> = acquired;
void acquiredShape;

// Acquisition keeps the method table and its client middleware requirement.
const useReader = Effect.gen(function* () {
  const handle = yield* acquired;
  const text: Effect.Effect<
    string,
    AcquisitionFailure | SewedError,
    | ClientContext
    | Scope.Scope
    | Rpc.ServicesClient<MethodsRpcs>
    | Rpc.MiddlewareClient<MethodsRpcs>
  > = handle.client.read({ size: 4 });
  yield* text;
  yield* handle.release;
});
void useReader;

const releaseOnly = (
  handle: Remote.Handle<MethodsRpcs, typeof CodedFailure>,
): Effect.Effect<
  void,
  AcquisitionFailure | SewedError,
  ClientContext | Rpc.MiddlewareClient<MethodsRpcs>
> => handle.release;
void releaseOnly;

// @ts-expect-error Releasing a lease still requires the caller's ClientContext.
const missingReleaseContext: (
  handle: Remote.Handle<MethodsRpcs, typeof CodedFailure>,
) => Effect.Effect<void, unknown, Rpc.MiddlewareClient<MethodsRpcs>> = releaseOnly;
void missingReleaseContext;

// The opaque handle exposes only the declared client and release operation.
const inspectHandle = (opaque: Remote.Handle<MethodsRpcs, typeof CodedFailure>) => {
  void opaque.client.read;
  void opaque.release;
  // @ts-expect-error Raw lease fields are not part of the handle.
  void opaque.token;
};
void inspectHandle;

// Required client middleware is not fabricated by Remote.acquire.
// @ts-expect-error The required Auth client middleware remains in the effect environment.
const missingAuth: Effect.Effect<
  string,
  unknown,
  ClientContext | Scope.Scope | Rpc.ServicesClient<MethodsRpcs>
> = useReader.pipe(Effect.as("ok"));
void missingAuth;

const OtherMethods = RpcGroup.make(Rpc.make("other", { success: Schema.String }));
const OtherReader = Remote.make({
  payload: Schema.Struct({ path: Schema.String }),
  protocol: OtherMethods,
});
const OtherSlot = Binding.slot("remote-types/other", OtherReader.protocol);
// @ts-expect-error A method slot with another protocol cannot satisfy the reader definition.
const mismatchedSlot = Remote.acquire(Reader, OtherSlot, { path: "/tmp/example" });
void mismatchedSlot;

void Auth;
void RpcClient;
