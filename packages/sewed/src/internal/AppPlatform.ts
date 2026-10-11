import { isAbsolute } from "node:path";
import { app, dialog, Menu } from "electron";
import { Effect, Schema } from "effect";
import type { Scope, Stream } from "effect";
import * as Application from "../Application.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as Observation from "./Observation.ts";
import * as SeenCertificates from "./SeenCertificates.ts";

type Platform = "darwin" | "win32" | "mas";
const names: Record<Platform, string> = {
  darwin: "macOS",
  win32: "Windows",
  mas: "the Mac App Store build",
};
const here = (platform: Platform): boolean =>
  platform === "mas" ? process.mas === true : process.platform === platform;

const nativeError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Native", message, ...(cause === undefined ? {} : { cause }) });

/** An operation Electron implements on some platforms only; elsewhere it fails `Native`. */
const on = <A>(
  platforms: ReadonlyArray<Platform>,
  what: string,
  run: () => A,
): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: () => {
        if (!platforms.some(here))
          throw nativeError(
            `${what} is available only on ${platforms.map((platform) => names[platform]).join(" and ")}`,
          );
        return run();
      },
      catch: (cause) =>
        cause instanceof SewedError ? cause : nativeError(`${what} failed`, cause),
    }),
  );

const decoded = <A>(message: string, run: () => A): Effect.Effect<A, SewedError> =>
  Effect.try({
    try: run,
    catch: (cause) =>
      cause instanceof SewedError ? cause : new SewedError({ code: "Protocol", message, cause }),
  });

const decodeBoolean = Schema.decodeUnknownSync(Schema.Boolean);
const decodeText = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
const decodeFeatures = Schema.decodeUnknownSync(Schema.Array(Schema.String));
const decodeActivity = Schema.decodeUnknownSync(Application.Activity);
const decodeConflict = Schema.decodeUnknownSync(Schema.Literals(["keep", "replace"]));
const decodeRemoved = Schema.decodeUnknownSync(Schema.Array(Application.JumpListItem));
const decodePolicy = Schema.decodeUnknownSync(Application.ActivationPolicy);
const isJson = Schema.is(Schema.Json);
const jsonOrNull = (value: unknown): Schema.Json => (isJson(value) ? value : null);

/** Recently opened documents, in the macOS Dock menu and the Windows jump list. */
export const recentDocuments = {
  add: (path: string): Effect.Effect<void, SewedError, MainContext> =>
    Effect.andThen(
      decoded("Invalid document path", () => {
        if (!isAbsolute(decodeText(path)))
          throw new SewedError({ code: "Protocol", message: "Document path must be absolute" });
        return path;
      }),
      (value) =>
        on(["darwin", "win32"], "Recent documents", () => {
          app.addRecentDocument(value);
        }),
    ),
  clear: on(["darwin", "win32"], "Recent documents", () => {
    app.clearRecentDocuments();
  }),
  list: on(["darwin", "win32"], "Recent documents", () => [...app.getRecentDocuments()]),
};

/** Chromium's accessibility tree, which assistive technology turns on by itself. */
export const accessibility = {
  enabled: on(["darwin", "win32"], "Accessibility support", () =>
    app.isAccessibilitySupportEnabled(),
  ),
  setEnabled: (enabled: boolean): Effect.Effect<void, SewedError, MainContext> =>
    Effect.andThen(
      decoded("Invalid accessibility flag", () => decodeBoolean(enabled)),
      (value) =>
        on(["darwin", "win32"], "Accessibility support", () => {
          app.setAccessibilitySupportEnabled(value);
        }),
    ),
  /** Which parts of the accessibility tree are built, such as `nativeAPIs` and `webContents`. */
  features: on(["darwin", "win32"], "Accessibility features", () => [
    ...app.getAccessibilitySupportFeatures(),
  ]),
  setFeatures: (features: ReadonlyArray<string>): Effect.Effect<void, SewedError, MainContext> =>
    Effect.andThen(
      decoded("Invalid accessibility features", () => decodeFeatures(features)),
      (value) =>
        on(["darwin", "win32"], "Accessibility features", () => {
          app.setAccessibilitySupportFeatures([...value]);
        }),
    ),
  changes: Observation.fromEmitter<boolean>("Accessibility support", () => app, [
    ["accessibility-support-changed", (_event: unknown, enabled: boolean) => enabled],
  ]),
};

