import type * as Download from "../Download.ts";
import type { Decision, Offer } from "../Download.ts";
import type * as Dialog from "../Dialog.ts";
import { adopt, type AdoptableItem } from "./DownloadItem.ts";
import * as Decidables from "../Decidables.ts";
import * as DecisionRegistry from "./DecisionRegistry.ts";

interface Item extends AdoptableItem {
  getURL(): string;
  getFilename(): string;
  getMimeType(): string;
  getURLChain(): string[];
  hasUserGesture(): boolean;
  getContentDisposition(): string;
  setSavePath(path: string): void;
  setSaveDialogOptions(options: Electron.SaveDialogOptions): void;
}
type Listener = (
  event: { preventDefault(): void },
  item: Item,
  // Absent for a download no web contents started, such as one a session resumes.
  contents: { readonly id: number } | null | undefined,
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
export interface Governor {
  readonly sourceId: string;
  readonly onBlocked: (url: string) => void;
  decide: ((offer: Offer) => Decision) | undefined;
}

/** Receives each download a contents' governor accepted. */
export type Observer = (handle: Download.Handle) => void;

/**
 * What one session's single native listener dispatches to, keyed by contents id. Governing and
 * receiving are registered apart: a decider governs with nobody subscribed, and a subscriber to a
 * guest receives under the governance its construction installed. Each value is a list because a
 * contents registers more than once: a window's `downloads` stream registers per *subscription*,
 * and keyed by id alone a second subscriber replaced the first and took its governance with it.
 */
interface Registry {
  readonly governors: Map<number, Governor[]>;
  readonly observers: Map<number, Observer[]>;
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
  urlChain: [...item.getURLChain()],
  userGesture: item.hasUserGesture(),
  contentDisposition: item.getContentDisposition(),
});

const registryOf = (session: SessionLike): Registry => {
  const existing = registries.get(session);
  if (existing !== undefined) return existing;
  const governors = new Map<number, Governor[]>();
  const observers = new Map<number, Observer[]>();
  const listener: Listener = (event, item, contents) => {
    // One download is one decision and one denial, however many subscribers a contents has: the
    // registration that engaged the listener is the one asked, and governance passes to the next
    // when it ends. In production every registration for one contents resolves the same decidable
    // against the same registry, so which one is asked changes nothing but who publishes.
    if (contents === null || contents === undefined) return;
    const [governing] = governors.get(contents.id) ?? [];
    if (governing === undefined) return;
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
    // Adopt once and hand the same handle to every observer: two handles over one item would each
    // attach their own native listeners and report the same progress. An item nobody can receive
    // is not adopted. Snapshotted, because an observer that ends its own subscription would
    // otherwise splice the list this walks.
    const receivers = [...(observers.get(contents.id) ?? [])];
    if (receivers.length === 0) return;
    const handle = adopt(item);
    for (const receive of receivers) receive(handle);
  };
  const registry: Registry = { governors, observers, listener };
  registries.set(session, registry);
  session.on("will-download", listener);
  return registry;
};

/**
 * Adds one registration. The native listener is engaged by the first registration on the session
 * and leaves with the last, counting every registration rather than every contents: a second
 * subscription to one document must not be able to end the first's governance.
 */
const register = <T>(
  session: SessionLike,
  select: (registry: Registry) => Map<number, T[]>,
  contentsId: number,
  value: T,
): (() => void) => {
  const registry = registryOf(session);
  const registrations = select(registry);
  const registered = registrations.get(contentsId);
  if (registered === undefined) registrations.set(contentsId, [value]);
  else registered.push(value);
  return () => {
    const remaining = registrations.get(contentsId);
    const index = remaining?.indexOf(value) ?? -1;
    if (remaining === undefined || index === -1) return;
    remaining.splice(index, 1);
    if (remaining.length === 0) registrations.delete(contentsId);
    if (registry.governors.size === 0 && registry.observers.size === 0) {
      session.off("will-download", registry.listener);
      registries.delete(session);
    }
  };
};

/** Governs a web contents' downloads until the returned function is called. */
export const install = (
  session: SessionLike,
  contentsId: number,
  governor: Governor,
): (() => void) => register(session, (registry) => registry.governors, contentsId, governor);

/** Receives the downloads a web contents' governor accepts. Without a governor nothing arrives. */
export const observe = (
  session: SessionLike,
  contentsId: number,
  onAccepted: Observer,
): (() => void) => register(session, (registry) => registry.observers, contentsId, onAccepted);

/**
 * Keeps the native download dispatch installed while this decidable has at least one decider. The
 * governor is built at the moment the first decider attaches, after the owner registry exists.
 */
export const hook = (
  session: SessionLike,
  contentsId: number,
  governor: () => Governor,
): DecisionRegistry.Hook => {
  let uninstall: (() => void) | undefined;
  return DecisionRegistry.hook(Decidables.WebContents.Download, {
    attach: () => {
      uninstall = install(session, contentsId, governor());
    },
    detach: () => {
      const attached = uninstall;
      uninstall = undefined;
      attached?.();
    },
  });
};
