import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Exit, Schema, Scope } from "effect";
import * as Testing from "sewed/testing";
import * as Root from "../src/WebRequest.ts";
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

const bytes = (text: string) => ({ bytes: Buffer.from(text) });
const unused = () => Promise.reject(new Error("unused"));

test("bodies count bytes parts and stop at the first part that does not fit", async () => {
  const body = await WebRequest.assembleBody(
    [bytes("12345"), bytes("6789"), bytes("0")],
    { maxBytes: 9, blobs: "reference" },
    unused,
  );
  assert.deepEqual(body, {
    parts: [
      { kind: "bytes", bytes: new Uint8Array(Buffer.from("12345")) },
      { kind: "bytes", bytes: new Uint8Array(Buffer.from("6789")) },
    ],
    bytes: 9,
    truncated: true,
  });
});

test("reference mode keeps blob ids and counts nothing for them", async () => {
  const body = await WebRequest.assembleBody(
    [{ bytes: Buffer.alloc(0), blobUUID: "blob-1" }, bytes("ab")],
    { maxBytes: 100, blobs: "reference" },
    unused,
  );
  assert.deepEqual(body.parts[0], { kind: "blob", id: "blob-1" });
  assert.equal(body.bytes, 2);
  assert.equal(body.truncated, false);
});

test("resolve mode reads blobs through the session and caps them like bytes", async () => {
  const capped = await WebRequest.assembleBody(
    [{ bytes: Buffer.alloc(0), blobUUID: "blob-1" }, bytes("xyz")],
    { maxBytes: 4, blobs: "resolve" },
    (id) => Promise.resolve(new Uint8Array(Buffer.from(`data:${id}`))),
  );
  assert.deepEqual(capped, { parts: [], bytes: 0, truncated: true });
  const small = await WebRequest.assembleBody(
    [{ bytes: Buffer.alloc(0), blobUUID: "blob-1" }],
    { maxBytes: 64, blobs: "resolve" },
    () => Promise.resolve(new Uint8Array([1, 2, 3])),
  );
  assert.deepEqual(small, {
    parts: [{ kind: "bytes", bytes: new Uint8Array([1, 2, 3]) }],
    bytes: 3,
    truncated: false,
  });
});

test("file parts are metadata and never read", async () => {
  const body = await WebRequest.assembleBody(
    [{ bytes: Buffer.alloc(0), file: "/home/u/secret.txt" }],
    { maxBytes: 1, blobs: "resolve" },
    unused,
  );
  assert.deepEqual(body, {
    parts: [{ kind: "file", path: "/home/u/secret.txt" }],
    bytes: 0,
    truncated: false,
  });
});

test("a request decider receives a body only when its filter asked for one", async () => {
  const session = fakeSession({ "blob-1": new Uint8Array(Buffer.from("hello")) });
  const bodies: unknown[] = [];
  const scope = Effect.runSync(Scope.make());
  await Effect.runPromise(
    Effect.all([
      WebRequest.intercept(session.native, {
        filter: { urls: ["<all_urls>"], body: { maxBytes: 1024, blobs: "resolve" } },
        request: (request) => {
          bodies.push(request.body);
          return Effect.succeed({ kind: "allow" as const });
        },
      }),
      WebRequest.intercept(session.native, {
        filter: { urls: ["<all_urls>"] },
        request: (request) => {
          bodies.push(request.body);
          return Effect.succeed({ kind: "allow" as const });
        },
      }),
    ]).pipe(Scope.provide(scope), Effect.provide(Testing.main)),
  );
  await session.fire("onBeforeRequest", {
    uploadData: [{ bytes: Buffer.alloc(0), blobUUID: "blob-1" }],
  });
  await session.fire("onBeforeRequest", {});
  assert.deepEqual(bodies, [
    {
      parts: [{ kind: "bytes", bytes: new Uint8Array(Buffer.from("hello")) }],
      bytes: 5,
      truncated: false,
    },
    undefined,
    { parts: [], bytes: 0, truncated: false },
    undefined,
  ]);
  await Effect.runPromise(Scope.close(scope, Exit.void));
});

test("a blob the session cannot read blocks the request like a failed decider", async () => {
  const session = fakeSession();
  const scope = Effect.runSync(Scope.make());
  await Effect.runPromise(
    WebRequest.intercept(session.native, {
      filter: { urls: ["<all_urls>"], body: { maxBytes: 1024, blobs: "resolve" } },
      request: () => Effect.succeed({ kind: "allow" as const }),
    }).pipe(Scope.provide(scope), Effect.provide(Testing.main)),
  );
  const decision = await session.fire("onBeforeRequest", {
    uploadData: [{ bytes: Buffer.alloc(0), blobUUID: "missing" }],
  });
  assert.deepEqual(decision, { cancel: true });
  await Effect.runPromise(Scope.close(scope, Exit.void));
});

test("body filters validate at the boundary", () => {
  const filter = Schema.decodeUnknownExit(Root.Filter);
  assert.equal(
    filter({ urls: ["<all_urls>"], body: { maxBytes: 10, blobs: "resolve" } })._tag,
    "Success",
  );
  assert.equal(
    filter({ urls: ["<all_urls>"], body: { maxBytes: 0, blobs: "resolve" } })._tag,
    "Failure",
  );
  assert.equal(
    filter({ urls: ["<all_urls>"], body: { maxBytes: 10, blobs: "inline" } })._tag,
    "Failure",
  );
});
