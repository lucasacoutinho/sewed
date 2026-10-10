import type { View as NativeView } from "electron";
import { Cause, Deferred, Effect, Exit, Schema, Scope } from "effect";
import { generateInstanceId } from "../InstanceId.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { Bounds as BoundsSchema } from "./Geometry.ts";

type Bounds = BoundsSchema;

export const viewIdentity: unique symbol = Symbol("sewed/ViewHandle");

/** Any Sewed view handle; windows and container views attach these. */
export interface Attachable {
  readonly [viewIdentity]: true;
  readonly id: string;
}

export interface AttachOptions {
  readonly bounds: Bounds;
  readonly visible?: boolean;
}

/** One-shot: `attachment.current`'s own answer, read fresh from the native view at the callback. */
export interface AttachmentSnapshot {
  readonly bounds: Bounds;
  readonly visible: boolean;
}

export interface Attachment {
  /** `getBounds`/`getVisible` answer synchronously (`.artifacts/probe-wave-5/raise.mjs`), so this
   * is a fresh read, not a cached one — the same shape `internal/Window.ts`'s own `current` reads
   * through `readState`. */
  readonly current: Effect.Effect<AttachmentSnapshot, SewedError, MainContext>;
  readonly setBounds: (bounds: Bounds) => Effect.Effect<void, SewedError, MainContext>;
  readonly setVisible: (visible: boolean) => Effect.Effect<void, SewedError, MainContext>;
  /**
   * Draws this attachment above its siblings. `.artifacts/probe-wave-5/children-order.mjs` proves
   * a repeated `addChildView` on an already-attached view reorders it to the topmost position —
   * Electron's own doc comment on the method says as much — so this is the one native call, not a
   * remove-then-add: an index would lie the moment another attachment moves, and this can't.
   */
  readonly raise: Effect.Effect<void, SewedError, MainContext>;
  readonly detach: Effect.Effect<void, SewedError, MainContext>;
}

interface NativeAttachment extends Attachment {
  readonly detachNative: () => void;
  readonly closeView: () => Effect.Effect<void, never, never>;
}

/** Private state behind every view handle; `isDestroyed` reports the native object's own death. */
export interface State {
  readonly native: NativeView;
  readonly lifetime: Scope.Closeable;
  readonly isDestroyed: () => boolean;
  closedFlag: boolean;
  scopeClosing: boolean;
  attachment: NativeAttachment | undefined;
}

const states = new WeakMap<object, State>();
export const register = (handle: Attachable, state: State): void => {
  states.set(handle, state);
};

const decodeBounds = Schema.decodeUnknownSync(BoundsSchema);
const decodeVisible = Schema.decodeUnknownSync(Schema.Boolean);
const decodeAttachOptions = Schema.decodeUnknownSync(
  Schema.Struct({ bounds: BoundsSchema, visible: Schema.optionalKey(Schema.Boolean) }),
);

const closedError = (message: string) => new SewedError({ code: "Closed", message });
const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

const stateOf = (handle: Attachable): State => {
  const state = states.get(handle);
  if (state === undefined) throw protocolError("View was not created by Sewed");
  return state;
};
const attachmentBounds = (bounds: Bounds): Bounds => {
  try {
    return decodeBounds(bounds);
  } catch (cause) {
    throw protocolError("Invalid view bounds", cause);
  }
};
const attachmentVisible = (visible: boolean): boolean => {
  try {
    return decodeVisible(visible);
  } catch (cause) {
    throw protocolError("Invalid view visibility", cause);
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
        if (state.closedFlag || state.scopeClosing || state.isDestroyed() || !isCurrent())
          throw closedError("View attachment is closed");
        return run();
      },
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : nativeError("View attachment operation failed", cause),
    }),
  );

