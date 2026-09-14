import type { InputPolicy } from "../GuestView.ts";

type InputEvent = { preventDefault(): void };
type InputListener = (event: InputEvent) => void;

/** The structural subset of a web contents the input gate listens to. */
export interface Contents {
  on(event: "before-input-event" | "before-mouse-event", listener: InputListener): unknown;
  off(event: "before-input-event" | "before-mouse-event", listener: InputListener): unknown;
}

/**
 * Prevents keyboard and mouse input inside Electron's callbacks while the policy blocks it, so the
 * page never receives the event. `set` switches the policy; `uninstall` removes both listeners.
 */
export const install = (contents: Contents, initial: InputPolicy) => {
  let policy = initial;
  const gate: InputListener = (event) => {
    if (policy === "block") event.preventDefault();
  };
  contents.on("before-input-event", gate);
  contents.on("before-mouse-event", gate);
  return {
    set: (next: InputPolicy) => {
      policy = next;
    },
    uninstall: () => {
      contents.off("before-input-event", gate);
      contents.off("before-mouse-event", gate);
    },
  };
};
