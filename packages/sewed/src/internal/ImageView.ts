import { ImageView as NativeImageView, nativeImage } from "electron";
import { Effect, Schema } from "effect";
import type { Scope } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { type Attachable, lifecycle, register, viewIdentity } from "./View.ts";

const decodePath = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

const decodeBytes = Schema.decodeUnknownSync(Schema.Uint8Array);

const image = (source: string | Uint8Array) => {
  if (typeof source === "string") {
    const value = nativeImage.createFromPath(decodePath(source));
    if (value.isEmpty()) throw protocolError(`Image is not readable: ${source}`);
    return value;
  }
  const value = nativeImage.createFromBuffer(Buffer.from(decodeBytes(source)));
  if (value.isEmpty()) throw protocolError("Image bytes are not a readable image");
  return value;
};

export interface Options {
  /** A file path or encoded image bytes such as PNG; either must decode to a non-empty image. */
  readonly image?: string | Uint8Array;
}

/** A view that displays one image; attach it to a window or container view. */
export interface Handle extends Attachable {
  readonly setImage: (image: string | Uint8Array) => Effect.Effect<void, SewedError, MainContext>;
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
      setImage: (source) =>
        base.operation(() => {
          native.setImage(image(source));
        }),
      close: base.close,
      awaitClosed: base.awaitClosed,
    };
    register(handle, base.state);
    return handle;
  });
