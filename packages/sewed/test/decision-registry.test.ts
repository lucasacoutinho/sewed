import assert from "node:assert/strict";
import { test } from "node:test";
import { Deferred, Effect, Fiber, Logger, Schema } from "effect";
import * as Decision from "../src/Decision.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";

const Answer = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("deny") }),
  Schema.Struct({ kind: Schema.Literal("prompt") }),
  Schema.Struct({ kind: Schema.Literal("save") }),
]);

const Download = Decision.decidable({
  key: "test/download",
  event: Schema.Struct({ url: Schema.String }),
  answer: Answer,
  fallback: { kind: "save" } as const,
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("restrictive composition keeps the most restrictive answer, not the first", () => {
  const registry = Registry.make();
  registry.install(
    Download,
    Decision.sync(() => ({ kind: "save" })),
  );
  registry.install(
    Download,
    Decision.sync(() => ({ kind: "deny" })),
  );
  registry.install(
    Download,
    Decision.sync(() => ({ kind: "prompt" })),
  );
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "deny" });
});

test("a decider that passes contributes nothing and the rest still decide", () => {
  const registry = Registry.make();
  registry.install(
    Download,
    Decision.sync(() => Decision.Pass),
  );
  registry.install(
    Download,
    Decision.sync(() => ({ kind: "prompt" })),
  );
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "prompt" });
});

test("with no decider, and with every decider passing, the fallback answers", () => {
  const registry = Registry.make();
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "save" });
  registry.install(
    Download,
    Decision.sync(() => Decision.Pass),
  );
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "save" });
});

test("removing a decider's install stops it deciding", () => {
  const registry = Registry.make();
  const remove = registry.install(
    Download,
    Decision.sync(() => ({ kind: "deny" })),
  );
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "deny" });
  remove();
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "save" });
});

test("an answer whose discriminant is not in the order falls back and does not win", () => {
  const registry = Registry.make();
  registry.install(
    Download,
    Decision.sync(() => ({ kind: "elsewhere" })),
  );
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "save" });
});

// Download's own fallback ("save") is the *least* restrictive answer, so a test built on Download
// cannot tell "a throw contributes the fallback" apart from "a throw contributes nothing": either
// way the other decider's real answer would win. Secure's fallback is the restrictive end instead,
// so the two behaviors diverge observably.
const Secure = Decision.decidable({
  key: "test/secure",
  event: Schema.Struct({}),
  answer: Answer,
  fallback: { kind: "deny" } as const,
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("under restrictive composition, a throwing decider contributes the fallback, not nothing", () => {
  const registry = Registry.make();
  registry.install(
    Secure,
    Decision.sync(() => {
      throw new Error("boom");
    }),
  );
  registry.install(
    Secure,
    Decision.sync(() => ({ kind: "prompt" })),
  );
  // If the throw contributed nothing, "prompt" (the only real candidate) would win instead.
  assert.deepEqual(registry.resolveSync(Secure, {}), { kind: "deny" });
});

test("a lazily-throwing discriminant getter neither aborts a restrictive resolution nor is dropped silently", () => {
  const registry = Registry.make();
  registry.install(
    Secure,
    // Reading "kind" runs decider-controlled code. It must not escape resolveSync from inside what
    // is meant to be a native callback, and an answer nobody can read is a broken decider exactly
    // as much as one that throws outright.
    Decision.sync(() => ({
      get kind(): string {
        throw new Error("lazy boom");
      },
    })),
  );
  registry.install(
    Secure,
    Decision.sync(() => ({ kind: "prompt" })),
  );
  // Built on Secure rather than Download for the reason above: dropping the unreadable answer
  // would leave "prompt" the only candidate, and it would win.
  assert.deepEqual(registry.resolveSync(Secure, {}), { kind: "deny" });
});

// A decider's *thrown value* is as decider-controlled as its answer, and reporting a failure renders
// the cause, which reads that value's properties. Each of these aborts resolveSync when the report
// is not contained — the hostile-answer hazard one step later, in the diagnostic rather than in the
// decision.
const hostileThrowers: ReadonlyArray<readonly [string, () => never]> = [
  [
    "an Error whose message getter throws",
    () => {
      const hostile = new Error("placeholder");
      Object.defineProperty(hostile, "message", {
        get(): string {
          throw new Error("hostile message");
        },
      });
      throw hostile;
    },
  ],
  [
    "an Error whose stack getter throws",
    () => {
      const hostile = new Error("placeholder");
      Object.defineProperty(hostile, "stack", {
        get(): string {
          throw new Error("hostile stack");
        },
      });
      throw hostile;
    },
  ],
  [
    "a Proxy whose get trap throws",
    () => {
      throw new Proxy(new Error("placeholder"), {
        get(): never {
          throw new Error("hostile trap");
        },
      });
    },
  ],
  [
    "a value whose toString throws",
    () => {
      throw {
        get toString(): never {
          throw new Error("hostile toString");
        },
      };
    },
  ],
];

test("a decider that throws a value whose own properties throw is contained, so reporting it cannot abort the resolution", () => {
  for (const [label, thrower] of hostileThrowers) {
    const registry = Registry.make();
    registry.install(Secure, Decision.sync(thrower));
    registry.install(
      Secure,
      Decision.sync(() => ({ kind: "prompt" })),
    );
    // Contained and still counted: an unreportable failure contributes Secure's rank-0 fallback
    // exactly as an ordinary one does, so containment costs nothing in restrictiveness.
    assert.deepEqual(registry.resolveSync(Secure, {}), { kind: "deny" }, label);
  }
});

// An answer with a payload field: an in-order discriminant can still fail to decode (missing
// "reason"), which a bare-literal or single-field-struct answer never can. This is what makes the
// unfinished half of C2 observable.
const AnswerWithPayload = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("deny"), reason: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("prompt") }),
  Schema.Struct({ kind: Schema.Literal("save") }),
]);

