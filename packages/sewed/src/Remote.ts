import * as Headers from "effect/http/Headers";
import { Rpc, RpcClient, RpcGroup, RpcMiddleware, RpcSchema } from "effect/rpc";
import type { RequestId } from "effect/rpc/RpcMessage";
import {
  Context,
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Schema,
  Scope,
  Stream,
} from "effect";
import {
  client as bindingClient,
  methods,
  propsOf,
  table,
  type Client as BindingClient,
  type DynamicResult,
  type Slot,
} from "./Binding.ts";
import { generateInstanceId } from "./InstanceId.ts";
import { maxRequestsPerConnection } from "./internal/Transport.ts";
import { location, OwnerContext, sink } from "./internal/Diagnostics.ts";
import type { HandlerServices } from "./Runtime.ts";
import type { ClientContext } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";

const acquireTag = "__sewed_remote_acquire" as const;
const releaseTag = "__sewed_remote_release" as const;
const leaseHeader = "x-sewed-remote-lease";
const maxLeases = 256;
const maxLeasesPerClient = 64;
const maxOperationsPerLease = maxRequestsPerConnection - 2;

const leaseToken = Schema.String;

class LeaseGuard extends RpcMiddleware.Service<LeaseGuard>()("sewed/remote/LeaseGuard", {
  error: SewedError,
}) {}

type AcquireError<Failure extends Schema.Top> = Schema.Union<readonly [Failure, typeof SewedError]>;
type AcquireRpc<Payload extends Schema.Top, Failure extends Schema.Top> = Rpc.Rpc<
  typeof acquireTag,
  Payload extends Schema.Struct.Fields ? Schema.Struct<Payload> : Payload,
  RpcSchema.Stream<typeof leaseToken, AcquireError<Failure>>,
  typeof Schema.Never
>;
type ReleaseRpc = Rpc.Rpc<
  typeof releaseTag,
  typeof Schema.Void,
  typeof Schema.Void,
  typeof SewedError
>;
type WireRpcs<Rpcs extends Rpc.Any, Payload extends Schema.Top, Failure extends Schema.Top> =
  | Rpc.AddMiddleware<Rpcs, typeof LeaseGuard>
  | AcquireRpc<Payload, Failure>
  | ReleaseRpc;

declare const definitionType: unique symbol;

export interface Definition<
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

interface PreparedDefinition<
  Payload extends Schema.Top,
  Rpcs extends Rpc.Any,
  Failure extends Schema.Top,
  Wire extends Rpc.Any,
> {
  readonly original: RpcGroup.RpcGroup<Rpcs>;
  /** The runtime group also contains the private acquisition procedures. */
  readonly wire: RpcGroup.RpcGroup<Wire>;
  readonly acquireTag: typeof acquireTag;
  readonly releaseTag: typeof releaseTag;
  readonly payload: Payload;
  readonly failure: Failure;
}

const definitions = new WeakMap<object, unknown>();

const preparedOf = <
  Payload extends Schema.Top,
  Rpcs extends Rpc.Any,
  Failure extends Schema.Top,
  Wire extends Rpc.Any = WireRpcs<Rpcs, Payload, Failure>,
>(
  definition: Definition<Payload, Rpcs, Failure, Wire>,
): PreparedDefinition<Payload, Rpcs, Failure, Wire> => {
  const prepared = definitions.get(definition);
  if (prepared === undefined) {
    throw new Error("Remote definition was not created by Sewed");
  }
  return prepared as PreparedDefinition<Payload, Rpcs, Failure, Wire>;
};

export const make = <
  Payload extends Schema.Top,
  Rpcs extends Rpc.Any,
  Failure extends Schema.Top = Schema.Never,
