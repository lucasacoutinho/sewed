import type { EventEmitter } from "node:events";
import type { BaseWindow as NativeBaseWindow, WebContents as NativeWebContents } from "electron";
import { Cause, Deferred, Effect, Exit, PubSub, Schema, Scope, Stream } from "effect";
import type { Bounds } from "./Geometry.ts";
import { Bounds as BoundsSchema } from "./Geometry.ts";
import { generateInstanceId } from "../InstanceId.ts";
import { host } from "../Host.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as CloseGate from "./CloseGate.ts";
import * as WebContentsView from "./WebContentsView.ts";
import * as WindowControls from "../WindowControls.ts";
import { webContents } from "./WebContents.ts";

type Contents = Effect.Success<ReturnType<typeof webContents>>;

export interface AttachOptions {
  readonly bounds: Bounds;
  readonly visible?: boolean;
}

const decodeAttachOptions = Schema.decodeUnknownSync(
  Schema.Struct({
    bounds: BoundsSchema,
    visible: Schema.optionalKey(Schema.Boolean),
  }),
);
const decodeBounds = Schema.decodeUnknownSync(WindowControls.BoundsUpdate);
const decodeFullScreen = Schema.decodeUnknownSync(Schema.Boolean);

const closedError = (message: string) => new SewedError({ code: "Closed", message });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

