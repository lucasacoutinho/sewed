import { Context, Effect, Scope } from "effect";
import { Decidables, Decision, MainContext, RendererContext, WorkerContext } from "sewed";
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
App.run(Effect.void, { singleInstance: { additionalData: { url: "sewed://open", count: 1 } } });
// @ts-expect-error Single-instance data must be JSON data.
App.run(Effect.void, { singleInstance: { additionalData: { callback: () => {} } } });
