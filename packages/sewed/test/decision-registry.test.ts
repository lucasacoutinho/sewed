import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Context, Deferred, Effect, Fiber, Logger, Schema } from "effect";
import * as Decision from "../src/Decision.ts";
import { SewedError } from "../src/SewedError.ts";
import * as Testing from "../src/Testing.ts";
import * as CloseGate from "../src/internal/CloseGate.ts";
import * as NativeAnswer from "../src/internal/NativeAnswer.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";

const Answer = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("deny") }),
  Schema.Struct({ kind: Schema.Literal("prompt") }),
  Schema.Struct({ kind: Schema.Literal("save") }),
]);

const Download = Decision.decidable({
  key: "contents/test-download",
  owner: "contents",
  event: Schema.Struct({ url: Schema.String }),
  answer: Answer,
  fallback: { kind: "save" },
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("restrictive composition keeps the most restrictive answer, not the first", () => {
  const registry = Registry.make({ owner: "contents" });
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
  const registry = Registry.make({ owner: "contents" });
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
  const registry = Registry.make({ owner: "contents" });
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "save" });
  registry.install(
    Download,
    Decision.sync(() => Decision.Pass),
  );
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "save" });
});

test("removing a decider's install stops it deciding", () => {
  const registry = Registry.make({ owner: "contents" });
  const remove = registry.install(
    Download,
    Decision.sync(() => ({ kind: "deny" })),
  );
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "deny" });
  remove();
  assert.deepEqual(registry.resolveSync(Download, { url: "https://a/" }), { kind: "save" });
});

