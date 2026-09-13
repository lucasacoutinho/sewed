import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Effect, Stream } from "effect";
import type { RpcGroup } from "effect/unstable/rpc";
import * as Binding from "../src/PublicBinding.ts";
import * as GuestView from "../src/GuestView.ts";
import { SewedError } from "../src/SewedError.ts";
import * as Testing from "../src/Testing.ts";
import * as GuestHost from "../src/internal/GuestHost.ts";

const Tab = Binding.slot("tab", GuestView.protocol);
const calls: string[] = [];
const fakeCore: GuestHost.HostCore = {
  state: Stream.make({ status: "ready" as const, url: "http://localhost/", processId: 1 }),
  focus: Effect.sync(() => {
    calls.push("focus");
  }),
  capture: () => Effect.succeed(new Uint8Array([137, 80, 78, 71])),
  zoom: Stream.make({ factor: 1 }),
  setZoom: (factor) =>
    Effect.sync(() => {
      calls.push(`zoom:${factor}`);
    }),
  history: Stream.make({ index: 0, entries: [], canGoBack: false, canGoForward: false }),
  back: Effect.sync(() => {
    calls.push("back");
  }),
  forward: Effect.sync(() => {
    calls.push("forward");
  }),
  find: () =>
    Effect.succeed({ results: Stream.empty, next: () => Effect.void, stop: () => Effect.void }),
  findNext: () => Effect.void,
  stopFind: () => Effect.void,
};
const navigate = (url: string) =>
  Effect.sync(() => {
    calls.push(`navigate:${url}`);
  });

const withClient = <A, E>(
  policy: GuestView.HostPolicy,
  use: (
    client: Binding.Client<RpcGroup.Rpcs<typeof GuestView.protocol>>,
  ) => Effect.Effect<A, E, unknown>,
) =>
  Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* Tab();
        return yield* use(client);
      }).pipe(Effect.provide(Testing.layer(Tab, GuestHost.handlers(policy, fakeCore, navigate)))),
    ),
  );
const codeOf = (exit: { readonly _tag: string; readonly cause?: Cause.Cause<unknown> }) => {
  if (exit._tag !== "Failure" || exit.cause === undefined) return undefined;
  const error = Cause.squash(exit.cause);
  return error instanceof SewedError ? error.code : undefined;
};

test("state, focus, zoom, and history are always served", async () => {
  const exit = await withClient({ navigate: false, capture: false }, (tab) =>
    Effect.gen(function* () {
      const state = yield* tab.state().pipe(Stream.take(1), Stream.runCollect);
      yield* tab.focus();
      yield* tab.setZoom({ factor: 1.5 });
      yield* tab.back();
      return [...state][0]?.status;
    }),
  );
  assert.equal(exit._tag, "Success");
  assert.deepEqual(calls.splice(0), ["focus", "zoom:1.5", "back"]);
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
  if (granted._tag === "Success") assert.equal(granted.value.byteLength, 4);
  assert.deepEqual(calls.splice(0), ["navigate:http://localhost/a"]);
});

test("an invalid host policy fails before an owner exists", () => {
  const invalid: unknown = { navigate: true };
  assert.throws(
    () => GuestHost.handlers(invalid as GuestView.HostPolicy, fakeCore, navigate),
    (error: unknown) => error instanceof SewedError && error.code === "Protocol",
  );
});
