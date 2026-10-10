import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect } from "effect";
import * as DevTools from "@sewed/devtools";
import * as Testing from "sewed/testing";
import { absent } from "./absent.mjs";

test("headless DevTools traces without its optional Vite integration", async () => {
  absent({
    packages: ["electron", "vite", "@sewed/vite", "react"],
    entries: ["sewed", "@sewed/devtools"],
  });
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const tools = yield* DevTools.make({ capacity: 16 });
        yield* Effect.void.pipe(Effect.withSpan("minimal-consumer"), Effect.provide(tools.layer));
        const snapshot = yield* tools.snapshot;
        assert.equal(snapshot.capacity, 16);
        assert.ok(snapshot.spans.some((span) => span.name === "minimal-consumer"));
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});
