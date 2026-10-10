import assert from "node:assert/strict";
import { describe, it, test } from "node:test";
import { Cause, Effect, Schema, Stream } from "effect";
import {
  Clipboard,
  NativeTheme,
  Notification,
  PowerMonitor,
  SafeStorage,
  SewedError,
  Shell,
} from "sewed";
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
    Effect.runPromiseExit(
      Effect.scoped(
        Effect.gen(function* () {
          const shell = yield* Shell.capability;
          const value = yield* body(shell);
          const recorder = yield* Testing.Recorder;
          return { value, calls: yield* recorder.calls };
        }).pipe(Effect.provide(Testing.Shell.memory(options))),
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
    const exit = await Effect.runPromiseExit(
      Effect.scoped(
        Shell.capability.pipe(
          Effect.provide(Testing.Shell.memory({ policy, paths: ["relative"] })),
        ),
      ),
    );
    assert.equal(exit._tag, "Failure");
    if (exit._tag !== "Failure") return;
    const error = Cause.squash(exit.cause);
    assert.ok(error instanceof SewedError, String(error));
    assert.equal(error.code, "Protocol");
    assert.equal(error.message, "Shell path root must be absolute: relative");
  });
});

describe("NativeTheme capability", () => {
  const use = <A, E>(
    options: NativeTheme.Options,
    body: (theme: (typeof NativeTheme.capability)["Service"]) => Effect.Effect<A, E, never>,
  ) =>
    Effect.runPromiseExit(
      Effect.scoped(
        Effect.gen(function* () {
          const theme = yield* NativeTheme.capability;
          const value = yield* body(theme);
          const recorder = yield* Testing.Recorder;
          return { value, calls: yield* recorder.calls };
        }).pipe(Effect.provide(Testing.NativeTheme.memory(options))),
      ),
    );

  it("observes the theme state", async () => {
    const exit = await use({}, (theme) => Stream.runCollect(Stream.take(theme.state(), 1)));
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.equal(exit.value.value.length, 1);
    assert.equal(exit.value.value[0]?.source, "system");
  });

  // The policy is the one `NativeTheme.native` carries, so a renderer reaching the served
  // capability meets this same denial; only the Electron call underneath differs.
  it("denies setSource when the options do not allow it", async () => {
    const exit = await use({}, (theme) => Effect.flip(theme.setSource({ source: "dark" })));
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.equal(exit.value.value.code, "Protocol");
    assert.equal(exit.value.value.message, "This theme capability does not allow source changes");
  });

  it("changes the source when the options allow it", async () => {
    const exit = await use({ allowSetSource: true }, (theme) =>
      theme.setSource({ source: "dark" }),
    );
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.deepEqual(exit.value.calls, [{ tag: "setSource", payload: { source: "dark" } }]);
  });

  it("records every call with its tag and payload, denials included", async () => {
    const exit = await use({}, (theme) =>
      Effect.gen(function* () {
        yield* Stream.runCollect(Stream.take(theme.state(), 1));
        yield* Effect.flip(theme.setSource({ source: "light" }));
      }),
    );
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.deepEqual(exit.value.calls, [
      { tag: "state", payload: undefined },
      { tag: "setSource", payload: { source: "light" } },
    ]);
  });

  it("refuses an invalid source when the Layer is built", async () => {
    const invalid = { allowSetSource: "yes" } as unknown as NativeTheme.Options;
    const exit = await Effect.runPromiseExit(
      Effect.scoped(
        NativeTheme.capability.pipe(Effect.provide(Testing.NativeTheme.memory(invalid))),
      ),
    );
    assert.equal(exit._tag, "Failure");
    if (exit._tag !== "Failure") return;
    const error = Cause.squash(exit.cause);
    assert.ok(error instanceof SewedError, String(error));
    assert.equal(error.code, "Protocol");
  });
});

