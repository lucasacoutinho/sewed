import type * as Session from "./Session.ts";
import * as Native from "./internal/WebContentsView.ts";

export interface Options {
  readonly session?: Session.Handle;
  /** Whether Chromium throttles timers and animations while the view is hidden or occluded. */
  readonly backgroundThrottling?: boolean;
}

export type { Handle } from "./internal/WebContentsView.ts";

export const make = Native.make;
