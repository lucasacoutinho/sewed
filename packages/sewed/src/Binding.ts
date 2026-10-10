import {
  Cause,
  Context,
  Deferred,
  Effect,
  Exit,
  Layer,
  Option,
  Schema,
  SchemaAST,
  SchemaIssue,
  Scope,
  Stream,
} from "effect";
import { RpcClient, RpcSchema, RpcSerialization } from "effect/rpc";
import type { Rpc, RpcGroup } from "effect/rpc";
import { RpcClientError } from "effect/rpc/RpcClientError";
import { ClientContext, MainContext, type ConnectionFactory } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import { generateInstanceId } from "./InstanceId.ts";
import { location, sink } from "./internal/Diagnostics.ts";
import { taggedFunction } from "./Util/effect.ts";
import { clientProtocol } from "./internal/ClientProtocol.ts";
import { answerBoundsOf, boundsOf } from "./internal/Bulk.ts";
import { encodingOf } from "./internal/Encoding.ts";

declare const slotIdentifier: unique symbol;
declare const ownerType: unique symbol;

export type Client<Rpcs extends Rpc.Any> = {
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

export interface Slot<Rpcs extends Rpc.Any, Key extends string = string> extends Context.Service<
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

export interface Owner<Rpcs extends Rpc.Any> {
  readonly id: string;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly [ownerType]: (rpc: Rpcs) => Rpcs;
}

export interface Bound<Key extends string = string> {
  readonly slot: Context.Service<typeof slotIdentifier, ConnectionFactory>;
  readonly key: Key;
  readonly ownerId: string;
}

/** A declaration of the slots a runtime entry expects, by slot key. */
export interface Declaration<Keys extends string = string> {
  readonly key: Keys;
}

/**
 * The declared slot keys that a binding list leaves unbound. `unknown` when nothing is missing
 * or when the entry declared no keys to check; otherwise an object naming the missing slots,
 * which no binding list can satisfy, so the compiler reports them.
 */
export type Complete<Keys extends string, B extends readonly Bound<Keys>[]> = string extends Keys
  ? unknown
  : [Exclude<Keys, B[number]["key"]>] extends [never]
    ? unknown
    : { readonly missing: Exclude<Keys, B[number]["key"]> };

const prefix = "sewed/binding/";

const owners = new WeakMap<object, ConnectionFactory>();
const factories = new WeakMap<Bound, ConnectionFactory>();

export const makeBound = <Key extends string>(
  slot: Bound["slot"] & { readonly key: Key },
  ownerId: string,
  factory: ConnectionFactory,
): Bound<Key> => {
  const bound = Object.freeze({ slot, key: slot.key, ownerId });
  factories.set(bound, factory);
  return bound;
};

export const factoryOf = (bound: Bound): ConnectionFactory => {
  const factory = factories.get(bound);
  if (!factory)
    throw new SewedError({ code: "Protocol", message: "Binding was not created by Sewed" });
  return factory;
};

export const makeOwner = <Rpcs extends Rpc.Any, Fields extends object>(
  id: string,
  protocol: RpcGroup.RpcGroup<Rpcs>,
  factory: ConnectionFactory,
  fields: Fields,
): Owner<Rpcs> & Fields => {
  // The private registry is the runtime authority; the invariant phantom prevents protocol widening.
  const owner = Object.freeze({ ...fields, id, protocol }) as Owner<Rpcs> & Fields;
  owners.set(owner, factory);
  return owner;
};

// What is refused here is the protocol's encoding, and only that: a bulk declaration outside a
// `Binary.protocol` fails where every slot is declared — `Capability.define` builds its slot
// through this — rather than on the call that sends a document's first attachment, or the call
// that receives a large answer.
//
// The field's own schema is not checked here. A bulk field must be `Binary.Bytes`, because that
// is what reaches the wire as the bytes the transport measures and slices, where a JSON codec
// would have turned it into base64 text; but `Schema.Uint8Array` inside a `Binary.protocol`
// satisfies `BytesField` and passes this slot. Such an operation fails closed on every call
// instead, with `Protocol: A bulk field is Binary.Bytes in a Binary.protocol` from the transport,
// which measures what the codec actually produced.
const refuseJsonBulk = <Rpcs extends Rpc.Any>(protocol: RpcGroup.RpcGroup<Rpcs>): void => {
  if (encodingOf(protocol) === "binary") return;
  const [declared] = boundsOf(protocol).keys();
  if (declared !== undefined) {
    throw new SewedError({
      code: "Protocol",
      message: `A bulk operation needs a Binary.protocol: ${declared}`,
    });
  }
  const [declaredAnswer] = answerBoundsOf(protocol).keys();
  if (declaredAnswer !== undefined) {
    throw new SewedError({
      code: "Protocol",
      message: `A bulk answer needs a Binary.protocol: ${declaredAnswer}`,
    });
  }
};

export const slot = <const Name extends string, Rpcs extends Rpc.Any>(
  name: Name,
  protocol: RpcGroup.RpcGroup<Rpcs>,
): Slot<Rpcs, `${typeof prefix}${Name}`> => {
  refuseJsonBulk(protocol);
  const key = `${prefix}${name}` as const;
  const tag = Object.assign(Context.Service<typeof slotIdentifier, ConnectionFactory>(key), {
    protocol,
  });
  // The callable carries the literal key; the Context class's own key is the same string.
  const call = Object.assign(() => client(binding), { key });
  const binding: Slot<Rpcs, typeof key> = taggedFunction(tag, call);
  return binding;
};

export const to = <Rpcs extends Rpc.Any, Key extends string>(
  slot: Slot<Rpcs, Key>,
  owner: Owner<NoInfer<Rpcs>>,
): Bound<Key> => {
  const factory = owners.get(owner);
  if (!factory)
    throw new SewedError({
      code: "Protocol",
      message: "Binding target is not a running Sewed owner",
    });
  if (slot.protocol !== owner.protocol) {
    throw new SewedError({
      code: "Protocol",
      message: `Binding ${slot.key} has a different protocol`,
    });
  }
  return makeBound(slot, owner.id, factory);
};

/**
 * One `ClientContext` service over `bindings`, with no placement requirement of its own: `layer`
 * builds this the same way but also requires `MainContext`. A caller that supplies its own
 * identity instead — a renderer's own testing store, for instance — calls this directly.
 */
export const clientContext = (bindings: readonly Bound[]) =>
  Effect.gen(function* () {
    const lifetime = yield* Effect.scope;
    const observer = yield* sink;
    const placement = yield* location;
    const environmentId = observer ? yield* generateInstanceId() : "";
    let context = Context.empty();
    const targets = new Map<string, string>();
    const names = new Set<string>();
    for (const binding of bindings) {
      if (names.has(binding.slot.key)) {
        return yield* new SewedError({
          code: "Protocol",
          message: `Duplicate binding ${binding.slot.key}`,
        });
      }
      names.add(binding.slot.key);
      const factory = factoryOf(binding);
      targets.set(binding.slot.key, binding.ownerId);
      if (observer) {
        const bindingId = `${environmentId}/${binding.slot.key}`;
        observer.emit({
          _tag: "BindingOpened",
          bindingId,
          slot: binding.slot.key,
          ownerId: binding.ownerId,
          ...placement,
        });
        yield* Effect.addFinalizer(() =>
          Effect.sync(() =>
            observer.emit({ _tag: "BindingClosed", bindingId, reason: "scope-closed" }),
          ),
        );
      }
      context = Context.add(context, binding.slot, {
        connect: Effect.gen(function* () {
          const scope = yield* Effect.acquireRelease(Scope.fork(lifetime), (scope, exit) =>
            Scope.close(scope, exit),
          );
          return yield* factory.connect.pipe(Scope.provide(scope));
        }),
      });
    }
    let closed = false;
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        closed = true;
      }),
    );
    const runtime = ClientContext.of({
      identity: {},
      bindings: context,
      owners: targets,
      isClosed: () => closed,
    });
    registries.set(runtime, { lifetime, clients: new Map() });
    return runtime;
  });

