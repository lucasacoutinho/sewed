import { Context, Effect, Layer, Schema, SchemaGetter, Scope, Stream } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/rpc";
import { Binding, ClientContext, MainContext, RendererContext, WorkerContext } from "sewed";
import * as Worker from "sewed/worker";
import { host } from "sewed/testing";

const Protocol = RpcGroup.make(
  Rpc.make("value", { success: Schema.Finite }),
  Rpc.make("events", { success: Schema.Finite, stream: true }),
);
class Store extends Context.Service<Store, { readonly value: number }>()("composition/Store") {}
class Startup extends Schema.TaggedError<Startup>()("Startup", {}) {}

Worker.define(Protocol, (implement) =>
  implement({
    value: () => Worker.threadId,
    events: () => Stream.fromEffect(Worker.threadId),
  }),
);
Worker.define(Protocol, (implement) =>
  implement({
    value: () => Effect.map(Store, (store) => store.value),
    events: () => Stream.make(1),
  }).pipe(Layer.provide(Layer.succeed(Store, { value: 1 }))),
);
const Dependency = Binding.slot("composition/dependency", Protocol);
Worker.define(
  Protocol,
  (implement) =>
    implement(
      Effect.gen(function* () {
        const dependency = yield* Dependency();
        return { value: () => dependency.value().pipe(Effect.orDie), events: () => Stream.make(1) };
      }),
    ),
  { bindings: [Dependency] },
);

// @ts-expect-error Main requirements remain visible in the builder form.
Worker.define(Protocol, (implement) =>
  implement({ value: () => Effect.as(MainContext, 1), events: () => Stream.make(1) }),
);
Worker.define(
  Protocol,
  // @ts-expect-error Renderer requirements remain visible even with declared bindings.
  (implement) =>
    implement({ value: () => Effect.as(RendererContext, 1), events: () => Stream.make(1) }),
  { bindings: [] },
);
// @ts-expect-error Streams preserve their execution requirements too.
Worker.define(Protocol, (implement) =>
  implement({
    value: () => Effect.succeed(1),
    events: () => Stream.fromEffect(Effect.as(MainContext, 1)),
  }),
);
// @ts-expect-error Business services must be provided before defining a worker.
Worker.define(Protocol, (implement) =>
  implement({ value: () => Effect.as(Store, 1), events: () => Stream.make(1) }),
);
Worker.define(Protocol, (implement) =>
  // @ts-expect-error The builder checks the protocol's result schema.
  implement({ value: () => Effect.succeed("wrong"), events: () => Stream.make(1) }),
);
// @ts-expect-error All declared handlers are required.
Worker.define(Protocol, (implement) => implement({ value: () => Effect.succeed(1) }));
const Other = RpcGroup.make(Rpc.make("other"));
// @ts-expect-error The builder cannot widen a mismatched protocol into the owner's contract.
Worker.define(Protocol, () => Other.toLayer({ other: () => Effect.void }));

const hosted = host(Protocol, (implement) =>
  implement(
    Effect.gen(function* () {
      yield* Effect.fail(new Startup({}));
      return {
        value: () => Effect.map(Store, (store) => store.value),
        events: () => Stream.make(1),
      };
    }),
  ),
);
const requirement: Effect.Effect<
  Binding.Owner<RpcGroup.Rpcs<typeof Protocol>>,
  Startup,
  MainContext | Scope.Scope | Store
> = hosted;
void requirement;
// @ts-expect-error Main host builders retain business service requirements.
const missingStore: Effect.Effect<unknown, Startup, MainContext | Scope.Scope> = hosted;
void missingStore;
// @ts-expect-error Layer startup failures remain in the host's typed error channel.
const missingError: Effect.Effect<unknown, never, MainContext | Scope.Scope | Store> = hosted;
void missingError;

class Auth extends RpcMiddleware.Service<Auth>()("composition/Auth") {}
const Authorized = RpcGroup.make(Rpc.make("read", { success: Schema.Finite }).middleware(Auth));
// @ts-expect-error A handler implementation cannot erase server middleware services.
Worker.define(Authorized, (implement) => implement({ read: () => Effect.succeed(1) }));

const EncodedNumber = Schema.Finite.pipe(
  Schema.decodeTo(Schema.Finite, {
    decode: SchemaGetter.transformEffect((value) => Effect.as(Store, value)),
    encode: SchemaGetter.transformEffect((value) => Effect.as(Store, value)),
  }),
);
const Coded = RpcGroup.make(
  Rpc.make("read", { payload: { value: EncodedNumber }, success: EncodedNumber }),
);
// @ts-expect-error Required schema services must be supplied along with the handlers.
Worker.define(Coded, (implement) => implement({ read: ({ value }) => Effect.succeed(value) }));
Worker.define(Coded, (implement) =>
  implement({ read: ({ value }) => Effect.succeed(value) }).pipe(
    Layer.provideMerge(Layer.succeed(Store, { value: 1 })),
  ),
);

const workerRequirement: Effect.Effect<number, never, WorkerContext> = Worker.threadId;
const clientRequirement: Layer.Layer<ClientContext, unknown, MainContext> = Binding.layer([]);
void workerRequirement;
void clientRequirement;
