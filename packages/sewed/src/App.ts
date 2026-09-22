import { app, dialog } from "electron";
import { Cause, Deferred, Effect, Option, Redacted, Schema, Stream } from "effect";
import type { Scope } from "effect";
import * as Application from "./Application.ts";
import * as Decidables from "./Decidables.ts";
import type * as Decision from "./Decision.ts";
import * as Declaration from "./Declaration.ts";
import * as Declarations from "./internal/Declarations.ts";
import { MainContext, mainIdentity } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import type * as MenuSchema from "./Menu.ts";
import * as ApplicationMenu from "./internal/ApplicationMenu.ts";
import * as AppRuntime from "./internal/AppRuntime.ts";
import * as Registry from "./internal/DecisionRegistry.ts";
import * as Instance from "./internal/Instance.ts";
import * as NativeAnswer from "./internal/NativeAnswer.ts";
import * as Observation from "./internal/Observation.ts";
import { idOf } from "./internal/Window.ts";
import type * as Launch from "./Launch.ts";

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
const decoded = <A>(message: string, run: () => A): Effect.Effect<A, SewedError> =>
  Effect.try({
    try: run,
    catch: (cause) => (cause instanceof SewedError ? cause : protocolError(message, cause)),
  });
// The decoded helper's shape, thrown directly: for the plain, non-Effect functions that must
// answer before any Effect runs and before Electron is ready.
const decodedSync = <A>(message: string, run: () => A): A => {
  try {
    return run();
  } catch (cause) {
    throw cause instanceof SewedError ? cause : protocolError(message, cause);
  }
};
const operation = <A>(message: string, run: () => A): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: run,
      catch: (cause) => (cause instanceof SewedError ? cause : nativeError(message, cause)),
    }),
  );
const asynchronous = <A>(
  message: string,
  run: () => Promise<A>,
): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.tryPromise({
      try: run,
      catch: (cause) => (cause instanceof SewedError ? cause : nativeError(message, cause)),
    }),
  );
const decodePathName = Schema.decodeUnknownSync(Application.PathName);
const decodeGpuKind = Schema.decodeUnknownSync(Application.GpuInfoKind);
const decodeLoginItems = Schema.decodeUnknownSync(Application.LoginItemSettings);
const decodeBadge = Schema.decodeUnknownSync(Application.Badge);
const decodeAboutPanel = Schema.decodeUnknownSync(Application.AboutPanel);
const decodeProtocolClient = Schema.decodeUnknownSync(Application.ProtocolClient);
const decodeBoolean = Schema.decodeUnknownSync(Schema.Boolean);
const decodeText = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
const decodeTasks = Schema.decodeUnknownSync(Schema.Array(Application.Task));
const decodeJumpList = Schema.decodeUnknownSync(
  Schema.NullOr(Schema.Array(Application.JumpListCategory)),
);
const decodeBounce = Schema.decodeUnknownSync(Application.DockBounce);
const decodeExitCode = Schema.decodeUnknownSync(Application.ExitCode);
const decodeErrorBox = Schema.decodeUnknownSync(Application.ErrorBox);

export const info: Effect.Effect<Application.Info, SewedError, MainContext> = operation(
  "Could not read application information",
  () => ({
    name: app.getName(),
    version: app.getVersion(),
    locale: app.getLocale(),
    localeCountryCode: app.getLocaleCountryCode(),
    systemLocale: app.getSystemLocale(),
    preferredLanguages: app.getPreferredSystemLanguages(),
    packaged: app.isPackaged,
    appPath: app.getAppPath(),
    hardwareAcceleration: app.isHardwareAccelerationEnabled(),
  }),
);

/**
 * The OS's own preferred languages, in the order it reports them — read directly, with no Effect,
 * because this is meant to run as an input to a declaration thunk, before any Effect runs and
 * before Electron is ready. `getPreferredSystemLanguages` is safe pre-readiness; `getSystemLocale`
 * throws there and `getLocale` answers `""`. The values are the OS's own and unmapped — a POSIX
 * `C` locale answers `["c"]` — turning one into a `--lang` value is the application's decision.
 */
export const preferredSystemLanguages = (): readonly string[] => [
  ...app.getPreferredSystemLanguages(),
];

/** The application's own path, as Electron reports it before readiness, for an entry's first pass. */
export const appPath = (): string => app.getAppPath();

