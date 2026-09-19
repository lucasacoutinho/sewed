import { app } from "electron";
import { Cause, Deferred, Effect, Redacted, Schema, Stream } from "effect";
import type { Scope } from "effect";
import * as Application from "./Application.ts";
import * as Decidables from "./Decidables.ts";
import type * as Decision from "./Decision.ts";
import { MainContext, mainIdentity } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import type * as Menu from "./Menu.ts";
import type * as Protocol from "./Protocol.ts";
import * as ApplicationMenu from "./internal/ApplicationMenu.ts";
import * as AppRuntime from "./internal/AppRuntime.ts";
import * as Registry from "./internal/DecisionRegistry.ts";
import * as NativeAnswer from "./internal/NativeAnswer.ts";
import * as NativeProtocol from "./internal/Protocol.ts";
import * as Observation from "./internal/Observation.ts";
import { idOf } from "./internal/Window.ts";
import type * as Launch from "./Launch.ts";

export interface Options {
  readonly menu?: Menu.ApplicationOptions;
  readonly singleInstance?: { readonly additionalData?: typeof Schema.JsonObject.Type };
  readonly schemes?: readonly Protocol.Scheme[];
  /** Switches appended to Chromium's command line before readiness. */
  readonly commandLine?: readonly Application.CommandLineSwitch[];
  /** The Windows application user model id, set before readiness. */
  readonly appUserModelId?: string;
  /** Set to false to disable GPU acceleration before readiness. */
  readonly hardwareAcceleration?: boolean;
  /** Steps other packages need before readiness, such as starting the crash reporter. */
  readonly startup?: readonly Startup[];
}

/** A named step that runs before Electron is ready; a throw fails startup with its cause. */
export interface Startup {
  readonly name: string;
  readonly apply: () => void;
}

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
const decoded = <A>(message: string, run: () => A): Effect.Effect<A, SewedError> =>
  Effect.try({
    try: run,
    catch: (cause) => (cause instanceof SewedError ? cause : protocolError(message, cause)),
  });
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
const decodeSwitches = Schema.decodeUnknownSync(Schema.Array(Application.CommandLineSwitch));

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

export const menuSelections = ApplicationMenu.selections;
export const setMenu = ApplicationMenu.replace;

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

/**
 * Installs a decider for one of `Decidables.App`'s decidables against the running application's own
 * registry, for the caller's scope. This is {@link Decision.Owner}'s method: any number of deciders
 * may be installed, and the decidable's own composition (declared in `Decidables.ts`) decides among
 * them. Without a running application owner, this fails `Closed` rather than installing a decider
 * nothing will ever consult.
 */
export const decide = <Event, Answer, Timing extends "sync" | "async", R = never>(
  decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition>,
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

export const run = <E>(
  setup: Effect.Effect<unknown, E, MainContext | Scope.Scope>,
  options: Options = {},
) => {
  const quitRequested = Deferred.makeUnsafe<void>();
  const requestShutdown = () => {
    Deferred.doneUnsafe(quitRequested, Effect.void);
  };
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
  const secondInstance = (
    _event: Electron.Event,
    args: string[],
    workingDirectory: string,
    additionalData: unknown,
  ) => {
    owner.offer({
      kind: "second-instance",
      arguments: args,
      workingDirectory,
      additionalData: additionalData ?? null,
    });
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
  app.on("second-instance", secondInstance);
  app.on("certificate-error", certificateError);
  app.on("login", authenticate);
  process.on("message", parentMessage);
  const admission = (() => {
    try {
      for (const flag of decodeSwitches(options.commandLine ?? [])) {
        if (flag.value === undefined) app.commandLine.appendSwitch(flag.name);
        else app.commandLine.appendSwitch(flag.name, flag.value);
      }
      if (options.appUserModelId !== undefined)
        app.setAppUserModelId(decodeText(options.appUserModelId));
      if (options.hardwareAcceleration === false) app.disableHardwareAcceleration();
      for (const step of options.startup ?? []) {
        try {
          step.apply();
        } catch (cause) {
          throw new SewedError({
            code: "Startup",
            message: `Startup step ${step.name} failed`,
            cause,
          });
        }
      }
      NativeProtocol.registerSchemes(options.schemes ?? []);
      owner.offer({
        kind: "initial",
        arguments: [...process.argv],
        workingDirectory: process.cwd(),
      });
      if (options.singleInstance === undefined)
        return { status: "primary", locked: false } as const;
      const data = Schema.decodeUnknownSync(Schema.JsonObject)(
        options.singleInstance.additionalData ?? {},
      );
      return app.requestSingleInstanceLock(data)
        ? ({ status: "primary", locked: true } as const)
        : ({ status: "secondary" } as const);
    } catch (cause) {
      return {
        status: "failed",
        error: new SewedError({
          code: "Startup",
          message: "Could not acquire application launch ownership",
          cause,
        }),
      } as const;
    }
  })();
  return Effect.runFork(
    Effect.scoped(
      Effect.gen(function* () {
        if (admission.status === "failed") return yield* Effect.fail(admission.error);
        if (admission.status === "secondary") return;
        yield* Effect.promise(() => app.whenReady());
        const menu =
          options.menu === undefined ? undefined : yield* ApplicationMenu.make(options.menu);
        const program =
          menu === undefined ? setup : Effect.provideService(setup, ApplicationMenu.Owner, menu);
        yield* Effect.andThen(program, Effect.never);
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
          app.off("second-instance", secondInstance);
          app.off("certificate-error", certificateError);
          app.off("login", authenticate);
          process.off("message", parentMessage);
          yield* owner.close();
          if (admission.status === "primary" && admission.locked) app.releaseSingleInstanceLock();
          if (exit._tag === "Failure") {
            console.error(Cause.pretty(exit.cause));
            app.exit(1);
          } else if (admission.status === "secondary") app.exit(0);
          else app.quit();
        }),
      ),
    ),
  );
};
