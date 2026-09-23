import { Context, Deferred, Effect, Option } from "effect";
import { clientContext, type Bound } from "../Binding.ts";
import type { ConnectionFactory } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { isBytes } from "./Bytes.ts";
import {
  decodeClient,
  decodeServer,
  maxPendingMessages,
  relayable,
  type Connection,
  type Wire,
} from "./Transport.ts";

const relay = (source: Connection, factory: ConnectionFactory) =>
  Effect.scoped(
    Effect.gen(function* () {
      const closed = yield* Deferred.make<void>();
      const close = () => {
        Deferred.doneUnsafe(closed, Effect.void);
      };
      const forward =
        (send: (message: Wire) => void, decode: (message: unknown) => unknown) =>
        (message: unknown) => {
          try {
            // The same question the transport asks, asked the same way. `instanceof` here would
            // refuse a packet whose bytes another realm made before `decode` ever sees it, which
            // would put this relay's answer at odds with what the transport beneath it accepts.
            if (typeof message !== "string" && !isBytes(message))
              throw new SewedError({ code: "Protocol", message: "Expected an RPC packet" });
            decode(message);
            send(message);
          } catch {
            close();
          }
        };
      yield* Effect.addFinalizer(() => Effect.sync(source.close));
      let target: Connection | undefined;
      const pending: Wire[] = [];
      const fromSource = source.subscribe(
        forward((message) => {
          if (target !== undefined) target.send(message);
          else if (pending.length < maxPendingMessages) pending.push(message);
          else close();
        }, relayable(decodeClient)),
        close,
      );
      yield* Effect.addFinalizer(() => Effect.sync(fromSource));
      yield* Effect.gen(function* () {
        const connected = yield* factory.connect;
        target = connected;
        const fromTarget = connected.subscribe(
          forward(source.send, relayable(decodeServer)),
          close,
        );
        yield* Effect.addFinalizer(() => Effect.sync(fromTarget));
        try {
          for (const message of pending) connected.send(message);
        } catch {
          close();
        }
        pending.length = 0;
        yield* Effect.never;
      }).pipe(Effect.raceFirst(Deferred.await(closed)));
    }),
  );

/**
 * Serve a connection opened by a consuming runtime. The callback owns the
 * connection after it returns; rejected connections are closed immediately.
 */
export const serveConnections = (bindings: readonly Bound[]) =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    const context = yield* clientContext(bindings);
    const active = new Set<Connection>();
    return (key: string, connection: Connection): SewedError | undefined => {
      const factory = Context.getOption(
        context.bindings,
        Context.Service<never, ConnectionFactory>(key),
      );
      if (context.isClosed()) {
        const reason = new SewedError({ code: "Closed", message: "Binding environment is closed" });
        connection.close();
        return reason;
      }
      if (Option.isNone(factory)) {
        const reason = new SewedError({ code: "Protocol", message: `Missing binding ${key}` });
        connection.close();
        return reason;
      }
      if (active.size >= 128) {
        const reason = new SewedError({
          code: "Limit",
          message: "Binding connection limit reached",
        });
        connection.close();
        return reason;
      }
      active.add(connection);
      Effect.runFork(
        relay(connection, factory.value).pipe(
          Effect.catch(() => Effect.void),
          Effect.ensuring(
            Effect.sync(() => {
              active.delete(connection);
            }),
          ),
          Effect.forkIn(scope),
        ),
      );
      return undefined;
    };
  });