/**
 * The path Electron uses for `name` with nothing declared — read before readiness, as an input to a
 * declaration. A pre-readiness `Paths.declare` of `userData` moves `sessionData`, `logs` and
 * `crashDumps` with it, so once a declaration has applied this reader reflects it; inside the
 * program, {@link path} is the reader. An invalid name throws `Protocol`; a name Electron cannot
 * answer on this platform (`recent` outside Windows) throws `Native`.
 */
export const defaultPath = (name: Application.PathName): string => {
  const value = decodedSync("Invalid path name", () => decodePathName(name));
  try {
    return app.getPath(value);
  } catch (cause) {
    throw cause instanceof SewedError
      ? cause
      : nativeError(`Could not read the ${value} path`, cause);
  }
};

/**
 * Shows a fatal error with no window: a title and a message, for an entry that cannot yet build one
 * — before `App.run`, or when a window has nothing to attach it to. Probed on Electron 44.3.0/Linux:
 * before readiness the call prints `title` and `content` to stderr and returns at once, whether or
 * not a display is present, because GTK is not yet up; after readiness with a display it shows a
 * blocking native modal. Electron documents a native box before readiness on Windows and macOS too
 * (not probed here). A window with something to attach a message to uses `window.dialog.message`
 * instead — this is for the case where nothing can. `title` and `content` must both be non-empty
 * strings; either empty throws `Protocol`.
 */
export const showErrorBox = (options: Application.ErrorBox): void => {
  const value = decodedSync("Invalid error box", () => decodeErrorBox(options));
  dialog.showErrorBox(value.title, value.content);
};

export const path = (name: Application.PathName): Effect.Effect<string, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid path name", () => decodePathName(name)),
    (value) => operation(`Could not read the ${value} path`, () => app.getPath(value)),
  );

export const setPath = (
  name: Application.PathName,
  directory: string,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid path", () => [decodePathName(name), decodeText(directory)] as const),
    ([value, target]) =>
      operation(`Could not set the ${value} path`, () => {
        app.setPath(value, target);
      }),
  );

export const gpu = (
  kind: Application.GpuInfoKind = "basic",
): Effect.Effect<typeof Schema.Json.Type, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid GPU information kind", () => decodeGpuKind(kind)),
    (value) =>
      asynchronous("Could not read GPU information", async () =>
        Schema.decodeUnknownSync(Schema.Json)(await app.getGPUInfo(value)),
      ),
  );

export const gpuFeatures: Effect.Effect<
  Record<string, string>,
  SewedError,
  MainContext
> = operation("Could not read GPU feature status", () => ({ ...app.getGPUFeatureStatus() }));

export const loginItems: Effect.Effect<Application.LoginItems, SewedError, MainContext> = operation(
  "Could not read login item settings",
  () => {
    const settings = app.getLoginItemSettings();
    return {
      openAtLogin: settings.openAtLogin,
      wasOpenedAtLogin: settings.wasOpenedAtLogin,
      status: settings.status,
    };
  },
);

export const setLoginItems = (
  settings: Application.LoginItemSettings,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid login item settings", () => decodeLoginItems(settings)),
    (value) =>
      operation("Could not set login item settings", () => {
        const { args, ...settings } = value;
        app.setLoginItemSettings({
          ...settings,
          ...(args === undefined ? {} : { args: [...args] }),
        });
      }),
  );

export const badge: Effect.Effect<number, SewedError, MainContext> = operation(
  "Could not read the badge count",
  () => app.getBadgeCount(),
);

/** Sets the dock or taskbar badge count; zero clears it. Fails with Native where unsupported. */
export const setBadge = (count: number): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid badge count", () => decodeBadge(count)),
    (value) =>
      operation("Could not set the badge count", () => {
        if (!app.setBadgeCount(value))
          throw nativeError("Badge counts are unsupported on this platform", undefined);
      }),
  );

export const setAboutPanel = (
  options: Application.AboutPanel,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid about panel options", () => decodeAboutPanel(options)),
    (value) =>
      operation("Could not set about panel options", () => {
        const { authors, ...panel } = value;
        app.setAboutPanelOptions({
          ...panel,
          ...(authors === undefined ? {} : { authors: [...authors] }),
        });
      }),
  );

export const showAboutPanel: Effect.Effect<void, SewedError, MainContext> = operation(
  "Could not show the about panel",
  () => {
    app.showAboutPanel();
  },
);