/**
 * How a deferred client reaches its owner: one connection per slot for the client environment,
 * or one connection per operation. The renderer bridge handshake dominates small calls, so
 * `shared` is the default and `per-call` is the isolation opt-out.
 */
export type Connection = "shared" | "per-call";

interface SharedEntry {
  readonly scope: Scope.Closeable;
  readonly ready: Deferred.Deferred<unknown, SewedError>;
}
interface Registry {
  readonly lifetime: Scope.Scope;
  readonly clients: Map<string, SharedEntry>;
}
const registries = new WeakMap<ClientContext["Service"], Registry>();

// A shared client lives in the runtime's lifetime, not in the operation's scope. Its connection
// is dropped from the registry the moment the transport reports loss, so the next operation
// opens a fresh one; the failed operations themselves are never retried.
const sharedClient = <Rpcs extends Rpc.Any>(
  runtime: ClientContext["Service"],
  binding: Slot<Rpcs>,
): Effect.Effect<Client<Rpcs>, SewedError, ClientContext | Rpc.MiddlewareClient<Rpcs>> =>
  Effect.gen(function* () {
    const registry = registries.get(runtime);
    if (registry === undefined || runtime.isClosed()) {
      return yield* new SewedError({
        code: "Closed",
        message: "Binding belongs to a closed runtime",
      });
    }
    // One key has one protocol per runtime, so the stored client is this slot's client. Every
    // caller, the first included, only waits for it: an interrupted caller stops waiting and
    // leaves the build to the callers still here. Registering the entry and forking its build are
    // one uninterruptible step: an interruption between them would leave an entry whose `ready`
    // nothing completes, and every later call on the slot would wait on it forever.
    const entry = yield* Effect.uninterruptible(startShared(registry, binding));
    return (yield* Deferred.await(entry.ready)) as Client<Rpcs>;
  });

