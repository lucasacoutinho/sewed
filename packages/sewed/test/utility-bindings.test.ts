import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { Deferred, Effect, Fiber, Schema } from "effect";
import { factoryOf } from "../src/Binding.ts";
import { FromUtility, remoteBindings } from "../src/internal/UtilityBindings.ts";

class Port extends EventEmitter {
  closeCalls = 0;
  start() {}
  postMessage(_message: unknown) {}
  close() {
    this.closeCalls += 1;
    this.emit("close");
  }
}

for (const delay of [0, 5] as const) {
  test(`utility open cancellation after ${delay}ms sends Cancel, closes late transfers, and permits reuse`, async () => {
    const started = Deferred.makeUnsafe<void>();
    const messages: (typeof FromUtility.Type)[] = [];
    const successful = new Port();
    let respond = false;
    const remote = remoteBindings(
      {
        postMessage: (message) => {
          const request = Schema.decodeUnknownSync(FromUtility)(message);
          messages.push(request);
          if (request._tag !== "Open") return;
          if (respond)
            remote.receive({ _tag: "Opened", requestId: request.requestId }, [successful]);
          else Deferred.doneUnsafe(started, Effect.void);
        },
      },
      [{ key: "dependency", ownerId: "owner" }],
    );
    const bound = remote.bindings[0];
    assert.ok(bound);
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const opening = yield* Effect.forkScoped(factoryOf(bound).connect);
          yield* Deferred.await(started);
          if (delay > 0) yield* Effect.sleep(delay);
          yield* Fiber.interrupt(opening);
          assert.deepEqual(
            messages.map((message) => message._tag),
            ["Open", "Cancel"],
          );
          const first = messages[0];
          assert.ok(first?._tag === "Open");
          const late = new Port();
          remote.receive({ _tag: "Opened", requestId: first.requestId }, [late]);
          assert.equal(late.closeCalls, 1);
          respond = true;
          const connection = yield* factoryOf(bound).connect;
          connection.send("recovered");
        }),
      ),
    );
    assert.equal(successful.closeCalls, 1);
  });
}

test("repeated cancelled utility opens do not exhaust pending connection capacity", async () => {
  let started = Deferred.makeUnsafe<void>();
  let opens = 0;
  let cancels = 0;
  const remote = remoteBindings(
    {
      postMessage: (message) => {
        const request = Schema.decodeUnknownSync(FromUtility)(message);
        if (request._tag === "Open") {
          opens += 1;
          Deferred.doneUnsafe(started, Effect.void);
        } else if (request._tag === "Cancel") cancels += 1;
      },
    },
    [{ key: "dependency", ownerId: "owner" }],
  );
  const bound = remote.bindings[0];
  assert.ok(bound);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        for (let index = 0; index < 130; index += 1) {
          started = Deferred.makeUnsafe<void>();
          const opening = yield* Effect.forkScoped(factoryOf(bound).connect);
          yield* Deferred.await(started).pipe(Effect.timeout(2000));
          yield* Fiber.interrupt(opening);
        }
        assert.equal(opens, 130);
        assert.equal(cancels, 130);
      }),
    ),
  );
});

test("duplicate utility Opened replies close the extra port without replacing the first reply", async () => {
  const first = new Port();
  const duplicate = new Port();
  const remote = remoteBindings(
    {
      postMessage: (message) => {
        const request = Schema.decodeUnknownSync(FromUtility)(message);
        if (request._tag !== "Open") return;
        remote.receive({ _tag: "Opened", requestId: request.requestId }, [first]);
        remote.receive({ _tag: "Opened", requestId: request.requestId }, [duplicate]);
      },
    },
    [{ key: "dependency", ownerId: "owner" }],
  );
  const bound = remote.bindings[0];
  assert.ok(bound);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* factoryOf(bound).connect;
        assert.equal(duplicate.closeCalls, 1);
        assert.equal(first.closeCalls, 0);
        connection.send("still open");
      }),
    ),
  );
  assert.equal(first.closeCalls, 1);
  assert.equal(duplicate.closeCalls, 1);
});

for (const duplicate of ["Rejected", "Opened"] as const) {
  test(`a duplicate ${duplicate} reply cannot erase the port pending utility shutdown`, async () => {
    const first = new Port();
    const remote = remoteBindings(
      {
        postMessage: (message) => {
          const request = Schema.decodeUnknownSync(FromUtility)(message);
          if (request._tag !== "Open") return;
          remote.receive({ _tag: "Opened", requestId: request.requestId }, [first]);
          remote.receive(
            duplicate === "Opened"
              ? { _tag: "Opened", requestId: request.requestId }
              : {
                  _tag: "Rejected",
                  requestId: request.requestId,
                  code: "Closed",
                  message: "duplicate",
                },
            [],
          );
          remote.close();
        },
      },
      [{ key: "dependency", ownerId: "owner" }],
    );
    const bound = remote.bindings[0];
    assert.ok(bound);
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const connection = yield* factoryOf(bound).connect;
          assert.equal(first.closeCalls, 1);
          assert.throws(() => connection.send("closed"), /closed/i);
        }),
      ),
    );
    assert.equal(first.closeCalls, 1);
  });
}
