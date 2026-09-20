import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { Cause, Effect, Exit, Scope } from "effect";
import { SewedError } from "../src/SewedError.ts";
import * as ShellPolicy from "../src/internal/ShellPolicy.ts";
import { Shell as ShellMain, SewedError as SewedErrorMain } from "sewed";
import * as Testing from "sewed/testing";

// A recording core: the same shape `internal/Shell.ts` gives Electron's `shell`, but every call is
// just pushed to an array, so a test can assert an operation reached the core without opening
// anything real.
const recordingCore = (): { readonly core: ShellPolicy.Core<never>; readonly calls: string[] } => {
  const calls: string[] = [];
  const core: ShellPolicy.Core<never> = {
    openExternal: (href) =>
      Effect.sync(() => {
        calls.push(`openExternal:${href}`);
      }),
    openPath: (target) =>
      Effect.sync(() => {
        calls.push(`openPath:${target}`);
        return { opened: true, message: "" };
      }),
    showItemInFolder: (target) =>
      Effect.sync(() => {
        calls.push(`showItemInFolder:${target}`);
      }),
    trashItem: (target) =>
      Effect.sync(() => {
        calls.push(`trashItem:${target}`);
      }),
    beep: Effect.sync(() => {
      calls.push("beep");
    }),
  };
  return { core, calls };
};

const assertProtocol = (exit: Exit.Exit<unknown, unknown>): void => {
  assert.equal(exit._tag, "Failure");
  if (exit._tag !== "Failure") return;
  const error = Cause.squash(exit.cause);
  assert.ok(error instanceof SewedError, String(error));
  assert.equal(error.code, "Protocol", error.message);
};

test("granting a path lets a shell operation reach the core for exactly the scope's lifetime", async () => {
  const { core, calls } = recordingCore();
  const target = "/home/u/saved/diagnostics.zip";
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { operations, allow } = yield* ShellPolicy.operations(
          { policy: [], paths: [] },
          core,
        );

        // Nothing is granted yet: the same path the consumer will hand `Shell.Grants` still fails.
        assertProtocol(yield* Effect.exit(operations.showItemInFolder(target)));
        assert.deepEqual(calls, []);

        const scope = yield* Scope.make();
        yield* allow(target).pipe(Scope.provide(scope));
        yield* operations.showItemInFolder(target);
        assert.deepEqual(calls, [`showItemInFolder:${target}`]);

        yield* Scope.close(scope, Exit.void);
        assertProtocol(yield* Effect.exit(operations.showItemInFolder(target)));
        // Still just the one call the grant admitted; the refused calls never reached the core.
        assert.deepEqual(calls, [`showItemInFolder:${target}`]);
      }),
    ),
  );
});

test("a grant of a directory admits a file under it and refuses a path that escapes it", async () => {
  const { core, calls } = recordingCore();
  const root = "/home/u/saved";
  const nested = path.join(root, "diagnostics.zip");
  const escaped = path.join(root, "..", "elsewhere.zip");
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { operations, allow } = yield* ShellPolicy.operations({ policy: [] }, core);
        yield* allow(root);
        yield* operations.showItemInFolder(nested);
        assert.deepEqual(calls, [`showItemInFolder:${nested}`]);
        assertProtocol(yield* Effect.exit(operations.showItemInFolder(escaped)));
        assert.deepEqual(calls, [`showItemInFolder:${nested}`]);
      }),
    ),
  );
});

test("a grant of a file admits exactly that file, not its siblings", async () => {
  const { core, calls } = recordingCore();
  const file = "/home/u/saved/diagnostics.zip";
  const sibling = "/home/u/saved/other.zip";
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { operations, allow } = yield* ShellPolicy.operations({ policy: [] }, core);
        yield* allow(file);
        yield* operations.showItemInFolder(file);
        assert.deepEqual(calls, [`showItemInFolder:${file}`]);
        assertProtocol(yield* Effect.exit(operations.showItemInFolder(sibling)));
        assert.deepEqual(calls, [`showItemInFolder:${file}`]);
      }),
    ),
  );
});

test("granting a relative path is refused Protocol, and nothing is admitted", async () => {
  const { core, calls } = recordingCore();
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { allow } = yield* ShellPolicy.operations({ policy: [] }, core);
        assertProtocol(yield* Effect.exit(allow("relative/diagnostics.zip")));
        assert.deepEqual(calls, []);
      }),
    ),
  );
});

