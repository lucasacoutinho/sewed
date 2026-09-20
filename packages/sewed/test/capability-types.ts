import { Context, Effect, Layer, Schema, Scope } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binding, Capability, ClientContext, MainContext, Renderer, SewedError } from "sewed";
import { BrowserWindow, Capability as MainCapability } from "sewed/main";
import * as Testing from "sewed/testing";

const Protocol = RpcGroup.make(
  Rpc.make("double", { payload: { value: Schema.Number }, success: Schema.Number }),
);
const Calculator = Capability.define("calculator", Protocol);
const OtherProtocol = RpcGroup.make(Rpc.make("other"));
const DualProtocol = RpcGroup.make(
  Rpc.make("double", { payload: { value: Schema.Number }, success: Schema.Number }),
  Rpc.make("halve", { payload: { value: Schema.Number }, success: Schema.Number }),
);
const DualCalculator = Capability.define("dual-calculator", DualProtocol);

// The capability's shape is the protocol's client shape.
const call = Effect.gen(function* () {
  const calculator = yield* Calculator;
  const value: number = yield* calculator.double({ value: 1 });
  return value;
});
void call;

// An operation carries no environment of its own: acquiring the capability is what proved it, so
// there is no client context, no scope, and no middleware service left for the caller to supply.
const operation = Effect.gen(function* () {
  const calculator = yield* Calculator;
  const answer: Effect.Effect<number, SewedError> = calculator.double({ value: 1 });
  return yield* answer;
});

// The client Layer produces exactly the capability, requiring only a client environment.
const clientLayer: Layer.Layer<typeof Calculator, never, ClientContext> =
  Capability.client(Calculator);
void clientLayer;

// @ts-expect-error A client Layer requires a client environment, not a main one.
const wrong: Layer.Layer<typeof Calculator, never, MainContext> = Capability.client(Calculator);
void wrong;

// The native Layer produces exactly the capability and requires no environment of its own.
const nativeLayer: Layer.Layer<typeof Calculator, never, never> = Capability.fromHandlers(
  Calculator,
  Protocol.toLayer({ double: ({ value }) => Effect.succeed(value * 2) }),
);
void nativeLayer;

// A native call needs nothing at all: no scope, and no client environment.
const nativeProgram: Effect.Effect<number, SewedError, never> = operation.pipe(
  Effect.provide(nativeLayer),
);
void nativeProgram;

// A call through the client Layer needs only what that Layer itself needs, never a scope.
const clientProgram: Effect.Effect<number, SewedError, ClientContext> = operation.pipe(
  Effect.provide(clientLayer),
);
void clientProgram;

// @ts-expect-error An operation can fail with SewedError, which providing a Layer cannot drop.
const infallible: Effect.Effect<number, never, never> = operation.pipe(Effect.provide(nativeLayer));
void infallible;

class Factor extends Context.Service<Factor, { readonly by: number }>()(
  "capability-types/Factor",
) {}

// What the handlers require stays in the Layer's environment.
const handlerRequirements: Layer.Layer<typeof Calculator, never, Factor> = Capability.fromHandlers(
  Calculator,
  Protocol.toLayer({ double: ({ value }) => Effect.map(Factor, (factor) => value * factor.by) }),
);
void handlerRequirements;

// @ts-expect-error The handlers' own requirements cannot be dropped from the native Layer.
const withoutRequirements: Layer.Layer<typeof Calculator, never, never> = handlerRequirements;
void withoutRequirements;

// @ts-expect-error A handler Layer for a different protocol cannot serve this capability.
Capability.fromHandlers(Calculator, OtherProtocol.toLayer({ other: () => Effect.void }));

// `declaration` names the same slot key `serve` binds, so a renderer entry can declare a
// capability the way it declares any other slot, and `window.webContents.load` still checks the
// binding list against it before Electron starts.
const url = new URL("file:///renderer.html");
const declaredEntry = Renderer.entry(url, { bindings: [Capability.declaration(Calculator)] });
const typedDeclaration: Renderer.Entry<typeof Calculator.key> = declaredEntry;
void typedDeclaration;

