import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Session } from "electron";
import { Effect, Exit, Scope } from "effect";
import * as Testing from "../src/Testing.ts";
import * as Native from "../src/internal/Session.ts";
import * as Protocol from "../src/internal/Protocol.ts";

type NativeHandler = (request: globalThis.Request) => Promise<globalThis.Response>;

/**
 * A structural session: `internal/Protocol.ts`'s `handleWeb` only ever reaches
 * `nativeSession.protocol.handle`/`.unhandle`, plus whatever `internal/Session.ts`'s `fromNative`
 * reads at acquisition (the permission and certificate hooks, none of them exercised here).
 */
const fakeSession = () => {
  let installed: NativeHandler | undefined;
  const emitter = Object.assign(new EventEmitter(), {
    setPermissionCheckHandler: () => {},
    setPermissionRequestHandler: () => {},
    setDevicePermissionHandler: () => {},
    setCertificateVerifyProc: () => {},
    setDisplayMediaRequestHandler: () => {},
    protocol: {
      handle: (_name: string, handler: NativeHandler) => {
        installed = handler;
      },
      unhandle: (_name: string) => {
        installed = undefined;
      },
    },
  });
  // Test-only bridge: the library reads these members structurally; Electron's class is not
  // loadable in Node.
  const native = emitter as unknown as Session;
  return {
    native,
    call: (request: globalThis.Request): Promise<globalThis.Response> => {
      if (installed === undefined) throw new Error("no protocol handler installed");
      return installed(request);
    },
    isInstalled: () => installed !== undefined,
  };
};

const scheme = Protocol.scheme("sewed-test");

/** Runs `use` with a fresh fake session's handle and the outer scope its registration can fork from. */
const withHandle = <A>(
  use: (
    fake: ReturnType<typeof fakeSession>,
    session: Native.Handle,
    scope: Scope.Scope,
  ) => Effect.Effect<A, unknown, unknown>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const fake = fakeSession();
        const session = Native.fromNative(fake.native);
        const scope = yield* Effect.scope;
        return yield* use(fake, session, scope);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );

test("handleWeb serves a Response its handler returns directly", async () => {
  await withHandle((fake, session) =>
    Effect.gen(function* () {
      yield* Protocol.handleWeb(session, scheme, () => new Response("hello", { status: 201 }));
      assert.ok(fake.isInstalled());
      const response = yield* Effect.promise(() => fake.call(new Request("sewed-test://host/")));
      assert.equal(response.status, 201);
      const text = yield* Effect.promise(() => response.text());
      assert.equal(text, "hello");
    }),
  );
});

test("handleWeb serves a Promise<Response> its handler returns", async () => {
  await withHandle((fake, session) =>
    Effect.gen(function* () {
      yield* Protocol.handleWeb(session, scheme, async (request) => {
        assert.equal(request.method, "POST");
        const body = await request.text();
        return new Response(`echo:${body}`, { status: 200 });
      });
      const response = yield* Effect.promise(() =>
        fake.call(new Request("sewed-test://host/", { method: "POST", body: "payload" })),
      );
      assert.equal(response.status, 200);
      const text = yield* Effect.promise(() => response.text());
      assert.equal(text, "echo:payload");
    }),
  );
});

test("a handler that throws answers Internal Server Error, exactly as a failed Effect handler settles", async () => {
  await withHandle((fake, session) =>
    Effect.gen(function* () {
      yield* Protocol.handleWeb(session, scheme, () => {
        throw new Error("boom");
      });
      const response = yield* Effect.promise(() => fake.call(new Request("sewed-test://host/")));
      assert.equal(response.status, 500);
      const text = yield* Effect.promise(() => response.text());
      assert.equal(text, "Internal Server Error");
    }),
  );
});

test("a handler whose returned promise rejects answers Internal Server Error the same way", async () => {
  await withHandle((fake, session) =>
    Effect.gen(function* () {
      yield* Protocol.handleWeb(session, scheme, () => Promise.reject(new Error("boom")));
      const response = yield* Effect.promise(() => fake.call(new Request("sewed-test://host/")));
      assert.equal(response.status, 500);
      const text = yield* Effect.promise(() => response.text());
      assert.equal(text, "Internal Server Error");
    }),
  );
});

test("request.signal aborts when the native request itself is cancelled", async () => {
  await withHandle((fake, session) =>
    Effect.gen(function* () {
      // A realistic handler reacts to the abort by settling its own promise, the same way it
      // would cancel an upstream `fetch(url, { signal: request.signal })` it was proxying.
      yield* Protocol.handleWeb(
        session,
        scheme,
        (request) =>
          new Promise<globalThis.Response>((resolve) => {
            request.signal.addEventListener("abort", () => {
              resolve(new Response("aborted", { status: 499 }));
            });
          }),
      );
      const controller = new AbortController();
      const pending = fake.call(new Request("sewed-test://host/", { signal: controller.signal }));
      controller.abort();
      const response = yield* Effect.promise(() => pending);
      assert.equal(response.status, 499);
    }),
  );
});

test("request.signal aborts when the registration's own scope closes while the call is still in flight", async () => {
  await withHandle((fake, session, outerScope) =>
    Effect.gen(function* () {
      const registrationScope = yield* Scope.fork(outerScope, "sequential");
      yield* Protocol.handleWeb(session, scheme, (request) => {
        // Holds the call open until something aborts it: only the registration's own teardown
        // can do that here, since the native request itself is never cancelled in this test.
        return new Promise<globalThis.Response>((resolve) => {
          request.signal.addEventListener("abort", () => {
            resolve(new Response("aborted", { status: 499 }));
          });
        });
      }).pipe(Scope.provide(registrationScope));
      const pending = fake.call(new Request("sewed-test://host/"));
      yield* Scope.close(registrationScope, Exit.void);
      const response = yield* Effect.promise(() => pending);
      assert.equal(response.status, 499);
      assert.equal(fake.isInstalled(), false);
    }),
  );
});
