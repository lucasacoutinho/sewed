import type { WebContents as NativeContents } from "electron";
import { Deferred, Effect, Schema, Stream } from "effect";
import type { Scope } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import type { IpcMessage } from "../WebContents.ts";
import * as Observation from "./Observation.ts";
import type { Control } from "./WebContentsCore.ts";

const decodeChannel = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
const decodeArgs = Schema.decodeUnknownSync(Schema.Array(Schema.Json));
const isJson = Schema.is(Schema.Json);
const jsonArgs = (args: ReadonlyArray<unknown>): ReadonlyArray<Schema.Json> =>
  args.map((value) => (isJson(value) ? value : null));

type IpcEvent = {
  readonly processId: number;
  readonly frameId: number;
  readonly senderFrame: { readonly parent: unknown } | null;
  returnValue: unknown;
};
const message = (event: IpcEvent, channel: string, args: ReadonlyArray<unknown>): IpcMessage => ({
  channel,
  args: jsonArgs(args),
  frame: {
    processId: event.processId,
    routingId: event.frameId,
    isMainFrame: event.senderFrame === null ? true : event.senderFrame.parent === null,
  },
});

/**
 * Electron's raw IPC, for a page that carries its own preload (`Session.registerPreloadScript`)
 * and talks `ipcRenderer` instead of a binding. A Sewed page has no such preload, so nothing
 * arrives here unless the application put one there. Messages are untyped JSON with no schema, no
 * owner and no request scoping; bindings are the typed way to talk to a page.
 */
export const make = (
  native: NativeContents,
  control: Pick<Control, "closed" | "isClosed" | "closedError" | "operation">,
) => {
  const send = (
    target: (channel: string, args: ReadonlyArray<Schema.Json>) => void,
    channel: string,
    args: ReadonlyArray<Schema.Json>,
  ) =>
    Effect.andThen(
      Effect.try({
        try: () => [decodeChannel(channel), decodeArgs(args)] as const,
        catch: (cause) =>
          new SewedError({ code: "Protocol", message: "Invalid IPC message", cause }),
      }),
      ([name, values]) => control.operation(() => target(name, values)),
    );
  return {
    ipc: {
      /** Messages the page sends with `ipcRenderer.send`. */
      messages: Observation.fromEmitter<IpcMessage>("IPC", () => native, [
        [
          "ipc-message",
          (event: IpcEvent, channel: string, ...args: unknown[]) => message(event, channel, args),
        ],
      ]).pipe(Stream.interruptWhen(Deferred.await(control.closed))),
      /** Sends to the main frame's `ipcRenderer.on(channel)`. */
      send: (channel: string, ...args: ReadonlyArray<Schema.Json>) =>
        send((name, values) => native.send(name, ...values), channel, args),
      /** Sends to one frame, named by its process and routing ids. */
      sendToFrame: (
        frame: { readonly processId: number; readonly routingId: number },
        channel: string,
        ...args: ReadonlyArray<Schema.Json>
      ) =>
        send(
          (name, values) => native.sendToFrame([frame.processId, frame.routingId], name, ...values),
          channel,
          args,
        ),
      /**
       * Answers `ipcRenderer.sendSync` for the scope's lifetime. The page is blocked until
       * `answer` returns, so it must be quick and cannot be an Effect; a throw, or no handler at
       * all, answers `null`.
       */
      answerSync: (
        answer: (message: IpcMessage) => Schema.Json,
      ): Effect.Effect<void, SewedError, MainContext | Scope.Scope> =>
        Effect.asVoid(
          Effect.acquireRelease(
            control.operation(() => {
              const listener = (event: IpcEvent, channel: string, ...args: unknown[]) => {
                try {
                  event.returnValue = answer(message(event, channel, args));
                } catch {
                  event.returnValue = null;
                }
              };
              native.on("ipc-message-sync", listener);
              return listener;
            }),
            (listener) =>
              Effect.sync(() => {
                native.off("ipc-message-sync", listener);
              }),
          ),
        ),
    },
  };
};
