import { Effect, Layer } from "effect";
import type { Rpc } from "effect/unstable/rpc";
import { clientContext, factoryOf, makeBound, to, type Slot } from "./Binding.ts";
import * as Decision from "./Decision.ts";
import { host } from "./Host.ts";
import * as ContentsPosture from "./internal/ContentsPosture.ts";
import * as Registry from "./internal/DecisionRegistry.ts";
import * as RequestStages from "./internal/RequestStages.ts";
import { type HandlerServices } from "./Runtime.ts";
import { ClientContext, MainContext, mainIdentity } from "./RuntimeContext.ts";
import type { InputPolicy } from "./GuestView.ts";
import type { SewedError } from "./SewedError.ts";

export const main = Layer.succeed(MainContext, mainIdentity);

export { host } from "./Host.ts";
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
 * the two resolutions a native callback performs, over the production decision registry, with no
 * Electron.
 *
 * A stand-in carries the posture of the owner it names. That is what {@link contents} exists for:
 * both real web contents build their registry with a construction-time fallback of their own, and a
 * decider that passes on a miss — the spelling the guides teach — delegates to exactly that
 * fallback, so a test's assertion *is* the fallback's. The application, a window and a session build
 * a bare registry in production, so for those three the decidable's own catalog fallback is faithful
 * and {@link owner} is the whole stand-in.
 *
 * `intercept` is not here. It is the session's request-stage door, and no other owner kind has a
 * decidable that fits it, so it lives on {@link RequestsOwner} alone.
 */
export interface DecisionOwner<O extends Decision.OwnerKind> extends Decision.Owner<O> {
  /** What the real owner would answer for `event`, given the deciders installed on this stand-in. */
  readonly resolve: <Event, Answer, Timing extends "sync" | "async">(
    decidable: Decision.Decidable<Event, Answer, Timing, "first" | "restrictive", O>,
    event: NoInfer<Event>,
  ) => Effect.Effect<Answer>;
  /** The same, for a chain decidable: the stopping answer, or the event every decider folded into. */
  readonly resolveChain: <Event, Answer>(
    decidable: Decision.Decidable<Event, Answer, "async", "chain", O>,
    event: NoInfer<Event>,
  ) => Effect.Effect<Decision.ChainOutcome<Event, Answer>>;
}

/**
 * The stand-in for a session's three request stages, which is the one owner kind with two install
 * doors: `decide` installs a stage decider with no filter, and `intercept` installs one behind the
 * filter the session's own door takes — the same {@link Decision.Requests} a real session publishes,
 * over the same decode, refusal and pass-on-a-filter-miss wrapper.
 */
export interface RequestsOwner extends DecisionOwner<"requests">, Decision.Requests {}

/** The three members every stand-in shares, over whichever registry its constructor built. */
const standIn = <O extends Decision.OwnerKind>(
  registry: Registry.Registry<O>,
): DecisionOwner<O> => ({
  decide: Registry.decide(registry, { isClosed: () => false }),
  resolve: (decidable, event) => registry.resolveAsync(decidable, event),
  resolveChain: (decidable, event) => registry.resolveChain(decidable, event),
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
 * {@link contents} — and a session's request stages have a second door — see {@link requests}.
 *
 * The one thing a stand-in adds is a way to ask what the owner would answer, which in production is
 * a native callback's job: `resolve` for a decidable that ranks its answers, `resolveChain` for one
 * that folds them. They are two methods rather than one because they return two different things —
 * an answer and a `ChainOutcome` — and because a runtime test of `composition` cannot narrow a type
 * parameter: `Decidable` is an interface, not a union.
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

/**
 * The stand-in for a session's three request stages. `intercept` applies a feature's filter with the
 * same code the session's own door does — the stage lookup, the filter decode, the refusal of a
 * `body` option on a stage that carries none, and the wrapper that answers `Decision.Pass` for a
 * request the filter does not select. Upload assembly is the one part that stays native, so a test
 * event carries the `body` it wants its decider to see.
 */
export const requests = (): RequestsOwner => {
  const registry = Registry.make({ owner: "requests" });
  const base = standIn(registry);
  return {
    ...base,
    intercept: (decidable, filter, decider) =>
      Effect.flatMap(RequestStages.door(decidable, filter), ({ ops, selects }) =>
        base.decide(
          decidable,
          RequestStages.filtered(ops, selects, RequestStages.answerOf(decider)),
        ),
      ),
  };
};

export const layer = <Rpcs extends Rpc.Any, E, R>(
  slot: Slot<Rpcs>,
  handlers: Layer.Layer<NoInfer<HandlerServices<Rpcs>>, E, R>,
  options: { readonly onConnect?: () => void } = {},
): Layer.Layer<ClientContext, E | SewedError, R> =>
  Layer.effect(
    ClientContext,
    Effect.gen(function* () {
      const owner = yield* host(slot.protocol, handlers).pipe(Effect.provide(main));
      const bound = to(slot, owner);
      const { onConnect } = options;
      const binding =
        onConnect === undefined
          ? bound
          : makeBound(slot, bound.ownerId, {
              connect: Effect.tap(factoryOf(bound).connect, () => Effect.sync(onConnect)),
            });
      return yield* clientContext([binding]);
    }),
  );
