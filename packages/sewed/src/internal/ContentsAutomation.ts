import { Effect, Schema } from "effect";
import { Declaration, EvaluateOptions, InputEvent, type Members, type Of } from "../Automation.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import type { Control } from "./WebContentsCore.ts";

export interface DebuggerLike {
  attach(version?: string): void;
  detach(): void;
  isAttached(): boolean;
  sendCommand(method: string, params?: unknown): Promise<unknown>;
}

/** The structural subset of a WebContents the automation group drives. */
export interface Contents {
  isDestroyed(): boolean;
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
  sendInputEvent(
    event: Electron.MouseInputEvent | Electron.MouseWheelInputEvent | Electron.KeyboardInputEvent,
  ): void;
  readonly debugger: DebuggerLike;
}

const decodeAutomation = Schema.decodeUnknownSync(Declaration);
const decodeEvaluateOptions = Schema.decodeUnknownSync(EvaluateOptions);
const decodeInput = Schema.decodeUnknownSync(InputEvent);
const decodeJson = Schema.decodeUnknownSync(Schema.Json);
const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

export const make = <A extends Declaration = {}>(
  declaration: A | undefined,
  contents: Contents,
  control: Pick<Control, "isClosed" | "closedError">,
): { readonly automation: Of<A>; readonly release: () => void } => {
  const declared = declaration === undefined ? {} : decodeAutomation(declaration);
  const allowlist = new Set<string>(declared.devtools ?? []);
  const guarded = <T>(
    granted: boolean,
    what: string,
    run: () => Effect.Effect<T, SewedError>,
  ): Effect.Effect<T, SewedError, MainContext> =>
    Effect.andThen(
      MainContext,
      Effect.suspend(() => {
        if (!granted)
          return Effect.fail(protocolError(`${what} was not declared for these contents`));
        if (control.isClosed() || contents.isDestroyed()) return Effect.fail(control.closedError());
        return run();
      }),
    );
  const decodeResult = <T, I>(result: Schema.Codec<T, I>, value: unknown) =>
    Effect.mapError(Schema.decodeUnknownEffect(result)(value), (cause) =>
      protocolError("Result does not match the declared schema", cause),
    );
  const failure = (message: string) => (cause: unknown) =>
    cause instanceof SewedError
      ? cause
      : contents.isDestroyed()
        ? control.closedError()
        : nativeError(message, cause);
  const attach = Effect.try({
    try: () => {
      if (!contents.debugger.isAttached()) contents.debugger.attach("1.3");
    },
    catch: (cause) =>
      cause instanceof Error && /already attached/i.test(cause.message)
        ? new SewedError({ code: "Limit", message: "Another debugger holds these contents", cause })
        : nativeError("Could not attach the debugger", cause),
  });
  const members: Members<A> = {
    evaluate: (script, result, options = {}) =>
      guarded(declared.evaluate === true, "evaluate", () =>
        Effect.gen(function* () {
          const settings = yield* Effect.try({
            try: () => decodeEvaluateOptions(options),
            catch: (cause) => protocolError("Invalid evaluate options", cause),
          });
          const value = yield* Effect.tryPromise({
            try: () => contents.executeJavaScript(script, settings.userGesture === true),
            catch: failure("Page threw during evaluate"),
          });
          return yield* decodeResult(result, value);
        }),
      ),
    devtools: (method, params, result) =>
      guarded(allowlist.size > 0, "devtools", () =>
        Effect.gen(function* () {
          const name: string = method;
          if (!allowlist.has(name))
            return yield* Effect.fail(protocolError(`${name} is outside the DevTools allowlist`));
          const parameters = yield* Effect.try({
            try: () => (params === undefined ? undefined : decodeJson(params)),
            catch: (cause) => protocolError("Invalid DevTools parameters", cause),
          });
          yield* attach;
          const value = yield* Effect.tryPromise({
            try: () => contents.debugger.sendCommand(name, parameters),
            catch: failure(`${name} failed`),
          });
          return yield* decodeResult(result, value);
        }),
      ),
    input: (event) =>
      guarded(declared.input === true, "input", () =>
        Effect.try({
          try: () => {
            const { modifiers, ...rest } = decodeInput(event);
            contents.sendInputEvent(
              modifiers === undefined ? rest : { ...rest, modifiers: [...modifiers] },
            );
          },
          catch: (cause) =>
            cause instanceof Schema.SchemaError
              ? protocolError("Invalid input event", cause)
              : failure("Could not send input event")(cause),
        }),
      ),
  };
  // Every member exists at runtime and fails with Protocol when undeclared; the declared type
  // only picks the declared ones, so no cast is needed.
  return {
    automation: members,
    release: () => {
      if (contents.isDestroyed()) return;
      try {
        if (contents.debugger.isAttached()) contents.debugger.detach();
      } catch {
        // The contents are closing; a detach failure leaves nothing to release.
      }
    },
  };
};
