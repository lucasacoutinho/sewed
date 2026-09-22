import {
  Binding,
  Capability,
  ClientContext,
  Decidables,
  Decision,
  MainContext,
  Navigation,
  RendererContext,
  SewedError,
  WebRequest,
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

// `Testing.renderer` is `Testing.main`'s own shape, beside it: the explicit renderer identity a
// test provides to assert placement, exactly the way `Testing.main` already does for main.
const rendererLayerShape: Layer.Layer<RendererContext> = Testing.renderer;
void rendererLayerShape;
// @ts-expect-error `Testing.renderer` satisfies a renderer requirement, not a main one.
const rendererNotMain: Layer.Layer<MainContext> = Testing.renderer;
void rendererNotMain;

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

// `Testing.client` serves a capability over the real wire in one call: the capability's client
// Layer over an in-process host of `handlers`, so the handlers' own business requirement stays
// visible exactly as it does through `Testing.layer` above.
const Calculator = Capability.define("calculator", Protocol);
const served: Layer.Layer<typeof Calculator, SewedError, Business> = Testing.client(
  Calculator,
  handlers,
);
const servedFromCallback: Layer.Layer<typeof Calculator, SewedError, never> = Testing.client(
  Calculator,
  (implement) =>
    implement({
      echo: ({ value }) => Effect.succeed(value),
      reject: () => Effect.fail(new Rejected({ message: "typed" })),
      events: () => Stream.never,
    }),
);
const observed = Testing.client(Calculator, handlers, { onConnect: () => {} });
// A host can be named as a value a function takes.
const takesHost = (host: Capability.Handlers<RpcGroup.Rpcs<typeof Protocol>, never, Business>) =>
  Testing.client(Calculator, host);
// @ts-expect-error a different protocol's handlers cannot serve this capability.
Testing.client(Calculator, OtherProtocol.toLayer({ other: () => Effect.void }));
// @ts-expect-error Testing.client takes a capability, not a slot.
Testing.client(Calculator.slot, handlers);
// @ts-expect-error the business requirement cannot be erased.
const erased: Layer.Layer<typeof Calculator, SewedError, never> = Testing.client(
  Calculator,
  handlers,
);
void served;
void servedFromCallback;
void observed;
void takesHost;
void erased;

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

// --- the three owner stand-ins ------------------------------------------------------------------
// A feature is written against the minimal interface a real owner publishes, so the same function
// takes a real window's `webContents` and a stand-in. That is the whole claim of this surface, and
// it holds only if the stand-in really is a `Decision.Owner` of the kind it was asked for.
const allowDocs = (contents: Decision.Owner<"contents">) =>
  contents.decide(
    Decidables.WebContents.Navigation,
    Decision.policy(Navigation.Policy, [{ kind: "origin", origin: "https://docs.example" }]),
  );
const contentsStandIn: Decision.Owner<"contents"> = Testing.contents({ of: "window" });
void allowDocs(contentsStandIn);
void allowDocs(Testing.contents({ of: "guest", input: "block" }));
// @ts-expect-error A feature for a contents owner does not take a session stand-in.
void allowDocs(Testing.owner("session"));
// @ts-expect-error "windo" is not an owner kind.
Testing.owner("windo");

// A web contents has no posture-free form in production, so `owner` does not build one: whose
// contents it stands for is required, and a window's has no input posture to set.
// @ts-expect-error A contents stand-in says whose contents it is, through Testing.contents.
Testing.owner("contents");
// @ts-expect-error The request stages have their own constructor, which carries `intercept`.
Testing.owner("requests");
// @ts-expect-error A guest's input posture is not a window's to set.
Testing.contents({ of: "window", input: "block" });
// @ts-expect-error A contents stand-in stands for a window's contents or a guest's, not a session.
Testing.contents({ of: "session" });

// `resolve` answers the decidable's own answer type, with no annotation at the call site.
const navigationAnswer: Effect.Effect<"allow" | "deny"> = Testing.contents({
  of: "window",
}).resolve(Decidables.WebContents.Navigation, {
  url: "https://docs.example/x",
  kind: "navigation",
});
void navigationAnswer;
// @ts-expect-error A window's decidable is not resolved by a contents owner.
Testing.contents({ of: "window" }).resolve(Decidables.Window.Close, { windowId: "w1" });
Testing.contents({ of: "window" }).resolve(
  Decidables.WebContents.Navigation,
  // @ts-expect-error The event a decidable does not describe is not its event.
  { href: "https://x" },
);

// A chain decidable resolves to a `ChainOutcome`, never to one ranked answer, and the two
// resolutions are separate methods because a runtime check on `composition` cannot narrow a type
// parameter: `Decidable` is an interface, not a union. `resolveChain` is on the request-stage
// stand-in alone, because both chain decidables in the catalog are request stages.
const headersOutcome: Effect.Effect<
  Decision.ChainOutcome<WebRequest.RequestHeaders, WebRequest.RequestHeadersDecision>
> = Testing.requests().resolveChain(Decidables.Session.RequestHeaders, {
  id: 1,
  url: "https://api.example/v1",
  method: "GET",
  resourceType: "xhr",
  referrer: "",
  timestamp: 0,
  headers: {},
});
void headersOutcome;
// @ts-expect-error A chain decidable does not resolve to one ranked answer.
Testing.requests().resolve(Decidables.Session.RequestHeaders, {});

// The filtered door lives on the request-stage stand-in alone, with the interface a session
// publishes, so a feature that intercepts names `Decision.Requests` and takes either.
const blockDeletes = (requests: Decision.Requests) =>
  requests.intercept(
    Decidables.Session.Request,
    { urls: ["https://api.example.com/*"], types: ["xhr"] },
    Decision.sync((request) => (request.method === "DELETE" ? { kind: "block" } : Decision.Pass)),
  );
void blockDeletes(Testing.requests());
// @ts-expect-error A stand-in for another owner does not take a request stage.
void blockDeletes(Testing.owner("session"));
// @ts-expect-error `intercept` is the request stages' door and exists on no other stand-in.
Testing.owner("session").intercept;
// @ts-expect-error `resolveChain` is on the request-stage stand-in alone; no other owner chains.
Testing.contents({ of: "window" }).resolveChain;
// In production the `"requests"` kind has exactly one install door, so its stand-in has one too: a
// stage decider is installed through `intercept`, and a test that wants every request says so.
// @ts-expect-error A request stage installs through `intercept`, never through `decide`.
Testing.requests().decide;
void Testing.requests().intercept(
  Decidables.Session.Request,
  { urls: ["<all_urls>"] },
  Decision.pass,
);
// An asynchronous decider's services reach the returned Effect's requirements, as they do on a
// session's own `intercept`: the stand-in runs that decider later, with the context its installer
// had.
const interceptWithServices: Effect.Effect<void, SewedError, MainContext | Scope.Scope | Business> =
  Testing.requests().intercept(
    Decidables.Session.Request,
    { urls: ["<all_urls>"] },
    Decision.async(() => Effect.as(Business, { kind: "block" as const })),
  );
void interceptWithServices;

// --- Task 2, Step 1: reproduce the `any` a consumer reported, as a documented contract ----------
// Jobwright's own helper (`apps/web/tests/desktop/host.ts:45-47`) types a handler record with
// Effect's own `RpcGroup.HandlersFrom`, not with anything Sewed exports:
//   type Handlers<P> = P extends RpcGroup.RpcGroup<infer R> ? RpcGroup.HandlersFrom<R> : never;
// `HandlersFrom<Rpcs>` maps every operation to `Rpc.ToHandlerFn<Current>`, and `ToHandlerFn`'s own
// second parameter defaults to `R = any` when nothing supplies one (`Rpc.d.ts`). So a record typed
// this way already carries `any` before it ever reaches `toLayer` or `Testing.host` — the erasure
// is Effect's default, not a Sewed signature.
type JobwrightHandlers<P> = P extends RpcGroup.RpcGroup<infer R> ? RpcGroup.HandlersFrom<R> : never;

const jobwrightDefaults: JobwrightHandlers<typeof Protocol> = {
  echo: ({ value }) => Effect.succeed(value),
  reject: () => Effect.fail(new Rejected({ message: "typed" })),
  events: () => Stream.never,
};
const jobwrightOverrides: Partial<JobwrightHandlers<typeof Protocol>> = {};

// Jobwright's own composition: defaults overridden per test, spread into `toLayer`, handed to
// `Testing.host` with ordinary `Binding.to`/`Binding.layer` elsewhere.
const jobwrightHost = Testing.host(
  Protocol,
  Protocol.toLayer({ ...jobwrightDefaults, ...jobwrightOverrides }),
);

// `0 extends 1 & T` holds only when `T` is exactly `any`: the checked type is the literal `0`, not
// a naked type parameter, so it never distributes over a union the way `T extends U` would, and no
// real type — `never`, `unknown`, or a union of services — satisfies it.
type IsAny<T> = 0 extends 1 & T ? true : false;

// The pin: `Testing.host`'s emitted declaration is `R | MainContext | Scope`, so this compiles as
// `true` only because `R` itself is `any` — a real union of services would make it `false` (Step 3
// of Task 2 pins that direction on the fixed type). This indicts `HandlersFrom`, not `Testing.host`.
const leaked: IsAny<Effect.Services<typeof jobwrightHost>> = true;
void leaked;

// A second, independent signal: this repository's `exactOptionalPropertyTypes` makes even this
// permissive an annotation refuse an `any` leak rather than silently swallow it. Measured, not
// assumed: `tsc` names `any` in its own message — "Type 'any' is not assignable to type 'never'" —
// which is the compiler pointing at the exact same leak `IsAny` just pinned, from the other side.
// @ts-expect-error `R` is `any`, and TypeScript's own error names it: not a real requirement this
// repository's strict settings would ever refuse this way.
const compilesOnlyBecauseAny: Effect.Effect<unknown, unknown, never> = jobwrightHost;
void compilesOnlyBecauseAny;
