import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Effect, Exit, Stream } from "effect";
import type * as Cookie from "../src/Cookie.ts";
import type * as Clipboard from "../src/Clipboard.ts";
import { SewedError } from "../src/SewedError.ts";
import * as CookiePolicy from "../src/internal/CookiePolicy.ts";
import * as ClipboardPolicy from "../src/internal/ClipboardPolicy.ts";

const expectProtocol = (exit: Exit.Exit<unknown, SewedError>) => {
  assert.ok(Exit.isFailure(exit));
  const error = Cause.squash(exit.cause);
  assert.ok(error instanceof SewedError && error.code === "Protocol");
};
const cookieStore = () => {
  const reached: string[] = [];
  const core: CookiePolicy.Core<never> = {
    get: (filter) =>
      Effect.sync(() => {
        reached.push(filter.url ?? "missing");
        return [];
      }),
    set: (details) =>
      Effect.sync(() => {
        reached.push(details.url);
      }),
    remove: () => Effect.void,
    flush: Effect.void,
    changes: Stream.empty,
  };
  return { reached, core };
};
const cookiePolicy: Cookie.Policy = [{ kind: "origin", origin: "https://allowed.example" }];

for (const operation of ["get", "set"] as const) {
  test(`cookie ${operation} checks mutable input when the Effect executes`, async () => {
    const { reached, core } = cookieStore();
    const service = await Effect.runPromise(CookiePolicy.operations(cookiePolicy, core));
    const input = { url: "https://allowed.example/", name: "session", value: "test" };
    const request = service[operation](input);
    input.url = "https://denied.example/";
    expectProtocol(await Effect.runPromiseExit(request));
    assert.deepEqual(reached, []);
    input.url = "https://allowed.example/";
    await Effect.runPromise(request);
    assert.deepEqual(reached, ["https://allowed.example/"]);
  });

  test(`cookie ${operation} snapshots getters before authorizing the native input`, async () => {
    const { reached, core } = cookieStore();
    const service = await Effect.runPromise(CookiePolicy.operations(cookiePolicy, core));
    let reads = 0;
    const input = {
      get url() {
        return ++reads === 1 ? "https://allowed.example/" : "https://denied.example/";
      },
      name: "session",
      value: "test",
    };
    await Effect.runPromise(service[operation](input));
    assert.equal(reads, 1);
    assert.deepEqual(reached, ["https://allowed.example/"]);
  });
}

const clipboard = () => {
  const writes: Clipboard.Content[] = [];
  const core: ClipboardPolicy.Core<never> = {
    read: () => Effect.succeed(null),
    write: (content) =>
      Effect.sync(() => {
        writes.push(content);
      }),
    formats: Effect.succeed([]),
    clear: Effect.void,
  };
  return { writes, core };
};

test("clipboard writes authorize the content variant at execution, including repeated execution", async () => {
  const { writes, core } = clipboard();
  const service = await Effect.runPromise(
    ClipboardPolicy.operations({ read: [], write: ["html"] }, core),
  );
  const input: Clipboard.Content = { kind: "html", html: "<b>allowed</b>", text: "plain" };
  const request = service.write(input);
  Object.assign(input, { kind: "text" });
  expectProtocol(await Effect.runPromiseExit(request));
  assert.deepEqual(writes, []);
  Object.assign(input, { kind: "html" });
  await Effect.runPromise(request);
  assert.deepEqual(writes, [{ kind: "html", html: "<b>allowed</b>", text: "plain" }]);
  Object.assign(input, { kind: "text" });
  expectProtocol(await Effect.runPromiseExit(request));
  assert.equal(writes.length, 1);
});

test("a clipboard variant getter cannot change the format after authorization", async () => {
  const { writes, core } = clipboard();
  const service = await Effect.runPromise(
    ClipboardPolicy.operations({ read: [], write: ["html"] }, core),
  );
  let reads = 0;
  const input: Clipboard.Content = { kind: "html", html: "<b>allowed</b>", text: "plain" };
  Object.defineProperty(input, "kind", {
    enumerable: true,
    get: () => (++reads === 1 ? "html" : "text"),
  });
  expectProtocol(await Effect.runPromiseExit(service.write(input)));
  assert.deepEqual(writes, []);
});

test("invalid policy payloads fail Protocol before reaching the store", async () => {
  const cookies = cookieStore();
  const cookieService = await Effect.runPromise(
    CookiePolicy.operations(cookiePolicy, cookies.core),
  );
  expectProtocol(
    await Effect.runPromiseExit(
      cookieService.set({ url: "https://allowed.example/", name: "", value: "test" }),
    ),
  );
  assert.deepEqual(cookies.reached, []);
  const board = clipboard();
  const clipboardService = await Effect.runPromise(
    ClipboardPolicy.operations({ read: [], write: ["image"] }, board.core),
  );
  expectProtocol(
    await Effect.runPromiseExit(clipboardService.write({ kind: "image", png: new Uint8Array(4) })),
  );
  assert.deepEqual(board.writes, []);
});

test("cookie observation excludes parent host-only cookies but retains shared domain cookies", async () => {
  const changes: readonly Cookie.Change[] = [
    {
      cookie: {
        name: "parent-only",
        value: "test",
        domain: "example.com",
        hostOnly: true,
        sameSite: "lax",
      },
      cause: "explicit",
      removed: false,
    },
    {
      cookie: {
        name: "shared",
        value: "test",
        domain: ".example.com",
        hostOnly: false,
        sameSite: "lax",
      },
      cause: "explicit",
      removed: false,
    },
    {
      cookie: {
        name: "exact",
        value: "test",
        domain: "app.example.com",
        hostOnly: true,
        sameSite: "lax",
      },
      cause: "explicit",
      removed: false,
    },
    {
      cookie: {
        name: "foreign",
        value: "test",
        domain: "other.example.com",
        hostOnly: true,
        sameSite: "lax",
      },
      cause: "explicit",
      removed: false,
    },
  ];
  const store = cookieStore();
  const service = await Effect.runPromise(
    CookiePolicy.operations([{ kind: "origin", origin: "https://app.example.com" }], {
      ...store.core,
      changes: Stream.fromIterable(changes),
    }),
  );
  const observed = await Effect.runPromise(Stream.runCollect(service.changes));
  assert.deepEqual(
    [...observed].map((change) => change.cookie.name),
    ["shared", "exact"],
  );
});
