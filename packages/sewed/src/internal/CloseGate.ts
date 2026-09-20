import { Effect, Fiber } from "effect";
import type * as Decision from "../Decision.ts";
import type * as Registry from "./DecisionRegistry.ts";

/**
 * Gates a native close/quit event behind a decidable, resolved against the owner's own registry.
 * `approve` performs the real close/quit once the resolved answer allows it; `event` and
 * `approvingAnswer` are fixed at construction, since both quit and window-close events carry nothing
 * that changes across requests for the same owner. Generic over `Event`/`Answer` because two owners
 * gate an event this way — `internal/AppRuntime.ts` for `App.Quit` and `internal/WindowClose.ts`
 * for `Window.Close` — and each passes its own registry, decidable, event, and approving answer:
 * nothing here names "quit" or "allow" itself.
 *
 * Composition replaces what this module used to enforce alone: any number of deciders may be
 * installed on `decidable` through the owner's own `decide`, and the registry's own composition rule
 * (declared on the decidable, not here) decides among them. There is no longer a single "guard" slot
 * and no `Limit` failure for a second one.
 *
 * The approving answer is compared with `===`, not structurally: every decidable this wave gates a
 * close/quit event with answers in a plain string literal union (`"allow" | "deny"`), for which `===`
 * and structural equality agree. A future `Answer` that is a tagged object would not be `===`-equal to
 * `approvingAnswer` even when structurally identical, since `resolveCore` decodes every candidate
 * afresh — this gate is narrower than its `Answer` type parameter alone suggests.
 *
 * `event` and `approvingAnswer` are `NoInfer`d so `Event`/`Answer` are fixed by `decidable` alone, the
 * same idiom `Decision.ts`'s `fallback` uses. `Answer` is what makes this more than defensive
 * symmetry: `Decidable` is covariant in `Answer`, so without `NoInfer` an `approvingAnswer` outside
 * what `decidable` actually produces would still type-check, by widening `Answer` to a union that
 * admits both instead of being checked against the decidable's own answer type. Left uninferred, that
 * compiles clean and the gate is silently inert — nothing installed ever equals an approving answer it
 * was never wired to reach.
 *
 * `event` is `NoInfer`d for the identical reason, and this is proven differential rather than kept
 * for symmetry alone: for a decidable whose event is a literal union (`Schema.Literals(["opened",
 * "hidden"])`, say), passing a literal outside that union is `TS2345` with `NoInfer<Event>` in place
 * and compiles clean without it — pinned in `decision-types.ts`. TypeScript reduces multiple
 * inference candidates by union when every one is a literal over the same base type, and by common
 * supertype otherwise, which is why every event this wave actually gates with (a plain object) does
 * not expose the gap in practice; the guarantee itself does not depend on that.
 *
 * `O` is the owner kind, and it is what stops this gate being handed a registry that can never
 * resolve its own decidable — a wrong pairing here is not a gate that fails, it is a gate whose
 * resolution never consults anything. `O` is inferred from `registry` alone and the decidable's own
 * owner is checked against it, which is why the decidable's fifth type argument is `NoInfer<O>` and
 * not a bare `O`: with a bare `O` the two inference sites reduce to the *union* of both owners and
 * the wrong pairing compiles clean — the same hazard `Event` and `Answer` above document, one type
 * parameter over, and proven the same way, by compiling both spellings.
 */
export const make = <Event, Answer, O extends Decision.OwnerKind>(
  approve: () => void,
  registry: Registry.Resolver<O>,
  decidable: Decision.Decidable<
    Event,
    Answer,
    "sync" | "async",
    "first" | "restrictive",
    NoInfer<O>
  >,
  event: NoInfer<Event>,
  approvingAnswer: NoInfer<Answer>,
) => {
  let closed = false;
  let pending = false;
  let fiber: Fiber.Fiber<void> | undefined;
  return {
    request() {
      if (closed || pending) return;
      pending = true;
      fiber = Effect.runFork(
        Effect.yieldNow.pipe(
          Effect.andThen(registry.resolveAsync(decidable, event)),
          Effect.andThen((answer) =>
            Effect.sync(() => {
              if (!closed && answer === approvingAnswer) approve();
            }),
          ),
          // registry.resolveAsync is Effect<Answer, never>, so the only failure source left in this
          // pipeline is approve() itself throwing. A window's approve calls native.close() on a
          // WebContents that may already be gone, which throws; the application's only completes a
          // Deferred, which cannot.
          Effect.catchCause((cause) => Effect.logError("Close gate failed; request denied", cause)),
          Effect.ensuring(
            Effect.sync(() => {
              pending = false;
            }),
          ),
        ),
      );
    },
    close(): Effect.Effect<void> {
      closed = true;
      const toInterrupt = fiber;
      fiber = undefined;
      return toInterrupt === undefined
        ? Effect.void
        : Fiber.interrupt(toInterrupt).pipe(Effect.asVoid);
    },
  };
};