test("an answer whose discriminant is not in the order falls back and does not win", () => {
  const registry = Registry.make({ owner: "contents" });
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
  key: "contents/test-secure",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Answer,
  fallback: { kind: "deny" },
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("under restrictive composition, a throwing decider contributes the fallback, not nothing", () => {
  const registry = Registry.make({ owner: "contents" });
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
  const registry = Registry.make({ owner: "contents" });
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
    const registry = Registry.make({ owner: "contents" });
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
  key: "contents/test-payload",
  owner: "contents",
  event: Schema.Struct({}),
  answer: AnswerWithPayload,
  fallback: { kind: "save" },
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("restrictive composition moves on to the next-best-ranked candidate when the winner fails to decode, rather than answering the fallback outright", () => {
  const registry = Registry.make({ owner: "contents" });
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
  const registry = Registry.make({ owner: "contents" });
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
  key: "contents/test-secure-payload",
  owner: "contents",
  event: Schema.Struct({}),
  answer: AnswerWithPayload,
  fallback: { kind: "deny", reason: "fallback" },
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("under restrictive composition, an answer that fails to decode contributes the fallback, the same as a decider that throws", () => {
  const registry = Registry.make({ owner: "contents" });
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
  key: "contents/test-secure-payload-async",
  owner: "contents",
  event: Schema.Struct({}),
  answer: AnswerWithPayload,
  fallback: { kind: "deny", reason: "fallback" },
  timing: "async",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("resolveAsync: an async decider's answer is decoded too, so an off-schema one contributes the fallback", async () => {
  const registry = Registry.make({ owner: "contents" });
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
  key: "contents/test-shared-key",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow",
  timing: "sync",
  composition: "first",
});

const SharedKeyAsync = Decision.decidable({
  key: "contents/test-shared-key",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow",
  timing: "async",
  composition: "first",
});

test("two decidables that share a key string but differ in timing stay independent", () => {
  const registry = Registry.make({ owner: "contents" });
  registry.install(
    SharedKeyAsync,
    // Genuinely suspends (never resolves synchronously): if the registry were keyed by the string
    // "contents/test-shared-key" rather than decidable identity, resolveSync below would meet this entry
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
  key: "contents/test-close",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow",
  // "first" composition and "sync" timing are independent: resolveSync requires sync timing, and
  // the deciders below are all synchronous either way, so this exercises "first" without touching
  // the async-timing/async-decider combination that belongs to the resolveAsync tests below.
  timing: "sync",
  composition: "first",
});

test("first composition keeps the first answer that is not Pass, in install order", () => {
  const registry = Registry.make({ owner: "contents" });
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
  const registry = Registry.make({ owner: "contents" });
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
  const registry = Registry.make({ owner: "contents" });
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
    key: "contents/test-input",
    owner: "contents",
    event: Schema.Struct({}),
    answer: Schema.Literals(["allow", "block"]),
    fallback: "allow",
    timing: "sync",
    composition: "restrictive",
    order: ["block", "allow"],
  });
  const registry = Registry.make({ owner: "contents" });
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
  key: "contents/test-close-async",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow",
  timing: "async",
  composition: "first",
});

test("resolveAsync runs sync and async deciders in order and keeps the first non-Pass answer", async () => {
  const registry = Registry.make({ owner: "contents" });
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
  const registry = Registry.make({ owner: "contents" });
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
  const registry = Registry.make({ owner: "contents" });
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
  key: "contents/test-secure-async",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Answer,
  fallback: { kind: "deny" },
  timing: "async",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("resolveAsync: under restrictive composition, a failing async decider contributes the fallback, not nothing", async () => {
  const registry = Registry.make({ owner: "contents" });
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
  const registry = Registry.make({ owner: "contents" });
  const answer = await Effect.runPromise(registry.resolveAsync(CloseAsync, {}));
  assert.equal(answer, "allow");
});

// An asynchronous decider's services come from the context captured at install, and that context
// carries the installing scope. Providing it whole gave every decision the *installer's* scope, so
// a decider that opened anything scoped — a dialog, a lease, a subscription — held one per
// resolution until the install itself ended, and nothing in the types said so, since `Scope` is
// already among `decide`'s own requirements. A fresh scope per decision is what the close and quit
// guards each ran their resolution under before this registry owned them.
test("a decider's scoped resource is released when its decision completes, not when its installer's scope closes", async () => {
  let acquired = 0;
  let released = 0;
  const registry = Registry.make({ owner: "contents" });
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Registry.decide(registry, { isClosed: () => false })(
          CloseAsync,
          Decision.async(() =>
            Effect.as(
              Effect.acquireRelease(
                Effect.sync(() => {
                  acquired += 1;
                }),
                () =>
                  Effect.sync(() => {
                    released += 1;
                  }),
              ),
              "block",
            ),
          ),
        );
        for (let request = 0; request < 3; request++)
          assert.equal(yield* registry.resolveAsync(CloseAsync, {}), "block");
        assert.equal(acquired, 3);
        assert.equal(
          released,
          3,
          "each decision releases what it acquired, while the install is still live",
        );
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.equal(released, 3, "and closing the installing scope releases nothing further");
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
  const registry = Registry.make({ owner: "contents" });
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
  assert.ok(line.includes("contents/test-secure-async"), line);
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
  assert.ok(line.includes("contents/test-secure-async"), line);
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
  key: "contents/test-native-event",
  owner: "contents",
  event: Schema.Struct({ url: Schema.String }),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow",
  timing: "sync",
  composition: "first",
});

test("a sync decider is handed the event object itself, with its class, methods and hidden fields intact", () => {
  const registry = Registry.make({ owner: "contents" });
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
  key: "contents/test-native-event-async",
  owner: "contents",
  event: Schema.Struct({ url: Schema.String }),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow",
  timing: "async",
  composition: "first",
});

test("an async decider is handed the event object itself too, down the other resolution path", async () => {
  const registry = Registry.make({ owner: "contents" });
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
  const registry = Registry.make({ owner: "contents" });
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
  key: "contents/test-in-flight-removal",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["deny", "allow"]),
  fallback: "allow",
  timing: "async",
  composition: "restrictive",
  order: ["deny", "allow"],
});

test("probe A: a decider removed while its own answer is still pending still contributes that answer", async () => {
  const registry = Registry.make({ owner: "contents" });
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
  const registry = Registry.make({ owner: "contents" });
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
  key: "contents/test-sync-in-flight-removal",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["deny", "allow"]),
  fallback: "allow",
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "allow"],
});

test("ADV1: a sync decider that removes another mid-walk, through resolveSync, does not skip it", () => {
  const registry = Registry.make({ owner: "contents" });
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
  const registry = Registry.make({ owner: "contents" });
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
  const registry = Registry.make({ owner: "contents" });
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
  const registry = Registry.make({ owner: "contents" });
  const NeverInstalled = Decision.decidable({
    key: "contents/test-never-installed-before",
    owner: "contents",
    event: Schema.Struct({}),
    answer: Schema.Literals(["deny", "allow"]),
    fallback: "allow",
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
  const registry = Registry.make({ owner: "contents" });
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
  const registry = Registry.make({ owner: "contents" });
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

// `decidable()` validates its own fallback two ways under restrictive composition: against the
// answer schema, and for membership in the declared `order` (`Decision.ts:212-224`) — an answer
// outside `order` cannot rank, so a failing decider's contribution of it would be filtered out by
// `byRank` and the resolution would answer less restrictively than the decidable declares, exactly
// the guarantee restrictive composition exists to give. `Registry.fallback`'s override used to check
// only the schema; this fixture's `order` is a strict subset of its `answer`'s discriminants, so a
// value the schema accepts but `order` does not is constructible, unlike every real decidable in
// `Decidables.ts`, which all declare total orders.
test("a fallback override outside the decidable's declared order fails Protocol at construction, not resolution", () => {
  const PartialOrder = Decision.decidable({
    key: "contents/test-partial-order",
    owner: "contents",
    event: Schema.Struct({}),
    answer: Schema.Literals(["deny", "allow", "weird"]),
    fallback: "allow",
    timing: "sync",
    composition: "restrictive",
    order: ["deny", "allow"],
  });
  assert.throws(
    () =>
      Registry.make({ owner: "contents", fallbacks: [Registry.fallback(PartialOrder, "weird")] }),
    /Fallback override for decidable "contents\/test-partial-order" is not in its declared order/,
  );
  // A schema-valid, in-order override still installs and governs normally.
  const registry = Registry.make({
    owner: "contents",
    fallbacks: [Registry.fallback(PartialOrder, "deny")],
  });
  assert.equal(registry.resolveSync(PartialOrder, {}), "deny");
});

// `failure`: what a *broken* decider contributes, declared apart from `fallback`, which is what
// *nobody answering* resolves to. Guarded's two differ and both rank, so which one a failing decider
// contributed is directly observable; every fixture above conflates them by having only a fallback.
const Guarded = Decision.decidable({
  key: "contents/test-guarded",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Answer,
  fallback: { kind: "save" },
  failure: { kind: "deny" },
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("a failing decider contributes its declared failure, not the fallback", () => {
  const registry = Registry.make({ owner: "contents" });
  registry.install(
    Guarded,
    Decision.sync(() => {
      throw new Error("boom");
    }),
  );
  registry.install(
    Guarded,
    Decision.sync(() => ({ kind: "prompt" })),
  );
  // Contributing the fallback ("save", rank 2) instead would leave "prompt" the winner — which is
  // exactly what a crashing unsaved-changes guard used to do to Window.Close.
  assert.deepEqual(registry.resolveSync(Guarded, {}), { kind: "deny" });
});

// The default: no `failure` declared means a failing decider contributes the *effective* fallback,
// this registry's own override included. That is what lets `failure` land without disturbing any
// owner's posture — Unguarded is Guarded with the `failure` removed.
const Unguarded = Decision.decidable({
  key: "contents/test-unguarded",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Answer,
  fallback: { kind: "save" },
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("an undeclared failure still contributes the owner's fallback override", () => {
  const registry = Registry.make({
    owner: "contents",
    fallbacks: [Registry.fallback(Unguarded, { kind: "deny" })],
  });
  registry.install(
    Unguarded,
    Decision.sync(() => {
      throw new Error("boom");
    }),
  );
  registry.install(
    Unguarded,
    Decision.sync(() => ({ kind: "prompt" })),
  );
  // The override ("deny"), not the decidable's own fallback ("save"): reading `decidable.fallback`
  // directly for the undeclared case would resolve "prompt" here.
  assert.deepEqual(registry.resolveSync(Unguarded, {}), { kind: "deny" });
});

test("a declared failure is decoded afresh on every contribution", () => {
  const registry = Registry.make({ owner: "contents" });
  registry.install(
    Guarded,
    Decision.sync(() => {
      throw new Error("a broken decider");
    }),
  );
  const first = registry.resolveSync(Guarded, {});
  assert.deepEqual(first, { kind: "deny" });
  // `decidable` is Object.freeze'd, but that freeze is shallow: handing out the one stored object
  // would let this mutation reach every later resolution — ADV10's hazard, through the new source.
  first.kind = "save";
  const second = registry.resolveSync(Guarded, {});
  assert.deepEqual(
    second,
    { kind: "deny" },
    "mutating the failure a broken decider contributed must not corrupt the next resolution",
  );
});

const GuardedAsync = Decision.decidable({
  key: "contents/test-guarded-async",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Answer,
  fallback: { kind: "save" },
  failure: { kind: "deny" },
  timing: "async",
  composition: "restrictive",
  order: ["deny", "prompt", "save"],
});

test("the failure log names the declared failure it contributed", async () => {
  const lines: string[] = [];
  const registry = Registry.make({ owner: "contents" });
  registry.install(
    GuardedAsync,
    Decision.sync(() => {
      throw new Error("ordinary boom");
    }),
  );
  await Effect.runPromise(
    registry.resolveAsync(GuardedAsync, {}).pipe(
      Effect.provide(
        Logger.layer([
          Logger.map(Logger.formatSimple, (line) => {
            lines.push(line);
          }),
        ]),
      ),
    ),
  );
  assert.equal(lines.length, 1);
  const [line = ""] = lines;
  assert.ok(line.includes("contents/test-guarded-async"), line);
  // "the fallback" would be the wrong name for it, and the log is the only trace a consumer gets of
  // a decidable quietly answering something nobody decided.
  assert.ok(line.includes("contributing the declared failure"), line);
  assert.ok(line.includes("ordinary boom"), line);
});

// The chain composition: a fold, not a ranking. Each decider sees what the previous one produced,
// and an answer in `stop` ends the resolution outright. Declared here rather than in `Decidables.ts`
// — nothing in the catalog composes this way yet.
const HeaderAnswer = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("allow") }),
  Schema.Struct({ kind: Schema.Literal("block") }),
  Schema.Struct({
    kind: Schema.Literal("headers"),
    headers: Schema.Record(Schema.String, Schema.String),
  }),
]);

const Headers = Decision.decidable({
  key: "contents/test-headers",
  owner: "contents",
  event: Schema.Struct({
    url: Schema.String,
    headers: Schema.Record(Schema.String, Schema.String),
  }),
  answer: HeaderAnswer,
  fallback: { kind: "allow" },
  failure: { kind: "block" },
  timing: "async",
  composition: "chain",
  chain: {
    stop: ["block"],
    advance: (event, answer) =>
      answer.kind === "headers" ? { ...event, headers: answer.headers } : event,
  },
});

const header = (name: string, value: string) =>
  Decision.async((event: { readonly headers: Record<string, string> }) =>
    Effect.succeed({ kind: "headers", headers: { ...event.headers, [name]: value } }),
  );

const start = () => ({ url: "https://a/", headers: { "x-start": "1" } });

test("a chain hands each decider what the previous one produced", async () => {
  const registry = Registry.make({ owner: "contents" });
  const seen: Record<string, string>[] = [];
  registry.install(Headers, header("x-first", "1"));
  registry.install(
    Headers,
    Decision.async((event: { readonly headers: Record<string, string> }) =>
      Effect.sync(() => {
        seen.push(event.headers);
        return { kind: "headers", headers: { ...event.headers, "x-second": "2" } };
      }),
    ),
  );
  const outcome = await Effect.runPromise(registry.resolveChain(Headers, start()));
  assert.equal(outcome.kind, "completed");
  if (outcome.kind !== "completed") return;
  // Under a ranking, two "headers" answers tie and one feature's headers vanish — Electron's own
  // single-listener clobbering, one level up. Under a fold, both survive.
  assert.deepEqual(outcome.event.headers, {
    "x-start": "1",
    "x-first": "1",
    "x-second": "2",
  });
  assert.deepEqual(seen, [{ "x-start": "1", "x-first": "1" }]);
});

test("a stop answer ends the chain and later deciders are not consulted", async () => {
  const registry = Registry.make({ owner: "contents" });
  let laterCalls = 0;
  registry.install(Headers, header("x-first", "1"));
  registry.install(
    Headers,
    Decision.async(() => Effect.succeed({ kind: "block" })),
  );
  registry.install(
    Headers,
    Decision.async(() =>
      Effect.sync(() => {
        laterCalls += 1;
        return { kind: "headers", headers: { "x-later": "1" } };
      }),
    ),
  );
  const outcome = await Effect.runPromise(registry.resolveChain(Headers, start()));
  assert.deepEqual(outcome, { kind: "stopped", answer: { kind: "block" } });
  assert.equal(laterCalls, 0, "a decider after the stop must not be consulted");
});

test("a stop answer wins regardless of install order", async () => {
  const blocking = Decision.async(() => Effect.succeed({ kind: "block" }));
  const first = Registry.make({ owner: "contents" });
  first.install(Headers, blocking);
  first.install(Headers, header("x-first", "1"));
  const last = Registry.make({ owner: "contents" });
  last.install(Headers, header("x-first", "1"));
  last.install(Headers, blocking);
  for (const registry of [first, last]) {
    const outcome = await Effect.runPromise(registry.resolveChain(Headers, start()));
    assert.deepEqual(outcome, { kind: "stopped", answer: { kind: "block" } });
  }
});

test("a passing decider leaves the chained event untouched", async () => {
  const registry = Registry.make({ owner: "contents" });
  const event = start();
  registry.install(
    Headers,
    Decision.async(() => Effect.succeed(Decision.Pass)),
  );
  const passedOnly = await Effect.runPromise(registry.resolveChain(Headers, event));
  assert.equal(passedOnly.kind, "completed");
  if (passedOnly.kind !== "completed") return;
  assert.equal(passedOnly.event, event, "a chain of passes hands back the exact event object");
  registry.install(Headers, header("x-first", "1"));
  registry.install(
    Headers,
    Decision.async(() => Effect.succeed(Decision.Pass)),
  );
  const folded = await Effect.runPromise(registry.resolveChain(Headers, event));
  assert.equal(folded.kind, "completed");
  if (folded.kind !== "completed") return;
  assert.deepEqual(folded.event.headers, { "x-start": "1", "x-first": "1" });
});

test("an empty chain completes with the exact event object", async () => {
  const registry = Registry.make({ owner: "contents" });
  const event = start();
  const outcome = await Effect.runPromise(registry.resolveChain(Headers, event));
  assert.equal(outcome.kind, "completed");
  if (outcome.kind !== "completed") return;
  assert.equal(outcome.event, event, "with no decider the event is handed back untouched");
});

test("a failing decider in a chain contributes its failure", async () => {
  // Tagged's failure is not a stop answer, so the contribution is folded in like any other: what it
  // proves is that a broken decider contributes `failure` at all, separately from what stops a chain.
  const Tagged = Decision.decidable({
    key: "contents/test-tagged",
    owner: "contents",
    event: Schema.Struct({
      url: Schema.String,
      headers: Schema.Record(Schema.String, Schema.String),
    }),
    answer: HeaderAnswer,
    fallback: { kind: "allow" },
    failure: { kind: "headers", headers: { "x-failed": "1" } },
    timing: "async",
    composition: "chain",
    chain: {
      stop: ["block"],
      advance: (event, answer) =>
        answer.kind === "headers" ? { ...event, headers: answer.headers } : event,
    },
  });
  const registry = Registry.make({ owner: "contents" });
  registry.install(
    Tagged,
    Decision.async(() => Effect.die(new Error("boom"))),
  );
  const outcome = await Effect.runPromise(registry.resolveChain(Tagged, start()));
  assert.equal(outcome.kind, "completed");
  if (outcome.kind !== "completed") return;
  // The fallback ({ kind: "allow" }) would have left the headers alone.
  assert.deepEqual(outcome.event.headers, { "x-failed": "1" });
});

test("a failing decider whose failure is a stop answer stops the chain", async () => {
  const registry = Registry.make({ owner: "contents" });
  let laterCalls = 0;
  registry.install(
    Headers,
    Decision.async(() => Effect.die(new Error("boom"))),
  );
  registry.install(
    Headers,
    Decision.async(() =>
      Effect.sync(() => {
        laterCalls += 1;
        return { kind: "headers", headers: { "x-later": "1" } };
      }),
    ),
  );
  const outcome = await Effect.runPromise(registry.resolveChain(Headers, start()));
  assert.deepEqual(outcome, { kind: "stopped", answer: { kind: "block" } });
  assert.equal(laterCalls, 0, "the failure is treated like any other stop answer");
});

test("a chain advance that throws is logged and its decider treated as failed", async () => {
  const Broken = Decision.decidable({
    key: "contents/test-broken-advance",
    owner: "contents",
    event: Schema.Struct({
      url: Schema.String,
      headers: Schema.Record(Schema.String, Schema.String),
    }),
    answer: HeaderAnswer,
    fallback: { kind: "allow" },
    failure: { kind: "block" },
    timing: "async",
    composition: "chain",
    chain: {
      stop: ["block"],
      advance: () => {
        throw new Error("advance boom");
      },
    },
  });
  const lines: string[] = [];
  const registry = Registry.make({ owner: "contents" });
  let laterCalls = 0;
  registry.install(Broken, header("x-first", "1"));
  registry.install(
    Broken,
    Decision.async(() =>
      Effect.sync(() => {
        laterCalls += 1;
        return { kind: "headers", headers: { "x-later": "1" } };
      }),
    ),
  );
  const outcome = await Effect.runPromise(
    registry.resolveChain(Broken, start()).pipe(
      Effect.provide(
        Logger.layer([
          Logger.map(Logger.formatSimple, (line) => {
            lines.push(line);
          }),
        ]),
      ),
    ),
  );
  // `advance` is Sewed's own code; a throw there is a defect in the library, and the decidable's own
  // failure answer is what a decider whose contribution could not be applied contributes.
  assert.deepEqual(outcome, { kind: "stopped", answer: { kind: "block" } });
  assert.equal(laterCalls, 0);
  assert.ok(
    lines.some(
      (line) =>
        line.includes("contents/test-broken-advance") &&
        line.includes("the chain stops with the declared failure") &&
        line.includes("advance boom"),
    ),
    lines.join("\n"),
  );
});

test("a throwing advance with a non-stop failure leaves the event unchanged and says so", async () => {
  // The other half of the throwing-`advance` path, and the half the log used to describe wrongly: a
  // failure that is not a stop answer has nothing to be folded in by — the `advance` that would have
  // folded it is the one that just threw — so the chain contributes nothing at all and walks on with
  // the event exactly as it was. The log has to say that, not promise a contribution nobody made.
  const Lenient = Decision.decidable({
    key: "contents/test-lenient-advance",
    owner: "contents",
    event: Schema.Struct({
      url: Schema.String,
      headers: Schema.Record(Schema.String, Schema.String),
    }),
    answer: HeaderAnswer,
    fallback: { kind: "allow" },
    failure: { kind: "allow" },
    timing: "async",
    composition: "chain",
    chain: {
      stop: ["block"],
      advance: () => {
        throw new Error("advance boom");
      },
    },
  });
  const lines: string[] = [];
  const registry = Registry.make({ owner: "contents" });
  let laterCalls = 0;
  const event = start();
  registry.install(Lenient, header("x-first", "1"));
  registry.install(
    Lenient,
    Decision.async(() =>
      Effect.sync(() => {
        laterCalls += 1;
        return Decision.Pass;
      }),
    ),
  );
  const outcome = await Effect.runPromise(
    registry.resolveChain(Lenient, event).pipe(
      Effect.provide(
        Logger.layer([
          Logger.map(Logger.formatSimple, (line) => {
            lines.push(line);
          }),
        ]),
      ),
    ),
  );
  assert.equal(outcome.kind, "completed");
  if (outcome.kind !== "completed") return;
  assert.equal(outcome.event, event, "a non-stop failure leaves the event exactly as it was");
  assert.equal(laterCalls, 1, "the chain walks on rather than ending");
  assert.ok(
    lines.some(
      (line) =>
        line.includes("contents/test-lenient-advance") &&
        line.includes("leaving the event unchanged") &&
        line.includes("advance boom"),
    ),
    lines.join("\n"),
  );
  assert.ok(!lines.some((line) => line.includes("contributing")), lines.join("\n"));
});

test("an off-schema answer in a chain contributes its failure", async () => {
  // A decider that answers something `answer` rejects is a broken decider exactly as much as one
  // that throws or dies, and `Headers` declares a stop answer as its failure — so if an off-schema
  // answer contributed nothing instead, the second decider's headers would fold in and the chain
  // would complete rather than stop.
  const registry = Registry.make({ owner: "contents" });
  let laterCalls = 0;
  registry.install(
    Headers,
    Decision.async(() => Effect.succeed({ kind: "nonsense" })),
  );
  registry.install(
    Headers,
    Decision.async(() =>
      Effect.sync(() => {
        laterCalls += 1;
        return { kind: "headers", headers: { "x-later": "1" } };
      }),
    ),
  );
  const outcome = await Effect.runPromise(registry.resolveChain(Headers, start()));
  assert.deepEqual(outcome, { kind: "stopped", answer: { kind: "block" } });
  assert.equal(laterCalls, 0);
});

test("a synchronous decider takes part in a chain", async () => {
  // A chain decidable is `"async"` by declaration, which admits both timings of decider — a fold is
  // not a reason for a decider that needs no suspension to be excluded from one.
  const registry = Registry.make({ owner: "contents" });
  registry.install(
    Headers,
    Decision.sync((event: { readonly headers: Record<string, string> }) => ({
      kind: "headers",
      headers: { ...event.headers, "x-sync": "1" },
    })),
  );
  registry.install(Headers, header("x-async", "1"));
  const outcome = await Effect.runPromise(registry.resolveChain(Headers, start()));
  assert.equal(outcome.kind, "completed");
  if (outcome.kind !== "completed") return;
  assert.deepEqual(outcome.event.headers, {
    "x-start": "1",
    "x-sync": "1",
    "x-async": "1",
  });
});

test("a chain tests stop against the decoded answer", async () => {
  // Every answer is decoded before the chain does anything with it, so both the `stop` test and
  // `advance` see a plain decoded copy rather than the decider's own object. An answer whose `kind`
  // is an accessor is what tells the two apart: it decodes to a data property, so a descriptor read
  // inside `advance` names which of the two arrived.
  const descriptors: (PropertyDescriptor | undefined)[] = [];
  const Accessor = Decision.decidable({
    key: "contents/test-chain-accessor",
    owner: "contents",
    event: Schema.Struct({
      url: Schema.String,
      headers: Schema.Record(Schema.String, Schema.String),
    }),
    answer: HeaderAnswer,
    fallback: { kind: "allow" },
    timing: "async",
    composition: "chain",
    chain: {
      stop: ["block"],
      advance: (event, answer) => {
        descriptors.push(Object.getOwnPropertyDescriptor(answer, "kind"));
        return answer.kind === "headers" ? { ...event, headers: answer.headers } : event;
      },
    },
  });
  const registry = Registry.make({ owner: "contents" });
  const folding = {
    get kind(): string {
      return "headers";
    },
    headers: { "x-accessor": "1" },
  };
  const stopping = {
    get kind(): string {
      return "block";
    },
  };
  registry.install(
    Accessor,
    Decision.async(() => Effect.succeed(folding)),
  );
  registry.install(
    Accessor,
    Decision.async(() => Effect.succeed(stopping)),
  );
  const outcome = await Effect.runPromise(registry.resolveChain(Accessor, start()));
  assert.equal(outcome.kind, "stopped");
  if (outcome.kind !== "stopped") return;
  assert.deepEqual(outcome.answer, { kind: "block" });
  assert.notEqual(
    outcome.answer,
    stopping,
    "the stop answer is the decoded copy, not the original",
  );
  assert.equal(descriptors.length, 1);
  const [descriptor] = descriptors;
  assert.equal(descriptor?.get, undefined, "advance must be handed a plain data property");
  assert.equal(descriptor?.value, "headers");
});

test("a chain walks the snapshot taken when it began", async () => {
  const registry = Registry.make({ owner: "contents" });
  let laterCalls = 0;
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const removeFirst = registry.install(
          Headers,
          Decision.async((event: { readonly headers: Record<string, string> }) =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(release);
              return { kind: "headers", headers: { ...event.headers, "x-first": "1" } };
            }),
          ),
        );
        registry.install(
          Headers,
          Decision.async((event: { readonly headers: Record<string, string> }) =>
            Effect.sync(() => {
              laterCalls += 1;
              return { kind: "headers", headers: { ...event.headers, "x-later": "1" } };
            }),
          ),
        );
        const fiber = yield* Effect.forkScoped(registry.resolveChain(Headers, start()));
        yield* Deferred.await(started);
        // The first decider's own scope closes while its answer is still pending, and a third
        // decider is installed after this resolution already began. A live walk would shift the
        // second decider into the removed one's index and skip it; the newly installed one must not
        // be consulted by a walk already in flight.
        removeFirst();
        registry.install(
          Headers,
          Decision.async((event: { readonly headers: Record<string, string> }) =>
            Effect.succeed({ kind: "headers", headers: { ...event.headers, "x-late": "1" } }),
          ),
        );
        yield* Deferred.succeed(release, undefined);
        const outcome = yield* Fiber.join(fiber);
        assert.equal(outcome.kind, "completed");
        if (outcome.kind !== "completed") return;
        assert.deepEqual(outcome.event.headers, {
          "x-start": "1",
          "x-first": "1",
          "x-later": "1",
        });
        assert.equal(laterCalls, 1, "a still-installed decider must not be skipped by a removal");
      }),
    ),
  );
});

test("a decider installed before a chain resolution runs is consulted, on a decidable that never had one", async () => {
  const registry = Registry.make({ owner: "contents" });
  const Fresh = Decision.decidable({
    key: "contents/test-chain-never-installed",
    owner: "contents",
    event: Schema.Struct({
      url: Schema.String,
      headers: Schema.Record(Schema.String, Schema.String),
    }),
    answer: HeaderAnswer,
    fallback: { kind: "allow" },
    timing: "async",
    composition: "chain",
    chain: {
      stop: ["block"],
      advance: (event, answer) =>
        answer.kind === "headers" ? { ...event, headers: answer.headers } : event,
    },
  });
  // Calling resolveChain builds the Effect before anything is installed: reading the entry list
  // eagerly with `entries.get(decidable) ?? []` would freeze a disconnected empty array here.
  const resolution = registry.resolveChain(Fresh, start());
  registry.install(Fresh, header("x-late", "1"));
  const outcome = await Effect.runPromise(resolution);
  assert.equal(outcome.kind, "completed");
  if (outcome.kind !== "completed") return;
  assert.deepEqual(outcome.event.headers, { "x-start": "1", "x-late": "1" });
});

// `Registry.hook` is what lets an owner keep a native counterpart (a certificate proc, a
// display-media handler) installed only while a decidable actually has a decider — the entry-count
// edges below, not every install or removal, are exactly what a native `attach`/`detach` pair needs
// to track.
const NativeGate = Decision.decidable({
  key: "contents/test-native-gate",
  owner: "contents",
  event: Schema.Struct({}),
  answer: Schema.Literals(["deny", "allow"]),
  fallback: "deny",
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "allow"],
});

test("a hook attaches on the first install and detaches on the last removal, through both install and installOne", () => {
  const calls: string[] = [];
  const registry = Registry.make({
    owner: "contents",
    hooks: [
      Registry.hook(NativeGate, {
        attach: () => calls.push("attach"),
        detach: () => calls.push("detach"),
      }),
    ],
  });
  const removeA = registry.install(
    NativeGate,
    Decision.sync(() => "allow"),
  );
  assert.deepEqual(calls, ["attach"], "the first install attaches");
  const removeB = registry.installOne(
    NativeGate,
    Decision.sync(() => "allow"),
    Context.empty(),
  );
  assert.deepEqual(
    calls,
    ["attach"],
    "a second install, through installOne too, does not attach again",
  );
  removeA();
  assert.deepEqual(calls, ["attach"], "removing one of two installed deciders does not detach");
  removeB();
  assert.deepEqual(calls, ["attach", "detach"], "removing the last one detaches");
  removeB();
  assert.deepEqual(
    calls,
    ["attach", "detach"],
    "calling the same removal twice does not detach twice",
  );
});

test("attach runs before the entry it gates is added, so a resolution run between install and its return sees nothing", () => {
  const seenDuringAttach: unknown[] = [];
  const registry = Registry.make({
    owner: "contents",
    hooks: [
      Registry.hook(NativeGate, {
        attach: () => seenDuringAttach.push(registry.resolveSync(NativeGate, {})),
        detach: () => {},
      }),
    ],
  });
  registry.install(
    NativeGate,
    Decision.sync(() => "allow"),
  );
  // If the entry were added before attach ran, resolving from inside attach would see the decider
  // being installed and answer "allow"; it does not exist yet, so the fallback answers instead.
  assert.deepEqual(seenDuringAttach, ["deny"]);
});

test("a throwing attach leaves nothing registered, and the resolution still answers the fallback", () => {
  const registry = Registry.make({
    owner: "contents",
    hooks: [
      Registry.hook(NativeGate, {
        attach: () => {
          throw new Error("native install failed");
        },
        detach: () => {},
      }),
    ],
  });
  assert.throws(
    () =>
      registry.install(
        NativeGate,
        Decision.sync(() => "allow"),
      ),
    /native install failed/,
  );
  assert.equal(
    registry.resolveSync(NativeGate, {}),
    "deny",
    "nothing was registered, so the fallback answers",
  );
});

test("a throwing attach surfaces through decide as SewedError code Native, not a defect", async () => {
  const registry = Registry.make({
    owner: "contents",
    hooks: [
      Registry.hook(NativeGate, {
        attach: () => {
          throw new Error("native install failed");
        },
        detach: () => {},
      }),
    ],
  });
  const decide = Registry.decide(registry, { isClosed: () => false });
  const exit = await Effect.runPromise(
    Effect.provide(
      Effect.exit(
        Effect.scoped(
          decide(
            NativeGate,
            Decision.sync(() => "allow"),
          ),
        ),
      ),
      Testing.main,
    ),
  );
  assert.equal(exit._tag, "Failure");
  if (exit._tag !== "Failure") return;
  assert.equal(Cause.hasDies(exit.cause), false, "a typed failure, not a defect");
  const error = Cause.squash(exit.cause);
  assert.ok(error instanceof SewedError, String(error));
  if (!(error instanceof SewedError)) return;
  assert.equal(error.code, "Native");
});

test("a throwing detach is logged and swallowed, and the entry is removed regardless", () => {
  const registry = Registry.make({
    owner: "contents",
    hooks: [
      Registry.hook(NativeGate, {
        attach: () => {},
        detach: () => {
          throw new Error("native removal failed");
        },
      }),
    ],
  });
  const remove = registry.install(
    NativeGate,
    Decision.sync(() => "allow"),
  );
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    remove();
  } finally {
    console.log = originalLog;
  }
  assert.ok(
    lines.some(
      (line) =>
        line.includes("contents/test-native-gate") && line.includes("native removal failed"),
    ),
    lines.join("\n"),
  );
  // The entry is gone regardless of the throwing detach: the decider it gated no longer answers.
  assert.equal(registry.resolveSync(NativeGate, {}), "deny");
});

test("a chain decidable's installs drive its hook through the same door", () => {
  const calls: string[] = [];
  const registry = Registry.make({
    owner: "contents",
    hooks: [
      Registry.hook(Headers, {
        attach: () => calls.push("attach"),
        detach: () => calls.push("detach"),
      }),
    ],
  });
  // A chain decidable installs through `installOne`'s own push and its removal's splice, the same as
  // every other composition, so the entry-count edges a hook counts keep working.
  const removeA = registry.install(Headers, header("x-first", "1"));
  const removeB = registry.install(Headers, header("x-second", "2"));
  assert.deepEqual(calls, ["attach"]);
  removeA();
  removeB();
  assert.deepEqual(calls, ["attach", "detach"]);
});

test("two hooks for one decidable fail at construction", () => {
  assert.throws(
    () =>
      Registry.make({
        owner: "contents",
        hooks: [
          Registry.hook(NativeGate, { attach: () => {}, detach: () => {} }),
          Registry.hook(NativeGate, { attach: () => {}, detach: () => {} }),
        ],
      }),
    /Decidable "contents\/test-native-gate" already has a native hook/,
  );
});

// Task 7b: a registry decides for exactly one kind of owner, and refuses every other owner's
// decidable. The type refuses it at each install door; this is the runtime half, which exists
// because the playground's fixtures are `.mjs`, an agent may be writing plain JavaScript, and every
// internal that means "any decidable" carries no owner in its type either. What a wrong-owner
// install used to do is the reason it is refused at all: it registered, was never consulted, and
// left its decidable answering the fallback forever — a close guard that silently does not guard.
const WindowGuard = Decision.decidable({
  key: "window/test-close",
  owner: "window",
  event: Schema.Struct({ windowId: Schema.String }),
  answer: Schema.Literals(["deny", "allow"]),
  fallback: "allow",
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "allow"],
});

// Declares a `failure`, unlike `WindowGuard`, so the two tell apart which of the two answers a
// foreign `resolveSync` reaches for.
const WindowFailing = Decision.decidable({
  key: "window/test-close-failing",
  owner: "window",
  event: Schema.Struct({ windowId: Schema.String }),
  answer: Schema.Literals(["deny", "allow"]),
  fallback: "allow",
  failure: "deny",
  timing: "sync",
  composition: "restrictive",
  order: ["deny", "allow"],
});

const WindowChain = Decision.decidable({
  key: "window/test-close-chain",
  owner: "window",
  event: Schema.Struct({
    url: Schema.String,
    headers: Schema.Record(Schema.String, Schema.String),
  }),
  answer: HeaderAnswer,
  fallback: { kind: "allow" },
  timing: "async",
  composition: "chain",
  chain: {
    stop: ["block"],
    advance: (event, answer) =>
      answer.kind === "headers" ? { ...event, headers: answer.headers } : event,
  },
});

const isProtocol = (error: unknown) => error instanceof SewedError && error.code === "Protocol";

test("an owner refuses another owner's decidable", async (t) => {
  const contents = Registry.make({ owner: "contents" });
  const deny = Decision.sync(() => "deny");
  // The doors a *consumer* reaches: both installs, and the two declarations a registry applies when
  // it is built. All four throw, because nothing has been registered and nothing native has run by
  // the time they fire, so the loudest failure is the right one. The three resolutions are not here
  // — every one of their call sites is inside a native Electron callback, so they refuse in the
  // shapes those callbacks can survive; see the four tests below.
  const doors: readonly { readonly name: string; readonly run: () => unknown }[] = [
    { name: "install", run: () => contents.install(WindowGuard, deny) },
    { name: "installOne", run: () => contents.installOne(WindowGuard, deny, Context.empty()) },
    {
      name: "a foreign fallback override at make",
      run: () =>
        Registry.make({ owner: "contents", fallbacks: [Registry.fallback(WindowGuard, "deny")] }),
    },
    {
      name: "a foreign native hook at make",
      run: () =>
        Registry.make({
          owner: "contents",
          hooks: [Registry.hook(WindowGuard, { attach: () => {}, detach: () => {} })],
        }),
    },
  ];
  for (const { name, run } of doors) {
    await t.test(name, () => {
      assert.throws(run, isProtocol);
    });
  }
});

// The consult path. A resolution of a foreign decidable is a bug in Sewed, not a consumer mistake —
// but it would happen inside a native callback, so *how* it refuses decides whether the application
// survives it. Throwing at the call site does not: `internal/CloseGate.ts` builds its resolution
// inside Electron's `close`/`before-quit` listener, so a throw there escapes past the gate's own
// `catchCause`; and `internal/NativeAnswer.ts` takes its resolution as an argument, so a throw
// happens before `run` is entered and the `failed()` reply that answers the native callback never
// runs at all — after `event.preventDefault()` has already been called on it.

test("a foreign resolveAsync refuses inside the Effect, not at the call site", async () => {
  const contents = Registry.make({ owner: "contents" });
  let resolution: Effect.Effect<"deny" | "allow"> | undefined;
  assert.doesNotThrow(() => {
    resolution = contents.resolveAsync(WindowGuard, { windowId: "w1" });
  }, "building the resolution must not throw into the caller that builds it");
  assert.ok(resolution !== undefined);
  const exit = await Effect.runPromise(Effect.exit(resolution));
  assert.equal(exit._tag, "Failure");
  if (exit._tag !== "Failure") return;
  // A defect of an Effect the call sites already contain, not an exception they never see.
  assert.equal(Cause.hasDies(exit.cause), true);
  const error = Cause.squash(exit.cause);
  assert.ok(isProtocol(error), String(error));
  assert.ok(
    error instanceof SewedError && error.message.includes("window/test-close"),
    String(error),
  );
});

test("a foreign resolveChain refuses inside the Effect, not at the call site", async () => {
  const contents = Registry.make({ owner: "contents" });
  let resolution:
    | Effect.Effect<
        Decision.ChainOutcome<{ url: string; headers: Record<string, string> }, unknown>
      >
    | undefined;
  assert.doesNotThrow(() => {
    resolution = contents.resolveChain(WindowChain, { url: "https://a/", headers: {} });
  }, "building the resolution must not throw into the caller that builds it");
  assert.ok(resolution !== undefined);
  const exit = await Effect.runPromise(Effect.exit(resolution));
  assert.equal(exit._tag, "Failure");
  if (exit._tag !== "Failure") return;
  assert.equal(Cause.hasDies(exit.cause), true);
  const error = Cause.squash(exit.cause);
  assert.ok(isProtocol(error), String(error));
  assert.ok(
    error instanceof SewedError && error.message.includes("window/test-close-chain"),
    String(error),
  );
});

/** Captures what `Effect.runFork`'s default logger writes, the way the detach-log test does. */
const captureLog = (run: () => void): string[] => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    run();
  } finally {
    console.log = originalLog;
  }
  return lines;
};

