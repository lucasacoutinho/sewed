import * as Decidables from "../Decidables.ts";
import * as CloseGate from "./CloseGate.ts";
import * as Registry from "./DecisionRegistry.ts";

/**
 * The close-gate wiring `internal/Window.ts` installs for its own window: a per-window registry,
 * `Decidables.Window.Close` gated on `{ windowId: id }`, and the `decide` the window's public handle
 * exposes. Isolated into its own Electron-free module so it can be unit-tested directly — the rest
 * of `internal/Window.ts` transitively imports the real `electron` module for a value
 * (`internal/View.ts`'s `new NativeView()`), which fails outside a real Electron process, so nothing
 * that touches that file at all can run under `node --import tsx --test`. This module has no such
 * import, and `id` is the caller's own — this is the one place the window's generated id and the
 * decider that sees it are the same value, which is exactly what `guardClose`'s bare
 * `Effect<boolean, never, R>` decision could never express.
 */
export const make = (id: string, approve: () => void, isClosed: () => boolean) => {
  const registry = Registry.make();
  const gate = CloseGate.make(
    approve,
    registry,
    Decidables.Window.Close,
    { windowId: id },
    "allow",
  );
  return { gate, decide: Registry.decide(registry, { isClosed }) };
};
