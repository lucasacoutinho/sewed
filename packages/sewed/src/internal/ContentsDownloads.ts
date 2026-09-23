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
  /**
   * Readonly, so a second receiver is a second registration rather than an overwrite of this one.
   * `internal/GuestView.ts` used to assign it per subscription and reset it on each end, which left
   * the surviving subscriber of any overlap receiving nothing at all, permanently.
   */
  readonly onAccepted: (handle: Download.Handle) => void;
}

/**
 * The registrations one session's single native listener dispatches to, keyed by contents id. The
 * value is a list rather than one entry because a web contents can be registered more than once: a
 * window's `downloads` stream registers per *subscription*, so two subscribers to one document
 * register twice. Keyed by id alone, the second replaced the first and its own removal took the
 * native listener with it, leaving the remaining subscriber's downloads ungoverned — a download its
 * decider denied then proceeded, and nothing reached `blocked`.
 */
interface Registry {
  readonly entries: Map<number, Entry[]>;
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
  ...(dialog.properties === undefined ? {} : { properties: [...dialog.properties] }),
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
  const entries = new Map<number, Entry[]>();
  const listener: Listener = (event, item, contents) => {
    const registered = entries.get(contents.id);
    // One download is one decision and one denial, however many subscribers a contents has: the
    // registration that engaged the listener is the one asked, and governance passes to the next
    // when it ends. In production every registration for one contents resolves the same decidable
    // against the same registry, so which one is asked changes nothing but who publishes.
    const [governing] = registered ?? [];
    if (registered === undefined || governing === undefined) return;
    const decision =
      governing.decide === undefined
        ? undefined
        : governing.decide(offerOf(item, governing.sourceId));
    if (decision === undefined || decision.kind === "deny") {
      event.preventDefault();
      governing.onBlocked(item.getURL());
      return;
    }
    try {
      if (decision.kind === "save") item.setSavePath(decision.path);
      else if (decision.dialog !== undefined)
        item.setSaveDialogOptions(saveDialogOptions(decision.dialog));
    } catch {
      event.preventDefault();
      governing.onBlocked(item.getURL());
      return;
    }
    // Adopted once and handed to everyone: two handles over one item would each attach their own
    // native listeners and each report the same progress. Snapshotted, because an `onAccepted` that
    // ends its own subscription would otherwise splice the list this walks.
    const handle = adopt(item);
    for (const entry of [...registered]) entry.onAccepted(handle);
  };
  const registry: Registry = { entries, listener };
  registries.set(session, registry);
  session.on("will-download", listener);
  return registry;
};

/**
 * Registers a web contents. The native listener is engaged by the first registration on the session
 * and leaves with the last, counting every registration rather than every contents: a second
 * subscription to one document must not be able to end the first's governance.
 */
export const install = (session: SessionLike, contentsId: number, entry: Entry): (() => void) => {
  const registry = registryOf(session);
  const registered = registry.entries.get(contentsId);
  if (registered === undefined) registry.entries.set(contentsId, [entry]);
  else registered.push(entry);
  return () => {
    const remaining = registry.entries.get(contentsId);
    if (remaining === undefined) return;
    const index = remaining.indexOf(entry);
    if (index === -1) return;
    remaining.splice(index, 1);
    if (remaining.length !== 0) return;
    registry.entries.delete(contentsId);
    if (registry.entries.size === 0) {
      session.off("will-download", registry.listener);
      registries.delete(session);
    }
  };
};
