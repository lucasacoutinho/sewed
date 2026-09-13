import { BaseWindow as NativeBaseWindow } from "electron";
import { Effect } from "effect";
import type * as Window from "./internal/Window.ts";
import * as Native from "./internal/Window.ts";
import { MainContext } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";

export interface Options {
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
  readonly show?: boolean;
}

export type AttachOptions = Window.AttachOptions;

export const make = (options: Options = {}) =>
  Effect.gen(function* () {
    yield* MainContext;
    const native = yield* Effect.try({
      try: () => new NativeBaseWindow(options),
      catch: (cause) =>
        new SewedError({ code: "Native", message: "Could not create BaseWindow", cause }),
    });
    const handle = yield* Native.make(native).pipe(
      Effect.onError(() =>
        Effect.sync(() => {
          if (!native.isDestroyed()) native.destroy();
        }),
      ),
    );
    return Native.toPublic(handle);
  });

export type Handle = Effect.Success<ReturnType<typeof make>>;
