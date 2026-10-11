import { Schema } from "effect";
import * as Binary from "./Binary.ts";
import * as Certificate from "./Certificate.ts";

/** Inert schemas for the application surface that `App` in `sewed/main` operates. */

export const PathName = Schema.Literals([
  "home",
  "appData",
  "assets",
  "userData",
  "sessionData",
  "temp",
  "exe",
  "module",
  "desktop",
  "documents",
  "downloads",
  "music",
  "pictures",
  "videos",
  "recent",
  "logs",
  "crashDumps",
]);
export type PathName = typeof PathName.Type;

export const Info = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  locale: Schema.String,
  localeCountryCode: Schema.String,
  systemLocale: Schema.String,
  preferredLanguages: Schema.Array(Schema.String),
  packaged: Schema.Boolean,
  appPath: Schema.String,
  hardwareAcceleration: Schema.Boolean,
});
export type Info = typeof Info.Type;

export const GpuInfoKind = Schema.Literals(["basic", "complete"]);
export type GpuInfoKind = typeof GpuInfoKind.Type;

export const LoginItems = Schema.Struct({
  openAtLogin: Schema.Boolean,
  wasOpenedAtLogin: Schema.Boolean,
  status: Schema.Literals(["not-registered", "enabled", "requires-approval", "not-found"]),
});
export type LoginItems = typeof LoginItems.Type;

export const LoginItemSettings = Schema.Struct({
  openAtLogin: Schema.optionalKey(Schema.Boolean),
  openAsHidden: Schema.optionalKey(Schema.Boolean),
  path: Schema.optionalKey(Schema.String),
  args: Schema.optionalKey(Schema.Array(Schema.String)),
  type: Schema.optionalKey(
    Schema.Literals(["mainAppService", "agentService", "daemonService", "loginItemService"]),
  ),
  serviceName: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
});
export type LoginItemSettings = typeof LoginItemSettings.Type;

export const Badge = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/** A process exit code: an integer from 0 to 255, the range Electron's own `app.exit` accepts. */
export const ExitCode = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 255 }));

/** One process of the application, as the operating system accounts for it. */
export const ProcessMetric = Schema.Struct({
  pid: Schema.Finite,
  type: Schema.String,
  name: Schema.optionalKey(Schema.String),
  serviceName: Schema.optionalKey(Schema.String),
  /** Milliseconds since the Unix epoch. */
  creationTime: Schema.Finite,
  sandboxed: Schema.optionalKey(Schema.Boolean),
  cpu: Schema.Struct({
    /** Percent of one core since the previous read; the first read answers zero. */
    percentCPUUsage: Schema.Finite,
    /** Seconds of processor time since the process started. */
    cumulativeCPUUsage: Schema.optionalKey(Schema.Finite),
    idleWakeupsPerSecond: Schema.Finite,
  }),
  /** Kilobytes. */
  memory: Schema.Struct({
    workingSetSize: Schema.Finite,
    peakWorkingSetSize: Schema.Finite,
    privateBytes: Schema.optionalKey(Schema.Finite),
  }),
});
export type ProcessMetric = typeof ProcessMetric.Type;

/** How the next instance starts: its arguments and, when not this one, its executable. */
export const Relaunch = Schema.Struct({
  args: Schema.optionalKey(Schema.Array(Schema.String)),
  execPath: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
});
export type Relaunch = typeof Relaunch.Type;

export const AboutPanel = Schema.Struct({
  applicationName: Schema.optionalKey(Schema.String),
  applicationVersion: Schema.optionalKey(Schema.String),
  copyright: Schema.optionalKey(Schema.String),
  version: Schema.optionalKey(Schema.String),
  credits: Schema.optionalKey(Schema.String),
  authors: Schema.optionalKey(Schema.Array(Schema.String)),
  website: Schema.optionalKey(Schema.String),
  iconPath: Schema.optionalKey(Schema.String),
});
export type AboutPanel = typeof AboutPanel.Type;

export const Scheme = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9+.-]*$/));
export const ProtocolClient = Schema.Struct({
  scheme: Scheme,
  path: Schema.optionalKey(Schema.String),
  args: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type ProtocolClient = typeof ProtocolClient.Type;

/** A Chromium or Electron switch appended before readiness; the name carries no leading dashes. */
export const CommandLineSwitch = Schema.Struct({
  name: Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/i)),
  value: Schema.optionalKey(Schema.String),
});
export type CommandLineSwitch = typeof CommandLineSwitch.Type;

