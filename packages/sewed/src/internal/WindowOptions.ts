import { Schema } from "effect";
import { Opacity } from "../WindowControls.ts";

const Coordinate = Schema.Finite.check(Schema.isInt32());
const Pixels = Coordinate.check(Schema.isGreaterThanOrEqualTo(0));
const Path = Schema.String.check(Schema.isMinLength(1));
const Point = Schema.Struct({ x: Coordinate, y: Coordinate });

/** Window creation options that are plain data; a parent window is resolved separately. */
export const Options = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  width: Schema.optionalKey(Pixels),
  height: Schema.optionalKey(Pixels),
  x: Schema.optionalKey(Coordinate),
  y: Schema.optionalKey(Coordinate),
  minWidth: Schema.optionalKey(Pixels),
  minHeight: Schema.optionalKey(Pixels),
  maxWidth: Schema.optionalKey(Pixels),
  maxHeight: Schema.optionalKey(Pixels),
  show: Schema.optionalKey(Schema.Boolean),
  frame: Schema.optionalKey(Schema.Boolean),
  transparent: Schema.optionalKey(Schema.Boolean),
  backgroundColor: Schema.optionalKey(Schema.String),
  alwaysOnTop: Schema.optionalKey(Schema.Boolean),
  resizable: Schema.optionalKey(Schema.Boolean),
  movable: Schema.optionalKey(Schema.Boolean),
  minimizable: Schema.optionalKey(Schema.Boolean),
  maximizable: Schema.optionalKey(Schema.Boolean),
  closable: Schema.optionalKey(Schema.Boolean),
  fullScreenable: Schema.optionalKey(Schema.Boolean),
  skipTaskbar: Schema.optionalKey(Schema.Boolean),
  kiosk: Schema.optionalKey(Schema.Boolean),
  autoHideMenuBar: Schema.optionalKey(Schema.Boolean),
  opacity: Schema.optionalKey(Opacity),
  icon: Schema.optionalKey(Path),
  modal: Schema.optionalKey(Schema.Boolean),
  /** macOS title bar treatment; other platforms apply only the styles Electron supports there. */
  titleBarStyle: Schema.optionalKey(
    Schema.Literals(["default", "hidden", "hiddenInset", "customButtonsOnHover"]),
  ),
  /**
   * A name unique among the application's windows, which is what persisted state is stored under.
   */
  name: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
  /**
   * Restores the window's bounds and display mode from its last run and saves them as they
   * change; needs `name`. `true` persists both.
   */
  windowStatePersistence: Schema.optionalKey(
    Schema.Union([
      Schema.Boolean,
      Schema.Struct({
        bounds: Schema.optionalKey(Schema.Boolean),
        displayMode: Schema.optionalKey(Schema.Boolean),
      }),
    ]),
  ),
  /** Position of the macOS traffic light buttons in a hidden title bar. */
  trafficLightPosition: Schema.optionalKey(Point),
});
export type Options = typeof Options.Type;
