# Bulk Requests, Shell Patterns and the Testing Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A document can send bulk bytes to an owner through an ordinary capability operation that declares its bound; `Shell.Policy` can grant every http(s) URL; a test gets a capability served over the real wire in one call.

**Architecture:** An operation declares `Binary.bulk(rpc, { maxBytes })` — an `Rpc` annotation, the mechanism `Binary.protocol` already uses at group level. The client encodes the request once, and when it exceeds the envelope limit, sends it as `RequestPart` frames, one in flight, each acknowledged by a `PartAck` — the mirror of today's server-side `Chunk`/`Ack` discipline. The server assembles the parts up to the declared bound, decodes the whole request, and hands it to Effect RPC unchanged, so the handler is a plain function of its payload. Relays validate each part as an envelope and forward it; nothing between the two ends reassembles. `Shell.Policy` gains `WebRequest.Pattern`, the library's existing "which URLs" vocabulary, with shell-specific refusals. `Testing.client(capability, handlers)` composes the two Layers a test writes today, and `Capability.Handlers` names the handlers Layer type.

**Tech Stack:** TypeScript, Effect v4 (`4.0.0-rc.115`), Electron 44.3.0, `node:test`.

**Spec:** the three request files under `/tmp/claude-1000/-home-lucas-personal-projects-jobwright/535b5f5d-4364-4560-8b16-0bcb5bac6f5f/scratchpad/sewed-01/` (`request-bulk-bytes-to-main.md`, `request-shell-policy.md`, `request-testing-client.md`), plus the rulings below, which Task 2 records in `docs/superpowers/specs/2026-09-15-platform-redesign-design.md`.

## Global Constraints

- Commands run from the repository root: `pnpm typecheck`, `timeout 240 pnpm test`, `pnpm build`, `pnpm format`, `pnpm format:check`, `pnpm docs:reference`, and a single test file with `node --import tsx --test --test-timeout=20000 packages/sewed/test/<file>.test.ts`. Node has no default test timeout; every ad-hoc run passes one.
- Effect stays at `4.0.0-rc.115`. Add no dependency.
- The root package (`sewed`) imports no Electron module and reads no environment at the top level. `Binary.ts`, `internal/Bulk.ts`, `internal/Transport.ts`, `Runtime.ts` are Electron-free.
- No `any`; no `as` beyond `as const` and `import * as` in `packages/*/src` (the existing `propsOf` bridge in `Binding.ts` and the dynamic tables it documents are the only casts; a `*-types.ts` may use `undefined as unknown as Handle` for a handle it cannot acquire; a `*.test.ts` may use `as never` to hand a runtime assertion an invalid value); no non-null assertions.
- `*.test.ts` files are never type-checked; type-level claims live in `*-types.ts`, and every `@ts-expect-error` is proven to bite by stripping it once and reading the error.
- A test that forks work waits on a positive condition and bounds the wait; never a fixed sleep as a barrier.
- Breaking changes are allowed; no aliases; each removal pinned by a negative contract assertion.
- Regenerate `docs/reference.md` in any task that changes a doc comment on a public export. `pnpm build`, `timeout 240 pnpm test` and `pnpm format:check` pass before a task is complete; Task 5 also runs `pnpm website:build`.
- Each task ends in one local commit. Never push. Commit messages end with:

  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BVPFknzuoDTJ9NkEJGWesy
  ```

## Rulings

1. **A bulk request is declared on the operation and names its field: `Binary.bulk(rpc, { field, maxBytes })`.** The declaration is an `Rpc.annotate` under a private Context key, read back with `rpc.annotations` — the mechanism `Binary.protocol` already uses one level up — and because the field is named, nothing walks a schema. `maxBytes` bounds that field's byte length exactly, which is the number a consumer has in hand (its attachment limit); the rest of the request keeps the ordinary envelope allowance on top, so the assembled request may be at most `maxBytes + 256 KiB`. `field` is typed to the payload's `Uint8Array` fields, so naming anything else is a compile error. Amended during Task 1: the first implementation bounded the whole encoded request, under which a consumer declaring 12 MiB had a 12 MiB attachment refused by the envelope's own overhead, and the over-by-one refusal the consumer's test wants could not be written. A bulk operation belongs to a `Binary.protocol`: on the wire the field must be a `Uint8Array`, and `Binding.slot` refuses a JSON protocol that declares one. Cost if wrong: an operation with two bulk fields declares one.
2. **Only a declared operation may fragment; everything else keeps the 256 KiB `Limit`.** The server refuses a `RequestPart` for an undeclared tag by closing the connection (`Protocol`), the way `MainBridge` treats an invalid packet. A bound is a positive integer of at most 64 MiB, refused at `Binary.bulk` with `Protocol` — at definition, the way `Capability.define` refuses middleware.
3. **The client enforces the bound before sending; the server enforces it against a peer that lies.** An honest client fails locally with `Limit` (`Request exceeds the operation's bulk bound of N bytes`) and sends nothing. The server closes the connection on a part that would exceed the bound, on a part for an undeclared tag, on a second assembly for the same request id, on a mismatched id or tag after assembly, and on a second concurrent assembly on one connection. Cost if wrong: a hostile peer's cheapest attack is a closed connection.
4. **One part in flight, one bulk request assembling per connection.** Each `RequestPart` waits for its `PartAck` before the next is sent, exactly as a server `Chunk` fragment waits for its `Ack`; the client serializes bulk requests on a connection with a semaphore so the server holds at most one assembly per connection — memory per connection is bounded by the largest declared bound. Ordinary requests on the same connection proceed between parts. Cost if wrong: two concurrent 12 MiB uploads on one connection take twice as long instead of overlapping.
5. **A part is a slice of the encoded request.** The client encodes the whole request once (JSON text or MessagePack bytes), and each `RequestPart` carries a slice of it; the server concatenates and decodes the whole with the bound as its limit. Encoding-agnostic, no second codec, and `decodeBinary`'s canonical round-trip still runs on the assembled packet. A slice is sized by trying: start at half the envelope limit and halve on `Limit`, the way `encodeChunks`' binary branch already does.
6. **The in-process path applies no bound.** `Capability.fromHandlers` and the memory Layers dispatch without a wire; the bound is a transport fact and there is no transport. Documented; the same operation has a bound over a binding and none in process, which is where the bytes already live.
7. **`Closed` before delivery is distinguishable from `Closed` after.** A connection lost before the final part was sent fails `Closed` with `Connection closed before the bulk request was delivered`; the handler cannot have run. After the final part, the existing `Closed` applies and the handler may have run. Step 6 of the redesign attaches `Unknown` at exactly that boundary.
8. **Interruption drops the assembly.** A client interrupted between parts sends Effect RPC's `Interrupt` as today; the server drops a partial assembly for that id and forwards nothing. A connection that closes drops every assembly with the client entry.
9. **`Shell.Policy` accepts `WebRequest.Pattern`, and the shell allowlists what a pattern may say.** `*://*/*` is "any http or https URL". A shell pattern's scheme must be `*`, `http`, `https`, `file`, or a registered standard scheme; `<all_urls>` is refused; both at Layer build with `Protocol`, in `ShellPolicy.compile`, where origin rules are already checked. `openExternal` refuses any URL carrying credentials before consulting the policy, whatever the rule kind: the OS gets the URL, and `https://trusted@evil/` is the phishing form. Ports and IP literals match as the pattern says. Cost if wrong: a consumer wanting `ftp://` writes a document rule.
10. **`Testing.client(capability, handlers, options?)` and `Capability.Handlers<Rpcs, E, R>`.** `Testing.client` is `Capability.client(capability)` provided with `Testing.layer(capability.slot, handlers, options)`; `Testing.layer` widens its handlers parameter to the same union `fromHandlers` takes (`Capability.Handlers`, the bare Layer or the `(implement) => …` form), so one host value serves both. `docs/testing.md` states which Layer proves what.

