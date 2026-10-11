import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import * as Download from "../lib/Download.js";
import * as Protocol from "../lib/Protocol.js";

test("session resource contracts stay inert and keep native operations out of the root import", () => {
  assert.equal("start" in Download, false);
  assert.equal("handle" in Protocol, false);

  const privileges = {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
    serviceWorkers: true,
    codeCache: true,
  } as const;
  const scheme = Protocol.scheme("sewed-test", privileges);
  const details = Protocol.definition(scheme);

  assert.ok(Object.isFrozen(scheme));
  assert.ok(details !== undefined);
  assert.ok(Object.isFrozen(details));
  assert.ok(Object.isFrozen(details.privileges));
  assert.deepEqual(details.privileges, privileges);
  assert.notEqual(details.privileges, privileges);
  assert.deepEqual(Object.keys(Protocol), ["Privileges", "Route", "definition", "scheme"]);
});

test("download state distinguishes resumable interruptions from terminal interruptions", () => {
  const base = {
    receivedBytes: 32,
    totalBytes: 64,
    percent: 50,
    currentBytesPerSecond: 12,
    canResume: true,
    paused: false,
  };
  const decode = (value: unknown) => Schema.decodeUnknownSync(Download.State)(value);

  assert.equal(decode({ ...base, status: "pending" }).status, "pending");
  assert.deepEqual(decode({ ...base, status: "active", phase: "interrupted" }), {
    ...base,
    status: "active",
    phase: "interrupted",
  });
  assert.deepEqual(decode({ ...base, status: "terminal", outcome: "interrupted" }), {
    ...base,
    status: "terminal",
    outcome: "interrupted",
  });
  assert.throws(() => decode({ ...base, status: "active", outcome: "interrupted" }));
  assert.throws(() => decode({ ...base, status: "terminal", phase: "interrupted" }));
});

test("download options preserve absolute paths and optional request headers as data", () => {
  const options = Schema.decodeSync(Download.Options)({
    url: "http://127.0.0.1:8080/file.bin",
    savePath: "/tmp/sewed-file.bin",
    headers: { "x-session": "alpha" },
  });
  assert.deepEqual(options, {
    url: "http://127.0.0.1:8080/file.bin",
    savePath: "/tmp/sewed-file.bin",
    headers: { "x-session": "alpha" },
  });
});
