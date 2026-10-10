import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { threadId } from "node:worker_threads";
import { Effect } from "effect";
import { Binding } from "sewed";
import * as Testing from "sewed/testing";
import "sewed/utility";
import { absent } from "./absent.mjs";
import { Protocol } from "./protocol.mjs";

test("dependency isolation sees private package dependencies", () => {
  assert.throws(() => import.meta.resolve("msgpackr"), { code: "ERR_MODULE_NOT_FOUND" });
  assert.ok(createRequire(import.meta.resolve("sewed")).resolve("msgpackr"));
  assert.throws(() => absent({ packages: ["msgpackr"], entries: ["sewed"] }), {
    code: "ERR_ASSERTION",
    message: /Missing expected exception: msgpackr/,
  });
});

test("core runs and releases a real worker without Electron or React", async () => {
  absent({ packages: ["electron", "react", "react-dom", "@sewed/react"], entries: ["sewed"] });
  const tasks = Binding.slot("minimal-consumer", Protocol);
  const owner = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* Testing.Worker.spawn(
          Testing.Worker.entry(new URL("./worker.mjs", import.meta.url), Protocol),
        );
        yield* Effect.gen(function* () {
          const client = yield* tasks();
          const workerThread = yield* client.thread();
          assert.ok(workerThread > 0);
          assert.notEqual(workerThread, threadId);
        }).pipe(Effect.provide(Binding.layer([Binding.to(tasks, owner)])));
        return owner;
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.equal(await Effect.runPromise(owner.awaitExit.pipe(Effect.provide(Testing.main))), 0);
});
