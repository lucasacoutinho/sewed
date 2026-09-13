import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Exit, Scope } from "effect";
import * as Testing from "sewed/testing";
import * as ContentsRegistry from "../src/internal/ContentsRegistry.ts";
import * as WebRequest from "../src/internal/WebRequest.ts";
import { fakeSession } from "./fake-session.ts";

test("a request carries the Sewed handle id of the contents that issued it", async () => {
  const session = fakeSession();
  const release = ContentsRegistry.register(41, "guest-1");
  const seen: unknown[] = [];
  const scope = Effect.runSync(Scope.make());
  await Effect.runPromise(
    WebRequest.intercept(session.native, {
      filter: { urls: ["<all_urls>"] },
      request: (request) => {
        seen.push(request.sourceId);
        return Effect.succeed({ kind: "allow" as const });
      },
    }).pipe(Scope.provide(scope), Effect.provide(Testing.main)),
  );
  const decision = await session.fire("onBeforeRequest", { webContentsId: 41 });
  assert.deepEqual(decision, {});
  await session.fire("onBeforeRequest", { webContentsId: 42 });
  assert.deepEqual(seen, ["guest-1", undefined]);
  await Effect.runPromise(Scope.close(scope, Exit.void));
  release();
});