const Payload = Decision.decidable({
  key: "test/payload",
  event: Schema.Struct({}),
  answer: AnswerWithPayload,
  fallback: { kind: "save" } as const,
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("restrictive composition moves on to the next-best-ranked candidate when the winner fails to decode, rather than answering the fallback outright", () => {
  const registry = Registry.make();
  registry.install(
    Payload,
    // In order (rank 0) by discriminant, but missing the required "reason" field: fails to decode.
    Decision.sync(() => ({ kind: "deny" })),
  );
  registry.install(
    Payload,
    Decision.sync(() => ({ kind: "prompt" })),
  );
  // The fallback ("save") is less restrictive than "prompt" and must not win here: only the
  // malformed "deny" candidate is disqualified, and "prompt" is a valid, more-restrictive answer.
  assert.deepEqual(registry.resolveSync(Payload, {}), { kind: "prompt" });
});

test("restrictive composition breaks a rank tie by install order, keeping the earliest", () => {
  const registry = Registry.make();
  // The count is not load-bearing, and an earlier version of this comment claimed otherwise.
  // `Array.prototype.sort` has been required stable since ES2019 (ECMA-262 §23.1.3.30), so a tie
  // keeps install order at any size, and this test kills the same mutations with three installs.
  // Forty is kept only so that a reversal fails with an obviously distant winner.
  const installs = 40;
  for (let index = 0; index < installs; index += 1) {
    registry.install(
      Payload,
      // Same discriminant, so all forty rank equally; distinguishable payloads, so which one won is
      // observable. Nothing else in the suite can tell one same-ranked candidate from another.
      Decision.sync(() => ({ kind: "deny", reason: `decider-${index}` })),
    );
  }
  assert.deepEqual(registry.resolveSync(Payload, {}), { kind: "deny", reason: "decider-0" });
});

// The pairing no committed test has had: a rank-0 fallback and an answer that fails to decode.
// Payload above pairs a decode failure with a rank-2 fallback, where contributing the fallback and
// dropping the answer are indistinguishable, because either way "prompt" wins.
const SecurePayload = Decision.decidable({
  key: "test/secure-payload",
  event: Schema.Struct({}),
  answer: AnswerWithPayload,
  fallback: { kind: "deny", reason: "fallback" } as const,
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("under restrictive composition, an answer that fails to decode contributes the fallback, the same as a decider that throws", () => {
  const registry = Registry.make();
  registry.install(
    SecurePayload,
    // In order (rank 0) by discriminant, but missing the required "reason": this decider answered
    // nothing its decidable accepts, which is a failure rather than a Pass.
    Decision.sync(() => ({ kind: "deny" })),
  );
  registry.install(
    SecurePayload,
    Decision.sync(() => ({ kind: "prompt" })),
  );
  // Dropping the malformed answer silently would resolve "prompt" — less restrictive than this
  // fail-closed decidable's own declared fallback, on account of a decider that never answered.
  assert.deepEqual(registry.resolveSync(SecurePayload, {}), { kind: "deny", reason: "fallback" });
});

// The async twin. Decoding happens at two call sites, one per entry kind, and every other async
// answer in this file is a bare literal that decodes to itself — so without this test the async
// site could stop decoding altogether and the suite would stay green. App.Quit, App.Login and
// App.CertificateError are all async, which is where an unvalidated answer would reach Electron.
const SecurePayloadAsync = Decision.decidable({
  key: "test/secure-payload-async",
  event: Schema.Struct({}),
  answer: AnswerWithPayload,
  fallback: { kind: "deny", reason: "fallback" } as const,
  timing: "async",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("resolveAsync: an async decider's answer is decoded too, so an off-schema one contributes the fallback", async () => {
  const registry = Registry.make();
  registry.install(
    SecurePayloadAsync,
    // Rank 0 by discriminant, missing the required "reason", and answered through an Effect.
    Decision.async(() => Effect.succeed({ kind: "deny" })),
  );
  registry.install(
    SecurePayloadAsync,
    Decision.sync(() => ({ kind: "prompt" })),
  );
  const answer = await Effect.runPromise(registry.resolveAsync(SecurePayloadAsync, {}));
  assert.deepEqual(answer, { kind: "deny", reason: "fallback" });
});

const SharedKeySync = Decision.decidable({
  key: "test/shared-key",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "sync",
  composition: "first",
});

const SharedKeyAsync = Decision.decidable({
  key: "test/shared-key",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "async",
  composition: "first",
});

test("two decidables that share a key string but differ in timing stay independent", () => {
  const registry = Registry.make();
  registry.install(
    SharedKeyAsync,
    // Genuinely suspends (never resolves synchronously): if the registry were keyed by the string
    // "test/shared-key" rather than decidable identity, resolveSync below would meet this entry
    // (installed through a *different* decidable) and Effect.runSync would throw AsyncFiberError
    // inside what is meant to be a synchronous native callback.
    Decision.async(() =>
      Effect.callback<"allow" | "block">((resume) => {
        setTimeout(() => resume(Effect.succeed("block")), 0);
      }),
    ),
  );
  registry.install(
    SharedKeySync,
    Decision.sync(() => "block"),
  );
  assert.equal(registry.resolveSync(SharedKeySync, {}), "block");
});

const Close = Decision.decidable({
  key: "test/close",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  // "first" composition and "sync" timing are independent: resolveSync requires sync timing, and
  // the deciders below are all synchronous either way, so this exercises "first" without touching
  // the async-timing/async-decider combination that belongs to the resolveAsync tests below.
  timing: "sync",
  composition: "first",
});

test("first composition keeps the first answer that is not Pass, in install order", () => {
  const registry = Registry.make();
  registry.install(
    Close,
    Decision.sync(() => Decision.Pass),
  );
  registry.install(
    Close,
    Decision.sync(() => "block"),
  );
  registry.install(
    Close,
    Decision.sync(() => "allow"),
  );
  assert.equal(registry.resolveSync(Close, {}), "block");
});

test("under first composition, a throwing decider contributes nothing and the next decider still decides", () => {
  const registry = Registry.make();
  registry.install(
    Close,
    Decision.sync(() => {
      throw new Error("boom");
    }),
  );
  registry.install(
    Close,
    Decision.sync(() => "block"),
  );
  assert.equal(registry.resolveSync(Close, {}), "block");
});

test("under first composition, an answer outside the schema is skipped and the next decider still decides", () => {
  const registry = Registry.make();
  registry.install(
    Close,
    Decision.sync(() => "nonsense"),
  );
  registry.install(
    Close,
    Decision.sync(() => "block"),
  );
  assert.equal(registry.resolveSync(Close, {}), "block");
});

test("a bare-literal answer ranks by its own value, with no kind field", () => {
  const Restrictive = Decision.decidable({
    key: "test/input",
    event: Schema.Struct({}),
    answer: Schema.Literals(["allow", "block"]),
    fallback: "allow" as const,
    timing: "sync",
    composition: "restrictive",
    order: ["block", "allow"],
  });
  const registry = Registry.make();
  registry.install(
    Restrictive,
    Decision.sync(() => "allow"),
  );
  registry.install(
    Restrictive,
    Decision.sync(() => "block"),
  );
  assert.equal(registry.resolveSync(Restrictive, {}), "block");
});

// resolveAsync: composition, Pass, and the failure paths C1 fixed (a synchronous throw before an
// async decider even returns its Effect, and a failure inside the returned Effect), on a decidable
// declared "async" so async deciders may legally install on it.
const CloseAsync = Decision.decidable({
  key: "test/close-async",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "async",
  composition: "first",
});

test("resolveAsync runs sync and async deciders in order and keeps the first non-Pass answer", async () => {
  const registry = Registry.make();
  registry.install(
    CloseAsync,
    Decision.sync(() => Decision.Pass),
  );
  registry.install(
    CloseAsync,
    Decision.async(() => Effect.succeed("block")),
  );
  registry.install(
    CloseAsync,
    Decision.sync(() => "allow"),
  );
  const answer = await Effect.runPromise(registry.resolveAsync(CloseAsync, {}));
  assert.equal(answer, "block");
});

test("resolveAsync: an async decider that throws synchronously, before returning its Effect, contributes nothing under first and does not stop the others", async () => {
  const registry = Registry.make();
  registry.install(
    CloseAsync,
    Decision.async(() => {
      throw new Error("sync throw in async decider");
    }),
  );
  registry.install(
    CloseAsync,
    Decision.sync(() => "block"),
  );
  const answer = await Effect.runPromise(registry.resolveAsync(CloseAsync, {}));
  assert.equal(answer, "block");
});

test("resolveAsync: an async decider whose Effect fails contributes nothing under first and does not stop the others", async () => {
  const registry = Registry.make();
  registry.install(
    CloseAsync,
    Decision.async(() => Effect.die(new Error("boom"))),
  );
  registry.install(
    CloseAsync,
    Decision.sync(() => "block"),
  );
  const answer = await Effect.runPromise(registry.resolveAsync(CloseAsync, {}));
  assert.equal(answer, "block");
});

const SecureAsync = Decision.decidable({
  key: "test/secure-async",
  event: Schema.Struct({}),
  answer: Answer,
  fallback: { kind: "deny" } as const,
  timing: "async",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("resolveAsync: under restrictive composition, a failing async decider contributes the fallback, not nothing", async () => {
  const registry = Registry.make();
  registry.install(
    SecureAsync,
    Decision.async(() => Effect.die(new Error("boom"))),
  );
  registry.install(
    SecureAsync,
    Decision.sync(() => ({ kind: "prompt" })),
  );
  const answer = await Effect.runPromise(registry.resolveAsync(SecureAsync, {}));
  assert.deepEqual(answer, { kind: "deny" });
});

test("resolveAsync answers the fallback with no decider installed", async () => {
  const registry = Registry.make();
  const answer = await Effect.runPromise(registry.resolveAsync(CloseAsync, {}));
  assert.equal(answer, "allow");
});

// What a failure is reported as, which is the only trace a consumer gets of a decidable that keeps
// answering its fallback. `resolveSync` runs its own fiber and so cannot be handed a logger, but the
// report is one site in `resolveCore` shared by both resolutions, so resolving asynchronously
// exercises the same lines. `Logger.formatSimple` renders the cause through the same `causePretty`
// the default logger reaches — it is not what `defaultLogger` is built from, but that shared
// rendering is what a hostile thrown value turns into an abort, so these tests meet the real hazard
// rather than an imitation of it. A logger reading only `options.message` would not: the cause
// arrives in `options.cause`, so such a logger emits the same primary line either way.
const reportOf = async (
  decider: Decision.Sync<Record<string, never>, never>,
): Promise<readonly string[]> => {
  const lines: string[] = [];
  const registry = Registry.make();
  registry.install(SecureAsync, decider);
  await Effect.runPromise(
    registry.resolveAsync(SecureAsync, {}).pipe(
      Effect.provide(
        Logger.layer([
          Logger.map(Logger.formatSimple, (line) => {
            lines.push(line);
          }),
        ]),
      ),
    ),
  );
  return lines;
};

test("a decider that fails is reported, naming its decidable and what its failure contributed", async () => {
  const lines = await reportOf(
    Decision.sync(() => {
      throw new Error("ordinary boom");
    }),
  );
  assert.equal(lines.length, 1);
  const [line = ""] = lines;
  assert.ok(line.includes("test/secure-async"), line);
  assert.ok(line.includes("contributing the fallback"), line);
  // The cause is rendered too, which is what makes the line worth reading.
  assert.ok(line.includes("ordinary boom"), line);
});

test("a decider that throws an unreportable value cannot silence its own failure", async () => {
  const lines = await reportOf(
    Decision.sync(() => {
      const hostile = new Error("placeholder");
      Object.defineProperty(hostile, "message", {
        get(): string {
          throw new Error("hostile message");
        },
      });
      throw hostile;
    }),
  );
  // Rendering the cause dies, so the report falls back to a line that still names the decidable and
  // says why it carries no cause. Reporting nothing at all would leave a decidable quietly answering
  // its fallback with no trace of the decider that made it.
  assert.equal(lines.length, 1);
  const [line = ""] = lines;
  assert.ok(line.includes("test/secure-async"), line);
  assert.ok(line.includes("its cause could not be rendered"), line);
});

// The event a decider receives is the value the resolver was called with, untouched. That is what
// deleting the per-resolve event decode bought, and it is what makes a decider useful at all: an
// Electron event is not data. A download offer carries the item, a certificate request carries the
// chain, a window event carries the window. A shallow copy satisfies the same structural type and
// loses all but one of the things below — `{ ...event }` copies the `handle` reference, so that one
// method still works through a copy — which is why identity is what carries these tests.
class NativeHandle {
  close(): string {
    return "closed";
  }
}

class NativeEvent {
  readonly handle: NativeHandle = new NativeHandle();
  constructor(readonly url: string) {
    Object.defineProperty(this, "internalId", { value: "hidden", enumerable: false });
  }
  sourceId(): string {
    return `source:${this.url}`;
  }
}

/** What a decider managed to observe about the event it was handed. */
interface Observed {
  identical: boolean;
  instance: boolean;
  method: string;
  handleMethod: string;
  nonEnumerable: boolean;
}

const unobserved = (): Observed => ({
  identical: false,
  instance: false,
  method: "",
  handleMethod: "",
  nonEnumerable: false,
});

const observe = (
  observed: Observed,
  received: { readonly url: string },
  original: NativeEvent,
): void => {
  observed.identical = received === original;
  // Identity is the load-bearing check: a faithful copy — same prototype, same property descriptors
  // — passes every assertion below, and only `===` rejects it. The narrowing is the second line of
  // defense, against the cheaper copies that drop the class along with everything on it.
  if (!(received instanceof NativeEvent)) return;
  observed.instance = true;
  observed.method = received.sourceId();
  observed.handleMethod = received.handle.close();
  observed.nonEnumerable = Object.hasOwn(received, "internalId");
};

const assertUntouched = (observed: Observed, url: string): void => {
  assert.equal(observed.identical, true, "the decider was handed a different object");
  assert.equal(observed.instance, true, "the decider was handed something of another class");
  assert.equal(observed.method, `source:${url}`, "a method on the event was lost");
  assert.equal(observed.handleMethod, "closed", "a method on a handle the event carries was lost");
  assert.equal(observed.nonEnumerable, true, "a non-enumerable property was lost");
};

// The schema describes the field a rule would read. The value Electron hands over carries more, and
// that surplus is exactly what has to survive the trip to a decider.
const NativeCarrier = Decision.decidable({
  key: "test/native-event",
  event: Schema.Struct({ url: Schema.String }),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "sync",
  composition: "first",
});

test("a sync decider is handed the event object itself, with its class, methods and hidden fields intact", () => {
  const registry = Registry.make();
  const event = new NativeEvent("https://a/");
  const observed = unobserved();
  registry.install(
    NativeCarrier,
    Decision.sync((received: { readonly url: string }) => {
      observe(observed, received, event);
      return "allow";
    }),
  );
  registry.resolveSync(NativeCarrier, event);
  assertUntouched(observed, "https://a/");
});

const NativeCarrierAsync = Decision.decidable({
  key: "test/native-event-async",
  event: Schema.Struct({ url: Schema.String }),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow" as const,
  timing: "async",
  composition: "first",
});

test("an async decider is handed the event object itself too, down the other resolution path", async () => {
  const registry = Registry.make();
  const event = new NativeEvent("https://b/");
  const observed = unobserved();
  registry.install(
    NativeCarrierAsync,
    Decision.async((received: { readonly url: string }) =>
      Effect.sync(() => {
        observe(observed, received, event);
        return "allow";
      }),
    ),
  );
  await Effect.runPromise(registry.resolveAsync(NativeCarrierAsync, event));
  assertUntouched(observed, "https://b/");
});

test("a computed discriminant is snapshotted by decoding, so the answer that ranked is the answer returned", () => {
  const registry = Registry.make();
  let reads = 0;
  let afterwards = false;
  // The suite's other computed accessor throws. This one does not: it decodes cleanly and only
  // reports something else once the resolution is over.
  const answered = {
    get kind(): string {
      reads += 1;
      return afterwards ? "deny" : "prompt";
    },
  };
  registry.install(
    Download,
    Decision.sync(() => answered),
  );
  registry.install(
    Download,
    Decision.sync(() => ({ kind: "save" })),
  );
  const resolved = registry.resolveSync(Download, { url: "https://a/" });
  // The decider's own object now reports the most restrictive answer in the order. Had the registry
  // ranked or returned that object rather than a decoded copy, this flip would change what the
  // resolution means after the fact.
  afterwards = true;
  assert.ok(reads > 0, "the accessor was never read, so this test proves nothing");
  assert.notEqual(resolved, answered);
  assert.deepEqual(resolved, { kind: "prompt" });
  assert.equal(answered.kind, "deny");
});

// Fix round 2: resolveCore used to walk entries.get(decidable) directly — the same live array
// installOne's removal splices with list.splice(index, 1) — rather than a snapshot taken at the start
// of the resolution. A removal landing while an earlier entry is still suspended shifts every later
// entry down one index in that live array, and the for...of iterator, which reads by index, can then
// skip a still-installed entry that was never given the chance to answer. Both probes use a
// restrictive decidable so a widened answer is directly observable, and both install an async decider
// that suspends until a Deferred releases it, so a removal can land mid-resolution deterministically.
const InFlightRemoval = Decision.decidable({
  key: "test/in-flight-removal",
  event: Schema.Struct({}),
  answer: Schema.Literals(["deny", "allow"]),
  fallback: "allow" as const,
  timing: "async",
  composition: "restrictive",
  order: ["deny", "allow"],
});

test("probe A: a decider removed while its own answer is still pending still contributes that answer", async () => {
  const registry = Registry.make();
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<"deny" | "allow">();
        const remove = registry.install(
          InFlightRemoval,
          Decision.async(() =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              return yield* Deferred.await(release);
            }),
          ),
        );
        const fiber = yield* Effect.forkScoped(registry.resolveAsync(InFlightRemoval, {}));
        yield* Deferred.await(started);
        // The decider's own installing scope closes while its answer is still pending.
        remove();
        yield* Deferred.succeed(release, "deny");
        const answer = yield* Fiber.join(fiber);
        // A resolution already in flight when a decider is removed still completes with that
        // decider's own contribution — the documented in-flight semantic, not a bug: the registry
        // resolves against a snapshot of the entries installed when the resolution began.
        assert.equal(answer, "deny");
      }),
    ),
  );
});

test("probe B: removing one decider mid-resolution must not skip a still-installed decider that has not answered yet", async () => {
  const registry = Registry.make();
  let bCalls = 0;
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<"deny" | "allow">();
        const removeA = registry.install(
          InFlightRemoval,
          Decision.async(() =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              return yield* Deferred.await(release);
            }),
          ),
        );
        registry.install(
          InFlightRemoval,
          Decision.sync(() => {
            bCalls += 1;
            return "deny";
          }),
        );
        const fiber = yield* Effect.forkScoped(registry.resolveAsync(InFlightRemoval, {}));
        yield* Deferred.await(started);
        // A's installing scope closes while A is still suspended, and while B — installed after A,
        // and not yet consulted — is still waiting its turn. Without a snapshot, removing A here
        // shifts B down to A's old index in the live array, and the resolution's iterator, already
        // past that index, never reaches it.
        removeA();
        yield* Deferred.succeed(release, "allow");
        const answer = yield* Fiber.join(fiber);
        // B's denial must not be widened away by A's unrelated removal: B was installed, never
        // removed, and never given the chance to answer before the resolution completed.
        assert.equal(answer, "deny", "B's denial must not be widened away by A's removal");
        assert.equal(
          bCalls,
          1,
          "B must be consulted even though A was removed while B was still pending",
        );
      }),
    ),
  );
});

