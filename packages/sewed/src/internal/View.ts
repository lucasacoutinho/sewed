import { View as NativeView } from "electron";
import { Cause, Deferred, Effect, Exit, Schema, Scope } from "effect";
import { generateInstanceId } from "../InstanceId.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { Bounds as BoundsSchema } from "./Geometry.ts";

type Bounds = typeof BoundsSchema.Type;

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

export interface Attachment {
  readonly setBounds: (bounds: Bounds) => Effect.Effect<void, SewedError, MainContext>;
  readonly setVisible: (visible: boolean) => Effect.Effect<void, SewedError, MainContext>;
  readonly detach: Effect.Effect<void, SewedError, MainContext>;
}

interface NativeAttachment extends Attachment {
  readonly detachNative: () => void;
  readonly closeView: () => Effect.Effect<void, never, never>;
}

/** Private state behind every view handle; `isDestroyed` reports the native object's own death. */
export interface State {
  readonly native: NativeView;
  readonly lifetime: Scope.Scope;
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
  parentClosed: () => boolean,
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
      return yield* Effect.fail(closedError("View is closed"));
    if (state.attachment !== undefined)
      return yield* Effect.fail(protocolError("View is already attached to a parent"));
    if (parentClosed()) return yield* Effect.fail(closedError("Parent is closed"));

    let detached = false;
    const detachNative = () => {
      if (detached) return;
      detached = true;
      let failure: unknown;
      try {
        if (!parentClosed()) parentView.removeChildView(state.native);
      } catch (cause) {
        failure = cause;
      } finally {
        if (state.attachment?.detachNative === detachNative) state.attachment = undefined;
        onDetached();
      }
      if (failure !== undefined) throw failure;
    };
    const isCurrent = () => !detached && state.attachment?.detachNative === detachNative;
    const record: NativeAttachment = {
      setBounds: (value) =>
        operation(state, isCurrent, () => {
          state.native.setBounds(attachmentBounds(value));
        }),
      setVisible: (value) =>
        operation(state, isCurrent, () => {
          state.native.setVisible(attachmentVisible(value));
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
      return yield* Effect.fail(nativeError("Could not attach view", cause));
    }
    state.attachment = record;
    return record;
  });

/** Owns the attachments of one parent: caller scopes detach, parent closure closes the views. */
export const makeParent = (parentView: () => NativeView, parentClosed: () => boolean) => {
  interface Active {
    readonly native: NativeAttachment;
    readonly scope: Scope.Scope;
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
    if (failure.reasons.length > 0) yield* Effect.failCause(failure);
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
      if (parentClosed()) return yield* Effect.fail(closedError("Parent is closed"));
      const attachmentScope = yield* Scope.fork(caller);
      return yield* Effect.gen(function* () {
        let attached: Active | undefined;
        let attachmentScopeClosing = false;
        const native = yield* attachNative(
          view,
          parentView(),
          parentClosed,
          settings.bounds,
          settings.visible ?? true,
          () => {
            if (attached !== undefined) {
              attachments.delete(attached);
              if (!attachmentScopeClosing) Effect.runFork(Scope.close(attachmentScope, Exit.void));
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
          setBounds: native.setBounds,
          setVisible: native.setVisible,
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
  Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
);
const decodeOptions = Schema.decodeUnknownSync(
  Schema.Struct({
    backgroundColor: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
    borderRadius: Schema.optionalKey(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
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

export const make = (
  options: Options = {},
): Effect.Effect<Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const settings = yield* Effect.try({
      try: () => decodeOptions(options),
      catch: (cause) => protocolError("Invalid view options", cause),
    });
    const native = yield* Effect.try({
      try: () => {
        const view = new NativeView();
        if (settings.backgroundColor !== undefined)
          view.setBackgroundColor(settings.backgroundColor);
        if (settings.borderRadius !== undefined) view.setBorderRadius(settings.borderRadius);
        if (settings.visible !== undefined) view.setVisible(settings.visible);
        return view;
      },
      catch: (cause) => nativeError("Could not create view", cause),
    });
    const base = yield* lifecycle(native, () => false);
    const children = makeParent(
      () => native,
      () => base.state.closedFlag || base.state.scopeClosing,
    );
    yield* Scope.addFinalizer(base.lifetime, Effect.ignore(children.closeAll));
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
