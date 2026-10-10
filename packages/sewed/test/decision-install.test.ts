import assert from "node:assert/strict";
import { test } from "node:test";
import { Context, Effect, Exit, Schema, Scope } from "effect";
import * as Decision from "../src/Decision.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";
import { SewedError } from "../src/SewedError.ts";
import { main } from "../src/Testing.ts";

const Close = Decision.decidable({
  key: "contents/test-close",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "sync",
  composition: "restrictive",
  order: ["block", "allow"],
});

test("a decider decides while its scope is open and stops when the scope closes", async () => {
  const registry = Registry.make({ owner: "contents" });
  const decide = Registry.decide(registry, { isClosed: () => false });
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* decide(
          Close,
          Decision.sync(() => "block"),
        );
        assert.equal(registry.resolveSync(Close, {}), "block");
      }),
    ).pipe(Effect.provide(main)),
  );
  assert.equal(registry.resolveSync(Close, {}), "allow");
});

test("two deciders both run, and closing one leaves the other installed", async () => {
  const registry = Registry.make({ owner: "contents" });
  const decide = Registry.decide(registry, { isClosed: () => false });
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* decide(
          Close,
          Decision.sync(() => "allow"),
        );
        const inner = yield* Scope.make();
        yield* decide(
          Close,
          Decision.sync(() => "block"),
        ).pipe(Scope.provide(inner));
        assert.equal(registry.resolveSync(Close, {}), "block");
        yield* Scope.close(inner, Exit.void);
        assert.equal(registry.resolveSync(Close, {}), "allow");
      }),
    ).pipe(Effect.provide(main)),
  );
});

test("installing on a closed owner fails Closed, and installs nothing", async () => {
  const registry = Registry.make({ owner: "contents" });
  const decide = Registry.decide(registry, { isClosed: () => true });
  const install = Effect.scoped(
    decide(
      Close,
      Decision.sync(() => "block"),
    ),
  ).pipe(Effect.provide(main));
  const exit = await Effect.runPromiseExit(install);
  assert.equal(exit._tag, "Failure");
  const error = await Effect.runPromise(Effect.flip(install));
  assert.equal(error instanceof SewedError, true);
  assert.equal(error.code, "Closed");
  assert.equal(registry.resolveSync(Close, {}), "allow");
});

test("an owner that closes between building the install and running it still refuses", async () => {
  const registry = Registry.make({ owner: "contents" });
  let closed = false;
  const decide = Registry.decide(registry, { isClosed: () => closed });
  // Built while the owner is open: nothing has consulted isClosed yet, because the body of the
  // Effect has not run. An owner whose close lands in this window must still be refused, or a
  // decider outlives the owner whose events it was installed to decide.
  const install = Effect.scoped(
    decide(
      Close,
      Decision.sync(() => "block"),
    ),
  ).pipe(Effect.provide(main));
  closed = true;
  const error = await Effect.runPromise(Effect.flip(install));
  assert.equal(error instanceof SewedError, true);
  assert.equal(error.code, "Closed");
  assert.equal(registry.resolveSync(Close, {}), "allow");
});

class Verdict extends Context.Service<Verdict, { readonly answer: "allow" | "block" }>()(
  "test/Verdict",
) {}

const CloseAsync = Decision.decidable({
  key: "contents/test-close-async",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "async",
  composition: "first",
});

test("an async decider decides later with the services its installer had", async () => {
  const registry = Registry.make({ owner: "contents" });
  const decide = Registry.decide(registry, { isClosed: () => false });
  const scope = Scope.makeUnsafe();
  await Effect.runPromise(
    decide(
      CloseAsync,
      Decision.async(() => Effect.map(Verdict, (verdict) => verdict.answer)),
    ).pipe(
      Scope.provide(scope),
      Effect.provideService(Verdict, { answer: "block" }),
      Effect.provide(main),
    ),
  );
  // Resolved from a fiber that has no Verdict of its own: the decider can only answer because its
  // installer's context travelled with it, which is what an Electron callback resolving this
  // decidable later would also have.
  assert.equal(await Effect.runPromise(registry.resolveAsync(CloseAsync, {})), "block");
  await Effect.runPromise(Scope.close(scope, Exit.void));
  assert.equal(await Effect.runPromise(registry.resolveAsync(CloseAsync, {})), "allow");
});