## What the consumer writes

```ts
// contract: the operation declares its bound; the field is bytes
const Attachments = Capability.define(
  "attachments",
  Binary.protocol(
    RpcGroup.make(
      Binary.bulk(
        Rpc.make("ingest", {
          payload: { command: Schema.String, content: Binary.Bytes },
          success: Schema.Struct({ id: Schema.String }),
          error: SewedError,
        }),
        { field: "content", maxBytes: 12 * 1024 * 1024 },
      ),
    ),
  ),
);

// renderer
const attachments = yield * Attachments;
const { id } = yield * attachments.ingest({ command, content });

// main: an ordinary handler of its payload
Capability.fromHandlers(Attachments, (implement) =>
  implement({ ingest: ({ command, content }) => post(command, content) }),
);

// test, over the real wire
effect.pipe(Effect.provide(Testing.client(Attachments, handlers)));

// shell policy: any http(s) URL plus one mailto
Shell.native({ policy: ["*://*/*", { kind: "mailto", address: "support@jobwright.io" }] });
```

## File Structure

- Create: `packages/sewed/src/internal/Bulk.ts` — the annotation key, `bulk(rpc, options)`, `boundsOf(protocol): ReadonlyMap<string, number>`, `maxBulkBytes`.
- Modify: `packages/sewed/src/Binary.ts` — export `bulk`.
- Modify: `packages/sewed/src/internal/Transport.ts` — `RequestPart` and `PartAck` envelope members; `encode`/`parse`/`decodeClient`/`decodeServer` take a limit; `clientProtocol` takes the bounds and fragments.
- Modify: `packages/sewed/src/Runtime.ts` — the server assembles parts.
- Modify: `packages/sewed/src/Binding.ts` — `clientProtocol(connection, encodingOf(protocol), boundsOf(protocol), …)`.
- Modify: `packages/sewed/src/Shell.ts`, `packages/sewed/src/internal/ShellPolicy.ts`.
- Modify: `packages/sewed/src/Testing.ts`, `packages/sewed/src/Capability.ts`, `packages/sewed/src/internal/HandlerLayer.ts`.
- Tests: create `packages/sewed/test/bulk.test.ts`, `bulk-types.ts`; modify `shell-policy.test.ts`, `surfaces-types.ts`, `testing.test.ts`, `testing-types.ts`, `capability-types.ts`.
- Docs: `docs/binary-streams.md`, `docs/transport.md`, `docs/api.md`, `docs/testing.md`, `docs/desktop-surfaces.md`, `docs/reference.md` (generated), the spec.
- Playground (separate checkout `/home/lucas/personal/typescript/sewed-playground`): `scripts/binary-fixture.mjs` (+ its renderer entry), `scripts/surfaces-fixture.mjs`, `README.md`.

---

### Task 1: Bulk requests in the transport

**Files:**

- Create: `packages/sewed/src/internal/Bulk.ts`
- Modify: `packages/sewed/src/Binary.ts`, `packages/sewed/src/internal/Transport.ts`, `packages/sewed/src/Runtime.ts`, `packages/sewed/src/Binding.ts`
- Test: create `packages/sewed/test/bulk.test.ts`, `packages/sewed/test/bulk-types.ts`
- Docs: `docs/binary-streams.md`, `docs/transport.md`, `docs/api.md:110-112`, `docs/testing.md`, `docs/reference.md`

**Interfaces:**

- Consumes: `encode`, `parse`, `decodeClient`, `decodeServer`, `clientProtocol`, `maxMessageBytes` (`internal/Transport.ts`); `server` (`Runtime.ts`); `encodingOf` (`internal/Encoding.ts`); `Binding.propsOf`.
- Produces: `Binary.bulk(rpc, { maxBytes })`; `Bulk.boundsOf(protocol)`; `Bulk.maxBulkBytes = 64 * 1024 * 1024`; envelope members `RequestPart { _tag, id, tag, bytes, final }` and `PartAck { _tag, requestId }`; `clientProtocol(connection, encoding, bounds, onFailure?)`.

- [ ] **Step 1: Write the contract, and prove the negatives bite**