const protocolClient = (
  message: string,
  client: Application.ProtocolClient,
  run: (scheme: string, path?: string, args?: string[]) => boolean,
) =>
  Effect.andThen(
    decoded("Invalid protocol client", () => decodeProtocolClient(client)),
    (value) =>
      operation(message, () =>
        run(value.scheme, value.path, value.args === undefined ? undefined : [...value.args]),
      ),
  );
export const isDefaultProtocolClient = (
  client: Application.ProtocolClient,
): Effect.Effect<boolean, SewedError, MainContext> =>
  protocolClient("Could not query the default protocol client", client, (scheme, path, args) =>
    app.isDefaultProtocolClient(scheme, path, args),
  );
export const setDefaultProtocolClient = (
  client: Application.ProtocolClient,
): Effect.Effect<boolean, SewedError, MainContext> =>
  protocolClient("Could not register the default protocol client", client, (scheme, path, args) =>
    app.setAsDefaultProtocolClient(scheme, path, args),
  );
export const removeDefaultProtocolClient = (
  client: Application.ProtocolClient,
): Effect.Effect<boolean, SewedError, MainContext> =>
  protocolClient("Could not remove the default protocol client", client, (scheme, path, args) =>
    app.removeAsDefaultProtocolClient(scheme, path, args),
  );

/** macOS only: Electron leaves the functions undefined elsewhere, so both operations fail with Native. */
const secureKeyboard = () => {
  if (typeof app.isSecureKeyboardEntryEnabled !== "function")
    throw nativeError("Secure keyboard entry is unavailable on this platform", undefined);
  return app;
};
export const secureKeyboardEntry: Effect.Effect<boolean, SewedError, MainContext> = operation(
  "Could not read secure keyboard entry",
  () => secureKeyboard().isSecureKeyboardEntryEnabled(),
);
export const setSecureKeyboardEntry = (
  enabled: boolean,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid secure keyboard entry flag", () => decodeBoolean(enabled)),
    (value) =>
      operation("Could not set secure keyboard entry", () => {
        secureKeyboard().setSecureKeyboardEntryEnabled(value);
      }),
  );

/** Focus entering or leaving windows; Sewed windows are named by their id, others are null. */
export const windowFocus: Stream.Stream<Application.WindowFocus, SewedError, MainContext> =
  Observation.fromEmitter<Application.WindowFocus>("Window focus", () => app, [
    [
      "browser-window-focus",
      (_event: unknown, window: Electron.BrowserWindow) => ({
        focused: true,
        window: idOf(window) ?? null,
      }),
    ],
    [
      "browser-window-blur",
      (_event: unknown, window: Electron.BrowserWindow) => ({
        focused: false,
        window: idOf(window) ?? null,
      }),
    ],
  ]);

export const childProcesses: Stream.Stream<Application.ChildProcessGone, SewedError, MainContext> =
  Observation.fromEmitter<Application.ChildProcessGone>("Child process", () => app, [
    [
      "child-process-gone",
      (_event: unknown, details: Electron.Details) => ({
        type: details.type,
        reason: details.reason,
        exitCode: details.exitCode,
        ...(details.serviceName === undefined ? {} : { serviceName: details.serviceName }),
        ...(details.name === undefined ? {} : { name: details.name }),
      }),
    ],
  ]);

export const webContentsCreated: Stream.Stream<
  Application.WebContentsCreated,
  SewedError,
  MainContext
> = Observation.fromEmitter<Application.WebContentsCreated>("Web contents creation", () => app, [
  [
    "web-contents-created",
    (_event: unknown, contents: Electron.WebContents) => ({
      id: contents.id,
      type: contents.getType(),
    }),
  ],
]);

const dockOf = () => {
  const dock = app.dock;
  if (dock === undefined) throw nativeError("The dock is unavailable on this platform", undefined);
  return dock;
};
/** macOS dock operations; every operation fails with Native elsewhere. */
export const dock = {
  badge: operation("Could not read the dock badge", () => dockOf().getBadge()),
  setBadge: (text: string): Effect.Effect<void, SewedError, MainContext> =>
    Effect.andThen(
      decoded("Invalid dock badge", () => Schema.decodeUnknownSync(Schema.String)(text)),
      (value) =>
        operation("Could not set the dock badge", () => {
          dockOf().setBadge(value);
        }),
    ),
  bounce: (
    kind: Application.DockBounce = "informational",
  ): Effect.Effect<number, SewedError, MainContext> =>
    Effect.andThen(
      decoded("Invalid dock bounce kind", () => decodeBounce(kind)),
      (value) => operation("Could not bounce the dock icon", () => dockOf().bounce(value)),
    ),
  cancelBounce: (id: number): Effect.Effect<void, SewedError, MainContext> =>
    operation("Could not cancel the dock bounce", () => {
      dockOf().cancelBounce(id);
    }),
  hide: operation("Could not hide the dock icon", () => {
    dockOf().hide();
  }),
  show: asynchronous("Could not show the dock icon", () => dockOf().show()),
  visible: operation("Could not read dock visibility", () => dockOf().isVisible()),
};