/**
 * The same, for a fork that logs after an `Effect.yieldNow` — `internal/CloseGate.ts` starts its
 * resolution with one, so its report lands on a later turn than the call that started it. Yields
 * until the line appears rather than sleeping for a guessed interval, and gives up after a bound so
 * a missing line fails the assertion instead of hanging the suite.
 */
const captureLogUntil = async (text: string, run: () => void): Promise<string[]> => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    run();
    for (let attempt = 0; attempt < 100 && !lines.some((line) => line.includes(text)); attempt += 1)
      await Effect.runPromise(Effect.yieldNow);
  } finally {
    console.log = originalLog;
  }
  return lines;
};

test("a foreign resolveSync answers the decidable's failure and says so", () => {
  // `resolveSync` answers inside the callback, so it can neither throw nor fail an Effect. It
  // answers what the decidable itself declares a broken decider contributes — `deny` here, which is
  // fail-closed for every guard in the catalog — and says so on every single resolution, because
  // the failure this task exists to end is the one that leaves no trace.
  const contents = Registry.make({ owner: "contents" });
  let answer: "deny" | "allow" | undefined;
  const lines = captureLog(() => {
    answer = contents.resolveSync(WindowFailing, { windowId: "w1" });
  });
  assert.equal(answer, "deny");
  assert.ok(
    lines.some(
      (line) =>
        line.includes("window/test-close-failing") &&
        line.includes('"window"') &&
        line.includes('"contents"') &&
        line.includes("bug in Sewed") &&
        line.includes("failure"),
    ),
    lines.join("\n"),
  );
});