export const make = (native: NativeBaseWindow, primary?: NativeWebContents) =>
  Effect.gen(function* () {
    yield* MainContext;
    const parent = yield* Effect.scope;
    const lifetime = yield* Scope.fork(parent);
    const closed = yield* Deferred.make<void>();
    yield* Scope.addFinalizer(
      lifetime,
      Effect.sync(() => {
        if (!native.isDestroyed()) native.destroy();
      }),
    );
    return yield* Effect.gen(function* () {
      const contents =
        primary === undefined
          ? undefined
          : yield* webContents(primary).pipe(Scope.provide(lifetime));
      interface ActiveAttachment {
        readonly native: WebContentsView.Attachment;
        readonly scope: Scope.Scope;
      }
      const attachments = new Set<ActiveAttachment>();
      let windowClosed = false;
      let approvedClose = false;
      let closing = false;

      const closeAttachments = () =>
        Effect.gen(function* () {
          let failure: Cause.Cause<never> = Cause.empty;
          for (const attachment of [...attachments]) {
            const result = yield* Effect.exit(
              Effect.ensuring(
                attachment.native.closeView(),
                Scope.close(attachment.scope, Exit.void),
              ),
            );
            if (result._tag === "Failure") failure = Cause.combine(failure, result.cause);
          }
          if (failure.reasons.length > 0) yield* Effect.failCause(failure);
        });

      const approveClose = () => {
        if (closing || windowClosed || native.isDestroyed()) return;
        closing = true;
        Effect.runFork(
          Effect.sync(() => {
            try {
              if (!native.isDestroyed()) {
                approvedClose = true;
                native.close();
              }
            } finally {
              approvedClose = false;
              closing = false;
            }
          }),
        );
      };
      const gate = CloseGate.make(approveClose);
      const onClosed = () => {
        if (windowClosed) return;
        windowClosed = true;
        Effect.runFork(Scope.close(lifetime, Exit.void));
      };
      const onClose = (event: Electron.Event) => {
        if (approvedClose || windowClosed) return;
        event.preventDefault();
        gate.request();
      };
      native.on("close", onClose);
      native.once("closed", onClosed);

      yield* Scope.addFinalizer(
        lifetime,
        Effect.ensuring(
          Effect.gen(function* () {
            windowClosed = true;
            yield* closeAttachments();
          }),
          Effect.gen(function* () {
            native.off("close", onClose);
            yield* gate.close();
            if (!native.isDestroyed()) {
              approvedClose = true;
              try {
                native.destroy();
              } finally {
                approvedClose = false;
              }
            }
            native.off("closed", onClosed);
            if (native.isDestroyed()) Deferred.doneUnsafe(closed, Effect.void);
          }),
        ),
      );

      const operation = <A>(run: () => A): Effect.Effect<A, SewedError, MainContext> =>
        Effect.andThen(
          MainContext,
          Effect.try({
            try: () => {
              if (windowClosed || native.isDestroyed()) throw closedError("Window is closed");
              return run();
            },
            catch: (cause) =>
              cause instanceof SewedError ? cause : nativeError("Window operation failed", cause),
          }),
        );
      const readState = (): WindowControls.State => ({
        bounds: native.getBounds(),
        normalBounds: native.getNormalBounds(),
        visible: native.isVisible(),
        focused: native.isFocused(),
        minimized: native.isMinimized(),
        maximized: native.isMaximized(),
        fullScreen: native.isFullScreen(),
      });
      const state = yield* PubSub.sliding<WindowControls.State>({ capacity: 2, replay: 1 });
      const update = () => {
        if (!windowClosed && !native.isDestroyed())
          Effect.runSync(PubSub.publish(state, readState()));
      };
      update();
      const events = [
        "show",
        "hide",
        "focus",
        "blur",
        "move",
        "resize",
        "minimize",
        "restore",
        "maximize",
        "unmaximize",
        "enter-full-screen",
        "leave-full-screen",
      ] as const;
      const emitter: EventEmitter = native;
      for (const event of events) emitter.on(event, update);
      yield* Scope.addFinalizer(
        lifetime,
        Effect.sync(() => {
          for (const event of events) emitter.off(event, update);
        }),
      );

      const show = operation(() => {
        native.show();
      });
      const showInactive = operation(() => {
        native.showInactive();
      });
      const hide = operation(() => {
        native.hide();
      });
      const focus = operation(() => {
        native.focus();
      });
      const setBounds = (bounds: WindowControls.BoundsUpdate) =>
        operation(() => {
          native.setBounds(decodeBounds(bounds));
        });
      const setFullScreen = (fullScreen: boolean) =>
        operation(() => {
          native.setFullScreen(decodeFullScreen(fullScreen));
        });
      const minimize = operation(() => {
        native.minimize();
      });
      const maximize = operation(() => {
        native.maximize();
      });
      const restore = operation(() => {
        native.restore();
        native.unmaximize();
      });
      const close = operation(() => {
        native.close();
      });
      const changes = Stream.unwrap(Effect.as(MainContext, Stream.fromPubSub(state))).pipe(
        Stream.interruptWhen(Deferred.await(closed)),
      );
      const withContents = <A, E, R>(
        run: (contents: Contents) => Effect.Effect<A, E, R>,
      ): Effect.Effect<A, E | SewedError, R> =>
        contents === undefined
          ? Effect.fail(protocolError("Window has no web contents"))
          : run(contents);
      const contentsStream = <A, E, R>(
        run: (contents: Contents) => Stream.Stream<A, E, R>,
      ): Stream.Stream<A, E | SewedError, R> =>
        contents === undefined
          ? Stream.fail(protocolError("Window has no web contents"))
          : run(contents);
      const controls = yield* host(
        WindowControls.protocol,
        WindowControls.protocol.toLayer({
          show: () => show,
          showInactive: () => showInactive,
          hide: () => hide,
          focus: () => focus,
          setBounds,
          setFullScreen: ({ fullScreen }) => setFullScreen(fullScreen),
          minimize: () => minimize,
          maximize: () => maximize,
          restore: () => restore,
          close: () => close,
          state: () => operation(readState),
          changes: () => changes,
          zoom: () => contentsStream((web) => web.zoom),
          setZoom: ({ factor }) => withContents((web) => web.setZoom(factor)),
          audio: () => contentsStream((web) => web.audio),
          setAudioMuted: ({ muted }) => withContents((web) => web.setAudioMuted(muted)),
          history: () => contentsStream((web) => web.history),
          back: () => withContents((web) => web.back),
          forward: () => withContents((web) => web.forward),
          find: ({ text, options }) =>
            contentsStream((web) =>
              Stream.scoped(
                Stream.unwrap(
                  Effect.map(web.find(text, options ?? {}), (search) => search.results),
                ),
              ),
            ),
          findNext: ({ forward }) => withContents((web) => web.findNext(forward)),
          stopFind: ({ action }) => withContents((web) => web.stopFind(action)),
        }),
      ).pipe(Scope.provide(lifetime));

      const attach = (view: WebContentsView.Handle, options: AttachOptions) =>
        Effect.gen(function* () {
          yield* MainContext;
          const caller = yield* Effect.scope;
          const settings = yield* Effect.try({
            try: () => decodeAttachOptions(options),
            catch: (cause) => protocolError("Invalid WebContentsView attachment", cause),
          });
          if (windowClosed || native.isDestroyed())
            return yield* Effect.fail(closedError("Window is closed"));
          const attachmentScope = yield* Scope.fork(caller);
          return yield* Effect.gen(function* () {
            let attached: ActiveAttachment | undefined;
            let attachmentScopeClosing = false;
            const nativeAttachment = yield* WebContentsView.attach(
              view,
              native,
              settings.bounds,
              settings.visible ?? true,
              () => {
                if (attached !== undefined) {
                  attachments.delete(attached);
                  if (!attachmentScopeClosing)
                    Effect.runFork(Scope.close(attachmentScope, Exit.void));
                }
              },
            );
            attached = { native: nativeAttachment, scope: attachmentScope };
            attachments.add(attached);
            yield* Scope.addFinalizer(
              attachmentScope,
              Effect.sync(() => {
                attachmentScopeClosing = true;
                try {
                  nativeAttachment.detachNative();
                } finally {
                  attachmentScopeClosing = false;
                }
              }),
            );
            const {
              detachNative: _detachNative,
              closeView: _closeView,
              detach: _nativeDetach,
              ...publicAttachment
            } = nativeAttachment;
            return {
              ...publicAttachment,
              detach: Effect.ensuring(
                nativeAttachment.detach,
                Scope.close(attachmentScope, Exit.void),
              ),
            };
          }).pipe(Effect.onError(() => Scope.close(attachmentScope, Exit.void)));
        });

      return {
        native,
        closed,
        webContents: contents,
        id: yield* generateInstanceId(),
        controls,
        show,
        showInactive,
        hide,
        focus,
        setBounds,
        setFullScreen,
        minimize,
        maximize,
        restore,
        close,
        guardClose: <R>(decision: Effect.Effect<boolean, never, R>) =>
          Effect.andThen(MainContext, gate.guard(decision)),
        state: changes,
        awaitClosed: Effect.andThen(MainContext, Deferred.await(closed)),
        attach,
      };
    }).pipe(Effect.onError(() => Scope.close(lifetime, Exit.void)));
  });

export type Handle = Effect.Success<ReturnType<typeof make>>;

export const toPublic = <
  T extends {
    readonly native: NativeBaseWindow;
    readonly closed: Deferred.Deferred<void>;
    readonly webContents: unknown;
  },
>(
  handle: T,
): Omit<T, "native" | "closed" | "webContents"> => {
  const { native: _native, closed: _closed, webContents: _webContents, ...publicHandle } = handle;
  return publicHandle;
};
