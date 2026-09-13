import { Effect, Layer } from "effect";
import type { Scope } from "effect";
import { MainContext, RendererContext, SewedError } from "sewed";
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
