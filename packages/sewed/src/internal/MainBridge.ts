import { randomUUID } from "node:crypto";
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from "electron";
import { MessageChannelMain } from "electron";
import { Effect, Exit, Schema, Scope } from "effect";
import { factoryOf, type Bound } from "../Binding.ts";
import { isBytes } from "./Bytes.ts";
import { decodeClient } from "./Transport.ts";
import { SewedError } from "../SewedError.ts";
import type { Event } from "../Diagnostics.ts";
import { Observation } from "../Diagnostics.ts";
import type { Sink } from "./Diagnostics.ts";

interface OpenConnection {
  readonly scope: Scope.Closeable;
}
interface Session {
  readonly id: string;
  readonly runtimeId: string;
  readonly scope: Scope.Closeable;
  readonly connections: Map<string, OpenConnection>;
  readonly bindings: readonly string[];
}

const observations = Schema.decodeUnknownSync(
  Schema.Struct({
    events: Schema.Array(Observation).check(Schema.isMaxLength(64)),
    dropped: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })),
  }),
);
const utf8 = new TextEncoder();

export const mainBridge = (
  contents: WebContents,
  parent: Scope.Scope,
  diagnostics: Sink["Service"] | undefined,
) => {
  const ipc = contents.ipc;
  let target: { url: string; bindings: readonly Bound[] } | undefined;
  let session: Session | undefined;
  let closed = false;
  const dispose = (reason: Extract<Event, { _tag: "BindingClosed" }>["reason"]) => {
    const previous = session;
    if (previous) {
      for (const id of previous.connections.keys()) close(previous, id);
      for (const bindingId of previous.bindings)
        diagnostics?.emit({ _tag: "BindingClosed", bindingId, reason });
      diagnostics?.emit({ _tag: "RuntimeClosed", runtimeId: previous.runtimeId });
      Effect.runFork(Scope.close(previous.scope, Exit.void));
    }
    session = undefined;
  };
  const sameDocument = (url: string) => {
    const value = new URL(url);
    value.hash = "";
    return value.href;
  };
  const senderMainFrame = (event: IpcMainEvent | IpcMainInvokeEvent) => {
    const frame = event.senderFrame;
    return frame !== null && !contents.isDestroyed() && frame === contents.mainFrame
      ? frame
      : undefined;
  };
  // Only the document that completed the handshake knows its session token, and a full
  // navigation disposes the session before another document exists. The bound URL therefore
  // gates the handshake alone, so same-document navigation keeps the session usable.
  const current = (event: IpcMainEvent | IpcMainInvokeEvent, token: unknown) =>
    senderMainFrame(event) !== undefined && typeof token === "string" && session?.id === token
      ? session
      : undefined;
  const close = (current: Session, id: string, reason = "Binding connection closed") => {
    const connection = current.connections.get(id);
    if (!connection) return;
    current.connections.delete(id);
    if (session === current && !contents.isDestroyed())
      contents.send("sewed:packet", { connection: id, error: reason });
    Effect.runFork(Scope.close(connection.scope, Exit.void));
  };
  ipc.handle("sewed:hello", (event) => {
    const frame = senderMainFrame(event);
    if (!target || frame === undefined || sameDocument(frame.url) !== sameDocument(target.url))
      throw new SewedError({ code: "Protocol", message: "Unbound renderer document" });
    dispose("replaced");
    const scope = Scope.forkUnsafe(parent);
    const id = randomUUID();
    session = {
      id,
      runtimeId: `renderer:${contents.id}/${id}`,
      scope,
      connections: new Map(),
      bindings: target.bindings.map((binding) => `${id}/${binding.slot.key}`),
    };
    for (const binding of target.bindings)
      diagnostics?.emit({
        _tag: "BindingOpened",
        bindingId: `${id}/${binding.slot.key}`,
        slot: binding.slot.key,
        ownerId: binding.ownerId,
        runtime: "renderer",
        threadId: 0,
        runtimeId: `renderer:${contents.id}/${id}`,
      });
    return {
      session: session.id,
      runtimeId: session.runtimeId,
      tracing: diagnostics?.tracing ?? false,
      bindings: target.bindings.map(({ slot, ownerId }) => ({ key: slot.key, ownerId })),
    };
  });
  ipc.handle("sewed:observe", (event, token: unknown, batch: unknown) => {
    if (closed) return;
    const active = current(event, token);
    if (
      !active ||
      !diagnostics?.tracing ||
      typeof batch !== "string" ||
      batch.length > 256 * 1024 ||
      utf8.encode(batch).byteLength > 256 * 1024
    )
      throw new SewedError({ code: "Protocol", message: "Invalid renderer observations" });
    const decoded = observations(JSON.parse(batch));
    for (const observation of decoded.events)
      diagnostics.emit({
        ...observation,
        runtime: "renderer",
        runtimeId: active.runtimeId,
        threadId: 0,
        processId: contents.getOSProcessId(),
      });
    if (decoded.dropped > 0)
      diagnostics.emit({
        _tag: "EventsDropped",
        ownerId: active.runtimeId,
        count: decoded.dropped,
      });
  });
  ipc.handle("sewed:open", (event, token: unknown, key: unknown, id: unknown) => {
    const active = current(event, token);
    const binding = target?.bindings.find((binding) => binding.slot.key === key);
    if (
      !active ||
      !binding ||
      active.connections.size >= 128 ||
      typeof id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(id) ||
      active.connections.has(id)
    )
      throw new SewedError({ code: "Protocol", message: "Invalid binding connection" });
    const scope = Scope.forkUnsafe(active.scope);
    active.connections.set(id, { scope });
    return Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* factoryOf(binding).connect;
        if (session !== active || !active.connections.has(id))
          return yield* Effect.fail(
            new SewedError({ code: "Closed", message: "Renderer navigated while connecting" }),
          );
        const channel = new MessageChannelMain();
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            channel.port1.close();
            channel.port2.close();
          }),
        );
        const receive = (event: Electron.MessageEvent) => {
          try {
            const message: unknown = event.data;
            // The same question the transport asks, asked the same way, for the same reason as in
            // `BindingRelay`: a guard in front of `decodeClient` that refuses what `decodeClient`
            // would accept is a guard that decides the protocol.
            if (typeof message !== "string" && !isBytes(message))
              throw new SewedError({ code: "Protocol", message: "Invalid RPC packet" });
            decodeClient(message);
            transport.send(message);
          } catch {
            close(active, id, "Invalid binding packet");
          }
        };
        const disconnected = () => close(active, id);
        channel.port1.on("message", receive);
        channel.port1.on("close", disconnected);
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            channel.port1.off("message", receive);
            channel.port1.off("close", disconnected);
          }),
        );
        const unsubscribe = transport.subscribe(
          (message) => {
            if (session === active && !contents.isDestroyed()) {
              try {
                channel.port1.postMessage(message);
              } catch {
                close(active, id, "Renderer port closed");
              }
            }
          },
          (reason) => {
            close(active, id, reason.message);
          },
        );
        yield* Effect.addFinalizer(() => Effect.sync(unsubscribe));
        channel.port1.start();
        contents.postMessage("sewed:port", { session: active.id, connection: id }, [channel.port2]);
        return id;
      }).pipe(
        Scope.provide(scope),
        Effect.onError(() =>
          Effect.sync(() => {
            close(active, id);
          }).pipe(Effect.andThen(Scope.close(scope, Exit.void))),
        ),
      ),
    );
  });
  ipc.on("sewed:close", (event, token: unknown, id: unknown) => {
    const active = current(event, token);
    if (active && typeof id === "string") close(active, id);
  });
  ipc.on("sewed:disconnect", (event, token: unknown) => {
    if (current(event, token)) dispose("renderer-disconnected");
  });
  const navigation = (
    _event: Electron.Event,
    _url: string,
    inPlace: boolean,
    mainFrame: boolean,
  ) => {
    if (mainFrame && !inPlace) dispose("navigation");
  };
  const inPageNavigation = (_event: Electron.Event, url: string, mainFrame: boolean) => {
    if (mainFrame && target !== undefined) target = { ...target, url };
  };
  const gone = () => dispose("renderer-gone");
  const destroyed = () => dispose("scope-closed");
  contents.on("did-start-navigation", navigation);
  contents.on("did-navigate-in-page", inPageNavigation);
  contents.on("render-process-gone", gone);
  contents.on("destroyed", destroyed);
  Effect.runSync(
    Scope.addFinalizer(
      parent,
      Effect.sync(() => {
        closed = true;
        dispose("scope-closed");
        contents.off("did-start-navigation", navigation);
        contents.off("did-navigate-in-page", inPageNavigation);
        contents.off("render-process-gone", gone);
        contents.off("destroyed", destroyed);
        for (const channel of ["sewed:hello", "sewed:open"]) ipc.removeHandler(channel);
        // A closing document may still have one diagnostic batch in flight.
        const removeObservations = () => ipc.removeHandler("sewed:observe");
        if (contents.isDestroyed()) removeObservations();
        else contents.once("destroyed", removeObservations);
        for (const channel of ["sewed:close", "sewed:disconnect"]) ipc.removeAllListeners(channel);
      }),
    ),
  );
  return {
    configure(url: URL, bindings: readonly Bound[]) {
      dispose("replaced");
      target = { url: url.href, bindings };
    },
  };
};
