import { TouchBar as NativeTouchBar, nativeImage } from "electron";
import type { BaseWindow } from "electron";
import { Effect, Schema } from "effect";
import type { Stream } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as TouchBar from "../TouchBar.ts";
import * as Observers from "./Observers.ts";

export { Interaction, Item, Options } from "../TouchBar.ts";

const decodeOptions = Schema.decodeUnknownSync(TouchBar.Options);
const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

type NativeItem = ConstructorParameters<typeof NativeTouchBar>[0]["items"] extends
  | Array<infer I>
  | undefined
  ? I
  : never;

const build = (
  items: readonly TouchBar.Item[],
  emit: (interaction: TouchBar.Interaction) => void,
) => new NativeTouchBar({ items: items.map((item) => nativeItem(item, emit)) });

const nativeItem = (
  item: TouchBar.Item,
  emit: (interaction: TouchBar.Interaction) => void,
): NativeItem => {
  switch (item.kind) {
    case "button": {
      const icon = item.icon === undefined ? undefined : nativeImage.createFromPath(item.icon);
      if (icon !== undefined && icon.isEmpty())
        throw protocolError(`Touch bar icon is not a readable image: ${item.icon}`);
      return new NativeTouchBar.TouchBarButton({
        ...(item.label === undefined ? {} : { label: item.label }),
        ...(item.accessibilityLabel === undefined
          ? {}
          : { accessibilityLabel: item.accessibilityLabel }),
        ...(item.backgroundColor === undefined ? {} : { backgroundColor: item.backgroundColor }),
        ...(icon === undefined ? {} : { icon }),
        ...(item.iconPosition === undefined ? {} : { iconPosition: item.iconPosition }),
        ...(item.enabled === undefined ? {} : { enabled: item.enabled }),
        click: () => emit({ kind: "click", id: item.id }),
      });
    }
    case "label":
      return new NativeTouchBar.TouchBarLabel({
        label: item.label,
        ...(item.textColor === undefined ? {} : { textColor: item.textColor }),
      });
    case "spacer":
      return new NativeTouchBar.TouchBarSpacer(item.size === undefined ? {} : { size: item.size });
    case "slider":
      return new NativeTouchBar.TouchBarSlider({
        ...(item.label === undefined ? {} : { label: item.label }),
        ...(item.value === undefined ? {} : { value: item.value }),
        ...(item.minValue === undefined ? {} : { minValue: item.minValue }),
        ...(item.maxValue === undefined ? {} : { maxValue: item.maxValue }),
        change: (value) => emit({ kind: "slider", id: item.id, value }),
      });
    case "segmented":
      return new NativeTouchBar.TouchBarSegmentedControl({
        segments: item.segments.map((segment) => ({ ...segment })),
        ...(item.selectedIndex === undefined ? {} : { selectedIndex: item.selectedIndex }),
        ...(item.mode === undefined ? {} : { mode: item.mode }),
        ...(item.segmentStyle === undefined ? {} : { segmentStyle: item.segmentStyle }),
        change: (index, selected) => emit({ kind: "segment", id: item.id, index, selected }),
      });
    case "color-picker":
      return new NativeTouchBar.TouchBarColorPicker({
        ...(item.availableColors === undefined
          ? {}
          : { availableColors: [...item.availableColors] }),
        ...(item.selectedColor === undefined ? {} : { selectedColor: item.selectedColor }),
        change: (color) => emit({ kind: "color", id: item.id, color }),
      });
    case "popover":
      return new NativeTouchBar.TouchBarPopover({
        ...(item.label === undefined ? {} : { label: item.label }),
        ...(item.showCloseButton === undefined ? {} : { showCloseButton: item.showCloseButton }),
        items: build(item.items, emit),
      });
    case "group":
      return new NativeTouchBar.TouchBarGroup({ items: build(item.items, emit) });
  }
};

export interface Handle {
  /** Replaces the window's touch bar; macOS only, `Native` elsewhere. */
  readonly set: (options: TouchBar.Options) => Effect.Effect<void, SewedError, MainContext>;
  readonly clear: Effect.Effect<void, SewedError, MainContext>;
  /** Interactions with the current bar; each observer owns a queue of 128 events. */
  readonly interactions: Stream.Stream<TouchBar.Interaction, SewedError, MainContext>;
}

export const make = (native: BaseWindow, isClosed: () => boolean): Handle => {
  const observers = Observers.make<TouchBar.Interaction>("Touch bar");
  const operation = <A>(run: () => A): Effect.Effect<A, SewedError, MainContext> =>
    Effect.andThen(
      MainContext,
      Effect.try({
        try: () => {
          if (isClosed()) throw new SewedError({ code: "Closed", message: "Window is closed" });
          if (process.platform !== "darwin")
            throw nativeError("The touch bar is unavailable on this platform", undefined);
          return run();
        },
        catch: (cause) =>
          cause instanceof SewedError ? cause : nativeError("Touch bar operation failed", cause),
      }),
    );
  return {
    set: (options) =>
      Effect.andThen(
        Effect.try({
          try: () => decodeOptions(options),
          catch: (cause) =>
            cause instanceof SewedError ? cause : protocolError("Invalid touch bar", cause),
        }),
        (settings) =>
          operation(() => {
            const bar = new NativeTouchBar({
              items: settings.items.map((item) => nativeItem(item, observers.publish)),
              ...(settings.escapeItem === undefined
                ? {}
                : { escapeItem: nativeItem(settings.escapeItem, observers.publish) }),
            });
            native.setTouchBar(bar);
          }),
      ),
    clear: operation(() => {
      native.setTouchBar(null);
    }),
    interactions: observers.stream,
  };
};