/**
 * Registers a slot's shared entry and starts its build in the entry's own scope, forked there
 * rather than run in the fiber of the caller that happened to arrive first. That caller may be
 * interrupted mid-build — a React component unmounting mid-connect — and a build running in its
 * fiber would stop with it, leaving `ready` never completed and every later call on the slot
 * waiting forever. Forked, the build completes `ready` whatever becomes of the caller: with the
 * client, or with the failure after evicting the entry so the next call builds again. The fork
 * keeps the first caller's services, which the build needs (`ClientContext`, the protocol's
 * client middleware).
 */
const startShared = <Rpcs extends Rpc.Any>(
  registry: Registry,
  binding: Slot<Rpcs>,
): Effect.Effect<SharedEntry, never, ClientContext | Rpc.MiddlewareClient<Rpcs>> =>
  Effect.suspend(() => {
    // Lookup and registration share this callback because interruption masking still permits yields.
    const existing = registry.clients.get(binding.key);
    if (existing !== undefined) return Effect.succeed(existing);
    const entry: SharedEntry = {
      scope: Scope.forkUnsafe(registry.lifetime),
      ready: Deferred.makeUnsafe<unknown, SewedError>(),
    };
    registry.clients.set(binding.key, entry);
    const evict = () => {
      if (registry.clients.get(binding.key) !== entry) return;
      // The registry entry goes now: an operation that runs right after this one must not find
      // the dead client and wait on it, it must build a fresh one. Closing `entry.scope` — which
      // interrupts every request `clientProtocol` still has forked into it — waits one microtask:
      // `clientProtocol`'s own `fail` already answered every one of those requests typed,
      // synchronously, before calling this; the wait is what keeps that answer from losing the
      // race to this scope's own interruption reaching the same caller fiber a moment later.
      registry.clients.delete(binding.key);
      queueMicrotask(() => Effect.runFork(Scope.close(entry.scope, Exit.void)));
    };
    return openClient(binding, evict).pipe(
      Scope.provide(entry.scope),
      // Whatever ends the build — its own failure, or the registry's lifetime closing under it —
      // completes `ready`, so no waiter is left behind.
      Effect.onExit((built) =>
        Effect.sync(() => {
          if (built._tag === "Failure") evict();
          Deferred.doneUnsafe(
            entry.ready,
            Exit.isFailure(built) && Cause.hasInterruptsOnly(built.cause)
              ? Exit.fail(
                  new SewedError({ code: "Closed", message: "Binding client scope has closed" }),
                )
              : built,
          );
        }),
      ),
      Effect.forkIn(entry.scope),
      Effect.as(entry),
    );
  });

export const layer = (
  bindings: readonly Bound[],
): Layer.Layer<ClientContext, SewedError, MainContext> =>
  Layer.effect(ClientContext, Effect.andThen(MainContext, clientContext(bindings)));

const checkContext = (expected: ClientContext["Service"]) =>
  Effect.gen(function* () {
    const current = yield* ClientContext;
    yield* Effect.scope;
    if (current.identity !== expected.identity || current.isClosed()) {
      return yield* new SewedError({
        code: "Closed",
        message: "Binding belongs to a closed or different runtime",
      });
    }
  });

export type DynamicResult =
  | Effect.Effect<unknown, unknown, unknown>
  | Stream.Stream<unknown, unknown, unknown>;
type DynamicCall = (tag: string, input: unknown) => DynamicResult;

// Rpc.Any erases schema fields to avoid middleware variance; RpcGroup retains them.
export const propsOf = (rpc: Rpc.Any): Rpc.AnyWithProps => rpc as Rpc.AnyWithProps;