// `serve` builds an RPC server and requires `MainContext`, so it lives behind `sewed/main` beside
// `host`. The root entry a renderer imports must not reach it, and every capability's root module
// imports `Capability.ts`, so a `serve` there would enter every renderer bundle.
// @ts-expect-error The root capability module does not expose `serve`.
void Capability.serve;

Effect.gen(function* () {
  const window = yield* BrowserWindow.make();
  const owner = yield* MainCapability.serve(Calculator);
  const bound = Binding.to(Calculator.slot, owner);
  yield* window.webContents.load(declaredEntry, { bindings: [bound] });
  // @ts-expect-error A declared capability slot without a binding is reported before Electron starts.
  yield* window.webContents.load(declaredEntry, { bindings: [] });
});

// --- Task 2: both ends of a capability have a name -----------------------------------------------

// `Capability.Client<C>` names `Capability.Operations<Rpcs>` for `typeof capability` alone. Mutual
// assignment, both ways, pins that it is the same type, not merely a compatible one.
const clientIsOperations = Effect.gen(function* () {
  const calculator = yield* Calculator;
  const asClient: Capability.Client<typeof Calculator> = calculator;
  const asOperations: Capability.Operations<RpcGroup.Rpcs<typeof Protocol>> = asClient;
  const backToClient: Capability.Client<typeof Calculator> = asOperations;
  return backToClient;
});
void clientIsOperations;

// `0 extends 1 & T` holds only when `T` is exactly `any`; see `testing-types.ts` for why this form,
// rather than checking `T` itself, is what makes the pin trustworthy against a union.
type IsAny<T> = 0 extends 1 & T ? true : false;

// A `Partial<Capability.Implementation<...>>` spread over defaults, over `toLayer`, into
// `Testing.host` — Jobwright's own composition — keeps a real requirement: never `any`, and exactly
// `MainContext | Scope` when the handlers themselves need nothing.
const implementationDefaults: Capability.Implementation<typeof Calculator> = {
  double: ({ value }) => Effect.succeed(value * 2),
};
const implementationOverrides: Partial<Capability.Implementation<typeof Calculator>> = {};
const implementationHost = Testing.host(
  Protocol,
  Protocol.toLayer({ ...implementationDefaults, ...implementationOverrides }),
);
const implementationNotAny: IsAny<Effect.Services<typeof implementationHost>> = false;
void implementationNotAny;
const implementationRequirement: Effect.Effect<
  Binding.Owner<RpcGroup.Rpcs<typeof Protocol>>,
  never,
  MainContext | Scope.Scope
> = implementationHost;
void implementationRequirement;

// With an explicit `R`, the same composition carries it through instead of losing it to `any`.
const businessDefaults: Capability.Implementation<typeof Calculator, Factor> = {
  double: ({ value }) => Effect.map(Factor, (factor) => value * factor.by),
};
const businessOverrides: Partial<Capability.Implementation<typeof Calculator, Factor>> = {};
const businessHost = Testing.host(
  Protocol,
  Protocol.toLayer({ ...businessDefaults, ...businessOverrides }),
);
const businessNotAny: IsAny<Effect.Services<typeof businessHost>> = false;
void businessNotAny;
const businessRequirement: Effect.Effect<
  Binding.Owner<RpcGroup.Rpcs<typeof Protocol>>,
  never,
  Factor | MainContext | Scope.Scope
> = businessHost;
void businessRequirement;

const wrongPayload: Capability.Implementation<typeof Calculator> = {
  // @ts-expect-error A handler's payload must match the protocol's declared payload schema.
  double: (value: string) => Effect.succeed(value),
};
void wrongPayload;

// @ts-expect-error A non-`Partial` Implementation record needs every operation the protocol
// declares; `halve` is missing here.
const missingOperation: Capability.Implementation<typeof DualCalculator> = {
  double: ({ value }) => Effect.succeed(value * 2),
};
void missingOperation;
