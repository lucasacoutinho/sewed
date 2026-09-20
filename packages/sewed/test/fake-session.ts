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
 * A structural session: records the listener and the filter per stage, lets a test fire one request
 * at any of them, and carries everything `internal/Session.ts`'s `fromNative` reads at acquisition,
 * so one fake drives both the request stages and the handle that installs deciders on them.
 *
 * `blobReads` counts what reached `getBlobData`, which is how a test tells "a blob is read at most
 * once per request" from "each install reads it again".
 */
export const fakeSession = (blobs: Record<string, Uint8Array> = {}) => {
  const listeners = new Map<string, Listener | null>();
  const filters = new Map<string, unknown>();
  let blobReads = 0;
  const webRequest = Object.fromEntries(
    stages.map((stage) => [
      stage,
      (filter: unknown, listener?: Listener) => {
        listeners.set(stage, filter === null ? null : (listener ?? null));
        filters.set(stage, filter === null ? null : filter);
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
  };
};