>(options: {
  readonly payload: Payload;
  readonly protocol: RpcGroup.RpcGroup<Rpcs>;
  readonly error?: Failure | undefined;
}): Definition<Payload, Rpcs, Failure, WireRpcs<Rpcs, Payload, Failure>> => {
  if (options.protocol.requests.has(acquireTag) || options.protocol.requests.has(releaseTag)) {
    throw new Error("Remote protocol uses Sewed's reserved acquisition tags");
  }
  const failure = (options.error ?? Schema.Never) as Failure;
  const acquire = Rpc.make(acquireTag, {
    payload: options.payload,
    success: leaseToken,
    error: Schema.Union([failure, SewedError]),
    stream: true,
  });
  const release = Rpc.make(releaseTag, {
    success: Schema.Void,
    error: SewedError,
  });
  // Group transformations retain the original annotations and method schemas
  // while adding the private control procedures used by Remote.acquire.
  const wire = options.protocol.middleware(LeaseGuard).add(acquire, release);
  const definition = Object.freeze({
    payload: options.payload,
    protocol: wire,
    methods: options.protocol,
    error: failure,
  }) as Definition<Payload, Rpcs, Failure, WireRpcs<Rpcs, Payload, Failure>>;
  definitions.set(definition, {
    original: options.protocol,
    wire,
    acquireTag,
    releaseTag,
    payload: options.payload,
    failure,
  } satisfies PreparedDefinition<Payload, Rpcs, Failure, WireRpcs<Rpcs, Payload, Failure>>);
  return definition;
};

type Metadata = {
  readonly client: Rpc.ServerClient;
  readonly requestId: RequestId;
  readonly headers: Headers.Headers;
  readonly rpc: Rpc.Any;
};

type UnknownEffect = Effect.Effect<unknown, unknown, unknown>;
type CloseEffect = Effect.Effect<void>;
type UnknownStream = Stream.Stream<unknown, unknown, unknown>;
type UnknownResult = UnknownEffect | UnknownStream;
type UnknownWrappedResult = UnknownResult | Rpc.Wrapper<UnknownResult>;
type DynamicHandler = (payload: unknown, metadata: Metadata) => UnknownWrappedResult;

interface HandlerEntry {
  readonly handler: DynamicHandler;
  readonly context: Context.Context<never>;
}

interface Lease {
  readonly key: string;
  readonly clientId: number;
  readonly token: string;
  readonly scope: Scope.Closeable;
  readonly close: (exit: Exit.Exit<unknown, unknown>, reason: ResourceCloseReason) => CloseEffect;
  readonly context: Context.Context<never>;
  readonly released: Deferred.Deferred<void, unknown>;
  readonly active: Set<Fiber.Fiber<unknown, unknown>>;
  readonly markReleasing: () => void;
  releasing: boolean;
}

type ResourceCloseReason = "acquisition" | "release" | "scope-closed";
type ResourceCloseOutcome = "success" | "failure" | "interrupted" | "disconnected";

type MiddlewareOptions = {
  readonly client: Rpc.ServerClient;
  readonly requestId: RequestId;
  readonly rpc: Rpc.Any;
  readonly payload: unknown;
  readonly headers: Headers.Headers;
};

type MiddlewareFunction = (effect: UnknownEffect, options: MiddlewareOptions) => UnknownEffect;

const error = (code: "Closed" | "Protocol" | "Limit", message: string): SewedError =>
  new SewedError({ code, message });

const leaseKey = (clientId: number, token: string): string => `${clientId}:${token}`;

const tokenOf = (headers: Headers.Headers): string | undefined =>
  Option.getOrUndefined(Headers.get(headers, leaseHeader));

const withoutScope = <R>(context: Context.Context<R>): Context.Context<never> =>
  Context.omit(Scope.Scope)(context);

const contextFor = <R>(environment: Context.Context<R>, lease: Lease): Context.Context<never> =>
  withoutScope(Context.merge(environment, lease.context));

const contextKey = (key: string): Context.Key<unknown, unknown> => Context.Service<unknown>(key);

