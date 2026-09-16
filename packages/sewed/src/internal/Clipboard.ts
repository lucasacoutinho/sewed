import { ClipboardItem, clipboard } from "electron";
import { Effect, Layer, Schema } from "effect";
import * as Capability from "../Capability.ts";
import * as Clipboard from "../Clipboard.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as ClipboardPolicy from "./ClipboardPolicy.ts";

export { Content, Format, Policy, capability, protocol } from "../Clipboard.ts";

const decodeFormat = Schema.decodeUnknownSync(Clipboard.Format);
const decodeContent = Schema.decodeUnknownSync(Clipboard.Content);

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (cause: unknown) =>
  cause instanceof SewedError
    ? cause
    : new SewedError({ code: "Native", message: "Clipboard operation failed", cause });

const operation = <A>(run: () => Promise<A>): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(MainContext, Effect.tryPromise({ try: run, catch: nativeError }));

const bookmarkType = "electron application/bookmark";
const mediaTypes: Record<Clipboard.Format, string> = {
  text: "text/plain",
  html: "text/html",
  rtf: "text/rtf",
  image: "image/png",
  bookmark: bookmarkType,
};

const isBlob = (value: unknown): value is Blob => value instanceof Blob;
const isBookmark = (value: unknown): value is { readonly title: string; readonly url: string } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { title?: unknown }).title === "string" &&
  typeof (value as { url?: unknown }).url === "string";

/** Enumerating the clipboard materializes every platform format, so presence is checked first. */
const entry = async (format: Clipboard.Format): Promise<ClipboardItem | undefined> => {
  if (!(await clipboard.has(mediaTypes[format]))) return undefined;
  const items = await clipboard.read();
  return items.find((item) => item.types.includes(mediaTypes[format]));
};

const text = async (item: ClipboardItem, type: string): Promise<string> => {
  const payload = await item.getType(type);
  if (!isBlob(payload)) throw protocolError(`Clipboard payload for ${type} is not a blob`);
  return payload.text();
};

const readContent = async (format: Clipboard.Format): Promise<Clipboard.Content | null> => {
  if (format === "text") {
    const value = await clipboard.readText();
    return value === "" ? null : { kind: "text", text: value };
  }
  const item = await entry(format);
  if (item === undefined) return null;
  switch (format) {
    case "html": {
      const html = await text(item, mediaTypes.html);
      return item.types.includes(mediaTypes.text)
        ? { kind: "html", html, text: await text(item, mediaTypes.text) }
        : { kind: "html", html };
    }
    case "rtf":
      return { kind: "rtf", rtf: await text(item, mediaTypes.rtf) };
    case "image": {
      const payload = await item.getType(mediaTypes.image);
      if (!isBlob(payload)) throw protocolError("Clipboard image payload is not a blob");
      return { kind: "image", png: new Uint8Array(await payload.arrayBuffer()) };
    }
    case "bookmark": {
      const payload = await item.getType(bookmarkType);
      if (!isBookmark(payload)) throw protocolError("Clipboard bookmark payload is malformed");
      return { kind: "bookmark", title: payload.title, url: payload.url };
    }
  }
};

const writeContent = (content: Clipboard.Content): Promise<void> =>
  content.kind === "text" ? clipboard.writeText(content.text) : clipboard.write([item(content)]);

const item = (content: Exclude<Clipboard.Content, { readonly kind: "text" }>): ClipboardItem => {
  switch (content.kind) {
    case "html":
      return new ClipboardItem({
        [mediaTypes.html]: content.html,
        ...(content.text === undefined ? {} : { [mediaTypes.text]: content.text }),
      });
    case "rtf":
      return new ClipboardItem({ [mediaTypes.rtf]: content.rtf });
    case "image":
      return new ClipboardItem({
        [mediaTypes.image]: new Blob([new Uint8Array(content.png)], { type: mediaTypes.image }),
      });
    case "bookmark":
      return new ClipboardItem({ [bookmarkType]: { title: content.title, url: content.url } });
  }
};

/** Reads one format, or `null` when the clipboard holds nothing of that kind. */
export const read = (
  format: Clipboard.Format,
): Effect.Effect<Clipboard.Content | null, SewedError, MainContext> =>
  Effect.andThen(
    Effect.try({
      try: () => decodeFormat(format),
      catch: (cause) => protocolError("Invalid clipboard format", cause),
    }),
    (value) => operation(() => readContent(value)),
  );

/** Replaces the clipboard atomically with one piece of content. */
export const write = (content: Clipboard.Content): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    Effect.try({
      try: () => decodeContent(content),
      catch: (cause) => protocolError("Invalid clipboard content", cause),
    }),
    (value) => operation(() => writeContent(value)),
  );

/** Presence checks run in parallel, one per format, without materializing any content. */
export const formats: Effect.Effect<readonly Clipboard.Format[], SewedError, MainContext> =
  operation(async () => {
    const present = await Promise.all(
      Clipboard.Format.literals.map((format) => clipboard.has(mediaTypes[format])),
    );
    return Clipboard.Format.literals.filter((_, index) => present[index]);
  });

export const clear: Effect.Effect<void, SewedError, MainContext> = operation(async () => {
  clipboard.clear();
});

// Electron only ever sees a format the policy allowed.
const core: ClipboardPolicy.Core<MainContext> = { read, write, formats, clear };

/**
 * The clipboard capability for main. The policy lives in this Layer, not in a separate host, so
 * `Capability.serve(Clipboard.capability)` gives a document exactly the rules a main-side call
 * obeys.
 */
export const native = (
  policy: Clipboard.Policy,
): Layer.Layer<typeof Clipboard.capability, SewedError, MainContext> =>
  Capability.fromHandlers(Clipboard.capability, (implement) =>
    implement(
      Effect.map(ClipboardPolicy.operations(policy, core), (operations) => ({
        read: ({ format }) => operations.read(format),
        write: ({ content }) => operations.write(content),
        formats: () => operations.formats,
        clear: () => operations.clear,
      })),
    ),
  );
