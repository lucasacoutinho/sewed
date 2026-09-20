# API reference

Generated from the built declaration files by `scripts/api-reference.mjs`. Regenerate with `pnpm docs:reference`; the root test script checks that this file is current. Inline import types are shortened to their module name, and a handle alias over a constructor's result is printed as that result type.

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

#### `Application.Badge`

```ts
const Badge: Schema.Int;
```

#### `Application.ChildProcessGone`

```ts
const ChildProcessGone: Schema.Struct<{
  readonly type: Schema.Literals<
    readonly [
      "Utility",
      "Zygote",
      "Sandbox helper",
      "GPU",
      "Pepper Plugin",
      "Pepper Plugin Broker",
      "Unknown",
    ]
  >;
  readonly reason: Schema.Literals<
    readonly [
      "clean-exit",
      "abnormal-exit",
      "killed",
      "crashed",
      "oom",
      "launch-failed",
      "integrity-failure",
      "memory-eviction",
    ]
  >;
  readonly exitCode: Schema.Number;
  readonly serviceName: Schema.optionalKey<Schema.String>;
  readonly name: Schema.optionalKey<Schema.String>;
}>;
type ChildProcessGone = typeof ChildProcessGone.Type;
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

#### `Application.Gpu`

GPU settings that must precede readiness.

```ts
const Gpu: Schema.Struct<{
  readonly acceleration: Schema.Boolean;
}>;
type Gpu = typeof Gpu.Type;
```

#### `Application.GpuInfoKind`

```ts
const GpuInfoKind: Schema.Literals<readonly ["basic", "complete"]>;
type GpuInfoKind = typeof GpuInfoKind.Type;
```

#### `Application.Identity`

Facts about the application that must precede readiness.

```ts
const Identity: Schema.Struct<{
  /** The Windows application user model id. */
  readonly userModelId: Schema.optionalKey<Schema.String>;
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
  readonly type: Schema.optionalKey<
    Schema.Literals<readonly ["tasks", "frequent", "recent", "custom"]>
  >;
  readonly name: Schema.optionalKey<Schema.String>;
  readonly items: Schema.optionalKey<
    Schema.$Array<
      Schema.Struct<{
        readonly type: Schema.optionalKey<Schema.Literals<readonly ["task", "separator", "file"]>>;
        readonly path: Schema.optionalKey<Schema.String>;
        readonly program: Schema.optionalKey<Schema.String>;
        readonly args: Schema.optionalKey<Schema.String>;
        readonly title: Schema.optionalKey<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly iconPath: Schema.optionalKey<Schema.String>;
        readonly iconIndex: Schema.optionalKey<Schema.Int>;
        readonly workingDirectory: Schema.optionalKey<Schema.String>;
      }>
    >
  >;
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

#### `Application.LoginChallenge`

```ts
const LoginChallenge: Schema.Struct<{
  readonly url: Schema.String;
  readonly isProxy: Schema.Boolean;
  readonly scheme: Schema.String;
  readonly host: Schema.String;
  readonly port: Schema.Number;
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
  readonly status: Schema.Literals<
    readonly ["not-registered", "enabled", "requires-approval", "not-found"]
  >;
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
  readonly type: Schema.optionalKey<
    Schema.Literals<
      readonly ["mainAppService", "agentService", "daemonService", "loginItemService"]
    >
  >;
  readonly serviceName: Schema.optionalKey<Schema.String>;
  readonly name: Schema.optionalKey<Schema.String>;
}>;
type LoginItemSettings = typeof LoginItemSettings.Type;
```

#### `Application.LoginResponse`

The answer to an HTTP authentication challenge; the password stays redacted until Electron sends it.

```ts
const LoginResponse: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"cancel">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"credentials">;
      readonly username: Schema.String;
      readonly password: Schema.Redacted<Schema.String>;
    }>,
  ]
>;
type LoginResponse = typeof LoginResponse.Type;
```

#### `Application.PathName`

Inert schemas for the application surface that `App` in `sewed/main` operates.

```ts
const PathName: Schema.Literals<
  readonly [
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
  ]
>;
type PathName = typeof PathName.Type;
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

#### `Application.Scheme`

```ts
const Scheme: Schema.String;
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
  readonly id: Schema.Number;
  readonly type: Schema.String;
}>;
type WebContentsCreated = typeof WebContentsCreated.Type;
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
}>;
type EvaluateOptions = typeof EvaluateOptions.Type;
```

#### `Automation.InputEvent`

```ts
const InputEvent: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly modifiers: Schema.optionalKey<
        Schema.$Array<
          Schema.Literals<
            readonly [
              "shift",
              "control",
              "ctrl",
              "alt",
              "meta",
              "command",
              "cmd",
              "iskeypad",
              "isautorepeat",
              "leftbuttondown",
              "middlebuttondown",
              "rightbuttondown",
              "capslock",
              "numlock",
              "left",
              "right",
            ]
          >
        >
      >;
      readonly x: Schema.Number;
      readonly y: Schema.Number;
      readonly globalX: Schema.optionalKey<Schema.Number>;
      readonly globalY: Schema.optionalKey<Schema.Number>;
      readonly movementX: Schema.optionalKey<Schema.Number>;
      readonly movementY: Schema.optionalKey<Schema.Number>;
      readonly type: Schema.Literals<
        readonly ["mouseDown", "mouseUp", "mouseEnter", "mouseLeave", "contextMenu", "mouseMove"]
      >;
      readonly button: Schema.optionalKey<Schema.Literals<readonly ["left", "middle", "right"]>>;
      readonly clickCount: Schema.optionalKey<Schema.Int>;
    }>,
    Schema.Struct<{
      readonly modifiers: Schema.optionalKey<
        Schema.$Array<
          Schema.Literals<
            readonly [
              "shift",
              "control",
              "ctrl",
              "alt",
              "meta",
              "command",
              "cmd",
              "iskeypad",
              "isautorepeat",
              "leftbuttondown",
              "middlebuttondown",
              "rightbuttondown",
              "capslock",
              "numlock",
              "left",
              "right",
            ]
          >
        >
      >;
      readonly x: Schema.Number;
      readonly y: Schema.Number;
      readonly globalX: Schema.optionalKey<Schema.Number>;
      readonly globalY: Schema.optionalKey<Schema.Number>;
      readonly movementX: Schema.optionalKey<Schema.Number>;
      readonly movementY: Schema.optionalKey<Schema.Number>;
      readonly type: Schema.Literal<"mouseWheel">;
      readonly deltaX: Schema.optionalKey<Schema.Number>;
      readonly deltaY: Schema.optionalKey<Schema.Number>;
      readonly wheelTicksX: Schema.optionalKey<Schema.Number>;
      readonly wheelTicksY: Schema.optionalKey<Schema.Number>;
      readonly accelerationRatioX: Schema.optionalKey<Schema.Number>;
      readonly accelerationRatioY: Schema.optionalKey<Schema.Number>;
      readonly hasPreciseScrollingDeltas: Schema.optionalKey<Schema.Boolean>;
      readonly canScroll: Schema.optionalKey<Schema.Boolean>;
    }>,
    Schema.Struct<{
      readonly modifiers: Schema.optionalKey<
        Schema.$Array<
          Schema.Literals<
            readonly [
              "shift",
              "control",
              "ctrl",
              "alt",
              "meta",
              "command",
              "cmd",
              "iskeypad",
              "isautorepeat",
              "leftbuttondown",
              "middlebuttondown",
              "rightbuttondown",
              "capslock",
              "numlock",
              "left",
              "right",
            ]
          >
        >
      >;
      readonly type: Schema.Literals<readonly ["rawKeyDown", "keyDown", "keyUp", "char"]>;
      readonly keyCode: Schema.String;
    }>,
  ]
