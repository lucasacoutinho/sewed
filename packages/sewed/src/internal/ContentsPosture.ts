import * as Decidables from "../Decidables.ts";
import type { InputPolicy } from "../GuestView.ts";
import * as Registry from "./DecisionRegistry.ts";

/**
 * The two per-owner fallbacks `internal/GuestView.ts` and `internal/WebContents.ts` each build their
 * own registry from, pulled into their own Electron-free module so the posture itself — not just the
 * expression that reads it — is importable by the test suite. Neither `internal/GuestView.ts` nor
 * `internal/WebContents.ts` can be imported directly: both transitively import `electron` for a
 * value, so nothing in `test/` can prove which fallback either owner actually constructs with. A test
 * that hand-builds `Registry.make({ fallbacks: [Registry.fallback(Decidables.WebContents.Download, {
 * kind: "deny" }) ] })` proves the mechanism works; it proves nothing about which posture either
 * owner ships, because flipping the real construction site does not touch it. Calling `guestFallbacks`
 * and `rendererFallbacks` from both the owners and the tests closes that gap: a test that imports this
 * module and a change to either owner's posture necessarily go through the same two functions.
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
