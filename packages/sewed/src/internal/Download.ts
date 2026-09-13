import path from "node:path";
import { WebContentsView } from "electron";
import { Channel, Deferred, Effect, Exit, PubSub, Scope, Schema, Stream } from "effect";
import type * as Take from "effect/Take";
import * as Download from "../Download.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import type { Handle as SessionHandle } from "./Session.ts";
import * as Session from "./Session.ts";

export { Options, State, Outcome } from "../Download.ts";
export type { Handle } from "../Download.ts";
export { adopt } from "./DownloadItem.ts";

const maximumEntries = 128;
const decodeOptions = (value: unknown): Download.Options =>
  Schema.decodeUnknownSync(Download.Options)(value);

type Update = Take.Take<Download.State, SewedError>;

interface Reservation {
  readonly release: () => void;
}

interface SessionEntries {
  readonly entries: Set<object>;
}

const entriesBySession = new WeakMap<Electron.Session, SessionEntries>();

const closedError = () => new SewedError({ code: "Closed", message: "Download is closed" });
const limitError = () =>
  new SewedError({ code: "Limit", message: "The session has reached 128 active downloads" });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

const reserve = (nativeSession: Electron.Session): Reservation => {
  let state = entriesBySession.get(nativeSession);
  if (state === undefined) {
    state = { entries: new Set() };
    entriesBySession.set(nativeSession, state);
  }
  if (state.entries.size >= maximumEntries) throw limitError();
  const token = {};
  state.entries.add(token);
  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      state?.entries.delete(token);
    },
  };
};

const initialState: Download.State = {
  status: "pending",
  receivedBytes: 0,
  totalBytes: 0,
  percent: 0,
  currentBytesPerSecond: 0,
  canResume: false,
  paused: false,
};

class Resource {
  readonly view: WebContentsView;
  readonly contents: Electron.WebContents;
  private readonly nativeSession: Electron.Session;
  private readonly options: Download.Options;
  private readonly updates: PubSub.PubSub<Update>;
  private readonly done: Deferred.Deferred<Download.Outcome, SewedError>;
  private readonly reservation: Reservation;
  private state: Download.State = initialState;
  private item: Electron.DownloadItem | undefined;
  private terminal: Download.Outcome | undefined;
  private closed = false;
  private cancelRequested = false;
  private pendingCancellation = false;
  private listenerInstalled = false;
  private streamEnded = false;
  private failure: SewedError | undefined;
  private cleanupFailure: SewedError | undefined;
  private cleanupPromise: Promise<void> | undefined;