// Each property and its Effect/Stream branch comes from the same RpcGroup used by RpcClient.
// `methods` and `table` are the two views of that dynamic method table; public signatures
// retain every RPC service. `Shape` names which view of the table is being built: the binding
// client by default, or a capability's operations, which carry different requirements for the
// same tags and payloads.
export const methods = <Rpcs extends Rpc.Any, Shape = Client<Rpcs>>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  invoke: DynamicCall,
): Shape =>
  Object.fromEntries(
    [...protocol.requests.keys()].map((tag) => [tag, (input: unknown) => invoke(tag, input)]),
  ) as Shape;

export const table = <Rpcs extends Rpc.Any, Shape = Client<Rpcs>>(
  client: Shape,
): Record<string, (input: unknown) => DynamicResult> =>
  client as Record<string, (input: unknown) => DynamicResult>;

export const client = <Rpcs extends Rpc.Any>(
  binding: Slot<Rpcs>,
): Effect.Effect<
  Client<Rpcs>,
  SewedError,
  ClientContext | Scope.Scope | Rpc.MiddlewareClient<Rpcs>
> => openClient(binding);

/**
 * The struct-shaped `ast`'s own declared type for the field at `path`, descending one property
 * signature per segment — the schema node a `Pointer`'s path names, as opposed to whatever
 * `InvalidType` the value actually failed. `Binding.ts`'s own client-side refusal revalidates a
 * bad payload through the schema's `make` constructor (see `refusal` below), and `make` checks a
 * `Schema.Class` field against its own underlying struct directly, with no wrapper of any kind
 * around that check — unlike `decode`, which wraps it in an `Encoding` node carrying the class's
 * `Declaration`. So the class's own name survives `make`'s tree only here, in the *declaring*
 * struct's own property signatures, not anywhere in the issue the failing value produced.
 */
const fieldAt = (ast: SchemaAST.AST, path: ReadonlyArray<PropertyKey>): SchemaAST.AST | undefined =>
  path.reduce<SchemaAST.AST | undefined>(
    (current, key) =>
      current === undefined || current._tag !== "Objects"
        ? undefined
        : current.propertySignatures.find((signature) => signature.name === key)?.type,
    ast,
  );

/**
 * The `title` or `identifier` annotation of the schema an `Issue` failed against.
 *
 * `Encoding` tries its own `ast` before descending, since a `decode`-produced issue for a
 * transformed schema (a `Schema.Class`, most often) puts the `Declaration`'s `title`/`identifier`
 * there, wrapping the untitled shape it decodes to. A `Composite`'s own `ast` is the struct the
 * whole issue failed against — rarely titled itself — but when its first issue is a `Pointer`,
 * `fieldAt` reads that struct's own property signature for the pointer's path, which is where a
 * `Schema.Class` field's name survives a `make`-produced issue (see `fieldAt`'s own doc); only
 * when neither carries a name does `Composite` fall through to describing whatever the pointer
 * itself points at. `Pointer` and `Filter` otherwise just descend: they carry no `ast` of their
 * own. `AnyOf` (a `Union`) names its own `title`/`identifier` when the union itself carries one,
 * else every DISTINCT member name that resolves, joined by `" | "` — a member issue with no name
 * contributes nothing rather than blanking the whole prefix, and two members sharing one name
 * (the same identifier annotated twice, most often) name it once, never as `"Foo | Foo"` beside
 * itself; naming only the first member, as this once did, mislabels a refusal whose value was
 * actually closer to a different member.
 */
const nameOfIssue = (issue: SchemaIssue.Issue): string | undefined => {
  switch (issue._tag) {
    case "Pointer":
    case "Filter":
      return nameOfIssue(issue.issue);
    case "Encoding":
      return (
        SchemaAST.resolveTitle(issue.ast) ??
        SchemaAST.resolveIdentifier(issue.ast) ??
        nameOfIssue(issue.issue)
      );
    case "Composite": {
      const own = SchemaAST.resolveTitle(issue.ast) ?? SchemaAST.resolveIdentifier(issue.ast);
      if (own !== undefined) return own;
      const first = issue.issues[0];
      if (first === undefined) return undefined;
      if (first._tag === "Pointer") {
        const field = fieldAt(issue.ast, first.path);
        const named =
          field === undefined
            ? undefined
            : (SchemaAST.resolveTitle(field) ?? SchemaAST.resolveIdentifier(field));
        if (named !== undefined) return named;
      }
      return nameOfIssue(first);
    }
    case "AnyOf": {
      const own = SchemaAST.resolveTitle(issue.ast) ?? SchemaAST.resolveIdentifier(issue.ast);
      if (own !== undefined) return own;
      // Two members sharing one name (the same identifier used twice, most often) name that
      // member once, not as a "Foo | Foo" repeated against itself.
      const names = [
        ...new Set(
          issue.issues.map(nameOfIssue).filter((name): name is string => name !== undefined),
        ),
      ];
      return names.length === 0 ? undefined : names.join(" | ");
    }
    case "InvalidType":
      return SchemaAST.resolveTitle(issue.ast) ?? SchemaAST.resolveIdentifier(issue.ast);
    default:
      return undefined;
  }
};

