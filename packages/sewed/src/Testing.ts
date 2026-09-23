import { Cause, Effect, Layer, Queue, Schema, Stream } from "effect";
import type { Scope } from "effect";
import type { Rpc } from "effect/unstable/rpc";
import { clientContext, factoryOf, makeBound, to, type Slot } from "./Binding.ts";
import * as Capability from "./Capability.ts";
import * as Decision from "./Decision.ts";
import { host } from "./Host.ts";
import * as ContentsPosture from "./internal/ContentsPosture.ts";
import * as Registry from "./internal/DecisionRegistry.ts";
import * as RequestStages from "./internal/RequestStages.ts";
import { tampered, type Tamper } from "./internal/Tamper.ts";
import {
  ClientContext,
  MainContext,
  mainIdentity,
  RendererContext,
  rendererIdentity,
} from "./RuntimeContext.ts";
import type { InputPolicy } from "./GuestView.ts";
import { SewedError } from "./SewedError.ts";
import * as WebRequestData from "./WebRequest.ts";

export const main = Layer.succeed(MainContext, mainIdentity);
export const renderer = Layer.succeed(RendererContext, rendererIdentity);

export { host } from "./Host.ts";
export type { Tamper } from "./internal/Tamper.ts";
export * as Worker from "./WorkerHost.ts";
export { memory, Recorder, type Call } from "./internal/CapabilityMemory.ts";
export * as Clipboard from "./internal/ClipboardMemory.ts";
export * as Cookies from "./internal/CookiesMemory.ts";
export * as NativeTheme from "./internal/NativeThemeMemory.ts";
export * as Notification from "./internal/NotificationMemory.ts";
export * as PowerMonitor from "./internal/PowerMonitorMemory.ts";
export * as Shell from "./internal/ShellMemory.ts";

/**
 * A stand-in for one owner: the scoped install a real owner publishes ({@link Decision.Owner}) and
 * the resolution a native callback performs, over the production decision registry, with no
 * Electron.
 *
 * A stand-in carries the posture of the owner it names, and exactly the doors its production owner
 * has. That is what {@link contents} exists for: both real web contents build their registry with a
 * construction-time fallback of their own, and a decider that passes on a miss — the spelling the
 * guides teach — delegates to exactly that fallback, so a test's assertion *is* the fallback's. The
 * application, a window and a session build a bare registry in production, so for those three the
 * decidable's own catalog fallback is faithful and {@link owner} is the whole stand-in.
 *
 * Neither `intercept` nor `resolveChain` is here. The first is the session's request-stage door and
 * the second folds a `chain` decidable, and both chain decidables in the catalog are request stages,
 * so on any other owner each would be a member nothing fits. They live on {@link RequestsOwner}
 * alone, and a later wave that gives another owner a chain decidable is what would move
 * `resolveChain` back.
 */
export interface DecisionOwner<O extends Decision.OwnerKind> extends Decision.Owner<O> {
  /** What the real owner would answer for `event`, given the deciders installed on this stand-in. */
  readonly resolve: <Event, Answer, Timing extends "sync" | "async">(
    decidable: Decision.Decidable<Event, Answer, Timing, "first" | "restrictive", O>,
    event: NoInfer<Event>,
  ) => Effect.Effect<Answer>;
}

/**
 * The stand-in for a session's three request stages, and the one that is not a
 * {@link DecisionOwner}: in production the `"requests"` kind has exactly one install door,
 * `session.intercept`, and `session.decide` refuses a request stage at compile time and at run time.
 * So this publishes {@link Decision.Requests} and no `decide` — a stage decider installed without a
 * filter is a shape production cannot produce, and a test that wants every request says so with
 * `{ urls: ["<all_urls>"] }`.
 *
 * It carries both resolutions because its three decidables need both: `Session.Request` ranks its
 * answers and the two header stages fold theirs.
 */
