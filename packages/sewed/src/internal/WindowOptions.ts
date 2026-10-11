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
  /** Sizes the content area to `width` and `height` instead of the whole window. */
  useContentSize: Schema.optionalKey(Schema.Boolean),
  center: Schema.optionalKey(Schema.Boolean),
  focusable: Schema.optionalKey(Schema.Boolean),
  hasShadow: Schema.optionalKey(Schema.Boolean),
  /** Asks for the dark variant of the window frame, where the desktop has one. */
  darkTheme: Schema.optionalKey(Schema.Boolean),
  /** Whether a frameless window has rounded corners, on macOS and Windows. */
  roundedCorners: Schema.optionalKey(Schema.Boolean),
  /** Whether a frameless window keeps the standard Windows frame with its shadow and animations. */
  thickFrame: Schema.optionalKey(Schema.Boolean),
  /** Draws the native window controls over the content of a frameless window. */
  titleBarOverlay: Schema.optionalKey(
    Schema.Union([
      Schema.Boolean,
      Schema.Struct({
        color: Schema.optionalKey(Schema.String),
        symbolColor: Schema.optionalKey(Schema.String),
        height: Schema.optionalKey(Pixels),
      }),
    ]),
  ),
  /** A macOS material behind the content; see `WindowControls.Vibrancy`. */
  vibrancy: Schema.optionalKey(
    Schema.Literals([
      "titlebar",
      "selection",
      "menu",
      "popover",
      "sidebar",
      "header",
      "sheet",
      "window",
      "hud",
      "fullscreen-ui",
      "tooltip",
      "content",
      "under-window",
      "under-page",
    ]),
  ),
  /** Whether a macOS vibrancy follows the window's activity, or stays active or inactive. */
  visualEffectState: Schema.optionalKey(Schema.Literals(["followWindow", "active", "inactive"])),
  /** A Windows 11 material behind the content. */
  backgroundMaterial: Schema.optionalKey(
    Schema.Literals(["auto", "none", "mica", "acrylic", "tabbed"]),
  ),
  /** Windows with one tabbing identifier group as native tabs, on macOS. */
  tabbingIdentifier: Schema.optionalKey(Schema.String),
  hiddenInMissionControl: Schema.optionalKey(Schema.Boolean),
  /** Whether a click that activates a macOS window also reaches its content. */
  acceptFirstMouse: Schema.optionalKey(Schema.Boolean),
  /** The window type the desktop treats it as: `desktop`, `dock`, `toolbar`, `splash`, and so on. */
  type: Schema.optionalKey(Schema.String),
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
