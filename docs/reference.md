# API reference

Generated from the built declaration files by `scripts/api-reference.mjs`. Regenerate with `pnpm docs:reference`; the root test script checks that this file is current. Declarations are printed as emitted, so an opaque handle type names the constructor whose result it describes.

## `sewed`

### `Binary`

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

### `ClientContext`

```ts
class ClientContext extends ClientContext_base {}
```

### `Clipboard`

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

#### `Clipboard.Policy`

Formats a hosted owner may read and write; anything omitted is denied.

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

### `Diagnostics`

#### `Diagnostics.Collector`

```ts
type Collector = Effect.Success<ReturnType<typeof make>>;
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
  import("effect/Scope").Scope
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

### `Launch`

#### `Launch.Request`

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
    Schema.Struct<{
      readonly kind: Schema.Literal<"second-instance">;
      readonly arguments: Schema.$Array<Schema.String>;
      readonly workingDirectory: Schema.String;
      readonly additionalData: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    }>,
  ]
>;
type Request = typeof Request.Type;
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

### `NativeTheme`

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
      import("effect/unstable/rpc/RpcSchema").Stream<
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

### `Notification`

#### `Notification.Action`

```ts
const Action: Schema.Struct<{
  readonly id: Schema.String;
  readonly text: Schema.String;
}>;
type Action = typeof Action.Type;
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
    import("effect/unstable/rpc/RpcSchema").Stream<
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
  ]
>;
type Name = typeof Name.Type;
```

#### `Permission.Policy`

```ts
const Policy: Schema.$Array<
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
            ]
          >
        >;
      }>,
    ]
  >
>;
type Policy = typeof Policy.Type;
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
          ]
        >
      >;
    }>,
  ]
>;
```

### `PowerMonitor`

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
      import("effect/unstable/rpc/RpcSchema").Stream<
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
  | import("./RuntimeContext.ts").ClientContext
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

#### `Renderer.run`

```ts
const run: <E>(
  entry: Entry,
  setup: Effect.Effect<unknown, E, RendererContext | ClientContext | Scope.Scope>,
) => import("effect/Fiber").Fiber<void, E | SewedError>;
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

#### `Shell.OpenResult`

```ts
const OpenResult: Schema.Struct<{
  readonly opened: Schema.Boolean;
  readonly message: Schema.String;
}>;
type OpenResult = typeof OpenResult.Type;
```

#### `Shell.Policy`

Origins and documents that `openExternal` may reach; nothing else opens.

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
    ]
  >
>;
type Policy = typeof Policy.Type;
```

#### `Shell.protocol`

```ts
const protocol: RpcGroup.RpcGroup<
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

#### `WebContents.NavigationPolicy`

```ts
const NavigationPolicy: Schema.$Array<
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
  >
>;
type NavigationPolicy = typeof NavigationPolicy.Type;
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

### `WindowControls`

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

#### `WindowControls.protocol`

```ts
const protocol: RpcGroup.RpcGroup<
  | Rpc.Rpc<
      "changes",
      Schema.Void,
      import("effect/unstable/rpc/RpcSchema").Stream<
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
          readonly visible: Schema.Boolean;
          readonly focused: Schema.Boolean;
          readonly minimized: Schema.Boolean;
          readonly maximized: Schema.Boolean;
          readonly fullScreen: Schema.Boolean;
        }>,
        typeof SewedError
      >,
      Schema.Never,
      never,
      never
    >
  | Rpc.Rpc<"close", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"focus", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"hide", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"maximize", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"minimize", Schema.Void, Schema.Void, typeof SewedError, never, never>
  | Rpc.Rpc<"restore", Schema.Void, Schema.Void, typeof SewedError, never, never>
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
        readonly visible: Schema.Boolean;
        readonly focused: Schema.Boolean;
        readonly minimized: Schema.Boolean;
        readonly maximized: Schema.Boolean;
        readonly fullScreen: Schema.Boolean;
      }>,
      typeof SewedError,
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
  readonly visible: Schema.Boolean;
  readonly focused: Schema.Boolean;
  readonly minimized: Schema.Boolean;
  readonly maximized: Schema.Boolean;
  readonly fullScreen: Schema.Boolean;
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

