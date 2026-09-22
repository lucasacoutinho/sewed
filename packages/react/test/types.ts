import { Cause, Context, Effect, Schema, Stream, Types } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/unstable/rpc";
import {
  Binding,
  ClientContext,
  MainContext,
  RendererContext,
  Renderer,
  SewedError,
  WorkerContext,
} from "sewed";
import { App, BrowserWindow, Session } from "sewed/main";
import * as ReactModule from "../lib/index.js";
import {
  connect,
  mount,
  RuntimeProvider,
  useAction,
  useClient,
  useResource,
  useRuntimeStatus,
  useStream,
} from "../lib/index.js";
import type { RuntimeState, RuntimeStore } from "../lib/index.js";

// The package's runtime exports are exactly this documented list: `useRuntime` is gone (it was
// never exported, so there is no symbol left to pin its absence against directly), and nothing
// else leaked in its place. `Types.Equals` is a strict two-way check, so an extra or a missing
// export on either side fails it.
type DocumentedExports =
  | "connect"
  | "mount"
  | "RuntimeProvider"
  | "useAction"
  | "useClient"
  | "useResource"
  | "useRuntimeStatus"
  | "useStream";
const exportsMatchDocumented: Types.Equals<keyof typeof ReactModule, DocumentedExports> = true;
void exportsMatchDocumented;

class Failure extends Schema.TaggedError<Failure>()("Failure", { message: Schema.String }) {}
const Protocol = RpcGroup.make(
  Rpc.make("read", { payload: { key: Schema.String }, success: Schema.Number, error: Failure }),
  Rpc.make("changes", { success: Schema.Number, stream: true }),
);
const Slot = Binding.slot("react-test", Protocol);

const Component = () => {
  const client = useClient(Slot);
  const action = useAction((key: string) => client.read({ key }));
  action.run("first");
  // @ts-expect-error Action arguments retain the factory's payload type.
  action.run(1);
  if (action.status === "success") {
    const value: number = action.value;
    void value;
  }
  const state = useStream(() => client.changes(), [client]);
  if (state.status === "value") {
    const value: number = state.value;
    void value;
  }
  // @ts-expect-error Inline stream values cannot cause accidental resubscriptions.
  useStream(client.changes(), [client]);
  // @ts-expect-error Factories must declare their reactive dependencies.
  useStream(() => client.changes());
  const resource = useResource(() => client.read({ key: "resource" }), [client]);
  resource.release();
  resource.reload();
  if (resource.status === "ready") {
    const value: number = resource.value;
    void value;
  }
  // @ts-expect-error Resource factories retain their dependency list.
  useResource(() => client.read({ key: "resource" }));
  // @ts-expect-error Resources accept a factory, not an already-created effect.
  useResource(client.read({ key: "resource" }), [client]);
  return null;
};
void Component;

// The hooks' failure types widen to `E | SewedError`: the hook itself can fail for want of a
// runtime, independent of whatever the factory's own effect declares. Isolated factories (no
// Binding client involved, so `Failure` alone is the factory's own declared error) keep this pin
// from being confused with `Binding.Client`'s own, separate inclusion of `SewedError`.
const WidenedFailures = () => {
  const action = useAction(() => Effect.fail(new Failure({ message: "x" })));
  if (action.status === "failure") {
    const cause: Cause.Cause<Failure | SewedError> = action.cause;
    void cause;
    // @ts-expect-error useAction's own failure widens to include SewedError; not erasable.
    const withoutRuntimeFailure: Cause.Cause<Failure> = action.cause;
    void withoutRuntimeFailure;
  }
  const stream = useStream(() => Stream.fail(new Failure({ message: "x" })), []);
  if (stream.status === "failure") {
    const cause: Cause.Cause<Failure | SewedError> = stream.cause;
    void cause;
    // @ts-expect-error useStream's own failure widens to include SewedError; not erasable.
    const withoutRuntimeFailure: Cause.Cause<Failure> = stream.cause;
    void withoutRuntimeFailure;
  }
  const resource = useResource(() => Effect.fail(new Failure({ message: "x" })), []);
  if (resource.status === "failure") {
    const cause: Cause.Cause<Failure | SewedError> = resource.cause;
    void cause;
    // @ts-expect-error useResource's own failure widens to include SewedError; not erasable.
    const withoutRuntimeFailure: Cause.Cause<Failure> = resource.cause;
    void withoutRuntimeFailure;
  }
  return null;
};
void WidenedFailures;

