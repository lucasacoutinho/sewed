import { MessageChannel, type MessagePort } from "node:worker_threads";
import { scopedConnection } from "../Runtime.ts";
import { SewedError } from "../SewedError.ts";
import type { Connection } from "./Transport.ts";

export const connectPort = (transfer: (port: MessagePort) => void) =>
  scopedConnection(() => {
    const { port1, port2 } = new MessageChannel();
    try {
      transfer(port2);
      return nodePort(port1);
    } catch (cause) {
      port1.close();
      port2.close();
      throw cause;
    }
  });

export const nodePort = (port: MessagePort): Connection => {
  let closed = false;
  port.once("close", () => {
    closed = true;
  });
  return {
    send(message) {
      if (closed) throw new SewedError({ code: "Closed", message: "Worker port is closed" });
      port.postMessage(message);
    },
    subscribe(receive, close) {
      const onClose = () =>
        close(new SewedError({ code: "Closed", message: "Worker owner disconnected" }));
      const onError = (cause: unknown) =>
        close(
          new SewedError({
            code: "Protocol",
            message: "Worker message could not be cloned",
            cause,
          }),
        );
      // A subscriber's throw must end this connection, never escape into the thread's event loop,
      // where it would take down the worker and every other connection it serves.
      const onMessage = (message: unknown) => {
        try {
          receive(message);
        } catch (cause) {
          close(
            new SewedError({
              code: "Protocol",
              message: "Worker message could not be handled",
              cause,
            }),
          );
        }
      };
      if (closed) onClose();
      port.on("message", onMessage);
      port.on("close", onClose);
      port.on("messageerror", onError);
      return () => {
        port.off("message", onMessage);
        port.off("close", onClose);
        port.off("messageerror", onError);
      };
    },
    close() {
      closed = true;
      port.close();
    },
  };
};