/** Adds a view under a native parent view; the returned record detaches or closes it. */
const attachNative = (
  handle: Attachable,
  parentView: NativeView,
  parentState: () => ParentState,
  bounds: Bounds,
  visible: boolean,
  onDetached: () => void,
): Effect.Effect<NativeAttachment, SewedError, MainContext> =>
  Effect.gen(function* () {
    yield* MainContext;
    const state = yield* Effect.try({
      try: () => stateOf(handle),
      catch: (cause) =>
        cause instanceof SewedError ? cause : protocolError("Could not resolve view handle", cause),
    });
    const nextBounds = yield* Effect.try({
      try: () => attachmentBounds(bounds),
      catch: (cause) =>
        cause instanceof SewedError ? cause : protocolError("Invalid view bounds", cause),
    });
    const nextVisible = yield* Effect.try({
      try: () => attachmentVisible(visible),
      catch: (cause) =>
        cause instanceof SewedError ? cause : protocolError("Invalid view visibility", cause),
    });
    if (state.closedFlag || state.scopeClosing || state.isDestroyed())
      return yield* closedError("View is closed");
    if (state.attachment !== undefined)
      return yield* protocolError("View is already attached to a parent");
    if (parentState() !== "open") return yield* closedError("Parent is closed");

    let detached = false;
    const detachNative = () => {
      if (detached) return;
      detached = true;
      let failure: unknown;
      try {
        if (parentState() !== "destroyed") parentView.removeChildView(state.native);
      } catch (cause) {
        failure = cause;
      } finally {
        if (state.attachment?.detachNative === detachNative) state.attachment = undefined;
        onDetached();
      }
      if (failure !== undefined) throw failure;
    };
    const isCurrent = () =>
      !detached && parentState() === "open" && state.attachment?.detachNative === detachNative;
    const record: NativeAttachment = {
      current: operation(state, isCurrent, (): AttachmentSnapshot => ({
        bounds: state.native.getBounds(),
        visible: state.native.getVisible(),
      })),
      setBounds: (value) =>
        operation(state, isCurrent, () => {
          state.native.setBounds(attachmentBounds(value));
        }),
      setVisible: (value) =>
        operation(state, isCurrent, () => {
          state.native.setVisible(attachmentVisible(value));
        }),
      raise: operation(state, isCurrent, () => {
        parentView.addChildView(state.native);
      }),
      detach: Effect.andThen(
        MainContext,
        Effect.try({
          try: detachNative,
          catch: (cause) => nativeError("Could not detach view", cause),
        }),
      ),
      detachNative,
      closeView: () => Scope.close(state.lifetime, Exit.void),
    };
    // Native calls that throw synchronously, adapted here at the runtime edge.
    // @effect-diagnostics-next-line tryCatchInEffectGen:off
    try {
      parentView.addChildView(state.native);
      state.native.setBounds(nextBounds);
      state.native.setVisible(nextVisible);
    } catch (cause) {
      // @effect-diagnostics-next-line tryCatchInEffectGen:off
      try {
        detachNative();
      } catch {
        // The failed native operation is the primary error; the wrapper state is cleared above.
      }
      return yield* nativeError("Could not attach view", cause);
    }
    state.attachment = record;
    return record;
  });

/**
 * Where a parent stands: `closed` takes no new attachment but still has a native view to detach
 * children from; `destroyed` has none left to touch.
 */
export type ParentState = "open" | "closed" | "destroyed";

/** Owns the attachments of one parent: caller scopes detach, parent closure closes the views. */
export const makeParent = (parent: {
  readonly view: () => NativeView;
  readonly state: () => ParentState;
}) => {
  interface Active {
    readonly native: NativeAttachment;
    readonly scope: Scope.Closeable;
  }
  const attachments = new Set<Active>();
  const closeAll = Effect.gen(function* () {
    let failure: Cause.Cause<never> = Cause.empty;
    for (const attachment of [...attachments]) {
      const result = yield* Effect.exit(
        Effect.ensuring(attachment.native.closeView(), Scope.close(attachment.scope, Exit.void)),
      );
      if (result._tag === "Failure") failure = Cause.combine(failure, result.cause);
    }
    if (failure.reasons.length > 0) return yield* Effect.failCause(failure);
  });
  const attach = (
    view: Attachable,
    options: AttachOptions,
  ): Effect.Effect<Attachment, SewedError, MainContext | Scope.Scope> =>
    Effect.gen(function* () {
      yield* MainContext;
      const caller = yield* Effect.scope;
      const settings = yield* Effect.try({
        try: () => decodeAttachOptions(options),
        catch: (cause) => protocolError("Invalid view attachment", cause),
      });
      if (parent.state() !== "open") return yield* closedError("Parent is closed");
      const attachmentScope = yield* Scope.fork(caller);
      return yield* Effect.gen(function* () {
        // Native callbacks run their Effects with the services this program was given.
        const surrounding = yield* Effect.context<never>();
        let attached: Active | undefined;
        let attachmentScopeClosing = false;
        const native = yield* attachNative(
          view,
          parent.view(),
          parent.state,
          settings.bounds,
          settings.visible ?? true,
          () => {
            if (attached !== undefined) {
              attachments.delete(attached);
              if (!attachmentScopeClosing)
                Effect.runForkWith(surrounding)(Scope.close(attachmentScope, Exit.void));
            }
          },
        );
        attached = { native, scope: attachmentScope };
        attachments.add(attached);
        yield* Scope.addFinalizer(
          attachmentScope,
          Effect.sync(() => {
            attachmentScopeClosing = true;
            try {
              native.detachNative();
            } finally {
              attachmentScopeClosing = false;
            }
          }),
        );
        const attachment: Attachment = {
          current: native.current,
          setBounds: native.setBounds,
          setVisible: native.setVisible,
          raise: native.raise,
          detach: Effect.ensuring(native.detach, Scope.close(attachmentScope, Exit.void)),
        };
        return attachment;
      }).pipe(Effect.onError(() => Scope.close(attachmentScope, Exit.void)));
    });
  return { attach, closeAll };
};