#### `App.guardQuit`

```ts
const guardQuit: <R>(
  decision: Effect.Effect<boolean, never, R>,
) => Effect.Effect<void, SewedError, R | MainContext | Scope.Scope>;
```

#### `App.launches`

```ts
const launches: Stream.Stream<Launch.Request, SewedError, MainContext>;
```

#### `App.menuSelections`

```ts
const menuSelections: Stream.Stream<
  | {
      readonly kind: "command";
      readonly id: string;
    }
  | {
      readonly kind: "checkbox";
      readonly id: string;
      readonly checked: boolean;
    }
  | {
      readonly kind: "radio";
      readonly id: string;
    },
  SewedError,
  MainContext
>;
```

#### `App.Options`

```ts
interface Options {
  readonly quitOnLastWindowClosed?: boolean;
  readonly menu?: Menu.ApplicationOptions;
  readonly singleInstance?: {
    readonly additionalData?: typeof Schema.JsonObject.Type;
  };
  readonly schemes?: readonly Protocol.Scheme[];
}
```

#### `App.quit`

```ts
const quit: Effect.Effect<void, SewedError, MainContext>;
```

#### `App.run`

```ts
const run: <E>(
  setup: Effect.Effect<unknown, E, MainContext | Scope.Scope>,
  options?: Options,
) => import("effect/Fiber").Fiber<void | undefined, E | SewedError>;
```

### `BaseWindow`

#### `BaseWindow.AttachOptions`

```ts
type AttachOptions = Window.AttachOptions;
```

#### `BaseWindow.Handle`

```ts
type Handle = Effect.Success<ReturnType<typeof make>>;
```

#### `BaseWindow.make`