>;
type InputEvent = typeof InputEvent.Type;
```

#### `Automation.KeyboardInput`

```ts
const KeyboardInput: Schema.Struct<{
  readonly modifiers: Schema.optionalKey<
    Schema.$Array<
      Schema.Literals<
        readonly [
          "shift",
          "control",
          "ctrl",
          "alt",
          "meta",
          "command",
          "cmd",
          "iskeypad",
          "isautorepeat",
          "leftbuttondown",
          "middlebuttondown",
          "rightbuttondown",
          "capslock",
          "numlock",
          "left",
          "right",
        ]
      >
    >
  >;
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
  readonly modifiers: Schema.optionalKey<
    Schema.$Array<
      Schema.Literals<
        readonly [
          "shift",
          "control",
          "ctrl",
          "alt",
          "meta",
          "command",
          "cmd",
          "iskeypad",
          "isautorepeat",
          "leftbuttondown",
          "middlebuttondown",
          "rightbuttondown",
          "capslock",
          "numlock",
          "left",
          "right",
        ]
      >
    >
  >;
  readonly x: Schema.Number;
  readonly y: Schema.Number;
  readonly globalX: Schema.optionalKey<Schema.Number>;
  readonly globalY: Schema.optionalKey<Schema.Number>;
  readonly movementX: Schema.optionalKey<Schema.Number>;
  readonly movementY: Schema.optionalKey<Schema.Number>;
  readonly type: Schema.Literals<
    readonly ["mouseDown", "mouseUp", "mouseEnter", "mouseLeave", "contextMenu", "mouseMove"]
  >;
  readonly button: Schema.optionalKey<Schema.Literals<readonly ["left", "middle", "right"]>>;
  readonly clickCount: Schema.optionalKey<Schema.Int>;
}>;
type MouseInput = typeof MouseInput.Type;
```

#### `Automation.MouseWheelInput`

```ts
const MouseWheelInput: Schema.Struct<{
  readonly modifiers: Schema.optionalKey<
    Schema.$Array<
      Schema.Literals<
        readonly [
          "shift",
          "control",
          "ctrl",
          "alt",
          "meta",
          "command",
          "cmd",
          "iskeypad",
          "isautorepeat",
          "leftbuttondown",
          "middlebuttondown",
          "rightbuttondown",
          "capslock",
          "numlock",
          "left",
          "right",
        ]
      >
    >
  >;
  readonly x: Schema.Number;
  readonly y: Schema.Number;
  readonly globalX: Schema.optionalKey<Schema.Number>;
  readonly globalY: Schema.optionalKey<Schema.Number>;
  readonly movementX: Schema.optionalKey<Schema.Number>;
  readonly movementY: Schema.optionalKey<Schema.Number>;
  readonly type: Schema.Literal<"mouseWheel">;
  readonly deltaX: Schema.optionalKey<Schema.Number>;
  readonly deltaY: Schema.optionalKey<Schema.Number>;
  readonly wheelTicksX: Schema.optionalKey<Schema.Number>;
  readonly wheelTicksY: Schema.optionalKey<Schema.Number>;
  readonly accelerationRatioX: Schema.optionalKey<Schema.Number>;
  readonly accelerationRatioY: Schema.optionalKey<Schema.Number>;
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

Declares that an operation's request may exceed the envelope limit, up to `maxBytes`. The
client sends such a request in acknowledged parts and the owner assembles it before the
handler runs; an honest client refuses a larger one before sending anything. The bound covers
the whole encoded request, the payload and the envelope's own bytes together, so an operation
that accepts a 12 MiB attachment declares a little more than 12 MiB.

The bound is a transport fact: an in-process call has no wire and no bound.

```ts
const bulk: <
  Tag extends string,
  Payload extends Schema.Top,
  Success extends Schema.Top,
  Failure extends Schema.Top,
  Middleware extends RpcMiddleware.AnyService,
  Requires,
>(
  rpc: Rpc.Rpc<Tag, Payload, Success, Failure, Middleware, Requires>,
  options: Options,
) => Rpc.Rpc<Tag, Payload, Success, Failure, Middleware, Requires>;
```

#### `Binary.BulkOptions`

```ts
interface BulkOptions {
  /** The largest encoded request the operation accepts over a binding, in bytes. */
  readonly maxBytes: number;
}
```

#### `Binary.Bytes`

Native bytes in a Binary.protocol; structural RPC codecs preserve this declaration.

```ts
const Bytes: Schema.Uint8Array;
```

#### `Binary.chunkBytes`

```ts
const chunkBytes: number;
```

#### `Binary.chunks`

Splits byte chunks lazily; callers retain ownership of their input buffers.

```ts
const chunks: <E, R>(
  source: Stream.Stream<Uint8Array, E, R>,
) => Stream.Stream<Uint8Array<ArrayBufferLike>, E, R>;
```

#### `Binary.protocol`

```ts
const protocol: <Rpcs extends Rpc.Any>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
) => RpcGroup.RpcGroup<Rpcs>;
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
const client: <Rpcs extends Rpc.Any>(
  binding: Slot<Rpcs>,
) => Effect.Effect<
  Client<Rpcs>,
  SewedError,
  ClientContext | Scope.Scope | Rpc.MiddlewareClient<Rpcs>
>;
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

#### `Binding.Connection`

How a deferred client reaches its owner: one connection per slot for the client environment,
or one connection per operation. The renderer bridge handshake dominates small calls, so
`shared` is the default and `per-call` is the isolation opt-out.

```ts
type Connection = "shared" | "per-call";
```

#### `Binding.deferred`

```ts
const deferred: <Rpcs extends Rpc.Any>(
  binding: Slot<Rpcs>,
  options?: {
    readonly connection?: Connection;
  },
) => Effect.Effect<Client<Rpcs>, never, ClientContext>;
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

#### `Binding.slot`

```ts
const slot: <const Name extends string, Rpcs extends Rpc.Any>(
  name: Name,
  protocol: RpcGroup.RpcGroup<Rpcs>,
) => Slot<Rpcs, `${typeof prefix}${Name}`>;
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
const to: <Rpcs extends Rpc.Any, Key extends string>(
  slot: Slot<Rpcs, Key>,
  owner: Owner<NoInfer<Rpcs>>,
) => Bound<Key>;
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
const client: <Rpcs extends Rpc.Any, Key extends string>(
  capability: Capability<Rpcs, Key>,
  options?: {
    readonly connection?: Binding.Connection;
  },
) => Layer.Layer<Capability<Rpcs, Key>, never, ClientContext>;
```

#### `Capability.declaration`

The slot a served capability's owner binds to, for a renderer entry's `bindings` list.
`Binding.to(capability.slot, owner)` pairs it with the owner `serve` returns.

```ts
const declaration: <Rpcs extends Rpc.Any, Key extends string>(
  capability: Capability<Rpcs, Key>,
) => Binding.Declaration<Key>;
```

#### `Capability.define`

```ts
const define: <const Name extends string, Rpcs extends Rpc.Any>(
  name: Name,
  protocol: RpcGroup.RpcGroup<Rpcs>,
) => Capability<Rpcs, `sewed/binding/${Name}`>;
```

#### `Capability.fromHandlers`

```ts
const fromHandlers: <Rpcs extends Rpc.Any, Key extends string, E, R>(
  capability: Capability<Rpcs, Key>,
  handlers: HandlerLayer<Rpcs, E, R>,
) => Layer.Layer<Capability<Rpcs, Key>, E, R>;
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
const Policy: Decision.Policy<
  readonly {
    readonly hostname: string;
    readonly trust:
      | "always"
      | "system"
      | {
          readonly fingerprint: string;
        };
  }[],
  {
    readonly hostname: string;
    readonly certificate: {
      readonly fingerprint: string;
    };
  },
  "reject" | "trust"
>;
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
  readonly validStart: Schema.Number;
  /** Seconds since the epoch, as Electron's `Certificate.validExpiry` reports it. */
  readonly validExpiry: Schema.Number;
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
  readonly trust: Schema.Union<
    readonly [
      Schema.Literal<"system">,
      Schema.Literal<"always">,
      Schema.Struct<{
        readonly fingerprint: Schema.String;
      }>,
    ]
  >;
}>;
type Rule = typeof Rule.Type;
```

#### `Certificate.Rules`

```ts
const Rules: Schema.$Array<
  Schema.Struct<{
    readonly hostname: Schema.String;
    readonly trust: Schema.Union<
      readonly [
        Schema.Literal<"system">,
        Schema.Literal<"always">,
        Schema.Struct<{
          readonly fingerprint: Schema.String;
        }>,
      ]
    >;
  }>
>;
type Rules = typeof Rules.Type;
```

#### `Certificate.Trust`

How a host's certificate is judged: Chromium's verdict, unconditional trust, or one pinned fingerprint.

```ts
const Trust: Schema.Union<
  readonly [
    Schema.Literal<"system">,
    Schema.Literal<"always">,
    Schema.Struct<{
      readonly fingerprint: Schema.String;
    }>,
  ]
>;
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
const capability: Capability.Capability<
  | Rpc.Rpc<"clear", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "formats",
      Schema.Void,
      Schema.$Array<Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>>,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "read",
      Schema.Struct<{
        format: Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>;
      }>,
      Schema.NullOr<
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly kind: Schema.Literal<"text">;
              readonly text: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"html">;
              readonly html: Schema.String;
              readonly text: Schema.optionalKey<Schema.String>;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"rtf">;
              readonly rtf: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"image">;
              readonly png: Schema.Uint8Array;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"bookmark">;
              readonly title: Schema.String;
              readonly url: Schema.String;
            }>,
          ]
        >
      >,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "write",
      Schema.Struct<{
        content: Schema.Union<
          readonly [
            Schema.Struct<{
              readonly kind: Schema.Literal<"text">;
              readonly text: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"html">;
              readonly html: Schema.String;
              readonly text: Schema.optionalKey<Schema.String>;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"rtf">;
              readonly rtf: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"image">;
              readonly png: Schema.Uint8Array;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"bookmark">;
              readonly title: Schema.String;
              readonly url: Schema.String;
            }>,
          ]
        >;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >,
  "sewed/binding/clipboard"
>;
```

#### `Clipboard.Content`

```ts
const Content: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"text">;
      readonly text: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"html">;
      readonly html: Schema.String;
      readonly text: Schema.optionalKey<Schema.String>;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"rtf">;
      readonly rtf: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"image">;
      readonly png: Schema.Uint8Array;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"bookmark">;
      readonly title: Schema.String;
      readonly url: Schema.String;
    }>,
  ]
>;
type Content = typeof Content.Type;
```

#### `Clipboard.Format`

```ts
const Format: Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>;
type Format = typeof Format.Type;
```

#### `Clipboard.Png`

PNG bytes, checked by signature so malformed images never reach the clipboard.

```ts
const Png: Schema.Uint8Array;
```

#### `Clipboard.Policy`

Formats this capability may read and write; anything omitted is denied.

```ts
const Policy: Schema.Struct<{
  readonly read: Schema.$Array<
    Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>
  >;
  readonly write: Schema.$Array<
    Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>
  >;
}>;
type Policy = typeof Policy.Type;
```

#### `Clipboard.protocol`

```ts
const protocol: RpcGroup.RpcGroup<
  | Rpc.Rpc<"clear", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "formats",
      Schema.Void,
      Schema.$Array<Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>>,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "read",
      Schema.Struct<{
        format: Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>;
      }>,
      Schema.NullOr<
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly kind: Schema.Literal<"text">;
              readonly text: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"html">;
              readonly html: Schema.String;
              readonly text: Schema.optionalKey<Schema.String>;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"rtf">;
              readonly rtf: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"image">;
              readonly png: Schema.Uint8Array;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"bookmark">;
              readonly title: Schema.String;
              readonly url: Schema.String;
            }>,
          ]
        >
      >,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "write",
      Schema.Struct<{
        content: Schema.Union<
          readonly [
            Schema.Struct<{
              readonly kind: Schema.Literal<"text">;
              readonly text: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"html">;
              readonly html: Schema.String;
              readonly text: Schema.optionalKey<Schema.String>;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"rtf">;
              readonly rtf: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"image">;
              readonly png: Schema.Uint8Array;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"bookmark">;
              readonly title: Schema.String;
              readonly url: Schema.String;
            }>,
          ]
        >;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
>;
```

### `ContentTracing`

#### `ContentTracing.BufferUsage`

```ts
const BufferUsage: Schema.Struct<{
  readonly value: Schema.Number;
  readonly percentage: Schema.Number;
}>;
type BufferUsage = typeof BufferUsage.Type;
```

#### `ContentTracing.Mode`

```ts
const Mode: Schema.Literals<
  readonly [
    "record-until-full",
    "record-continuously",
    "record-as-much-as-possible",
    "trace-to-console",
  ]
>;
type Mode = typeof Mode.Type;
```

#### `ContentTracing.Options`

```ts
const Options: Schema.Struct<{
  readonly included: Schema.optionalKey<Schema.$Array<Schema.String>>;
  readonly excluded: Schema.optionalKey<Schema.$Array<Schema.String>>;
  readonly mode: Schema.optionalKey<
    Schema.Literals<
      readonly [
        "record-until-full",
        "record-continuously",
        "record-as-much-as-possible",
        "trace-to-console",
      ]
    >
  >;
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
const capability: Capability.Capability<
  | Rpc.Rpc<
      "changes",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly cookie: Schema.Struct<{
            readonly name: Schema.String;
            readonly value: Schema.String;
            readonly domain: Schema.optionalKey<Schema.String>;
            readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
            readonly path: Schema.optionalKey<Schema.String>;
            readonly secure: Schema.optionalKey<Schema.Boolean>;
            readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
            readonly session: Schema.optionalKey<Schema.Boolean>;
            readonly expirationDate: Schema.optionalKey<Schema.Number>;
            readonly sameSite: Schema.Literals<
              readonly ["unspecified", "no_restriction", "lax", "strict"]
            >;
          }>;
          readonly cause: Schema.Literals<
            readonly [
              "inserted",
              "inserted-no-change-overwrite",
              "inserted-no-value-change-overwrite",
              "explicit",
              "overwrite",
              "expired",
              "evicted",
              "expired-overwrite",
            ]
          >;
          readonly removed: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"flush", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "get",
      Schema.Struct<{
        filter: Schema.Struct<{
          readonly url: Schema.optionalKey<Schema.String>;
          readonly name: Schema.optionalKey<Schema.String>;
          readonly domain: Schema.optionalKey<Schema.String>;
          readonly path: Schema.optionalKey<Schema.String>;
          readonly secure: Schema.optionalKey<Schema.Boolean>;
          readonly session: Schema.optionalKey<Schema.Boolean>;
          readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
        }>;
      }>,
      Schema.$Array<
        Schema.Struct<{
          readonly name: Schema.String;
          readonly value: Schema.String;
          readonly domain: Schema.optionalKey<Schema.String>;
          readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
          readonly path: Schema.optionalKey<Schema.String>;
          readonly secure: Schema.optionalKey<Schema.Boolean>;
          readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
          readonly session: Schema.optionalKey<Schema.Boolean>;
          readonly expirationDate: Schema.optionalKey<Schema.Number>;
          readonly sameSite: Schema.Literals<
            readonly ["unspecified", "no_restriction", "lax", "strict"]
          >;
        }>
      >,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "remove",
      Schema.Struct<{
        url: Schema.String;
        name: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "set",
      Schema.Struct<{
        details: Schema.Struct<{
          readonly url: Schema.String;
          readonly name: Schema.String;
          readonly value: Schema.String;
          readonly domain: Schema.optionalKey<Schema.String>;
          readonly path: Schema.optionalKey<Schema.String>;
          readonly secure: Schema.optionalKey<Schema.Boolean>;
          readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
          readonly expirationDate: Schema.optionalKey<Schema.Number>;
          readonly sameSite: Schema.optionalKey<
            Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>
          >;
        }>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >,
  "sewed/binding/cookies"
>;
```

#### `Cookie.Cause`

```ts
const Cause: Schema.Literals<
  readonly [
    "inserted",
    "inserted-no-change-overwrite",
    "inserted-no-value-change-overwrite",
    "explicit",
    "overwrite",
    "expired",
    "evicted",
    "expired-overwrite",
  ]
>;
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
    readonly expirationDate: Schema.optionalKey<Schema.Number>;
    readonly sameSite: Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>;
  }>;
  readonly cause: Schema.Literals<
    readonly [
      "inserted",
      "inserted-no-change-overwrite",
      "inserted-no-value-change-overwrite",
      "explicit",
      "overwrite",
      "expired",
      "evicted",
      "expired-overwrite",
    ]
  >;
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
  readonly expirationDate: Schema.optionalKey<Schema.Number>;
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
  readonly expirationDate: Schema.optionalKey<Schema.Number>;
  readonly sameSite: Schema.optionalKey<
    Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>
  >;
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
const Policy: Schema.$Array<
  Schema.Struct<{
    readonly kind: Schema.Literal<"origin">;
    readonly origin: Schema.String;
  }>
>;
type Policy = typeof Policy.Type;
```

#### `Cookie.protocol`

```ts
const protocol: RpcGroup.RpcGroup<
  | Rpc.Rpc<
      "changes",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly cookie: Schema.Struct<{
            readonly name: Schema.String;
            readonly value: Schema.String;
            readonly domain: Schema.optionalKey<Schema.String>;
            readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
            readonly path: Schema.optionalKey<Schema.String>;
            readonly secure: Schema.optionalKey<Schema.Boolean>;
            readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
            readonly session: Schema.optionalKey<Schema.Boolean>;
            readonly expirationDate: Schema.optionalKey<Schema.Number>;
            readonly sameSite: Schema.Literals<
              readonly ["unspecified", "no_restriction", "lax", "strict"]
            >;
          }>;
          readonly cause: Schema.Literals<
            readonly [
              "inserted",
              "inserted-no-change-overwrite",
              "inserted-no-value-change-overwrite",
              "explicit",
              "overwrite",
              "expired",
              "evicted",
              "expired-overwrite",
            ]
          >;
          readonly removed: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"flush", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "get",
      Schema.Struct<{
        filter: Schema.Struct<{
          readonly url: Schema.optionalKey<Schema.String>;
          readonly name: Schema.optionalKey<Schema.String>;
          readonly domain: Schema.optionalKey<Schema.String>;
          readonly path: Schema.optionalKey<Schema.String>;
          readonly secure: Schema.optionalKey<Schema.Boolean>;
          readonly session: Schema.optionalKey<Schema.Boolean>;
          readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
        }>;
      }>,
      Schema.$Array<
        Schema.Struct<{
          readonly name: Schema.String;
          readonly value: Schema.String;
          readonly domain: Schema.optionalKey<Schema.String>;
          readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
          readonly path: Schema.optionalKey<Schema.String>;
          readonly secure: Schema.optionalKey<Schema.Boolean>;
          readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
          readonly session: Schema.optionalKey<Schema.Boolean>;
          readonly expirationDate: Schema.optionalKey<Schema.Number>;
          readonly sameSite: Schema.Literals<
            readonly ["unspecified", "no_restriction", "lax", "strict"]
          >;
        }>
      >,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "remove",
      Schema.Struct<{
        url: Schema.String;
        name: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "set",
      Schema.Struct<{
        details: Schema.Struct<{
          readonly url: Schema.String;
          readonly name: Schema.String;
          readonly value: Schema.String;
          readonly domain: Schema.optionalKey<Schema.String>;
          readonly path: Schema.optionalKey<Schema.String>;
          readonly secure: Schema.optionalKey<Schema.Boolean>;
          readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
          readonly expirationDate: Schema.optionalKey<Schema.Number>;
          readonly sameSite: Schema.optionalKey<
            Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>
          >;
        }>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
>;
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
  Login: Decision.Decidable<
    {
      readonly url: string;
      readonly isProxy: boolean;
      readonly scheme: string;
      readonly host: string;
      readonly port: number;
      readonly realm: string;
      readonly isRequestForNavigation: boolean;
    },
    | {
        readonly kind: "cancel";
      }
    | {
        readonly kind: "credentials";
        readonly username: string;
        readonly password: Redacted.Redacted<string>;
      },
    "async",
    "first",
    "app"
  >;
  /**
   * Asked for each TLS error; without an answer Chromium's rejection stands. The event carries only
   * what a trust decision needs from the presented certificate — see {@link Certificate.Presented}
   * — plus `hostname` (`URL.parse(url)?.hostname ?? ""` in `App.ts`'s builder), so `Certificate.Policy`
   * installs here the same way it installs on `Session.Certificate`.
   */
  CertificateError: Decision.Decidable<
    {
      readonly url: string;
      readonly hostname: string;
      readonly certificate: {
        readonly fingerprint: string;
        readonly subjectName: string;
        readonly issuerName: string;
        readonly validStart: number;
        readonly validExpiry: number;
      };
    },
    "reject" | "trust",
    "async",
    "restrictive",
    "app"
  >;
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
   * The fallback denies.
   */
  Permission: Decision.Decidable<
    {
      readonly name: string;
      readonly origin: string | null;
      readonly document: string | null;
    },
    "allow" | "deny",
    "sync",
    "restrictive",
    "session"
  >;
  /**
   * Asked for each of the renderer's speculative preconnections; the fallback allows them, matching
   * a session's previous default. A failing decider denies instead, which costs a preconnection's
   * latency and nothing else.
   */
  Preconnect: Decision.Decidable<
    {
      readonly url: string;
    },
    "allow" | "deny",
    "sync",
    "restrictive",
    "session"
  >;
  /**
   * Asked for each server certificate verification; without an answer Chromium's own verdict stands.
   * A decider that *fails* rejects instead: a broken fingerprint pin must not silently become no pin
   * by deferring to the CA validity the pin exists to distrust. `trust`, `reject`, and `system` map
   * onto `setCertificateVerifyProc`'s numeric `0`, `-2`, and `-3` — see `internal/Session.ts`.
   */
  Certificate: Decision.Decidable<
    {
      readonly hostname: string;
      readonly certificate: {
        readonly fingerprint: string;
        readonly subjectName: string;
        readonly issuerName: string;
        readonly validStart: number;
        readonly validExpiry: number;
      };
    },
    "reject" | "system" | "trust",
    "async",
    "restrictive",
    "session"
  >;
  /**
   * Asked for each screen-share request; without an answer, or when a decider fails, it is denied.
   * `order`'s two entries are `DesktopCapturer.Decision`'s own discriminants — it has no `"grant"`
   * member.
   */
  DisplayMedia: Decision.Decidable<
    {
      readonly origin: string | null;
      readonly videoRequested: boolean;
      readonly audioRequested: boolean;
      readonly userGesture: boolean;
    },
    | {
        readonly kind: "deny";
      }
    | {
        readonly kind: "source";
        readonly id: string;
        readonly audio?: "loopback" | "loopbackWithMute";
      },
    "async",
    "restrictive",
    "session"
  >;
  /**
   * Asked before each request the filter selects leaves the session. Nobody objecting allows it,
   * and a *broken* decider blocks it: a tracker gate that throws has not established that the
   * request is safe to make, and a filter narrow enough to be worth installing is narrow enough
   * that failing its requests closed costs one feature rather than the application.
   *
   * `body` on this stage's filter is what makes `body` reach a decider here, capped in bytes and
   * assembled per install — see `session.intercept`. It is the only one of the three that carries
   * upload data, and the other two refuse a filter that asks for it.
   *
   * A decider that *fails* blocks; a decider that never **settles** leaves its request unanswered,
   * and the page waits. Liveness is the decider's own, and closing the installing scope does not
   * release a request already in flight: bound a decider that can wait on anything with
   * `Effect.timeout`, and let the timeout fail so it blocks.
   */
  Request: Decision.Decidable<
    {
      readonly id: number;
      readonly url: string;
      readonly method: string;
      readonly resourceType:
        | "cspReport"
        | "font"
        | "image"
        | "mainFrame"
        | "media"
        | "object"
        | "other"
        | "ping"
        | "script"
        | "stylesheet"
        | "subFrame"
        | "webSocket"
        | "xhr";
      readonly referrer: string;
      readonly timestamp: number;
      readonly webContentsId?: number;
      readonly sourceId?: string;
      readonly body?: {
        readonly parts: readonly (
          | {
              readonly kind: "bytes";
              readonly bytes: Uint8Array<ArrayBufferLike>;
            }
          | {
              readonly kind: "file";
              readonly path: string;
              readonly offset?: number;
              readonly length?: number;
              readonly modificationTime?: number;
            }
          | {
              readonly kind: "blob";
              readonly id: string;
            }
        )[];
        readonly bytes: number;
        readonly truncated: boolean;
      };
    },
    | {
        readonly kind: "allow";
      }
    | {
        readonly kind: "block";
      }
    | {
        readonly kind: "redirect";
        readonly url: string;
      },
    "async",
    "restrictive",
    "requests"
  >;
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
  RequestHeaders: Decision.Decidable<
    {
      readonly id: number;
      readonly url: string;
      readonly method: string;
      readonly resourceType:
        | "cspReport"
        | "font"
        | "image"
        | "mainFrame"
        | "media"
        | "object"
        | "other"
        | "ping"
        | "script"
        | "stylesheet"
        | "subFrame"
        | "webSocket"
        | "xhr";
      readonly referrer: string;
      readonly timestamp: number;
      readonly webContentsId?: number;
      readonly sourceId?: string;
      readonly headers: {
        readonly [x: string]: string;
      };
    },
    | {
        readonly kind: "allow";
      }
    | {
        readonly kind: "block";
      }
    | {
        readonly kind: "headers";
        readonly headers: {
          readonly [x: string]: string;
        };
      },
    "async",
    "chain",
    "requests"
  >;
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
  ResponseHeaders: Decision.Decidable<
    {
      readonly id: number;
      readonly url: string;
      readonly method: string;
      readonly resourceType:
        | "cspReport"
        | "font"
        | "image"
        | "mainFrame"
        | "media"
        | "object"
        | "other"
        | "ping"
        | "script"
        | "stylesheet"
        | "subFrame"
        | "webSocket"
        | "xhr";
      readonly referrer: string;
      readonly timestamp: number;
      readonly webContentsId?: number;
      readonly sourceId?: string;
      readonly statusLine: string;
      readonly statusCode: number;
      readonly headers: {
        readonly [x: string]: readonly string[];
      };
    },
    | {
        readonly kind: "allow";
      }
    | {
        readonly kind: "block";
      }
    | {
        readonly kind: "headers";
        readonly headers: {
          readonly [x: string]: readonly string[];
        };
        readonly statusLine?: string;
      },
    "async",
    "chain",
    "requests"
  >;
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
  Navigation: Decision.Decidable<
    {
      readonly url: string;
      readonly kind: "navigation" | "redirect" | "webview";
    },
    "allow" | "deny",
    "sync",
    "restrictive",
    "contents"
  >;
  /** Asked when the page requests a new window; without an answer the popup is denied. */
  Popup: Decision.Decidable<
    {
      readonly url: string;
    },
    "allow" | "deny",
    "sync",
    "restrictive",
    "contents"
  >;
  /** Asked when the page sets its title; the fallback keeps whatever title main last set. */
  TitleUpdate: Decision.Decidable<
    {
      readonly title: string;
    },
    "accept" | "keep",
    "sync",
    "first",
    "contents"
  >;
  /** Asked when the page tries to prevent its own unload; the fallback honors the page's request. */
  Unload: Decision.Decidable<
    {
      readonly url: string;
    },
    "honor" | "override",
    "sync",
    "first",
    "contents"
  >;
  /**
   * Asked for each keyboard or mouse event; without an answer input reaches the page. Deliberately
   * declares no `failure`, unlike the guards that close a window or quit the application: its closed
   * answer is `block`, asked of every keystroke and every click, so a buggy input decider that
   * contributed it would brick the application. A failing decider here contributes the fallback and
   * input keeps reaching the page — the one place in this catalog where a broken decider is the
   * lesser hazard.
   */
  Input: Decision.Decidable<
    {
      readonly kind: "key" | "mouse";
    },
    "allow" | "block",
    "sync",
    "restrictive",
    "contents"
  >;
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
  Download: Decision.Decidable<
    {
      readonly url: string;
      readonly filename: string;
      readonly mimeType: string;
      readonly totalBytes: number;
      readonly sourceId: string;
    },
    | {
        readonly kind: "deny";
      }
    | {
        readonly kind: "save";
        readonly path: string;
      }
    | {
        readonly kind: "prompt";
        readonly dialog?: {
          readonly title?: string;
          readonly defaultPath?: string;
          readonly buttonLabel?: string;
          readonly filters?: readonly [
            {
              readonly name: string;
              readonly extensions: readonly [string, ...string[]];
            },
            ...{
              readonly name: string;
              readonly extensions: readonly [string, ...string[]];
            }[],
          ];
        };
      },
    "sync",
    "restrictive",
    "contents"
  >;
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
  Close: Decision.Decidable<
    {
      readonly windowId: string;
    },
    "allow" | "deny",
    "async",
    "restrictive",
    "window"
  >;
};
```

### `Decision`

#### `Decision.async`

A decider for a decidable whose answer may arrive later. See {@link sync} for why this is a single signature.

```ts
const async: <Event, Answer, R>(
  decide: (event: Event) => Effect.Effect<Answer | Pass, never, R>,
) => Async<Event, Answer, R>;
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
const decidable: <
  Event,
  Answer,
  Timing extends "sync" | "async",
  C extends Composition,
  O extends OwnerKind,
>(
  options: DecidableOptions<Event, Answer, Timing, C, O> & {
    readonly [decidableIdentity]?: never;
  },
) => Decidable<Event, Answer, Timing, C, O>;
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

#### `Decision.fromState`

A synchronous decider that answers from main-owned state. The read is atomic and current at the
callback: a synchronous decider cannot wait for an update that has not been applied, because
Electron requires the answer inside its callback.

```ts
const fromState: <S, Event, Answer>(
  state: SubscriptionRef.SubscriptionRef<S>,
  decide: (state: S, event: Event) => Answer | Pass,
) => Sync<Event, Answer>;
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
shape — this is what {@link sync}'s dropped overload used to buy through inference; naming the
decider instead reads better than an overload that silently broke every other call site.

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
const policy: <Rules, Event, Answer>(
  kind: Policy<Rules, Event, Answer>,
  rules: NoInfer<Rules>,
) => Sync<Event, Answer>;
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
natural spelling infers the literal answer type with no annotation. See {@link pass} for a decider
that only ever passes.

```ts
const sync: <Event, Answer>(decide: (event: Event) => Answer | Pass) => Sync<Event, Answer>;
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
const Decision: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"deny">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"source">;
      readonly id: Schema.String;
      readonly audio: Schema.optionalKey<
        Schema.Literals<readonly ["loopback", "loopbackWithMute"]>
      >;
    }>,
  ]
>;
type Decision = typeof Decision.Type;
```

#### `DesktopCapturer.Options`

```ts
const Options: Schema.Struct<{
  readonly types: Schema.NonEmptyArray<Schema.Literals<readonly ["screen", "window"]>>;
  readonly thumbnailSize: Schema.optionalKey<
    Schema.Struct<{
      readonly width: Schema.Int;
      readonly height: Schema.Int;
    }>
  >;
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
  readonly thumbnail: Schema.Uint8Array;
  readonly icon: Schema.NullOr<Schema.Uint8Array>;
}>;
type Source = typeof Source.Type;
```

#### `DesktopCapturer.SourceType`

```ts
const SourceType: Schema.Literals<readonly ["screen", "window"]>;
type SourceType = typeof SourceType.Type;
```

### `Diagnostics`

#### `Diagnostics.Collector`

```ts
// The success type of make.
type Collector = {
  layer: Layer.Layer<Sink, never, never>;
  snapshot: Effect.Effect<Snapshot, never, never>;
  changes: Stream.Stream<Record, never, never>;
};
```

#### `Diagnostics.Event`

```ts
const Event: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly runtime: Schema.Literals<
        readonly ["main", "worker", "utility", "renderer", "unknown"]
      >;
      readonly threadId: Schema.Number;
      readonly processId: Schema.optionalKey<Schema.Number>;
      readonly runtimeId: Schema.String;
      readonly _tag: Schema.Literal<"OwnerStarted">;
      readonly ownerId: Schema.String;
    }>,
    Schema.Struct<{
      readonly _tag: Schema.Literal<"OwnerClosed">;
      readonly ownerId: Schema.String;
      readonly reason: Schema.Literals<
        readonly ["scope-closed", "shutdown", "terminated", "exited", "startup-failed"]
      >;
    }>,
    Schema.Struct<{
      readonly _tag: Schema.Literal<"RuntimeClosed">;
      readonly runtimeId: Schema.String;
    }>,
    Schema.Struct<{
      readonly runtime: Schema.Literals<
        readonly ["main", "worker", "utility", "renderer", "unknown"]
      >;
      readonly threadId: Schema.Number;
      readonly processId: Schema.optionalKey<Schema.Number>;
      readonly runtimeId: Schema.String;
      readonly _tag: Schema.Literal<"BindingOpened">;
      readonly bindingId: Schema.String;
      readonly slot: Schema.String;
      readonly ownerId: Schema.String;
    }>,
    Schema.Struct<{
      readonly _tag: Schema.Literal<"BindingClosed">;
      readonly bindingId: Schema.String;
      readonly reason: Schema.Literals<
        readonly [
          "scope-closed",
          "navigation",
          "renderer-gone",
          "renderer-disconnected",
          "replaced",
        ]
      >;
    }>,
    Schema.Struct<{
      readonly ownerId: Schema.String;
      readonly clientId: Schema.Number;
      readonly requestId: Schema.String;
      readonly _tag: Schema.Literal<"RequestStarted">;
      readonly procedure: Schema.String;
      readonly traceId: Schema.optionalKey<Schema.String>;
      readonly spanId: Schema.optionalKey<Schema.String>;
    }>,
    Schema.Struct<{
      readonly ownerId: Schema.String;
      readonly clientId: Schema.Number;
      readonly requestId: Schema.String;
      readonly _tag: Schema.Literal<"RequestEnded">;
      readonly outcome: Schema.Literals<
        readonly ["success", "failure", "interrupted", "disconnected"]
      >;
      readonly reason: Schema.String;
    }>,
    Schema.Struct<{
      readonly _tag: Schema.Literal<"EventsDropped">;
      readonly ownerId: Schema.String;
      readonly count: Schema.Number;
    }>,
    Schema.Struct<{
      readonly runtime: Schema.Literals<
        readonly ["main", "worker", "utility", "renderer", "unknown"]
      >;
      readonly threadId: Schema.Number;
      readonly processId: Schema.optionalKey<Schema.Number>;
      readonly runtimeId: Schema.String;
      readonly _tag: Schema.Literal<"ResourceChanged">;
      readonly resourceId: Schema.String;
      readonly ownerId: Schema.String;
      readonly clientId: Schema.Number;
      readonly state: Schema.Literals<readonly ["acquiring", "ready", "releasing"]>;
    }>,
    Schema.Struct<{
      readonly runtime: Schema.Literals<
        readonly ["main", "worker", "utility", "renderer", "unknown"]
      >;
      readonly threadId: Schema.Number;
      readonly processId: Schema.optionalKey<Schema.Number>;
      readonly runtimeId: Schema.String;
      readonly _tag: Schema.Literal<"ResourceClosed">;
      readonly resourceId: Schema.String;
      readonly ownerId: Schema.String;
      readonly clientId: Schema.Number;
      readonly outcome: Schema.Literals<
        readonly ["success", "failure", "interrupted", "disconnected"]
      >;
      readonly reason: Schema.String;
    }>,
    Schema.Struct<{
      readonly runtime: Schema.Literals<
        readonly ["main", "worker", "utility", "renderer", "unknown"]
      >;
      readonly threadId: Schema.Number;
      readonly processId: Schema.optionalKey<Schema.Number>;
      readonly runtimeId: Schema.String;
      readonly ownerId: Schema.String;
      readonly clientId: Schema.Number;
      readonly requestId: Schema.String;
      readonly _tag: Schema.Literal<"TransferProgress">;
      readonly frames: Schema.Int;
      readonly wireBytes: Schema.Int;
      readonly terminal: Schema.Boolean;
    }>,
    Schema.Struct<{
      readonly runtime: Schema.Literals<
        readonly ["main", "worker", "utility", "renderer", "unknown"]
      >;
      readonly threadId: Schema.Number;
      readonly processId: Schema.optionalKey<Schema.Number>;
      readonly runtimeId: Schema.String;
      readonly _tag: Schema.Literal<"TraceSpan">;
      readonly traceId: Schema.String;
      readonly spanId: Schema.String;
      readonly parentId: Schema.optionalKey<Schema.String>;
      readonly name: Schema.String;
      readonly startTime: Schema.String;
      readonly endTime: Schema.optionalKey<Schema.String>;
      readonly outcome: Schema.Literals<readonly ["running", "success", "failure"]>;
      readonly ownerId: Schema.optionalKey<Schema.String>;
      readonly binding: Schema.optionalKey<Schema.String>;
    }>,
    Schema.Struct<{
      readonly runtime: Schema.Literals<
        readonly ["main", "worker", "utility", "renderer", "unknown"]
      >;
      readonly threadId: Schema.Number;
      readonly processId: Schema.optionalKey<Schema.Number>;
      readonly runtimeId: Schema.String;
      readonly _tag: Schema.Literal<"TraceEvent">;
      readonly traceId: Schema.String;
      readonly spanId: Schema.String;
      readonly name: Schema.String;
      readonly time: Schema.String;
    }>,
    Schema.Struct<{
      readonly runtime: Schema.Literals<
        readonly ["main", "worker", "utility", "renderer", "unknown"]
      >;
      readonly threadId: Schema.Number;
      readonly processId: Schema.optionalKey<Schema.Number>;
      readonly runtimeId: Schema.String;
      readonly _tag: Schema.Literal<"RuntimeSample">;
      readonly delayMs: Schema.Number;
      readonly intervalMs: Schema.Number;
    }>,
    Schema.Struct<{
      readonly runtime: Schema.Literals<
        readonly ["main", "worker", "utility", "renderer", "unknown"]
      >;
      readonly threadId: Schema.Number;
      readonly processId: Schema.optionalKey<Schema.Number>;
      readonly runtimeId: Schema.String;
      readonly _tag: Schema.Literal<"QueueSample">;
      readonly queueId: Schema.String;
      readonly ownerId: Schema.optionalKey<Schema.String>;
      readonly kind: Schema.Literals<readonly ["rpc-server", "rpc-client"]>;
      readonly size: Schema.Number;
      readonly capacity: Schema.Number;
      readonly activeRequests: Schema.optionalKey<Schema.Number>;
    }>,
    Schema.Struct<{
      readonly runtime: Schema.Literals<
        readonly ["main", "worker", "utility", "renderer", "unknown"]
      >;
      readonly threadId: Schema.Number;
      readonly processId: Schema.optionalKey<Schema.Number>;
      readonly runtimeId: Schema.String;
      readonly _tag: Schema.Literal<"QueueClosed">;
      readonly queueId: Schema.String;
    }>,
  ]
>;
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
const instrument: <A, E, R>(
  program: Effect.Effect<A, E, R>,
) => Effect.Effect<A, E, R | Scope.Scope>;
```

#### `Diagnostics.make`

Scope this collector outside the resources it observes so their finalizers are recorded.

```ts
const make: (options?: { readonly capacity?: number; readonly tracing?: boolean }) => Effect.Effect<
  {
    layer: Layer.Layer<Sink, never, never>;
    snapshot: Effect.Effect<Snapshot, never, never>;
    changes: Stream.Stream<Record, never, never>;
  },
  never,
  Scope.Scope
>;
```

#### `Diagnostics.Observation`

```ts
const Observation: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly runtime: Schema.Literals<
        readonly ["main", "worker", "utility", "renderer", "unknown"]
      >;
      readonly threadId: Schema.Number;
      readonly processId: Schema.optionalKey<Schema.Number>;
      readonly runtimeId: Schema.String;
      readonly _tag: Schema.Literal<"TraceSpan">;
      readonly traceId: Schema.String;
      readonly spanId: Schema.String;
      readonly parentId: Schema.optionalKey<Schema.String>;
      readonly name: Schema.String;
      readonly startTime: Schema.String;
      readonly endTime: Schema.optionalKey<Schema.String>;
      readonly outcome: Schema.Literals<readonly ["running", "success", "failure"]>;
      readonly ownerId: Schema.optionalKey<Schema.String>;
      readonly binding: Schema.optionalKey<Schema.String>;
    }>,
    Schema.Struct<{
      readonly runtime: Schema.Literals<
        readonly ["main", "worker", "utility", "renderer", "unknown"]
      >;
      readonly threadId: Schema.Number;
      readonly processId: Schema.optionalKey<Schema.Number>;
      readonly runtimeId: Schema.String;
      readonly _tag: Schema.Literal<"TraceEvent">;
      readonly traceId: Schema.String;
      readonly spanId: Schema.String;
      readonly name: Schema.String;
      readonly time: Schema.String;
    }>,
    Schema.Struct<{
      readonly runtime: Schema.Literals<
        readonly ["main", "worker", "utility", "renderer", "unknown"]
      >;
      readonly threadId: Schema.Number;
      readonly processId: Schema.optionalKey<Schema.Number>;
      readonly runtimeId: Schema.String;
      readonly _tag: Schema.Literal<"RuntimeSample">;
      readonly delayMs: Schema.Number;
      readonly intervalMs: Schema.Number;
    }>,
    Schema.Struct<{
      readonly runtime: Schema.Literals<
        readonly ["main", "worker", "utility", "renderer", "unknown"]
      >;
      readonly threadId: Schema.Number;
      readonly processId: Schema.optionalKey<Schema.Number>;
      readonly runtimeId: Schema.String;
      readonly _tag: Schema.Literal<"QueueSample">;
      readonly queueId: Schema.String;
      readonly ownerId: Schema.optionalKey<Schema.String>;
      readonly kind: Schema.Literals<readonly ["rpc-server", "rpc-client"]>;
      readonly size: Schema.Number;
      readonly capacity: Schema.Number;
      readonly activeRequests: Schema.optionalKey<Schema.Number>;
    }>,
    Schema.Struct<{
      readonly runtime: Schema.Literals<
        readonly ["main", "worker", "utility", "renderer", "unknown"]
      >;
      readonly threadId: Schema.Number;
      readonly processId: Schema.optionalKey<Schema.Number>;
      readonly runtimeId: Schema.String;
      readonly _tag: Schema.Literal<"QueueClosed">;
      readonly queueId: Schema.String;
    }>,
  ]
>;
type Observation = typeof Observation.Type;
```

#### `Diagnostics.Placement`

```ts
const Placement: Schema.Struct<{
  runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
  threadId: Schema.Number;
  processId: Schema.optionalKey<Schema.Number>;
  runtimeId: Schema.String;
}>;
type Placement = typeof Placement.Type;
```

#### `Diagnostics.QueueClosed`

```ts
const QueueClosed: Schema.Struct<{
  readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
  readonly threadId: Schema.Number;
  readonly processId: Schema.optionalKey<Schema.Number>;
  readonly runtimeId: Schema.String;
  readonly _tag: Schema.Literal<"QueueClosed">;
  readonly queueId: Schema.String;
}>;
type QueueClosed = typeof QueueClosed.Type;
```

#### `Diagnostics.QueueSample`

```ts
const QueueSample: Schema.Struct<{
  readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
  readonly threadId: Schema.Number;
  readonly processId: Schema.optionalKey<Schema.Number>;
  readonly runtimeId: Schema.String;
  readonly _tag: Schema.Literal<"QueueSample">;
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
const ResourceChanged: Schema.Struct<{
  readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
  readonly threadId: Schema.Number;
  readonly processId: Schema.optionalKey<Schema.Number>;
  readonly runtimeId: Schema.String;
  readonly _tag: Schema.Literal<"ResourceChanged">;
  readonly resourceId: Schema.String;
  readonly ownerId: Schema.String;
  readonly clientId: Schema.Number;
  readonly state: Schema.Literals<readonly ["acquiring", "ready", "releasing"]>;
}>;
type ResourceChanged = typeof ResourceChanged.Type;
```

#### `Diagnostics.ResourceClosed`

```ts
const ResourceClosed: Schema.Struct<{
  readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
  readonly threadId: Schema.Number;
  readonly processId: Schema.optionalKey<Schema.Number>;
  readonly runtimeId: Schema.String;
  readonly _tag: Schema.Literal<"ResourceClosed">;
  readonly resourceId: Schema.String;
  readonly ownerId: Schema.String;
  readonly clientId: Schema.Number;
  readonly outcome: Schema.Literals<readonly ["success", "failure", "interrupted", "disconnected"]>;
  readonly reason: Schema.String;
}>;
type ResourceClosed = typeof ResourceClosed.Type;
```

#### `Diagnostics.runtimeHealth`

Start a scoped timer-lateness sampler when the diagnostics sink opted into tracing.

```ts
const runtimeHealth: (options?: HealthOptions) => Effect.Effect<void, never, Scope.Scope>;
```

#### `Diagnostics.RuntimeSample`

```ts
const RuntimeSample: Schema.Struct<{
  readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
  readonly threadId: Schema.Number;
  readonly processId: Schema.optionalKey<Schema.Number>;
  readonly runtimeId: Schema.String;
  readonly _tag: Schema.Literal<"RuntimeSample">;
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
const TraceEvent: Schema.Struct<{
  readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
  readonly threadId: Schema.Number;
  readonly processId: Schema.optionalKey<Schema.Number>;
  readonly runtimeId: Schema.String;
  readonly _tag: Schema.Literal<"TraceEvent">;
  readonly traceId: Schema.String;
  readonly spanId: Schema.String;
  readonly name: Schema.String;
  readonly time: Schema.String;
}>;
type TraceEvent = typeof TraceEvent.Type;
```

#### `Diagnostics.TraceSpan`

```ts
const TraceSpan: Schema.Struct<{
  readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
  readonly threadId: Schema.Number;
  readonly processId: Schema.optionalKey<Schema.Number>;
  readonly runtimeId: Schema.String;
  readonly _tag: Schema.Literal<"TraceSpan">;
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
const TransferProgress: Schema.Struct<{
  readonly runtime: Schema.Literals<readonly ["main", "worker", "utility", "renderer", "unknown"]>;
  readonly threadId: Schema.Number;
  readonly processId: Schema.optionalKey<Schema.Number>;
  readonly runtimeId: Schema.String;
  readonly ownerId: Schema.String;
  readonly clientId: Schema.Number;
  readonly requestId: Schema.String;
  readonly _tag: Schema.Literal<"TransferProgress">;
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
  readonly type: Schema.optionalKey<
    Schema.Literals<readonly ["none", "info", "error", "question", "warning"]>
  >;
  readonly title: Schema.optionalKey<Schema.String>;
  readonly detail: Schema.optionalKey<Schema.String>;
  readonly defaultId: Schema.optionalKey<Schema.Number>;
  readonly cancelId: Schema.optionalKey<Schema.Number>;
  readonly checkbox: Schema.optionalKey<
    Schema.Struct<{
      readonly label: Schema.String;
      readonly checked: Schema.optionalKey<Schema.Boolean>;
    }>
  >;
  readonly noLink: Schema.optionalKey<Schema.Boolean>;
  readonly normalizeAccessKeys: Schema.optionalKey<Schema.Boolean>;
}>;
type MessageOptions = typeof MessageOptions.Type;
```

#### `Dialog.MessageResult`

```ts
const MessageResult: Schema.Struct<{
  readonly response: Schema.Number;
  readonly checkboxChecked: Schema.Boolean;
}>;
type MessageResult = typeof MessageResult.Type;
```

#### `Dialog.OpenOptions`

```ts
const OpenOptions: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly title: Schema.optionalKey<Schema.String>;
      readonly defaultPath: Schema.optionalKey<Schema.String>;
      readonly buttonLabel: Schema.optionalKey<Schema.String>;
      readonly multiple: Schema.optionalKey<Schema.Boolean>;
      readonly mode: Schema.Literal<"file">;
      readonly filters: Schema.optionalKey<
        Schema.NonEmptyArray<
          Schema.Struct<{
            readonly name: Schema.String;
            readonly extensions: Schema.NonEmptyArray<Schema.String>;
          }>
        >
      >;
    }>,
    Schema.Struct<{
      readonly title: Schema.optionalKey<Schema.String>;
      readonly defaultPath: Schema.optionalKey<Schema.String>;
      readonly buttonLabel: Schema.optionalKey<Schema.String>;
      readonly multiple: Schema.optionalKey<Schema.Boolean>;
      readonly mode: Schema.Literal<"directory">;
    }>,
  ]
>;
type OpenOptions = typeof OpenOptions.Type;
```

#### `Dialog.OpenResult`

```ts
const OpenResult: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"canceled">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"selected">;
      readonly paths: Schema.NonEmptyArray<Schema.String>;
    }>,
  ]
>;
type OpenResult = typeof OpenResult.Type;
```

#### `Dialog.SaveOptions`

```ts
const SaveOptions: Schema.Struct<{
  readonly title: Schema.optionalKey<Schema.String>;
  readonly defaultPath: Schema.optionalKey<Schema.String>;
  readonly buttonLabel: Schema.optionalKey<Schema.String>;
  readonly filters: Schema.optionalKey<
    Schema.NonEmptyArray<
      Schema.Struct<{
        readonly name: Schema.String;
        readonly extensions: Schema.NonEmptyArray<Schema.String>;
      }>
    >
  >;
}>;
type SaveOptions = typeof SaveOptions.Type;
```

#### `Dialog.SaveResult`

```ts
const SaveResult: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"canceled">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"selected">;
      readonly path: Schema.String;
    }>,
  ]
>;
type SaveResult = typeof SaveResult.Type;
```

### `Download`

#### `Download.Decision`

What happens to an offered download: `deny` cancels it, `save` writes to a path without a
dialog, and `prompt` lets Electron show its save dialog, with these options when given.

```ts
const Decision: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"deny">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"save">;
      readonly path: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"prompt">;
      readonly dialog: Schema.optionalKey<
        Schema.Struct<{
          readonly title: Schema.optionalKey<Schema.String>;
          readonly defaultPath: Schema.optionalKey<Schema.String>;
          readonly buttonLabel: Schema.optionalKey<Schema.String>;
          readonly filters: Schema.optionalKey<
            Schema.NonEmptyArray<
              Schema.Struct<{
                readonly name: Schema.String;
                readonly extensions: Schema.NonEmptyArray<Schema.String>;
              }>
            >
          >;
        }>
      >;
    }>,
  ]
>;
type Decision = typeof Decision.Type;
```

#### `Download.Handle`

```ts
interface Handle {
  readonly snapshot: Effect.Effect<State, SewedError, MainContext>;
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
  readonly totalBytes: Schema.Number;
  readonly sourceId: Schema.String;
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
const Outcome: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"completed">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"cancelled">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"interrupted">;
    }>,
  ]
>;
type Outcome = typeof Outcome.Type;
```

#### `Download.State`

```ts
const State: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly receivedBytes: Schema.Number;
      readonly totalBytes: Schema.Number;
      readonly percent: Schema.Number;
      readonly currentBytesPerSecond: Schema.Number;
      readonly canResume: Schema.Boolean;
      readonly paused: Schema.Boolean;
      readonly status: Schema.Literal<"pending">;
    }>,
    Schema.Struct<{
      readonly receivedBytes: Schema.Number;
      readonly totalBytes: Schema.Number;
      readonly percent: Schema.Number;
      readonly currentBytesPerSecond: Schema.Number;
      readonly canResume: Schema.Boolean;
      readonly paused: Schema.Boolean;
      readonly status: Schema.Literal<"active">;
      readonly phase: Schema.Literals<readonly ["progressing", "interrupted"]>;
    }>,
    Schema.Struct<{
      readonly receivedBytes: Schema.Number;
      readonly totalBytes: Schema.Number;
      readonly percent: Schema.Number;
      readonly currentBytesPerSecond: Schema.Number;
      readonly canResume: Schema.Boolean;
      readonly paused: Schema.Boolean;
      readonly status: Schema.Literal<"terminal">;
      readonly outcome: Schema.Literals<readonly ["completed", "cancelled", "interrupted"]>;
    }>,
  ]
>;
type State = typeof State.Type;
```

### `Extension`

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
interface Handle<A extends Automation.Declaration = {}
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
const protocol: RpcGroup.RpcGroup<
  | Rpc.Rpc<"back", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "capture",
      Schema.Struct<{
        readonly rect: Schema.optionalKey<
          Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>
        >;
        readonly stayHidden: Schema.optionalKey<Schema.Boolean>;
        readonly stayAwake: Schema.optionalKey<Schema.Boolean>;
      }>,
      Schema.Uint8Array,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "find",
      Schema.Struct<{
        text: Schema.String;
        options: Schema.optionalKey<
          Schema.Struct<{
            readonly forward: Schema.optionalKey<Schema.Boolean>;
            readonly matchCase: Schema.optionalKey<Schema.Boolean>;
          }>
        >;
      }>,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly activeMatchOrdinal: Schema.Int;
          readonly matches: Schema.Int;
          readonly selectionArea: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly finalUpdate: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "findNext",
      Schema.Struct<{
        forward: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"forward", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "history",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly index: Schema.Int;
          readonly entries: Schema.$Array<
            Schema.Struct<{
              readonly url: Schema.String;
              readonly title: Schema.String;
            }>
          >;
          readonly canGoBack: Schema.Boolean;
          readonly canGoForward: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "navigate",
      Schema.Struct<{
        url: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setZoom",
      Schema.Struct<{
        factor: Schema.Number;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "state",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly status: Schema.Literal<"idle">;
            }>,
            Schema.Struct<{
              readonly status: Schema.Literal<"loading">;
              readonly url: Schema.String;
            }>,
            Schema.Struct<{
              readonly status: Schema.Literal<"ready">;
              readonly url: Schema.String;
              readonly processId: Schema.Number;
            }>,
            Schema.Struct<{
              readonly status: Schema.Literal<"failed">;
              readonly url: Schema.String;
              readonly code: Schema.Number;
              readonly description: Schema.String;
            }>,
            Schema.Struct<{
              readonly status: Schema.Literal<"gone">;
              readonly reason: Schema.String;
              readonly exitCode: Schema.Number;
            }>,
          ]
        >,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "stopFind",
      Schema.Struct<{
        action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "zoom",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly factor: Schema.Number;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
>;
```

#### `GuestView.Settings`

```ts
const Settings: Schema.Struct<{
  readonly navigation: Schema.$Array<
    Schema.Union<
      readonly [
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly kind: Schema.Literal<"origin">;
              readonly origin: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"document">;
              readonly url: Schema.String;
            }>,
          ]
        >,
        Schema.String,
      ]
    >
  >;
  readonly webRtc: Schema.optionalKey<
    Schema.Literals<readonly ["default", "publicInterfaceOnly", "disableNonProxiedUdp"]>
  >;
  readonly input: Schema.optionalKey<Schema.Literals<readonly ["allow", "block"]>>;
  readonly backgroundThrottling: Schema.optionalKey<Schema.Boolean>;
  readonly automation: Schema.optionalKey<
    Schema.Struct<{
      readonly evaluate: Schema.optionalKey<Schema.Literal<true>>;
      readonly devtools: Schema.optionalKey<Schema.NonEmptyArray<Schema.String>>;
      readonly input: Schema.optionalKey<Schema.Literal<true>>;
    }>
  >;
}>;
type Settings = typeof Settings.Type;
```

#### `GuestView.tab`

A guest's hosted tab as one capability. Like a window's controls, it belongs to an owner:
`GuestView.native(guest, policy)` in `sewed/main` carries the host policy for one acquired view,
and `Capability.client` reaches it from a document. The policy still decides `navigate` and
`capture`; everything else on the protocol is always served.

```ts
const tab: Capability.Capability<
  | Rpc.Rpc<"back", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "capture",
      Schema.Struct<{
        readonly rect: Schema.optionalKey<
          Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>
        >;
        readonly stayHidden: Schema.optionalKey<Schema.Boolean>;
        readonly stayAwake: Schema.optionalKey<Schema.Boolean>;
      }>,
      Schema.Uint8Array,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "find",
      Schema.Struct<{
        text: Schema.String;
        options: Schema.optionalKey<
          Schema.Struct<{
            readonly forward: Schema.optionalKey<Schema.Boolean>;
            readonly matchCase: Schema.optionalKey<Schema.Boolean>;
          }>
        >;
      }>,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly activeMatchOrdinal: Schema.Int;
          readonly matches: Schema.Int;
          readonly selectionArea: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly finalUpdate: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "findNext",
      Schema.Struct<{
        forward: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"forward", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "history",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly index: Schema.Int;
          readonly entries: Schema.$Array<
            Schema.Struct<{
              readonly url: Schema.String;
              readonly title: Schema.String;
            }>
          >;
          readonly canGoBack: Schema.Boolean;
          readonly canGoForward: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "navigate",
      Schema.Struct<{
        url: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setZoom",
      Schema.Struct<{
        factor: Schema.Number;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "state",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly status: Schema.Literal<"idle">;
            }>,
            Schema.Struct<{
              readonly status: Schema.Literal<"loading">;
              readonly url: Schema.String;
            }>,
            Schema.Struct<{
              readonly status: Schema.Literal<"ready">;
              readonly url: Schema.String;
              readonly processId: Schema.Number;
            }>,
            Schema.Struct<{
              readonly status: Schema.Literal<"failed">;
              readonly url: Schema.String;
              readonly code: Schema.Number;
              readonly description: Schema.String;
            }>,
            Schema.Struct<{
              readonly status: Schema.Literal<"gone">;
              readonly reason: Schema.String;
              readonly exitCode: Schema.Number;
            }>,
          ]
        >,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "stopFind",
      Schema.Struct<{
        action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "zoom",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly factor: Schema.Number;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >,
  "sewed/binding/guest-tab"
>;
```

#### `GuestView.WebRtcPolicy`

```ts
const WebRtcPolicy: Schema.Literals<
  readonly ["default", "publicInterfaceOnly", "disableNonProxiedUdp"]
>;
type WebRtcPolicy = typeof WebRtcPolicy.Type;
```

### `InAppPurchase`

#### `InAppPurchase.Product`

```ts
const Product: Schema.Struct<{
  readonly productIdentifier: Schema.String;
  readonly localizedTitle: Schema.String;
  readonly localizedDescription: Schema.String;
  readonly price: Schema.Number;
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
  readonly transactionState: Schema.Literals<
    readonly ["purchasing", "purchased", "failed", "restored", "deferred"]
  >;
  readonly errorCode: Schema.Number;
  readonly errorMessage: Schema.String;
  readonly productIdentifier: Schema.String;
  readonly quantity: Schema.Number;
}>;
type Transaction = typeof Transaction.Type;
```

#### `InAppPurchase.TransactionState`

```ts
const TransactionState: Schema.Literals<
  readonly ["purchasing", "purchased", "failed", "restored", "deferred"]
>;
type TransactionState = typeof TransactionState.Type;
```

### `Launch`

#### `Launch.Request`

How this process was launched: its own arguments, or a file or URL the platform handed it.

```ts
const Request: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"initial">;
      readonly arguments: Schema.$Array<Schema.String>;
      readonly workingDirectory: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"file">;
      readonly path: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"url">;
      readonly url: Schema.String;
    }>,
  ]
>;
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
const ApplicationItem: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly id: Schema.String;
      readonly label: Schema.String;
      readonly enabled: Schema.optionalKey<Schema.Boolean>;
      readonly kind: Schema.Literal<"command">;
      readonly accelerator: Schema.optionalKey<Schema.String>;
    }>,
    Schema.Struct<{
      readonly id: Schema.String;
      readonly label: Schema.String;
      readonly enabled: Schema.optionalKey<Schema.Boolean>;
      readonly kind: Schema.Literal<"checkbox">;
      readonly checked: Schema.Boolean;
      readonly accelerator: Schema.optionalKey<Schema.String>;
    }>,
    Schema.Struct<{
      readonly id: Schema.String;
      readonly label: Schema.String;
      readonly enabled: Schema.optionalKey<Schema.Boolean>;
      readonly kind: Schema.Literal<"radio">;
      readonly checked: Schema.Boolean;
      readonly accelerator: Schema.optionalKey<Schema.String>;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"separator">;
    }>,
    Schema.Codec<ApplicationSubmenu, ApplicationSubmenu, never, never>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"role">;
      readonly role: Schema.Literals<
        readonly [
          "appMenu",
          "fileMenu",
          "editMenu",
          "viewMenu",
          "windowMenu",
          "undo",
          "redo",
          "cut",
          "copy",
          "paste",
          "pasteAndMatchStyle",
          "delete",
          "selectAll",
          "reload",
          "forceReload",
          "toggleDevTools",
          "resetZoom",
          "zoomIn",
          "zoomOut",
          "togglefullscreen",
          "minimize",
          "close",
          "about",
          "quit",
        ]
      >;
    }>,
  ]
