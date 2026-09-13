import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { MessageChannel } from "node:worker_threads";
import { Effect, Schema } from "effect";
import { Diagnostics } from "sewed";
import { Sink } from "../lib/internal/Diagnostics.js";
import { forwardDiagnostics, FromWorker } from "../lib/internal/WorkerBindings.js";

test(
  "a slow diagnostic receiver has bounded transport buffering and sees an explicit gap",
  { timeout: 5000 },
  async () => {
    const { port1, port2 } = new MessageChannel();
    const forwarding = forwardDiagnostics(port1);
    const messages: (typeof FromWorker.Type)[] = [];
    port2.on("message", (message: unknown) =>
      messages.push(Schema.decodeUnknownSync(FromWorker)(message)),
    );
    try {
      const first = once(port2, "message");
      for (let index = 0; index < 1000; index++)
        forwarding.emit({
          _tag: "RequestStarted",
          ownerId: "worker",
          clientId: 1,
          requestId: String(index),
          procedure: "work",
        });
      await first;
      assert.equal(messages.length, 1);
      assert.equal(messages[0]?._tag, "Diagnostics");
      let received = 0;
      let dropped = 0;
      while (received + dropped < 1000) {
        const message = messages.at(-1);
        assert.equal(message?._tag, "Diagnostics");
        if (message?._tag !== "Diagnostics") assert.fail("Expected diagnostics");
        assert.ok(message.events.length <= 64);
        received += message.events.length;
        dropped += message.dropped;
        if (received + dropped < 1000) {
          const next = once(port2, "message");
          forwarding.acknowledge();
          await next;
        }
      }
      assert.ok(received <= 257);
      assert.ok(dropped > 0);
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const collector = yield* Diagnostics.make();
            yield* Effect.gen(function* () {
              const observer = yield* Sink;
              observer.emit({ _tag: "EventsDropped", ownerId: "worker", count: dropped });
            }).pipe(Effect.provide(collector.layer));
            const snapshot = yield* collector.snapshot;
            assert.equal(snapshot.dropped, dropped);
            assert.equal(snapshot.complete, false);
          }),
        ),
      );
    } finally {
      forwarding.close();
      port1.close();
      port2.close();
    }
  },
);