const entryOf = (context: Context.Context<never>, key: string): HandlerEntry | undefined => {
  const value = Context.getOrUndefined(context, contextKey(key));
  if (
    typeof value !== "object" ||
    value === null ||
    !("handler" in value) ||
    !("context" in value)
  ) {
    return undefined;
  }
  if (typeof value.handler !== "function") return undefined;
  return value as HandlerEntry;
};

const trackResult = (
  lease: Lease,
  result: UnknownWrappedResult,
  context: Context.Context<never>,
): UnknownWrappedResult => {
  const wrapped = Rpc.isWrapper(result);
  const value = wrapped ? result.value : result;
  const tracked: UnknownResult = Effect.isEffect(value)
    ? Effect.withFiber((fiber) => {
        if (lease.releasing) return Effect.fail(error("Closed", "Remote lease is closed"));
        lease.active.add(fiber);
        return Effect.ensuring(
          Effect.provideContext(value, context),
          Effect.sync(() => {
            lease.active.delete(fiber);
          }),
        );
      })
    : Stream.unwrap(
        Effect.withFiber((fiber) => {
          if (lease.releasing) return Effect.fail(error("Closed", "Remote lease is closed"));
          lease.active.add(fiber);
          const stream = Stream.ensuring(
            Stream.provideContext(value, context),
            Effect.sync(() => {
              lease.active.delete(fiber);
            }),
          );
          return Effect.succeed(stream);
        }),
      );
  return wrapped
    ? Rpc.wrap({ fork: result.fork, uninterruptible: result.uninterruptible })(tracked)
    : tracked;
};

const dynamicMethod = <
  Payload extends Schema.Top,
  Rpcs extends Rpc.Any,
  Failure extends Schema.Top,
  Wire extends Rpc.Any,
  R,
>(
  prepared: PreparedDefinition<Payload, Rpcs, Failure, Wire>,
  leases: Map<string, Lease>,
  environment: Context.Context<R>,
  tag: string,
  payload: unknown,
  metadata: Metadata,
): UnknownWrappedResult => {
  const request = prepared.original.requests.get(tag);
  if (request === undefined) {
    return Effect.fail(error("Protocol", "Remote method was not declared"));
  }
  const rpc = propsOf(request);
  const token = tokenOf(metadata.headers);
  const lease = token === undefined ? undefined : leases.get(leaseKey(metadata.client.id, token));
  const missing =
    token === undefined
      ? error("Protocol", "Remote lease token is missing")
      : error("Closed", "Remote lease is closed");
  if (lease === undefined || lease.releasing) {
    return RpcSchema.isStreamSchema(rpc.successSchema)
      ? Stream.fail(missing)
      : Effect.fail(missing);
  }
  const invoke = (lease: Lease): UnknownWrappedResult => {
    const entry = entryOf(lease.context, rpc.key);
    if (entry === undefined) {
      return Effect.fail(error("Protocol", "Remote resource method handler is missing"));
    }
    const result = entry.handler(payload, { ...metadata, rpc });
    // RpcServer runs each request with its current context on top of the
    // handler context. Preserve that precedence while leaving Scope to the
    // request fiber rather than replacing it with the resource scope.
    const resourceContext = Context.merge(
      withoutScope(entry.context),
      contextFor(environment, lease),
    );
    if (RpcSchema.isStreamSchema(rpc.successSchema)) {
      const value = Rpc.isWrapper(result) ? result.value : result;
      if (!Stream.isStream(value)) {
        return Effect.fail(error("Protocol", "Remote stream handler returned a non-stream"));
      }
    } else {
      const value = Rpc.isWrapper(result) ? result.value : result;
      if (!Effect.isEffect(value)) {
        return Effect.fail(error("Protocol", "Remote handler returned a non-effect"));
      }
    }
    return trackResult(lease, result, resourceContext);
  };
  return invoke(lease);
};