/** Windows taskbar operations; every operation fails with Native elsewhere. */
export const taskbar = {
  setUserTasks: (
    tasks: readonly Application.Task[],
  ): Effect.Effect<void, SewedError, MainContext> =>
    Effect.andThen(
      decoded("Invalid user tasks", () => decodeTasks(tasks)),
      (value) =>
        operation("Could not set user tasks", () => {
          if (!app.setUserTasks(value.map((task) => ({ ...task }))))
            throw nativeError("User tasks are unsupported on this platform", undefined);
        }),
    ),
  setJumpList: (
    categories: readonly Application.JumpListCategory[] | null,
  ): Effect.Effect<void, SewedError, MainContext> =>
    Effect.andThen(
      decoded("Invalid jump list", () => decodeJumpList(categories)),
      (value) =>
        operation("Could not set the jump list", () => {
          const result = app.setJumpList(
            value === null
              ? null
              : value.map(({ items, ...category }) => ({
                  ...category,
                  ...(items === undefined ? {} : { items: items.map((item) => ({ ...item })) }),
                })),
          );
          if (result !== "ok")
            throw nativeError(`The jump list was rejected: ${result}`, undefined);
        }),
    ),
};

export type Menu = ApplicationMenu.Handle;

/**
 * Installs the application menu for the caller's scope and returns its handle: `replace` swaps
 * the menu, `selections` streams custom selections. One menu at a time; a second fails `Limit`.
 * Release stops the menu's callbacks without restoring or clearing the native menu. Step 4 of the
 * platform redesign replaces this with contributions.
 */
export const menu = (
  options: MenuSchema.ApplicationOptions,
): Effect.Effect<Menu, SewedError, MainContext | Scope.Scope> => ApplicationMenu.make(options);

export const launches: Stream.Stream<Launch.Request, SewedError, MainContext> = Stream.unwrap(
  Effect.gen(function* () {
    yield* MainContext;
    const owner = yield* Effect.serviceOption(AppRuntime.Owner);
    if (owner._tag === "None")
      return yield* Effect.fail(
        new SewedError({ code: "Closed", message: "No application launch owner is running" }),
      );
    return owner.value.launches;
  }),
);

export { SecondaryInstance } from "./internal/Instance.ts";
export type { Instance } from "./internal/Instance.ts";
export type { Options as ClaimOptions } from "./internal/Instance.ts";

// Inert: captures `app`, calls nothing. The compiler proves `app` satisfies `Instance.Native`; the
// playground's lifecycle fixture proves the lock and the forwarded launch against real Electron.
const instances = Instance.make(app);

/**
 * Claims the single instance for the caller's scope, when the program chooses — after any
 * launcher or handoff checks it wants to run first. A second process's claim fails
 * {@link SecondaryInstance} once Electron has forwarded its arguments to this one, and that
 * process's program decides how to exit. Later launches arrive on the instance's `launches`; the
 * lock is released when the scope closes. One claim may be held at a time; a second fails `Limit`.
 */
export const claimInstance = (
  options?: Instance.Options,
): Effect.Effect<
  Instance.Instance,
  SewedError | Instance.SecondaryInstance,
  MainContext | Scope.Scope
> => Effect.andThen(MainContext, instances.claim(options));

/**
 * Installs a decider for one of `Decidables.App`'s decidables against the running application's own
 * registry, for the caller's scope. This is {@link Decision.Owner}'s method: any number of deciders
 * may be installed, and the decidable's own composition (declared in `Decidables.ts`) decides among
 * them. Without a running application owner, this fails `Closed` rather than installing a decider
 * nothing will ever consult.
 */
