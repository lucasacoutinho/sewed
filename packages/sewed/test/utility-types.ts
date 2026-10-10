import { Context, Effect, Layer, Schema, Scope } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/rpc";
import {
  Binding,
  ClientContext,
  MainContext,
  SewedError,
  UtilityContext,
  WorkerContext,
} from "sewed";
import * as Utility from "sewed/utility";
import { Utility as UtilityHost } from "sewed/main";

const Protocol = RpcGroup.make(
  Rpc.make("value", { success: Schema.Finite }),
  Rpc.make("echo", { payload: { value: Schema.String }, success: Schema.String }),
);

const basic = Utility.define(Protocol, (implement) =>
  implement({
    value: () => Utility.processId,
    echo: ({ value }) => Effect.succeed(value),
  }),
);
void basic;

const Dependency = Binding.slot("utility-dependency", Protocol);
const dependent = Utility.define(
  Protocol,
  (implement) =>
    implement(
      Effect.gen(function* () {
        yield* UtilityContext;
        const dependency = yield* Dependency();
        return {
          value: () => dependency.value().pipe(Effect.orDie),
          echo: ({ value }) => dependency.echo({ value }).pipe(Effect.orDie),
        };
      }),
    ),
  { bindings: [Dependency] },
);
void dependent;

// @ts-expect-error Main services are unavailable inside a utility process.
Utility.define(Protocol, (implement) =>
  implement({
    value: () => Effect.as(MainContext, 1),
    echo: ({ value }) => Effect.succeed(value),
  }),
);

// @ts-expect-error Worker services are unavailable inside a utility process.
Utility.define(Protocol, (implement) =>
  implement({
    value: () => Effect.as(WorkerContext, 1),
    echo: ({ value }) => Effect.succeed(value),
  }),
);

// @ts-expect-error A dependency-aware handler cannot erase its client requirement.
Utility.define(Protocol, (implement) =>
  implement(
    Effect.gen(function* () {
      const dependency = yield* Dependency();
      return {
        value: () => dependency.value().pipe(Effect.orDie),
        echo: ({ value }) => dependency.echo({ value }).pipe(Effect.orDie),
      };
    }),
  ),
);

class Store extends Context.Service<Store, { readonly prefix: string }>()("utility/Store") {}
const withStore = Utility.define(Protocol, (implement) =>
  implement({
    value: () => Effect.map(Store, ({ prefix }) => prefix.length),
    echo: ({ value }) => Effect.map(Store, ({ prefix }) => `${prefix}:${value}`),
  }).pipe(Layer.provide(Layer.succeed(Store, { prefix: "utility" }))),
);
void withStore;

// @ts-expect-error Business services must be supplied by the handler layer.
Utility.define(Protocol, (implement) =>
  implement({
    value: () => Effect.map(Store, ({ prefix }) => prefix.length),
    echo: ({ value }) => Effect.map(Store, ({ prefix }) => `${prefix}:${value}`),
  }),
);

class Auth extends RpcMiddleware.Service<Auth>()("utility/Auth", { requiredForClient: true }) {}
const Authorized = RpcGroup.make(Rpc.make("secure", { success: Schema.String }).middleware(Auth));
// @ts-expect-error Required middleware remains in the utility definition requirements.
Utility.define(Authorized, (implement) => implement({ secure: () => Effect.succeed("ok") }));

const middleware = Layer.succeed(Auth, (effect) => effect);
const authorized = Utility.define(
  Authorized,
  Layer.mergeAll(Authorized.toLayer({ secure: () => Effect.succeed("ok") }), middleware),
);
void authorized;

const entry = Utility.entry(new URL("file:///utility-entry.js"), Protocol);
const spawned: Effect.Effect<
  UtilityHost.Handle<RpcGroup.Rpcs<typeof Protocol>>,
  SewedError,
  MainContext | Scope.Scope
> = UtilityHost.spawn(entry);
void spawned;

const process: Effect.Effect<number, never, UtilityContext> = Utility.processId;
void process;

const clientRequirement: Effect.Effect<unknown, unknown, ClientContext | Scope.Scope> =
  Dependency();
void clientRequirement;
