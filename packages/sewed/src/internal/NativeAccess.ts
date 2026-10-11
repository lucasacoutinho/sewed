import type { BaseWindow, Session as NativeSession, View as NativeView } from "electron";
import { Effect } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import type { Handle as SessionHandle } from "./Session.ts";
import * as Session from "./Session.ts";
import * as View from "./View.ts";
import * as Window from "./Window.ts";

/**
 * The bridge from a Sewed handle to Electron's own object, for the members Sewed does not wrap
 * and never will, because they hand out or take a native object: `getContentView`,
 * `setContentView`, `getNativeHandle`, a `webFrameMain`, `clone`, a custom DevTools host.
 *
 * It is the one place the library gives up its guarantees, and it says so at the call site. What
 * `use` does inside is unvalidated, undecided by any decider, and unknown to the handle's own
 * state; a native listener it adds is the caller's to remove. What it keeps is the edge: the
 * function runs in main, fails `Closed` once the owner is gone, and a throw is a typed `Native`
 * failure. The native object is for the duration of the function. Keeping it past that is how a
 * program ends up holding a destroyed window.
 */
const bridge =
  <N>(
    what: string,
    find: () => N | undefined,
    // Only a window can report itself destroyed; a session lives as long as the application and a
    // view is released with its scope.
    isDestroyed: (native: N) => boolean = () => false,
  ) =>
  <A>(use: (native: N) => A | Promise<A>): Effect.Effect<A, SewedError, MainContext> =>
    Effect.andThen(
      MainContext,
      Effect.tryPromise({
        try: async () => {
          const native = find();
          if (native === undefined)
            throw new SewedError({ code: "Protocol", message: `${what} was not created by Sewed` });
          if (isDestroyed(native))
            throw new SewedError({ code: "Closed", message: `${what} is closed` });
          return await use(native);
        },
        catch: (cause) =>
          cause instanceof SewedError
            ? cause
            : new SewedError({ code: "Native", message: `Native ${what} access failed`, cause }),
      }),
    );

/** Runs `use` with the native window behind a Sewed window handle. */
export const window = <A>(
  handle: { readonly id: string },
  use: (native: BaseWindow) => A | Promise<A>,
): Effect.Effect<A, SewedError, MainContext> =>
  bridge<BaseWindow>(
    "Window",
    () => Window.nativeOf(handle),
    (native) => native.isDestroyed(),
  )(use);

/** Runs `use` with the native session behind a Sewed session handle. */
export const session = <A>(
  handle: SessionHandle,
  use: (native: NativeSession) => A | Promise<A>,
): Effect.Effect<A, SewedError, MainContext> =>
  bridge<NativeSession>("Session", () => Session.resolve(handle))(use);

/** Runs `use` with the native view behind a Sewed view or guest view handle. */
export const view = <A>(
  handle: View.Attachable,
  use: (native: NativeView) => A | Promise<A>,
): Effect.Effect<A, SewedError, MainContext> =>
  bridge<NativeView>("View", () => View.nativeOf(handle))(use);