```ts
const make: (options?: Options) => Effect.Effect<
  Omit<
    {
      native: NativeBaseWindow;
      closed: import("effect/Deferred").Deferred<void, never>;
      webContents:
        | {
            openDevTools: (
              options?: import("./WebContents.ts").DevToolsOptions,
            ) => Effect.Effect<void, SewedError, MainContext>;
            closeDevTools: Effect.Effect<void, SewedError, MainContext>;
            setNavigationPolicy: (
              policy: import("./WebContents.ts").NavigationPolicy,
            ) => Effect.Effect<void, SewedError, MainContext>;
            state: import("effect/Stream").Stream<
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
            responsiveness: import("effect/Stream").Stream<
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
            load: <
              Keys extends string,
              const B extends readonly import("./Binding.ts").Bound<Keys>[],
            >(
              entry: import("./Renderer.ts").Entry<Keys> & import("./Binding.ts").Complete<Keys, B>,
              options: {
                readonly bindings: B;
              },
            ) => Effect.Effect<void, SewedError, MainContext>;
            reload: Effect.Effect<void, SewedError, MainContext>;
            recover: Effect.Effect<void, SewedError, MainContext>;
          }
        | undefined;
      id: string;
      controls: import("./Binding.ts").Owner<
        | import("effect/unstable/rpc/Rpc").Rpc<
            "changes",
            import("effect/Schema").Void,
            import("effect/unstable/rpc/RpcSchema").Stream<
              import("effect/Schema").Struct<{
                readonly bounds: import("effect/Schema").Struct<{
                  readonly x: import("effect/Schema").Number;
                  readonly y: import("effect/Schema").Number;
                  readonly width: import("effect/Schema").Number;
                  readonly height: import("effect/Schema").Number;
                }>;
                readonly normalBounds: import("effect/Schema").Struct<{
                  readonly x: import("effect/Schema").Number;
                  readonly y: import("effect/Schema").Number;
                  readonly width: import("effect/Schema").Number;
                  readonly height: import("effect/Schema").Number;
                }>;
                readonly visible: import("effect/Schema").Boolean;
                readonly focused: import("effect/Schema").Boolean;
                readonly minimized: import("effect/Schema").Boolean;
                readonly maximized: import("effect/Schema").Boolean;
                readonly fullScreen: import("effect/Schema").Boolean;
              }>,
              typeof SewedError
            >,
            import("effect/Schema").Never,
            never,
            never
          >
        | import("effect/unstable/rpc/Rpc").Rpc<
            "close",
            import("effect/Schema").Void,
            import("effect/Schema").Void,
            typeof SewedError,
            never,
            never
          >
        | import("effect/unstable/rpc/Rpc").Rpc<
            "focus",
            import("effect/Schema").Void,
            import("effect/Schema").Void,
            typeof SewedError,
            never,
            never
          >
        | import("effect/unstable/rpc/Rpc").Rpc<
            "hide",
            import("effect/Schema").Void,
            import("effect/Schema").Void,
            typeof SewedError,
            never,
            never
          >
        | import("effect/unstable/rpc/Rpc").Rpc<
            "maximize",
            import("effect/Schema").Void,
            import("effect/Schema").Void,
            typeof SewedError,
            never,
            never
          >
        | import("effect/unstable/rpc/Rpc").Rpc<
            "minimize",
            import("effect/Schema").Void,
            import("effect/Schema").Void,
            typeof SewedError,
            never,
            never
          >
        | import("effect/unstable/rpc/Rpc").Rpc<
            "restore",
            import("effect/Schema").Void,
            import("effect/Schema").Void,
            typeof SewedError,
            never,
            never
          >
        | import("effect/unstable/rpc/Rpc").Rpc<
            "setBounds",
            import("effect/Schema").Struct<{
              readonly x: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
              readonly y: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
              readonly width: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
              readonly height: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            }>,
            import("effect/Schema").Void,
            typeof SewedError,
            never,
            never
          >
        | import("effect/unstable/rpc/Rpc").Rpc<
            "setFullScreen",
            import("effect/Schema").Struct<{
              fullScreen: import("effect/Schema").Boolean;
            }>,
            import("effect/Schema").Void,
            typeof SewedError,
            never,
            never
          >
        | import("effect/unstable/rpc/Rpc").Rpc<
            "show",
            import("effect/Schema").Void,
            import("effect/Schema").Void,
            typeof SewedError,
            never,
            never
          >
        | import("effect/unstable/rpc/Rpc").Rpc<
            "showInactive",
            import("effect/Schema").Void,
            import("effect/Schema").Void,
            typeof SewedError,
            never,
            never
          >
        | import("effect/unstable/rpc/Rpc").Rpc<
            "state",
            import("effect/Schema").Void,
            import("effect/Schema").Struct<{
              readonly bounds: import("effect/Schema").Struct<{
                readonly x: import("effect/Schema").Number;
                readonly y: import("effect/Schema").Number;
                readonly width: import("effect/Schema").Number;
                readonly height: import("effect/Schema").Number;
              }>;
              readonly normalBounds: import("effect/Schema").Struct<{
                readonly x: import("effect/Schema").Number;
                readonly y: import("effect/Schema").Number;
                readonly width: import("effect/Schema").Number;
                readonly height: import("effect/Schema").Number;
              }>;
              readonly visible: import("effect/Schema").Boolean;
              readonly focused: import("effect/Schema").Boolean;
              readonly minimized: import("effect/Schema").Boolean;
              readonly maximized: import("effect/Schema").Boolean;
              readonly fullScreen: import("effect/Schema").Boolean;
            }>,
            typeof SewedError,
            never,
            never
          >
      >;
      show: Effect.Effect<void, SewedError, MainContext>;
      showInactive: Effect.Effect<void, SewedError, MainContext>;
      hide: Effect.Effect<void, SewedError, MainContext>;
      focus: Effect.Effect<void, SewedError, MainContext>;
      setBounds: (
        bounds: import("./WindowControls.ts").BoundsUpdate,
      ) => Effect.Effect<void, SewedError, MainContext>;
      setFullScreen: (fullScreen: boolean) => Effect.Effect<void, SewedError, MainContext>;
      minimize: Effect.Effect<void, SewedError, MainContext>;
      maximize: Effect.Effect<void, SewedError, MainContext>;
      restore: Effect.Effect<void, SewedError, MainContext>;
      close: Effect.Effect<void, SewedError, MainContext>;
      guardClose: <R>(
        decision: Effect.Effect<boolean, never, R>,
      ) => Effect.Effect<void, SewedError, R | MainContext | import("effect/Scope").Scope>;
      state: import("effect/Stream").Stream<
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
          readonly visible: boolean;
          readonly focused: boolean;
          readonly minimized: boolean;
          readonly maximized: boolean;
          readonly fullScreen: boolean;
        },
        never,
        MainContext
      >;
      awaitClosed: Effect.Effect<void, never, MainContext>;
      attach: (
        view: import("./WebContentsView.ts").Handle,
        options: Window.AttachOptions,
      ) => Effect.Effect<
        {
          setBounds: (bounds: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
          }) => Effect.Effect<void, SewedError, MainContext>;
          setVisible: (visible: boolean) => Effect.Effect<void, SewedError, MainContext>;
          detach: Effect.Effect<void, SewedError, MainContext>;
        },
        SewedError,
        MainContext | import("effect/Scope").Scope
      >;
    },
    "closed" | "native" | "webContents"
  >,
  SewedError,
  MainContext | import("effect/Scope").Scope
>;
```