export interface RequestsOwner extends Decision.Requests {
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

/** The two members a {@link DecisionOwner} has, over whichever registry its constructor built. */
const standIn = <O extends Decision.OwnerKind>(
  registry: Registry.Registry<O>,
): DecisionOwner<O> => ({
  decide: Registry.decide(registry, { isClosed: () => false }),
  resolve: (decidable, event) => registry.resolveAsync(decidable, event),
});

/**
 * An owner stand-in for `kind`, to exercise a decider with no Electron and no native object.
 *
 * Nothing here is a fake. The registry, the scoped install, the composition, the decode of every
 * answer, the declared `failure` a broken decider contributes, and the removal a closing scope
 * performs are the production ones, so a feature is tested exactly as it is used: write it against
 * the minimal interface — `(window: Decision.Owner<"window">) => window.decide(…)` — and a real
 * window and `Testing.owner("window")` are interchangeable at that signature. The application's own
 * door is a free function rather than a handle, so a feature written against
 * `Decision.Owner<"app">` is handed `{ decide: App.decide }` in production and this stand-in in a
 * test.
 *
 * These three kinds and no more: their real owners build a bare registry, so the decidable's own
 * catalog fallback is what they answer with nobody installed. A web contents does not — see
 * {@link contents} — and a session's request stages have a different door — see {@link requests}.
 *
 * The one thing a stand-in adds is a way to ask what the owner would answer, which in production is
 * a native callback's job. `resolve` is that, and it is all of it here: every decidable these three
 * kinds own ranks its answers rather than folding them.
 *
 * Each of the three constructors builds a fresh registry on every call, so the deciders one test
 * installs are invisible to every other test and there is nothing to reset between them. A stand-in
 * has no closed state, so an install never fails the way a closed window's does.
 */
export const owner = <O extends Exclude<Decision.OwnerKind, "contents" | "requests">>(
  kind: O,
): DecisionOwner<O> => standIn(Registry.make({ owner: kind }));

/**
 * The stand-in for a web contents, which is the one owner kind with no posture-free form: a
 * window's own contents falls back to `prompt` for a download and a guest's to `deny`, and a guest
 * built with `input: "block"` blocks input until a decider allows it. Saying whose contents this
 * stands for is therefore not a convenience — a decider that passes on a miss answers the fallback,
 * so a download test written against the wrong posture asserts the wrong thing while looking right.
 *
 * The two postures are not restated here: this calls `ContentsPosture.rendererFallbacks()` and
 * `ContentsPosture.guestFallbacks(input)`, the same two functions `internal/WebContents.ts` and
 * `internal/GuestView.ts` call at their own construction sites, so changing either moves the
 * stand-in with it rather than leaving a copy behind.
 */
export const contents = (
  of: { readonly of: "window" } | { readonly of: "guest"; readonly input?: InputPolicy },
): DecisionOwner<"contents"> =>
  standIn(
    Registry.make({
      owner: "contents",
      fallbacks:
        of.of === "window"
          ? ContentsPosture.rendererFallbacks()
          : ContentsPosture.guestFallbacks(of.input),
    }),
  );

const decodeRequestFilter = Schema.decodeUnknownSync(WebRequestData.Filter);

/** One `observe` subscriber's own filter, compiled once at subscription time, matching `internal/WebRequest.ts`'s own `Tap`. */
interface RequestTap {
  readonly matches: (url: URL, type: string) => boolean;
  readonly offer: (event: WebRequestData.Event) => void;
}

/**
 * The stand-in for a session's three request stages. `intercept` is its only install door, as it is
 * a real session's, and it applies a feature's filter with the same code that door does — the stage
 * lookup, the filter decode, the refusal of a `body` option on a stage that carries none, and the
 * wrapper that answers `Decision.Pass` for a request the filter does not select. Upload assembly is
 * the one part that stays native, so a test event carries the `body` it wants its decider to see.
 *
 * `resolve` answers `Session.Request`, which ranks; `resolveChain` folds the two header stages.
 * `observe`/`emit` are the third door, the observation stages deciders never see: `taps` is this
 * stand-in's own version of `internal/WebRequest.ts`'s `wiring.taps` — one entry per open `observe`
 * stream, each with its own compiled filter — and `emit` is this stand-in's own `dispatch`, offering
 * one event to every tap whose filter selects it, synchronously, with no Electron underneath either.
 */
export const requests = (): RequestsOwner => {
  const registry = Registry.make({ owner: "requests" });
  const install = Registry.decide(registry, { isClosed: () => false });
  const taps = new Set<RequestTap>();
  return {
    intercept: (decidable, filter, decider) =>
      Effect.flatMap(RequestStages.door(decidable, filter), ({ ops, selects }) =>
        install(decidable, RequestStages.filtered(ops, selects, RequestStages.answerOf(decider))),
      ),
    resolve: (decidable, event) => registry.resolveAsync(decidable, event),
    resolveChain: (decidable, event) => registry.resolveChain(decidable, event),
    observe: (filter) =>
      Effect.gen(function* () {
        yield* MainContext;
        const settings = yield* Effect.try({
          try: () => decodeRequestFilter(filter),
          catch: (cause) =>
            cause instanceof SewedError
              ? cause
              : RequestStages.protocolError("Invalid request filter", cause),
        });
        const patterns = settings.urls.map(WebRequestData.compilePattern);
        const types = settings.types === undefined ? undefined : new Set<string>(settings.types);
        // Bounded the same way `Observation.listen`'s own queue is: overflow fails this
        // subscription with `Limit` and leaves every other observer untouched. `Cause.Done`
        // joins the error channel so the release step below can end the queue outright, the
        // same shape `internal/Observers.ts`'s own per-subscriber queue carries; `Stream.fromQueue`
        // excludes it from what `observe` answers, so a caller never sees it.
        const queue = yield* Queue.bounded<WebRequestData.Event, SewedError | Cause.Done>(128);
        const tap: RequestTap = {
          matches: (url, type) =>
            (types === undefined || types.has(type)) && patterns.some((allows) => allows(url)),
          offer: (event) => {
            if (!Queue.offerUnsafe(queue, event)) {
              Queue.failCauseUnsafe(
                queue,
                Cause.fail(
                  new SewedError({ code: "Limit", message: "Request observer queue is full" }),
                ),
              );
            }
          },
        };
        // The acquire step is synchronous, so `taps.add` has already run by the time this whole
        // generator — and the Effect `observe` answers — succeeds: the subscription this door
        // promises is live before the caller's own next line, with nothing to await separately.
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            taps.add(tap);
          }),
          () =>
            Effect.sync(() => {
              taps.delete(tap);
              // Ends the queue rather than merely abandoning it, so a reader still running on
              // the `Stream` this Effect returned completes instead of hanging forever on a
              // door nothing will ever offer through again.
              Queue.endUnsafe(queue);
            }),
        );
        return Stream.fromQueue(queue);
      }),
    emit: (event) => {
      const parsed = URL.parse(event.url);
      if (parsed === null)
        throw RequestStages.protocolError(
          `Testing.requests().emit was given an unparseable url: ${event.url}`,
        );
      for (const tap of taps) if (tap.matches(parsed, event.resourceType)) tap.offer(event);
    },
  };
};