const text = Schema.String.check(Schema.isMinLength(1));
/** GPU settings that must precede readiness. */
export const Gpu = Schema.Struct({
  acceleration: Schema.Boolean,
  /**
   * `false` keeps WebGL and the other 3D APIs available to a domain after its GPU process has
   * crashed often; Chromium blocks them by default.
   */
  domainBlockingFor3DAPIs: Schema.optionalKey(Schema.Boolean),
});
export type Gpu = typeof Gpu.Type;
/** Facts about the application that must precede readiness. */
export const Identity = Schema.Struct({
  /** The Windows application user model id. */
  userModelId: Schema.optionalKey(text),
  /** The application's name, which decides its default data directory. */
  name: Schema.optionalKey(text),
  /** The `.desktop` file the application is launched from, on Linux, such as `app.desktop`. */
  desktopName: Schema.optionalKey(text),
  /** `true` sandboxes every renderer the process creates, whatever a window asks for. */
  sandbox: Schema.optionalKey(Schema.Boolean),
});
export type Identity = typeof Identity.Type;

/** A fatal error with no window: `title` and `content` must both be non-empty strings. */
export const ErrorBox = Schema.Struct({
  title: text,
  content: text,
});
export type ErrorBox = typeof ErrorBox.Type;

export const ChildProcessGone = Schema.Struct({
  type: Schema.Literals([
    "Utility",
    "Zygote",
    "Sandbox helper",
    "GPU",
    "Pepper Plugin",
    "Pepper Plugin Broker",
    "Unknown",
  ]),
  reason: Schema.Literals([
    "clean-exit",
    "abnormal-exit",
    "killed",
    "crashed",
    "oom",
    "launch-failed",
    "integrity-failure",
    "memory-eviction",
  ]),
  exitCode: Schema.Finite,
  serviceName: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
});
export type ChildProcessGone = typeof ChildProcessGone.Type;

/** Focus moved to or from a window; `window` is the Sewed window id, or null for a foreign window. */
export const WindowFocus = Schema.Struct({
  focused: Schema.Boolean,
  window: Schema.NullOr(Schema.String),
});
export type WindowFocus = typeof WindowFocus.Type;

export const WebContentsCreated = Schema.Struct({ id: Schema.Finite, type: Schema.String });
export type WebContentsCreated = typeof WebContentsCreated.Type;

export const LoginChallenge = Schema.Struct({
  url: Schema.String,
  isProxy: Schema.Boolean,
  scheme: Schema.String,
  host: Schema.String,
  port: Schema.Finite,
  realm: Schema.String,
  isRequestForNavigation: Schema.Boolean,
});
export type LoginChallenge = typeof LoginChallenge.Type;

/** The answer to an HTTP authentication challenge; the password stays redacted until Electron sends it. */
export const LoginResponse = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("cancel") }),
  Schema.Struct({
    kind: Schema.Literal("credentials"),
    username: Schema.String,
    password: Schema.Redacted(Schema.String),
  }),
]);
export type LoginResponse = typeof LoginResponse.Type;

export const Task = Schema.Struct({
  program: Schema.String,
  arguments: Schema.String,
  title: Schema.String,
  description: Schema.String,
  iconPath: Schema.String,
  iconIndex: Schema.Int,
  workingDirectory: Schema.optionalKey(Schema.String),
});
export type Task = typeof Task.Type;

export const JumpListItem = Schema.Struct({
  type: Schema.optionalKey(Schema.Literals(["task", "separator", "file"])),
  path: Schema.optionalKey(Schema.String),
  program: Schema.optionalKey(Schema.String),
  args: Schema.optionalKey(Schema.String),
  title: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  iconPath: Schema.optionalKey(Schema.String),
  iconIndex: Schema.optionalKey(Schema.Int),
  workingDirectory: Schema.optionalKey(Schema.String),
});
export type JumpListItem = typeof JumpListItem.Type;
export const JumpListCategory = Schema.Struct({
  type: Schema.optionalKey(Schema.Literals(["tasks", "frequent", "recent", "custom"])),
  name: Schema.optionalKey(Schema.String),
  items: Schema.optionalKey(Schema.Array(JumpListItem)),
});
export type JumpListCategory = typeof JumpListCategory.Type;

export const DockBounce = Schema.Literals(["critical", "informational"]);
export type DockBounce = typeof DockBounce.Type;

/** How the process resolves host names. Every field left out keeps Chromium's default. */
export const HostResolver = Schema.Struct({
  /** Use Chromium's own resolver instead of the operating system's. */
  enableBuiltInResolver: Schema.optionalKey(Schema.Boolean),
  /** Race IPv4 and IPv6 connections; needs the built-in resolver. */
  enableHappyEyeballs: Schema.optionalKey(Schema.Boolean),
  secureDnsMode: Schema.optionalKey(Schema.Literals(["off", "automatic", "secure"])),
  /** DNS-over-HTTPS server templates, such as `https://dns.example/dns-query{?dns}`. */
  secureDnsServers: Schema.optionalKey(Schema.Array(Schema.String.check(Schema.isMinLength(1)))),
  enableAdditionalDnsQueryTypes: Schema.optionalKey(Schema.Boolean),
});
export type HostResolver = typeof HostResolver.Type;

