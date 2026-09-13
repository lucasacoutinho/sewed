import { WebContentsView as NativeWebContentsView, session as nativeSession } from "electron";
import { Deferred, Effect, Exit, Schema, Scope } from "effect";
import { fileURLToPath } from "node:url";
import { generateInstanceId } from "../InstanceId.ts";
import type * as Public from "../WebContentsView.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { Bounds as BoundsSchema } from "./Geometry.ts";
import * as Session from "./Session.ts";
import { webContents } from "./WebContents.ts";

type Bounds = typeof BoundsSchema.Type;

type Contents = Effect.Success<ReturnType<typeof webContents>>;

const viewIdentity: unique symbol = Symbol("sewed/WebContentsViewHandle");
const decodeBounds = Schema.decodeUnknownSync(BoundsSchema);
const decodeVisible = Schema.decodeUnknownSync(Schema.Boolean);

const closedError = (message: string) => new SewedError({ code: "Closed", message });
const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

export interface Handle {
  readonly [viewIdentity]: true;
  readonly id: string;
  readonly webContents: Contents;
  readonly close: Effect.Effect<void, SewedError, MainContext>;
  readonly awaitClosed: Effect.Effect<void, never, MainContext>;
}

interface State {
  readonly native: NativeWebContentsView;
  readonly nativeContents: Electron.WebContents;
  readonly lifetime: Scope.Scope;
  closedFlag: boolean;
  scopeClosing: boolean;
  attachment: Attachment | undefined;
}

export interface Attachment {
  readonly setBounds: (bounds: Bounds) => Effect.Effect<void, SewedError, MainContext>;
  readonly setVisible: (visible: boolean) => Effect.Effect<void, SewedError, MainContext>;
  readonly detach: Effect.Effect<void, SewedError, MainContext>;
  readonly detachNative: () => void;
  readonly closeView: () => Effect.Effect<void, never, never>;
}

const states = new WeakMap<Handle, State>();

const stateOf = (handle: Handle): State => {
  const state = states.get(handle);
  if (state === undefined) throw protocolError("Web contents view was not created by Sewed");
  return state;
};

const decodeAttachmentBounds = (bounds: Bounds): Bounds => {
  try {
    return decodeBounds(bounds);
  } catch (cause) {
    throw protocolError("Invalid WebContentsView bounds", cause);
  }
};
const decodeAttachmentVisible = (visible: boolean): boolean => {
  try {
    return decodeVisible(visible);
  } catch (cause) {
    throw protocolError("Invalid WebContentsView visibility", cause);
  }
};

const operation = <A>(
  state: State,
  isCurrent: () => boolean,
  run: () => A,
): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: () => {
        if (
          state.closedFlag ||
          state.scopeClosing ||
          state.nativeContents.isDestroyed() ||
          !isCurrent()
        )
          throw closedError("Web contents view attachment is closed");
        return run();
      },
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : nativeError("Web contents view attachment operation failed", cause),
    }),
  );

export const attach = (
  handle: Handle,
  parent: Electron.BaseWindow,
  bounds: Bounds,
  visible: boolean,
  onDetached: () => void,
): Effect.Effect<Attachment, SewedError, MainContext> =>
  Effect.gen(function* () {
    yield* MainContext;
    const state = yield* Effect.try({
      try: () => stateOf(handle),
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : protocolError("Could not resolve WebContentsView handle", cause),
    });
    const nextBounds = yield* Effect.try({
      try: () => decodeAttachmentBounds(bounds),
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : protocolError("Invalid WebContentsView bounds", cause),
    });
    const nextVisible = yield* Effect.try({
      try: () => decodeAttachmentVisible(visible),
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : protocolError("Invalid WebContentsView visibility", cause),
    });
    if (state.closedFlag || state.scopeClosing || state.nativeContents.isDestroyed())
      return yield* Effect.fail(closedError("Web contents view is closed"));
    if (state.attachment !== undefined)
      return yield* Effect.fail(protocolError("Web contents view is already attached to a window"));
    if (parent.isDestroyed()) return yield* Effect.fail(closedError("Window is closed"));

    const parentView = parent.contentView;
    let detached = false;
    const detachNative = () => {
      if (detached) return;
      detached = true;
      let failure: unknown;
      try {
        if (!parent.isDestroyed()) parentView.removeChildView(state.native);
      } catch (cause) {
        failure = cause;
      } finally {
        if (state.attachment?.detachNative === detachNative) state.attachment = undefined;
        onDetached();
      }
      if (failure !== undefined) throw failure;
    };
    const isCurrent = () => !detached && state.attachment?.detachNative === detachNative;
    const closeView = () => Scope.close(state.lifetime, Exit.void);
    const record: Attachment = {
      setBounds: (value) =>
        operation(state, isCurrent, () => {
          state.native.setBounds(decodeAttachmentBounds(value));
        }),
      setVisible: (value) =>
        operation(state, isCurrent, () => {
          state.native.setVisible(decodeAttachmentVisible(value));
        }),
      detach: Effect.andThen(
        MainContext,
        Effect.try({
          try: detachNative,
          catch: (cause) => nativeError("Could not detach WebContentsView", cause),
        }),
      ),
      detachNative,
      closeView,
    };

    try {
      parentView.addChildView(state.native);
      state.native.setBounds(nextBounds);
      state.native.setVisible(nextVisible);
    } catch (cause) {
      try {
        detachNative();
      } catch {
        // The failed native operation is the primary error; the wrapper state is cleared above.
      }
      return yield* Effect.fail(nativeError("Could not attach WebContentsView", cause));
    }
    state.attachment = record;
    return record;
  });

