import { app, BaseWindow, webContents, webFrameMain } from "electron";
import { Effect, Schema } from "effect";
import type { Stream } from "effect";
import * as Application from "../Application.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as ContentsRegistry from "./ContentsRegistry.ts";
import * as Handles from "./Handles.ts";
import * as Observation from "./Observation.ts";
import type { Core } from "./WebContentsCore.ts";
import { idOf } from "./Window.ts";

const read = <A>(message: string, run: () => A): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: run,
      catch: (cause) => new SewedError({ code: "Native", message, cause }),
    }),
  );

const windowEntry = (window: Electron.BaseWindow): Application.WindowEntry => ({
  id: idOf(window) ?? null,
  nativeId: window.id,
  title: window.getTitle(),
  focused: window.isFocused(),
  visible: window.isVisible(),
});

const contentsEntry = (contents: Electron.WebContents): Application.WebContentsEntry => ({
  id: ContentsRegistry.handleIdOf(contents.id) ?? null,
  nativeId: contents.id,
  type: contents.getType(),
  url: contents.getURL(),
  focused: contents.isFocused(),
});

/**
 * What the process has open, as plain data. Electron's lookups hand out the native objects;
 * these name each one instead, by the Sewed id of the handle that owns it, so a program can find
 * its own windows and notice what it did not create without receiving a resource nobody owns.
 */
export const windows: Effect.Effect<
  ReadonlyArray<Application.WindowEntry>,
  SewedError,
  MainContext
> = read("Could not list windows", () => BaseWindow.getAllWindows().map(windowEntry));

export const focusedWindow: Effect.Effect<Application.WindowEntry | null, SewedError, MainContext> =
  read("Could not read the focused window", () => {
    const focused = BaseWindow.getFocusedWindow();
    return focused === null ? null : windowEntry(focused);
  });

export const allWebContents: Effect.Effect<
  ReadonlyArray<Application.WebContentsEntry>,
  SewedError,
  MainContext
> = read("Could not list web contents", () => webContents.getAllWebContents().map(contentsEntry));

export const focusedWebContents: Effect.Effect<
  Application.WebContentsEntry | null,
  SewedError,
  MainContext
> = read("Could not read the focused web contents", () => {
  const focused = webContents.getFocusedWebContents();
  return focused === null ? null : contentsEntry(focused);
});

const decodeId = Schema.decodeUnknownSync(Schema.String);
const lookup =
  <A>(find: (id: string) => A | undefined) =>
  (id: string): Effect.Effect<A | null, SewedError, MainContext> =>
    Effect.andThen(
      MainContext,
      Effect.try({
        try: () => find(decodeId(id)) ?? null,
        catch: (cause) => new SewedError({ code: "Protocol", message: "Invalid handle id", cause }),
      }),
    );

/**
 * The open window with this Sewed id, as the handle its owner holds, or `null`. An id comes from
 * `windows`, `focusedWindow`, a `parentId` or a `childIds`. A browser window's handle has
 * `webContents` and a base window's does not, which is how a caller tells them apart. The window
 * still belongs to the scope that made it; a lookup grants no second ownership and keeps nothing
 * alive.
 */
export const window = lookup(Handles.windows.find);

/**
 * The live web contents owned by the window, view or webview with this Sewed id, or `null`. An id
 * comes from `allWebContents`, `focusedWebContents`, a `hostId` or an `opener`. What comes back has
 * what every owned web contents has; the owner's own handle carries the rest.
 */
export const contents = lookup(Handles.contents.find);

const decodePart = Schema.decodeUnknownSync(Application.ContentsPart);
const nativeOf = (part: Application.ContentsPart): Electron.WebContents | undefined => {
  if (part.kind === "devtools-target") return webContents.fromDevToolsTargetId(part.id);
  const frame =
    part.kind === "frame"
      ? webFrameMain.fromId(part.processId, part.routingId)
      : webFrameMain.fromFrameToken(part.processId, part.token);
  return frame === undefined || frame === null ? undefined : webContents.fromFrame(frame);
};

/**
 * The live web contents a frame or a DevTools target belongs to, as the handle its owner holds,
 * or `null` when nothing has such a part or the web contents it belongs to is not a Sewed one.
 */
export const contentsOf = (
  part: Application.ContentsPart,
): Effect.Effect<Core | null, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: () => {
        let value: Application.ContentsPart;
        try {
          value = decodePart(part);
        } catch (cause) {
          throw new SewedError({ code: "Protocol", message: "Invalid web contents part", cause });
        }
        const id = ContentsRegistry.handleIdOf(nativeOf(value)?.id);
        return id === undefined ? null : (Handles.contents.find(id) ?? null);
      },
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : new SewedError({ code: "Native", message: "Could not find the web contents", cause }),
    }),
  );

/** Every window the process creates, a Sewed one or not. */
export const windowsCreated: Stream.Stream<Application.WindowEntry, SewedError, MainContext> =
  Observation.fromEmitter<Application.WindowEntry>("Window creation", () => app, [
    [
      "browser-window-created",
      (_event: unknown, window: Electron.BrowserWindow) => windowEntry(window),
    ],
  ]);

/** Every session Electron creates. */
export const sessionsCreated: Stream.Stream<Application.SessionCreated, SewedError, MainContext> =
  Observation.fromEmitter<Application.SessionCreated>("Session creation", () => app, [
    [
      "session-created",
      (session: Electron.Session): Application.SessionCreated => ({
        persistent: session.isPersistent(),
        storagePath: session.getStoragePath(),
      }),
    ],
  ]);

/**
 * Emits once every window has closed and the process is about to quit, after the quit decision.
 * It is an observation: the application scope's finalizers are where shutdown work belongs.
 */
export const willQuit: Stream.Stream<void, SewedError, MainContext> = Observation.listen<void>(
  "Quit",
  (offer) =>
    Effect.sync(() => {
      const listener = () => offer();
      app.on("will-quit", listener);
      return () => {
        app.off("will-quit", listener);
      };
    }),
);
