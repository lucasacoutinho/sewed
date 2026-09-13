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

/** A structural session: records the listener per stage and lets a test fire one request. */
export const fakeSession = (blobs: Record<string, Uint8Array> = {}) => {
  const listeners = new Map<string, Listener | null>();
  const webRequest = Object.fromEntries(
    stages.map((stage) => [
      stage,
      (filter: unknown, listener?: Listener) => {
        listeners.set(stage, filter === null ? null : (listener ?? null));
      },
    ]),
  );
  const structural = {
    webRequest,
    getBlobData: (id: string) =>
      id in blobs
        ? Promise.resolve(Buffer.from(blobs[id] ?? new Uint8Array()))
        : Promise.reject(new Error(`no blob ${id}`)),
  };
  // Test-only bridge: the library reads these members structurally; Electron's class is not loadable in Node.
  const native = structural as unknown as Session;
  const fire = (stage: (typeof stages)[number], overrides: Record<string, unknown>) =>
    new Promise<unknown>((resolve, reject) => {
      const listener = listeners.get(stage);
      if (!listener) return reject(new Error(`${stage} has no listener`));
      listener(requestDetails(overrides) as never, resolve);
    });
  return { native, fire, listeners };
};
