import type { Context } from "effect";
import { Effect, Exit, Schema } from "effect";
import type * as Download from "../Download.ts";
import { DownloadDecision, type DownloadOffer } from "../GuestView.ts";
import type { SewedError } from "../SewedError.ts";
import { adopt, type AdoptableItem } from "./DownloadItem.ts";

interface Item extends AdoptableItem {
  getURL(): string;
  getFilename(): string;
  getMimeType(): string;
  setSavePath(path: string): void;
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

/** One guest's download posture; without a decider every download is denied. */
export interface Entry {
  readonly sourceId: string;
  readonly onBlocked: (url: string) => void;
  decide: ((offer: DownloadOffer) => DownloadDecision) | undefined;
  onAccepted: (handle: Download.Handle) => void;
}

interface Registry {
  readonly entries: Map<number, Entry>;
  readonly listener: Listener;
}

const registries = new WeakMap<SessionLike, Registry>();
const decodeDecision = Schema.decodeUnknownSync(DownloadDecision);

/**
 * Runs an Effect decider to completion synchronously with the installing Effect's services.
 * Electron honors the veto and the save path only inside its callback, so a decider that fails
 * or suspends denies the download.
 */
export const deciderSync =
  <R>(
    decide: (offer: DownloadOffer) => Effect.Effect<DownloadDecision, SewedError, R>,
    context: Context.Context<R>,
  ) =>
  (offer: DownloadOffer): DownloadDecision => {
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

const offerOf = (item: Item, sourceId: string): DownloadOffer => ({
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
      item.setSavePath(decision.path);
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

/** Registers a guest's contents; the listener leaves with the last guest on the session. */
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