test("a foreign resolveSync answers its fallback when it declares no failure", () => {
  const contents = Registry.make({ owner: "contents" });
  let answer: "deny" | "allow" | undefined;
  const lines = captureLog(() => {
    answer = contents.resolveSync(WindowGuard, { windowId: "w1" });
  });
  assert.equal(answer, "allow", "WindowGuard declares no failure, so its own fallback answers");
  assert.ok(
    lines.some((line) => line.includes("window/test-close") && line.includes("fallback")),
    lines.join("\n"),
  );
});

test("a close gate handed a foreign decidable denies instead of throwing", async () => {
  // The type refuses this pairing now (`decision-types.ts`), which is what makes it unreachable.
  // This is the other half: if it is reached anyway — from JavaScript, or through a future edit —
  // the gate must behave like a gate whose decision failed, not crash Electron's own listener.
  const contents = Registry.make({ owner: "contents" });
  let approved = 0;
  const lines = await captureLogUntil("Close gate failed; request denied", () => {
    const gate = CloseGate.make(
      () => {
        approved += 1;
      },
      contents,
      WindowGuard,
      { windowId: "w1" },
      "allow",
    );
    assert.doesNotThrow(() => gate.request(), "request() must not throw out of a native listener");
  });
  assert.equal(approved, 0, "a gate that could not decide must not approve");
  assert.ok(
    lines.some((line) => line.includes("Close gate failed; request denied")),
    lines.join("\n"),
  );
});

