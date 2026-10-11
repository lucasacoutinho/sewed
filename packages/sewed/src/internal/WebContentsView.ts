import * as Handles from "./Handles.ts";
import { WebContentsView as NativeWebContentsView, session as nativeSession } from "electron";
import { Deferred, Effect, Exit, Schema, Scope } from "effect";
import { fileURLToPath } from "node:url";
import { generateInstanceId } from "../InstanceId.ts";
import type * as Public from "../WebContentsView.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as ContentsRegistry from "./ContentsRegistry.ts";
import * as Session from "./Session.ts";
import { type Attachable, register, type State, viewIdentity } from "./View.ts";
import { webContents } from "./WebContents.ts";
import { protocolError } from "./ProtocolError.ts";
import { decoded } from "./WebContentsCore.ts";

type Contents = Effect.Success<ReturnType<typeof webContents>>["contents"];

const decodeBoolean = Schema.decodeUnknownSync(Schema.Boolean);

const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

export interface Handle extends Attachable {
  readonly webContents: Contents;
  readonly close: Effect.Effect<void, SewedError, MainContext>;
  readonly awaitClosed: Effect.Effect<void, never, MainContext>;
}

export const make = (
  options: Public.Options = {},
): Effect.Effect<Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const { backgroundThrottling } = options;
    const throttling =
      backgroundThrottling === undefined
        ? undefined
        : yield* decoded("Invalid background throttling", () =>
            decodeBoolean(backgroundThrottling),
          );
    const parent = yield* Effect.scope;
    const lifetime = yield* Scope.fork(parent);
    const closed = yield* Deferred.make<void>();
    const native = yield* Effect.try({
      try: () => {
        if (options.cloneOf !== undefined) {
          // The clone's preferences are its original's, which this module fixed when it made it.
          if (options.session !== undefined || throttling !== undefined)
            throw protocolError(
              "A cloned view takes its session and preferences from its original",
            );
          const original = Handles.contentsOfView(options.cloneOf);
          if (original === undefined)
            throw protocolError("The view to clone is not a Sewed WebContentsView");
          if (original.isDestroyed())
            throw new SewedError({ code: "Closed", message: "The view to clone is closed" });
          return new NativeWebContentsView({ webContents: original.clone() });
        }
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
            ...(throttling === undefined ? {} : { backgroundThrottling: throttling }),
            session: Session.resolve(session),
          },
        });
      },
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : new SewedError({ code: "Native", message: "Could not create WebContentsView", cause }),
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
      // Native callbacks run their Effects with the services this program was given.
      const surrounding = yield* Effect.context<never>();
      const { contents } = yield* webContents(nativeContents).pipe(Scope.provide(lifetime));
      const state: State = {
        native,
        lifetime,
        isDestroyed: () => nativeContents.isDestroyed(),
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
        if (!state.scopeClosing) Effect.runForkWith(surrounding)(Scope.close(lifetime, Exit.void));
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
      const unregister = ContentsRegistry.register(nativeContents.id, id);
      yield* Scope.addFinalizer(lifetime, Effect.sync(unregister));
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
      register(handle, state);
      Handles.registerView(handle, nativeContents);
      yield* Scope.addFinalizer(
        lifetime,
        Effect.sync(Handles.contents.publish(id, contents, () => nativeContents.isDestroyed())),
      );
      if (nativeContents.isDestroyed()) onDestroyed();
      return handle;
    }).pipe(Effect.onError(() => Scope.close(lifetime, Exit.void)));
  });
