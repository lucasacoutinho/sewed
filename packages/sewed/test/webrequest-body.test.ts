import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import * as Root from "../src/WebRequest.ts";
import * as WebRequest from "../src/internal/WebRequest.ts";

/**
 * Body assembly on its own. What a decider *receives* — a body only when its own filter asked for
 * one, a blob read once per request, an unreadable blob blocking the request — is driven through
 * `session.intercept` in `decidables-request.test.ts`, where the filter that asks for a body lives.
 */

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
  // Ruling 3: a resolved blob keeps its id beside its bytes, so a rule that would refuse the blob
  // by id can still recognize it after resolution instead of seeing an anonymous "bytes" part.
  assert.deepEqual(small, {
    parts: [{ kind: "blob", id: "blob-1", bytes: new Uint8Array([1, 2, 3]) }],
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