>;
type ApplicationItem = typeof ApplicationItem.Type;
```

#### `Menu.ApplicationOptions`

```ts
const ApplicationOptions: Schema.Struct<{
  readonly items: Schema.NonEmptyArray<
    Schema.Union<
      readonly [
        Schema.Codec<ApplicationSubmenu, ApplicationSubmenu, never, never>,
        Schema.Struct<{
          readonly kind: Schema.Literal<"role">;
          readonly role: Schema.Literals<
            readonly ["appMenu", "fileMenu", "editMenu", "viewMenu", "windowMenu"]
          >;
        }>,
      ]
    >
  >;
}>;
type ApplicationOptions = typeof ApplicationOptions.Type;
```

#### `Menu.Item`

```ts
const Item: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly id: Schema.String;
      readonly label: Schema.String;
      readonly enabled: Schema.optionalKey<Schema.Boolean>;
      readonly kind: Schema.Literal<"command">;
    }>,
    Schema.Struct<{
      readonly id: Schema.String;
      readonly label: Schema.String;
      readonly enabled: Schema.optionalKey<Schema.Boolean>;
      readonly kind: Schema.Literal<"checkbox">;
      readonly checked: Schema.Boolean;
    }>,
    Schema.Struct<{
      readonly id: Schema.String;
      readonly label: Schema.String;
      readonly enabled: Schema.optionalKey<Schema.Boolean>;
      readonly kind: Schema.Literal<"radio">;
      readonly checked: Schema.Boolean;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"separator">;
    }>,
    Schema.Codec<Submenu, Submenu, never, never>,
  ]
>;
type Item = typeof Item.Type;
```

#### `Menu.PopupOptions`

```ts
const PopupOptions: Schema.Struct<{
  readonly items: Schema.NonEmptyArray<
    Schema.suspend<
      Schema.Codec<
        | Submenu
        | {
            readonly id: string;
            readonly label: string;
            readonly enabled?: boolean;
            readonly kind: "command";
          }
        | {
            readonly id: string;
            readonly label: string;
            readonly enabled?: boolean;
            readonly kind: "checkbox";
            readonly checked: boolean;
          }
        | {
            readonly id: string;
            readonly label: string;
            readonly enabled?: boolean;
            readonly kind: "radio";
            readonly checked: boolean;
          }
        | {
            readonly kind: "separator";
          },
        | Submenu
        | {
            readonly id: string;
            readonly label: string;
            readonly enabled?: boolean;
            readonly kind: "command";
          }
        | {
            readonly id: string;
            readonly label: string;
            readonly enabled?: boolean;
            readonly kind: "checkbox";
            readonly checked: boolean;
          }
        | {
            readonly id: string;
            readonly label: string;
            readonly enabled?: boolean;
            readonly kind: "radio";
            readonly checked: boolean;
          }
        | {
            readonly kind: "separator";
          },
        never,
        never
      >
    >
  >;
  readonly position: Schema.optionalKey<
    Schema.Struct<{
      readonly x: Schema.Number;
      readonly y: Schema.Number;
    }>
  >;
}>;
type PopupOptions = typeof PopupOptions.Type;
```

#### `Menu.PopupResult`

```ts
const PopupResult: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"dismissed">;
    }>,
    Schema.Union<
      readonly [
        Schema.Struct<{
          readonly kind: Schema.Literal<"command">;
          readonly id: Schema.String;
        }>,
        Schema.Struct<{
          readonly kind: Schema.Literal<"checkbox">;
          readonly id: Schema.String;
          readonly checked: Schema.Boolean;
        }>,
        Schema.Struct<{
          readonly kind: Schema.Literal<"radio">;
          readonly id: Schema.String;
        }>,
      ]
    >,
  ]
>;
type PopupResult = typeof PopupResult.Type;
```

#### `Menu.Selection`

```ts
const Selection: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"command">;
      readonly id: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"checkbox">;
      readonly id: Schema.String;
      readonly checked: Schema.Boolean;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"radio">;
      readonly id: Schema.String;
    }>,
  ]
>;
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
const capability: Capability.Capability<
  | Rpc.Rpc<
      "setSource",
      Schema.Struct<{
        source: Schema.Literals<readonly ["system", "light", "dark"]>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "state",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly source: Schema.Literals<readonly ["system", "light", "dark"]>;
          readonly shouldUseDarkColors: Schema.Boolean;
          readonly shouldUseHighContrastColors: Schema.Boolean;
          readonly shouldUseInvertedColorScheme: Schema.Boolean;
          readonly inForcedColorsMode: Schema.Boolean;
          readonly prefersReducedTransparency: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >,
  "sewed/binding/native-theme"
>;
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
const protocol: RpcGroup.RpcGroup<
  | Rpc.Rpc<
      "setSource",
      Schema.Struct<{
        source: Schema.Literals<readonly ["system", "light", "dark"]>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "state",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly source: Schema.Literals<readonly ["system", "light", "dark"]>;
          readonly shouldUseDarkColors: Schema.Boolean;
          readonly shouldUseHighContrastColors: Schema.Boolean;
          readonly shouldUseInvertedColorScheme: Schema.Boolean;
          readonly inForcedColorsMode: Schema.Boolean;
          readonly prefersReducedTransparency: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
>;
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
const Policy: Decision.Policy<
  readonly (
    | string
    | {
        readonly kind: "origin";
        readonly origin: string;
      }
    | {
        readonly kind: "document";
        readonly url: string;
      }
  )[],
  {
    readonly url: string;
  },
  "allow"
>;
```

#### `Navigation.Rules`

A navigation rule: an origin/document rule (`UrlRule.Rule`) or a Chromium match pattern
(`WebRequest.Pattern`, such as `https://*.example.com/*`). One shape replaces the two separate
navigation schemas `WebContents.NavigationPolicy` and `GuestView.NavigationPolicy` used to be,
so a policy compiled from it works identically wherever a navigation decidable is gated by one.

```ts
const Rules: Schema.$Array<
  Schema.Union<
    readonly [
      Schema.Union<
        readonly [
          Schema.Struct<{
            readonly kind: Schema.Literal<"origin">;
            readonly origin: Schema.String;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"document">;
            readonly url: Schema.String;
          }>,
        ]
      >,
      Schema.String,
    ]
  >
>;
type Rules = typeof Rules.Type;
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

#### `Net.ResolvedHost`

```ts
const ResolvedHost: Schema.Struct<{
  readonly endpoints: Schema.$Array<
    Schema.Struct<{
      readonly address: Schema.String;
      readonly family: Schema.Literals<readonly ["ipv4", "ipv6", "unspec"]>;
    }>
  >;
}>;
type ResolvedHost = typeof ResolvedHost.Type;
```

#### `Net.ResolveHostOptions`

Options for resolving a host through a session's resolver.

```ts
const ResolveHostOptions: Schema.Struct<{
  readonly queryType: Schema.optionalKey<Schema.Literals<readonly ["A", "AAAA"]>>;
  readonly source: Schema.optionalKey<
    Schema.Literals<readonly ["any", "system", "dns", "mdns", "localOnly"]>
  >;
  readonly cacheUsage: Schema.optionalKey<
    Schema.Literals<readonly ["allowed", "staleAllowed", "disallowed"]>
  >;
  readonly secureDnsPolicy: Schema.optionalKey<Schema.Literals<readonly ["allow", "disable"]>>;
}>;
type ResolveHostOptions = typeof ResolveHostOptions.Type;
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
  readonly captureMode: Schema.optionalKey<
    Schema.Literals<readonly ["default", "includeSensitive", "everything"]>
  >;
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

#### `Notification.capability`

The whole notification surface as one capability: `Notification.native` in `sewed/main` provides
it, `Capability.client` reaches it from a document, and `Testing.Notification.memory` stands in
for tests. The surface carries no policy; the options are checked on every call.

```ts
const capability: Capability.Capability<
  Rpc.Rpc<
    "show",
    Schema.Struct<{
      readonly title: Schema.String;
      readonly body: Schema.optionalKey<Schema.String>;
      readonly subtitle: Schema.optionalKey<Schema.String>;
      readonly silent: Schema.optionalKey<Schema.Boolean>;
      readonly urgency: Schema.optionalKey<Schema.Literals<readonly ["normal", "critical", "low"]>>;
      readonly timeout: Schema.optionalKey<Schema.Literals<readonly ["default", "never"]>>;
      readonly icon: Schema.optionalKey<Schema.String>;
      readonly actions: Schema.optionalKey<
        Schema.NonEmptyArray<
          Schema.Struct<{
            readonly id: Schema.String;
            readonly text: Schema.String;
          }>
        >
      >;
      readonly reply: Schema.optionalKey<
        Schema.Struct<{
          readonly placeholder: Schema.String;
        }>
      >;
      readonly closeButtonText: Schema.optionalKey<Schema.String>;
    }>,
    RpcSchema.Stream<
      Schema.Union<
        readonly [
          Schema.Struct<{
            readonly kind: Schema.Literal<"shown">;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"clicked">;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"action">;
            readonly id: Schema.String;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"replied">;
            readonly text: Schema.String;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"closed">;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"failed">;
            readonly message: Schema.String;
          }>,
        ]
      >,
      typeof SewedError
    >,
    Schema.Never,
    never,
    never
  >,
  "sewed/binding/notification"
>;
```

#### `Notification.Event`

```ts
const Event: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"shown">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"clicked">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"action">;
      readonly id: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"replied">;
      readonly text: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"closed">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"failed">;
      readonly message: Schema.String;
    }>,
  ]
>;
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
  readonly actions: Schema.optionalKey<
    Schema.NonEmptyArray<
      Schema.Struct<{
        readonly id: Schema.String;
        readonly text: Schema.String;
      }>
    >
  >;
  readonly reply: Schema.optionalKey<
    Schema.Struct<{
      readonly placeholder: Schema.String;
    }>
  >;
  readonly closeButtonText: Schema.optionalKey<Schema.String>;
}>;
type Options = typeof Options.Type;
```

#### `Notification.protocol`

One request is one notification: its stream ends when the notification closes, and interrupting the request closes it.

```ts
const protocol: RpcGroup.RpcGroup<
  Rpc.Rpc<
    "show",
    Schema.Struct<{
      readonly title: Schema.String;
      readonly body: Schema.optionalKey<Schema.String>;
      readonly subtitle: Schema.optionalKey<Schema.String>;
      readonly silent: Schema.optionalKey<Schema.Boolean>;
      readonly urgency: Schema.optionalKey<Schema.Literals<readonly ["normal", "critical", "low"]>>;
      readonly timeout: Schema.optionalKey<Schema.Literals<readonly ["default", "never"]>>;
      readonly icon: Schema.optionalKey<Schema.String>;
      readonly actions: Schema.optionalKey<
        Schema.NonEmptyArray<
          Schema.Struct<{
            readonly id: Schema.String;
            readonly text: Schema.String;
          }>
        >
      >;
      readonly reply: Schema.optionalKey<
        Schema.Struct<{
          readonly placeholder: Schema.String;
        }>
      >;
      readonly closeButtonText: Schema.optionalKey<Schema.String>;
    }>,
    RpcSchema.Stream<
      Schema.Union<
        readonly [
          Schema.Struct<{
            readonly kind: Schema.Literal<"shown">;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"clicked">;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"action">;
            readonly id: Schema.String;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"replied">;
            readonly text: Schema.String;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"closed">;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"failed">;
            readonly message: Schema.String;
          }>,
        ]
      >,
      typeof SewedError
    >,
    Schema.Never,
    never,
    never
  >
>;
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

#### `Permission.Name`

```ts
const Name: Schema.Literals<
  readonly [
    "notifications",
    "geolocation",
    "fullscreen",
    "pointerLock",
    "media",
    "clipboard-read",
    "clipboard-sanitized-write",
    "persistent-storage",
    "screen-wake-lock",
    "hid",
    "serial",
    "usb",
  ]
>;
type Name = typeof Name.Type;
```

#### `Permission.Policy`

A permission policy: it names the least it needs from an event —
`{ name, origin, document }`, the flat shape `Decidables.Session.Permission` shares between a
permission check and a device check. An **origin** rule is answered from `origin` alone, and
misses when it is `null` (an opaque origin — `file:`, `data:` — names nothing); a **document**
rule is answered only from `document`, so a device check (`document: null`) is never granted by a
document rule, even one whose document happens to key the same origin. This is deliberately
tighter than base, where a root-document rule granted a device check because its origin URL
happened to share that document key.

```ts
const Policy: Decision.Policy<
  readonly (
    | {
        readonly kind: "origin";
        readonly origin: string;
        readonly permissions: readonly [
          (
            | "clipboard-read"
            | "clipboard-sanitized-write"
            | "fullscreen"
            | "geolocation"
            | "hid"
            | "media"
            | "notifications"
            | "persistent-storage"
            | "pointerLock"
            | "screen-wake-lock"
            | "serial"
            | "usb"
          ),
          ...(
            | "clipboard-read"
            | "clipboard-sanitized-write"
            | "fullscreen"
            | "geolocation"
            | "hid"
            | "media"
            | "notifications"
            | "persistent-storage"
            | "pointerLock"
            | "screen-wake-lock"
            | "serial"
            | "usb"
          )[],
        ];
      }
    | {
        readonly kind: "document";
        readonly url: string;
        readonly permissions: readonly [
          (
            | "clipboard-read"
            | "clipboard-sanitized-write"
            | "fullscreen"
            | "geolocation"
            | "hid"
            | "media"
            | "notifications"
            | "persistent-storage"
            | "pointerLock"
            | "screen-wake-lock"
            | "serial"
            | "usb"
          ),
          ...(
            | "clipboard-read"
            | "clipboard-sanitized-write"
            | "fullscreen"
            | "geolocation"
            | "hid"
            | "media"
            | "notifications"
            | "persistent-storage"
            | "pointerLock"
            | "screen-wake-lock"
            | "serial"
            | "usb"
          )[],
        ];
      }
  )[],
  {
    readonly name: string;
    readonly origin: string | null;
    readonly document: string | null;
  },
  "allow"
>;
```

#### `Permission.Rule`

```ts
const Rule: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"origin">;
      readonly origin: Schema.String;
      readonly permissions: Schema.NonEmptyArray<
        Schema.Literals<
          readonly [
            "notifications",
            "geolocation",
            "fullscreen",
            "pointerLock",
            "media",
            "clipboard-read",
            "clipboard-sanitized-write",
            "persistent-storage",
            "screen-wake-lock",
            "hid",
            "serial",
            "usb",
          ]
        >
      >;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"document">;
      readonly url: Schema.String;
      readonly permissions: Schema.NonEmptyArray<
        Schema.Literals<
          readonly [
            "notifications",
            "geolocation",
            "fullscreen",
            "pointerLock",
            "media",
            "clipboard-read",
            "clipboard-sanitized-write",
            "persistent-storage",
            "screen-wake-lock",
            "hid",
            "serial",
            "usb",
          ]
        >
      >;
    }>,
  ]
>;
```

#### `Permission.Rules`

```ts
const Rules: Schema.$Array<
  Schema.Union<
    readonly [
      Schema.Struct<{
        readonly kind: Schema.Literal<"origin">;
        readonly origin: Schema.String;
        readonly permissions: Schema.NonEmptyArray<
          Schema.Literals<
            readonly [
              "notifications",
              "geolocation",
              "fullscreen",
              "pointerLock",
              "media",
              "clipboard-read",
              "clipboard-sanitized-write",
              "persistent-storage",
              "screen-wake-lock",
              "hid",
              "serial",
              "usb",
            ]
          >
        >;
      }>,
      Schema.Struct<{
        readonly kind: Schema.Literal<"document">;
        readonly url: Schema.String;
        readonly permissions: Schema.NonEmptyArray<
          Schema.Literals<
            readonly [
              "notifications",
              "geolocation",
              "fullscreen",
              "pointerLock",
              "media",
              "clipboard-read",
              "clipboard-sanitized-write",
              "persistent-storage",
              "screen-wake-lock",
              "hid",
              "serial",
              "usb",
            ]
          >
        >;
      }>,
    ]
  >
>;
type Rules = typeof Rules.Type;
```

### `PowerMonitor`

#### `PowerMonitor.capability`

The whole power surface as one capability: `PowerMonitor.native` in `sewed/main` provides it,
`Capability.client` reaches it from a document, and `Testing.PowerMonitor.memory` stands in for
tests. The surface carries no policy; the idle threshold is checked on every call.

```ts
const capability: Capability.Capability<
  | Rpc.Rpc<
      "events",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly kind: Schema.Literal<"suspend">;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"resume">;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"power-source">;
              readonly onBattery: Schema.Boolean;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"screen">;
              readonly locked: Schema.Boolean;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"user">;
              readonly active: Schema.Boolean;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"shutdown">;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"thermal">;
              readonly state: Schema.Literals<
                readonly ["unknown", "nominal", "fair", "serious", "critical"]
              >;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"speed-limit">;
              readonly limit: Schema.Number;
            }>,
          ]
        >,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "state",
      Schema.Struct<{
        idleThresholdSeconds: Schema.Int;
      }>,
      Schema.Struct<{
        readonly onBattery: Schema.Boolean;
        readonly idleSeconds: Schema.Number;
        readonly idleState: Schema.Literals<readonly ["active", "idle", "locked", "unknown"]>;
        readonly thermal: Schema.Literals<
          readonly ["unknown", "nominal", "fair", "serious", "critical"]
        >;
      }>,
      typeof SewedError,
      never,
      never
    >,
  "sewed/binding/power-monitor"
