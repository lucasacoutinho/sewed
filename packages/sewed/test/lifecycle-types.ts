import { Context, Effect, Scope } from "effect";
import { MainContext, RendererContext, WorkerContext } from "sewed";
import { App, BrowserWindow } from "sewed/main";
import type { SewedError } from "sewed";

class Documents extends Context.Service<Documents, { readonly saved: boolean }>()(
  "lifecycle/Documents",
) {}
const guard: Effect.Effect<void, SewedError, Documents | MainContext | Scope.Scope> = App.guardQuit(
  Effect.map(Documents, ({ saved }) => saved),
);
void guard;
// @ts-expect-error Application guard services cannot be erased.
const missing: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = App.guardQuit(
  Effect.map(Documents, ({ saved }) => saved),
);
void missing;
// @ts-expect-error Guard failures require an explicit application decision.
App.guardQuit(Effect.fail("decision unavailable"));
const windowGuard = (window: BrowserWindow.Handle) =>
  window.guardClose(Effect.map(Documents, ({ saved }) => saved));
void windowGuard;
// @ts-expect-error Main operations cannot be executed with only renderer capabilities.
const renderer: Effect.Effect<void, SewedError, RendererContext | Scope.Scope> = App.guardQuit(
  Effect.succeed(true),
);
void renderer;
// @ts-expect-error Main operations cannot be executed with only worker capabilities.
const worker: Effect.Effect<void, SewedError, WorkerContext | Scope.Scope> = App.guardQuit(
  Effect.succeed(true),
);
void worker;
App.run(Effect.void, { singleInstance: { additionalData: { url: "sewed://open", count: 1 } } });
// @ts-expect-error Single-instance data must be JSON data.
App.run(Effect.void, { singleInstance: { additionalData: { callback: () => {} } } });
