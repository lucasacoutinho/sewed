import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { Bridge } from "./Bridge.ts";

const ports = new Map<string, MessagePort>();
const subscribers = new Map<string, Set<(packet: unknown) => void>>();
const waiting = new Map<
  string,
  { readonly resolve: () => void; readonly reject: (error: Error) => void }
>();
let session: string | undefined;
let observing = false;
const emit = (connection: string, packet: unknown) => {
  const receivers = subscribers.get(connection);
  if (receivers !== undefined) for (const receive of receivers) receive(packet);
};
const close = (id: string) => {
  const port = ports.get(id);
  ports.delete(id);
  if (port) {
    port.onmessage = null;
    port.close();
  }
  waiting.get(id)?.reject(new Error("Binding port closed"));
  waiting.delete(id);
};
const disconnect = () => {
  for (const id of ports.keys()) close(id);
  for (const id of waiting.keys()) close(id);
};

ipcRenderer.on("sewed:port", (event, value: unknown) => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("session" in value) ||
    !("connection" in value) ||
    value.session !== session ||
    typeof value.connection !== "string" ||
    event.ports.length !== 1 ||
    !waiting.has(value.connection)
  ) {
    for (const port of event.ports) port.close();
    return;
  }
  const id = value.connection;
  const port = event.ports[0]!;
  if (ports.has(id)) {
    port.close();
    return;
  }
  ports.set(id, port);
  port.onmessage = (event) => emit(id, { connection: id, message: event.data });
  port.addEventListener(
    "close",
    () => {
      close(id);
      emit(id, { connection: id, error: "Binding port closed" });
    },
    { once: true },
  );
  port.start();
  waiting.get(id)?.resolve();
  waiting.delete(id);
});
ipcRenderer.on("sewed:packet", (_event, packet: unknown) => {
  if (
    typeof packet === "object" &&
    packet !== null &&
    "connection" in packet &&
    typeof packet.connection === "string"
  ) {
    if ("error" in packet) close(packet.connection);
    emit(packet.connection, packet);
  } else {
    for (const receivers of subscribers.values()) for (const receive of receivers) receive(packet);
  }
});

const bridge: Bridge = {
  async hello() {
    disconnect();
    const reply: unknown = await ipcRenderer.invoke("sewed:hello");
    if (
      typeof reply === "object" &&
      reply !== null &&
      "session" in reply &&
      typeof reply.session === "string"
    )
      session = reply.session;
    return reply;
  },
  async open(token, slot, id) {
    if (
      token !== session ||
      ports.size + waiting.size >= 128 ||
      typeof id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(id) ||
      ports.has(id) ||
      waiting.has(id)
    )
      throw new Error("Invalid binding port request");
    const ready = new Promise<void>((resolve, reject) => {
      waiting.set(id, { resolve, reject });
    });
    try {
      const opening = ipcRenderer.invoke("sewed:open", token, slot, id).then((opened: unknown) => {
        // Let the renderer validate malformed replies without waiting for a port that cannot arrive.
        if (opened !== id) waiting.get(id)?.resolve();
        return opened;
      });
      const [opened] = await Promise.all([opening, ready]);
      if (opened !== id) {
        close(id);
        return opened;
      }
      if (token !== session || !ports.has(id)) throw new Error("Binding port closed while opening");
      return id;
    } catch (error) {
      close(id);
      ipcRenderer.send("sewed:close", token, id);
      throw error;
    }
  },
  send(token, connection, message) {
    const port = token === session ? ports.get(connection) : undefined;
    if (!port) throw new Error("Binding port is closed");
    port.postMessage(message);
  },
  async observe(token, batch) {
    if (token !== session || observing || typeof batch !== "string" || batch.length > 256 * 1024)
      throw new Error("Invalid diagnostic batch");
    observing = true;
    try {
      await ipcRenderer.invoke("sewed:observe", token, batch);
    } finally {
      observing = false;
    }
  },
  close(token, connection) {
    if (token !== session) return;
    close(connection);
    ipcRenderer.send("sewed:close", token, connection);
  },
  disconnect(token) {
    if (token !== session) return;
    disconnect();
    session = undefined;
    ipcRenderer.send("sewed:disconnect", token);
  },
  subscribe(connection, receive) {
    let receivers = subscribers.get(connection);
    if (receivers === undefined) {
      receivers = new Set();
      subscribers.set(connection, receivers);
    }
    const group = receivers;
    group.add(receive);
    return () => {
      group.delete(receive);
      if (group.size === 0 && subscribers.get(connection) === group) subscribers.delete(connection);
    };
  },
  pathOf(file) {
    if (!(file instanceof File)) throw new Error("Expected a File");
    return webUtils.getPathForFile(file);
  },
};
contextBridge.exposeInMainWorld("sewed", bridge);