#### `BaseWindow.Options`

```ts
interface Options {
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
  readonly show?: boolean;
}
```

### `BrowserWindow`

#### `BrowserWindow.AttachOptions`

```ts
type AttachOptions = Window.AttachOptions;
```

#### `BrowserWindow.Controls`

```ts
const Controls: import("effect/unstable/rpc/RpcGroup").RpcGroup<
  | import("effect/unstable/rpc/Rpc").Rpc<
      "changes",
      import("effect/Schema").Void,
      import("effect/unstable/rpc/RpcSchema").Stream<
        import("effect/Schema").Struct<{
          readonly bounds: import("effect/Schema").Struct<{
            readonly x: import("effect/Schema").Number;
            readonly y: import("effect/Schema").Number;
            readonly width: import("effect/Schema").Number;
            readonly height: import("effect/Schema").Number;
          }>;
          readonly normalBounds: import("effect/Schema").Struct<{
            readonly x: import("effect/Schema").Number;
            readonly y: import("effect/Schema").Number;
            readonly width: import("effect/Schema").Number;
            readonly height: import("effect/Schema").Number;
          }>;
          readonly visible: import("effect/Schema").Boolean;
          readonly focused: import("effect/Schema").Boolean;
          readonly minimized: import("effect/Schema").Boolean;
          readonly maximized: import("effect/Schema").Boolean;
          readonly fullScreen: import("effect/Schema").Boolean;
        }>,
        typeof SewedError
      >,
      import("effect/Schema").Never,
      never,
      never
    >
  | import("effect/unstable/rpc/Rpc").Rpc<
      "close",
      import("effect/Schema").Void,
      import("effect/Schema").Void,
      typeof SewedError,
      never,
      never
    >
  | import("effect/unstable/rpc/Rpc").Rpc<
      "focus",
      import("effect/Schema").Void,
      import("effect/Schema").Void,
      typeof SewedError,
      never,
      never
    >
  | import("effect/unstable/rpc/Rpc").Rpc<
      "hide",
      import("effect/Schema").Void,
      import("effect/Schema").Void,
      typeof SewedError,
      never,
      never
    >
  | import("effect/unstable/rpc/Rpc").Rpc<
      "maximize",
      import("effect/Schema").Void,
      import("effect/Schema").Void,
      typeof SewedError,
      never,
      never
    >
  | import("effect/unstable/rpc/Rpc").Rpc<
      "minimize",
      import("effect/Schema").Void,
      import("effect/Schema").Void,
      typeof SewedError,
      never,
      never
    >
  | import("effect/unstable/rpc/Rpc").Rpc<
      "restore",
      import("effect/Schema").Void,
      import("effect/Schema").Void,
      typeof SewedError,
      never,
      never
    >
  | import("effect/unstable/rpc/Rpc").Rpc<
      "setBounds",
      import("effect/Schema").Struct<{
        readonly x: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly y: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly width: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly height: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
      }>,
      import("effect/Schema").Void,
      typeof SewedError,
      never,
      never
    >
  | import("effect/unstable/rpc/Rpc").Rpc<
      "setFullScreen",
      import("effect/Schema").Struct<{
        fullScreen: import("effect/Schema").Boolean;
      }>,
      import("effect/Schema").Void,
      typeof SewedError,
      never,
      never
    >
  | import("effect/unstable/rpc/Rpc").Rpc<
      "show",
      import("effect/Schema").Void,
      import("effect/Schema").Void,
      typeof SewedError,
      never,
      never
    >
  | import("effect/unstable/rpc/Rpc").Rpc<
      "showInactive",
      import("effect/Schema").Void,
      import("effect/Schema").Void,
      typeof SewedError,
      never,
      never
    >
  | import("effect/unstable/rpc/Rpc").Rpc<
      "state",
      import("effect/Schema").Void,
      import("effect/Schema").Struct<{
        readonly bounds: import("effect/Schema").Struct<{
          readonly x: import("effect/Schema").Number;
          readonly y: import("effect/Schema").Number;
          readonly width: import("effect/Schema").Number;
          readonly height: import("effect/Schema").Number;
        }>;
        readonly normalBounds: import("effect/Schema").Struct<{
          readonly x: import("effect/Schema").Number;
          readonly y: import("effect/Schema").Number;
          readonly width: import("effect/Schema").Number;
          readonly height: import("effect/Schema").Number;
        }>;
        readonly visible: import("effect/Schema").Boolean;
        readonly focused: import("effect/Schema").Boolean;
        readonly minimized: import("effect/Schema").Boolean;
        readonly maximized: import("effect/Schema").Boolean;
        readonly fullScreen: import("effect/Schema").Boolean;
      }>,
      typeof SewedError,
      never,
      never
    >
>;
```