// @ts-expect-error Main capabilities cannot execute in React actions.
useAction(() => MainContext);
// @ts-expect-error Worker capabilities cannot execute in React actions.
useAction(() => WorkerContext);
// @ts-expect-error Main-required streams keep their placement requirement.
useStream(() => Stream.fromEffect(MainContext), []);
// @ts-expect-error Worker-required streams keep their placement requirement.
useStream(() => Stream.fromEffect(WorkerContext), []);
// @ts-expect-error Main capabilities cannot execute in React resources.
useResource(() => MainContext, []);
// @ts-expect-error Worker capabilities cannot execute in React resources.
useResource(() => WorkerContext, []);
// @ts-expect-error Native session acquisition remains in main.
useAction(() => Session.defaultSession);
// @ts-expect-error Native resource construction remains in main.
useAction(() => BrowserWindow.make());
// @ts-expect-error Application shutdown remains in main.
useAction(() => App.quit);
// @ts-expect-error Application observers remain in main.
useStream(() => App.activations, []);
// @ts-expect-error Mounting a React root requires a Sewed renderer/client scope.
Effect.runPromise(mount(document.body, null));

class Auth extends RpcMiddleware.Service<Auth>()("react-test/Auth", { requiredForClient: true }) {}
const Secured = Binding.slot("secured", RpcGroup.make(Rpc.make("read").middleware(Auth)));
const SecuredComponent = () => {
  const client = useClient(Secured);
  // @ts-expect-error Deferred clients retain unprovided middleware requirements.
  useAction(() => client.read());
  // @ts-expect-error Resources retain unprovided middleware requirements.
  useResource(() => client.read(), []);
  return null;
};
void SecuredComponent;

// A page that owns its React root connects outside React and provides the runtime to that tree.
const store: RuntimeStore = connect(
  Renderer.entry(new URL("http://localhost/"), { bindings: [Slot] }),
);
const provided = RuntimeProvider({ store, children: null });
const StatusProbe = () => {
  const status: RuntimeState = useRuntimeStatus();
  if (status.status === "unavailable") void status.cause;
  return null;
};
store.close();
void provided;
void StatusProbe;
// @ts-expect-error A store connects a renderer entry, not a bare URL.
connect(new URL("http://localhost/"));
// Plain async code runs renderer effects through the same connection.
const answered: Promise<number> = store.run(Effect.succeed(1));
void answered;
// @ts-expect-error A renderer store cannot run main-process effects.
void store.run(Effect.andThen(MainContext, Effect.succeed(1)));

// `run`'s second argument carries only `signal`, an ordinary `AbortSignal` the caller bridged by
// hand; code outside React can cancel what it started through it.
const controller = new AbortController();
const cancellable: Promise<number> = store.run(Effect.succeed(1), { signal: controller.signal });
void cancellable;
// @ts-expect-error `signal` is an AbortSignal, not a string.
store.run(Effect.succeed(1), { signal: "x" });

// `store.runtime` succeeds at once when ready, waits while connecting, and fails `Closed`
// carrying the cause when unavailable: one Effect, not a promise of one, so every hook can
// `flatMap` it without first checking `useRuntimeStatus`.
const runtime: Effect.Effect<
  Context.Context<ClientContext | RendererContext>,
  SewedError
> = store.runtime;
void runtime;
// @ts-expect-error The runtime effect can fail Closed; it is not infallible.
const infallibleRuntime: Effect.Effect<
  Context.Context<ClientContext | RendererContext>,
  never
> = store.runtime;
void infallibleRuntime;