const middlewareContext = <Rpcs extends Rpc.Any, R>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  leases: Map<string, Lease>,
  environment: Context.Context<R>,
): Context.Context<never> => {
  const services = new Map<string, unknown>();
  const resolve = (
    clientId: number,
    headers: Headers.Headers,
  ): Effect.Effect<Lease, SewedError> => {
    const token = tokenOf(headers);
    if (token === undefined) return Effect.fail(error("Protocol", "Remote lease token is missing"));
    const lease = leases.get(leaseKey(clientId, token));
    return lease === undefined || lease.releasing
      ? Effect.fail(error("Closed", "Remote lease is closed"))
      : Effect.succeed(lease);
  };
  const guard: MiddlewareFunction = (effect, options) =>
    Effect.flatMap(resolve(options.client.id, options.headers), (lease) =>
      Effect.provideContext(effect, contextFor(environment, lease)),
    );
  services.set(LeaseGuard.key, guard);

  const seen = new Set<string>([LeaseGuard.key]);
  for (const rpc of protocol.requests.values()) {
    for (const middleware of propsOf(rpc).middlewares) {
      if (seen.has(middleware.key)) continue;
      seen.add(middleware.key);
      const proxy: MiddlewareFunction = (effect, options) =>
        Effect.flatMap(resolve(options.client.id, options.headers), (lease) => {
          const value = Context.getOrUndefined(lease.context, contextKey(middleware.key));
          if (typeof value !== "function") {
            return Effect.fail(error("Protocol", "Remote middleware service is missing"));
          }
          const transformed = (value as MiddlewareFunction)(effect, options);
          return Effect.provideContext(transformed, contextFor(environment, lease));
        });
      services.set(middleware.key, proxy);
    }
  }
  return Context.makeUnsafe<never>(services);
};

const staticLayer = <
  Payload extends Schema.Top,
  Rpcs extends Rpc.Any,
  Failure extends Schema.Top,
  Wire extends Rpc.Any,
  R,