type Details = { readonly webpageURL?: string };
const continued =
  (kind: "continue" | "was-continued" | "update-state") =>
  (
    _event: unknown,
    type: string,
    userInfo: unknown,
    details?: Details,
  ): Application.ActivityEvent => ({
    kind,
    type,
    userInfo: jsonOrNull(userInfo),
    ...(details?.webpageURL === undefined ? {} : { webpageUrl: details.webpageURL }),
  });

/** Handoff, on macOS: what the user is doing here, offered to their other devices. */
export const activity = {
  current: on(["darwin"], "Handoff", () => app.getCurrentActivityType()),
  set: (value: Application.Activity): Effect.Effect<void, SewedError, MainContext> =>
    Effect.andThen(
      decoded("Invalid activity", () => decodeActivity(value)),
      ({ type, userInfo, webpageUrl }) =>
        on(["darwin"], "Handoff", () => {
          app.setUserActivity(type, userInfo, webpageUrl);
        }),
    ),
  /** Replaces the current activity's state when its type matches. */
  update: (value: Application.Activity): Effect.Effect<void, SewedError, MainContext> =>
    Effect.andThen(
      decoded("Invalid activity", () => decodeActivity(value)),
      ({ type, userInfo }) =>
        on(["darwin"], "Handoff", () => {
          app.updateCurrentActivity(type, userInfo);
        }),
    ),
  invalidate: on(["darwin"], "Handoff", () => {
    app.invalidateCurrentActivity();
  }),
  /** Stops offering the current activity without ending it. */
  resign: on(["darwin"], "Handoff", () => {
    app.resignCurrentActivity();
  }),
  /**
   * Activities arriving from another device and the state of this one's. Observing claims each
   * `continue` and `update-state`: their defaults are prevented, which tells macOS the application
   * handles them.
   */
  events: Observation.fromEmitter<Application.ActivityEvent>("Handoff", () => app, [
    [
      "will-continue-activity",
      (event: Electron.Event, type: string): Application.ActivityEvent => {
        event.preventDefault();
        return { kind: "will-continue", type };
      },
    ],
    [
      "continue-activity",
      (event: Electron.Event, type: string, userInfo: unknown, details: Details) => {
        event.preventDefault();
        return continued("continue")(event, type, userInfo, details);
      },
    ],
    ["activity-was-continued", continued("was-continued")],
    [
      "update-activity-state",
      (event: Electron.Event, type: string, userInfo: unknown) => {
        event.preventDefault();
        return continued("update-state")(event, type, userInfo);
      },
    ],
    [
      "continue-activity-error",
      (_event: unknown, type: string, error: string): Application.ActivityEvent => ({
        kind: "continue-error",
        type,
        error,
      }),
    ],
  ]),
};

/** Whether the application is the active one, on macOS. */
export const active: Effect.Effect<boolean, SewedError, MainContext> = on(
  ["darwin"],
  "Application activity",
  () => app.isActive(),
);

/** Whether the application is hidden, on macOS. */
export const hidden: Effect.Effect<boolean, SewedError, MainContext> = on(
  ["darwin"],
  "Application visibility",
  () => app.isHidden(),
);

/** Emits `true` when the application becomes the active one and `false` when it stops, on macOS. */
export const activeChanges: Stream.Stream<boolean, SewedError, MainContext> =
  Observation.fromEmitter<boolean>("Application activity", () => app, [
    ["did-become-active", () => true],
    ["did-resign-active", () => false],
  ]);

/** Emits when the user asks for a new tab with no window to take it, on macOS. */
export const newWindowForTab: Stream.Stream<void, SewedError, MainContext> =
  Observation.listen<void>("New tab request", (offer) =>
    Effect.sync(() => {
      const listener = () => offer();
      app.on("new-window-for-tab", listener);
      return () => {
        app.off("new-window-for-tab", listener);
      };
    }),
  );

/** The macOS Applications folder. */
export const applicationsFolder = {
  contains: on(["darwin"], "The Applications folder", () => app.isInApplicationsFolder()),
  /**
   * Moves the application there and relaunches it; answers `false` when the user declined. When
   * an application of the same name is already there, `replace` replaces it and `keep`, the
   * default, leaves both alone.
   */
  move: (conflict: "keep" | "replace" = "keep"): Effect.Effect<boolean, SewedError, MainContext> =>
    Effect.andThen(
      decoded("Invalid conflict choice", () => decodeConflict(conflict)),
      (value) =>
        on(["darwin"], "The Applications folder", () =>
          app.moveToApplicationsFolder({ conflictHandler: () => value === "replace" }),
        ),
    ),
};

