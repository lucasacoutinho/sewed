import { isAbsolute } from "node:path";
import type { WebContents as NativeContents } from "electron";
import { Effect, Schema } from "effect";
import { UdpPortRange, WebRtcIpHandlingPolicy } from "../WebContents.ts";
import type { FrameInfo, Printer, SharedWorker, WebRtc } from "../WebContents.ts";
import { decoded, protocolError } from "./ProtocolError.ts";
import type { Control } from "./WebContentsCore.ts";

const decodeString = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
const decodeBoolean = Schema.decodeUnknownSync(Schema.Boolean);
const decodePolicy = Schema.decodeUnknownSync(WebRtcIpHandlingPolicy);
const decodeRange = Schema.decodeUnknownSync(UdpPortRange);

const frameInfo = (frame: Electron.WebFrameMain): FrameInfo => ({
  processId: frame.processId,
  routingId: frame.routingId,
  frameTreeNodeId: frame.frameTreeNodeId,
  token: frame.frameToken,
  osProcessId: frame.osProcessId,
  isMainFrame: frame.parent === null,
  parent: frame.parent === null ? null : frame.parent.routingId,
  url: frame.url,
  origin: frame.origin,
  name: frame.name,
  visibilityState: frame.visibilityState,
});

/**
 * What a web contents can tell about itself beyond its page: its frames, its workers and
 * printers, its WebRTC network settings, and the folders DevTools may edit. Reads copy plain data
 * out of Electron's objects; none is handed over.
 */
export const make = (
  native: NativeContents,
  control: Pick<Control, "operation" | "asynchronous">,
) => {
  const { operation, asynchronous } = control;
  const absolute = (path: string, what: string) =>
    decoded(`Invalid ${what}`, () => {
      if (!isAbsolute(decodeString(path))) throw protocolError(`${what} must be absolute`);
      return path;
    });
  return {
    /** Every frame of the page right now, the main frame first. */
    frameTree: operation((): ReadonlyArray<FrameInfo> => {
      const main = native.mainFrame;
      return [main, ...main.framesInSubtree.filter((frame) => frame !== main)].map(frameInfo);
    }),
    /** Chromium's own id for the page's renderer process; `state` carries the operating system's. */
    rendererProcessId: operation(() => native.getProcessId()),
    sharedWorkers: operation((): ReadonlyArray<SharedWorker> =>
      native.getAllSharedWorkers().map(({ id, url }) => ({ id, url })),
    ),
    /** Opens DevTools for one shared worker, by the id `sharedWorkers` reports. */
    inspectSharedWorker: (id: string) =>
      Effect.andThen(
        decoded("Invalid shared worker id", () => decodeString(id)),
        (value) =>
          operation(() => {
            native.inspectSharedWorkerById(value);
          }),
      ),
    /** The id a remote DevTools client names this page by. */
    devToolsTargetId: operation(() => native.getOrCreateDevToolsTargetId()),
    /** Lets DevTools read and edit a folder on disk, by absolute path. */
    addDevToolsWorkspace: (path: string) =>
      Effect.andThen(absolute(path, "Workspace path"), (value) =>
        operation(() => {
          native.addWorkSpace(value);
        }),
      ),
    removeDevToolsWorkspace: (path: string) =>
      Effect.andThen(absolute(path, "Workspace path"), (value) =>
        operation(() => {
          native.removeWorkSpace(value);
        }),
      ),
    printers: asynchronous("Could not list printers", async (): Promise<ReadonlyArray<Printer>> =>
      (await native.getPrintersAsync()).map(({ name, displayName, description }) => ({
        name,
        displayName,
        description,
      })),
    ),
    webRtc: operation((): WebRtc => {
      const range = native.getWebRTCUDPPortRange();
      return {
        ipHandlingPolicy: native.getWebRTCIPHandlingPolicy(),
        udpPortRange: { min: range.min, max: range.max },
      };
    }),
    /** Which network interfaces WebRTC may reveal. */
    setWebRtcIpHandlingPolicy: (policy: WebRtcIpHandlingPolicy) =>
      Effect.andThen(
        decoded("Invalid WebRTC policy", () => decodePolicy(policy)),
        (value) =>
          operation(() => {
            native.setWebRTCIPHandlingPolicy(value);
          }),
      ),
    setWebRtcUdpPortRange: (range: UdpPortRange) =>
      Effect.andThen(
        decoded("Invalid UDP port range", () => decodeRange(range)),
        (value) =>
          operation(() => {
            native.setWebRTCUDPPortRange({ ...value });
          }),
      ),
    /** Whether the page is navigated with a text caret, as F7 toggles in a browser. */
    caretBrowsing: operation(() => native.isCaretBrowsingEnabled()),
    setCaretBrowsing: (enabled: boolean) =>
      Effect.andThen(
        decoded("Invalid caret browsing flag", () => decodeBoolean(enabled)),
        (value) =>
          operation(() => {
            native.setCaretBrowsingEnabled(value);
          }),
      ),
  };
};