export const FileIconSize = Schema.Literals(["small", "normal", "large"]);
export type FileIconSize = typeof FileIconSize.Type;

/** A server asking for a client certificate, with the certificates the store offers. */
export const ClientCertificateRequest = Schema.Struct({
  url: Schema.String,
  certificates: Schema.Array(Certificate.Presented),
});
export type ClientCertificateRequest = typeof ClientCertificateRequest.Type;

/**
 * Which client certificate a request is answered with: the store's first (`default`, what Electron
 * does by itself), one named by fingerprint, or none.
 */
export const ClientCertificateChoice = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("default") }),
  Schema.Struct({ kind: Schema.Literal("none") }),
  Schema.Struct({
    kind: Schema.Literal("select"),
    fingerprint: Schema.String.check(Schema.isMinLength(1)),
  }),
]);
export type ClientCertificateChoice = typeof ClientCertificateChoice.Type;

/**
 * A macOS Handoff activity: `type` is the reverse-DNS name declared in the application's
 * `NSUserActivityTypes`, `userInfo` its JSON state, and `webpageUrl` what to open where the
 * application is not installed.
 */
export const Activity = Schema.Struct({
  type: Schema.String.check(Schema.isMinLength(1)),
  userInfo: Schema.Json,
  webpageUrl: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
});
export type Activity = typeof Activity.Type;

/** What happens to a Handoff activity; `userInfo` is `null` when it is not JSON. */
export const ActivityEvent = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("will-continue"), type: Schema.String }),
  Schema.Struct({
    kind: Schema.Literals(["continue", "was-continued", "update-state"]),
    type: Schema.String,
    userInfo: Schema.Json,
    webpageUrl: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("continue-error"),
    type: Schema.String,
    error: Schema.String,
  }),
]);
export type ActivityEvent = typeof ActivityEvent.Type;

export const ActivationPolicy = Schema.Literals(["regular", "accessory", "prohibited"]);
export type ActivationPolicy = typeof ActivationPolicy.Type;

/** What the user has removed from the Windows jump list, and how many items it shows at least. */
export const JumpListSettings = Schema.Struct({
  minItems: Schema.Finite,
  removedItems: Schema.Array(JumpListItem),
});
export type JumpListSettings = typeof JumpListSettings.Type;

/** The application registered for a URL's scheme; `icon` is PNG bytes. */
export const ProtocolApplication = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  icon: Binary.Bytes,
});
export type ProtocolApplication = typeof ProtocolApplication.Type;

/** A PKCS#12 file to import into the platform certificate store, on Linux. */
export const CertificateImport = Schema.Struct({
  certificate: text,
  password: Schema.Redacted(Schema.String),
});
export type CertificateImport = typeof CertificateImport.Type;

/** A client certificate store asking for the password of a token. */
export const CertificatePasswordRequest = Schema.Struct({
  hostname: Schema.String,
  tokenName: Schema.String,
  isRetry: Schema.Boolean,
});
export type CertificatePasswordRequest = typeof CertificatePasswordRequest.Type;

export const CertificatePassword = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("cancel") }),
  Schema.Struct({ kind: Schema.Literal("password"), password: Schema.Redacted(Schema.String) }),
]);
export type CertificatePassword = typeof CertificatePassword.Type;

/** One native window of the process; `id` is its Sewed id, or `null` for one Sewed did not create. */
export const WindowEntry = Schema.Struct({
  id: Schema.NullOr(Schema.String),
  nativeId: Schema.Finite,
  title: Schema.String,
  focused: Schema.Boolean,
  visible: Schema.Boolean,
});
export type WindowEntry = typeof WindowEntry.Type;

/** One web contents of the process; `id` is its Sewed owner's id, or `null` for an unowned one. */
export const WebContentsEntry = Schema.Struct({
  id: Schema.NullOr(Schema.String),
  nativeId: Schema.Finite,
  type: Schema.String,
  url: Schema.String,
  focused: Schema.Boolean,
});
export type WebContentsEntry = typeof WebContentsEntry.Type;

/** A session Electron created, described by where it stores its data. */
export const SessionCreated = Schema.Struct({
  persistent: Schema.Boolean,
  storagePath: Schema.NullOr(Schema.String),
});
export type SessionCreated = typeof SessionCreated.Type;