/**
 * What {@link layer} and {@link client} take beside the handlers. `onConnect` runs as each
 * connection opens. `tamper` is a test door only: it corrupts the messages it selects so that a
 * test can make one call fail as an undecodable message does, with no hand-built transport.
 */
export interface Options {
  readonly onConnect?: () => void;
  readonly tamper?: Tamper;
}

export const layer = <Rpcs extends Rpc.Any, E, R>(
  slot: Slot<Rpcs>,
  handlers: Capability.Handlers<Rpcs, E, R>,
  options: Options = {},
): Layer.Layer<ClientContext, E | SewedError, R> =>
  Layer.effect(
    ClientContext,
    Effect.gen(function* () {
      const owner = yield* host(slot.protocol, handlers).pipe(Effect.provide(main));
      const bound = to(slot, owner);
      const { onConnect, tamper } = options;
      const connect = factoryOf(bound).connect.pipe(
        Effect.map((connection) =>
          tamper === undefined ? connection : tampered(tamper)(connection),
        ),
        Effect.tap(() => Effect.sync(() => onConnect?.())),
      );
      const binding =
        onConnect === undefined && tamper === undefined
          ? bound
          : makeBound(slot, bound.ownerId, { connect });
      return yield* clientContext([binding]);
    }),
  );

/**
 * Serves a capability over the real wire for a test: the capability's client Layer over an
 * in-process host of `handlers`. This is the composition that proves a host's own values encode;
 * `Capability.fromHandlers` dispatches in process and proves behaviour only.
 */
export const client = <Rpcs extends Rpc.Any, Key extends string, E, R>(
  capability: Capability.Capability<Rpcs, Key>,
  handlers: Capability.Handlers<Rpcs, E, R>,
  options: Options = {},
): Layer.Layer<Capability.Capability<Rpcs, Key>, E | SewedError, R> =>
  Capability.client(capability).pipe(Layer.provide(layer(capability.slot, handlers, options)));