describe("PowerMonitor capability", () => {
  const use = <A, E>(
    body: (power: (typeof PowerMonitor.capability)["Service"]) => Effect.Effect<A, E, never>,
  ) =>
    Effect.runPromiseExit(
      Effect.scoped(
        Effect.gen(function* () {
          const power = yield* PowerMonitor.capability;
          const value = yield* body(power);
          const recorder = yield* Testing.Recorder;
          return { value, calls: yield* recorder.calls };
        }).pipe(Effect.provide(Testing.PowerMonitor.memory())),
      ),
    );

  it("snapshots the power state for a valid idle threshold", async () => {
    const exit = await use((power) => power.state({ idleThresholdSeconds: 60 }));
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.equal(exit.value.value.idleState, "active");
    assert.equal(exit.value.value.onBattery, false);
  });

  // The threshold is checked by the same code the native Layer runs, so a renderer reaching the
  // served capability meets this denial too; only the Electron call underneath differs.
  it("fails with Protocol for an idle threshold outside the schema", async () => {
    const exit = await use((power) => Effect.flip(power.state({ idleThresholdSeconds: 0 })));
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.equal(exit.value.value.code, "Protocol");
    assert.equal(exit.value.value.message, "Invalid idle threshold");
  });

  it("observes power events", async () => {
    const exit = await use((power) => Stream.runCollect(Stream.take(power.events(), 1)));
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.deepEqual([...exit.value.value], [{ kind: "suspend" }]);
  });

  it("records every call with its tag and payload, denials included", async () => {
    const exit = await use((power) =>
      Effect.gen(function* () {
        yield* power.state({ idleThresholdSeconds: 30 });
        yield* Effect.flip(power.state({ idleThresholdSeconds: 1.5 }));
        yield* Stream.runCollect(Stream.take(power.events(), 1));
      }),
    );
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.deepEqual(exit.value.calls, [
      { tag: "state", payload: { idleThresholdSeconds: 30 } },
      { tag: "state", payload: { idleThresholdSeconds: 1.5 } },
      { tag: "events", payload: undefined },
    ]);
  });
});

