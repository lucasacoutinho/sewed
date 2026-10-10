import { after } from "node:test";
import { Context, Effect, Exit, Scope } from "effect";
import type { SewedError } from "sewed";
import { Binding, ClientContext, type RendererContext } from "sewed";
import * as Testing from "sewed/testing";
import type { RuntimeStore, Source } from "../src/internal/Connection.ts";

const scope = Scope.makeUnsafe();
after(() => Effect.runPromise(Scope.close(scope, Exit.void)));

export const emptyRuntime: RuntimeStore["runtime"] = Effect.gen(function* () {
  const client = yield* Binding.clientContext([]).pipe(Scope.provide(scope));
  const renderer = yield* Effect.context<RendererContext>();
  return Context.add(renderer, ClientContext, client);
}).pipe(Effect.provide(Testing.renderer));

/** A source whose runtime never becomes unavailable, for owners tested apart from a connection. */
export const sourceOf = <R>(runtime: Effect.Effect<Context.Context<R>, SewedError>): Source<R> => ({
  runtime,
  subscribe: () => () => {},
  getSnapshot: () => ({ status: "ready" }),
});
