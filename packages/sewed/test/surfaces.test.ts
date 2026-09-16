import assert from "node:assert/strict";
import { describe, it, test } from "node:test";
import { Effect, Schema } from "effect";
import { Clipboard, NativeTheme, Notification, PowerMonitor, SafeStorage, Shell } from "sewed";
import * as Testing from "sewed/testing";

const tags = (group: { readonly requests: ReadonlyMap<string, unknown> }) =>
  [...group.requests.keys()].sort();

test("wave-one protocols expose their documented operations", () => {
  assert.deepEqual(tags(NativeTheme.protocol), ["setSource", "state"]);
  assert.deepEqual(tags(PowerMonitor.protocol), ["events", "state"]);
  assert.deepEqual(tags(Notification.protocol), ["show"]);
  assert.deepEqual(tags(Clipboard.protocol), ["clear", "formats", "read", "write"]);
  assert.deepEqual(tags(Shell.protocol), [
    "beep",
    "openExternal",
    "openPath",
    "showItemInFolder",
    "trashItem",
  ]);
});

test("policies and options reject values outside their closed sets", () => {
  const decodePolicy = Schema.decodeUnknownExit(Clipboard.Policy);
  assert.equal(decodePolicy({ read: ["text"], write: [] })._tag, "Success");
  assert.equal(decodePolicy({ read: ["files"], write: [] })._tag, "Failure");
  const decodeSource = Schema.decodeUnknownExit(NativeTheme.Source);
  assert.equal(decodeSource("auto")._tag, "Failure");
  const decodeThreshold = Schema.decodeUnknownExit(PowerMonitor.IdleThreshold);
  assert.equal(decodeThreshold(0)._tag, "Failure");
  assert.equal(decodeThreshold(1.5)._tag, "Failure");
  const decodeOptions = Schema.decodeUnknownExit(Notification.Options);
  assert.equal(decodeOptions({ title: "" })._tag, "Failure");
  assert.equal(decodeOptions({ title: "Sewed", actions: [] })._tag, "Failure");
  assert.equal(decodeOptions({ title: "Sewed", urgency: "critical" })._tag, "Success");
  const decodeRules = Schema.decodeUnknownExit(Shell.Policy);
  assert.equal(decodeRules([{ kind: "origin", origin: "https://example.com" }])._tag, "Success");
  assert.equal(decodeRules([{ kind: "host", host: "example.com" }])._tag, "Failure");
});

test("clipboard images must carry a PNG signature", () => {
  const decode = Schema.decodeUnknownExit(Clipboard.Content);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal(decode({ kind: "image", png })._tag, "Success");
  assert.equal(decode({ kind: "image", png: new Uint8Array(4) })._tag, "Failure");
  assert.equal(decode({ kind: "image", png: png.subarray(0, 8) })._tag, "Failure");
});

test("sealed secrets record their version and backend", () => {
  const decode = Schema.decodeUnknownExit(SafeStorage.Sealed);
  const bytes = new Uint8Array([1, 2, 3]);
  assert.equal(decode({ version: 1, backend: "gnome_libsecret", bytes })._tag, "Success");
  assert.equal(decode({ version: 2, backend: "gnome_libsecret", bytes })._tag, "Failure");
  assert.equal(
    decode({ version: 1, backend: "gnome_libsecret", bytes: [1, 2, 3] })._tag,
    "Failure",
  );
});

describe("Shell capability", () => {
  const policy: Shell.Policy = [
    { kind: "origin", origin: "https://docs.example.com" },
    { kind: "mailto", address: "support@example.com" },
  ];
  const root = "/tmp/sewed-shell-root";
  const options: Shell.Options = { policy, paths: [root] };

  // The memory Layer runs the same policy the native Layer carries, so these are the rules a
  // renderer reaching the served capability obeys too; only the Electron call underneath differs.
  const use = <A, E>(
    body: (shell: (typeof Shell.capability)["Service"]) => Effect.Effect<A, E, never>,
  ) =>
    Effect.runPromise(
      Effect.exit(
        Effect.scoped(
          Effect.gen(function* () {
            const shell = yield* Shell.capability;
            const value = yield* body(shell);
            const recorder = yield* Testing.Recorder;
            return { value, calls: yield* recorder.calls };
          }).pipe(Effect.provide(Testing.Shell.memory(options))),
        ),
      ),
    );

  it("opens a URL the policy allows", async () => {
    const exit = await use((shell) =>
      shell.openExternal({ url: "https://docs.example.com/guide" }),
    );
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.deepEqual(exit.value.calls, [
      { tag: "openExternal", payload: { url: "https://docs.example.com/guide" } },
    ]);
  });

  it("fails with Protocol for a URL outside the policy", async () => {
    const exit = await use((shell) =>
      Effect.flip(shell.openExternal({ url: "https://evil.example.com/" })),
    );
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.equal(exit.value.value.code, "Protocol");
    assert.equal(
      exit.value.value.message,
      "URL is outside the shell policy: https://evil.example.com/",
    );
  });

  it("fails with Protocol for a path outside the roots", async () => {
    const exit = await use((shell) => Effect.flip(shell.openPath({ path: "/etc/passwd" })));
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.equal(exit.value.value.code, "Protocol");
    assert.equal(exit.value.value.message, "Path is outside the shell policy: /etc/passwd");
  });

  it("fails with Protocol for a relative path", async () => {
    const exit = await use((shell) => Effect.flip(shell.trashItem({ path: "relative.txt" })));
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.equal(exit.value.value.code, "Protocol");
    assert.equal(exit.value.value.message, "Shell path must be absolute: relative.txt");
  });

  it("allows a path inside a configured root", async () => {
    const exit = await use((shell) => shell.openPath({ path: `${root}/notes.txt` }));
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.equal(exit.value.value.opened, true);
  });

  it("covers beep, which the removed handle kept outside the protocol", async () => {
    const exit = await use((shell) => shell.beep({}));
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.deepEqual(exit.value.calls, [{ tag: "beep", payload: {} }]);
  });

  it("records every call with its tag and payload, denials included", async () => {
    const exit = await use((shell) =>
      Effect.gen(function* () {
        yield* shell.openExternal({ url: "mailto:support@example.com?subject=Hi" });
        yield* Effect.flip(shell.openExternal({ url: "https://evil.example.com/" }));
        yield* shell.showItemInFolder({ path: `${root}/notes.txt` });
      }),
    );
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.deepEqual(exit.value.calls, [
      { tag: "openExternal", payload: { url: "mailto:support@example.com?subject=Hi" } },
      { tag: "openExternal", payload: { url: "https://evil.example.com/" } },
      { tag: "showItemInFolder", payload: { path: `${root}/notes.txt` } },
    ]);
  });

  it("refuses a relative path root when the Layer is built", async () => {
    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.scoped(
          Effect.gen(function* () {
            return yield* Shell.capability;
          }).pipe(Effect.provide(Testing.Shell.memory({ policy, paths: ["relative"] }))),
        ),
      ),
    );
    assert.equal(exit._tag, "Failure");
  });
});
