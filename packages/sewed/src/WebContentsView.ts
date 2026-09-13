import type * as Session from "./Session.ts";
import * as Native from "./internal/WebContentsView.ts";

export interface Options {
  readonly session?: Session.Handle;
}

export type { Handle } from "./internal/WebContentsView.ts";

export const make = Native.make;
