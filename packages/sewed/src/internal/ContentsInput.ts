import * as Decidables from "../Decidables.ts";
import * as Registry from "./DecisionRegistry.ts";

type InputEvent = { preventDefault(): void };
type InputListener = (event: InputEvent) => void;

/** The structural subset of a web contents the input gate listens to. */
export interface Contents {
  on(event: "before-input-event" | "before-mouse-event", listener: InputListener): unknown;
  off(event: "before-input-event" | "before-mouse-event", listener: InputListener): unknown;
}

/**
 * Prevents keyboard and mouse input inside Electron's callbacks while `registry` resolves "block"
 * for `Decidables.WebContents.Input`, so the page never receives the event. The two native events
 * this gates are the same decidable's one event schema's `kind` discriminant made concrete: a
 * `before-input-event` always resolves with `{ kind: "key" }`, a `before-mouse-event` always with
 * `{ kind: "mouse" }` — there is nothing on either native event itself worth passing through, since
 * what distinguishes them is which listener fired, not a field either one carries.
 *
 * There is no `set` here anymore: a caller's only way to change the answer is to install a decider
 * on `registry` through the owner's own `decide`, the same door every other decidable in this wave
 * uses — `uninstall` still removes both listeners, for when the owner itself closes.
 *
 * `internal/GuestView.ts` calls this at construction and holds the gate for the guest's whole life,
 * because a guest's own *posture* decides input with no decider installed: one built with
 * `input: "block"` blocks from its first keystroke, and a gate that waited for a decider would let
 * every event through until one arrived. A plain web contents overrides nothing for this decidable,
 * so it takes {@link hook} instead.
 */
export const install = (contents: Contents, registry: Registry.Resolver<"contents">) => {
  const gate =
    (kind: "key" | "mouse"): InputListener =>
    (event) => {
      if (registry.resolveSync(Decidables.WebContents.Input, { kind }) === "block")
        event.preventDefault();
    };
  const onKeyEvent = gate("key");
  const onMouseEvent = gate("mouse");
  contents.on("before-input-event", onKeyEvent);
  contents.on("before-mouse-event", onMouseEvent);
  return {
    uninstall: () => {
      contents.off("before-input-event", onKeyEvent);
      contents.off("before-mouse-event", onMouseEvent);
    },
  };
};

/**
 * The same gate for an owner whose input answer with nobody installed is the decidable's own
 * `"allow"`: it attaches on the install that takes the decidable from zero deciders to one, and
 * detaches on the removal that takes it back to zero. That is what makes
 * `window.webContents.decide(Decidables.WebContents.Input, …)` mean something. Both kinds of
 * contents share the owner kind `"contents"`, so such an install always compiled and registered,
 * while the only gate in the library was the one a guest view installs at construction — it was
 * never consulted, on the one decidable a window resolves for every keystroke and every click.
 *
 * Attaching on the edges rather than unconditionally is the same rule `Decidables.Session
 * .Certificate` and `.DisplayMedia` attach their own native counterparts by, and here it is what
 * keeps a window that decides no input paying nothing per event: no listener exists, so nothing
 * crosses into a resolution at all.
 *
 * `registry` is a thunk because this hook is declared *inside* the `Registry.make` call whose
 * result it resolves through. The registry does not exist when the hook is built, and it always
 * does by the time `attach` runs, since nothing can install a decider before `make` returns.
 */
export const hook = (
  contents: Contents,
  registry: () => Registry.Resolver<"contents">,
): Registry.Hook => {
  let gate: { readonly uninstall: () => void } | undefined;
  return Registry.hook(Decidables.WebContents.Input, {
    attach: () => {
      gate = install(contents, registry());
    },
    detach: () => {
      const attached = gate;
      gate = undefined;
      attached?.uninstall();
    },
  });
};