```ts
// packages/sewed/test/bulk-types.ts
import { Effect, Layer, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binary, Capability, SewedError } from "sewed";
import * as Testing from "sewed/testing";

const Ingest = Rpc.make("ingest", {
  payload: { command: Schema.String, content: Binary.Bytes },
  success: Schema.Struct({ id: Schema.String }),
  error: SewedError,
});

// A bulk declaration is an annotation: the operation's type is unchanged, and it composes into
// a binary protocol like any other operation.
const Attachments = Capability.define(
  "attachments",
  Binary.protocol(RpcGroup.make(Binary.bulk(Ingest, { maxBytes: 12 * 1024 * 1024 }))),
);
const same: typeof Ingest = Binary.bulk(Ingest, { maxBytes: 1024 });
void same;

// The handler is an ordinary function of its payload.
const handlers = Capability.fromHandlers(Attachments, (implement) =>
  implement({ ingest: ({ content }) => Effect.succeed({ id: String(content.byteLength) }) }),
);
const layer: Layer.Layer<typeof Attachments, never, never> = handlers;
void layer;

// The client call is ordinary too: nothing about the bound reaches the caller's types.
const call: Effect.Effect<{ readonly id: string }, SewedError> = Effect.gen(function* () {
  const attachments = yield* Attachments;
  return yield* attachments.ingest({ command: "add", content: new Uint8Array(3) });
}).pipe(Effect.provide(Testing.client(Attachments, handlers)));
void call;

// @ts-expect-error a bound is a byte count.
Binary.bulk(Ingest, { maxBytes: "12MiB" });
// @ts-expect-error bulk declares an operation, not a group.
Binary.bulk(RpcGroup.make(Ingest), { maxBytes: 1024 });
```

`Testing.client` lands in Task 4; until then write `Capability.client(Attachments).pipe(Layer.provide(Testing.layer(Attachments.slot, /* a bare toLayer */)))` for the `call` example and let Task 4 shorten it. Run `tsc -p packages/sewed/test/tsconfig.json`; it must fail on `Binary.bulk`. After Step 6, strip each `@ts-expect-error` in turn and confirm the error.

- [ ] **Step 2: Write the failing tests**

```ts
// packages/sewed/test/bulk.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { Deferred, Effect, Exit, Fiber, Layer, Schema, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binary, Capability, SewedError } from "sewed";
import * as Testing from "sewed/testing";
import { host } from "../src/Host.ts";
import * as Binding from "../src/Binding.ts";
import {
  clientProtocol,
  decodeClient,
  decodeServer,
  encode,
  maxMessageBytes,
  pair,
} from "../src/internal/Transport.ts";
import { server } from "../src/Runtime.ts";
import * as Bulk from "../src/internal/Bulk.ts";
import { waitUntil } from "./wait.ts";

const twelve = 12 * 1024 * 1024;
const Ingest = Rpc.make("ingest", {
  payload: { command: Schema.String, content: Binary.Bytes },
  success: Schema.Struct({ id: Schema.String, sum: Schema.Number }),
  error: SewedError,
});
const Small = Rpc.make("small", { payload: { content: Binary.Bytes }, success: Schema.Number });
const protocol = Binary.protocol(RpcGroup.make(Binary.bulk(Ingest, { maxBytes: twelve }), Small));
const Attachments = Capability.define("attachments", protocol);
const checksum = (bytes: Uint8Array) => {
  let sum = 0;
  for (let index = 0; index < bytes.byteLength; index += 4093) sum = (sum + bytes[index]!) % 65521;
  return sum;
};
const pattern = (size: number) => {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index++) bytes[index] = (index * 31) % 251;
  return bytes;
};
const run = <A, E>(effect: Effect.Effect<A, E, typeof Attachments>, received: Uint8Array[] = []) =>
  Effect.runPromiseExit(
    Effect.scoped(
      effect.pipe(
        Effect.provide(
          Capability.client(Attachments).pipe(
            Layer.provide(
              Testing.layer(
                Attachments.slot,
                protocol.toLayer({
                  ingest: ({ content }) =>
                    Effect.sync(() => {
                      received.push(content);
                      return { id: String(content.byteLength), sum: checksum(content) };
                    }),
                  small: ({ content }) => Effect.succeed(content.byteLength),
                }),
              ),
            ),
          ),
        ),
      ),
    ),
  );

test("a 12 MiB request reaches the handler intact through a bulk operation", async () => {
  const content = pattern(twelve);
  const received: Uint8Array[] = [];
  const exit = await run(
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      return yield* attachments.ingest({ command: "add", content });
    }),
    received,
  );
  assert.ok(Exit.isSuccess(exit));
  assert.deepEqual(exit.value, { id: String(twelve), sum: checksum(content) });
  assert.equal(received.length, 1);
  assert.equal(received[0]?.byteLength, twelve);
});

test("one byte over the bound fails Limit before anything is sent, and the handler never runs", async () => {
  const received: Uint8Array[] = [];
  const exit = await run(
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      return yield* attachments.ingest({ command: "add", content: new Uint8Array(twelve + 1) });
    }),
    received,
  );
  assert.ok(Exit.isFailure(exit));
  const error = Exit.isFailure(exit) ? Cause_first(exit) : undefined;
  assert.equal(error?.code, "Limit");
  assert.match(error?.message ?? "", /bulk bound/);
  assert.equal(received.length, 0);
});

test("an undeclared operation keeps the envelope limit", async () => {
  const exit = await run(
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      return yield* attachments.small({ content: new Uint8Array(maxMessageBytes) });
    }),
  );
  assert.ok(Exit.isFailure(exit));
  assert.equal(Cause_first(exit)?.code, "Limit");
});

test("a request under the envelope limit on a bulk operation is sent whole", async () => {
  // Proven by the probe below: no RequestPart frame for a small request.
});

test("parts are acknowledged one at a time, and a connection lost mid-transfer fails Closed before delivery", async () => {
  // Build a raw server over pair(), count frames by tag, close the connection after the first
  // PartAck, and assert the client's failure message and that the handler never ran.
});

test("a hostile part — undeclared tag, over the bound, second assembly — closes the connection", async () => {
  // Raw pair(): send hand-built RequestPart envelopes to the server and assert the connection is
  // closed (a later send throws Closed) and the handler never ran.
});

test("interrupting the caller between parts drops the assembly", async () => {
  // Fork the bulk call, wait for the first PartAck through the probe, interrupt, then assert the
  // server accepts a fresh bulk request on the same connection and the handler ran once.
});

test("two bulk calls on one connection are serialized and both arrive intact", async () => {
  // Two concurrent ingest calls with different patterns; assert both results and both received.
});

test("a JSON protocol fragments its text the same way", async () => {
  // Same as the first test with Schema.Uint8Array and no Binary.protocol, at 1 MiB.
});

test("Binary.bulk refuses a bound that is not a positive integer of at most 64 MiB", () => {
  for (const maxBytes of [0, -1, 1.5, Bulk.maxBulkBytes + 1, Number.NaN]) {
    assert.throws(
      () => Binary.bulk(Ingest, { maxBytes }),
      (error: unknown) => error instanceof SewedError && error.code === "Protocol",
    );
  }
  assert.deepEqual([...Bulk.boundsOf(protocol)], [["ingest", twelve]]);
});

test("the in-process path applies no bound", async () => {
  const layer = Capability.fromHandlers(Attachments, (implement) =>
    implement({
      ingest: ({ content }) => Effect.succeed({ id: "x", sum: checksum(content) }),
      small: ({ content }) => Effect.succeed(content.byteLength),
    }),
  );
  const size = await Effect.runPromise(
    Effect.gen(function* () {
      const attachments = yield* Attachments;
      return yield* attachments.small({ content: new Uint8Array(maxMessageBytes * 2) });
    }).pipe(Effect.provide(layer)),
  );
  assert.equal(size, maxMessageBytes * 2);
});
```