>(
  prepared: PreparedDefinition<Payload, Rpcs, Failure, Wire>,
  build: (
    payload: Payload["Type"],
  ) => Layer.Layer<
    NoInfer<Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs>>,
    Failure["Type"] | SewedError,
    R
  >,
): Layer.Layer<HandlerServices<Wire>, Failure["Type"] | SewedError, R | Rpc.ServicesServer<Wire>> =>
  Layer.effectContext(
    Effect.gen(function* () {
      const environment = yield* Effect.context<R | Rpc.ServicesServer<Wire>>();
      const observer = yield* sink;
      const placement = yield* location;
      const leases = new Map<string, Lease>();
      const pendingByClient = new Map<number, number>();
      let pendingTotal = 0;
      const countForClient = (clientId: number): number => {
        let count = 0;
        for (const lease of leases.values()) if (lease.clientId === clientId) count += 1;
        return count;
      };
      const pendingCountForClient = (clientId: number): number =>
        pendingByClient.get(clientId) ?? 0;
      const reserve = (clientId: number): SewedError | undefined => {
        if (
          leases.size + pendingTotal >= maxLeases ||
          countForClient(clientId) + pendingCountForClient(clientId) >= maxLeasesPerClient
        ) {
          return error("Limit", "Remote lease capacity is full");
        }
        pendingTotal += 1;
        pendingByClient.set(clientId, pendingCountForClient(clientId) + 1);
        return undefined;
      };
      const releaseReservation = (clientId: number): void => {
        pendingTotal -= 1;
        const count = pendingCountForClient(clientId);
        if (count <= 1) pendingByClient.delete(clientId);
        else pendingByClient.set(clientId, count - 1);
      };
      const findLease = (
        clientId: number,
        headers: Headers.Headers,
        allowReleasing = false,
      ): Lease | SewedError => {
        const token = tokenOf(headers);
        if (token === undefined) return error("Protocol", "Remote lease token is missing");
        const lease = leases.get(leaseKey(clientId, token));
        if (lease === undefined || (!allowReleasing && lease.releasing)) {
          return error("Closed", "Remote lease is closed");
        }
        return lease;
      };
      const acquire: DynamicHandler = (payload, metadata) =>
        Rpc.fork(
          Stream.unwrap(
            Effect.gen(function* () {
              const admission = reserve(metadata.client.id);
              if (admission !== undefined) return yield* admission;
              let reserved = true;
              const parentScope = yield* Effect.scope;
              yield* Scope.addFinalizer(
                parentScope,
                Effect.sync(() => {
                  if (reserved) {
                    reserved = false;
                    releaseReservation(metadata.client.id);
                  }
                }),
              );
              const resourceScope = yield* Scope.fork(parentScope, "sequential");
              const owner = yield* Effect.serviceOption(OwnerContext);
              const resourceOwnerId = Option.isSome(owner) ? owner.value.id : placement.runtimeId;
              const observation =
                observer === undefined
                  ? undefined
                  : {
                      emit: observer.emit,
                      ownerId: resourceOwnerId,
                      resourceId: yield* generateInstanceId(),
                    };
              const token = yield* generateInstanceId();
              const key = leaseKey(metadata.client.id, token);
              const closeResult = Deferred.makeUnsafe<Exit.Exit<void, never>>();
              let closeStarted = false;
              let closedObserved = false;
              let resourceReady = false;
              let releasingObserved = false;
              const closeObserved = (
                outcome: ResourceCloseOutcome,
                reason: ResourceCloseReason,
              ): void => {
                if (closedObserved || observation === undefined) return;
                closedObserved = true;
                observation.emit({
                  _tag: "ResourceClosed",
                  resourceId: observation.resourceId,
                  ownerId: observation.ownerId,
                  clientId: metadata.client.id,
                  outcome,
                  reason,
                  ...placement,
                });
              };
              const closeOutcome = (
                requestedExit: Exit.Exit<unknown, unknown>,
                closeExit: Exit.Exit<unknown, unknown>,
                reason: ResourceCloseReason,
              ): ResourceCloseOutcome => {
                if (reason === "release") {
                  if (closeExit._tag === "Success") return "success";
                  return Cause.hasInterruptsOnly(closeExit.cause) ? "interrupted" : "failure";
                }
                if (reason === "acquisition") {
                  if (closeExit._tag === "Failure" && !Cause.hasInterruptsOnly(closeExit.cause))
                    return "failure";
                  if (requestedExit._tag === "Failure")
                    return Cause.hasInterruptsOnly(requestedExit.cause) ? "interrupted" : "failure";
                  return closeExit._tag === "Failure" ? "interrupted" : "failure";
                }
                if (closeExit._tag === "Failure")
                  return Cause.hasInterruptsOnly(closeExit.cause) ? "interrupted" : "failure";
                if (requestedExit._tag === "Failure")
                  return Cause.hasInterruptsOnly(requestedExit.cause) ? "interrupted" : "failure";
                return "success";
              };
              const awaitClose = (): CloseEffect =>
                Deferred.await(closeResult).pipe(
                  Effect.flatMap((closeExit) =>
                    closeExit._tag === "Failure" ? Effect.failCause(closeExit.cause) : Effect.void,
                  ),
                );
              const closeScope = (
                exit: Exit.Exit<unknown, unknown>,
                reason: ResourceCloseReason,
              ): CloseEffect =>
                Effect.suspend(() => {
                  if (closeStarted) return awaitClose();
                  closeStarted = true;
                  return Effect.uninterruptible(
                    Scope.close(resourceScope, exit).pipe(
                      Effect.exit,
                      Effect.tap((closeExit) =>
                        Effect.sync(() => {
                          Deferred.doneUnsafe(closeResult, Effect.succeed(closeExit));
                          closeObserved(closeOutcome(exit, closeExit, reason), reason);
                        }),
                      ),
                      Effect.flatMap((closeExit) =>
                        closeExit._tag === "Failure"
                          ? Effect.failCause(closeExit.cause)
                          : Effect.void,
                      ),
                    ),
                  );
                });
              const emitResourceChanged = (state: "acquiring" | "ready" | "releasing"): void => {
                if (observation === undefined) return;
                observation.emit({
                  _tag: "ResourceChanged",
                  resourceId: observation.resourceId,
                  ownerId: observation.ownerId,
                  clientId: metadata.client.id,
                  state,
                  ...placement,
                });
              };
              const markReleasing = (): void => {
                if (releasingObserved) return;
                releasingObserved = true;
                if (resourceReady) emitResourceChanged("releasing");
              };
              if (observation !== undefined) {
                // Scope.fork also registers a parent finalizer. This later
                // wrapper closes the child first so automatic closure gets
                // the actual aggregate finalizer exit.
                yield* Scope.addFinalizerExit(parentScope, (exit) =>
                  Effect.sync(markReleasing).pipe(
                    Effect.andThen(closeScope(exit, "scope-closed").pipe(Effect.orDie)),
                  ),
                );
              }
              // Register removal before resource acquisition so LIFO scope
              // closing runs it after the resource layer's finalizers. The
              // close event is emitted by closeScope after Scope.close exits.
              yield* Scope.addFinalizer(
                resourceScope,
                Effect.sync(() => {
                  leases.delete(key);
                }),
              );
              emitResourceChanged("acquiring");
              const resourceLayer = build(payload as Payload["Type"]);
              const resourceContext = yield* Layer.buildWithScope(
                resourceLayer,
                resourceScope,
              ).pipe(
                Effect.provideContext(environment),
                Effect.onExit((exit) =>
                  exit._tag === "Failure" ? closeScope(exit, "acquisition") : Effect.void,
                ),
              );
              const released = yield* Deferred.make<void, unknown>();
              const active = new Set<Fiber.Fiber<unknown, unknown>>();
              const lease: Lease = {
                key,
                clientId: metadata.client.id,
                token,
                scope: resourceScope,
                close: closeScope,
                context: resourceContext,
                released,
                active,
                markReleasing,
                releasing: false,
              };
              resourceReady = true;
              leases.set(lease.key, lease);
              reserved = false;
              releaseReservation(metadata.client.id);
              emitResourceChanged("ready");
              // Register interruption after resource acquisition. LIFO closing
              // therefore interrupts active operations before resource teardown.
              yield* Scope.addFinalizer(resourceScope, Fiber.interruptAll(active));
              const finished = Stream.unwrap(
                Deferred.await(released).pipe(Effect.as(Stream.empty)),
              );
              return Stream.concat(Stream.make(token), finished);
            }),
          ),
        );

      const release: DynamicHandler = (_payload, metadata) =>
        Rpc.fork(
          Effect.suspend(() => {
            const lease = findLease(metadata.client.id, metadata.headers, true);
            if (lease instanceof SewedError) return Effect.fail(lease);
            if (lease.releasing) return Deferred.await(lease.released).pipe(Effect.asVoid);
            lease.releasing = true;
            lease.markReleasing();
            const cleanup = Fiber.interruptAll(lease.active).pipe(
              Effect.andThen(lease.close(Exit.void, "release")),
              Effect.asVoid,
            );
            return cleanup.pipe(
              Effect.onExit((exit) =>
                Effect.sync(() => {
                  Deferred.doneUnsafe(lease.released, exit);
                }),
              ),
            );
          }),
        );

      const handlers: Record<string, DynamicHandler> = {
        [prepared.acquireTag]: acquire,
        [prepared.releaseTag]: release,
      };
      for (const tag of prepared.original.requests.keys()) {
        handlers[tag] = (payload, metadata) =>
          dynamicMethod(prepared, leases, environment, tag, payload, metadata);
      }
      // The dynamic table covers every wire tag: both lease procedures plus one dispatching
      // entry per declared method, and each entry validates its lease before running.
      const handlersLayer = prepared.wire.toLayer(
        handlers as unknown as RpcGroup.HandlersFrom<Wire>,
      );
      const combined = Layer.merge(
        handlersLayer,
        Layer.succeedContext(middlewareContext(prepared.wire, leases, environment)),
      );
      const scope = yield* Effect.scope;
      const built = yield* Layer.buildWithScope(combined, scope);
      // middlewareContext installs the wire group's middleware services by key at runtime;
      // the static context cannot name them, so the merged context is asserted once here.
      return Context.merge(environment, built) as unknown as Context.Context<HandlerServices<Wire>>;
    }),
    // Dynamic handlers cannot state requirements for a generic wire group. Each request receives
    // its lease context at dispatch, so the layer itself needs only its build environment.
  ) as Layer.Layer<
    HandlerServices<Wire>,
    Failure["Type"] | SewedError,
    R | Rpc.ServicesServer<Wire>
  >;

