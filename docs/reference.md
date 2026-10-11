# API reference

Generated from the built declaration files by `scripts/api-reference.mjs`. Run `pnpm docs:reference` to refresh it. Inline import types use their module name when it is a valid identifier. Declarations keep their original names, followed by any public export aliases; constructor result aliases keep their declared form.

## `sewed`

### `Application`

#### `Application.AboutPanel`

```ts
const AboutPanel: Schema.Struct<{
    readonly applicationName: Schema.optionalKey<Schema.String>;
    readonly applicationVersion: Schema.optionalKey<Schema.String>;
    readonly copyright: Schema.optionalKey<Schema.String>;
    readonly version: Schema.optionalKey<Schema.String>;
    readonly credits: Schema.optionalKey<Schema.String>;
    readonly authors: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly website: Schema.optionalKey<Schema.String>;
    readonly iconPath: Schema.optionalKey<Schema.String>;
}>;
type AboutPanel = typeof AboutPanel.Type;
```

#### `Application.ActivationPolicy`

```ts
const ActivationPolicy: Schema.Literals<readonly ["regular", "accessory", "prohibited"]>;
type ActivationPolicy = typeof ActivationPolicy.Type;
```

#### `Application.Activity`

A macOS Handoff activity: `type` is the reverse-DNS name declared in the application's
`NSUserActivityTypes`, `userInfo` its JSON state, and `webpageUrl` what to open where the
application is not installed.

```ts
const Activity: Schema.Struct<{
    readonly type: Schema.String;
    readonly userInfo: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly webpageUrl: Schema.optionalKey<Schema.String>;
}>;
type Activity = typeof Activity.Type;
```

#### `Application.ActivityEvent`

What happens to a Handoff activity; `userInfo` is `null` when it is not JSON.

```ts
const ActivityEvent: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"will-continue">;
    readonly type: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["continue", "was-continued", "update-state"]>;
    readonly type: Schema.String;
    readonly userInfo: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly webpageUrl: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"continue-error">;
    readonly type: Schema.String;
    readonly error: Schema.String;
}>]>;
type ActivityEvent = typeof ActivityEvent.Type;
```

#### `Application.Badge`

```ts
const Badge: Schema.Int;
```

#### `Application.CertificateImport`

A PKCS#12 file to import into the platform certificate store, on Linux.

```ts
const CertificateImport: Schema.Struct<{
    readonly certificate: Schema.String;
    readonly password: Schema.Redacted<Schema.String>;
}>;
type CertificateImport = typeof CertificateImport.Type;
```

#### `Application.CertificatePassword`

```ts
const CertificatePassword: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"cancel">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"password">;
    readonly password: Schema.Redacted<Schema.String>;
}>]>;
type CertificatePassword = typeof CertificatePassword.Type;
```

#### `Application.CertificatePasswordRequest`

A client certificate store asking for the password of a token.

```ts
const CertificatePasswordRequest: Schema.Struct<{
    readonly hostname: Schema.String;
    readonly tokenName: Schema.String;
    readonly isRetry: Schema.Boolean;
}>;
type CertificatePasswordRequest = typeof CertificatePasswordRequest.Type;
```

#### `Application.ChildProcessGone`

```ts
const ChildProcessGone: Schema.Struct<{
    readonly type: Schema.Literals<readonly ["Utility", "Zygote", "Sandbox helper", "GPU", "Pepper Plugin", "Pepper Plugin Broker", "Unknown"]>;
    readonly reason: Schema.Literals<readonly ["clean-exit", "abnormal-exit", "killed", "crashed", "oom", "launch-failed", "integrity-failure", "memory-eviction"]>;
    readonly exitCode: Schema.Finite;
    readonly serviceName: Schema.optionalKey<Schema.String>;
    readonly name: Schema.optionalKey<Schema.String>;
}>;
type ChildProcessGone = typeof ChildProcessGone.Type;
```

#### `Application.ClientCertificateChoice`

Which client certificate a request is answered with: the store's first (`default`, what Electron
does by itself), one named by fingerprint, or none.

```ts
const ClientCertificateChoice: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"default">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"none">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"select">;
    readonly fingerprint: Schema.String;
}>]>;
type ClientCertificateChoice = typeof ClientCertificateChoice.Type;
```

#### `Application.ClientCertificateRequest`

A server asking for a client certificate, with the certificates the store offers.

```ts
const ClientCertificateRequest: Schema.Struct<{
    readonly url: Schema.String;
    readonly certificates: Schema.$Array<Schema.Struct<{
        readonly fingerprint: Schema.String;
        readonly subjectName: Schema.String;
        readonly issuerName: Schema.String;
        readonly validStart: Schema.Finite;
        readonly validExpiry: Schema.Finite;
    }>>;
}>;
type ClientCertificateRequest = typeof ClientCertificateRequest.Type;
```

#### `Application.CommandLineSwitch`

A Chromium or Electron switch appended before readiness; the name carries no leading dashes.

```ts
const CommandLineSwitch: Schema.Struct<{
    readonly name: Schema.String;
    readonly value: Schema.optionalKey<Schema.String>;
}>;
type CommandLineSwitch = typeof CommandLineSwitch.Type;
```

#### `Application.DockBounce`

```ts
const DockBounce: Schema.Literals<readonly ["critical", "informational"]>;
type DockBounce = typeof DockBounce.Type;
```

#### `Application.ErrorBox`

A fatal error with no window: `title` and `content` must both be non-empty strings.

```ts
const ErrorBox: Schema.Struct<{
    readonly title: Schema.String;
    readonly content: Schema.String;
}>;
type ErrorBox = typeof ErrorBox.Type;
```

#### `Application.ExitCode`

A process exit code: an integer from 0 to 255, the range Electron's own `app.exit` accepts.

```ts
const ExitCode: Schema.Int;
```

#### `Application.FileIconSize`

```ts
const FileIconSize: Schema.Literals<readonly ["small", "normal", "large"]>;
type FileIconSize = typeof FileIconSize.Type;
```

#### `Application.Gpu`

GPU settings that must precede readiness.

```ts
const Gpu: Schema.Struct<{
    readonly acceleration: Schema.Boolean;
    /**
     * `false` keeps WebGL and the other 3D APIs available to a domain after its GPU process has
     * crashed often; Chromium blocks them by default.
     */
    readonly domainBlockingFor3DAPIs: Schema.optionalKey<Schema.Boolean>;
}>;
type Gpu = typeof Gpu.Type;
```

#### `Application.GpuInfoKind`

```ts
const GpuInfoKind: Schema.Literals<readonly ["basic", "complete"]>;
type GpuInfoKind = typeof GpuInfoKind.Type;
```

#### `Application.HostResolver`

How the process resolves host names. Every field left out keeps Chromium's default.

```ts
const HostResolver: Schema.Struct<{
    /** Use Chromium's own resolver instead of the operating system's. */
    readonly enableBuiltInResolver: Schema.optionalKey<Schema.Boolean>;
    /** Race IPv4 and IPv6 connections; needs the built-in resolver. */
    readonly enableHappyEyeballs: Schema.optionalKey<Schema.Boolean>;
    readonly secureDnsMode: Schema.optionalKey<Schema.Literals<readonly ["off", "automatic", "secure"]>>;
    /** DNS-over-HTTPS server templates, such as `https://dns.example/dns-query{?dns}`. */
    readonly secureDnsServers: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly enableAdditionalDnsQueryTypes: Schema.optionalKey<Schema.Boolean>;
}>;
type HostResolver = typeof HostResolver.Type;
```

#### `Application.Identity`

Facts about the application that must precede readiness.

```ts
const Identity: Schema.Struct<{
    /** The Windows application user model id. */
    readonly userModelId: Schema.optionalKey<Schema.String>;
    /** The application's name, which decides its default data directory. */
    readonly name: Schema.optionalKey<Schema.String>;
    /** The `.desktop` file the application is launched from, on Linux, such as `app.desktop`. */
    readonly desktopName: Schema.optionalKey<Schema.String>;
    /** `true` sandboxes every renderer the process creates, whatever a window asks for. */
    readonly sandbox: Schema.optionalKey<Schema.Boolean>;
}>;
type Identity = typeof Identity.Type;
```

#### `Application.Info`

```ts
const Info: Schema.Struct<{
    readonly name: Schema.String;
    readonly version: Schema.String;
    readonly locale: Schema.String;
    readonly localeCountryCode: Schema.String;
    readonly systemLocale: Schema.String;
    readonly preferredLanguages: Schema.$Array<Schema.String>;
    readonly packaged: Schema.Boolean;
    readonly appPath: Schema.String;
    readonly hardwareAcceleration: Schema.Boolean;
}>;
type Info = typeof Info.Type;
```

#### `Application.JumpListCategory`

```ts
const JumpListCategory: Schema.Struct<{
    readonly type: Schema.optionalKey<Schema.Literals<readonly ["tasks", "frequent", "recent", "custom"]>>;
    readonly name: Schema.optionalKey<Schema.String>;
    readonly items: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly type: Schema.optionalKey<Schema.Literals<readonly ["task", "separator", "file"]>>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly program: Schema.optionalKey<Schema.String>;
        readonly args: Schema.optionalKey<Schema.String>;
        readonly title: Schema.optionalKey<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly iconPath: Schema.optionalKey<Schema.String>;
        readonly iconIndex: Schema.optionalKey<Schema.Int>;
        readonly workingDirectory: Schema.optionalKey<Schema.String>;
    }>>>;
}>;
type JumpListCategory = typeof JumpListCategory.Type;
```

#### `Application.JumpListItem`

```ts
const JumpListItem: Schema.Struct<{
    readonly type: Schema.optionalKey<Schema.Literals<readonly ["task", "separator", "file"]>>;
    readonly path: Schema.optionalKey<Schema.String>;
    readonly program: Schema.optionalKey<Schema.String>;
    readonly args: Schema.optionalKey<Schema.String>;
    readonly title: Schema.optionalKey<Schema.String>;
    readonly description: Schema.optionalKey<Schema.String>;
    readonly iconPath: Schema.optionalKey<Schema.String>;
    readonly iconIndex: Schema.optionalKey<Schema.Int>;
    readonly workingDirectory: Schema.optionalKey<Schema.String>;
}>;
type JumpListItem = typeof JumpListItem.Type;
```

#### `Application.JumpListSettings`

What the user has removed from the Windows jump list, and how many items it shows at least.

```ts
const JumpListSettings: Schema.Struct<{
    readonly minItems: Schema.Finite;
    readonly removedItems: Schema.$Array<Schema.Struct<{
        readonly type: Schema.optionalKey<Schema.Literals<readonly ["task", "separator", "file"]>>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly program: Schema.optionalKey<Schema.String>;
        readonly args: Schema.optionalKey<Schema.String>;
        readonly title: Schema.optionalKey<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly iconPath: Schema.optionalKey<Schema.String>;
        readonly iconIndex: Schema.optionalKey<Schema.Int>;
        readonly workingDirectory: Schema.optionalKey<Schema.String>;
    }>>;
}>;
type JumpListSettings = typeof JumpListSettings.Type;
```

#### `Application.LoginChallenge`

```ts
const LoginChallenge: Schema.Struct<{
    readonly url: Schema.String;
    readonly isProxy: Schema.Boolean;
    readonly scheme: Schema.String;
    readonly host: Schema.String;
    readonly port: Schema.Finite;
    readonly realm: Schema.String;
    readonly isRequestForNavigation: Schema.Boolean;
}>;
type LoginChallenge = typeof LoginChallenge.Type;
```

#### `Application.LoginItems`

```ts
const LoginItems: Schema.Struct<{
    readonly openAtLogin: Schema.Boolean;
    readonly wasOpenedAtLogin: Schema.Boolean;
    readonly status: Schema.Literals<readonly ["not-registered", "enabled", "requires-approval", "not-found"]>;
}>;
type LoginItems = typeof LoginItems.Type;
```

#### `Application.LoginItemSettings`

```ts
const LoginItemSettings: Schema.Struct<{
    readonly openAtLogin: Schema.optionalKey<Schema.Boolean>;
    readonly openAsHidden: Schema.optionalKey<Schema.Boolean>;
    readonly path: Schema.optionalKey<Schema.String>;
    readonly args: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly type: Schema.optionalKey<Schema.Literals<readonly ["mainAppService", "agentService", "daemonService", "loginItemService"]>>;
    readonly serviceName: Schema.optionalKey<Schema.String>;
    readonly name: Schema.optionalKey<Schema.String>;
}>;
type LoginItemSettings = typeof LoginItemSettings.Type;
```

#### `Application.LoginResponse`

The answer to an HTTP authentication challenge; the password stays redacted until Electron sends it.

```ts
const LoginResponse: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"cancel">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"credentials">;
    readonly username: Schema.String;
    readonly password: Schema.Redacted<Schema.String>;
}>]>;
type LoginResponse = typeof LoginResponse.Type;
```

#### `Application.PathName`

Inert schemas for the application surface that `App` in `sewed/main` operates.

```ts
const PathName: Schema.Literals<readonly ["home", "appData", "assets", "userData", "sessionData", "temp", "exe", "module", "desktop", "documents", "downloads", "music", "pictures", "videos", "recent", "logs", "crashDumps"]>;
type PathName = typeof PathName.Type;
```

#### `Application.ProcessMetric`

One process of the application, as the operating system accounts for it.

```ts
const ProcessMetric: Schema.Struct<{
    readonly pid: Schema.Finite;
    readonly type: Schema.String;
    readonly name: Schema.optionalKey<Schema.String>;
    readonly serviceName: Schema.optionalKey<Schema.String>;
    /** Milliseconds since the Unix epoch. */
    readonly creationTime: Schema.Finite;
    readonly sandboxed: Schema.optionalKey<Schema.Boolean>;
    readonly cpu: Schema.Struct<{
        /** Percent of one core since the previous read; the first read answers zero. */
        readonly percentCPUUsage: Schema.Finite;
        /** Seconds of processor time since the process started. */
        readonly cumulativeCPUUsage: Schema.optionalKey<Schema.Finite>;
        readonly idleWakeupsPerSecond: Schema.Finite;
    }>;
    /** Kilobytes. */
    readonly memory: Schema.Struct<{
        readonly workingSetSize: Schema.Finite;
        readonly peakWorkingSetSize: Schema.Finite;
        readonly privateBytes: Schema.optionalKey<Schema.Finite>;
    }>;
}>;
type ProcessMetric = typeof ProcessMetric.Type;
```

#### `Application.ProtocolApplication`

The application registered for a URL's scheme; `icon` is PNG bytes.

```ts
const ProtocolApplication: Schema.Struct<{
    readonly name: Schema.String;
    readonly path: Schema.String;
    readonly icon: Binary.Bytes;
}>;
type ProtocolApplication = typeof ProtocolApplication.Type;
```

#### `Application.ProtocolClient`

```ts
const ProtocolClient: Schema.Struct<{
    readonly scheme: Schema.String;
    readonly path: Schema.optionalKey<Schema.String>;
    readonly args: Schema.optionalKey<Schema.$Array<Schema.String>>;
}>;
type ProtocolClient = typeof ProtocolClient.Type;
```

#### `Application.Relaunch`

How the next instance starts: its arguments and, when not this one, its executable.

```ts
const Relaunch: Schema.Struct<{
    readonly args: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly execPath: Schema.optionalKey<Schema.String>;
}>;
type Relaunch = typeof Relaunch.Type;
```

#### `Application.Scheme`

```ts
const Scheme: Schema.String;
```

#### `Application.SessionCreated`

A session Electron created, described by where it stores its data.

```ts
const SessionCreated: Schema.Struct<{
    readonly persistent: Schema.Boolean;
    readonly storagePath: Schema.NullOr<Schema.String>;
}>;
type SessionCreated = typeof SessionCreated.Type;
```

#### `Application.Task`

```ts
const Task: Schema.Struct<{
    readonly program: Schema.String;
    readonly arguments: Schema.String;
    readonly title: Schema.String;
    readonly description: Schema.String;
    readonly iconPath: Schema.String;
    readonly iconIndex: Schema.Int;
    readonly workingDirectory: Schema.optionalKey<Schema.String>;
}>;
type Task = typeof Task.Type;
```

#### `Application.WebContentsCreated`

```ts
const WebContentsCreated: Schema.Struct<{
    readonly id: Schema.Finite;
    readonly type: Schema.String;
}>;
type WebContentsCreated = typeof WebContentsCreated.Type;
```

#### `Application.WebContentsEntry`

One web contents of the process; `id` is its Sewed owner's id, or `null` for an unowned one.

```ts
const WebContentsEntry: Schema.Struct<{
    readonly id: Schema.NullOr<Schema.String>;
    readonly nativeId: Schema.Finite;
    readonly type: Schema.String;
    readonly url: Schema.String;
    readonly focused: Schema.Boolean;
}>;
type WebContentsEntry = typeof WebContentsEntry.Type;
```

#### `Application.WindowEntry`

One native window of the process; `id` is its Sewed id, or `null` for one Sewed did not create.

```ts
const WindowEntry: Schema.Struct<{
    readonly id: Schema.NullOr<Schema.String>;
    readonly nativeId: Schema.Finite;
    readonly title: Schema.String;
    readonly focused: Schema.Boolean;
    readonly visible: Schema.Boolean;
}>;
type WindowEntry = typeof WindowEntry.Type;
```

#### `Application.WindowFocus`

Focus moved to or from a window; `window` is the Sewed window id, or null for a foreign window.

```ts
const WindowFocus: Schema.Struct<{
    readonly focused: Schema.Boolean;
    readonly window: Schema.NullOr<Schema.String>;
}>;
type WindowFocus = typeof WindowFocus.Type;
```

### `Automation`

#### `Automation.Declaration`

The automation web contents are created with; an undeclared operation does not exist on the handle.

```ts
const Declaration: Schema.Struct<{
    readonly evaluate: Schema.optionalKey<Schema.Literal<true>>;
    readonly devtools: Schema.optionalKey<Schema.NonEmptyArray<Schema.String>>;
    readonly input: Schema.optionalKey<Schema.Literal<true>>;
}>;
type Declaration = typeof Declaration.Type;
```

#### `Automation.DevToolsMethod`

A DevTools protocol method such as `Runtime.evaluate`.

```ts
const DevToolsMethod: Schema.String;
type DevToolsMethod = typeof DevToolsMethod.Type;
```

#### `Automation.DevToolsOf`

The DevTools methods a declaration allows; none when the declaration has no allowlist.

```ts
type DevToolsOf<A extends Declaration> = A extends {
  readonly devtools: readonly string[];
}
  ? A["devtools"][number]
  : never;
```

#### `Automation.EvaluateOptions`

```ts
const EvaluateOptions: Schema.Struct<{
    readonly userGesture: Schema.optionalKey<Schema.Boolean>;
    /**
     * Runs the script in an isolated world of this id instead of the page's own, so it shares the
     * DOM but none of the page's JavaScript state. Ids from 1000 up are free for applications.
     */
    readonly world: Schema.optionalKey<Schema.Int>;
}>;
type EvaluateOptions = typeof EvaluateOptions.Type;
```

#### `Automation.InputEvent`

```ts
const InputEvent: Schema.Union<readonly [Schema.Struct<{
    readonly modifiers: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["shift", "control", "ctrl", "alt", "meta", "command", "cmd", "iskeypad", "isautorepeat", "leftbuttondown", "middlebuttondown", "rightbuttondown", "capslock", "numlock", "left", "right"]>>>;
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
    readonly globalX: Schema.optionalKey<Schema.Finite>;
    readonly globalY: Schema.optionalKey<Schema.Finite>;
    readonly movementX: Schema.optionalKey<Schema.Finite>;
    readonly movementY: Schema.optionalKey<Schema.Finite>;
    readonly type: Schema.Literals<readonly ["mouseDown", "mouseUp", "mouseEnter", "mouseLeave", "contextMenu", "mouseMove"]>;
    readonly button: Schema.optionalKey<Schema.Literals<readonly ["left", "middle", "right"]>>;
    readonly clickCount: Schema.optionalKey<Schema.Int>;
}>, Schema.Struct<{
    readonly modifiers: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["shift", "control", "ctrl", "alt", "meta", "command", "cmd", "iskeypad", "isautorepeat", "leftbuttondown", "middlebuttondown", "rightbuttondown", "capslock", "numlock", "left", "right"]>>>;
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
    readonly globalX: Schema.optionalKey<Schema.Finite>;
    readonly globalY: Schema.optionalKey<Schema.Finite>;
    readonly movementX: Schema.optionalKey<Schema.Finite>;
    readonly movementY: Schema.optionalKey<Schema.Finite>;
    readonly type: Schema.Literal<"mouseWheel">;
    readonly deltaX: Schema.optionalKey<Schema.Finite>;
    readonly deltaY: Schema.optionalKey<Schema.Finite>;
    readonly wheelTicksX: Schema.optionalKey<Schema.Finite>;
    readonly wheelTicksY: Schema.optionalKey<Schema.Finite>;
    readonly accelerationRatioX: Schema.optionalKey<Schema.Finite>;
    readonly accelerationRatioY: Schema.optionalKey<Schema.Finite>;
    readonly hasPreciseScrollingDeltas: Schema.optionalKey<Schema.Boolean>;
    readonly canScroll: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{
    readonly modifiers: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["shift", "control", "ctrl", "alt", "meta", "command", "cmd", "iskeypad", "isautorepeat", "leftbuttondown", "middlebuttondown", "rightbuttondown", "capslock", "numlock", "left", "right"]>>>;
    readonly type: Schema.Literals<readonly ["rawKeyDown", "keyDown", "keyUp", "char"]>;
    readonly keyCode: Schema.String;
}>]>;
type InputEvent = typeof InputEvent.Type;
```

#### `Automation.KeyboardInput`

```ts
const KeyboardInput: Schema.Struct<{
    readonly modifiers: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["shift", "control", "ctrl", "alt", "meta", "command", "cmd", "iskeypad", "isautorepeat", "leftbuttondown", "middlebuttondown", "rightbuttondown", "capslock", "numlock", "left", "right"]>>>;
    readonly type: Schema.Literals<readonly ["rawKeyDown", "keyDown", "keyUp", "char"]>;
    readonly keyCode: Schema.String;
}>;
type KeyboardInput = typeof KeyboardInput.Type;
```

#### `Automation.Members`

Every automation member, typed against one declaration.

```ts
interface Members<A extends Declaration> {
  readonly evaluate: <T, I>(
    script: string,
    result: Schema.Codec<T, I>,
    options?: EvaluateOptions,
  ) => Effect.Effect<T, SewedError, MainContext>;
  readonly devtools: <T, I>(
    method: DevToolsOf<A>,
    params: Schema.Json | undefined,
    result: Schema.Codec<T, I>,
  ) => Effect.Effect<T, SewedError, MainContext>;
  readonly input: (event: InputEvent) => Effect.Effect<void, SewedError, MainContext>;
}
```

#### `Automation.MouseInput`

Data mirrors of Electron's input structures; the library copies them before sending.

```ts
const MouseInput: Schema.Struct<{
    readonly modifiers: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["shift", "control", "ctrl", "alt", "meta", "command", "cmd", "iskeypad", "isautorepeat", "leftbuttondown", "middlebuttondown", "rightbuttondown", "capslock", "numlock", "left", "right"]>>>;
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
    readonly globalX: Schema.optionalKey<Schema.Finite>;
    readonly globalY: Schema.optionalKey<Schema.Finite>;
    readonly movementX: Schema.optionalKey<Schema.Finite>;
    readonly movementY: Schema.optionalKey<Schema.Finite>;
    readonly type: Schema.Literals<readonly ["mouseDown", "mouseUp", "mouseEnter", "mouseLeave", "contextMenu", "mouseMove"]>;
    readonly button: Schema.optionalKey<Schema.Literals<readonly ["left", "middle", "right"]>>;
    readonly clickCount: Schema.optionalKey<Schema.Int>;
}>;
type MouseInput = typeof MouseInput.Type;
```

#### `Automation.MouseWheelInput`

```ts
const MouseWheelInput: Schema.Struct<{
    readonly modifiers: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["shift", "control", "ctrl", "alt", "meta", "command", "cmd", "iskeypad", "isautorepeat", "leftbuttondown", "middlebuttondown", "rightbuttondown", "capslock", "numlock", "left", "right"]>>>;
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
    readonly globalX: Schema.optionalKey<Schema.Finite>;
    readonly globalY: Schema.optionalKey<Schema.Finite>;
    readonly movementX: Schema.optionalKey<Schema.Finite>;
    readonly movementY: Schema.optionalKey<Schema.Finite>;
    readonly type: Schema.Literal<"mouseWheel">;
    readonly deltaX: Schema.optionalKey<Schema.Finite>;
    readonly deltaY: Schema.optionalKey<Schema.Finite>;
    readonly wheelTicksX: Schema.optionalKey<Schema.Finite>;
    readonly wheelTicksY: Schema.optionalKey<Schema.Finite>;
    readonly accelerationRatioX: Schema.optionalKey<Schema.Finite>;
    readonly accelerationRatioY: Schema.optionalKey<Schema.Finite>;
    readonly hasPreciseScrollingDeltas: Schema.optionalKey<Schema.Boolean>;
    readonly canScroll: Schema.optionalKey<Schema.Boolean>;
}>;
type MouseWheelInput = typeof MouseWheelInput.Type;
```

#### `Automation.Of`

The automation members a declaration grants; undeclared members do not exist on the type.

```ts
type Of<A extends Declaration> = Pick<Members<A>, Extract<keyof A, keyof Members<A>>>;
```

### `Binary`

#### `Binary.bulk`

Declares that an operation's `field` may exceed the envelope limit, up to `maxBytes`. The
client sends such a request in acknowledged parts and the owner assembles it before the
handler runs; an honest client refuses a larger one before sending anything.

`maxBytes` bounds that one field exactly. The rest of the request keeps the ordinary envelope
allowance on top of it, so an operation that accepts a 12 MiB attachment declares 12 MiB and
the command, headers and envelope beside it still have their own 256 KiB.

The bound is a transport fact: an in-process call has no wire and no bound.

```ts
const bulk: <Tag extends string, Payload extends Schema.Top, Success extends Schema.Top, Failure extends Schema.Top, Middleware extends RpcMiddleware.AnyService, Requires>(rpc: Rpc.Rpc<Tag, Payload, Success, Failure, Middleware, Requires>, options: Options<Payload>) => Rpc.Rpc<Tag, Payload, Success, Failure, Middleware, Requires>;
```

#### `Binary.bulkAnswer`

Declares that a unary operation's answer may exceed the envelope limit, up to `maxBytes`. The
owner encodes its `Exit` once and, when it does not fit one envelope, sends it as acknowledged
parts; the client assembles them, up to `maxBytes` plus one envelope, before completing the
request. Symmetric with {@link bulk}: an answer past `maxBytes` fails typed, the host having
run, rather than sending anything past the bound. A stream-shaped operation already fragments
its own values between them and is refused here, at the declaration, not at a call.

The bound is a transport fact: an in-process call has no wire and no bound.

```ts
const bulkAnswer: <Tag extends string, Payload extends Schema.Top, Success extends Schema.Top, Failure extends Schema.Top, Middleware extends RpcMiddleware.AnyService, Requires>(rpc: Rpc.Rpc<Tag, Payload, Success, Failure, Middleware, Requires>, options: AnswerOptions) => Rpc.Rpc<Tag, Payload, Success, Failure, Middleware, Requires>;
```

#### `Binary.BulkAnswerOptions`

```ts
interface AnswerOptions {
  /** The largest the operation's encoded answer may be, in bytes. */
  readonly maxBytes: number;
}
export type { AnswerOptions as BulkAnswerOptions };
```

#### `Binary.BulkOptions`

```ts
interface Options<Payload extends Schema.Top> {
  /** The payload field carrying the bytes; it is `Binary.Bytes` in a `Binary.protocol`. */
  readonly field: BytesField<Payload>;
  /** The largest that field may be, in bytes. */
  readonly maxBytes: number;
}
export type { Options as BulkOptions };
```

#### `Binary.Bytes`

Native bytes in a Binary.protocol; structural RPC codecs preserve this declaration.

Bytes are recognized by what they are rather than by which realm made them, and a field is
re-viewed into this realm on its way to the packer. A test environment that installs its own
`Uint8Array` over the global — vitest's `jsdom` is the one consumers meet — therefore encodes
and decodes a byte field the way a renderer does.

The name is the type. A byte field is `Uint8Array` on both sides of the codec, and naming that
here is what keeps every schema built on it — and the declaration a consumer hovers — reading as
`Bytes` rather than as the declaration and the transformation it is assembled from.

```ts
interface Bytes extends Schema.decodeTo<Schema.declare<Uint8Array>, Schema.declare<Uint8Array>, never, never> {
}
const Bytes: Bytes;
```

#### `Binary.BytesField`

The payload fields a bulk declaration may name: the ones that carry bytes. Naming any other
field, or one the payload does not have, is a compile error, so the field the transport
measures always exists and is always the one holding the bulk.

```ts
type BytesField<Payload extends Schema.Top> = {
  [Key in keyof Payload["Type"]]: Payload["Type"][Key] extends Uint8Array ? Key : never;
}[keyof Payload["Type"]] &
  string;
```

#### `Binary.chunkBytes`

```ts
const chunkBytes: number;
```

#### `Binary.chunks`

Splits byte chunks lazily; callers retain ownership of their input buffers.

```ts
const chunks: <E, R>(source: Stream.Stream<Uint8Array, E, R>) => Stream.Stream<Uint8Array<ArrayBufferLike>, E, R>;
```

#### `Binary.protocol`

```ts
const binary: <Rpcs extends Rpc.Any>(protocol: RpcGroup.RpcGroup<Rpcs>) => RpcGroup.RpcGroup<Rpcs>;
export { binary as protocol };
```

### `Binding`

#### `Binding.Bound`

```ts
interface Bound<Key extends string = string> {
  readonly slot: Context.Service<typeof slotIdentifier, ConnectionFactory>;
  readonly key: Key;
  readonly ownerId: string;
}
```

#### `Binding.client`

```ts
const client: <Rpcs extends Rpc.Any>(binding: Slot<Rpcs>) => Effect.Effect<Client<Rpcs>, SewedError, ClientContext | Scope.Scope | Rpc.MiddlewareClient<Rpcs>>;
```

#### `Binding.Client`

```ts
type Client<Rpcs extends Rpc.Any> = {
  readonly [Current in Rpcs as Current["_tag"]]: (
    input: Rpc.PayloadConstructor<Current>,
  ) => Current extends Rpc.Rpc<
    infer _Tag,
    infer _Payload,
    infer Success,
    infer Error,
    infer Middleware,
    infer _Requires
  >
    ? Success extends RpcSchema.Stream<infer A, infer E>
      ? Stream.Stream<
          A["Type"],
          | E["Type"]
          | Error["Type"]
          | Middleware["error"]["Type"]
          | Middleware["~ClientError"]
          | SewedError,
          ClientContext | Scope.Scope | Rpc.ServicesClient<Current> | Rpc.MiddlewareClient<Rpcs>
        >
      : Effect.Effect<
          Success["Type"],
          Error["Type"] | Middleware["error"]["Type"] | Middleware["~ClientError"] | SewedError,
          ClientContext | Scope.Scope | Rpc.ServicesClient<Current> | Rpc.MiddlewareClient<Rpcs>
        >
    : never;
};
```

#### `Binding.clientContext`

One `ClientContext` service over `bindings`, with no placement requirement of its own: `layer`
builds this the same way but also requires `MainContext`. A caller that supplies its own
identity instead — a renderer's own testing store, for instance — calls this directly.

```ts
const clientContext: (bindings: readonly Bound[]) => Effect.Effect<{
    readonly identity: object;
    readonly bindings: Context.Context<never>;
    readonly owners: ReadonlyMap<string, string>;
    readonly isClosed: () => boolean;
}, SewedError, Scope.Scope>;
```

#### `Binding.Connection`

How a deferred client reaches its owner: one connection per slot for the client environment,
or one connection per operation. The renderer bridge handshake dominates small calls, so
`shared` is the default and `per-call` is the isolation opt-out.

```ts
type Connection = "shared" | "per-call";
```

#### `Binding.deferred`

```ts
const deferred: <Rpcs extends Rpc.Any>(binding: Slot<Rpcs>, options?: {
    readonly connection?: Connection;
}) => Effect.Effect<Client<Rpcs>, never, ClientContext>;
```

#### `Binding.layer`

```ts
const layer: (bindings: readonly Bound[]) => Layer.Layer<ClientContext, SewedError, MainContext>;
```

#### `Binding.Owner`

```ts
interface Owner<Rpcs extends Rpc.Any> {
  readonly id: string;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly [ownerType]: (rpc: Rpcs) => Rpcs;
}
```

#### `Binding.pending`

A client over a context that is not known yet: `options.context` is an Effect the caller is
still waiting on, still running, or has already failed — a runtime store's own future state, for
instance. Every call `flatMap`s it first, so a call made before it resolves parks there until it
does; a call made after it has failed `Closed` fails `Closed` the same way every other call does.
The returned `Client<Rpcs>` is one object built once: its identity does not change as `context`
moves through those states, only what each call does when it runs.

```ts
const pending: <Rpcs extends Rpc.Any>(binding: Slot<Rpcs>, options: {
    readonly context: Effect.Effect<ClientContext["Service"], SewedError>;
    readonly connection?: Connection;
}) => Client<Rpcs>;
```

#### `Binding.slot`

```ts
const slot: <const Name extends string, Rpcs extends Rpc.Any>(name: Name, protocol: RpcGroup.RpcGroup<Rpcs>) => Slot<Rpcs, `${typeof prefix}${Name}`>;
```

#### `Binding.Slot`

```ts
interface Slot<Rpcs extends Rpc.Any, Key extends string = string> extends Context.Service<
  typeof slotIdentifier,
  ConnectionFactory
> {
  readonly key: Key;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  (): Effect.Effect<
    Client<Rpcs>,
    SewedError,
    ClientContext | Scope.Scope | Rpc.MiddlewareClient<Rpcs>
  >;
}
```

#### `Binding.to`

```ts
const to: <Rpcs extends Rpc.Any, Key extends string>(slot: Slot<Rpcs, Key>, owner: Owner<NoInfer<Rpcs>>) => Bound<Key>;
```

### `Capability`

#### `Capability.Capability`

```ts
interface Capability<Rpcs extends Rpc.Any, Key extends string = string> extends Context.Service<
  Capability<Rpcs, Key>,
  Operations<Rpcs>
> {
  readonly key: Key;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly slot: Binding.Slot<Rpcs, Key>;
}
```

#### `Capability.client`

```ts
const client: <Rpcs extends Rpc.Any, Key extends string>(capability: Capability<Rpcs, Key>, options?: {
    readonly connection?: Binding.Connection;
}) => Layer.Layer<Capability<Rpcs, Key>, never, ClientContext>;
```

#### `Capability.Client`

A capability's operations: what `yield* capability` answers, named so a helper can take it as a
parameter instead of writing out `Operations<Rpcs>` by hand.

```ts
type Client<C extends HasProtocol> = Operations<RpcsOf<C>>;
```

#### `Capability.declaration`

The slot a served capability's owner binds to, for a renderer entry's `bindings` list.
`Binding.to(capability.slot, owner)` pairs it with the owner `serve` returns.

```ts
const declaration: <Rpcs extends Rpc.Any, Key extends string>(capability: Capability<Rpcs, Key>) => Binding.Declaration<Key>;
```

#### `Capability.define`

```ts
const define: <const Name extends string, Rpcs extends Rpc.Any>(name: Name, protocol: RpcGroup.RpcGroup<Rpcs>) => Capability<Rpcs, `sewed/binding/${Name}`>;
```

#### `Capability.fromHandlers`

```ts
const fromHandlers: <Rpcs extends Rpc.Any, Key extends string, E, R>(capability: Capability<Rpcs, Key>, handlers: HandlerLayer<Rpcs, E, R>) => Layer.Layer<Capability<Rpcs, Key>, E, R>;
```

#### `Capability.Handlers`

The handlers a host serves for a capability's protocol: a Layer of the protocol's handlers, or
a function of `implement` (the protocol's `toLayer`) returning one. This is what
{@link fromHandlers}, `Testing.client`, and `Testing.layer` all take, named so a function can
take a host as a parameter.

```ts
type Handlers<Rpcs extends Rpc.Any, E = never, R = never> = HandlerLayer<Rpcs, E, R>;
```

#### `Capability.Implementation`

A capability's handler record — one function per operation — sharing the requirement `R`.
Effect's own `RpcGroup.HandlersFrom` types every handler's requirement as `any`, because its
`Rpc.ToHandlerFn` defaults `R` to `any` when nothing supplies one; a record annotated with
`HandlersFrom` therefore makes `toLayer` infer `R = any`, and a host built over it collapses
`R | MainContext | Scope` to `any` — a requirement no caller can discharge, so `Effect.runPromise`
accepts it though nothing was actually provided. A record typed with `Implementation` keeps `R`,
so the host built from it carries a requirement a caller can still discharge, and `R` defaults to
`never` for a record whose handlers need nothing.

```ts
type Implementation<C extends HasProtocol, R = never> = {
  readonly [Current in RpcsOf<C> as Current["_tag"]]: Rpc.ToHandlerFn<Current, R>;
};
```

#### `Capability.Operations`

What a capability offers its caller: one method per RPC, carrying only the requirements that are
genuinely the caller's to provide — the protocol's own schema services. Acquiring the capability
is what proves the environment, so an operation needs no client context, no scope, and no
middleware service. Both layers satisfy this: the native one calls handlers directly, and the
client one captures its environment when it is built.

```ts
type Operations<Rpcs extends Rpc.Any> = {
  readonly [Current in Rpcs as Current["_tag"]]: (
    input: Rpc.PayloadConstructor<Current>,
  ) => Current extends Rpc.Rpc<
    infer _Tag,
    infer _Payload,
    infer Success,
    infer Error,
    infer _Middleware,
    infer _Requires
  >
    ? Success extends RpcSchema.Stream<infer A, infer E>
      ? Stream.Stream<
          A["Type"],
          E["Type"] | Error["Type"] | SewedError,
          Rpc.ServicesClient<Current>
        >
      : Effect.Effect<Success["Type"], Error["Type"] | SewedError, Rpc.ServicesClient<Current>>
    : never;
};
```

### `Certificate`

#### `Certificate.Policy`

A certificate policy: it names the least it needs from an event — `{ hostname, certificate:
{ fingerprint } }` — and answers `"trust" | "reject" | Pass`. The first matching rule within one
policy wins; hostnames compare lowercased; a `*.` pattern matches the bare suffix and any
subdomain. `trust: "system"` and no match both answer {@link Decision.Pass}, which is why the same
policy installs on `Session.Certificate` (a three-answer decidable: `"reject" | "system" |
"trust"`) and on `App.CertificateError` (two: `"reject" | "trust"`) alike. `"always"` trusts; a
`{ fingerprint }` rule trusts on equality and rejects on mismatch. An empty `hostname` — what
`App.CertificateError`'s event carries for a URL Chromium could not parse — always answers
{@link Decision.Pass}, ahead of matching any rule: `Rule`'s own schema already refuses every
malformed pattern that could otherwise match it, but this is the belt to that schema's braces —
it covers the event this compiles against, not the rules.

```ts
const Policy: Decision.Policy<readonly {
    readonly hostname: string;
    readonly trust: "always" | "system" | {
        readonly fingerprint: string;
    };
}[], {
    readonly hostname: string;
    readonly certificate: {
        readonly fingerprint: string;
    };
}, "reject" | "trust">;
```

#### `Certificate.Presented`

What Electron's `certificate-error` callback hands over about the offending certificate, narrowed
to the fields a trust decision actually needs: the fingerprint a rule pins against, the subject and
issuer names a decider can show or match, and the validity window. Electron's own `Certificate`
carries more (the PEM data, the full principal objects, a recursive issuer certificate, and the
serial number); none of it is needed to answer "trust" or "reject", so it stays out of the
decidable's event.

```ts
const Presented: Schema.Struct<{
    readonly fingerprint: Schema.String;
    readonly subjectName: Schema.String;
    readonly issuerName: Schema.String;
    /** Seconds since the epoch, as Electron's `Certificate.validStart` reports it. */
    readonly validStart: Schema.Finite;
    /** Seconds since the epoch, as Electron's `Certificate.validExpiry` reports it. */
    readonly validExpiry: Schema.Finite;
}>;
type Presented = typeof Presented.Type;
```

#### `Certificate.Rule`

Hostnames are exact or a `*.` suffix; hosts without a rule keep Chromium's verdict. A pattern
{@link canonicalPattern} cannot resolve to a real host is refused at decode: write a bare
hostname with no scheme, port, or path; an internationalized host in its punycode (`xn--`) form,
since Chromium reports a host that way and a Unicode spelling would never match it; or an IPv6
address in brackets; and within DNS's own length bounds, which the host parser does not apply.
A malformed _grant_ fails closed: it matches nothing, so nothing new is trusted. A malformed
**pin** fails open instead, and that asymmetry is why this is checked at decode rather than left
silently inert: `{ hostname: "api.example.com ", trust: { fingerprint } }` — one pasted trailing
space — would otherwise never match, so the pin contributes nothing, Chromium's ordinary verdict
stands, and the author believes the host is pinned.

Two differences from base, deliberate: a pin now also fires for the trailing-dot form of its
host — at base, a request to `example.com.` missed a rule for `example.com`, so appending a dot
was a pin bypass, and both sides now drop one trailing dot before comparing — and an IPv6
pattern matches whether the event's own hostname arrives bracketed or not, because
`Session.Certificate`'s event brackets one (`URL.hostname` does) while `App.CertificateError`'s
need not.

```ts
const Rule: Schema.Struct<{
    readonly hostname: Schema.String;
    readonly trust: Schema.Union<readonly [Schema.Literal<"system">, Schema.Literal<"always">, Schema.Struct<{
        readonly fingerprint: Schema.String;
    }>]>;
}>;
type Rule = typeof Rule.Type;
```

#### `Certificate.Rules`

```ts
const Rules: Schema.$Array<Schema.Struct<{
    readonly hostname: Schema.String;
    readonly trust: Schema.Union<readonly [Schema.Literal<"system">, Schema.Literal<"always">, Schema.Struct<{
        readonly fingerprint: Schema.String;
    }>]>;
}>>;
type Rules = typeof Rules.Type;
```

#### `Certificate.Trust`

How a host's certificate is judged: Chromium's verdict, unconditional trust, or one pinned fingerprint.

```ts
const Trust: Schema.Union<readonly [Schema.Literal<"system">, Schema.Literal<"always">, Schema.Struct<{
    readonly fingerprint: Schema.String;
}>]>;
type Trust = typeof Trust.Type;
```

### `ClientContext`

```ts
class ClientContext extends ClientContext_base {}
```

### `Clipboard`

#### `Clipboard.capability`

The whole clipboard surface as one capability: `Clipboard.native` in `sewed/main` carries the
format policy, `Capability.client` reaches it from a document, and `Testing.Clipboard.memory`
stands in for tests.

```ts
const capability: Capability.Capability<Rpc.Rpc<"clear", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"formats", Schema.Void, Schema.$Array<Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>>, typeof SewedError, never, never> | Rpc.Rpc<"read", Schema.Struct<{
    format: Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>;
}>, Schema.NullOr<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"text">;
    readonly text: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"html">;
    readonly html: Schema.String;
    readonly text: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"rtf">;
    readonly rtf: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"image">;
    readonly png: Binary.Bytes;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"bookmark">;
    readonly title: Schema.String;
    readonly url: Schema.String;
}>]>>, typeof SewedError, never, never> | Rpc.Rpc<"write", Schema.Struct<{
    content: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"text">;
        readonly text: Schema.String;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"html">;
        readonly html: Schema.String;
        readonly text: Schema.optionalKey<Schema.String>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"rtf">;
        readonly rtf: Schema.String;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"image">;
        readonly png: Binary.Bytes;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"bookmark">;
        readonly title: Schema.String;
        readonly url: Schema.String;
    }>]>;
}>, Schema.Void, typeof SewedError, never, never>, "sewed/binding/clipboard">;
```

#### `Clipboard.Content`

```ts
const Content: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"text">;
    readonly text: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"html">;
    readonly html: Schema.String;
    readonly text: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"rtf">;
    readonly rtf: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"image">;
    readonly png: Binary.Bytes;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"bookmark">;
    readonly title: Schema.String;
    readonly url: Schema.String;
}>]>;
type Content = typeof Content.Type;
```

#### `Clipboard.Format`

```ts
const Format: Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>;
type Format = typeof Format.Type;
```

#### `Clipboard.Png`

PNG bytes, checked by signature so malformed images never reach the clipboard.

A check is a runtime filter and rebuilds the same schema type, so naming that type here loses
nothing and keeps every protocol carrying this field readable.

```ts
const Png: Binary.Bytes;
```

#### `Clipboard.Policy`

Formats this capability may read and write; anything omitted is denied.

```ts
const Policy: Schema.Struct<{
    readonly read: Schema.$Array<Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>>;
    readonly write: Schema.$Array<Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>>;
}>;
type Policy = typeof Policy.Type;
```

#### `Clipboard.protocol`

```ts
const protocol: RpcGroup.RpcGroup<Rpc.Rpc<"clear", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"formats", Schema.Void, Schema.$Array<Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>>, typeof SewedError, never, never> | Rpc.Rpc<"read", Schema.Struct<{
    format: Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>;
}>, Schema.NullOr<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"text">;
    readonly text: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"html">;
    readonly html: Schema.String;
    readonly text: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"rtf">;
    readonly rtf: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"image">;
    readonly png: Binary.Bytes;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"bookmark">;
    readonly title: Schema.String;
    readonly url: Schema.String;
}>]>>, typeof SewedError, never, never> | Rpc.Rpc<"write", Schema.Struct<{
    content: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"text">;
        readonly text: Schema.String;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"html">;
        readonly html: Schema.String;
        readonly text: Schema.optionalKey<Schema.String>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"rtf">;
        readonly rtf: Schema.String;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"image">;
        readonly png: Binary.Bytes;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"bookmark">;
        readonly title: Schema.String;
        readonly url: Schema.String;
    }>]>;
}>, Schema.Void, typeof SewedError, never, never>>;
```

### `ContentTracing`

#### `ContentTracing.BufferUsage`

```ts
const BufferUsage: Schema.Struct<{
    readonly value: Schema.Finite;
    readonly percentage: Schema.Finite;
}>;
type BufferUsage = typeof BufferUsage.Type;
```

#### `ContentTracing.HeapProfiling`

Which processes record heap allocations into a trace, and how often they sample.

```ts
const HeapProfiling: Schema.Struct<{
    readonly mode: Schema.optionalKey<Schema.Literals<readonly ["all", "browser", "gpu", "minimal", "renderer-sampling", "all-renderers", "utility-sampling", "all-utilities", "utility-and-browser"]>>;
    /** Bytes between samples, on average. */
    readonly samplingRate: Schema.optionalKey<Schema.Int>;
}>;
type HeapProfiling = typeof HeapProfiling.Type;
```

#### `ContentTracing.Mode`

```ts
const Mode: Schema.Literals<readonly ["record-until-full", "record-continuously", "record-as-much-as-possible", "trace-to-console"]>;
type Mode = typeof Mode.Type;
```

#### `ContentTracing.Options`

```ts
const Options: Schema.Struct<{
    readonly included: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly excluded: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly mode: Schema.optionalKey<Schema.Literals<readonly ["record-until-full", "record-continuously", "record-as-much-as-possible", "trace-to-console"]>>;
    readonly bufferKb: Schema.optionalKey<Schema.Int>;
    readonly argumentFilter: Schema.optionalKey<Schema.Boolean>;
}>;
type Options = typeof Options.Type;
```

### `Cookie`

#### `Cookie.capability`

A session's cookies as one capability: `Cookies.native(session, policy)` in `sewed/main` carries
the origin policy for one acquired session, `Capability.client` reaches it from a document, and
`Testing.Cookies.memory` stands in for tests.

```ts
const capability: Capability.Capability<Rpc.Rpc<"changes", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly cookie: Schema.Struct<{
        readonly name: Schema.String;
        readonly value: Schema.String;
        readonly domain: Schema.optionalKey<Schema.String>;
        readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly secure: Schema.optionalKey<Schema.Boolean>;
        readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
        readonly session: Schema.optionalKey<Schema.Boolean>;
        readonly expirationDate: Schema.optionalKey<Schema.Finite>;
        readonly sameSite: Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>;
    }>;
    readonly cause: Schema.Literals<readonly ["inserted", "inserted-no-change-overwrite", "inserted-no-value-change-overwrite", "explicit", "overwrite", "expired", "evicted", "expired-overwrite"]>;
    readonly removed: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"flush", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"get", Schema.Struct<{
    filter: Schema.Struct<{
        readonly url: Schema.optionalKey<Schema.String>;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly domain: Schema.optionalKey<Schema.String>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly secure: Schema.optionalKey<Schema.Boolean>;
        readonly session: Schema.optionalKey<Schema.Boolean>;
        readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
    }>;
}>, Schema.$Array<Schema.Struct<{
    readonly name: Schema.String;
    readonly value: Schema.String;
    readonly domain: Schema.optionalKey<Schema.String>;
    readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
    readonly path: Schema.optionalKey<Schema.String>;
    readonly secure: Schema.optionalKey<Schema.Boolean>;
    readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
    readonly session: Schema.optionalKey<Schema.Boolean>;
    readonly expirationDate: Schema.optionalKey<Schema.Finite>;
    readonly sameSite: Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>;
}>>, typeof SewedError, never, never> | Rpc.Rpc<"remove", Schema.Struct<{
    url: Schema.String;
    name: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"set", Schema.Struct<{
    details: Schema.Struct<{
        readonly url: Schema.String;
        readonly name: Schema.String;
        readonly value: Schema.String;
        readonly domain: Schema.optionalKey<Schema.String>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly secure: Schema.optionalKey<Schema.Boolean>;
        readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
        readonly expirationDate: Schema.optionalKey<Schema.Finite>;
        readonly sameSite: Schema.optionalKey<Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>>;
    }>;
}>, Schema.Void, typeof SewedError, never, never>, "sewed/binding/cookies">;
```

#### `Cookie.Cause`

```ts
const Cause: Schema.Literals<readonly ["inserted", "inserted-no-change-overwrite", "inserted-no-value-change-overwrite", "explicit", "overwrite", "expired", "evicted", "expired-overwrite"]>;
type Cause = typeof Cause.Type;
```

#### `Cookie.Change`

```ts
const Change: Schema.Struct<{
    readonly cookie: Schema.Struct<{
        readonly name: Schema.String;
        readonly value: Schema.String;
        readonly domain: Schema.optionalKey<Schema.String>;
        readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly secure: Schema.optionalKey<Schema.Boolean>;
        readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
        readonly session: Schema.optionalKey<Schema.Boolean>;
        readonly expirationDate: Schema.optionalKey<Schema.Finite>;
        readonly sameSite: Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>;
    }>;
    readonly cause: Schema.Literals<readonly ["inserted", "inserted-no-change-overwrite", "inserted-no-value-change-overwrite", "explicit", "overwrite", "expired", "evicted", "expired-overwrite"]>;
    readonly removed: Schema.Boolean;
}>;
type Change = typeof Change.Type;
```

#### `Cookie.Cookie`

```ts
const Cookie: Schema.Struct<{
    readonly name: Schema.String;
    readonly value: Schema.String;
    readonly domain: Schema.optionalKey<Schema.String>;
    readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
    readonly path: Schema.optionalKey<Schema.String>;
    readonly secure: Schema.optionalKey<Schema.Boolean>;
    readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
    readonly session: Schema.optionalKey<Schema.Boolean>;
    readonly expirationDate: Schema.optionalKey<Schema.Finite>;
    readonly sameSite: Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>;
}>;
type Cookie = typeof Cookie.Type;
```

#### `Cookie.Details`

```ts
const Details: Schema.Struct<{
    readonly url: Schema.String;
    readonly name: Schema.String;
    readonly value: Schema.String;
    readonly domain: Schema.optionalKey<Schema.String>;
    readonly path: Schema.optionalKey<Schema.String>;
    readonly secure: Schema.optionalKey<Schema.Boolean>;
    readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
    readonly expirationDate: Schema.optionalKey<Schema.Finite>;
    readonly sameSite: Schema.optionalKey<Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>>;
}>;
type Details = typeof Details.Type;
```

#### `Cookie.Filter`

```ts
const Filter: Schema.Struct<{
    readonly url: Schema.optionalKey<Schema.String>;
    readonly name: Schema.optionalKey<Schema.String>;
    readonly domain: Schema.optionalKey<Schema.String>;
    readonly path: Schema.optionalKey<Schema.String>;
    readonly secure: Schema.optionalKey<Schema.Boolean>;
    readonly session: Schema.optionalKey<Schema.Boolean>;
    readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
}>;
type Filter = typeof Filter.Type;
```

#### `Cookie.Policy`

Origins this capability may read, write, and observe cookies for; nothing else is reachable.

```ts
const Policy: Schema.$Array<Schema.Struct<{
    readonly kind: Schema.Literal<"origin">;
    readonly origin: Schema.String;
}>>;
type Policy = typeof Policy.Type;
```

#### `Cookie.protocol`

```ts
const protocol: RpcGroup.RpcGroup<Rpc.Rpc<"changes", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly cookie: Schema.Struct<{
        readonly name: Schema.String;
        readonly value: Schema.String;
        readonly domain: Schema.optionalKey<Schema.String>;
        readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly secure: Schema.optionalKey<Schema.Boolean>;
        readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
        readonly session: Schema.optionalKey<Schema.Boolean>;
        readonly expirationDate: Schema.optionalKey<Schema.Finite>;
        readonly sameSite: Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>;
    }>;
    readonly cause: Schema.Literals<readonly ["inserted", "inserted-no-change-overwrite", "inserted-no-value-change-overwrite", "explicit", "overwrite", "expired", "evicted", "expired-overwrite"]>;
    readonly removed: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"flush", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"get", Schema.Struct<{
    filter: Schema.Struct<{
        readonly url: Schema.optionalKey<Schema.String>;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly domain: Schema.optionalKey<Schema.String>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly secure: Schema.optionalKey<Schema.Boolean>;
        readonly session: Schema.optionalKey<Schema.Boolean>;
        readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
    }>;
}>, Schema.$Array<Schema.Struct<{
    readonly name: Schema.String;
    readonly value: Schema.String;
    readonly domain: Schema.optionalKey<Schema.String>;
    readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
    readonly path: Schema.optionalKey<Schema.String>;
    readonly secure: Schema.optionalKey<Schema.Boolean>;
    readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
    readonly session: Schema.optionalKey<Schema.Boolean>;
    readonly expirationDate: Schema.optionalKey<Schema.Finite>;
    readonly sameSite: Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>;
}>>, typeof SewedError, never, never> | Rpc.Rpc<"remove", Schema.Struct<{
    url: Schema.String;
    name: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"set", Schema.Struct<{
    details: Schema.Struct<{
        readonly url: Schema.String;
        readonly name: Schema.String;
        readonly value: Schema.String;
        readonly domain: Schema.optionalKey<Schema.String>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly secure: Schema.optionalKey<Schema.Boolean>;
        readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
        readonly expirationDate: Schema.optionalKey<Schema.Finite>;
        readonly sameSite: Schema.optionalKey<Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>>;
    }>;
}>, Schema.Void, typeof SewedError, never, never>>;
```

#### `Cookie.SameSite`

```ts
const SameSite: Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>;
type SameSite = typeof SameSite.Type;
```

### `Decidables`

#### `Decidables.App`

```ts
const App: {
    /**
     * Asked before the application quits; a denial keeps it running. Nobody objecting allows the
     * quit, but a *broken* quit guard denies it: a decider that throws, dies, or answers off-schema
     * decided nothing, and quitting on the strength of that would lose whatever it was guarding.
     */
    Quit: Decision.Decidable<{}, "allow" | "deny", "async", "restrictive", "app">;
    /**
     * Asked when the last window closes. The fallback preserves today's platform default
     * (`options.quitOnLastWindowClosed ?? process.platform !== "darwin"`): a constant would silently
     * change macOS behavior, and a library-installed darwin decider would out-rank every consumer
     * decider under `first` composition, since it would install before any of them.
     */
    LastWindowClosed: Decision.Decidable<{}, "quit" | "stay", "sync", "first", "app">;
    /** Asked for each HTTP authentication challenge; without an answer the challenge is cancelled. */
    Login: Decision.Decidable<{
        readonly url: string;
        readonly isProxy: boolean;
        readonly scheme: string;
        readonly host: string;
        readonly port: number;
        readonly realm: string;
        readonly isRequestForNavigation: boolean;
    }, {
        readonly kind: "cancel";
    } | {
        readonly kind: "credentials";
        readonly username: string;
        readonly password: Redacted.Redacted<string>;
    }, "async", "first", "app">;
    /**
     * Asked for each TLS error; without an answer Chromium's rejection stands. The event carries only
     * what a trust decision needs from the presented certificate — see {@link Certificate.Presented}
     * — plus `hostname` (`URL.parse(url)?.hostname ?? ""` in `App.ts`'s builder), so `Certificate.Policy`
     * installs here the same way it installs on `Session.Certificate`.
     */
    CertificateError: Decision.Decidable<{
        readonly url: string;
        readonly hostname: string;
        readonly certificate: {
            readonly fingerprint: string;
            readonly subjectName: string;
            readonly issuerName: string;
            readonly validStart: number;
            readonly validExpiry: number;
        };
    }, "reject" | "trust", "async", "restrictive", "app">;
    /**
     * Asked when a server requests a client certificate, with the certificates the store offers.
     * `default` sends the store's first, which is what Electron does by itself and so the fallback;
     * `select` sends the one named by fingerprint, and `none` sends none. It composes restrictively,
     * `none` first, and a decider that fails sends none: a broken chooser must not present an
     * identity nobody chose. A fingerprint the request did not offer sends none.
     */
    ClientCertificate: Decision.Decidable<{
        readonly url: string;
        readonly certificates: readonly {
            readonly fingerprint: string;
            readonly subjectName: string;
            readonly issuerName: string;
            readonly validStart: number;
            readonly validExpiry: number;
        }[];
    }, {
        readonly kind: "default";
    } | {
        readonly kind: "none";
    } | {
        readonly kind: "select";
        readonly fingerprint: string;
    }, "async", "restrictive", "app">;
    /**
     * Asked when a client certificate store needs the password of a token to answer a request, on
     * Linux. Without an answer, and when a decider fails, the request goes on without a password.
     */
    ClientCertificatePassword: Decision.Decidable<{
        readonly hostname: string;
        readonly tokenName: string;
        readonly isRetry: boolean;
    }, {
        readonly kind: "cancel";
    } | {
        readonly kind: "password";
        readonly password: Redacted.Redacted<string>;
    }, "async", "first", "app">;
};
```

#### `Decidables.Session`

```ts
const Session: {
    /**
     * Asked for each permission check or request, and for each HID, serial, or USB device check,
     * which shares this same decidable: `name` is the permission or device type Electron reports.
     * `document` is the requesting document's key for a permission check, and `null` for a device
     * check, which Electron identifies by origin only — `allowed`/`deviceAllowed` in
     * `internal/Session.ts` compute both fields, gated on the same main-frame, same-document, and
     * origin checks the old rule engine made unconditionally. `document: null` makes a decider that has
     * not handled the device case a compile error at the first `document.startsWith(...)` it writes,
     * rather than a same-shaped string that silently widens a document-scoped grant to the whole
     * origin — the same reasoning applies to `origin`, one level down: `URL.origin` is the literal
     * string `"null"`, not the value `null`, for `file:`, `data:`, and any other opaque-origin
     * document, so `file:///a.html` and `file:///b.html` would otherwise reach a decider with the
     * identical, non-identifying `origin: "null"`. `origin: null` here means exactly that — the
     * document has no origin to grant by — so a decider must key an opaque document by `document`
     * instead; a `document`-keyed grant is unaffected, since `document` stays exact for every request.
     *
     * `mediaTypes` names which of `audio`/`video` a `media` request actually asks for: Electron's
     * request handler reports the array `MediaAccessPermissionRequest.mediaTypes` carries, and its
     * check handler — consulted once per requested type, probed on Linux — reports its own singular
     * `mediaType` as a one-element list. Every other permission, and a check whose `mediaType` is
     * `unknown` or absent, carries an empty list: `mediaTypes` only says which media types a request
     * asks for once `name` already says `"media"`; it never distinguishes a media request from any
     * other.
     * The fallback denies.
     */
    Permission: Decision.Decidable<{
        readonly name: string;
        readonly origin: string | null;
        readonly document: string | null;
        readonly mediaTypes: readonly ("audio" | "video")[];
    }, "allow" | "deny", "sync", "restrictive", "session">;
    /**
     * Asked for each of the renderer's speculative preconnections; the fallback allows them, matching
     * a session's previous default. A failing decider denies instead, which costs a preconnection's
     * latency and nothing else.
     */
    Preconnect: Decision.Decidable<{
        readonly url: string;
    }, "allow" | "deny", "sync", "restrictive", "session">;
    /**
     * Asked for each server certificate verification; without an answer Chromium's own verdict stands.
     * A decider that *fails* rejects instead: a broken fingerprint pin must not silently become no pin
     * by deferring to the CA validity the pin exists to distrust. `trust`, `reject`, and `system` map
     * onto `setCertificateVerifyProc`'s numeric `0`, `-2`, and `-3` — see `internal/Session.ts`.
     */
    Certificate: Decision.Decidable<{
        readonly hostname: string;
        readonly certificate: {
            readonly fingerprint: string;
            readonly subjectName: string;
            readonly issuerName: string;
            readonly validStart: number;
            readonly validExpiry: number;
        };
    }, "reject" | "system" | "trust", "async", "restrictive", "session">;
    /**
     * Asked for each screen-share request; without an answer, or when a decider fails, it is denied.
     * `order`'s two entries are `DesktopCapturer.Decision`'s own discriminants — it has no `"grant"`
     * member.
     */
    DisplayMedia: Decision.Decidable<{
        readonly origin: string | null;
        readonly videoRequested: boolean;
        readonly audioRequested: boolean;
        readonly userGesture: boolean;
    }, {
        readonly kind: "deny";
    } | {
        readonly kind: "source";
        readonly id: string;
        readonly audio?: "loopback" | "loopbackWithMute";
    }, "async", "restrictive", "session">;
    /**
     * Asked when a page uses the File System Access API on a file or directory Chromium treats as
     * sensitive, such as the home directory. `allow` gives the page the path, `tryAgain` reopens the
     * picker, and `deny` refuses. Without an answer, and when a decider fails, the path is denied.
     */
    FileSystemAccess: Decision.Decidable<{
        readonly origin: string | null;
        readonly document: string | null;
        readonly path: string;
        readonly isDirectory: boolean;
    }, "allow" | "deny" | "tryAgain", "async", "restrictive", "session">;
    /**
     * Asked when a page calls `navigator.hid.requestDevice`, with the devices that match its filters.
     * Without an answer the request is cancelled, which is also what Electron does with no listener;
     * a selected id the request did not offer cancels it too. The native listener exists only while a
     * decider is installed. Whether the page may then use the device is still
     * {@link Session.Permission}'s to say.
     */
    HidDevice: Decision.Decidable<{
        readonly origin: string | null;
        readonly document: string | null;
        readonly devices: readonly {
            readonly deviceId: string;
            readonly name: string;
            readonly vendorId: number;
            readonly productId: number;
            readonly serialNumber?: string;
            readonly guid?: string;
        }[];
    }, {
        readonly kind: "cancel";
    } | {
        readonly kind: "select";
        readonly id: string;
    }, "async", "first", "session">;
    /** Asked when a page calls `navigator.usb.requestDevice`; behaves as {@link Session.HidDevice}. */
    UsbDevice: Decision.Decidable<{
        readonly origin: string | null;
        readonly document: string | null;
        readonly devices: readonly {
            readonly deviceId: string;
            readonly vendorId: number;
            readonly productId: number;
            readonly deviceClass: number;
            readonly deviceSubclass: number;
            readonly deviceProtocol: number;
            readonly productName?: string;
            readonly manufacturerName?: string;
            readonly serialNumber?: string;
        }[];
    }, {
        readonly kind: "cancel";
    } | {
        readonly kind: "select";
        readonly id: string;
    }, "async", "first", "session">;
    /**
     * Asked when a page calls `navigator.serial.requestPort`; behaves as {@link Session.HidDevice}.
     * Electron names the requesting web contents rather than a frame, so `origin` and `document` are
     * its top-level document's.
     */
    SerialPort: Decision.Decidable<{
        readonly origin: string | null;
        readonly document: string | null;
        readonly ports: readonly {
            readonly portId: string;
            readonly portName: string;
            readonly displayName?: string;
            readonly vendorId?: string;
            readonly productId?: string;
            readonly serialNumber?: string;
        }[];
    }, {
        readonly kind: "cancel";
    } | {
        readonly kind: "select";
        readonly id: string;
    }, "async", "first", "session">;
    /**
     * Asked when `navigator.credentials.get()` finds several discoverable WebAuthn credentials and
     * one must be chosen. Without an answer the request is cancelled and the page receives a
     * `NotAllowedError`; a credential id the request did not offer cancels it too.
     */
    WebAuthnAccount: Decision.Decidable<{
        readonly origin: string | null;
        readonly document: string | null;
        readonly relyingPartyId: string;
        readonly accounts: readonly {
            readonly credentialId: string;
            readonly name?: string;
            readonly displayName?: string;
            readonly userHandle?: string;
        }[];
    }, {
        readonly kind: "cancel";
    } | {
        readonly kind: "select";
        readonly id: string;
    }, "async", "first", "session">;
    /**
     * Asked when a Bluetooth device needs confirmation or a pin before it pairs, on Linux and Windows;
     * macOS pairs by itself and never asks. Without an answer the pairing is cancelled, and so is an
     * answer of the wrong kind for its prompt.
     */
    BluetoothPairing: Decision.Decidable<{
        readonly origin: string | null;
        readonly document: string | null;
        readonly deviceId: string;
        readonly kind: "confirm" | "confirmPin" | "providePin";
        readonly pin?: string;
    }, {
        readonly kind: "cancel";
    } | {
        readonly kind: "confirm";
    } | {
        readonly kind: "pin";
        readonly pin: string;
    }, "async", "first", "session">;
    /**
     * Asked before each request the filter selects leaves the session. Nobody objecting allows it,
     * and a *broken* decider blocks it: a tracker gate that throws has not established that the
     * request is safe to make, and a filter narrow enough to be worth installing is narrow enough
     * that failing its requests closed costs one feature rather than the application.
     *
     * `body` on this stage's filter is what makes `body` reach a decider here eagerly, capped in
     * bytes and assembled per install — see `session.intercept`. The event's own `readBody(options?)`
     * assembles lazily instead, under the options given or the install's own `body` filter when it
     * named one, so an install over `<all_urls>` pays for a body only on the request whose decider
     * asks. This is the only one of the three stages that carries upload data at all, and the other
     * two refuse a filter that asks for it — and so have no `readBody` on their own events.
     *
     * A decider that *fails* blocks; a decider that never **settles** leaves its request unanswered,
     * and the page waits. Liveness is the decider's own, and closing the installing scope does not
     * release a request already in flight: bound a decider that can wait on anything with
     * `Effect.timeout`, and let the timeout fail so it blocks.
     */
    Request: Decision.Decidable<{
        readonly id: number;
        readonly url: string;
        readonly method: string;
        readonly resourceType: "cspReport" | "font" | "image" | "mainFrame" | "media" | "object" | "other" | "ping" | "script" | "stylesheet" | "subFrame" | "webSocket" | "xhr";
        readonly referrer: string;
        readonly timestamp: number;
        readonly webContentsId?: number;
        readonly sourceId?: string;
        readonly body?: {
            readonly parts: readonly ({
                readonly kind: "bytes";
                readonly bytes: Uint8Array<ArrayBufferLike>;
            } | {
                readonly kind: "file";
                readonly path: string;
                readonly offset?: number;
                readonly length?: number;
                readonly modificationTime?: number;
            } | {
                readonly kind: "blob";
                readonly id: string;
                readonly bytes?: Uint8Array<ArrayBufferLike>;
            })[];
            readonly bytes: number;
            readonly truncated: boolean;
        };
        readonly readBody: WebRequest.ReadBody;
    }, {
        readonly kind: "allow";
    } | {
        readonly kind: "block";
    } | {
        readonly kind: "redirect";
        readonly url: string;
    }, "async", "restrictive", "requests">;
    /**
     * Asked before the request headers are sent, and it **chains** rather than ranks: each decider is
     * handed the headers the previous one produced, so one feature adding an authorization header and
     * another adding a trace header both land. A ranking cannot express that — two `headers` answers
     * rank equal, so the first-installed would win and the second feature's headers would silently
     * vanish, which is Electron's own single-listener clobbering reintroduced one level up. A `block`
     * from any decider ends the chain and cancels the request, later deciders unconsulted, and a
     * broken decider contributes that same `block`.
     *
     * A decider that *fails* blocks; a decider that never **settles** leaves its request unanswered,
     * and the page waits. Liveness is the decider's own, and closing the installing scope does not
     * release a request already in flight: bound a decider that can wait on anything with
     * `Effect.timeout`, and let the timeout fail so it blocks.
     */
    RequestHeaders: Decision.Decidable<{
        readonly id: number;
        readonly url: string;
        readonly method: string;
        readonly resourceType: "cspReport" | "font" | "image" | "mainFrame" | "media" | "object" | "other" | "ping" | "script" | "stylesheet" | "subFrame" | "webSocket" | "xhr";
        readonly referrer: string;
        readonly timestamp: number;
        readonly webContentsId?: number;
        readonly sourceId?: string;
        readonly headers: {
            readonly [x: string]: string;
        };
    }, {
        readonly kind: "allow";
    } | {
        readonly kind: "block";
    } | {
        readonly kind: "headers";
        readonly headers: {
            readonly [x: string]: string;
        };
    }, "async", "chain", "requests">;
    /**
     * Asked when the response headers arrive, chaining exactly as {@link RequestHeaders} does. Its
     * `advance` spreads `statusLine` back only when the answer carried one, so a status line set by
     * one decider survives a later decider that rewrites headers alone — the cumulative `statusLine`
     * the hand-rolled listener this replaces tracked by hand.
     *
     * A decider that *fails* blocks; a decider that never **settles** leaves its request unanswered,
     * and the page waits. Liveness is the decider's own, and closing the installing scope does not
     * release a request already in flight: bound a decider that can wait on anything with
     * `Effect.timeout`, and let the timeout fail so it blocks.
     */
    ResponseHeaders: Decision.Decidable<{
        readonly id: number;
        readonly url: string;
        readonly method: string;
        readonly resourceType: "cspReport" | "font" | "image" | "mainFrame" | "media" | "object" | "other" | "ping" | "script" | "stylesheet" | "subFrame" | "webSocket" | "xhr";
        readonly referrer: string;
        readonly timestamp: number;
        readonly webContentsId?: number;
        readonly sourceId?: string;
        readonly statusLine: string;
        readonly statusCode: number;
        readonly headers: {
            readonly [x: string]: readonly string[];
        };
    }, {
        readonly kind: "allow";
    } | {
        readonly kind: "block";
    } | {
        readonly kind: "headers";
        readonly headers: {
            readonly [x: string]: readonly string[];
        };
        readonly statusLine?: string;
    }, "async", "chain", "requests">;
};
```

#### `Decidables.WebContents`

```ts
const WebContents: {
    /**
     * Asked for each main-frame navigation or redirect the page starts. `kind` also admits
     * `"webview"` in its type, reserved for the day webview attachment becomes decidable — nothing
     * dispatches that kind today: webview attach is denied unconditionally and never resolves this
     * decidable.
     */
    Navigation: Decision.Decidable<{
        readonly url: string;
        readonly kind: "navigation" | "redirect" | "webview";
    }, "allow" | "deny", "sync", "restrictive", "contents">;
    /** Asked when the page requests a new window; without an answer the popup is denied. */
    Popup: Decision.Decidable<{
        readonly url: string;
    }, "allow" | "deny", "sync", "restrictive", "contents">;
    /** Asked when the page sets its title; the fallback keeps whatever title main last set. */
    TitleUpdate: Decision.Decidable<{
        readonly title: string;
    }, "accept" | "keep", "sync", "first", "contents">;
    /** Asked when the page tries to prevent its own unload; the fallback honors the page's request. */
    Unload: Decision.Decidable<{
        readonly url: string;
    }, "honor" | "override", "sync", "first", "contents">;
    /**
     * Asked for each keyboard or mouse event; without an answer input reaches the page. Deliberately
     * declares no `failure`, unlike the guards that close a window or quit the application: its closed
     * answer is `block`, asked of every keystroke and every click, so a buggy input decider that
     * contributed it would brick the application. A failing decider here contributes the fallback and
     * input keeps reaching the page — the one place in this catalog where a broken decider is the
     * lesser hazard.
     */
    Input: Decision.Decidable<{
        readonly kind: "key" | "mouse";
    }, "allow" | "block", "sync", "restrictive", "contents">;
    /**
     * Asked for each download a document starts. The catalog fallback is `deny`, the safe end for any
     * owner that declares nothing; a guest's own registry keeps it, and a plain web contents' registry
     * overrides it to `prompt` — see `internal/GuestView.ts` and `internal/WebContents.ts`, where each
     * owner's `Registry.make({ fallbacks })` makes its own posture visible at its construction site.
     *
     * The failure is declared rather than left to that fallback, which is what makes this decidable
     * unlike the other two-posture cases: an undeclared failure *is* the effective fallback, per-owner
     * override included, so on a window a decider that throws, dies, or answers off-schema would
     * contribute `prompt` and hand the file to Electron's save dialog. A download guard that vets a
     * file and crashes has established nothing about that file, on either owner — the same reasoning
     * `Window.Close` and `App.Quit` declare a failure for, on the one decidable whose fallback is not
     * the same answer for everyone who resolves it.
     */
    Download: Decision.Decidable<{
        readonly url: string;
        readonly filename: string;
        readonly mimeType: string;
        readonly totalBytes: number;
        readonly sourceId: string;
        readonly urlChain: readonly string[];
        readonly userGesture: boolean;
        readonly contentDisposition: string;
    }, {
        readonly kind: "deny";
    } | {
        readonly kind: "save";
        readonly path: string;
    } | {
        readonly kind: "prompt";
        readonly dialog?: {
            readonly title?: string;
            readonly defaultPath?: string;
            readonly buttonLabel?: string;
            readonly filters?: readonly [{
                readonly name: string;
                readonly extensions: readonly [string, ...string[]];
            }, ...{
                readonly name: string;
                readonly extensions: readonly [string, ...string[]];
            }[]];
            readonly properties?: readonly ("createDirectory" | "dontAddToRecent" | "showHiddenFiles" | "showOverwriteConfirmation" | "treatPackageAsDirectory")[];
        };
    }, "sync", "restrictive", "contents">;
    /**
     * Asked each time a page's `navigator.bluetooth.requestDevice` scan reports the devices found so
     * far. `select` gives the page one of them, `cancel` ends the request, and `wait` keeps scanning:
     * the next report asks again, and interrupts a decider still deciding on the older list. Without
     * an answer the request is cancelled, which is also what Electron does with no listener; the
     * native listener exists only while a decider is installed.
     */
    BluetoothDevice: Decision.Decidable<{
        readonly origin: string | null;
        readonly document: string | null;
        readonly devices: readonly {
            readonly deviceId: string;
            readonly deviceName: string;
        }[];
    }, {
        readonly kind: "cancel";
    } | {
        readonly kind: "select";
        readonly id: string;
    } | {
        readonly kind: "wait";
    }, "async", "first", "contents">;
};
```

#### `Decidables.Window`

```ts
const Window: {
    /**
     * Asked before a window closes; a denial keeps it open. The decider sees which window. Nobody
     * objecting closes the window, but a *broken* guard keeps it open: an unsaved-changes decider that
     * throws has not established that there is nothing to lose.
     */
    Close: Decision.Decidable<{
        readonly windowId: string;
    }, "allow" | "deny", "async", "restrictive", "window">;
    /**
     * Asked on Windows when the user's session is about to end (shutdown, restart or log off) and
     * the system asks each window whether it may. A denial asks the system to wait, which it shows
     * the user and may override. Nobody objecting allows it.
     */
    SessionEnd: Decision.Decidable<{
        readonly windowId: string;
        readonly reasons: readonly ("close-app" | "critical" | "logoff" | "shutdown")[];
    }, "allow" | "deny", "sync", "restrictive", "window">;
};
```

### `Decision`

#### `Decision.async`

A decider for a decidable whose answer may arrive later. See {@link sync} for why this is a single signature.

```ts
const async: <Event, Answer, R>(decide: (event: Event) => Effect.Effect<Answer | Pass, never, R>) => Async<Event, Answer, R>;
```

#### `Decision.Async`

```ts
interface Async<Event, Answer, R> {
  readonly _tag: "async";
  readonly decide: (event: Event) => Effect.Effect<Answer | Pass, never, R>;
}
```

#### `Decision.Chain`

How a `chain` decidable folds: which answers end it, and what the next decider sees.

`advance` is the library's own code, not a decider's — it is declared beside the event, where the
shape of both the event and the answer is known, so it is the one place that knows how to put an
answer back into an event.

```ts
interface Chain<Event, Answer> {
  /** Discriminants that end the chain with that answer, leaving later deciders unconsulted. */
  readonly stop: readonly DiscriminantOf<Answer>[];
  /** What the next decider sees, given what this one answered. */
  readonly advance: (event: Event, answer: Answer) => Event;
}
```

#### `Decision.ChainOutcome`

What a `chain` resolution produced: an answer that stopped it, or the event it folded to.

```ts
type ChainOutcome<Event, Answer> =
  | {
      readonly kind: "stopped";
      readonly answer: Answer;
    }
  | {
      readonly kind: "completed";
      readonly event: Event;
    };
```

#### `Decision.Composition`

How a decidable's deciders combine, declared where the event is rather than decided by whoever
resolves it:

- `first` keeps the earliest non-{@link Pass} answer, which is install order.
- `restrictive` ranks every answer by {@link DecidableOptions.order} and keeps the best-ranked, so
  no decider can widen another's denial.
- `chain` is a fold rather than a ranking: each decider sees the event the previous one produced,
  and an answer in {@link Chain.stop} ends the resolution. Header rewriting is the case a ranking
  cannot express — two `headers` answers rank equal, so one feature's headers would silently
  vanish, which is Electron's own single-listener clobbering reintroduced one level up.

```ts
type Composition = "first" | "restrictive" | "chain";
```

#### `Decision.decidable`

Declares a decidable native event. The declaration is inert: it installs nothing and creates no
native object. It does validate itself, and fails `Protocol` rather than let a broken decidable
reach installation:

- `owner` must be an {@link OwnerKind}. The type says so, so this is for a caller who is not
  compiling against it — a `.mjs` fixture, a JavaScript consumer — and the refusal names the
  kinds there are, which is the JavaScript half of the `TS2820 Did you mean '"window"'?` a
  misspelling gets in TypeScript.
- `key` must carry its own owner's prefix (`internal/OwnerKind.ts`). Every shipped key already
  spells its owner — `"window/close"`, `"contents/navigation"` — and that convention is now what
  a reader of a diagnostic goes by, so this is what stops the two drifting apart: a decidable
  declared `owner: "contents"` under a `window/` key would read as a window's in every log and
  refuse every window install.
- A restrictive decidable must declare the order its answers rank in, because "most restrictive"
  is data rather than a convention.
- Any other composition must not declare an order: `first` means the earliest non-`Pass` answer
  wins and `chain` folds rather than ranks, so an order would have no meaning in either, and
  honoring it as a filter would blur compositions that are deliberately distinct.
- `order`, when declared, cannot repeat an entry.
- A `chain` decidable must declare its `chain`, and only a `chain` decidable may: the fold is what
  the composition _is_, and a `chain` block anywhere else is data nothing reads.
- A `chain` decidable must be `"async"`. Nothing needs a synchronous fold, so no synchronous fold
  is built, and a `"sync"` one would otherwise declare cleanly and never be resolvable.
- `chain.stop`, like `order`, cannot repeat an entry.
- `fallback` must decode against `answer` — it is what a registry answers when no candidate is
  eligible, and, absent a declared `failure`, it is also what each broken decider contributes, so
  an invalid one is the least acceptable place for a typo to hide.
- Under restrictive composition, `fallback`'s own discriminant must appear in `order`, or nothing
  a decider could ever return would rank below it.
- `failure`, when declared, is validated exactly as `fallback` is, for the same reasons: it
  decodes against `answer`, and under restrictive composition its discriminant must appear in
  `order` — an unrankable failure would be filtered out and a broken decider would contribute
  nothing, which is the hole the whole field exists to close.
- A `first` decidable must not declare a `failure`: there a broken decider contributes nothing, so
  the field would read as if it mattered while changing nothing.

The returned decidable is frozen, and `order` and `chain` are copied, so a caller cannot change
resolution for every registry by mutating the object it declared.

Declaring one of your own works, and is for a test against a `sewed/testing` stand-in rather than
for production: nothing outside `Decidables` has a native event behind it. A decidable you
declare naming an existing owner kind installs on a real owner cleanly and is never consulted,
because every native listener in the library resolves a catalog decidable by name — a session's
`intercept` is the one door that refuses one outright. `Testing.owner` and `Testing.contents`
install and answer one; `Testing.requests` refuses it, because its door is that same production
`intercept`.

An already-declared decidable is refused rather than re-declared: a registry keys its deciders by
decidable identity, so a second declaration would answer with the same `key` while being invisible
to every decider installed on the first. The optional `never` brand on the parameter is what makes
that a type error instead of a decidable that silently decides nothing.

```ts
const decidable: <Event, Answer, Timing extends "sync" | "async", C extends Composition, O extends OwnerKind>(options: DecidableOptions<Event, Answer, Timing, C, O> & {
    readonly [decidableIdentity]?: never;
}) => Decidable<Event, Answer, Timing, C, O>;
```

#### `Decision.Decidable`

A declared decidable: what {@link decidable} returns, and the only thing a registry installs on or
resolves. It is deliberately not the type a caller writes.

- The brand is why. It makes a decidable impossible to _assemble_: an object literal satisfies
  {@link DecidableOptions} structurally, and without the brand it would install and resolve while
  having skipped every check `decidable` makes — an unvalidated fallback included, which is what
  resolution answers with when no decider does. The limit of that: a spread of a declared
  decidable carries the brand along, so overriding a field of one produces a decidable the type
  still accepts and the checks never saw. Fabrication is what this prevents; sabotage is not.
- `decodeAnswer` is the `answer` schema's decoder, built once at declaration with `Answer` fully
  in scope. Resolution decodes every candidate through it, inside Electron's own callback for a
  `"sync"` decidable, so building it per resolution would be work done in the worst place for it;
  and because it is built where `Answer` is known, neither resolution nor this type needs a cast
  to recover what the schema decodes to.

`C` defaults to everything _except_ `"chain"`, which is what keeps a chain decidable out of every
resolver and helper that cannot fold one — `resolveSync`, `resolveAsync`, `Registry.fallback`,
`internal/CloseGate.ts` — with no edit to any of them, while the install doors that must accept
every composition say so by naming {@link Composition} explicitly.

`O` defaults to all of {@link OwnerKind} for the same kind of reason, one parameter over: every
internal that means "any decidable, whoever owns it" — the three resolutions, `Registry.fallback`,
`Registry.hook`, `internal/CloseGate.ts` — keeps its existing `Decidable<Event, Answer, Timing>`
spelling and keeps accepting every decidable, because a declared `"window"` decidable is
assignable to one whose owner is the whole union. The install doors, which must accept _one_
owner's decidables and refuse the rest, are the ones that name `O` explicitly.

```ts
interface Decidable<
  Event,
  Answer,
  Timing extends "sync" | "async",
  C extends Composition = "first" | "restrictive",
  O extends OwnerKind = OwnerKind,
> extends DecidableOptions<Event, Answer, Timing, C, O> {
  readonly [decidableIdentity]: true;
  readonly decodeAnswer: (candidate: unknown) => Answer;
}
```

#### `Decision.DecidableOptions`

What {@link decidable} is declared with.

`event` and `answer` are `Schema.Codec`, not the more general `Schema.Schema`: a decidable is
decoded synchronously (`resolveSync`, and every declaration-time check below), which requires a
schema that needs no decoding services. `Schema.Codec` defaults its `Encoded` type to `Type`, so a
transforming codec (`Schema.NumberFromString`, `Schema.DateFromString`, ...) is a declaration-time
type error here — describe the decoded shape directly instead.

```ts
interface DecidableOptions<
  Event,
  Answer,
  Timing extends "sync" | "async",
  C extends Composition,
  O extends OwnerKind,
> {
  readonly key: string;
  /**
   * The owner that resolves this event, and so the only owner a decider for it installs on — see
   * {@link OwnerKind}. It must agree with `key`'s own prefix, which {@link decidable} checks.
   */
  readonly owner: O;
  readonly event: Schema.Codec<Event>;
  readonly answer: Schema.Codec<Answer>;
  /**
   * What a resolution answers when *nobody has an opinion*: no decider is installed, or every one
   * of them {@link Pass}es. An owner may override it for its own registry — see
   * `internal/DecisionRegistry.ts`'s `fallback`.
   *
   * `NoInfer`d so `Answer` is fixed by `answer` alone: without it, a `fallback` outside `answer`'s
   * type would still type-check, because a type parameter shared by two properties infers to the
   * union of both instead of requiring them equal.
   */
  readonly fallback: NoInfer<Answer>;
  /**
   * What a *broken* decider contributes: one that throws, dies, or answers something this
   * decidable's own `answer` schema rejects. Defaults to the effective fallback — the owner's
   * override included — so leaving it undeclared changes nothing.
   *
   * Separate from `fallback` because the two jobs only coincide when the fallback is the closed
   * answer. A `Window.Close` whose fallback is `"allow"` (nobody objects, so the window closes) must
   * not let a crashing unsaved-changes guard close that same window; declaring `failure: "deny"` is
   * what says so at the event, where a reader of the decidable can see it. Refused on a `first`
   * decidable, where a failing decider contributes nothing and this would be dead data.
   */
  readonly failure?: NoInfer<Answer>;
  readonly timing: Timing;
  readonly composition: C;
  /**
   * Discriminant values, most restrictive first. Required when composition is "restrictive", and
   * refused on any other, since only a ranking has anything to rank. Typed against `Answer`'s own
   * discriminants ({@link DiscriminantOf}) rather than a bare string, so a misspelled entry is a
   * compile error rather than a candidate that silently never wins.
   *
   * `NoInfer`d for the same reason `fallback` is, and proven differential rather than kept for
   * symmetry: for a bare string-literal `Answer`, `DiscriminantOf<Answer>` alone — `Answer` still
   * inferred from `order` too — lets a misspelled entry widen `Answer` to admit itself instead of
   * being checked against it, silently defeating the whole point; pinned in `decision-types.ts`. A
   * `kind`-tagged `Answer` happens to still catch the same typo without `NoInfer` (its wider object
   * shape does not admit a stray string literal into the union the same way), which is exactly the
   * kind of shape-dependent gap `NoInfer<Event>`'s own history in `CloseGate.ts` already warns about.
   */
  readonly order?: readonly DiscriminantOf<NoInfer<Answer>>[];
  /**
   * How a `chain` decidable folds. Required when composition is "chain", and refused on any other.
   * `NoInfer`d on both parameters for the same reason `fallback` and `order` are — and this is what
   * lets `advance` be written unannotated: `Event` and `Answer` are fixed by the sibling schemas, so
   * both its parameters arrive already typed, and a misspelled discriminant inside its body is a
   * compile error rather than a branch that never runs.
   */
  readonly chain?: Chain<NoInfer<Event>, NoInfer<Answer>>;
}
```

#### `Decision.Decider`

```ts
type Decider<Event, Answer, R = never> = Sync<Event, Answer> | Async<Event, Answer, R>;
```

#### `Decision.DeciderFor`

A decider whose timing fits the decidable it is installed on. A `"sync"` decidable refuses an
async decider outright: the answer is required inside Electron's own callback, which cannot wait,
so a decider that might suspend could never honor it. That is a type error rather than a runtime
one — the registry's synchronous resolution is written so it can never meet an async decider.

`Timing` is tuple-wrapped so the conditional does not distribute, and the test is for `"async"`
rather than `"sync"` so that anything less specific than `"async"` lands on the synchronous side.
Both halves are load-bearing: `timing` is a covariant `readonly` property, so a `"sync"` decidable
widens to `Decidable<Event, Answer, "sync" | "async">` with no cast, and a distributing conditional
would evaluate at each member and union the results — `Sync | Decider`, which admits exactly the
async decider `resolveSync` would then meet inside a native callback.

```ts
type DeciderFor<Event, Answer, Timing extends "sync" | "async", R = never> = [Timing] extends [
  "async",
]
  ? Decider<Event, Answer, R>
  : Sync<Event, Answer>;
```

#### `Decision.definePolicy`

Declares a policy: rule data plus the compile that turns it into a decider. `compile`'s own `rules`
parameter is `NoInfer`d against the `rules` schema so a policy's `Rules` type is fixed by its schema
alone — the same idiom `DecidableOptions.fallback` uses against `answer`, for the same reason: a
type parameter shared by two properties would otherwise infer to the union of both instead of
requiring them equal. The declaration is inert like {@link decidable}'s: nothing is installed until
{@link policy} compiles it against rule data and a caller installs the result.

```ts
const definePolicy: <Rules, Event, Answer>(options: {
    readonly rules: Schema.Codec<Rules>;
    readonly compile: (rules: NoInfer<Rules>) => (event: Event) => Answer | Pass;
}) => Policy<Rules, Event, Answer>;
```

#### `Decision.DiscriminantOf`

The discriminant a value of `Answer` ranks by under restrictive composition: a bare literal answer
is its own discriminant, and a `kind`-tagged answer's is its `kind`. Mirrors the same two shapes,
in the same order, as `internal/Discriminant.ts`'s runtime `discriminantOf`. Deliberately not the
outer `Answer` itself: without this, `order` typed as bare `readonly string[]` accepted any
string, so a transposed character (`"blcok"` for `"block"`) compiled, constructed, and silently
ranked `Infinity` — never winning, on the composition whose entire purpose is that a denial cannot
be lost. Under this type, that same typo is `TS2820` at the declaration site instead.

This does not mean the type and the runtime can never drift apart. `order`'s own use of this type
wraps it in `NoInfer` (see `DecidableOptions.order`), and a distributive conditional does not
distribute under `NoInfer` — so for an `Answer` that mixes string literals with `kind`-tagged
members (`Certificate.Trust`, for one: `"system" | "always" | { fingerprint: string }`),
`DiscriminantOf<NoInfer<Answer>>` measures as `never` even though `discriminantOf` reads a real
discriminant off `"system"` or `"always"` at runtime. That is fail-closed, not broken: a decidable
whose answer mixes the two discriminant shapes cannot declare an `order` under this type at all,
which is a real, load-bearing limit worth hitting at the declaration site rather than a bug to
work around by reaching for `readonly string[]` again.

```ts
type DiscriminantOf<Answer> = Answer extends string
  ? Answer
  : Answer extends {
        readonly kind: infer Kind extends string;
      }
    ? Kind
    : never;
```

#### `Decision.fromRead`

A synchronous decider that answers from a plain read, evaluated fresh at decision time — beside
{@link fromState}, for a consumer whose current value lives somewhere other than a
`SubscriptionRef` (a mutable closure, a ref cell a framework already owns, a getter over derived
state). `read` runs inside Electron's own callback exactly as `fromState`'s `SubscriptionRef.get`
does, so it must be synchronous and current, never a stale snapshot captured once at installation.

```ts
const fromRead: <S, Event, Answer>(read: () => S, decide: (state: S, event: Event) => Answer | Pass) => Sync<Event, Answer>;
```

#### `Decision.fromState`

A synchronous decider that answers from main-owned state. The read is atomic and current at the
callback: a synchronous decider cannot wait for an update that has not been applied, because
Electron requires the answer inside its callback.

```ts
const fromState: <S, Event, Answer>(state: SubscriptionRef.SubscriptionRef<S>, decide: (state: S, event: Event) => Answer | Pass) => Sync<Event, Answer>;
```

#### `Decision.Owner`

What an owner exposes so a caller can decide the owner's events. Every owner in this wave
implements it with the builder in `internal/DecisionRegistry.ts`.

The install lives for the caller's scope and removes itself when that scope closes: a decider is
not consulted by any resolution that _begins_ after its scope closes, which is the property the
shapes this replaces lack. That is narrower than "cannot outlive the code that installed it" — a
resolution already in flight when the scope closes is unaffected by the removal and still completes
with every decider installed when it began, this one included, because the registry resolves
against a snapshot of its entries taken at the start of each resolution, not against the live list.
Installing on an owner that has already closed fails `Closed` rather than registering a decider
nothing will ever consult. An asynchronous decider's services reach the returned Effect's
requirements, because the owner runs that decider later, with the context its installer had.
`Scope` is the one service it does not inherit: a decider that acquires something scoped gets a
fresh scope per _decision_, released when that decision completes, fails, or is interrupted, so a
decider that opens a dialog for one event does not hold one per event until its install ends.
That release is part of the decision: a finalizer that dies makes its decider a failed one and
discards the answer it gave, and one that never returns leaves the decision unsettled — an
`Effect.timeout` on the decider does not bound it, because it runs on this scope, outside the
decider's own effect.

`O` is the owner's own kind, so a decidable belonging to a _different_ owner is a compile error at
the call site rather than an install nothing ever consults — see {@link OwnerKind}. An owner has
one kind and no default: naming it is what each owner's handle does, and what makes
`contents.decide(Decidables.Window.Close, …)` say `Type '"window"' is not assignable to type
'"contents"'`.

```ts
interface Owner<O extends OwnerKind> {
  readonly decide: <Event, Answer, Timing extends "sync" | "async", R = never>(
    decidable: Decidable<Event, Answer, Timing, Composition, O>,
    decider: DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>,
  ) => Effect.Effect<void, SewedError, MainContext | Scope.Scope | R>;
}
```

#### `Decision.OwnerKind`

Which owner resolves a decidable's event, and therefore the only owner a decider for it may be
installed on. Declared on the decidable rather than left to a convention, because a decider
installed on the wrong owner is not a decider that fails: it registers, it never runs, and the
resolution it was meant to influence answers the fallback forever. On a fallback-open decidable
— `Window.Close` answers `"allow"` when nobody objects — that is a guard that silently does not
guard, which `window.webContents.decide(Decidables.Window.Close, …)` used to compile into.

`"requests"` is a session's _other_ owner: `Decidables.Session.Request`, `.RequestHeaders`, and
`.ResponseHeaders` declare it, and they install through a door that also takes a filter, so a
session holds two registries and each refuses the other's decidables.

```ts
type OwnerKind = "app" | "window" | "contents" | "session" | "requests";
```

#### `Decision.pass`

A decider that never answers: always `Pass`, so it never contributes to any resolution and the
remaining deciders and the fallback apply. `Answer` is `never` rather than `Pass`'s own type, which
is a real decider answer's subtype and so installs on any decidable, whatever its event or answer
shape. `Decision.sync(() => Pass)` now infers the same `never` (see {@link sync}'s own doc comment),
so this is no longer the only spelling that installs — it stays the explicit one: naming the intent
reads better than a lambda whose body is the whole story, and it costs nothing to declare once here
instead of at every call site that only ever passes.

```ts
const pass: Sync<unknown, never>;
```

#### `Decision.Pass`

Returned by a decider that declines to answer, so the remaining deciders and the fallback apply.

```ts
const Pass: unique symbol;
type Pass = typeof Pass;
```

#### `Decision.policy`

Compiles `rules` against a declared {@link Policy}, decoding them through the policy's own schema
into a synchronous decider. It throws immediately, at construction, before anything is installed:
rule data is usually static, so a defect here is the right failure mode, and a caller with dynamic
rules can wrap this call.

```ts
const policy: <Rules, Event, Answer>(kind: Policy<Rules, Event, Answer>, rules: NoInfer<Rules>) => Sync<Event, Answer>;
```

#### `Decision.Policy`

Rule data plus the compile that turns it into a decider. A policy is declared once, by the module
that owns the matching logic (`Navigation.Policy`, `Permission.Policy`, `Certificate.Policy`), and
installed by a caller through {@link policy}, which supplies only the rule data. The rule the whole
wave's policies follow: a policy answers only for what its rules match, and answers {@link Pass}
for everything else, so two features' policies compose as a union of grants instead of vetoing each
other. A decider that must deny on a miss — a cap nobody can widen — is a plain {@link sync}
decider instead, not a `Policy`.

```ts
interface Policy<Rules, Event, Answer> {
  readonly rules: Schema.Codec<Rules>;
  readonly compile: (rules: Rules) => (event: Event) => Answer | Pass;
}
```

#### `Decision.Requests`

The other install door: {@link Owner}'s scoped install, plus the filter that says which requests
the decider is ever asked about. `internal/Session.ts` publishes it as `session.intercept`, and
`sewed/testing`'s owner stand-in publishes it too, so a feature that intercepts names this
interface and takes either.

The filter is a separate, required parameter rather than part of the decidable because it is a
cost, not a key: a listener over every URL routes every request in the session through main, and
naming the scope at the call site is what keeps that visible. What the registry receives is a
decider already wrapped to answer {@link Pass} for a request its own filter does not select, so
the composition sees exactly the deciders that had an opinion to have. A `body` option on the
filter is what makes upload data reach a request decider, capped in bytes and assembled only for
the installs that asked; the two header stages carry none and refuse a filter that asks for one.

A decider with no opinion about a request answers {@link Pass}, and so do _all_ of them for a
request their own filter does not select — so two features' deciders compose as declared rather
than as a race. `Decidables.Session.Request` ranks its answers (`block` beats `redirect` beats
`allow`); the two header stages chain, each decider seeing the headers the previous one produced.
On all three, a decider that fails or dies blocks its request — but one that never _settles_
leaves its request unanswered rather than blocked, and closing the installing scope does not
release a request already in flight, so bound a decider that can wait on anything with
`Effect.timeout`.

`O` is the owner kind of the decidables this door takes, for the reason {@link Owner}'s own `O`
exists: a decidable belonging to a different owner is a compile error at the call site rather
than an install nothing ever consults. It defaults to `"requests"`, the only kind the shipped
catalog declares a filtered decidable for, so a caller writes `Decision.Requests` unparameterized.
This is the one place in this module that names a schema from another surface — a request filter
is a `WebRequest.Filter` and nothing more general would say which requests it selects.

```ts
interface Requests<O extends OwnerKind = "requests"> {
  readonly intercept: <Event, Answer, R = never>(
    decidable: Decidable<Event, Answer, "async", Composition, O>,
    filter: WebRequest.Filter,
    decider: Decider<NoInfer<Event>, NoInfer<Answer>, R>,
  ) => Effect.Effect<void, SewedError, MainContext | Scope.Scope | R>;
}
```

#### `Decision.sync`

A decider Electron can run inside its own callback. It cannot suspend, so it returns no Effect.

A single signature deliberately: an earlier overloaded form (one signature for a decider that only
ever passes, one for the general case) broke contextual typing at every call site instead of
helping it. Overload resolution does not apply the contextual type a decidable's `decide` parameter
offers, so `Decision.sync(() => "quit")` inferred `Sync<Event, string>` — the literal widened —
instead of `Sync<Event, "quit" | "stay">`, and every answer needed an `as const` or an annotated
return type to compile. A single signature lets the argument context flow through normally, so the
natural spelling infers the literal answer type with no annotation.

`Answer` is not the type parameter TypeScript infers directly: it is `Exclude<Raw, Pass>`, where
`Raw` is whatever the callback's return type unifies to. Both `sync<Event, Answer = never>` and a
second overload placed before this signature were probed first (`.artifacts/wave-5/`) and neither
survives contact — a default never applies, because `Decision.Pass` is a plain expression (not a
contextually-sensitive literal), so it always contributes `typeof Pass` as an inference candidate
for `Answer` whether or not a default exists; a second overload reintroduces exactly the broken
contextual typing the paragraph above describes, for the same reason. `Exclude` runs _after_
inference, over whatever `Raw` already is, so it costs nothing when `Raw` is a real answer type
(`Exclude<"quit" | "stay", Pass>` is `"quit" | "stay"` unchanged) and collapses a pass-only lambda's
`Raw = typeof Pass` down to `never` — installing on any decidable, exactly like {@link pass}.

The cast below is the one place this trades away static proof: `decide`'s own return type is
`Raw | Pass`, and the object literal's declared shape needs `Exclude<Raw, Pass> | Pass`. TypeScript
cannot derive that relation for an unconstrained `Raw` — conditional types are not generally
invertible — but the runtime value never changes: `Pass` is a `unique symbol` with exactly one
inhabitant, so any value of type `Raw | Pass` is either that exact symbol (already valid under
`| Pass`) or a value of `Raw` that is not that symbol, which is definitionally within
`Exclude<Raw, Pass>`. The invariant is closed over by `decision-types.ts`'s pass-only, natural-
spelling, mixed-answer, and wrong-answer contracts.

```ts
const sync: <Event, Raw>(decide: (event: Event) => Raw | Pass) => Sync<Event, Exclude<Raw, Pass>>;
```

#### `Decision.Sync`

```ts
interface Sync<Event, Answer> {
  readonly _tag: "sync";
  readonly decide: (event: Event) => Answer | Pass;
}
```

### `DesktopCapturer`

#### `DesktopCapturer.Decision`

What a display media request receives: nothing, or one capture source with optional system audio.

```ts
const Decision: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"deny">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"source">;
    readonly id: Schema.String;
    readonly audio: Schema.optionalKey<Schema.Literals<readonly ["loopback", "loopbackWithMute"]>>;
}>]>;
type Decision = typeof Decision.Type;
```

#### `DesktopCapturer.Options`

```ts
const Options: Schema.Struct<{
    readonly types: Schema.NonEmptyArray<Schema.Literals<readonly ["screen", "window"]>>;
    readonly thumbnailSize: Schema.optionalKey<Schema.Struct<{
        readonly width: Schema.Int;
        readonly height: Schema.Int;
    }>>;
    readonly fetchWindowIcons: Schema.optionalKey<Schema.Boolean>;
}>;
type Options = typeof Options.Type;
```

#### `DesktopCapturer.Request`

`origin` is `null` when the requesting document's origin is opaque (`file:`, `data:`, an
unregistered scheme): `URL.origin` reports the literal string `"null"` for every such document,
which is Chromium's own spelling for "this document has no origin", not a real identity — the same
reasoning `Decidables.Session.Permission`'s own doc gives for its `origin` field. See
`internal/DisplayMedia.ts`'s event builder.

```ts
const Request: Schema.Struct<{
    readonly origin: Schema.NullOr<Schema.String>;
    readonly videoRequested: Schema.Boolean;
    readonly audioRequested: Schema.Boolean;
    readonly userGesture: Schema.Boolean;
}>;
type Request = typeof Request.Type;
```

#### `DesktopCapturer.Source`

A capturable screen or window; thumbnails and icons are PNG bytes, empty when not fetched.

```ts
const Source: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly displayId: Schema.String;
    readonly thumbnail: Binary.Bytes;
    readonly icon: Schema.NullOr<Binary.Bytes>;
}>;
type Source = typeof Source.Type;
```

#### `DesktopCapturer.SourceType`

```ts
const SourceType: Schema.Literals<readonly ["screen", "window"]>;
type SourceType = typeof SourceType.Type;
```

### `Device`

#### `Device.Bluetooth`

A Bluetooth device found while a page's request is scanning.

```ts
const Bluetooth: Schema.Struct<{
    readonly deviceId: Schema.String;
    readonly deviceName: Schema.String;
}>;
type Bluetooth = typeof Bluetooth.Type;
```

#### `Device.BluetoothRequest`

```ts
const BluetoothRequest: Schema.Struct<{
    readonly origin: Schema.NullOr<Schema.String>;
    readonly document: Schema.NullOr<Schema.String>;
    readonly devices: Schema.$Array<Schema.Struct<{
        readonly deviceId: Schema.String;
        readonly deviceName: Schema.String;
    }>>;
}>;
type BluetoothRequest = typeof BluetoothRequest.Type;
```

#### `Device.BluetoothSelection`

What a Bluetooth request receives each time its scan reports devices: `wait` keeps the request
scanning, so the next report asks again.

```ts
const BluetoothSelection: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"cancel">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"select">;
    readonly id: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"wait">;
}>]>;
type BluetoothSelection = typeof BluetoothSelection.Type;
```

#### `Device.Change`

A device that appeared or went away while a chooser request is pending (`added`, `removed`), or
whose access a page gave up (`revoked`, which carries the origin when Electron reports one).

```ts
const Change: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"hid">;
    readonly change: Schema.Literals<readonly ["added", "removed", "revoked"]>;
    readonly device: Schema.Struct<{
        readonly deviceId: Schema.String;
        readonly name: Schema.String;
        readonly vendorId: Schema.Finite;
        readonly productId: Schema.Finite;
        readonly serialNumber: Schema.optionalKey<Schema.String>;
        readonly guid: Schema.optionalKey<Schema.String>;
    }>;
    readonly origin: Schema.NullOr<Schema.String>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"usb">;
    readonly change: Schema.Literals<readonly ["added", "removed", "revoked"]>;
    readonly device: Schema.Struct<{
        readonly deviceId: Schema.String;
        readonly vendorId: Schema.Finite;
        readonly productId: Schema.Finite;
        readonly deviceClass: Schema.Finite;
        readonly deviceSubclass: Schema.Finite;
        readonly deviceProtocol: Schema.Finite;
        readonly productName: Schema.optionalKey<Schema.String>;
        readonly manufacturerName: Schema.optionalKey<Schema.String>;
        readonly serialNumber: Schema.optionalKey<Schema.String>;
    }>;
    readonly origin: Schema.NullOr<Schema.String>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"serial">;
    readonly change: Schema.Literals<readonly ["added", "removed", "revoked"]>;
    readonly port: Schema.Struct<{
        readonly portId: Schema.String;
        readonly portName: Schema.String;
        readonly displayName: Schema.optionalKey<Schema.String>;
        readonly vendorId: Schema.optionalKey<Schema.String>;
        readonly productId: Schema.optionalKey<Schema.String>;
        readonly serialNumber: Schema.optionalKey<Schema.String>;
    }>;
    readonly origin: Schema.NullOr<Schema.String>;
}>]>;
type Change = typeof Change.Type;
```

#### `Device.Hid`

A HID device a page may be given. Carries what identifies a device to a person or a policy; the
report descriptors Electron also reports (`collections`) are not copied.

```ts
const Hid: Schema.Struct<{
    readonly deviceId: Schema.String;
    readonly name: Schema.String;
    readonly vendorId: Schema.Finite;
    readonly productId: Schema.Finite;
    readonly serialNumber: Schema.optionalKey<Schema.String>;
    readonly guid: Schema.optionalKey<Schema.String>;
}>;
type Hid = typeof Hid.Type;
```

#### `Device.HidRequest`

```ts
const HidRequest: Schema.Struct<{
    readonly origin: Schema.NullOr<Schema.String>;
    readonly document: Schema.NullOr<Schema.String>;
    readonly devices: Schema.$Array<Schema.Struct<{
        readonly deviceId: Schema.String;
        readonly name: Schema.String;
        readonly vendorId: Schema.Finite;
        readonly productId: Schema.Finite;
        readonly serialNumber: Schema.optionalKey<Schema.String>;
        readonly guid: Schema.optionalKey<Schema.String>;
    }>>;
}>;
type HidRequest = typeof HidRequest.Type;
```

#### `Device.Pairing`

A Bluetooth pairing prompt. `confirm` asks whether to pair, `confirmPin` asks whether `pin`
matches the one the device shows, and `providePin` asks for the device's pin.

```ts
const Pairing: Schema.Struct<{
    readonly origin: Schema.NullOr<Schema.String>;
    readonly document: Schema.NullOr<Schema.String>;
    readonly deviceId: Schema.String;
    readonly kind: Schema.Literals<readonly ["confirm", "confirmPin", "providePin"]>;
    readonly pin: Schema.optionalKey<Schema.String>;
}>;
type Pairing = typeof Pairing.Type;
```

#### `Device.PairingAnswer`

The answer to a pairing prompt. `confirm` answers `confirm` and `confirmPin`; `pin` answers
`providePin`. An answer of the wrong kind for its prompt cancels the pairing.

```ts
const PairingAnswer: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"cancel">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"confirm">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"pin">;
    readonly pin: Schema.String;
}>]>;
type PairingAnswer = typeof PairingAnswer.Type;
```

#### `Device.Selection`

What a chooser request receives: nothing, or the id of one of the entries it offered. An id the
request did not offer cancels it.

```ts
const Selection: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"cancel">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"select">;
    readonly id: Schema.String;
}>]>;
type Selection = typeof Selection.Type;
```

#### `Device.SerialPort`

A serial port a page may be given; Electron reports its USB ids as strings.

```ts
const SerialPort: Schema.Struct<{
    readonly portId: Schema.String;
    readonly portName: Schema.String;
    readonly displayName: Schema.optionalKey<Schema.String>;
    readonly vendorId: Schema.optionalKey<Schema.String>;
    readonly productId: Schema.optionalKey<Schema.String>;
    readonly serialNumber: Schema.optionalKey<Schema.String>;
}>;
type SerialPort = typeof SerialPort.Type;
```

#### `Device.SerialPortRequest`

```ts
const SerialPortRequest: Schema.Struct<{
    readonly origin: Schema.NullOr<Schema.String>;
    readonly document: Schema.NullOr<Schema.String>;
    readonly ports: Schema.$Array<Schema.Struct<{
        readonly portId: Schema.String;
        readonly portName: Schema.String;
        readonly displayName: Schema.optionalKey<Schema.String>;
        readonly vendorId: Schema.optionalKey<Schema.String>;
        readonly productId: Schema.optionalKey<Schema.String>;
        readonly serialNumber: Schema.optionalKey<Schema.String>;
    }>>;
}>;
type SerialPortRequest = typeof SerialPortRequest.Type;
```

#### `Device.Usb`

A USB device a page may be given. Carries what identifies a device to a person or a policy; the
configuration and interface descriptors Electron also reports are not copied.

```ts
const Usb: Schema.Struct<{
    readonly deviceId: Schema.String;
    readonly vendorId: Schema.Finite;
    readonly productId: Schema.Finite;
    readonly deviceClass: Schema.Finite;
    readonly deviceSubclass: Schema.Finite;
    readonly deviceProtocol: Schema.Finite;
    readonly productName: Schema.optionalKey<Schema.String>;
    readonly manufacturerName: Schema.optionalKey<Schema.String>;
    readonly serialNumber: Schema.optionalKey<Schema.String>;
}>;
type Usb = typeof Usb.Type;
```

#### `Device.UsbClass`

A USB class Chromium can keep away from pages.

```ts
const UsbClass: Schema.Literals<readonly ["audio", "audio-video", "hid", "mass-storage", "smart-card", "video", "wireless"]>;
type UsbClass = typeof UsbClass.Type;
```

#### `Device.UsbRequest`

```ts
const UsbRequest: Schema.Struct<{
    readonly origin: Schema.NullOr<Schema.String>;
    readonly document: Schema.NullOr<Schema.String>;
    readonly devices: Schema.$Array<Schema.Struct<{
        readonly deviceId: Schema.String;
        readonly vendorId: Schema.Finite;
        readonly productId: Schema.Finite;
        readonly deviceClass: Schema.Finite;
        readonly deviceSubclass: Schema.Finite;
        readonly deviceProtocol: Schema.Finite;
        readonly productName: Schema.optionalKey<Schema.String>;
        readonly manufacturerName: Schema.optionalKey<Schema.String>;
        readonly serialNumber: Schema.optionalKey<Schema.String>;
    }>>;
}>;
type UsbRequest = typeof UsbRequest.Type;
```

#### `Device.WebAuthnAccount`

One discoverable WebAuthn credential; `credentialId` is URL-safe base64 without padding.

```ts
const WebAuthnAccount: Schema.Struct<{
    readonly credentialId: Schema.String;
    readonly name: Schema.optionalKey<Schema.String>;
    readonly displayName: Schema.optionalKey<Schema.String>;
    readonly userHandle: Schema.optionalKey<Schema.String>;
}>;
type WebAuthnAccount = typeof WebAuthnAccount.Type;
```

#### `Device.WebAuthnRequest`

```ts
const WebAuthnRequest: Schema.Struct<{
    readonly origin: Schema.NullOr<Schema.String>;
    readonly document: Schema.NullOr<Schema.String>;
    readonly relyingPartyId: Schema.String;
    readonly accounts: Schema.$Array<Schema.Struct<{
        readonly credentialId: Schema.String;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly displayName: Schema.optionalKey<Schema.String>;
        readonly userHandle: Schema.optionalKey<Schema.String>;
    }>>;
}>;
type WebAuthnRequest = typeof WebAuthnRequest.Type;
```

### `Diagnostics`

#### `Diagnostics.Collector`

```ts
type Collector = Effect.Success<ReturnType<typeof make>>;
```

#### `Diagnostics.Event`

```ts
const Event: Schema.Union<readonly [Schema.TaggedStruct<"OwnerStarted", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly ownerId: Schema.String;
}>, Schema.TaggedStruct<"OwnerClosed", {
    readonly ownerId: Schema.String;
    readonly reason: Schema.Literals<readonly ["scope-closed", "shutdown", "terminated", "exited", "startup-failed"]>;
}>, Schema.TaggedStruct<"RuntimeClosed", {
    readonly runtimeId: Schema.String;
}>, Schema.TaggedStruct<"BindingOpened", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly bindingId: Schema.String;
    readonly slot: Schema.String;
    readonly ownerId: Schema.String;
}>, Schema.TaggedStruct<"BindingClosed", {
    readonly bindingId: Schema.String;
    readonly reason: Schema.Literals<readonly ["scope-closed", "navigation", "renderer-gone", "renderer-disconnected", "replaced"]>;
}>, Schema.TaggedStruct<"RequestStarted", {
    readonly ownerId: Schema.String;
    readonly clientId: Schema.Finite;
    readonly requestId: Schema.String;
    readonly procedure: Schema.String;
    readonly traceId: Schema.optionalKey<Schema.String>;
    readonly spanId: Schema.optionalKey<Schema.String>;
}>, Schema.TaggedStruct<"RequestEnded", {
    readonly ownerId: Schema.String;
    readonly clientId: Schema.Finite;
    readonly requestId: Schema.String;
    readonly outcome: Schema.Literals<readonly ["success", "failure", "interrupted", "disconnected"]>;
    readonly reason: Schema.String;
}>, Schema.TaggedStruct<"EventsDropped", {
    readonly ownerId: Schema.String;
    readonly count: Schema.Finite;
}>, Schema.TaggedStruct<"ResourceChanged", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly resourceId: Schema.String;
    readonly ownerId: Schema.String;
    readonly clientId: Schema.Finite;
    readonly state: Schema.Literals<readonly ["acquiring", "ready", "releasing"]>;
}>, Schema.TaggedStruct<"ResourceClosed", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly resourceId: Schema.String;
    readonly ownerId: Schema.String;
    readonly clientId: Schema.Finite;
    readonly outcome: Schema.Literals<readonly ["success", "failure", "interrupted", "disconnected"]>;
    readonly reason: Schema.String;
}>, Schema.TaggedStruct<"TransferProgress", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly ownerId: Schema.String;
    readonly clientId: Schema.Finite;
    readonly requestId: Schema.String;
    readonly frames: Schema.Int;
    readonly wireBytes: Schema.Int;
    readonly terminal: Schema.Boolean;
}>, Schema.TaggedStruct<"TraceSpan", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly traceId: Schema.String;
    readonly spanId: Schema.String;
    readonly parentId: Schema.optionalKey<Schema.String>;
    readonly name: Schema.String;
    readonly startTime: Schema.String;
    readonly endTime: Schema.optionalKey<Schema.String>;
    readonly outcome: Schema.Literals<readonly ["running", "success", "failure"]>;
    readonly ownerId: Schema.optionalKey<Schema.String>;
    readonly binding: Schema.optionalKey<Schema.String>;
}>, Schema.TaggedStruct<"TraceEvent", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly traceId: Schema.String;
    readonly spanId: Schema.String;
    readonly name: Schema.String;
    readonly time: Schema.String;
}>, Schema.TaggedStruct<"RuntimeSample", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly delayMs: Schema.Number;
    readonly intervalMs: Schema.Number;
}>, Schema.TaggedStruct<"QueueSample", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly queueId: Schema.String;
    readonly ownerId: Schema.optionalKey<Schema.String>;
    readonly kind: Schema.Literals<readonly ["rpc-server", "rpc-client"]>;
    readonly size: Schema.Number;
    readonly capacity: Schema.Number;
    readonly activeRequests: Schema.optionalKey<Schema.Number>;
}>, Schema.TaggedStruct<"QueueClosed", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly queueId: Schema.String;
}>]>;
type Event = typeof Event.Type;
```

#### `Diagnostics.HealthOptions`

```ts
interface HealthOptions {
  readonly intervalMs?: number;
}
```

#### `Diagnostics.instrument`

Opt-in trace observations and the scoped health sampler for one Effect runtime.

```ts
const instrument: <A, E, R>(program: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R | Scope.Scope>;
```

#### `Diagnostics.make`

Scope this collector outside the resources it observes so their finalizers are recorded.

```ts
const make: (options?: {
    readonly capacity?: number;
    readonly tracing?: boolean;
}) => Effect.Effect<{
    layer: Layer.Layer<Sink, never, never>;
    snapshot: Effect.Effect<Snapshot, never, never>;
    changes: Stream.Stream<Record, never, never>;
}, never, Scope.Scope>;
```

#### `Diagnostics.Observation`

```ts
const Observation: Schema.Union<readonly [Schema.TaggedStruct<"TraceSpan", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly traceId: Schema.String;
    readonly spanId: Schema.String;
    readonly parentId: Schema.optionalKey<Schema.String>;
    readonly name: Schema.String;
    readonly startTime: Schema.String;
    readonly endTime: Schema.optionalKey<Schema.String>;
    readonly outcome: Schema.Literals<readonly ["running", "success", "failure"]>;
    readonly ownerId: Schema.optionalKey<Schema.String>;
    readonly binding: Schema.optionalKey<Schema.String>;
}>, Schema.TaggedStruct<"TraceEvent", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly traceId: Schema.String;
    readonly spanId: Schema.String;
    readonly name: Schema.String;
    readonly time: Schema.String;
}>, Schema.TaggedStruct<"RuntimeSample", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly delayMs: Schema.Number;
    readonly intervalMs: Schema.Number;
}>, Schema.TaggedStruct<"QueueSample", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly queueId: Schema.String;
    readonly ownerId: Schema.optionalKey<Schema.String>;
    readonly kind: Schema.Literals<readonly ["rpc-server", "rpc-client"]>;
    readonly size: Schema.Number;
    readonly capacity: Schema.Number;
    readonly activeRequests: Schema.optionalKey<Schema.Number>;
}>, Schema.TaggedStruct<"QueueClosed", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly queueId: Schema.String;
}>]>;
type Observation = typeof Observation.Type;
```

#### `Diagnostics.Placement`

```ts
const Placement: Schema.Struct<{
    runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    threadId: Schema.Finite;
    processId: Schema.optionalKey<Schema.Finite>;
    runtimeId: Schema.String;
}>;
type Placement = typeof Placement.Type;
```

#### `Diagnostics.QueueClosed`

```ts
const QueueClosed: Schema.TaggedStruct<"QueueClosed", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly queueId: Schema.String;
}>;
type QueueClosed = typeof QueueClosed.Type;
```

#### `Diagnostics.QueueSample`

```ts
const QueueSample: Schema.TaggedStruct<"QueueSample", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly queueId: Schema.String;
    readonly ownerId: Schema.optionalKey<Schema.String>;
    readonly kind: Schema.Literals<readonly ["rpc-server", "rpc-client"]>;
    readonly size: Schema.Number;
    readonly capacity: Schema.Number;
    readonly activeRequests: Schema.optionalKey<Schema.Number>;
}>;
type QueueSample = typeof QueueSample.Type;
```

#### `Diagnostics.Record`

```ts
interface Record {
  readonly sequence: number;
  readonly timestamp: number;
  readonly event: Event;
}
```

#### `Diagnostics.ResourceChanged`

```ts
const ResourceChanged: Schema.TaggedStruct<"ResourceChanged", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly resourceId: Schema.String;
    readonly ownerId: Schema.String;
    readonly clientId: Schema.Finite;
    readonly state: Schema.Literals<readonly ["acquiring", "ready", "releasing"]>;
}>;
type ResourceChanged = typeof ResourceChanged.Type;
```

#### `Diagnostics.ResourceClosed`

```ts
const ResourceClosed: Schema.TaggedStruct<"ResourceClosed", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly resourceId: Schema.String;
    readonly ownerId: Schema.String;
    readonly clientId: Schema.Finite;
    readonly outcome: Schema.Literals<readonly ["success", "failure", "interrupted", "disconnected"]>;
    readonly reason: Schema.String;
}>;
type ResourceClosed = typeof ResourceClosed.Type;
```

#### `Diagnostics.runtimeHealth`

Start a scoped timer-lateness sampler when the diagnostics sink opted into tracing.

```ts
const health: (options?: HealthOptions) => Effect.Effect<void, never, Scope.Scope>;
export { health as runtimeHealth };
```

#### `Diagnostics.RuntimeSample`

```ts
const RuntimeSample: Schema.TaggedStruct<"RuntimeSample", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly delayMs: Schema.Number;
    readonly intervalMs: Schema.Number;
}>;
type RuntimeSample = typeof RuntimeSample.Type;
```

#### `Diagnostics.Snapshot`

```ts
interface Snapshot {
  readonly events: readonly Record[];
  readonly owners: readonly Extract<
    Event,
    {
      _tag: "OwnerStarted";
    }
  >[];
  readonly bindings: readonly Extract<
    Event,
    {
      _tag: "BindingOpened";
    }
  >[];
  readonly requests: readonly Extract<
    Event,
    {
      _tag: "RequestStarted";
    }
  >[];
  readonly resources: readonly ResourceChanged[];
  readonly transfers: readonly TransferProgress[];
  readonly dropped: number;
  /** Number of live resource records evicted from the bounded active map. */
  readonly resourceDropped: number;
  /** Number of live transfer records evicted from the bounded active map. */
  readonly transferDropped: number;
  readonly complete: boolean;
  readonly closed: boolean;
}
```

#### `Diagnostics.TraceEvent`

```ts
const TraceEvent: Schema.TaggedStruct<"TraceEvent", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly traceId: Schema.String;
    readonly spanId: Schema.String;
    readonly name: Schema.String;
    readonly time: Schema.String;
}>;
type TraceEvent = typeof TraceEvent.Type;
```

#### `Diagnostics.TraceSpan`

```ts
const TraceSpan: Schema.TaggedStruct<"TraceSpan", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly traceId: Schema.String;
    readonly spanId: Schema.String;
    readonly parentId: Schema.optionalKey<Schema.String>;
    readonly name: Schema.String;
    readonly startTime: Schema.String;
    readonly endTime: Schema.optionalKey<Schema.String>;
    readonly outcome: Schema.Literals<readonly ["running", "success", "failure"]>;
    readonly ownerId: Schema.optionalKey<Schema.String>;
    readonly binding: Schema.optionalKey<Schema.String>;
}>;
type TraceSpan = typeof TraceSpan.Type;
```

#### `Diagnostics.TransferProgress`

```ts
const TransferProgress: Schema.TaggedStruct<"TransferProgress", {
    readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
    readonly threadId: Schema.Finite;
    readonly processId: Schema.optionalKey<Schema.Finite>;
    readonly runtimeId: Schema.String;
    readonly ownerId: Schema.String;
    readonly clientId: Schema.Finite;
    readonly requestId: Schema.String;
    readonly frames: Schema.Int;
    readonly wireBytes: Schema.Int;
    readonly terminal: Schema.Boolean;
}>;
type TransferProgress = typeof TransferProgress.Type;
```

### `Dialog`

#### `Dialog.FileFilter`

```ts
const FileFilter: Schema.Struct<{
    readonly name: Schema.String;
    readonly extensions: Schema.NonEmptyArray<Schema.String>;
}>;
type FileFilter = typeof FileFilter.Type;
```

#### `Dialog.MessageOptions`

```ts
const MessageOptions: Schema.Struct<{
    readonly message: Schema.String;
    readonly buttons: Schema.NonEmptyArray<Schema.String>;
    readonly type: Schema.optionalKey<Schema.Literals<readonly ["none", "info", "error", "question", "warning"]>>;
    readonly title: Schema.optionalKey<Schema.String>;
    readonly detail: Schema.optionalKey<Schema.String>;
    readonly defaultId: Schema.optionalKey<Schema.Finite>;
    readonly cancelId: Schema.optionalKey<Schema.Finite>;
    readonly checkbox: Schema.optionalKey<Schema.Struct<{
        readonly label: Schema.String;
        readonly checked: Schema.optionalKey<Schema.Boolean>;
    }>>;
    readonly noLink: Schema.optionalKey<Schema.Boolean>;
    readonly normalizeAccessKeys: Schema.optionalKey<Schema.Boolean>;
}>;
type MessageOptions = typeof MessageOptions.Type;
```

#### `Dialog.MessageResult`

```ts
const MessageResult: Schema.Struct<{
    readonly response: Schema.Finite;
    readonly checkboxChecked: Schema.Boolean;
}>;
type MessageResult = typeof MessageResult.Type;
```

#### `Dialog.OpenOptions`

```ts
const OpenOptions: Schema.Union<readonly [Schema.Struct<{
    readonly title: Schema.optionalKey<Schema.String>;
    readonly defaultPath: Schema.optionalKey<Schema.String>;
    readonly buttonLabel: Schema.optionalKey<Schema.String>;
    readonly multiple: Schema.optionalKey<Schema.Boolean>;
    readonly mode: Schema.Literal<"file">;
    readonly filters: Schema.optionalKey<Schema.NonEmptyArray<Schema.Struct<{
        readonly name: Schema.String;
        readonly extensions: Schema.NonEmptyArray<Schema.String>;
    }>>>;
    readonly properties: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["showHiddenFiles", "createDirectory", "promptToCreate", "noResolveAliases", "treatPackageAsDirectory", "dontAddToRecent"]>>>;
}>, Schema.Struct<{
    readonly title: Schema.optionalKey<Schema.String>;
    readonly defaultPath: Schema.optionalKey<Schema.String>;
    readonly buttonLabel: Schema.optionalKey<Schema.String>;
    readonly multiple: Schema.optionalKey<Schema.Boolean>;
    readonly mode: Schema.Literal<"directory">;
    readonly properties: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["showHiddenFiles", "createDirectory", "promptToCreate", "noResolveAliases", "treatPackageAsDirectory", "dontAddToRecent"]>>>;
}>]>;
type OpenOptions = typeof OpenOptions.Type;
```

#### `Dialog.OpenProperty`

Electron's own open dialog flags, minus `openFile`/`openDirectory`/`multiSelections` — `mode`
and `multiple` already model those, and a caller repeating them here could contradict the
selection mode `OpenOptions`'s own shape enforces.

```ts
const OpenProperty: Schema.Literals<readonly ["showHiddenFiles", "createDirectory", "promptToCreate", "noResolveAliases", "treatPackageAsDirectory", "dontAddToRecent"]>;
type OpenProperty = typeof OpenProperty.Type;
```

#### `Dialog.OpenResult`

```ts
const OpenResult: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"canceled">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"selected">;
    readonly paths: Schema.NonEmptyArray<Schema.String>;
}>]>;
type OpenResult = typeof OpenResult.Type;
```

#### `Dialog.SaveOptions`

`properties` forwards verbatim to Electron; absent, the dialog capability's own `save` keeps
requesting overwrite confirmation, its long-standing default — `internal/Dialog.ts`, not this
schema, supplies that default, so a caller reading `SaveOptions.properties` back off a value
this schema decoded sees exactly what it wrote, `undefined` included.

```ts
const SaveOptions: Schema.Struct<{
    readonly title: Schema.optionalKey<Schema.String>;
    readonly defaultPath: Schema.optionalKey<Schema.String>;
    readonly buttonLabel: Schema.optionalKey<Schema.String>;
    readonly filters: Schema.optionalKey<Schema.NonEmptyArray<Schema.Struct<{
        readonly name: Schema.String;
        readonly extensions: Schema.NonEmptyArray<Schema.String>;
    }>>>;
    readonly properties: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["showHiddenFiles", "createDirectory", "treatPackageAsDirectory", "showOverwriteConfirmation", "dontAddToRecent"]>>>;
}>;
type SaveOptions = typeof SaveOptions.Type;
```

#### `Dialog.SaveProperty`

Electron's own save dialog flags, minus `showOverwriteConfirmation`'s implicit default (see
`SaveOptions.properties`) and every flag that names a mode or multiplicity `SaveOptions` already
models structurally.

```ts
const SaveProperty: Schema.Literals<readonly ["showHiddenFiles", "createDirectory", "treatPackageAsDirectory", "showOverwriteConfirmation", "dontAddToRecent"]>;
type SaveProperty = typeof SaveProperty.Type;
```

#### `Dialog.SaveResult`

```ts
const SaveResult: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"canceled">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"selected">;
    readonly path: Schema.String;
}>]>;
type SaveResult = typeof SaveResult.Type;
```

### `Download`

#### `Download.Decision`

What happens to an offered download: `deny` cancels it, `save` writes to a path without a
dialog, and `prompt` lets Electron show its save dialog, with these options when given.

```ts
const Decision: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"deny">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"save">;
    readonly path: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"prompt">;
    readonly dialog: Schema.optionalKey<Schema.Struct<{
        readonly title: Schema.optionalKey<Schema.String>;
        readonly defaultPath: Schema.optionalKey<Schema.String>;
        readonly buttonLabel: Schema.optionalKey<Schema.String>;
        readonly filters: Schema.optionalKey<Schema.NonEmptyArray<Schema.Struct<{
            readonly name: Schema.String;
            readonly extensions: Schema.NonEmptyArray<Schema.String>;
        }>>>;
        readonly properties: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["showHiddenFiles", "createDirectory", "treatPackageAsDirectory", "showOverwriteConfirmation", "dontAddToRecent"]>>>;
    }>>;
}>]>;
type Decision = typeof Decision.Type;
```

#### `Download.Details`

What a download knows about its file and its response: where it is being saved, when it started
and ended (seconds since the epoch; `endTime` is zero until it ends), and the validators a
server needs to resume it. `savePath` is empty until a path is chosen.

```ts
const Details: Schema.Struct<{
    readonly savePath: Schema.String;
    readonly startTime: Schema.Finite;
    readonly endTime: Schema.Finite;
    readonly eTag: Schema.String;
    readonly lastModified: Schema.String;
    /** The origin of the document that started the download; empty when none did. */
    readonly initiatorOrigin: Schema.String;
}>;
type Details = typeof Details.Type;
```

#### `Download.Handle`

```ts
interface Handle {
  readonly snapshot: Effect.Effect<State, SewedError, MainContext>;
  /** The file and response facts of the download; see {@link Details}. */
  readonly details: Effect.Effect<Details, SewedError, MainContext>;
  readonly progress: Stream.Stream<State, SewedError, MainContext>;
  readonly awaitDone: Effect.Effect<Outcome, SewedError, MainContext>;
  readonly pause: Effect.Effect<void, SewedError, MainContext>;
  readonly resume: Effect.Effect<void, SewedError, MainContext>;
  readonly cancel: Effect.Effect<void, SewedError, MainContext>;
}
```

#### `Download.Offer`

A download a document started; `sourceId` names the Sewed window, view, or guest that started it.

```ts
const Offer: Schema.Struct<{
    readonly url: Schema.String;
    readonly filename: Schema.String;
    readonly mimeType: Schema.String;
    readonly totalBytes: Schema.Finite;
    readonly sourceId: Schema.String;
    /** Every URL the request passed through, the first being the one asked for and the last `url`. */
    readonly urlChain: Schema.$Array<Schema.String>;
    /** Whether a user gesture started the download, as opposed to the page on its own. */
    readonly userGesture: Schema.Boolean;
    /** The response's `Content-Disposition` header, empty when it sent none. */
    readonly contentDisposition: Schema.String;
}>;
type Offer = typeof Offer.Type;
```

#### `Download.Options`

```ts
const Options: Schema.Struct<{
    readonly url: Schema.String;
    readonly savePath: Schema.String;
    readonly headers: Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>;
}>;
type Options = typeof Options.Type;
```

#### `Download.Outcome`

```ts
const Outcome: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"completed">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"cancelled">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"interrupted">;
}>]>;
type Outcome = typeof Outcome.Type;
```

#### `Download.Resume`

A download interrupted in an earlier run, described well enough to continue it: the partial
file at `path`, the URLs it came through, how many bytes are there (`offset`) and how many the
whole file has (`length`), and the validators the server sent.

```ts
const Resume: Schema.Struct<{
    readonly path: Schema.String;
    readonly urlChain: Schema.NonEmptyArray<Schema.String>;
    readonly mimeType: Schema.optionalKey<Schema.String>;
    readonly offset: Schema.Int;
    readonly length: Schema.Int;
    readonly lastModified: Schema.optionalKey<Schema.String>;
    readonly eTag: Schema.optionalKey<Schema.String>;
    readonly startTime: Schema.optionalKey<Schema.Finite>;
}>;
type Resume = typeof Resume.Type;
```

#### `Download.State`

```ts
const State: Schema.Union<readonly [Schema.Struct<{
    readonly receivedBytes: Schema.Finite;
    readonly totalBytes: Schema.Finite;
    readonly percent: Schema.Finite;
    readonly currentBytesPerSecond: Schema.Finite;
    readonly canResume: Schema.Boolean;
    readonly paused: Schema.Boolean;
    readonly status: Schema.Literal<"pending">;
}>, Schema.Struct<{
    readonly receivedBytes: Schema.Finite;
    readonly totalBytes: Schema.Finite;
    readonly percent: Schema.Finite;
    readonly currentBytesPerSecond: Schema.Finite;
    readonly canResume: Schema.Boolean;
    readonly paused: Schema.Boolean;
    readonly status: Schema.Literal<"active">;
    readonly phase: Schema.Literals<readonly ["progressing", "interrupted"]>;
}>, Schema.Struct<{
    readonly receivedBytes: Schema.Finite;
    readonly totalBytes: Schema.Finite;
    readonly percent: Schema.Finite;
    readonly currentBytesPerSecond: Schema.Finite;
    readonly canResume: Schema.Boolean;
    readonly paused: Schema.Boolean;
    readonly status: Schema.Literal<"terminal">;
    readonly outcome: Schema.Literals<readonly ["completed", "cancelled", "interrupted"]>;
}>]>;
type State = typeof State.Type;
```

### `Extension`

#### `Extension.Event`

An extension loaded into, ready in, or unloaded from a session.

```ts
const Event: Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["loaded", "ready", "unloaded"]>;
    readonly extension: Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly version: Schema.String;
        readonly url: Schema.String;
    }>;
}>;
type Event = typeof Event.Type;
```

#### `Extension.Info`

```ts
const Info: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly version: Schema.String;
    readonly url: Schema.String;
}>;
type Info = typeof Info.Type;
```

#### `Extension.Options`

```ts
const Options: Schema.Struct<{
    readonly allowFileAccess: Schema.optionalKey<Schema.Boolean>;
}>;
type Options = typeof Options.Type;
```

### `GlobalShortcut`

#### `GlobalShortcut.Accelerator`

```ts
const Accelerator: Schema.String;
type Accelerator = typeof Accelerator.Type;
```

### `GuestView`

#### `GuestView.Handle`

A view that hosts a page the application does not own: no preload, no bridge, no bindings.

```ts
interface Handle<A extends Automation.Declaration = {}, Core = unknown> extends Attachable {
  readonly id: string;
  readonly webContents: Core;
  readonly navigate: (url: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly blocked: Stream.Stream<WebContents.Blocked, SewedError, MainContext>;
  /** The downloads this guest's page started and a decider accepted; a denied one never appears here. */
  readonly downloads: Stream.Stream<Download.Handle, SewedError, MainContext>;
  readonly automation: Automation.Of<A>;
  readonly close: Effect.Effect<void, SewedError, MainContext>;
  readonly awaitClosed: Effect.Effect<void, never, MainContext>;
}
```

#### `GuestView.HostPolicy`

What this capability serves beyond state, focus, zoom, find, and history.

```ts
const HostPolicy: Schema.Struct<{
    readonly navigate: Schema.Boolean;
    readonly capture: Schema.Boolean;
}>;
type HostPolicy = typeof HostPolicy.Type;
```

#### `GuestView.InputPolicy`

Whether keyboard and mouse input reaches the guest page.

```ts
const InputPolicy: Schema.Literals<readonly ["allow", "block"]>;
type InputPolicy = typeof InputPolicy.Type;
```

#### `GuestView.Options`

```ts
interface Options<A extends Automation.Declaration> extends Omit<Settings, "automation"> {
  readonly session?: SessionHandle;
  readonly automation?: A;
}
```

#### `GuestView.protocol`

```ts
const protocol: RpcGroup.RpcGroup<Rpc.Rpc<"back", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"capture", Schema.Struct<{
    readonly rect: Schema.optionalKey<Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>>;
    readonly stayHidden: Schema.optionalKey<Schema.Boolean>;
    readonly stayAwake: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{
    readonly bytes: Binary.Bytes;
    readonly width: Schema.Finite;
    readonly height: Schema.Finite;
    readonly scaleFactor: Schema.Finite;
}>, typeof SewedError, never, never> | Rpc.Rpc<"find", Schema.Struct<{
    text: Schema.String;
    options: Schema.optionalKey<Schema.Struct<{
        readonly forward: Schema.optionalKey<Schema.Boolean>;
        readonly matchCase: Schema.optionalKey<Schema.Boolean>;
    }>>;
}>, RpcSchema.Stream<Schema.Struct<{
    readonly activeMatchOrdinal: Schema.Int;
    readonly matches: Schema.Int;
    readonly selectionArea: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly finalUpdate: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"findNext", Schema.Struct<{
    forward: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"forward", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"history", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly index: Schema.Int;
    readonly entries: Schema.$Array<Schema.Struct<{
        readonly url: Schema.String;
        readonly title: Schema.String;
    }>>;
    readonly canGoBack: Schema.Boolean;
    readonly canGoForward: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"navigate", Schema.Struct<{
    url: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setZoom", Schema.Struct<{
    factor: Schema.Finite;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"state", Schema.Void, RpcSchema.Stream<Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"idle">;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"loading">;
    readonly url: Schema.String;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"gone">;
    readonly reason: Schema.String;
    readonly exitCode: Schema.Finite;
}>]>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"stopFind", Schema.Struct<{
    action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"zoom", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly factor: Schema.Finite;
}>, typeof SewedError>, Schema.Never, never, never>>;
```

#### `GuestView.Settings`

```ts
const Settings: Schema.Struct<{
    readonly navigation: Schema.$Array<Schema.Union<readonly [Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"origin">;
        readonly origin: Schema.String;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"document">;
        readonly url: Schema.String;
    }>]>, Schema.String]>>;
    readonly webRtc: Schema.optionalKey<Schema.Literals<readonly ["default", "publicInterfaceOnly", "disableNonProxiedUdp"]>>;
    readonly input: Schema.optionalKey<Schema.Literals<readonly ["allow", "block"]>>;
    readonly backgroundThrottling: Schema.optionalKey<Schema.Boolean>;
    readonly automation: Schema.optionalKey<Schema.Struct<{
        readonly evaluate: Schema.optionalKey<Schema.Literal<true>>;
        readonly devtools: Schema.optionalKey<Schema.NonEmptyArray<Schema.String>>;
        readonly input: Schema.optionalKey<Schema.Literal<true>>;
    }>>;
}>;
type Settings = typeof Settings.Type;
```

#### `GuestView.tab`

A guest's hosted tab as one capability. Like a window's controls, it belongs to an owner:
`GuestView.native(guest, policy)` in `sewed/main` carries the host policy for one acquired view,
and `Capability.client` reaches it from a document. The policy still decides `navigate` and
`capture`; everything else on the protocol is always served.

```ts
const tab: Capability.Capability<Rpc.Rpc<"back", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"capture", Schema.Struct<{
    readonly rect: Schema.optionalKey<Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>>;
    readonly stayHidden: Schema.optionalKey<Schema.Boolean>;
    readonly stayAwake: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{
    readonly bytes: Binary.Bytes;
    readonly width: Schema.Finite;
    readonly height: Schema.Finite;
    readonly scaleFactor: Schema.Finite;
}>, typeof SewedError, never, never> | Rpc.Rpc<"find", Schema.Struct<{
    text: Schema.String;
    options: Schema.optionalKey<Schema.Struct<{
        readonly forward: Schema.optionalKey<Schema.Boolean>;
        readonly matchCase: Schema.optionalKey<Schema.Boolean>;
    }>>;
}>, RpcSchema.Stream<Schema.Struct<{
    readonly activeMatchOrdinal: Schema.Int;
    readonly matches: Schema.Int;
    readonly selectionArea: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly finalUpdate: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"findNext", Schema.Struct<{
    forward: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"forward", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"history", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly index: Schema.Int;
    readonly entries: Schema.$Array<Schema.Struct<{
        readonly url: Schema.String;
        readonly title: Schema.String;
    }>>;
    readonly canGoBack: Schema.Boolean;
    readonly canGoForward: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"navigate", Schema.Struct<{
    url: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setZoom", Schema.Struct<{
    factor: Schema.Finite;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"state", Schema.Void, RpcSchema.Stream<Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"idle">;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"loading">;
    readonly url: Schema.String;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"gone">;
    readonly reason: Schema.String;
    readonly exitCode: Schema.Finite;
}>]>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"stopFind", Schema.Struct<{
    action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"zoom", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly factor: Schema.Finite;
}>, typeof SewedError>, Schema.Never, never, never>, "sewed/binding/guest-tab">;
```

#### `GuestView.WebRtcPolicy`

```ts
const WebRtcPolicy: Schema.Literals<readonly ["default", "publicInterfaceOnly", "disableNonProxiedUdp"]>;
type WebRtcPolicy = typeof WebRtcPolicy.Type;
```

### `Image`

#### `Image.aspectRatio`

A bitmap's width over its height.

```ts
const aspectRatio: (bitmap: Bitmap) => number;
```

#### `Image.Bitmap`

A decoded bitmap: BGRA, 4 bytes per pixel, row-major, premultiplied by alpha, exactly as
Electron's `nativeImage.toBitmap` lays them out — a color channel above a pixel's own alpha
comes back clamped down to it (a hand-built `[200, 100, 50, 128]` BGRA pixel round-trips
through `toBitmap`/`createFromBitmap` as `[128, 100, 50, 128]`). `compose` only ever copies
bytes, never blends them, so this bites a consumer who hand-builds a translucent bitmap and
later decodes it back through `nativeImage`, not `compose` itself. `bytes.byteLength` must
equal `width * height * 4`; nothing else about the pixel format is checked here, and nothing
here touches Electron — a `Bitmap` is inert data a test can build by hand.

```ts
const Bitmap: Schema.Struct<{
    readonly width: Schema.Int;
    readonly height: Schema.Int;
    readonly bytes: Binary.Bytes;
}>;
type Bitmap = typeof Bitmap.Type;
```

#### `Image.compose`

Copies each layer's pixels onto a copy of `base` at its pixel offset, clipping whatever falls
outside the base's own edges; layers apply in order, so a later one overwrites an earlier one
where they overlap. Pure arithmetic over BGRA bytes: no Electron, no blend modes, no rotation,
no crop — the consumer's need is a composite screenshot, one capture laid over another.

`base` and every layer's `bitmap` are validated against `Bitmap` first, so a wrong byte length
fails `Protocol` naming it rather than reading past the end of a buffer. An empty layer list
still returns a copy of `base`, never the same object.

```ts
const compose: (base: Bitmap, layers: readonly Layer[]) => Bitmap;
```

#### `Image.Layer`

One bitmap placed at a pixel offset onto a base; `compose` clips it at the base's own edges.

```ts
const Layer: Schema.Struct<{
    readonly bitmap: Schema.Struct<{
        readonly width: Schema.Int;
        readonly height: Schema.Int;
        readonly bytes: Binary.Bytes;
    }>;
    readonly x: Schema.Int;
    readonly y: Schema.Int;
}>;
type Layer = typeof Layer.Type;
```

#### `Image.Source`

A path or already-encoded image bytes (PNG, JPEG, and the other formats `nativeImage` reads) —
the one schema every icon door takes: a window's `setIcon` and `setOverlayIcon` in this wave,
the tray and the dock in the next.

```ts
const Source: Schema.Union<readonly [Schema.String, Binary.Bytes]>;
type Source = typeof Source.Type;
```

### `InAppPurchase`

#### `InAppPurchase.Product`

```ts
const Product: Schema.Struct<{
    readonly productIdentifier: Schema.String;
    readonly localizedTitle: Schema.String;
    readonly localizedDescription: Schema.String;
    readonly price: Schema.Finite;
    readonly formattedPrice: Schema.String;
    readonly currencyCode: Schema.String;
    readonly isDownloadable: Schema.Boolean;
}>;
type Product = typeof Product.Type;
```

#### `InAppPurchase.Quantity`

```ts
const Quantity: Schema.Int;
```

#### `InAppPurchase.Transaction`

```ts
const Transaction: Schema.Struct<{
    readonly transactionIdentifier: Schema.String;
    readonly originalTransactionIdentifier: Schema.String;
    readonly transactionDate: Schema.String;
    readonly transactionState: Schema.Literals<readonly ["purchasing", "purchased", "failed", "restored", "deferred"]>;
    readonly errorCode: Schema.Finite;
    readonly errorMessage: Schema.String;
    readonly productIdentifier: Schema.String;
    readonly quantity: Schema.Finite;
}>;
type Transaction = typeof Transaction.Type;
```

#### `InAppPurchase.TransactionState`

```ts
const TransactionState: Schema.Literals<readonly ["purchasing", "purchased", "failed", "restored", "deferred"]>;
type TransactionState = typeof TransactionState.Type;
```

### `Launch`

#### `Launch.Request`

How this process was launched: its own arguments, or a file or URL the platform handed it.

```ts
const Request: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"initial">;
    readonly arguments: Schema.$Array<Schema.String>;
    readonly workingDirectory: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"file">;
    readonly path: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"url">;
    readonly url: Schema.String;
}>]>;
type Request = typeof Request.Type;
```

#### `Launch.SecondInstance`

A later launch of the application while this process holds the single-instance lock: the other
process's arguments and working directory, and the JSON `data` it claimed with (`null` when it
claimed with none). Delivered on `App.Instance`'s `launches`, never on `App.launches`.

```ts
const SecondInstance: Schema.Struct<{
    readonly arguments: Schema.$Array<Schema.String>;
    readonly workingDirectory: Schema.String;
    readonly additionalData: Schema.Codec<Schema.Json, Schema.Json, never, never>;
}>;
type SecondInstance = typeof SecondInstance.Type;
```

### `MainContext`

```ts
class MainContext extends MainContext_base {}
```

### `Menu`

#### `Menu.ApplicationItem`

```ts
const ApplicationItem: Schema.Union<readonly [Schema.Struct<{
    readonly id: Schema.String;
    readonly label: Schema.String;
    readonly enabled: Schema.optionalKey<Schema.Boolean>;
    readonly sublabel: Schema.optionalKey<Schema.String>;
    readonly toolTip: Schema.optionalKey<Schema.String>;
    readonly registerAccelerator: Schema.optionalKey<Schema.Boolean>;
    readonly kind: Schema.Literal<"command">;
    readonly accelerator: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly label: Schema.String;
    readonly enabled: Schema.optionalKey<Schema.Boolean>;
    readonly sublabel: Schema.optionalKey<Schema.String>;
    readonly toolTip: Schema.optionalKey<Schema.String>;
    readonly registerAccelerator: Schema.optionalKey<Schema.Boolean>;
    readonly kind: Schema.Literal<"checkbox">;
    readonly checked: Schema.Boolean;
    readonly accelerator: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly label: Schema.String;
    readonly enabled: Schema.optionalKey<Schema.Boolean>;
    readonly sublabel: Schema.optionalKey<Schema.String>;
    readonly toolTip: Schema.optionalKey<Schema.String>;
    readonly registerAccelerator: Schema.optionalKey<Schema.Boolean>;
    readonly kind: Schema.Literal<"radio">;
    readonly checked: Schema.Boolean;
    readonly accelerator: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"separator">;
}>, Schema.Codec<ApplicationSubmenu, ApplicationSubmenu, never, never>, Schema.Struct<{
    readonly kind: Schema.Literal<"role">;
    readonly role: Schema.Literals<readonly ["appMenu", "fileMenu", "editMenu", "viewMenu", "windowMenu", "undo", "redo", "cut", "copy", "paste", "pasteAndMatchStyle", "delete", "selectAll", "reload", "forceReload", "toggleDevTools", "resetZoom", "zoomIn", "zoomOut", "togglefullscreen", "minimize", "close", "about", "quit", "services", "hide", "hideOthers", "unhide", "front", "zoom", "help", "window", "recentDocuments", "clearRecentDocuments", "toggleTabBar", "selectNextTab", "selectPreviousTab", "showAllTabs", "mergeAllWindows", "moveTabToNewWindow", "toggleSpellChecker", "showSubstitutions", "toggleSmartQuotes", "toggleSmartDashes", "toggleTextReplacement", "startSpeaking", "stopSpeaking"]>;
}>]>;
type ApplicationItem = typeof ApplicationItem.Type;
```

#### `Menu.ApplicationOptions`

```ts
const ApplicationOptions: Schema.Struct<{
    readonly items: Schema.NonEmptyArray<Schema.Union<readonly [Schema.Codec<ApplicationSubmenu, ApplicationSubmenu, never, never>, Schema.Struct<{
        readonly kind: Schema.Literal<"role">;
        readonly role: Schema.Literals<readonly ["appMenu", "fileMenu", "editMenu", "viewMenu", "windowMenu"]>;
    }>]>>;
}>;
type ApplicationOptions = typeof ApplicationOptions.Type;
```

#### `Menu.Item`

```ts
const Item: Schema.Union<readonly [Schema.Struct<{
    readonly id: Schema.String;
    readonly label: Schema.String;
    readonly enabled: Schema.optionalKey<Schema.Boolean>;
    readonly sublabel: Schema.optionalKey<Schema.String>;
    readonly toolTip: Schema.optionalKey<Schema.String>;
    readonly registerAccelerator: Schema.optionalKey<Schema.Boolean>;
    readonly kind: Schema.Literal<"command">;
}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly label: Schema.String;
    readonly enabled: Schema.optionalKey<Schema.Boolean>;
    readonly sublabel: Schema.optionalKey<Schema.String>;
    readonly toolTip: Schema.optionalKey<Schema.String>;
    readonly registerAccelerator: Schema.optionalKey<Schema.Boolean>;
    readonly kind: Schema.Literal<"checkbox">;
    readonly checked: Schema.Boolean;
}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly label: Schema.String;
    readonly enabled: Schema.optionalKey<Schema.Boolean>;
    readonly sublabel: Schema.optionalKey<Schema.String>;
    readonly toolTip: Schema.optionalKey<Schema.String>;
    readonly registerAccelerator: Schema.optionalKey<Schema.Boolean>;
    readonly kind: Schema.Literal<"radio">;
    readonly checked: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"separator">;
}>, Schema.Codec<Submenu, Submenu, never, never>]>;
type Item = typeof Item.Type;
```

#### `Menu.PopupOptions`

```ts
const PopupOptions: Schema.Struct<{
    readonly items: Schema.NonEmptyArray<Schema.suspend<Schema.Codec<Submenu | {
        readonly id: string;
        readonly label: string;
        readonly enabled?: boolean;
        readonly sublabel?: string;
        readonly toolTip?: string;
        readonly registerAccelerator?: boolean;
        readonly kind: "command";
    } | {
        readonly id: string;
        readonly label: string;
        readonly enabled?: boolean;
        readonly sublabel?: string;
        readonly toolTip?: string;
        readonly registerAccelerator?: boolean;
        readonly kind: "checkbox";
        readonly checked: boolean;
    } | {
        readonly id: string;
        readonly label: string;
        readonly enabled?: boolean;
        readonly sublabel?: string;
        readonly toolTip?: string;
        readonly registerAccelerator?: boolean;
        readonly kind: "radio";
        readonly checked: boolean;
    } | {
        readonly kind: "separator";
    }, Submenu | {
        readonly id: string;
        readonly label: string;
        readonly enabled?: boolean;
        readonly sublabel?: string;
        readonly toolTip?: string;
        readonly registerAccelerator?: boolean;
        readonly kind: "command";
    } | {
        readonly id: string;
        readonly label: string;
        readonly enabled?: boolean;
        readonly sublabel?: string;
        readonly toolTip?: string;
        readonly registerAccelerator?: boolean;
        readonly kind: "checkbox";
        readonly checked: boolean;
    } | {
        readonly id: string;
        readonly label: string;
        readonly enabled?: boolean;
        readonly sublabel?: string;
        readonly toolTip?: string;
        readonly registerAccelerator?: boolean;
        readonly kind: "radio";
        readonly checked: boolean;
    } | {
        readonly kind: "separator";
    }, never, never>>>;
    readonly position: Schema.optionalKey<Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
    }>>;
}>;
type PopupOptions = typeof PopupOptions.Type;
```

#### `Menu.PopupResult`

```ts
const PopupResult: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"dismissed">;
}>, Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"command">;
    readonly id: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"checkbox">;
    readonly id: Schema.String;
    readonly checked: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"radio">;
    readonly id: Schema.String;
}>]>]>;
type PopupResult = typeof PopupResult.Type;
```

#### `Menu.Role`

```ts
const Role: Schema.Struct<{
    readonly kind: Schema.Literal<"role">;
    readonly role: Schema.Literals<readonly ["appMenu", "fileMenu", "editMenu", "viewMenu", "windowMenu", "undo", "redo", "cut", "copy", "paste", "pasteAndMatchStyle", "delete", "selectAll", "reload", "forceReload", "toggleDevTools", "resetZoom", "zoomIn", "zoomOut", "togglefullscreen", "minimize", "close", "about", "quit", "services", "hide", "hideOthers", "unhide", "front", "zoom", "help", "window", "recentDocuments", "clearRecentDocuments", "toggleTabBar", "selectNextTab", "selectPreviousTab", "showAllTabs", "mergeAllWindows", "moveTabToNewWindow", "toggleSpellChecker", "showSubstitutions", "toggleSmartQuotes", "toggleSmartDashes", "toggleTextReplacement", "startSpeaking", "stopSpeaking"]>;
}>;
type Role = typeof Role.Type;
```

#### `Menu.RoleName`

```ts
const RoleName: Schema.Literals<readonly ["appMenu", "fileMenu", "editMenu", "viewMenu", "windowMenu", "undo", "redo", "cut", "copy", "paste", "pasteAndMatchStyle", "delete", "selectAll", "reload", "forceReload", "toggleDevTools", "resetZoom", "zoomIn", "zoomOut", "togglefullscreen", "minimize", "close", "about", "quit", "services", "hide", "hideOthers", "unhide", "front", "zoom", "help", "window", "recentDocuments", "clearRecentDocuments", "toggleTabBar", "selectNextTab", "selectPreviousTab", "showAllTabs", "mergeAllWindows", "moveTabToNewWindow", "toggleSpellChecker", "showSubstitutions", "toggleSmartQuotes", "toggleSmartDashes", "toggleTextReplacement", "startSpeaking", "stopSpeaking"]>;
type RoleName = typeof RoleName.Type;
```

#### `Menu.Selection`

```ts
const Selection: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"command">;
    readonly id: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"checkbox">;
    readonly id: Schema.String;
    readonly checked: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"radio">;
    readonly id: Schema.String;
}>]>;
type Selection = typeof Selection.Type;
```

#### `Menu.SharingItem`

Content for the macOS share sheet; at least one list must carry an entry.

```ts
const SharingItem: Schema.Struct<{
    readonly urls: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly filePaths: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly texts: Schema.optionalKey<Schema.$Array<Schema.String>>;
}>;
type SharingItem = typeof SharingItem.Type;
```

### `NativeTheme`

#### `NativeTheme.capability`

The whole theme surface as one capability: `NativeTheme.native` in `sewed/main` carries the
options, `Capability.client` reaches it from a document, and `Testing.NativeTheme.memory`
stands in for tests.

```ts
const capability: Capability.Capability<Rpc.Rpc<"setSource", Schema.Struct<{
    source: Schema.Literals<readonly ["system", "light", "dark"]>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"state", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly source: Schema.Literals<readonly ["system", "light", "dark"]>;
    readonly shouldUseDarkColors: Schema.Boolean;
    readonly shouldUseHighContrastColors: Schema.Boolean;
    readonly shouldUseInvertedColorScheme: Schema.Boolean;
    readonly inForcedColorsMode: Schema.Boolean;
    readonly prefersReducedTransparency: Schema.Boolean;
    /** Present on macOS: the user asked for shapes or text beside color differences. */
    readonly shouldDifferentiateWithoutColor: Schema.optionalKey<Schema.Boolean>;
    /** Present on macOS and Windows: whether the taskbar, menu bar and tray are dark. */
    readonly shouldUseDarkColorsForSystemIntegratedUI: Schema.optionalKey<Schema.Boolean>;
}>, typeof SewedError>, Schema.Never, never, never>, "sewed/binding/native-theme">;
```

#### `NativeTheme.Options`

What a theme capability may do. Every Layer that carries these options checks before the
platform runs, so a served renderer call meets the same rules a main-side call does.

```ts
interface Options {
  /** Whether callers may change the theme source; observing is always allowed. */
  readonly allowSetSource?: boolean;
}
```

#### `NativeTheme.protocol`

```ts
const protocol: RpcGroup.RpcGroup<Rpc.Rpc<"setSource", Schema.Struct<{
    source: Schema.Literals<readonly ["system", "light", "dark"]>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"state", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly source: Schema.Literals<readonly ["system", "light", "dark"]>;
    readonly shouldUseDarkColors: Schema.Boolean;
    readonly shouldUseHighContrastColors: Schema.Boolean;
    readonly shouldUseInvertedColorScheme: Schema.Boolean;
    readonly inForcedColorsMode: Schema.Boolean;
    readonly prefersReducedTransparency: Schema.Boolean;
    /** Present on macOS: the user asked for shapes or text beside color differences. */
    readonly shouldDifferentiateWithoutColor: Schema.optionalKey<Schema.Boolean>;
    /** Present on macOS and Windows: whether the taskbar, menu bar and tray are dark. */
    readonly shouldUseDarkColorsForSystemIntegratedUI: Schema.optionalKey<Schema.Boolean>;
}>, typeof SewedError>, Schema.Never, never, never>>;
```

#### `NativeTheme.Source`

```ts
const Source: Schema.Literals<readonly ["system", "light", "dark"]>;
type Source = typeof Source.Type;
```

#### `NativeTheme.State`

```ts
const State: Schema.Struct<{
    readonly source: Schema.Literals<readonly ["system", "light", "dark"]>;
    readonly shouldUseDarkColors: Schema.Boolean;
    readonly shouldUseHighContrastColors: Schema.Boolean;
    readonly shouldUseInvertedColorScheme: Schema.Boolean;
    readonly inForcedColorsMode: Schema.Boolean;
    readonly prefersReducedTransparency: Schema.Boolean;
    /** Present on macOS: the user asked for shapes or text beside color differences. */
    readonly shouldDifferentiateWithoutColor: Schema.optionalKey<Schema.Boolean>;
    /** Present on macOS and Windows: whether the taskbar, menu bar and tray are dark. */
    readonly shouldUseDarkColorsForSystemIntegratedUI: Schema.optionalKey<Schema.Boolean>;
}>;
type State = typeof State.Type;
```

### `Navigation`

#### `Navigation.compile`

Compiles validated rule data into URL predicates, in order. Each rule already validated itself at
decode time (`UrlRule.Rule`'s discriminated shapes, `WebRequest.Pattern`'s own filter), so this
never throws on a value that decoded successfully.

```ts
const compile: (rules: Rules) => readonly ((url: URL) => boolean)[];
```

#### `Navigation.Policy`

A navigation policy: it names the least it needs from an event — a `url` — so it installs on both
`WebContents.Navigation` (whose event also carries `kind`) and `WebContents.Popup`. An unparseable
URL is a miss, answered {@link Decision.Pass} like every other miss, per the policy rule in
`Decision.Policy`'s own doc.

```ts
const Policy: Decision.Policy<readonly (string | {
    readonly kind: "origin";
    readonly origin: string;
} | {
    readonly kind: "document";
    readonly url: string;
})[], {
    readonly url: string;
}, "allow">;
```

#### `Navigation.Rules`

A navigation rule: an origin/document rule (`UrlRule.Rule`) or a Chromium match pattern
(`WebRequest.Pattern`, such as `https://*.example.com/*`). One shape replaces the two separate
navigation schemas `WebContents.NavigationPolicy` and `GuestView.NavigationPolicy` used to be,
so a policy compiled from it works identically wherever a navigation decidable is gated by one.

```ts
const Rules: Schema.$Array<Schema.Union<readonly [Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"origin">;
    readonly origin: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"document">;
    readonly url: Schema.String;
}>]>, Schema.String]>>;
type Rules = typeof Rules.Type;
```

### `Net`

#### `Net.CipherSuite`

A 16-bit TLS cipher suite identifier, as in `0xC002`.

```ts
const CipherSuite: Schema.Int;
```

#### `Net.Emulation`

Network conditions a session emulates. `offline` cuts the session off; `latency` is the round
trip in milliseconds and the throughputs are in bytes per second, where zero leaves that
dimension unthrottled.

```ts
const Emulation: Schema.Struct<{
    readonly offline: Schema.optionalKey<Schema.Boolean>;
    readonly latency: Schema.optionalKey<Schema.Finite>;
    readonly downloadThroughput: Schema.optionalKey<Schema.Finite>;
    readonly uploadThroughput: Schema.optionalKey<Schema.Finite>;
}>;
type Emulation = typeof Emulation.Type;
```

#### `Net.Endpoint`

```ts
const Endpoint: Schema.Struct<{
    readonly address: Schema.String;
    readonly family: Schema.Literals<readonly ["ipv4", "ipv6", "unspec"]>;
}>;
type Endpoint = typeof Endpoint.Type;
```

#### `Net.ResolvedHost`

```ts
const ResolvedHost: Schema.Struct<{
    readonly endpoints: Schema.$Array<Schema.Struct<{
        readonly address: Schema.String;
        readonly family: Schema.Literals<readonly ["ipv4", "ipv6", "unspec"]>;
    }>>;
}>;
type ResolvedHost = typeof ResolvedHost.Type;
```

#### `Net.ResolveHostOptions`

Options for resolving a host through a session's resolver.

```ts
const ResolveHostOptions: Schema.Struct<{
    readonly queryType: Schema.optionalKey<Schema.Literals<readonly ["A", "AAAA"]>>;
    readonly source: Schema.optionalKey<Schema.Literals<readonly ["any", "system", "dns", "mdns", "localOnly"]>>;
    readonly cacheUsage: Schema.optionalKey<Schema.Literals<readonly ["allowed", "staleAllowed", "disallowed"]>>;
    readonly secureDnsPolicy: Schema.optionalKey<Schema.Literals<readonly ["allow", "disable"]>>;
}>;
type ResolveHostOptions = typeof ResolveHostOptions.Type;
```

#### `Net.SSLConfig`

The TLS versions and cipher suites a session accepts for new connections. TLS 1.3 suites cannot
be disabled this way.

```ts
const SSLConfig: Schema.Struct<{
    readonly minVersion: Schema.optionalKey<Schema.Literals<readonly ["tls1", "tls1.1", "tls1.2", "tls1.3"]>>;
    readonly maxVersion: Schema.optionalKey<Schema.Literals<readonly ["tls1.2", "tls1.3"]>>;
    readonly disabledCipherSuites: Schema.optionalKey<Schema.$Array<Schema.Int>>;
}>;
type SSLConfig = typeof SSLConfig.Type;
```

#### `Net.WebSocketClose`

Why a WebSocket closed.

```ts
const WebSocketClose: Schema.Struct<{
    readonly code: Schema.Finite;
    readonly reason: Schema.String;
    readonly wasClean: Schema.Boolean;
}>;
type WebSocketClose = typeof WebSocketClose.Type;
```

#### `Net.WebSocketOptions`

How a main-process WebSocket connects: sub-protocols, extra handshake headers, and an origin.

```ts
const WebSocketOptions: Schema.Struct<{
    readonly protocols: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly headers: Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>;
    readonly origin: Schema.optionalKey<Schema.String>;
}>;
type WebSocketOptions = typeof WebSocketOptions.Type;
```

### `NetLog`

#### `NetLog.CaptureMode`

```ts
const CaptureMode: Schema.Literals<readonly ["default", "includeSensitive", "everything"]>;
type CaptureMode = typeof CaptureMode.Type;
```

#### `NetLog.Options`

```ts
const Options: Schema.Struct<{
    readonly captureMode: Schema.optionalKey<Schema.Literals<readonly ["default", "includeSensitive", "everything"]>>;
    readonly maxFileSize: Schema.optionalKey<Schema.Int>;
}>;
type Options = typeof Options.Type;
```

### `Notification`

#### `Notification.Action`

```ts
const Action: Schema.Struct<{
    readonly id: Schema.String;
    readonly text: Schema.String;
}>;
type Action = typeof Action.Type;
```

#### `Notification.Activation`

A Windows toast the user acted on, including one that launched the application: the toast's own
`arguments` string, the action's index when a button was pressed, and what the user typed.

```ts
const Activation: Schema.Struct<{
    readonly type: Schema.String;
    readonly arguments: Schema.String;
    readonly actionIndex: Schema.optionalKey<Schema.Finite>;
    readonly reply: Schema.optionalKey<Schema.String>;
    readonly userInputs: Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>;
}>;
type Activation = typeof Activation.Type;
```

#### `Notification.capability`

The whole notification surface as one capability: `Notification.native` in `sewed/main` provides
it, `Capability.client` reaches it from a document, and `Testing.Notification.memory` stands in
for tests. The surface carries no policy; the options are checked on every call.

```ts
const capability: Capability.Capability<Rpc.Rpc<"show", Schema.Struct<{
    readonly title: Schema.String;
    readonly body: Schema.optionalKey<Schema.String>;
    readonly subtitle: Schema.optionalKey<Schema.String>;
    readonly silent: Schema.optionalKey<Schema.Boolean>;
    readonly urgency: Schema.optionalKey<Schema.Literals<readonly ["normal", "critical", "low"]>>;
    readonly timeout: Schema.optionalKey<Schema.Literals<readonly ["default", "never"]>>;
    readonly icon: Schema.optionalKey<Schema.String>;
    readonly actions: Schema.optionalKey<Schema.NonEmptyArray<Schema.Struct<{
        readonly id: Schema.String;
        readonly text: Schema.String;
    }>>>;
    readonly reply: Schema.optionalKey<Schema.Struct<{
        readonly placeholder: Schema.String;
    }>>;
    readonly closeButtonText: Schema.optionalKey<Schema.String>;
    /** An identifier that survives the notification object, on macOS and Windows. */
    readonly id: Schema.optionalKey<Schema.String>;
    /** Groups notifications in Notification Center and the Action Center. */
    readonly groupId: Schema.optionalKey<Schema.String>;
    /** The header a Windows group is shown under. */
    readonly groupTitle: Schema.optionalKey<Schema.String>;
    /** The name of a sound to play, on macOS. */
    readonly sound: Schema.optionalKey<Schema.String>;
    /** A whole Windows toast as XML, replacing the fields above. */
    readonly toastXml: Schema.optionalKey<Schema.String>;
}>, RpcSchema.Stream<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"shown">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"clicked">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"action">;
    readonly id: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"replied">;
    readonly text: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"closed">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"failed">;
    readonly message: Schema.String;
}>]>, typeof SewedError>, Schema.Never, never, never>, "sewed/binding/notification">;
```

#### `Notification.Delivered`

A notification still delivered in the macOS Notification Center.

```ts
const Delivered: Schema.Struct<{
    readonly id: Schema.String;
    readonly groupId: Schema.String;
    readonly title: Schema.String;
    readonly subtitle: Schema.String;
    readonly body: Schema.String;
}>;
type Delivered = typeof Delivered.Type;
```

#### `Notification.Event`

```ts
const Event: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"shown">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"clicked">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"action">;
    readonly id: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"replied">;
    readonly text: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"closed">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"failed">;
    readonly message: Schema.String;
}>]>;
type Event = typeof Event.Type;
```

#### `Notification.Options`

```ts
const Options: Schema.Struct<{
    readonly title: Schema.String;
    readonly body: Schema.optionalKey<Schema.String>;
    readonly subtitle: Schema.optionalKey<Schema.String>;
    readonly silent: Schema.optionalKey<Schema.Boolean>;
    readonly urgency: Schema.optionalKey<Schema.Literals<readonly ["normal", "critical", "low"]>>;
    readonly timeout: Schema.optionalKey<Schema.Literals<readonly ["default", "never"]>>;
    readonly icon: Schema.optionalKey<Schema.String>;
    readonly actions: Schema.optionalKey<Schema.NonEmptyArray<Schema.Struct<{
        readonly id: Schema.String;
        readonly text: Schema.String;
    }>>>;
    readonly reply: Schema.optionalKey<Schema.Struct<{
        readonly placeholder: Schema.String;
    }>>;
    readonly closeButtonText: Schema.optionalKey<Schema.String>;
    /** An identifier that survives the notification object, on macOS and Windows. */
    readonly id: Schema.optionalKey<Schema.String>;
    /** Groups notifications in Notification Center and the Action Center. */
    readonly groupId: Schema.optionalKey<Schema.String>;
    /** The header a Windows group is shown under. */
    readonly groupTitle: Schema.optionalKey<Schema.String>;
    /** The name of a sound to play, on macOS. */
    readonly sound: Schema.optionalKey<Schema.String>;
    /** A whole Windows toast as XML, replacing the fields above. */
    readonly toastXml: Schema.optionalKey<Schema.String>;
}>;
type Options = typeof Options.Type;
```

#### `Notification.protocol`

One request is one notification: its stream ends when the notification closes, and interrupting the request closes it.

```ts
const protocol: RpcGroup.RpcGroup<Rpc.Rpc<"show", Schema.Struct<{
    readonly title: Schema.String;
    readonly body: Schema.optionalKey<Schema.String>;
    readonly subtitle: Schema.optionalKey<Schema.String>;
    readonly silent: Schema.optionalKey<Schema.Boolean>;
    readonly urgency: Schema.optionalKey<Schema.Literals<readonly ["normal", "critical", "low"]>>;
    readonly timeout: Schema.optionalKey<Schema.Literals<readonly ["default", "never"]>>;
    readonly icon: Schema.optionalKey<Schema.String>;
    readonly actions: Schema.optionalKey<Schema.NonEmptyArray<Schema.Struct<{
        readonly id: Schema.String;
        readonly text: Schema.String;
    }>>>;
    readonly reply: Schema.optionalKey<Schema.Struct<{
        readonly placeholder: Schema.String;
    }>>;
    readonly closeButtonText: Schema.optionalKey<Schema.String>;
    /** An identifier that survives the notification object, on macOS and Windows. */
    readonly id: Schema.optionalKey<Schema.String>;
    /** Groups notifications in Notification Center and the Action Center. */
    readonly groupId: Schema.optionalKey<Schema.String>;
    /** The header a Windows group is shown under. */
    readonly groupTitle: Schema.optionalKey<Schema.String>;
    /** The name of a sound to play, on macOS. */
    readonly sound: Schema.optionalKey<Schema.String>;
    /** A whole Windows toast as XML, replacing the fields above. */
    readonly toastXml: Schema.optionalKey<Schema.String>;
}>, RpcSchema.Stream<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"shown">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"clicked">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"action">;
    readonly id: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"replied">;
    readonly text: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"closed">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"failed">;
    readonly message: Schema.String;
}>]>, typeof SewedError>, Schema.Never, never, never>>;
```

#### `Notification.Timeout`

```ts
const Timeout: Schema.Literals<readonly ["default", "never"]>;
type Timeout = typeof Timeout.Type;
```

#### `Notification.Urgency`

```ts
const Urgency: Schema.Literals<readonly ["normal", "critical", "low"]>;
type Urgency = typeof Urgency.Type;
```

### `Permission`

#### `Permission.MediaType`

```ts
const MediaType: Schema.Literals<readonly ["audio", "video"]>;
type MediaType = typeof MediaType.Type;
```

#### `Permission.Name`

```ts
const Name: Schema.Literals<readonly ["notifications", "geolocation", "fullscreen", "pointerLock", "media", "clipboard-read", "clipboard-sanitized-write", "persistent-storage", "screen-wake-lock", "hid", "serial", "usb"]>;
type Name = typeof Name.Type;
```

#### `Permission.Policy`

A permission policy: it names the least it needs from an event —
`{ name, origin, document, mediaTypes }`, the flat shape `Decidables.Session.Permission` shares
between a permission check and a device check. An **origin** rule is answered from `origin`
alone, and misses when it is `null` (an opaque origin — `file:`, `data:` — names nothing); a
**document** rule is answered only from `document`, so a device check (`document: null`) is
never granted by a document rule, even one whose document happens to key the same origin. This
is deliberately tighter than base, where a root-document rule granted a device check because its
origin URL happened to share that document key.

A rule whose own `mediaTypes` is set grants a request only when every type the event asks for is
among them — `event.mediaTypes.every(...)`, vacuously true for a non-media event's empty list, so
it never blocks a permission the rule already names outside `media`. A rule with no `mediaTypes`
grants any media request, exactly as it did before this field existed.

```ts
const Policy: Decision.Policy<readonly ({
    readonly kind: "origin";
    readonly origin: string;
    readonly permissions: readonly ["clipboard-read" | "clipboard-sanitized-write" | "fullscreen" | "geolocation" | "hid" | "media" | "notifications" | "persistent-storage" | "pointerLock" | "screen-wake-lock" | "serial" | "usb", ...("clipboard-read" | "clipboard-sanitized-write" | "fullscreen" | "geolocation" | "hid" | "media" | "notifications" | "persistent-storage" | "pointerLock" | "screen-wake-lock" | "serial" | "usb")[]];
    readonly mediaTypes?: readonly ["audio" | "video", ...("audio" | "video")[]];
} | {
    readonly kind: "document";
    readonly url: string;
    readonly permissions: readonly ["clipboard-read" | "clipboard-sanitized-write" | "fullscreen" | "geolocation" | "hid" | "media" | "notifications" | "persistent-storage" | "pointerLock" | "screen-wake-lock" | "serial" | "usb", ...("clipboard-read" | "clipboard-sanitized-write" | "fullscreen" | "geolocation" | "hid" | "media" | "notifications" | "persistent-storage" | "pointerLock" | "screen-wake-lock" | "serial" | "usb")[]];
    readonly mediaTypes?: readonly ["audio" | "video", ...("audio" | "video")[]];
})[], {
    readonly name: string;
    readonly origin: string | null;
    readonly document: string | null;
    readonly mediaTypes: readonly MediaType[];
}, "allow">;
```

#### `Permission.Rule`

```ts
const Rule: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"origin">;
    readonly origin: Schema.String;
    readonly permissions: Schema.NonEmptyArray<Schema.Literals<readonly ["notifications", "geolocation", "fullscreen", "pointerLock", "media", "clipboard-read", "clipboard-sanitized-write", "persistent-storage", "screen-wake-lock", "hid", "serial", "usb"]>>;
    readonly mediaTypes: Schema.optionalKey<Schema.NonEmptyArray<Schema.Literals<readonly ["audio", "video"]>>>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"document">;
    readonly url: Schema.String;
    readonly permissions: Schema.NonEmptyArray<Schema.Literals<readonly ["notifications", "geolocation", "fullscreen", "pointerLock", "media", "clipboard-read", "clipboard-sanitized-write", "persistent-storage", "screen-wake-lock", "hid", "serial", "usb"]>>;
    readonly mediaTypes: Schema.optionalKey<Schema.NonEmptyArray<Schema.Literals<readonly ["audio", "video"]>>>;
}>]>;
```

#### `Permission.Rules`

```ts
const Rules: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"origin">;
    readonly origin: Schema.String;
    readonly permissions: Schema.NonEmptyArray<Schema.Literals<readonly ["notifications", "geolocation", "fullscreen", "pointerLock", "media", "clipboard-read", "clipboard-sanitized-write", "persistent-storage", "screen-wake-lock", "hid", "serial", "usb"]>>;
    readonly mediaTypes: Schema.optionalKey<Schema.NonEmptyArray<Schema.Literals<readonly ["audio", "video"]>>>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"document">;
    readonly url: Schema.String;
    readonly permissions: Schema.NonEmptyArray<Schema.Literals<readonly ["notifications", "geolocation", "fullscreen", "pointerLock", "media", "clipboard-read", "clipboard-sanitized-write", "persistent-storage", "screen-wake-lock", "hid", "serial", "usb"]>>;
    readonly mediaTypes: Schema.optionalKey<Schema.NonEmptyArray<Schema.Literals<readonly ["audio", "video"]>>>;
}>]>>;
type Rules = typeof Rules.Type;
```

### `PowerMonitor`

#### `PowerMonitor.capability`

The whole power surface as one capability: `PowerMonitor.native` in `sewed/main` provides it,
`Capability.client` reaches it from a document, and `Testing.PowerMonitor.memory` stands in for
tests. The surface carries no policy; the idle threshold is checked on every call.

```ts
const capability: Capability.Capability<Rpc.Rpc<"events", Schema.Void, RpcSchema.Stream<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"suspend">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"resume">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"power-source">;
    readonly onBattery: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"screen">;
    readonly locked: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"user">;
    readonly active: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"shutdown">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"thermal">;
    readonly state: Schema.Literals<readonly ["unknown", "nominal", "fair", "serious", "critical"]>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"speed-limit">;
    readonly limit: Schema.Finite;
}>]>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"state", Schema.Struct<{
    idleThresholdSeconds: Schema.Int;
}>, Schema.Struct<{
    readonly onBattery: Schema.Boolean;
    readonly idleSeconds: Schema.Finite;
    readonly idleState: Schema.Literals<readonly ["active", "idle", "locked", "unknown"]>;
    readonly thermal: Schema.Literals<readonly ["unknown", "nominal", "fair", "serious", "critical"]>;
}>, typeof SewedError, never, never>, "sewed/binding/power-monitor">;
```

#### `PowerMonitor.Event`

```ts
const Event: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"suspend">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"resume">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"power-source">;
    readonly onBattery: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"screen">;
    readonly locked: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"user">;
    readonly active: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"shutdown">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"thermal">;
    readonly state: Schema.Literals<readonly ["unknown", "nominal", "fair", "serious", "critical"]>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"speed-limit">;
    readonly limit: Schema.Finite;
}>]>;
type Event = typeof Event.Type;
```

#### `PowerMonitor.IdleState`

```ts
const IdleState: Schema.Literals<readonly ["active", "idle", "locked", "unknown"]>;
type IdleState = typeof IdleState.Type;
```

#### `PowerMonitor.IdleThreshold`

```ts
const IdleThreshold: Schema.Int;
```

#### `PowerMonitor.protocol`

```ts
const protocol: RpcGroup.RpcGroup<Rpc.Rpc<"events", Schema.Void, RpcSchema.Stream<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"suspend">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"resume">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"power-source">;
    readonly onBattery: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"screen">;
    readonly locked: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"user">;
    readonly active: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"shutdown">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"thermal">;
    readonly state: Schema.Literals<readonly ["unknown", "nominal", "fair", "serious", "critical"]>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"speed-limit">;
    readonly limit: Schema.Finite;
}>]>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"state", Schema.Struct<{
    idleThresholdSeconds: Schema.Int;
}>, Schema.Struct<{
    readonly onBattery: Schema.Boolean;
    readonly idleSeconds: Schema.Finite;
    readonly idleState: Schema.Literals<readonly ["active", "idle", "locked", "unknown"]>;
    readonly thermal: Schema.Literals<readonly ["unknown", "nominal", "fair", "serious", "critical"]>;
}>, typeof SewedError, never, never>>;
```

#### `PowerMonitor.State`

```ts
const State: Schema.Struct<{
    readonly onBattery: Schema.Boolean;
    readonly idleSeconds: Schema.Finite;
    readonly idleState: Schema.Literals<readonly ["active", "idle", "locked", "unknown"]>;
    readonly thermal: Schema.Literals<readonly ["unknown", "nominal", "fair", "serious", "critical"]>;
}>;
type State = typeof State.Type;
```

#### `PowerMonitor.ThermalState`

```ts
const ThermalState: Schema.Literals<readonly ["unknown", "nominal", "fair", "serious", "critical"]>;
type ThermalState = typeof ThermalState.Type;
```

### `PowerSaveBlocker`

#### `PowerSaveBlocker.Kind`

```ts
const Kind: Schema.Literals<readonly ["prevent-app-suspension", "prevent-display-sleep"]>;
type Kind = typeof Kind.Type;
```

### `Protocol`

#### `Protocol.definition`

```ts
const definition: (value: Scheme) => SchemeDefinition | undefined;
```

#### `Protocol.Handler`

```ts
type Handler<E = never, R = never> = (
  request: HttpServerRequest.HttpServerRequest,
) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R | Scope.Scope>;
```

#### `Protocol.Privileges`

```ts
const Privileges: Schema.Struct<{
    readonly standard: Schema.optionalKey<Schema.Boolean>;
    readonly secure: Schema.optionalKey<Schema.Boolean>;
    readonly supportFetchAPI: Schema.optionalKey<Schema.Boolean>;
    readonly corsEnabled: Schema.optionalKey<Schema.Boolean>;
    readonly stream: Schema.optionalKey<Schema.Boolean>;
    readonly serviceWorkers: Schema.optionalKey<Schema.Boolean>;
    readonly codeCache: Schema.optionalKey<Schema.Boolean>;
}>;
type Privileges = typeof Privileges.Type;
```

#### `Protocol.Request`

```ts
type Request = HttpServerRequest.HttpServerRequest;
```

#### `Protocol.Response`

```ts
type Response = HttpServerResponse.HttpServerResponse;
```

#### `Protocol.Route`

One route of a file-served scheme: URLs matching `host` and the `path` prefix are served from
the directory `root`, with `index` for a path ending in a slash and `headers` on every response.

```ts
const Route: Schema.Struct<{
    readonly host: Schema.optionalKey<Schema.String>;
    readonly path: Schema.optionalKey<Schema.String>;
    readonly root: Schema.String;
    readonly index: Schema.optionalKey<Schema.String>;
    readonly headers: Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>;
}>;
type Route = typeof Route.Type;
```

#### `Protocol.scheme`

Creates an inert protocol definition. Native registration happens in `App.run`.

```ts
const scheme: (name: string, privileges?: Privileges) => Scheme;
```

#### `Protocol.Scheme`

```ts
interface Scheme {
  readonly [schemeIdentity]: true;
}
```

#### `Protocol.SchemeDefinition`

```ts
interface SchemeDefinition {
  readonly name: string;
  readonly privileges: Privileges;
}
```

#### `Protocol.WebHandler`

The web's own request/response shape `handleWeb` takes: no `HttpServerRequest`/
`HttpServerResponse` wrapping, `signal` aborts the same way a registration's teardown or the
native request's own cancellation would tell any other cancellable call, and a thrown or
rejected answer fails the request the way a `Handler`'s own failure does.

```ts
type WebHandler = (
  request: globalThis.Request,
) => globalThis.Response | Promise<globalThis.Response>;
```

### `Proxy`

#### `Proxy.Config`

A session's proxy configuration, one mode at a time.

```ts
const Config: Schema.Union<readonly [Schema.Struct<{
    readonly mode: Schema.Literal<"direct">;
}>, Schema.Struct<{
    readonly mode: Schema.Literal<"system">;
}>, Schema.Struct<{
    readonly mode: Schema.Literal<"auto_detect">;
}>, Schema.Struct<{
    readonly mode: Schema.Literal<"pac_script">;
    readonly pacScript: Schema.String;
}>, Schema.Struct<{
    readonly mode: Schema.Literal<"fixed_servers">;
    readonly proxyRules: Schema.String;
    readonly proxyBypassRules: Schema.optionalKey<Schema.String>;
}>]>;
type Config = typeof Config.Type;
```

### `Remote`

#### `Remote.acquire`

```ts
const acquire: <Payload extends Schema.Top, Rpcs extends Rpc.Any, Failure extends Schema.Top, Wire extends Rpc.Any>(definition: Definition<Payload, Rpcs, Failure, Wire>, slot: Slot<NoInfer<Wire>>, payload: Payload["~type.make.in"]) => Effect.Effect<Handle<Rpcs, Failure>, RemoteError<Failure>, RuntimeContext.ClientContext | Scope.Scope | Rpc.MiddlewareClient<Wire> | Payload["EncodingServices"] | Failure["DecodingServices"]>;
```

#### `Remote.Definition`

```ts
interface Definition<
  Payload extends Schema.Top,
  Rpcs extends Rpc.Any,
  Failure extends Schema.Top,
  Wire extends Rpc.Any = WireRpcs<Rpcs, Payload, Failure>,
> {
  readonly payload: Payload;
  readonly protocol: RpcGroup.RpcGroup<Wire>;
  readonly methods: RpcGroup.RpcGroup<Rpcs>;
  readonly error: Failure;
  readonly [definitionType]: {
    readonly payload: Payload;
    readonly rpcs: Rpcs;
    readonly failure: Failure;
    readonly wire: Wire;
  };
}
```

#### `Remote.Handle`

```ts
interface Handle<Rpcs extends Rpc.Any, Failure extends Schema.Top> {
  readonly client: BindingClient<Rpcs>;
  readonly release: Effect.Effect<
    void,
    RemoteError<Failure>,
    ClientContext | Rpc.MiddlewareClient<Rpcs>
  >;
}
```

#### `Remote.layer`

```ts
const layer: <Payload extends Schema.Top, Rpcs extends Rpc.Any, Failure extends Schema.Top, Wire extends Rpc.Any, R>(definition: Definition<Payload, Rpcs, Failure, Wire>, build: (payload: Payload["Type"]) => Layer.Layer<NoInfer<Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs>>, Failure["Type"] | SewedError, R>) => Layer.Layer<HandlerServices<Wire>, Failure["Type"] | SewedError, R | Rpc.ServicesServer<Wire>>;
```

#### `Remote.make`

```ts
const make: <Payload extends Schema.Top, Rpcs extends Rpc.Any, Failure extends Schema.Top = Schema.Never>(options: {
    readonly payload: Payload;
    readonly protocol: RpcGroup.RpcGroup<Rpcs>;
    readonly error?: Failure | undefined;
}) => Definition<Payload, Rpcs, Failure, WireRpcs<Rpcs, Payload, Failure>>;
```

### `Renderer`

#### `Renderer.entry`

```ts
const entry: <Keys extends string>(url: URL, options: {
    readonly bindings: readonly Declaration<Keys>[];
}) => Entry<Keys>;
```

#### `Renderer.Entry`

The slot keys this document declares; main's `load` must bind exactly these.

```ts
interface Entry<Keys extends string = string> {
  readonly url: URL;
  readonly bindings: readonly Declaration<Keys>[];
}
```

#### `Renderer.inline`

A document main writes itself, with nothing behind it: a `data:text/html;base64,…` entry with
no bindings, since a `data:` page has an opaque origin and cannot load the renderer runtime.
Use it for a message with no capability behind it, such as a crash-loop breaker's parked page
or a fatal notice; a page that offers an action needs a `local` document bound to a capability
instead. Refuses an empty string with `Protocol`.

```ts
const inline: (html: string) => Entry<never>;
```

#### `Renderer.local`

A document shipped with the application: `path` resolves against `importMetaUrl` to a `file:`
URL, exactly as `entry(new URL(path, importMetaUrl), options)` would. `window.webContents.load`
checks that the resolved file exists before it configures the bridge or navigates, failing
`Protocol` and naming the path when it does not — this constructor stays inert and does no
filesystem work itself. Refuses, all with `Protocol` naming the path rather than an
undocumented `URIError` or a document outside the application: a `path` the URL constructor
cannot resolve (a bare `%` not part of a percent-escape, for instance); a `path` whose
resolved URL is not `file:` (an absolute `http:`/`https:` path, or `importMetaUrl` itself not
a `file:` URL); and a `path` that resolves above `importMetaUrl`'s own directory (a `..`
escape).

```ts
const local: <Keys extends string = never>(path: string, importMetaUrl: string, options?: {
    readonly bindings: readonly Declaration<Keys>[];
}) => Entry<Keys>;
```

#### `Renderer.pathOf`

The native path of a file the user dropped or chose in this document. Files that did not
come from the desktop have no path and fail with `Protocol`; the preload bridge answers
synchronously, so no main policy is involved: the user disclosed the file.

```ts
const pathOf: (file: File) => Effect.Effect<string, SewedError, RendererContext>;
```

#### `Renderer.run`

```ts
const run: <E>(entry: Entry, setup: Effect.Effect<unknown, E, RendererContext | ClientContext | Scope.Scope>) => Fiber.Fiber<void, E | SewedError>;
```

### `RendererContext`

```ts
class RendererContext extends RendererContext_base {}
```

### `SafeStorage`

#### `SafeStorage.Availability`

```ts
const Availability: Schema.Struct<{
    readonly available: Schema.Boolean;
    readonly backend: Schema.String;
}>;
type Availability = typeof Availability.Type;
```

#### `SafeStorage.Sealed`

Ciphertext with the backend that produced it, so stored secrets stay attributable across OS changes.

```ts
const Sealed: Schema.Struct<{
    readonly version: Schema.Literal<1>;
    readonly backend: Schema.String;
    readonly bytes: Binary.Bytes;
}>;
type Sealed = typeof Sealed.Type;
```

### `Screen`

#### `Screen.Bounds`

```ts
const Bounds: Schema.Struct<{
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
    readonly width: Schema.Finite;
    readonly height: Schema.Finite;
}>;
type Bounds = typeof Bounds.Type;
```

#### `Screen.Change`

```ts
const Change: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"added">;
    readonly display: Schema.Struct<{
        readonly id: Schema.Finite;
        readonly label: Schema.String;
        readonly bounds: Schema.Struct<{
            readonly x: Schema.Finite;
            readonly y: Schema.Finite;
            readonly width: Schema.Finite;
            readonly height: Schema.Finite;
        }>;
        readonly workArea: Schema.Struct<{
            readonly x: Schema.Finite;
            readonly y: Schema.Finite;
            readonly width: Schema.Finite;
            readonly height: Schema.Finite;
        }>;
        readonly scaleFactor: Schema.Finite;
        readonly rotation: Schema.Finite;
        readonly internal: Schema.Boolean;
    }>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"removed">;
    readonly display: Schema.Struct<{
        readonly id: Schema.Finite;
        readonly label: Schema.String;
        readonly bounds: Schema.Struct<{
            readonly x: Schema.Finite;
            readonly y: Schema.Finite;
            readonly width: Schema.Finite;
            readonly height: Schema.Finite;
        }>;
        readonly workArea: Schema.Struct<{
            readonly x: Schema.Finite;
            readonly y: Schema.Finite;
            readonly width: Schema.Finite;
            readonly height: Schema.Finite;
        }>;
        readonly scaleFactor: Schema.Finite;
        readonly rotation: Schema.Finite;
        readonly internal: Schema.Boolean;
    }>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"metrics">;
    readonly display: Schema.Struct<{
        readonly id: Schema.Finite;
        readonly label: Schema.String;
        readonly bounds: Schema.Struct<{
            readonly x: Schema.Finite;
            readonly y: Schema.Finite;
            readonly width: Schema.Finite;
            readonly height: Schema.Finite;
        }>;
        readonly workArea: Schema.Struct<{
            readonly x: Schema.Finite;
            readonly y: Schema.Finite;
            readonly width: Schema.Finite;
            readonly height: Schema.Finite;
        }>;
        readonly scaleFactor: Schema.Finite;
        readonly rotation: Schema.Finite;
        readonly internal: Schema.Boolean;
    }>;
    readonly metrics: Schema.$Array<Schema.String>;
}>]>;
type Change = typeof Change.Type;
```

#### `Screen.Display`

```ts
const Display: Schema.Struct<{
    readonly id: Schema.Finite;
    readonly label: Schema.String;
    readonly bounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly workArea: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly scaleFactor: Schema.Finite;
    readonly rotation: Schema.Finite;
    readonly internal: Schema.Boolean;
}>;
type Display = typeof Display.Type;
```

#### `Screen.Point`

```ts
const Point: Schema.Struct<{
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
}>;
type Point = typeof Point.Type;
```

### `ServiceWorker`

#### `ServiceWorker.Event`

```ts
const Event: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"registered">;
    readonly scope: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"status">;
    readonly versionId: Schema.Finite;
    readonly status: Schema.Literals<readonly ["starting", "running", "stopping", "stopped"]>;
}>]>;
type Event = typeof Event.Type;
```

#### `ServiceWorker.Info`

```ts
const Info: Schema.Struct<{
    readonly versionId: Schema.Finite;
    readonly scriptUrl: Schema.String;
    readonly scope: Schema.String;
    readonly renderProcessId: Schema.Finite;
}>;
type Info = typeof Info.Type;
```

#### `ServiceWorker.Started`

A worker that was started, or found running, for a scope.

```ts
const Started: Schema.Struct<{
    readonly versionId: Schema.Finite;
    readonly scope: Schema.String;
    readonly scriptUrl: Schema.String;
}>;
type Started = typeof Started.Type;
```

#### `ServiceWorker.Status`

```ts
const Status: Schema.Literals<readonly ["starting", "running", "stopping", "stopped"]>;
type Status = typeof Status.Type;
```

### `SessionStorage`

#### `SessionStorage.ClearData`

What `Session.clearData` clears. Every data type and every origin unless narrowed; `origins`
and `excludeOrigins` are alternatives. `originMatchingMode` says whether an origin's data is
cleared only where it is the top-level site or wherever it appears.

```ts
const ClearData: Schema.Struct<{
    readonly dataTypes: Schema.optionalKey<Schema.NonEmptyArray<Schema.Literals<readonly ["backgroundFetch", "cache", "cookies", "downloads", "fileSystems", "indexedDB", "localStorage", "serviceWorkers", "webSQL"]>>>;
    readonly origins: Schema.optionalKey<Schema.NonEmptyArray<Schema.String>>;
    readonly excludeOrigins: Schema.optionalKey<Schema.NonEmptyArray<Schema.String>>;
    readonly avoidClosingConnections: Schema.optionalKey<Schema.Boolean>;
    readonly originMatchingMode: Schema.optionalKey<Schema.Literals<readonly ["third-parties-included", "origin-in-all-contexts"]>>;
}>;
type ClearData = typeof ClearData.Type;
```

#### `SessionStorage.ClearOptions`

```ts
const ClearOptions: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"session">;
    readonly storages: Schema.NonEmptyArray<Schema.Literals<readonly ["cookies", "filesystem", "indexdb", "localstorage", "shadercache", "serviceworkers", "cachestorage"]>>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"origin">;
    readonly origin: Schema.String;
    readonly storages: Schema.NonEmptyArray<Schema.Literals<readonly ["localstorage", "indexdb", "serviceworkers", "cachestorage"]>>;
}>]>;
type ClearOptions = typeof ClearOptions.Type;
```

#### `SessionStorage.DataType`

```ts
const DataType: Schema.Literals<readonly ["backgroundFetch", "cache", "cookies", "downloads", "fileSystems", "indexedDB", "localStorage", "serviceWorkers", "webSQL"]>;
type DataType = typeof DataType.Type;
```

#### `SessionStorage.DictionaryEvent`

A spell checker dictionary file being fetched or becoming usable, by language code.

```ts
const DictionaryEvent: Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["initialized", "download-begin", "download-success", "download-failure"]>;
    readonly language: Schema.String;
}>;
type DictionaryEvent = typeof DictionaryEvent.Type;
```

#### `SessionStorage.FileSystemAccess`

A page asking for a file or directory Chromium treats as sensitive.

```ts
const FileSystemAccess: Schema.Struct<{
    readonly origin: Schema.NullOr<Schema.String>;
    readonly document: Schema.NullOr<Schema.String>;
    readonly path: Schema.String;
    readonly isDirectory: Schema.Boolean;
}>;
type FileSystemAccess = typeof FileSystemAccess.Type;
```

#### `SessionStorage.OriginStorage`

```ts
const OriginStorage: Schema.Literals<readonly ["localstorage", "indexdb", "serviceworkers", "cachestorage"]>;
```

#### `SessionStorage.PreloadScript`

A script the session runs before a frame's or a service worker's own scripts, in every web
contents that uses the session. `filePath` must be absolute.

```ts
const PreloadScript: Schema.Struct<{
    readonly type: Schema.Literals<readonly ["frame", "service-worker"]>;
    readonly filePath: Schema.String;
    readonly id: Schema.optionalKey<Schema.String>;
}>;
type PreloadScript = typeof PreloadScript.Type;
```

#### `SessionStorage.RegisteredPreloadScript`

```ts
const RegisteredPreloadScript: Schema.Struct<{
    readonly type: Schema.Literals<readonly ["frame", "service-worker"]>;
    readonly filePath: Schema.String;
    readonly id: Schema.String;
}>;
type RegisteredPreloadScript = typeof RegisteredPreloadScript.Type;
```

#### `SessionStorage.SharedDictionary`

One stored compression dictionary; times are milliseconds since the epoch.

```ts
const SharedDictionary: Schema.Struct<{
    readonly id: Schema.String;
    readonly dictionaryUrl: Schema.String;
    readonly match: Schema.String;
    readonly matchDestinations: Schema.$Array<Schema.String>;
    readonly hash: Schema.String;
    readonly size: Schema.Finite;
    readonly expirationDuration: Schema.Finite;
    readonly responseTime: Schema.Finite;
    readonly lastFetchTime: Schema.Finite;
    readonly lastUsedTime: Schema.Finite;
}>;
type SharedDictionary = typeof SharedDictionary.Type;
```

#### `SessionStorage.SharedDictionaryKey`

The isolation key a shared dictionary is stored under.

```ts
const SharedDictionaryKey: Schema.Struct<{
    readonly frameOrigin: Schema.String;
    readonly topFrameSite: Schema.String;
}>;
type SharedDictionaryKey = typeof SharedDictionaryKey.Type;
```

#### `SessionStorage.SharedDictionaryUsage`

```ts
const SharedDictionaryUsage: Schema.Struct<{
    readonly frameOrigin: Schema.String;
    readonly topFrameSite: Schema.String;
    readonly totalSizeBytes: Schema.Finite;
}>;
type SharedDictionaryUsage = typeof SharedDictionaryUsage.Type;
```

#### `SessionStorage.Storage`

```ts
const Storage: Schema.Literals<readonly ["cookies", "filesystem", "indexdb", "localstorage", "shadercache", "serviceworkers", "cachestorage"]>;
```

### `SewedError`

```ts
class SewedError extends SewedError_base {}
```

### `Shell`

#### `Shell.capability`

The whole shell surface as one capability: `Shell.native` in `sewed/main` carries the policy,
`Capability.client` reaches it from a document, and `Testing.Shell.memory` stands in for tests.

```ts
const capability: Capability.Capability<Rpc.Rpc<"beep", Schema.Struct<{}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"openExternal", Schema.Struct<{
    url: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"openPath", Schema.Struct<{
    path: Schema.String;
}>, Schema.Struct<{
    readonly opened: Schema.Boolean;
    readonly message: Schema.String;
}>, typeof SewedError, never, never> | Rpc.Rpc<"showItemInFolder", Schema.Struct<{
    path: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"trashItem", Schema.Struct<{
    path: Schema.String;
}>, Schema.Void, typeof SewedError, never, never>, "sewed/binding/shell">;
```

#### `Shell.Grants`

The path a scope has admitted, on top of whatever roots `Shell.native` was configured with.
`allow` grants one absolute path — a file, or a directory and everything under it — under the
same containment rule a configured root already uses, for as long as the caller's scope stays
open; closing the scope withdraws it, unless another open scope granted the same path too.

This is a plain, inert service declaration: it carries no Electron and no `node:` import, so it
is fine to declare here alongside {@link capability}, in a module every runtime can import. What
is privileged is a Layer that can ever produce a live instance of it — only `Shell.native` (in
`sewed/main`) and `Testing.Shell.memory` build one, each from the very `operations` call that
checks every shell operation, so a grant is never a second, drifting copy of the containment
rule. `Grants` is a separate service from {@link capability}: `Capability.serve` only ever serves
a capability's own protocol, so a document bound to the shell has no route to widen its own
policy — only main code holding this service can.

```ts
class Grants extends Grants_base {}
```

#### `Shell.Mailto`

One exact recipient `openExternal` may address; other recipients never match.

```ts
const Mailto: Schema.Struct<{
    readonly kind: Schema.Literal<"mailto">;
    readonly address: Schema.String;
}>;
type Mailto = typeof Mailto.Type;
```

#### `Shell.OpenResult`

```ts
const OpenResult: Schema.Struct<{
    readonly opened: Schema.Boolean;
    readonly message: Schema.String;
}>;
type OpenResult = typeof OpenResult.Type;
```

#### `Shell.Options`

What a shell capability may reach. Every Layer that carries these options checks both before
the platform runs, so a served renderer call meets the same rules a main-side call does.

```ts
interface Options {
  /** Origins, documents, mail recipients, and match patterns `openExternal` may open. */
  readonly policy: Policy;
  /** Absolute directories whose contents `openPath`, `showItemInFolder`, and `trashItem` may touch. */
  readonly paths?: readonly string[];
}
```

#### `Shell.Policy`

Origins, documents, exact mail recipients, and match patterns that `openExternal` may reach;
nothing else opens. A pattern is the same `WebRequest.Pattern` navigation rules use: a wildcard
scheme, host, and path — `*`, `*`, `/*` — matches every http or https URL. Because
`openExternal` hands the URL straight to the operating system, a pattern's scheme is checked
again on top of its own syntax: the shell refuses `<all_urls>` and any scheme other than `*`,
`http`, `https`, or one `App.run` registers as standard. `file` is not a pattern scheme: a
pattern's path is matched against the URL as written, so a percent-encoded separator reaches it
undecoded and could grant a traversal a real path check would refuse. A local file goes through
`openPath` or `showItemInFolder` with a configured root instead, or an exact `document` rule
that compares one whole URL rather than matching a wildcard against it.

```ts
const Policy: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"origin">;
    readonly origin: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"document">;
    readonly url: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"mailto">;
    readonly address: Schema.String;
}>, Schema.String]>>;
type Policy = typeof Policy.Type;
```

#### `Shell.protocol`

```ts
const protocol: RpcGroup.RpcGroup<Rpc.Rpc<"beep", Schema.Struct<{}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"openExternal", Schema.Struct<{
    url: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"openPath", Schema.Struct<{
    path: Schema.String;
}>, Schema.Struct<{
    readonly opened: Schema.Boolean;
    readonly message: Schema.String;
}>, typeof SewedError, never, never> | Rpc.Rpc<"showItemInFolder", Schema.Struct<{
    path: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"trashItem", Schema.Struct<{
    path: Schema.String;
}>, Schema.Void, typeof SewedError, never, never>>;
```

#### `Shell.Shortcut`

A Windows `.lnk` shortcut.

```ts
const Shortcut: Schema.Struct<{
    readonly target: Schema.String;
    readonly cwd: Schema.optionalKey<Schema.String>;
    readonly args: Schema.optionalKey<Schema.String>;
    readonly description: Schema.optionalKey<Schema.String>;
    readonly icon: Schema.optionalKey<Schema.String>;
    readonly iconIndex: Schema.optionalKey<Schema.Int>;
    readonly appUserModelId: Schema.optionalKey<Schema.String>;
    readonly toastActivatorClsid: Schema.optionalKey<Schema.String>;
}>;
type Shortcut = typeof Shortcut.Type;
```

### `SystemPreferences`

#### `SystemPreferences.Animation`

```ts
const Animation: Schema.Struct<{
    readonly shouldRenderRichAnimation: Schema.Boolean;
    readonly scrollAnimationsEnabledBySystem: Schema.Boolean;
    readonly prefersReducedMotion: Schema.Boolean;
}>;
type Animation = typeof Animation.Type;
```

#### `SystemPreferences.Appearance`

```ts
const Appearance: Schema.Literals<readonly ["dark", "light", "unknown"]>;
type Appearance = typeof Appearance.Type;
```

#### `SystemPreferences.CenterNotification`

A macOS notification center message; `userInfo` is `null` when it is not JSON.

```ts
const CenterNotification: Schema.Struct<{
    readonly event: Schema.String;
    readonly userInfo: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly object: Schema.String;
}>;
type CenterNotification = typeof CenterNotification.Type;
```

#### `SystemPreferences.Change`

```ts
const Change: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"accent-color">;
    readonly color: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"color">;
}>]>;
type Change = typeof Change.Type;
```

#### `SystemPreferences.ColorName`

A Windows or macOS system color name; Electron validates the name itself.

```ts
const ColorName: Schema.String;
```

#### `SystemPreferences.Defaults`

Values registered as defaults in the macOS user defaults.

```ts
const Defaults: Schema.$Record<Schema.String, Schema.Union<readonly [Schema.String, Schema.Boolean, Schema.Finite]>>;
type Defaults = typeof Defaults.Type;
```

#### `SystemPreferences.MediaAccess`

```ts
const MediaAccess: Schema.Literals<readonly ["not-determined", "granted", "denied", "restricted", "unknown"]>;
type MediaAccess = typeof MediaAccess.Type;
```

#### `SystemPreferences.MediaKind`

```ts
const MediaKind: Schema.Literals<readonly ["microphone", "camera", "screen"]>;
type MediaKind = typeof MediaKind.Type;
```

#### `SystemPreferences.NotificationCenter`

Which macOS notification center: between applications, inside this one, or the workspace's.

```ts
const NotificationCenter: Schema.Literals<readonly ["distributed", "local", "workspace"]>;
type NotificationCenter = typeof NotificationCenter.Type;
```

#### `SystemPreferences.SystemColor`

```ts
const SystemColor: Schema.Literals<readonly ["blue", "brown", "gray", "green", "orange", "pink", "purple", "red", "yellow"]>;
type SystemColor = typeof SystemColor.Type;
```

### `TouchBar`

#### `TouchBar.Button`

```ts
interface Button {
  readonly kind: "button";
  readonly id: string;
  readonly label?: string;
  readonly accessibilityLabel?: string;
  readonly backgroundColor?: string;
  readonly icon?: string;
  readonly iconPosition?: typeof IconPosition.Type;
  readonly enabled?: boolean;
}
```

#### `TouchBar.ColorPicker`

```ts
interface ColorPicker {
  readonly kind: "color-picker";
  readonly id: string;
  readonly availableColors?: readonly string[];
  readonly selectedColor?: string;
}
```

#### `TouchBar.Group`

```ts
interface Group {
  readonly kind: "group";
  readonly items: readonly Item[];
}
```

#### `TouchBar.IconPosition`

```ts
const IconPosition: Schema.Literals<readonly ["left", "right", "overlay"]>;
```

#### `TouchBar.Interaction`

```ts
const Interaction: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"click">;
    readonly id: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"slider">;
    readonly id: Schema.String;
    readonly value: Schema.Finite;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"segment">;
    readonly id: Schema.String;
    readonly index: Schema.Int;
    readonly selected: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"color">;
    readonly id: Schema.String;
    readonly color: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"scrubber">;
    readonly id: Schema.String;
    readonly index: Schema.Int;
    readonly change: Schema.Literals<readonly ["select", "highlight"]>;
}>]>;
type Interaction = typeof Interaction.Type;
```

#### `TouchBar.Item`

```ts
type Item = Button | Label | Spacer | Slider | SegmentedControl | ColorPicker | Popover | Group | Scrubber | OtherItemsProxy;
const ItemSchema: Schema.Codec<Item>;
export { ItemSchema as Item };
```

#### `TouchBar.Label`

```ts
interface Label {
  readonly kind: "label";
  readonly label: string;
  readonly textColor?: string;
}
```

#### `TouchBar.Options`

A whole touch bar: item ids are unique across nested popovers and groups.

```ts
const Options: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Codec<Item, Item, never, never>>;
    readonly escapeItem: Schema.optionalKey<Schema.Codec<Item, Item, never, never>>;
}>;
type Options = typeof Options.Type;
```

#### `TouchBar.OtherItemsProxy`

Where the system's own items go, such as the Control Strip; at most one per bar.

```ts
interface OtherItemsProxy {
  readonly kind: "other-items-proxy";
}
```

#### `TouchBar.Popover`

```ts
interface Popover {
  readonly kind: "popover";
  readonly id: string;
  readonly label?: string;
  readonly showCloseButton?: boolean;
  readonly items: readonly Item[];
}
```

#### `TouchBar.Scrubber`

A scrollable strip of items; selecting or passing over one reports its index.

```ts
interface Scrubber {
  readonly kind: "scrubber";
  readonly id: string;
  readonly items: readonly {
    readonly label?: string;
  }[];
  readonly selectedStyle?: "background" | "outline" | "none";
  readonly overlayStyle?: "background" | "outline" | "none";
  readonly showArrowButtons?: boolean;
  readonly mode?: "fixed" | "free";
  readonly continuous?: boolean;
}
```

#### `TouchBar.Segment`

```ts
interface Segment {
  readonly label?: string;
  readonly enabled?: boolean;
}
```

#### `TouchBar.SegmentedControl`

```ts
interface SegmentedControl {
  readonly kind: "segmented";
  readonly id: string;
  readonly segments: readonly [Segment, ...Segment[]];
  readonly selectedIndex?: number;
  readonly mode?: typeof SegmentedMode.Type;
  readonly segmentStyle?: typeof SegmentStyle.Type;
}
```

#### `TouchBar.SegmentedMode`

```ts
const SegmentedMode: Schema.Literals<readonly ["single", "multiple", "buttons"]>;
```

#### `TouchBar.SegmentStyle`

```ts
const SegmentStyle: Schema.Literals<readonly ["automatic", "rounded", "textured-rounded", "round-rect", "textured-square", "capsule", "small-square", "separated"]>;
```

#### `TouchBar.Slider`

```ts
interface Slider {
  readonly kind: "slider";
  readonly id: string;
  readonly label?: string;
  readonly value?: number;
  readonly minValue?: number;
  readonly maxValue?: number;
}
```

#### `TouchBar.Spacer`

```ts
interface Spacer {
  readonly kind: "spacer";
  readonly size?: typeof SpacerSize.Type;
}
```

#### `TouchBar.SpacerSize`

```ts
const SpacerSize: Schema.Literals<readonly ["small", "large", "flexible"]>;
```

### `Tray`

#### `Tray.Balloon`

A Windows notification balloon attached to the tray icon.

```ts
const Balloon: Schema.Struct<{
    readonly title: Schema.String;
    readonly content: Schema.String;
    readonly icon: Schema.optionalKey<Schema.Union<readonly [Schema.String, Binary.Bytes]>>;
    readonly iconType: Schema.optionalKey<Schema.Literals<readonly ["none", "info", "warning", "error", "custom"]>>;
    readonly largeIcon: Schema.optionalKey<Schema.Boolean>;
    readonly noSound: Schema.optionalKey<Schema.Boolean>;
    readonly respectQuietTime: Schema.optionalKey<Schema.Boolean>;
}>;
type Balloon = typeof Balloon.Type;
```

#### `Tray.Event`

```ts
const Event: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"click">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"right-click">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"double-click">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"menu-selection">;
    readonly selection: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"command">;
        readonly id: Schema.String;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"checkbox">;
        readonly id: Schema.String;
        readonly checked: Schema.Boolean;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"radio">;
        readonly id: Schema.String;
    }>]>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"middle-click">;
}>, Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["mouse-enter", "mouse-leave", "mouse-move", "mouse-down", "mouse-up"]>;
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
}>, Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["balloon-show", "balloon-click", "balloon-closed"]>;
}>, Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["drag-enter", "drag-leave", "drag-end", "drop"]>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"drop-files">;
    readonly files: Schema.$Array<Schema.String>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"drop-text">;
    readonly text: Schema.String;
}>]>;
type Event = typeof Event.Type;
```

#### `Tray.MenuOptions`

```ts
const MenuOptions: Schema.Codec<MenuOptionsValue>;
type MenuOptions = MenuOptionsValue;
```

#### `Tray.Options`

```ts
const Options: Schema.Struct<{
    /** A path or already-encoded bytes, over wave 3's `Image.Source`. */
    readonly icon: Schema.Union<readonly [Schema.String, Binary.Bytes]>;
    /**
     * Calls the native image's own `setTemplateImage(true)` — macOS semantics (a monochrome image
     * the system tints for light and dark menu bars) and a probed no-op elsewhere: `isTemplateImage`
     * stays `false` on Linux.
     */
    readonly template: Schema.optionalKey<Schema.Boolean>;
    readonly tooltip: Schema.optionalKey<Schema.String>;
    readonly menu: Schema.optionalKey<Schema.Codec<MenuOptionsValue, MenuOptionsValue, never, never>>;
}>;
type Options = typeof Options.Type;
```

### `UtilityContext`

```ts
class UtilityContext extends UtilityContext_base {}
```

### `WebContents`

#### `WebContents.Activity`

What the page is doing right now, read once.

```ts
const Activity: Schema.Struct<{
    readonly loading: Schema.Boolean;
    readonly waitingForResponse: Schema.Boolean;
    readonly crashed: Schema.Boolean;
    readonly beingCaptured: Schema.Boolean;
    readonly backgroundThrottling: Schema.Boolean;
}>;
type Activity = typeof Activity.Type;
```

#### `WebContents.Audio`

```ts
const Audio: Schema.Struct<{
    readonly muted: Schema.Boolean;
    readonly audible: Schema.Boolean;
}>;
type Audio = typeof Audio.Type;
```

#### `WebContents.Blocked`

A window, webview, navigation, redirect, or download a policy denied.

```ts
const Blocked: Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["navigation", "redirect", "popup", "webview", "download"]>;
    readonly url: Schema.String;
}>;
type Blocked = typeof Blocked.Type;
```

#### `WebContents.Capture`

What a capture answers instead of bare bytes: the PNG, its pixel size as the native image
itself reports it, and the display's scale factor for the area it captured. `width` and
`height` are always pixels, never DIPs — a consumer who wants bytes alone reads one field.

```ts
const Capture: Schema.Struct<{
    readonly bytes: Binary.Bytes;
    readonly width: Schema.Finite;
    readonly height: Schema.Finite;
    readonly scaleFactor: Schema.Finite;
}>;
type Capture = typeof Capture.Type;
```

#### `WebContents.CaptureOptions`

```ts
const CaptureOptions: Schema.Struct<{
    readonly rect: Schema.optionalKey<Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>>;
    readonly stayHidden: Schema.optionalKey<Schema.Boolean>;
    readonly stayAwake: Schema.optionalKey<Schema.Boolean>;
}>;
type CaptureOptions = typeof CaptureOptions.Type;
```

#### `WebContents.ConsoleMessage`

A console message a page logged; the stream is main-only and never served to renderers.

```ts
const ConsoleMessage: Schema.Struct<{
    readonly level: Schema.Literals<readonly ["debug", "info", "warning", "error"]>;
    readonly message: Schema.String;
    readonly lineNumber: Schema.Finite;
    readonly sourceId: Schema.String;
}>;
type ConsoleMessage = typeof ConsoleMessage.Type;
```

#### `WebContents.ContextMenu`

A request for a context menu, with what was under the pointer. Coordinates are in the page.

```ts
const ContextMenu: Schema.Struct<{
    readonly kind: Schema.Literal<"context-menu">;
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
    readonly pageUrl: Schema.String;
    readonly frameUrl: Schema.String;
    readonly linkUrl: Schema.String;
    readonly linkText: Schema.String;
    readonly sourceUrl: Schema.String;
    readonly mediaType: Schema.String;
    readonly hasImageContents: Schema.Boolean;
    readonly isEditable: Schema.Boolean;
    readonly selectionText: Schema.String;
    readonly misspelledWord: Schema.String;
    readonly dictionarySuggestions: Schema.$Array<Schema.String>;
    readonly source: Schema.String;
    readonly editFlags: Schema.Struct<{
        readonly canUndo: Schema.Boolean;
        readonly canRedo: Schema.Boolean;
        readonly canCut: Schema.Boolean;
        readonly canCopy: Schema.Boolean;
        readonly canPaste: Schema.Boolean;
        readonly canDelete: Schema.Boolean;
        readonly canSelectAll: Schema.Boolean;
    }>;
}>;
type ContextMenu = typeof ContextMenu.Type;
```

#### `WebContents.DeviceEmulation`

Emulates a device's screen for the page, as DevTools' device toolbar does.

```ts
const DeviceEmulation: Schema.Struct<{
    readonly screenPosition: Schema.Literals<readonly ["desktop", "mobile"]>;
    readonly screenSize: Schema.Struct<{
        readonly width: Schema.Int;
        readonly height: Schema.Int;
    }>;
    readonly viewPosition: Schema.Struct<{
        readonly x: Schema.Int;
        readonly y: Schema.Int;
    }>;
    /** `0` keeps the display's own scale factor. */
    readonly deviceScaleFactor: Schema.Finite;
    readonly viewSize: Schema.Struct<{
        readonly width: Schema.Int;
        readonly height: Schema.Int;
    }>;
    readonly scale: Schema.Finite;
}>;
type DeviceEmulation = typeof DeviceEmulation.Type;
```

#### `WebContents.DevToolsOptions`

```ts
const DevToolsOptions: Schema.Struct<{
    readonly mode: Schema.optionalKey<Schema.Literals<readonly ["left", "right", "bottom", "undocked", "detach"]>>;
    readonly activate: Schema.optionalKey<Schema.Boolean>;
}>;
type DevToolsOptions = typeof DevToolsOptions.Type;
```

#### `WebContents.DevToolsState`

```ts
const DevToolsState: Schema.Struct<{
    readonly opened: Schema.Boolean;
    readonly focused: Schema.Boolean;
    readonly title: Schema.String;
}>;
type DevToolsState = typeof DevToolsState.Type;
```

#### `WebContents.Drag`

Files dragged out of a page, by absolute path, and the image shown under the pointer.

```ts
const Drag: Schema.Struct<{
    readonly files: Schema.NonEmptyArray<Schema.String>;
    readonly icon: Schema.Union<readonly [Schema.String, Binary.Bytes]>;
}>;
type Drag = typeof Drag.Type;
```

#### `WebContents.EditCommand`

An editing command the focused frame runs, as a menu item or a key press would.

```ts
const EditCommand: Schema.Literals<readonly ["undo", "redo", "cut", "copy", "paste", "pasteAndMatchStyle", "delete", "selectAll", "unselect", "centerSelection", "scrollToTop", "scrollToBottom"]>;
type EditCommand = typeof EditCommand.Type;
```

#### `WebContents.EditFlags`

What the page says can be done with the selection or field a context menu was opened on.

```ts
const EditFlags: Schema.Struct<{
    readonly canUndo: Schema.Boolean;
    readonly canRedo: Schema.Boolean;
    readonly canCut: Schema.Boolean;
    readonly canCopy: Schema.Boolean;
    readonly canPaste: Schema.Boolean;
    readonly canDelete: Schema.Boolean;
    readonly canSelectAll: Schema.Boolean;
}>;
type EditFlags = typeof EditFlags.Type;
```

#### `WebContents.FindOptions`

```ts
const FindOptions: Schema.Struct<{
    readonly forward: Schema.optionalKey<Schema.Boolean>;
    readonly matchCase: Schema.optionalKey<Schema.Boolean>;
}>;
type FindOptions = typeof FindOptions.Type;
```

#### `WebContents.FindResult`

```ts
const FindResult: Schema.Struct<{
    readonly activeMatchOrdinal: Schema.Int;
    readonly matches: Schema.Int;
    readonly selectionArea: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly finalUpdate: Schema.Boolean;
}>;
type FindResult = typeof FindResult.Type;
```

#### `WebContents.FindStop`

```ts
const FindStop: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
type FindStop = typeof FindStop.Type;
```

#### `WebContents.FindText`

```ts
const FindText: Schema.String;
```

#### `WebContents.Frame`

One rendered frame: the whole frame as a BGRA bitmap, and the rectangle that changed since the
frame before, in device-independent pixels.

```ts
const Frame: Schema.Struct<{
    readonly bitmap: Schema.Struct<{
        readonly width: Schema.Int;
        readonly height: Schema.Int;
        readonly bytes: Binary.Bytes;
    }>;
    readonly dirty: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
}>;
type Frame = typeof Frame.Type;
```

#### `WebContents.FrameIdentity`

One frame of the page, named by the process it runs in and its routing id inside it.

```ts
const FrameIdentity: Schema.Struct<{
    readonly processId: Schema.Finite;
    readonly routingId: Schema.Finite;
    readonly isMainFrame: Schema.Boolean;
}>;
type FrameIdentity = typeof FrameIdentity.Type;
```

#### `WebContents.FrameInfo`

One frame of the page as it is now. `parent` is the routing id of the frame that embeds it.

```ts
const FrameInfo: Schema.Struct<{
    readonly processId: Schema.Finite;
    readonly routingId: Schema.Finite;
    readonly frameTreeNodeId: Schema.Finite;
    readonly token: Schema.String;
    readonly osProcessId: Schema.Finite;
    readonly isMainFrame: Schema.Boolean;
    readonly parent: Schema.NullOr<Schema.Finite>;
    readonly url: Schema.String;
    readonly origin: Schema.String;
    readonly name: Schema.String;
    readonly visibilityState: Schema.String;
}>;
type FrameInfo = typeof FrameInfo.Type;
```

#### `WebContents.FrameOptions`

```ts
const FrameOptions: Schema.Struct<{
    /**
     * For a page that is not rendered offscreen: deliver only the rectangle that changed, as its
     * own bitmap, instead of the whole frame.
     */
    readonly onlyDirty: Schema.optionalKey<Schema.Boolean>;
}>;
type FrameOptions = typeof FrameOptions.Type;
```

#### `WebContents.FrameRate`

Frames per second for an offscreen page.

```ts
const FrameRate: Schema.Int;
type FrameRate = typeof FrameRate.Type;
```

#### `WebContents.History`

```ts
const History: Schema.Struct<{
    readonly index: Schema.Int;
    readonly entries: Schema.$Array<Schema.Struct<{
        readonly url: Schema.String;
        readonly title: Schema.String;
    }>>;
    readonly canGoBack: Schema.Boolean;
    readonly canGoForward: Schema.Boolean;
}>;
type History = typeof History.Type;
```

#### `WebContents.HistoryEntry`

```ts
const HistoryEntry: Schema.Struct<{
    readonly url: Schema.String;
    readonly title: Schema.String;
}>;
type HistoryEntry = typeof HistoryEntry.Type;
```

#### `WebContents.ImageAnimationPolicy`

```ts
const ImageAnimationPolicy: Schema.Literals<readonly ["animate", "animateOnce", "noAnimation"]>;
type ImageAnimationPolicy = typeof ImageAnimationPolicy.Type;
```

#### `WebContents.PageEvent`

Something the page did that main may want to react to. Each observer owns its own native
listeners, so a web contents nobody observes pays nothing for these.

```ts
const PageEvent: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"context-menu">;
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
    readonly pageUrl: Schema.String;
    readonly frameUrl: Schema.String;
    readonly linkUrl: Schema.String;
    readonly linkText: Schema.String;
    readonly sourceUrl: Schema.String;
    readonly mediaType: Schema.String;
    readonly hasImageContents: Schema.Boolean;
    readonly isEditable: Schema.Boolean;
    readonly selectionText: Schema.String;
    readonly misspelledWord: Schema.String;
    readonly dictionarySuggestions: Schema.$Array<Schema.String>;
    readonly source: Schema.String;
    readonly editFlags: Schema.Struct<{
        readonly canUndo: Schema.Boolean;
        readonly canRedo: Schema.Boolean;
        readonly canCut: Schema.Boolean;
        readonly canCopy: Schema.Boolean;
        readonly canPaste: Schema.Boolean;
        readonly canDelete: Schema.Boolean;
        readonly canSelectAll: Schema.Boolean;
    }>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"cursor">;
    readonly type: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"target-url">;
    readonly url: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"theme-color">;
    readonly color: Schema.NullOr<Schema.String>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"html-full-screen">;
    readonly active: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"dom-ready">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"preload-error">;
    readonly path: Schema.String;
    readonly message: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"frame">;
    readonly change: Schema.Literals<readonly ["created", "navigated", "loaded"]>;
    readonly frame: Schema.Struct<{
        readonly processId: Schema.Finite;
        readonly routingId: Schema.Finite;
        readonly isMainFrame: Schema.Boolean;
    }>;
    /** The frame's URL, where Electron reports one: on `created` and `navigated`. */
    readonly url: Schema.optionalKey<Schema.String>;
    /** The response status of a `navigated` frame; `-1` for a navigation that is not HTTP. */
    readonly httpStatus: Schema.optionalKey<Schema.Finite>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"devtools">;
    readonly change: Schema.Literals<readonly ["opened", "closed", "focused"]>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"devtools-open-url">;
    readonly url: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"devtools-reload-page">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"devtools-search-query">;
    readonly query: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"content-bounds-updated">;
    readonly bounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"preferred-size">;
    readonly width: Schema.Finite;
    readonly height: Schema.Finite;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"input">;
    readonly type: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"frame-will-navigate">;
    readonly url: Schema.String;
    readonly isMainFrame: Schema.Boolean;
    readonly isSameDocument: Schema.Boolean;
}>]>;
type PageEvent = typeof PageEvent.Type;
```

#### `WebContents.PagePoint`

```ts
const PagePoint: Schema.Struct<{
    readonly x: Schema.Int;
    readonly y: Schema.Int;
}>;
type PagePoint = typeof PagePoint.Type;
```

#### `WebContents.Painting`

How an offscreen page is rendering.

```ts
const Painting: Schema.Struct<{
    readonly offscreen: Schema.Boolean;
    readonly painting: Schema.Boolean;
    readonly frameRate: Schema.Finite;
}>;
type Painting = typeof Painting.Type;
```

#### `WebContents.PdfOptions`

```ts
const PdfOptions: Schema.Struct<{
    readonly landscape: Schema.optionalKey<Schema.Boolean>;
    readonly displayHeaderFooter: Schema.optionalKey<Schema.Boolean>;
    readonly printBackground: Schema.optionalKey<Schema.Boolean>;
    readonly scale: Schema.optionalKey<Schema.Finite>;
    readonly pageSize: Schema.optionalKey<Schema.Union<readonly [Schema.Literals<readonly ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "Legal", "Letter", "Tabloid", "Ledger"]>, Schema.Struct<{
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>]>>;
    readonly margins: Schema.optionalKey<Schema.Struct<{
        readonly top: Schema.optionalKey<Schema.Finite>;
        readonly bottom: Schema.optionalKey<Schema.Finite>;
        readonly left: Schema.optionalKey<Schema.Finite>;
        readonly right: Schema.optionalKey<Schema.Finite>;
    }>>;
    readonly pageRanges: Schema.optionalKey<Schema.String>;
    readonly headerTemplate: Schema.optionalKey<Schema.String>;
    readonly footerTemplate: Schema.optionalKey<Schema.String>;
    readonly preferCSSPageSize: Schema.optionalKey<Schema.Boolean>;
    readonly generateTaggedPDF: Schema.optionalKey<Schema.Boolean>;
    readonly generateDocumentOutline: Schema.optionalKey<Schema.Boolean>;
}>;
type PdfOptions = typeof PdfOptions.Type;
```

#### `WebContents.PdfPageSize`

A named page size, including Ledger, or custom dimensions in inches.

```ts
const PdfPageSize: Schema.Union<readonly [Schema.Literals<readonly ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "Legal", "Letter", "Tabloid", "Ledger"]>, Schema.Struct<{
    readonly width: Schema.Finite;
    readonly height: Schema.Finite;
}>]>;
type PdfPageSize = typeof PdfPageSize.Type;
```

#### `WebContents.Printer`

A printer the system offers.

```ts
const Printer: Schema.Struct<{
    readonly name: Schema.String;
    readonly displayName: Schema.String;
    readonly description: Schema.String;
}>;
type Printer = typeof Printer.Type;
```

#### `WebContents.PrintOptions`

```ts
const PrintOptions: Schema.Struct<{
    readonly silent: Schema.optionalKey<Schema.Boolean>;
    readonly printBackground: Schema.optionalKey<Schema.Boolean>;
    readonly deviceName: Schema.optionalKey<Schema.String>;
    readonly color: Schema.optionalKey<Schema.Boolean>;
    readonly landscape: Schema.optionalKey<Schema.Boolean>;
    readonly scaleFactor: Schema.optionalKey<Schema.Finite>;
    readonly pagesPerSheet: Schema.optionalKey<Schema.Int>;
    readonly collate: Schema.optionalKey<Schema.Boolean>;
    readonly copies: Schema.optionalKey<Schema.Int>;
    readonly pageRanges: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly from: Schema.Int;
        readonly to: Schema.Int;
    }>>>;
    readonly duplexMode: Schema.optionalKey<Schema.Literals<readonly ["simplex", "shortEdge", "longEdge"]>>;
    readonly header: Schema.optionalKey<Schema.String>;
    readonly footer: Schema.optionalKey<Schema.String>;
    readonly pageSize: Schema.optionalKey<Schema.Union<readonly [Schema.Literals<readonly ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "Legal", "Letter", "Tabloid"]>, Schema.Struct<{
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>]>>;
    readonly margins: Schema.optionalKey<Schema.Struct<{
        readonly marginType: Schema.optionalKey<Schema.Literals<readonly ["default", "none", "printableArea", "custom"]>>;
        readonly top: Schema.optionalKey<Schema.Int>;
        readonly bottom: Schema.optionalKey<Schema.Int>;
        readonly left: Schema.optionalKey<Schema.Int>;
        readonly right: Schema.optionalKey<Schema.Int>;
    }>>;
}>;
type PrintOptions = typeof PrintOptions.Type;
```

#### `WebContents.PrintPageSize`

A named page size or custom dimensions in microns.

```ts
const PrintPageSize: Schema.Union<readonly [Schema.Literals<readonly ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "Legal", "Letter", "Tabloid"]>, Schema.Struct<{
    readonly width: Schema.Finite;
    readonly height: Schema.Finite;
}>]>;
type PrintPageSize = typeof PrintPageSize.Type;
```

#### `WebContents.Responsiveness`

```ts
const Responsiveness: Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"unknown">;
}>, Schema.Struct<{
    readonly status: Schema.Literals<readonly ["responsive", "unresponsive"]>;
    readonly processId: Schema.Int;
}>]>;
type Responsiveness = typeof Responsiveness.Type;
```

#### `WebContents.SaveType`

```ts
const SaveType: Schema.Literals<readonly ["HTMLOnly", "HTMLComplete", "MHTML"]>;
type SaveType = typeof SaveType.Type;
```

#### `WebContents.Search`

One search over a document: its results end when it stops or a new search replaces it.

```ts
interface Search {
  readonly results: Stream.Stream<FindResult, SewedError, MainContext>;
  readonly next: (forward?: boolean) => Effect.Effect<void, SewedError, MainContext>;
  readonly stop: (action?: FindStop) => Effect.Effect<void, SewedError, MainContext>;
}
```

#### `WebContents.SelectionAdjustment`

How far to move the selection's ends, in characters; a negative number moves backwards.

```ts
const SelectionAdjustment: Schema.Struct<{
    readonly start: Schema.optionalKey<Schema.Int>;
    readonly end: Schema.optionalKey<Schema.Int>;
}>;
type SelectionAdjustment = typeof SelectionAdjustment.Type;
```

#### `WebContents.Settled`

What `back`, `forward`, and `go` answer once the navigation they started has settled — the
state stream's `Ready` or `Failed` branch, never `idle`, `loading`, or `gone`. A history move
cannot itself crash the renderer or leave the page unstarted.

```ts
const Settled: Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>;
type Settled = typeof Settled.Type;
```

#### `WebContents.SharedWorker`

A shared worker the page started.

```ts
const SharedWorker: Schema.Struct<{
    readonly id: Schema.String;
    readonly url: Schema.String;
}>;
type SharedWorker = typeof SharedWorker.Type;
```

#### `WebContents.Snapshot`

`webContents.current`'s own answer: the same six values its streams (`state`, `history`,
`title`, `favicons`, `zoom`, `audio`) last published, read fresh at the callback rather than
waited for — the one-shot precedent `internal/Window.ts`'s own `current` already ships.

```ts
const Snapshot: Schema.Struct<{
    readonly state: Schema.Union<readonly [Schema.Struct<{
        readonly status: Schema.Literal<"idle">;
    }>, Schema.Struct<{
        readonly status: Schema.Literal<"loading">;
        readonly url: Schema.String;
    }>, Schema.Struct<{
        readonly status: Schema.Literal<"ready">;
        readonly url: Schema.String;
        readonly processId: Schema.Finite;
        readonly httpStatus: Schema.Finite;
    }>, Schema.Struct<{
        readonly status: Schema.Literal<"failed">;
        readonly url: Schema.String;
        readonly code: Schema.Finite;
        readonly description: Schema.String;
    }>, Schema.Struct<{
        readonly status: Schema.Literal<"gone">;
        readonly reason: Schema.String;
        readonly exitCode: Schema.Finite;
    }>]>;
    readonly history: Schema.Struct<{
        readonly index: Schema.Int;
        readonly entries: Schema.$Array<Schema.Struct<{
            readonly url: Schema.String;
            readonly title: Schema.String;
        }>>;
        readonly canGoBack: Schema.Boolean;
        readonly canGoForward: Schema.Boolean;
    }>;
    readonly title: Schema.String;
    readonly favicons: Schema.$Array<Schema.String>;
    readonly zoom: Schema.Struct<{
        readonly factor: Schema.Finite;
    }>;
    readonly audio: Schema.Struct<{
        readonly muted: Schema.Boolean;
        readonly audible: Schema.Boolean;
    }>;
}>;
type Snapshot = typeof Snapshot.Type;
```

#### `WebContents.State`

```ts
const State: Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"idle">;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"loading">;
    readonly url: Schema.String;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"gone">;
    readonly reason: Schema.String;
    readonly exitCode: Schema.Finite;
}>]>;
type State = typeof State.Type;
```

#### `WebContents.StyleOptions`

```ts
const StyleOptions: Schema.Struct<{
    readonly origin: Schema.optionalKey<Schema.Literals<readonly ["author", "user"]>>;
}>;
type StyleOptions = typeof StyleOptions.Type;
```

#### `WebContents.UdpPortRange`

The UDP ports WebRTC may use; both zero lifts the restriction.

```ts
const UdpPortRange: Schema.Struct<{
    readonly min: Schema.Int;
    readonly max: Schema.Int;
}>;
type UdpPortRange = typeof UdpPortRange.Type;
```

#### `WebContents.VisualZoomLimits`

Pinch-zoom limits, as scale factors: `1` to `1` disables pinch zoom.

```ts
const VisualZoomLimits: Schema.Struct<{
    readonly minimum: Schema.Finite;
    readonly maximum: Schema.Finite;
}>;
type VisualZoomLimits = typeof VisualZoomLimits.Type;
```

#### `WebContents.WebRtc`

```ts
const WebRtc: Schema.Struct<{
    readonly ipHandlingPolicy: Schema.String;
    readonly udpPortRange: Schema.Struct<{
        readonly min: Schema.Int;
        readonly max: Schema.Int;
    }>;
}>;
type WebRtc = typeof WebRtc.Type;
```

#### `WebContents.WebRtcIpHandlingPolicy`

```ts
const WebRtcIpHandlingPolicy: Schema.Literals<readonly ["default", "default_public_interface_only", "default_public_and_private_interfaces", "disable_non_proxied_udp"]>;
type WebRtcIpHandlingPolicy = typeof WebRtcIpHandlingPolicy.Type;
```

#### `WebContents.Zoom`

```ts
const Zoom: Schema.Struct<{
    readonly factor: Schema.Finite;
}>;
type Zoom = typeof Zoom.Type;
```

#### `WebContents.ZoomFactor`

```ts
const ZoomFactor: Schema.Finite;
```

#### `WebContents.ZoomLevel`

Chromium's zoom level: `0` is 100%, and each step up or down scales by 20%.

```ts
const ZoomLevel: Schema.Finite;
type ZoomLevel = typeof ZoomLevel.Type;
```

#### `WebContents.ZoomMode`

How a page's zoom is scoped: per origin (`default`), per page, set by the application, or off.

```ts
const ZoomMode: Schema.Literals<readonly ["default", "isolated", "manual", "disabled"]>;
type ZoomMode = typeof ZoomMode.Type;
```

### `WebRequest`

#### `WebRequest.Body`

The upload data a request carried, kept within the filter's byte cap.

```ts
const Body: Schema.Struct<{
    readonly parts: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"bytes">;
        readonly bytes: Binary.Bytes;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"file">;
        readonly path: Schema.String;
        readonly offset: Schema.optionalKey<Schema.Finite>;
        readonly length: Schema.optionalKey<Schema.Finite>;
        readonly modificationTime: Schema.optionalKey<Schema.Finite>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"blob">;
        readonly id: Schema.String;
        readonly bytes: Schema.optionalKey<Binary.Bytes>;
    }>]>>;
    readonly bytes: Schema.Finite;
    readonly truncated: Schema.Boolean;
}>;
type Body = typeof Body.Type;
```

#### `WebRequest.BodyFilter`

Asks the request stage for upload data, capped in bytes; blobs are read or referenced.

```ts
const BodyFilter: Schema.Struct<{
    readonly maxBytes: Schema.Int;
    readonly blobs: Schema.Literals<readonly ["resolve", "reference"]>;
}>;
type BodyFilter = typeof BodyFilter.Type;
```

#### `WebRequest.compilePattern`

Compiles a Chromium match pattern such as `https://*.example.com/api/*` or `<all_urls>` into
a URL predicate. A wildcard scheme matches http and https; a `*.` host prefix matches the host
and its subdomains; a `*` in the path matches any characters. Numeric ports must be within
0-65535; explicit default ports match URLs whose parser has omitted that port.

```ts
const compilePattern: (pattern: string) => ((url: URL) => boolean);
```

#### `WebRequest.Event`

Observation-only stages of a request's life; deciders never see these.

```ts
const Event: Schema.Union<readonly [Schema.Struct<{
    readonly id: Schema.Finite;
    readonly url: Schema.String;
    readonly method: Schema.String;
    readonly resourceType: Schema.Literals<readonly ["mainFrame", "subFrame", "stylesheet", "script", "image", "font", "object", "xhr", "ping", "cspReport", "media", "webSocket", "other"]>;
    readonly referrer: Schema.String;
    readonly timestamp: Schema.Finite;
    readonly webContentsId: Schema.optionalKey<Schema.Finite>;
    readonly sourceId: Schema.optionalKey<Schema.String>;
    readonly stage: Schema.Literal<"sent">;
    readonly headers: Schema.$Record<Schema.String, Schema.String>;
}>, Schema.Struct<{
    readonly id: Schema.Finite;
    readonly url: Schema.String;
    readonly method: Schema.String;
    readonly resourceType: Schema.Literals<readonly ["mainFrame", "subFrame", "stylesheet", "script", "image", "font", "object", "xhr", "ping", "cspReport", "media", "webSocket", "other"]>;
    readonly referrer: Schema.String;
    readonly timestamp: Schema.Finite;
    readonly webContentsId: Schema.optionalKey<Schema.Finite>;
    readonly sourceId: Schema.optionalKey<Schema.String>;
    readonly fromCache: Schema.Boolean;
    readonly stage: Schema.Literal<"response">;
    readonly statusCode: Schema.Finite;
    readonly statusLine: Schema.String;
    readonly headers: Schema.$Record<Schema.String, Schema.$Array<Schema.String>>;
}>, Schema.Struct<{
    readonly id: Schema.Finite;
    readonly url: Schema.String;
    readonly method: Schema.String;
    readonly resourceType: Schema.Literals<readonly ["mainFrame", "subFrame", "stylesheet", "script", "image", "font", "object", "xhr", "ping", "cspReport", "media", "webSocket", "other"]>;
    readonly referrer: Schema.String;
    readonly timestamp: Schema.Finite;
    readonly webContentsId: Schema.optionalKey<Schema.Finite>;
    readonly sourceId: Schema.optionalKey<Schema.String>;
    readonly fromCache: Schema.Boolean;
    readonly stage: Schema.Literal<"redirect">;
    readonly statusCode: Schema.Finite;
    readonly redirectUrl: Schema.String;
}>, Schema.Struct<{
    readonly id: Schema.Finite;
    readonly url: Schema.String;
    readonly method: Schema.String;
    readonly resourceType: Schema.Literals<readonly ["mainFrame", "subFrame", "stylesheet", "script", "image", "font", "object", "xhr", "ping", "cspReport", "media", "webSocket", "other"]>;
    readonly referrer: Schema.String;
    readonly timestamp: Schema.Finite;
    readonly webContentsId: Schema.optionalKey<Schema.Finite>;
    readonly sourceId: Schema.optionalKey<Schema.String>;
    readonly fromCache: Schema.Boolean;
    readonly stage: Schema.Literal<"completed">;
    readonly statusCode: Schema.Finite;
    readonly statusLine: Schema.String;
}>, Schema.Struct<{
    readonly id: Schema.Finite;
    readonly url: Schema.String;
    readonly method: Schema.String;
    readonly resourceType: Schema.Literals<readonly ["mainFrame", "subFrame", "stylesheet", "script", "image", "font", "object", "xhr", "ping", "cspReport", "media", "webSocket", "other"]>;
    readonly referrer: Schema.String;
    readonly timestamp: Schema.Finite;
    readonly webContentsId: Schema.optionalKey<Schema.Finite>;
    readonly sourceId: Schema.optionalKey<Schema.String>;
    readonly fromCache: Schema.Boolean;
    readonly stage: Schema.Literal<"error">;
    readonly error: Schema.String;
}>]>;
type Event = typeof Event.Type;
```

#### `WebRequest.Filter`

Which requests a set of deciders sees; patterns follow Chromium's match pattern syntax.

```ts
const Filter: Schema.Struct<{
    readonly urls: Schema.NonEmptyArray<Schema.String>;
    readonly types: Schema.optionalKey<Schema.NonEmptyArray<Schema.Literals<readonly ["mainFrame", "subFrame", "stylesheet", "script", "image", "font", "object", "xhr", "ping", "cspReport", "media", "webSocket", "other"]>>>;
    readonly body: Schema.optionalKey<Schema.Struct<{
        readonly maxBytes: Schema.Int;
        readonly blobs: Schema.Literals<readonly ["resolve", "reference"]>;
    }>>;
}>;
type Filter = typeof Filter.Type;
```

#### `WebRequest.Pattern`

```ts
const Pattern: Schema.String;
```

#### `WebRequest.ReadBody`

Reads the body a request carried, assembled lazily so one install over `<all_urls>` pays for it
only on the request whose decider actually calls this. Fails `Limit` when the assembled body
would exceed its own `maxBytes` — unlike the install-time `body` option, which truncates rather
than fails, because a decider that explicitly asked should not silently receive less than it
asked for and mistake it for the whole body.

```ts
interface ReadBody {
  (options?: ReadBodyOptions): Effect.Effect<Body, SewedError>;
}
```

#### `WebRequest.ReadBodyOptions`

What `request.readBody(options?)` assembles under, all optional: a field left out takes the
install's own `body` filter option when it named one, else `{ maxBytes: 3_000_000, blobs:
"reference" }`. See `internal/WebRequest.ts`'s `readBodyFor` for where that default is chosen —
per install, not per request, since two installs on the same request may have asked differently.

```ts
const ReadBodyOptions: Schema.Struct<{
    readonly maxBytes: Schema.optionalKey<Schema.Int>;
    readonly blobs: Schema.optionalKey<Schema.Literals<readonly ["resolve", "reference"]>>;
}>;
type ReadBodyOptions = typeof ReadBodyOptions.Type;
```

#### `WebRequest.Request`

```ts
const Request: Schema.Struct<{
    readonly id: Schema.Finite;
    readonly url: Schema.String;
    readonly method: Schema.String;
    readonly resourceType: Schema.Literals<readonly ["mainFrame", "subFrame", "stylesheet", "script", "image", "font", "object", "xhr", "ping", "cspReport", "media", "webSocket", "other"]>;
    readonly referrer: Schema.String;
    readonly timestamp: Schema.Finite;
    readonly webContentsId: Schema.optionalKey<Schema.Finite>;
    readonly sourceId: Schema.optionalKey<Schema.String>;
    readonly body: Schema.optionalKey<Schema.Struct<{
        readonly parts: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
            readonly kind: Schema.Literal<"bytes">;
            readonly bytes: Binary.Bytes;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"file">;
            readonly path: Schema.String;
            readonly offset: Schema.optionalKey<Schema.Finite>;
            readonly length: Schema.optionalKey<Schema.Finite>;
            readonly modificationTime: Schema.optionalKey<Schema.Finite>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"blob">;
            readonly id: Schema.String;
            readonly bytes: Schema.optionalKey<Binary.Bytes>;
        }>]>>;
        readonly bytes: Schema.Finite;
        readonly truncated: Schema.Boolean;
    }>>;
}>;
type Request = typeof Request.Type;
```

#### `WebRequest.RequestDecision`

```ts
const RequestDecision: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"allow">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"block">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"redirect">;
    readonly url: Schema.String;
}>]>;
type RequestDecision = typeof RequestDecision.Type;
```

#### `WebRequest.RequestEvent`

The request stage's own event: everything {@link Request} carries, plus the lazy `readBody`.
Only this stage carries upload data — the two header stages refuse a filter that asks for a
`body` at all — so only this event schema, `Decidables.Session.Request`'s own, gains the field.

```ts
const RequestEvent: Schema.Struct<{
    readonly id: Schema.Finite;
    readonly url: Schema.String;
    readonly method: Schema.String;
    readonly resourceType: Schema.Literals<readonly ["mainFrame", "subFrame", "stylesheet", "script", "image", "font", "object", "xhr", "ping", "cspReport", "media", "webSocket", "other"]>;
    readonly referrer: Schema.String;
    readonly timestamp: Schema.Finite;
    readonly webContentsId: Schema.optionalKey<Schema.Finite>;
    readonly sourceId: Schema.optionalKey<Schema.String>;
    readonly body: Schema.optionalKey<Schema.Struct<{
        readonly parts: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
            readonly kind: Schema.Literal<"bytes">;
            readonly bytes: Binary.Bytes;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"file">;
            readonly path: Schema.String;
            readonly offset: Schema.optionalKey<Schema.Finite>;
            readonly length: Schema.optionalKey<Schema.Finite>;
            readonly modificationTime: Schema.optionalKey<Schema.Finite>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"blob">;
            readonly id: Schema.String;
            readonly bytes: Schema.optionalKey<Binary.Bytes>;
        }>]>>;
        readonly bytes: Schema.Finite;
        readonly truncated: Schema.Boolean;
    }>>;
    readonly readBody: Schema.declare<ReadBody, ReadBody>;
}>;
type RequestEvent = typeof RequestEvent.Type;
```

#### `WebRequest.RequestHeaders`

```ts
const RequestHeaders: Schema.Struct<{
    readonly id: Schema.Finite;
    readonly url: Schema.String;
    readonly method: Schema.String;
    readonly resourceType: Schema.Literals<readonly ["mainFrame", "subFrame", "stylesheet", "script", "image", "font", "object", "xhr", "ping", "cspReport", "media", "webSocket", "other"]>;
    readonly referrer: Schema.String;
    readonly timestamp: Schema.Finite;
    readonly webContentsId: Schema.optionalKey<Schema.Finite>;
    readonly sourceId: Schema.optionalKey<Schema.String>;
    readonly headers: Schema.$Record<Schema.String, Schema.String>;
}>;
type RequestHeaders = typeof RequestHeaders.Type;
```

#### `WebRequest.RequestHeadersDecision`

```ts
const RequestHeadersDecision: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"allow">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"block">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"headers">;
    readonly headers: Schema.$Record<Schema.String, Schema.String>;
}>]>;
type RequestHeadersDecision = typeof RequestHeadersDecision.Type;
```

#### `WebRequest.ResourceType`

```ts
const ResourceType: Schema.Literals<readonly ["mainFrame", "subFrame", "stylesheet", "script", "image", "font", "object", "xhr", "ping", "cspReport", "media", "webSocket", "other"]>;
type ResourceType = typeof ResourceType.Type;
```

#### `WebRequest.Response`

```ts
const Response: Schema.Struct<{
    readonly id: Schema.Finite;
    readonly url: Schema.String;
    readonly method: Schema.String;
    readonly resourceType: Schema.Literals<readonly ["mainFrame", "subFrame", "stylesheet", "script", "image", "font", "object", "xhr", "ping", "cspReport", "media", "webSocket", "other"]>;
    readonly referrer: Schema.String;
    readonly timestamp: Schema.Finite;
    readonly webContentsId: Schema.optionalKey<Schema.Finite>;
    readonly sourceId: Schema.optionalKey<Schema.String>;
    readonly statusLine: Schema.String;
    readonly statusCode: Schema.Finite;
    readonly headers: Schema.$Record<Schema.String, Schema.$Array<Schema.String>>;
}>;
type Response = typeof Response.Type;
```

#### `WebRequest.ResponseDecision`

```ts
const ResponseDecision: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"allow">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"block">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"headers">;
    readonly headers: Schema.$Record<Schema.String, Schema.$Array<Schema.String>>;
    readonly statusLine: Schema.optionalKey<Schema.String>;
}>]>;
type ResponseDecision = typeof ResponseDecision.Type;
```

#### `WebRequest.UploadPart`

One piece of a request's upload data; file parts are metadata the library never reads. A blob
part keeps its `id` whether or not it was resolved: `blobs: "resolve"` fills `bytes` in beside
it, `blobs: "reference"` leaves `bytes` absent, and either way a rule that reads `id` can still
recognize the same blob after resolution instead of losing its identity to a bare `"bytes"` kind.

```ts
const UploadPart: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"bytes">;
    readonly bytes: Binary.Bytes;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"file">;
    readonly path: Schema.String;
    readonly offset: Schema.optionalKey<Schema.Finite>;
    readonly length: Schema.optionalKey<Schema.Finite>;
    readonly modificationTime: Schema.optionalKey<Schema.Finite>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"blob">;
    readonly id: Schema.String;
    readonly bytes: Schema.optionalKey<Binary.Bytes>;
}>]>;
type UploadPart = typeof UploadPart.Type;
```

### `WindowControls`

#### `WindowControls.AccentColor`

The Windows frame accent: `true` uses the system accent color, `false` none, a color string
that color, and `null` the system default.

```ts
const AccentColor: Schema.NullOr<Schema.Union<readonly [Schema.Boolean, Schema.String]>>;
type AccentColor = typeof AccentColor.Type;
```

#### `WindowControls.AlwaysOnTopLevel`

```ts
const AlwaysOnTopLevel: Schema.Literals<readonly ["normal", "floating", "torn-off-menu", "modal-panel", "main-menu", "status", "pop-up-menu", "screen-saver"]>;
type AlwaysOnTopLevel = typeof AlwaysOnTopLevel.Type;
```

#### `WindowControls.AppDetails`

How Windows groups and relaunches a window in the taskbar.

```ts
const AppDetails: Schema.Struct<{
    readonly appId: Schema.optionalKey<Schema.String>;
    readonly appIconPath: Schema.optionalKey<Schema.String>;
    readonly appIconIndex: Schema.optionalKey<Schema.Int>;
    readonly relaunchCommand: Schema.optionalKey<Schema.String>;
    readonly relaunchDisplayName: Schema.optionalKey<Schema.String>;
}>;
type AppDetails = typeof AppDetails.Type;
```

#### `WindowControls.AspectRatio`

Width divided by height that resizing keeps; zero removes the constraint.

```ts
const AspectRatio: Schema.Finite;
```

#### `WindowControls.BackgroundMaterial`

A Windows 11 system material drawn behind a window's content.

```ts
const BackgroundMaterial: Schema.Literals<readonly ["auto", "none", "mica", "acrylic", "tabbed"]>;
type BackgroundMaterial = typeof BackgroundMaterial.Type;
```

#### `WindowControls.Bounds`

```ts
const Bounds: Schema.Struct<{
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
    readonly width: Schema.Finite;
    readonly height: Schema.Finite;
}>;
type Bounds = typeof Bounds.Type;
```

#### `WindowControls.BoundsUpdate`

```ts
const BoundsUpdate: Schema.Struct<{
    readonly x: Schema.optionalKey<Schema.Finite>;
    readonly y: Schema.optionalKey<Schema.Finite>;
    readonly width: Schema.optionalKey<Schema.Finite>;
    readonly height: Schema.optionalKey<Schema.Finite>;
}>;
type BoundsUpdate = typeof BoundsUpdate.Type;
```

#### `WindowControls.capability`

One window's controls as one capability. Unlike the ambient surfaces, this one belongs to an
owner: `WindowControls.native(window)` in `sewed/main` carries the window it was built for, so
every operation reaches that window and no other. `Capability.client` reaches it from a
document, and serving it twice for two windows gives two owners over this one protocol.

```ts
const capability: Capability.Capability<Rpc.Rpc<"audio", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly muted: Schema.Boolean;
    readonly audible: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"back", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"changes", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly bounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly normalBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    /** The content area, excluding the frame; attached views are positioned within it. */
    readonly contentBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly visible: Schema.Boolean;
    readonly focused: Schema.Boolean;
    readonly minimized: Schema.Boolean;
    readonly maximized: Schema.Boolean;
    readonly fullScreen: Schema.Boolean;
    /**
     * macOS's pre-Lion fullscreen: it does not create a Space, which is why a window minimizing to
     * the tray leaves it first. Probed on Linux: `setSimpleFullScreen` is honoured there too — both
     * this and `fullScreen` answer true afterwards — so the field is not macOS-only, even though its
     * distinct behavior (no Space) is.
     */
    readonly simpleFullScreen: Schema.Boolean;
    readonly title: Schema.String;
    readonly alwaysOnTop: Schema.Boolean;
    readonly opacity: Schema.Finite;
    readonly resizable: Schema.Boolean;
    readonly movable: Schema.Boolean;
    readonly minimizable: Schema.Boolean;
    readonly maximizable: Schema.Boolean;
    readonly closable: Schema.Boolean;
    readonly fullScreenable: Schema.Boolean;
    readonly menuBarVisible: Schema.Boolean;
    readonly kiosk: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"close", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"find", Schema.Struct<{
    text: Schema.String;
    options: Schema.optionalKey<Schema.Struct<{
        readonly forward: Schema.optionalKey<Schema.Boolean>;
        readonly matchCase: Schema.optionalKey<Schema.Boolean>;
    }>>;
}>, RpcSchema.Stream<Schema.Struct<{
    readonly activeMatchOrdinal: Schema.Int;
    readonly matches: Schema.Int;
    readonly selectionArea: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly finalUpdate: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"findNext", Schema.Struct<{
    forward: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"flash", Schema.Struct<{
    flash: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"forward", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"hide", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"history", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly index: Schema.Int;
    readonly entries: Schema.$Array<Schema.Struct<{
        readonly url: Schema.String;
        readonly title: Schema.String;
    }>>;
    readonly canGoBack: Schema.Boolean;
    readonly canGoForward: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"maximize", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"minimize", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"restore", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setAlwaysOnTop", Schema.Struct<{
    alwaysOnTop: Schema.Boolean;
    level: Schema.optionalKey<Schema.Literals<readonly ["normal", "floating", "torn-off-menu", "modal-panel", "main-menu", "status", "pop-up-menu", "screen-saver"]>>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setAudioMuted", Schema.Struct<{
    muted: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setBounds", Schema.Struct<{
    readonly x: Schema.optionalKey<Schema.Finite>;
    readonly y: Schema.optionalKey<Schema.Finite>;
    readonly width: Schema.optionalKey<Schema.Finite>;
    readonly height: Schema.optionalKey<Schema.Finite>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setFullScreen", Schema.Struct<{
    fullScreen: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setOpacity", Schema.Struct<{
    opacity: Schema.Finite;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setProgress", Schema.Struct<{
    progress: Schema.Finite;
    mode: Schema.optionalKey<Schema.Literals<readonly ["none", "normal", "indeterminate", "error", "paused"]>>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setSimpleFullScreen", Schema.Struct<{
    simpleFullScreen: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setTitle", Schema.Struct<{
    title: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setZoom", Schema.Struct<{
    factor: Schema.Finite;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"show", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"showInactive", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"state", Schema.Void, Schema.Struct<{
    readonly bounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly normalBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    /** The content area, excluding the frame; attached views are positioned within it. */
    readonly contentBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly visible: Schema.Boolean;
    readonly focused: Schema.Boolean;
    readonly minimized: Schema.Boolean;
    readonly maximized: Schema.Boolean;
    readonly fullScreen: Schema.Boolean;
    /**
     * macOS's pre-Lion fullscreen: it does not create a Space, which is why a window minimizing to
     * the tray leaves it first. Probed on Linux: `setSimpleFullScreen` is honoured there too — both
     * this and `fullScreen` answer true afterwards — so the field is not macOS-only, even though its
     * distinct behavior (no Space) is.
     */
    readonly simpleFullScreen: Schema.Boolean;
    readonly title: Schema.String;
    readonly alwaysOnTop: Schema.Boolean;
    readonly opacity: Schema.Finite;
    readonly resizable: Schema.Boolean;
    readonly movable: Schema.Boolean;
    readonly minimizable: Schema.Boolean;
    readonly maximizable: Schema.Boolean;
    readonly closable: Schema.Boolean;
    readonly fullScreenable: Schema.Boolean;
    readonly menuBarVisible: Schema.Boolean;
    readonly kiosk: Schema.Boolean;
}>, typeof SewedError, never, never> | Rpc.Rpc<"stopFind", Schema.Struct<{
    action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"zoom", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly factor: Schema.Finite;
}>, typeof SewedError>, Schema.Never, never, never>, "sewed/binding/window-controls">;
```

#### `WindowControls.Event`

Something that happened to a window that is not part of its state: it is ready to be shown
without a flash, a media or browser key was pressed (`app-command`, on Linux and Windows), or the
system context menu was requested on its non-client area (on Linux and Windows).

```ts
const Event: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"ready-to-show">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"persisted-state-restored">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"app-command">;
    readonly command: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["moved", "resized"]>;
}>, Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["will-move", "will-resize"]>;
    readonly bounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly edge: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"swipe">;
    readonly direction: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"rotate-gesture">;
    readonly rotation: Schema.Finite;
}>, Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["sheet-begin", "sheet-end"]>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"new-window-for-tab">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"session-end">;
    readonly reasons: Schema.$Array<Schema.String>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"system-context-menu">;
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
}>]>;
type Event = typeof Event.Type;
```

#### `WindowControls.Opacity`

```ts
const Opacity: Schema.Finite;
```

#### `WindowControls.Progress`

Taskbar progress from 0 to 1; a negative value removes the indicator.

```ts
const Progress: Schema.Finite;
```

#### `WindowControls.ProgressMode`

```ts
const ProgressMode: Schema.Literals<readonly ["none", "normal", "indeterminate", "error", "paused"]>;
type ProgressMode = typeof ProgressMode.Type;
```

#### `WindowControls.protocol`

```ts
const protocol: RpcGroup.RpcGroup<Rpc.Rpc<"audio", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly muted: Schema.Boolean;
    readonly audible: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"back", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"changes", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly bounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly normalBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    /** The content area, excluding the frame; attached views are positioned within it. */
    readonly contentBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly visible: Schema.Boolean;
    readonly focused: Schema.Boolean;
    readonly minimized: Schema.Boolean;
    readonly maximized: Schema.Boolean;
    readonly fullScreen: Schema.Boolean;
    /**
     * macOS's pre-Lion fullscreen: it does not create a Space, which is why a window minimizing to
     * the tray leaves it first. Probed on Linux: `setSimpleFullScreen` is honoured there too — both
     * this and `fullScreen` answer true afterwards — so the field is not macOS-only, even though its
     * distinct behavior (no Space) is.
     */
    readonly simpleFullScreen: Schema.Boolean;
    readonly title: Schema.String;
    readonly alwaysOnTop: Schema.Boolean;
    readonly opacity: Schema.Finite;
    readonly resizable: Schema.Boolean;
    readonly movable: Schema.Boolean;
    readonly minimizable: Schema.Boolean;
    readonly maximizable: Schema.Boolean;
    readonly closable: Schema.Boolean;
    readonly fullScreenable: Schema.Boolean;
    readonly menuBarVisible: Schema.Boolean;
    readonly kiosk: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"close", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"find", Schema.Struct<{
    text: Schema.String;
    options: Schema.optionalKey<Schema.Struct<{
        readonly forward: Schema.optionalKey<Schema.Boolean>;
        readonly matchCase: Schema.optionalKey<Schema.Boolean>;
    }>>;
}>, RpcSchema.Stream<Schema.Struct<{
    readonly activeMatchOrdinal: Schema.Int;
    readonly matches: Schema.Int;
    readonly selectionArea: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly finalUpdate: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"findNext", Schema.Struct<{
    forward: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"flash", Schema.Struct<{
    flash: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"forward", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"hide", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"history", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly index: Schema.Int;
    readonly entries: Schema.$Array<Schema.Struct<{
        readonly url: Schema.String;
        readonly title: Schema.String;
    }>>;
    readonly canGoBack: Schema.Boolean;
    readonly canGoForward: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"maximize", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"minimize", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"restore", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setAlwaysOnTop", Schema.Struct<{
    alwaysOnTop: Schema.Boolean;
    level: Schema.optionalKey<Schema.Literals<readonly ["normal", "floating", "torn-off-menu", "modal-panel", "main-menu", "status", "pop-up-menu", "screen-saver"]>>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setAudioMuted", Schema.Struct<{
    muted: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setBounds", Schema.Struct<{
    readonly x: Schema.optionalKey<Schema.Finite>;
    readonly y: Schema.optionalKey<Schema.Finite>;
    readonly width: Schema.optionalKey<Schema.Finite>;
    readonly height: Schema.optionalKey<Schema.Finite>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setFullScreen", Schema.Struct<{
    fullScreen: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setOpacity", Schema.Struct<{
    opacity: Schema.Finite;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setProgress", Schema.Struct<{
    progress: Schema.Finite;
    mode: Schema.optionalKey<Schema.Literals<readonly ["none", "normal", "indeterminate", "error", "paused"]>>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setSimpleFullScreen", Schema.Struct<{
    simpleFullScreen: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setTitle", Schema.Struct<{
    title: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setZoom", Schema.Struct<{
    factor: Schema.Finite;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"show", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"showInactive", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"state", Schema.Void, Schema.Struct<{
    readonly bounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly normalBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    /** The content area, excluding the frame; attached views are positioned within it. */
    readonly contentBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly visible: Schema.Boolean;
    readonly focused: Schema.Boolean;
    readonly minimized: Schema.Boolean;
    readonly maximized: Schema.Boolean;
    readonly fullScreen: Schema.Boolean;
    /**
     * macOS's pre-Lion fullscreen: it does not create a Space, which is why a window minimizing to
     * the tray leaves it first. Probed on Linux: `setSimpleFullScreen` is honoured there too — both
     * this and `fullScreen` answer true afterwards — so the field is not macOS-only, even though its
     * distinct behavior (no Space) is.
     */
    readonly simpleFullScreen: Schema.Boolean;
    readonly title: Schema.String;
    readonly alwaysOnTop: Schema.Boolean;
    readonly opacity: Schema.Finite;
    readonly resizable: Schema.Boolean;
    readonly movable: Schema.Boolean;
    readonly minimizable: Schema.Boolean;
    readonly maximizable: Schema.Boolean;
    readonly closable: Schema.Boolean;
    readonly fullScreenable: Schema.Boolean;
    readonly menuBarVisible: Schema.Boolean;
    readonly kiosk: Schema.Boolean;
}>, typeof SewedError, never, never> | Rpc.Rpc<"stopFind", Schema.Struct<{
    action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"zoom", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly factor: Schema.Finite;
}>, typeof SewedError>, Schema.Never, never, never>>;
```

#### `WindowControls.Size`

A width and height in pixels. As a maximum, zero in a dimension leaves it unlimited.

```ts
const Size: Schema.Struct<{
    readonly width: Schema.Finite;
    readonly height: Schema.Finite;
}>;
type Size = typeof Size.Type;
```

#### `WindowControls.SizeLimits`

The smallest and largest size the user may resize the window to.

```ts
const SizeLimits: Schema.Struct<{
    readonly minimum: Schema.Struct<{
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly maximum: Schema.Struct<{
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
}>;
type SizeLimits = typeof SizeLimits.Type;
```

#### `WindowControls.State`

```ts
const State: Schema.Struct<{
    readonly bounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly normalBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    /** The content area, excluding the frame; attached views are positioned within it. */
    readonly contentBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly visible: Schema.Boolean;
    readonly focused: Schema.Boolean;
    readonly minimized: Schema.Boolean;
    readonly maximized: Schema.Boolean;
    readonly fullScreen: Schema.Boolean;
    /**
     * macOS's pre-Lion fullscreen: it does not create a Space, which is why a window minimizing to
     * the tray leaves it first. Probed on Linux: `setSimpleFullScreen` is honoured there too — both
     * this and `fullScreen` answer true afterwards — so the field is not macOS-only, even though its
     * distinct behavior (no Space) is.
     */
    readonly simpleFullScreen: Schema.Boolean;
    readonly title: Schema.String;
    readonly alwaysOnTop: Schema.Boolean;
    readonly opacity: Schema.Finite;
    readonly resizable: Schema.Boolean;
    readonly movable: Schema.Boolean;
    readonly minimizable: Schema.Boolean;
    readonly maximizable: Schema.Boolean;
    readonly closable: Schema.Boolean;
    readonly fullScreenable: Schema.Boolean;
    readonly menuBarVisible: Schema.Boolean;
    readonly kiosk: Schema.Boolean;
}>;
type State = typeof State.Type;
```

#### `WindowControls.ThumbarButton`

One button of a Windows taskbar thumbnail toolbar; `id` names it in `thumbarClicks`.

```ts
const ThumbarButton: Schema.Struct<{
    readonly id: Schema.String;
    readonly icon: Schema.Union<readonly [Schema.String, Binary.Bytes]>;
    readonly tooltip: Schema.optionalKey<Schema.String>;
    readonly flags: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["enabled", "disabled", "dismissonclick", "nobackground", "hidden", "noninteractive"]>>>;
}>;
type ThumbarButton = typeof ThumbarButton.Type;
```

#### `WindowControls.TitleBarOverlay`

Colors and height of the native window controls drawn over a frameless window's content.

```ts
const TitleBarOverlay: Schema.Struct<{
    readonly color: Schema.optionalKey<Schema.String>;
    readonly symbolColor: Schema.optionalKey<Schema.String>;
    readonly height: Schema.optionalKey<Schema.Int>;
}>;
type TitleBarOverlay = typeof TitleBarOverlay.Type;
```

#### `WindowControls.Vibrancy`

A macOS material drawn behind a window's content; `null` removes it.

```ts
const Vibrancy: Schema.NullOr<Schema.Literals<readonly ["titlebar", "selection", "menu", "popover", "sidebar", "header", "sheet", "window", "hud", "fullscreen-ui", "tooltip", "content", "under-window", "under-page"]>>;
type Vibrancy = typeof Vibrancy.Type;
```

#### `WindowControls.WindowMessage`

A raw Windows message delivered to a window, with its parameters as bytes.

```ts
const WindowMessage: Schema.Struct<{
    readonly wParam: Binary.Bytes;
    readonly lParam: Binary.Bytes;
}>;
type WindowMessage = typeof WindowMessage.Type;
```

### `WorkerContext`

```ts
class WorkerContext extends WorkerContext_base {}
```

## `sewed/main`

### `App`

#### `App.accessibility`

Chromium's accessibility tree, which assistive technology turns on by itself.

```ts
const accessibility: {
    enabled: Effect.Effect<boolean, SewedError, MainContext>;
    setEnabled: (enabled: boolean) => Effect.Effect<void, SewedError, MainContext>;
    /** Which parts of the accessibility tree are built, such as `nativeAPIs` and `webContents`. */
    features: Effect.Effect<string[], SewedError, MainContext>;
    setFeatures: (features: ReadonlyArray<string>) => Effect.Effect<void, SewedError, MainContext>;
    changes: Stream.Stream<boolean, SewedError, MainContext>;
};
```

#### `App.Activation`

```ts
interface Activation {
  readonly hasVisibleWindows: boolean;
}
```

#### `App.activations`

```ts
const activations: Stream.Stream<Activation, SewedError, MainContext>;
```

#### `App.active`

Whether the application is the active one, on macOS.

```ts
const active: Effect.Effect<boolean, SewedError, MainContext>;
```

#### `App.activeChanges`

Emits `true` when the application becomes the active one and `false` when it stops, on macOS.

```ts
const activeChanges: Stream.Stream<boolean, SewedError, MainContext>;
```

#### `App.activity`

Handoff, on macOS: what the user is doing here, offered to their other devices.

```ts
const activity: {
    current: Effect.Effect<string, SewedError, MainContext>;
    set: (value: Application.Activity) => Effect.Effect<void, SewedError, MainContext>;
    /** Replaces the current activity's state when its type matches. */
    update: (value: Application.Activity) => Effect.Effect<void, SewedError, MainContext>;
    invalidate: Effect.Effect<void, SewedError, MainContext>;
    /** Stops offering the current activity without ending it. */
    resign: Effect.Effect<void, SewedError, MainContext>;
    /**
     * Activities arriving from another device and the state of this one's. Observing claims each
     * `continue` and `update-state`: their defaults are prevented, which tells macOS the application
     * handles them.
     */
    events: Stream.Stream<{
        readonly kind: "will-continue";
        readonly type: string;
    } | {
        readonly kind: "continue" | "update-state" | "was-continued";
        readonly type: string;
        readonly userInfo: Schema.Json;
        readonly webpageUrl?: string;
    } | {
        readonly kind: "continue-error";
        readonly type: string;
        readonly error: string;
    }, SewedError, MainContext>;
};
```

#### `App.allWebContents`

```ts
const allWebContents: Effect.Effect<ReadonlyArray<Application.WebContentsEntry>, SewedError, MainContext>;
```

#### `App.applicationInfoForProtocol`

The application that opens a URL's scheme, with its path and icon; fails `Native` when none is
registered or the platform cannot say.

```ts
const applicationInfoForProtocol: (url: string) => Effect.Effect<Application.ProtocolApplication, SewedError, MainContext>;
```

#### `App.applicationNameForProtocol`

The name of the application that opens a URL's scheme, or an empty string when none is
registered or the platform cannot say.

```ts
const applicationNameForProtocol: (url: string) => Effect.Effect<string, SewedError, MainContext>;
```

#### `App.applicationsFolder`

The macOS Applications folder.

```ts
const applicationsFolder: {
    contains: Effect.Effect<boolean, SewedError, MainContext>;
    /**
     * Moves the application there and relaunches it; answers `false` when the user declined. When
     * an application of the same name is already there, `replace` replaces it and `keep`, the
     * default, leaves both alone.
     */
    move: (conflict?: "keep" | "replace") => Effect.Effect<boolean, SewedError, MainContext>;
};
```

#### `App.appPath`

The application's own path, as Electron reports it before readiness, for an entry's first pass.

```ts
const appPath: () => string;
```

#### `App.badge`

```ts
const badge: Effect.Effect<number, SewedError, MainContext>;
```

#### `App.childProcesses`

```ts
const childProcesses: Stream.Stream<Application.ChildProcessGone, SewedError, MainContext>;
```

#### `App.claimInstance`

Claims the single instance for the caller's scope, when the program chooses — after any
launcher or handoff checks it wants to run first. A second process's claim fails
{@link SecondaryInstance} once Electron has forwarded its arguments to this one, and that
process's program decides how to exit. Later launches arrive on the instance's `launches`; the
lock is released when the scope closes. One claim may be held at a time; a second fails `Limit`.

```ts
const claimInstance: (options?: Instance.Options) => Effect.Effect<Instance.Instance, SewedError | Instance.SecondaryInstance, MainContext | Scope.Scope>;
```

#### `App.ClaimOptions`

```ts
interface Options {
  /** A JSON object forwarded to the primary process when this one turns out to be secondary. */
  readonly data?: Schema.JsonObject;
}
export type { Options as ClaimOptions };
```

#### `App.configureHostResolver`

Changes how the process resolves host names, for every session.

```ts
const configureHostResolver: (options: Application.HostResolver) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.configureWebAuthn`

Lets the macOS Touch ID authenticator answer WebAuthn requests, storing credentials in a
keychain access group the application is entitled to.

```ts
const configureWebAuthn: (keychainAccessGroup: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.decide`

Installs a decider for one of `Decidables.App`'s decidables against the running application's own
registry, for the caller's scope. This is {@link Decision.Owner}'s method: any number of deciders
may be installed, and the decidable's own composition (declared in `Decidables.ts`) decides among
them. Without a running application owner, this fails `Closed` rather than installing a decider
nothing will ever consult.

```ts
const decide: <Event, Answer, Timing extends "sync" | "async", R = never>(decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition, "app">, decider: Decision.DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>) => Effect.Effect<void, SewedError, MainContext | Scope.Scope | R>;
```

#### `App.declare`

Declares facts about the application that must precede readiness, such as the Windows user model id.

```ts
const declare: (options: Application.Identity) => Declaration.Declaration;
```

#### `App.defaultPath`

The path Electron uses for `name` with nothing declared — read before readiness, as an input to a
declaration. A pre-readiness `Paths.declare` of `userData` moves `sessionData`, `logs` and
`crashDumps` with it, so once a declaration has applied this reader reflects it; inside the
program, {@link path} is the reader. An invalid name throws `Protocol`; a name Electron cannot
answer on this platform (`recent` outside Windows) throws `Native`.

```ts
const defaultPath: (name: Application.PathName) => string;
```

#### `App.dock`

macOS dock operations; every operation fails with Native elsewhere.

```ts
const dock: {
    /** Bounces the Downloads stack for a file that finished downloading, by absolute path. */
    downloadFinished: (path: string) => Effect.Effect<void, SewedError, MainContext>;
    badge: Effect.Effect<string, SewedError, MainContext>;
    setBadge: (text: string) => Effect.Effect<void, SewedError, MainContext>;
    /** A path or already-encoded bytes, over wave 3's `Image.Source`; `Native` where there is no dock. */
    setIcon: (image: ImageSource) => Effect.Effect<void, SewedError, MainContext>;
    bounce: (kind?: Application.DockBounce) => Effect.Effect<number, SewedError, MainContext>;
    cancelBounce: (id: number) => Effect.Effect<void, SewedError, MainContext>;
    hide: Effect.Effect<void, SewedError, MainContext>;
    show: Effect.Effect<void, SewedError, MainContext>;
    visible: Effect.Effect<boolean, SewedError, MainContext>;
};
```

#### `App.emojiPanelSupported`

Whether the platform has an emoji panel to show.

```ts
const emojiPanelSupported: Effect.Effect<boolean, SewedError, MainContext>;
```

#### `App.exit`

Ends the application with exactly this exit code, once the application scope has closed and
its finalizers have run. It does not consult `Decidables.App.Quit`: Electron's own `app.exit`
fires no quit event, and a launcher that must answer a code cannot be vetoed by a feature.
Use {@link quit} for a quit a feature may refuse. `code` is an integer from 0 to 255. The first
request wins: once an exit or an accepted quit is already in progress, a further call fails
`Closed` and the code already requested stands — so call it from the program, not from a
finalizer, which runs only once a shutdown has begun.

```ts
const exit: (code: number) => Effect.Effect<never, SewedError, MainContext>;
```

#### `App.fileIcon`

The icon the operating system shows for a file, as PNG bytes; the path must be absolute.

```ts
const fileIcon: (path: string, size?: Application.FileIconSize) => Effect.Effect<Uint8Array, SewedError, MainContext>;
```

#### `App.focusedWebContents`

```ts
const focusedWebContents: Effect.Effect<Application.WebContentsEntry | null, SewedError, MainContext>;
```

#### `App.focusedWindow`

```ts
const focusedWindow: Effect.Effect<Application.WindowEntry | null, SewedError, MainContext>;
```

#### `App.gpu`

```ts
const gpu: (kind?: Application.GpuInfoKind) => Effect.Effect<Schema.Json, SewedError, MainContext>;
```

#### `App.gpuFeatures`

```ts
const gpuFeatures: Effect.Effect<Record<string, string>, SewedError, MainContext>;
```

#### `App.gpuInfoUpdates`

Emits each time the GPU information changes; read it with {@link gpu}.

```ts
const gpuInfoUpdates: Stream.Stream<void, SewedError, MainContext>;
```

#### `App.hasSingleInstanceLock`

Whether this instance holds the single-instance lock.

```ts
const hasSingleInstanceLock: Effect.Effect<boolean, SewedError, MainContext>;
```

#### `App.hidden`

Whether the application is hidden, on macOS.

```ts
const hidden: Effect.Effect<boolean, SewedError, MainContext>;
```

#### `App.importCertificate`

Imports a PKCS#12 file, by absolute path, into the platform certificate store, on Linux.

```ts
const importCertificate: (options: Application.CertificateImport) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.info`

```ts
const info: Effect.Effect<Application.Info, SewedError, MainContext>;
```

#### `App.Instance`

The claimed single instance: the launches of later processes, for as long as the claim's scope lives.

```ts
interface Instance {
  readonly launches: Stream.Stream<SecondInstance, SewedError>;
}
```

#### `App.isDefaultProtocolClient`

```ts
const isDefaultProtocolClient: (client: Application.ProtocolClient) => Effect.Effect<boolean, SewedError, MainContext>;
```

#### `App.launches`

```ts
const launches: Stream.Stream<Launch.Request, SewedError, MainContext>;
```

#### `App.loginItems`

```ts
const loginItems: Effect.Effect<Application.LoginItems, SewedError, MainContext>;
```

#### `App.menu`

Installs the application menu for the caller's scope and returns its handle: `replace` swaps
the menu, `selections` streams custom selections. One menu at a time; a second fails `Limit`.
Release stops the menu's callbacks without restoring or clearing the native menu. Step 4 of the
platform redesign replaces this with contributions.

```ts
const menu: (options: MenuSchema.ApplicationOptions) => Effect.Effect<Menu, SewedError, MainContext | Scope.Scope>;
```

#### `App.Menu`

```ts
type Menu = ApplicationMenu.Handle;
```

#### `App.metrics`

Memory and processor use of every process the application runs. Processor percentages measure
the time since the previous read, so the first read of a process answers zero.

```ts
const metrics: Effect.Effect<ReadonlyArray<Application.ProcessMetric>, SewedError, MainContext>;
```

#### `App.newWindowForTab`

Emits when the user asks for a new tab with no window to take it, on macOS.

```ts
const newWindowForTab: Stream.Stream<void, SewedError, MainContext>;
```

#### `App.path`

```ts
const path: (name: Application.PathName) => Effect.Effect<string, SewedError, MainContext>;
```

#### `App.preferredSystemLanguages`

The OS's own preferred languages, in the order it reports them — read directly, with no Effect,
because this is meant to run as an input to a declaration thunk, before any Effect runs and
before Electron is ready. `getPreferredSystemLanguages` is safe pre-readiness; `getSystemLocale`
throws there and `getLocale` answers `""`. The values are the OS's own and unmapped — a POSIX
`C` locale answers `["c"]` — turning one into a `--lang` value is the application's decision.

```ts
const preferredSystemLanguages: () => readonly string[];
```

#### `App.quit`

```ts
const quit: Effect.Effect<void, SewedError, MainContext>;
```

#### `App.recentDocuments`

Recently opened documents, in the macOS Dock menu and the Windows jump list.

```ts
const recentDocuments: {
    add: (path: string) => Effect.Effect<void, SewedError, MainContext>;
    clear: Effect.Effect<void, SewedError, MainContext>;
    list: Effect.Effect<string[], SewedError, MainContext>;
};
```

#### `App.relaunch`

Arranges for a new instance to start when this one exits. It does not end this instance:
follow it with {@link quit} or {@link exit}. Called more than once, every call starts an
instance.

```ts
const relaunch: (options?: Application.Relaunch) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.removeDefaultProtocolClient`

```ts
const removeDefaultProtocolClient: (client: Application.ProtocolClient) => Effect.Effect<boolean, SewedError, MainContext>;
```

#### `App.run`

Runs the application: installs the launch and quit listeners, applies every declaration in
order — failing `Startup` on the first that cannot apply — waits for Electron readiness, and
runs `program` under `MainContext` in the application scope until quit. A declaration is applied
synchronously and before readiness; asynchronous work belongs in `program`. A non-empty
declaration list fails `Startup` immediately, applying nothing, if Electron is already ready —
call `App.run` in the entry module's first synchronous pass, or after a top-level await in an
ES-module entry.

```ts
const run: <E>(declarations: readonly Declaration.Entry[], program: Effect.Effect<unknown, E, MainContext | Scope.Scope>) => Fiber.Fiber<number | undefined, E | SewedError>;
```

#### `App.runningUnderArm64Translation`

Whether an x64 build is running translated on ARM64, under Rosetta or Windows on ARM.

```ts
const runningUnderArm64Translation: Effect.Effect<boolean, SewedError, MainContext>;
```

#### `App.SecondaryInstance`

Another process already holds the single-instance lock. Electron forwarded this process's
arguments, working directory and claim data to it inside the lock request, so nothing is lost;
what remains is for the program to decide how this process exits.

```ts
class SecondaryInstance extends SecondaryInstance_base {
  get message(): string;
}
```

#### `App.secureKeyboardEntry`

```ts
const secureKeyboardEntry: Effect.Effect<boolean, SewedError, MainContext>;
```

#### `App.securityScopedResource`

Opens a file outside the sandbox through a security-scoped bookmark a dialog returned, for the
scope's lifetime, in a Mac App Store build.

```ts
const securityScopedResource: (bookmark: string) => Effect.Effect<void, SewedError, MainContext | Scope.Scope>;
```

#### `App.sendActionToFirstResponder`

Sends an Objective-C action, such as `selectAll:`, to whatever has keyboard focus in the macOS
application, as a menu item with that action would.

```ts
const sendActionToFirstResponder: (action: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.sessionsCreated`

Every session Electron creates.

```ts
const sessionsCreated: Stream.Stream<Application.SessionCreated, SewedError, MainContext>;
```

#### `App.setAboutPanel`

```ts
const setAboutPanel: (options: Application.AboutPanel) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.setActivationPolicy`

Whether the application shows in the Dock (`regular`), only as windows, or not at all.

```ts
const setActivationPolicy: (policy: Application.ActivationPolicy) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.setBadge`

Sets the dock or taskbar badge count; zero clears it. Fails with Native where unsupported.

```ts
const setBadge: (count: number) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.setDefaultProtocolClient`

```ts
const setDefaultProtocolClient: (client: Application.ProtocolClient) => Effect.Effect<boolean, SewedError, MainContext>;
```

#### `App.setLoginItems`

```ts
const setLoginItems: (settings: Application.LoginItemSettings) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.setPath`

```ts
const setPath: (name: Application.PathName, directory: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.setSecureKeyboardEntry`

```ts
const setSecureKeyboardEntry: (enabled: boolean) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.setToastActivatorClsid`

```ts
const setToastActivatorClsid: (id: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.setUserAgentFallback`

```ts
const setUserAgentFallback: (userAgent: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.showAboutPanel`

```ts
const showAboutPanel: Effect.Effect<void, SewedError, MainContext>;
```

#### `App.showCertificateTrustDialog`

Shows the system's dialog for trusting or importing a certificate, on macOS and Windows, for a
certificate the application was recently asked about (by a certificate or client certificate
decider), named by its fingerprint. It resolves when the dialog closes; whether the user
trusted it is theirs to know. An unknown fingerprint fails `Protocol`.

```ts
const showCertificateTrustDialog: (fingerprint: string, message: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.showEmojiPanel`

```ts
const showEmojiPanel: Effect.Effect<void, SewedError, MainContext>;
```

#### `App.showErrorBox`

Shows a fatal error with no window: a title and a message, for an entry that cannot yet build one
— before `App.run`, or when a window has nothing to attach it to. Probed on Linux:
before readiness the call prints `title` and `content` to stderr and returns at once, whether or
not a display is present, because GTK is not yet up; after readiness with a display it shows a
blocking native modal. Electron documents a native box before readiness on Windows and macOS too
(not probed here). A window with something to attach a message to uses `window.dialog.message`
instead — this is for the case where nothing can. `title` and `content` must both be non-empty
strings; either empty throws `Protocol`.

```ts
const showErrorBox: (options: Application.ErrorBox) => void;
```

#### `App.taskbar`

Windows taskbar operations; every operation fails with Native elsewhere.

```ts
const taskbar: {
    /** What the user removed from the jump list, and its minimum size. */
    jumpListSettings: Effect.Effect<{
        readonly minItems: number;
        readonly removedItems: readonly {
            readonly type?: "file" | "separator" | "task";
            readonly path?: string;
            readonly program?: string;
            readonly args?: string;
            readonly title?: string;
            readonly description?: string;
            readonly iconPath?: string;
            readonly iconIndex?: number;
            readonly workingDirectory?: string;
        }[];
    }, SewedError, MainContext>;
    setUserTasks: (tasks: readonly Application.Task[]) => Effect.Effect<void, SewedError, MainContext>;
    setJumpList: (categories: readonly Application.JumpListCategory[] | null) => Effect.Effect<void, SewedError, MainContext>;
};
```

#### `App.terminate`

Ends the process now with exactly this code, running nothing: no finalizer, no listener, no quit
decider, and nothing after the call. It is for a harness whose program may hang — a timeout that
must answer the shell even when the program's finalizers would never finish. Everything else
uses {@link exit}, which closes the application scope first. `code` is an integer from 0 to 255;
an invalid one throws `Protocol` before anything ends.

```ts
const terminate: (code: number) => never;
```

#### `App.toastActivatorClsid`

The CLSID Windows activates for the application's toast notifications.

```ts
const toastActivatorClsid: Effect.Effect<string, SewedError, MainContext>;
```

#### `App.userAgentFallback`

The user agent sessions use when they set none of their own.

```ts
const userAgentFallback: Effect.Effect<string, SewedError, MainContext>;
```

#### `App.webContentsCreated`

```ts
const webContentsCreated: Stream.Stream<Application.WebContentsCreated, SewedError, MainContext>;
```

#### `App.willQuit`

Emits once every window has closed and the process is about to quit, after the quit decision.
It is an observation: the application scope's finalizers are where shutdown work belongs.

```ts
const willQuit: Stream.Stream<void, SewedError, MainContext>;
```

#### `App.windowFocus`

Focus entering or leaving windows; Sewed windows are named by their id, others are null.

```ts
const windowFocus: Stream.Stream<Application.WindowFocus, SewedError, MainContext>;
```

#### `App.windows`

What the process has open, as plain data. Electron's lookups hand out the native objects;
these name each one instead, by the Sewed id of the handle that owns it, so a program can find
its own windows and notice what it did not create without receiving a resource nobody owns.

```ts
const windows: Effect.Effect<ReadonlyArray<Application.WindowEntry>, SewedError, MainContext>;
```

#### `App.windowsCreated`

Every window the process creates, a Sewed one or not.

```ts
const windowsCreated: Stream.Stream<Application.WindowEntry, SewedError, MainContext>;
```

### `Automation`

#### `Automation.Declaration`

The automation web contents are created with; an undeclared operation does not exist on the handle.

```ts
const Declaration: Schema.Struct<{
    readonly evaluate: Schema.optionalKey<Schema.Literal<true>>;
    readonly devtools: Schema.optionalKey<Schema.NonEmptyArray<Schema.String>>;
    readonly input: Schema.optionalKey<Schema.Literal<true>>;
}>;
type Declaration = typeof Declaration.Type;
```

#### `Automation.DevToolsMethod`

A DevTools protocol method such as `Runtime.evaluate`.

```ts
const DevToolsMethod: Schema.String;
type DevToolsMethod = typeof DevToolsMethod.Type;
```

#### `Automation.DevToolsOf`

The DevTools methods a declaration allows; none when the declaration has no allowlist.

```ts
type DevToolsOf<A extends Declaration> = A extends {
  readonly devtools: readonly string[];
}
  ? A["devtools"][number]
  : never;
```

#### `Automation.EvaluateOptions`

```ts
const EvaluateOptions: Schema.Struct<{
    readonly userGesture: Schema.optionalKey<Schema.Boolean>;
    /**
     * Runs the script in an isolated world of this id instead of the page's own, so it shares the
     * DOM but none of the page's JavaScript state. Ids from 1000 up are free for applications.
     */
    readonly world: Schema.optionalKey<Schema.Int>;
}>;
type EvaluateOptions = typeof EvaluateOptions.Type;
```

#### `Automation.InputEvent`

```ts
const InputEvent: Schema.Union<readonly [Schema.Struct<{
    readonly modifiers: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["shift", "control", "ctrl", "alt", "meta", "command", "cmd", "iskeypad", "isautorepeat", "leftbuttondown", "middlebuttondown", "rightbuttondown", "capslock", "numlock", "left", "right"]>>>;
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
    readonly globalX: Schema.optionalKey<Schema.Finite>;
    readonly globalY: Schema.optionalKey<Schema.Finite>;
    readonly movementX: Schema.optionalKey<Schema.Finite>;
    readonly movementY: Schema.optionalKey<Schema.Finite>;
    readonly type: Schema.Literals<readonly ["mouseDown", "mouseUp", "mouseEnter", "mouseLeave", "contextMenu", "mouseMove"]>;
    readonly button: Schema.optionalKey<Schema.Literals<readonly ["left", "middle", "right"]>>;
    readonly clickCount: Schema.optionalKey<Schema.Int>;
}>, Schema.Struct<{
    readonly modifiers: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["shift", "control", "ctrl", "alt", "meta", "command", "cmd", "iskeypad", "isautorepeat", "leftbuttondown", "middlebuttondown", "rightbuttondown", "capslock", "numlock", "left", "right"]>>>;
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
    readonly globalX: Schema.optionalKey<Schema.Finite>;
    readonly globalY: Schema.optionalKey<Schema.Finite>;
    readonly movementX: Schema.optionalKey<Schema.Finite>;
    readonly movementY: Schema.optionalKey<Schema.Finite>;
    readonly type: Schema.Literal<"mouseWheel">;
    readonly deltaX: Schema.optionalKey<Schema.Finite>;
    readonly deltaY: Schema.optionalKey<Schema.Finite>;
    readonly wheelTicksX: Schema.optionalKey<Schema.Finite>;
    readonly wheelTicksY: Schema.optionalKey<Schema.Finite>;
    readonly accelerationRatioX: Schema.optionalKey<Schema.Finite>;
    readonly accelerationRatioY: Schema.optionalKey<Schema.Finite>;
    readonly hasPreciseScrollingDeltas: Schema.optionalKey<Schema.Boolean>;
    readonly canScroll: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{
    readonly modifiers: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["shift", "control", "ctrl", "alt", "meta", "command", "cmd", "iskeypad", "isautorepeat", "leftbuttondown", "middlebuttondown", "rightbuttondown", "capslock", "numlock", "left", "right"]>>>;
    readonly type: Schema.Literals<readonly ["rawKeyDown", "keyDown", "keyUp", "char"]>;
    readonly keyCode: Schema.String;
}>]>;
type InputEvent = typeof InputEvent.Type;
```

#### `Automation.KeyboardInput`

```ts
const KeyboardInput: Schema.Struct<{
    readonly modifiers: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["shift", "control", "ctrl", "alt", "meta", "command", "cmd", "iskeypad", "isautorepeat", "leftbuttondown", "middlebuttondown", "rightbuttondown", "capslock", "numlock", "left", "right"]>>>;
    readonly type: Schema.Literals<readonly ["rawKeyDown", "keyDown", "keyUp", "char"]>;
    readonly keyCode: Schema.String;
}>;
type KeyboardInput = typeof KeyboardInput.Type;
```

#### `Automation.Members`

Every automation member, typed against one declaration.

```ts
interface Members<A extends Declaration> {
  readonly evaluate: <T, I>(
    script: string,
    result: Schema.Codec<T, I>,
    options?: EvaluateOptions,
  ) => Effect.Effect<T, SewedError, MainContext>;
  readonly devtools: <T, I>(
    method: DevToolsOf<A>,
    params: Schema.Json | undefined,
    result: Schema.Codec<T, I>,
  ) => Effect.Effect<T, SewedError, MainContext>;
  readonly input: (event: InputEvent) => Effect.Effect<void, SewedError, MainContext>;
}
```

#### `Automation.MouseInput`

Data mirrors of Electron's input structures; the library copies them before sending.

```ts
const MouseInput: Schema.Struct<{
    readonly modifiers: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["shift", "control", "ctrl", "alt", "meta", "command", "cmd", "iskeypad", "isautorepeat", "leftbuttondown", "middlebuttondown", "rightbuttondown", "capslock", "numlock", "left", "right"]>>>;
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
    readonly globalX: Schema.optionalKey<Schema.Finite>;
    readonly globalY: Schema.optionalKey<Schema.Finite>;
    readonly movementX: Schema.optionalKey<Schema.Finite>;
    readonly movementY: Schema.optionalKey<Schema.Finite>;
    readonly type: Schema.Literals<readonly ["mouseDown", "mouseUp", "mouseEnter", "mouseLeave", "contextMenu", "mouseMove"]>;
    readonly button: Schema.optionalKey<Schema.Literals<readonly ["left", "middle", "right"]>>;
    readonly clickCount: Schema.optionalKey<Schema.Int>;
}>;
type MouseInput = typeof MouseInput.Type;
```

#### `Automation.MouseWheelInput`

```ts
const MouseWheelInput: Schema.Struct<{
    readonly modifiers: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["shift", "control", "ctrl", "alt", "meta", "command", "cmd", "iskeypad", "isautorepeat", "leftbuttondown", "middlebuttondown", "rightbuttondown", "capslock", "numlock", "left", "right"]>>>;
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
    readonly globalX: Schema.optionalKey<Schema.Finite>;
    readonly globalY: Schema.optionalKey<Schema.Finite>;
    readonly movementX: Schema.optionalKey<Schema.Finite>;
    readonly movementY: Schema.optionalKey<Schema.Finite>;
    readonly type: Schema.Literal<"mouseWheel">;
    readonly deltaX: Schema.optionalKey<Schema.Finite>;
    readonly deltaY: Schema.optionalKey<Schema.Finite>;
    readonly wheelTicksX: Schema.optionalKey<Schema.Finite>;
    readonly wheelTicksY: Schema.optionalKey<Schema.Finite>;
    readonly accelerationRatioX: Schema.optionalKey<Schema.Finite>;
    readonly accelerationRatioY: Schema.optionalKey<Schema.Finite>;
    readonly hasPreciseScrollingDeltas: Schema.optionalKey<Schema.Boolean>;
    readonly canScroll: Schema.optionalKey<Schema.Boolean>;
}>;
type MouseWheelInput = typeof MouseWheelInput.Type;
```

#### `Automation.Of`

The automation members a declaration grants; undeclared members do not exist on the type.

```ts
type Of<A extends Declaration> = Pick<Members<A>, Extract<keyof A, keyof Members<A>>>;
```

### `BaseWindow`

#### `BaseWindow.AttachOptions`

```ts
type AttachOptions = Window.AttachOptions;
```

#### `BaseWindow.clearPersistedState`

Forgets the bounds and display mode persisted for the window of this `name`, so its next
creation starts from its options. Works for a browser window's name too.

```ts
const clearPersistedState: (name: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `BaseWindow.Handle`

```ts
type Handle = Effect.Success<ReturnType<typeof make>>;
```

#### `BaseWindow.make`

```ts
const make: (options?: Options) => Effect.Effect<Omit<{
    setFocusable: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    focusable: Effect.Effect<boolean, SewedError, MainContext>;
    contentProtected: Effect.Effect<boolean, SewedError, MainContext>;
    setRepresentedFilename: (path: string) => Effect.Effect<void, SewedError, MainContext>;
    representedFilename: Effect.Effect<string, SewedError, MainContext>;
    setDocumentEdited: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    documentEdited: Effect.Effect<boolean, SewedError, MainContext>;
    setVibrancy: (vibrancy: WindowControls.Vibrancy) => Effect.Effect<void, SewedError, MainContext>;
    setWindowButtonPosition: (position: Screen.Point | null) => Effect.Effect<void, SewedError, MainContext>;
    windowButtonPosition: Effect.Effect<{
        x: number;
        y: number;
    } | null, SewedError, MainContext>;
    setSheetOffset: (offset: {
        readonly y: number;
        readonly x?: number;
    }) => Effect.Effect<void, SewedError, MainContext>;
    previewFile: (path: string, displayName?: string) => Effect.Effect<void, SewedError, MainContext>;
    closeFilePreview: Effect.Effect<void, SewedError, MainContext>;
    setHiddenInMissionControl: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    hiddenInMissionControl: Effect.Effect<boolean, SewedError, MainContext>;
    setAutoHideCursor: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    invalidateShadow: Effect.Effect<void, SewedError, MainContext>;
    setExcludedFromShownWindowsMenu: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    excludedFromShownWindowsMenu: Effect.Effect<boolean, SewedError, MainContext>;
    tabs: {
        identifier: Effect.Effect<string | null, SewedError, MainContext>;
        selectNext: Effect.Effect<void, SewedError, MainContext>;
        selectPrevious: Effect.Effect<void, SewedError, MainContext>;
        showAll: Effect.Effect<void, SewedError, MainContext>;
        mergeAll: Effect.Effect<void, SewedError, MainContext>;
        moveToNewWindow: Effect.Effect<void, SewedError, MainContext>;
        toggleBar: Effect.Effect<void, SewedError, MainContext>;
        add: (window: {
            readonly id: string;
        }) => Effect.Effect<void, SewedError, MainContext>;
    };
    setAccentColor: (color: WindowControls.AccentColor) => Effect.Effect<void, SewedError, MainContext>;
    setAppDetails: (details: WindowControls.AppDetails) => Effect.Effect<void, SewedError, MainContext>;
    setBackgroundMaterial: (material: WindowControls.BackgroundMaterial) => Effect.Effect<void, SewedError, MainContext>;
    setThumbarButtons: (buttons: ReadonlyArray<WindowControls.ThumbarButton>) => Effect.Effect<void, SewedError, MainContext>;
    thumbarClicks: Stream.Stream<string, SewedError, MainContext>;
    setThumbnailClip: (region: WindowControls.Bounds) => Effect.Effect<void, SewedError, MainContext>;
    setThumbnailToolTip: (text: string) => Effect.Effect<void, SewedError, MainContext>;
    snapped: Effect.Effect<boolean, SewedError, MainContext>;
    tabletMode: Effect.Effect<boolean, SewedError, MainContext>;
    windowMessages: (message: number) => Stream.Stream<WindowControls.WindowMessage, SewedError, MainContext>;
    native: NativeBaseWindow;
    closed: Deferred.Deferred<void, never>;
    webContents: {
        frames: (options?: WebContents.FrameOptions) => Stream.Stream<WebContents.Frame, SewedError, MainContext>;
        painting: Effect.Effect<{
            readonly offscreen: boolean;
            readonly painting: boolean;
            readonly frameRate: number;
        }, SewedError, MainContext>;
        setPainting: (painting: boolean) => Effect.Effect<void, SewedError, MainContext>;
        setFrameRate: (rate: WebContents.FrameRate) => Effect.Effect<void, SewedError, MainContext>;
        invalidate: Effect.Effect<void, SewedError, MainContext>;
        frameTree: Effect.Effect<readonly {
            readonly processId: number;
            readonly routingId: number;
            readonly frameTreeNodeId: number;
            readonly token: string;
            readonly osProcessId: number;
            readonly isMainFrame: boolean;
            readonly parent: number | null;
            readonly url: string;
            readonly origin: string;
            readonly name: string;
            readonly visibilityState: string;
        }[], SewedError, MainContext>;
        opener: Effect.Effect<{
            readonly processId: number;
            readonly routingId: number;
            readonly frameTreeNodeId: number;
            readonly token: string;
            readonly osProcessId: number;
            readonly isMainFrame: boolean;
            readonly parent: number | null;
            readonly url: string;
            readonly origin: string;
            readonly name: string;
            readonly visibilityState: string;
        } | null, SewedError, MainContext>;
        focusedFrame: Effect.Effect<{
            readonly processId: number;
            readonly routingId: number;
            readonly frameTreeNodeId: number;
            readonly token: string;
            readonly osProcessId: number;
            readonly isMainFrame: boolean;
            readonly parent: number | null;
            readonly url: string;
            readonly origin: string;
            readonly name: string;
            readonly visibilityState: string;
        } | null, SewedError, MainContext>;
        hostId: Effect.Effect<string | null, SewedError, MainContext>;
        devToolsContentsId: Effect.Effect<number | null, SewedError, MainContext>;
        collectJavaScriptCallStack: Effect.Effect<string | null, SewedError, MainContext>;
        zoomLevel: Effect.Effect<number, SewedError, MainContext>;
        setZoomLevel: (level: WebContents.ZoomLevel) => Effect.Effect<void, SewedError, MainContext>;
        zoomMode: Effect.Effect<"default" | "disabled" | "isolated" | "manual", SewedError, MainContext>;
        setZoomMode: (mode: WebContents.ZoomMode) => Effect.Effect<void, SewedError, MainContext>;
        rendererProcessId: Effect.Effect<number, SewedError, MainContext>;
        sharedWorkers: Effect.Effect<readonly {
            readonly id: string;
            readonly url: string;
        }[], SewedError, MainContext>;
        inspectSharedWorker: (id: string) => Effect.Effect<void, SewedError, MainContext>;
        devToolsTargetId: Effect.Effect<string, SewedError, MainContext>;
        addDevToolsWorkspace: (path: string) => Effect.Effect<void, SewedError, MainContext>;
        removeDevToolsWorkspace: (path: string) => Effect.Effect<void, SewedError, MainContext>;
        printers: Effect.Effect<readonly {
            readonly name: string;
            readonly displayName: string;
            readonly description: string;
        }[], SewedError, MainContext>;
        webRtc: Effect.Effect<{
            readonly ipHandlingPolicy: string;
            readonly udpPortRange: {
                readonly min: number;
                readonly max: number;
            };
        }, SewedError, MainContext>;
        setWebRtcIpHandlingPolicy: (policy: WebContents.WebRtcIpHandlingPolicy) => Effect.Effect<void, SewedError, MainContext>;
        setWebRtcUdpPortRange: (range: WebContents.UdpPortRange) => Effect.Effect<void, SewedError, MainContext>;
        caretBrowsing: Effect.Effect<boolean, SewedError, MainContext>;
        setCaretBrowsing: (enabled: boolean) => Effect.Effect<void, SewedError, MainContext>;
        events: Stream.Stream<{
            readonly kind: "context-menu";
            readonly x: number;
            readonly y: number;
            readonly pageUrl: string;
            readonly frameUrl: string;
            readonly linkUrl: string;
            readonly linkText: string;
            readonly sourceUrl: string;
            readonly mediaType: string;
            readonly hasImageContents: boolean;
            readonly isEditable: boolean;
            readonly selectionText: string;
            readonly misspelledWord: string;
            readonly dictionarySuggestions: readonly string[];
            readonly source: string;
            readonly editFlags: {
                readonly canUndo: boolean;
                readonly canRedo: boolean;
                readonly canCut: boolean;
                readonly canCopy: boolean;
                readonly canPaste: boolean;
                readonly canDelete: boolean;
                readonly canSelectAll: boolean;
            };
        } | {
            readonly kind: "cursor";
            readonly type: string;
        } | {
            readonly kind: "target-url";
            readonly url: string;
        } | {
            readonly kind: "theme-color";
            readonly color: string | null;
        } | {
            readonly kind: "html-full-screen";
            readonly active: boolean;
        } | {
            readonly kind: "dom-ready";
        } | {
            readonly kind: "preload-error";
            readonly path: string;
            readonly message: string;
        } | {
            readonly kind: "frame";
            readonly change: "created" | "loaded" | "navigated";
            readonly frame: {
                readonly processId: number;
                readonly routingId: number;
                readonly isMainFrame: boolean;
            };
            readonly url?: string;
            readonly httpStatus?: number;
        } | {
            readonly kind: "devtools";
            readonly change: "closed" | "focused" | "opened";
        } | {
            readonly kind: "devtools-open-url";
            readonly url: string;
        } | {
            readonly kind: "devtools-reload-page";
        } | {
            readonly kind: "devtools-search-query";
            readonly query: string;
        } | {
            readonly kind: "content-bounds-updated";
            readonly bounds: {
                readonly x: number;
                readonly y: number;
                readonly width: number;
                readonly height: number;
            };
        } | {
            readonly kind: "preferred-size";
            readonly width: number;
            readonly height: number;
        } | {
            readonly kind: "input";
            readonly type: string;
        } | {
            readonly kind: "frame-will-navigate";
            readonly url: string;
            readonly isMainFrame: boolean;
            readonly isSameDocument: boolean;
        }, SewedError, MainContext>;
        activity: Effect.Effect<{
            readonly loading: boolean;
            readonly waitingForResponse: boolean;
            readonly crashed: boolean;
            readonly beingCaptured: boolean;
            readonly backgroundThrottling: boolean;
        }, SewedError, MainContext>;
        devTools: Effect.Effect<{
            readonly opened: boolean;
            readonly focused: boolean;
            readonly title: string;
        }, SewedError, MainContext>;
        toggleDevTools: Effect.Effect<void, SewedError, MainContext>;
        setDevToolsTitle: (title: string) => Effect.Effect<void, SewedError, MainContext>;
        inspectElement: (point: WebContents.PagePoint) => Effect.Effect<void, SewedError, MainContext>;
        inspectWorker: (kind: "service" | "shared") => Effect.Effect<void, SewedError, MainContext>;
        enableDeviceEmulation: (parameters: WebContents.DeviceEmulation) => Effect.Effect<void, SewedError, MainContext>;
        disableDeviceEmulation: Effect.Effect<void, SewedError, MainContext>;
        edit: (command: WebContents.EditCommand) => Effect.Effect<void, SewedError, MainContext>;
        replace: (text: string) => Effect.Effect<void, SewedError, MainContext>;
        replaceMisspelling: (text: string) => Effect.Effect<void, SewedError, MainContext>;
        adjustSelection: (adjustment: WebContents.SelectionAdjustment) => Effect.Effect<void, SewedError, MainContext>;
        copyVideoFrameAt: (point: WebContents.PagePoint) => Effect.Effect<void, SewedError, MainContext>;
        saveVideoFrameAs: (point: WebContents.PagePoint) => Effect.Effect<void, SewedError, MainContext>;
        copyImageAt: (point: WebContents.PagePoint) => Effect.Effect<void, SewedError, MainContext>;
        setVisualZoomLimits: (limits: WebContents.VisualZoomLimits) => Effect.Effect<void, SewedError, MainContext>;
        setImageAnimationPolicy: (policy: WebContents.ImageAnimationPolicy) => Effect.Effect<void, SewedError, MainContext>;
        startDrag: (drag: WebContents.Drag) => Effect.Effect<void, SewedError, MainContext>;
        showDefinitionForSelection: Effect.Effect<void, SewedError, MainContext>;
        takeHeapSnapshot: (path: string) => Effect.Effect<void, SewedError, MainContext>;
        print: (options?: WebContents.PrintOptions) => Effect.Effect<void, SewedError, MainContext>;
        pdf: (options?: WebContents.PdfOptions) => Effect.Effect<Uint8Array<ArrayBuffer>, SewedError, MainContext>;
        capture: (options?: WebContents.CaptureOptions) => Effect.Effect<{
            bytes: Uint8Array<ArrayBuffer>;
            width: number;
            height: number;
            scaleFactor: number;
        }, SewedError, MainContext>;
        zoom: Stream.Stream<{
            readonly factor: number;
        }, never, MainContext>;
        setZoom: (factor: number) => Effect.Effect<void, SewedError, MainContext>;
        audio: Stream.Stream<{
            readonly muted: boolean;
            readonly audible: boolean;
        }, never, MainContext>;
        setAudioMuted: (muted: boolean) => Effect.Effect<void, SewedError, MainContext>;
        userAgent: Effect.Effect<string, SewedError, MainContext>;
        setUserAgent: (userAgent: string) => Effect.Effect<void, SewedError, MainContext>;
        insertText: (text: string) => Effect.Effect<void, SewedError, MainContext>;
        savePage: (path: string, type?: WebContents.SaveType) => Effect.Effect<void, SewedError, MainContext>;
        setBackgroundThrottling: (allowed: boolean) => Effect.Effect<void, SewedError, MainContext>;
        setIgnoreMenuShortcuts: (ignore: boolean) => Effect.Effect<void, SewedError, MainContext>;
        find: (text: string, options?: WebContents.FindOptions) => Effect.Effect<WebContents.Search, SewedError, MainContext | Scope.Scope>;
        findNext: (forward?: boolean) => Effect.Effect<void, SewedError, MainContext>;
        stopFind: (action?: WebContents.FindStop) => Effect.Effect<void, SewedError, MainContext>;
        style: (css: string, options?: WebContents.StyleOptions) => Effect.Effect<void, SewedError, MainContext | Scope.Scope>;
        history: Stream.Stream<{
            readonly index: number;
            readonly entries: readonly {
                readonly url: string;
                readonly title: string;
            }[];
            readonly canGoBack: boolean;
            readonly canGoForward: boolean;
        }, never, MainContext>;
        back: Effect.Effect<{
            readonly status: "ready";
            readonly url: string;
            readonly processId: number;
            readonly httpStatus: number;
        } | {
            readonly status: "failed";
            readonly url: string;
            readonly code: number;
            readonly description: string;
        }, SewedError, MainContext>;
        forward: Effect.Effect<{
            readonly status: "ready";
            readonly url: string;
            readonly processId: number;
            readonly httpStatus: number;
        } | {
            readonly status: "failed";
            readonly url: string;
            readonly code: number;
            readonly description: string;
        }, SewedError, MainContext>;
        go: (index: number) => Effect.Effect<{
            readonly status: "ready";
            readonly url: string;
            readonly processId: number;
            readonly httpStatus: number;
        } | {
            readonly status: "failed";
            readonly url: string;
            readonly code: number;
            readonly description: string;
        }, SewedError, MainContext>;
        removeHistoryEntry: (index: number) => Effect.Effect<void, SewedError, MainContext>;
        clearHistory: Effect.Effect<void, SewedError, MainContext>;
        openDevTools: (options?: WebContents.DevToolsOptions) => Effect.Effect<void, SewedError, MainContext>;
        closeDevTools: Effect.Effect<void, SewedError, MainContext>;
        focus: Effect.Effect<void, SewedError, MainContext>;
        console: Stream.Stream<{
            readonly level: "debug" | "error" | "info" | "warning";
            readonly message: string;
            readonly lineNumber: number;
            readonly sourceId: string;
        }, SewedError, MainContext>;
        state: Stream.Stream<{
            readonly status: "ready";
            readonly url: string;
            readonly processId: number;
            readonly httpStatus: number;
        } | {
            readonly status: "failed";
            readonly url: string;
            readonly code: number;
            readonly description: string;
        } | {
            readonly status: "idle";
        } | {
            readonly status: "loading";
            readonly url: string;
        } | {
            readonly status: "gone";
            readonly reason: string;
            readonly exitCode: number;
        }, never, MainContext>;
        responsiveness: Stream.Stream<{
            readonly status: "unknown";
        } | {
            readonly status: "responsive" | "unresponsive";
            readonly processId: number;
        }, never, MainContext>;
        favicons: Stream.Stream<readonly string[], never, MainContext>;
        title: Stream.Stream<string, never, MainContext>;
        current: Effect.Effect<{
            readonly state: {
                readonly status: "ready";
                readonly url: string;
                readonly processId: number;
                readonly httpStatus: number;
            } | {
                readonly status: "failed";
                readonly url: string;
                readonly code: number;
                readonly description: string;
            } | {
                readonly status: "idle";
            } | {
                readonly status: "loading";
                readonly url: string;
            } | {
                readonly status: "gone";
                readonly reason: string;
                readonly exitCode: number;
            };
            readonly history: {
                readonly index: number;
                readonly entries: readonly {
                    readonly url: string;
                    readonly title: string;
                }[];
                readonly canGoBack: boolean;
                readonly canGoForward: boolean;
            };
            readonly title: string;
            readonly favicons: readonly string[];
            readonly zoom: {
                readonly factor: number;
            };
            readonly audio: {
                readonly muted: boolean;
                readonly audible: boolean;
            };
        }, SewedError, MainContext>;
        terminate: Effect.Effect<void, SewedError, MainContext>;
        recover: Effect.Effect<void, SewedError, MainContext>;
        decide: <Event, Answer, Timing extends "sync" | "async", R = never>(decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition, "contents">, decider: Decision.DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>) => Effect.Effect<void, SewedError, R | MainContext | Scope.Scope>;
        blocked: Stream.Stream<{
            readonly kind: "download" | "navigation" | "popup" | "redirect" | "webview";
            readonly url: string;
        }, SewedError, MainContext>;
        load: <Keys extends string, const B extends readonly Binding.Bound<Keys>[]>(entry: Renderer.Entry<Keys> & Binding.Complete<Keys, B>, options: {
            readonly bindings: B;
        }) => Effect.Effect<undefined, SewedError, MainContext>;
        reload: Effect.Effect<void, SewedError, MainContext>;
        reloadIgnoringCache: Effect.Effect<void, SewedError, MainContext>;
        stopLoading: Effect.Effect<void, SewedError, MainContext>;
        downloads: Stream.Stream<Download.Handle, SewedError, MainContext>;
    } | undefined;
    id: string;
    current: Effect.Effect<{
        readonly bounds: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        };
        readonly normalBounds: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        };
        readonly contentBounds: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        };
        readonly visible: boolean;
        readonly focused: boolean;
        readonly minimized: boolean;
        readonly maximized: boolean;
        readonly fullScreen: boolean;
        readonly simpleFullScreen: boolean;
        readonly title: string;
        readonly alwaysOnTop: boolean;
        readonly opacity: number;
        readonly resizable: boolean;
        readonly movable: boolean;
        readonly minimizable: boolean;
        readonly maximizable: boolean;
        readonly closable: boolean;
        readonly fullScreenable: boolean;
        readonly menuBarVisible: boolean;
        readonly kiosk: boolean;
    }, SewedError, MainContext>;
    show: Effect.Effect<void, SewedError, MainContext>;
    showInactive: Effect.Effect<void, SewedError, MainContext>;
    hide: Effect.Effect<void, SewedError, MainContext>;
    focus: Effect.Effect<void, SewedError, MainContext>;
    setBounds: (bounds: WindowControls.BoundsUpdate) => Effect.Effect<void, SewedError, MainContext>;
    setFullScreen: (fullScreen: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setSimpleFullScreen: (simpleFullScreen: boolean) => Effect.Effect<void, SewedError, MainContext>;
    minimize: Effect.Effect<void, SewedError, MainContext>;
    maximize: Effect.Effect<void, SewedError, MainContext>;
    restore: Effect.Effect<void, SewedError, MainContext>;
    close: Effect.Effect<void, SewedError, MainContext>;
    setTitle: (title: string) => Effect.Effect<void, SewedError, MainContext>;
    setAlwaysOnTop: (alwaysOnTop: boolean, level?: WindowControls.AlwaysOnTopLevel) => Effect.Effect<void, SewedError, MainContext>;
    setOpacity: (opacity: number) => Effect.Effect<void, SewedError, MainContext>;
    setResizable: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setMovable: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setMinimizable: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setMaximizable: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setClosable: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setFullScreenable: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setMenuBarVisibility: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setKiosk: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setSkipTaskbar: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setContentProtection: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    flash: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setWindowButtonVisibility: (visible: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setProgress: (progress: number, mode?: WindowControls.ProgressMode) => Effect.Effect<void, SewedError, MainContext>;
    setOverlayIcon: (icon: Image.Source | null, description: string) => Effect.Effect<void, SewedError, MainContext>;
    setIcon: (icon: Image.Source) => Effect.Effect<void, SewedError, MainContext>;
    setParent: (parent: Window.Parent | null) => Effect.Effect<void, SewedError, MainContext>;
    setEnabled: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setIgnoreMouseEvents: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setAutoHideMenuBar: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setVisibleOnAllWorkspaces: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setMinimumSize: (size: WindowControls.Size) => Effect.Effect<void, SewedError, MainContext>;
    setMaximumSize: (size: WindowControls.Size) => Effect.Effect<void, SewedError, MainContext>;
    setAspectRatio: (ratio: number, extra?: WindowControls.Size) => Effect.Effect<void, SewedError, MainContext>;
    setBackgroundColor: (color: string) => Effect.Effect<void, SewedError, MainContext>;
    setHasShadow: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setContentBounds: (bounds: WindowControls.Bounds) => Effect.Effect<void, SewedError, MainContext>;
    setContentSize: (size: WindowControls.Size) => Effect.Effect<void, SewedError, MainContext>;
    moveAbove: (mediaSourceId: string) => Effect.Effect<void, SewedError, MainContext>;
    setAccessibleTitle: (title: string) => Effect.Effect<void, SewedError, MainContext>;
    setTitleBarOverlay: (overlay: WindowControls.TitleBarOverlay) => Effect.Effect<void, SewedError, MainContext>;
    setShape: (rectangles: ReadonlyArray<WindowControls.Bounds>) => Effect.Effect<void, SewedError, MainContext>;
    removeMenu: Effect.Effect<void, SewedError, MainContext>;
    events: Stream.Stream<{
        readonly kind: "ready-to-show";
    } | {
        readonly kind: "persisted-state-restored";
    } | {
        readonly kind: "app-command";
        readonly command: string;
    } | {
        readonly kind: "moved" | "resized";
    } | {
        readonly kind: "will-move" | "will-resize";
        readonly bounds: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        };
        readonly edge?: string;
    } | {
        readonly kind: "swipe";
        readonly direction: string;
    } | {
        readonly kind: "rotate-gesture";
        readonly rotation: number;
    } | {
        readonly kind: "sheet-begin" | "sheet-end";
    } | {
        readonly kind: "new-window-for-tab";
    } | {
        readonly kind: "session-end";
        readonly reasons: readonly string[];
    } | {
        readonly kind: "system-context-menu";
        readonly x: number;
        readonly y: number;
    }, SewedError, MainContext>;
    center: Effect.Effect<void, SewedError, MainContext>;
    moveTop: Effect.Effect<void, SewedError, MainContext>;
    decide: <Event, Answer, Timing extends "sync" | "async", R = never>(decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition, "window">, decider: Decision.DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>) => Effect.Effect<void, SewedError, R | MainContext | Scope.Scope>;
    state: Stream.Stream<{
        readonly bounds: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        };
        readonly normalBounds: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        };
        readonly contentBounds: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        };
        readonly visible: boolean;
        readonly focused: boolean;
        readonly minimized: boolean;
        readonly maximized: boolean;
        readonly fullScreen: boolean;
        readonly simpleFullScreen: boolean;
        readonly title: string;
        readonly alwaysOnTop: boolean;
        readonly opacity: number;
        readonly resizable: boolean;
        readonly movable: boolean;
        readonly minimizable: boolean;
        readonly maximizable: boolean;
        readonly closable: boolean;
        readonly fullScreenable: boolean;
        readonly menuBarVisible: boolean;
        readonly kiosk: boolean;
    }, never, MainContext>;
    awaitClosed: Effect.Effect<void, never, MainContext>;
    attach: (view: View.Attachable, options: View.AttachOptions) => Effect.Effect<View.Attachment, SewedError, MainContext | Scope.Scope>;
    mediaSourceId: Effect.Effect<string, SewedError, MainContext>;
    contentBounds: Effect.Effect<Electron.Rectangle, SewedError, MainContext>;
    sizeLimits: Effect.Effect<{
        readonly minimum: {
            readonly width: number;
            readonly height: number;
        };
        readonly maximum: {
            readonly width: number;
            readonly height: number;
        };
    }, SewedError, MainContext>;
    enabled: Effect.Effect<boolean, SewedError, MainContext>;
    backgroundColor: Effect.Effect<string, SewedError, MainContext>;
    visibleOnAllWorkspaces: Effect.Effect<boolean, SewedError, MainContext>;
    parentId: Effect.Effect<string | null, SewedError, MainContext>;
    childIds: Effect.Effect<string[], SewedError, MainContext>;
    shadow: Effect.Effect<boolean, SewedError, MainContext>;
    accessibleTitle: Effect.Effect<string, SewedError, MainContext>;
    normal: Effect.Effect<boolean, SewedError, MainContext>;
    menuBarAutoHide: Effect.Effect<boolean, SewedError, MainContext>;
    nativeHandle: Effect.Effect<Uint8Array<ArrayBuffer>, SewedError, MainContext>;
    touchBar: TouchBar.Handle;
}, "closed" | "native" | "webContents">, SewedError, MainContext | Scope.Scope>;
```

#### `BaseWindow.Options`

```ts
interface Options extends Window.Options {
  /** Another Sewed window; with `modal: true` this window blocks it. */
  readonly parent?: Window.Parent;
}
```

### `BrowserWindow`

#### `BrowserWindow.AttachOptions`

```ts
type AttachOptions = Window.AttachOptions;
```

#### `BrowserWindow.Controls`

```ts
const Controls: RpcGroup.RpcGroup<Rpc.Rpc<"audio", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly muted: Schema.Boolean;
    readonly audible: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"back", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"changes", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly bounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly normalBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly contentBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly visible: Schema.Boolean;
    readonly focused: Schema.Boolean;
    readonly minimized: Schema.Boolean;
    readonly maximized: Schema.Boolean;
    readonly fullScreen: Schema.Boolean;
    readonly simpleFullScreen: Schema.Boolean;
    readonly title: Schema.String;
    readonly alwaysOnTop: Schema.Boolean;
    readonly opacity: Schema.Finite;
    readonly resizable: Schema.Boolean;
    readonly movable: Schema.Boolean;
    readonly minimizable: Schema.Boolean;
    readonly maximizable: Schema.Boolean;
    readonly closable: Schema.Boolean;
    readonly fullScreenable: Schema.Boolean;
    readonly menuBarVisible: Schema.Boolean;
    readonly kiosk: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"close", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"find", Schema.Struct<{
    text: Schema.String;
    options: Schema.optionalKey<Schema.Struct<{
        readonly forward: Schema.optionalKey<Schema.Boolean>;
        readonly matchCase: Schema.optionalKey<Schema.Boolean>;
    }>>;
}>, RpcSchema.Stream<Schema.Struct<{
    readonly activeMatchOrdinal: Schema.Int;
    readonly matches: Schema.Int;
    readonly selectionArea: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly finalUpdate: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"findNext", Schema.Struct<{
    forward: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"flash", Schema.Struct<{
    flash: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"forward", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"hide", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"history", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly index: Schema.Int;
    readonly entries: Schema.$Array<Schema.Struct<{
        readonly url: Schema.String;
        readonly title: Schema.String;
    }>>;
    readonly canGoBack: Schema.Boolean;
    readonly canGoForward: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"maximize", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"minimize", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"restore", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setAlwaysOnTop", Schema.Struct<{
    alwaysOnTop: Schema.Boolean;
    level: Schema.optionalKey<Schema.Literals<readonly ["normal", "floating", "torn-off-menu", "modal-panel", "main-menu", "status", "pop-up-menu", "screen-saver"]>>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setAudioMuted", Schema.Struct<{
    muted: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setBounds", Schema.Struct<{
    readonly x: Schema.optionalKey<Schema.Finite>;
    readonly y: Schema.optionalKey<Schema.Finite>;
    readonly width: Schema.optionalKey<Schema.Finite>;
    readonly height: Schema.optionalKey<Schema.Finite>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setFullScreen", Schema.Struct<{
    fullScreen: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setOpacity", Schema.Struct<{
    opacity: Schema.Finite;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setProgress", Schema.Struct<{
    progress: Schema.Finite;
    mode: Schema.optionalKey<Schema.Literals<readonly ["none", "normal", "indeterminate", "error", "paused"]>>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setSimpleFullScreen", Schema.Struct<{
    simpleFullScreen: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setTitle", Schema.Struct<{
    title: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setZoom", Schema.Struct<{
    factor: Schema.Finite;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"show", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"showInactive", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"state", Schema.Void, Schema.Struct<{
    readonly bounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly normalBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly contentBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly visible: Schema.Boolean;
    readonly focused: Schema.Boolean;
    readonly minimized: Schema.Boolean;
    readonly maximized: Schema.Boolean;
    readonly fullScreen: Schema.Boolean;
    readonly simpleFullScreen: Schema.Boolean;
    readonly title: Schema.String;
    readonly alwaysOnTop: Schema.Boolean;
    readonly opacity: Schema.Finite;
    readonly resizable: Schema.Boolean;
    readonly movable: Schema.Boolean;
    readonly minimizable: Schema.Boolean;
    readonly maximizable: Schema.Boolean;
    readonly closable: Schema.Boolean;
    readonly fullScreenable: Schema.Boolean;
    readonly menuBarVisible: Schema.Boolean;
    readonly kiosk: Schema.Boolean;
}>, typeof SewedError, never, never> | Rpc.Rpc<"stopFind", Schema.Struct<{
    action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"zoom", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly factor: Schema.Finite;
}>, typeof SewedError>, Schema.Never, never, never>>;
```

#### `BrowserWindow.Handle`

```ts
type Handle<A extends Automation.Declaration = {}> = Effect.Success<ReturnType<typeof make<A>>>;
```

#### `BrowserWindow.make`

```ts
const make: <const A extends Automation.Declaration = {}>(options?: Options<A>) => Effect.Effect<{
    setFocusable: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    focusable: Effect.Effect<boolean, SewedError, MainContext>;
    contentProtected: Effect.Effect<boolean, SewedError, MainContext>;
    setRepresentedFilename: (path: string) => Effect.Effect<void, SewedError, MainContext>;
    representedFilename: Effect.Effect<string, SewedError, MainContext>;
    setDocumentEdited: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    documentEdited: Effect.Effect<boolean, SewedError, MainContext>;
    setVibrancy: (vibrancy: WindowControls.Vibrancy) => Effect.Effect<void, SewedError, MainContext>;
    setWindowButtonPosition: (position: Screen.Point | null) => Effect.Effect<void, SewedError, MainContext>;
    windowButtonPosition: Effect.Effect<{
        x: number;
        y: number;
    } | null, SewedError, MainContext>;
    setSheetOffset: (offset: {
        readonly y: number;
        readonly x?: number;
    }) => Effect.Effect<void, SewedError, MainContext>;
    previewFile: (path: string, displayName?: string) => Effect.Effect<void, SewedError, MainContext>;
    closeFilePreview: Effect.Effect<void, SewedError, MainContext>;
    setHiddenInMissionControl: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    hiddenInMissionControl: Effect.Effect<boolean, SewedError, MainContext>;
    setAutoHideCursor: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    invalidateShadow: Effect.Effect<void, SewedError, MainContext>;
    setExcludedFromShownWindowsMenu: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    excludedFromShownWindowsMenu: Effect.Effect<boolean, SewedError, MainContext>;
    tabs: {
        identifier: Effect.Effect<string | null, SewedError, MainContext>;
        selectNext: Effect.Effect<void, SewedError, MainContext>;
        selectPrevious: Effect.Effect<void, SewedError, MainContext>;
        showAll: Effect.Effect<void, SewedError, MainContext>;
        mergeAll: Effect.Effect<void, SewedError, MainContext>;
        moveToNewWindow: Effect.Effect<void, SewedError, MainContext>;
        toggleBar: Effect.Effect<void, SewedError, MainContext>;
        add: (window: {
            readonly id: string;
        }) => Effect.Effect<void, SewedError, MainContext>;
    };
    setAccentColor: (color: WindowControls.AccentColor) => Effect.Effect<void, SewedError, MainContext>;
    setAppDetails: (details: WindowControls.AppDetails) => Effect.Effect<void, SewedError, MainContext>;
    setBackgroundMaterial: (material: WindowControls.BackgroundMaterial) => Effect.Effect<void, SewedError, MainContext>;
    setThumbarButtons: (buttons: ReadonlyArray<WindowControls.ThumbarButton>) => Effect.Effect<void, SewedError, MainContext>;
    thumbarClicks: Stream.Stream<string, SewedError, MainContext>;
    setThumbnailClip: (region: WindowControls.Bounds) => Effect.Effect<void, SewedError, MainContext>;
    setThumbnailToolTip: (text: string) => Effect.Effect<void, SewedError, MainContext>;
    snapped: Effect.Effect<boolean, SewedError, MainContext>;
    tabletMode: Effect.Effect<boolean, SewedError, MainContext>;
    windowMessages: (message: number) => Stream.Stream<WindowControls.WindowMessage, SewedError, MainContext>;
    id: string;
    current: Effect.Effect<{
        readonly bounds: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        };
        readonly normalBounds: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        };
        readonly contentBounds: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        };
        readonly visible: boolean;
        readonly focused: boolean;
        readonly minimized: boolean;
        readonly maximized: boolean;
        readonly fullScreen: boolean;
        readonly simpleFullScreen: boolean;
        readonly title: string;
        readonly alwaysOnTop: boolean;
        readonly opacity: number;
        readonly resizable: boolean;
        readonly movable: boolean;
        readonly minimizable: boolean;
        readonly maximizable: boolean;
        readonly closable: boolean;
        readonly fullScreenable: boolean;
        readonly menuBarVisible: boolean;
        readonly kiosk: boolean;
    }, SewedError, MainContext>;
    show: Effect.Effect<void, SewedError, MainContext>;
    showInactive: Effect.Effect<void, SewedError, MainContext>;
    hide: Effect.Effect<void, SewedError, MainContext>;
    focus: Effect.Effect<void, SewedError, MainContext>;
    setBounds: (bounds: WindowControls.BoundsUpdate) => Effect.Effect<void, SewedError, MainContext>;
    setFullScreen: (fullScreen: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setSimpleFullScreen: (simpleFullScreen: boolean) => Effect.Effect<void, SewedError, MainContext>;
    minimize: Effect.Effect<void, SewedError, MainContext>;
    maximize: Effect.Effect<void, SewedError, MainContext>;
    restore: Effect.Effect<void, SewedError, MainContext>;
    close: Effect.Effect<void, SewedError, MainContext>;
    setTitle: (title: string) => Effect.Effect<void, SewedError, MainContext>;
    setAlwaysOnTop: (alwaysOnTop: boolean, level?: WindowControls.AlwaysOnTopLevel) => Effect.Effect<void, SewedError, MainContext>;
    setOpacity: (opacity: number) => Effect.Effect<void, SewedError, MainContext>;
    setResizable: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setMovable: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setMinimizable: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setMaximizable: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setClosable: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setFullScreenable: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setMenuBarVisibility: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setKiosk: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setSkipTaskbar: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setContentProtection: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    flash: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setWindowButtonVisibility: (visible: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setProgress: (progress: number, mode?: WindowControls.ProgressMode) => Effect.Effect<void, SewedError, MainContext>;
    setOverlayIcon: (icon: Image.Source | null, description: string) => Effect.Effect<void, SewedError, MainContext>;
    setIcon: (icon: Image.Source) => Effect.Effect<void, SewedError, MainContext>;
    setParent: (parent: Window.Parent | null) => Effect.Effect<void, SewedError, MainContext>;
    setEnabled: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setIgnoreMouseEvents: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setAutoHideMenuBar: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setVisibleOnAllWorkspaces: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setMinimumSize: (size: WindowControls.Size) => Effect.Effect<void, SewedError, MainContext>;
    setMaximumSize: (size: WindowControls.Size) => Effect.Effect<void, SewedError, MainContext>;
    setAspectRatio: (ratio: number, extra?: WindowControls.Size) => Effect.Effect<void, SewedError, MainContext>;
    setBackgroundColor: (color: string) => Effect.Effect<void, SewedError, MainContext>;
    setHasShadow: (value: boolean) => Effect.Effect<void, SewedError, MainContext>;
    setContentBounds: (bounds: WindowControls.Bounds) => Effect.Effect<void, SewedError, MainContext>;
    setContentSize: (size: WindowControls.Size) => Effect.Effect<void, SewedError, MainContext>;
    moveAbove: (mediaSourceId: string) => Effect.Effect<void, SewedError, MainContext>;
    setAccessibleTitle: (title: string) => Effect.Effect<void, SewedError, MainContext>;
    setTitleBarOverlay: (overlay: WindowControls.TitleBarOverlay) => Effect.Effect<void, SewedError, MainContext>;
    setShape: (rectangles: ReadonlyArray<WindowControls.Bounds>) => Effect.Effect<void, SewedError, MainContext>;
    removeMenu: Effect.Effect<void, SewedError, MainContext>;
    events: Stream.Stream<{
        readonly kind: "ready-to-show";
    } | {
        readonly kind: "persisted-state-restored";
    } | {
        readonly kind: "app-command";
        readonly command: string;
    } | {
        readonly kind: "moved" | "resized";
    } | {
        readonly kind: "will-move" | "will-resize";
        readonly bounds: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        };
        readonly edge?: string;
    } | {
        readonly kind: "swipe";
        readonly direction: string;
    } | {
        readonly kind: "rotate-gesture";
        readonly rotation: number;
    } | {
        readonly kind: "sheet-begin" | "sheet-end";
    } | {
        readonly kind: "new-window-for-tab";
    } | {
        readonly kind: "session-end";
        readonly reasons: readonly string[];
    } | {
        readonly kind: "system-context-menu";
        readonly x: number;
        readonly y: number;
    }, SewedError, MainContext>;
    center: Effect.Effect<void, SewedError, MainContext>;
    moveTop: Effect.Effect<void, SewedError, MainContext>;
    decide: <Event, Answer, Timing extends "sync" | "async", R = never>(decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition, "window">, decider: Decision.DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>) => Effect.Effect<void, SewedError, R | MainContext | Scope.Scope>;
    state: Stream.Stream<{
        readonly bounds: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        };
        readonly normalBounds: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        };
        readonly contentBounds: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        };
        readonly visible: boolean;
        readonly focused: boolean;
        readonly minimized: boolean;
        readonly maximized: boolean;
        readonly fullScreen: boolean;
        readonly simpleFullScreen: boolean;
        readonly title: string;
        readonly alwaysOnTop: boolean;
        readonly opacity: number;
        readonly resizable: boolean;
        readonly movable: boolean;
        readonly minimizable: boolean;
        readonly maximizable: boolean;
        readonly closable: boolean;
        readonly fullScreenable: boolean;
        readonly menuBarVisible: boolean;
        readonly kiosk: boolean;
    }, never, MainContext>;
    awaitClosed: Effect.Effect<void, never, MainContext>;
    attach: (view: View.Attachable, options: View.AttachOptions) => Effect.Effect<View.Attachment, SewedError, MainContext | Scope.Scope>;
    mediaSourceId: Effect.Effect<string, SewedError, MainContext>;
    contentBounds: Effect.Effect<Electron.Rectangle, SewedError, MainContext>;
    sizeLimits: Effect.Effect<{
        readonly minimum: {
            readonly width: number;
            readonly height: number;
        };
        readonly maximum: {
            readonly width: number;
            readonly height: number;
        };
    }, SewedError, MainContext>;
    enabled: Effect.Effect<boolean, SewedError, MainContext>;
    backgroundColor: Effect.Effect<string, SewedError, MainContext>;
    visibleOnAllWorkspaces: Effect.Effect<boolean, SewedError, MainContext>;
    parentId: Effect.Effect<string | null, SewedError, MainContext>;
    childIds: Effect.Effect<string[], SewedError, MainContext>;
    shadow: Effect.Effect<boolean, SewedError, MainContext>;
    accessibleTitle: Effect.Effect<string, SewedError, MainContext>;
    normal: Effect.Effect<boolean, SewedError, MainContext>;
    menuBarAutoHide: Effect.Effect<boolean, SewedError, MainContext>;
    nativeHandle: Effect.Effect<Uint8Array<ArrayBuffer>, SewedError, MainContext>;
    touchBar: TouchBar.Handle;
    webContents: {
        frames: (options?: WebContents.FrameOptions) => Stream.Stream<WebContents.Frame, SewedError, MainContext>;
        painting: Effect.Effect<{
            readonly offscreen: boolean;
            readonly painting: boolean;
            readonly frameRate: number;
        }, SewedError, MainContext>;
        setPainting: (painting: boolean) => Effect.Effect<void, SewedError, MainContext>;
        setFrameRate: (rate: WebContents.FrameRate) => Effect.Effect<void, SewedError, MainContext>;
        invalidate: Effect.Effect<void, SewedError, MainContext>;
        frameTree: Effect.Effect<readonly {
            readonly processId: number;
            readonly routingId: number;
            readonly frameTreeNodeId: number;
            readonly token: string;
            readonly osProcessId: number;
            readonly isMainFrame: boolean;
            readonly parent: number | null;
            readonly url: string;
            readonly origin: string;
            readonly name: string;
            readonly visibilityState: string;
        }[], SewedError, MainContext>;
        opener: Effect.Effect<{
            readonly processId: number;
            readonly routingId: number;
            readonly frameTreeNodeId: number;
            readonly token: string;
            readonly osProcessId: number;
            readonly isMainFrame: boolean;
            readonly parent: number | null;
            readonly url: string;
            readonly origin: string;
            readonly name: string;
            readonly visibilityState: string;
        } | null, SewedError, MainContext>;
        focusedFrame: Effect.Effect<{
            readonly processId: number;
            readonly routingId: number;
            readonly frameTreeNodeId: number;
            readonly token: string;
            readonly osProcessId: number;
            readonly isMainFrame: boolean;
            readonly parent: number | null;
            readonly url: string;
            readonly origin: string;
            readonly name: string;
            readonly visibilityState: string;
        } | null, SewedError, MainContext>;
        hostId: Effect.Effect<string | null, SewedError, MainContext>;
        devToolsContentsId: Effect.Effect<number | null, SewedError, MainContext>;
        collectJavaScriptCallStack: Effect.Effect<string | null, SewedError, MainContext>;
        zoomLevel: Effect.Effect<number, SewedError, MainContext>;
        setZoomLevel: (level: WebContents.ZoomLevel) => Effect.Effect<void, SewedError, MainContext>;
        zoomMode: Effect.Effect<"default" | "disabled" | "isolated" | "manual", SewedError, MainContext>;
        setZoomMode: (mode: WebContents.ZoomMode) => Effect.Effect<void, SewedError, MainContext>;
        rendererProcessId: Effect.Effect<number, SewedError, MainContext>;
        sharedWorkers: Effect.Effect<readonly {
            readonly id: string;
            readonly url: string;
        }[], SewedError, MainContext>;
        inspectSharedWorker: (id: string) => Effect.Effect<void, SewedError, MainContext>;
        devToolsTargetId: Effect.Effect<string, SewedError, MainContext>;
        addDevToolsWorkspace: (path: string) => Effect.Effect<void, SewedError, MainContext>;
        removeDevToolsWorkspace: (path: string) => Effect.Effect<void, SewedError, MainContext>;
        printers: Effect.Effect<readonly {
            readonly name: string;
            readonly displayName: string;
            readonly description: string;
        }[], SewedError, MainContext>;
        webRtc: Effect.Effect<{
            readonly ipHandlingPolicy: string;
            readonly udpPortRange: {
                readonly min: number;
                readonly max: number;
            };
        }, SewedError, MainContext>;
        setWebRtcIpHandlingPolicy: (policy: WebContents.WebRtcIpHandlingPolicy) => Effect.Effect<void, SewedError, MainContext>;
        setWebRtcUdpPortRange: (range: WebContents.UdpPortRange) => Effect.Effect<void, SewedError, MainContext>;
        caretBrowsing: Effect.Effect<boolean, SewedError, MainContext>;
        setCaretBrowsing: (enabled: boolean) => Effect.Effect<void, SewedError, MainContext>;
        events: Stream.Stream<{
            readonly kind: "context-menu";
            readonly x: number;
            readonly y: number;
            readonly pageUrl: string;
            readonly frameUrl: string;
            readonly linkUrl: string;
            readonly linkText: string;
            readonly sourceUrl: string;
            readonly mediaType: string;
            readonly hasImageContents: boolean;
            readonly isEditable: boolean;
            readonly selectionText: string;
            readonly misspelledWord: string;
            readonly dictionarySuggestions: readonly string[];
            readonly source: string;
            readonly editFlags: {
                readonly canUndo: boolean;
                readonly canRedo: boolean;
                readonly canCut: boolean;
                readonly canCopy: boolean;
                readonly canPaste: boolean;
                readonly canDelete: boolean;
                readonly canSelectAll: boolean;
            };
        } | {
            readonly kind: "cursor";
            readonly type: string;
        } | {
            readonly kind: "target-url";
            readonly url: string;
        } | {
            readonly kind: "theme-color";
            readonly color: string | null;
        } | {
            readonly kind: "html-full-screen";
            readonly active: boolean;
        } | {
            readonly kind: "dom-ready";
        } | {
            readonly kind: "preload-error";
            readonly path: string;
            readonly message: string;
        } | {
            readonly kind: "frame";
            readonly change: "created" | "loaded" | "navigated";
            readonly frame: {
                readonly processId: number;
                readonly routingId: number;
                readonly isMainFrame: boolean;
            };
            readonly url?: string;
            readonly httpStatus?: number;
        } | {
            readonly kind: "devtools";
            readonly change: "closed" | "focused" | "opened";
        } | {
            readonly kind: "devtools-open-url";
            readonly url: string;
        } | {
            readonly kind: "devtools-reload-page";
        } | {
            readonly kind: "devtools-search-query";
            readonly query: string;
        } | {
            readonly kind: "content-bounds-updated";
            readonly bounds: {
                readonly x: number;
                readonly y: number;
                readonly width: number;
                readonly height: number;
            };
        } | {
            readonly kind: "preferred-size";
            readonly width: number;
            readonly height: number;
        } | {
            readonly kind: "input";
            readonly type: string;
        } | {
            readonly kind: "frame-will-navigate";
            readonly url: string;
            readonly isMainFrame: boolean;
            readonly isSameDocument: boolean;
        }, SewedError, MainContext>;
        activity: Effect.Effect<{
            readonly loading: boolean;
            readonly waitingForResponse: boolean;
            readonly crashed: boolean;
            readonly beingCaptured: boolean;
            readonly backgroundThrottling: boolean;
        }, SewedError, MainContext>;
        devTools: Effect.Effect<{
            readonly opened: boolean;
            readonly focused: boolean;
            readonly title: string;
        }, SewedError, MainContext>;
        toggleDevTools: Effect.Effect<void, SewedError, MainContext>;
        setDevToolsTitle: (title: string) => Effect.Effect<void, SewedError, MainContext>;
        inspectElement: (point: WebContents.PagePoint) => Effect.Effect<void, SewedError, MainContext>;
        inspectWorker: (kind: "service" | "shared") => Effect.Effect<void, SewedError, MainContext>;
        enableDeviceEmulation: (parameters: WebContents.DeviceEmulation) => Effect.Effect<void, SewedError, MainContext>;
        disableDeviceEmulation: Effect.Effect<void, SewedError, MainContext>;
        edit: (command: WebContents.EditCommand) => Effect.Effect<void, SewedError, MainContext>;
        replace: (text: string) => Effect.Effect<void, SewedError, MainContext>;
        replaceMisspelling: (text: string) => Effect.Effect<void, SewedError, MainContext>;
        adjustSelection: (adjustment: WebContents.SelectionAdjustment) => Effect.Effect<void, SewedError, MainContext>;
        copyVideoFrameAt: (point: WebContents.PagePoint) => Effect.Effect<void, SewedError, MainContext>;
        saveVideoFrameAs: (point: WebContents.PagePoint) => Effect.Effect<void, SewedError, MainContext>;
        copyImageAt: (point: WebContents.PagePoint) => Effect.Effect<void, SewedError, MainContext>;
        setVisualZoomLimits: (limits: WebContents.VisualZoomLimits) => Effect.Effect<void, SewedError, MainContext>;
        setImageAnimationPolicy: (policy: WebContents.ImageAnimationPolicy) => Effect.Effect<void, SewedError, MainContext>;
        startDrag: (drag: WebContents.Drag) => Effect.Effect<void, SewedError, MainContext>;
        showDefinitionForSelection: Effect.Effect<void, SewedError, MainContext>;
        takeHeapSnapshot: (path: string) => Effect.Effect<void, SewedError, MainContext>;
        print: (options?: WebContents.PrintOptions) => Effect.Effect<void, SewedError, MainContext>;
        pdf: (options?: WebContents.PdfOptions) => Effect.Effect<Uint8Array<ArrayBuffer>, SewedError, MainContext>;
        capture: (options?: WebContents.CaptureOptions) => Effect.Effect<{
            bytes: Uint8Array<ArrayBuffer>;
            width: number;
            height: number;
            scaleFactor: number;
        }, SewedError, MainContext>;
        zoom: Stream.Stream<{
            readonly factor: number;
        }, never, MainContext>;
        setZoom: (factor: number) => Effect.Effect<void, SewedError, MainContext>;
        audio: Stream.Stream<{
            readonly muted: boolean;
            readonly audible: boolean;
        }, never, MainContext>;
        setAudioMuted: (muted: boolean) => Effect.Effect<void, SewedError, MainContext>;
        userAgent: Effect.Effect<string, SewedError, MainContext>;
        setUserAgent: (userAgent: string) => Effect.Effect<void, SewedError, MainContext>;
        insertText: (text: string) => Effect.Effect<void, SewedError, MainContext>;
        savePage: (path: string, type?: WebContents.SaveType) => Effect.Effect<void, SewedError, MainContext>;
        setBackgroundThrottling: (allowed: boolean) => Effect.Effect<void, SewedError, MainContext>;
        setIgnoreMenuShortcuts: (ignore: boolean) => Effect.Effect<void, SewedError, MainContext>;
        find: (text: string, options?: WebContents.FindOptions) => Effect.Effect<WebContents.Search, SewedError, MainContext | Scope.Scope>;
        findNext: (forward?: boolean) => Effect.Effect<void, SewedError, MainContext>;
        stopFind: (action?: WebContents.FindStop) => Effect.Effect<void, SewedError, MainContext>;
        style: (css: string, options?: WebContents.StyleOptions) => Effect.Effect<void, SewedError, MainContext | Scope.Scope>;
        history: Stream.Stream<{
            readonly index: number;
            readonly entries: readonly {
                readonly url: string;
                readonly title: string;
            }[];
            readonly canGoBack: boolean;
            readonly canGoForward: boolean;
        }, never, MainContext>;
        back: Effect.Effect<{
            readonly status: "ready";
            readonly url: string;
            readonly processId: number;
            readonly httpStatus: number;
        } | {
            readonly status: "failed";
            readonly url: string;
            readonly code: number;
            readonly description: string;
        }, SewedError, MainContext>;
        forward: Effect.Effect<{
            readonly status: "ready";
            readonly url: string;
            readonly processId: number;
            readonly httpStatus: number;
        } | {
            readonly status: "failed";
            readonly url: string;
            readonly code: number;
            readonly description: string;
        }, SewedError, MainContext>;
        go: (index: number) => Effect.Effect<{
            readonly status: "ready";
            readonly url: string;
            readonly processId: number;
            readonly httpStatus: number;
        } | {
            readonly status: "failed";
            readonly url: string;
            readonly code: number;
            readonly description: string;
        }, SewedError, MainContext>;
        removeHistoryEntry: (index: number) => Effect.Effect<void, SewedError, MainContext>;
        clearHistory: Effect.Effect<void, SewedError, MainContext>;
        openDevTools: (options?: WebContents.DevToolsOptions) => Effect.Effect<void, SewedError, MainContext>;
        closeDevTools: Effect.Effect<void, SewedError, MainContext>;
        focus: Effect.Effect<void, SewedError, MainContext>;
        console: Stream.Stream<{
            readonly level: "debug" | "error" | "info" | "warning";
            readonly message: string;
            readonly lineNumber: number;
            readonly sourceId: string;
        }, SewedError, MainContext>;
        state: Stream.Stream<{
            readonly status: "ready";
            readonly url: string;
            readonly processId: number;
            readonly httpStatus: number;
        } | {
            readonly status: "failed";
            readonly url: string;
            readonly code: number;
            readonly description: string;
        } | {
            readonly status: "idle";
        } | {
            readonly status: "loading";
            readonly url: string;
        } | {
            readonly status: "gone";
            readonly reason: string;
            readonly exitCode: number;
        }, never, MainContext>;
        responsiveness: Stream.Stream<{
            readonly status: "unknown";
        } | {
            readonly status: "responsive" | "unresponsive";
            readonly processId: number;
        }, never, MainContext>;
        favicons: Stream.Stream<readonly string[], never, MainContext>;
        title: Stream.Stream<string, never, MainContext>;
        current: Effect.Effect<{
            readonly state: {
                readonly status: "ready";
                readonly url: string;
                readonly processId: number;
                readonly httpStatus: number;
            } | {
                readonly status: "failed";
                readonly url: string;
                readonly code: number;
                readonly description: string;
            } | {
                readonly status: "idle";
            } | {
                readonly status: "loading";
                readonly url: string;
            } | {
                readonly status: "gone";
                readonly reason: string;
                readonly exitCode: number;
            };
            readonly history: {
                readonly index: number;
                readonly entries: readonly {
                    readonly url: string;
                    readonly title: string;
                }[];
                readonly canGoBack: boolean;
                readonly canGoForward: boolean;
            };
            readonly title: string;
            readonly favicons: readonly string[];
            readonly zoom: {
                readonly factor: number;
            };
            readonly audio: {
                readonly muted: boolean;
                readonly audible: boolean;
            };
        }, SewedError, MainContext>;
        terminate: Effect.Effect<void, SewedError, MainContext>;
        recover: Effect.Effect<void, SewedError, MainContext>;
        decide: <Event, Answer, Timing extends "sync" | "async", R = never>(decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition, "contents">, decider: Decision.DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>) => Effect.Effect<void, SewedError, R | MainContext | Scope.Scope>;
        blocked: Stream.Stream<{
            readonly kind: "download" | "navigation" | "popup" | "redirect" | "webview";
            readonly url: string;
        }, SewedError, MainContext>;
        load: <Keys extends string, const B extends readonly Binding.Bound<Keys>[]>(entry: Renderer.Entry<Keys> & Binding.Complete<Keys, B>, options: {
            readonly bindings: B;
        }) => Effect.Effect<undefined, SewedError, MainContext>;
        reload: Effect.Effect<void, SewedError, MainContext>;
        reloadIgnoringCache: Effect.Effect<void, SewedError, MainContext>;
        stopLoading: Effect.Effect<void, SewedError, MainContext>;
        downloads: Stream.Stream<Download.Handle, SewedError, MainContext>;
    };
    dialog: {
        messageBlocking: (options: Dialog.MessageOptions) => Effect.Effect<number, SewedError, MainContext>;
        openBlocking: (options: Dialog.OpenOptions) => Effect.Effect<Dialog.OpenResult, SewedError, MainContext>;
        saveBlocking: (options: Dialog.SaveOptions) => Effect.Effect<Dialog.SaveResult, SewedError, MainContext>;
        message: (options: Dialog.MessageOptions) => Effect.Effect<Dialog.MessageResult, SewedError, MainContext>;
        open: (options: Dialog.OpenOptions) => Effect.Effect<Dialog.OpenResult, SewedError, MainContext>;
        save: (options: Dialog.SaveOptions) => Effect.Effect<Dialog.SaveResult, SewedError, MainContext>;
    };
    menu: {
        share: (item: Menu.SharingItem, position?: {
            readonly x: number;
            readonly y: number;
        }) => Effect.Effect<void, SewedError, MainContext>;
        popup: (options: Menu.PopupOptions) => Effect.Effect<Menu.PopupResult, SewedError, MainContext>;
    };
    automation: Automation.Of<A>;
}, SewedError, MainContext | Scope.Scope>;
```

#### `BrowserWindow.Options`

```ts
interface Options<A extends Automation.Declaration = {}> extends Window.Options {
  readonly session?: Session.Handle;
  /** Whether Chromium throttles timers and animations while the window is hidden or occluded. */
  readonly backgroundThrottling?: boolean;
  /**
   * Renders the page offscreen: nothing is drawn in a window, and `webContents.frames` delivers
   * each frame instead.
   */
  readonly offscreen?: boolean;
  /** Another Sewed window; with `modal: true` this window blocks it. */
  readonly parent?: Window.Parent;
  /**
   * Automation for development tooling, declared by the composition that creates the window.
   * Undeclared members do not exist on the handle, so a composition that omits it has none.
   */
  readonly automation?: A;
}
```

### `Capability`

#### `Capability.Capability`

```ts
interface Capability<Rpcs extends Rpc.Any, Key extends string = string> extends Context.Service<
  Capability<Rpcs, Key>,
  Operations<Rpcs>
> {
  readonly key: Key;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly slot: Binding.Slot<Rpcs, Key>;
}
```

#### `Capability.client`

```ts
const client: <Rpcs extends Rpc.Any, Key extends string>(capability: Capability<Rpcs, Key>, options?: {
    readonly connection?: Binding.Connection;
}) => Layer.Layer<Capability<Rpcs, Key>, never, ClientContext>;
```

#### `Capability.Client`

A capability's operations: what `yield* capability` answers, named so a helper can take it as a
parameter instead of writing out `Operations<Rpcs>` by hand.

```ts
type Client<C extends HasProtocol> = Operations<RpcsOf<C>>;
```

#### `Capability.declaration`

The slot a served capability's owner binds to, for a renderer entry's `bindings` list.
`Binding.to(capability.slot, owner)` pairs it with the owner `serve` returns.

```ts
const declaration: <Rpcs extends Rpc.Any, Key extends string>(capability: Capability<Rpcs, Key>) => Binding.Declaration<Key>;
```

#### `Capability.define`

```ts
const define: <const Name extends string, Rpcs extends Rpc.Any>(name: Name, protocol: RpcGroup.RpcGroup<Rpcs>) => Capability<Rpcs, `sewed/binding/${Name}`>;
```

#### `Capability.fromHandlers`

```ts
const fromHandlers: <Rpcs extends Rpc.Any, Key extends string, E, R>(capability: Capability<Rpcs, Key>, handlers: HandlerLayer<Rpcs, E, R>) => Layer.Layer<Capability<Rpcs, Key>, E, R>;
```

#### `Capability.Handlers`

The handlers a host serves for a capability's protocol: a Layer of the protocol's handlers, or
a function of `implement` (the protocol's `toLayer`) returning one. This is what
{@link fromHandlers}, `Testing.client`, and `Testing.layer` all take, named so a function can
take a host as a parameter.

```ts
type Handlers<Rpcs extends Rpc.Any, E = never, R = never> = HandlerLayer<Rpcs, E, R>;
```

#### `Capability.Implementation`

A capability's handler record — one function per operation — sharing the requirement `R`.
Effect's own `RpcGroup.HandlersFrom` types every handler's requirement as `any`, because its
`Rpc.ToHandlerFn` defaults `R` to `any` when nothing supplies one; a record annotated with
`HandlersFrom` therefore makes `toLayer` infer `R = any`, and a host built over it collapses
`R | MainContext | Scope` to `any` — a requirement no caller can discharge, so `Effect.runPromise`
accepts it though nothing was actually provided. A record typed with `Implementation` keeps `R`,
so the host built from it carries a requirement a caller can still discharge, and `R` defaults to
`never` for a record whose handlers need nothing.

```ts
type Implementation<C extends HasProtocol, R = never> = {
  readonly [Current in RpcsOf<C> as Current["_tag"]]: Rpc.ToHandlerFn<Current, R>;
};
```

#### `Capability.Operations`

What a capability offers its caller: one method per RPC, carrying only the requirements that are
genuinely the caller's to provide — the protocol's own schema services. Acquiring the capability
is what proves the environment, so an operation needs no client context, no scope, and no
middleware service. Both layers satisfy this: the native one calls handlers directly, and the
client one captures its environment when it is built.

```ts
type Operations<Rpcs extends Rpc.Any> = {
  readonly [Current in Rpcs as Current["_tag"]]: (
    input: Rpc.PayloadConstructor<Current>,
  ) => Current extends Rpc.Rpc<
    infer _Tag,
    infer _Payload,
    infer Success,
    infer Error,
    infer _Middleware,
    infer _Requires
  >
    ? Success extends RpcSchema.Stream<infer A, infer E>
      ? Stream.Stream<
          A["Type"],
          E["Type"] | Error["Type"] | SewedError,
          Rpc.ServicesClient<Current>
        >
      : Effect.Effect<Success["Type"], Error["Type"] | SewedError, Rpc.ServicesClient<Current>>
    : never;
};
```

#### `Capability.serve`

```ts
const serve: <Rpcs extends Rpc.Any, Key extends string>(capability: Capability<Rpcs, Key>) => Effect.Effect<Binding.Owner<Rpcs>, SewedError, Capability<Rpcs, Key> | MainContext | Scope.Scope>;
```

### `Clipboard`

#### `Clipboard.capability`

The whole clipboard surface as one capability: `Clipboard.native` in `sewed/main` carries the
format policy, `Capability.client` reaches it from a document, and `Testing.Clipboard.memory`
stands in for tests.

```ts
const capability: Capability.Capability<Rpc.Rpc<"clear", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"formats", Schema.Void, Schema.$Array<Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>>, typeof SewedError, never, never> | Rpc.Rpc<"read", Schema.Struct<{
    format: Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>;
}>, Schema.NullOr<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"text">;
    readonly text: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"html">;
    readonly html: Schema.String;
    readonly text: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"rtf">;
    readonly rtf: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"image">;
    readonly png: Binary.Bytes;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"bookmark">;
    readonly title: Schema.String;
    readonly url: Schema.String;
}>]>>, typeof SewedError, never, never> | Rpc.Rpc<"write", Schema.Struct<{
    content: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"text">;
        readonly text: Schema.String;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"html">;
        readonly html: Schema.String;
        readonly text: Schema.optionalKey<Schema.String>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"rtf">;
        readonly rtf: Schema.String;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"image">;
        readonly png: Binary.Bytes;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"bookmark">;
        readonly title: Schema.String;
        readonly url: Schema.String;
    }>]>;
}>, Schema.Void, typeof SewedError, never, never>, "sewed/binding/clipboard">;
```

#### `Clipboard.clear`

```ts
const clear: Effect.Effect<void, SewedError, MainContext>;
```

#### `Clipboard.Content`

```ts
const Content: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"text">;
    readonly text: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"html">;
    readonly html: Schema.String;
    readonly text: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"rtf">;
    readonly rtf: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"image">;
    readonly png: Binary.Bytes;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"bookmark">;
    readonly title: Schema.String;
    readonly url: Schema.String;
}>]>;
type Content = typeof Content.Type;
```

#### `Clipboard.Format`

```ts
const Format: Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>;
type Format = typeof Format.Type;
```

#### `Clipboard.formats`

Presence checks run in parallel, one per format, without materializing any content.

```ts
const formats: Effect.Effect<readonly Clipboard.Format[], SewedError, MainContext>;
```

#### `Clipboard.native`

The clipboard capability for main. The policy lives in this Layer, not in a separate host, so
`Capability.serve(Clipboard.capability)` gives a document exactly the rules a main-side call
obeys.

```ts
const native: (policy: Clipboard.Policy) => Layer.Layer<typeof Clipboard.capability, SewedError, MainContext>;
```

#### `Clipboard.Policy`

Formats this capability may read and write; anything omitted is denied.

```ts
const Policy: Schema.Struct<{
    readonly read: Schema.$Array<Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>>;
    readonly write: Schema.$Array<Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>>;
}>;
type Policy = typeof Policy.Type;
```

#### `Clipboard.protocol`

```ts
const protocol: RpcGroup.RpcGroup<Rpc.Rpc<"clear", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"formats", Schema.Void, Schema.$Array<Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>>, typeof SewedError, never, never> | Rpc.Rpc<"read", Schema.Struct<{
    format: Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>;
}>, Schema.NullOr<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"text">;
    readonly text: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"html">;
    readonly html: Schema.String;
    readonly text: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"rtf">;
    readonly rtf: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"image">;
    readonly png: Binary.Bytes;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"bookmark">;
    readonly title: Schema.String;
    readonly url: Schema.String;
}>]>>, typeof SewedError, never, never> | Rpc.Rpc<"write", Schema.Struct<{
    content: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"text">;
        readonly text: Schema.String;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"html">;
        readonly html: Schema.String;
        readonly text: Schema.optionalKey<Schema.String>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"rtf">;
        readonly rtf: Schema.String;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"image">;
        readonly png: Binary.Bytes;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"bookmark">;
        readonly title: Schema.String;
        readonly url: Schema.String;
    }>]>;
}>, Schema.Void, typeof SewedError, never, never>>;
```

#### `Clipboard.read`

Reads one format, or `null` when the clipboard holds nothing of that kind.

```ts
const read: (format: Clipboard.Format) => Effect.Effect<Clipboard.Content | null, SewedError, MainContext>;
```

#### `Clipboard.write`

Replaces the clipboard atomically with one piece of content.

```ts
const write: (content: Clipboard.Content) => Effect.Effect<void, SewedError, MainContext>;
```

### `CommandLine`

#### `CommandLine.declare`

Declares one Chromium command-line switch, appended before readiness. One switch per declaration.

```ts
const declare: (flag: Application.CommandLineSwitch) => Declaration.Declaration;
```

#### `CommandLine.declareArgument`

Declares one bare argument, appended after Chromium's switches before readiness.

```ts
const declareArgument: (value: string) => Declaration.Declaration;
```

#### `CommandLine.declareRemoval`

Declares the removal of a switch before readiness, whoever added it.

```ts
const declareRemoval: (name: string) => Declaration.Declaration;
```

#### `CommandLine.has`

Whether the process was started with a switch, named without its leading dashes.

```ts
const has: (name: string) => Effect.Effect<boolean, SewedError, MainContext>;
```

#### `CommandLine.value`

A switch's value; empty when the switch is absent or carries none.

```ts
const value: (name: string) => Effect.Effect<string, SewedError, MainContext>;
```

### `ContentTracing`

#### `ContentTracing.bufferUsage`

```ts
const bufferUsage: Effect.Effect<ContentTracing.BufferUsage, SewedError, MainContext>;
```

#### `ContentTracing.BufferUsage`

```ts
const BufferUsage: Schema.Struct<{
    readonly value: Schema.Finite;
    readonly percentage: Schema.Finite;
}>;
type BufferUsage = typeof BufferUsage.Type;
```

#### `ContentTracing.categories`

```ts
const categories: Effect.Effect<readonly string[], SewedError, MainContext>;
```

#### `ContentTracing.enableHeapProfiling`

Turns on heap profiling, so a trace recorded with the `memory-infra` category carries
allocation samples. Electron marks this experimental.

```ts
const enableHeapProfiling: (options?: ContentTracing.HeapProfiling) => Effect.Effect<void, SewedError, MainContext>;
```

#### `ContentTracing.Handle`

```ts
interface Handle {
  /** Stops recording and returns the trace file; a second stop fails with `Closed`. */
  readonly stop: Effect.Effect<string, SewedError, MainContext>;
}
```

#### `ContentTracing.Mode`

```ts
const Mode: Schema.Literals<readonly ["record-until-full", "record-continuously", "record-as-much-as-possible", "trace-to-console"]>;
type Mode = typeof Mode.Type;
```

#### `ContentTracing.Options`

```ts
const Options: Schema.Struct<{
    readonly included: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly excluded: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly mode: Schema.optionalKey<Schema.Literals<readonly ["record-until-full", "record-continuously", "record-as-much-as-possible", "trace-to-console"]>>;
    readonly bufferKb: Schema.optionalKey<Schema.Int>;
    readonly argumentFilter: Schema.optionalKey<Schema.Boolean>;
}>;
type Options = typeof Options.Type;
```

#### `ContentTracing.record`

Records a Chromium trace for the scope's lifetime and writes it to an absolute path. Stop early
with `stop`; closing the scope stops a recording that is still running.

```ts
const record: (file: string, options?: ContentTracing.Options) => Effect.Effect<Handle, SewedError, MainContext | Scope.Scope>;
```

### `Cookies`

#### `Cookies.capability`

A session's cookies as one capability: `Cookies.native(session, policy)` in `sewed/main` carries
the origin policy for one acquired session, `Capability.client` reaches it from a document, and
`Testing.Cookies.memory` stands in for tests.

```ts
const capability: Capability.Capability<Rpc.Rpc<"changes", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly cookie: Schema.Struct<{
        readonly name: Schema.String;
        readonly value: Schema.String;
        readonly domain: Schema.optionalKey<Schema.String>;
        readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly secure: Schema.optionalKey<Schema.Boolean>;
        readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
        readonly session: Schema.optionalKey<Schema.Boolean>;
        readonly expirationDate: Schema.optionalKey<Schema.Finite>;
        readonly sameSite: Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>;
    }>;
    readonly cause: Schema.Literals<readonly ["inserted", "inserted-no-change-overwrite", "inserted-no-value-change-overwrite", "explicit", "overwrite", "expired", "evicted", "expired-overwrite"]>;
    readonly removed: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"flush", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"get", Schema.Struct<{
    filter: Schema.Struct<{
        readonly url: Schema.optionalKey<Schema.String>;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly domain: Schema.optionalKey<Schema.String>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly secure: Schema.optionalKey<Schema.Boolean>;
        readonly session: Schema.optionalKey<Schema.Boolean>;
        readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
    }>;
}>, Schema.$Array<Schema.Struct<{
    readonly name: Schema.String;
    readonly value: Schema.String;
    readonly domain: Schema.optionalKey<Schema.String>;
    readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
    readonly path: Schema.optionalKey<Schema.String>;
    readonly secure: Schema.optionalKey<Schema.Boolean>;
    readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
    readonly session: Schema.optionalKey<Schema.Boolean>;
    readonly expirationDate: Schema.optionalKey<Schema.Finite>;
    readonly sameSite: Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>;
}>>, typeof SewedError, never, never> | Rpc.Rpc<"remove", Schema.Struct<{
    url: Schema.String;
    name: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"set", Schema.Struct<{
    details: Schema.Struct<{
        readonly url: Schema.String;
        readonly name: Schema.String;
        readonly value: Schema.String;
        readonly domain: Schema.optionalKey<Schema.String>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly secure: Schema.optionalKey<Schema.Boolean>;
        readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
        readonly expirationDate: Schema.optionalKey<Schema.Finite>;
        readonly sameSite: Schema.optionalKey<Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>>;
    }>;
}>, Schema.Void, typeof SewedError, never, never>, "sewed/binding/cookies">;
```

#### `Cookies.Cause`

```ts
const Cause: Schema.Literals<readonly ["inserted", "inserted-no-change-overwrite", "inserted-no-value-change-overwrite", "explicit", "overwrite", "expired", "evicted", "expired-overwrite"]>;
type Cause = typeof Cause.Type;
```

#### `Cookies.Change`

```ts
const Change: Schema.Struct<{
    readonly cookie: Schema.Struct<{
        readonly name: Schema.String;
        readonly value: Schema.String;
        readonly domain: Schema.optionalKey<Schema.String>;
        readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly secure: Schema.optionalKey<Schema.Boolean>;
        readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
        readonly session: Schema.optionalKey<Schema.Boolean>;
        readonly expirationDate: Schema.optionalKey<Schema.Finite>;
        readonly sameSite: Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>;
    }>;
    readonly cause: Schema.Literals<readonly ["inserted", "inserted-no-change-overwrite", "inserted-no-value-change-overwrite", "explicit", "overwrite", "expired", "evicted", "expired-overwrite"]>;
    readonly removed: Schema.Boolean;
}>;
type Change = typeof Change.Type;
```

#### `Cookies.Cookie`

```ts
const Cookie: Schema.Struct<{
    readonly name: Schema.String;
    readonly value: Schema.String;
    readonly domain: Schema.optionalKey<Schema.String>;
    readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
    readonly path: Schema.optionalKey<Schema.String>;
    readonly secure: Schema.optionalKey<Schema.Boolean>;
    readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
    readonly session: Schema.optionalKey<Schema.Boolean>;
    readonly expirationDate: Schema.optionalKey<Schema.Finite>;
    readonly sameSite: Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>;
}>;
type Cookie = typeof Cookie.Type;
```

#### `Cookies.Details`

```ts
const Details: Schema.Struct<{
    readonly url: Schema.String;
    readonly name: Schema.String;
    readonly value: Schema.String;
    readonly domain: Schema.optionalKey<Schema.String>;
    readonly path: Schema.optionalKey<Schema.String>;
    readonly secure: Schema.optionalKey<Schema.Boolean>;
    readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
    readonly expirationDate: Schema.optionalKey<Schema.Finite>;
    readonly sameSite: Schema.optionalKey<Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>>;
}>;
type Details = typeof Details.Type;
```

#### `Cookies.Filter`

```ts
const Filter: Schema.Struct<{
    readonly url: Schema.optionalKey<Schema.String>;
    readonly name: Schema.optionalKey<Schema.String>;
    readonly domain: Schema.optionalKey<Schema.String>;
    readonly path: Schema.optionalKey<Schema.String>;
    readonly secure: Schema.optionalKey<Schema.Boolean>;
    readonly session: Schema.optionalKey<Schema.Boolean>;
    readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
}>;
type Filter = typeof Filter.Type;
```

#### `Cookies.native`

The cookie capability for main. Unlike the ambient surfaces, this one is scoped to a session, so
the Layer threads an acquired handle rather than a plain options bag: it resolves the handle in
main, then compiles the policy once over that session's store. The policy lives in this Layer,
not in a separate host, so `Capability.serve(Cookie.capability)` gives a document exactly the
rules a main-side call obeys.

```ts
const native: (session: Handle, policy: Cookie.Policy) => Layer.Layer<typeof Cookie.capability, SewedError, MainContext>;
```

#### `Cookies.Policy`

Origins this capability may read, write, and observe cookies for; nothing else is reachable.

```ts
const Policy: Schema.$Array<Schema.Struct<{
    readonly kind: Schema.Literal<"origin">;
    readonly origin: Schema.String;
}>>;
type Policy = typeof Policy.Type;
```

#### `Cookies.protocol`

```ts
const protocol: RpcGroup.RpcGroup<Rpc.Rpc<"changes", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly cookie: Schema.Struct<{
        readonly name: Schema.String;
        readonly value: Schema.String;
        readonly domain: Schema.optionalKey<Schema.String>;
        readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly secure: Schema.optionalKey<Schema.Boolean>;
        readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
        readonly session: Schema.optionalKey<Schema.Boolean>;
        readonly expirationDate: Schema.optionalKey<Schema.Finite>;
        readonly sameSite: Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>;
    }>;
    readonly cause: Schema.Literals<readonly ["inserted", "inserted-no-change-overwrite", "inserted-no-value-change-overwrite", "explicit", "overwrite", "expired", "evicted", "expired-overwrite"]>;
    readonly removed: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"flush", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"get", Schema.Struct<{
    filter: Schema.Struct<{
        readonly url: Schema.optionalKey<Schema.String>;
        readonly name: Schema.optionalKey<Schema.String>;
        readonly domain: Schema.optionalKey<Schema.String>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly secure: Schema.optionalKey<Schema.Boolean>;
        readonly session: Schema.optionalKey<Schema.Boolean>;
        readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
    }>;
}>, Schema.$Array<Schema.Struct<{
    readonly name: Schema.String;
    readonly value: Schema.String;
    readonly domain: Schema.optionalKey<Schema.String>;
    readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
    readonly path: Schema.optionalKey<Schema.String>;
    readonly secure: Schema.optionalKey<Schema.Boolean>;
    readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
    readonly session: Schema.optionalKey<Schema.Boolean>;
    readonly expirationDate: Schema.optionalKey<Schema.Finite>;
    readonly sameSite: Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>;
}>>, typeof SewedError, never, never> | Rpc.Rpc<"remove", Schema.Struct<{
    url: Schema.String;
    name: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"set", Schema.Struct<{
    details: Schema.Struct<{
        readonly url: Schema.String;
        readonly name: Schema.String;
        readonly value: Schema.String;
        readonly domain: Schema.optionalKey<Schema.String>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly secure: Schema.optionalKey<Schema.Boolean>;
        readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
        readonly expirationDate: Schema.optionalKey<Schema.Finite>;
        readonly sameSite: Schema.optionalKey<Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>>;
    }>;
}>, Schema.Void, typeof SewedError, never, never>>;
```

#### `Cookies.SameSite`

```ts
const SameSite: Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>;
type SameSite = typeof SameSite.Type;
```

### `Declaration`

#### `Declaration.Declaration`

An inert value `App.run` applies synchronously before Electron is ready. Making one runs
nothing, and it is not an Effect: a program cannot yield one after readiness.

```ts
interface Declaration {
  readonly [identity]: true;
}
```

#### `Declaration.definition`

```ts
const definition: (value: Declaration) => Definition | undefined;
```

#### `Declaration.Definition`

```ts
interface Definition {
  readonly name: string;
  readonly apply: () => void;
}
```

#### `Declaration.Entry`

What `App.run`'s list holds: a declaration, or a synchronous thunk `App.run` calls for one.

```ts
type Entry = Declaration | (() => Declaration);
```

#### `Declaration.make`

Makes a declaration from a name and the synchronous step that applies it. Every `declare` in
Sewed is built on this, and a package with its own pre-readiness step (`@sewed/forge`'s crash
reporter) uses it directly. A throw from `apply` fails startup with code `Startup`, naming the
declaration.

```ts
const make: (name: string, apply: () => void) => Declaration;
```

### `DesktopCapturer`

#### `DesktopCapturer.Decision`

What a display media request receives: nothing, or one capture source with optional system audio.

```ts
const Decision: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"deny">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"source">;
    readonly id: Schema.String;
    readonly audio: Schema.optionalKey<Schema.Literals<readonly ["loopback", "loopbackWithMute"]>>;
}>]>;
type Decision = typeof Decision.Type;
```

#### `DesktopCapturer.Options`

```ts
const Options: Schema.Struct<{
    readonly types: Schema.NonEmptyArray<Schema.Literals<readonly ["screen", "window"]>>;
    readonly thumbnailSize: Schema.optionalKey<Schema.Struct<{
        readonly width: Schema.Int;
        readonly height: Schema.Int;
    }>>;
    readonly fetchWindowIcons: Schema.optionalKey<Schema.Boolean>;
}>;
type Options = typeof Options.Type;
```

#### `DesktopCapturer.Request`

`origin` is `null` when the requesting document's origin is opaque (`file:`, `data:`, an
unregistered scheme): `URL.origin` reports the literal string `"null"` for every such document,
which is Chromium's own spelling for "this document has no origin", not a real identity — the same
reasoning `Decidables.Session.Permission`'s own doc gives for its `origin` field. See
`internal/DisplayMedia.ts`'s event builder.

```ts
const Request: Schema.Struct<{
    readonly origin: Schema.NullOr<Schema.String>;
    readonly videoRequested: Schema.Boolean;
    readonly audioRequested: Schema.Boolean;
    readonly userGesture: Schema.Boolean;
}>;
type Request = typeof Request.Type;
```

#### `DesktopCapturer.Source`

A capturable screen or window; thumbnails and icons are PNG bytes, empty when not fetched.

```ts
const Source: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly displayId: Schema.String;
    readonly thumbnail: Binary.Bytes;
    readonly icon: Schema.NullOr<Binary.Bytes>;
}>;
type Source = typeof Source.Type;
```

#### `DesktopCapturer.sources`

Lists capturable screens and windows with PNG thumbnails; screen capture itself stays a session policy.

```ts
const sources: (options: DesktopCapturer.Options) => Effect.Effect<readonly DesktopCapturer.Source[], SewedError, MainContext>;
```

#### `DesktopCapturer.SourceType`

```ts
const SourceType: Schema.Literals<readonly ["screen", "window"]>;
type SourceType = typeof SourceType.Type;
```

### `Download`

#### `Download.adopt`

Wraps a native download Electron already started; the handle ends with the item.

```ts
const adopt: (item: AdoptableItem) => Download.Handle;
```

#### `Download.Handle`

```ts
interface Handle {
  readonly snapshot: Effect.Effect<State, SewedError, MainContext>;
  /** The file and response facts of the download; see {@link Details}. */
  readonly details: Effect.Effect<Details, SewedError, MainContext>;
  readonly progress: Stream.Stream<State, SewedError, MainContext>;
  readonly awaitDone: Effect.Effect<Outcome, SewedError, MainContext>;
  readonly pause: Effect.Effect<void, SewedError, MainContext>;
  readonly resume: Effect.Effect<void, SewedError, MainContext>;
  readonly cancel: Effect.Effect<void, SewedError, MainContext>;
}
```

#### `Download.Options`

```ts
const Options: Schema.Struct<{
    readonly url: Schema.String;
    readonly savePath: Schema.String;
    readonly headers: Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>;
}>;
type Options = typeof Options.Type;
```

#### `Download.Outcome`

```ts
const Outcome: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"completed">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"cancelled">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"interrupted">;
}>]>;
type Outcome = typeof Outcome.Type;
```

#### `Download.start`

```ts
const start: (session: SessionHandle, options: Download.Options) => Effect.Effect<Download.Handle, SewedError, MainContext | Scope.Scope>;
```

#### `Download.State`

```ts
const State: Schema.Union<readonly [Schema.Struct<{
    readonly receivedBytes: Schema.Finite;
    readonly totalBytes: Schema.Finite;
    readonly percent: Schema.Finite;
    readonly currentBytesPerSecond: Schema.Finite;
    readonly canResume: Schema.Boolean;
    readonly paused: Schema.Boolean;
    readonly status: Schema.Literal<"pending">;
}>, Schema.Struct<{
    readonly receivedBytes: Schema.Finite;
    readonly totalBytes: Schema.Finite;
    readonly percent: Schema.Finite;
    readonly currentBytesPerSecond: Schema.Finite;
    readonly canResume: Schema.Boolean;
    readonly paused: Schema.Boolean;
    readonly status: Schema.Literal<"active">;
    readonly phase: Schema.Literals<readonly ["progressing", "interrupted"]>;
}>, Schema.Struct<{
    readonly receivedBytes: Schema.Finite;
    readonly totalBytes: Schema.Finite;
    readonly percent: Schema.Finite;
    readonly currentBytesPerSecond: Schema.Finite;
    readonly canResume: Schema.Boolean;
    readonly paused: Schema.Boolean;
    readonly status: Schema.Literal<"terminal">;
    readonly outcome: Schema.Literals<readonly ["completed", "cancelled", "interrupted"]>;
}>]>;
type State = typeof State.Type;
```

### `GlobalShortcut`

#### `GlobalShortcut.Accelerator`

```ts
const Accelerator: Schema.String;
type Accelerator = typeof Accelerator.Type;
```

#### `GlobalShortcut.Handle`

```ts
interface Handle {
  readonly accelerator: string;
  readonly presses: Stream.Stream<void, SewedError, MainContext>;
}
```

#### `GlobalShortcut.register`

```ts
const register: (accelerator: string) => Effect.Effect<Handle, SewedError, MainContext | Scope.Scope>;
```

#### `GlobalShortcut.setSuspended`

Suspends or resumes every registered shortcut without unregistering any, for example while the
user records a new key combination.

```ts
const setSuspended: (flag: boolean) => Effect.Effect<void, SewedError, MainContext>;
```

#### `GlobalShortcut.suspended`

Whether every registered shortcut is currently suspended.

```ts
const suspended: Effect.Effect<boolean, SewedError, MainContext>;
```

### `Gpu`

#### `Gpu.declare`

Declares GPU settings that must precede readiness; `acceleration: false` disables the GPU.

```ts
const declare: (options: Options) => Declaration.Declaration;
```

#### `Gpu.Options`

```ts
type Options = Application.Gpu;
```

### `GuestView`

#### `GuestView.Handle`

A guest view handle whose web contents is the shared core; see the root `Handle`.

```ts
type Handle<A extends Automation.Declaration = {}> = Public.Handle<A, Core>;
```

#### `GuestView.HostPolicy`

What this capability serves beyond state, focus, zoom, find, and history.

```ts
const HostPolicy: Schema.Struct<{
    readonly navigate: Schema.Boolean;
    readonly capture: Schema.Boolean;
}>;
type HostPolicy = typeof HostPolicy.Type;
```

#### `GuestView.InputPolicy`

Whether keyboard and mouse input reaches the guest page.

```ts
const InputPolicy: Schema.Literals<readonly ["allow", "block"]>;
type InputPolicy = typeof InputPolicy.Type;
```

#### `GuestView.make`

Acquires a view for a page the application does not own: no preload, no bridge, a navigation
policy fixed at creation (`Navigation.Rules`: URL rules or match patterns), denied webviews,
decider-gated popups and downloads, and the automation declared here. The view lives until the
scope closes or `close` runs; it is never recreated.

```ts
const make: <const A extends Automation.Declaration = {}>(options: Public.Options<A>) => Effect.Effect<Handle<A>, SewedError, MainContext | Scope.Scope>;
```

#### `GuestView.native`

A guest's hosted tab for main. Like a window's controls, this capability belongs to an owner, so
the Layer threads an acquired guest rather than a plain options bag, and compiles the host
policy once over that guest. The policy lives in this Layer, not in a separate host, so
`Capability.serve(GuestView.tab)` gives a document exactly the rules a main-side call obeys.

```ts
const native: (guest: Guest, policy: HostPolicy) => Layer.Layer<typeof tab, SewedError, MainContext>;
```

#### `GuestView.Options`

```ts
interface Options<A extends Automation.Declaration> extends Omit<Settings, "automation"> {
  readonly session?: SessionHandle;
  readonly automation?: A;
}
```

#### `GuestView.protocol`

```ts
const protocol: RpcGroup.RpcGroup<Rpc.Rpc<"back", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"capture", Schema.Struct<{
    readonly rect: Schema.optionalKey<Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>>;
    readonly stayHidden: Schema.optionalKey<Schema.Boolean>;
    readonly stayAwake: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{
    readonly bytes: Binary.Bytes;
    readonly width: Schema.Finite;
    readonly height: Schema.Finite;
    readonly scaleFactor: Schema.Finite;
}>, typeof SewedError, never, never> | Rpc.Rpc<"find", Schema.Struct<{
    text: Schema.String;
    options: Schema.optionalKey<Schema.Struct<{
        readonly forward: Schema.optionalKey<Schema.Boolean>;
        readonly matchCase: Schema.optionalKey<Schema.Boolean>;
    }>>;
}>, RpcSchema.Stream<Schema.Struct<{
    readonly activeMatchOrdinal: Schema.Int;
    readonly matches: Schema.Int;
    readonly selectionArea: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly finalUpdate: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"findNext", Schema.Struct<{
    forward: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"forward", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"history", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly index: Schema.Int;
    readonly entries: Schema.$Array<Schema.Struct<{
        readonly url: Schema.String;
        readonly title: Schema.String;
    }>>;
    readonly canGoBack: Schema.Boolean;
    readonly canGoForward: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"navigate", Schema.Struct<{
    url: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setZoom", Schema.Struct<{
    factor: Schema.Finite;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"state", Schema.Void, RpcSchema.Stream<Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"idle">;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"loading">;
    readonly url: Schema.String;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"gone">;
    readonly reason: Schema.String;
    readonly exitCode: Schema.Finite;
}>]>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"stopFind", Schema.Struct<{
    action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"zoom", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly factor: Schema.Finite;
}>, typeof SewedError>, Schema.Never, never, never>>;
```

#### `GuestView.Settings`

```ts
const Settings: Schema.Struct<{
    readonly navigation: Schema.$Array<Schema.Union<readonly [Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"origin">;
        readonly origin: Schema.String;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"document">;
        readonly url: Schema.String;
    }>]>, Schema.String]>>;
    readonly webRtc: Schema.optionalKey<Schema.Literals<readonly ["default", "publicInterfaceOnly", "disableNonProxiedUdp"]>>;
    readonly input: Schema.optionalKey<Schema.Literals<readonly ["allow", "block"]>>;
    readonly backgroundThrottling: Schema.optionalKey<Schema.Boolean>;
    readonly automation: Schema.optionalKey<Schema.Struct<{
        readonly evaluate: Schema.optionalKey<Schema.Literal<true>>;
        readonly devtools: Schema.optionalKey<Schema.NonEmptyArray<Schema.String>>;
        readonly input: Schema.optionalKey<Schema.Literal<true>>;
    }>>;
}>;
type Settings = typeof Settings.Type;
```

#### `GuestView.tab`

A guest's hosted tab as one capability. Like a window's controls, it belongs to an owner:
`GuestView.native(guest, policy)` in `sewed/main` carries the host policy for one acquired view,
and `Capability.client` reaches it from a document. The policy still decides `navigate` and
`capture`; everything else on the protocol is always served.

```ts
const tab: Capability.Capability<Rpc.Rpc<"back", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"capture", Schema.Struct<{
    readonly rect: Schema.optionalKey<Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>>;
    readonly stayHidden: Schema.optionalKey<Schema.Boolean>;
    readonly stayAwake: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{
    readonly bytes: Binary.Bytes;
    readonly width: Schema.Finite;
    readonly height: Schema.Finite;
    readonly scaleFactor: Schema.Finite;
}>, typeof SewedError, never, never> | Rpc.Rpc<"find", Schema.Struct<{
    text: Schema.String;
    options: Schema.optionalKey<Schema.Struct<{
        readonly forward: Schema.optionalKey<Schema.Boolean>;
        readonly matchCase: Schema.optionalKey<Schema.Boolean>;
    }>>;
}>, RpcSchema.Stream<Schema.Struct<{
    readonly activeMatchOrdinal: Schema.Int;
    readonly matches: Schema.Int;
    readonly selectionArea: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly finalUpdate: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"findNext", Schema.Struct<{
    forward: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"forward", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"history", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly index: Schema.Int;
    readonly entries: Schema.$Array<Schema.Struct<{
        readonly url: Schema.String;
        readonly title: Schema.String;
    }>>;
    readonly canGoBack: Schema.Boolean;
    readonly canGoForward: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"navigate", Schema.Struct<{
    url: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setZoom", Schema.Struct<{
    factor: Schema.Finite;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"state", Schema.Void, RpcSchema.Stream<Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"idle">;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"loading">;
    readonly url: Schema.String;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"gone">;
    readonly reason: Schema.String;
    readonly exitCode: Schema.Finite;
}>]>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"stopFind", Schema.Struct<{
    action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"zoom", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly factor: Schema.Finite;
}>, typeof SewedError>, Schema.Never, never, never>, "sewed/binding/guest-tab">;
```

#### `GuestView.WebRtcPolicy`

```ts
const WebRtcPolicy: Schema.Literals<readonly ["default", "publicInterfaceOnly", "disableNonProxiedUdp"]>;
type WebRtcPolicy = typeof WebRtcPolicy.Type;
```

### `host`

```ts
const host: <Rpcs extends Rpc.Any, E, R>(protocol: RpcGroup.RpcGroup<Rpcs>, handlers: HandlerLayer<Rpcs, E, R>) => Effect.Effect<Binding.Owner<Rpcs>, E, R | MainContext | Scope.Scope>;
```

### `Image`

#### `Image.aspectRatio`

A bitmap's width over its height.

```ts
const aspectRatio: (bitmap: Bitmap) => number;
```

#### `Image.Bitmap`

A decoded bitmap: BGRA, 4 bytes per pixel, row-major, premultiplied by alpha, exactly as
Electron's `nativeImage.toBitmap` lays them out — a color channel above a pixel's own alpha
comes back clamped down to it (a hand-built `[200, 100, 50, 128]` BGRA pixel round-trips
through `toBitmap`/`createFromBitmap` as `[128, 100, 50, 128]`). `compose` only ever copies
bytes, never blends them, so this bites a consumer who hand-builds a translucent bitmap and
later decodes it back through `nativeImage`, not `compose` itself. `bytes.byteLength` must
equal `width * height * 4`; nothing else about the pixel format is checked here, and nothing
here touches Electron — a `Bitmap` is inert data a test can build by hand.

```ts
const Bitmap: Schema.Struct<{
    readonly width: Schema.Int;
    readonly height: Schema.Int;
    readonly bytes: Binary.Bytes;
}>;
type Bitmap = typeof Bitmap.Type;
```

#### `Image.compose`

Copies each layer's pixels onto a copy of `base` at its pixel offset, clipping whatever falls
outside the base's own edges; layers apply in order, so a later one overwrites an earlier one
where they overlap. Pure arithmetic over BGRA bytes: no Electron, no blend modes, no rotation,
no crop — the consumer's need is a composite screenshot, one capture laid over another.

`base` and every layer's `bitmap` are validated against `Bitmap` first, so a wrong byte length
fails `Protocol` naming it rather than reading past the end of a buffer. An empty layer list
still returns a copy of `base`, never the same object.

```ts
const compose: (base: Bitmap, layers: readonly Layer[]) => Bitmap;
```

#### `Image.decode`

Decodes an `Image.Source` — a path or already-encoded bytes (PNG, JPEG, and the other formats
`nativeImage` reads), the same shape and the same `nativeImageOf` resolution every icon door
takes — into a `Bitmap`. Fails `Protocol`, naming the path, for a path or bytes no decoder
accepts, `Native` for any other Electron failure.

```ts
const decode: (source: Source) => Effect.Effect<Bitmap, SewedError, MainContext>;
```

#### `Image.encode`

Encodes a bitmap to PNG or JPEG bytes; `quality` (0-100) applies to JPEG only and defaults to 100. Fails `Protocol` for an invalid bitmap or options, `Native` for an Electron failure.

```ts
const encode: (bitmap: Bitmap, options: EncodeOptions) => Effect.Effect<Uint8Array, SewedError, MainContext>;
```

#### `Image.EncodeOptions`

```ts
const EncodeOptions: Schema.Struct<{
    readonly format: Schema.Literals<readonly ["png", "jpeg"]>;
    readonly quality: Schema.optionalKey<Schema.Finite>;
}>;
type EncodeOptions = typeof EncodeOptions.Type;
```

#### `Image.fromDataUrl`

Decodes a `data:` URL holding a PNG or JPEG image into a bitmap.

```ts
const fromDataUrl: (url: string) => Effect.Effect<Bitmap, SewedError, MainContext>;
```

#### `Image.Layer`

One bitmap placed at a pixel offset onto a base; `compose` clips it at the base's own edges.

```ts
const Layer: Schema.Struct<{
    readonly bitmap: Schema.Struct<{
        readonly width: Schema.Int;
        readonly height: Schema.Int;
        readonly bytes: Binary.Bytes;
    }>;
    readonly x: Schema.Int;
    readonly y: Schema.Int;
}>;
type Layer = typeof Layer.Type;
```

#### `Image.menuSymbol`

A macOS SF Symbol sized for a menu item, by symbol name.

```ts
const menuSymbol: (name: string) => Effect.Effect<Bitmap, SewedError, MainContext>;
```

#### `Image.named`

A macOS system image by its `NSImageName`, such as `NSImageNameAddTemplate`.

```ts
const named: (name: string) => Effect.Effect<Bitmap, SewedError, MainContext>;
```

#### `Image.resize`

Resizes a bitmap; omitting a dimension keeps the image's own. Fails `Protocol` for an invalid
bitmap or options, `Native` for an Electron failure.

```ts
const resize: (bitmap: Bitmap, options?: ResizeOptions) => Effect.Effect<Bitmap, SewedError, MainContext>;
```

#### `Image.ResizeOptions`

```ts
const ResizeOptions: Schema.Struct<{
    readonly width: Schema.optionalKey<Schema.Int>;
    readonly height: Schema.optionalKey<Schema.Int>;
}>;
type ResizeOptions = typeof ResizeOptions.Type;
```

#### `Image.Source`

A path or already-encoded image bytes (PNG, JPEG, and the other formats `nativeImage` reads) —
the one schema every icon door takes: a window's `setIcon` and `setOverlayIcon` in this wave,
the tray and the dock in the next.

```ts
const Source: Schema.Union<readonly [Schema.String, Binary.Bytes]>;
type Source = typeof Source.Type;
```

#### `Image.thumbnail`

The operating system's preview thumbnail for a file, by absolute path, on macOS and Windows.
Fails `Protocol` for a relative path or an invalid size, `Native` elsewhere and when the system
has no thumbnail for the file.

```ts
const thumbnail: (target: string, size: {
    readonly width: number;
    readonly height: number;
}) => Effect.Effect<Bitmap, SewedError, MainContext>;
```

#### `Image.toDataUrl`

A bitmap as a PNG `data:` URL, for an `img` element or a stylesheet.

```ts
const toDataUrl: (bitmap: Bitmap) => Effect.Effect<string, SewedError, MainContext>;
```

### `ImageView`

#### `ImageView.Handle`

A view that displays one image; attach it to a window or container view.

```ts
interface Handle extends Attachable {
  readonly setImage: (image: string | Uint8Array) => Effect.Effect<void, SewedError, MainContext>;
  readonly close: Effect.Effect<void, never, MainContext>;
  readonly awaitClosed: Effect.Effect<void, never, MainContext>;
}
```

#### `ImageView.make`

```ts
const make: typeof Native.make;
```

#### `ImageView.Options`

```ts
interface Options {
  /** A file path or encoded image bytes such as PNG; either must decode to a non-empty image. */
  readonly image?: string | Uint8Array;
}
```

### `InAppPurchase`

#### `InAppPurchase.canMakePayments`

```ts
const canMakePayments: Effect.Effect<boolean, SewedError, MainContext>;
```

#### `InAppPurchase.finish`

```ts
const finish: (date: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `InAppPurchase.finishAll`

```ts
const finishAll: Effect.Effect<void, SewedError, MainContext>;
```

#### `InAppPurchase.Product`

```ts
const Product: Schema.Struct<{
    readonly productIdentifier: Schema.String;
    readonly localizedTitle: Schema.String;
    readonly localizedDescription: Schema.String;
    readonly price: Schema.Finite;
    readonly formattedPrice: Schema.String;
    readonly currencyCode: Schema.String;
    readonly isDownloadable: Schema.Boolean;
}>;
type Product = typeof Product.Type;
```

#### `InAppPurchase.products`

```ts
const products: (ids: readonly string[]) => Effect.Effect<readonly InAppPurchase.Product[], SewedError, MainContext>;
```

#### `InAppPurchase.purchase`

```ts
const purchase: (id: string, quantity?: number) => Effect.Effect<boolean, SewedError, MainContext>;
```

#### `InAppPurchase.Quantity`

```ts
const Quantity: Schema.Int;
```

#### `InAppPurchase.receiptUrl`

```ts
const receiptUrl: Effect.Effect<string, SewedError, MainContext>;
```

#### `InAppPurchase.restore`

```ts
const restore: Effect.Effect<void, SewedError, MainContext>;
```

#### `InAppPurchase.Transaction`

```ts
const Transaction: Schema.Struct<{
    readonly transactionIdentifier: Schema.String;
    readonly originalTransactionIdentifier: Schema.String;
    readonly transactionDate: Schema.String;
    readonly transactionState: Schema.Literals<readonly ["purchasing", "purchased", "failed", "restored", "deferred"]>;
    readonly errorCode: Schema.Finite;
    readonly errorMessage: Schema.String;
    readonly productIdentifier: Schema.String;
    readonly quantity: Schema.Finite;
}>;
type Transaction = typeof Transaction.Type;
```

#### `InAppPurchase.transactions`

```ts
const transactions: Stream.Stream<readonly InAppPurchase.Transaction[], SewedError, MainContext>;
```

#### `InAppPurchase.TransactionState`

```ts
const TransactionState: Schema.Literals<readonly ["purchasing", "purchased", "failed", "restored", "deferred"]>;
type TransactionState = typeof TransactionState.Type;
```

### `NativeTheme`

#### `NativeTheme.capability`

The whole theme surface as one capability: `NativeTheme.native` in `sewed/main` carries the
options, `Capability.client` reaches it from a document, and `Testing.NativeTheme.memory`
stands in for tests.

```ts
const capability: Capability.Capability<Rpc.Rpc<"setSource", Schema.Struct<{
    source: Schema.Literals<readonly ["system", "light", "dark"]>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"state", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly source: Schema.Literals<readonly ["system", "light", "dark"]>;
    readonly shouldUseDarkColors: Schema.Boolean;
    readonly shouldUseHighContrastColors: Schema.Boolean;
    readonly shouldUseInvertedColorScheme: Schema.Boolean;
    readonly inForcedColorsMode: Schema.Boolean;
    readonly prefersReducedTransparency: Schema.Boolean;
    /** Present on macOS: the user asked for shapes or text beside color differences. */
    readonly shouldDifferentiateWithoutColor: Schema.optionalKey<Schema.Boolean>;
    /** Present on macOS and Windows: whether the taskbar, menu bar and tray are dark. */
    readonly shouldUseDarkColorsForSystemIntegratedUI: Schema.optionalKey<Schema.Boolean>;
}>, typeof SewedError>, Schema.Never, never, never>, "sewed/binding/native-theme">;
```

#### `NativeTheme.current`

```ts
const current: Effect.Effect<NativeTheme.State, SewedError, MainContext>;
```

#### `NativeTheme.native`

The theme capability for main. The options live in this Layer, not in a separate host, so
`Capability.serve(NativeTheme.capability)` gives a document exactly the rules a main-side call
obeys.

```ts
const native: (options?: NativeTheme.Options) => Layer.Layer<typeof NativeTheme.capability, SewedError, MainContext>;
```

#### `NativeTheme.Options`

What a theme capability may do. Every Layer that carries these options checks before the
platform runs, so a served renderer call meets the same rules a main-side call does.

```ts
interface Options {
  /** Whether callers may change the theme source; observing is always allowed. */
  readonly allowSetSource?: boolean;
}
```

#### `NativeTheme.protocol`

```ts
const protocol: RpcGroup.RpcGroup<Rpc.Rpc<"setSource", Schema.Struct<{
    source: Schema.Literals<readonly ["system", "light", "dark"]>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"state", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly source: Schema.Literals<readonly ["system", "light", "dark"]>;
    readonly shouldUseDarkColors: Schema.Boolean;
    readonly shouldUseHighContrastColors: Schema.Boolean;
    readonly shouldUseInvertedColorScheme: Schema.Boolean;
    readonly inForcedColorsMode: Schema.Boolean;
    readonly prefersReducedTransparency: Schema.Boolean;
    /** Present on macOS: the user asked for shapes or text beside color differences. */
    readonly shouldDifferentiateWithoutColor: Schema.optionalKey<Schema.Boolean>;
    /** Present on macOS and Windows: whether the taskbar, menu bar and tray are dark. */
    readonly shouldUseDarkColorsForSystemIntegratedUI: Schema.optionalKey<Schema.Boolean>;
}>, typeof SewedError>, Schema.Never, never, never>>;
```

#### `NativeTheme.setSource`

```ts
const setSource: (source: NativeTheme.Source) => Effect.Effect<void, SewedError, MainContext>;
```

#### `NativeTheme.Source`

```ts
const Source: Schema.Literals<readonly ["system", "light", "dark"]>;
type Source = typeof Source.Type;
```

#### `NativeTheme.state`

Replays the current theme and follows native updates; slow observers skip superseded states.

```ts
const state: Stream.Stream<NativeTheme.State, SewedError, MainContext>;
```

#### `NativeTheme.State`

```ts
const State: Schema.Struct<{
    readonly source: Schema.Literals<readonly ["system", "light", "dark"]>;
    readonly shouldUseDarkColors: Schema.Boolean;
    readonly shouldUseHighContrastColors: Schema.Boolean;
    readonly shouldUseInvertedColorScheme: Schema.Boolean;
    readonly inForcedColorsMode: Schema.Boolean;
    readonly prefersReducedTransparency: Schema.Boolean;
    /** Present on macOS: the user asked for shapes or text beside color differences. */
    readonly shouldDifferentiateWithoutColor: Schema.optionalKey<Schema.Boolean>;
    /** Present on macOS and Windows: whether the taskbar, menu bar and tray are dark. */
    readonly shouldUseDarkColorsForSystemIntegratedUI: Schema.optionalKey<Schema.Boolean>;
}>;
type State = typeof State.Type;
```

### `Net`

#### `Net.Endpoint`

```ts
const Endpoint: Schema.Struct<{
    readonly address: Schema.String;
    readonly family: Schema.Literals<readonly ["ipv4", "ipv6", "unspec"]>;
}>;
type Endpoint = typeof Endpoint.Type;
```

#### `Net.layer`

Provides `HttpClient` backed by `net.fetch`, or a session's `fetch` when one is given.

```ts
const layer: (options?: Options) => Layer.Layer<HttpClient.HttpClient, SewedError, MainContext>;
```

#### `Net.online`

```ts
const online: Effect.Effect<boolean, SewedError, MainContext>;
```

#### `Net.Options`

```ts
interface Options {
  /** Route requests through this session's cookies, cache, proxy, and interception. */
  readonly session?: SessionHandle;
  /** Skip handlers registered with `Protocol.handle` for this client. */
  readonly bypassCustomProtocolHandlers?: boolean;
}
```

#### `Net.ResolvedHost`

```ts
const ResolvedHost: Schema.Struct<{
    readonly endpoints: Schema.$Array<Schema.Struct<{
        readonly address: Schema.String;
        readonly family: Schema.Literals<readonly ["ipv4", "ipv6", "unspec"]>;
    }>>;
}>;
type ResolvedHost = typeof ResolvedHost.Type;
```

#### `Net.resolveHost`

```ts
const resolveHost: (host: string) => Effect.Effect<Net.ResolvedHost, SewedError, MainContext>;
```

#### `Net.webSocket`

Opens a WebSocket from the main process through Chromium's network stack, so it follows the
session's proxy, certificates and cookies, where Node's own socket follows none of them. It
resolves once the socket is open and fails `Native` if it cannot open; closing the scope
closes the socket.

```ts
const webSocket: (url: string, options?: Net.WebSocketOptions, session?: SessionHandle) => Effect.Effect<WebSocketHandle, SewedError, MainContext | Scope.Scope>;
```

#### `Net.WebSocketHandle`

An open WebSocket made through Chromium's network stack, owned by the scope that made it.

```ts
interface WebSocketHandle {
  /** Messages as they arrive: text as a string, binary as bytes. Ends when the socket closes. */
  readonly messages: Stream.Stream<string | Uint8Array, SewedError, MainContext>;
  readonly send: (data: string | Uint8Array) => Effect.Effect<void, SewedError, MainContext>;
  /** Resolves with the close code and reason once the socket has closed, by either side. */
  readonly closed: Effect.Effect<Net.WebSocketClose, SewedError, MainContext>;
}
```

### `NetLog`

#### `NetLog.CaptureMode`

```ts
const CaptureMode: Schema.Literals<readonly ["default", "includeSensitive", "everything"]>;
type CaptureMode = typeof CaptureMode.Type;
```

#### `NetLog.Handle`

```ts
interface Handle {
  readonly path: string;
  /** Whether Electron is still writing; false once the scope stopped the log. */
  readonly active: Effect.Effect<boolean, SewedError, MainContext>;
}
```

#### `NetLog.Options`

```ts
const Options: Schema.Struct<{
    readonly captureMode: Schema.optionalKey<Schema.Literals<readonly ["default", "includeSensitive", "everything"]>>;
    readonly maxFileSize: Schema.optionalKey<Schema.Int>;
}>;
type Options = typeof Options.Type;
```

#### `NetLog.record`

Records Chromium's network log to an absolute path for the scope's lifetime. Electron keeps
one log at a time, so a second recording fails with `Limit` until the first scope closes.

```ts
const record: (file: string, options?: NetLog.Options) => Effect.Effect<Handle, SewedError, MainContext | Scope.Scope>;
```

### `Notification`

#### `Notification.Action`

```ts
const Action: Schema.Struct<{
    readonly id: Schema.String;
    readonly text: Schema.String;
}>;
type Action = typeof Action.Type;
```

#### `Notification.Activation`

A Windows toast the user acted on, including one that launched the application: the toast's own
`arguments` string, the action's index when a button was pressed, and what the user typed.

```ts
const Activation: Schema.Struct<{
    readonly type: Schema.String;
    readonly arguments: Schema.String;
    readonly actionIndex: Schema.optionalKey<Schema.Finite>;
    readonly reply: Schema.optionalKey<Schema.String>;
    readonly userInputs: Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>;
}>;
type Activation = typeof Activation.Type;
```

#### `Notification.activations`

Windows toasts the user acted on, wherever the notification object is: after a restart, after
it was collected, and for the toast that launched the application. Electron keeps one handler,
so one observer at a time receives them.

```ts
const activations: Stream.Stream<Notification.Activation, SewedError, MainContext>;
```

#### `Notification.capability`

The whole notification surface as one capability: `Notification.native` in `sewed/main` provides
it, `Capability.client` reaches it from a document, and `Testing.Notification.memory` stands in
for tests. The surface carries no policy; the options are checked on every call.

```ts
const capability: Capability.Capability<Rpc.Rpc<"show", Schema.Struct<{
    readonly title: Schema.String;
    readonly body: Schema.optionalKey<Schema.String>;
    readonly subtitle: Schema.optionalKey<Schema.String>;
    readonly silent: Schema.optionalKey<Schema.Boolean>;
    readonly urgency: Schema.optionalKey<Schema.Literals<readonly ["normal", "critical", "low"]>>;
    readonly timeout: Schema.optionalKey<Schema.Literals<readonly ["default", "never"]>>;
    readonly icon: Schema.optionalKey<Schema.String>;
    readonly actions: Schema.optionalKey<Schema.NonEmptyArray<Schema.Struct<{
        readonly id: Schema.String;
        readonly text: Schema.String;
    }>>>;
    readonly reply: Schema.optionalKey<Schema.Struct<{
        readonly placeholder: Schema.String;
    }>>;
    readonly closeButtonText: Schema.optionalKey<Schema.String>;
    /** An identifier that survives the notification object, on macOS and Windows. */
    readonly id: Schema.optionalKey<Schema.String>;
    /** Groups notifications in Notification Center and the Action Center. */
    readonly groupId: Schema.optionalKey<Schema.String>;
    /** The header a Windows group is shown under. */
    readonly groupTitle: Schema.optionalKey<Schema.String>;
    /** The name of a sound to play, on macOS. */
    readonly sound: Schema.optionalKey<Schema.String>;
    /** A whole Windows toast as XML, replacing the fields above. */
    readonly toastXml: Schema.optionalKey<Schema.String>;
}>, RpcSchema.Stream<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"shown">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"clicked">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"action">;
    readonly id: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"replied">;
    readonly text: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"closed">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"failed">;
    readonly message: Schema.String;
}>]>, typeof SewedError>, Schema.Never, never, never>, "sewed/binding/notification">;
```

#### `Notification.delivered`

The application's notifications still in the macOS Notification Center. An unsigned build is
delivered none, so this answers an empty list there.

```ts
const delivered: Effect.Effect<ReadonlyArray<Notification.Delivered>, SewedError, MainContext>;
```

#### `Notification.Delivered`

A notification still delivered in the macOS Notification Center.

```ts
const Delivered: Schema.Struct<{
    readonly id: Schema.String;
    readonly groupId: Schema.String;
    readonly title: Schema.String;
    readonly subtitle: Schema.String;
    readonly body: Schema.String;
}>;
type Delivered = typeof Delivered.Type;
```

#### `Notification.Event`

```ts
const Event: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"shown">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"clicked">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"action">;
    readonly id: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"replied">;
    readonly text: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"closed">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"failed">;
    readonly message: Schema.String;
}>]>;
type Event = typeof Event.Type;
```

#### `Notification.Handle`

```ts
interface Handle {
  /** Finishes when the notification closes or fails; late observers fail with `Closed`. */
  readonly events: Stream.Stream<Notification.Event, SewedError, MainContext>;
  readonly close: Effect.Effect<void, SewedError, MainContext>;
}
```

#### `Notification.native`

The notification capability for main. The rules live in this Layer, not in a separate host, so
`Capability.serve(Notification.capability)` gives a document exactly the checks a main-side call
obeys.

```ts
const native: () => Layer.Layer<typeof Notification.capability, SewedError, MainContext>;
```

#### `Notification.Options`

```ts
const Options: Schema.Struct<{
    readonly title: Schema.String;
    readonly body: Schema.optionalKey<Schema.String>;
    readonly subtitle: Schema.optionalKey<Schema.String>;
    readonly silent: Schema.optionalKey<Schema.Boolean>;
    readonly urgency: Schema.optionalKey<Schema.Literals<readonly ["normal", "critical", "low"]>>;
    readonly timeout: Schema.optionalKey<Schema.Literals<readonly ["default", "never"]>>;
    readonly icon: Schema.optionalKey<Schema.String>;
    readonly actions: Schema.optionalKey<Schema.NonEmptyArray<Schema.Struct<{
        readonly id: Schema.String;
        readonly text: Schema.String;
    }>>>;
    readonly reply: Schema.optionalKey<Schema.Struct<{
        readonly placeholder: Schema.String;
    }>>;
    readonly closeButtonText: Schema.optionalKey<Schema.String>;
    /** An identifier that survives the notification object, on macOS and Windows. */
    readonly id: Schema.optionalKey<Schema.String>;
    /** Groups notifications in Notification Center and the Action Center. */
    readonly groupId: Schema.optionalKey<Schema.String>;
    /** The header a Windows group is shown under. */
    readonly groupTitle: Schema.optionalKey<Schema.String>;
    /** The name of a sound to play, on macOS. */
    readonly sound: Schema.optionalKey<Schema.String>;
    /** A whole Windows toast as XML, replacing the fields above. */
    readonly toastXml: Schema.optionalKey<Schema.String>;
}>;
type Options = typeof Options.Type;
```

#### `Notification.protocol`

One request is one notification: its stream ends when the notification closes, and interrupting the request closes it.

```ts
const protocol: RpcGroup.RpcGroup<Rpc.Rpc<"show", Schema.Struct<{
    readonly title: Schema.String;
    readonly body: Schema.optionalKey<Schema.String>;
    readonly subtitle: Schema.optionalKey<Schema.String>;
    readonly silent: Schema.optionalKey<Schema.Boolean>;
    readonly urgency: Schema.optionalKey<Schema.Literals<readonly ["normal", "critical", "low"]>>;
    readonly timeout: Schema.optionalKey<Schema.Literals<readonly ["default", "never"]>>;
    readonly icon: Schema.optionalKey<Schema.String>;
    readonly actions: Schema.optionalKey<Schema.NonEmptyArray<Schema.Struct<{
        readonly id: Schema.String;
        readonly text: Schema.String;
    }>>>;
    readonly reply: Schema.optionalKey<Schema.Struct<{
        readonly placeholder: Schema.String;
    }>>;
    readonly closeButtonText: Schema.optionalKey<Schema.String>;
    /** An identifier that survives the notification object, on macOS and Windows. */
    readonly id: Schema.optionalKey<Schema.String>;
    /** Groups notifications in Notification Center and the Action Center. */
    readonly groupId: Schema.optionalKey<Schema.String>;
    /** The header a Windows group is shown under. */
    readonly groupTitle: Schema.optionalKey<Schema.String>;
    /** The name of a sound to play, on macOS. */
    readonly sound: Schema.optionalKey<Schema.String>;
    /** A whole Windows toast as XML, replacing the fields above. */
    readonly toastXml: Schema.optionalKey<Schema.String>;
}>, RpcSchema.Stream<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"shown">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"clicked">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"action">;
    readonly id: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"replied">;
    readonly text: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"closed">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"failed">;
    readonly message: Schema.String;
}>]>, typeof SewedError>, Schema.Never, never, never>>;
```

#### `Notification.remove`

Removes delivered notifications from the macOS Notification Center by id.

```ts
const remove: (ids: ReadonlyArray<string>) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Notification.removeAll`

Removes every delivered notification of the application from the macOS Notification Center.

```ts
const removeAll: Effect.Effect<void, SewedError, MainContext>;
```

#### `Notification.removeGroup`

Removes one group's delivered notifications from the macOS Notification Center.

```ts
const removeGroup: (groupId: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Notification.show`

Shows a notification for the acquiring scope; closing the scope closes it.

```ts
const show: (options: Notification.Options) => Effect.Effect<Handle, SewedError, MainContext | Scope.Scope>;
```

#### `Notification.supported`

```ts
const supported: Effect.Effect<boolean, SewedError, MainContext>;
```

#### `Notification.Timeout`

```ts
const Timeout: Schema.Literals<readonly ["default", "never"]>;
type Timeout = typeof Timeout.Type;
```

#### `Notification.Urgency`

```ts
const Urgency: Schema.Literals<readonly ["normal", "critical", "low"]>;
type Urgency = typeof Urgency.Type;
```

### `Paths`

#### `Paths.declare`

Declares absolute application paths set before readiness: every entry is checked, then every declared
directory is created (recursively) before any path is set — `exe` and `module` name files and
are never created — so a declared directory exists once the program starts.

```ts
const declare: (table: Table) => Declaration.Declaration;
```

#### `Paths.Table`

```ts
type Table = Declarations.PathTable;
```

### `PowerMonitor`

#### `PowerMonitor.capability`

The whole power surface as one capability: `PowerMonitor.native` in `sewed/main` provides it,
`Capability.client` reaches it from a document, and `Testing.PowerMonitor.memory` stands in for
tests. The surface carries no policy; the idle threshold is checked on every call.

```ts
const capability: Capability.Capability<Rpc.Rpc<"events", Schema.Void, RpcSchema.Stream<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"suspend">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"resume">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"power-source">;
    readonly onBattery: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"screen">;
    readonly locked: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"user">;
    readonly active: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"shutdown">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"thermal">;
    readonly state: Schema.Literals<readonly ["unknown", "nominal", "fair", "serious", "critical"]>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"speed-limit">;
    readonly limit: Schema.Finite;
}>]>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"state", Schema.Struct<{
    idleThresholdSeconds: Schema.Int;
}>, Schema.Struct<{
    readonly onBattery: Schema.Boolean;
    readonly idleSeconds: Schema.Finite;
    readonly idleState: Schema.Literals<readonly ["active", "idle", "locked", "unknown"]>;
    readonly thermal: Schema.Literals<readonly ["unknown", "nominal", "fair", "serious", "critical"]>;
}>, typeof SewedError, never, never>, "sewed/binding/power-monitor">;
```

#### `PowerMonitor.Event`

```ts
const Event: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"suspend">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"resume">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"power-source">;
    readonly onBattery: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"screen">;
    readonly locked: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"user">;
    readonly active: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"shutdown">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"thermal">;
    readonly state: Schema.Literals<readonly ["unknown", "nominal", "fair", "serious", "critical"]>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"speed-limit">;
    readonly limit: Schema.Finite;
}>]>;
type Event = typeof Event.Type;
```

#### `PowerMonitor.events`

Every observer owns its listeners and a bounded queue; overflow fails that observer with `Limit`.

```ts
const events: Stream.Stream<PowerMonitor.Event, SewedError, MainContext>;
```

#### `PowerMonitor.IdleState`

```ts
const IdleState: Schema.Literals<readonly ["active", "idle", "locked", "unknown"]>;
type IdleState = typeof IdleState.Type;
```

#### `PowerMonitor.IdleThreshold`

```ts
const IdleThreshold: Schema.Int;
```

#### `PowerMonitor.native`

The power capability for main. The rules live in this Layer, not in a separate host, so
`Capability.serve(PowerMonitor.capability)` gives a document exactly the checks a main-side call
obeys.

```ts
const native: () => Layer.Layer<typeof PowerMonitor.capability, SewedError, MainContext>;
```

#### `PowerMonitor.protocol`

```ts
const protocol: RpcGroup.RpcGroup<Rpc.Rpc<"events", Schema.Void, RpcSchema.Stream<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"suspend">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"resume">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"power-source">;
    readonly onBattery: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"screen">;
    readonly locked: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"user">;
    readonly active: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"shutdown">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"thermal">;
    readonly state: Schema.Literals<readonly ["unknown", "nominal", "fair", "serious", "critical"]>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"speed-limit">;
    readonly limit: Schema.Finite;
}>]>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"state", Schema.Struct<{
    idleThresholdSeconds: Schema.Int;
}>, Schema.Struct<{
    readonly onBattery: Schema.Boolean;
    readonly idleSeconds: Schema.Finite;
    readonly idleState: Schema.Literals<readonly ["active", "idle", "locked", "unknown"]>;
    readonly thermal: Schema.Literals<readonly ["unknown", "nominal", "fair", "serious", "critical"]>;
}>, typeof SewedError, never, never>>;
```

#### `PowerMonitor.state`

```ts
const state: (idleThresholdSeconds: number) => Effect.Effect<PowerMonitor.State, SewedError, MainContext>;
```

#### `PowerMonitor.State`

```ts
const State: Schema.Struct<{
    readonly onBattery: Schema.Boolean;
    readonly idleSeconds: Schema.Finite;
    readonly idleState: Schema.Literals<readonly ["active", "idle", "locked", "unknown"]>;
    readonly thermal: Schema.Literals<readonly ["unknown", "nominal", "fair", "serious", "critical"]>;
}>;
type State = typeof State.Type;
```

#### `PowerMonitor.ThermalState`

```ts
const ThermalState: Schema.Literals<readonly ["unknown", "nominal", "fair", "serious", "critical"]>;
type ThermalState = typeof ThermalState.Type;
```

### `PowerSaveBlocker`

#### `PowerSaveBlocker.Handle`

```ts
interface Handle {
  readonly kind: PowerSaveBlocker.Kind;
  /** Whether Electron still holds the block; false once the scope released it. */
  readonly active: Effect.Effect<boolean, SewedError, MainContext>;
}
```

#### `PowerSaveBlocker.hold`

Holds a power save block for the scope's lifetime; closing the scope releases it.

```ts
const hold: (kind: PowerSaveBlocker.Kind) => Effect.Effect<Handle, SewedError, MainContext | Scope.Scope>;
```

#### `PowerSaveBlocker.Kind`

```ts
const Kind: Schema.Literals<readonly ["prevent-app-suspension", "prevent-display-sleep"]>;
type Kind = typeof Kind.Type;
```

### `Protocol`

#### `Protocol.declare`

Declares privileged schemes, registered in one call before readiness. Electron accepts that
call once per process, so one declaration carries every scheme and a second in the same list
fails `Startup`.

```ts
const declare: (...schemes: readonly Protocol.Scheme[]) => Declaration.Declaration;
```

#### `Protocol.definition`

```ts
const definition: (value: Scheme) => SchemeDefinition | undefined;
```

#### `Protocol.handle`

```ts
const handle: <E, R>(session: SessionHandle, value: Protocol.Scheme, handler: Protocol.Handler<E, R>) => Effect.Effect<void, SewedError, MainContext | R | Scope.Scope>;
```

#### `Protocol.Handler`

```ts
type Handler<E = never, R = never> = (
  request: HttpServerRequest.HttpServerRequest,
) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R | Scope.Scope>;
```

#### `Protocol.handleWeb`

```ts
const handleWeb: (session: SessionHandle, value: Protocol.Scheme, handler: Protocol.WebHandler) => Effect.Effect<void, SewedError, MainContext | Scope.Scope>;
```

#### `Protocol.Privileges`

```ts
const Privileges: Schema.Struct<{
    readonly standard: Schema.optionalKey<Schema.Boolean>;
    readonly secure: Schema.optionalKey<Schema.Boolean>;
    readonly supportFetchAPI: Schema.optionalKey<Schema.Boolean>;
    readonly corsEnabled: Schema.optionalKey<Schema.Boolean>;
    readonly stream: Schema.optionalKey<Schema.Boolean>;
    readonly serviceWorkers: Schema.optionalKey<Schema.Boolean>;
    readonly codeCache: Schema.optionalKey<Schema.Boolean>;
}>;
type Privileges = typeof Privileges.Type;
```

#### `Protocol.protocolError`

```ts
const protocolError: (message: string, cause?: unknown) => SewedError;
```

#### `Protocol.Request`

```ts
type Request = HttpServerRequest.HttpServerRequest;
```

#### `Protocol.Response`

```ts
type Response = HttpServerResponse.HttpServerResponse;
```

#### `Protocol.scheme`

Creates an inert protocol definition. Native registration happens in `App.run`.

```ts
const scheme: (name: string, privileges?: Privileges) => Scheme;
```

#### `Protocol.Scheme`

```ts
interface Scheme {
  readonly [schemeIdentity]: true;
}
```

#### `Protocol.SchemeDefinition`

```ts
interface SchemeDefinition {
  readonly name: string;
  readonly privileges: Privileges;
}
```

#### `Protocol.serveFiles`

Serves a scheme from directories on disk with no handler: Chromium streams the files itself,
so no request waits on the main process. A route with a `host` wins over one without, then the
longest `path` prefix; a path outside its route's `root`, a missing file, and any method but
`GET` and `HEAD` fail as a missing file. Scoped: closing the scope stops serving. A scheme has
a handler or routes, not both. Electron marks this experimental.

```ts
const serveFiles: (session: SessionHandle, value: Protocol.Scheme, routes: ReadonlyArray<Protocol.Route>) => Effect.Effect<void, SewedError, MainContext | Scope.Scope>;
```

#### `Protocol.validateScheme`

Validates a scheme's own declared shape; `ProtocolSchemes.ts`'s `registerSchemes` shares it.

```ts
const validateScheme: (value: Protocol.Scheme) => Protocol.SchemeDefinition;
```

#### `Protocol.WebHandler`

The web's own request/response shape `handleWeb` takes: no `HttpServerRequest`/
`HttpServerResponse` wrapping, `signal` aborts the same way a registration's teardown or the
native request's own cancellation would tell any other cancellable call, and a thrown or
rejected answer fails the request the way a `Handler`'s own failure does.

```ts
type WebHandler = (
  request: globalThis.Request,
) => globalThis.Response | Promise<globalThis.Response>;
```

### `PushNotifications`

#### `PushNotifications.notifications`

Received APNS payloads as JSON; each observer owns its listener and a queue of 128 payloads.

```ts
const notifications: Stream.Stream<Schema.Json, SewedError, MainContext>;
```

#### `PushNotifications.register`

Registers with APNS and returns the device token; macOS only, `Native` elsewhere.

```ts
const register: Effect.Effect<string, SewedError, MainContext>;
```

#### `PushNotifications.unregister`

```ts
const unregister: Effect.Effect<void, SewedError, MainContext>;
```

### `SafeStorage`

#### `SafeStorage.allowPlainText`

Linux only: lets the in-memory `basic_text` backend serve encryption when no OS keyring exists; a no-op elsewhere.

```ts
const allowPlainText: Effect.Effect<void, SewedError, MainContext>;
```

#### `SafeStorage.asyncAvailable`

Whether the asynchronous operations can encrypt. They reach the operating system's keystore
without blocking the main process, which the synchronous ones do while a keychain prompt is up.

```ts
const asyncAvailable: Effect.Effect<boolean, SewedError, MainContext>;
```

#### `SafeStorage.availability`

```ts
const availability: Effect.Effect<SafeStorage.Availability, SewedError, MainContext>;
```

#### `SafeStorage.Availability`

```ts
const Availability: Schema.Struct<{
    readonly available: Schema.Boolean;
    readonly backend: Schema.String;
}>;
type Availability = typeof Availability.Type;
```

#### `SafeStorage.decrypt`

```ts
const decrypt: (sealed: SafeStorage.Sealed) => Effect.Effect<Redacted.Redacted<string>, SewedError, MainContext>;
```

#### `SafeStorage.decryptAsync`

`decrypt` without blocking the main process. `shouldReEncrypt` says the keystore's key has
rotated and the value should be sealed again.

```ts
const decryptAsync: (sealed: SafeStorage.Sealed) => Effect.Effect<{
    readonly value: Redacted.Redacted<string>;
    readonly shouldReEncrypt: boolean;
}, SewedError, MainContext>;
```

#### `SafeStorage.encrypt`

Encrypts with the OS keystore; the plaintext never leaves its `Redacted` wrapper except here.

```ts
const encrypt: (value: Redacted.Redacted<string>) => Effect.Effect<SafeStorage.Sealed, SewedError, MainContext>;
```

#### `SafeStorage.encryptAsync`

`encrypt` without blocking the main process.

```ts
const encryptAsync: (value: Redacted.Redacted<string>) => Effect.Effect<SafeStorage.Sealed, SewedError, MainContext>;
```

#### `SafeStorage.Sealed`

Ciphertext with the backend that produced it, so stored secrets stay attributable across OS changes.

```ts
const Sealed: Schema.Struct<{
    readonly version: Schema.Literal<1>;
    readonly backend: Schema.String;
    readonly bytes: Binary.Bytes;
}>;
type Sealed = typeof Sealed.Type;
```

### `Screen`

#### `Screen.Bounds`

```ts
const Bounds: Schema.Struct<{
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
    readonly width: Schema.Finite;
    readonly height: Schema.Finite;
}>;
type Bounds = typeof Bounds.Type;
```

#### `Screen.Change`

```ts
const Change: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"added">;
    readonly display: Schema.Struct<{
        readonly id: Schema.Finite;
        readonly label: Schema.String;
        readonly bounds: Schema.Struct<{
            readonly x: Schema.Finite;
            readonly y: Schema.Finite;
            readonly width: Schema.Finite;
            readonly height: Schema.Finite;
        }>;
        readonly workArea: Schema.Struct<{
            readonly x: Schema.Finite;
            readonly y: Schema.Finite;
            readonly width: Schema.Finite;
            readonly height: Schema.Finite;
        }>;
        readonly scaleFactor: Schema.Finite;
        readonly rotation: Schema.Finite;
        readonly internal: Schema.Boolean;
    }>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"removed">;
    readonly display: Schema.Struct<{
        readonly id: Schema.Finite;
        readonly label: Schema.String;
        readonly bounds: Schema.Struct<{
            readonly x: Schema.Finite;
            readonly y: Schema.Finite;
            readonly width: Schema.Finite;
            readonly height: Schema.Finite;
        }>;
        readonly workArea: Schema.Struct<{
            readonly x: Schema.Finite;
            readonly y: Schema.Finite;
            readonly width: Schema.Finite;
            readonly height: Schema.Finite;
        }>;
        readonly scaleFactor: Schema.Finite;
        readonly rotation: Schema.Finite;
        readonly internal: Schema.Boolean;
    }>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"metrics">;
    readonly display: Schema.Struct<{
        readonly id: Schema.Finite;
        readonly label: Schema.String;
        readonly bounds: Schema.Struct<{
            readonly x: Schema.Finite;
            readonly y: Schema.Finite;
            readonly width: Schema.Finite;
            readonly height: Schema.Finite;
        }>;
        readonly workArea: Schema.Struct<{
            readonly x: Schema.Finite;
            readonly y: Schema.Finite;
            readonly width: Schema.Finite;
            readonly height: Schema.Finite;
        }>;
        readonly scaleFactor: Schema.Finite;
        readonly rotation: Schema.Finite;
        readonly internal: Schema.Boolean;
    }>;
    readonly metrics: Schema.$Array<Schema.String>;
}>]>;
type Change = typeof Change.Type;
```

#### `Screen.changes`

```ts
const changes: Stream.Stream<Screen.Change, SewedError, MainContext>;
```

#### `Screen.cursor`

```ts
const cursor: Effect.Effect<Screen.Point, SewedError, MainContext>;
```

#### `Screen.dipToScreenPoint`

Converts a point in device-independent pixels to the screen's physical pixels, on Linux and
Windows, where the two differ on a scaled display.

```ts
const dipToScreenPoint: (point: Screen.Point) => Effect.Effect<{
    readonly x: number;
    readonly y: number;
}, SewedError, MainContext>;
```

#### `Screen.dipToScreenRect`

Converts a rectangle in device-independent pixels to the screen's physical pixels, on Windows.

```ts
const dipToScreenRect: (bounds: Screen.Bounds) => Effect.Effect<{
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}, SewedError, MainContext>;
```

#### `Screen.Display`

```ts
const Display: Schema.Struct<{
    readonly id: Schema.Finite;
    readonly label: Schema.String;
    readonly bounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly workArea: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly scaleFactor: Schema.Finite;
    readonly rotation: Schema.Finite;
    readonly internal: Schema.Boolean;
}>;
type Display = typeof Display.Type;
```

#### `Screen.displays`

```ts
const displays: Effect.Effect<readonly Screen.Display[], SewedError, MainContext>;
```

#### `Screen.matching`

```ts
const matching: (bounds: Screen.Bounds) => Effect.Effect<{
    readonly id: number;
    readonly label: string;
    readonly bounds: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
    readonly workArea: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
    readonly scaleFactor: number;
    readonly rotation: number;
    readonly internal: boolean;
}, SewedError, MainContext>;
```

#### `Screen.nearest`

```ts
const nearest: (point: Screen.Point) => Effect.Effect<{
    readonly id: number;
    readonly label: string;
    readonly bounds: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
    readonly workArea: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
    readonly scaleFactor: number;
    readonly rotation: number;
    readonly internal: boolean;
}, SewedError, MainContext>;
```

#### `Screen.Point`

```ts
const Point: Schema.Struct<{
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
}>;
type Point = typeof Point.Type;
```

#### `Screen.primary`

```ts
const primary: Effect.Effect<{
    readonly id: number;
    readonly label: string;
    readonly bounds: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
    readonly workArea: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
    readonly scaleFactor: number;
    readonly rotation: number;
    readonly internal: boolean;
}, SewedError, MainContext>;
```

#### `Screen.screenToDipPoint`

Converts a point in the screen's physical pixels to device-independent pixels.

```ts
const screenToDipPoint: (point: Screen.Point) => Effect.Effect<{
    readonly x: number;
    readonly y: number;
}, SewedError, MainContext>;
```

#### `Screen.screenToDipRect`

Converts a rectangle in the screen's physical pixels to device-independent pixels, on Windows.

```ts
const screenToDipRect: (bounds: Screen.Bounds) => Effect.Effect<{
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}, SewedError, MainContext>;
```

### `Session`

#### `Session.addSpellCheckerWord`

Adds a word to the session's custom spell checker dictionary. An in-memory session has no
dictionary to write, and the refusal is `Native`.

```ts
const addSpellCheckerWord: (handle: Handle, word: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.allowNtlmCredentialsForDomains`

Names the servers integrated authentication (NTLM, Negotiate) may send credentials to, as
host patterns such as `*.example.com`. Without it Chromium sends them only to intranet hosts.

```ts
const allowNtlmCredentialsForDomains: (handle: Handle, domains: ReadonlyArray<string>) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.cacheSize`

```ts
const cacheSize: (handle: Handle) => Effect.Effect<number, SewedError, MainContext>;
```

#### `Session.clearAuthCache`

Forgets the HTTP credentials the session cached, so the next challenge asks again.

```ts
const clearAuthCache: (handle: Handle) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.clearCache`

```ts
const clearCache: (handle: Handle) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.clearCodeCaches`

Clears the generated code cache: for the resources at `urls`, or for every resource when none
is named.

```ts
const clearCodeCaches: (handle: Handle, urls?: ReadonlyArray<string>) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.clearData`

Clears browsing data by type and origin; with no options, everything the session stores.

```ts
const clearData: (handle: Handle, options?: SessionStorage.ClearData) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.clearHostResolverCache`

Forgets the session's cached host resolutions.

```ts
const clearHostResolverCache: (handle: Handle) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.clearNetworkEmulation`

Returns the session to the real network.

```ts
const clearNetworkEmulation: (handle: Handle) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.clearSharedDictionaries`

Clears shared compression dictionaries: one isolation key's, or all of them without a key.

```ts
const clearSharedDictionaries: (handle: Handle, key?: SessionStorage.SharedDictionaryKey) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.Cookies`

```ts
interface Handle {
  readonly get: (
    filter?: Cookie.Filter,
  ) => Effect.Effect<readonly Cookie.Cookie[], SewedError, MainContext>;
  readonly set: (details: Cookie.Details) => Effect.Effect<void, SewedError, MainContext>;
  readonly remove: (url: string, name: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly flush: Effect.Effect<void, SewedError, MainContext>;
  /** Every observer owns its listener and a queue of 128 changes; overflow fails it with `Limit`. */
  readonly changes: Stream.Stream<Cookie.Change, SewedError, MainContext>;
}
export type { Handle as Cookies };
```

#### `Session.defaultSession`

```ts
const defaultSession: Effect.Effect<Handle, SewedError, MainContext>;
```

#### `Session.deviceChanges`

HID, USB and serial devices that appear or go away while a chooser request is pending, and
devices whose access a page gave up. Each observer owns its native listeners.

```ts
const deviceChanges: (handle: Handle) => Stream.Stream<Device.Change, SewedError, MainContext>;
```

#### `Session.extensionEvents`

Extensions being loaded, becoming ready, and being unloaded.

```ts
const extensionEvents: (handle: Handle) => Stream.Stream<Extension.Event, SewedError, MainContext>;
```

#### `Session.extensions`

The extensions loaded in the session.

```ts
const extensions: (handle: Handle) => Effect.Effect<ReadonlyArray<Extension.Info>, SewedError, MainContext>;
```

#### `Session.flushStorage`

Writes DOM storage that is still in memory to disk.

```ts
const flushStorage: (handle: Handle) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.forceReloadProxyConfig`

Makes the session read its proxy configuration again, for example after a PAC file changed.

```ts
const forceReloadProxyConfig: (handle: Handle) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.fromPartition`

Selects a native browser session by kind and name. `cookies`, `clearStorage`,
`closeAllConnections`, `resolveHost`, `blobData`, `requests`, `decide`, and `intercept` are
methods on the returned handle, matching how a window and a web contents already read; the
settings below stay free functions taking the handle, since they are not moving in this wave.

```ts
const fromPartition: (partition: Partition) => Effect.Effect<Handle, SewedError, MainContext>;
```

#### `Session.fromPath`

A persistent session stored at an absolute directory of the application's choosing, instead of
under the user data directory by partition name. `cache: false` keeps its HTTP cache off disk.

```ts
const fromPath: (directory: string, options?: {
    readonly cache?: boolean;
}) => Effect.Effect<Handle, SewedError, MainContext>;
```

#### `Session.Handle`

A selected browser session. The identity brand is what keeps a caller from fabricating one
structurally; every other member is a method or a value the session's own construction builds
once, matching how a window and a web contents already read.

```ts
interface Handle {
  readonly [sessionHandle]: true;
  /** Cookie access for this session; the handle is inert until an operation runs in main. */
  readonly cookies: Cookies.Handle;
  /** Clears the selected storages, for the whole session or scoped to one origin. */
  readonly clearStorage: (
    options: SessionStorage.ClearOptions,
  ) => Effect.Effect<void, SewedError, MainContext>;
  /** Closes every open connection in the session, for example after its proxy changes. */
  readonly closeAllConnections: Effect.Effect<void, SewedError, MainContext>;
  /** Resolves a host with the session's resolver; `cacheUsage: "disallowed"` skips cached answers. */
  readonly resolveHost: (
    host: string,
    options?: Net.ResolveHostOptions,
  ) => Effect.Effect<Net.ResolvedHost, SewedError, MainContext>;
  /** Reads one upload blob, for request deciders that take `body.blobs: "reference"`. */
  readonly blobData: (uuid: string) => Effect.Effect<Uint8Array, SewedError, MainContext>;
  /** Observes the request stages deciders never see, for the requests a filter selects. */
  readonly requests: (
    filter: WebRequestData.Filter,
  ) => Stream.Stream<WebRequestData.Event, SewedError, MainContext>;
  /**
   * Installs a decider for one of `Decidables.Session`'s decidables against this session's own
   * registry, for the caller's scope. Any number of deciders may be installed, and the decidable's
   * own composition decides among them. Sessions have application lifetime and no closed state of
   * their own, so nothing here ever refuses installation the way a window or web contents can once
   * closed.
   *
   * The three request stages are not among them: they name `owner: "requests"`, so this refuses
   * them at compile time and {@link Handle.intercept} is where they install.
   */
  readonly decide: Decision.Owner<"session">["decide"];
  /**
   * Installs a decider for one of the three request stages — `Decidables.Session.Request`,
   * `.RequestHeaders`, `.ResponseHeaders` — on the requests one filter selects, for the caller's
   * scope. Any number of deciders may be installed on any of them, independently: one feature
   * blocking trackers and another rewriting headers neither know nor need to know about each other,
   * and removing one leaves the other deciding.
   *
   * The filter's own contract — why it is required and separate from the decidable, what a `body`
   * option does, and how several deciders on one stage compose — is {@link Decision.Requests},
   * which `sewed/testing`'s owner stand-in publishes too, so a feature that intercepts names that
   * interface and takes either this handle or a stand-in.
   */
  readonly intercept: Decision.Requests["intercept"];
}
```

#### `Session.isProtocolHandled`

Whether the session has a handler for a scheme, its own or one an application registered.

```ts
const isProtocolHandled: (handle: Handle, scheme: string) => Effect.Effect<boolean, SewedError, MainContext>;
```

#### `Session.loadExtension`

Loads an unpacked extension for the scope's lifetime; closing the scope unloads it. Electron
only accepts extensions in persistent sessions.

```ts
const loadExtension: (handle: Handle, directory: string, options?: Extension.Options) => Effect.Effect<Extension.Info, SewedError, MainContext | Scope.Scope>;
```

#### `Session.Partition`

```ts
type Partition = Native.Partition;
```

#### `Session.preloadScripts`

The preload scripts registered on the session, Sewed's own bridge included.

```ts
const preloadScripts: (handle: Handle) => Effect.Effect<ReadonlyArray<SessionStorage.RegisteredPreloadScript>, SewedError, MainContext>;
```

#### `Session.registerPreloadScript`

Registers a preload script for the scope's lifetime and answers its id; closing the scope
unregisters it. It runs in every frame, or every service worker, of the web contents that use
the session from then on, beside Sewed's own bridge preload and not instead of it.

```ts
const registerPreloadScript: (handle: Handle, script: SessionStorage.PreloadScript) => Effect.Effect<string, SewedError, MainContext | Scope.Scope>;
```

#### `Session.removeSpellCheckerWord`

Removes a word from the session's custom spell checker dictionary.

```ts
const removeSpellCheckerWord: (handle: Handle, word: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.resolveProxy`

```ts
const resolveProxy: (handle: Handle, url: string) => Effect.Effect<string, SewedError, MainContext>;
```

#### `Session.resumeDownload`

```ts
const resumeDownload: (handle: Handle, options: Download.Resume) => Effect.Effect<Download.Handle, SewedError, MainContext>;
```

#### `Session.serviceWorkers`

```ts
const serviceWorkers: (handle: Handle) => ServiceWorkers;
```

#### `Session.ServiceWorkers`

```ts
interface ServiceWorkers {
  readonly running: Effect.Effect<readonly ServiceWorker.Info[], SewedError, MainContext>;
  /** One worker by its version id, or `null` when no worker has it. */
  readonly info: (
    versionId: number,
  ) => Effect.Effect<ServiceWorker.Info | null, SewedError, MainContext>;
  /**
   * Starts the worker registered for a scope, or answers the one already running, as its version
   * id, scope and script. Electron marks this experimental.
   */
  readonly start: (scope: string) => Effect.Effect<ServiceWorker.Started, SewedError, MainContext>;
  /**
   * Keeps a running worker from being stopped for idleness, for the scope's lifetime. Fails
   * `Protocol` for a version id no running worker has. Electron marks this experimental.
   */
  readonly keepAlive: (
    versionId: number,
  ) => Effect.Effect<void, SewedError, MainContext | Scope.Scope>;
  /** Every observer owns its listeners and a queue of 128 events; overflow fails it with `Limit`. */
  readonly events: Stream.Stream<ServiceWorker.Event, SewedError, MainContext>;
}
```

#### `Session.setCodeCachePath`

Sets the directory V8's generated code cache is kept in; it must be absolute.

```ts
const setCodeCachePath: (handle: Handle, directory: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.setDownloadPath`

```ts
const setDownloadPath: (handle: Handle, directory: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.setNetworkEmulation`

Emulates the given network conditions for the session until {@link clearNetworkEmulation}.

```ts
const setNetworkEmulation: (handle: Handle, conditions: Net.Emulation) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.setProxy`

```ts
const setProxy: (handle: Handle, config: Proxy.Config) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.setSpellChecker`

```ts
const setSpellChecker: (handle: Handle, settings: {
    readonly enabled?: boolean;
    readonly languages?: readonly string[];
}) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.setSpellCheckerDictionaryDownloadUrl`

Sets where spell checker dictionaries are downloaded from, instead of Google's servers. The
URL must end in a slash; Chromium appends the dictionary file name.

```ts
const setSpellCheckerDictionaryDownloadUrl: (handle: Handle, url: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.setSSLConfig`

Sets the TLS configuration for the session's new connections. Connections already open keep
the configuration they were made with; `session.closeAllConnections` ends them.

```ts
const setSSLConfig: (handle: Handle, config: Net.SSLConfig) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.setUsbProtectedClasses`

Sets which USB classes pages cannot reach. An empty list protects none; `null` restores
Chromium's own list.

```ts
const setUsbProtectedClasses: (handle: Handle, classes: ReadonlyArray<Device.UsbClass> | null) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.setUserAgent`

```ts
const setUserAgent: (handle: Handle, value: string, acceptLanguages?: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.sharedDictionaries`

The shared compression dictionaries stored under one isolation key.

```ts
const sharedDictionaries: (handle: Handle, key: SessionStorage.SharedDictionaryKey) => Effect.Effect<ReadonlyArray<SessionStorage.SharedDictionary>, SewedError, MainContext>;
```

#### `Session.sharedDictionaryUsage`

How much each isolation key's shared compression dictionaries occupy.

```ts
const sharedDictionaryUsage: (handle: Handle) => Effect.Effect<ReadonlyArray<SessionStorage.SharedDictionaryUsage>, SewedError, MainContext>;
```

#### `Session.spellChecker`

```ts
const spellChecker: (handle: Handle) => Effect.Effect<SpellChecker, SewedError, MainContext>;
```

#### `Session.SpellChecker`

```ts
interface SpellChecker {
  readonly enabled: boolean;
  readonly languages: readonly string[];
  readonly available: readonly string[];
}
```

#### `Session.spellCheckerDictionaries`

Spell checker dictionary files being fetched and becoming usable.

```ts
const spellCheckerDictionaries: (handle: Handle) => Stream.Stream<SessionStorage.DictionaryEvent, SewedError, MainContext>;
```

#### `Session.spellCheckerWords`

The words in the session's custom spell checker dictionary.

```ts
const spellCheckerWords: (handle: Handle) => Effect.Effect<ReadonlyArray<string>, SewedError, MainContext>;
```

#### `Session.storagePath`

The directory the session persists to, or `null` for an in-memory session.

```ts
const storagePath: (handle: Handle) => Effect.Effect<string | null, SewedError, MainContext>;
```

#### `Session.userAgent`

```ts
const userAgent: (handle: Handle) => Effect.Effect<string, SewedError, MainContext>;
```

### `Shell`

#### `Shell.capability`

The whole shell surface as one capability: `Shell.native` in `sewed/main` carries the policy,
`Capability.client` reaches it from a document, and `Testing.Shell.memory` stands in for tests.

```ts
const capability: Capability.Capability<Rpc.Rpc<"beep", Schema.Struct<{}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"openExternal", Schema.Struct<{
    url: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"openPath", Schema.Struct<{
    path: Schema.String;
}>, Schema.Struct<{
    readonly opened: Schema.Boolean;
    readonly message: Schema.String;
}>, typeof SewedError, never, never> | Rpc.Rpc<"showItemInFolder", Schema.Struct<{
    path: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"trashItem", Schema.Struct<{
    path: Schema.String;
}>, Schema.Void, typeof SewedError, never, never>, "sewed/binding/shell">;
```

#### `Shell.Grants`

The path a scope has admitted, on top of whatever roots `Shell.native` was configured with.
`allow` grants one absolute path — a file, or a directory and everything under it — under the
same containment rule a configured root already uses, for as long as the caller's scope stays
open; closing the scope withdraws it, unless another open scope granted the same path too.

This is a plain, inert service declaration: it carries no Electron and no `node:` import, so it
is fine to declare here alongside {@link capability}, in a module every runtime can import. What
is privileged is a Layer that can ever produce a live instance of it — only `Shell.native` (in
`sewed/main`) and `Testing.Shell.memory` build one, each from the very `operations` call that
checks every shell operation, so a grant is never a second, drifting copy of the containment
rule. `Grants` is a separate service from {@link capability}: `Capability.serve` only ever serves
a capability's own protocol, so a document bound to the shell has no route to widen its own
policy — only main code holding this service can.

```ts
class Grants extends Grants_base {}
```

#### `Shell.native`

The shell capability for main, and the scoped grant beside it. The policy lives in this Layer,
not in a separate host, so `Capability.serve(Shell.capability)` gives a document exactly the
rules a main-side call obeys — `Shell.Grants` carries no RPC of its own, so a served document has
no route to it. Both services come from the one `ShellPolicy.operations` call below, so a path
`Shell.Grants["allow"]` admits is the very root `allowedPath` already consults, not a second copy
of the containment rule.

```ts
const native: (options: Shell.Options) => Layer.Layer<typeof Shell.capability | Shell.Grants, SewedError, MainContext>;
```

#### `Shell.OpenResult`

```ts
const OpenResult: Schema.Struct<{
    readonly opened: Schema.Boolean;
    readonly message: Schema.String;
}>;
type OpenResult = typeof OpenResult.Type;
```

#### `Shell.Options`

What a shell capability may reach. Every Layer that carries these options checks both before
the platform runs, so a served renderer call meets the same rules a main-side call does.

```ts
interface Options {
  /** Origins, documents, mail recipients, and match patterns `openExternal` may open. */
  readonly policy: Policy;
  /** Absolute directories whose contents `openPath`, `showItemInFolder`, and `trashItem` may touch. */
  readonly paths?: readonly string[];
}
```

#### `Shell.Policy`

Origins, documents, exact mail recipients, and match patterns that `openExternal` may reach;
nothing else opens. A pattern is the same `WebRequest.Pattern` navigation rules use: a wildcard
scheme, host, and path — `*`, `*`, `/*` — matches every http or https URL. Because
`openExternal` hands the URL straight to the operating system, a pattern's scheme is checked
again on top of its own syntax: the shell refuses `<all_urls>` and any scheme other than `*`,
`http`, `https`, or one `App.run` registers as standard. `file` is not a pattern scheme: a
pattern's path is matched against the URL as written, so a percent-encoded separator reaches it
undecoded and could grant a traversal a real path check would refuse. A local file goes through
`openPath` or `showItemInFolder` with a configured root instead, or an exact `document` rule
that compares one whole URL rather than matching a wildcard against it.

```ts
const Policy: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"origin">;
    readonly origin: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"document">;
    readonly url: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"mailto">;
    readonly address: Schema.String;
}>, Schema.String]>>;
type Policy = typeof Policy.Type;
```

#### `Shell.protocol`

```ts
const protocol: RpcGroup.RpcGroup<Rpc.Rpc<"beep", Schema.Struct<{}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"openExternal", Schema.Struct<{
    url: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"openPath", Schema.Struct<{
    path: Schema.String;
}>, Schema.Struct<{
    readonly opened: Schema.Boolean;
    readonly message: Schema.String;
}>, typeof SewedError, never, never> | Rpc.Rpc<"showItemInFolder", Schema.Struct<{
    path: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"trashItem", Schema.Struct<{
    path: Schema.String;
}>, Schema.Void, typeof SewedError, never, never>>;
```

#### `Shell.readShortcutLink`

Reads a Windows shortcut. Main-only and outside the shell policy, which governs what a document
may ask for: main names the path itself.

```ts
const readShortcutLink: (target: string) => Effect.Effect<Shell.Shortcut, SewedError, MainContext>;
```

#### `Shell.Shortcut`

A Windows `.lnk` shortcut.

```ts
const Shortcut: Schema.Struct<{
    readonly target: Schema.String;
    readonly cwd: Schema.optionalKey<Schema.String>;
    readonly args: Schema.optionalKey<Schema.String>;
    readonly description: Schema.optionalKey<Schema.String>;
    readonly icon: Schema.optionalKey<Schema.String>;
    readonly iconIndex: Schema.optionalKey<Schema.Int>;
    readonly appUserModelId: Schema.optionalKey<Schema.String>;
    readonly toastActivatorClsid: Schema.optionalKey<Schema.String>;
}>;
type Shortcut = typeof Shortcut.Type;
```

#### `Shell.writeShortcutLink`

Creates, updates or replaces a Windows shortcut; `create` is the default.

```ts
const writeShortcutLink: (target: string, shortcut: Shell.Shortcut, mode?: "create" | "update" | "replace") => Effect.Effect<void, SewedError, MainContext>;
```

### `SystemPreferences`

#### `SystemPreferences.accentColor`

```ts
const accentColor: Effect.Effect<string, SewedError, MainContext>;
```

#### `SystemPreferences.animation`

```ts
const animation: Effect.Effect<SystemPreferences.Animation, SewedError, MainContext>;
```

#### `SystemPreferences.Animation`

```ts
const Animation: Schema.Struct<{
    readonly shouldRenderRichAnimation: Schema.Boolean;
    readonly scrollAnimationsEnabledBySystem: Schema.Boolean;
    readonly prefersReducedMotion: Schema.Boolean;
}>;
type Animation = typeof Animation.Type;
```

#### `SystemPreferences.appearance`

```ts
const appearance: Effect.Effect<SystemPreferences.Appearance, SewedError, MainContext>;
```

#### `SystemPreferences.Appearance`

```ts
const Appearance: Schema.Literals<readonly ["dark", "light", "unknown"]>;
type Appearance = typeof Appearance.Type;
```

#### `SystemPreferences.askForMediaAccess`

```ts
const askForMediaAccess: (kind: Exclude<SystemPreferences.MediaKind, "screen">) => Effect.Effect<boolean, SewedError, MainContext>;
```

#### `SystemPreferences.canPromptTouchId`

Whether this Mac can ask for Touch ID.

```ts
const canPromptTouchId: Effect.Effect<boolean, SewedError, MainContext>;
```

#### `SystemPreferences.CenterNotification`

A macOS notification center message; `userInfo` is `null` when it is not JSON.

```ts
const CenterNotification: Schema.Struct<{
    readonly event: Schema.String;
    readonly userInfo: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly object: Schema.String;
}>;
type CenterNotification = typeof CenterNotification.Type;
```

#### `SystemPreferences.Change`

```ts
const Change: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"accent-color">;
    readonly color: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"color">;
}>]>;
type Change = typeof Change.Type;
```

#### `SystemPreferences.changes`

Accent and theme color changes; each observer owns its listeners and a queue of 128 changes.

```ts
const changes: Stream.Stream<SystemPreferences.Change, SewedError, MainContext>;
```

#### `SystemPreferences.color`

```ts
const color: (name: string) => Effect.Effect<string, SewedError, MainContext>;
```

#### `SystemPreferences.ColorName`

A Windows or macOS system color name; Electron validates the name itself.

```ts
const ColorName: Schema.String;
```

#### `SystemPreferences.Defaults`

Values registered as defaults in the macOS user defaults.

```ts
const Defaults: Schema.$Record<Schema.String, Schema.Union<readonly [Schema.String, Schema.Boolean, Schema.Finite]>>;
type Defaults = typeof Defaults.Type;
```

#### `SystemPreferences.mediaAccess`

```ts
const mediaAccess: (kind: SystemPreferences.MediaKind) => Effect.Effect<SystemPreferences.MediaAccess, SewedError, MainContext>;
```

#### `SystemPreferences.MediaAccess`

```ts
const MediaAccess: Schema.Literals<readonly ["not-determined", "granted", "denied", "restricted", "unknown"]>;
type MediaAccess = typeof MediaAccess.Type;
```

#### `SystemPreferences.MediaKind`

```ts
const MediaKind: Schema.Literals<readonly ["microphone", "camera", "screen"]>;
type MediaKind = typeof MediaKind.Type;
```

#### `SystemPreferences.NotificationCenter`

Which macOS notification center: between applications, inside this one, or the workspace's.

```ts
const NotificationCenter: Schema.Literals<readonly ["distributed", "local", "workspace"]>;
type NotificationCenter = typeof NotificationCenter.Type;
```

#### `SystemPreferences.notifications`

Messages posted to a macOS notification center under one name, or under every name with
`null`. Each observer holds its own subscription.

```ts
const notifications: (center: SystemPreferences.NotificationCenter, event: string | null) => Stream.Stream<SystemPreferences.CenterNotification, SewedError, MainContext>;
```

#### `SystemPreferences.postNotification`

Posts a message to a macOS notification center. `deliverImmediately` applies to the distributed
center, which otherwise waits for the receiving application to be active.

```ts
const postNotification: (center: SystemPreferences.NotificationCenter, event: string, userInfo?: Record<string, Schema.Json>, deliverImmediately?: boolean) => Effect.Effect<void, SewedError, MainContext>;
```

#### `SystemPreferences.promptTouchId`

Asks the user to authenticate with Touch ID, showing `reason`. Succeeds when they do and fails
`Native` when they cancel or cannot.

```ts
const promptTouchId: (reason: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `SystemPreferences.registerDefaults`

Registers fallback values in the macOS user defaults, used until a key is set.

```ts
const registerDefaults: (defaults: SystemPreferences.Defaults) => Effect.Effect<void, SewedError, MainContext>;
```

#### `SystemPreferences.removeUserDefault`

Removes a key from the macOS user defaults, restoring its registered or global value.

```ts
const removeUserDefault: (key: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `SystemPreferences.swipeTrackingFromScrollEvents`

Whether the user enabled swiping between pages with a scroll gesture, on macOS.

```ts
const swipeTrackingFromScrollEvents: Effect.Effect<boolean, SewedError, MainContext>;
```

#### `SystemPreferences.systemColor`

```ts
const systemColor: (name: SystemPreferences.SystemColor) => Effect.Effect<string, SewedError, MainContext>;
```

#### `SystemPreferences.SystemColor`

```ts
const SystemColor: Schema.Literals<readonly ["blue", "brown", "gray", "green", "orange", "pink", "purple", "red", "yellow"]>;
type SystemColor = typeof SystemColor.Type;
```

#### `SystemPreferences.trustedAccessibilityClient`

Whether the application is trusted to use the macOS accessibility API; with `prompt`, macOS
asks the user to grant it when it is not.

```ts
const trustedAccessibilityClient: (prompt?: boolean) => Effect.Effect<boolean, SewedError, MainContext>;
```

### `TouchBar`

#### `TouchBar.Handle`

```ts
interface Handle {
  /** Replaces the window's touch bar; macOS only, `Native` elsewhere. */
  readonly set: (options: TouchBar.Options) => Effect.Effect<void, SewedError, MainContext>;
  readonly clear: Effect.Effect<void, SewedError, MainContext>;
  /** Interactions with the current bar; each observer owns a queue of 128 events. */
  readonly interactions: Stream.Stream<TouchBar.Interaction, SewedError, MainContext>;
}
```

#### `TouchBar.Interaction`

```ts
const Interaction: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"click">;
    readonly id: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"slider">;
    readonly id: Schema.String;
    readonly value: Schema.Finite;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"segment">;
    readonly id: Schema.String;
    readonly index: Schema.Int;
    readonly selected: Schema.Boolean;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"color">;
    readonly id: Schema.String;
    readonly color: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"scrubber">;
    readonly id: Schema.String;
    readonly index: Schema.Int;
    readonly change: Schema.Literals<readonly ["select", "highlight"]>;
}>]>;
type Interaction = typeof Interaction.Type;
```

#### `TouchBar.Item`

```ts
type Item = Button | Label | Spacer | Slider | SegmentedControl | ColorPicker | Popover | Group | Scrubber | OtherItemsProxy;
const ItemSchema: Schema.Codec<Item>;
export { ItemSchema as Item };
```

#### `TouchBar.make`

```ts
const make: (native: BaseWindow, isClosed: () => boolean, closed: Deferred.Deferred<void>) => Handle;
```

#### `TouchBar.Options`

A whole touch bar: item ids are unique across nested popovers and groups.

```ts
const Options: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Codec<Item, Item, never, never>>;
    readonly escapeItem: Schema.optionalKey<Schema.Codec<Item, Item, never, never>>;
}>;
type Options = typeof Options.Type;
```

### `Tray`

#### `Tray.Balloon`

A Windows notification balloon attached to the tray icon.

```ts
const Balloon: Schema.Struct<{
    readonly title: Schema.String;
    readonly content: Schema.String;
    readonly icon: Schema.optionalKey<Schema.Union<readonly [Schema.String, Binary.Bytes]>>;
    readonly iconType: Schema.optionalKey<Schema.Literals<readonly ["none", "info", "warning", "error", "custom"]>>;
    readonly largeIcon: Schema.optionalKey<Schema.Boolean>;
    readonly noSound: Schema.optionalKey<Schema.Boolean>;
    readonly respectQuietTime: Schema.optionalKey<Schema.Boolean>;
}>;
type Balloon = typeof Balloon.Type;
```

#### `Tray.Event`

```ts
const Event: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"click">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"right-click">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"double-click">;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"menu-selection">;
    readonly selection: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"command">;
        readonly id: Schema.String;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"checkbox">;
        readonly id: Schema.String;
        readonly checked: Schema.Boolean;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"radio">;
        readonly id: Schema.String;
    }>]>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"middle-click">;
}>, Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["mouse-enter", "mouse-leave", "mouse-move", "mouse-down", "mouse-up"]>;
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
}>, Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["balloon-show", "balloon-click", "balloon-closed"]>;
}>, Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["drag-enter", "drag-leave", "drag-end", "drop"]>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"drop-files">;
    readonly files: Schema.$Array<Schema.String>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"drop-text">;
    readonly text: Schema.String;
}>]>;
type Event = typeof Event.Type;
```

#### `Tray.Handle`

```ts
interface Handle {
  readonly id: string;
  readonly events: Stream.Stream<Tray.Event, SewedError, MainContext>;
  readonly setToolTip: (tooltip: string) => Effect.Effect<void, SewedError, MainContext>;
  /** A path or already-encoded bytes, over wave 3's `Image.Source`; `template` mirrors `Options`. */
  readonly setImage: (
    icon: ImageSource,
    options?: {
      readonly template?: boolean;
    },
  ) => Effect.Effect<void, SewedError, MainContext>;
  readonly setMenu: (menu: Tray.MenuOptions) => Effect.Effect<void, SewedError, MainContext>;
  /** Shows a Windows balloon on the icon; `Native` elsewhere. */
  readonly displayBalloon: (balloon: Tray.Balloon) => Effect.Effect<void, SewedError, MainContext>;
  readonly removeBalloon: Effect.Effect<void, SewedError, MainContext>;
  /** Pops the tray's menu up now, on macOS and Windows; `position` applies on Windows. */
  readonly popUpMenu: (position?: {
    readonly x: number;
    readonly y: number;
  }) => Effect.Effect<void, SewedError, MainContext>;
  readonly closeMenu: Effect.Effect<void, SewedError, MainContext>;
  /** The icon's stable identifier where the platform has one, on macOS and Windows. */
  readonly guid: Effect.Effect<string | null, SewedError, MainContext>;
  /** Makes every click report at once instead of waiting to see if it is a double click, on macOS. */
  readonly setIgnoreDoubleClickEvents: (
    ignore: boolean,
  ) => Effect.Effect<void, SewedError, MainContext>;
  readonly ignoreDoubleClickEvents: Effect.Effect<boolean, SewedError, MainContext>;
  /** The image shown while the icon is pressed, on macOS. */
  readonly setPressedImage: (icon: ImageSource) => Effect.Effect<void, SewedError, MainContext>;
}
```

#### `Tray.make`

```ts
const make: (options: Tray.Options) => Effect.Effect<Handle, SewedError, MainContext | Scope.Scope>;
```

#### `Tray.MenuOptions`

```ts
const MenuOptions: Schema.Codec<MenuOptionsValue>;
type MenuOptions = MenuOptionsValue;
```

#### `Tray.Options`

```ts
const Options: Schema.Struct<{
    /** A path or already-encoded bytes, over wave 3's `Image.Source`. */
    readonly icon: Schema.Union<readonly [Schema.String, Binary.Bytes]>;
    /**
     * Calls the native image's own `setTemplateImage(true)` — macOS semantics (a monochrome image
     * the system tints for light and dark menu bars) and a probed no-op elsewhere: `isTemplateImage`
     * stays `false` on Linux.
     */
    readonly template: Schema.optionalKey<Schema.Boolean>;
    readonly tooltip: Schema.optionalKey<Schema.String>;
    readonly menu: Schema.optionalKey<Schema.Codec<MenuOptionsValue, MenuOptionsValue, never, never>>;
}>;
type Options = typeof Options.Type;
```

### `Utility`

#### `Utility.Definition`

```ts
interface Definition<Rpcs extends Rpc.Any, Keys extends string = never> {
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly [definitionType]: {
    readonly rpcs: (rpc: Rpcs) => Rpcs;
    readonly keys: Keys;
  };
}
```

#### `Utility.entry`

Types the entry from the utility module without importing it into main.

```ts
function entry<Rpcs extends Rpc.Any>(
  url: URL,
  protocol: RpcGroup.RpcGroup<Rpcs>,
): Entry<Rpcs, string>;
function entry<Rpcs extends Rpc.Any, Keys extends string>(
  url: URL,
  protocol: RpcGroup.RpcGroup<Rpcs>,
  options: {
    readonly bindings: readonly Declaration<Keys>[];
  },
): Entry<Rpcs, Keys>;
function entry<
  Module extends {
    readonly default: unknown;
  },
>(
  url: URL,
  protocol: RpcGroup.RpcGroup<DefinitionRpcs<Module["default"]>>,
): Entry<DefinitionRpcs<Module["default"]>, DefinitionKeys<Module["default"]>>;
```

#### `Utility.Entry`

See `Worker.Entry`: `string` leaves spawn bindings unchecked, a narrower type checks them.

```ts
interface Entry<Rpcs extends Rpc.Any, Keys extends string = string> {
  readonly url: URL;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly bindings: readonly Declaration<Keys>[];
}
```

#### `Utility.Handle`

```ts
interface Handle<Rpcs extends Rpc.Any> extends Owner<Rpcs> {
  readonly processId: number;
  readonly shutdown: Effect.Effect<void, SewedError, MainContext>;
  readonly terminate: Effect.Effect<void, SewedError, MainContext>;
  readonly awaitExit: Effect.Effect<number, never, MainContext>;
}
```

#### `Utility.spawn`

```ts
const spawn: <Rpcs extends Rpc.Any, Keys extends string, const B extends readonly Bound<Keys>[] = []>(entry: Entry<Rpcs, Keys> & Complete<Keys, B>, options?: {
    readonly bindings: B;
}) => Effect.Effect<Handle<Rpcs>, SewedError, MainContext | Scope.Scope>;
```

### `View`

#### `View.Attachable`

Any Sewed view handle; windows and container views attach these.

```ts
interface Attachable {
  readonly [viewIdentity]: true;
  readonly id: string;
}
```

#### `View.Attachment`

```ts
interface Attachment {
  /** `getBounds`/`getVisible` answer synchronously (`.artifacts/probe-wave-5/raise.mjs`), so this
   * is a fresh read, not a cached one — the same shape `internal/Window.ts`'s own `current` reads
   * through `readState`. */
  readonly current: Effect.Effect<AttachmentSnapshot, SewedError, MainContext>;
  readonly setBounds: (bounds: Bounds) => Effect.Effect<void, SewedError, MainContext>;
  readonly setVisible: (visible: boolean) => Effect.Effect<void, SewedError, MainContext>;
  /** The view's bounds each time they change, whoever changed them. */
  readonly boundsChanges: Stream.Stream<Bounds, SewedError, MainContext>;
  /** Blurs what is behind the view by a radius in pixels; zero removes the blur. */
  readonly setBackgroundBlur: (radius: number) => Effect.Effect<void, SewedError, MainContext>;
  /**
   * Draws this attachment above its siblings. `.artifacts/probe-wave-5/children-order.mjs` proves
   * a repeated `addChildView` on an already-attached view reorders it to the topmost position —
   * Electron's own doc comment on the method says as much — so this is the one native call, not a
   * remove-then-add: an index would lie the moment another attachment moves, and this can't.
   */
  readonly raise: Effect.Effect<void, SewedError, MainContext>;
  readonly detach: Effect.Effect<void, SewedError, MainContext>;
}
```

#### `View.AttachmentSnapshot`

One-shot: `attachment.current`'s own answer, read fresh from the native view at the callback.

```ts
interface AttachmentSnapshot {
  readonly bounds: Bounds;
  readonly visible: boolean;
}
```

#### `View.AttachOptions`

```ts
interface AttachOptions {
  readonly bounds: Bounds;
  readonly visible?: boolean;
}
```

#### `View.Handle`

A container view: it attaches child views and is itself attachable.

```ts
interface Handle extends Attachable {
  readonly attach: (
    view: Attachable,
    options: AttachOptions,
  ) => Effect.Effect<Attachment, SewedError, MainContext | Scope.Scope>;
  readonly setBackgroundColor: (color: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly setBorderRadius: (radius: number) => Effect.Effect<void, SewedError, MainContext>;
  readonly setVisible: (visible: boolean) => Effect.Effect<void, SewedError, MainContext>;
  readonly close: Effect.Effect<void, never, MainContext>;
  readonly awaitClosed: Effect.Effect<void, never, MainContext>;
}
```

#### `View.make`

Constructs the native view — the one step `internal/View.ts` stays free of — then builds the handle over it.

```ts
const make: (options?: Native.Options) => Effect.Effect<Native.Handle, SewedError, MainContext | Scope.Scope>;
```

#### `View.Options`

```ts
interface Options {
  readonly backgroundColor?: string;
  readonly borderRadius?: number;
  readonly visible?: boolean;
}
```

### `WebContentsView`

#### `WebContentsView.Handle`

```ts
interface Handle extends Attachable {
  readonly webContents: Contents;
  readonly close: Effect.Effect<void, SewedError, MainContext>;
  readonly awaitClosed: Effect.Effect<void, never, MainContext>;
}
```

#### `WebContentsView.make`

```ts
const make: typeof Native.make;
```

#### `WebContentsView.Options`

```ts
interface Options {
  readonly session?: Session.Handle;
  /** Whether Chromium throttles timers and animations while the view is hidden or occluded. */
  readonly backgroundThrottling?: boolean;
}
```

### `WindowControls`

#### `WindowControls.AlwaysOnTopLevel`

```ts
const AlwaysOnTopLevel: Schema.Literals<readonly ["normal", "floating", "torn-off-menu", "modal-panel", "main-menu", "status", "pop-up-menu", "screen-saver"]>;
type AlwaysOnTopLevel = typeof AlwaysOnTopLevel.Type;
```

#### `WindowControls.Bounds`

```ts
const Bounds: Schema.Struct<{
    readonly x: Schema.Finite;
    readonly y: Schema.Finite;
    readonly width: Schema.Finite;
    readonly height: Schema.Finite;
}>;
type Bounds = typeof Bounds.Type;
```

#### `WindowControls.BoundsUpdate`

```ts
const BoundsUpdate: Schema.Struct<{
    readonly x: Schema.optionalKey<Schema.Finite>;
    readonly y: Schema.optionalKey<Schema.Finite>;
    readonly width: Schema.optionalKey<Schema.Finite>;
    readonly height: Schema.optionalKey<Schema.Finite>;
}>;
type BoundsUpdate = typeof BoundsUpdate.Type;
```

#### `WindowControls.capability`

One window's controls as one capability. Unlike the ambient surfaces, this one belongs to an
owner: `WindowControls.native(window)` in `sewed/main` carries the window it was built for, so
every operation reaches that window and no other. `Capability.client` reaches it from a
document, and serving it twice for two windows gives two owners over this one protocol.

```ts
const capability: Capability.Capability<Rpc.Rpc<"audio", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly muted: Schema.Boolean;
    readonly audible: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"back", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"changes", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly bounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly normalBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    /** The content area, excluding the frame; attached views are positioned within it. */
    readonly contentBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly visible: Schema.Boolean;
    readonly focused: Schema.Boolean;
    readonly minimized: Schema.Boolean;
    readonly maximized: Schema.Boolean;
    readonly fullScreen: Schema.Boolean;
    /**
     * macOS's pre-Lion fullscreen: it does not create a Space, which is why a window minimizing to
     * the tray leaves it first. Probed on Linux: `setSimpleFullScreen` is honoured there too — both
     * this and `fullScreen` answer true afterwards — so the field is not macOS-only, even though its
     * distinct behavior (no Space) is.
     */
    readonly simpleFullScreen: Schema.Boolean;
    readonly title: Schema.String;
    readonly alwaysOnTop: Schema.Boolean;
    readonly opacity: Schema.Finite;
    readonly resizable: Schema.Boolean;
    readonly movable: Schema.Boolean;
    readonly minimizable: Schema.Boolean;
    readonly maximizable: Schema.Boolean;
    readonly closable: Schema.Boolean;
    readonly fullScreenable: Schema.Boolean;
    readonly menuBarVisible: Schema.Boolean;
    readonly kiosk: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"close", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"find", Schema.Struct<{
    text: Schema.String;
    options: Schema.optionalKey<Schema.Struct<{
        readonly forward: Schema.optionalKey<Schema.Boolean>;
        readonly matchCase: Schema.optionalKey<Schema.Boolean>;
    }>>;
}>, RpcSchema.Stream<Schema.Struct<{
    readonly activeMatchOrdinal: Schema.Int;
    readonly matches: Schema.Int;
    readonly selectionArea: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly finalUpdate: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"findNext", Schema.Struct<{
    forward: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"flash", Schema.Struct<{
    flash: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"forward", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"hide", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"history", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly index: Schema.Int;
    readonly entries: Schema.$Array<Schema.Struct<{
        readonly url: Schema.String;
        readonly title: Schema.String;
    }>>;
    readonly canGoBack: Schema.Boolean;
    readonly canGoForward: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"maximize", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"minimize", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"restore", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setAlwaysOnTop", Schema.Struct<{
    alwaysOnTop: Schema.Boolean;
    level: Schema.optionalKey<Schema.Literals<readonly ["normal", "floating", "torn-off-menu", "modal-panel", "main-menu", "status", "pop-up-menu", "screen-saver"]>>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setAudioMuted", Schema.Struct<{
    muted: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setBounds", Schema.Struct<{
    readonly x: Schema.optionalKey<Schema.Finite>;
    readonly y: Schema.optionalKey<Schema.Finite>;
    readonly width: Schema.optionalKey<Schema.Finite>;
    readonly height: Schema.optionalKey<Schema.Finite>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setFullScreen", Schema.Struct<{
    fullScreen: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setOpacity", Schema.Struct<{
    opacity: Schema.Finite;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setProgress", Schema.Struct<{
    progress: Schema.Finite;
    mode: Schema.optionalKey<Schema.Literals<readonly ["none", "normal", "indeterminate", "error", "paused"]>>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setSimpleFullScreen", Schema.Struct<{
    simpleFullScreen: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setTitle", Schema.Struct<{
    title: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setZoom", Schema.Struct<{
    factor: Schema.Finite;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"show", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"showInactive", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"state", Schema.Void, Schema.Struct<{
    readonly bounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly normalBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    /** The content area, excluding the frame; attached views are positioned within it. */
    readonly contentBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly visible: Schema.Boolean;
    readonly focused: Schema.Boolean;
    readonly minimized: Schema.Boolean;
    readonly maximized: Schema.Boolean;
    readonly fullScreen: Schema.Boolean;
    /**
     * macOS's pre-Lion fullscreen: it does not create a Space, which is why a window minimizing to
     * the tray leaves it first. Probed on Linux: `setSimpleFullScreen` is honoured there too — both
     * this and `fullScreen` answer true afterwards — so the field is not macOS-only, even though its
     * distinct behavior (no Space) is.
     */
    readonly simpleFullScreen: Schema.Boolean;
    readonly title: Schema.String;
    readonly alwaysOnTop: Schema.Boolean;
    readonly opacity: Schema.Finite;
    readonly resizable: Schema.Boolean;
    readonly movable: Schema.Boolean;
    readonly minimizable: Schema.Boolean;
    readonly maximizable: Schema.Boolean;
    readonly closable: Schema.Boolean;
    readonly fullScreenable: Schema.Boolean;
    readonly menuBarVisible: Schema.Boolean;
    readonly kiosk: Schema.Boolean;
}>, typeof SewedError, never, never> | Rpc.Rpc<"stopFind", Schema.Struct<{
    action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"zoom", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly factor: Schema.Finite;
}>, typeof SewedError>, Schema.Never, never, never>, "sewed/binding/window-controls">;
```

#### `WindowControls.Contents`

The page half of a window's protocol: presentation and navigation over the window's web
contents. A `BrowserWindow` handle's `webContents` is one; a bare `BaseWindow` has none.

```ts
interface Contents<R> {
  readonly zoom: Stream.Stream<WebContents.Zoom, SewedError, R>;
  readonly setZoom: (factor: number) => Effect.Effect<void, SewedError, R>;
  readonly audio: Stream.Stream<WebContents.Audio, SewedError, R>;
  readonly setAudioMuted: (muted: boolean) => Effect.Effect<void, SewedError, R>;
  readonly history: Stream.Stream<WebContents.History, SewedError, R>;
  readonly back: Effect.Effect<WebContents.Settled, SewedError, R>;
  readonly forward: Effect.Effect<WebContents.Settled, SewedError, R>;
  readonly find: (
    text: string,
    options?: WebContents.FindOptions,
  ) => Effect.Effect<WebContents.Search, SewedError, R | Scope.Scope>;
  readonly findNext: (forward?: boolean) => Effect.Effect<void, SewedError, R>;
  readonly stopFind: (action?: WebContents.FindStop) => Effect.Effect<void, SewedError, R>;
}
```

#### `WindowControls.Core`

The window a capability is served for. `native` takes an acquired window handle, which is one
of these; a test supplies its own. `R` is whatever that window requires, so the rules above it
stay free of any runtime requirement of their own.

```ts
interface Core<R> {
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
```

#### `WindowControls.native`

One window's controls for main. Unlike the ambient surfaces, this one is scoped to an owner, so
the Layer threads an acquired window rather than a plain options bag: it resolves that window's
page while the Layer builds, and every call after that reaches exactly that window. The window
lives in this Layer, not in a separate host, so `Capability.serve(WindowControls.capability)`
gives a document exactly the window a main-side call drives.

```ts
const native: (window: Core<MainContext>) => Layer.Layer<typeof WindowControls.capability, SewedError, MainContext>;
```

#### `WindowControls.Opacity`

```ts
const Opacity: Schema.Finite;
```

#### `WindowControls.operations`

Resolves the window's page once, while the Layer builds, so every later call reads a decision
already made. A window without web contents answers each page operation with `Protocol`, and a
streaming one answers on its own stream: a caller sees the failure where it subscribed rather
than as a value thrown past the stream it asked for.

```ts
const operations: <R>(window: Core<R>) => Effect.Effect<Operations<R>, SewedError>;
```

#### `WindowControls.Operations`

The operations a window's capability serves: the window's own commands, and the page operations
a window may not have. One declaration over `Core` and `Contents`, so the two cannot drift.

```ts
type Operations<R> = Omit<Core<R>, "webContents"> & Contents<R>;
```

#### `WindowControls.Progress`

Taskbar progress from 0 to 1; a negative value removes the indicator.

```ts
const Progress: Schema.Finite;
```

#### `WindowControls.ProgressMode`

```ts
const ProgressMode: Schema.Literals<readonly ["none", "normal", "indeterminate", "error", "paused"]>;
type ProgressMode = typeof ProgressMode.Type;
```

#### `WindowControls.protocol`

```ts
const protocol: RpcGroup.RpcGroup<Rpc.Rpc<"audio", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly muted: Schema.Boolean;
    readonly audible: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"back", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"changes", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly bounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly normalBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    /** The content area, excluding the frame; attached views are positioned within it. */
    readonly contentBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly visible: Schema.Boolean;
    readonly focused: Schema.Boolean;
    readonly minimized: Schema.Boolean;
    readonly maximized: Schema.Boolean;
    readonly fullScreen: Schema.Boolean;
    /**
     * macOS's pre-Lion fullscreen: it does not create a Space, which is why a window minimizing to
     * the tray leaves it first. Probed on Linux: `setSimpleFullScreen` is honoured there too — both
     * this and `fullScreen` answer true afterwards — so the field is not macOS-only, even though its
     * distinct behavior (no Space) is.
     */
    readonly simpleFullScreen: Schema.Boolean;
    readonly title: Schema.String;
    readonly alwaysOnTop: Schema.Boolean;
    readonly opacity: Schema.Finite;
    readonly resizable: Schema.Boolean;
    readonly movable: Schema.Boolean;
    readonly minimizable: Schema.Boolean;
    readonly maximizable: Schema.Boolean;
    readonly closable: Schema.Boolean;
    readonly fullScreenable: Schema.Boolean;
    readonly menuBarVisible: Schema.Boolean;
    readonly kiosk: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"close", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"find", Schema.Struct<{
    text: Schema.String;
    options: Schema.optionalKey<Schema.Struct<{
        readonly forward: Schema.optionalKey<Schema.Boolean>;
        readonly matchCase: Schema.optionalKey<Schema.Boolean>;
    }>>;
}>, RpcSchema.Stream<Schema.Struct<{
    readonly activeMatchOrdinal: Schema.Int;
    readonly matches: Schema.Int;
    readonly selectionArea: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly finalUpdate: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"findNext", Schema.Struct<{
    forward: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"flash", Schema.Struct<{
    flash: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"forward", Schema.Void, Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"ready">;
    readonly url: Schema.String;
    readonly processId: Schema.Finite;
    readonly httpStatus: Schema.Finite;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"failed">;
    readonly url: Schema.String;
    readonly code: Schema.Finite;
    readonly description: Schema.String;
}>]>, typeof SewedError, never, never> | Rpc.Rpc<"hide", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"history", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly index: Schema.Int;
    readonly entries: Schema.$Array<Schema.Struct<{
        readonly url: Schema.String;
        readonly title: Schema.String;
    }>>;
    readonly canGoBack: Schema.Boolean;
    readonly canGoForward: Schema.Boolean;
}>, typeof SewedError>, Schema.Never, never, never> | Rpc.Rpc<"maximize", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"minimize", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"restore", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setAlwaysOnTop", Schema.Struct<{
    alwaysOnTop: Schema.Boolean;
    level: Schema.optionalKey<Schema.Literals<readonly ["normal", "floating", "torn-off-menu", "modal-panel", "main-menu", "status", "pop-up-menu", "screen-saver"]>>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setAudioMuted", Schema.Struct<{
    muted: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setBounds", Schema.Struct<{
    readonly x: Schema.optionalKey<Schema.Finite>;
    readonly y: Schema.optionalKey<Schema.Finite>;
    readonly width: Schema.optionalKey<Schema.Finite>;
    readonly height: Schema.optionalKey<Schema.Finite>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setFullScreen", Schema.Struct<{
    fullScreen: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setOpacity", Schema.Struct<{
    opacity: Schema.Finite;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setProgress", Schema.Struct<{
    progress: Schema.Finite;
    mode: Schema.optionalKey<Schema.Literals<readonly ["none", "normal", "indeterminate", "error", "paused"]>>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setSimpleFullScreen", Schema.Struct<{
    simpleFullScreen: Schema.Boolean;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setTitle", Schema.Struct<{
    title: Schema.String;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"setZoom", Schema.Struct<{
    factor: Schema.Finite;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"show", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"showInactive", Schema.Void, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"state", Schema.Void, Schema.Struct<{
    readonly bounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly normalBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    /** The content area, excluding the frame; attached views are positioned within it. */
    readonly contentBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly visible: Schema.Boolean;
    readonly focused: Schema.Boolean;
    readonly minimized: Schema.Boolean;
    readonly maximized: Schema.Boolean;
    readonly fullScreen: Schema.Boolean;
    /**
     * macOS's pre-Lion fullscreen: it does not create a Space, which is why a window minimizing to
     * the tray leaves it first. Probed on Linux: `setSimpleFullScreen` is honoured there too — both
     * this and `fullScreen` answer true afterwards — so the field is not macOS-only, even though its
     * distinct behavior (no Space) is.
     */
    readonly simpleFullScreen: Schema.Boolean;
    readonly title: Schema.String;
    readonly alwaysOnTop: Schema.Boolean;
    readonly opacity: Schema.Finite;
    readonly resizable: Schema.Boolean;
    readonly movable: Schema.Boolean;
    readonly minimizable: Schema.Boolean;
    readonly maximizable: Schema.Boolean;
    readonly closable: Schema.Boolean;
    readonly fullScreenable: Schema.Boolean;
    readonly menuBarVisible: Schema.Boolean;
    readonly kiosk: Schema.Boolean;
}>, typeof SewedError, never, never> | Rpc.Rpc<"stopFind", Schema.Struct<{
    action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
}>, Schema.Void, typeof SewedError, never, never> | Rpc.Rpc<"zoom", Schema.Void, RpcSchema.Stream<Schema.Struct<{
    readonly factor: Schema.Finite;
}>, typeof SewedError>, Schema.Never, never, never>>;
```

#### `WindowControls.State`

```ts
const State: Schema.Struct<{
    readonly bounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly normalBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    /** The content area, excluding the frame; attached views are positioned within it. */
    readonly contentBounds: Schema.Struct<{
        readonly x: Schema.Finite;
        readonly y: Schema.Finite;
        readonly width: Schema.Finite;
        readonly height: Schema.Finite;
    }>;
    readonly visible: Schema.Boolean;
    readonly focused: Schema.Boolean;
    readonly minimized: Schema.Boolean;
    readonly maximized: Schema.Boolean;
    readonly fullScreen: Schema.Boolean;
    /**
     * macOS's pre-Lion fullscreen: it does not create a Space, which is why a window minimizing to
     * the tray leaves it first. Probed on Linux: `setSimpleFullScreen` is honoured there too — both
     * this and `fullScreen` answer true afterwards — so the field is not macOS-only, even though its
     * distinct behavior (no Space) is.
     */
    readonly simpleFullScreen: Schema.Boolean;
    readonly title: Schema.String;
    readonly alwaysOnTop: Schema.Boolean;
    readonly opacity: Schema.Finite;
    readonly resizable: Schema.Boolean;
    readonly movable: Schema.Boolean;
    readonly minimizable: Schema.Boolean;
    readonly maximizable: Schema.Boolean;
    readonly closable: Schema.Boolean;
    readonly fullScreenable: Schema.Boolean;
    readonly menuBarVisible: Schema.Boolean;
    readonly kiosk: Schema.Boolean;
}>;
type State = typeof State.Type;
```

### `Worker`

#### `Worker.Definition`

```ts
interface Definition<Rpcs extends Rpc.Any, Keys extends string = never> {
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly [definitionType]: {
    readonly rpcs: (rpc: Rpcs) => Rpcs;
    readonly keys: Keys;
  };
}
```

#### `Worker.entry`

Types the entry from the worker module without importing it into main.

```ts
function entry<Rpcs extends Rpc.Any>(
  url: URL,
  protocol: RpcGroup.RpcGroup<Rpcs>,
): Entry<Rpcs, string>;
function entry<Rpcs extends Rpc.Any, Keys extends string>(
  url: URL,
  protocol: RpcGroup.RpcGroup<Rpcs>,
  options: {
    readonly bindings: readonly Declaration<Keys>[];
  },
): Entry<Rpcs, Keys>;
function entry<
  Module extends {
    readonly default: unknown;
  },
>(
  url: URL,
  protocol: RpcGroup.RpcGroup<DefinitionRpcs<Module["default"]>>,
): Entry<DefinitionRpcs<Module["default"]>, DefinitionKeys<Module["default"]>>;
```

#### `Worker.Entry`

The entry's declared dependency keys. `string` leaves the spawn bindings unchecked; a
definition-typed or declaration-typed entry narrows them to the exact dependency set.

```ts
interface Entry<Rpcs extends Rpc.Any, Keys extends string = string> {
  readonly url: URL;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly bindings: readonly Declaration<Keys>[];
}
```

#### `Worker.Handle`

```ts
interface Handle<Rpcs extends Rpc.Any> extends Owner<Rpcs> {
  readonly shutdown: Effect.Effect<void, never, MainContext>;
  readonly terminate: Effect.Effect<void, never, MainContext>;
  readonly awaitExit: Effect.Effect<number, never, MainContext>;
}
```

#### `Worker.spawn`

```ts
const spawn: <Rpcs extends Rpc.Any, Keys extends string, const B extends readonly Bound<Keys>[] = []>(entry: Entry<Rpcs, Keys> & Complete<Keys, B>, options?: {
    readonly bindings: B;
}) => Effect.Effect<Handle<Rpcs>, SewedError, MainContext | Scope.Scope>;
```

## `sewed/worker`

### `define`

```ts
function define<Rpcs extends Rpc.Any, E>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  handlers: HandlerLayer<Rpcs, E, WorkerContext>,
): Definition<Rpcs, never>;
function define<Rpcs extends Rpc.Any, E, Keys extends string>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  handlers: HandlerLayer<Rpcs, E, WorkerContext | ClientContext>,
  options: {
    readonly bindings: readonly Declaration<Keys>[];
  },
): Definition<Rpcs, Keys>;
```

### `Definition`

```ts
interface Definition<Rpcs extends Rpc.Any, Keys extends string = never> {
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly [definitionType]: {
    readonly rpcs: (rpc: Rpcs) => Rpcs;
    readonly keys: Keys;
  };
}
```

### `entry`

Types the entry from the worker module without importing it into main.

```ts
function entry<Rpcs extends Rpc.Any>(
  url: URL,
  protocol: RpcGroup.RpcGroup<Rpcs>,
): Entry<Rpcs, string>;
function entry<Rpcs extends Rpc.Any, Keys extends string>(
  url: URL,
  protocol: RpcGroup.RpcGroup<Rpcs>,
  options: {
    readonly bindings: readonly Declaration<Keys>[];
  },
): Entry<Rpcs, Keys>;
function entry<
  Module extends {
    readonly default: unknown;
  },
>(
  url: URL,
  protocol: RpcGroup.RpcGroup<DefinitionRpcs<Module["default"]>>,
): Entry<DefinitionRpcs<Module["default"]>, DefinitionKeys<Module["default"]>>;
```

### `Entry`

The entry's declared dependency keys. `string` leaves the spawn bindings unchecked; a
definition-typed or declaration-typed entry narrows them to the exact dependency set.

```ts
interface Entry<Rpcs extends Rpc.Any, Keys extends string = string> {
  readonly url: URL;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly bindings: readonly Declaration<Keys>[];
}
```

### `threadId`

```ts
const threadId: Effect.Effect<number, never, WorkerContext>;
```

## `sewed/utility`

### `define`

```ts
function define<Rpcs extends Rpc.Any, E>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  handlers: HandlerLayer<Rpcs, E, UtilityContext>,
): Definition<Rpcs, never>;
function define<Rpcs extends Rpc.Any, E, Keys extends string>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  handlers: HandlerLayer<Rpcs, E, UtilityContext | ClientContext>,
  options: {
    readonly bindings: readonly Declaration<Keys>[];
  },
): Definition<Rpcs, Keys>;
```

### `Definition`

```ts
interface Definition<Rpcs extends Rpc.Any, Keys extends string = never> {
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly [definitionType]: {
    readonly rpcs: (rpc: Rpcs) => Rpcs;
    readonly keys: Keys;
  };
}
```

### `entry`

Types the entry from the utility module without importing it into main.

```ts
function entry<Rpcs extends Rpc.Any>(
  url: URL,
  protocol: RpcGroup.RpcGroup<Rpcs>,
): Entry<Rpcs, string>;
function entry<Rpcs extends Rpc.Any, Keys extends string>(
  url: URL,
  protocol: RpcGroup.RpcGroup<Rpcs>,
  options: {
    readonly bindings: readonly Declaration<Keys>[];
  },
): Entry<Rpcs, Keys>;
function entry<
  Module extends {
    readonly default: unknown;
  },
>(
  url: URL,
  protocol: RpcGroup.RpcGroup<DefinitionRpcs<Module["default"]>>,
): Entry<DefinitionRpcs<Module["default"]>, DefinitionKeys<Module["default"]>>;
```

### `Entry`

See `Worker.Entry`: `string` leaves spawn bindings unchecked, a narrower type checks them.

```ts
interface Entry<Rpcs extends Rpc.Any, Keys extends string = string> {
  readonly url: URL;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly bindings: readonly Declaration<Keys>[];
}
```

### `processId`

```ts
const processId: Effect.Effect<number, never, UtilityContext>;
```

## `sewed/testing`

### `Call`

One operation a memory capability was asked for, in the order the calls were made.

```ts
interface Call {
  readonly tag: string;
  readonly payload: unknown;
}
```

### `client`

Serves a capability over the real wire for a test: the capability's client Layer over an
in-process host of `handlers`. This is the composition that proves a host's own values encode;
`Capability.fromHandlers` dispatches in process and proves behaviour only.

```ts
const client: <Rpcs extends Rpc.Any, Key extends string, E, R>(capability: Capability.Capability<Rpcs, Key>, handlers: Capability.Handlers<Rpcs, E, R>, options?: Options) => Layer.Layer<Capability.Capability<Rpcs, Key>, E | SewedError, R>;
```

### `Clipboard`

#### `Clipboard.memory`

The clipboard capability for tests: the same policy `Clipboard.native` carries, no Electron, and
a recorder listing the calls. An invalid policy still fails as the Layer builds.

```ts
const memory: (policy: Clipboard.Policy) => Layer.Layer<typeof Clipboard.capability | CapabilityMemory.Recorder, SewedError>;
```

### `contents`

The stand-in for a web contents, which is the one owner kind with no posture-free form: a
window's own contents falls back to `prompt` for a download and a guest's to `deny`, and a guest
built with `input: "block"` blocks input until a decider allows it. Saying whose contents this
stands for is therefore not a convenience — a decider that passes on a miss answers the fallback,
so a download test written against the wrong posture asserts the wrong thing while looking right.

The two postures are not restated here: this calls `ContentsPosture.rendererFallbacks()` and
`ContentsPosture.guestFallbacks(input)`, the same two functions `internal/WebContents.ts` and
`internal/GuestView.ts` call at their own construction sites, so changing either moves the
stand-in with it rather than leaving a copy behind.

```ts
const contents: (of: {
    readonly of: "window";
} | {
    readonly of: "guest";
    readonly input?: InputPolicy;
}) => DecisionOwner<"contents">;
```

### `Cookies`

#### `Cookies.memory`

The cookie capability for tests: the same policy `Cookies.native` carries, no session and no
Electron, and a recorder listing the calls. An invalid policy still fails as the Layer builds.

```ts
const memory: (policy: Cookie.Policy) => Layer.Layer<typeof Cookie.capability | CapabilityMemory.Recorder, SewedError>;
```

### `DecisionOwner`

A stand-in for one owner: the scoped install a real owner publishes ({@link Decision.Owner}) and
the resolution a native callback performs, over the production decision registry, with no
Electron.

A stand-in carries the posture of the owner it names, and exactly the doors its production owner
has. That is what {@link contents} exists for: both real web contents build their registry with a
construction-time fallback of their own, and a decider that passes on a miss — the spelling the
guides teach — delegates to exactly that fallback, so a test's assertion _is_ the fallback's. The
application, a window and a session build a bare registry in production, so for those three the
decidable's own catalog fallback is faithful and {@link owner} is the whole stand-in.

Neither `intercept` nor `resolveChain` is here. The first is the session's request-stage door and
the second folds a `chain` decidable, and both chain decidables in the catalog are request stages,
so on any other owner each would be a member nothing fits. They live on {@link RequestsOwner}
alone, and a later wave that gives another owner a chain decidable is what would move
`resolveChain` back.

```ts
interface DecisionOwner<O extends Decision.OwnerKind> extends Decision.Owner<O> {
  /** What the real owner would answer for `event`, given the deciders installed on this stand-in. */
  readonly resolve: <Event, Answer, Timing extends "sync" | "async">(
    decidable: Decision.Decidable<Event, Answer, Timing, "first" | "restrictive", O>,
    event: NoInfer<Event>,
  ) => Effect.Effect<Answer>;
}
```

### `host`

```ts
const host: <Rpcs extends Rpc.Any, E, R>(protocol: RpcGroup.RpcGroup<Rpcs>, handlers: HandlerLayer<Rpcs, E, R>) => Effect.Effect<Binding.Owner<Rpcs>, E, R | MainContext | Scope.Scope>;
```

### `layer`

```ts
const layer: <Rpcs extends Rpc.Any, E, R>(slot: Slot<Rpcs>, handlers: Capability.Handlers<Rpcs, E, R>, options?: Options) => Layer.Layer<ClientContext, E | SewedError, R>;
```

### `main`

```ts
const main: Layer.Layer<MainContext, never, never>;
```

### `memory`

The in-memory Layer for a capability: the same dispatch the native Layer uses, over handlers a
test supplies, with every call recorded when it runs. The recorder observes the operation the
caller asked for, before the handler decides it, so a denial is recorded exactly like a call
that succeeds. The record happens inside the returned Effect or Stream rather than when the
operation is merely built, so building a call without running it records nothing, and running
a built call twice records it twice.

```ts
const memory: <Rpcs extends Rpc.Any, Key extends string, E, R>(capability: Capability<Rpcs, Key>, handlers: HandlerLayer<Rpcs, E, R>) => Layer.Layer<Capability<Rpcs, Key> | Recorder, E, R>;
```

### `NativeTheme`

#### `NativeTheme.memory`

The theme capability for tests: the same options `NativeTheme.native` carries, no Electron, and
a recorder listing the calls. Invalid options still fail as the Layer builds.

```ts
const memory: (options?: NativeTheme.Options) => Layer.Layer<typeof NativeTheme.capability | CapabilityMemory.Recorder, SewedError>;
```

### `Notification`

#### `Notification.memory`

The notification capability for tests: the same options check `Notification.native` carries, no
Electron, and a recorder listing the calls.

```ts
const memory: () => Layer.Layer<typeof Notification.capability | CapabilityMemory.Recorder, SewedError>;
```

### `Options`

What {@link layer} and {@link client} take beside the handlers. `onConnect` runs as each
connection opens. `tamper` is a test door only: it corrupts the messages it selects so that a
test can make one call fail as an undecodable message does, with no hand-built transport.

```ts
interface Options {
  readonly onConnect?: () => void;
  readonly tamper?: Tamper;
}
```

### `owner`

An owner stand-in for `kind`, to exercise a decider with no Electron and no native object.

Nothing here is a fake. The registry, the scoped install, the composition, the decode of every
answer, the declared `failure` a broken decider contributes, and the removal a closing scope
performs are the production ones, so a feature is tested exactly as it is used: write it against
the minimal interface — `(window: Decision.Owner<"window">) => window.decide(…)` — and a real
window and `Testing.owner("window")` are interchangeable at that signature. The application's own
door is a free function rather than a handle, so a feature written against
`Decision.Owner<"app">` is handed `{ decide: App.decide }` in production and this stand-in in a
test.

These three kinds and no more: their real owners build a bare registry, so the decidable's own
catalog fallback is what they answer with nobody installed. A web contents does not — see
{@link contents} — and a session's request stages have a different door — see {@link requests}.

The one thing a stand-in adds is a way to ask what the owner would answer, which in production is
a native callback's job. `resolve` is that, and it is all of it here: every decidable these three
kinds own ranks its answers rather than folding them.

Each of the three constructors builds a fresh registry on every call, so the deciders one test
installs are invisible to every other test and there is nothing to reset between them. A stand-in
has no closed state, so an install never fails the way a closed window's does.

```ts
const owner: <O extends Exclude<Decision.OwnerKind, "contents" | "requests">>(kind: O) => DecisionOwner<O>;
```

### `PowerMonitor`

#### `PowerMonitor.memory`

The power capability for tests: the same threshold check `PowerMonitor.native` carries, no
Electron, and a recorder listing the calls.

```ts
const memory: () => Layer.Layer<typeof PowerMonitor.capability | CapabilityMemory.Recorder, SewedError>;
```

### `Recorder`

What a memory capability recorded. `calls` is a snapshot, so a test can read it repeatedly.

```ts
class Recorder extends Recorder_base {}
```

### `renderer`

```ts
const renderer: Layer.Layer<RendererContext, never, never>;
```

### `requests`

The stand-in for a session's three request stages. `intercept` is its only install door, as it is
a real session's, and it applies a feature's filter with the same code that door does — the stage
lookup, the filter decode, the refusal of a `body` option on a stage that carries none, and the
wrapper that answers `Decision.Pass` for a request the filter does not select. Upload assembly is
the one part that stays native, so a test event carries the `body` it wants its decider to see.

`resolve` answers `Session.Request`, which ranks; `resolveChain` folds the two header stages.
`observe`/`emit` are the third door, the observation stages deciders never see: `taps` is this
stand-in's own version of `internal/WebRequest.ts`'s `wiring.taps` — one entry per open `observe`
stream, each with its own compiled filter — and `emit` is this stand-in's own `dispatch`, offering
one event to every tap whose filter selects it, synchronously, with no Electron underneath either.

```ts
const requests: () => RequestsOwner;
```

### `RequestsOwner`

The stand-in for a session's three request stages, and the one that is not a
{@link DecisionOwner}: in production the `"requests"` kind has exactly one install door,
`session.intercept`, and `session.decide` refuses a request stage at compile time and at run time.
So this publishes {@link Decision.Requests} and no `decide` — a stage decider installed without a
filter is a shape production cannot produce, and a test that wants every request says so with
`{ urls: ["<all_urls>"] }`.

It carries both resolutions because its three decidables need both: `Session.Request` ranks its
answers and the two header stages fold theirs.

```ts
interface RequestsOwner extends Decision.Requests {
  /** What the session would answer for `event`, given the deciders installed on this stand-in. */
  readonly resolve: <Event, Answer>(
    decidable: Decision.Decidable<Event, Answer, "async", "first" | "restrictive", "requests">,
    event: NoInfer<Event>,
  ) => Effect.Effect<Answer>;
  /** The same, for a chain decidable: the stopping answer, or the event every decider folded into. */
  readonly resolveChain: <Event, Answer>(
    decidable: Decision.Decidable<Event, Answer, "async", "chain", "requests">,
    event: NoInfer<Event>,
  ) => Effect.Effect<Decision.ChainOutcome<Event, Answer>>;
  /**
   * Subscribes to what {@link emit} pushes, selected by the same filter vocabulary and the same
   * selection `session.requests` applies — `urls` match patterns, an optional `types` list — over
   * the production `WebRequest.Event` schema (`sent | response | redirect | completed | error`).
   * A decider a test installs through `intercept` never sees these: this is the stand-in for the
   * stages deciders never see either, the same split a real session draws between `decide`/
   * `intercept` and `requests`.
   *
   * Unlike a plain `Stream`-returning subscription, this Effect has already registered its tap —
   * subscribed — by the time it succeeds: the very next synchronous {@link emit} is never lost to
   * the asynchronous-registration race a native tap's own subscription has too, so a caller never
   * needs a retry loop or a clock advance to "wait until subscribed." An invalid filter fails this
   * Effect directly rather than the Stream it would have answered. The subscription lives for the
   * `Scope` it acquired against; closing that scope removes its tap, the same way a native one's
   * registration scope closing does.
   */
  readonly observe: (
    filter: WebRequestData.Filter,
  ) => Effect.Effect<
    Stream.Stream<WebRequestData.Event, SewedError>,
    SewedError,
    MainContext | Scope.Scope
  >;
  /**
   * Pushes one event to every still-open {@link observe} stream whose own filter selects it, the
   * way a native request would have reached it. Synchronous and effect-free, so a test calls it
   * plainly: `requests.emit({ stage: "completed", … })`. Throws a `Protocol` `SewedError` for a
   * `url` that does not parse: production silently drops one there (`internal/WebRequest.ts`'s
   * own `dispatch` — a URL Electron itself handed it that failed to parse would say nothing about
   * a bug in this library either), but a test event is typed by the caller alone, so a typo in it
   * has nothing else to answer for — dropping it here would make the typo, not the assertion,
   * decide whether the test passes.
   */
  readonly emit: (event: WebRequestData.Event) => void;
}
```

### `Shell`

#### `Shell.Grants`

The path a scope has admitted, on top of whatever roots `Shell.native` was configured with.
`allow` grants one absolute path — a file, or a directory and everything under it — under the
same containment rule a configured root already uses, for as long as the caller's scope stays
open; closing the scope withdraws it, unless another open scope granted the same path too.

This is a plain, inert service declaration: it carries no Electron and no `node:` import, so it
is fine to declare here alongside {@link capability}, in a module every runtime can import. What
is privileged is a Layer that can ever produce a live instance of it — only `Shell.native` (in
`sewed/main`) and `Testing.Shell.memory` build one, each from the very `operations` call that
checks every shell operation, so a grant is never a second, drifting copy of the containment
rule. `Grants` is a separate service from {@link capability}: `Capability.serve` only ever serves
a capability's own protocol, so a document bound to the shell has no route to widen its own
policy — only main code holding this service can.

```ts
class Grants extends Grants_base {}
```

#### `Shell.memory`

The shell capability for tests, and the scoped grant beside it: the same policy `Shell.native`
carries, no Electron, and a recorder listing the calls. Both services come from the one
`ShellPolicy.operations` call below, so a grant admitted here is honoured by the very operations
a bound test client calls, exactly as it is in production. An invalid policy or a relative root
still fails as the Layer builds.

```ts
const memory: (options: Shell.Options) => Layer.Layer<typeof Shell.capability | Shell.Grants | CapabilityMemory.Recorder, SewedError>;
```

### `Tamper`

Which messages a test corrupts on purpose, by the operation's tag. A corrupted message still
parses and still names its request, so the call fails exactly as a genuinely undecodable one
does and every other call on the connection continues.

```ts
interface Tamper {
  /**
   * Corrupts the answer to each request on an operation this selects, owner to client: its `Exit`,
   * its first stream value, or its first bulk-answer part. The handler ran; the call fails
   * `Protocol` with `reason: "transport/undecodable-answer"`.
   */
  readonly answer?: (tag: string) => boolean;
  /**
   * Corrupts each request on an operation this selects, client to owner, or a bulk request's
   * first part. The handler does not run; the call fails `Protocol` with
   * `reason: "transport/undecodable-request"`.
   */
  readonly request?: (tag: string) => boolean;
}
```

### `Worker`

#### `Worker.Definition`

```ts
interface Definition<Rpcs extends Rpc.Any, Keys extends string = never> {
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly [definitionType]: {
    readonly rpcs: (rpc: Rpcs) => Rpcs;
    readonly keys: Keys;
  };
}
```

#### `Worker.entry`

Types the entry from the worker module without importing it into main.

```ts
function entry<Rpcs extends Rpc.Any>(
  url: URL,
  protocol: RpcGroup.RpcGroup<Rpcs>,
): Entry<Rpcs, string>;
function entry<Rpcs extends Rpc.Any, Keys extends string>(
  url: URL,
  protocol: RpcGroup.RpcGroup<Rpcs>,
  options: {
    readonly bindings: readonly Declaration<Keys>[];
  },
): Entry<Rpcs, Keys>;
function entry<
  Module extends {
    readonly default: unknown;
  },
>(
  url: URL,
  protocol: RpcGroup.RpcGroup<DefinitionRpcs<Module["default"]>>,
): Entry<DefinitionRpcs<Module["default"]>, DefinitionKeys<Module["default"]>>;
```

#### `Worker.Entry`

The entry's declared dependency keys. `string` leaves the spawn bindings unchecked; a
definition-typed or declaration-typed entry narrows them to the exact dependency set.

```ts
interface Entry<Rpcs extends Rpc.Any, Keys extends string = string> {
  readonly url: URL;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly bindings: readonly Declaration<Keys>[];
}
```

#### `Worker.Handle`

```ts
interface Handle<Rpcs extends Rpc.Any> extends Owner<Rpcs> {
  readonly shutdown: Effect.Effect<void, never, MainContext>;
  readonly terminate: Effect.Effect<void, never, MainContext>;
  readonly awaitExit: Effect.Effect<number, never, MainContext>;
}
```

#### `Worker.spawn`

```ts
const spawn: <Rpcs extends Rpc.Any, Keys extends string, const B extends readonly Bound<Keys>[] = []>(entry: Entry<Rpcs, Keys> & Complete<Keys, B>, options?: {
    readonly bindings: B;
}) => Effect.Effect<Handle<Rpcs>, SewedError, MainContext | Scope.Scope>;
```

## `@sewed/react`

### `ActionState`

```ts
type ActionState<A, E> = Action.State<A, E>;
```

### `connect`

```ts
const connect: typeof Connection.connect;
```

### `documentStore`

```ts
const documentStore: typeof Connection.documentStore;
```

### `mount`

```ts
const mount: (container: Element, children: ReactNode) => Effect.Effect<void, never, Action.ActionServices>;
```

### `ResourceServices`

```ts
type ResourceServices = ClientContext | RendererContext;
```

### `ResourceState`

```ts
type ResourceState<A, E> = Resource.State<A, E>;
```

### `RuntimeProvider`

Provides a connected runtime to a React tree the application already owns. `store` is
optional: omitted, this reads `documentStore()` — the store `connect` last registered for this
document, or the static `unavailable` store when nothing has. Every hook memoizes on the store
itself, which is stable across connecting, ready and unavailable, so no hook below this
provider ever remounts as the runtime arrives or goes away.

```ts
const RuntimeProvider: ({ store, children, }: {
    readonly store?: RuntimeStore;
    readonly children?: ReactNode;
}) => react.FunctionComponentElement<react.ProviderProps<Connection.RuntimeStore>>;
```

### `RuntimeState`

```ts
type RuntimeState = Connection.RuntimeState;
```

### `RuntimeStore`

```ts
type RuntimeStore = Connection.RuntimeStore;
```

### `StreamState`

```ts
type StreamState<A, E> = StreamOwner.State<A, E>;
```

### `useAction`

```ts
const useAction: <Args extends readonly unknown[], A, E>(factory: (...args: Args) => Effect.Effect<A, E, Action.ActionServices>, options?: {
    readonly mode?: "latest" | "exhaust";
}) => {
    status: "idle";
    run: (...args: Args) => void;
    cancel: () => void;
} | {
    status: "running";
    run: (...args: Args) => void;
    cancel: () => void;
} | {
    status: "success";
    value: A;
    run: (...args: Args) => void;
    cancel: () => void;
} | {
    status: "failure";
    cause: Cause.Cause<E | sewed.SewedError>;
    run: (...args: Args) => void;
    cancel: () => void;
} | {
    status: "interrupted";
    run: (...args: Args) => void;
    cancel: () => void;
};
```

### `useClient`

```ts
const useClient: <Rpcs extends Rpc.Any>(slot: Binding.Slot<Rpcs>, options?: {
    readonly connection?: Binding.Connection;
}) => Binding.Client<Rpcs>;
```

### `useResource`

```ts
const useResource: <A, E>(factory: () => Effect.Effect<A, E, ResourceServices | Scope.Scope>, dependencies: DependencyList) => ResourceState<A, E> & {
    readonly release: () => void;
    readonly reload: () => void;
};
```

### `useRuntimeStatus`

The state of the runtime this tree was given: always ready under `mount`.

```ts
const useRuntimeStatus: () => RuntimeState;
```

### `useStream`

```ts
const useStream: <A, E>(factory: () => Stream.Stream<A, E, Action.ActionServices>, dependencies: DependencyList) => StreamState<A, E>;
```

## `@sewed/react/testing`

### `store`

A `RuntimeStore` over in-process hosts, for a renderer module's own tests: `bindings` is what
`Binding.to(slot, host)` builds from an owner `Testing.host` (from `sewed/testing`) returns —
the same shape a real `Binding.layer` list takes, over hosts that dispatch in process instead
of across Electron's IPC bridge. There is no handshake to wait for, so the store answers
`ready` at once; `run` and every hook this package exports run over that context exactly as
`connect`'s does. It stands itself in for `documentStore()` while it stays open, so a renderer
module's plain actions — code outside React that reads `documentStore()` directly, the way
`connect`'s own consumer does — reach this store during the test too. `close()` closes the
scope the bindings' own connections live in, publishes `unavailable`, and removes exactly this
store, in any order — so nested or interleaved `store` calls in one test file may close in any
order, and a test can prove a component observes disconnection too. The host's own services
(whatever scope `Testing.host` itself was built in) are the caller's, and are released the same
way any other `Testing.host` use releases them: when that surrounding scope closes.

```ts
const store: (bindings: readonly Binding.Bound[]) => Connection.RuntimeStore;
```

## `@sewed/vite`

### `resolveElectron`

Resolves the Electron binary a launcher spawns: `require("electron")` from `cwd`'s
`package.json` (default: the current working directory), the same resolution the `sewed` Vite
plugin performs for its own development runs. An explicit `electronPath` overrides resolution
entirely and is taken as absolute or resolved against `cwd`. Throws when Electron cannot be
resolved there — install Electron >=41 <45 in the consumer project, or pass `electronPath`. A
Node launcher can import this from `@sewed/vite` without paying for a Vite dependency: the
package's own entry imports `vite` as types only.

```ts
function resolveElectron(options?: {
  readonly cwd?: string;
  readonly electronPath?: string;
}): string;
```

### `sewed`

```ts
function sewed(options: SewedViteOptions): Plugin;
```

### `SewedViteEvent`

```ts
type SewedViteEvent =
  | {
      readonly type: "building";
      readonly generation: number;
    }
  | {
      readonly type: "build-failed";
      readonly generation: number;
      readonly error: string;
    }
  | {
      readonly type: "started";
      readonly generation: number;
      readonly pid: number;
    }
  | {
      readonly type: "stopped";
      readonly generation: number;
      readonly pid: number;
      readonly code: number | null;
      readonly signal: NodeJS.Signals | null;
    };
```

### `SewedViteOptions`

```ts
interface SewedViteOptions {
  readonly main: string;
  readonly tsconfig?: string;
  readonly cwd?: string;
  readonly electronPath?: string;
  readonly electronArgs?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly debounceMs?: number;
  readonly onEvent?: (event: SewedViteEvent) => void;
}
```

## `@sewed/devtools`

### `Handle`

```ts
interface Handle {
  readonly layer: Diagnostics.Collector["layer"];
  readonly snapshot: Effect.Effect<Snapshot>;
}
```

### `Health`

```ts
interface Health {
  readonly runtimes: readonly Diagnostics.RuntimeSample[];
  readonly queues: readonly Diagnostics.QueueSample[];
  readonly dropped: number;
  readonly evicted: number;
  readonly complete: boolean;
}
```

### `layer`

```ts
const layer: (options?: Options & {
    readonly enabled?: boolean;
}) => Layer.Layer<never, SewedError, MainContext>;
```

### `make`

```ts
const make: (options?: Options) => Effect.Effect<Handle, SewedError, MainContext | Scope.Scope>;
```

### `Options`

```ts
interface Options {
  readonly capacity?: number;
}
```

### `Snapshot`

```ts
interface Snapshot {
  readonly capturedAt: number;
  readonly capacity: number;
  readonly diagnostics: Diagnostics.Snapshot;
  readonly spans: readonly Span[];
  readonly evictedSpans: number;
  readonly droppedTraceEvents: number;
  readonly health: Health;
}
```

### `Span`

```ts
interface Span extends Diagnostics.TraceSpan {
  readonly events: readonly Pick<Diagnostics.TraceEvent, "name" | "time">[];
}
```

## `@sewed/devtools/vite`

### `sewedDevTools`

```ts
const sewedDevTools: (options: SewedViteOptions) => vite.Plugin<any>;
```

## `@sewed/forge`

### `CrashReporter`

#### `CrashReporter.Declaration`

`Options` plus the crash-dump directory, created and then set as Electron's `crashDumps` path
before the reporter starts.

```ts
const Declaration: Schema.Struct<{
    /** Crash reports carry process state, so they only travel over HTTPS. */
    readonly submitUrl: Schema.optionalKey<Schema.String>;
    readonly productName: Schema.optionalKey<Schema.String>;
    readonly companyName: Schema.optionalKey<Schema.String>;
    readonly uploadToServer: Schema.optionalKey<Schema.Boolean>;
    readonly ignoreSystemCrashHandler: Schema.optionalKey<Schema.Boolean>;
    readonly rateLimit: Schema.optionalKey<Schema.Boolean>;
    readonly compress: Schema.optionalKey<Schema.Boolean>;
    readonly extra: Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>;
    readonly globalExtra: Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>;
    readonly directory: Schema.optionalKey<Schema.String>;
}>;
type Declaration = typeof Declaration.Type;
```

#### `CrashReporter.declare`

Declares the crash reporter for `App.run`: it starts before readiness so every later process is
covered. `directory` is created, recursively, and then set as Electron's `crashDumps` path
before the reporter starts, so the directory exists once the program runs; invalid options, or a
directory that cannot be created, fail startup with code `Startup`.

```ts
const declare: (options: Declaration) => SewedDeclaration.Declaration;
```

#### `CrashReporter.Key`

Crash parameter keys are at most 39 bytes and values at most 127 bytes, as Electron requires.

```ts
const Key: Schema.String;
```

#### `CrashReporter.lastReport`

```ts
const lastReport: Effect.Effect<Report | null, SewedError, MainContext>;
```

#### `CrashReporter.Options`

```ts
const Options: Schema.Struct<{
    /** Crash reports carry process state, so they only travel over HTTPS. */
    readonly submitUrl: Schema.optionalKey<Schema.String>;
    readonly productName: Schema.optionalKey<Schema.String>;
    readonly companyName: Schema.optionalKey<Schema.String>;
    readonly uploadToServer: Schema.optionalKey<Schema.Boolean>;
    readonly ignoreSystemCrashHandler: Schema.optionalKey<Schema.Boolean>;
    readonly rateLimit: Schema.optionalKey<Schema.Boolean>;
    readonly compress: Schema.optionalKey<Schema.Boolean>;
    readonly extra: Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>;
    readonly globalExtra: Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>;
}>;
type Options = typeof Options.Type;
```

#### `CrashReporter.parameters`

```ts
const parameters: Effect.Effect<Parameters, SewedError, MainContext>;
```

#### `CrashReporter.Parameters`

```ts
const Parameters: Schema.$Record<Schema.String, Schema.String>;
type Parameters = typeof Parameters.Type;
```

#### `CrashReporter.removeParameter`

```ts
const removeParameter: (key: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `CrashReporter.Report`

```ts
const Report: Schema.Struct<{
    readonly id: Schema.String;
    readonly date: Schema.String;
}>;
type Report = typeof Report.Type;
```

#### `CrashReporter.setParameter`

```ts
const setParameter: (key: string, value: string) => Effect.Effect<void, SewedError, MainContext>;
```

#### `CrashReporter.setUploadToServer`

```ts
const setUploadToServer: (enabled: boolean) => Effect.Effect<void, SewedError, MainContext>;
```

#### `CrashReporter.uploadedReports`

```ts
const uploadedReports: Effect.Effect<readonly Report[], SewedError, MainContext>;
```

#### `CrashReporter.uploadToServer`

```ts
const uploadToServer: Effect.Effect<boolean, SewedError, MainContext>;
```

#### `CrashReporter.Value`

```ts
const Value: Schema.String;
```

### `Updater`

#### `Updater.Feed`

Where the updater asks for releases; Squirrel on Windows and macOS read this feed. Only HTTPS
is accepted, because a feed a network attacker can rewrite is a feed that installs their code.

```ts
const Feed: Schema.Struct<{
    readonly url: Schema.String;
    readonly headers: Schema.optionalKey<Schema.$Record<Schema.String, Schema.String>>;
    readonly serverType: Schema.optionalKey<Schema.Literals<readonly ["json", "default"]>>;
}>;
type Feed = typeof Feed.Type;
```

#### `Updater.feedUrl`

The update.electronjs.org feed for a repository, platform, architecture, and version. The
repository is validated and every path segment is encoded, so no input can escape its segment.

```ts
const feedUrl: (repository: GithubRepository, platform: string, arch: string, version: string) => string;
```

#### `Updater.githubFeed`

The feed for the running application's platform, architecture, and version.

```ts
const githubFeed: (repository: GithubRepository) => Effect.Effect<Feed, SewedError, MainContext>;
```

#### `Updater.GithubRepository`

```ts
const GithubRepository: Schema.Struct<{
    readonly owner: Schema.String;
    readonly repo: Schema.String;
    readonly host: Schema.optionalKey<Schema.String>;
}>;
type GithubRepository = typeof GithubRepository.Type;
```

#### `Updater.Handle`

```ts
interface Handle {
  /** Replays the current state and follows the updater's events. */
  readonly state: Stream.Stream<State, SewedError, MainContext>;
  readonly current: Effect.Effect<State, SewedError, MainContext>;
  readonly check: Effect.Effect<void, SewedError, MainContext>;
  /** Restarts into the downloaded update; `Protocol` unless the state is downloaded. */
  readonly install: Effect.Effect<void, SewedError, MainContext>;
  readonly feed: Effect.Effect<string, SewedError, MainContext>;
}
```

#### `Updater.make`

Points Electron's updater at a feed for the scope's lifetime and observes it. One updater is
active at a time, and Linux has no updater, so `make` fails with `Native` there.

```ts
const make: (feed: Feed) => Effect.Effect<Handle, SewedError, MainContext | Scope.Scope>;
```

#### `Updater.State`

```ts
const State: Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"idle">;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"checking">;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"available">;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"not-available">;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"downloaded">;
    readonly releaseName: Schema.String;
    readonly releaseNotes: Schema.String;
    readonly releaseDate: Schema.String;
    readonly updateUrl: Schema.String;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"installing">;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"error">;
    readonly message: Schema.String;
}>]>;
type State = typeof State.Type;
```

## `@sewed/forge/config`

### `Config`

The shape Forge reads from `forge.config.js`; it satisfies Forge's own `ForgeConfig` type.

```ts
interface Config {
  readonly packagerConfig: Record<string, unknown>;
  readonly rebuildConfig: Record<string, unknown>;
  readonly makers: readonly Entry[];
  readonly publishers: readonly Entry[];
  readonly plugins: readonly Entry[];
}
```

### `Entry`

```ts
interface Entry {
  readonly name: string;
  readonly config?: Record<string, unknown>;
  readonly platforms?: readonly Platform[];
}
```

### `GithubPublish`

```ts
interface GithubPublish extends GithubRepository {
  readonly prerelease?: boolean;
  readonly draft?: boolean;
}
```

### `makeConfig`

Builds a Forge configuration from a few decisions. Makers are referenced by package name, so
only the makers you keep need installing, and the GitHub publisher shares its repository with
`Updater.githubFeed`, which is the whole binding between publishing and updating.

```ts
const makeConfig: (options?: Options) => Config;
```

### `Maker`

A Forge maker preset; each maps to the maker package Forge resolves by name.

```ts
type Maker = "squirrel" | "zip" | "deb" | "rpm" | "dmg";
```

### `Options`

```ts
interface Options {
  /** The executable and product name; defaults to the package name Forge reads. */
  readonly name?: string;
  /** Icon path without extension; Forge picks the platform's extension. */
  readonly icon?: string;
  readonly appBundleId?: string;
  readonly asar?: boolean;
  readonly extraResources?: readonly string[];
  /** Globs or patterns Forge leaves out of the package; the build output stays in. */
  readonly ignore?: readonly (string | RegExp)[];
  /** Maker presets; defaults to Squirrel for Windows, DMG and ZIP for macOS, DEB and RPM for Linux. */
  readonly makers?: readonly Maker[];
  /** Publishing to GitHub releases, which update.electronjs.org serves to `Updater.githubFeed`. */
  readonly github?: GithubPublish;
}
```

### `Platform`

```ts
type Platform = "win32" | "darwin" | "linux";
```