// Fix round 3's adversarial cases: the snapshot fix (fix round 2) closed the async, cross-fiber
// widening probe B pinned, but the same family of defect is reachable two more ways nothing else in
// this file exercises. A sync-timing decidable, so these run through resolveSync — the door that
// executes inside an Electron callback with no fiber and no suspension at all.
const SyncInFlightRemoval = Decision.decidable({
  key: "test/sync-in-flight-removal",
  event: Schema.Struct({}),
  answer: Schema.Literals(["deny", "allow"]),
  fallback: "allow" as const,
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "allow"],
});

test("ADV1: a sync decider that removes another mid-walk, through resolveSync, does not skip it", () => {
  const registry = Registry.make();
  let bCalls = 0;
  let cCalls = 0;
  let removeB = () => {};
  registry.install(
    SyncInFlightRemoval,
    Decision.sync(() => {
      // Removes B synchronously, from inside A's own body — no fiber, no suspension, no timing
      // window at all. The old live walk shifted C into B's vacated index and skipped B entirely.
      removeB();
      return Decision.Pass;
    }),
  );
  removeB = registry.install(
    SyncInFlightRemoval,
    Decision.sync(() => {
      bCalls += 1;
      return "deny";
    }),
  );
  registry.install(
    SyncInFlightRemoval,
    Decision.sync(() => {
      cCalls += 1;
      return "deny";
    }),
  );
  const answer = registry.resolveSync(SyncInFlightRemoval, {});
  assert.equal(answer, "deny");
  assert.equal(bCalls, 1, "B must be consulted even though A removed it mid-walk");
  assert.equal(cCalls, 1, "C must still be consulted too, at its own position");
});