`Cause_first` is a small local helper that returns the first `SewedError` in a failure exit's cause (write it with `Cause.failures`/`Cause.squash`, whichever the file beside you — `instance.test.ts` — uses). The commented tests are the contract; write each in full: `stream-transport.test.ts`'s `probe()` (lines 43–70) shows how to run `server(Protocol)` over a raw `pair()` and observe every frame — copy that shape, subscribe to the client side of the pair to count `RequestPart`/`PartAck`/`Exit` by `_tag` (decode with `decodeServer`/`decodeClient` using no encoding argument), and drive a real `Capability.client` through `Binding.layer([Binding.to(Attachments.slot, owner)])` with an owner made by `makeOwner` over that pair. `waitUntil` bounds every wait.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --import tsx --test --test-timeout=20000 packages/sewed/test/bulk.test.ts`
Expected: FAIL — `Binary.bulk is not a function` (and the others on the same).

- [ ] **Step 4: The declaration**

`packages/sewed/src/internal/Bulk.ts`:

```ts
import { Context } from "effect";
import type { Rpc, RpcGroup } from "effect/unstable/rpc";
import { propsOf } from "../Binding.ts";
import { SewedError } from "../SewedError.ts";

/** The most a bulk operation may declare; the server holds at most one assembly per connection. */
export const maxBulkBytes = 64 * 1024 * 1024;

const Bound = Context.Service<never, number>("sewed/BulkRequest");

export interface Options {
  /** The largest encoded request the operation accepts over a binding, in bytes. */
  readonly maxBytes: number;
}

/**
 * Declares that an operation's request may exceed the envelope limit, up to `maxBytes`. The
 * client sends such a request in acknowledged parts and the owner assembles it before the
 * handler runs; an honest client refuses a larger one before sending anything. The bound is a
 * transport fact: an in-process call has no wire and no bound.
 */
export const bulk = <R extends Rpc.Any>(rpc: R, options: Options): R => {
  const { maxBytes } = options;
  if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > maxBulkBytes)
    throw new SewedError({
      code: "Protocol",
      message: `A bulk bound is a positive integer of at most ${maxBulkBytes} bytes`,
    });
  return rpc.annotate(Bound, maxBytes) as R;
};

/** Every bulk operation of a protocol with its bound, by tag; empty for a protocol with none. */
export const boundsOf = <Rpcs extends Rpc.Any>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
): ReadonlyMap<string, number> => {
  const bounds = new Map<string, number>();
  for (const [tag, rpc] of protocol.requests) {
    const bound = Context.getOption(propsOf(rpc).annotations, Bound);
    if (bound._tag === "Some") bounds.set(tag, bound.value);
  }
  return bounds;
};
```

If `rpc.annotate(...)` already returns `R` without the cast (read `Rpc.d.ts:100` for its return type), drop the `as R`; if it returns a wider `Rpc<...>`, that one cast is the generic bridge the plan allows, and it needs the same doc line `Binding.propsOf` carries. Export from `packages/sewed/src/Binary.ts`: `export { bulk } from "./internal/Bulk.ts"; export type { Options as BulkOptions } from "./internal/Bulk.ts";`.

- [ ] **Step 5: The envelope and the limits**

In `packages/sewed/src/internal/Transport.ts`:

- Add to `clientEnvelope`'s union:

```ts
const RequestPart = Schema.Struct({
  _tag: Schema.Literal("RequestPart"),
  id: Schema.Union([Schema.String, Schema.Number]),
  tag: Schema.String,
  bytes: Schema.Union([Schema.String, Schema.Uint8Array]),
  final: Schema.Boolean,
});
export type RequestPart = typeof RequestPart.Type;
```

and to `serverEnvelope`'s union `PartAck = Schema.Struct({ _tag: Schema.Literal("PartAck"), requestId: Schema.Union([Schema.String, Schema.Number]) })`. For the binary encoding `bytes` must be a MessagePack bin, which `Schema.Uint8Array` with the same `toCodecJson: () => undefined` annotation as `Binary.Bytes` gives; reuse `Binary.Bytes` here rather than a second annotation — import it from `../Binary.ts` if that creates no cycle, else move the annotated schema into `Transport.ts` and have `Binary.ts` re-export it.

- `encode(message, encoding = "json", limit = maxMessageBytes)` and `parse(message, encoding?, limit = maxMessageBytes)`, `decodeClient(message, encoding?, limit?)`, `decodeServer(message, encoding?, limit?)`: replace each `maxMessageBytes` comparison with `limit`; the `limit()` error message names the limit it was given. `encodeChunks` keeps `maxMessageBytes`. The return types of `decodeClient`/`decodeServer` widen to `FromClientEncoded | RequestPart` and `FromServerEncoded | PartAck`.
- `clientProtocol(connection, encoding = "json", bounds: ReadonlyMap<string, number> = new Map(), onFailure?)`. In `send`, replace the single `encode` with:

```ts
const bound = message._tag === "Request" ? bounds.get(message.tag) : undefined;
const wire =
  yield *
  Effect.try({
    try: () => encode(message, encoding, bound ?? maxMessageBytes),
    catch: (cause) =>
      rpcError(
        bound !== undefined && cause instanceof SewedError && cause.code === "Limit"
          ? new SewedError({
              code: "Limit",
              message: `Request exceeds the operation's bulk bound of ${bound} bytes`,
            })
          : cause,
      ),
  });
