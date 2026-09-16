import type * as Download from "../Download.ts";
import type { Decision, Offer } from "../Download.ts";
import type * as Dialog from "../Dialog.ts";
import { adopt, type AdoptableItem } from "./DownloadItem.ts";

interface Item extends AdoptableItem {
  getURL(): string;
  getFilename(): string;
  getMimeType(): string;
  setSavePath(path: string): void;
  setSaveDialogOptions(options: Electron.SaveDialogOptions): void;
}
type Listener = (
  event: { preventDefault(): void },
  item: Item,
  contents: { readonly id: number },
) => void;

/** The structural subset of a native session the download dispatch listens on. */
export interface SessionLike {
  on(event: "will-download", listener: Listener): unknown;
  off(event: "will-download", listener: Listener): unknown;
}

/**
 * One web contents' download posture. `decide` is normally filled from the owner's own
 * `Decidables.WebContents.Download` registry resolution (`internal/WebContents.ts`,
 * `internal/GuestView.ts`) rather than a caller's function, so it already denies, prompts, or saves
 * on its own terms — including the "fails or suspends" case, which the registry's own resolution
 * treats as a broken decider and answers the fallback for. `undefined` still denies outright, for an
 * entry constructed with no registry behind it at all.
 */
export interface Entry {
  readonly sourceId: string;
  readonly onBlocked: (url: string) => void;
  decide: ((offer: Offer) => Decision) | undefined;
  onAccepted: (handle: Download.Handle) => void;
}

interface Registry {
  readonly entries: Map<number, Entry>;
  readonly listener: Listener;
}

const registries = new WeakMap<SessionLike, Registry>();

/** Copies validated save dialog options into Electron's mutable shape. */
const saveDialogOptions = (dialog: Dialog.SaveOptions): Electron.SaveDialogOptions => ({
  ...(dialog.title === undefined ? {} : { title: dialog.title }),
  ...(dialog.defaultPath === undefined ? {} : { defaultPath: dialog.defaultPath }),
  ...(dialog.buttonLabel === undefined ? {} : { buttonLabel: dialog.buttonLabel }),
  ...(dialog.filters === undefined
    ? {}
    : {
        filters: dialog.filters.map((filter) => ({
          name: filter.name,
          extensions: [...filter.extensions],
        })),
      }),
});

const offerOf = (item: Item, sourceId: string): Offer => ({
  url: item.getURL(),
  filename: item.getFilename(),
  mimeType: item.getMimeType(),
  totalBytes: item.getTotalBytes(),
  sourceId,
});

const registryOf = (session: SessionLike): Registry => {
  const existing = registries.get(session);
  if (existing !== undefined) return existing;
  const entries = new Map<number, Entry>();
  const listener: Listener = (event, item, contents) => {
    const entry = entries.get(contents.id);
    if (entry === undefined) return;
    const decision =
      entry.decide === undefined ? undefined : entry.decide(offerOf(item, entry.sourceId));
    if (decision === undefined || decision.kind === "deny") {
      event.preventDefault();
      entry.onBlocked(item.getURL());
      return;
    }
    try {
      if (decision.kind === "save") item.setSavePath(decision.path);
      else if (decision.dialog !== undefined)
        item.setSaveDialogOptions(saveDialogOptions(decision.dialog));
    } catch {
      event.preventDefault();
      entry.onBlocked(item.getURL());
      return;
    }
    entry.onAccepted(adopt(item));
  };
  const registry: Registry = { entries, listener };
  registries.set(session, registry);
  session.on("will-download", listener);
  return registry;
};

/** Registers a web contents; the listener leaves with the last registered contents on the session. */
export const install = (session: SessionLike, contentsId: number, entry: Entry): (() => void) => {
  const registry = registryOf(session);
  registry.entries.set(contentsId, entry);
  return () => {
    if (registry.entries.get(contentsId) !== entry) return;
    registry.entries.delete(contentsId);
    if (registry.entries.size === 0) {
      session.off("will-download", registry.listener);
      registries.delete(session);
    }
  };
};