test("ADV2: a sync decider that removes itself mid-walk does not skip the next decider", () => {
  const registry = Registry.make();
  let bCalls = 0;
  let removeA = () => {};
  removeA = registry.install(
    SyncInFlightRemoval,
    Decision.sync(() => {
      removeA();
      return Decision.Pass;
    }),
  );
  registry.install(
    SyncInFlightRemoval,
    Decision.sync(() => {
      bCalls += 1;
      return "deny";
    }),
  );
  const answer = registry.resolveSync(SyncInFlightRemoval, {});
  assert.equal(answer, "deny");
  assert.equal(bCalls, 1, "B must be consulted even though A removed itself mid-walk");
});

test("ADV3: a decider installed while an earlier one is still suspended is not consulted by the resolution already in flight, but is consulted by the next one", async () => {
  const registry = Registry.make();
  let cCalls = 0;
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<"deny" | "allow">();
        registry.install(
          InFlightRemoval,
          Decision.async(() =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              return yield* Deferred.await(release);
            }),
          ),
        );
        const fiber = yield* Effect.forkScoped(registry.resolveAsync(InFlightRemoval, {}));
        yield* Deferred.await(started);
        // Installed after this resolution already began: the documented semantic's other half says
        // it must not be consulted by this in-flight walk.
        registry.install(
          InFlightRemoval,
          Decision.sync(() => {
            cCalls += 1;
            return "deny";
          }),
        );
        yield* Deferred.succeed(release, "allow");
        const answer = yield* Fiber.join(fiber);
        assert.equal(
          answer,
          "allow",
          "the in-flight resolution must not see the newly installed decider",
        );
        assert.equal(
          cCalls,
          0,
          "the newly installed decider must not be consulted by the in-flight walk",
        );
        // A resolution that starts fresh afterward does see it.
        const nextAnswer = yield* registry.resolveAsync(InFlightRemoval, {});
        assert.equal(nextAnswer, "deny");
        assert.equal(cCalls, 1, "a fresh resolution consults every currently installed decider");
      }),
    ),
  );
});

