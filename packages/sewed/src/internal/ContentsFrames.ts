import type { WebContents as NativeContents } from "electron";
import { Deferred, Effect, Queue, Schema, Stream } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { FrameOptions, FrameRate } from "../WebContents.ts";
import type { Frame, Painting } from "../WebContents.ts";
import { decoded } from "./ProtocolError.ts";
import type { Control } from "./WebContentsCore.ts";

const decodeOptions = Schema.decodeUnknownSync(FrameOptions);
const decodeRate = Schema.decodeUnknownSync(FrameRate);
const decodeBoolean = Schema.decodeUnknownSync(Schema.Boolean);

type Sink = (image: Electron.NativeImage, dirty: Electron.Rectangle) => void;

/**
 * A frame Electron painted, copied out of the native image at its densest representation, so the
 * bitmap holds the pixels that were rendered and not a downscaled copy. An empty image, or one
 * whose bytes do not match the size it reports, yields nothing.
 */
const frameOf = (image: Electron.NativeImage, dirty: Electron.Rectangle): Frame | undefined => {
  const scaleFactor = Math.max(1, ...image.getScaleFactors());
  const { width, height } = image.getSize(scaleFactor);
  if (width <= 0 || height <= 0) return undefined;
  const bytes = new Uint8Array(image.toBitmap({ scaleFactor }));
  if (bytes.byteLength !== width * height * 4) return undefined;
  return {
    bitmap: { width, height, bytes },
    dirty: { x: dirty.x, y: dirty.y, width: dirty.width, height: dirty.height },
  };
};

/**
 * A page's rendered frames. An offscreen page reports each paint; any other page is subscribed to
 * through Electron's single frame subscription, which this module shares between observers and
 * ends with the last one.
 *
 * Frames are large and arrive at the display's rate, so each observer keeps only the newest two:
 * a consumer slower than the page skips frames instead of failing with `Limit` as the event
 * streams do.
 */
export const make = (
  native: NativeContents,
  control: Pick<Control, "closed" | "isClosed" | "closedError" | "operation">,
) => {
  const { operation } = control;
  const sinks = new Set<Sink>();
  let subscribedDirty: boolean | undefined;
  const fanOut: Sink = (image, dirty) => {
    for (const sink of sinks) sink(image, dirty);
  };
  const subscribe = (sink: Sink, onlyDirty: boolean): (() => void) => {
    if (native.isOffscreen()) {
      const listener = (_event: unknown, dirty: Electron.Rectangle, image: Electron.NativeImage) =>
        sink(image, dirty);
      native.on("paint", listener);
      return () => {
        native.off("paint", listener);
      };
    }
    if (subscribedDirty !== undefined && subscribedDirty !== onlyDirty)
      throw new SewedError({
        code: "Protocol",
        message: "Frames are already observed with a different onlyDirty setting",
      });
    sinks.add(sink);
    if (subscribedDirty === undefined) {
      subscribedDirty = onlyDirty;
      native.beginFrameSubscription(onlyDirty, fanOut);
    }
    return () => {
      sinks.delete(sink);
      if (sinks.size > 0) return;
      subscribedDirty = undefined;
      if (!native.isDestroyed()) native.endFrameSubscription();
    };
  };
  const frames = (options: FrameOptions = {}): Stream.Stream<Frame, SewedError, MainContext> =>
    Stream.callback<Frame, SewedError, MainContext>(
      (queue) =>
        Effect.gen(function* () {
          yield* MainContext;
          const settings = yield* decoded("Invalid frame options", () => decodeOptions(options));
          yield* Effect.acquireRelease(
            Effect.try({
              try: () => {
                if (control.isClosed()) throw control.closedError();
                return subscribe((image, dirty) => {
                  const frame = frameOf(image, dirty);
                  if (frame !== undefined) Queue.offerUnsafe(queue, frame);
                }, settings.onlyDirty === true);
              },
              catch: (cause) =>
                cause instanceof SewedError
                  ? cause
                  : new SewedError({ code: "Native", message: "Could not observe frames", cause }),
            }),
            (release) => Effect.sync(release),
          );
        }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
      { bufferSize: 2, strategy: "sliding" },
    ).pipe(Stream.interruptWhen(Deferred.await(control.closed)));
  return {
    frames,
    /** Whether the page renders offscreen, whether it is painting, and at what rate. */
    painting: operation((): Painting => ({
      offscreen: native.isOffscreen(),
      painting: native.isPainting(),
      frameRate: native.getFrameRate(),
    })),
    /** Starts or stops an offscreen page's painting. */
    setPainting: (painting: boolean) =>
      Effect.andThen(
        decoded("Invalid painting flag", () => decodeBoolean(painting)),
        (value) =>
          operation(() => {
            if (value) native.startPainting();
            else native.stopPainting();
          }),
      ),
    setFrameRate: (rate: FrameRate) =>
      Effect.andThen(
        decoded("Invalid frame rate", () => decodeRate(rate)),
        (value) =>
          operation(() => {
            native.setFrameRate(value);
          }),
      ),
    /** Makes an offscreen page paint a whole new frame. */
    invalidate: operation(() => {
      native.invalidate();
    }),
  };
};