#### `BrowserWindow.Handle`

```ts
type Handle = Effect.Success<ReturnType<typeof make>>;
```

#### `BrowserWindow.make`

```ts
const make: (options?: Options) => Effect.Effect<
  {
    id: string;
    controls: import("./Binding.ts").Owner<
      | import("effect/unstable/rpc/Rpc").Rpc<
          "changes",
          import("effect/Schema").Void,
          import("effect/unstable/rpc/RpcSchema").Stream<
            import("effect/Schema").Struct<{
              readonly bounds: import("effect/Schema").Struct<{
                readonly x: import("effect/Schema").Number;
                readonly y: import("effect/Schema").Number;
                readonly width: import("effect/Schema").Number;
                readonly height: import("effect/Schema").Number;
              }>;
              readonly normalBounds: import("effect/Schema").Struct<{
                readonly x: import("effect/Schema").Number;
                readonly y: import("effect/Schema").Number;
                readonly width: import("effect/Schema").Number;
                readonly height: import("effect/Schema").Number;
              }>;
              readonly visible: import("effect/Schema").Boolean;
              readonly focused: import("effect/Schema").Boolean;
              readonly minimized: import("effect/Schema").Boolean;
              readonly maximized: import("effect/Schema").Boolean;
              readonly fullScreen: import("effect/Schema").Boolean;
            }>,
            typeof SewedError
          >,
          import("effect/Schema").Never,
          never,
          never
        >
      | import("effect/unstable/rpc/Rpc").Rpc<
          "close",
          import("effect/Schema").Void,
          import("effect/Schema").Void,
          typeof SewedError,
          never,
          never
        >
      | import("effect/unstable/rpc/Rpc").Rpc<
          "focus",
          import("effect/Schema").Void,
          import("effect/Schema").Void,
          typeof SewedError,
          never,
          never
        >
      | import("effect/unstable/rpc/Rpc").Rpc<
          "hide",
          import("effect/Schema").Void,
          import("effect/Schema").Void,
          typeof SewedError,
          never,
          never
        >
      | import("effect/unstable/rpc/Rpc").Rpc<
          "maximize",
          import("effect/Schema").Void,
          import("effect/Schema").Void,
          typeof SewedError,
          never,
          never
        >
      | import("effect/unstable/rpc/Rpc").Rpc<
          "minimize",
          import("effect/Schema").Void,
          import("effect/Schema").Void,
          typeof SewedError,
          never,
          never
        >
      | import("effect/unstable/rpc/Rpc").Rpc<
          "restore",
          import("effect/Schema").Void,
          import("effect/Schema").Void,
          typeof SewedError,
          never,
          never
        >
      | import("effect/unstable/rpc/Rpc").Rpc<
          "setBounds",
          import("effect/Schema").Struct<{
            readonly x: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly y: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly width: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly height: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
          }>,
          import("effect/Schema").Void,
          typeof SewedError,
          never,
          never
        >
      | import("effect/unstable/rpc/Rpc").Rpc<
          "setFullScreen",
          import("effect/Schema").Struct<{
            fullScreen: import("effect/Schema").Boolean;
          }>,
          import("effect/Schema").Void,
          typeof SewedError,
          never,
          never
        >
      | import("effect/unstable/rpc/Rpc").Rpc<
          "show",
          import("effect/Schema").Void,
          import("effect/Schema").Void,
          typeof SewedError,
          never,
          never
        >
      | import("effect/unstable/rpc/Rpc").Rpc<
          "showInactive",
          import("effect/Schema").Void,
          import("effect/Schema").Void,
          typeof SewedError,
          never,
          never
        >
      | import("effect/unstable/rpc/Rpc").Rpc<
          "state",
          import("effect/Schema").Void,
          import("effect/Schema").Struct<{
            readonly bounds: import("effect/Schema").Struct<{
              readonly x: import("effect/Schema").Number;
              readonly y: import("effect/Schema").Number;
              readonly width: import("effect/Schema").Number;
              readonly height: import("effect/Schema").Number;
            }>;
            readonly normalBounds: import("effect/Schema").Struct<{
              readonly x: import("effect/Schema").Number;
              readonly y: import("effect/Schema").Number;
              readonly width: import("effect/Schema").Number;
              readonly height: import("effect/Schema").Number;
            }>;
            readonly visible: import("effect/Schema").Boolean;
            readonly focused: import("effect/Schema").Boolean;
            readonly minimized: import("effect/Schema").Boolean;
            readonly maximized: import("effect/Schema").Boolean;
            readonly fullScreen: import("effect/Schema").Boolean;
          }>,
          typeof SewedError,
          never,
          never
        >
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
    guardClose: <R>(
      decision: Effect.Effect<boolean, never, R>,
    ) => Effect.Effect<void, SewedError, R | MainContext | import("effect/Scope").Scope>;
    state: import("effect/Stream").Stream<
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
        readonly visible: boolean;
        readonly focused: boolean;
        readonly minimized: boolean;
        readonly maximized: boolean;
        readonly fullScreen: boolean;
      },
      never,
      MainContext
    >;
    awaitClosed: Effect.Effect<void, never, MainContext>;
    attach: (
      view: import("./WebContentsView.ts").Handle,
      options: Window.AttachOptions,
    ) => Effect.Effect<
      {
        setBounds: (bounds: {
          readonly x: number;
          readonly y: number;
          readonly width: number;
          readonly height: number;
        }) => Effect.Effect<void, SewedError, MainContext>;
        setVisible: (visible: boolean) => Effect.Effect<void, SewedError, MainContext>;
        detach: Effect.Effect<void, SewedError, MainContext>;
      },
      SewedError,
      MainContext | import("effect/Scope").Scope
    >;
    webContents: {
      openDevTools: (
        options?: import("./WebContents.ts").DevToolsOptions,
      ) => Effect.Effect<void, SewedError, MainContext>;
      closeDevTools: Effect.Effect<void, SewedError, MainContext>;
      setNavigationPolicy: (
        policy: import("./WebContents.ts").NavigationPolicy,
      ) => Effect.Effect<void, SewedError, MainContext>;
      state: import("effect/Stream").Stream<
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
      responsiveness: import("effect/Stream").Stream<
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
      load: <Keys extends string, const B extends readonly import("./Binding.ts").Bound<Keys>[]>(
        entry: import("./Renderer.ts").Entry<Keys> & import("./Binding.ts").Complete<Keys, B>,
        options: {
          readonly bindings: B;
        },
      ) => Effect.Effect<void, SewedError, MainContext>;
      reload: Effect.Effect<void, SewedError, MainContext>;
      recover: Effect.Effect<void, SewedError, MainContext>;
    };
    dialog: {
      message: (
        options: import("./Dialog.ts").MessageOptions,
      ) => Effect.Effect<import("./Dialog.ts").MessageResult, SewedError, MainContext>;
      open: (
        options: import("./Dialog.ts").OpenOptions,
      ) => Effect.Effect<import("./Dialog.ts").OpenResult, SewedError, MainContext>;
      save: (
        options: import("./Dialog.ts").SaveOptions,
      ) => Effect.Effect<import("./Dialog.ts").SaveResult, SewedError, MainContext>;
    };
    menu: {
      popup: (
        options: import("./Menu.ts").PopupOptions,
      ) => Effect.Effect<import("./Menu.ts").PopupResult, SewedError, MainContext>;
    };
  },
  SewedError,
  MainContext | import("effect/Scope").Scope
>;
```

