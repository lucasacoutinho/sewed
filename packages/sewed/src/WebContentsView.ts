import type * as Session from "./Session.ts";
import * as Native from "./internal/WebContentsView.ts";

export interface Options {
  readonly session?: Session.Handle;
  /** Whether Chromium throttles timers and animations while the view is hidden or occluded. */
  readonly backgroundThrottling?: boolean;
  /**
   * Makes the view over a clone of another view's web contents: the same render process, storage
   * and navigation history, with no page loaded until the program navigates it, and a lifetime of
   * its own. The clone takes its session and preferences from its original, so neither option
   * above may be given with it.
   */
  readonly cloneOf?: Native.Handle;
}

export type { Handle } from "./internal/WebContentsView.ts";

export const make = Native.make;