type RemoteError<Failure extends Schema.Top> = Failure["Type"] | SewedError;

export interface Handle<Rpcs extends Rpc.Any, Failure extends Schema.Top> {
  readonly client: BindingClient<Rpcs>;
  readonly release: Effect.Effect<
    void,
    RemoteError<Failure>,
    ClientContext | Rpc.MiddlewareClient<Rpcs>
  >;
}

const withLeaseHeaders = (token: string): Headers.Input => [[leaseHeader, token]];

const resourceClient = <Rpcs extends Rpc.Any, Wire extends Rpc.Any>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  base: BindingClient<Wire>,
  token: string,
  isOpen: () => boolean,
): BindingClient<Rpcs> => {
  const dynamic = table(base);
  let activeOperations = 0;
  const admit = Effect.suspend(() => {
    if (!isOpen()) return Effect.fail(error("Closed", "Remote lease is closed"));
    if (activeOperations >= maxOperationsPerLease) {
      return Effect.fail(error("Limit", "Remote lease operation capacity is full"));
    }
    activeOperations += 1;
    return Effect.void;
  });
  const releaseAdmission = () =>
    Effect.sync(() => {
      activeOperations -= 1;
    });
  const headers = Headers.fromInput(withLeaseHeaders(token));
  return methods(protocol, (tag, input) => {
    const streaming = RpcSchema.isStreamSchema(propsOf(protocol.requests.get(tag)!).successSchema);
    const failWith = (failure: SewedError): DynamicResult =>
      streaming ? Stream.fail(failure) : Effect.fail(failure);
    if (!isOpen()) return failWith(error("Closed", "Remote lease is closed"));
    const method = dynamic[tag];
    if (method === undefined) return failWith(error("Protocol", "Remote method client is missing"));
    if (streaming) {
      return Stream.unwrap(
        Effect.acquireRelease(
          Effect.gen(function* () {
            yield* admit;
            return yield* RpcClient.CurrentHeaders;
          }),
          () => releaseAdmission(),
        ).pipe(
          Effect.map((currentHeaders) => {
            const result = method(input);
            return Stream.isStream(result)
              ? Stream.provideService(
                  result,
                  RpcClient.CurrentHeaders,
                  Headers.merge(currentHeaders, headers),
                )
              : Stream.fail(error("Protocol", "Remote method client returned an invalid value"));
          }),
        ),
      );
    }
    return Effect.acquireUseRelease(
      admit,
      () => {
        const result = method(input);
        return Effect.isEffect(result)
          ? RpcClient.withHeaders(result, headers)
          : Effect.fail(error("Protocol", "Remote method client returned an invalid value"));
      },
      () => releaseAdmission(),
    );
  });
};