/** Whether the application shows in the Dock (`regular`), only as windows, or not at all. */
export const setActivationPolicy = (
  policy: Application.ActivationPolicy,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid activation policy", () => decodePolicy(policy)),
    (value) =>
      on(["darwin"], "The activation policy", () => {
        app.setActivationPolicy(value);
      }),
  );

/** The CLSID Windows activates for the application's toast notifications. */
export const toastActivatorClsid: Effect.Effect<string, SewedError, MainContext> = on(
  ["win32"],
  "The toast activator",
  () => app.toastActivatorCLSID,
);

export const setToastActivatorClsid = (id: string): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid CLSID", () => decodeText(id)),
    (value) =>
      on(["win32"], "The toast activator", () => {
        app.setToastActivatorCLSID(value);
      }),
  );

/** Whether the platform has an emoji panel to show. */
export const emojiPanelSupported: Effect.Effect<boolean, SewedError, MainContext> = Effect.andThen(
  MainContext,
  Effect.sync(() => app.isEmojiPanelSupported()),
);

export const showEmojiPanel: Effect.Effect<void, SewedError, MainContext> = on(
  ["darwin", "win32"],
  "The emoji panel",
  () => {
    app.showEmojiPanel();
  },
);

/** Whether an x64 build is running translated on ARM64, under Rosetta or Windows on ARM. */
export const runningUnderArm64Translation: Effect.Effect<boolean, SewedError, MainContext> = on(
  ["darwin", "win32"],
  "ARM64 translation",
  () => app.runningUnderARM64Translation,
);

/** What the user removed from the Windows jump list, and its minimum size. */
export const jumpListSettings: Effect.Effect<
  Application.JumpListSettings,
  SewedError,
  MainContext
> = on(["win32"], "Jump list settings", () => {
  const settings = app.getJumpListSettings();
  return {
    minItems: settings.minItems,
    // Electron's own objects, checked like any other input before they are handed out.
    removedItems: decodeRemoved(settings.removedItems.map((item): unknown => ({ ...item }))),
  };
});

/**
 * Lets the macOS Touch ID authenticator answer WebAuthn requests, storing credentials in a
 * keychain access group the application is entitled to.
 */
export const configureWebAuthn = (
  keychainAccessGroup: string,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid keychain access group", () => decodeText(keychainAccessGroup)),
    (value) =>
      on(["darwin"], "WebAuthn configuration", () => {
        app.configureWebAuthn({ touchID: { keychainAccessGroup: value } });
      }),
  );

/**
 * Opens a file outside the sandbox through a security-scoped bookmark a dialog returned, for the
 * scope's lifetime, in a Mac App Store build.
 */
export const securityScopedResource = (
  bookmark: string,
): Effect.Effect<void, SewedError, MainContext | Scope.Scope> =>
  Effect.andThen(
    decoded("Invalid bookmark", () => decodeText(bookmark)),
    (value) =>
      Effect.asVoid(
        Effect.acquireRelease(
          on(["mas"], "Security-scoped resources", () =>
            app.startAccessingSecurityScopedResource(value),
          ),
          (stop) => Effect.sync(() => stop()),
        ),
      ),
  );

/**
 * Sends an Objective-C action, such as `selectAll:`, to whatever has keyboard focus in the macOS
 * application, as a menu item with that action would.
 */
export const sendActionToFirstResponder = (
  action: string,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid action", () => decodeText(action)),
    (value) =>
      on(["darwin"], "First responder actions", () => {
        Menu.sendActionToFirstResponder(value);
      }),
  );

/**
 * Shows the system's dialog for trusting or importing a certificate, on macOS and Windows, for a
 * certificate the application was recently asked about (by a certificate or client certificate
 * decider), named by its fingerprint. It resolves when the dialog closes; whether the user
 * trusted it is theirs to know. An unknown fingerprint fails `Protocol`.
 */
export const showCertificateTrustDialog = (
  fingerprint: string,
  message: string,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid certificate trust request", () => {
      const certificate = SeenCertificates.find(decodeText(fingerprint));
      if (certificate === undefined)
        throw new SewedError({
          code: "Protocol",
          message: "No certificate with this fingerprint was presented recently",
        });
      return [certificate, decodeText(message)] as const;
    }),
    ([certificate, text]) =>
      Effect.andThen(
        on(["darwin", "win32"], "The certificate trust dialog", () => undefined),
        Effect.tryPromise({
          try: () => dialog.showCertificateTrustDialog({ certificate, message: text }),
          catch: (cause) => nativeError("Could not show the certificate trust dialog", cause),
        }),
      ),
  );
