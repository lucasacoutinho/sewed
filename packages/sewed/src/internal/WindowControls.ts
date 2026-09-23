import { Effect, Layer, Stream } from "effect";
import type { Scope } from "effect";
import * as Capability from "../Capability.ts";
import type { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import type * as WebContents from "../WebContents.ts";
import * as WindowControls from "../WindowControls.ts";

export {
  AlwaysOnTopLevel,
  Bounds,
  BoundsUpdate,
  Opacity,
  Progress,
  ProgressMode,
  State,
  capability,
  protocol,
} from "../WindowControls.ts";

/**
 * The page half of a window's protocol: presentation and navigation over the window's web
 * contents. A `BrowserWindow` handle's `webContents` is one; a bare `BaseWindow` has none.
 */
export interface Contents<R> {
  readonly zoom: Stream.Stream<WebContents.Zoom, SewedError, R>;
  readonly setZoom: (factor: number) => Effect.Effect<void, SewedError, R>;
  readonly audio: Stream.Stream<WebContents.Audio, SewedError, R>;
  readonly setAudioMuted: (muted: boolean) => Effect.Effect<void, SewedError, R>;
  readonly history: Stream.Stream<WebContents.History, SewedError, R>;
  readonly back: Effect.Effect<void, SewedError, R>;
  readonly forward: Effect.Effect<void, SewedError, R>;
  readonly find: (
    text: string,
    options?: WebContents.FindOptions,
  ) => Effect.Effect<WebContents.Search, SewedError, R | Scope.Scope>;
  readonly findNext: (forward?: boolean) => Effect.Effect<void, SewedError, R>;
  readonly stopFind: (action?: WebContents.FindStop) => Effect.Effect<void, SewedError, R>;
}

/**
 * The window a capability is served for. `native` takes an acquired window handle, which is one
 * of these; a test supplies its own. `R` is whatever that window requires, so the rules above it
 * stay free of any runtime requirement of their own.
 */
export interface Core<R> {
  readonly show: Effect.Effect<void, SewedError, R>;
  readonly showInactive: Effect.Effect<void, SewedError, R>;
  readonly hide: Effect.Effect<void, SewedError, R>;
  readonly focus: Effect.Effect<void, SewedError, R>;
  readonly minimize: Effect.Effect<void, SewedError, R>;
  readonly maximize: Effect.Effect<void, SewedError, R>;
  readonly restore: Effect.Effect<void, SewedError, R>;
  readonly close: Effect.Effect<void, SewedError, R>;
  readonly setBounds: (bounds: WindowControls.BoundsUpdate) => Effect.Effect<void, SewedError, R>;
  readonly setFullScreen: (fullScreen: boolean) => Effect.Effect<void, SewedError, R>;
  readonly setSimpleFullScreen: (simpleFullScreen: boolean) => Effect.Effect<void, SewedError, R>;
  readonly setTitle: (title: string) => Effect.Effect<void, SewedError, R>;
  readonly setAlwaysOnTop: (
    alwaysOnTop: boolean,
    level?: WindowControls.AlwaysOnTopLevel,
  ) => Effect.Effect<void, SewedError, R>;
  readonly setOpacity: (opacity: number) => Effect.Effect<void, SewedError, R>;
  readonly setProgress: (
    progress: number,
    mode?: WindowControls.ProgressMode,
  ) => Effect.Effect<void, SewedError, R>;
  readonly flash: (flash: boolean) => Effect.Effect<void, SewedError, R>;
  /** The window's flags as they are now; `Closed` once the window is gone. */
  readonly current: Effect.Effect<WindowControls.State, SewedError, R>;
  /** The current snapshot and every native change, until the window closes. */
  readonly state: Stream.Stream<WindowControls.State, SewedError, R>;
  readonly webContents?: Contents<R> | undefined;
}

/**
 * The operations a window's capability serves: the window's own commands, and the page operations
 * a window may not have. One declaration over `Core` and `Contents`, so the two cannot drift.
 */
export type Operations<R> = Omit<Core<R>, "webContents"> & Contents<R>;

const noPage = () => new SewedError({ code: "Protocol", message: "Window has no web contents" });

/**
 * Resolves the window's page once, while the Layer builds, so every later call reads a decision
 * already made. A window without web contents answers each page operation with `Protocol`, and a
 * streaming one answers on its own stream: a caller sees the failure where it subscribed rather
 * than as a value thrown past the stream it asked for.
 */
export const operations = <R>(window: Core<R>): Effect.Effect<Operations<R>, SewedError> =>
  Effect.sync(() => {
    const page = window.webContents;
    const call = <A>(run: (contents: Contents<R>) => Effect.Effect<A, SewedError, R>) =>
      page === undefined ? Effect.fail(noPage()) : run(page);
    const observe = <A>(read: (contents: Contents<R>) => Stream.Stream<A, SewedError, R>) =>
      page === undefined ? Stream.fail(noPage()) : read(page);
    return {
      show: window.show,
      showInactive: window.showInactive,
      hide: window.hide,
      focus: window.focus,
      minimize: window.minimize,
      maximize: window.maximize,
      restore: window.restore,
      close: window.close,
      setBounds: (bounds) => window.setBounds(bounds),
      setFullScreen: (fullScreen) => window.setFullScreen(fullScreen),
      setSimpleFullScreen: (simpleFullScreen) => window.setSimpleFullScreen(simpleFullScreen),
      setTitle: (title) => window.setTitle(title),
      setAlwaysOnTop: (alwaysOnTop, level) => window.setAlwaysOnTop(alwaysOnTop, level),
      setOpacity: (opacity) => window.setOpacity(opacity),
      setProgress: (progress, mode) => window.setProgress(progress, mode),
      flash: (flash) => window.flash(flash),
      current: window.current,
      state: window.state,
      zoom: observe((contents) => contents.zoom),
      setZoom: (factor) => call((contents) => contents.setZoom(factor)),
      audio: observe((contents) => contents.audio),
      setAudioMuted: (muted) => call((contents) => contents.setAudioMuted(muted)),
      history: observe((contents) => contents.history),
      back: call((contents) => contents.back),
      forward: call((contents) => contents.forward),
      find: (text, options) =>
        page === undefined ? Effect.fail(noPage()) : page.find(text, options),
      findNext: (forward) => call((contents) => contents.findNext(forward)),
      stopFind: (action) => call((contents) => contents.stopFind(action)),
    };
  });

/**
 * One window's controls for main. Unlike the ambient surfaces, this one is scoped to an owner, so
 * the Layer threads an acquired window rather than a plain options bag: it resolves that window's
 * page while the Layer builds, and every call after that reaches exactly that window. The window
 * lives in this Layer, not in a separate host, so `Capability.serve(WindowControls.capability)`
 * gives a document exactly the window a main-side call drives.
 */
export const native = (
  window: Core<MainContext>,
): Layer.Layer<typeof WindowControls.capability, SewedError, MainContext> =>
  Capability.fromHandlers(WindowControls.capability, (implement) =>
    implement(
      Effect.map(operations(window), (controls) => ({
        show: () => controls.show,
        showInactive: () => controls.showInactive,
        hide: () => controls.hide,
        focus: () => controls.focus,
        setBounds: (bounds) => controls.setBounds(bounds),
        setFullScreen: ({ fullScreen }) => controls.setFullScreen(fullScreen),
        setSimpleFullScreen: ({ simpleFullScreen }) =>
          controls.setSimpleFullScreen(simpleFullScreen),
        minimize: () => controls.minimize,
        maximize: () => controls.maximize,
        restore: () => controls.restore,
        close: () => controls.close,
        state: () => controls.current,
        changes: () => controls.state,
        setTitle: ({ title }) => controls.setTitle(title),
        setAlwaysOnTop: ({ alwaysOnTop, level }) => controls.setAlwaysOnTop(alwaysOnTop, level),
        setOpacity: ({ opacity }) => controls.setOpacity(opacity),
        setProgress: ({ progress, mode }) => controls.setProgress(progress, mode),
        flash: ({ flash }) => controls.flash(flash),
        zoom: () => controls.zoom,
        setZoom: ({ factor }) => controls.setZoom(factor),
        audio: () => controls.audio,
        setAudioMuted: ({ muted }) => controls.setAudioMuted(muted),
        history: () => controls.history,
        back: () => controls.back,
        forward: () => controls.forward,
        find: ({ text, options }) =>
          Stream.scoped(
            Stream.unwrap(
              Effect.map(controls.find(text, options ?? {}), (search) => search.results),
            ),
          ),
        findNext: ({ forward }) => controls.findNext(forward),
        stopFind: ({ action }) => controls.stopFind(action),
      })),
    ),
  );
