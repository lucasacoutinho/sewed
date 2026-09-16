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
