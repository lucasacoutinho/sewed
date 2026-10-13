import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Queue, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import * as Binding from "../src/PublicBinding.ts";
import * as Renderer from "../src/Renderer.ts";
import { server } from "../src/Runtime.ts";
import { SewedError } from "../src/SewedError.ts";
import type { Bridge } from "../src/internal/Bridge.ts";

const Protocol = RpcGroup.make(Rpc.make("ping", { success: Schema.Boolean }));
const Slot = Binding.slot("renderer-port/ping", Protocol);

interface Attempt {
  readonly id: string;
  readonly channel: MessageChannel;
  readonly reply: (value: unknown) => void;
}

const fixture = Effect.gen(function* () {
  let handled = 0;
  const services = yield* Layer.build(
    Protocol.toLayer({
      ping: () =>
        Effect.sync(() => {
          handled++;
          return true;
        }),
    }),
  );
  const owner = yield* server(Protocol).pipe(Effect.provideContext(services));
  const page = new EventTarget();
  const opens = yield* Queue.make<Attempt>();
  const attempts = new Map<string, Attempt>();
  const controls = new Map<string, Set<(packet: unknown) => void>>();
  const control = (id: string, value: unknown) => {
    for (const receive of controls.get(id) ?? []) receive(value);
  };
  const bridge: Bridge = {
    hello: async () => ({
      session: "session",
      runtimeId: "renderer-port/test",
      tracing: false,
      bindings: [{ key: Slot.key, ownerId: "owner" }],
    }),
    open: (_session, _slot, id) => {
      const { promise, resolve: reply } = Promise.withResolvers<unknown>();
      const channel = new MessageChannel();
      owner.accept({
        send: (message) => channel.port2.postMessage(message),
        close: () => channel.port2.close(),
        subscribe: (receive, close) => {
          const onMessage = (event: MessageEvent<unknown>) => receive(event.data);
          const onClose = () =>
            close(new SewedError({ code: "Closed", message: "Renderer disconnected" }));
          channel.port2.addEventListener("message", onMessage);
          channel.port2.addEventListener("close", onClose);
          channel.port2.start();
          return () => {
            channel.port2.removeEventListener("message", onMessage);
            channel.port2.removeEventListener("close", onClose);
          };
        },
      });
      const attempt = { id, channel, reply };
      attempts.set(id, attempt);
      Queue.offerUnsafe(opens, attempt);
      return promise;
    },
    close: (_session, id) => {
      attempts.get(id)?.channel.port2.close();
      control(id, { connection: id, error: "Connection closed" });
    },
    disconnect: () => {
      for (const attempt of attempts.values()) attempt.channel.port2.close();
    },
    observe: async () => {},
    subscribe: (id, receive) => {
      let group = controls.get(id);
      if (group === undefined) {
        group = new Set();
        controls.set(id, group);
      }
      const receivers = group;
      receivers.add(receive);
      return () => {
        receivers.delete(receive);
        if (receivers.size === 0) controls.delete(id);
      };
    },
    pathOf: () => "",
  };
  Object.defineProperty(page, "sewed", { value: bridge });
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: page, configurable: true, writable: true });
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      if (previous === undefined) Reflect.deleteProperty(globalThis, "window");
      else Object.defineProperty(globalThis, "window", previous);
      for (const attempt of attempts.values()) {
        attempt.channel.port1.close();
        attempt.channel.port2.close();
      }
    }),
  );
  const result = yield* Deferred.make<Exit.Exit<boolean, SewedError>>();
  const calling = yield* Deferred.make<Fiber.Fiber<void>>();
  const renderer = Renderer.run(
    Renderer.entry(new URL("file:///renderer-port.html"), { bindings: [Slot] }),
    Effect.gen(function* () {
      const call = yield* Effect.scoped(
        Effect.flatMap(Binding.client(Slot), (client) => client.ping()),
      ).pipe(
        Effect.exit,
        Effect.flatMap((exit) => Deferred.succeed(result, exit)),
        Effect.asVoid,
        Effect.forkScoped,
      );
      yield* Deferred.succeed(calling, call);
      return yield* Effect.never;
    }),
  );
  yield* Effect.addFinalizer(() => Fiber.interrupt(renderer));
  const transfer = (
    id: string,
    ports: MessagePort[],
    session = "session",
    source: object = page,
  ) => {
    const event = new MessageEvent("message", {
      data: { type: "sewed:port", session, connection: id },
      ports,
    });
    Object.defineProperty(event, "source", { value: source });
    page.dispatchEvent(event);
  };
  return { opens, result, calling, transfer, control, handled: () => handled };
});