test("a native answer handed a foreign resolution still replies with its closed form", async () => {
  const contents = Registry.make({ owner: "contents" });
  let replied: string | undefined;
  let failedCalls = 0;
  const lines = await captureLogUntil("was not answered; falling back", () => {
    NativeAnswer.run({
      label: WindowGuard.key,
      resolution: contents.resolveAsync(WindowGuard, { windowId: "w1" }),
      reply: (answer) => {
        replied = answer;
      },
      failed: () => {
        failedCalls += 1;
      },
    });
  });
  // The native callback is answered exactly once, with the closed form. Before the refusal moved
  // inside the Effect, `run` was never entered and the callback was left hanging forever.
  assert.equal(failedCalls, 1, "failed() must run, so the native callback is answered");
  assert.equal(replied, undefined, "the resolution never succeeded, so reply never ran");
  assert.ok(
    lines.some((line) => line.includes("was not answered; falling back")),
    lines.join("\n"),
  );
});

test("the refusal names both owners", () => {
  const contents = Registry.make({ owner: "contents" });
  assert.throws(
    () =>
      contents.install(
        WindowGuard,
        Decision.sync(() => "deny"),
      ),
    (error: unknown) =>
      error instanceof SewedError &&
      error.code === "Protocol" &&
      // The key, the owner it belongs to, and the owner it was handed to: without all three, a
      // reader of the failure cannot tell which end of the install was the mistake.
      error.message.includes('"window/test-close"') &&
      error.message.includes('"window"') &&
      error.message.includes('"contents"'),
  );
});