```

Keep the request bookkeeping (queue, fiber, `requests.set`) exactly as it is. Then, in place of the final `connection.send(wire)`, when `message._tag === "Request"` and `sizeOf(wire) > maxMessageBytes` (bytes for `Uint8Array`, UTF-8 bytes for a string — the same measurement `encode` makes), run the part loop under a per-protocol `Semaphore` of one permit (`Effect.makeSemaphore(1)` built once in the `fnUntraced` body, `withPermits(1)` around the loop):

```ts
const key = String(message.id);
let offset = 0;
let slice = Math.floor(maxMessageBytes / 2);
while (offset < length(wire)) {
  const final = offset + slice >= length(wire);
  const part = {
    _tag: "RequestPart",
    id: message.id,
    tag: message.tag,
    bytes: wire.slice(offset, offset + slice),
    final,
  } as const;
  let frame: Wire;
  try {
    frame = encode(part, encoding);
  } catch (cause) {
    if (cause instanceof SewedError && cause.code === "Limit" && slice > 1) {
      slice = Math.floor(slice / 2);
      continue;
    }
    return yield * Effect.fail(rpcError(cause));
  }
  const acknowledged = final ? undefined : Deferred.makeUnsafe<void>();
  if (acknowledged !== undefined) partAcks.set(key, acknowledged);
  yield *
    Effect.try({ try: () => connection.send(frame), catch: rpcError }).pipe(
      Effect.tapError((error) => Effect.sync(() => fail(error))),
    );
  offset += slice;
  if (acknowledged !== undefined)
    yield *
      Deferred.await(acknowledged).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (partAcks.get(key) === acknowledged) partAcks.delete(key);
          }),
        ),
      );
}
```

(`length`/`slice` are the string or byte-array operations; write two tiny helpers.) `partAcks` is a `Map<string, Deferred<void>>` beside `requests`; in the `connection.subscribe` callback, before offering to the inbox, `if (decoded._tag === "PartAck") { Deferred.doneUnsafe(partAcks.get(String(decoded.requestId)), Effect.void); return; }` (guard the undefined). In `fail`, fail every pending `partAcks` deferred with the failure so a waiting loop ends; the loop's caller sees the transport failure. For the message of ruling 7: when `fail` runs while `partAcks` has an entry for a request, the failure that reaches that request is `Closed` with `Connection closed before the bulk request was delivered` — build it in `fail` when `partAcks.size > 0` for those keys, and the ordinary failure otherwise. On `Interrupt` (`message._tag === "Interrupt"`), also delete the request's `partAcks` entry.

- [ ] **Step 6: The server assembles**

In `packages/sewed/src/Runtime.ts` `server`: compute `const bounds = boundsOf(protocol);` beside `streamProcedures`. Extend the per-client record with `assembly: { readonly id: string; readonly tag: string; readonly parts: Wire[]; bytes: number } | undefined`. In `accept`'s subscribe callback, after `decodeClient(message, encoding)`:

```ts
if (request._tag === "RequestPart") {
  const key = String(request.id);
  const bound = bounds.get(request.tag);
  const size = sizeOf(request.bytes);
  if (
    bound === undefined ||
    (client.assembly !== undefined &&
      (client.assembly.id !== key || client.assembly.tag !== request.tag)) ||
    client.requests.has(key) ||
    (client.assembly?.bytes ?? 0) + size > bound
  ) {
    disconnect(id, "invalid-bulk-part");
    return;
  }
  const assembly = client.assembly ?? { id: key, tag: request.tag, parts: [], bytes: 0 };
  assembly.parts.push(request.bytes);
  assembly.bytes += size;
  client.assembly = assembly;
  if (!request.final) {
    send(encode({ _tag: "PartAck", requestId: request.id }, encoding));
    return;
  }
  client.assembly = undefined;
  const whole = decodeClient(join(assembly.parts, encoding), encoding, bound);
  if (whole._tag !== "Request" || String(whole.id) !== key || whole.tag !== request.tag) {
    disconnect(id, "invalid-bulk-request");
    return;
  }
  request = whole; // fall through to the ordinary Request handling below
}
```

`join` concatenates strings or `Uint8Array`s (one allocation of `bytes`). A part whose `bytes` type does not match `encoding` (a string under binary or bytes under JSON) is `invalid-bulk-part`. On `Interrupt`, `if (client.assembly?.id === String(request.requestId)) client.assembly = undefined;`. `disconnect` already drops the client record, and with it any assembly. `send` here is the same `send` the response path uses (extract it to the client record or a local so both paths share it). The ordinary `Request` handling that follows (duplicate check, `requests.add`, observer emit, inbox offer) runs unchanged on the assembled request.

In `packages/sewed/src/Binding.ts` `openClient`, pass `boundsOf(binding.protocol)` to `clientProtocol` (`Bulk.ts` imports `propsOf` from `Binding.ts`; `Binding.ts` importing `Bulk.ts` is a cycle — move `propsOf` into `internal/Bulk.ts`'s import from wherever it lives, or read `rpc.annotations` through the same `Rpc.AnyWithProps` bridge inside `Bulk.ts` with its own one-line doc; do not create an import cycle).

`MainBridge.receive` and `BindingRelay.forward` call `decodeClient(message)` per packet with no limit: a part is at most one envelope, so they need no change; confirm by reading both and say so in the report.

- [ ] **Step 7: Run the tests, the contracts, and the neighbours**

Run: `pnpm build && node --import tsx --test --test-timeout=60000 packages/sewed/test/bulk.test.ts packages/sewed/test/binary.test.ts packages/sewed/test/stream-transport.test.ts packages/sewed/test/shared-connection.test.ts packages/sewed/test/boundaries.test.ts && tsc -p packages/sewed/test/tsconfig.json`
Expected: PASS, pristine. `boundaries.test.ts:308-313` and `binary.test.ts:109` pin `decodeClient`'s limit with the default; they must still pass unchanged.

- [ ] **Step 8: Guides**

- `docs/binary-streams.md`: after the "Every native envelope is limited to 256 KiB…" paragraph, add a section `## Bulk requests`: the declaration (`Binary.bulk(rpc, { maxBytes })`, the consumer example from "What the consumer writes"), what happens on the wire (parts of the encoded request, one in flight, acknowledged; the owner assembles up to the bound before the handler runs; relays forward parts), the failures (`Limit` before sending for an over-bound request; `Closed` before delivery vs after; a peer that violates the bound is disconnected), the limits (one assembly per connection; 64 MiB ceiling), and that the in-process path has no bound. Change "A single value that exceeds the limit fails; use a stream for bulk data" to "A single value that exceeds the limit fails unless its operation is declared bulk; a stream carries bulk data from the owner, a bulk request carries it to the owner." Change "There is no shared memory API or implicit upload buffering" to name the explicit one.
- `docs/transport.md:3-17`: add the client-side framing beside the server-side one; note the bound replaces the envelope limit for the assembled request only.
- `docs/api.md:110-112`: one sentence on `Binary.bulk`.
- `docs/testing.md`: one sentence that a bulk request runs over `Testing.layer` at full size.

