import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Effect, Stream } from "effect";
import type { RpcGroup } from "effect/rpc";
import * as Binding from "../src/PublicBinding.ts";
import * as Capability from "../src/internal/CapabilityServe.ts";
import * as GuestView from "../src/GuestView.ts";
import { SewedError } from "../src/SewedError.ts";
import * as Testing from "../src/Testing.ts";
import * as GuestHost from "../src/internal/GuestHost.ts";

const calls: string[] = [];
const area = { x: 0, y: 0, width: 10, height: 10 };
const found = [
  { activeMatchOrdinal: 1, matches: 2, selectionArea: area, finalUpdate: false },
  { activeMatchOrdinal: 2, matches: 2, selectionArea: area, finalUpdate: true },
];
const fakeCore: GuestHost.HostCore = {
  state: Stream.make({
    status: "ready" as const,
    url: "http://localhost/",
    processId: 1,
    httpStatus: 200,
  }),
  focus: Effect.sync(() => {
    calls.push("focus");
  }),
  capture: () =>
    Effect.succeed({
      bytes: new Uint8Array([137, 80, 78, 71]),
      width: 4,
      height: 1,
      scaleFactor: 1,
    }),
  zoom: Stream.make({ factor: 1 }),
  setZoom: (factor) =>
    Effect.sync(() => {
      calls.push(`zoom:${factor}`);
    }),
  history: Stream.make({ index: 0, entries: [], canGoBack: false, canGoForward: false }),
  back: Effect.sync(() => {
    calls.push("back");
    return { status: "ready" as const, url: "http://localhost/", processId: 1, httpStatus: 200 };
  }),
  forward: Effect.sync(() => {
    calls.push("forward");
    return { status: "ready" as const, url: "http://localhost/", processId: 1, httpStatus: 200 };
  }),
  // The real core checks the search text before the search starts, so a refused one fails the
  // Effect the handler wraps in `Stream.unwrap` rather than the stream it already returned.
  find: (text) =>
    Effect.suspend(() => {
      calls.push(`find:${text}`);
      return text === "refused"
        ? Effect.fail(new SewedError({ code: "Protocol", message: "Invalid find text" }))
        : Effect.succeed({
            results: Stream.fromIterable(found),
            next: () => Effect.void,
            stop: () => Effect.void,
          });
    }),
  findNext: () => Effect.void,
  stopFind: () => Effect.void,
};
// A guest stands in for the view the tab capability is served for: its page and its navigate.
const guest: GuestHost.Guest = {
  webContents: fakeCore,
  navigate: (url: string) =>
    Effect.sync(() => {
      calls.push(`navigate:${url}`);
    }),
};

type Client = Capability.Operations<RpcGroup.Rpcs<typeof GuestView.protocol>>;

const withClient = <A, E>(
  policy: GuestView.HostPolicy,
  use: (tab: Client) => Effect.Effect<A, E, never>,
) =>
  Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* Capability.serve(GuestView.tab);
        const bound = Binding.to(GuestView.tab.slot, owner);
        return yield* Effect.gen(function* () {
          const tab = yield* GuestView.tab;
          return yield* use(tab);
        }).pipe(
          Effect.provide(Capability.client(GuestView.tab)),
          Effect.provide(Binding.layer([bound])),
        );
      }).pipe(Effect.provide(GuestHost.native(guest, policy)), Effect.provide(Testing.main)),
    ),
  );

const codeOf = (exit: { readonly _tag: string; readonly cause?: Cause.Cause<unknown> }) => {
  if (exit._tag !== "Failure" || exit.cause === undefined) return undefined;
  const error = Cause.squash(exit.cause);
  return error instanceof SewedError ? error.code : undefined;
};

test("state, focus, zoom, history, and find are always served", async () => {
  const exit = await withClient({ navigate: false, capture: false }, (tab) =>
    Effect.gen(function* () {
      const state = yield* tab.state().pipe(Stream.take(1), Stream.runCollect);
      yield* tab.focus();
      yield* tab.setZoom({ factor: 1.5 });
      yield* tab.back();
      // One search is one request: the results arrive on the stream the call returned, and the
      // search's own scope closes with it, because an operation carries no scope of its own.
      const results = yield* Stream.runCollect(tab.find({ text: "needle" }));
      return [[...state][0]?.status, [...results]] as const;
    }),
  );
  assert.equal(exit._tag, "Success");
  if (exit._tag === "Success") {
    assert.equal(exit.value[0], "ready");
    assert.deepEqual(
      exit.value[1].map((result) => result.activeMatchOrdinal),
      [1, 2],
    );
    assert.deepEqual(
      exit.value[1].map((result) => result.finalUpdate),
      [false, true],
    );
  }
  assert.deepEqual(calls.splice(0), ["focus", "zoom:1.5", "back", "find:needle"]);
});

test("a refused search fails on the stream the call returned", async () => {
  const exit = await withClient({ navigate: false, capture: false }, (tab) =>
    Stream.runCollect(tab.find({ text: "refused" })),
  );
  assert.equal(codeOf(exit), "Protocol");
  assert.deepEqual(calls.splice(0), ["find:refused"]);
});

test("navigate and capture follow the host policy", async () => {
  const denied = await withClient({ navigate: false, capture: false }, (tab) =>
    tab.navigate({ url: "http://localhost/a" }),
  );
  assert.equal(codeOf(denied), "Protocol");
  const capture = await withClient({ navigate: true, capture: false }, (tab) => tab.capture({}));
  assert.equal(codeOf(capture), "Protocol");
  const granted = await withClient({ navigate: true, capture: true }, (tab) =>
    Effect.gen(function* () {
      yield* tab.navigate({ url: "http://localhost/a" });
      return yield* tab.capture({});
    }),
  );
  assert.equal(granted._tag, "Success");
  if (granted._tag === "Success") {
    assert.equal(granted.value.bytes.byteLength, 4);
    assert.equal(granted.value.width, 4);
    assert.equal(granted.value.scaleFactor, 1);
  }
  assert.deepEqual(calls.splice(0), ["navigate:http://localhost/a"]);
});

// The native layer is the same operations without a transport, so a main-side call meets the very
// rules a renderer does: no binding, no client, and the policy still decides.
test("the native capability applies the same policy in process", async () => {
  const exit = await Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        const tab = yield* GuestView.tab;
        return yield* tab.navigate({ url: "http://localhost/b" });
      }).pipe(
        Effect.provide(GuestHost.native(guest, { navigate: false, capture: true })),
        Effect.provide(Testing.main),
      ),
    ),
  );
  assert.equal(codeOf(exit), "Protocol");
  assert.deepEqual(calls.splice(0), []);
});

test("an invalid host policy fails while the capability layer builds", async () => {
  const invalid: unknown = { navigate: true };
  const exit = await Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        return yield* GuestView.tab;
      }).pipe(
        Effect.provide(GuestHost.native(guest, invalid as GuestView.HostPolicy)),
        Effect.provide(Testing.main),
      ),
    ),
  );
  assert.equal(codeOf(exit), "Protocol");
});
