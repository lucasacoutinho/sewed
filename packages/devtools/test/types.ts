import { Effect, Layer } from "effect";
import type { Scope } from "effect";
import { DevTools as EffectDevTools } from "effect/devtools";
import { MainContext, RendererContext, SewedError } from "sewed";
import { BrowserWindow } from "sewed/main";
import * as DevTools from "../lib/index.js";
import { sewedDevTools } from "../lib/vite.js";

const instrumentation: Effect.Effect<DevTools.Handle, SewedError, MainContext | Scope.Scope> =
  DevTools.make();
// @ts-expect-error The collector belongs to main; renderer observations cross the validated bridge.
const misplaced: Effect.Effect<DevTools.Handle, SewedError, RendererContext | Scope.Scope> =
  DevTools.make();
declare const tools: DevTools.Handle;
const snapshot: Effect.Effect<DevTools.Snapshot> = tools.snapshot;
const layer: Layer.Layer<never, SewedError, MainContext> = DevTools.layer({ enabled: true });
sewedDevTools({ main: "src/main/app.ts", env: { LOCAL_VALUE: "yes" } });
// @ts-expect-error Headless diagnostics has no window controls.
tools.show;
// @ts-expect-error Native windows do not attach to the diagnostics collector.
tools.attach;
// @ts-expect-error Headless diagnostics has no presentation options.
DevTools.make({ show: false });
void [instrumentation, misplaced, snapshot, layer];

// --- docs/devtools.md: the guide's examples, spelled as the guide spells them -------------------

declare const program: Effect.Effect<void, SewedError, MainContext | Scope.Scope>;

export const devtoolsGuide = Effect.gen(function* () {
  const tools = yield* DevTools.make({ capacity: 512 });
  yield* Effect.gen(function* () {
    yield* BrowserWindow.make();
  }).pipe(Effect.provide(tools.layer));

  const snapshot = yield* tools.snapshot;
  yield* Effect.logInfo("Observed owners", snapshot.diagnostics.owners.length);
});

export const devtoolsWithEffectDevTools = Effect.gen(function* () {
  const tools = yield* DevTools.make({ capacity: 512 });
  yield* program.pipe(Effect.provide(Layer.provideMerge(tools.layer, EffectDevTools.layer())));
});

export const devtoolsVite = sewedDevTools({
  main: "src/main/app.ts",
  tsconfig: "tsconfig.electron.json",
});