/**
 * Where {@link nameOfIssue} finds the nearest named ANCESTOR — the titled struct carrying a field,
 * most often, stopping there without looking further in — this walks the same `Pointer` / `Filter`
 * / `Encoding` / `Composite`-via-its-first-issue chain all the way to the failing LEAF, remembering
 * only the innermost `Composite`'s own `ast` and the last `Pointer`'s `path` seen along the way, so
 * an outer container's name never shadows a name that exists deeper in the tree: an ancestor's
 * `fieldAt` shortcut (used at every level by `nameOfIssue`) would otherwise read that ancestor's
 * own field type — which, when the field's declared type is itself the whole named container, IS
 * that container, not the leaf actually named inside it — and misreport a nested, separately named
 * `Schema.declare` as the container's own name. Only when the true leaf (most often the failing
 * `Schema.declare`'s own `InvalidType`) carries no name of its own does the innermost `Composite`'s
 * `fieldAt`, for the last `Pointer`'s final path segment, stand in — the `make`-checked
 * `Schema.Class` field case `fieldAt`'s own doc describes, where the name survives nowhere else in
 * the issue actually produced. Returns `undefined`, deliberately, rather than an ancestor's name,
 * when no name exists at the leaf itself: the caller's prefix already carries an ancestor's name
 * when one exists, and this function's only job is the `<Declaration>` placeholder in the leaf's
 * own `Expected …` text, never a second copy of that prefix. A union (`AnyOf`) walks every member
 * this same way and returns their shared name only when every member's own leaf name agrees —
 * one placeholder standing for one member's name is never safe to reuse for a different member
 * with no name, or a different name, of its own; disagreement or a missing name at any member
 * falls back to the union's own `title`/`identifier`, if it carries one, else `undefined`.
 */
const innerNameOfIssue = (
  issue: SchemaIssue.Issue,
  parent?: { readonly ast: SchemaAST.AST; readonly path: ReadonlyArray<PropertyKey> },
): string | undefined => {
  switch (issue._tag) {
    case "Pointer":
    case "Filter":
      return innerNameOfIssue(issue.issue, parent);
    case "Encoding":
      return (
        innerNameOfIssue(issue.issue, parent) ??
        SchemaAST.resolveTitle(issue.ast) ??
        SchemaAST.resolveIdentifier(issue.ast)
      );
    case "Composite": {
      const first = issue.issues[0];
      if (first === undefined)
        return SchemaAST.resolveTitle(issue.ast) ?? SchemaAST.resolveIdentifier(issue.ast);
      return first._tag === "Pointer"
        ? innerNameOfIssue(first.issue, { ast: issue.ast, path: first.path })
        : innerNameOfIssue(first, parent);
    }
    case "AnyOf": {
      // A member with no name of its own disqualifies substitution for every placeholder here,
      // not only its own: a shared name is safe to use only when EVERY member — not just one —
      // resolves to that same single name, never the plain join `nameOfIssue` builds for a prefix.
      const [first, ...rest] = issue.issues.map((member) => innerNameOfIssue(member, parent));
      return first !== undefined && rest.every((name) => name === first)
        ? first
        : (SchemaAST.resolveTitle(issue.ast) ?? SchemaAST.resolveIdentifier(issue.ast));
    }
    case "InvalidType": {
      const own = SchemaAST.resolveTitle(issue.ast) ?? SchemaAST.resolveIdentifier(issue.ast);
      if (own !== undefined) return own;
      const field = parent === undefined ? undefined : fieldAt(parent.ast, parent.path);
      return field === undefined
        ? undefined
        : (SchemaAST.resolveTitle(field) ?? SchemaAST.resolveIdentifier(field));
    }
    default:
      return undefined;
  }
};

