import { Deferred, Effect, Stream } from "effect";
import type * as Download from "../Download.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as Observers from "./Observers.ts";

type Phase = "progressing" | "interrupted";
type Terminal = "completed" | "cancelled" | "interrupted";

/** The subset of Electron's DownloadItem the adopted handle drives. */
export interface AdoptableItem {
  on(event: "updated", listener: (event: unknown, state: Phase) => void): unknown;
  on(event: "done", listener: (event: unknown, state: Terminal) => void): unknown;
  off(event: "updated", listener: (event: unknown, state: Phase) => void): unknown;
  off(event: "done", listener: (event: unknown, state: Terminal) => void): unknown;
  getReceivedBytes(): number;
  getTotalBytes(): number;
  getPercentComplete(): number;
  getCurrentBytesPerSecond(): number;
  canResume(): boolean;
  isPaused(): boolean;
  getState(): "progressing" | Terminal;
  getSavePath(): string;
  getStartTime(): number;
  getEndTime(): number;
  getETag(): string;
  getLastModifiedTime(): string;
  getInitiatorOrigin(): string;
  pause(): void;
  resume(): void;
  cancel(): void;
}

const closedError = () => new SewedError({ code: "Closed", message: "Download is closed" });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

const metrics = (item: AdoptableItem) => ({
  receivedBytes: item.getReceivedBytes(),
  totalBytes: item.getTotalBytes(),
  percent: item.getPercentComplete(),
  currentBytesPerSecond: item.getCurrentBytesPerSecond(),
  canResume: item.canResume(),
  paused: item.isPaused(),
});

/** The file and response facts Electron keeps on a download item. */
export const detailsOf = (
  item: Pick<
    AdoptableItem,
    | "getSavePath"
    | "getStartTime"
    | "getEndTime"
    | "getETag"
    | "getLastModifiedTime"
    | "getInitiatorOrigin"
  >,
): Download.Details => ({
  savePath: item.getSavePath(),
  startTime: item.getStartTime(),
  endTime: item.getEndTime(),
  eTag: item.getETag(),
  lastModified: item.getLastModifiedTime(),
  initiatorOrigin: item.getInitiatorOrigin(),
});

/** Wraps a native download Electron already started; the handle ends with the item. */
export const adopt = (item: AdoptableItem): Download.Handle => {
  const observers = Observers.make<Download.State>("Download", { replayLatest: true });
  const done = Deferred.makeUnsafe<Download.Outcome, SewedError>();
  let state: Download.State = { ...metrics(item), status: "active", phase: "progressing" };
  let terminal: Download.Outcome | undefined;
  const publish = (next: Download.State) => {
    state = next;
    observers.publish(next);
  };
  const updated = (_event: unknown, phase: Phase) => {
    if (terminal !== undefined) return;
    publish({ ...metrics(item), status: "active", phase });
  };
  const finished = (_event: unknown, outcome: Terminal) => {
    if (terminal !== undefined) return;
    const settled: Download.Outcome = { kind: outcome };
    terminal = settled;
    publish({ ...metrics(item), status: "terminal", outcome });
    Deferred.doneUnsafe(done, Effect.succeed(settled));
    observers.finish();
    item.off("updated", updated);
    item.off("done", finished);
  };
  item.on("updated", updated);
  item.on("done", finished);
  observers.publish(state);
  const operation = <A>(run: () => A): Effect.Effect<A, SewedError, MainContext> =>
    Effect.andThen(
      MainContext,
      Effect.try({
        try: () => {
          if (terminal !== undefined) throw closedError();
          return run();
        },
        catch: (cause) =>
          cause instanceof SewedError ? cause : nativeError("Download operation failed", cause),
      }),
    );
  const phaseOf = (): Phase =>
    state.status === "active" && state.phase === "interrupted" ? "interrupted" : "progressing";
  return {
    snapshot: Effect.andThen(
      MainContext,
      Effect.sync(() => state),
    ),
    // Readable after the download ends too: where the file went is most useful then.
    details: Effect.andThen(
      MainContext,
      Effect.try({
        try: () => detailsOf(item),
        catch: (cause) => nativeError("Could not read download details", cause),
      }),
    ),
    progress: Stream.unwrap(
      Effect.map(MainContext, () =>
        terminal === undefined ? observers.stream : Stream.succeed(state),
      ),
    ),
    awaitDone: Effect.andThen(MainContext, Deferred.await(done)),
    pause: operation(() => {
      item.pause();
      publish({ ...metrics(item), status: "active", phase: phaseOf() });
    }),
    resume: operation(() => {
      item.resume();
      publish({ ...metrics(item), status: "active", phase: "progressing" });
    }),
    cancel: Effect.andThen(
      MainContext,
      Effect.try({
        try: () => {
          if (terminal === undefined) item.cancel();
        },
        catch: (cause) => nativeError("Could not cancel download", cause),
      }),
    ),
  };
};