export const decide = <Event, Answer, Timing extends "sync" | "async", R = never>(
  decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition, "app">,
  decider: Decision.DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>,
): Effect.Effect<void, SewedError, MainContext | Scope.Scope | R> =>
  Effect.gen(function* () {
    yield* MainContext;
    const owner = yield* Effect.serviceOption(AppRuntime.Owner);
    if (owner._tag === "None")
      return yield* Effect.fail(
        new SewedError({ code: "Closed", message: "No application decision owner is running" }),
      );
    yield* Registry.decide(owner.value.registry, { isClosed: owner.value.isClosed })(
      decidable,
      decider,
    );
  });

export interface Activation {
  readonly hasVisibleWindows: boolean;
}

export const activations: Stream.Stream<Activation, SewedError, MainContext> =
  Observation.fromEmitter<Activation>("Application activation", () => app, [
    ["activate", (_event: unknown, hasVisibleWindows: boolean) => ({ hasVisibleWindows })],
  ]);

export const quit: Effect.Effect<void, SewedError, MainContext> = Effect.andThen(
  MainContext,
  Effect.try({
    try: () => app.quit(),
    catch: (cause) =>
      new SewedError({ code: "Native", message: "Could not request application quit", cause }),
  }),
);

/**
 * Ends the application with exactly this exit code, once the application scope has closed and
 * its finalizers have run. It does not consult `Decidables.App.Quit`: Electron's own `app.exit`
 * fires no quit event, and a launcher that must answer a code cannot be vetoed by a feature.
 * Use {@link quit} for a quit a feature may refuse. `code` is an integer from 0 to 255. The first
 * request wins: once an exit or an accepted quit is already in progress, a further call fails
 * `Closed` and the code already requested stands — so call it from the program, not from a
 * finalizer, which runs only once a shutdown has begun.
 */
export const exit = (code: number): Effect.Effect<never, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid exit code", () => decodeExitCode(code)),
    (validated) =>
      Effect.gen(function* () {
        yield* MainContext;
        const owner = yield* Effect.serviceOption(AppRuntime.Owner);
        if (owner._tag === "None")
          return yield* Effect.fail(
            new SewedError({ code: "Closed", message: "No application exit owner is running" }),
          );
        if (!owner.value.exit(validated))
          return yield* Effect.fail(
            new SewedError({
              code: "Closed",
              message: "The application is already exiting, so this exit code cannot apply",
            }),
          );
        return yield* Effect.never;
      }),
  );

/**
 * Ends the process now with exactly this code, running nothing: no finalizer, no listener, no quit
 * decider, and nothing after the call. It is for a harness whose program may hang — a timeout that
 * must answer the shell even when the program's finalizers would never finish. Everything else
 * uses {@link exit}, which closes the application scope first. `code` is an integer from 0 to 255;
 * an invalid one throws `Protocol` before anything ends.
 */
export const terminate = (code: number): never => {
  const validated = decodedSync("Invalid exit code", () => decodeExitCode(code));
  app.exit(validated);
  // Electron's app.exit schedules the process's end for once this synchronous callback returns to
  // the native event loop, rather than ending it on this line — probed against real Electron: a
  // throw placed here to satisfy the compiler's `never` reaches Electron's own uncaught-exception
  // handling first and the process hangs instead of exiting. node:process's own exit is `never`
  // without throwing, and forces the same code immediately if this line is ever actually reached.
  process.exit(validated);
};

/** Declares facts about the application that must precede readiness, such as the Windows user model id. */
export const declare = (options: Application.Identity): Declaration.Declaration =>
  Declarations.identity(app, options);

/**
 * Runs the application: installs the launch and quit listeners, applies every declaration in
 * order — failing `Startup` on the first that cannot apply — waits for Electron readiness, and
 * runs `program` under `MainContext` in the application scope until quit. A declaration is applied
 * synchronously and before readiness; asynchronous work belongs in `program`. A non-empty
 * declaration list fails `Startup` immediately, applying nothing, if Electron is already ready —
 * call `App.run` in the entry module's first synchronous pass, or after a top-level await in an
 * ES-module entry.
 */
