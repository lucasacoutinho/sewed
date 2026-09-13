import { desktopCapturer } from "electron";
import { Effect, Schema } from "effect";
import * as DesktopCapturer from "../DesktopCapturer.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";

export { Decision, Options, Request, Source, SourceType } from "../DesktopCapturer.ts";

const decodeOptions = Schema.decodeUnknownSync(DesktopCapturer.Options);

/** Lists capturable screens and windows with PNG thumbnails; screen capture itself stays a session policy. */
export const sources = (
  options: DesktopCapturer.Options,
): Effect.Effect<readonly DesktopCapturer.Source[], SewedError, MainContext> =>
  Effect.andThen(
    Effect.try({
      try: () => decodeOptions(options),
      catch: (cause) =>
        new SewedError({ code: "Protocol", message: "Invalid capture source options", cause }),
    }),
    (settings) =>
      Effect.andThen(
        MainContext,
        Effect.tryPromise({
          try: async () => {
            const found = await desktopCapturer.getSources({
              types: [...settings.types],
              ...(settings.thumbnailSize === undefined
                ? {}
                : { thumbnailSize: { ...settings.thumbnailSize } }),
              ...(settings.fetchWindowIcons === undefined
                ? {}
                : { fetchWindowIcons: settings.fetchWindowIcons }),
            });
            return found.map((source) => ({
              id: source.id,
              name: source.name,
              displayId: source.display_id,
              thumbnail: new Uint8Array(source.thumbnail.isEmpty() ? [] : source.thumbnail.toPNG()),
              icon:
                source.appIcon === null || source.appIcon === undefined || source.appIcon.isEmpty()
                  ? null
                  : new Uint8Array(source.appIcon.toPNG()),
            }));
          },
          catch: (cause) =>
            new SewedError({ code: "Native", message: "Could not list capture sources", cause }),
        }),
      ),
  );
