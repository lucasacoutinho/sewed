import * as Decidables from "../Decidables.ts";
import type { InputPolicy } from "../GuestView.ts";
import * as Registry from "./DecisionRegistry.ts";

/**
 * The two per-owner fallbacks `internal/GuestView.ts` and `internal/WebContents.ts` each build their
 * own registry from, pulled into their own Electron-free module so the *values* — not just the
 * expression that reads them — are importable by the test suite. Neither `internal/GuestView.ts` nor
 * `internal/WebContents.ts` can be imported directly: both transitively import `electron` for a
 * value. A test that hand-builds `Registry.make({ fallbacks: [Registry.fallback(Decidables.WebContents.Download, {
 * kind: "deny" }) ] })` in the test file proves the registry mechanism works; it proves nothing about
 * either owner's own posture, because flipping the real construction site never touches it. Calling
 * `guestFallbacks` and `rendererFallbacks` from both the owners and the tests pins what each
 * function's own content is: changing a value either one returns fails a named test in
 * `decidables-download.test.ts`.
 *
 * What this does not pin: *which* function each owner calls, or with what argument.
 * `internal/WebContents.ts` calling `guestFallbacks(undefined)` instead of `rendererFallbacks()`, or
 * `internal/GuestView.ts` dropping `settings.input` from its own call, would leave the suite green and
 * `tsc -b` clean — that selection is made at each owner's own construction site, inside a file the
 * suite cannot import, and nothing short of importing those files (which nothing in this repository
 * can do) closes the residual. It is real but strictly smaller than the gap this module exists to
 * close: the two postures' *values* can no longer be silently inverted, only the choice of which one
 * an owner reaches for.
 *
 * See `Decidables.ts`'s doc on `Download` for why one decidable needs two postures at all.
 */

/**
 * A guest's own posture: denies downloads with no decider installed, matching
 * `Decidables.WebContents.Download`'s own catalog fallback — restated here rather than left implicit,
 * so it is visible at the guest's construction site without cross-referencing the decidable's own
 * declaration — and, when `input` was given at construction, fixes `Decidables.WebContents.Input`'s
 * default to it instead of the decidable's own `"allow"`. Either fallback is only the floor: a
 * decider installed afterward through `webContents.decide` still composes over it.
 */
export const guestFallbacks = (input: InputPolicy | undefined): readonly Registry.Fallback[] => [
  Registry.fallback(Decidables.WebContents.Download, { kind: "deny" }),
  ...(input === undefined ? [] : [Registry.fallback(Decidables.WebContents.Input, input)]),
];

/** A plain web contents' own posture: downloads prompt rather than deny with no decider installed. */
export const rendererFallbacks = (): readonly Registry.Fallback[] => [
  Registry.fallback(Decidables.WebContents.Download, { kind: "prompt" }),
];
