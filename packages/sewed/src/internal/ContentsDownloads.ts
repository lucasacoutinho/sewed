import type { Context } from "effect";
import { Effect, Exit, Schema } from "effect";
import type * as Download from "../Download.ts";
import { Decision, type Offer } from "../Download.ts";
import type * as Dialog from "../Dialog.ts";
import type { SewedError } from "../SewedError.ts";
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

/** One web contents' download posture; while registered without a decider, its downloads are denied. */
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
const decodeDecision = Schema.decodeUnknownSync(Decision);

/**
 * Runs an Effect decider to completion synchronously with the installing Effect's services.
 * Electron honors the veto and the save path only inside its callback, so a decider that fails
 * or suspends denies the download.
 */
export const deciderSync =
  <R>(
    decide: (offer: Offer) => Effect.Effect<Decision, SewedError, R>,
    context: Context.Context<R>,
  ) =>
  (offer: Offer): Decision => {
    const exit = Effect.runSyncExitWith(context)(
      Effect.suspend(() => decide(offer)).pipe(Effect.map((decision) => decodeDecision(decision))),
    );
    if (Exit.isSuccess(exit)) return exit.value;
    Effect.runFork(
      Effect.logError(
        "Download decider failed or did not complete synchronously; download denied",
        exit.cause,
      ),
    );
    return { kind: "deny" };
  };

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