export const make = (
  options: Public.Options = {},
): Effect.Effect<Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const parent = yield* Effect.scope;
    const lifetime = yield* Scope.fork(parent);
    const closed = yield* Deferred.make<void>();
    const native = yield* Effect.try({
      try: () => {
        const session =
          options.session === undefined
            ? Session.fromNative(nativeSession.defaultSession)
            : options.session;
        return new NativeWebContentsView({
          webPreferences: {
            preload: fileURLToPath(new URL("../preload.cjs", import.meta.url)),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            session: Session.resolve(session),
          },
        });
      },
      catch: (cause) =>
        new SewedError({ code: "Native", message: "Could not create WebContentsView", cause }),
    }).pipe(Effect.onError(() => Scope.close(lifetime, Exit.void)));
    const nativeContents = native.webContents;
    let cleanupPromise: Promise<void> | undefined;
    const closeNativeContents = (): Promise<void> => {
      const existing = cleanupPromise;
      if (existing !== undefined) return existing;
      if (nativeContents.isDestroyed()) return Promise.resolve();
      const promise = new Promise<void>((resolve, reject) => {
        const onDestroyed = () => {
          resolve();
        };
        nativeContents.once("destroyed", onDestroyed);
        try {
          nativeContents.close();
        } catch (cause) {
          nativeContents.off("destroyed", onDestroyed);
          reject(cause);
        }
      });
      let tracked: Promise<void>;
      tracked = promise.catch((cause) => {
        if (cleanupPromise === tracked) cleanupPromise = undefined;
        throw cause;
      });
      cleanupPromise = tracked;
      return tracked;
    };
    yield* Scope.addFinalizer(
      lifetime,
      Effect.promise(() => closeNativeContents()),
    );

    return yield* Effect.gen(function* () {
      const contents = yield* webContents(nativeContents).pipe(Scope.provide(lifetime));
      const state: State = {
        native,
        nativeContents,
        lifetime,
        closedFlag: false,
        scopeClosing: false,
        attachment: undefined,
      };
      const onDestroyed = () => {
        if (state.closedFlag) return;
        state.closedFlag = true;
        const attachment = state.attachment;
        if (attachment !== undefined) {
          try {
            attachment.detachNative();
          } catch {
            // The WebContents is already destroyed; the wrapper state still must be cleared.
          }
        }
        Deferred.doneUnsafe(closed, Effect.void);
        if (!state.scopeClosing) Effect.runFork(Scope.close(lifetime, Exit.void));
      };
      nativeContents.once("destroyed", onDestroyed);
      yield* Scope.addFinalizer(
        lifetime,
        Effect.ensuring(
          Effect.sync(() => {
            state.scopeClosing = true;
            const attachment = state.attachment;
            if (attachment !== undefined) {
              try {
                attachment.detachNative();
              } catch {
                // The state is cleared in detachNative's finally block; native cleanup still runs.
              }
            }
          }),
          Effect.sync(() => {
            if (nativeContents.isDestroyed()) nativeContents.off("destroyed", onDestroyed);
          }),
        ),
      );
      const id = yield* generateInstanceId();
      const handle: Handle = {
        [viewIdentity]: true,
        id,
        webContents: contents,
        close: Effect.gen(function* () {
          yield* MainContext;
          yield* Effect.tryPromise({
            try: () => closeNativeContents(),
            catch: (cause) => nativeError("Could not close WebContentsView", cause),
          });
          yield* Scope.close(lifetime, Exit.void);
        }),
        awaitClosed: Effect.andThen(MainContext, Deferred.await(closed)),
      };
      states.set(handle, state);
      if (nativeContents.isDestroyed()) onDestroyed();
      return handle;
    }).pipe(Effect.onError(() => Scope.close(lifetime, Exit.void)));
  });
