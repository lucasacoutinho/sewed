import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Deferred, Effect, Exit, Layer, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binary, Binding, Capability, SewedError } from "../src/index.ts";
import { makeOwner } from "../src/Binding.ts";
import { scopedConnection } from "../src/Runtime.ts";
import { server } from "../src/Runtime.ts";
import * as Testing from "../src/Testing.ts";
import { answerBoundsOf } from "../src/internal/Bulk.ts";
import {
  clientProtocol,
  decodeClient,
  decodeServer,
  encode,
  maxMessageBytes,
  minPartBytes,
  pair,
  type Connection,
} from "../src/internal/Transport.ts";
import { waitUntil } from "./wait.ts";

const answerProtocol = Binary.protocol(
  RpcGroup.make(
    Binary.bulkAnswer(Rpc.make("read", { success: Schema.String, error: SewedError }), {
      maxBytes: 64 * 1024,
    }),
  ),
);

const BudgetedIngest = Rpc.make("budgetedIngest", {
  payload: { content: Binary.Bytes },
  success: Schema.Number,
  error: SewedError,
});
const BudgetedSmall = Rpc.make("budgetedSmall", {
  payload: { content: Binary.Bytes },
  success: Schema.Number,
});
const budgetedProtocol = Binary.protocol(
  RpcGroup.make(
    Binary.bulk(BudgetedIngest, { field: "content", maxBytes: 1024 * 1024 }),
    BudgetedSmall,
  ),
);
const Budgeted = Capability.define("pendingBytesBudget", budgetedProtocol);

const startAnswerClient = (maxPendingBytes: number) =>
  Effect.gen(function* () {
    const [client, owner] = pair();
    const clientMessages: ReturnType<typeof decodeClient>[] = [];
    owner.subscribe(
      (message) => clientMessages.push(decodeClient(message, "binary")),
      () => {},
    );
    const responses: unknown[] = [];
    const transport = yield* clientProtocol(
      client,
      "binary",
      new Map(),
      answerBoundsOf(answerProtocol),
      undefined,
      { maxPendingBytes },
    );
    yield* transport
      .run(41, (message) => Effect.sync(() => responses.push(message)))
      .pipe(Effect.forkScoped);
    return { owner, clientMessages, responses, transport };
  });

const sendRead = (transport: Effect.Success<ReturnType<typeof clientProtocol>>, id: number) =>
  transport.send(41, {
    _tag: "Request",
    id,
    tag: "read",
    payload: null,
    headers: [],
  });

const sendAnswerPart = (owner: Connection, requestId: number, bytes: Uint8Array, final: boolean) =>
  owner.send(encode({ _tag: "AnswerPart", requestId, bytes, final }, "binary"));

const responseFor = (responses: readonly unknown[], id: number) =>
  responses.find((response) => {
    if (
      typeof response !== "object" ||
      response === null ||
      !("_tag" in response) ||
      response._tag !== "Exit" ||
      !("requestId" in response)
    )
      return false;
    return response.requestId === id;
  });

const hasPendingAnswerLimit = (response: unknown) => {
  const serialized = JSON.stringify(response);
  return (
    serialized?.includes('"code":"Limit"') === true &&
    serialized.includes("RPC pending answer byte budget is exhausted")
  );
};

const failureOf = (exit: Exit.Exit<unknown, unknown>): SewedError | undefined => {
  if (Exit.isSuccess(exit)) return undefined;
  const error: unknown = Cause.squash(exit.cause);
  return error instanceof SewedError ? error : undefined;
};

const ackCount = (messages: readonly ReturnType<typeof decodeClient>[], requestId: number) =>
  messages.filter((message) => message._tag === "Ack" && message.requestId === requestId).length;