>;
```

#### `PowerMonitor.Event`

```ts
const Event: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"suspend">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"resume">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"power-source">;
      readonly onBattery: Schema.Boolean;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"screen">;
      readonly locked: Schema.Boolean;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"user">;
      readonly active: Schema.Boolean;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"shutdown">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"thermal">;
      readonly state: Schema.Literals<
        readonly ["unknown", "nominal", "fair", "serious", "critical"]
      >;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"speed-limit">;
      readonly limit: Schema.Number;
    }>,
  ]
>;
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
const protocol: RpcGroup.RpcGroup<
  | Rpc.Rpc<
      "events",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly kind: Schema.Literal<"suspend">;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"resume">;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"power-source">;
              readonly onBattery: Schema.Boolean;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"screen">;
              readonly locked: Schema.Boolean;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"user">;
              readonly active: Schema.Boolean;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"shutdown">;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"thermal">;
              readonly state: Schema.Literals<
                readonly ["unknown", "nominal", "fair", "serious", "critical"]
              >;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"speed-limit">;
              readonly limit: Schema.Number;
            }>,
          ]
        >,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "state",
      Schema.Struct<{
        idleThresholdSeconds: Schema.Int;
      }>,
      Schema.Struct<{
        readonly onBattery: Schema.Boolean;
        readonly idleSeconds: Schema.Number;
        readonly idleState: Schema.Literals<readonly ["active", "idle", "locked", "unknown"]>;
        readonly thermal: Schema.Literals<
          readonly ["unknown", "nominal", "fair", "serious", "critical"]
        >;
      }>,
      typeof SewedError,
      never,
      never
    >
>;
```

#### `PowerMonitor.State`

```ts
const State: Schema.Struct<{
  readonly onBattery: Schema.Boolean;
  readonly idleSeconds: Schema.Number;
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

### `Proxy`

#### `Proxy.Config`

A session's proxy configuration, one mode at a time.

```ts
const Config: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly mode: Schema.Literal<"direct">;
    }>,
    Schema.Struct<{
      readonly mode: Schema.Literal<"system">;
    }>,
    Schema.Struct<{
      readonly mode: Schema.Literal<"auto_detect">;
    }>,
    Schema.Struct<{
      readonly mode: Schema.Literal<"pac_script">;
      readonly pacScript: Schema.String;
    }>,
    Schema.Struct<{
      readonly mode: Schema.Literal<"fixed_servers">;
      readonly proxyRules: Schema.String;
      readonly proxyBypassRules: Schema.optionalKey<Schema.String>;
    }>,
  ]
>;
type Config = typeof Config.Type;
```

### `Remote`

#### `Remote.acquire`

```ts
const acquire: <
  Payload extends Schema.Top,
  Rpcs extends Rpc.Any,
  Failure extends Schema.Top,
  Wire extends Rpc.Any,
>(
  definition: Definition<Payload, Rpcs, Failure, Wire>,
  slot: Slot<NoInfer<Wire>>,
  payload: Payload["~type.make.in"],
) => Effect.Effect<
  Handle<Rpcs, Failure>,
  RemoteError<Failure>,
  | RuntimeContext.ClientContext
  | Scope.Scope
  | Rpc.MiddlewareClient<Wire>
  | Payload["EncodingServices"]
  | Failure["DecodingServices"]
>;
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
const layer: <
  Payload extends Schema.Top,
  Rpcs extends Rpc.Any,
  Failure extends Schema.Top,
  Wire extends Rpc.Any,
  R,
>(
  definition: Definition<Payload, Rpcs, Failure, Wire>,
  build: (
    payload: Payload["Type"],
  ) => Layer.Layer<
    NoInfer<Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs>>,
    Failure["Type"] | SewedError,
    R
  >,
) => Layer.Layer<HandlerServices<Wire>, Failure["Type"] | SewedError, R | Rpc.ServicesServer<Wire>>;
```

#### `Remote.make`

```ts
const make: <
  Payload extends Schema.Top,
  Rpcs extends Rpc.Any,
  Failure extends Schema.Top = Schema.Never,
>(options: {
  readonly payload: Payload;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly error?: Failure | undefined;
}) => Definition<Payload, Rpcs, Failure, WireRpcs<Rpcs, Payload, Failure>>;
```

### `Renderer`

#### `Renderer.entry`

```ts
const entry: <Keys extends string>(
  url: URL,
  options: {
    readonly bindings: readonly Declaration<Keys>[];
  },
) => Entry<Keys>;
```

#### `Renderer.Entry`

The slot keys this document declares; main's `load` must bind exactly these.

```ts
interface Entry<Keys extends string = string> {
  readonly url: URL;
  readonly bindings: readonly Declaration<Keys>[];
}
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
const run: <E>(
  entry: Entry,
  setup: Effect.Effect<unknown, E, RendererContext | ClientContext | Scope.Scope>,
) => Fiber.Fiber<void, E | SewedError>;
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
  readonly bytes: Schema.Uint8Array;
}>;
type Sealed = typeof Sealed.Type;
```

### `Screen`

#### `Screen.Bounds`

```ts
const Bounds: Schema.Struct<{
  readonly x: Schema.Number;
  readonly y: Schema.Number;
  readonly width: Schema.Number;
  readonly height: Schema.Number;
}>;
type Bounds = typeof Bounds.Type;
```

#### `Screen.Change`

```ts
const Change: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"added">;
      readonly display: Schema.Struct<{
        readonly id: Schema.Number;
        readonly label: Schema.String;
        readonly bounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly workArea: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly scaleFactor: Schema.Number;
        readonly rotation: Schema.Number;
        readonly internal: Schema.Boolean;
      }>;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"removed">;
      readonly display: Schema.Struct<{
        readonly id: Schema.Number;
        readonly label: Schema.String;
        readonly bounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly workArea: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly scaleFactor: Schema.Number;
        readonly rotation: Schema.Number;
        readonly internal: Schema.Boolean;
      }>;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"metrics">;
      readonly display: Schema.Struct<{
        readonly id: Schema.Number;
        readonly label: Schema.String;
        readonly bounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly workArea: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly scaleFactor: Schema.Number;
        readonly rotation: Schema.Number;
        readonly internal: Schema.Boolean;
      }>;
      readonly metrics: Schema.$Array<Schema.String>;
    }>,
  ]
>;
type Change = typeof Change.Type;
```

#### `Screen.Display`

```ts
const Display: Schema.Struct<{
  readonly id: Schema.Number;
  readonly label: Schema.String;
  readonly bounds: Schema.Struct<{
    readonly x: Schema.Number;
    readonly y: Schema.Number;
    readonly width: Schema.Number;
    readonly height: Schema.Number;
  }>;
  readonly workArea: Schema.Struct<{
    readonly x: Schema.Number;
    readonly y: Schema.Number;
    readonly width: Schema.Number;
    readonly height: Schema.Number;
  }>;
  readonly scaleFactor: Schema.Number;
  readonly rotation: Schema.Number;
  readonly internal: Schema.Boolean;
}>;
type Display = typeof Display.Type;
```

#### `Screen.Point`

```ts
const Point: Schema.Struct<{
  readonly x: Schema.Number;
  readonly y: Schema.Number;
}>;
type Point = typeof Point.Type;
```

### `ServiceWorker`

#### `ServiceWorker.Event`

```ts
const Event: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"registered">;
      readonly scope: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"status">;
      readonly versionId: Schema.Number;
      readonly status: Schema.Literals<readonly ["starting", "running", "stopping", "stopped"]>;
    }>,
  ]
>;
type Event = typeof Event.Type;
```

#### `ServiceWorker.Info`

```ts
const Info: Schema.Struct<{
  readonly versionId: Schema.Number;
  readonly scriptUrl: Schema.String;
  readonly scope: Schema.String;
  readonly renderProcessId: Schema.Number;
}>;
type Info = typeof Info.Type;
```

#### `ServiceWorker.Status`

```ts
const Status: Schema.Literals<readonly ["starting", "running", "stopping", "stopped"]>;
type Status = typeof Status.Type;
```

### `SessionStorage`

#### `SessionStorage.ClearOptions`

```ts
const ClearOptions: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"session">;
      readonly storages: Schema.NonEmptyArray<
        Schema.Literals<
          readonly [
            "cookies",
            "filesystem",
            "indexdb",
            "localstorage",
            "shadercache",
            "serviceworkers",
            "cachestorage",
          ]
        >
      >;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"origin">;
      readonly origin: Schema.String;
      readonly storages: Schema.NonEmptyArray<
        Schema.Literals<readonly ["localstorage", "indexdb", "serviceworkers", "cachestorage"]>
      >;
    }>,
  ]
>;
type ClearOptions = typeof ClearOptions.Type;
```

#### `SessionStorage.OriginStorage`

```ts
const OriginStorage: Schema.Literals<
  readonly ["localstorage", "indexdb", "serviceworkers", "cachestorage"]
>;
```

#### `SessionStorage.Storage`

```ts
const Storage: Schema.Literals<
  readonly [
    "cookies",
    "filesystem",
    "indexdb",
    "localstorage",
    "shadercache",
    "serviceworkers",
    "cachestorage",
  ]
>;
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
const capability: Capability.Capability<
  | Rpc.Rpc<"beep", Schema.Struct<{}>, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "openExternal",
      Schema.Struct<{
        url: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "openPath",
      Schema.Struct<{
        path: Schema.String;
      }>,
      Schema.Struct<{
        readonly opened: Schema.Boolean;
        readonly message: Schema.String;
      }>,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "showItemInFolder",
      Schema.Struct<{
        path: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "trashItem",
      Schema.Struct<{
        path: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >,
  "sewed/binding/shell"
>;
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
  /** Origins, documents, and mail recipients `openExternal` may open. */
  readonly policy: Policy;
  /** Absolute directories whose contents `openPath`, `showItemInFolder`, and `trashItem` may touch. */
  readonly paths?: readonly string[];
}
```

#### `Shell.Policy`

Origins, documents, and exact mail recipients that `openExternal` may reach; nothing else opens.

```ts
const Policy: Schema.$Array<
  Schema.Union<
    readonly [
      Schema.Struct<{
        readonly kind: Schema.Literal<"origin">;
        readonly origin: Schema.String;
      }>,
      Schema.Struct<{
        readonly kind: Schema.Literal<"document">;
        readonly url: Schema.String;
      }>,
      Schema.Struct<{
        readonly kind: Schema.Literal<"mailto">;
        readonly address: Schema.String;
      }>,
    ]
  >
>;
type Policy = typeof Policy.Type;
```

#### `Shell.protocol`

```ts
const protocol: RpcGroup.RpcGroup<
  | Rpc.Rpc<"beep", Schema.Struct<{}>, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "openExternal",
      Schema.Struct<{
        url: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "openPath",
      Schema.Struct<{
        path: Schema.String;
      }>,
      Schema.Struct<{
        readonly opened: Schema.Boolean;
        readonly message: Schema.String;
      }>,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "showItemInFolder",
      Schema.Struct<{
        path: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "trashItem",
      Schema.Struct<{
        path: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
>;
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

#### `SystemPreferences.Change`

```ts
const Change: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"accent-color">;
      readonly color: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"color">;
    }>,
  ]
>;
type Change = typeof Change.Type;
```

#### `SystemPreferences.ColorName`

A Windows or macOS system color name; Electron validates the name itself.

```ts
const ColorName: Schema.String;
```

#### `SystemPreferences.MediaAccess`

```ts
const MediaAccess: Schema.Literals<
  readonly ["not-determined", "granted", "denied", "restricted", "unknown"]
>;
type MediaAccess = typeof MediaAccess.Type;
```

#### `SystemPreferences.MediaKind`

```ts
const MediaKind: Schema.Literals<readonly ["microphone", "camera", "screen"]>;
type MediaKind = typeof MediaKind.Type;
```

#### `SystemPreferences.SystemColor`

```ts
const SystemColor: Schema.Literals<
  readonly ["blue", "brown", "gray", "green", "orange", "pink", "purple", "red", "yellow"]
>;
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
const Interaction: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"click">;
      readonly id: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"slider">;
      readonly id: Schema.String;
      readonly value: Schema.Number;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"segment">;
      readonly id: Schema.String;
      readonly index: Schema.Int;
      readonly selected: Schema.Boolean;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"color">;
      readonly id: Schema.String;
      readonly color: Schema.String;
    }>,
  ]
>;
type Interaction = typeof Interaction.Type;
```

#### `TouchBar.Item`

```ts
type Item = Button | Label | Spacer | Slider | SegmentedControl | ColorPicker | Popover | Group;
const Item: Schema.Codec<Item>;
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
const SegmentStyle: Schema.Literals<
  readonly [
    "automatic",
    "rounded",
    "textured-rounded",
    "round-rect",
    "textured-square",
    "capsule",
    "small-square",
    "separated",
  ]
>;
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

#### `Tray.Event`

```ts
const Event: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"click">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"right-click">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"double-click">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"menu-selection">;
      readonly selection: Schema.Union<
        readonly [
          Schema.Struct<{
            readonly kind: Schema.Literal<"command">;
            readonly id: Schema.String;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"checkbox">;
            readonly id: Schema.String;
            readonly checked: Schema.Boolean;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"radio">;
            readonly id: Schema.String;
          }>,
        ]
      >;
    }>,
  ]
>;
type Event = typeof Event.Type;
```

#### `Tray.Icon`

```ts
const Icon: Schema.String;
type Icon = typeof Icon.Type;
```

#### `Tray.MenuOptions`

```ts
const MenuOptions: Schema.Codec<MenuOptionsValue>;
type MenuOptions = MenuOptionsValue;
```

#### `Tray.Options`

```ts
const Options: Schema.Struct<{
  readonly icon: Schema.String;
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
  readonly kind: Schema.Literals<
    readonly ["navigation", "redirect", "popup", "webview", "download"]
  >;
  readonly url: Schema.String;
}>;
type Blocked = typeof Blocked.Type;
```

#### `WebContents.CaptureOptions`

```ts
const CaptureOptions: Schema.Struct<{
  readonly rect: Schema.optionalKey<
    Schema.Struct<{
      readonly x: Schema.Number;
      readonly y: Schema.Number;
      readonly width: Schema.Number;
      readonly height: Schema.Number;
    }>
  >;
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
  readonly lineNumber: Schema.Number;
  readonly sourceId: Schema.String;
}>;
type ConsoleMessage = typeof ConsoleMessage.Type;
```

#### `WebContents.DevToolsOptions`

```ts
const DevToolsOptions: Schema.Struct<{
  readonly mode: Schema.optionalKey<
    Schema.Literals<readonly ["left", "right", "bottom", "undocked", "detach"]>
  >;
  readonly activate: Schema.optionalKey<Schema.Boolean>;
}>;
type DevToolsOptions = typeof DevToolsOptions.Type;
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
    readonly x: Schema.Number;
    readonly y: Schema.Number;
    readonly width: Schema.Number;
    readonly height: Schema.Number;
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

#### `WebContents.History`

```ts
const History: Schema.Struct<{
  readonly index: Schema.Int;
  readonly entries: Schema.$Array<
    Schema.Struct<{
      readonly url: Schema.String;
      readonly title: Schema.String;
    }>
  >;
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

#### `WebContents.PdfOptions`

```ts
const PdfOptions: Schema.Struct<{
  readonly landscape: Schema.optionalKey<Schema.Boolean>;
  readonly displayHeaderFooter: Schema.optionalKey<Schema.Boolean>;
  readonly printBackground: Schema.optionalKey<Schema.Boolean>;
  readonly scale: Schema.optionalKey<Schema.Number>;
  readonly pageSize: Schema.optionalKey<
    Schema.Union<
      readonly [
        Schema.Literals<
          readonly [
            "A0",
            "A1",
            "A2",
            "A3",
            "A4",
            "A5",
            "A6",
            "Legal",
            "Letter",
            "Tabloid",
            "Ledger",
          ]
        >,
        Schema.Struct<{
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>,
      ]
    >
  >;
  readonly margins: Schema.optionalKey<
    Schema.Struct<{
      readonly top: Schema.optionalKey<Schema.Number>;
      readonly bottom: Schema.optionalKey<Schema.Number>;
      readonly left: Schema.optionalKey<Schema.Number>;
      readonly right: Schema.optionalKey<Schema.Number>;
    }>
  >;
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
const PdfPageSize: Schema.Union<
  readonly [
    Schema.Literals<
      readonly ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "Legal", "Letter", "Tabloid", "Ledger"]
    >,
    Schema.Struct<{
      readonly width: Schema.Number;
      readonly height: Schema.Number;
    }>,
  ]
>;
type PdfPageSize = typeof PdfPageSize.Type;
```

#### `WebContents.PrintOptions`

```ts
const PrintOptions: Schema.Struct<{
  readonly silent: Schema.optionalKey<Schema.Boolean>;
  readonly printBackground: Schema.optionalKey<Schema.Boolean>;
  readonly deviceName: Schema.optionalKey<Schema.String>;
  readonly color: Schema.optionalKey<Schema.Boolean>;
  readonly landscape: Schema.optionalKey<Schema.Boolean>;
  readonly scaleFactor: Schema.optionalKey<Schema.Number>;
  readonly pagesPerSheet: Schema.optionalKey<Schema.Int>;
  readonly collate: Schema.optionalKey<Schema.Boolean>;
  readonly copies: Schema.optionalKey<Schema.Int>;
  readonly pageRanges: Schema.optionalKey<
    Schema.$Array<
      Schema.Struct<{
        readonly from: Schema.Int;
        readonly to: Schema.Int;
      }>
    >
  >;
  readonly duplexMode: Schema.optionalKey<
    Schema.Literals<readonly ["simplex", "shortEdge", "longEdge"]>
  >;
  readonly header: Schema.optionalKey<Schema.String>;
  readonly footer: Schema.optionalKey<Schema.String>;
  readonly pageSize: Schema.optionalKey<
    Schema.Union<
      readonly [
        Schema.Literals<
          readonly ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "Legal", "Letter", "Tabloid"]
        >,
        Schema.Struct<{
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>,
      ]
    >
  >;
  readonly margins: Schema.optionalKey<
    Schema.Struct<{
      readonly marginType: Schema.optionalKey<
        Schema.Literals<readonly ["default", "none", "printableArea", "custom"]>
      >;
      readonly top: Schema.optionalKey<Schema.Int>;
      readonly bottom: Schema.optionalKey<Schema.Int>;
      readonly left: Schema.optionalKey<Schema.Int>;
      readonly right: Schema.optionalKey<Schema.Int>;
    }>
  >;
}>;
type PrintOptions = typeof PrintOptions.Type;
```

#### `WebContents.PrintPageSize`

A named page size or custom dimensions in microns.

```ts
const PrintPageSize: Schema.Union<
  readonly [
    Schema.Literals<
      readonly ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "Legal", "Letter", "Tabloid"]
    >,
    Schema.Struct<{
      readonly width: Schema.Number;
      readonly height: Schema.Number;
    }>,
  ]
>;
type PrintPageSize = typeof PrintPageSize.Type;
```

#### `WebContents.Responsiveness`

```ts
const Responsiveness: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly status: Schema.Literal<"unknown">;
    }>,
    Schema.Struct<{
      readonly status: Schema.Literals<readonly ["responsive", "unresponsive"]>;
      readonly processId: Schema.Int;
    }>,
  ]
>;
type Responsiveness = typeof Responsiveness.Type;
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

#### `WebContents.State`

```ts
const State: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly status: Schema.Literal<"idle">;
    }>,
    Schema.Struct<{
      readonly status: Schema.Literal<"loading">;
      readonly url: Schema.String;
    }>,
    Schema.Struct<{
      readonly status: Schema.Literal<"ready">;
      readonly url: Schema.String;
      readonly processId: Schema.Number;
    }>,
    Schema.Struct<{
      readonly status: Schema.Literal<"failed">;
      readonly url: Schema.String;
      readonly code: Schema.Number;
      readonly description: Schema.String;
    }>,
    Schema.Struct<{
      readonly status: Schema.Literal<"gone">;
      readonly reason: Schema.String;
      readonly exitCode: Schema.Number;
    }>,
  ]
