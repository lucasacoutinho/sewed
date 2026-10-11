import { screen } from "electron";
import { Cause, Effect, Queue, Schema, Stream } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import * as Screen from "../Screen.ts";
import { SewedError } from "../SewedError.ts";
export { Bounds, Change, Display, Point } from "../Screen.ts";

const decodePoint = Schema.decodeUnknownSync(Screen.Point);
const decodeBounds = Schema.decodeUnknownSync(Screen.Bounds);

const operation = <A>(run: () => A): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: run,
      catch: (cause) =>
        new SewedError({ code: "Native", message: "Screen operation failed", cause }),
    }),
  );

const display = (value: Electron.Display): Screen.Display => ({
  id: value.id,
  label: value.label,
  bounds: { ...value.bounds },
  workArea: { ...value.workArea },
  scaleFactor: value.scaleFactor,
  rotation: value.rotation,
  internal: value.internal,
});

export const displays: Effect.Effect<readonly Screen.Display[], SewedError, MainContext> =
  operation(() => screen.getAllDisplays().map(display));

export const primary = operation(() => display(screen.getPrimaryDisplay()));

export const cursor: Effect.Effect<Screen.Point, SewedError, MainContext> = operation(() => ({
  ...screen.getCursorScreenPoint(),
}));

export const nearest = (point: Screen.Point) =>
  operation(() => display(screen.getDisplayNearestPoint(decodePoint(point))));

export const matching = (bounds: Screen.Bounds) =>
  operation(() => display(screen.getDisplayMatching(decodeBounds(bounds))));

const converted = (convert: (point: Electron.Point) => Electron.Point) => (point: Screen.Point) =>
  Effect.andThen(
    Effect.try({
      try: () => decodePoint(point),
      catch: (cause) => new SewedError({ code: "Protocol", message: "Invalid point", cause }),
    }),
    (value): Effect.Effect<Screen.Point, SewedError, MainContext> =>
      operation(() => ({ ...convert(value) })),
  );

/**
 * Converts a point in device-independent pixels to the screen's physical pixels, on Linux and
 * Windows, where the two differ on a scaled display.
 */
export const dipToScreenPoint = converted((point) => screen.dipToScreenPoint(point));

/** Converts a point in the screen's physical pixels to device-independent pixels. */
export const screenToDipPoint = converted((point) => screen.screenToDipPoint(point));

export const changes: Stream.Stream<Screen.Change, SewedError, MainContext> = Stream.callback<
  Screen.Change,
  SewedError,
  MainContext
>(
  (queue) =>
    Effect.gen(function* () {
      yield* MainContext;
      const offer = (change: Screen.Change) => {
        if (!Queue.offerUnsafe(queue, change)) {
          Queue.failCauseUnsafe(
            queue,
            Cause.fail(new SewedError({ code: "Limit", message: "Screen event queue is full" })),
          );
        }
      };
      const onAdded = (_event: Electron.Event, value: Electron.Display) => {
        offer({ kind: "added", display: display(value) });
      };
      const onRemoved = (_event: Electron.Event, value: Electron.Display) => {
        offer({ kind: "removed", display: display(value) });
      };
      const onMetrics = (_event: Electron.Event, value: Electron.Display, metrics: string[]) => {
        offer({ kind: "metrics", display: display(value), metrics: [...metrics] });
      };
      yield* Effect.acquireRelease(
        operation(() => screen.on("display-added", onAdded)),
        () =>
          Effect.sync(() => {
            screen.off("display-added", onAdded);
          }),
      );
      yield* Effect.acquireRelease(
        operation(() => screen.on("display-removed", onRemoved)),
        () =>
          Effect.sync(() => {
            screen.off("display-removed", onRemoved);
          }),
      );
      yield* Effect.acquireRelease(
        operation(() => screen.on("display-metrics-changed", onMetrics)),
        () =>
          Effect.sync(() => {
            screen.off("display-metrics-changed", onMetrics);
          }),
      );
    }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
  { bufferSize: 128 },
);
