import { Context, Effect, Scope, Stream } from "effect";
import { Decidables, Decision, Launch, MainContext, RendererContext, WorkerContext } from "sewed";
import { App, BrowserWindow } from "sewed/main";
import type { SewedError } from "sewed";

class Documents extends Context.Service<Documents, { readonly saved: boolean }>()(
  "lifecycle/Documents",
) {}
const guard: Effect.Effect<void, SewedError, Documents | MainContext | Scope.Scope> = App.decide(
  Decidables.App.Quit,
  Decision.async(() => Effect.map(Documents, ({ saved }) => (saved ? "allow" : "deny"))),
);
void guard;
// @ts-expect-error Application decision services cannot be erased.
const missing: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = App.decide(
  Decidables.App.Quit,
  Decision.async(() => Effect.map(Documents, ({ saved }) => (saved ? "allow" : "deny"))),
);
void missing;
App.decide(
  Decidables.App.Quit,
  // @ts-expect-error A decider answer outside the decidable's schema does not type-check.
  Decision.async(() => Effect.succeed("maybe")),
);
const windowClose: (
  window: BrowserWindow.Handle,
) => Effect.Effect<void, SewedError, Documents | MainContext | Scope.Scope> = (window) =>
  window.decide(
    Decidables.Window.Close,
    Decision.async(() => Effect.map(Documents, ({ saved }) => (saved ? "allow" : "deny"))),
  );
void windowClose;
// Task 7b: App.decide is the application's own door and takes only `Decidables.App`'s decidables.
App.decide(
  // @ts-expect-error Window.Close belongs to a window, not to the application.
  Decidables.Window.Close,
  Decision.async(() => Effect.succeed("deny")),
);
const wrongOwnerOnWindow = (window: BrowserWindow.Handle) =>
  window.decide(
    // @ts-expect-error App.Quit belongs to the application, not to a window.
    Decidables.App.Quit,
    Decision.async(() => Effect.succeed("deny")),
  );
void wrongOwnerOnWindow;
const missingWindowGuard = (window: BrowserWindow.Handle) =>
  // @ts-expect-error guardClose is gone; a window's close decision goes through decide.
  window.guardClose(Effect.map(Documents, ({ saved }) => saved));
void missingWindowGuard;
// @ts-expect-error Main operations cannot be executed with only renderer capabilities.
const renderer: Effect.Effect<void, SewedError, RendererContext | Scope.Scope> = App.decide(
  Decidables.App.Quit,
  Decision.sync(() => "allow"),
);
void renderer;
// @ts-expect-error Main operations cannot be executed with only worker capabilities.
const worker: Effect.Effect<void, SewedError, WorkerContext | Scope.Scope> = App.decide(
  Decidables.App.Quit,
  Decision.sync(() => "allow"),
);
void worker;
// Step 3: the single-instance lock is a scoped resource the program claims when it chooses.
const claimed: Effect.Effect<
  App.Instance,
  SewedError | App.SecondaryInstance,
  MainContext | Scope.Scope
> = App.claimInstance({ data: { url: "sewed://open", count: 1 } });
const bare: Effect.Effect<
  App.Instance,
  SewedError | App.SecondaryInstance,
  MainContext | Scope.Scope
> = App.claimInstance();
// The claim's options are named publicly, so a consumer can hold onto the shape it passes in.
const claimOptions: App.ClaimOptions = { data: { source: "desktop" } };
void claimOptions;
// @ts-expect-error the claim is main placement; MainContext cannot be erased.
const misplacedClaim: Effect.Effect<App.Instance, SewedError | App.SecondaryInstance, Scope.Scope> =
  App.claimInstance();
void misplacedClaim;
// A secondary process fails with a tagged error the program catches by name.
const quiet: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = Effect.gen(function* () {
  const instance = yield* App.claimInstance({ data: { source: "desktop" } });
  yield* instance.launches.pipe(
    Stream.runForEach(() => Effect.void),
    Effect.forkScoped,
  );
}).pipe(Effect.catchTag("SecondaryInstance", () => App.quit));
// Later launches carry the forwarded arguments and data, with no kind: they are all second instances.
const later: Stream.Stream<Launch.SecondInstance, SewedError> = Effect.runSync(
  Effect.succeed(undefined as unknown as App.Instance),
).launches;
// @ts-expect-error instance data is a JSON object; a function cannot be forwarded to another process.
App.claimInstance({ data: { callback: () => {} } });
// @ts-expect-error `singleInstance` is no longer an App.run option; claim the instance in the program.
App.run(Effect.void, { singleInstance: { additionalData: { url: "sewed://open" } } });
// @ts-expect-error `App.launches` no longer carries second instances; those belong to the claim.
const never: Stream.Stream<{ readonly kind: "second-instance" }, SewedError, MainContext> =
  App.launches;
void claimed;
void bare;
void quiet;
void later;
void never;

// Task 4: App.exit ends the application with an exact code, bypassing the quit decider entirely;
// it reaches the running owner the same way `launches` and `decide` do, so its only requirement is
// MainContext -- no Scope, since nothing here is released back to a caller.
const exitCode: Effect.Effect<never, SewedError, MainContext> = App.exit(0);
void exitCode;
// @ts-expect-error MainContext cannot be erased from App.exit's requirement.
const exitErased: Effect.Effect<never, SewedError> = App.exit(0);
void exitErased;
// @ts-expect-error App.exit's code is a number, not a string.
App.exit("0");

// App.preferredSystemLanguages is a plain synchronous accessor, not an Effect: it is meant to run
// as an input to a declaration thunk, before any Effect runs and before Electron is ready.
const languages: readonly string[] = App.preferredSystemLanguages();
void languages;
// TypeScript reports a generator's yield* mismatch against the whole function literal, not the
// offending statement inside it -- confirmed by stripping this directive and reading the error: it
// names `Effect.gen`'s own `Generator<Effect<...>, ...>` parameter type, with the root cause "Type
// 'string' is not assignable to type 'Effect<unknown, unknown, unknown>'" -- so the directive sits
// here, one line above the `yield*` it is about, rather than on it.
// @ts-expect-error App.preferredSystemLanguages() returns a plain array, not an Effect to yield*.
const notAnEffect = Effect.gen(function* () {
  const value = yield* App.preferredSystemLanguages();
  return value;
});
void notAnEffect;

// App.appPath and App.defaultPath are the same kind of value: plain synchronous accessors, not
// Effects, meant to run in an entry's first pass, before any Effect runs and before Electron is
// ready.
const applicationPath: string = App.appPath();
void applicationPath;
const defaultUserData: string = App.defaultPath("userData");
void defaultUserData;
// @ts-expect-error App.appPath() returns a plain string, not an Effect to yield*.
const appPathNotAnEffect = Effect.gen(function* () {
  const value = yield* App.appPath();
  return value;
});
void appPathNotAnEffect;
// @ts-expect-error App.defaultPath() returns a plain string, not an Effect to yield*.
const defaultPathNotAnEffect = Effect.gen(function* () {
  const value = yield* App.defaultPath("userData");
  return value;
});
void defaultPathNotAnEffect;
// @ts-expect-error "nope" is not a declared Application.PathName.
App.defaultPath("nope");

// App.showErrorBox is a plain synchronous function: a fatal error with no window, for an entry
// that cannot yet build one.
const errorBoxShown: void = App.showErrorBox({
  title: "Sewed error box",
  content: "before readiness",
});
void errorBoxShown;
// @ts-expect-error App.showErrorBox requires content, not just a title.
App.showErrorBox({ title: "Sewed error box" });