const formatIssue = SchemaIssue.makeFormatterDefault();

/**
 * The default formatter's own placeholder for an untitled, unidentified `Schema.declare` (an
 * `instanceof` check, most often): `"Expected <Declaration>"`, naming nothing — every occurrence
 * identical regardless of which member of a union produced it, so the raw text alone never says
 * whether two placeholders share one failing leaf or came from two different, unrelated ones.
 * `{@link innerNameOfIssue}`'s leaf name — never an ancestor's — replaces it in place, since the
 * formatter itself never saw that name; a leaf with no name of its own leaves the placeholder
 * untouched, for the prefix (see `{@link refusalMessage}`) to carry instead.
 */
const declarationPlaceholder = "<Declaration>";
const unnamedDeclaration = "a value of the declared type";

/**
 * A refusal's message, naming the operation and the schema's own `title` or `identifier`. The
 * formatter's own text already names it for a titled or identified schema, so nothing is added
 * there; for the `{@link declarationPlaceholder}` case, every occurrence is replaced by the same
 * leaf name (`{@link innerNameOfIssue}`) in place, rather than left to repeat as a second,
 * uninformative `Expected <Declaration>` beside a prefix that names a different, outer schema.
 * `innerNameOfIssue` itself decides whether that substitution is safe — a single leaf's own name,
 * or, for a union, the one name every member shares — never the count of placeholders in the raw
 * text: two placeholders that share one name (the same identifier annotated onto two declares, a
 * duplicate branch, and so on) still read as that one name, not the generic phrase repeated once
 * per placeholder. Only when a leaf carries no name of its own, or a union's members disagree,
 * does every placeholder in its text fall back to "a value of the declared type". Every other
 * unnamed schema still gets `{@link nameOfIssue}`'s nearest named ancestor prefixed onto the
 * formatter's own text, unchanged — the two names differ exactly when a titled or identified leaf
 * sits under a separately named ancestor.
 */
const refusalMessage = (tag: string, issue: SchemaIssue.Issue): string => {
  const raw = formatIssue(issue);
  const prefix = nameOfIssue(issue);
  const substitution = innerNameOfIssue(issue);
  const formatted = raw.replaceAll(declarationPlaceholder, substitution ?? unnamedDeclaration);
  return prefix !== undefined && !formatted.includes(prefix)
    ? `${tag}: ${prefix}: ${formatted}`
    : `${tag}: ${formatted}`;
};

/**
 * The first key of the path each failure in `issue` lies under. A refused `Exit` fails under
 * `"value"` when the schema refused its success value, and under `"cause"` when it refused a
 * failure: the operation's typed error, or a `SewedError` the transport itself wrote for a call on
 * an operation whose error schema does not admit one — a call the host may never have seen.
 */
const pathHeads = (issue: SchemaIssue.Issue): ReadonlyArray<PropertyKey> => {
  switch (issue._tag) {
    case "Pointer": {
      const [head] = issue.path;
      return head === undefined ? pathHeads(issue.issue) : [head];
    }
    case "Filter":
    case "Encoding":
      return pathHeads(issue.issue);
    case "Composite":
    case "AnyOf":
      return issue.issues.flatMap(pathHeads);
    default:
      return [];
  }
};

const openClient = <Rpcs extends Rpc.Any>(
  binding: Slot<Rpcs>,
  onConnectionLost?: () => void,
): Effect.Effect<
  Client<Rpcs>,
  SewedError,
  ClientContext | Scope.Scope | Rpc.MiddlewareClient<Rpcs>