- [ ] **Step 9: Regenerate the reference, run every check, and commit**

```bash
pnpm build && pnpm docs:reference && pnpm format && timeout 240 pnpm test && pnpm format:check
git add -A packages/sewed docs
git commit -m "feat(transport): a bulk request reaches its owner in acknowledged parts, up to its declared bound"
```

---

### Task 2: Bulk in the playground, and the record

**Files:**

- Playground: `scripts/binary-fixture.mjs` and its renderer document (read `scripts/verify-binary.mjs` to find both), `README.md`
- Modify: `docs/superpowers/specs/2026-09-15-platform-redesign-design.md`, `docs/electron-coverage.md`

- [ ] **Step 1: Extend the binary fixture**

Read `scripts/binary-fixture.mjs` and the document it loads. Add to its protocol a bulk operation `ingest` (`Binary.bulk(Rpc.make("ingest", { payload: { content: Binary.Bytes }, success: Schema.Struct({ length: Schema.Number, sum: Schema.Number }) }), { maxBytes: 12 * 1024 * 1024 })`) served in main by a handler that returns the length and the same sampled checksum the unit test uses; in the renderer document, send a 12 MiB patterned `Uint8Array` and assert the returned length and sum; then send 12 MiB + 1 bytes and assert the failure is `Limit` with `bulk bound` in its message; record both in the fixture's report the way its existing checks are recorded. This proves the real path: contextBridge clone, preload `MessagePort`, `MainBridge`'s per-packet decode, and the owner's assembly.

- [ ] **Step 2: Pack, reinstall, and verify**

```bash
node scripts/release.mjs pack .artifacts
cd /home/lucas/personal/typescript/sewed-playground && pnpm install && pnpm build && env -u FORCE_COLOR pnpm verify:binary
```

Expected: PASS, with the two new checks in its report. Time the 12 MiB round trip from the fixture's log and record it in the report — it is the first measurement of the path.

- [ ] **Step 3: Record**

Spec: add entry 27 under "Decisions settled while implementing" stating rulings 1–8 in the voice of the existing entries (one entry, with the alternatives rejected: a field-level schema, a raised envelope limit, a transferred port), and a line under "Recorded when the declarations wave closed" (or a new closing paragraph for this wave) with the measured round trip and what proves the real path (`verify:binary`). Coverage: `docs/electron-coverage.md` — a wave paragraph and the catalog row for renderer→main bulk bytes → `Binary.bulk`.

- [ ] **Step 4: Checks and commit**

```bash
pnpm format && pnpm format:check
git add -A docs
git commit -m "docs: record bulk requests, and prove them through the playground's binary fixture"
```

---

### Task 3: Shell policy patterns

**Files:**

- Modify: `packages/sewed/src/Shell.ts`, `packages/sewed/src/internal/ShellPolicy.ts`
- Test: modify `packages/sewed/test/shell-policy.test.ts`, `packages/sewed/test/surfaces-types.ts`
- Docs: `docs/desktop-surfaces.md:125-152`, `docs/electron-coverage.md:154`, `docs/reference.md`
- Playground: `scripts/surfaces-fixture.mjs:297-372`, `README.md`

- [ ] **Step 1: Contract**

In `packages/sewed/test/surfaces-types.ts`, beside the existing `rules`:

```ts
// A shell policy grants every http(s) URL with the library's match-pattern vocabulary.
const broad: Shell.Policy = ["*://*/*", { kind: "mailto", address: "support@jobwright.io" }];
void broad;
// @ts-expect-error a pattern is a string, not a rule object with a `pattern` key.
const notARule: Shell.Policy = [{ kind: "pattern", pattern: "*://*/*" }];
void notARule;
```

- [ ] **Step 2: Failing tests**

Append to `packages/sewed/test/shell-policy.test.ts`:

```ts
test("a match pattern grants every http and https URL, ports and IP literals included, and nothing else", () => {
  const allows = ShellPolicy.compile(["*://*/*"]);
  for (const url of [
    "https://jobs.example/listing?id=1",
    "http://example.com/",
    "https://example.com:8443/x",
    "http://127.0.0.1:4100/",
    "https://[::1]/",
  ])
    assert.equal(allows(new URL(url)), true, url);
  for (const url of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,x",
    "mailto:a@b.c",
    "ftp://example.com/",
  ])
    assert.equal(allows(new URL(url)), false, url);
});

test("the shell refuses a pattern that grants a scheme the OS should not get", () => {
  for (const pattern of ["<all_urls>", "javascript://x/*", "data://x/*", "ftp://*/*"])
    assert.throws(() => ShellPolicy.compile([pattern]), TypeError, pattern);
  assert.doesNotThrow(() => ShellPolicy.compile(["file:///tmp/*", "https://*.example.com/*"]));
});

test("openExternal refuses a URL carrying credentials whatever the rule", async () => {
  // Build ShellPolicy.operations over a recording core with policy ["*://*/*", { kind: "origin", origin: "https://example.com" }]
  // and assert openExternal({ url: "https://user:pass@example.com/" }) and
  // openExternal({ url: "https://example.com@evil.example/" }) fail Protocol with /credentials/, and the core never ran.
});
```