test("one owner budgets partial and queued requests across clients and releases their reservations", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const gate = Deferred.makeUnsafe<void>();
        let handled = 0;
        const ingest = Rpc.make("ingest", {
          payload: { content: Binary.Bytes },
          success: Schema.Number,
          error: SewedError,
        });
        const protocol = Binary.protocol(
          RpcGroup.make(
            Binary.bulk(ingest, {
              field: "content",
              maxBytes: 64 * 1024,
            }),
          ),
        );
        const services = yield* Layer.build(
          protocol.toLayer({
            ingest: ({ content }) =>
              Effect.gen(function* () {
                handled++;
                yield* Deferred.await(gate);
                return content.byteLength;
              }),
          }),
        );
        const runtime = yield* server(protocol, { maxPendingBytes: 2 * minPartBytes }).pipe(
          Effect.provideContext(services),
        );
        const peer = () => {
          const [client, accepted] = pair();
          const responses: ReturnType<typeof decodeServer>[] = [];
          client.subscribe(
            (wire) => responses.push(decodeServer(wire, "binary")),
            () => {},
          );
          runtime.accept(accepted);
          const packet = (id: number) =>
            encode(
              {
                _tag: "Request",
                id,
                tag: "ingest",
                payload: { content: new Uint8Array(20 * 1024) },
                headers: [],
              },
              "binary",
            );
          const start = (id: number) => {
            const wire = packet(id);
            assert.ok(wire instanceof Uint8Array);
            client.send(
              encode(
                {
                  _tag: "RequestPart",
                  id,
                  tag: "ingest",
                  bytes: wire.subarray(0, minPartBytes),
                  final: false,
                },
                "binary",
              ),
            );
            return () =>
              client.send(
                encode(
                  {
                    _tag: "RequestPart",
                    id,
                    tag: "ingest",
                    bytes: wire.subarray(minPartBytes),
                    final: true,
                  },
                  "binary",
                ),
              );
          };
          const interrupted = (id: number) =>
            client.send(encode({ _tag: "Interrupt", requestId: id }, "binary"));
          const acknowledged = (id: number) =>
            responses.some((response) => response._tag === "PartAck" && response.requestId === id);
          const exited = (id: number) =>
            responses.some((response) => response._tag === "Exit" && response.requestId === id);
          const limited = (id: number) => {
            const response = responses.find(
              (response) => response._tag === "Exit" && response.requestId === id,
            );
            assert.ok(response?._tag === "Exit" && response.exit._tag === "Failure");
            assert.match(JSON.stringify(response), /pending-bytes-limit/);
          };
          return { client, responses, start, interrupted, acknowledged, exited, limited };
        };
        const a = peer();
        const b = peer();
        const c = peer();
        const d = peer();
        a.start(1);
        b.start(2);
        assert.equal(a.acknowledged(1), true);
        assert.equal(b.acknowledged(2), true);
        c.start(3);
        c.limited(3);
        assert.equal(handled, 0);
        a.interrupted(1);
        const finish = c.start(4);
        assert.equal(c.acknowledged(4), true);
        b.client.close();
        finish();
        yield* Effect.promise(() => waitUntil(() => handled === 1, "admitted handler"));
        d.start(5);
        d.limited(5);
        Deferred.doneUnsafe(gate, Effect.void);
        yield* Effect.promise(() => waitUntil(() => c.exited(4), "completed request"));
        d.start(6);
        assert.equal(d.acknowledged(6), true);
        d.interrupted(6);
        const complete = d.start(7);
        complete();
        yield* Effect.promise(() => waitUntil(() => d.exited(7), "released budget reused"));
        assert.equal(handled, 2);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("a client refuses the answer part that exceeds its shared pending-byte budget", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { owner, clientMessages, responses, transport } = yield* startAnswerClient(
          2 * minPartBytes,
        );
        yield* sendRead(transport, 1);
        yield* sendRead(transport, 2);
        yield* sendRead(transport, 3);

        sendAnswerPart(owner, 1, new Uint8Array(minPartBytes), false);
        sendAnswerPart(owner, 2, new Uint8Array(minPartBytes), false);
        assert.equal(ackCount(clientMessages, 1), 1);
        assert.equal(ackCount(clientMessages, 2), 1);
        assert.equal(responses.length, 0);

        sendAnswerPart(owner, 3, new Uint8Array(minPartBytes), false);
        yield* Effect.promise(() =>
          waitUntil(
            () => [1, 2, 3].every((id) => responseFor(responses, id) !== undefined),
            "all requests refused after the client budget is exhausted",
          ),
        );
        assert.equal(hasPendingAnswerLimit(responseFor(responses, 3)), true);
      }),
    ),
  );
});

test("interrupting a client request releases its partial-answer reservation", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { owner, clientMessages, transport } = yield* startAnswerClient(2 * minPartBytes);
        yield* sendRead(transport, 1);
        yield* sendRead(transport, 2);
        sendAnswerPart(owner, 1, new Uint8Array(minPartBytes), false);
        sendAnswerPart(owner, 2, new Uint8Array(minPartBytes), false);
        assert.equal(ackCount(clientMessages, 1), 1);
        assert.equal(ackCount(clientMessages, 2), 1);

        yield* transport.send(41, { _tag: "Interrupt", requestId: 1 });
        yield* sendRead(transport, 3);
        sendAnswerPart(owner, 3, new Uint8Array(minPartBytes), false);
        assert.equal(ackCount(clientMessages, 3), 1);
      }),
    ),
  );
});