#### `BrowserWindow.Options`

```ts
interface Options {
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
  readonly show?: boolean;
  readonly session?: Session.Handle;
}
```

### `Clipboard`

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

```ts
const formats: Effect.Effect<readonly Clipboard.Format[], SewedError, MainContext>;
```

#### `Clipboard.host`

Hosts the clipboard for bound clients; formats outside the policy fail with `Protocol`.

```ts
const host: (
  policy: Clipboard.Policy,
) => Effect.Effect<
  Owner<RpcGroup.Rpcs<typeof Clipboard.protocol>>,
  SewedError,
  MainContext | Scope.Scope
>;
```

#### `Clipboard.Policy`

Formats a hosted owner may read and write; anything omitted is denied.

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

### `Download`

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

### `host`

```ts
const host: <Rpcs extends Rpc.Any, E, R>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  handlers: HandlerLayer<Rpcs, E, R>,
) => Effect.Effect<
  import("./Binding.ts").Owner<Rpcs>,
  E,
  R | MainContext | import("effect/Scope").Scope
>;
```

### `NativeTheme`

#### `NativeTheme.current`

```ts
const current: Effect.Effect<NativeTheme.State, SewedError, MainContext>;
```

#### `NativeTheme.host`

```ts
const host: (
  options?: HostOptions,
) => Effect.Effect<
  Owner<RpcGroup.Rpcs<typeof NativeTheme.protocol>>,
  SewedError,
  MainContext | Scope.Scope
>;
```

