import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
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

// Z1: `serveWeb` used to abort `request.signal` the instant its handler returned, before Electron
// ever reads the `Response` body — a proxy handler chaining its own `fetch(upstream, { signal:
// request.signal })` had its upstream call cancelled mid-body every time. These four tests drive
// `handleWeb` over the same fake session as every other test in this file, rather than reaching
// `serveWeb` directly: the fake `protocol.handle`/`.unhandle` bridge above is already the whole
// surface `serveWeb` needs from Electron, and going through `handleWeb` also proves the scheme
// validation and registration wiring stay intact around the fix. The fourth chains a real `fetch`
// onto `request.signal`, the guide's own recommended shape, because only a body whose read
// promise itself errors on abort can reproduce F1's leak.
test("a handler's own response-body stream can check request.signal.aborted between chunks and still deliver every chunk", async () => {
  await withHandle((fake, session) =>
    Effect.gen(function* () {
      const chunks = ["first-", "second-", "third"];
      let index = 0;
      let cancelled = false;
      yield* Protocol.handleWeb(session, scheme, (request) => {
        const stream = new globalThis.ReadableStream<Uint8Array>({
          pull(controller) {
            // A well-behaved proxy body checks the signal on every pull, the way the guide
            // recommends; with the request settled the instant the handler returned (the bug),
            // this would already read `true` on the very first pull and abort a body nothing
            // outside this handler ever asked to cancel.
            if (request.signal.aborted) {
              controller.error(new Error("aborted before every chunk left"));
              return;
            }
            if (index >= chunks.length) {
              controller.close();
              return;
            }
            controller.enqueue(new TextEncoder().encode(chunks[index]));
            index += 1;
          },
          cancel() {
            cancelled = true;
          },
        });
        return new Response(stream);
      });
      const response = yield* Effect.promise(() => fake.call(new Request("sewed-test://host/")));
      const text = yield* Effect.promise(() => response.text());
      assert.equal(text, chunks.join(""));
      assert.equal(cancelled, false);
    }),
  );
});

test("a native abort mid-body aborts the handler's own signal, and the response body then errors", async () => {
  await withHandle((fake, session) =>
    Effect.gen(function* () {
      let resumeSecondChunk: (() => void) | undefined;
      const paused = new Promise<void>((resolve) => {
        resumeSecondChunk = resolve;
      });
      yield* Protocol.handleWeb(session, scheme, (request) => {
        let sentFirst = false;
        const stream = new globalThis.ReadableStream<Uint8Array>({
          async pull(controller) {
            if (!sentFirst) {
              sentFirst = true;
              controller.enqueue(new TextEncoder().encode("first"));
              return;
            }
            await paused;
            if (request.signal.aborted) {
              controller.error(new Error("aborted between chunks"));
              return;
            }
            controller.enqueue(new TextEncoder().encode("second"));
            controller.close();
          },
        });
        return new Response(stream);
      });
      const controller = new AbortController();
      const response = yield* Effect.promise(() =>
        fake.call(new Request("sewed-test://host/", { signal: controller.signal })),
      );
      const body = response.body;
      if (body === null) throw new Error("expected a streamed body");
      const reader = body.getReader();
      const first = yield* Effect.promise(() => reader.read());
      assert.equal(new TextDecoder().decode(first.value), "first");
      controller.abort();
      resumeSecondChunk?.();
      const outcome = yield* Effect.promise(() =>
        reader.read().then(
          () => "resolved" as const,
          () => "rejected" as const,
        ),
      );
      assert.equal(outcome, "rejected");
    }),
  );
});

test("the page cancelling the response body aborts the handler's signal and cancels its own reader", async () => {
  await withHandle((fake, session) =>
    Effect.gen(function* () {
      let sawAbort = false;
      let innerCancelled = false;
      yield* Protocol.handleWeb(session, scheme, (request) => {
        request.signal.addEventListener("abort", () => {
          sawAbort = true;
        });
        const stream = new globalThis.ReadableStream<Uint8Array>({
          pull(controller) {
            // Never closes on its own: the page cancels before this would run dry, the same
            // shape an upstream `fetch`'s own body has when the page navigates away mid-download.
            controller.enqueue(new TextEncoder().encode("chunk"));
          },
          cancel() {
            innerCancelled = true;
          },
        });
        return new Response(stream);
      });
      const response = yield* Effect.promise(() => fake.call(new Request("sewed-test://host/")));
      const body = response.body;
      if (body === null) throw new Error("expected a streamed body");
      const reader = body.getReader();
      yield* Effect.promise(() => reader.read());
      yield* Effect.promise(() => reader.cancel("page navigated away"));
      assert.equal(sawAbort, true);
      assert.equal(innerCancelled, true);
    }),
  );
});

test("a page cancelling a fetch-proxied body leaves no unhandled rejection when the upstream errors on abort", async () => {
  // A real local server, not a hand-rolled stream: `close`'s own `controller.abort(reason)`
  // (Protocol.ts) runs before `reader.cancel(reason)`, so the reader here is already reading a
  // native `fetch` response body that a fired-and-forgotten upstream abort can reject out from
  // under the following `cancel` — the one shape a hand-rolled stream's `cancel()` hook cannot
  // reproduce.
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/octet-stream" });
    response.write(new Uint8Array(1024).fill(1));
    // Never ends: the page cancels mid-body below, before the server would run dry on its own.
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected the server to report a network address");
  }
  const port = address.port;

  const unhandled: unknown[] = [];
  const onUnhandledRejection = (reason: unknown): void => {
    unhandled.push(reason);
  };
  process.on("unhandledRejection", onUnhandledRejection);
  try {
    await withHandle((fake, session) =>
      Effect.gen(function* () {
        yield* Protocol.handleWeb(session, scheme, (request) =>
          fetch(`http://127.0.0.1:${port}/`, { signal: request.signal }),
        );
        const response = yield* Effect.promise(() => fake.call(new Request("sewed-test://host/")));
        const body = response.body;
        if (body === null) throw new Error("expected a streamed body");
        const reader = body.getReader();
        yield* Effect.promise(() => reader.read());
        yield* Effect.promise(() => reader.cancel("page navigated away"));
        // Bounded, not a fixed sleep tied to server timing: gives the upstream fetch's own
        // abort rejection every chance to surface as an unhandled rejection before asserting
        // that none did.
        for (let attempt = 0; attempt < 30 && unhandled.length === 0; attempt++) {
          yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 10)));
        }
      }),
    );
  } finally {
    process.off("unhandledRejection", onUnhandledRejection);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  assert.deepEqual(unhandled, []);
});
