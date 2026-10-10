import { Schema } from "effect";
import type { Effect } from "effect";
import type { MainContext } from "./RuntimeContext.ts";
import type { SewedError } from "./SewedError.ts";

const methodSyntax = /^[A-Z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/;
/** A DevTools protocol method such as `Runtime.evaluate`. */
export const DevToolsMethod = Schema.String.check(
  Schema.makeFilter((value) => methodSyntax.test(value) || "Expected a Domain.method name"),
);
export type DevToolsMethod = typeof DevToolsMethod.Type;

/** The automation web contents are created with; an undeclared operation does not exist on the handle. */
export const Declaration = Schema.Struct({
  evaluate: Schema.optionalKey(Schema.Literal(true)),
  devtools: Schema.optionalKey(Schema.NonEmptyArray(DevToolsMethod)),
  input: Schema.optionalKey(Schema.Literal(true)),
});
export type Declaration = typeof Declaration.Type;

export const EvaluateOptions = Schema.Struct({ userGesture: Schema.optionalKey(Schema.Boolean) });
export type EvaluateOptions = typeof EvaluateOptions.Type;

const Modifier = Schema.Literals([
  "shift",
  "control",
  "ctrl",
  "alt",
  "meta",
  "command",
  "cmd",
  "iskeypad",
  "isautorepeat",
  "leftbuttondown",
  "middlebuttondown",
  "rightbuttondown",
  "capslock",
  "numlock",
  "left",
  "right",
]);
const inputFields = { modifiers: Schema.optionalKey(Schema.Array(Modifier)) } as const;
const mouseFields = {
  ...inputFields,
  x: Schema.Finite,
  y: Schema.Finite,
  globalX: Schema.optionalKey(Schema.Finite),
  globalY: Schema.optionalKey(Schema.Finite),
  movementX: Schema.optionalKey(Schema.Finite),
  movementY: Schema.optionalKey(Schema.Finite),
} as const;

/** Data mirrors of Electron's input structures; the library copies them before sending. */
export const MouseInput = Schema.Struct({
  ...mouseFields,
  type: Schema.Literals([
    "mouseDown",
    "mouseUp",
    "mouseEnter",
    "mouseLeave",
    "contextMenu",
    "mouseMove",
  ]),
  button: Schema.optionalKey(Schema.Literals(["left", "middle", "right"])),
  clickCount: Schema.optionalKey(Schema.Int),
});
export type MouseInput = typeof MouseInput.Type;
export const MouseWheelInput = Schema.Struct({
  ...mouseFields,
  type: Schema.Literal("mouseWheel"),
  deltaX: Schema.optionalKey(Schema.Finite),
  deltaY: Schema.optionalKey(Schema.Finite),
  wheelTicksX: Schema.optionalKey(Schema.Finite),
  wheelTicksY: Schema.optionalKey(Schema.Finite),
  accelerationRatioX: Schema.optionalKey(Schema.Finite),
  accelerationRatioY: Schema.optionalKey(Schema.Finite),
  hasPreciseScrollingDeltas: Schema.optionalKey(Schema.Boolean),
  canScroll: Schema.optionalKey(Schema.Boolean),
});
export type MouseWheelInput = typeof MouseWheelInput.Type;
export const KeyboardInput = Schema.Struct({
  ...inputFields,
  type: Schema.Literals(["rawKeyDown", "keyDown", "keyUp", "char"]),
  keyCode: Schema.String.check(Schema.isMinLength(1)),
});
export type KeyboardInput = typeof KeyboardInput.Type;
export const InputEvent = Schema.Union([MouseInput, MouseWheelInput, KeyboardInput]);
export type InputEvent = typeof InputEvent.Type;

/** The DevTools methods a declaration allows; none when the declaration has no allowlist. */
export type DevToolsOf<A extends Declaration> = A extends { readonly devtools: readonly string[] }
  ? A["devtools"][number]
  : never;

/** Every automation member, typed against one declaration. */
export interface Members<A extends Declaration> {
  readonly evaluate: <T, I>(
    script: string,
    result: Schema.Codec<T, I>,
    options?: EvaluateOptions,
  ) => Effect.Effect<T, SewedError, MainContext>;
  readonly devtools: <T, I>(
    method: DevToolsOf<A>,
    params: Schema.Json | undefined,
    result: Schema.Codec<T, I>,
  ) => Effect.Effect<T, SewedError, MainContext>;
  readonly input: (event: InputEvent) => Effect.Effect<void, SewedError, MainContext>;
}

/** The automation members a declaration grants; undeclared members do not exist on the type. */
export type Of<A extends Declaration> = Pick<Members<A>, Extract<keyof A, keyof Members<A>>>;
