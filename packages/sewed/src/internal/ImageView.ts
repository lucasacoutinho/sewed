import { ImageView as NativeImageView, nativeImage } from "electron";
import { Effect, Schema } from "effect";
import type { Scope } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { type Attachable, lifecycle, register, viewIdentity } from "./View.ts";

const decodePath = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

const image = (path: string) => {
  const value = nativeImage.createFromPath(decodePath(path));
  if (value.isEmpty()) throw protocolError(`Image is not readable: ${path}`);
  return value;
};

export interface Options {
  /** Path of the image to display; must decode to a non-empty image. */
  readonly image?: string;
}

/** A view that displays one image; attach it to a window or container view. */
export interface Handle extends Attachable {
  readonly setImage: (path: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly close: Effect.Effect<void, never, MainContext>;
  readonly awaitClosed: Effect.Effect<void, never, MainContext>;
}

export const make = (
  options: Options = {},
): Effect.Effect<Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const native = yield* Effect.try({
      try: () => {
        const view = new NativeImageView();
        if (options.image !== undefined) view.setImage(image(options.image));
        return view;
      },
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : new SewedError({ code: "Native", message: "Could not create image view", cause }),
    });
    const base = yield* lifecycle(native, () => false);
    const handle: Handle = {
      [viewIdentity]: true,
      id: base.id,
      setImage: (path) =>
        base.operation(() => {
          native.setImage(image(path));
        }),
      close: base.close,
      awaitClosed: base.awaitClosed,
    };
    register(handle, base.state);
    return handle;
  });
