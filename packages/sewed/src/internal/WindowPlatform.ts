import { isAbsolute } from "node:path";
import type { BaseWindow as NativeBaseWindow } from "electron";
import { Deferred, Effect, Schema, Stream } from "effect";
import * as Decidables from "../Decidables.ts";
import type { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as WindowControls from "../WindowControls.ts";
import type * as Registry from "./DecisionRegistry.ts";
import { Point } from "./Geometry.ts";
import { nativeImageOf } from "./ImageSource.ts";
import * as Observation from "./Observation.ts";
import * as Observers from "./Observers.ts";
import { only, type Platform } from "./Platform.ts";

const decodeBoolean = Schema.decodeUnknownSync(Schema.Boolean);
const decodeString = Schema.decodeUnknownSync(Schema.String);
const decodeVibrancy = Schema.decodeUnknownSync(WindowControls.Vibrancy);
const decodeMaterial = Schema.decodeUnknownSync(WindowControls.BackgroundMaterial);
const decodeAccent = Schema.decodeUnknownSync(WindowControls.AccentColor);
const decodeDetails = Schema.decodeUnknownSync(WindowControls.AppDetails);
const decodeButtons = Schema.decodeUnknownSync(
  Schema.Array(WindowControls.ThumbarButton).check(Schema.isMaxLength(7)),
);
const decodeRectangle = Schema.decodeUnknownSync(WindowControls.Bounds);
const decodePosition = Schema.decodeUnknownSync(Schema.NullOr(Point));
const decodeOffset = Schema.decodeUnknownSync(
  Schema.Struct({ y: Schema.Finite, x: Schema.optionalKey(Schema.Finite) }),
);
const decodeMessage = Schema.decodeUnknownSync(
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0xffff })),
);

export interface Helpers {
  readonly id: string;
  readonly closed: Deferred.Deferred<void>;
  readonly registry: Registry.Resolver<"window">;
  readonly operation: <A>(run: () => A) => Effect.Effect<A, SewedError, MainContext>;
  readonly read: <A>(message: string, run: () => A) => Effect.Effect<A, SewedError, MainContext>;
  /** Decodes first, so invalid input fails `Protocol`, then applies and republishes state. */
  readonly setting: <A>(
    decode: () => A,
    apply: (value: A) => void,
  ) => Effect.Effect<void, SewedError, MainContext>;
  /** The native window behind another Sewed window handle. */
  readonly nativeOf: (handle: { readonly id: string }) => NativeBaseWindow;
}

/**
 * The window members Electron implements on macOS or Windows only. Each fails `Native` elsewhere
 * instead of pretending to succeed, so a caller learns the platform does not have it.
 */
