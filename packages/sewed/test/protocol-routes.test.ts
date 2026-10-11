import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import { test } from "node:test";
import type { Session } from "electron";
import { Effect, Schema } from "effect";
import { Net } from "sewed";
import * as ProtocolSchemas from "../src/Protocol.ts";
import * as Testing from "../src/Testing.ts";
import * as Protocol from "../src/internal/Protocol.ts";
import * as Native from "../src/internal/Session.ts";

/** A structural session whose protocol records what is registered and removed. */
const fakeSession = () => {
  const calls: unknown[][] = [];
  const emitter = Object.assign(new EventEmitter(), {
    setPermissionCheckHandler: () => {},
    setPermissionRequestHandler: () => {},
    setDevicePermissionHandler: () => {},
    protocol: {
      registerSource: (name: string, source: unknown) => calls.push(["register", name, source]),
      unhandle: (name: string) => calls.push(["unhandle", name]),
    },
  });
  // Test-only bridge: the library reads these members structurally.
  return { calls, handle: Native.fromNative(emitter as unknown as Session) };
};

const scheme = Protocol.scheme("sewed-files");
const root = path.resolve("/srv/app");

test("file routes register for a scope and stop being served when it closes", async () => {
  const fake = fakeSession();
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Protocol.serveFiles(fake.handle, scheme, [
          { root, index: "index.html" },
          { host: "assets", path: "/static/", root, headers: { "cache-control": "no-store" } },
        ]);
        assert.deepEqual(fake.calls, [
          [
            "register",
            "sewed-files",
            {
              routes: [
                { source: { type: "directory", root, index: "index.html" } },
                {
                  match: { host: "assets", path: "/static/" },
                  source: { type: "directory", root, headers: { "cache-control": "no-store" } },
                },
              ],
            },
          ],
        ]);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.deepEqual(fake.calls.at(-1), ["unhandle", "sewed-files"]);
});

test("routes that cannot be served are refused before Electron sees them", async () => {
  const fake = fakeSession();
  const refused = async (routes: ReadonlyArray<ProtocolSchemas.Route>) =>
    (
      await Effect.runPromise(
        Effect.flip(Effect.scoped(Protocol.serveFiles(fake.handle, scheme, routes))).pipe(
          Effect.provide(Testing.main),
        ),
      )
    ).code;
  assert.equal(await refused([]), "Protocol");
  assert.equal(await refused([{ root: "relative/app" }]), "Protocol");
  assert.equal(await refused([{ root, path: "static" }]), "Protocol");
  assert.deepEqual(fake.calls, []);
});

test("WebSocket option and close schemas", () => {
  const options = Schema.decodeUnknownExit(Net.WebSocketOptions);
  assert.equal(options({ protocols: ["chat"], origin: "https://example.com" })._tag, "Success");
  assert.equal(options({ protocols: [""] })._tag, "Failure");
  const close = Schema.decodeUnknownExit(Net.WebSocketClose);
  assert.equal(close({ code: 1000, reason: "", wasClean: true })._tag, "Success");
});
