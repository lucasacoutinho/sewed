import assert from "node:assert/strict";
import { test } from "node:test";
import { threadId } from "node:worker_threads";
import { Deferred, Effect, Exit, Fiber, Layer, Scope, Stream } from "effect";
import { Binding, SewedError } from "sewed";
import * as Testing from "sewed/testing";
import { Workspace, WorkspaceProtocol } from "../src/shared/workspace.ts";

const entry = Testing.Worker.entry(
  new URL("../dist/worker/workspace.js", import.meta.url),
  WorkspaceProtocol,
  { bindings: [] },
);

test("independent client environments share one worker without sharing their lifetimes", async () => {
  const owner = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* Testing.Worker.spawn(entry);
        const root = yield* Effect.scope;
        const firstScope = yield* Scope.fork(root);
        const secondScope = yield* Scope.fork(root);
        const firstContext = yield* Layer.build(Binding.layer([Binding.to(Workspace, owner)])).pipe(
          Scope.provide(firstScope),
        );
        const secondContext = yield* Layer.build(
          Binding.layer([Binding.to(Workspace, owner)]),
        ).pipe(Scope.provide(secondScope));
        const first = yield* Workspace().pipe(
          Effect.provideContext(firstContext),
          Scope.provide(firstScope),
        );
        const second = yield* Workspace().pipe(
          Effect.provideContext(secondContext),
          Scope.provide(secondScope),
        );
        const firstThread = yield* first.thread().pipe(Effect.provideContext(firstContext));
        assert.ok(firstThread > 0);
        assert.notEqual(firstThread, threadId);
        assert.equal(
          yield* second.thread().pipe(Effect.provideContext(secondContext)),
          firstThread,
        );
        /** @type {Deferred.Deferred<void>} */
        const subscribed = yield* Deferred.make();
        const values = yield* second.changes().pipe(
          Stream.tap(() => Deferred.succeed(subscribed, undefined)),
          Stream.take(2),
          Stream.runCollect,
          Effect.provideContext(secondContext),
          Effect.forkScoped,
        );
        yield* Deferred.await(subscribed);
        assert.equal(yield* first.increment().pipe(Effect.provideContext(firstContext)), 1);
        assert.deepEqual(yield* Fiber.join(values), [0, 1]);
        yield* Scope.close(firstScope, Exit.void);
        const closed = yield* Effect.flip(first.increment()).pipe(
          Effect.provideContext(firstContext),
        );
        assert.ok(closed instanceof SewedError);
        assert.equal(closed.code, "Closed");
        assert.equal(yield* second.current().pipe(Effect.provideContext(secondContext)), 1);
        assert.equal(yield* second.increment().pipe(Effect.provideContext(secondContext)), 2);
        assert.equal(
          yield* second.thread().pipe(Effect.provideContext(secondContext)),
          firstThread,
        );
        yield* Scope.close(secondScope, Exit.void);
        const context = yield* Layer.build(Binding.layer([Binding.to(Workspace, owner)]));
        const later = yield* Workspace().pipe(Effect.provideContext(context));
        assert.equal(yield* later.current().pipe(Effect.provideContext(context)), 2);
        assert.equal(yield* later.thread().pipe(Effect.provideContext(context)), firstThread);
        return owner;
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.equal(await Effect.runPromise(owner.awaitExit.pipe(Effect.provide(Testing.main))), 0);
});