  constructor(
    nativeSession: Electron.Session,
    options: Download.Options,
    updates: PubSub.PubSub<Update>,
    done: Deferred.Deferred<Download.Outcome, SewedError>,
    reservation: Reservation,
  ) {
    this.nativeSession = nativeSession;
    this.options = options;
    this.updates = updates;
    this.done = done;
    this.reservation = reservation;
    this.view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: nativeSession,
      },
    });
    this.contents = this.view.webContents;
  }

  private readonly onWillDownload = (
    event: Electron.Event,
    item: Electron.DownloadItem,
    contents: Electron.WebContents,
  ) => {
    if (contents !== this.contents) return;
    if (this.closed || this.cancelRequested || this.item !== undefined) {
      event.preventDefault();
      this.noteCleanupFailure(this.cancelNativeItem(item));
      return;
    }
    this.item = item;
    try {
      item.setSavePath(this.options.savePath);
      item.on("updated", this.onUpdated);
      item.once("done", this.onDone);
      this.publish(this.readItemState("progressing"));
      if (this.cancelRequested) item.cancel();
    } catch (cause) {
      event.preventDefault();
      this.noteCleanupFailure(this.cancelNativeItem(item));
      this.fail(nativeError("Could not configure download item", cause));
    }
  };

  private readonly onUpdated = (_event: Electron.Event, state: "progressing" | "interrupted") => {
    if (
      this.item === undefined ||
      this.terminal !== undefined ||
      this.failure !== undefined ||
      this.closed
    )
      return;
    try {
      this.publish(this.readItemState(state));
    } catch (cause) {
      this.fail(nativeError("Could not read download progress", cause));
    }
  };

  private readonly onDone = (
    _event: Electron.Event,
    state: "completed" | "cancelled" | "interrupted",
  ) => {
    if (
      this.item === undefined ||
      this.terminal !== undefined ||
      this.failure !== undefined ||
      this.closed
    )
      return;
    this.finish({ kind: state });
  };

  private cancelNativeItem(item: Electron.DownloadItem): SewedError | undefined {
    try {
      item.cancel();
      return undefined;
    } catch (cause) {
      return nativeError("Could not cancel download item", cause);
    }
  }

  private noteCleanupFailure(error: SewedError | undefined): void {
    if (error !== undefined && this.cleanupFailure === undefined) this.cleanupFailure = error;
  }

  private readItemState(phase: "progressing" | "interrupted"): Download.State {
    const item = this.item;
    if (item === undefined) {
      return {
        status: "active",
        phase,
        receivedBytes: this.state.receivedBytes,
        totalBytes: this.state.totalBytes,
        percent: this.state.percent,
        currentBytesPerSecond: this.state.currentBytesPerSecond,
        canResume: this.state.canResume,
        paused: this.state.paused,
      };
    }
    return {
      status: "active",
      phase,
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      percent: item.getPercentComplete(),
      currentBytesPerSecond: item.getCurrentBytesPerSecond(),
      canResume: item.canResume(),
      paused: item.isPaused(),
    };
  }

  private terminalState(outcome: Download.Outcome): Download.State {
    const item = this.item;
    return {
      status: "terminal",
      outcome: outcome.kind,
      receivedBytes: item?.getReceivedBytes() ?? this.state.receivedBytes,
      totalBytes: item?.getTotalBytes() ?? this.state.totalBytes,
      percent: item?.getPercentComplete() ?? this.state.percent,
      currentBytesPerSecond: item?.getCurrentBytesPerSecond() ?? this.state.currentBytesPerSecond,
      canResume: item?.canResume() ?? this.state.canResume,
      paused: item?.isPaused() ?? this.state.paused,
    };
  }

  private publish(state: Download.State): void {
    this.state = state;
    PubSub.publishUnsafe(this.updates, [state]);
  }

  private finish(outcome: Download.Outcome): void {
    if (this.terminal !== undefined || this.failure !== undefined) return;
    const state = (() => {
      try {
        return this.terminalState(outcome);
      } catch (cause) {
        this.fail(nativeError("Could not read completed download state", cause));
        return undefined;
      }
    })();
    if (state === undefined) return;
    this.terminal = outcome;
    this.publish(state);
    Deferred.doneUnsafe(this.done, Effect.succeed(outcome));
    this.endStream();
    void this.disposeObserved();
  }

  private fail(error: SewedError): void {
    if (this.terminal !== undefined || this.failure !== undefined) return;
    this.failure = error;
    this.cancelRequested = true;
    if (this.item !== undefined) this.noteCleanupFailure(this.cancelNativeItem(this.item));
    else this.pendingCancellation = true;
    Deferred.doneUnsafe(this.done, Effect.fail(error));
    PubSub.publishUnsafe(this.updates, Exit.fail(error));
    this.streamEnded = true;
    void this.disposeObserved();
  }

  private endStream(): void {
    if (this.streamEnded) return;
    this.streamEnded = true;
    PubSub.publishUnsafe(this.updates, Exit.succeed(undefined));
  }

  private async disposeNative(): Promise<void> {
    if (this.cleanupPromise !== undefined) return this.cleanupPromise;
    this.cleanupPromise = (async () => {
      const destroyed = this.contents.isDestroyed()
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            this.contents.once("destroyed", resolve);
          });
      if (!(this.pendingCancellation && !this.contents.isDestroyed())) {
        if (this.listenerInstalled) {
          this.nativeSession.off("will-download", this.onWillDownload);
          this.listenerInstalled = false;
        }
      }
      if (!this.contents.isDestroyed()) {
        this.contents.close();
      }
      await destroyed;
      if (this.listenerInstalled) {
        this.nativeSession.off("will-download", this.onWillDownload);
        this.listenerInstalled = false;
      }
      this.reservation.release();
    })();
    return this.cleanupPromise;
  }

  private async disposeObserved(): Promise<void> {
    try {
      await this.disposeNative();
    } catch (cause) {
      this.noteCleanupFailure(
        cause instanceof SewedError
          ? cause
          : nativeError("Could not clean up download contents", cause),
      );
    }
  }

  open(): void {
    this.nativeSession.on("will-download", this.onWillDownload);
    this.listenerInstalled = true;
    if (this.options.headers === undefined) this.contents.downloadURL(this.options.url);
    else this.contents.downloadURL(this.options.url, { headers: this.options.headers });
  }

  async close(): Promise<void> {
    if (this.closed) {
      try {
        await this.disposeNative();
      } catch (cause) {
        this.noteCleanupFailure(
          cause instanceof SewedError
            ? cause
            : nativeError("Could not clean up download contents", cause),
        );
      }
      if (this.cleanupFailure !== undefined) throw this.cleanupFailure;
      return;
    }
    this.closed = true;
    this.cancelRequested = true;
    this.pendingCancellation = this.item === undefined;
    if (this.item !== undefined && this.terminal === undefined && this.failure === undefined) {
      this.noteCleanupFailure(this.cancelNativeItem(this.item));
    }
    if (this.terminal === undefined && this.failure === undefined) {
      Deferred.doneUnsafe(this.done, Effect.fail(closedError()));
      this.endStream();
    }
    try {
      await this.disposeNative();
    } catch (cause) {
      this.noteCleanupFailure(
        cause instanceof SewedError
          ? cause
          : nativeError("Could not clean up download contents", cause),
      );
    }
    if (this.cleanupFailure !== undefined) throw this.cleanupFailure;
  }

  cancel(): Promise<void> {
    if (this.closed || this.terminal !== undefined || this.failure !== undefined)
      return Promise.resolve();
    this.cancelRequested = true;
    if (this.item === undefined) {
      this.pendingCancellation = true;
      this.finish({ kind: "cancelled" });
      return this.disposeNative();
    }
    try {
      this.item.cancel();
    } catch (cause) {
      const error = nativeError("Could not cancel download", cause);
      this.fail(error);
      return Promise.reject(error);
    }
    return Promise.resolve();
  }

  private checkOpen(): void {
    if (this.closed) throw closedError();
    if (this.failure !== undefined) throw this.failure;
  }

  private checkActive(): void {
    this.checkOpen();
    if (this.terminal !== undefined) throw closedError();
  }

  snapshot(): Download.State {
    this.checkOpen();
    return this.state;
  }

  pause(): void {
    this.checkActive();
    if (this.item === undefined)
      throw nativeError("Download is not ready", new Error("The native download item is pending"));
    this.item.pause();
    this.publish(
      this.readItemState(
        this.state.status === "active" && this.state.phase === "interrupted"
          ? "interrupted"
          : "progressing",
      ),
    );
  }

  resume(): void {
    this.checkActive();
    if (this.item === undefined)
      throw nativeError("Download is not ready", new Error("The native download item is pending"));
    this.item.resume();
    this.publish(this.readItemState("progressing"));
  }

  awaitDone(): Effect.Effect<Download.Outcome, SewedError, MainContext> {
    return Effect.andThen(
      MainContext,
      Effect.suspend(() => {
        if (this.closed) return Effect.fail(closedError());
        return Deferred.await(this.done);
      }),
    );
  }

  progress(): Stream.Stream<Download.State, SewedError, MainContext> {
    const resource = this;
    return Stream.unwrap(
      Effect.gen(function* () {
        yield* MainContext;
        if (resource.closed) return Stream.fail(closedError());
        if (resource.failure !== undefined) return Stream.fail(resource.failure);
        if (resource.terminal !== undefined) return Stream.succeed(resource.state);
        const subscription: PubSub.Subscription<Update> = yield* PubSub.subscribe(resource.updates);
        yield* PubSub.takeUpTo(subscription, 2);
        if (resource.failure !== undefined) return Stream.fail(resource.failure);
        if (resource.closed) return Stream.empty;
        if (resource.terminal !== undefined) return Stream.succeed(resource.state);
        const snapshot = resource.state;
        const updates = Stream.fromChannel(Channel.fromEffectTake(PubSub.take(subscription)));
        return Stream.concat(Stream.succeed(snapshot), updates);
      }),
    );
  }

  handle(): Download.Handle {
    const operation = <A>(run: () => A): Effect.Effect<A, SewedError, MainContext> =>
      Effect.andThen(
        MainContext,
        Effect.try({
          try: () => {
            this.checkOpen();
            return run();
          },
          catch: (cause) =>
            cause instanceof SewedError ? cause : nativeError("Download operation failed", cause),
        }),
      );
    const cancel: Effect.Effect<void, SewedError, MainContext> = Effect.andThen(
      MainContext,
      Effect.tryPromise({
        try: () => this.cancel(),
        catch: (cause) => nativeError("Could not cancel download", cause),
      }),
    );
    return {
      snapshot: operation(() => this.snapshot()),
      progress: this.progress(),
      awaitDone: this.awaitDone(),
      pause: operation(() => this.pause()),
      resume: operation(() => this.resume()),
      cancel,
    };
  }
}