const closedPeer = (channel: MessageChannel) => {
  const closed = Deferred.makeUnsafe<void>();
  channel.port2.addEventListener("close", () => Deferred.doneUnsafe(closed, Effect.void), {
    once: true,
  });
  return closed;
};

for (const invalid of ["session", "source", "identity"] as const) {
  test(`a ${invalid} mismatch cannot substitute a renderer's binding port`, async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const state = yield* fixture;
          const attempt = yield* Queue.take(state.opens);
          const forged = new MessageChannel();
          const closed = closedPeer(forged);
          state.transfer(
            invalid === "identity" ? "unrequested" : attempt.id,
            [forged.port1],
            invalid === "session" ? "stale-session" : "session",
            invalid === "source" ? new EventTarget() : window,
          );
          yield* Deferred.await(closed);
          assert.equal(state.handled(), 0);
          state.transfer(attempt.id, [attempt.channel.port1]);
          attempt.reply(attempt.id);
          const result = yield* Deferred.await(state.result);
          assert.ok(Exit.isSuccess(result));
          assert.equal(result.value, true);
          assert.equal(state.handled(), 1);
        }),
      ),
    );
  });
}

test("a duplicate port transfer closes the duplicate without replacing the admitted connection", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const state = yield* fixture;
        const attempt = yield* Queue.take(state.opens);
        state.transfer(attempt.id, [attempt.channel.port1]);
        const duplicate = new MessageChannel();
        const closed = closedPeer(duplicate);
        state.transfer(attempt.id, [duplicate.port1]);
        yield* Deferred.await(closed);
        attempt.reply(attempt.id);
        const result = yield* Deferred.await(state.result);
        assert.ok(Exit.isSuccess(result));
        assert.equal(result.value, true);
        assert.equal(state.handled(), 1);
      }),
    ),
  );
});

for (const count of [0, 2]) {
  test(`a binding handoff with ${count} ports fails Protocol before dispatch`, async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const state = yield* fixture;
          const attempt = yield* Queue.take(state.opens);
          const extra = Array.from({ length: count }, () => new MessageChannel());
          const closed = extra.map(closedPeer);
          state.transfer(
            attempt.id,
            extra.map((channel) => channel.port1),
          );
          attempt.reply(attempt.id);
          const result = yield* Deferred.await(state.result);
          assert.ok(Exit.isFailure(result));
          const error = Cause.findErrorOption(result.cause);
          assert.ok(error._tag === "Some");
          assert.equal(error.value.code, "Protocol");
          yield* Effect.forEach(closed, Deferred.await, { discard: true });
          assert.equal(state.handled(), 0);
        }),
      ),
    );
  });
}

test("connection closure while opening reports Closed without dispatching a handler", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const state = yield* fixture;
        const attempt = yield* Queue.take(state.opens);
        state.control(attempt.id, { connection: attempt.id, error: "Owner exited" });
        attempt.reply(attempt.id);
        const result = yield* Deferred.await(state.result);
        assert.ok(Exit.isFailure(result));
        const error = Cause.findErrorOption(result.cause);
        assert.ok(error._tag === "Some");
        assert.equal(error.value.code, "Closed");
        assert.equal(state.handled(), 0);
      }),
    ),
  );
});

test("cancelling acquisition rejects late port handoffs while the renderer runtime stays open", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const state = yield* fixture;
        const attempt = yield* Queue.take(state.opens);
        yield* Fiber.interrupt(yield* Deferred.await(state.calling));
        const late = new MessageChannel();
        const closed = closedPeer(late);
        state.transfer(attempt.id, [late.port1]);
        attempt.reply(attempt.id);
        yield* Deferred.await(closed);
        assert.equal(state.handled(), 0);
      }),
    ),
  );
});