>;
type State = typeof State.Type;
```

#### `WebContents.StyleOptions`

```ts
const StyleOptions: Schema.Struct<{
  readonly origin: Schema.optionalKey<Schema.Literals<readonly ["author", "user"]>>;
}>;
type StyleOptions = typeof StyleOptions.Type;
```

#### `WebContents.Zoom`

```ts
const Zoom: Schema.Struct<{
  readonly factor: Schema.Number;
}>;
type Zoom = typeof Zoom.Type;
```

#### `WebContents.ZoomFactor`

```ts
const ZoomFactor: Schema.Number;
```

### `WebRequest`

#### `WebRequest.Body`

The upload data a request carried, kept within the filter's byte cap.

```ts
const Body: Schema.Struct<{
  readonly parts: Schema.$Array<
    Schema.Union<
      readonly [
        Schema.Struct<{
          readonly kind: Schema.Literal<"bytes">;
          readonly bytes: Schema.Uint8Array;
        }>,
        Schema.Struct<{
          readonly kind: Schema.Literal<"file">;
          readonly path: Schema.String;
          readonly offset: Schema.optionalKey<Schema.Number>;
          readonly length: Schema.optionalKey<Schema.Number>;
          readonly modificationTime: Schema.optionalKey<Schema.Number>;
        }>,
        Schema.Struct<{
          readonly kind: Schema.Literal<"blob">;
          readonly id: Schema.String;
        }>,
      ]
    >
  >;
  readonly bytes: Schema.Number;
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
and its subdomains; a `*` in the path matches any characters.

```ts
const compilePattern: (pattern: string) => (url: URL) => boolean;
```

#### `WebRequest.Event`

Observation-only stages of a request's life; deciders never see these.

```ts
const Event: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly id: Schema.Number;
      readonly url: Schema.String;
      readonly method: Schema.String;
      readonly resourceType: Schema.Literals<
        readonly [
          "mainFrame",
          "subFrame",
          "stylesheet",
          "script",
          "image",
          "font",
          "object",
          "xhr",
          "ping",
          "cspReport",
          "media",
          "webSocket",
          "other",
        ]
      >;
      readonly referrer: Schema.String;
      readonly timestamp: Schema.Number;
      readonly webContentsId: Schema.optionalKey<Schema.Number>;
      readonly sourceId: Schema.optionalKey<Schema.String>;
      readonly stage: Schema.Literal<"sent">;
      readonly headers: Schema.$Record<Schema.String, Schema.String>;
    }>,
    Schema.Struct<{
      readonly id: Schema.Number;
      readonly url: Schema.String;
      readonly method: Schema.String;
      readonly resourceType: Schema.Literals<
        readonly [
          "mainFrame",
          "subFrame",
          "stylesheet",
          "script",
          "image",
          "font",
          "object",
          "xhr",
          "ping",
          "cspReport",
          "media",
          "webSocket",
          "other",
        ]
      >;
      readonly referrer: Schema.String;
      readonly timestamp: Schema.Number;
      readonly webContentsId: Schema.optionalKey<Schema.Number>;
      readonly sourceId: Schema.optionalKey<Schema.String>;
      readonly fromCache: Schema.Boolean;
      readonly stage: Schema.Literal<"response">;
      readonly statusCode: Schema.Number;
      readonly statusLine: Schema.String;
      readonly headers: Schema.$Record<Schema.String, Schema.$Array<Schema.String>>;
    }>,
    Schema.Struct<{
      readonly id: Schema.Number;
      readonly url: Schema.String;
      readonly method: Schema.String;
      readonly resourceType: Schema.Literals<
        readonly [
          "mainFrame",
          "subFrame",
          "stylesheet",
          "script",
          "image",
          "font",
          "object",
          "xhr",
          "ping",
          "cspReport",
          "media",
          "webSocket",
          "other",
        ]
      >;
      readonly referrer: Schema.String;
      readonly timestamp: Schema.Number;
      readonly webContentsId: Schema.optionalKey<Schema.Number>;
      readonly sourceId: Schema.optionalKey<Schema.String>;
      readonly fromCache: Schema.Boolean;
      readonly stage: Schema.Literal<"redirect">;
      readonly statusCode: Schema.Number;
      readonly redirectUrl: Schema.String;
    }>,
    Schema.Struct<{
      readonly id: Schema.Number;
      readonly url: Schema.String;
      readonly method: Schema.String;
      readonly resourceType: Schema.Literals<
        readonly [
          "mainFrame",
          "subFrame",
          "stylesheet",
          "script",
          "image",
          "font",
          "object",
          "xhr",
          "ping",
          "cspReport",
          "media",
          "webSocket",
          "other",
        ]
      >;
      readonly referrer: Schema.String;
      readonly timestamp: Schema.Number;
      readonly webContentsId: Schema.optionalKey<Schema.Number>;
      readonly sourceId: Schema.optionalKey<Schema.String>;
      readonly fromCache: Schema.Boolean;
      readonly stage: Schema.Literal<"completed">;
      readonly statusCode: Schema.Number;
      readonly statusLine: Schema.String;
    }>,
    Schema.Struct<{
      readonly id: Schema.Number;
      readonly url: Schema.String;
      readonly method: Schema.String;
      readonly resourceType: Schema.Literals<
        readonly [
          "mainFrame",
          "subFrame",
          "stylesheet",
          "script",
          "image",
          "font",
          "object",
          "xhr",
          "ping",
          "cspReport",
          "media",
          "webSocket",
          "other",
        ]
      >;
      readonly referrer: Schema.String;
      readonly timestamp: Schema.Number;
      readonly webContentsId: Schema.optionalKey<Schema.Number>;
      readonly sourceId: Schema.optionalKey<Schema.String>;
      readonly fromCache: Schema.Boolean;
      readonly stage: Schema.Literal<"error">;
      readonly error: Schema.String;
    }>,
  ]
>;
type Event = typeof Event.Type;
```

#### `WebRequest.Filter`

Which requests a set of deciders sees; patterns follow Chromium's match pattern syntax.

```ts
const Filter: Schema.Struct<{
  readonly urls: Schema.NonEmptyArray<Schema.String>;
  readonly types: Schema.optionalKey<
    Schema.NonEmptyArray<
      Schema.Literals<
        readonly [
          "mainFrame",
          "subFrame",
          "stylesheet",
          "script",
          "image",
          "font",
          "object",
          "xhr",
          "ping",
          "cspReport",
          "media",
          "webSocket",
          "other",
        ]
      >
    >
  >;
  readonly body: Schema.optionalKey<
    Schema.Struct<{
      readonly maxBytes: Schema.Int;
      readonly blobs: Schema.Literals<readonly ["resolve", "reference"]>;
    }>
  >;
}>;
type Filter = typeof Filter.Type;
```

#### `WebRequest.Pattern`

```ts
const Pattern: Schema.String;
```

#### `WebRequest.Request`

```ts
const Request: Schema.Struct<{
  readonly id: Schema.Number;
  readonly url: Schema.String;
  readonly method: Schema.String;
  readonly resourceType: Schema.Literals<
    readonly [
      "mainFrame",
      "subFrame",
      "stylesheet",
      "script",
      "image",
      "font",
      "object",
      "xhr",
      "ping",
      "cspReport",
      "media",
      "webSocket",
      "other",
    ]
  >;
  readonly referrer: Schema.String;
  readonly timestamp: Schema.Number;
  readonly webContentsId: Schema.optionalKey<Schema.Number>;
  readonly sourceId: Schema.optionalKey<Schema.String>;
  readonly body: Schema.optionalKey<
    Schema.Struct<{
      readonly parts: Schema.$Array<
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly kind: Schema.Literal<"bytes">;
              readonly bytes: Schema.Uint8Array;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"file">;
              readonly path: Schema.String;
              readonly offset: Schema.optionalKey<Schema.Number>;
              readonly length: Schema.optionalKey<Schema.Number>;
              readonly modificationTime: Schema.optionalKey<Schema.Number>;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"blob">;
              readonly id: Schema.String;
            }>,
          ]
        >
      >;
      readonly bytes: Schema.Number;
      readonly truncated: Schema.Boolean;
    }>
  >;
}>;
type Request = typeof Request.Type;
```

#### `WebRequest.RequestDecision`

```ts
const RequestDecision: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"allow">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"block">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"redirect">;
      readonly url: Schema.String;
    }>,
  ]
>;
type RequestDecision = typeof RequestDecision.Type;
```

#### `WebRequest.RequestHeaders`

```ts
const RequestHeaders: Schema.Struct<{
  readonly id: Schema.Number;
  readonly url: Schema.String;
  readonly method: Schema.String;
  readonly resourceType: Schema.Literals<
    readonly [
      "mainFrame",
      "subFrame",
      "stylesheet",
      "script",
      "image",
      "font",
      "object",
      "xhr",
      "ping",
      "cspReport",
      "media",
      "webSocket",
      "other",
    ]
  >;
  readonly referrer: Schema.String;
  readonly timestamp: Schema.Number;
  readonly webContentsId: Schema.optionalKey<Schema.Number>;
  readonly sourceId: Schema.optionalKey<Schema.String>;
  readonly headers: Schema.$Record<Schema.String, Schema.String>;
}>;
type RequestHeaders = typeof RequestHeaders.Type;
```

#### `WebRequest.RequestHeadersDecision`

```ts
const RequestHeadersDecision: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"allow">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"block">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"headers">;
      readonly headers: Schema.$Record<Schema.String, Schema.String>;
    }>,
  ]
>;
type RequestHeadersDecision = typeof RequestHeadersDecision.Type;
```

#### `WebRequest.ResourceType`

```ts
const ResourceType: Schema.Literals<
  readonly [
    "mainFrame",
    "subFrame",
    "stylesheet",
    "script",
    "image",
    "font",
    "object",
    "xhr",
    "ping",
    "cspReport",
    "media",
    "webSocket",
    "other",
  ]
>;
type ResourceType = typeof ResourceType.Type;
```

#### `WebRequest.Response`

```ts
const Response: Schema.Struct<{
  readonly id: Schema.Number;
  readonly url: Schema.String;
  readonly method: Schema.String;
  readonly resourceType: Schema.Literals<
    readonly [
      "mainFrame",
      "subFrame",
      "stylesheet",
      "script",
      "image",
      "font",
      "object",
      "xhr",
      "ping",
      "cspReport",
      "media",
      "webSocket",
      "other",
    ]
  >;
  readonly referrer: Schema.String;
  readonly timestamp: Schema.Number;
  readonly webContentsId: Schema.optionalKey<Schema.Number>;
  readonly sourceId: Schema.optionalKey<Schema.String>;
  readonly statusLine: Schema.String;
  readonly statusCode: Schema.Number;
  readonly headers: Schema.$Record<Schema.String, Schema.$Array<Schema.String>>;
}>;
type Response = typeof Response.Type;
```

#### `WebRequest.ResponseDecision`

```ts
const ResponseDecision: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"allow">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"block">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"headers">;
      readonly headers: Schema.$Record<Schema.String, Schema.$Array<Schema.String>>;
      readonly statusLine: Schema.optionalKey<Schema.String>;
    }>,
  ]
>;
type ResponseDecision = typeof ResponseDecision.Type;
```

#### `WebRequest.UploadPart`

One piece of a request's upload data; file parts are metadata the library never reads.

```ts
const UploadPart: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"bytes">;
      readonly bytes: Schema.Uint8Array;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"file">;
      readonly path: Schema.String;
      readonly offset: Schema.optionalKey<Schema.Number>;
      readonly length: Schema.optionalKey<Schema.Number>;
      readonly modificationTime: Schema.optionalKey<Schema.Number>;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"blob">;
      readonly id: Schema.String;
    }>,
  ]
>;
type UploadPart = typeof UploadPart.Type;
```

### `WindowControls`

#### `WindowControls.AlwaysOnTopLevel`

```ts
const AlwaysOnTopLevel: Schema.Literals<
  readonly [
    "normal",
    "floating",
    "torn-off-menu",
    "modal-panel",
    "main-menu",
    "status",
    "pop-up-menu",
    "screen-saver",
  ]
>;
type AlwaysOnTopLevel = typeof AlwaysOnTopLevel.Type;
```

#### `WindowControls.Bounds`

```ts
const Bounds: Schema.Struct<{
  readonly x: Schema.Number;
  readonly y: Schema.Number;
  readonly width: Schema.Number;
  readonly height: Schema.Number;
}>;
type Bounds = typeof Bounds.Type;
```

#### `WindowControls.BoundsUpdate`

```ts
const BoundsUpdate: Schema.Struct<{
  readonly x: Schema.optionalKey<Schema.Number>;
  readonly y: Schema.optionalKey<Schema.Number>;
  readonly width: Schema.optionalKey<Schema.Number>;
  readonly height: Schema.optionalKey<Schema.Number>;
}>;
type BoundsUpdate = typeof BoundsUpdate.Type;
```

#### `WindowControls.capability`

One window's controls as one capability. Unlike the ambient surfaces, this one belongs to an
owner: `WindowControls.native(window)` in `sewed/main` carries the window it was built for, so
every operation reaches that window and no other. `Capability.client` reaches it from a
document, and serving it twice for two windows gives two owners over this one protocol.

```ts
const capability: Capability.Capability<
  | Rpc.Rpc<
      "audio",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly muted: Schema.Boolean;
          readonly audible: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"back", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "changes",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly bounds: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly normalBounds: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          /** The content area, excluding the frame; attached views are positioned within it. */
          readonly contentBounds: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly visible: Schema.Boolean;
          readonly focused: Schema.Boolean;
          readonly minimized: Schema.Boolean;
          readonly maximized: Schema.Boolean;
          readonly fullScreen: Schema.Boolean;
          readonly title: Schema.String;
          readonly alwaysOnTop: Schema.Boolean;
          readonly opacity: Schema.Number;
          readonly resizable: Schema.Boolean;
          readonly movable: Schema.Boolean;
          readonly minimizable: Schema.Boolean;
          readonly maximizable: Schema.Boolean;
          readonly closable: Schema.Boolean;
          readonly fullScreenable: Schema.Boolean;
          readonly menuBarVisible: Schema.Boolean;
          readonly kiosk: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"close", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "find",
      Schema.Struct<{
        text: Schema.String;
        options: Schema.optionalKey<
          Schema.Struct<{
            readonly forward: Schema.optionalKey<Schema.Boolean>;
            readonly matchCase: Schema.optionalKey<Schema.Boolean>;
          }>
        >;
      }>,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly activeMatchOrdinal: Schema.Int;
          readonly matches: Schema.Int;
          readonly selectionArea: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly finalUpdate: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "findNext",
      Schema.Struct<{
        forward: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "flash",
      Schema.Struct<{
        flash: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"forward", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"hide", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "history",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly index: Schema.Int;
          readonly entries: Schema.$Array<
            Schema.Struct<{
              readonly url: Schema.String;
              readonly title: Schema.String;
            }>
          >;
          readonly canGoBack: Schema.Boolean;
          readonly canGoForward: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"maximize", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"minimize", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"restore", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "setAlwaysOnTop",
      Schema.Struct<{
        alwaysOnTop: Schema.Boolean;
        level: Schema.optionalKey<
          Schema.Literals<
            readonly [
              "normal",
              "floating",
              "torn-off-menu",
              "modal-panel",
              "main-menu",
              "status",
              "pop-up-menu",
              "screen-saver",
            ]
          >
        >;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setAudioMuted",
      Schema.Struct<{
        muted: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setBounds",
      Schema.Struct<{
        readonly x: Schema.optionalKey<Schema.Number>;
        readonly y: Schema.optionalKey<Schema.Number>;
        readonly width: Schema.optionalKey<Schema.Number>;
        readonly height: Schema.optionalKey<Schema.Number>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setFullScreen",
      Schema.Struct<{
        fullScreen: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setOpacity",
      Schema.Struct<{
        opacity: Schema.Number;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setProgress",
      Schema.Struct<{
        progress: Schema.Number;
        mode: Schema.optionalKey<
          Schema.Literals<readonly ["none", "normal", "indeterminate", "error", "paused"]>
        >;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setTitle",
      Schema.Struct<{
        title: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setZoom",
      Schema.Struct<{
        factor: Schema.Number;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<"show", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"showInactive", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "state",
      Schema.Void,
      Schema.Struct<{
        readonly bounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly normalBounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        /** The content area, excluding the frame; attached views are positioned within it. */
        readonly contentBounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly visible: Schema.Boolean;
        readonly focused: Schema.Boolean;
        readonly minimized: Schema.Boolean;
        readonly maximized: Schema.Boolean;
        readonly fullScreen: Schema.Boolean;
        readonly title: Schema.String;
        readonly alwaysOnTop: Schema.Boolean;
        readonly opacity: Schema.Number;
        readonly resizable: Schema.Boolean;
        readonly movable: Schema.Boolean;
        readonly minimizable: Schema.Boolean;
        readonly maximizable: Schema.Boolean;
        readonly closable: Schema.Boolean;
        readonly fullScreenable: Schema.Boolean;
        readonly menuBarVisible: Schema.Boolean;
        readonly kiosk: Schema.Boolean;
      }>,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "stopFind",
      Schema.Struct<{
        action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "zoom",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly factor: Schema.Number;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >,
  "sewed/binding/window-controls"
>;
```

#### `WindowControls.Opacity`

```ts
const Opacity: Schema.Number;
```

#### `WindowControls.Progress`

Taskbar progress from 0 to 1; a negative value removes the indicator.

```ts
const Progress: Schema.Number;
```

#### `WindowControls.ProgressMode`

```ts
const ProgressMode: Schema.Literals<
  readonly ["none", "normal", "indeterminate", "error", "paused"]
>;
type ProgressMode = typeof ProgressMode.Type;
```

#### `WindowControls.protocol`

```ts
const protocol: RpcGroup.RpcGroup<
  | Rpc.Rpc<
      "audio",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly muted: Schema.Boolean;
          readonly audible: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"back", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "changes",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly bounds: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly normalBounds: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          /** The content area, excluding the frame; attached views are positioned within it. */
          readonly contentBounds: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly visible: Schema.Boolean;
          readonly focused: Schema.Boolean;
          readonly minimized: Schema.Boolean;
          readonly maximized: Schema.Boolean;
          readonly fullScreen: Schema.Boolean;
          readonly title: Schema.String;
          readonly alwaysOnTop: Schema.Boolean;
          readonly opacity: Schema.Number;
          readonly resizable: Schema.Boolean;
          readonly movable: Schema.Boolean;
          readonly minimizable: Schema.Boolean;
          readonly maximizable: Schema.Boolean;
          readonly closable: Schema.Boolean;
          readonly fullScreenable: Schema.Boolean;
          readonly menuBarVisible: Schema.Boolean;
          readonly kiosk: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"close", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "find",
      Schema.Struct<{
        text: Schema.String;
        options: Schema.optionalKey<
          Schema.Struct<{
            readonly forward: Schema.optionalKey<Schema.Boolean>;
            readonly matchCase: Schema.optionalKey<Schema.Boolean>;
          }>
        >;
      }>,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly activeMatchOrdinal: Schema.Int;
          readonly matches: Schema.Int;
          readonly selectionArea: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly finalUpdate: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "findNext",
      Schema.Struct<{
        forward: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "flash",
      Schema.Struct<{
        flash: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"forward", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"hide", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "history",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly index: Schema.Int;
          readonly entries: Schema.$Array<
            Schema.Struct<{
              readonly url: Schema.String;
              readonly title: Schema.String;
            }>
          >;
          readonly canGoBack: Schema.Boolean;
          readonly canGoForward: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"maximize", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"minimize", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"restore", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "setAlwaysOnTop",
      Schema.Struct<{
        alwaysOnTop: Schema.Boolean;
        level: Schema.optionalKey<
          Schema.Literals<
            readonly [
              "normal",
              "floating",
              "torn-off-menu",
              "modal-panel",
              "main-menu",
              "status",
              "pop-up-menu",
              "screen-saver",
            ]
          >
        >;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setAudioMuted",
      Schema.Struct<{
        muted: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setBounds",
      Schema.Struct<{
        readonly x: Schema.optionalKey<Schema.Number>;
        readonly y: Schema.optionalKey<Schema.Number>;
        readonly width: Schema.optionalKey<Schema.Number>;
        readonly height: Schema.optionalKey<Schema.Number>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setFullScreen",
      Schema.Struct<{
        fullScreen: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setOpacity",
      Schema.Struct<{
        opacity: Schema.Number;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setProgress",
      Schema.Struct<{
        progress: Schema.Number;
        mode: Schema.optionalKey<
          Schema.Literals<readonly ["none", "normal", "indeterminate", "error", "paused"]>
        >;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setTitle",
      Schema.Struct<{
        title: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setZoom",
      Schema.Struct<{
        factor: Schema.Number;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<"show", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"showInactive", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "state",
      Schema.Void,
      Schema.Struct<{
        readonly bounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly normalBounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        /** The content area, excluding the frame; attached views are positioned within it. */
        readonly contentBounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly visible: Schema.Boolean;
        readonly focused: Schema.Boolean;
        readonly minimized: Schema.Boolean;
        readonly maximized: Schema.Boolean;
        readonly fullScreen: Schema.Boolean;
        readonly title: Schema.String;
        readonly alwaysOnTop: Schema.Boolean;
        readonly opacity: Schema.Number;
        readonly resizable: Schema.Boolean;
        readonly movable: Schema.Boolean;
        readonly minimizable: Schema.Boolean;
        readonly maximizable: Schema.Boolean;
        readonly closable: Schema.Boolean;
        readonly fullScreenable: Schema.Boolean;
        readonly menuBarVisible: Schema.Boolean;
        readonly kiosk: Schema.Boolean;
      }>,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "stopFind",
      Schema.Struct<{
        action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "zoom",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly factor: Schema.Number;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
>;
```

#### `WindowControls.State`

```ts
const State: Schema.Struct<{
  readonly bounds: Schema.Struct<{
    readonly x: Schema.Number;
    readonly y: Schema.Number;
    readonly width: Schema.Number;
    readonly height: Schema.Number;
  }>;
  readonly normalBounds: Schema.Struct<{
    readonly x: Schema.Number;
    readonly y: Schema.Number;
    readonly width: Schema.Number;
    readonly height: Schema.Number;
  }>;
  /** The content area, excluding the frame; attached views are positioned within it. */
  readonly contentBounds: Schema.Struct<{
    readonly x: Schema.Number;
    readonly y: Schema.Number;
    readonly width: Schema.Number;
    readonly height: Schema.Number;
  }>;
  readonly visible: Schema.Boolean;
  readonly focused: Schema.Boolean;
  readonly minimized: Schema.Boolean;
  readonly maximized: Schema.Boolean;
  readonly fullScreen: Schema.Boolean;
  readonly title: Schema.String;
  readonly alwaysOnTop: Schema.Boolean;
  readonly opacity: Schema.Number;
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

### `WorkerContext`

```ts
class WorkerContext extends WorkerContext_base {}
```

## `sewed/main`

### `App`

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
const claimInstance: (
  options?: Instance.Options,
) => Effect.Effect<
  Instance.Instance,
  SewedError | Instance.SecondaryInstance,
  MainContext | Scope.Scope
>;
```

#### `App.ClaimOptions`

```ts
interface ClaimOptions {
  /** A JSON object forwarded to the primary process when this one turns out to be secondary. */
  readonly data?: typeof Schema.JsonObject.Type;
}
```

#### `App.decide`

Installs a decider for one of `Decidables.App`'s decidables against the running application's own
registry, for the caller's scope. This is {@link Decision.Owner}'s method: any number of deciders
may be installed, and the decidable's own composition (declared in `Decidables.ts`) decides among
them. Without a running application owner, this fails `Closed` rather than installing a decider
nothing will ever consult.

```ts
const decide: <Event, Answer, Timing extends "sync" | "async", R = never>(
  decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition, "app">,
  decider: Decision.DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>,
) => Effect.Effect<void, SewedError, MainContext | Scope.Scope | R>;
```

#### `App.declare`

Declares facts about the application that must precede readiness, such as the Windows user model id.

```ts
const declare: (options: Application.Identity) => Declaration.Declaration;
```

#### `App.dock`

macOS dock operations; every operation fails with Native elsewhere.

```ts
const dock: {
  badge: Effect.Effect<string, SewedError, MainContext>;
  setBadge: (text: string) => Effect.Effect<void, SewedError, MainContext>;
  bounce: (kind?: Application.DockBounce) => Effect.Effect<number, SewedError, MainContext>;
  cancelBounce: (id: number) => Effect.Effect<void, SewedError, MainContext>;
  hide: Effect.Effect<void, SewedError, MainContext>;
  show: Effect.Effect<void, SewedError, MainContext>;
  visible: Effect.Effect<boolean, SewedError, MainContext>;
};
```

#### `App.gpu`

```ts
const gpu: (
  kind?: Application.GpuInfoKind,
) => Effect.Effect<typeof Schema.Json.Type, SewedError, MainContext>;
```

#### `App.gpuFeatures`

```ts
const gpuFeatures: Effect.Effect<Record<string, string>, SewedError, MainContext>;
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
const isDefaultProtocolClient: (
  client: Application.ProtocolClient,
) => Effect.Effect<boolean, SewedError, MainContext>;
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
const menu: (
  options: MenuSchema.ApplicationOptions,
) => Effect.Effect<Menu, SewedError, MainContext | Scope.Scope>;
```

#### `App.Menu`

```ts
type Menu = ApplicationMenu.Handle;
```

#### `App.path`

```ts
const path: (name: Application.PathName) => Effect.Effect<string, SewedError, MainContext>;
```

#### `App.quit`

```ts
const quit: Effect.Effect<void, SewedError, MainContext>;
```

#### `App.removeDefaultProtocolClient`

```ts
const removeDefaultProtocolClient: (
  client: Application.ProtocolClient,
) => Effect.Effect<boolean, SewedError, MainContext>;
```

#### `App.run`

Runs the application: installs the launch and quit listeners, applies every declaration in
order — failing `Startup` on the first that cannot apply — waits for Electron readiness, and
runs `program` under `MainContext` in the application scope until quit. A declaration is applied
synchronously and before readiness; asynchronous work belongs in `program`.

```ts
const run: <E>(
  declarations: readonly Declaration.Entry[],
  program: Effect.Effect<unknown, E, MainContext | Scope.Scope>,
) => Fiber.Fiber<void | undefined, E | SewedError>;
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

#### `App.setAboutPanel`

```ts
const setAboutPanel: (
  options: Application.AboutPanel,
) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.setBadge`

Sets the dock or taskbar badge count; zero clears it. Fails with Native where unsupported.

```ts
const setBadge: (count: number) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.setDefaultProtocolClient`

```ts
const setDefaultProtocolClient: (
  client: Application.ProtocolClient,
) => Effect.Effect<boolean, SewedError, MainContext>;
```

#### `App.setLoginItems`

```ts
const setLoginItems: (
  settings: Application.LoginItemSettings,
) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.setPath`

```ts
const setPath: (
  name: Application.PathName,
  directory: string,
) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.setSecureKeyboardEntry`

```ts
const setSecureKeyboardEntry: (enabled: boolean) => Effect.Effect<void, SewedError, MainContext>;
```

#### `App.showAboutPanel`

```ts
const showAboutPanel: Effect.Effect<void, SewedError, MainContext>;
```

#### `App.taskbar`

Windows taskbar operations; every operation fails with Native elsewhere.

```ts
const taskbar: {
  setUserTasks: (
    tasks: readonly Application.Task[],
  ) => Effect.Effect<void, SewedError, MainContext>;
  setJumpList: (
    categories: readonly Application.JumpListCategory[] | null,
  ) => Effect.Effect<void, SewedError, MainContext>;
};
```

#### `App.webContentsCreated`

```ts
const webContentsCreated: Stream.Stream<Application.WebContentsCreated, SewedError, MainContext>;
```

#### `App.windowFocus`

Focus entering or leaving windows; Sewed windows are named by their id, others are null.

```ts
const windowFocus: Stream.Stream<Application.WindowFocus, SewedError, MainContext>;
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
}>;
type EvaluateOptions = typeof EvaluateOptions.Type;
```

#### `Automation.InputEvent`

```ts
const InputEvent: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly modifiers: Schema.optionalKey<
        Schema.$Array<
          Schema.Literals<
            readonly [
              "shift",
              "control",
              "ctrl",
              "alt",
              "meta",
              "command",
              "cmd",
              "iskeypad",
              "isautorepeat",
              "leftbuttondown",
              "middlebuttondown",
              "rightbuttondown",
              "capslock",
              "numlock",
              "left",
              "right",
            ]
          >
        >
      >;
      readonly x: Schema.Number;
      readonly y: Schema.Number;
      readonly globalX: Schema.optionalKey<Schema.Number>;
      readonly globalY: Schema.optionalKey<Schema.Number>;
      readonly movementX: Schema.optionalKey<Schema.Number>;
      readonly movementY: Schema.optionalKey<Schema.Number>;
      readonly type: Schema.Literals<
        readonly ["mouseDown", "mouseUp", "mouseEnter", "mouseLeave", "contextMenu", "mouseMove"]
      >;
      readonly button: Schema.optionalKey<Schema.Literals<readonly ["left", "middle", "right"]>>;
      readonly clickCount: Schema.optionalKey<Schema.Int>;
    }>,
    Schema.Struct<{
      readonly modifiers: Schema.optionalKey<
        Schema.$Array<
          Schema.Literals<
            readonly [
              "shift",
              "control",
              "ctrl",
              "alt",
              "meta",
              "command",
              "cmd",
              "iskeypad",
              "isautorepeat",
              "leftbuttondown",
              "middlebuttondown",
              "rightbuttondown",
              "capslock",
              "numlock",
              "left",
              "right",
            ]
          >
        >
      >;
      readonly x: Schema.Number;
      readonly y: Schema.Number;
      readonly globalX: Schema.optionalKey<Schema.Number>;
      readonly globalY: Schema.optionalKey<Schema.Number>;
      readonly movementX: Schema.optionalKey<Schema.Number>;
      readonly movementY: Schema.optionalKey<Schema.Number>;
      readonly type: Schema.Literal<"mouseWheel">;
      readonly deltaX: Schema.optionalKey<Schema.Number>;
      readonly deltaY: Schema.optionalKey<Schema.Number>;
      readonly wheelTicksX: Schema.optionalKey<Schema.Number>;
      readonly wheelTicksY: Schema.optionalKey<Schema.Number>;
      readonly accelerationRatioX: Schema.optionalKey<Schema.Number>;
      readonly accelerationRatioY: Schema.optionalKey<Schema.Number>;
      readonly hasPreciseScrollingDeltas: Schema.optionalKey<Schema.Boolean>;
      readonly canScroll: Schema.optionalKey<Schema.Boolean>;
    }>,
    Schema.Struct<{
      readonly modifiers: Schema.optionalKey<
        Schema.$Array<
          Schema.Literals<
            readonly [
              "shift",
              "control",
              "ctrl",
              "alt",
              "meta",
              "command",
              "cmd",
              "iskeypad",
              "isautorepeat",
              "leftbuttondown",
              "middlebuttondown",
              "rightbuttondown",
              "capslock",
              "numlock",
              "left",
              "right",
            ]
          >
        >
      >;
      readonly type: Schema.Literals<readonly ["rawKeyDown", "keyDown", "keyUp", "char"]>;
      readonly keyCode: Schema.String;
    }>,
  ]
