import type { Effect, Stream } from "effect";
import type { MainContext, SewedError, WebContents } from "sewed";
import type { BrowserWindow } from "sewed/main";

declare const window: BrowserWindow.Handle;
const responsiveness: Stream.Stream<WebContents.Responsiveness, never, MainContext> =
  window.webContents.responsiveness;
const recover: Effect.Effect<void, SewedError, MainContext> = window.webContents.recover;
void responsiveness;
void recover;

// @ts-expect-error Native responsiveness retains main placement.
const withoutMain: Stream.Stream<WebContents.Responsiveness> = window.webContents.responsiveness;
// @ts-expect-error Renderer recovery retains main placement.
const unsafeRecovery: Effect.Effect<void, SewedError> = window.webContents.recover;
void withoutMain;
void unsafeRecovery;

const responsive: WebContents.Responsiveness = { status: "responsive", processId: 123 };
const unresponsive: WebContents.Responsiveness = { status: "unresponsive", processId: 123 };
const unknown: WebContents.Responsiveness = { status: "unknown" };
void responsive;
void unresponsive;
void unknown;

// @ts-expect-error A native responsiveness observation identifies its process.
const unidentified: WebContents.Responsiveness = { status: "unresponsive" };
void unidentified;