Write the third test in full against `ShellPolicy.operations` (read `internal/ShellMemory.ts:9-15` for the no-op core shape and `shell-policy.test.ts` for how `compile` is driven).

- [ ] **Step 3: Implement**

`packages/sewed/src/Shell.ts`: `export const Policy = Schema.Array(Schema.Union([UrlRule.Origin, UrlRule.Document, Mailto, WebRequest.Pattern]));` with the doc comment: a pattern is the same `WebRequest.Pattern` navigation rules use; `*://*/*` is every http or https URL; the shell refuses `<all_urls>` and any scheme other than `*`, `http`, `https`, `file`, or one registered standard.

`packages/sewed/src/internal/ShellPolicy.ts` `compile`:

```ts
const shellSchemes = new Set(["*", "http", "https", "file"]);
const pattern = (value: string): ((url: URL) => boolean) => {
  if (value === "<all_urls>")
    throw new TypeError("A shell policy names its schemes; <all_urls> grants every one");
  const scheme = value.slice(0, value.indexOf(":"));
  if (!shellSchemes.has(scheme) && !StandardSchemes.has(scheme))
    throw new TypeError(
      `A shell pattern's scheme must be *, http, https, file, or registered standard: ${value}`,
    );
  return WebRequest.compilePattern(value);
};
export const compile = (policy: Shell.Policy): ((url: URL) => boolean) => {
  const rules = policy.map((rule) =>
    typeof rule === "string"
      ? pattern(rule)
      : rule.kind === "mailto"
        ? mailto(rule.address)
        : UrlRule.compile(rule),
  );
  return (url) => rules.some((allows) => allows(url));
};
```

(read `StandardSchemes.ts` for the exact name of its membership check — `UrlRule.ts:9-17`'s `registeredStandard` shows it.) In `allowedUrl`, before `settings.allows(url)`: `if (url.username !== "" || url.password !== "") return Effect.fail(protocolError(`URL carries credentials: ${raw}`));`.

- [ ] **Step 4: Run, then guides and playground**

`node --import tsx --test --test-timeout=20000 packages/sewed/test/shell-policy.test.ts packages/sewed/test/url-rule.test.ts packages/sewed/test/surfaces.test.ts && tsc -p packages/sewed/test/tsconfig.json`; strip the new `@ts-expect-error` once.

`docs/desktop-surfaces.md` `## Shell`: add the pattern to the policy sentence, the `*://*/*` spelling, the refused schemes, and the credentials rule. `docs/electron-coverage.md:154`'s comment names patterns too.

Playground `scripts/surfaces-fixture.mjs`: extend the shell block with a policy `["*://*/*", { kind: "mailto", address: … }]` served natively: assert `https://jobs.example/x` opens (the fixture already stubs or observes `shell.openExternal`; follow its existing approach), `https://user:pass@jobs.example/` fails `Protocol` with `credentials`, `javascript:alert(1)` fails `Protocol`, and a policy `["<all_urls>"]` fails `Protocol` at Layer build. `README.md`'s surfaces line names the pattern case. Pack, reinstall, `env -u FORCE_COLOR pnpm verify:surfaces`; PASS.

- [ ] **Step 5: Reference, checks, commit**

```bash
pnpm build && pnpm docs:reference && pnpm format && timeout 240 pnpm test && pnpm format:check
git add -A packages/sewed docs
git commit -m "feat(shell): a shell policy grants URLs by match pattern, and never one with credentials"
```

---

### Task 4: The testing client

**Files:**

- Modify: `packages/sewed/src/Capability.ts`, `packages/sewed/src/Testing.ts`, `packages/sewed/src/internal/HandlerLayer.ts`
- Test: modify `packages/sewed/test/testing-types.ts`, `packages/sewed/test/capability-types.ts`, `packages/sewed/test/testing.test.ts`, `packages/sewed/test/bulk-types.ts` (shorten the `call` example)
- Docs: `docs/testing.md`, `docs/api.md:14`, `docs/reference.md`

- [ ] **Step 1: Contract**

In `packages/sewed/test/testing-types.ts` (read its `Tasks`/`handlers`/`Business` declarations first and reuse them):

```ts
// One call serves a capability over the real wire; the handlers' business requirement stays visible.
const served: Layer.Layer<typeof Calculator, SewedError, Business> = Testing.client(
  Calculator,
  handlers,
);
const servedFromCallback: Layer.Layer<typeof Calculator, SewedError, never> = Testing.client(
  Calculator,
  (implement) => implement({ double: ({ value }) => Effect.succeed(value * 2) }),
);
const observed = Testing.client(Calculator, handlers, { onConnect: () => {} });
// A host can be named as a value a function takes.
const takesHost = (
  host: Capability.Handlers<
    typeof Calculator.protocol extends RpcGroup.RpcGroup<infer R> ? R : never,
    never,
    Business
  >,
) => Testing.client(Calculator, host);
// @ts-expect-error a different protocol's handlers cannot serve this capability.
Testing.client(Calculator, OtherProtocol.toLayer({ other: () => Effect.void }));
// @ts-expect-error Testing.client takes a capability, not a slot.
Testing.client(Calculator.slot, handlers);
// @ts-expect-error the business requirement cannot be erased.
const erased: Layer.Layer<typeof Calculator, SewedError, never> = Testing.client(
  Calculator,
  handlers,
);
void served;
void servedFromCallback;
void observed;
void takesHost;
void erased;
```

Spell `Capability.Handlers`'s first parameter the way `Capability.define`'s `Rpcs` is inferred in this file (a `Calculator` defined here with `Capability.define("calculator", Protocol)` and `Protocol = RpcGroup.make(...)`, so `Capability.Handlers<typeof Protocol extends RpcGroup.RpcGroup<infer R> ? R : never, …>` or an exported `Rpcs` type alias — pick the shorter that compiles and record it; if neither is pleasant, add `Capability.RpcsOf<C>` as a helper type and pin it).