describe("Clipboard capability", () => {
  const policy: Clipboard.Policy = { read: ["text", "html"], write: ["text"] };

  // The memory Layer runs the same policy the native Layer carries, so these are the rules a
  // renderer reaching the served capability obeys too; only the Electron call underneath differs.
  const use = <A, E>(
    rules: Clipboard.Policy,
    body: (clipboard: (typeof Clipboard.capability)["Service"]) => Effect.Effect<A, E, never>,
  ) =>
    Effect.runPromiseExit(
      Effect.scoped(
        Effect.gen(function* () {
          const clipboard = yield* Clipboard.capability;
          const value = yield* body(clipboard);
          const recorder = yield* Testing.Recorder;
          return { value, calls: yield* recorder.calls };
        }).pipe(Effect.provide(Testing.Clipboard.memory(rules))),
      ),
    );

  it("reads a format the policy allows", async () => {
    const exit = await use(policy, (clipboard) => clipboard.read({ format: "text" }));
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.deepEqual(exit.value.value, { kind: "text", text: "sewed" });
  });

  it("fails with Protocol for a format outside the read policy", async () => {
    const exit = await use(policy, (clipboard) => Effect.flip(clipboard.read({ format: "image" })));
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.equal(exit.value.value.code, "Protocol");
    assert.equal(
      exit.value.value.message,
      "Clipboard format image is not allowed for this capability",
    );
  });

  it("fails with Protocol for content outside the write policy", async () => {
    const exit = await use(policy, (clipboard) =>
      Effect.flip(clipboard.write({ content: { kind: "html", html: "<b>no</b>" } })),
    );
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.equal(exit.value.value.code, "Protocol");
    assert.equal(
      exit.value.value.message,
      "Clipboard format html is not allowed for this capability",
    );
  });

  it("lists only the formats the policy may read", async () => {
    const exit = await use(policy, (clipboard) => clipboard.formats());
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.deepEqual([...exit.value.value], ["text", "html"]);
  });

  it("clears only when the policy allows some write", async () => {
    const allowed = await use(policy, (clipboard) => clipboard.clear());
    assert.equal(allowed._tag, "Success");
    const denied = await use({ read: ["text"], write: [] }, (clipboard) =>
      Effect.flip(clipboard.clear()),
    );
    assert.equal(denied._tag, "Success");
    if (denied._tag !== "Success") return;
    assert.equal(denied.value.value.code, "Protocol");
    assert.equal(
      denied.value.value.message,
      "Clipboard format clear is not allowed for this capability",
    );
  });

  it("records every call with its tag and payload, denials included", async () => {
    const exit = await use(policy, (clipboard) =>
      Effect.gen(function* () {
        yield* clipboard.write({ content: { kind: "text", text: "copied" } });
        yield* Effect.flip(clipboard.read({ format: "image" }));
        yield* clipboard.formats();
      }),
    );
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.deepEqual(exit.value.calls, [
      { tag: "write", payload: { content: { kind: "text", text: "copied" } } },
      { tag: "read", payload: { format: "image" } },
      { tag: "formats", payload: undefined },
    ]);
  });

  it("refuses a policy outside the format set when the Layer is built", async () => {
    const invalid = { read: ["files"], write: [] } as unknown as Clipboard.Policy;
    const exit = await Effect.runPromiseExit(
      Effect.scoped(Clipboard.capability.pipe(Effect.provide(Testing.Clipboard.memory(invalid)))),
    );
    assert.equal(exit._tag, "Failure");
    if (exit._tag !== "Failure") return;
    const error = Cause.squash(exit.cause);
    assert.ok(error instanceof SewedError, String(error));
    assert.equal(error.code, "Protocol");
    assert.equal(error.message, "Invalid clipboard policy");
  });
});

describe("Notification capability", () => {
  // One request is one notification: the stream carries its events and ends when it closes.
  const use = <A, E>(
    body: (notification: (typeof Notification.capability)["Service"]) => Effect.Effect<A, E, never>,
  ) =>
    Effect.runPromiseExit(
      Effect.scoped(
        Effect.gen(function* () {
          const notification = yield* Notification.capability;
          const value = yield* body(notification);
          const recorder = yield* Testing.Recorder;
          return { value, calls: yield* recorder.calls };
        }).pipe(Effect.provide(Testing.Notification.memory())),
      ),
    );

  it("streams the events of one notification", async () => {
    const exit = await use((notification) =>
      Stream.runCollect(notification.show({ title: "Sewed", body: "Wave one" })),
    );
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.deepEqual(
      [...exit.value.value],
      [{ kind: "shown" }, { kind: "clicked" }, { kind: "closed" }],
    );
  });

  // The options are checked by the same code the native Layer runs, so a renderer reaching the
  // served capability meets this denial too; only the Electron call underneath differs.
  it("fails the stream with Protocol for options outside the schema", async () => {
    const exit = await use((notification) =>
      Effect.flip(Stream.runCollect(notification.show({ title: "" }))),
    );
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.equal(exit.value.value.code, "Protocol");
    assert.equal(exit.value.value.message, "Invalid notification options");
  });

  it("records every call with its tag and payload, denials included", async () => {
    const exit = await use((notification) =>
      Effect.gen(function* () {
        yield* Stream.runCollect(notification.show({ title: "Sewed" }));
        yield* Effect.flip(Stream.runCollect(notification.show({ title: "" })));
      }),
    );
    assert.equal(exit._tag, "Success");
    if (exit._tag !== "Success") return;
    assert.deepEqual(exit.value.calls, [
      { tag: "show", payload: { title: "Sewed" } },
      { tag: "show", payload: { title: "" } },
    ]);
  });
});
