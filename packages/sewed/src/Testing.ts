import { Effect, Layer } from "effect";
import type { Rpc } from "effect/unstable/rpc";
import { clientContext, factoryOf, makeBound, to, type Slot } from "./Binding.ts";
import * as Decision from "./Decision.ts";
import { host } from "./Host.ts";
import * as Registry from "./internal/DecisionRegistry.ts";
import * as RequestStages from "./internal/RequestStages.ts";
import { type HandlerServices } from "./Runtime.ts";
import { ClientContext, MainContext, mainIdentity } from "./RuntimeContext.ts";
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
 * A stand-in for one owner: both install doors a real owner publishes — {@link Decision.Owner}'s
 * `decide` and {@link Decision.Requests}'s `intercept` — plus the two resolutions a native callback
 * would perform, over the production decision registry, with no Electron.
 *
 * Both doors, not one, because a stand-in stands for exactly one owner kind and a real owner
 * publishes whichever doors that kind has: a session holds two owners and gives each its own door,
 * while a stand-in holds one and offers both for it. On a kind the shipped catalog declares no
 * filtered decidable for, `intercept` is a door nothing fits — it refuses another owner's decidable
 * with the same compile error `decide` and `resolve` give, and refuses one this library resolves no
 * request listener for at run time.
 */
export interface DecisionOwner<O extends Decision.OwnerKind>
  extends Decision.Owner<O>, Decision.Requests<O> {
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
 * An owner stand-in for `kind`, to exercise a decider with no Electron and no native object.
 *
 * Nothing here is a fake. The registry, the scoped install, the composition, the decode of every
 * answer, the declared `failure` a broken decider contributes, and the removal a closing scope
 * performs are the production ones, so a feature is tested exactly as it is used: write it against
 * the minimal interface — `(contents: Decision.Owner<"contents">) => contents.decide(…)` — and a
 * real window's `webContents` and `Testing.owner("contents")` are interchangeable at that signature.
 *
 * The one thing a stand-in adds is a way to ask what the owner would answer, which in production is
 * a native callback's job: `resolve` for a decidable that ranks its answers, `resolveChain` for one
 * that folds them. They are two methods rather than one because they return two different things —
 * an answer and a `ChainOutcome` — and because a runtime test of `composition` cannot narrow a type
 * parameter: `Decidable` is an interface, not a union.
 *
 * Each call builds a fresh registry, so the deciders one test installs are invisible to every other
 * test and there is nothing to reset between them. A stand-in has no closed state, so an install
 * never fails the way a closed window's does.
 */
export const owner = <O extends Decision.OwnerKind>(kind: O): DecisionOwner<O> => {
  const registry = Registry.make({ owner: kind });
  const decide = Registry.decide(registry, { isClosed: () => false });
  return {
    decide,
    intercept: (decidable, filter, decider) =>
      Effect.flatMap(RequestStages.door(decidable, filter), ({ ops, selects }) =>
        decide(decidable, RequestStages.filtered(ops, selects, RequestStages.answerOf(decider))),
      ),
    resolve: (decidable, event) => registry.resolveAsync(decidable, event),
    resolveChain: (decidable, event) => registry.resolveChain(decidable, event),
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