>;
type InputEvent = typeof InputEvent.Type;
```

#### `Automation.KeyboardInput`

```ts
const KeyboardInput: Schema.Struct<{
  readonly modifiers: Schema.optionalKey<
    Schema.$Array<
      Schema.Literals<
        readonly [
          "shift",
          "control",
          "ctrl",
          "alt",
          "meta",
          "command",
          "cmd",
          "iskeypad",
          "isautorepeat",
          "leftbuttondown",
          "middlebuttondown",
          "rightbuttondown",
          "capslock",
          "numlock",
          "left",
          "right",
        ]
      >
    >
  >;
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
  readonly modifiers: Schema.optionalKey<
    Schema.$Array<
      Schema.Literals<
        readonly [
          "shift",
          "control",
          "ctrl",
          "alt",
          "meta",
          "command",
          "cmd",
          "iskeypad",
          "isautorepeat",
          "leftbuttondown",
          "middlebuttondown",
          "rightbuttondown",
          "capslock",
          "numlock",
          "left",
          "right",
        ]
      >
    >
  >;
  readonly x: Schema.Number;
  readonly y: Schema.Number;
  readonly globalX: Schema.optionalKey<Schema.Number>;
  readonly globalY: Schema.optionalKey<Schema.Number>;
  readonly movementX: Schema.optionalKey<Schema.Number>;
  readonly movementY: Schema.optionalKey<Schema.Number>;
  readonly type: Schema.Literals<
    readonly ["mouseDown", "mouseUp", "mouseEnter", "mouseLeave", "contextMenu", "mouseMove"]
  >;
  readonly button: Schema.optionalKey<Schema.Literals<readonly ["left", "middle", "right"]>>;
  readonly clickCount: Schema.optionalKey<Schema.Int>;
}>;
type MouseInput = typeof MouseInput.Type;
```

#### `Automation.MouseWheelInput`

```ts
const MouseWheelInput: Schema.Struct<{
  readonly modifiers: Schema.optionalKey<
    Schema.$Array<
      Schema.Literals<
        readonly [
          "shift",
          "control",
          "ctrl",
          "alt",
          "meta",
          "command",
          "cmd",
          "iskeypad",
          "isautorepeat",
          "leftbuttondown",
          "middlebuttondown",
          "rightbuttondown",
          "capslock",
          "numlock",
          "left",
          "right",
        ]
      >
    >
  >;
  readonly x: Schema.Number;
  readonly y: Schema.Number;
  readonly globalX: Schema.optionalKey<Schema.Number>;
  readonly globalY: Schema.optionalKey<Schema.Number>;
  readonly movementX: Schema.optionalKey<Schema.Number>;
  readonly movementY: Schema.optionalKey<Schema.Number>;
  readonly type: Schema.Literal<"mouseWheel">;
  readonly deltaX: Schema.optionalKey<Schema.Number>;
  readonly deltaY: Schema.optionalKey<Schema.Number>;
  readonly wheelTicksX: Schema.optionalKey<Schema.Number>;
  readonly wheelTicksY: Schema.optionalKey<Schema.Number>;
  readonly accelerationRatioX: Schema.optionalKey<Schema.Number>;
  readonly accelerationRatioY: Schema.optionalKey<Schema.Number>;
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

#### `BaseWindow.Handle`

```ts
// The success type of make.
type Handle = Omit<{
    native: NativeBaseWindow;
    closed: Deferred.Deferred<void, never>;
    webContents: {
        print: (options?: WebContents.PrintOptions) => Effect.Effect<void, SewedError, MainContext>;
        pdf: (options?: WebContents.PdfOptions) => Effect.Effect<Uint8Array<ArrayBuffer>, SewedError, MainContext>;
        capture: (options?: WebContents.CaptureOptions) => Effect.Effect<Uint8Array<ArrayBuffer>, SewedError, MainContext>;
        zoom: Stream.Stream<{
            readonly factor: number;
        }, never, MainContext>;
        setZoom: (factor: number) =;
```

#### `BaseWindow.make`

```ts
const make: (options?: Options) => Effect.Effect<
  Omit<
    {
      native: NativeBaseWindow;
      closed: Deferred.Deferred<void, never>;
      webContents:
        | {
            print: (
              options?: WebContents.PrintOptions,
            ) => Effect.Effect<void, SewedError, MainContext>;
            pdf: (
              options?: WebContents.PdfOptions,
            ) => Effect.Effect<Uint8Array<ArrayBuffer>, SewedError, MainContext>;
            capture: (
              options?: WebContents.CaptureOptions,
            ) => Effect.Effect<Uint8Array<ArrayBuffer>, SewedError, MainContext>;
            zoom: Stream.Stream<
              {
                readonly factor: number;
              },
              never,
              MainContext
            >;
            setZoom: (factor: number) => Effect.Effect<void, SewedError, MainContext>;
            audio: Stream.Stream<
              {
                readonly muted: boolean;
                readonly audible: boolean;
              },
              never,
              MainContext
            >;
            setAudioMuted: (muted: boolean) => Effect.Effect<void, SewedError, MainContext>;
            userAgent: Effect.Effect<string, SewedError, MainContext>;
            setUserAgent: (userAgent: string) => Effect.Effect<void, SewedError, MainContext>;
            find: (
              text: string,
              options?: WebContents.FindOptions,
            ) => Effect.Effect<WebContents.Search, SewedError, MainContext | Scope.Scope>;
            findNext: (forward?: boolean) => Effect.Effect<void, SewedError, MainContext>;
            stopFind: (
              action?: WebContents.FindStop,
            ) => Effect.Effect<void, SewedError, MainContext>;
            style: (
              css: string,
              options?: WebContents.StyleOptions,
            ) => Effect.Effect<void, SewedError, MainContext | Scope.Scope>;
            history: Stream.Stream<
              {
                readonly index: number;
                readonly entries: readonly {
                  readonly url: string;
                  readonly title: string;
                }[];
                readonly canGoBack: boolean;
                readonly canGoForward: boolean;
              },
              never,
              MainContext
            >;
            back: Effect.Effect<void, SewedError, MainContext>;
            forward: Effect.Effect<void, SewedError, MainContext>;
            go: (index: number) => Effect.Effect<void, SewedError, MainContext>;
            clearHistory: Effect.Effect<void, SewedError, MainContext>;
            openDevTools: (
              options?: WebContents.DevToolsOptions,
            ) => Effect.Effect<void, SewedError, MainContext>;
            closeDevTools: Effect.Effect<void, SewedError, MainContext>;
            focus: Effect.Effect<void, SewedError, MainContext>;
            console: Stream.Stream<
              {
                readonly level: "debug" | "error" | "info" | "warning";
                readonly message: string;
                readonly lineNumber: number;
                readonly sourceId: string;
              },
              SewedError,
              MainContext
            >;
            state: Stream.Stream<
              | {
                  readonly status: "idle";
                }
              | {
                  readonly status: "loading";
                  readonly url: string;
                }
              | {
                  readonly status: "ready";
                  readonly url: string;
                  readonly processId: number;
                }
              | {
                  readonly status: "failed";
                  readonly url: string;
                  readonly code: number;
                  readonly description: string;
                }
              | {
                  readonly status: "gone";
                  readonly reason: string;
                  readonly exitCode: number;
                },
              never,
              MainContext
            >;
            responsiveness: Stream.Stream<
              | {
                  readonly status: "unknown";
                }
              | {
                  readonly status: "responsive" | "unresponsive";
                  readonly processId: number;
                },
              never,
              MainContext
            >;
            favicons: Stream.Stream<readonly string[], never, MainContext>;
            terminate: Effect.Effect<void, SewedError, MainContext>;
            recover: Effect.Effect<void, SewedError, MainContext>;
            decide: <Event, Answer, Timing extends "sync" | "async", R = never>(
              decidable: Decision.Decidable<
                Event,
                Answer,
                Timing,
                Decision.Composition,
                "contents"
              >,
              decider: Decision.DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>,
            ) => Effect.Effect<void, SewedError, R | MainContext | Scope.Scope>;
            blocked: Stream.Stream<
              {
                readonly kind: "download" | "navigation" | "popup" | "redirect" | "webview";
                readonly url: string;
              },
              SewedError,
              MainContext
            >;
            load: <Keys extends string, const B extends readonly Binding.Bound<Keys>[]>(
              entry: Renderer.Entry<Keys> & Binding.Complete<Keys, B>,
              options: {
                readonly bindings: B;
              },
            ) => Effect.Effect<void, SewedError, MainContext>;
            reload: Effect.Effect<void, SewedError, MainContext>;
            downloads: Stream.Stream<Download.Handle, SewedError, MainContext>;
          }
        | undefined;
      id: string;
      current: Effect.Effect<
        {
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
        },
        SewedError,
        MainContext
      >;
      show: Effect.Effect<void, SewedError, MainContext>;
      showInactive: Effect.Effect<void, SewedError, MainContext>;
      hide: Effect.Effect<void, SewedError, MainContext>;
      focus: Effect.Effect<void, SewedError, MainContext>;
      setBounds: (
        bounds: WindowControls.BoundsUpdate,
      ) => Effect.Effect<void, SewedError, MainContext>;
      setFullScreen: (fullScreen: boolean) => Effect.Effect<void, SewedError, MainContext>;
      minimize: Effect.Effect<void, SewedError, MainContext>;
      maximize: Effect.Effect<void, SewedError, MainContext>;
      restore: Effect.Effect<void, SewedError, MainContext>;
      close: Effect.Effect<void, SewedError, MainContext>;
      setTitle: (title: string) => Effect.Effect<void, SewedError, MainContext>;
      setAlwaysOnTop: (
        alwaysOnTop: boolean,
        level?: WindowControls.AlwaysOnTopLevel,
      ) => Effect.Effect<void, SewedError, MainContext>;
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
      setProgress: (
        progress: number,
        mode?: WindowControls.ProgressMode,
      ) => Effect.Effect<void, SewedError, MainContext>;
      setOverlayIcon: (
        icon: string | null,
        description: string,
      ) => Effect.Effect<void, SewedError, MainContext>;
      setIcon: (icon: string) => Effect.Effect<void, SewedError, MainContext>;
      setParent: (parent: Window.Parent | null) => Effect.Effect<void, SewedError, MainContext>;
      decide: <Event, Answer, Timing extends "sync" | "async", R = never>(
        decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition, "window">,
        decider: Decision.DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>,
      ) => Effect.Effect<void, SewedError, R | MainContext | Scope.Scope>;
      state: Stream.Stream<
        {
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
        },
        never,
        MainContext
      >;
      awaitClosed: Effect.Effect<void, never, MainContext>;
      attach: (
        view: View.Attachable,
        options: View.AttachOptions,
      ) => Effect.Effect<View.Attachment, SewedError, MainContext | Scope.Scope>;
      mediaSourceId: Effect.Effect<string, SewedError, MainContext>;
      contentBounds: Effect.Effect<Electron.Rectangle, SewedError, MainContext>;
      touchBar: TouchBar.Handle;
    },
    "closed" | "native" | "webContents"
  >,
  SewedError,
  MainContext | Scope.Scope
>;
```

#### `BaseWindow.Options`

```ts
interface Options extends Window.Options {
  /** Another Sewed window; with `modal: true` this window blocks it. */
  readonly parent?: Window.Parent;
}
```

### `BrowserWindow`

#### `BrowserWindow.Controls`

```ts
const Controls: RpcGroup.RpcGroup<
  | Rpc.Rpc<
      "audio",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly muted: Schema.Boolean;
          readonly audible: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"back", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "changes",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly bounds: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly normalBounds: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly contentBounds: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly visible: Schema.Boolean;
          readonly focused: Schema.Boolean;
          readonly minimized: Schema.Boolean;
          readonly maximized: Schema.Boolean;
          readonly fullScreen: Schema.Boolean;
          readonly title: Schema.String;
          readonly alwaysOnTop: Schema.Boolean;
          readonly opacity: Schema.Number;
          readonly resizable: Schema.Boolean;
          readonly movable: Schema.Boolean;
          readonly minimizable: Schema.Boolean;
          readonly maximizable: Schema.Boolean;
          readonly closable: Schema.Boolean;
          readonly fullScreenable: Schema.Boolean;
          readonly menuBarVisible: Schema.Boolean;
          readonly kiosk: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"close", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "find",
      Schema.Struct<{
        text: Schema.String;
        options: Schema.optionalKey<
          Schema.Struct<{
            readonly forward: Schema.optionalKey<Schema.Boolean>;
            readonly matchCase: Schema.optionalKey<Schema.Boolean>;
          }>
        >;
      }>,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly activeMatchOrdinal: Schema.Int;
          readonly matches: Schema.Int;
          readonly selectionArea: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly finalUpdate: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "findNext",
      Schema.Struct<{
        forward: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "flash",
      Schema.Struct<{
        flash: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"forward", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"hide", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "history",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly index: Schema.Int;
          readonly entries: Schema.$Array<
            Schema.Struct<{
              readonly url: Schema.String;
              readonly title: Schema.String;
            }>
          >;
          readonly canGoBack: Schema.Boolean;
          readonly canGoForward: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"maximize", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"minimize", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"restore", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "setAlwaysOnTop",
      Schema.Struct<{
        alwaysOnTop: Schema.Boolean;
        level: Schema.optionalKey<
          Schema.Literals<
            readonly [
              "normal",
              "floating",
              "torn-off-menu",
              "modal-panel",
              "main-menu",
              "status",
              "pop-up-menu",
              "screen-saver",
            ]
          >
        >;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setAudioMuted",
      Schema.Struct<{
        muted: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setBounds",
      Schema.Struct<{
        readonly x: Schema.optionalKey<Schema.Number>;
        readonly y: Schema.optionalKey<Schema.Number>;
        readonly width: Schema.optionalKey<Schema.Number>;
        readonly height: Schema.optionalKey<Schema.Number>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setFullScreen",
      Schema.Struct<{
        fullScreen: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setOpacity",
      Schema.Struct<{
        opacity: Schema.Number;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setProgress",
      Schema.Struct<{
        progress: Schema.Number;
        mode: Schema.optionalKey<
          Schema.Literals<readonly ["none", "normal", "indeterminate", "error", "paused"]>
        >;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setTitle",
      Schema.Struct<{
        title: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setZoom",
      Schema.Struct<{
        factor: Schema.Number;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<"show", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"showInactive", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "state",
      Schema.Void,
      Schema.Struct<{
        readonly bounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly normalBounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly contentBounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly visible: Schema.Boolean;
        readonly focused: Schema.Boolean;
        readonly minimized: Schema.Boolean;
        readonly maximized: Schema.Boolean;
        readonly fullScreen: Schema.Boolean;
        readonly title: Schema.String;
        readonly alwaysOnTop: Schema.Boolean;
        readonly opacity: Schema.Number;
        readonly resizable: Schema.Boolean;
        readonly movable: Schema.Boolean;
        readonly minimizable: Schema.Boolean;
        readonly maximizable: Schema.Boolean;
        readonly closable: Schema.Boolean;
        readonly fullScreenable: Schema.Boolean;
        readonly menuBarVisible: Schema.Boolean;
        readonly kiosk: Schema.Boolean;
      }>,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "stopFind",
      Schema.Struct<{
        action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "zoom",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly factor: Schema.Number;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
>;
```

#### `BrowserWindow.Handle`

```ts
type Handle<A extends Automation.Declaration = {}> = Effect.Success<ReturnType<typeof make<A>>>;
```

#### `BrowserWindow.make`

```ts
const make: <const A extends Automation.Declaration = {}>(
  options?: Options<A>,
) => Effect.Effect<
  {
    id: string;
    current: Effect.Effect<
      {
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
      },
      SewedError,
      MainContext
    >;
    show: Effect.Effect<void, SewedError, MainContext>;
    showInactive: Effect.Effect<void, SewedError, MainContext>;
    hide: Effect.Effect<void, SewedError, MainContext>;
    focus: Effect.Effect<void, SewedError, MainContext>;
    setBounds: (
      bounds: WindowControls.BoundsUpdate,
    ) => Effect.Effect<void, SewedError, MainContext>;
    setFullScreen: (fullScreen: boolean) => Effect.Effect<void, SewedError, MainContext>;
    minimize: Effect.Effect<void, SewedError, MainContext>;
    maximize: Effect.Effect<void, SewedError, MainContext>;
    restore: Effect.Effect<void, SewedError, MainContext>;
    close: Effect.Effect<void, SewedError, MainContext>;
    setTitle: (title: string) => Effect.Effect<void, SewedError, MainContext>;
    setAlwaysOnTop: (
      alwaysOnTop: boolean,
      level?: WindowControls.AlwaysOnTopLevel,
    ) => Effect.Effect<void, SewedError, MainContext>;
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
    setProgress: (
      progress: number,
      mode?: WindowControls.ProgressMode,
    ) => Effect.Effect<void, SewedError, MainContext>;
    setOverlayIcon: (
      icon: string | null,
      description: string,
    ) => Effect.Effect<void, SewedError, MainContext>;
    setIcon: (icon: string) => Effect.Effect<void, SewedError, MainContext>;
    setParent: (parent: Window.Parent | null) => Effect.Effect<void, SewedError, MainContext>;
    decide: <Event, Answer, Timing extends "sync" | "async", R = never>(
      decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition, "window">,
      decider: Decision.DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>,
    ) => Effect.Effect<void, SewedError, R | MainContext | Scope.Scope>;
    state: Stream.Stream<
      {
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
      },
      never,
      MainContext
    >;
    awaitClosed: Effect.Effect<void, never, MainContext>;
    attach: (
      view: View.Attachable,
      options: View.AttachOptions,
    ) => Effect.Effect<View.Attachment, SewedError, MainContext | Scope.Scope>;
    mediaSourceId: Effect.Effect<string, SewedError, MainContext>;
    contentBounds: Effect.Effect<Electron.Rectangle, SewedError, MainContext>;
    touchBar: TouchBar.Handle;
    webContents: {
      print: (options?: WebContents.PrintOptions) => Effect.Effect<void, SewedError, MainContext>;
      pdf: (
        options?: WebContents.PdfOptions,
      ) => Effect.Effect<Uint8Array<ArrayBuffer>, SewedError, MainContext>;
      capture: (
        options?: WebContents.CaptureOptions,
      ) => Effect.Effect<Uint8Array<ArrayBuffer>, SewedError, MainContext>;
      zoom: Stream.Stream<
        {
          readonly factor: number;
        },
        never,
        MainContext
      >;
      setZoom: (factor: number) => Effect.Effect<void, SewedError, MainContext>;
      audio: Stream.Stream<
        {
          readonly muted: boolean;
          readonly audible: boolean;
        },
        never,
        MainContext
      >;
      setAudioMuted: (muted: boolean) => Effect.Effect<void, SewedError, MainContext>;
      userAgent: Effect.Effect<string, SewedError, MainContext>;
      setUserAgent: (userAgent: string) => Effect.Effect<void, SewedError, MainContext>;
      find: (
        text: string,
        options?: WebContents.FindOptions,
      ) => Effect.Effect<WebContents.Search, SewedError, MainContext | Scope.Scope>;
      findNext: (forward?: boolean) => Effect.Effect<void, SewedError, MainContext>;
      stopFind: (action?: WebContents.FindStop) => Effect.Effect<void, SewedError, MainContext>;
      style: (
        css: string,
        options?: WebContents.StyleOptions,
      ) => Effect.Effect<void, SewedError, MainContext | Scope.Scope>;
      history: Stream.Stream<
        {
          readonly index: number;
          readonly entries: readonly {
            readonly url: string;
            readonly title: string;
          }[];
          readonly canGoBack: boolean;
          readonly canGoForward: boolean;
        },
        never,
        MainContext
      >;
      back: Effect.Effect<void, SewedError, MainContext>;
      forward: Effect.Effect<void, SewedError, MainContext>;
      go: (index: number) => Effect.Effect<void, SewedError, MainContext>;
      clearHistory: Effect.Effect<void, SewedError, MainContext>;
      openDevTools: (
        options?: WebContents.DevToolsOptions,
      ) => Effect.Effect<void, SewedError, MainContext>;
      closeDevTools: Effect.Effect<void, SewedError, MainContext>;
      focus: Effect.Effect<void, SewedError, MainContext>;
      console: Stream.Stream<
        {
          readonly level: "debug" | "error" | "info" | "warning";
          readonly message: string;
          readonly lineNumber: number;
          readonly sourceId: string;
        },
        SewedError,
        MainContext
      >;
      state: Stream.Stream<
        | {
            readonly status: "idle";
          }
        | {
            readonly status: "loading";
            readonly url: string;
          }
        | {
            readonly status: "ready";
            readonly url: string;
            readonly processId: number;
          }
        | {
            readonly status: "failed";
            readonly url: string;
            readonly code: number;
            readonly description: string;
          }
        | {
            readonly status: "gone";
            readonly reason: string;
            readonly exitCode: number;
          },
        never,
        MainContext
      >;
      responsiveness: Stream.Stream<
        | {
            readonly status: "unknown";
          }
        | {
            readonly status: "responsive" | "unresponsive";
            readonly processId: number;
          },
        never,
        MainContext
      >;
      favicons: Stream.Stream<readonly string[], never, MainContext>;
      terminate: Effect.Effect<void, SewedError, MainContext>;
      recover: Effect.Effect<void, SewedError, MainContext>;
      decide: <Event, Answer, Timing extends "sync" | "async", R = never>(
        decidable: Decision.Decidable<Event, Answer, Timing, Decision.Composition, "contents">,
        decider: Decision.DeciderFor<NoInfer<Event>, NoInfer<Answer>, NoInfer<Timing>, R>,
      ) => Effect.Effect<void, SewedError, R | MainContext | Scope.Scope>;
      blocked: Stream.Stream<
        {
          readonly kind: "download" | "navigation" | "popup" | "redirect" | "webview";
          readonly url: string;
        },
        SewedError,
        MainContext
      >;
      load: <Keys extends string, const B extends readonly Binding.Bound<Keys>[]>(
        entry: Renderer.Entry<Keys> & Binding.Complete<Keys, B>,
        options: {
          readonly bindings: B;
        },
      ) => Effect.Effect<void, SewedError, MainContext>;
      reload: Effect.Effect<void, SewedError, MainContext>;
      downloads: Stream.Stream<Download.Handle, SewedError, MainContext>;
    };
    dialog: {
      message: (
        options: Dialog.MessageOptions,
      ) => Effect.Effect<Dialog.MessageResult, SewedError, MainContext>;
      open: (
        options: Dialog.OpenOptions,
      ) => Effect.Effect<Dialog.OpenResult, SewedError, MainContext>;
      save: (
        options: Dialog.SaveOptions,
      ) => Effect.Effect<Dialog.SaveResult, SewedError, MainContext>;
    };
    menu: {
      share: (
        item: Menu.SharingItem,
        position?: {
          readonly x: number;
          readonly y: number;
        },
      ) => Effect.Effect<void, SewedError, MainContext>;
      popup: (
        options: Menu.PopupOptions,
      ) => Effect.Effect<Menu.PopupResult, SewedError, MainContext>;
    };
    automation: Automation.Of<A>;
  },
  SewedError,
  MainContext | Scope.Scope
>;
```

#### `BrowserWindow.Options`

```ts
interface Options<A extends Automation.Declaration = {}
```

### `Capability`

#### `Capability.serve`

```ts
const serve: <Rpcs extends Rpc.Any, Key extends string>(
  capability: Capability<Rpcs, Key>,
) => Effect.Effect<
  Binding.Owner<Rpcs>,
  SewedError,
  Capability<Rpcs, Key> | MainContext | Scope.Scope
>;
```

### `Clipboard`

#### `Clipboard.capability`

The whole clipboard surface as one capability: `Clipboard.native` in `sewed/main` carries the
format policy, `Capability.client` reaches it from a document, and `Testing.Clipboard.memory`
stands in for tests.

```ts
const capability: Capability.Capability<
  | Rpc.Rpc<"clear", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "formats",
      Schema.Void,
      Schema.$Array<Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>>,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "read",
      Schema.Struct<{
        format: Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>;
      }>,
      Schema.NullOr<
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly kind: Schema.Literal<"text">;
              readonly text: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"html">;
              readonly html: Schema.String;
              readonly text: Schema.optionalKey<Schema.String>;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"rtf">;
              readonly rtf: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"image">;
              readonly png: Schema.Uint8Array;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"bookmark">;
              readonly title: Schema.String;
              readonly url: Schema.String;
            }>,
          ]
        >
      >,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "write",
      Schema.Struct<{
        content: Schema.Union<
          readonly [
            Schema.Struct<{
              readonly kind: Schema.Literal<"text">;
              readonly text: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"html">;
              readonly html: Schema.String;
              readonly text: Schema.optionalKey<Schema.String>;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"rtf">;
              readonly rtf: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"image">;
              readonly png: Schema.Uint8Array;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"bookmark">;
              readonly title: Schema.String;
              readonly url: Schema.String;
            }>,
          ]
        >;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >,
  "sewed/binding/clipboard"
>;
```

#### `Clipboard.clear`

```ts
const clear: Effect.Effect<void, SewedError, MainContext>;
```

#### `Clipboard.Content`

```ts
const Content: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"text">;
      readonly text: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"html">;
      readonly html: Schema.String;
      readonly text: Schema.optionalKey<Schema.String>;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"rtf">;
      readonly rtf: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"image">;
      readonly png: Schema.Uint8Array;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"bookmark">;
      readonly title: Schema.String;
      readonly url: Schema.String;
    }>,
  ]
>;
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
const native: (
  policy: Clipboard.Policy,
) => Layer.Layer<typeof Clipboard.capability, SewedError, MainContext>;
```

#### `Clipboard.Policy`

Formats this capability may read and write; anything omitted is denied.

```ts
const Policy: Schema.Struct<{
  readonly read: Schema.$Array<
    Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>
  >;
  readonly write: Schema.$Array<
    Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>
  >;
}>;
type Policy = typeof Policy.Type;
```

#### `Clipboard.protocol`

```ts
const protocol: RpcGroup.RpcGroup<
  | Rpc.Rpc<"clear", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "formats",
      Schema.Void,
      Schema.$Array<Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>>,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "read",
      Schema.Struct<{
        format: Schema.Literals<readonly ["text", "html", "rtf", "image", "bookmark"]>;
      }>,
      Schema.NullOr<
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly kind: Schema.Literal<"text">;
              readonly text: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"html">;
              readonly html: Schema.String;
              readonly text: Schema.optionalKey<Schema.String>;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"rtf">;
              readonly rtf: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"image">;
              readonly png: Schema.Uint8Array;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"bookmark">;
              readonly title: Schema.String;
              readonly url: Schema.String;
            }>,
          ]
        >
      >,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "write",
      Schema.Struct<{
        content: Schema.Union<
          readonly [
            Schema.Struct<{
              readonly kind: Schema.Literal<"text">;
              readonly text: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"html">;
              readonly html: Schema.String;
              readonly text: Schema.optionalKey<Schema.String>;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"rtf">;
              readonly rtf: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"image">;
              readonly png: Schema.Uint8Array;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"bookmark">;
              readonly title: Schema.String;
              readonly url: Schema.String;
            }>,
          ]
        >;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
>;
```

#### `Clipboard.read`

Reads one format, or `null` when the clipboard holds nothing of that kind.

```ts
const read: (
  format: Clipboard.Format,
) => Effect.Effect<Clipboard.Content | null, SewedError, MainContext>;
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

### `ContentTracing`

#### `ContentTracing.bufferUsage`

```ts
const bufferUsage: Effect.Effect<ContentTracing.BufferUsage, SewedError, MainContext>;
```

#### `ContentTracing.BufferUsage`

```ts
const BufferUsage: Schema.Struct<{
  readonly value: Schema.Number;
  readonly percentage: Schema.Number;
}>;
type BufferUsage = typeof BufferUsage.Type;
```

#### `ContentTracing.categories`

```ts
const categories: Effect.Effect<readonly string[], SewedError, MainContext>;
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
const Mode: Schema.Literals<
  readonly [
    "record-until-full",
    "record-continuously",
    "record-as-much-as-possible",
    "trace-to-console",
  ]
>;
type Mode = typeof Mode.Type;
```

#### `ContentTracing.Options`

```ts
const Options: Schema.Struct<{
  readonly included: Schema.optionalKey<Schema.$Array<Schema.String>>;
  readonly excluded: Schema.optionalKey<Schema.$Array<Schema.String>>;
  readonly mode: Schema.optionalKey<
    Schema.Literals<
      readonly [
        "record-until-full",
        "record-continuously",
        "record-as-much-as-possible",
        "trace-to-console",
      ]
    >
  >;
  readonly bufferKb: Schema.optionalKey<Schema.Int>;
  readonly argumentFilter: Schema.optionalKey<Schema.Boolean>;
}>;
type Options = typeof Options.Type;
```

#### `ContentTracing.record`

Records a Chromium trace for the scope's lifetime and writes it to an absolute path. Stop early
with `stop`; closing the scope stops a recording that is still running.

```ts
const record: (
  file: string,
  options?: ContentTracing.Options,
) => Effect.Effect<Handle, SewedError, MainContext | Scope.Scope>;
```

### `Cookies`

#### `Cookies.capability`

A session's cookies as one capability: `Cookies.native(session, policy)` in `sewed/main` carries
the origin policy for one acquired session, `Capability.client` reaches it from a document, and
`Testing.Cookies.memory` stands in for tests.

```ts
const capability: Capability.Capability<
  | Rpc.Rpc<
      "changes",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly cookie: Schema.Struct<{
            readonly name: Schema.String;
            readonly value: Schema.String;
            readonly domain: Schema.optionalKey<Schema.String>;
            readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
            readonly path: Schema.optionalKey<Schema.String>;
            readonly secure: Schema.optionalKey<Schema.Boolean>;
            readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
            readonly session: Schema.optionalKey<Schema.Boolean>;
            readonly expirationDate: Schema.optionalKey<Schema.Number>;
            readonly sameSite: Schema.Literals<
              readonly ["unspecified", "no_restriction", "lax", "strict"]
            >;
          }>;
          readonly cause: Schema.Literals<
            readonly [
              "inserted",
              "inserted-no-change-overwrite",
              "inserted-no-value-change-overwrite",
              "explicit",
              "overwrite",
              "expired",
              "evicted",
              "expired-overwrite",
            ]
          >;
          readonly removed: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"flush", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "get",
      Schema.Struct<{
        filter: Schema.Struct<{
          readonly url: Schema.optionalKey<Schema.String>;
          readonly name: Schema.optionalKey<Schema.String>;
          readonly domain: Schema.optionalKey<Schema.String>;
          readonly path: Schema.optionalKey<Schema.String>;
          readonly secure: Schema.optionalKey<Schema.Boolean>;
          readonly session: Schema.optionalKey<Schema.Boolean>;
          readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
        }>;
      }>,
      Schema.$Array<
        Schema.Struct<{
          readonly name: Schema.String;
          readonly value: Schema.String;
          readonly domain: Schema.optionalKey<Schema.String>;
          readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
          readonly path: Schema.optionalKey<Schema.String>;
          readonly secure: Schema.optionalKey<Schema.Boolean>;
          readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
          readonly session: Schema.optionalKey<Schema.Boolean>;
          readonly expirationDate: Schema.optionalKey<Schema.Number>;
          readonly sameSite: Schema.Literals<
            readonly ["unspecified", "no_restriction", "lax", "strict"]
          >;
        }>
      >,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "remove",
      Schema.Struct<{
        url: Schema.String;
        name: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "set",
      Schema.Struct<{
        details: Schema.Struct<{
          readonly url: Schema.String;
          readonly name: Schema.String;
          readonly value: Schema.String;
          readonly domain: Schema.optionalKey<Schema.String>;
          readonly path: Schema.optionalKey<Schema.String>;
          readonly secure: Schema.optionalKey<Schema.Boolean>;
          readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
          readonly expirationDate: Schema.optionalKey<Schema.Number>;
          readonly sameSite: Schema.optionalKey<
            Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>
          >;
        }>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >,
  "sewed/binding/cookies"
>;
```

#### `Cookies.Cause`

```ts
const Cause: Schema.Literals<
  readonly [
    "inserted",
    "inserted-no-change-overwrite",
    "inserted-no-value-change-overwrite",
    "explicit",
    "overwrite",
    "expired",
    "evicted",
    "expired-overwrite",
  ]
>;
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
    readonly expirationDate: Schema.optionalKey<Schema.Number>;
    readonly sameSite: Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>;
  }>;
  readonly cause: Schema.Literals<
    readonly [
      "inserted",
      "inserted-no-change-overwrite",
      "inserted-no-value-change-overwrite",
      "explicit",
      "overwrite",
      "expired",
      "evicted",
      "expired-overwrite",
    ]
  >;
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
  readonly expirationDate: Schema.optionalKey<Schema.Number>;
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
  readonly expirationDate: Schema.optionalKey<Schema.Number>;
  readonly sameSite: Schema.optionalKey<
    Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>
  >;
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
const native: (
  session: Handle,
  policy: Cookie.Policy,
) => Layer.Layer<typeof Cookie.capability, SewedError, MainContext>;
```

#### `Cookies.Policy`

Origins this capability may read, write, and observe cookies for; nothing else is reachable.

```ts
const Policy: Schema.$Array<
  Schema.Struct<{
    readonly kind: Schema.Literal<"origin">;
    readonly origin: Schema.String;
  }>
>;
type Policy = typeof Policy.Type;
```

#### `Cookies.protocol`

```ts
const protocol: RpcGroup.RpcGroup<
  | Rpc.Rpc<
      "changes",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly cookie: Schema.Struct<{
            readonly name: Schema.String;
            readonly value: Schema.String;
            readonly domain: Schema.optionalKey<Schema.String>;
            readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
            readonly path: Schema.optionalKey<Schema.String>;
            readonly secure: Schema.optionalKey<Schema.Boolean>;
            readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
            readonly session: Schema.optionalKey<Schema.Boolean>;
            readonly expirationDate: Schema.optionalKey<Schema.Number>;
            readonly sameSite: Schema.Literals<
              readonly ["unspecified", "no_restriction", "lax", "strict"]
            >;
          }>;
          readonly cause: Schema.Literals<
            readonly [
              "inserted",
              "inserted-no-change-overwrite",
              "inserted-no-value-change-overwrite",
              "explicit",
              "overwrite",
              "expired",
              "evicted",
              "expired-overwrite",
            ]
          >;
          readonly removed: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"flush", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "get",
      Schema.Struct<{
        filter: Schema.Struct<{
          readonly url: Schema.optionalKey<Schema.String>;
          readonly name: Schema.optionalKey<Schema.String>;
          readonly domain: Schema.optionalKey<Schema.String>;
          readonly path: Schema.optionalKey<Schema.String>;
          readonly secure: Schema.optionalKey<Schema.Boolean>;
          readonly session: Schema.optionalKey<Schema.Boolean>;
          readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
        }>;
      }>,
      Schema.$Array<
        Schema.Struct<{
          readonly name: Schema.String;
          readonly value: Schema.String;
          readonly domain: Schema.optionalKey<Schema.String>;
          readonly hostOnly: Schema.optionalKey<Schema.Boolean>;
          readonly path: Schema.optionalKey<Schema.String>;
          readonly secure: Schema.optionalKey<Schema.Boolean>;
          readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
          readonly session: Schema.optionalKey<Schema.Boolean>;
          readonly expirationDate: Schema.optionalKey<Schema.Number>;
          readonly sameSite: Schema.Literals<
            readonly ["unspecified", "no_restriction", "lax", "strict"]
          >;
        }>
      >,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "remove",
      Schema.Struct<{
        url: Schema.String;
        name: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "set",
      Schema.Struct<{
        details: Schema.Struct<{
          readonly url: Schema.String;
          readonly name: Schema.String;
          readonly value: Schema.String;
          readonly domain: Schema.optionalKey<Schema.String>;
          readonly path: Schema.optionalKey<Schema.String>;
          readonly secure: Schema.optionalKey<Schema.Boolean>;
          readonly httpOnly: Schema.optionalKey<Schema.Boolean>;
          readonly expirationDate: Schema.optionalKey<Schema.Number>;
          readonly sameSite: Schema.optionalKey<
            Schema.Literals<readonly ["unspecified", "no_restriction", "lax", "strict"]>
          >;
        }>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
>;
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
const Decision: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"deny">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"source">;
      readonly id: Schema.String;
      readonly audio: Schema.optionalKey<
        Schema.Literals<readonly ["loopback", "loopbackWithMute"]>
      >;
    }>,
  ]
>;
type Decision = typeof Decision.Type;
```

#### `DesktopCapturer.Options`

```ts
const Options: Schema.Struct<{
  readonly types: Schema.NonEmptyArray<Schema.Literals<readonly ["screen", "window"]>>;
  readonly thumbnailSize: Schema.optionalKey<
    Schema.Struct<{
      readonly width: Schema.Int;
      readonly height: Schema.Int;
    }>
  >;
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
  readonly thumbnail: Schema.Uint8Array;
  readonly icon: Schema.NullOr<Schema.Uint8Array>;
}>;
type Source = typeof Source.Type;
```

#### `DesktopCapturer.sources`

Lists capturable screens and windows with PNG thumbnails; screen capture itself stays a session policy.

```ts
const sources: (
  options: DesktopCapturer.Options,
) => Effect.Effect<readonly DesktopCapturer.Source[], SewedError, MainContext>;
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
const Outcome: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"completed">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"cancelled">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"interrupted">;
    }>,
  ]