export const layer = <
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
): Layer.Layer<HandlerServices<Wire>, Failure["Type"] | SewedError, R | Rpc.ServicesServer<Wire>> =>
  staticLayer(preparedOf(definition), build);

export const acquire = <
  Payload extends Schema.Top,
  Rpcs extends Rpc.Any,
  Failure extends Schema.Top,
  Wire extends Rpc.Any,
>(
  definition: Definition<Payload, Rpcs, Failure, Wire>,
  slot: Slot<NoInfer<Wire>>,
  payload: Payload["~type.make.in"],
): Effect.Effect<
  Handle<Rpcs, Failure>,
  RemoteError<Failure>,
  | import("./RuntimeContext.ts").ClientContext
  | Scope.Scope
  | Rpc.MiddlewareClient<Wire>
  | Payload["EncodingServices"]
  | Failure["DecodingServices"]
> =>
  Effect.gen(function* () {
    const prepared = preparedOf(definition);
    if (slot.protocol !== definition.protocol) {
      return yield* error("Protocol", "Remote acquisition slot does not match the definition");
    }
    const callerScope = yield* Effect.scope;
    const callerContext = Context.omit(Scope.Scope)(
      yield* Effect.context<ClientContext | Rpc.MiddlewareClient<Rpcs>>(),
    );
    const leaseScope = yield* Scope.fork(callerScope, "sequential");
    const handle = yield* Effect.gen(function* () {
      const base = yield* Scope.provide(leaseScope)(bindingClient(slot));
      const dynamic = table(base);
      const acquireValue = dynamic[prepared.acquireTag]?.(payload);
      if (!Stream.isStream(acquireValue)) {
        return yield* error("Protocol", "Remote acquisition did not return a stream");
      }
      const tokenReady = yield* Deferred.make<string, unknown>();
      let tokenSeen = false;
      const runner = Stream.runForEach(
        acquireValue as Stream.Stream<string, unknown, unknown>,
        (token) => {
          tokenSeen = true;
          return Deferred.succeed(tokenReady, token).pipe(Effect.asVoid);
        },
      ).pipe(
        Effect.onExit((exit) =>
          tokenSeen
            ? Effect.void
            : exit._tag === "Failure"
              ? Deferred.failCause(tokenReady, exit.cause).pipe(Effect.asVoid)
              : Deferred.fail(
                  tokenReady,
                  error("Protocol", "Remote acquisition ended before a lease"),
                ),
        ),
        Effect.ignoreCause,
      );
      yield* Scope.provide(leaseScope)(runner.pipe(Effect.forkScoped));
      const token = yield* Deferred.await(tokenReady);
      let state: "open" | "releasing" | "released" = "open";
      const releaseReady = yield* Deferred.make<void, unknown>();
      const release: Effect.Effect<
        void,
        RemoteError<Failure>,
        ClientContext | Rpc.MiddlewareClient<Rpcs>
      > = Effect.suspend(() => {
        if (state === "released") return Effect.void;
        if (state === "releasing") return Deferred.await(releaseReady).pipe(Effect.asVoid);
        state = "releasing";
        const releaseValue = dynamic[prepared.releaseTag]?.(undefined);
        const remote: Effect.Effect<
          void,
          RemoteError<Failure>,
          ClientContext | Rpc.MiddlewareClient<Rpcs> | Scope.Scope
        > = Effect.isEffect(releaseValue)
          ? RpcClient.withHeaders(
              releaseValue as Effect.Effect<
                void,
                RemoteError<Failure>,
                ClientContext | Rpc.MiddlewareClient<Rpcs> | Scope.Scope
              >,
              withLeaseHeaders(token),
            )
          : Effect.fail(error("Protocol", "Remote release did not return an effect"));
        return Scope.provide(leaseScope)(
          remote.pipe(
            Effect.ensuring(Scope.close(leaseScope, Exit.void)),
            Effect.onExit((exit) =>
              Effect.sync(() => {
                state = "released";
                Deferred.doneUnsafe(releaseReady, exit);
              }),
            ),
          ),
        );
      });
      yield* Scope.addFinalizer(
        callerScope,
        Effect.provideContext(release, callerContext).pipe(Effect.ignore),
      );
      const client = resourceClient(prepared.original, base, token, () => state === "open");
      return { client, release };
    }).pipe(
      Effect.onExit((exit) =>
        exit._tag === "Failure"
          ? Effect.uninterruptible(Scope.close(leaseScope, exit))
          : Effect.void,
      ),
    );
    return handle;
  });