const validate = (options: Download.Options): Download.Options => {
  const value = decodeOptions(options);
  try {
    const url = new URL(value.url);
    if (url.protocol.length === 0) throw new Error("URL has no protocol");
  } catch (cause) {
    throw protocolError("Download URL must be absolute", cause);
  }
  if (!path.isAbsolute(value.savePath)) {
    throw protocolError("Download savePath must be absolute");
  }
  return value;
};

export const start = (
  session: SessionHandle,
  options: Download.Options,
): Effect.Effect<Download.Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const value = yield* Effect.try({
      try: () => validate(options),
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : protocolError("Could not validate download options", cause),
    });
    const nativeSession = yield* Effect.try({
      try: () => Session.resolve(session),
      catch: (cause) => nativeError("Could not resolve download session", cause),
    });
    const updates = yield* PubSub.sliding<Update>({ capacity: 2, replay: 2 });
    const done = yield* Deferred.make<Download.Outcome, SewedError>();
    PubSub.publishUnsafe(updates, [initialState]);
    const resource = yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          const reservation = reserve(nativeSession);
          try {
            return new Resource(nativeSession, value, updates, done, reservation);
          } catch (cause) {
            reservation.release();
            throw cause;
          }
        },
        catch: (cause) =>
          cause instanceof SewedError
            ? cause
            : nativeError("Could not create private download contents", cause),
      }),
      (owned) => Effect.promise(() => owned.close()),
    );
    yield* Effect.try({
      try: () => resource.open(),
      catch: (cause) => nativeError("Could not start download", cause),
    }).pipe(Effect.onError(() => Effect.promise(() => resource.close())));
    return resource.handle();
  });