test("a foreign decidable refused through decide is a Protocol failure, not a defect", async () => {
  const registry = Registry.make({ owner: "contents" });
  const decide = Registry.decide(registry, { isClosed: () => false });
  const exit = await Effect.runPromise(
    Effect.provide(
      Effect.exit(
        Effect.scoped(
          decide(
            WindowGuard,
            Decision.sync(() => "deny"),
          ),
        ),
      ),
      Testing.main,
    ),
  );
  assert.equal(exit._tag, "Failure");
  if (exit._tag !== "Failure") return;
  assert.equal(Cause.hasDies(exit.cause), false, "a typed failure, not a defect");
  const error = Cause.squash(exit.cause);
  assert.ok(error instanceof SewedError, String(error));
  if (!(error instanceof SewedError)) return;
  assert.equal(error.code, "Protocol");
  assert.ok(error.message.includes("window/test-close"), error.message);
});

test("a refused install attaches no hook and leaves the decidable's own registry untouched", () => {
  const windows = Registry.make({ owner: "window" });
  const attaches: string[] = [];
  // A hook on the *refusing* registry, for a decidable it does own. `installOne` checks the owner
  // before it reads an entry list and before it can run any `attach`, which is what this half
  // watches: the refused install must leave this registry with nothing attached and nothing
  // registered. (The foreign decidable cannot itself carry a hook here — `Registry.hook` is refused
  // at `make` for another owner's decidable — so this is as close as the shape allows.)
  const contents = Registry.make({
    owner: "contents",
    hooks: [
      Registry.hook(NativeGate, {
        attach: () => attaches.push("attach"),
        detach: () => attaches.push("detach"),
      }),
    ],
  });
  assert.throws(
    () =>
      contents.install(
        WindowGuard,
        Decision.sync(() => "deny"),
      ),
    isProtocol,
  );
  assert.deepEqual(attaches, [], "a refused install must run no native attach");
  // Its own owner's decidable still works afterwards, from zero: the refusal touched no state.
  const remove = contents.install(
    NativeGate,
    Decision.sync(() => "allow"),
  );
  assert.deepEqual(attaches, ["attach"]);
  remove();
  assert.deepEqual(attaches, ["attach", "detach"]);
  // The window's own registry is untouched by the refused install on the other one, and the right
  // owner still takes the same decider with no ceremony.
  assert.equal(windows.resolveSync(WindowGuard, { windowId: "w1" }), "allow");
  windows.install(
    WindowGuard,
    Decision.sync(() => "deny"),
  );
  assert.equal(windows.resolveSync(WindowGuard, { windowId: "w1" }), "deny");
});

test("a registry's owner must be an owner kind", async (t) => {
  // From JavaScript the type says nothing. A registry built with an owner no decidable can name
  // would refuse everything it was ever handed, for the lifetime of the owner that built it, and
  // say so naming `"undefined"` — so it is refused where it is built instead.
  // Typed `unknown`, and this file is not type-checked (only `*-types.ts` are), which is exactly
  // the position a `.mjs` fixture is in.
  const cases: readonly { readonly owner: unknown; readonly why: string }[] = [
    { owner: "windo", why: "a misspelled kind" },
    { owner: undefined, why: "no owner at all" },
    { owner: "toString", why: "a property of Object.prototype is not a kind" },
  ];
  for (const { owner, why } of cases) {
    await t.test(why, () => {
      assert.throws(
        () => Registry.make({ owner }),
        (error: unknown) =>
          isProtocol(error) &&
          error instanceof SewedError &&
          error.message.includes(String(owner)) &&
          error.message.includes("is not an owner kind") &&
          error.message.includes('"window"'),
      );
    });
  }
});
