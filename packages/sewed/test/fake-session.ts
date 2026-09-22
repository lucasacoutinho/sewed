import { EventEmitter } from "node:events";
import type { Session } from "electron";

type Listener = (details: never, callback: (response: unknown) => void) => void;

const requestDetails = (overrides: Record<string, unknown>) => ({
  id: 1,
  url: "https://example.com/submit",
  method: "POST",
  resourceType: "xhr",
  referrer: "",
  timestamp: 0,
  ...overrides,
});

const stages = [
  "onBeforeRequest",
  "onBeforeSendHeaders",
  "onHeadersReceived",
  "onSendHeaders",
  "onResponseStarted",
  "onBeforeRedirect",
  "onCompleted",
  "onErrorOccurred",
] as const;

export type NativeStage = (typeof stages)[number];

/**
 * Answers an `Error` to make the *next* registration on a stage throw instead of installing, or
 * `undefined` to let it through. A predicate rather than a one-shot flag: consulted again on every
 * later registration attempt on that stage, so a test can keep refusing past the first throw — the
 * restore `WebRequest.ts` runs after a refused install re-registers the survivors on the same
 * stage, and a test needs to be able to refuse that re-registration too.
 */
type Refusal = (filter: unknown) => Error | undefined;

/**
 * A structural session: records the listener and the filter per stage, lets a test fire one request
 * at any of them, and carries everything `internal/Session.ts`'s `fromNative` reads at acquisition,
 * so one fake drives both the request stages and the handle that installs deciders on them.
 *
 * `blobReads` counts what reached `getBlobData`, which is how a test tells "a blob is read at most
 * once per request" from "each install reads it again".
 *
 * `refuse` models what `.artifacts/probe-refused-registration` found Electron 44.3.0 doing for a
 * `urls` pattern Sewed's own schema accepts but Electron refuses: the previous listener and filter
 * for that stage are discarded before the throw, not left in place. That clobber is the dangerous
 * case `WebRequest.ts`'s restore exists to undo, so the fake reproduces it unconditionally on every
 * refusal rather than only for the one native `"other"` case where Electron validates first.
 */
export const fakeSession = (blobs: Record<string, Uint8Array> = {}) => {
  const listeners = new Map<string, Listener | null>();
  const filters = new Map<string, unknown>();
  const refusals = new Map<NativeStage, Refusal>();
  let blobReads = 0;
  const webRequest = Object.fromEntries(
    stages.map((stage) => [
      stage,
      (filter: unknown, listener?: Listener) => {
        if (filter === null) {
          listeners.set(stage, null);
          filters.set(stage, null);
          return;
        }
        const refused = refusals.get(stage)?.(filter);
        if (refused !== undefined) {
          listeners.set(stage, null);
          filters.set(stage, null);
          throw refused;
        }
        listeners.set(stage, listener ?? null);
        filters.set(stage, filter);
      },
    ]),
  );
  const emitter = Object.assign(new EventEmitter(), {
    webRequest,
    getBlobData: (id: string) => {
      blobReads += 1;
      return id in blobs
        ? Promise.resolve(Buffer.from(blobs[id] ?? new Uint8Array()))
        : Promise.reject(new Error(`no blob ${id}`));
    },
    setPermissionCheckHandler: () => {},
    setPermissionRequestHandler: () => {},
    setDevicePermissionHandler: () => {},
    setCertificateVerifyProc: () => {},
    setDisplayMediaRequestHandler: () => {},
  });
  // Test-only bridge: the library reads these members structurally; Electron's class is not loadable in Node.
  const native = emitter as unknown as Session;
  const listenerFor = (stage: NativeStage) => {
    const listener = listeners.get(stage);
    if (!listener) throw new Error(`${stage} has no listener`);
    return listener;
  };
  /** Fires a deciding stage and resolves with whatever the library answered Electron. */
  const fire = (stage: NativeStage, overrides: Record<string, unknown> = {}) =>
    new Promise<unknown>((resolve, reject) => {
      try {
        listenerFor(stage)(requestDetails(overrides) as never, resolve);
      } catch (cause) {
        reject(cause);
      }
    });
  /** Fires an observation stage, which Electron hands no callback and expects no answer from. */
  const emit = (stage: NativeStage, overrides: Record<string, unknown> = {}) => {
    listenerFor(stage)(requestDetails(overrides) as never, () => {});
  };
  return {
    native,
    fire,
    emit,
    listeners,
    /** The filter the library last handed Electron for `stage`, or `null` once it uninstalled it. */
    filterFor: (stage: NativeStage) => filters.get(stage),
    blobReads: () => blobReads,
    /**
     * Makes every registration on `stage` consult `predicate` from now on, replacing whichever
     * predicate (if any) was set before. `null`/uninstall calls on the stage are never consulted —
     * refusing a registration models Electron rejecting a *filter*, not the library asking to stop
     * listening.
     */
    refuse: (stage: NativeStage, predicate: Refusal) => {
      refusals.set(stage, predicate);
    },
  };
};