#### `NativeTheme.HostOptions`

```ts
interface HostOptions {
  /** Whether bound clients may change the theme source; observing is always allowed. */
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
      import("effect/unstable/rpc/RpcSchema").Stream<
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

### `Notification`

#### `Notification.Action`

```ts
const Action: Schema.Struct<{
  readonly id: Schema.String;
  readonly text: Schema.String;
}>;
type Action = typeof Action.Type;
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

#### `Notification.host`

```ts
const host: () => Effect.Effect<
  Owner<RpcGroup.Rpcs<typeof Notification.protocol>>,
  SewedError,
  MainContext | Scope.Scope
>;
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
    import("effect/unstable/rpc/RpcSchema").Stream<
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

### `PowerMonitor`

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

#### `PowerMonitor.host`

```ts
const host: () => Effect.Effect<
  Owner<RpcGroup.Rpcs<typeof PowerMonitor.protocol>>,
  SewedError,
  MainContext | Scope.Scope
>;
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
      import("effect/unstable/rpc/RpcSchema").Stream<
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

### `Protocol`

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

#### `Protocol.registerSchemes`

Registers all privileged schemes before Electron emits `ready`.

```ts
const registerSchemes: (values: readonly Protocol.Scheme[]) => void;
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

### `SafeStorage`

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

#### `Session.clearStorage`

```ts
const clearStorage: (
  handle: Handle,
  options: SessionStorage.ClearOptions,
) => Effect.Effect<void, SewedError, MainContext>;
```

#### `Session.defaultSession`

```ts
const defaultSession: Effect.Effect<Handle, SewedError, MainContext>;
```

#### `Session.fromPartition`

```ts
const fromPartition: (partition: Partition) => Effect.Effect<Handle, SewedError, MainContext>;
```

#### `Session.Handle`

```ts
interface Handle {
  readonly [sessionHandle]: true;
}
```

#### `Session.Partition`

```ts
type Partition = typeof Partition.Type;
```

#### `Session.setPermissions`

```ts
const setPermissions: (
  handle: Handle,
  policy: Permission.Policy,
) => Effect.Effect<void, SewedError, MainContext>;
```

### `Shell`

#### `Shell.Handle`

```ts
interface Handle {
  readonly openExternal: (url: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly openPath: (target: string) => Effect.Effect<Shell.OpenResult, SewedError, MainContext>;
  readonly showItemInFolder: (target: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly trashItem: (target: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly beep: Effect.Effect<void, SewedError, MainContext>;
  readonly host: Effect.Effect<
    Owner<RpcGroup.Rpcs<typeof Shell.protocol>>,
    SewedError,
    MainContext | Scope.Scope
  >;
}
```

#### `Shell.make`

A shell handle carries its policy; every operation checks it before Electron runs.

```ts
const make: (options: Options) => Effect.Effect<Handle, SewedError, MainContext>;
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

```ts
interface Options {
  /** Origins and documents `openExternal` may open. */
  readonly policy: Shell.Policy;
  /** Absolute directories whose contents `openPath`, `showItemInFolder`, and `trashItem` may touch. */
  readonly paths?: readonly string[];
}
```

#### `Shell.Policy`

Origins and documents that `openExternal` may reach; nothing else opens.

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
    ]
  >
>;
type Policy = typeof Policy.Type;
```

#### `Shell.protocol`

```ts
const protocol: RpcGroup.RpcGroup<
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

### `WebContentsView`

#### `WebContentsView.Handle`

```ts
interface Handle {
  readonly [viewIdentity]: true;
  readonly id: string;
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

### `host`

```ts
const host: <Rpcs extends Rpc.Any, E, R>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  handlers: HandlerLayer<Rpcs, E, R>,
) => Effect.Effect<
  import("./Binding.ts").Owner<Rpcs>,
  E,
  R | MainContext | import("effect/Scope").Scope
>;
```

### `layer`

```ts
const layer: <Rpcs extends Rpc.Any, E, R>(
  slot: Slot<Rpcs>,
  handlers: Layer.Layer<NoInfer<HandlerServices<Rpcs>>, E, R>,
) => Layer.Layer<ClientContext, E | SewedError, R>;
```

### `main`

```ts
const main: Layer.Layer<MainContext, never, never>;
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
