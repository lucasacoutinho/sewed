import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Effect, Exit, Fiber, Layer, Schema, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binary, Binding, Capability, SewedError } from "../lib/index.js";
import { makeOwner } from "../lib/Binding.js";
import { scopedConnection, server } from "../lib/Runtime.js";
import * as Testing from "../lib/Testing.js";
import { decodeServer, encode, pair } from "../lib/internal/Transport.js";
import { waitUntil } from "./wait.ts";

const protocol = Binary.protocol(
  RpcGroup.make(
    Rpc.make("echo", {
      payload: { value: Schema.String },
      success: Schema.String,
      error: SewedError,
    }),
    Rpc.make("values", { success: Schema.String, error: SewedError, stream: true }),
    Rpc.make("pending", { success: Schema.Void, error: SewedError }),
    Binary.bulkAnswer(Rpc.make("answer", { success: Schema.String, error: SewedError }), {
      maxBytes: 1024 * 1024,
    }),
    Binary.bulk(
      Rpc.make("upload", {
        payload: { bytes: Binary.Bytes },
        success: Schema.Void,
        error: SewedError,
      }),
      { field: "bytes", maxBytes: 1024 * 1024 },
    ),
  ),
);
const Service = Capability.define("transport-boundaries", protocol);

const failureOf = (exit: Exit.Exit<unknown, unknown>): SewedError | undefined => {
  if (Exit.isSuccess(exit)) return undefined;
  const error: unknown = Cause.squash(exit.cause);
  return error instanceof SewedError ? error : undefined;
};

const tapped = () =>
  Effect.gen(function* () {
    const tap = {
      answer: (message: unknown): unknown => message,
      corrupt: () => {},
      pendingStarted: false,
      pendingFinalized: false,
      streamFinalized: false,
      uploadHandled: false,
      closed: 0,
      unsubscribed: 0,
    };
    const services = yield* Layer.build(
      protocol.toLayer({
        echo: ({ value }) => Effect.succeed(value),
        values: () =>
          Stream.make("first").pipe(
            Stream.concat(Stream.never),
            Stream.ensuring(
              Effect.sync(() => {
                tap.streamFinalized = true;
              }),
            ),
          ),
        pending: () =>
          Effect.sync(() => {
            tap.pendingStarted = true;
          }).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(
              Effect.sync(() => {
                tap.pendingFinalized = true;
              }),
            ),
          ),
        answer: () => Effect.succeed("answer"),
        upload: () =>
          Effect.sync(() => {
            tap.uploadHandled = true;
          }),
      }),
    );
    const runtime = yield* server(protocol).pipe(Effect.provideContext(services));
    const owner = makeOwner(
      "transport-boundaries",
      protocol,
      {
        connect: scopedConnection(() => {
          const [client, accepted] = pair();
          runtime.accept(accepted);
          tap.corrupt = () => accepted.send("malformed");
          return {
            send: client.send,
            subscribe: (receive, close) => {
              const unsubscribe = client.subscribe(
                (message) => receive(tap.answer(message)),
                close,
              );
              return () => {
                tap.unsubscribed++;
                unsubscribe();
              };
            },
            close: () => {
              tap.closed++;
              client.close();
            },
          };
        }),
      },
      {},
    );
    return { tap, owner };
  });

test("a reply whose id differs from the request's only by type is dropped as one for an unknown request", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { tap, owner } = yield* tapped();
        yield* Effect.gen(function* () {
          const service = yield* Service;
          let aliased = false;
          tap.answer = (message) => {
            const reply = decodeServer(message, "binary");
            if (aliased || reply._tag !== "Exit") return message;
            aliased = true;
            return encode({ ...reply, requestId: String(reply.requestId) }, "binary");
          };
          const call = yield* service
            .echo({ value: "aliased" })
            .pipe(Effect.exit, Effect.forkScoped);
          yield* Effect.promise(() => waitUntil(() => aliased, "the aliased reply"));
          // The connection carries on, and the call the alias did not answer is still waiting.
          assert.equal(yield* service.echo({ value: "still usable" }), "still usable");
          assert.equal(call.pollUnsafe(), undefined);
          assert.equal(tap.closed, 0);
          yield* Fiber.interrupt(call);
        }).pipe(
          Effect.provide(Capability.client(Service)),
          Effect.provide(Binding.layer([Binding.to(Service.slot, owner)])),
          Effect.provide(Testing.main),
        );
      }),
    ),
  );
});

test("a bulk answer's assembled Exit must retain the original request id type", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { tap, owner } = yield* tapped();
        yield* Effect.gen(function* () {
          const direct = yield* Binding.client(Service.slot);
          tap.answer = (message) => {
            const reply = decodeServer(message, "binary");
            return reply._tag !== "Exit"
              ? message
              : encode(
                  {
                    _tag: "AnswerPart",
                    requestId: reply.requestId,
                    final: true,
                    bytes: encode({ ...reply, requestId: String(reply.requestId) }, "binary"),
                  },
                  "binary",
                );
          };
          const call = yield* direct.answer().pipe(Effect.exit, Effect.forkScoped);
          yield* Effect.promise(() =>
            waitUntil(() => call.pollUnsafe() !== undefined, "the assembled identity failure"),
          );
          assert.equal(failureOf(yield* Fiber.join(call))?.code, "Unknown");
          assert.equal(tap.closed, 1);
          assert.equal(tap.unsubscribed, 1);
        }).pipe(
          Effect.provide(Binding.layer([Binding.to(Service.slot, owner)])),
          Effect.provide(Testing.main),
        );
        assert.equal(tap.unsubscribed, 1);
      }),
    ),
  );
});

test("a direct client's terminal protocol failure closes its connection and finalizes the owner before its environment exits", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { tap, owner } = yield* tapped();
        yield* Effect.gen(function* () {
          const direct = yield* Binding.client(Service.slot);
          const call = yield* direct.pending().pipe(Effect.exit, Effect.forkScoped);
          yield* Effect.promise(() =>
            waitUntil(() => tap.pendingStarted, "the pending owner handler"),
          );
          tap.corrupt();
          const result = yield* Fiber.join(call);
          assert.equal(failureOf(result)?.code, "Unknown");
          assert.equal(failureOf(result)?.reason, "transport/lost-after-send");
          yield* Effect.promise(() =>
            waitUntil(
              () => tap.pendingFinalized,
              "the owner's finalizer while the client environment remains open",
            ),
          );
          assert.equal(tap.closed, 1);
          assert.equal(tap.unsubscribed, 1);
        }).pipe(
          Effect.provide(Binding.layer([Binding.to(Service.slot, owner)])),
          Effect.provide(Testing.main),
        );
        assert.equal(tap.unsubscribed, 1);
      }),
    ),
  );
});