> =>
  Effect.gen(function* () {
    const runtime = yield* ClientContext;
    yield* checkContext(runtime);
    const factory = Context.getOption(runtime.bindings, binding);
    if (Option.isNone(factory)) {
      return yield* new SewedError({ code: "Protocol", message: `Missing binding ${binding.key}` });
    }
    const connection = yield* factory.value.connect;
    const transport = yield* clientProtocol(
      connection,
      encodingOf(binding.protocol),
      boundsOf(binding.protocol),
      answerBoundsOf(binding.protocol),
      onConnectionLost,
    );
    const placement = yield* location;
    const raw = yield* RpcClient.make(binding.protocol, {
      spanPrefix: "RpcClient",
      flatten: true,
      spanAttributes: {
        "sewed.binding": binding.key,
        "sewed.owner.id": runtime.owners.get(binding.key),
        "sewed.runtime": placement.runtime,
        "sewed.runtime.id": placement.runtimeId,
        "sewed.thread.id": placement.threadId,
        ...("processId" in placement ? { "sewed.process.id": placement.processId } : {}),
      },
    }).pipe(Effect.provideService(RpcClient.Protocol, transport));
    // `RpcClient.make` forks its own run fiber (`forkScoped`, not `startImmediately`) to register
    // this client's `write` callback; without a turn to run it, a caller sharing this same
    // synchronous stack sends before that registration exists, and `Transport.ts`'s `write` calls
    // buffer instead of delivering. Invisible on its own — the buffered write flushes once the
    // fiber starts — but a loss in that same window evicts the client first, closing its scope
    // and interrupting the still-unregistered fiber before it flushes, so the caller who sent the
    // first message sees a bare `Interrupt` instead of the typed answer already waiting for it.
    // One yield gives
    // the scheduler that turn before this client is handed to anyone.
    yield* Effect.yieldNow;
    // The generic RpcClient overload describes the same tag/payload relation as Client above.
    const invoke = raw as DynamicCall;
    let closed = false;
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        closed = true;
      }),
    );
    const alive = Effect.flatMap(checkContext(runtime), () =>
      closed
        ? Effect.fail(
            new SewedError({ code: "Closed", message: "Binding client scope has closed" }),
          )
        : Effect.void,
    );
    return methods(binding.protocol, (tag, input) => {
      const props = propsOf(binding.protocol.requests.get(tag)!);
      // Effect's own dynamic RPC call validates a payload against the operation's schema through
      // the schema's own constructor — `payloadSchema.make` — rather than through a typed Effect
      // failure: an Effect-shaped call defers that constructor into the Effect it returns (it
      // dies there once the call runs, as a bare `Error("Schema validation failed", { cause })`,
      // not a `SchemaError`); a stream-shaped call runs it eagerly and throws the same `Error`
      // synchronously, before any Effect or Stream exists to carry a defect at all. Either way,
      // and also for a genuine `SchemaError` defect (Effect's own encode step can still die one),
      // this is the caller's own mistake: re-running the schema's own Effect-returning
      // constructor recovers a properly typed `SchemaIssue.Issue` with no cast — self-verifying,
      // since a coincidental "Schema validation failed" message that is not really this payload's
      // doing simply revalidates clean — and wraps it the same way a real `SchemaError` would
      // format, naming the operation and the offending path. Every other defect — including a
      // host's own success value its schema refuses, which the wire already ships as an opaque
      // `Defect` no `SchemaError` survives into — stays a defect: it is not this call's bug.
      // The `isSchemaError` branch above also catches the client's own refusal of a RESPONSE its
      // schema rejects — Effect's decode step orDies a `SchemaError` too, not only its encode
      // step. `answerRefused` tells the two apart: that same `Protocol` failure carries
      // `reason: "transport/answer-refused"` when the host ran and answered, and only the
      // client's own decode of that answer, or of a value of its stream, refused it.
      const refusal = (defect: unknown): SewedError | undefined => {
        if (Schema.isSchemaError(defect)) {
          return new SewedError({
            code: "Protocol",
            message: refusalMessage(tag, defect.issue),
            cause: defect.issue,
          });
        }
        if (!(defect instanceof Error) || defect.message !== "Schema validation failed") {
          return undefined;
        }
        const revalidated = Effect.runSyncExit(props.payloadSchema.makeEffect(input));
        const issue = Exit.isFailure(revalidated)
          ? Cause.findErrorOption(revalidated.cause)
          : Option.none();
        return Option.isNone(issue)
          ? undefined
          : new SewedError({
              code: "Protocol",
              message: refusalMessage(tag, issue.value),
              cause: issue.value,
            });
      };
      // Effect's client encodes a payload with this codec before the request leaves, and a
      // `SchemaError` it dies with is either that encode's or the decode of what came back. A
      // payload that encodes here encoded there too, so the request left, and a refusal of an
      // answer or a stream value is the client's decode of what the host sent. A refusal under a
      // failure's `cause` claims nothing: the transport's own typed failure — the request never
      // left, or the host never decoded it — lands there too on an operation whose error schema
      // does not admit a `SewedError`, and cannot be told from a refused typed error.
      const answerRefused = (
        defect: unknown,
      ): Effect.Effect<SewedError | undefined, never, unknown> => {
        const refused = refusal(defect);
        if (
          refused === undefined ||
          !Schema.isSchemaError(defect) ||
          pathHeads(defect.issue).includes("cause")
        )
          return Effect.succeed(refused);
        return Effect.map(
          Effect.exit(
            Schema.encodeUnknownEffect(RpcSerialization.json.codecFor(props.payloadSchema))(input),
          ),
          (encoded) =>
            Exit.isFailure(encoded)
              ? refused
              : new SewedError({
                  code: "Protocol",
                  message: refused.message,
                  reason: "transport/answer-refused",
                  cause: defect.issue,
                }),
        );
      };
      let result: DynamicResult;
      try {
        result = invoke(tag, input);
      } catch (thrown) {
        const refused = refusal(thrown);
        if (refused === undefined) throw thrown;
        return RpcSchema.isStreamSchema(props.successSchema)
          ? Stream.fail(refused)
          : Effect.fail(refused);
      }
      return Effect.isEffect(result)
        ? Effect.mapError(
            Effect.catchDefect(Effect.andThen(alive, result), (defect) =>
              Effect.flatMap(answerRefused(defect), (refused) =>
                refused === undefined ? Effect.die(defect) : Effect.fail(refused),
              ),
            ),
            transportFailure,
          )
        : Stream.mapError(
            Stream.catchDefect(Stream.unwrap(Effect.as(alive, result)), (defect) =>
              Stream.unwrap(
                Effect.map(answerRefused(defect), (refused) =>
                  refused === undefined ? Stream.die(defect) : Stream.fail(refused),
                ),
              ),
            ),
            transportFailure,
          );
    });
  });

