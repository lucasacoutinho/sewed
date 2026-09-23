import { View as NativeView } from "electron";
import { Effect } from "effect";
import type { Scope } from "effect";
import { MainContext } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import * as Native from "./internal/View.ts";

export type {
  Attachable,
  AttachOptions,
  Attachment,
  AttachmentSnapshot,
  Handle,
  Options,
} from "./internal/View.ts";

/** Constructs the native view — the one step `internal/View.ts` stays free of — then builds the handle over it. */
export const make = (
  options: Native.Options = {},
): Effect.Effect<Native.Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: () => new NativeView(),
      catch: (cause) => new SewedError({ code: "Native", message: "Could not create view", cause }),
    }),
  ).pipe(Effect.flatMap((native) => Native.fromNative(native, options)));