test("delivering a completed bulk answer releases its bytes before the client reuses the connection", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { owner, clientMessages, responses, transport } = yield* startAnswerClient(
          2 * minPartBytes,
        );
        yield* sendRead(transport, 1);
        const answer = {
          _tag: "Exit",
          requestId: 1,
          exit: { _tag: "Success", value: "x".repeat(minPartBytes) },
        };
        const wire = encode(answer, "binary");
        if (!(wire instanceof Uint8Array)) throw new Error("binary answers must encode to bytes");
        assert.ok(wire.byteLength > minPartBytes && wire.byteLength < 2 * minPartBytes);

        sendAnswerPart(owner, 1, wire.subarray(0, minPartBytes), false);
        assert.equal(ackCount(clientMessages, 1), 1);
        sendAnswerPart(owner, 1, wire.subarray(minPartBytes), true);
        yield* Effect.promise(() =>
          waitUntil(
            () => responseFor(responses, 1) !== undefined,
            "the assembled answer to be delivered",
          ),
        );
        assert.deepEqual(responseFor(responses, 1), answer);

        yield* sendRead(transport, 2);
        sendAnswerPart(owner, 2, new Uint8Array(minPartBytes), false);
        assert.equal(ackCount(clientMessages, 2), 1);
      }),
    ),
  );
});

test("an owner budget refusal completes a split client call and keeps its binding connection usable", async () => {
  let ingestHandled = 0;
  let smallHandled = 0;
  const connections: Array<{
    readonly clientFrames: string[];
    readonly ownerFrames: string[];
  }> = [];
  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const services = yield* Layer.build(
          budgetedProtocol.toLayer({
            budgetedIngest: ({ content }) =>
              Effect.sync(() => {
                ingestHandled += 1;
                return content.byteLength;
              }),
            budgetedSmall: ({ content }) =>
              Effect.sync(() => {
                smallHandled += 1;
                return content.byteLength;
              }),
          }),
        );
        const runtime = yield* server(budgetedProtocol, {
          ownerId: "pending-bytes-budget",
          maxPendingBytes: 2 * maxMessageBytes,
        }).pipe(Effect.provideContext(services));
        const owner = makeOwner(
          "pending-bytes-budget",
          budgetedProtocol,
          {
            connect: scopedConnection(() => {
              const [client, accepted] = pair();
              runtime.accept(accepted);
              const clientFrames: string[] = [];
              const ownerFrames: string[] = [];
              connections.push({ clientFrames, ownerFrames });
              return {
                send: (message) => {
                  clientFrames.push(decodeClient(message, "binary")._tag);
                  client.send(message);
                },
                subscribe: (receive, close) =>
                  client.subscribe((message) => {
                    ownerFrames.push(decodeServer(message, "binary")._tag);
                    receive(message);
                  }, close),
                close: () => client.close(),
              } satisfies Connection;
            }),
          },
          {},
        );
        const calls = yield* Effect.gen(function* () {
          const capability = yield* Budgeted;
          const refused = yield* Effect.exit(
            capability.budgetedIngest({ content: new Uint8Array(3 * maxMessageBytes) }),
          );
          const connection = connections[0];
          const refusedParts =
            connection?.clientFrames.filter((tag) => tag === "RequestPart").length ?? 0;
          const refusedAcks =
            connection?.ownerFrames.filter((tag) => tag === "PartAck").length ?? 0;
          const admitted = yield* capability.budgetedIngest({
            content: new Uint8Array(maxMessageBytes + minPartBytes),
          });
          const following = yield* capability.budgetedSmall({ content: new Uint8Array(3) });
          return { refused, admitted, following, refusedParts, refusedAcks };
        }).pipe(
          Effect.provide(Capability.client(Budgeted)),
          Effect.provide(Binding.layer([Binding.to(Budgeted.slot, owner)])),
          Effect.provide(Testing.main),
        );
        return calls;
      }).pipe(Effect.provide(Testing.main)),
    ),
  );

  assert.ok(Exit.isFailure(result.refused));
  const refusal = failureOf(result.refused);
  assert.equal(refusal?.code, "Limit");
  assert.equal(refusal?.reason, "transport/pending-bytes-limit");
  assert.equal(
    refusal?.message,
    "The owner's pending byte budget is exhausted; its handler did not run",
  );
  assert.equal(result.refusedParts, 5, "the owner refused the fifth intermediate part");
  assert.equal(result.refusedAcks, 4);
  assert.equal(ingestHandled, 1, "only the admitted split request reached the handler");
  assert.equal(result.admitted, maxMessageBytes + minPartBytes);
  assert.equal(result.following, 3);
  assert.equal(smallHandled, 1);
  assert.equal(connections.length, 1, "both calls used the same binding connection");
  const connection = connections[0];
  assert.ok(connection !== undefined);
  if (connection !== undefined) {
    assert.equal(
      connection.clientFrames.filter((tag) => tag === "RequestPart").length,
      8,
      "the refused and admitted requests both crossed as multiple parts",
    );
    assert.equal(connection.ownerFrames.filter((tag) => tag === "PartAck").length, 6);
    assert.equal(connection.clientFrames.filter((tag) => tag === "Request").length, 1);
  }
});