>;
type Outcome = typeof Outcome.Type;
```

#### `Download.start`

```ts
const start: (
  session: SessionHandle,
  options: Download.Options,
) => Effect.Effect<Download.Handle, SewedError, MainContext | Scope.Scope>;
```

#### `Download.State`

```ts
const State: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly receivedBytes: Schema.Number;
      readonly totalBytes: Schema.Number;
      readonly percent: Schema.Number;
      readonly currentBytesPerSecond: Schema.Number;
      readonly canResume: Schema.Boolean;
      readonly paused: Schema.Boolean;
      readonly status: Schema.Literal<"pending">;
    }>,
    Schema.Struct<{
      readonly receivedBytes: Schema.Number;
      readonly totalBytes: Schema.Number;
      readonly percent: Schema.Number;
      readonly currentBytesPerSecond: Schema.Number;
      readonly canResume: Schema.Boolean;
      readonly paused: Schema.Boolean;
      readonly status: Schema.Literal<"active">;
      readonly phase: Schema.Literals<readonly ["progressing", "interrupted"]>;
    }>,
    Schema.Struct<{
      readonly receivedBytes: Schema.Number;
      readonly totalBytes: Schema.Number;
      readonly percent: Schema.Number;
      readonly currentBytesPerSecond: Schema.Number;
      readonly canResume: Schema.Boolean;
      readonly paused: Schema.Boolean;
      readonly status: Schema.Literal<"terminal">;
      readonly outcome: Schema.Literals<readonly ["completed", "cancelled", "interrupted"]>;
    }>,
  ]
>;
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
const register: (
  accelerator: string,
) => Effect.Effect<Handle, SewedError, MainContext | Scope.Scope>;
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
const make: <const A extends Automation.Declaration = {}>(
  options: Public.Options<A>,
) => Effect.Effect<Handle<A>, SewedError, MainContext | Scope.Scope>;
```

#### `GuestView.native`

A guest's hosted tab for main. Like a window's controls, this capability belongs to an owner, so
the Layer threads an acquired guest rather than a plain options bag, and compiles the host
policy once over that guest. The policy lives in this Layer, not in a separate host, so
`Capability.serve(GuestView.tab)` gives a document exactly the rules a main-side call obeys.

```ts
const native: (
  guest: Guest,
  policy: HostPolicy,
) => Layer.Layer<typeof tab, SewedError, MainContext>;
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
const protocol: RpcGroup.RpcGroup<
  | Rpc.Rpc<"back", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "capture",
      Schema.Struct<{
        readonly rect: Schema.optionalKey<
          Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>
        >;
        readonly stayHidden: Schema.optionalKey<Schema.Boolean>;
        readonly stayAwake: Schema.optionalKey<Schema.Boolean>;
      }>,
      Schema.Uint8Array,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "find",
      Schema.Struct<{
        text: Schema.String;
        options: Schema.optionalKey<
          Schema.Struct<{
            readonly forward: Schema.optionalKey<Schema.Boolean>;
            readonly matchCase: Schema.optionalKey<Schema.Boolean>;
          }>
        >;
      }>,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly activeMatchOrdinal: Schema.Int;
          readonly matches: Schema.Int;
          readonly selectionArea: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly finalUpdate: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "findNext",
      Schema.Struct<{
        forward: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"forward", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "history",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly index: Schema.Int;
          readonly entries: Schema.$Array<
            Schema.Struct<{
              readonly url: Schema.String;
              readonly title: Schema.String;
            }>
          >;
          readonly canGoBack: Schema.Boolean;
          readonly canGoForward: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "navigate",
      Schema.Struct<{
        url: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setZoom",
      Schema.Struct<{
        factor: Schema.Number;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "state",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly status: Schema.Literal<"idle">;
            }>,
            Schema.Struct<{
              readonly status: Schema.Literal<"loading">;
              readonly url: Schema.String;
            }>,
            Schema.Struct<{
              readonly status: Schema.Literal<"ready">;
              readonly url: Schema.String;
              readonly processId: Schema.Number;
            }>,
            Schema.Struct<{
              readonly status: Schema.Literal<"failed">;
              readonly url: Schema.String;
              readonly code: Schema.Number;
              readonly description: Schema.String;
            }>,
            Schema.Struct<{
              readonly status: Schema.Literal<"gone">;
              readonly reason: Schema.String;
              readonly exitCode: Schema.Number;
            }>,
          ]
        >,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "stopFind",
      Schema.Struct<{
        action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "zoom",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly factor: Schema.Number;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
>;
```

#### `GuestView.Settings`

```ts
const Settings: Schema.Struct<{
  readonly navigation: Schema.$Array<
    Schema.Union<
      readonly [
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly kind: Schema.Literal<"origin">;
              readonly origin: Schema.String;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"document">;
              readonly url: Schema.String;
            }>,
          ]
        >,
        Schema.String,
      ]
    >
  >;
  readonly webRtc: Schema.optionalKey<
    Schema.Literals<readonly ["default", "publicInterfaceOnly", "disableNonProxiedUdp"]>
  >;
  readonly input: Schema.optionalKey<Schema.Literals<readonly ["allow", "block"]>>;
  readonly backgroundThrottling: Schema.optionalKey<Schema.Boolean>;
  readonly automation: Schema.optionalKey<
    Schema.Struct<{
      readonly evaluate: Schema.optionalKey<Schema.Literal<true>>;
      readonly devtools: Schema.optionalKey<Schema.NonEmptyArray<Schema.String>>;
      readonly input: Schema.optionalKey<Schema.Literal<true>>;
    }>
  >;
}>;
type Settings = typeof Settings.Type;
```

#### `GuestView.tab`

A guest's hosted tab as one capability. Like a window's controls, it belongs to an owner:
`GuestView.native(guest, policy)` in `sewed/main` carries the host policy for one acquired view,
and `Capability.client` reaches it from a document. The policy still decides `navigate` and
`capture`; everything else on the protocol is always served.

```ts
const tab: Capability.Capability<
  | Rpc.Rpc<"back", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "capture",
      Schema.Struct<{
        readonly rect: Schema.optionalKey<
          Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>
        >;
        readonly stayHidden: Schema.optionalKey<Schema.Boolean>;
        readonly stayAwake: Schema.optionalKey<Schema.Boolean>;
      }>,
      Schema.Uint8Array,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "find",
      Schema.Struct<{
        text: Schema.String;
        options: Schema.optionalKey<
          Schema.Struct<{
            readonly forward: Schema.optionalKey<Schema.Boolean>;
            readonly matchCase: Schema.optionalKey<Schema.Boolean>;
          }>
        >;
      }>,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly activeMatchOrdinal: Schema.Int;
          readonly matches: Schema.Int;
          readonly selectionArea: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly finalUpdate: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "findNext",
      Schema.Struct<{
        forward: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"forward", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "history",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly index: Schema.Int;
          readonly entries: Schema.$Array<
            Schema.Struct<{
              readonly url: Schema.String;
              readonly title: Schema.String;
            }>
          >;
          readonly canGoBack: Schema.Boolean;
          readonly canGoForward: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "navigate",
      Schema.Struct<{
        url: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setZoom",
      Schema.Struct<{
        factor: Schema.Number;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "state",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly status: Schema.Literal<"idle">;
            }>,
            Schema.Struct<{
              readonly status: Schema.Literal<"loading">;
              readonly url: Schema.String;
            }>,
            Schema.Struct<{
              readonly status: Schema.Literal<"ready">;
              readonly url: Schema.String;
              readonly processId: Schema.Number;
            }>,
            Schema.Struct<{
              readonly status: Schema.Literal<"failed">;
              readonly url: Schema.String;
              readonly code: Schema.Number;
              readonly description: Schema.String;
            }>,
            Schema.Struct<{
              readonly status: Schema.Literal<"gone">;
              readonly reason: Schema.String;
              readonly exitCode: Schema.Number;
            }>,
          ]
        >,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "stopFind",
      Schema.Struct<{
        action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "zoom",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly factor: Schema.Number;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >,
  "sewed/binding/guest-tab"
>;
```

#### `GuestView.WebRtcPolicy`

```ts
const WebRtcPolicy: Schema.Literals<
  readonly ["default", "publicInterfaceOnly", "disableNonProxiedUdp"]
>;
type WebRtcPolicy = typeof WebRtcPolicy.Type;
```

### `host`

```ts
const host: <Rpcs extends Rpc.Any, E, R>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  handlers: HandlerLayer<Rpcs, E, R>,
) => Effect.Effect<Binding.Owner<Rpcs>, E, R | MainContext | Scope.Scope>;
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
  readonly price: Schema.Number;
  readonly formattedPrice: Schema.String;
  readonly currencyCode: Schema.String;
  readonly isDownloadable: Schema.Boolean;
}>;
type Product = typeof Product.Type;
```

#### `InAppPurchase.products`

```ts
const products: (
  ids: readonly string[],
) => Effect.Effect<readonly InAppPurchase.Product[], SewedError, MainContext>;
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
  readonly transactionState: Schema.Literals<
    readonly ["purchasing", "purchased", "failed", "restored", "deferred"]
  >;
  readonly errorCode: Schema.Number;
  readonly errorMessage: Schema.String;
  readonly productIdentifier: Schema.String;
  readonly quantity: Schema.Number;
}>;
type Transaction = typeof Transaction.Type;
```

#### `InAppPurchase.transactions`

```ts
const transactions: Stream.Stream<readonly InAppPurchase.Transaction[], SewedError, MainContext>;
```

#### `InAppPurchase.TransactionState`

```ts
const TransactionState: Schema.Literals<
  readonly ["purchasing", "purchased", "failed", "restored", "deferred"]
>;
type TransactionState = typeof TransactionState.Type;
```

### `NativeTheme`

#### `NativeTheme.capability`

The whole theme surface as one capability: `NativeTheme.native` in `sewed/main` carries the
options, `Capability.client` reaches it from a document, and `Testing.NativeTheme.memory`
stands in for tests.

```ts
const capability: Capability.Capability<
  | Rpc.Rpc<
      "setSource",
      Schema.Struct<{
        source: Schema.Literals<readonly ["system", "light", "dark"]>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "state",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly source: Schema.Literals<readonly ["system", "light", "dark"]>;
          readonly shouldUseDarkColors: Schema.Boolean;
          readonly shouldUseHighContrastColors: Schema.Boolean;
          readonly shouldUseInvertedColorScheme: Schema.Boolean;
          readonly inForcedColorsMode: Schema.Boolean;
          readonly prefersReducedTransparency: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >,
  "sewed/binding/native-theme"
>;
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
const native: (
  options?: NativeTheme.Options,
) => Layer.Layer<typeof NativeTheme.capability, SewedError, MainContext>;
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
const protocol: RpcGroup.RpcGroup<
  | Rpc.Rpc<
      "setSource",
      Schema.Struct<{
        source: Schema.Literals<readonly ["system", "light", "dark"]>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "state",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly source: Schema.Literals<readonly ["system", "light", "dark"]>;
          readonly shouldUseDarkColors: Schema.Boolean;
          readonly shouldUseHighContrastColors: Schema.Boolean;
          readonly shouldUseInvertedColorScheme: Schema.Boolean;
          readonly inForcedColorsMode: Schema.Boolean;
          readonly prefersReducedTransparency: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
>;
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
  readonly endpoints: Schema.$Array<
    Schema.Struct<{
      readonly address: Schema.String;
      readonly family: Schema.Literals<readonly ["ipv4", "ipv6", "unspec"]>;
    }>
  >;
}>;
type ResolvedHost = typeof ResolvedHost.Type;
```

#### `Net.resolveHost`

```ts
const resolveHost: (host: string) => Effect.Effect<Net.ResolvedHost, SewedError, MainContext>;
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
  readonly captureMode: Schema.optionalKey<
    Schema.Literals<readonly ["default", "includeSensitive", "everything"]>
  >;
  readonly maxFileSize: Schema.optionalKey<Schema.Int>;
}>;
type Options = typeof Options.Type;
```

#### `NetLog.record`

Records Chromium's network log to an absolute path for the scope's lifetime. Electron keeps
one log at a time, so a second recording fails with `Limit` until the first scope closes.

```ts
const record: (
  file: string,
  options?: NetLog.Options,
) => Effect.Effect<Handle, SewedError, MainContext | Scope.Scope>;
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

#### `Notification.capability`

The whole notification surface as one capability: `Notification.native` in `sewed/main` provides
it, `Capability.client` reaches it from a document, and `Testing.Notification.memory` stands in
for tests. The surface carries no policy; the options are checked on every call.

```ts
const capability: Capability.Capability<
  Rpc.Rpc<
    "show",
    Schema.Struct<{
      readonly title: Schema.String;
      readonly body: Schema.optionalKey<Schema.String>;
      readonly subtitle: Schema.optionalKey<Schema.String>;
      readonly silent: Schema.optionalKey<Schema.Boolean>;
      readonly urgency: Schema.optionalKey<Schema.Literals<readonly ["normal", "critical", "low"]>>;
      readonly timeout: Schema.optionalKey<Schema.Literals<readonly ["default", "never"]>>;
      readonly icon: Schema.optionalKey<Schema.String>;
      readonly actions: Schema.optionalKey<
        Schema.NonEmptyArray<
          Schema.Struct<{
            readonly id: Schema.String;
            readonly text: Schema.String;
          }>
        >
      >;
      readonly reply: Schema.optionalKey<
        Schema.Struct<{
          readonly placeholder: Schema.String;
        }>
      >;
      readonly closeButtonText: Schema.optionalKey<Schema.String>;
    }>,
    RpcSchema.Stream<
      Schema.Union<
        readonly [
          Schema.Struct<{
            readonly kind: Schema.Literal<"shown">;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"clicked">;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"action">;
            readonly id: Schema.String;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"replied">;
            readonly text: Schema.String;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"closed">;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"failed">;
            readonly message: Schema.String;
          }>,
        ]
      >,
      typeof SewedError
    >,
    Schema.Never,
    never,
    never
  >,
  "sewed/binding/notification"
>;
```

#### `Notification.Event`

```ts
const Event: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"shown">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"clicked">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"action">;
      readonly id: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"replied">;
      readonly text: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"closed">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"failed">;
      readonly message: Schema.String;
    }>,
  ]
>;
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
  readonly actions: Schema.optionalKey<
    Schema.NonEmptyArray<
      Schema.Struct<{
        readonly id: Schema.String;
        readonly text: Schema.String;
      }>
    >
  >;
  readonly reply: Schema.optionalKey<
    Schema.Struct<{
      readonly placeholder: Schema.String;
    }>
  >;
  readonly closeButtonText: Schema.optionalKey<Schema.String>;
}>;
type Options = typeof Options.Type;
```

#### `Notification.protocol`

One request is one notification: its stream ends when the notification closes, and interrupting the request closes it.

```ts
const protocol: RpcGroup.RpcGroup<
  Rpc.Rpc<
    "show",
    Schema.Struct<{
      readonly title: Schema.String;
      readonly body: Schema.optionalKey<Schema.String>;
      readonly subtitle: Schema.optionalKey<Schema.String>;
      readonly silent: Schema.optionalKey<Schema.Boolean>;
      readonly urgency: Schema.optionalKey<Schema.Literals<readonly ["normal", "critical", "low"]>>;
      readonly timeout: Schema.optionalKey<Schema.Literals<readonly ["default", "never"]>>;
      readonly icon: Schema.optionalKey<Schema.String>;
      readonly actions: Schema.optionalKey<
        Schema.NonEmptyArray<
          Schema.Struct<{
            readonly id: Schema.String;
            readonly text: Schema.String;
          }>
        >
      >;
      readonly reply: Schema.optionalKey<
        Schema.Struct<{
          readonly placeholder: Schema.String;
        }>
      >;
      readonly closeButtonText: Schema.optionalKey<Schema.String>;
    }>,
    RpcSchema.Stream<
      Schema.Union<
        readonly [
          Schema.Struct<{
            readonly kind: Schema.Literal<"shown">;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"clicked">;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"action">;
            readonly id: Schema.String;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"replied">;
            readonly text: Schema.String;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"closed">;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"failed">;
            readonly message: Schema.String;
          }>,
        ]
      >,
      typeof SewedError
    >,
    Schema.Never,
    never,
    never
  >
>;
```

#### `Notification.show`

Shows a notification for the acquiring scope; closing the scope closes it.

```ts
const show: (
  options: Notification.Options,
) => Effect.Effect<Handle, SewedError, MainContext | Scope.Scope>;
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

Declares application paths set before readiness; every entry is checked before any is set.

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
const capability: Capability.Capability<
  | Rpc.Rpc<
      "events",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly kind: Schema.Literal<"suspend">;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"resume">;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"power-source">;
              readonly onBattery: Schema.Boolean;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"screen">;
              readonly locked: Schema.Boolean;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"user">;
              readonly active: Schema.Boolean;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"shutdown">;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"thermal">;
              readonly state: Schema.Literals<
                readonly ["unknown", "nominal", "fair", "serious", "critical"]
              >;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"speed-limit">;
              readonly limit: Schema.Number;
            }>,
          ]
        >,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "state",
      Schema.Struct<{
        idleThresholdSeconds: Schema.Int;
      }>,
      Schema.Struct<{
        readonly onBattery: Schema.Boolean;
        readonly idleSeconds: Schema.Number;
        readonly idleState: Schema.Literals<readonly ["active", "idle", "locked", "unknown"]>;
        readonly thermal: Schema.Literals<
          readonly ["unknown", "nominal", "fair", "serious", "critical"]
        >;
      }>,
      typeof SewedError,
      never,
      never
    >,
  "sewed/binding/power-monitor"
>;
```

#### `PowerMonitor.Event`

```ts
const Event: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"suspend">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"resume">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"power-source">;
      readonly onBattery: Schema.Boolean;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"screen">;
      readonly locked: Schema.Boolean;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"user">;
      readonly active: Schema.Boolean;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"shutdown">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"thermal">;
      readonly state: Schema.Literals<
        readonly ["unknown", "nominal", "fair", "serious", "critical"]
      >;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"speed-limit">;
      readonly limit: Schema.Number;
    }>,
  ]
>;
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
const protocol: RpcGroup.RpcGroup<
  | Rpc.Rpc<
      "events",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Union<
          readonly [
            Schema.Struct<{
              readonly kind: Schema.Literal<"suspend">;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"resume">;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"power-source">;
              readonly onBattery: Schema.Boolean;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"screen">;
              readonly locked: Schema.Boolean;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"user">;
              readonly active: Schema.Boolean;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"shutdown">;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"thermal">;
              readonly state: Schema.Literals<
                readonly ["unknown", "nominal", "fair", "serious", "critical"]
              >;
            }>,
            Schema.Struct<{
              readonly kind: Schema.Literal<"speed-limit">;
              readonly limit: Schema.Number;
            }>,
          ]
        >,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "state",
      Schema.Struct<{
        idleThresholdSeconds: Schema.Int;
      }>,
      Schema.Struct<{
        readonly onBattery: Schema.Boolean;
        readonly idleSeconds: Schema.Number;
        readonly idleState: Schema.Literals<readonly ["active", "idle", "locked", "unknown"]>;
        readonly thermal: Schema.Literals<
          readonly ["unknown", "nominal", "fair", "serious", "critical"]
        >;
      }>,
      typeof SewedError,
      never,
      never
    >
>;
```

#### `PowerMonitor.state`

```ts
const state: (
  idleThresholdSeconds: number,
) => Effect.Effect<PowerMonitor.State, SewedError, MainContext>;
```

#### `PowerMonitor.State`

```ts
const State: Schema.Struct<{
  readonly onBattery: Schema.Boolean;
  readonly idleSeconds: Schema.Number;
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
const hold: (
  kind: PowerSaveBlocker.Kind,
) => Effect.Effect<Handle, SewedError, MainContext | Scope.Scope>;
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
const handle: <E, R>(
  session: SessionHandle,
  value: Protocol.Scheme,
  handler: Protocol.Handler<E, R>,
) => Effect.Effect<void, SewedError, MainContext | R | Scope.Scope>;
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

### `PushNotifications`

#### `PushNotifications.notifications`

Received APNS payloads as JSON; each observer owns its listener and a queue of 128 payloads.

```ts
const notifications: Stream.Stream<typeof Schema.Json.Type, SewedError, MainContext>;
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
const decrypt: (
  sealed: SafeStorage.Sealed,
) => Effect.Effect<Redacted.Redacted<string>, SewedError, MainContext>;
```

#### `SafeStorage.encrypt`

Encrypts with the OS keystore; the plaintext never leaves its `Redacted` wrapper except here.

```ts
const encrypt: (
  value: Redacted.Redacted<string>,
) => Effect.Effect<SafeStorage.Sealed, SewedError, MainContext>;
```

#### `SafeStorage.Sealed`

Ciphertext with the backend that produced it, so stored secrets stay attributable across OS changes.

```ts
const Sealed: Schema.Struct<{
  readonly version: Schema.Literal<1>;
  readonly backend: Schema.String;
  readonly bytes: Schema.Uint8Array;
}>;
type Sealed = typeof Sealed.Type;
```

### `Screen`

#### `Screen.Bounds`

```ts
const Bounds: Schema.Struct<{
  readonly x: Schema.Number;
  readonly y: Schema.Number;
  readonly width: Schema.Number;
  readonly height: Schema.Number;
}>;
type Bounds = typeof Bounds.Type;
```

#### `Screen.Change`

```ts
const Change: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"added">;
      readonly display: Schema.Struct<{
        readonly id: Schema.Number;
        readonly label: Schema.String;
        readonly bounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly workArea: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly scaleFactor: Schema.Number;
        readonly rotation: Schema.Number;
        readonly internal: Schema.Boolean;
      }>;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"removed">;
      readonly display: Schema.Struct<{
        readonly id: Schema.Number;
        readonly label: Schema.String;
        readonly bounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly workArea: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly scaleFactor: Schema.Number;
        readonly rotation: Schema.Number;
        readonly internal: Schema.Boolean;
      }>;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"metrics">;
      readonly display: Schema.Struct<{
        readonly id: Schema.Number;
        readonly label: Schema.String;
        readonly bounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly workArea: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly scaleFactor: Schema.Number;
        readonly rotation: Schema.Number;
        readonly internal: Schema.Boolean;
      }>;
      readonly metrics: Schema.$Array<Schema.String>;
    }>,
  ]
>;
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

#### `Screen.Display`

```ts
const Display: Schema.Struct<{
  readonly id: Schema.Number;
  readonly label: Schema.String;
  readonly bounds: Schema.Struct<{
    readonly x: Schema.Number;
    readonly y: Schema.Number;
    readonly width: Schema.Number;
    readonly height: Schema.Number;
  }>;
  readonly workArea: Schema.Struct<{
    readonly x: Schema.Number;
    readonly y: Schema.Number;
    readonly width: Schema.Number;
    readonly height: Schema.Number;
  }>;
  readonly scaleFactor: Schema.Number;
  readonly rotation: Schema.Number;
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
const matching: (bounds: Screen.Bounds) => Effect.Effect<
  {
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
  },
  SewedError,
  MainContext
>;
```

#### `Screen.nearest`

```ts
const nearest: (point: Screen.Point) => Effect.Effect<
  {
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
  },
  SewedError,
  MainContext
>;
```

#### `Screen.Point`

```ts
const Point: Schema.Struct<{
  readonly x: Schema.Number;
  readonly y: Schema.Number;
}>;
type Point = typeof Point.Type;
```

#### `Screen.primary`

```ts
const primary: Effect.Effect<
  {
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
  },
  SewedError,
  MainContext
>;
```

### `Session`

#### `Session.cacheSize`

```ts
const cacheSize: (handle: Handle) => Effect.Effect<number, SewedError, MainContext>;
```

#### `Session.clearCache`

```ts
const clearCache: (handle: Handle) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.Cookies`

```ts
interface Cookies {
  readonly get: (
    filter?: Cookie.Filter,
  ) => Effect.Effect<readonly Cookie.Cookie[], SewedError, MainContext>;
  readonly set: (details: Cookie.Details) => Effect.Effect<void, SewedError, MainContext>;
  readonly remove: (url: string, name: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly flush: Effect.Effect<void, SewedError, MainContext>;
  /** Every observer owns its listener and a queue of 128 changes; overflow fails it with `Limit`. */
  readonly changes: Stream.Stream<Cookie.Change, SewedError, MainContext>;
}
```

#### `Session.defaultSession`

```ts
const defaultSession: Effect.Effect<Handle, SewedError, MainContext>;
```

#### `Session.fromPartition`

Selects a native browser session by kind and name. `cookies`, `clearStorage`,
`closeAllConnections`, `resolveHost`, `blobData`, `requests`, `decide`, and `intercept` are
methods on the returned handle, matching how a window and a web contents already read; the
settings below stay free functions taking the handle, since they are not moving in this wave.