Keep every existing `Testing.layer` pin in the file passing; `testing-types.ts:30-32`'s foreign-handler negative must still bite after the widening.

- [ ] **Step 2: Failing tests**

Append to `packages/sewed/test/testing.test.ts`:

```ts
test("Testing.client serves a capability over the real JSON path, and refuses what fromHandlers accepts", async () => {
  const Strict = Capability.define(
    "strict",
    RpcGroup.make(Rpc.make("value", { success: Schema.Literal("ok") })),
  );
  const lying = (implement: typeof Strict.protocol.toLayer) =>
    implement({ value: () => Effect.succeed("not ok" as never) });
  const program = Effect.gen(function* () {
    const strict = yield* Strict;
    return yield* strict.value();
  });
  const inProcess = await Effect.runPromiseExit(
    program.pipe(Effect.provide(Capability.fromHandlers(Strict, lying))),
  );
  assert.ok(
    Exit.isSuccess(inProcess),
    "fromHandlers proves behaviour only: the value is not encoded",
  );
  const overWire = await Effect.runPromiseExit(
    Effect.scoped(program.pipe(Effect.provide(Testing.client(Strict, lying)))),
  );
  assert.ok(Exit.isFailure(overWire), "Testing.client proves the host's own values encode");
});

test("Testing.client accepts the bare handlers Layer and passes onConnect through", async () => {
  // count connects with { onConnect }, run two calls under one scope, assert one connect (shared connection).
});
```

Write the second in full; `testing.test.ts:129-138` shows the `onConnect` pattern.

- [ ] **Step 3: Implement**

`packages/sewed/src/Capability.ts`: `export type Handlers<Rpcs extends Rpc.Any, E = never, R = never> = HandlerLayer<Rpcs, E, R>;` with a doc comment: the handlers a host serves — a Layer of the protocol's handlers, or a function of `implement` (the protocol's `toLayer`) returning one; what `fromHandlers`, `Testing.client` and `Testing.layer` take, named so a function can take a host as a parameter.

`packages/sewed/src/Testing.ts`: `layer`'s `handlers` parameter becomes `HandlerLayer<Rpcs, E, R>` and the body passes it to `host` unchanged (`host` already normalises through `handlerLayer`). Add:

```ts
/**
 * Serves a capability over the real wire for a test: the capability's client Layer over an
 * in-process host of `handlers`. This is the composition that proves a host's own values encode;
 * `Capability.fromHandlers` dispatches in process and proves behaviour only.
 */
export const client = <Rpcs extends Rpc.Any, Key extends string, E, R>(
  capability: Capability.Capability<Rpcs, Key>,
  handlers: HandlerLayer<Rpcs, E, R>,
  options: { readonly onConnect?: () => void } = {},
): Layer.Layer<Capability.Capability<Rpcs, Key>, E | SewedError, R> =>
  Capability.client(capability).pipe(Layer.provide(layer(capability.slot, handlers, options)));
```

- [ ] **Step 4: Run, guides**

`pnpm build && node --import tsx --test --test-timeout=20000 packages/sewed/test/testing.test.ts packages/sewed/test/capability.test.ts && tsc -p packages/sewed/test/tsconfig.json`; strip each new `@ts-expect-error` once. Shorten `bulk-types.ts`'s `call` example to `Testing.client(Attachments, handlers)`.

`docs/testing.md` `## Capabilities in tests`: lead with `Testing.client` (the `Calculator` example in one call), keep `Testing.layer` for a slot, and replace line 45's sentence with a short table: `Capability.fromHandlers` / the memory Layers — in process, proves behaviour, not encoding; `Testing.client` / `Testing.layer` — the real schema and wire, proves the host's own values encode. Name `Capability.Handlers` where a helper takes a host. `docs/api.md:14`'s `sewed/testing` list gains `client`.

- [ ] **Step 5: Reference, checks, commit**

```bash
pnpm build && pnpm docs:reference && pnpm format && timeout 240 pnpm test && pnpm format:check
git add -A packages/sewed docs
git commit -m "feat(testing): serve a capability over the wire in one call, and name the handlers a host takes"
```

---

### Task 5: Sweep and hand-backs

- [ ] **Step 1:** `pnpm build && pnpm docs:reference && pnpm format:check && timeout 240 pnpm test && pnpm website:build`.
- [ ] **Step 2:** Pack, reinstall the playground, `verify:binary`, `verify:surfaces`, `verify:features` (or whichever fixture uses `Testing`), and confirm the installed `lib` is byte-identical to a clean build (delete `packages/sewed/tsconfig.tsbuildinfo` before the clean build).
- [ ] **Step 3:** Hand-backs are the controller's: `bulk-bytes-handback.md` and `shell-policy-handback.md` (covering the testing client) in the requester's scratchpad, with the API as landed, the commits, and how to re-vendor.

---

## Self-review

- **Requests covered.** Bulk: declared per operation with `maxBytes` (ruling 1), enforced host-side before the handler and before buffering beyond the bound (rulings 3–4), the handler gets the assembled `Uint8Array` (5), backpressure and scope tie-in (4, 8), typed failures with the delivered/undelivered distinction (7), a 12 MiB Node test and an over-bound test (Task 1 Step 2), a `Blob`/`File` helper parked (the renderer has the bytes; `new Uint8Array(await file.arrayBuffer())` is the one-liner, documented). Shell: a pattern member, `*://*/*`, credentials/ports/IP literals/`javascript:`/`file:` each decided and tested (Task 3), the memory Layer shares `compile`. Testing: `Testing.client`, `Capability.Handlers`, the "which Layer proves what" statement (Task 4).
- **Type consistency.** `Binary.bulk`, `Bulk.boundsOf`, `Bulk.maxBulkBytes`, `RequestPart`, `PartAck`, `clientProtocol(connection, encoding, bounds, onFailure?)`, `Testing.client`, `Capability.Handlers` are spelled identically throughout.
- **Ordering.** Task 1 → Task 2; Tasks 3 and 4 are independent of each other and of Task 2; Task 4 touches `bulk-types.ts` after Task 1. Task 5 after all.
