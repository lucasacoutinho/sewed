import type { MessageEvent, MessagePortMain } from "electron";
import { scopedConnection } from "../Runtime.ts";
import { SewedError } from "../SewedError.ts";
import type { Connection } from "./Transport.ts";

/** The MessagePortMain surface shared by main and an Electron utility child. */
export type ElectronPortLike = Pick<
  MessagePortMain,
  "on" | "off" | "once" | "postMessage" | "close" | "start"
>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isElectronPort = (value: unknown): value is ElectronPortLike =>
  isObject(value) &&
  typeof value.on === "function" &&
  typeof value.off === "function" &&
  typeof value.once === "function" &&
  typeof value.postMessage === "function" &&
  typeof value.close === "function" &&
  typeof value.start === "function";

export const electronPort = (port: ElectronPortLike): Connection => {
  let closed = false;
  port.once("close", () => {
    closed = true;
  });
  return {
    send(message) {
      if (closed) throw new SewedError({ code: "Closed", message: "Utility port is closed" });
      port.postMessage(message);
    },
    subscribe(receive, close) {
      let settled = false;
      const onClose = () => {
        if (settled) return;
        settled = true;
        close(new SewedError({ code: "Closed", message: "Utility owner disconnected" }));
      };
      const onMessage = (event: MessageEvent) => receive(event.data);
      if (closed) onClose();
      port.on("message", onMessage);
      port.on("close", onClose);
      try {
        port.start();
      } catch (cause) {
        onClose();
        throw new SewedError({
          code: "Protocol",
          message: "Utility message port could not start",
          cause,
        });
      }
      return () => {
        port.off("message", onMessage);
        port.off("close", onClose);
      };
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        port.close();
      } catch {
        // Native teardown is already terminal from the transport's perspective.
      }
    },
  };
};

export const connectElectronPort = (
  createChannel: () => { readonly port1: MessagePortMain; readonly port2: MessagePortMain },
  transfer: (port: MessagePortMain) => void,
) =>
  scopedConnection(() => {
    const channel = createChannel();
    try {
      transfer(channel.port2);
      return electronPort(channel.port1);
    } catch (cause) {
      try {
        channel.port1.close();
      } catch {
        // Preserve the transfer failure.
      }
      try {
        channel.port2.close();
      } catch {
        // Preserve the transfer failure.
      }
      throw cause;
    }
  });