// Callers see one error type. The RPC client error stays as the cause; its code follows the
// transport failure that produced it: Closed for lost connections, Limit for exceeded limits.
const transportFailure = (error: unknown): unknown => {
  if (!(error instanceof RpcClientError)) return error;
  const reason = error.reason;
  const cause = reason._tag === "RpcClientDefect" ? reason.cause : reason;
  return new SewedError({
    code: cause instanceof SewedError ? cause.code : "Protocol",
    message: cause instanceof SewedError ? cause.message : error.message,
    ...(cause instanceof SewedError && cause.reason !== undefined ? { reason: cause.reason } : {}),
    cause: error,
  });
};

// `context` is not a resolved value: it is what the caller's own runtime is doing right now, and
// every call flatMaps it first. A caller built before that Effect resolves parks each call on it;
// one built over a context that later fails fails every call that failure's own way. `methods`
// still builds the operations object once, so its identity does not change as `context` moves
// through waiting, ready or failed — only what a call does once invoked does.
const deferredClient = <Rpcs extends Rpc.Any>(
  binding: Slot<Rpcs>,
  context: Effect.Effect<ClientContext["Service"], SewedError>,
  connection: Connection,
): Client<Rpcs> =>
  methods(binding.protocol, (tag, input) => {
    const acquire = Effect.flatMap(context, (expected) => {
      const open = connection === "shared" ? sharedClient(expected, binding) : client(binding);
      return Effect.map(Effect.andThen(checkContext(expected), open), (client) =>
        table(client)[tag]!(input),
      );
    });
    const schema = propsOf(binding.protocol.requests.get(tag)!).successSchema;
    return RpcSchema.isStreamSchema(schema)
      ? Stream.unwrap(
          acquire as Effect.Effect<Stream.Stream<unknown, unknown, unknown>, unknown, unknown>,
        )
      : Effect.flatten(
          acquire as Effect.Effect<Effect.Effect<unknown, unknown, unknown>, unknown, unknown>,
        );
  });

export const deferred = <Rpcs extends Rpc.Any>(
  binding: Slot<Rpcs>,
  options: { readonly connection?: Connection } = {},
): Effect.Effect<Client<Rpcs>, never, ClientContext> =>
  Effect.map(ClientContext, (context) =>
    deferredClient(binding, Effect.succeed(context), options.connection ?? "shared"),
  );

/**
 * A client over a context that is not known yet: `options.context` is an Effect the caller is
 * still waiting on, still running, or has already failed — a runtime store's own future state, for
 * instance. Every call `flatMap`s it first, so a call made before it resolves parks there until it
 * does; a call made after it has failed `Closed` fails `Closed` the same way every other call does.
 * The returned `Client<Rpcs>` is one object built once: its identity does not change as `context`
 * moves through those states, only what each call does when it runs.
 */
export const pending = <Rpcs extends Rpc.Any>(
  binding: Slot<Rpcs>,
  options: {
    readonly context: Effect.Effect<ClientContext["Service"], SewedError>;
    readonly connection?: Connection;
  },
): Client<Rpcs> => deferredClient(binding, options.context, options.connection ?? "shared");
