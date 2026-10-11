import { isAbsolute } from "node:path";
import type { WebContents as NativeContents } from "electron";
import { Effect, Schema } from "effect";
import {
  FrameAddress,
  UdpPortRange,
  WebRtcIpHandlingPolicy,
  ZoomLevel,
  ZoomMode,
} from "../WebContents.ts";
import type { FrameInfo, Printer, SharedWorker, WebRtc } from "../WebContents.ts";
import * as ContentsRegistry from "./ContentsRegistry.ts";
import { decoded, protocolError } from "./ProtocolError.ts";
import type { Control } from "./WebContentsCore.ts";

const decodeString = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
const decodeBoolean = Schema.decodeUnknownSync(Schema.Boolean);
const decodePolicy = Schema.decodeUnknownSync(WebRtcIpHandlingPolicy);
const decodeRange = Schema.decodeUnknownSync(UdpPortRange);
const decodeZoomLevel = Schema.decodeUnknownSync(ZoomLevel);
const decodeZoomMode = Schema.decodeUnknownSync(ZoomMode);
const decodeFrameAddress = Schema.decodeUnknownSync(FrameAddress);

const frameInfo = (frame: Electron.WebFrameMain): FrameInfo => ({
  processId: frame.processId,
  routingId: frame.routingId,
  frameTreeNodeId: frame.frameTreeNodeId,
  token: frame.frameToken,
  osProcessId: frame.osProcessId,
  isMainFrame: frame.parent === null,
  parent: frame.parent === null ? null : frame.parent.routingId,
  top: frame.top === null ? null : frame.top.routingId,
  detached: frame.detached,
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
    /** The frame that opened this page with `window.open`, while it still exists. */
    opener: operation((): FrameInfo | null =>
      native.opener === null ? null : frameInfo(native.opener),
    ),
    /** The frame that has keyboard focus inside the page. */
    focusedFrame: operation((): FrameInfo | null =>
      native.focusedFrame === null ? null : frameInfo(native.focusedFrame),
    ),
    /** The Sewed id of the owner of the web contents hosting this one, for a hosted page. */
    hostId: operation((): string | null => {
      const host = native.hostWebContents;
      return host === null ? null : (ContentsRegistry.handleIdOf(host.id) ?? null);
    }),
    /** The native id of the web contents DevTools is shown in, while it is open. */
    devToolsContentsId: operation((): number | null =>
      native.devToolsWebContents === null ? null : native.devToolsWebContents.id,
    ),
    /**
     * The JavaScript call stack of the main frame, for a page that stopped responding; `null`
     * when Chromium has none to give. Electron marks this experimental.
     */
    collectJavaScriptCallStack: asynchronous(
      "Could not collect the call stack",
      async (): Promise<string | null> => {
        const stack = await native.mainFrame.collectJavaScriptCallStack();
        return typeof stack === "string" ? stack : null;
      },
    ),
    /**
     * One frame of this page, named as `frameTree` names it, for what can be asked of a single
     * frame. Each operation finds the frame again and fails `Protocol` once the page no longer has
     * it; a frame of another page is never reached from here.
     */
    frame: (identity: FrameAddress) => {
      const find = (): Electron.WebFrameMain => {
        let address: FrameAddress;
        try {
          address = decodeFrameAddress(identity);
        } catch (cause) {
          throw protocolError("Invalid frame", cause);
        }
        const main = native.mainFrame;
        const found = [main, ...main.framesInSubtree].find(
          (frame) => frame.processId === address.processId && frame.routingId === address.routingId,
        );
        if (found === undefined) throw protocolError("The page has no such frame");
        return found;
      };
      return {
        info: operation((): FrameInfo => frameInfo(find())),
        /** Reloads the frame alone; `Native` when Chromium refuses. */
        reload: operation(() => {
          if (!find().reload()) throw new Error("The frame could not be reloaded");
        }),
        collectJavaScriptCallStack: asynchronous(
          "Could not collect the call stack",
          async (): Promise<string | null> => {
            const stack = await find().collectJavaScriptCallStack();
            return typeof stack === "string" ? stack : null;
          },
        ),
      };
    },
    /** The zoom as Chromium's level, beside the factor the `zoom` stream carries. */
    zoomLevel: operation(() => native.getZoomLevel()),
    setZoomLevel: (level: ZoomLevel) =>
      Effect.andThen(
        decoded("Invalid zoom level", () => decodeZoomLevel(level)),
        (value) =>
          operation(() => {
            native.setZoomLevel(value);
          }),
      ),
    zoomMode: operation((): ZoomMode => native.getZoomMode()),
    setZoomMode: (mode: ZoomMode) =>
      Effect.andThen(
        decoded("Invalid zoom mode", () => decodeZoomMode(mode)),
        (value) =>
          operation(() => {
            native.setZoomMode(value);
          }),
      ),
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