// ADV5: the snapshot point itself was inconsistent. resolveSync/resolveAsync used to pass
// `entries.get(decidable) ?? []` — evaluated eagerly, when resolveAsync is *called* — while the
// snapshot inside resolveCore is taken lazily, when the resolution *runs*. When the decidable already
// has an entry list those are the same array; when it has never had one, the `?? []` froze a fresh,
// disconnected empty literal at call time, and a decider installed afterward landed in a *different*
// array that the lazy snapshot never saw. Fixed by passing listFor(decidable) at both call sites, so
// an entry list always exists and every read of it — eager or lazy — is the same object.
test("ADV5: a decider installed after resolveAsync is called, but before its resolution runs, is still consulted on a decidable that has never had one before", async () => {
  const registry = Registry.make();
  const NeverInstalled = Decision.decidable({
    key: "test/never-installed-before",
    event: Schema.Struct({}),
    answer: Schema.Literals(["deny", "allow"]),
    fallback: "allow" as const,
    timing: "async",
    composition: "restrictive",
    order: ["deny", "allow"],
  });
  // Calling resolveAsync builds the Effect (and, with the old code, would have captured the entry
  // list) before anything is ever installed on this decidable.
  const resolution = registry.resolveAsync(NeverInstalled, {});
  let lateCalls = 0;
  registry.install(
    NeverInstalled,
    Decision.sync(() => {
      lateCalls += 1;
      return "deny";
    }),
  );
  const answer = await Effect.runPromise(resolution);
  assert.equal(answer, "deny");
  assert.equal(
    lateCalls,
    1,
    "a decider installed before the resolution actually runs must be consulted",
  );
});