```ts
const fromPartition: (partition: Partition) => Effect.Effect<Handle, SewedError, MainContext>;
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

#### `Session.loadExtension`

Loads an unpacked extension for the scope's lifetime; closing the scope unloads it. Electron
only accepts extensions in persistent sessions.

```ts
const loadExtension: (
  handle: Handle,
  directory: string,
  options?: Extension.Options,
) => Effect.Effect<Extension.Info, SewedError, MainContext | Scope.Scope>;
```

#### `Session.Partition`

```ts
type Partition = typeof Partition.Type;
```

#### `Session.resolveProxy`

```ts
const resolveProxy: (handle: Handle, url: string) => Effect.Effect<string, SewedError, MainContext>;
```

#### `Session.serviceWorkers`

```ts
const serviceWorkers: (handle: Handle) => ServiceWorkers;
```

#### `Session.ServiceWorkers`

```ts
interface ServiceWorkers {
  readonly running: Effect.Effect<readonly ServiceWorker.Info[], SewedError, MainContext>;
  /** Every observer owns its listeners and a queue of 128 events; overflow fails it with `Limit`. */
  readonly events: Stream.Stream<ServiceWorker.Event, SewedError, MainContext>;
}
```

#### `Session.setDownloadPath`

```ts
const setDownloadPath: (
  handle: Handle,
  directory: string,
) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.setProxy`

```ts
const setProxy: (
  handle: Handle,
  config: Proxy.Config,
) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.setSpellChecker`

```ts
const setSpellChecker: (
  handle: Handle,
  settings: {
    readonly enabled?: boolean;
    readonly languages?: readonly string[];
  },
) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.setUserAgent`

```ts
const setUserAgent: (
  handle: Handle,
  value: string,
  acceptLanguages?: string,
) => Effect.Effect<void, SewedError, MainContext>;
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

#### `Session.userAgent`

```ts
const userAgent: (handle: Handle) => Effect.Effect<string, SewedError, MainContext>;
```

### `Shell`

#### `Shell.capability`

The whole shell surface as one capability: `Shell.native` in `sewed/main` carries the policy,
`Capability.client` reaches it from a document, and `Testing.Shell.memory` stands in for tests.

```ts
const capability: Capability.Capability<
  | Rpc.Rpc<"beep", Schema.Struct<{}>, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "openExternal",
      Schema.Struct<{
        url: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "openPath",
      Schema.Struct<{
        path: Schema.String;
      }>,
      Schema.Struct<{
        readonly opened: Schema.Boolean;
        readonly message: Schema.String;
      }>,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "showItemInFolder",
      Schema.Struct<{
        path: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "trashItem",
      Schema.Struct<{
        path: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >,
  "sewed/binding/shell"
>;
```

#### `Shell.native`

The shell capability for main. The policy lives in this Layer, not in a separate host, so
`Capability.serve(Shell.capability)` gives a document exactly the rules a main-side call obeys.

```ts
const native: (
  options: Shell.Options,
) => Layer.Layer<typeof Shell.capability, SewedError, MainContext>;
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
  /** Origins, documents, and mail recipients `openExternal` may open. */
  readonly policy: Policy;
  /** Absolute directories whose contents `openPath`, `showItemInFolder`, and `trashItem` may touch. */
  readonly paths?: readonly string[];
}
```

#### `Shell.Policy`

Origins, documents, and exact mail recipients that `openExternal` may reach; nothing else opens.

```ts
const Policy: Schema.$Array<
  Schema.Union<
    readonly [
      Schema.Struct<{
        readonly kind: Schema.Literal<"origin">;
        readonly origin: Schema.String;
      }>,
      Schema.Struct<{
        readonly kind: Schema.Literal<"document">;
        readonly url: Schema.String;
      }>,
      Schema.Struct<{
        readonly kind: Schema.Literal<"mailto">;
        readonly address: Schema.String;
      }>,
    ]
  >
>;
type Policy = typeof Policy.Type;
```

#### `Shell.protocol`

```ts
const protocol: RpcGroup.RpcGroup<
  | Rpc.Rpc<"beep", Schema.Struct<{}>, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "openExternal",
      Schema.Struct<{
        url: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "openPath",
      Schema.Struct<{
        path: Schema.String;
      }>,
      Schema.Struct<{
        readonly opened: Schema.Boolean;
        readonly message: Schema.String;
      }>,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "showItemInFolder",
      Schema.Struct<{
        path: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "trashItem",
      Schema.Struct<{
        path: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
>;
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
const askForMediaAccess: (
  kind: Exclude<SystemPreferences.MediaKind, "screen">,
) => Effect.Effect<boolean, SewedError, MainContext>;
```

#### `SystemPreferences.Change`

```ts
const Change: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"accent-color">;
      readonly color: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"color">;
    }>,
  ]
>;
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

#### `SystemPreferences.mediaAccess`

```ts
const mediaAccess: (
  kind: SystemPreferences.MediaKind,
) => Effect.Effect<SystemPreferences.MediaAccess, SewedError, MainContext>;
```

#### `SystemPreferences.MediaAccess`

```ts
const MediaAccess: Schema.Literals<
  readonly ["not-determined", "granted", "denied", "restricted", "unknown"]
>;
type MediaAccess = typeof MediaAccess.Type;
```

#### `SystemPreferences.MediaKind`

```ts
const MediaKind: Schema.Literals<readonly ["microphone", "camera", "screen"]>;
type MediaKind = typeof MediaKind.Type;
```

#### `SystemPreferences.systemColor`

```ts
const systemColor: (
  name: SystemPreferences.SystemColor,
) => Effect.Effect<string, SewedError, MainContext>;
```

#### `SystemPreferences.SystemColor`

```ts
const SystemColor: Schema.Literals<
  readonly ["blue", "brown", "gray", "green", "orange", "pink", "purple", "red", "yellow"]
>;
type SystemColor = typeof SystemColor.Type;
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
const Interaction: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"click">;
      readonly id: Schema.String;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"slider">;
      readonly id: Schema.String;
      readonly value: Schema.Number;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"segment">;
      readonly id: Schema.String;
      readonly index: Schema.Int;
      readonly selected: Schema.Boolean;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"color">;
      readonly id: Schema.String;
      readonly color: Schema.String;
    }>,
  ]
>;
type Interaction = typeof Interaction.Type;
```

#### `TouchBar.Item`

```ts
type Item = Button | Label | Spacer | Slider | SegmentedControl | ColorPicker | Popover | Group;
const Item: Schema.Codec<Item>;
```

#### `TouchBar.make`

```ts
const make: (native: BaseWindow, isClosed: () => boolean) => Handle;
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

#### `Tray.Event`

```ts
const Event: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly kind: Schema.Literal<"click">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"right-click">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"double-click">;
    }>,
    Schema.Struct<{
      readonly kind: Schema.Literal<"menu-selection">;
      readonly selection: Schema.Union<
        readonly [
          Schema.Struct<{
            readonly kind: Schema.Literal<"command">;
            readonly id: Schema.String;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"checkbox">;
            readonly id: Schema.String;
            readonly checked: Schema.Boolean;
          }>,
          Schema.Struct<{
            readonly kind: Schema.Literal<"radio">;
            readonly id: Schema.String;
          }>,
        ]
      >;
    }>,
  ]
>;
type Event = typeof Event.Type;
```

#### `Tray.Handle`

```ts
interface Handle {
  readonly id: string;
  readonly events: Stream.Stream<Tray.Event, SewedError, MainContext>;
  readonly setToolTip: (tooltip: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly setImage: (icon: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly setMenu: (menu: Tray.MenuOptions) => Effect.Effect<void, SewedError, MainContext>;
}
```

#### `Tray.Icon`

```ts
const Icon: Schema.String;
type Icon = typeof Icon.Type;
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
  readonly icon: Schema.String;
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
const spawn: <
  Rpcs extends Rpc.Any,
  Keys extends string,
  const B extends readonly Bound<Keys>[] = [],
>(
  entry: Entry<Rpcs, Keys> & Complete<Keys, B>,
  options?: {
    readonly bindings: B;
  },
) => Effect.Effect<Handle<Rpcs>, SewedError, MainContext | Scope.Scope>;
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
  readonly setBounds: (bounds: Bounds) => Effect.Effect<void, SewedError, MainContext>;
  readonly setVisible: (visible: boolean) => Effect.Effect<void, SewedError, MainContext>;
  readonly detach: Effect.Effect<void, SewedError, MainContext>;
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

```ts
const make: typeof Native.make;
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
const AlwaysOnTopLevel: Schema.Literals<
  readonly [
    "normal",
    "floating",
    "torn-off-menu",
    "modal-panel",
    "main-menu",
    "status",
    "pop-up-menu",
    "screen-saver",
  ]
>;
type AlwaysOnTopLevel = typeof AlwaysOnTopLevel.Type;
```

#### `WindowControls.Bounds`

```ts
const Bounds: Schema.Struct<{
  readonly x: Schema.Number;
  readonly y: Schema.Number;
  readonly width: Schema.Number;
  readonly height: Schema.Number;
}>;
type Bounds = typeof Bounds.Type;
```

#### `WindowControls.BoundsUpdate`

```ts
const BoundsUpdate: Schema.Struct<{
  readonly x: Schema.optionalKey<Schema.Number>;
  readonly y: Schema.optionalKey<Schema.Number>;
  readonly width: Schema.optionalKey<Schema.Number>;
  readonly height: Schema.optionalKey<Schema.Number>;
}>;
type BoundsUpdate = typeof BoundsUpdate.Type;
```

#### `WindowControls.capability`

One window's controls as one capability. Unlike the ambient surfaces, this one belongs to an
owner: `WindowControls.native(window)` in `sewed/main` carries the window it was built for, so
every operation reaches that window and no other. `Capability.client` reaches it from a
document, and serving it twice for two windows gives two owners over this one protocol.

```ts
const capability: Capability.Capability<
  | Rpc.Rpc<
      "audio",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly muted: Schema.Boolean;
          readonly audible: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"back", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "changes",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly bounds: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly normalBounds: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          /** The content area, excluding the frame; attached views are positioned within it. */
          readonly contentBounds: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly visible: Schema.Boolean;
          readonly focused: Schema.Boolean;
          readonly minimized: Schema.Boolean;
          readonly maximized: Schema.Boolean;
          readonly fullScreen: Schema.Boolean;
          readonly title: Schema.String;
          readonly alwaysOnTop: Schema.Boolean;
          readonly opacity: Schema.Number;
          readonly resizable: Schema.Boolean;
          readonly movable: Schema.Boolean;
          readonly minimizable: Schema.Boolean;
          readonly maximizable: Schema.Boolean;
          readonly closable: Schema.Boolean;
          readonly fullScreenable: Schema.Boolean;
          readonly menuBarVisible: Schema.Boolean;
          readonly kiosk: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"close", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "find",
      Schema.Struct<{
        text: Schema.String;
        options: Schema.optionalKey<
          Schema.Struct<{
            readonly forward: Schema.optionalKey<Schema.Boolean>;
            readonly matchCase: Schema.optionalKey<Schema.Boolean>;
          }>
        >;
      }>,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly activeMatchOrdinal: Schema.Int;
          readonly matches: Schema.Int;
          readonly selectionArea: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly finalUpdate: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "findNext",
      Schema.Struct<{
        forward: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "flash",
      Schema.Struct<{
        flash: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"forward", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"hide", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "history",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly index: Schema.Int;
          readonly entries: Schema.$Array<
            Schema.Struct<{
              readonly url: Schema.String;
              readonly title: Schema.String;
            }>
          >;
          readonly canGoBack: Schema.Boolean;
          readonly canGoForward: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"maximize", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"minimize", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"restore", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "setAlwaysOnTop",
      Schema.Struct<{
        alwaysOnTop: Schema.Boolean;
        level: Schema.optionalKey<
          Schema.Literals<
            readonly [
              "normal",
              "floating",
              "torn-off-menu",
              "modal-panel",
              "main-menu",
              "status",
              "pop-up-menu",
              "screen-saver",
            ]
          >
        >;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setAudioMuted",
      Schema.Struct<{
        muted: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setBounds",
      Schema.Struct<{
        readonly x: Schema.optionalKey<Schema.Number>;
        readonly y: Schema.optionalKey<Schema.Number>;
        readonly width: Schema.optionalKey<Schema.Number>;
        readonly height: Schema.optionalKey<Schema.Number>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setFullScreen",
      Schema.Struct<{
        fullScreen: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setOpacity",
      Schema.Struct<{
        opacity: Schema.Number;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setProgress",
      Schema.Struct<{
        progress: Schema.Number;
        mode: Schema.optionalKey<
          Schema.Literals<readonly ["none", "normal", "indeterminate", "error", "paused"]>
        >;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setTitle",
      Schema.Struct<{
        title: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setZoom",
      Schema.Struct<{
        factor: Schema.Number;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<"show", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"showInactive", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "state",
      Schema.Void,
      Schema.Struct<{
        readonly bounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly normalBounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        /** The content area, excluding the frame; attached views are positioned within it. */
        readonly contentBounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly visible: Schema.Boolean;
        readonly focused: Schema.Boolean;
        readonly minimized: Schema.Boolean;
        readonly maximized: Schema.Boolean;
        readonly fullScreen: Schema.Boolean;
        readonly title: Schema.String;
        readonly alwaysOnTop: Schema.Boolean;
        readonly opacity: Schema.Number;
        readonly resizable: Schema.Boolean;
        readonly movable: Schema.Boolean;
        readonly minimizable: Schema.Boolean;
        readonly maximizable: Schema.Boolean;
        readonly closable: Schema.Boolean;
        readonly fullScreenable: Schema.Boolean;
        readonly menuBarVisible: Schema.Boolean;
        readonly kiosk: Schema.Boolean;
      }>,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "stopFind",
      Schema.Struct<{
        action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "zoom",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly factor: Schema.Number;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >,
  "sewed/binding/window-controls"
>;
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
  readonly back: Effect.Effect<void, SewedError, R>;
  readonly forward: Effect.Effect<void, SewedError, R>;
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
const native: (
  window: Core<MainContext>,
) => Layer.Layer<typeof WindowControls.capability, SewedError, MainContext>;
```

#### `WindowControls.Opacity`

```ts
const Opacity: Schema.Number;
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
const Progress: Schema.Number;
```

#### `WindowControls.ProgressMode`

```ts
const ProgressMode: Schema.Literals<
  readonly ["none", "normal", "indeterminate", "error", "paused"]
>;
type ProgressMode = typeof ProgressMode.Type;
```

#### `WindowControls.protocol`

```ts
const protocol: RpcGroup.RpcGroup<
  | Rpc.Rpc<
      "audio",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly muted: Schema.Boolean;
          readonly audible: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"back", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "changes",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly bounds: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly normalBounds: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          /** The content area, excluding the frame; attached views are positioned within it. */
          readonly contentBounds: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly visible: Schema.Boolean;
          readonly focused: Schema.Boolean;
          readonly minimized: Schema.Boolean;
          readonly maximized: Schema.Boolean;
          readonly fullScreen: Schema.Boolean;
          readonly title: Schema.String;
          readonly alwaysOnTop: Schema.Boolean;
          readonly opacity: Schema.Number;
          readonly resizable: Schema.Boolean;
          readonly movable: Schema.Boolean;
          readonly minimizable: Schema.Boolean;
          readonly maximizable: Schema.Boolean;
          readonly closable: Schema.Boolean;
          readonly fullScreenable: Schema.Boolean;
          readonly menuBarVisible: Schema.Boolean;
          readonly kiosk: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"close", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "find",
      Schema.Struct<{
        text: Schema.String;
        options: Schema.optionalKey<
          Schema.Struct<{
            readonly forward: Schema.optionalKey<Schema.Boolean>;
            readonly matchCase: Schema.optionalKey<Schema.Boolean>;
          }>
        >;
      }>,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly activeMatchOrdinal: Schema.Int;
          readonly matches: Schema.Int;
          readonly selectionArea: Schema.Struct<{
            readonly x: Schema.Number;
            readonly y: Schema.Number;
            readonly width: Schema.Number;
            readonly height: Schema.Number;
          }>;
          readonly finalUpdate: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<
      "findNext",
      Schema.Struct<{
        forward: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "flash",
      Schema.Struct<{
        flash: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"forward", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"hide", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "history",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly index: Schema.Int;
          readonly entries: Schema.$Array<
            Schema.Struct<{
              readonly url: Schema.String;
              readonly title: Schema.String;
            }>
          >;
          readonly canGoBack: Schema.Boolean;
          readonly canGoForward: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"maximize", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"minimize", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"restore", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "setAlwaysOnTop",
      Schema.Struct<{
        alwaysOnTop: Schema.Boolean;
        level: Schema.optionalKey<
          Schema.Literals<
            readonly [
              "normal",
              "floating",
              "torn-off-menu",
              "modal-panel",
              "main-menu",
              "status",
              "pop-up-menu",
              "screen-saver",
            ]
          >
        >;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setAudioMuted",
      Schema.Struct<{
        muted: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setBounds",
      Schema.Struct<{
        readonly x: Schema.optionalKey<Schema.Number>;
        readonly y: Schema.optionalKey<Schema.Number>;
        readonly width: Schema.optionalKey<Schema.Number>;
        readonly height: Schema.optionalKey<Schema.Number>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setFullScreen",
      Schema.Struct<{
        fullScreen: Schema.Boolean;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setOpacity",
      Schema.Struct<{
        opacity: Schema.Number;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setProgress",
      Schema.Struct<{
        progress: Schema.Number;
        mode: Schema.optionalKey<
          Schema.Literals<readonly ["none", "normal", "indeterminate", "error", "paused"]>
        >;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setTitle",
      Schema.Struct<{
        title: Schema.String;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "setZoom",
      Schema.Struct<{
        factor: Schema.Number;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<"show", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"showInactive", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<
      "state",
      Schema.Void,
      Schema.Struct<{
        readonly bounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly normalBounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        /** The content area, excluding the frame; attached views are positioned within it. */
        readonly contentBounds: Schema.Struct<{
          readonly x: Schema.Number;
          readonly y: Schema.Number;
          readonly width: Schema.Number;
          readonly height: Schema.Number;
        }>;
        readonly visible: Schema.Boolean;
        readonly focused: Schema.Boolean;
        readonly minimized: Schema.Boolean;
        readonly maximized: Schema.Boolean;
        readonly fullScreen: Schema.Boolean;
        readonly title: Schema.String;
        readonly alwaysOnTop: Schema.Boolean;
        readonly opacity: Schema.Number;
        readonly resizable: Schema.Boolean;
        readonly movable: Schema.Boolean;
        readonly minimizable: Schema.Boolean;
        readonly maximizable: Schema.Boolean;
        readonly closable: Schema.Boolean;
        readonly fullScreenable: Schema.Boolean;
        readonly menuBarVisible: Schema.Boolean;
        readonly kiosk: Schema.Boolean;
      }>,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "stopFind",
      Schema.Struct<{
        action: Schema.Literals<readonly ["clearSelection", "keepSelection", "activateSelection"]>;
      }>,
      Schema.Void,
      typeof SewedError,
      never,
      never
    >
  | Rpc.Rpc<
      "zoom",
      Schema.Void,
      RpcSchema.Stream<
        Schema.Struct<{
          readonly factor: Schema.Number;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
>;
```

#### `WindowControls.State`

```ts
const State: Schema.Struct<{
  readonly bounds: Schema.Struct<{
    readonly x: Schema.Number;
    readonly y: Schema.Number;
    readonly width: Schema.Number;
    readonly height: Schema.Number;
  }>;
  readonly normalBounds: Schema.Struct<{
    readonly x: Schema.Number;
    readonly y: Schema.Number;
    readonly width: Schema.Number;
    readonly height: Schema.Number;
  }>;
  /** The content area, excluding the frame; attached views are positioned within it. */
  readonly contentBounds: Schema.Struct<{
    readonly x: Schema.Number;
    readonly y: Schema.Number;
    readonly width: Schema.Number;
    readonly height: Schema.Number;
  }>;
  readonly visible: Schema.Boolean;
  readonly focused: Schema.Boolean;
  readonly minimized: Schema.Boolean;
  readonly maximized: Schema.Boolean;
  readonly fullScreen: Schema.Boolean;
  readonly title: Schema.String;
  readonly alwaysOnTop: Schema.Boolean;
  readonly opacity: Schema.Number;
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
const spawn: <
  Rpcs extends Rpc.Any,
  Keys extends string,
  const B extends readonly Bound<Keys>[] = [],
>(
  entry: Entry<Rpcs, Keys> & Complete<Keys, B>,
  options?: {
    readonly bindings: B;
  },
) => Effect.Effect<Handle<Rpcs>, SewedError, MainContext | Scope.Scope>;
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

### `Clipboard`

#### `Clipboard.memory`

The clipboard capability for tests: the same policy `Clipboard.native` carries, no Electron, and
a recorder listing the calls. An invalid policy still fails as the Layer builds.

```ts
const memory: (
  policy: Clipboard.Policy,
) => Layer.Layer<typeof Clipboard.capability | CapabilityMemory.Recorder, SewedError>;
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
const contents: (
  of:
    | {
        readonly of: "window";
      }
    | {
        readonly of: "guest";
        readonly input?: InputPolicy;
      },
) => DecisionOwner<"contents">;
```

### `Cookies`

#### `Cookies.memory`

The cookie capability for tests: the same policy `Cookies.native` carries, no session and no
Electron, and a recorder listing the calls. An invalid policy still fails as the Layer builds.

```ts
const memory: (
  policy: Cookie.Policy,
) => Layer.Layer<typeof Cookie.capability | CapabilityMemory.Recorder, SewedError>;
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
const host: <Rpcs extends Rpc.Any, E, R>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  handlers: HandlerLayer<Rpcs, E, R>,
) => Effect.Effect<Binding.Owner<Rpcs>, E, R | MainContext | Scope.Scope>;
```

### `layer`

```ts
const layer: <Rpcs extends Rpc.Any, E, R>(
  slot: Slot<Rpcs>,
  handlers: Layer.Layer<NoInfer<HandlerServices<Rpcs>>, E, R>,
  options?: {
    readonly onConnect?: () => void;
  },
) => Layer.Layer<ClientContext, E | SewedError, R>;
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
const memory: <Rpcs extends Rpc.Any, Key extends string, E, R>(
  capability: Capability<Rpcs, Key>,
  handlers: HandlerLayer<Rpcs, E, R>,
) => Layer.Layer<Capability<Rpcs, Key> | Recorder, E, R>;
```

### `NativeTheme`

#### `NativeTheme.memory`

The theme capability for tests: the same options `NativeTheme.native` carries, no Electron, and
a recorder listing the calls. Invalid options still fail as the Layer builds.

```ts
const memory: (
  options?: NativeTheme.Options,
) => Layer.Layer<typeof NativeTheme.capability | CapabilityMemory.Recorder, SewedError>;
```

### `Notification`

#### `Notification.memory`

The notification capability for tests: the same options check `Notification.native` carries, no
Electron, and a recorder listing the calls.

```ts
const memory: () => Layer.Layer<
  typeof Notification.capability | CapabilityMemory.Recorder,
  SewedError
>;
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
const owner: <O extends Exclude<Decision.OwnerKind, "contents" | "requests">>(
  kind: O,
) => DecisionOwner<O>;
```

### `PowerMonitor`

#### `PowerMonitor.memory`

The power capability for tests: the same threshold check `PowerMonitor.native` carries, no
Electron, and a recorder listing the calls.

```ts
const memory: () => Layer.Layer<
  typeof PowerMonitor.capability | CapabilityMemory.Recorder,
  SewedError
>;
```

### `Recorder`

What a memory capability recorded. `calls` is a snapshot, so a test can read it repeatedly.

```ts
class Recorder extends Recorder_base {}
```

### `requests`

The stand-in for a session's three request stages. `intercept` is its only install door, as it is
a real session's, and it applies a feature's filter with the same code that door does — the stage
lookup, the filter decode, the refusal of a `body` option on a stage that carries none, and the
wrapper that answers `Decision.Pass` for a request the filter does not select. Upload assembly is
the one part that stays native, so a test event carries the `body` it wants its decider to see.

`resolve` answers `Session.Request`, which ranks; `resolveChain` folds the two header stages.

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
}
```

### `Shell`

#### `Shell.memory`

The shell capability for tests: the same policy `Shell.native` carries, no Electron, and a
recorder listing the calls. An invalid policy or a relative root still fails as the Layer builds.

```ts
const memory: (
  options: Shell.Options,
) => Layer.Layer<typeof Shell.capability | CapabilityMemory.Recorder, SewedError>;
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
const spawn: <
  Rpcs extends Rpc.Any,
  Keys extends string,
  const B extends readonly Bound<Keys>[] = [],
>(
  entry: Entry<Rpcs, Keys> & Complete<Keys, B>,
  options?: {
    readonly bindings: B;
  },
) => Effect.Effect<Handle<Rpcs>, SewedError, MainContext | Scope.Scope>;
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

### `mount`

```ts
const mount: (
  container: Element,
  children: ReactNode,
) => Effect.Effect<void, never, Action.ActionServices>;
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

Provides a connected runtime to a React tree the application already owns. Hooks that need the
runtime work while the store is ready; read `useRuntimeStatus` to render before that.

```ts
const RuntimeProvider: ({
  store,
  children,
}: {
  readonly store: RuntimeStore;
  readonly children?: ReactNode;
}) => react.JSX.Element;
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
type StreamState<A, E> =
  | {
      readonly status: "loading";
    }
  | {
      readonly status: "value";
      readonly value: A;
    }
  | {
      readonly status: "failure";
      readonly cause: Cause.Cause<E>;
    };
```

### `useAction`

```ts
const useAction: <Args extends readonly unknown[], A, E>(
  factory: (...args: Args) => Effect.Effect<A, E, Action.ActionServices>,
  options?: {
    readonly mode?: "latest" | "exhaust";
  },
) =>
  | {
      status: "idle";
      run: (...args: Args) => void;
      cancel: () => void;
    }
  | {
      status: "running";
      run: (...args: Args) => void;
      cancel: () => void;
    }
  | {
      status: "success";
      value: A;
      run: (...args: Args) => void;
      cancel: () => void;
    }
  | {
      status: "failure";
      cause: Cause.Cause<E>;
      run: (...args: Args) => void;
      cancel: () => void;
    }
  | {
      status: "interrupted";
      run: (...args: Args) => void;
      cancel: () => void;
    };
```

### `useClient`

```ts
const useClient: <Rpcs extends Rpc.Any>(
  slot: Binding.Slot<Rpcs>,
  options?: {
    readonly connection?: Binding.Connection;
  },
) => Binding.Client<Rpcs>;
```

### `useResource`

```ts
const useResource: <A, E>(
  factory: () => Effect.Effect<A, E, ResourceServices | Scope.Scope>,
  dependencies: DependencyList,
) => ResourceState<A, E> & {
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
const useStream: <A, E>(
  factory: () => Stream.Stream<A, E, Action.ActionServices>,
  dependencies: DependencyList,
) => StreamState<A, E>;
```

## `@sewed/vite`

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
const layer: (
  options?: Options & {
    readonly enabled?: boolean;
  },
) => Layer.Layer<never, SewedError, MainContext>;
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

## `@sewed/forge`

### `CrashReporter`

#### `CrashReporter.Declaration`

`Options` plus the crash-dump directory, set as Electron's `crashDumps` path before the reporter starts.

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
covered. `directory` sets the crash-dump path first, in the order Electron needs; invalid
options fail startup with code `Startup`.

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
const feedUrl: (
  repository: GithubRepository,
  platform: string,
  arch: string,
  version: string,
) => string;
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
const State: Schema.Union<
  readonly [
    Schema.Struct<{
      readonly status: Schema.Literal<"idle">;
    }>,
    Schema.Struct<{
      readonly status: Schema.Literal<"checking">;
    }>,
    Schema.Struct<{
      readonly status: Schema.Literal<"available">;
    }>,
    Schema.Struct<{
      readonly status: Schema.Literal<"not-available">;
    }>,
    Schema.Struct<{
      readonly status: Schema.Literal<"downloaded">;
      readonly releaseName: Schema.String;
      readonly releaseNotes: Schema.String;
      readonly releaseDate: Schema.String;
      readonly updateUrl: Schema.String;
    }>,
    Schema.Struct<{
      readonly status: Schema.Literal<"installing">;
    }>,
    Schema.Struct<{
      readonly status: Schema.Literal<"error">;
      readonly message: Schema.String;
    }>,
  ]
>;
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