export const make = (native: NativeBaseWindow, helpers: Helpers) => {
  const { operation, read, setting } = helpers;
  const flag =
    (platforms: ReadonlyArray<Platform>, what: string, apply: (value: boolean) => void) =>
    (value: boolean) =>
      setting(
        () => decodeBoolean(value),
        (decoded) => {
          only(platforms, what);
          apply(decoded);
        },
      );
  const command = (platforms: ReadonlyArray<Platform>, what: string, run: () => void) =>
    operation(() => {
      only(platforms, what);
      run();
    });
  const query = <A>(platforms: ReadonlyArray<Platform>, what: string, run: () => A) =>
    read(`Could not read ${what}`, () => {
      only(platforms, what);
      return run();
    });

  const thumbarClicks = Observers.make<string>("Thumbnail toolbar");
  const hooked = new Map<number, Set<(message: WindowControls.WindowMessage) => void>>();
  const querySessionEnd = (event: Electron.WindowSessionEndEvent) => {
    const answer = helpers.registry.resolveSync(Decidables.Window.SessionEnd, {
      windowId: helpers.id,
      reasons: [...event.reasons],
    });
    if (answer === "deny") event.preventDefault();
  };
  native.on("query-session-end", querySessionEnd);

  return {
    /** Removes the listeners this module holds for the window's whole life. */
    release: () => {
      native.off("query-session-end", querySessionEnd);
      thumbarClicks.finish();
    },
    members: {
      /** Whether the window can take focus, on macOS and Windows. */
      setFocusable: flag(["darwin", "win32"], "Window focusability", (value) =>
        native.setFocusable(value),
      ),
      focusable: query(["darwin", "win32"], "window focusability", () => native.isFocusable()),
      contentProtected: query(["darwin", "win32"], "window content protection", () =>
        native.isContentProtected(),
      ),
      /** The file a macOS window represents, shown as an icon in its title bar. */
      setRepresentedFilename: (path: string) =>
        setting(
          () => decodeString(path),
          (value) => {
            only(["darwin"], "A represented file");
            native.setRepresentedFilename(value);
          },
        ),
      representedFilename: query(["darwin"], "the represented file", () =>
        native.getRepresentedFilename(),
      ),
      /** Marks a macOS window's document as having unsaved changes. */
      setDocumentEdited: flag(["darwin"], "The document-edited mark", (value) =>
        native.setDocumentEdited(value),
      ),
      documentEdited: query(["darwin"], "the document-edited mark", () =>
        native.isDocumentEdited(),
      ),
      setVibrancy: (vibrancy: WindowControls.Vibrancy) =>
        setting(
          () => decodeVibrancy(vibrancy),
          (value) => {
            only(["darwin"], "Vibrancy");
            native.setVibrancy(value);
          },
        ),
      /** Places the macOS traffic light buttons; `null` restores their default position. */
      setWindowButtonPosition: (position: Point | null) =>
        setting(
          () => decodePosition(position),
          (value) => {
            only(["darwin"], "Window button position");
            native.setWindowButtonPosition(value);
          },
        ),
      windowButtonPosition: query(["darwin"], "the window button position", () => {
        const position = native.getWindowButtonPosition();
        return position === null ? null : { x: position.x, y: position.y };
      }),
      /** Where sheets attach on a macOS window, as offsets from its top left. */
      setSheetOffset: (offset: { readonly y: number; readonly x?: number }) =>
        setting(
          () => decodeOffset(offset),
          ({ y, x }) => {
            only(["darwin"], "Sheet offset");
            native.setSheetOffset(y, x);
          },
        ),
      /** Shows a macOS Quick Look preview of a file, by absolute path. */
      previewFile: (path: string, displayName?: string) =>
        setting(
          () => {
            if (!isAbsolute(decodeString(path)))
              throw new SewedError({ code: "Protocol", message: "Preview path must be absolute" });
            return [
              path,
              displayName === undefined ? undefined : decodeString(displayName),
            ] as const;
          },
          ([target, name]) => {
            only(["darwin"], "File preview");
            native.previewFile(target, name);
          },
        ),
      closeFilePreview: command(["darwin"], "File preview", () => native.closeFilePreview()),
      setHiddenInMissionControl: flag(["darwin"], "Mission Control visibility", (value) =>
        native.setHiddenInMissionControl(value),
      ),
      hiddenInMissionControl: query(["darwin"], "Mission Control visibility", () =>
        native.isHiddenInMissionControl(),
      ),
      /** Whether the cursor hides while the user types in a macOS window. */
      setAutoHideCursor: flag(["darwin"], "Cursor auto-hiding", (value) =>
        native.setAutoHideCursor(value),
      ),
      /** Recomputes a macOS window's shadow, after its shape or transparency changed. */
      invalidateShadow: command(["darwin"], "Shadow invalidation", () => native.invalidateShadow()),
      setExcludedFromShownWindowsMenu: flag(["darwin"], "Window menu exclusion", (value) => {
        native.excludedFromShownWindowsMenu = value;
      }),
      excludedFromShownWindowsMenu: query(
        ["darwin"],
        "window menu exclusion",
        () => native.excludedFromShownWindowsMenu,
      ),
      /** Native window tabs, on macOS. */
      tabs: {
        identifier: query(
          ["darwin"],
          "the tabbing identifier",
          () => native.tabbingIdentifier ?? null,
        ),
        selectNext: command(["darwin"], "Window tabs", () => native.selectNextTab()),
        selectPrevious: command(["darwin"], "Window tabs", () => native.selectPreviousTab()),
        showAll: command(["darwin"], "Window tabs", () => native.showAllTabs()),
        mergeAll: command(["darwin"], "Window tabs", () => native.mergeAllWindows()),
        moveToNewWindow: command(["darwin"], "Window tabs", () => native.moveTabToNewWindow()),
        toggleBar: command(["darwin"], "Window tabs", () => native.toggleTabBar()),
        /** Adds another Sewed window as a tab of this one. */
        add: (window: { readonly id: string }) =>
          operation(() => {
            only(["darwin"], "Window tabs");
            native.addTabbedWindow(helpers.nativeOf(window));
          }),
      },
      setAccentColor: (color: WindowControls.AccentColor) =>
        setting(
          () => decodeAccent(color),
          (value) => {
            only(["win32"], "The accent color");
            native.setAccentColor(value);
          },
        ),
      setAppDetails: (details: WindowControls.AppDetails) =>
        setting(
          () => decodeDetails(details),
          (value) => {
            only(["win32"], "App details");
            native.setAppDetails({ ...value });
          },
        ),
      setBackgroundMaterial: (material: WindowControls.BackgroundMaterial) =>
        setting(
          () => decodeMaterial(material),
          (value) => {
            only(["win32"], "The background material");
            native.setBackgroundMaterial(value);
          },
        ),
      /**
       * Sets the buttons of the Windows taskbar thumbnail toolbar, at most seven; an empty list
       * removes them. A press arrives on `thumbarClicks` as the button's `id`.
       */
      setThumbarButtons: (buttons: ReadonlyArray<WindowControls.ThumbarButton>) =>
        setting(
          () =>
            decodeButtons(buttons).map((button) => ({
              icon: nativeImageOf(button.icon, "Thumbnail toolbar icon"),
              click: () => thumbarClicks.publish(button.id),
              ...(button.tooltip === undefined ? {} : { tooltip: button.tooltip }),
              ...(button.flags === undefined ? {} : { flags: [...button.flags] }),
            })),
          (value) => {
            only(["win32"], "The thumbnail toolbar");
            if (!native.setThumbarButtons(value))
              throw new SewedError({
                code: "Native",
                message: "Windows refused the thumbnail toolbar",
              });
          },
        ),
      thumbarClicks: thumbarClicks.stream.pipe(
        Stream.interruptWhen(Deferred.await(helpers.closed)),
      ),
      /** The part of the window shown as its Windows taskbar thumbnail. */
      setThumbnailClip: (region: WindowControls.Bounds) =>
        setting(
          () => decodeRectangle(region),
          (value) => {
            only(["win32"], "The thumbnail clip");
            native.setThumbnailClip(value);
          },
        ),
      setThumbnailToolTip: (text: string) =>
        setting(
          () => decodeString(text),
          (value) => {
            only(["win32"], "The thumbnail tooltip");
            native.setThumbnailToolTip(value);
          },
        ),
      snapped: query(["win32"], "whether the window is snapped", () => native.isSnapped()),
      tabletMode: query(["win32"], "tablet mode", () => native.isTabletMode()),
      /**
       * A raw Windows message as it reaches the window, by message code. Observers of one code
       * share Electron's single hook for it, removed with the last of them.
       */
      windowMessages: (
        message: number,
      ): Stream.Stream<WindowControls.WindowMessage, SewedError, MainContext> =>
        Observation.listen<WindowControls.WindowMessage>("Window message", (offer) =>
          operation(() => {
            const code = decodeProtocol(() => decodeMessage(message));
            only(["win32"], "Window messages");
            const existing = hooked.get(code);
            const offers = existing ?? new Set();
            offers.add(offer);
            if (existing === undefined) {
              hooked.set(code, offers);
              native.hookWindowMessage(code, (wParam, lParam) => {
                const value = { wParam: new Uint8Array(wParam), lParam: new Uint8Array(lParam) };
                for (const each of offers) each(value);
              });
            }
            return () => {
              offers.delete(offer);
              if (offers.size > 0) return;
              hooked.delete(code);
              if (!native.isDestroyed()) native.unhookWindowMessage(code);
            };
          }),
        ).pipe(Stream.interruptWhen(Deferred.await(helpers.closed))),
    },
  };
};

const decodeProtocol = <A>(run: () => A): A => {
  try {
    return run();
  } catch (cause) {
    throw new SewedError({ code: "Protocol", message: "Invalid window message code", cause });
  }
};