export const run = <E>(
  declarations: readonly Declaration.Entry[],
  program: Effect.Effect<unknown, E, MainContext | Scope.Scope>,
) => {
  const quitRequested = Deferred.makeUnsafe<number | undefined>();
  const requestShutdown = (code?: number) =>
    Deferred.doneUnsafe(quitRequested, Effect.succeed(code));
  const owner = AppRuntime.make(requestShutdown);
  const parentMessage = (message: unknown) => {
    if (message === "sewed:shutdown") requestShutdown();
  };
  let finished = false;
  const beforeQuit = (event: Electron.Event) => {
    if (finished) return;
    event.preventDefault();
    owner.gate.request();
  };
  const lastWindowClosed = () => {
    if (owner.registry.resolveSync(Decidables.App.LastWindowClosed, {}) === "quit") app.quit();
  };
  const openFile = (event: Electron.Event, path: string) => {
    event.preventDefault();
    owner.offer({ kind: "file", path });
  };
  const openUrl = (event: Electron.Event, url: string) => {
    event.preventDefault();
    owner.offer({ kind: "url", url });
  };
  const certificateError = (
    event: Electron.Event,
    _contents: Electron.WebContents,
    url: string,
    _error: string,
    certificate: Electron.Certificate,
    callback: (isTrusted: boolean) => void,
  ) => {
    event.preventDefault();
    NativeAnswer.run({
      label: Decidables.App.CertificateError.key,
      resolution: owner.registry.resolveAsync(Decidables.App.CertificateError, {
        url,
        // Empty for a url Chromium's own URL parser rejects; Certificate.Policy's own doc is why
        // that is safe: it refuses a wildcard with no suffix at decode, and passes on an empty
        // hostname regardless, so nothing this reaches can answer "trust" for it.
        hostname: URL.parse(url)?.hostname ?? "",
        certificate: {
          fingerprint: certificate.fingerprint,
          subjectName: certificate.subjectName,
          issuerName: certificate.issuerName,
          validStart: certificate.validStart,
          validExpiry: certificate.validExpiry,
        },
      }),
      reply: (answer) => callback(answer === "trust"),
      failed: () => callback(false),
    });
  };
  const authenticate = (
    event: Electron.Event,
    _contents: Electron.WebContents | null,
    details: Electron.AuthenticationResponseDetails,
    authInfo: Electron.AuthInfo,
    callback: (username?: string, password?: string) => void,
  ) => {
    event.preventDefault();
    const challenge: Application.LoginChallenge = {
      url: details.url,
      isProxy: authInfo.isProxy,
      scheme: authInfo.scheme,
      host: authInfo.host,
      port: authInfo.port,
      realm: authInfo.realm,
      isRequestForNavigation: details.isRequestForNavigation,
    };
    NativeAnswer.run({
      label: Decidables.App.Login.key,
      resolution: owner.registry.resolveAsync(Decidables.App.Login, challenge),
      reply: (response) => {
        if (response.kind === "credentials")
          callback(response.username, Redacted.value(response.password));
        else callback();
      },
      failed: () => callback(),
    });
  };
  app.on("before-quit", beforeQuit);
  app.on("window-all-closed", lastWindowClosed);
  app.on("open-file", openFile);
  app.on("open-url", openUrl);
  app.on("certificate-error", certificateError);
  app.on("login", authenticate);
  process.on("message", parentMessage);
  const admission = Declarations.apply(declarations, { isReady: () => app.isReady() });
  if (admission === undefined)
    owner.offer({ kind: "initial", arguments: [...process.argv], workingDirectory: process.cwd() });
  return Effect.runFork(
    Effect.scoped(
      Effect.gen(function* () {
        if (admission !== undefined) return yield* Effect.fail(admission);
        yield* Effect.promise(() => app.whenReady());
        return yield* Effect.andThen(program, Effect.never);
      }).pipe(Effect.raceFirst(Deferred.await(quitRequested))),
    ).pipe(
      Effect.provideService(AppRuntime.Owner, owner),
      Effect.provideService(MainContext, mainIdentity),
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          finished = true;
          app.off("before-quit", beforeQuit);
          app.off("window-all-closed", lastWindowClosed);
          app.off("open-file", openFile);
          app.off("open-url", openUrl);
          app.off("certificate-error", certificateError);
          app.off("login", authenticate);
          process.off("message", parentMessage);
          yield* owner.close();
          if (exit._tag === "Failure") {
            const failure = Cause.findErrorOption(exit.cause);
            if (Option.isSome(failure) && failure.value instanceof SewedError)
              console.error(`${failure.value.code}: ${failure.value.message}`);
            console.error(Cause.pretty(exit.cause));
            app.exit(1);
          } else if (exit.value === undefined) app.quit();
          else app.exit(exit.value);
        }),
      ),
    ),
  );
};