/** Shared lifecycle for plain views: a scope, a closed flag, and detachment on close. */
export const lifecycle = <N extends NativeView>(native: N, isDestroyed: () => boolean) =>
  Effect.gen(function* () {
    yield* MainContext;
    const parent = yield* Effect.scope;
    const lifetime = yield* Scope.fork(parent);
    const closed = yield* Deferred.make<void>();
    const state: State = {
      native,
      lifetime,
      isDestroyed,
      closedFlag: false,
      scopeClosing: false,
      attachment: undefined,
    };
    const id = yield* generateInstanceId();
    yield* Scope.addFinalizer(
      lifetime,
      Effect.sync(() => {
        state.scopeClosing = true;
        const attachment = state.attachment;
        if (attachment !== undefined) {
          try {
            attachment.detachNative();
          } catch {
            // The state is cleared in detachNative's finally block; the view still closes.
          }
        }
        state.closedFlag = true;
        Deferred.doneUnsafe(closed, Effect.void);
      }),
    );
    const operation = <A>(run: () => A): Effect.Effect<A, SewedError, MainContext> =>
      Effect.andThen(
        MainContext,
        Effect.try({
          try: () => {
            if (state.closedFlag || state.scopeClosing) throw closedError("View is closed");
            return run();
          },
          catch: (cause) =>
            cause instanceof SewedError ? cause : nativeError("View operation failed", cause),
        }),
      );
    return {
      id,
      state,
      lifetime,
      operation,
      close: Effect.andThen(MainContext, Scope.close(lifetime, Exit.void)),
      awaitClosed: Effect.andThen(MainContext, Deferred.await(closed)),
    };
  });

const decodeColor = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
const decodeRadius = Schema.decodeUnknownSync(
  Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
);
const decodeOptions = Schema.decodeUnknownSync(
  Schema.Struct({
    backgroundColor: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
    borderRadius: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
    visible: Schema.optionalKey(Schema.Boolean),
  }),
);

export interface Options {
  readonly backgroundColor?: string;
  readonly borderRadius?: number;
  readonly visible?: boolean;
}

/** A container view: it attaches child views and is itself attachable. */
export interface Handle extends Attachable {
  readonly attach: (
    view: Attachable,
    options: AttachOptions,
  ) => Effect.Effect<Attachment, SewedError, MainContext | Scope.Scope>;
  readonly setBackgroundColor: (color: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly setBorderRadius: (radius: number) => Effect.Effect<void, SewedError, MainContext>;
  readonly setVisible: (visible: boolean) => Effect.Effect<void, SewedError, MainContext>;
  readonly close: Effect.Effect<void, never, MainContext>;
  readonly awaitClosed: Effect.Effect<void, never, MainContext>;
}

/**
 * Builds a container view's handle over an *already-constructed* native view: `View.make` (the
 * root module) is the only caller in production, and it is the one that does `new NativeView()`
 * — construction stays in the owning runtime, this module stays Electron-value-free, and a test
 * hands this a structural fake instead (`view.test.ts`).
 */
export const fromNative = (
  native: NativeView,
  options: Options = {},
): Effect.Effect<Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const settings = yield* Effect.try({
      try: () => decodeOptions(options),
      catch: (cause) => protocolError("Invalid view options", cause),
    });
    yield* Effect.try({
      try: () => {
        if (settings.backgroundColor !== undefined)
          native.setBackgroundColor(settings.backgroundColor);
        if (settings.borderRadius !== undefined) native.setBorderRadius(settings.borderRadius);
        if (settings.visible !== undefined) native.setVisible(settings.visible);
      },
      catch: (cause) => nativeError("Could not apply view options", cause),
    });
    const base = yield* lifecycle(native, () => false);
    const children = makeParent({
      view: () => native,
      state: () => (base.state.closedFlag || base.state.scopeClosing ? "closed" : "open"),
    });
    yield* Scope.addFinalizer(
      base.lifetime,
      Effect.sync(() => {
        base.state.scopeClosing = true;
      }).pipe(Effect.andThen(children.closeAll)),
    );
    const handle: Handle = {
      [viewIdentity]: true,
      id: base.id,
      attach: children.attach,
      setBackgroundColor: (color) =>
        base.operation(() => {
          native.setBackgroundColor(decodeColor(color));
        }),
      setBorderRadius: (radius) =>
        base.operation(() => {
          native.setBorderRadius(decodeRadius(radius));
        }),
      setVisible: (visible) =>
        base.operation(() => {
          native.setVisible(decodeVisible(visible));
        }),
      close: base.close,
      awaitClosed: base.awaitClosed,
    };
    register(handle, base.state);
    return handle;
  });