// ADV9/ADV10: the fallback used to be handed out by reference. `decidable` is Object.freeze'd at
// declaration, but that freeze is shallow, so an object-typed fallback (Download's `{ kind: "save" }`,
// here) was still mutable through the value a caller received back. Mutating one returned fallback
// corrupted `decidable.fallback` itself, so every later resolution that also fell back answered with
// the mutated value. Fixed by decoding the fallback afresh at both places it is used: `pickAnswer`'s
// own no-candidate-survives default, and `resolveCore`'s "a failing decider contributes the fallback
// under restrictive composition" branch.

test("ADV9: the no-decider fallback is decoded afresh, so mutating a returned answer does not corrupt the next resolution", () => {
  const registry = Registry.make();
  const first = registry.resolveSync(Download, { url: "https://example.test" });
  assert.deepEqual(first, { kind: "save" });
  // Nothing in the schema-decoded type stops this at runtime — that is exactly the hazard this test
  // pins, and this file is never typechecked (only *-types.ts and types.ts are), so it would not be
  // stopped at build time either.
  first.kind = "deny";
  const second = registry.resolveSync(Download, { url: "https://example.test" });
  assert.deepEqual(
    second,
    { kind: "save" },
    "mutating the first fallback answer must not corrupt a later resolution's fallback",
  );
});

test("ADV10: the fallback a failing decider contributes under restrictive composition is also decoded afresh", () => {
  // Secure, not Download: with only one, always-throwing decider installed, the sole candidate is the
  // fallback resolveCore contributes on failure (the line 160 call site) — a different path from
  // ADV9's no-candidate-at-all default (line 72, now inside pickAnswer).
  const registry = Registry.make();
  registry.install(
    Secure,
    Decision.sync(() => {
      throw new Error("a broken decider");
    }),
  );
  const first = registry.resolveSync(Secure, {});
  assert.deepEqual(first, { kind: "deny" });
  // Same hazard as ADV9, through the other call site: a failing decider's fallback contribution, not
  // the no-candidate-at-all path.
  first.kind = "save";
  const second = registry.resolveSync(Secure, {});
  assert.deepEqual(
    second,
    { kind: "deny" },
    "mutating the fallback a failing decider contributed must not corrupt the next resolution",
  );
});