test("two scopes granting the same path: closing one leaves the other's grant live", async () => {
  const { core, calls } = recordingCore();
  const target = "/home/u/saved/diagnostics.zip";
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { operations, allow } = yield* ShellPolicy.operations({ policy: [] }, core);
        const scopeA = yield* Scope.make();
        const scopeB = yield* Scope.make();
        yield* allow(target).pipe(Scope.provide(scopeA));
        yield* allow(target).pipe(Scope.provide(scopeB));

        yield* Scope.close(scopeA, Exit.void);
        yield* operations.showItemInFolder(target);
        assert.deepEqual(calls, [`showItemInFolder:${target}`]);

        yield* Scope.close(scopeB, Exit.void);
        assertProtocol(yield* Effect.exit(operations.showItemInFolder(target)));
        assert.deepEqual(calls, [`showItemInFolder:${target}`]);
      }),
    ),
  );
});

test("a grant made under one operations instance does not leak into another", async () => {
  const first = recordingCore();
  const second = recordingCore();
  const target = "/home/u/saved/diagnostics.zip";
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const a = yield* ShellPolicy.operations({ policy: [] }, first.core);
        const b = yield* ShellPolicy.operations({ policy: [] }, second.core);
        yield* a.allow(target);
        yield* a.operations.showItemInFolder(target);
        assertProtocol(yield* Effect.exit(b.operations.showItemInFolder(target)));
        assert.deepEqual(first.calls, [`showItemInFolder:${target}`]);
        assert.deepEqual(second.calls, []);
      }),
    ),
  );
});

// The same lifecycle, over `Testing.Shell.memory`: the served capability and its recorder, so a
// grant is proven where a consumer actually reaches it, not only against the bare policy.
test("Testing.Shell.memory honours a grant exactly as ShellPolicy.operations does, through the served capability", async () => {
  const target = "/home/u/saved/diagnostics.zip";
  const exit = await Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        const shell = yield* ShellMain.capability;
        const grants = yield* ShellMain.Grants;

        const before = yield* Effect.exit(shell.showItemInFolder({ path: target }));
        assert.equal(before._tag, "Failure");
        if (before._tag === "Failure") {
          const error = Cause.squash(before.cause);
          assert.ok(error instanceof SewedErrorMain, String(error));
          assert.equal(error.code, "Protocol");
        }

        const scope = yield* Scope.make();
        yield* grants.allow(target).pipe(Scope.provide(scope));
        yield* shell.showItemInFolder({ path: target });
        const recorder = yield* Testing.Recorder;
        // The recorder notes every call the caller asked for, denials included (matching
        // `surfaces.test.ts`'s "denials included" behaviour), so the refused call above is here too.
        assert.deepEqual(yield* recorder.calls, [
          { tag: "showItemInFolder", payload: { path: target } },
          { tag: "showItemInFolder", payload: { path: target } },
        ]);

        yield* Scope.close(scope, Exit.void);
        const after = yield* Effect.exit(shell.showItemInFolder({ path: target }));
        assert.equal(after._tag, "Failure");
        if (after._tag === "Failure") {
          const error = Cause.squash(after.cause);
          assert.ok(error instanceof SewedErrorMain, String(error));
          assert.equal(error.code, "Protocol");
        }
      }).pipe(Effect.provide(Testing.Shell.memory({ policy: [] }))),
    ),
  );
  assert.equal(exit._tag, "Success", exit._tag === "Failure" ? Cause.pretty(exit.cause) : "");
});

test("a grant made under one Testing.Shell.memory Layer instance does not leak into another", async () => {
  const target = "/home/u/saved/diagnostics.zip";
  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const scopeA = yield* Scope.make();
      const grantedIn = yield* Effect.gen(function* () {
        const grants = yield* ShellMain.Grants;
        yield* grants.allow(target).pipe(Scope.provide(scopeA));
        const shell = yield* ShellMain.capability;
        yield* shell.showItemInFolder({ path: target });
        const recorder = yield* Testing.Recorder;
        return yield* recorder.calls;
      }).pipe(Effect.provide(Testing.Shell.memory({ policy: [] })));
      assert.deepEqual(grantedIn, [{ tag: "showItemInFolder", payload: { path: target } }]);

      // A second, independent Layer instance never saw the first instance's grant.
      const deniedIn = yield* Effect.gen(function* () {
        const shell = yield* ShellMain.capability;
        return yield* Effect.exit(shell.showItemInFolder({ path: target }));
      }).pipe(Effect.provide(Testing.Shell.memory({ policy: [] })));
      assert.equal(deniedIn._tag, "Failure");
      if (deniedIn._tag === "Failure") {
        const error = Cause.squash(deniedIn.cause);
        assert.ok(error instanceof SewedErrorMain, String(error));
        assert.equal(error.code, "Protocol");
      }
      yield* Scope.close(scopeA, Exit.void);
    }),
  );
  assert.equal(exit._tag, "Success", exit._tag === "Failure" ? Cause.pretty(exit.cause) : "");
});
