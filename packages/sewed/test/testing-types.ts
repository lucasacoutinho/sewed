import {
  Binding,
  ClientContext,
  MainContext,
  RendererContext,
  SewedError,
  WorkerContext,
} from "sewed";
import * as Testing from "sewed/testing";
import { Context, Effect, Layer, Schema, Scope, Stream } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/unstable/rpc";

class Rejected extends Schema.TaggedError<Rejected>()("TestingRejected", {
  message: Schema.String,
}) {}

const Protocol = RpcGroup.make(
  Rpc.make("echo", {
    payload: { value: Schema.String },
    success: Schema.String,
  }),
  Rpc.make("reject", { error: Rejected }),
  Rpc.make("events", { success: Schema.Number, stream: true }),
);
const Tasks = Binding.slot("testing-types", Protocol);
const OtherProtocol = RpcGroup.make(Rpc.make("other"));
// @ts-expect-error A different handler Layer cannot satisfy this multi-method slot.
Testing.layer(Tasks, OtherProtocol.toLayer({ other: () => Effect.void }));

const mainLayerShape: Layer.Layer<MainContext> = Testing.main;
void mainLayerShape;

class Business extends Context.Service<Business, { readonly prefix: string }>()(
  "testing-types/Business",
) {}

const handlers = Protocol.toLayer(
  Effect.gen(function* () {
    const business = yield* Business;
    return {
      echo: ({ value }) => Effect.succeed(`${business.prefix}:${value}`),
      reject: () => Effect.fail(new Rejected({ message: "typed" })),
      events: () => Stream.never,
    };
  }),
);

const testingLayer = Testing.layer(Tasks, handlers);
const testingLayerShape: Layer.Layer<ClientContext, SewedError, Business> = testingLayer;
void testingLayerShape;

const call = Effect.gen(function* () {
  const client = yield* Tasks();
  return yield* client.echo({ value: "value" });
}).pipe(Effect.provide(testingLayer));

const requiresBusiness: Effect.Effect<string, unknown, Business | Scope.Scope> = call;
void requiresBusiness;
// @ts-expect-error Testing.layer retains handler business-service requirements.
const missingBusiness: Effect.Effect<string, unknown, Scope.Scope> = call;
void missingBusiness;

// Testing.main supplies the explicit main identity used by an in-process owner.
const noMainRequirement: Effect.Effect<string, unknown, Business | Scope.Scope> = call;
void noMainRequirement;

Effect.gen(function* () {
  const client = yield* Tasks();
  // @ts-expect-error The RPC payload remains constrained by its public schema.
  yield* client.echo({ value: 42 });
});

// @ts-expect-error Every RPC in the protocol needs a schema-derived handler.
const missingSchemaHandler = Protocol.toLayer({
  echo: ({ value }) => Effect.succeed(value),
  reject: () => Effect.fail(new Rejected({ message: "typed" })),
});
void missingSchemaHandler;

class Auth extends RpcMiddleware.Service<Auth>()("testing-types/Auth", {
  requiredForClient: true,
}) {}
const AuthProtocol = RpcGroup.make(Rpc.make("secure", { success: Schema.String }).middleware(Auth));
type AuthRpcs = RpcGroup.Rpcs<typeof AuthProtocol>;
const Authorized = Binding.slot("testing-types-authorized", AuthProtocol);
const authMiddleware = Layer.succeed(Auth, (effect) => effect);
const authorizedHandlers = Layer.mergeAll(
  AuthProtocol.toLayer({
    secure: () => Effect.succeed("authorized"),
  }),
  authMiddleware,
);
const authorizedLayer = Testing.layer(Authorized, authorizedHandlers);
const middlewareCall = Effect.gen(function* () {
  const client = yield* Authorized();
  return yield* client.secure();
}).pipe(Effect.provide(authorizedLayer));
const middlewareRequirements: Effect.Effect<
  string,
  unknown,
  Auth | Rpc.MiddlewareClient<AuthRpcs> | Scope.Scope
> = middlewareCall;
void middlewareRequirements;
// @ts-expect-error Testing.layer does not fabricate a required client middleware service.
const missingMiddleware: Effect.Effect<string, unknown, Auth | Scope.Scope> = middlewareCall;
void missingMiddleware;

const rendererHandlers = Protocol.toLayer(
  Effect.gen(function* () {
    yield* RendererContext;
    return {
      echo: ({ value }) => Effect.succeed(value),
      reject: () => Effect.fail(new Rejected({ message: "typed" })),
      events: () => Stream.never,
    };
  }),
);
const rendererLayer = Testing.layer(Tasks, rendererHandlers);
const rendererCall = Effect.gen(function* () {
  const client = yield* Tasks();
  return yield* client.echo({ value: "renderer" });
}).pipe(Effect.provide(rendererLayer));
const rendererRequirement: Effect.Effect<string, unknown, RendererContext | Scope.Scope> =
  rendererCall;
void rendererRequirement;
// @ts-expect-error Testing.main cannot satisfy a renderer runtime requirement.
const missingRenderer: Effect.Effect<string, unknown, Scope.Scope> = rendererCall;
void missingRenderer;

const workerHandlers = Protocol.toLayer(
  Effect.gen(function* () {
    yield* WorkerContext;
    return {
      echo: ({ value }) => Effect.succeed(value),
      reject: () => Effect.fail(new Rejected({ message: "typed" })),
      events: () => Stream.never,
    };
  }),
);
const workerLayer = Testing.layer(Tasks, workerHandlers);
const workerCall = Effect.gen(function* () {
  const client = yield* Tasks();
  return yield* client.echo({ value: "worker" });
}).pipe(Effect.provide(workerLayer));
const workerRequirement: Effect.Effect<string, unknown, WorkerContext | Scope.Scope> = workerCall;
void workerRequirement;
// @ts-expect-error Testing.main cannot satisfy a worker runtime requirement.
const missingWorker: Effect.Effect<string, unknown, Scope.Scope> = workerCall;
void missingWorker;

const mainHandlers = Protocol.toLayer({
  echo: ({ value }) => Effect.as(MainContext, value),
  reject: () => Effect.fail(new Rejected({ message: "typed" })),
  events: () => Stream.never,
});
const mainLayer = Testing.layer(Tasks, mainHandlers);
const mainCall = Effect.gen(function* () {
  const client = yield* Tasks();
  return yield* client.echo({ value: "main" });
}).pipe(Effect.provide(mainLayer));
const mainRequirement: Effect.Effect<string, unknown, MainContext | Scope.Scope> = mainCall;
void mainRequirement;
// @ts-expect-error Testing.layer retains an explicit MainContext handler requirement.
const missingMain: Effect.Effect<string, unknown, Scope.Scope> = mainCall;
void missingMain;

// The third `onConnect` argument is optional and does not change the layer's shape.
const observedLayer = Testing.layer(Tasks, handlers, { onConnect: () => {} });
const observedLayerShape: Layer.Layer<ClientContext, SewedError, Business> = observedLayer;
void observedLayerShape;
// @ts-expect-error onConnect is a thunk, not a value.
Testing.layer(Tasks, handlers, { onConnect: 1 });
// @ts-expect-error Testing.layer accepts no more than three arguments.
Testing.layer(Tasks, handlers, {}, {});
