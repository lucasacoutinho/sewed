import * as Decidables from "../Decidables.ts";
import type * as Registry from "./DecisionRegistry.ts";

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
 */
export const install = (contents: Contents, registry: Registry.Resolver) => {
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
