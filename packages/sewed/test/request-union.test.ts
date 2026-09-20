import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect } from "effect";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import * as Testing from "../src/Testing.ts";
import * as RequestStages from "../src/internal/RequestStages.ts";

/**
 * Task 1b: a security fix for a fail-open. Electron accepts one `webRequest` listener per stage per
 * session, so Sewed installs one native listener whose filter is the union of every installed
 * decider's filter — `internal/RequestStages.ts`'s `unionFilter`, tested here as a pure function
 * with no Electron and no fake session. `internal/WebRequest.ts` keeps one line: the call.
 *
 * Electron throws on the literal `"other"` in a native `types` array (`TypeError: Invalid type
 * other`), so the union must never emit it; but simply deleting `"other"` from an otherwise
 * restrictive union is the bug this fixes — see the fail-open test below, which is what a native
 * filter of `{ urls, types: ["image"] }` costs an `other`-only decider on the same stage: Electron
 * never delivers it a request it has labelled `"other"` at all.
 */

const union = RequestStages.unionFilter;

test("no installs means no native listener at all", () => {
  assert.equal(union([]), undefined);
});

test("one install with no types asks for every type by omitting the key", () => {
  assert.deepEqual(union([{ urls: ["<all_urls>"], types: undefined }]), {
    urls: ["<all_urls>"],
  });
});

test("two installs with different valid types union their types, order-insensitive", () => {
  const filter = union([
    { urls: ["https://a.example/*"], types: ["image"] },
    { urls: ["https://b.example/*"], types: ["script"] },
  ]);
  assert.ok(filter !== undefined);
  assert.deepEqual(new Set(filter.types), new Set(["image", "script"]));
  assert.deepEqual(filter.urls, ["https://a.example/*", "https://b.example/*"]);
});

test("an install for the resource type other, alone, asks for every type", () => {
  assert.deepEqual(union([{ urls: ["<all_urls>"], types: ["other"] }]), {
    urls: ["<all_urls>"],
  });
});

test("an install for other beside an install for a valid type still asks for every type", () => {
  // This is the fail-open at `2c7c1969`: before the fix, the second install's concrete `types`
  // survived the union unchanged (`other` was merely deleted from it), so Electron was handed
  // `{ urls, types: ["image"] }` — a filter that never delivers a request Electron itself labels
  // `"other"` — and the `other`-only decider on the same stage was silently never consulted.
  const filter = union([
    { urls: ["<all_urls>"], types: ["other"] },
    { urls: ["<all_urls>"], types: ["image"] },
  ]);
  assert.deepEqual(filter, { urls: ["<all_urls>"] });
});

test("one install naming both other and a valid type still asks for every type", () => {
  assert.deepEqual(union([{ urls: ["<all_urls>"], types: ["image", "other"] }]), {
    urls: ["<all_urls>"],
  });
});

test("the emitted types list never contains other", () => {
  const cases = [
    [{ urls: ["<all_urls>"], types: ["other"] }],
    [
      { urls: ["<all_urls>"], types: ["other"] },
      { urls: ["<all_urls>"], types: ["image"] },
    ],
    [{ urls: ["<all_urls>"], types: ["image", "other"] }],
    [
      { urls: ["<all_urls>"], types: ["image"] },
      { urls: ["<all_urls>"], types: ["script"] },
    ],
  ] as const;
  for (const entries of cases) {
    const filter = union(entries);
    assert.ok(filter !== undefined);
    assert.ok(!("types" in filter) || !filter.types.includes("other"));
  }
});

test("urls is the de-duplicated union of every install's urls", () => {
  const filter = union([
    { urls: ["<all_urls>", "https://a.example/*"], types: undefined },
    { urls: ["https://a.example/*", "https://b.example/*"], types: undefined },
  ]);
  assert.ok(filter !== undefined);
  assert.deepEqual(filter.urls, ["<all_urls>", "https://a.example/*", "https://b.example/*"]);
});

test("Testing.requests(): an other-only decider is consulted for an other event, and stays out of an image event", async () => {
  // The native union is only half of the story — `internal/RequestStages.ts`'s own per-install
  // `selects` (exercised here through the stand-in, with no native filter at all) already routes an
  // `other`-typed request to the decider whose filter names it. This pins that fact so the fix above
  // is understood as closing the native union's over-restriction, not as a matcher bug.
  const requests = Testing.requests();
  const otherEvent = {
    id: 1,
    url: "https://example.com/prefetch.txt",
    method: "GET",
    resourceType: "other",
    referrer: "",
    timestamp: 0,
  } as const;
  const imageEvent = { ...otherEvent, url: "https://example.com/img.png", resourceType: "image" };
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* requests.intercept(
          Decidables.Session.Request,
          { urls: ["<all_urls>"], types: ["other"] },
          Decision.sync(() => ({ kind: "block" })),
        );
        assert.deepEqual(yield* requests.resolve(Decidables.Session.Request, otherEvent), {
          kind: "block",
        });
        assert.deepEqual(
          yield* requests.resolve(Decidables.Session.Request, imageEvent),
          { kind: "allow" },
          "the other-only decider's own filter does not select an image request, so the fallback answers",
        );
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("Testing.requests(): an other-only decider blocks and a co-installed image-only decider passes, each consulted only for its own event", async () => {
  // Task 1b's brief asked for this second decider too: with BOTH installed, the point is not just
  // that the `other` event still blocks (the test above already shows that with the `other`-only
  // decider alone) but that installing a second, differently-typed decider on the same stage does
  // not change either one's own answer — `RequestStages.door`'s `selects` routes each event to the
  // decider whose filter names its type, and only that one. The image-only decider itself answers
  // {@link Decision.Pass}, so an `image` event still "reaches the fallback" exactly as it did with
  // no image decider installed at all — the assertion is that it does so *through* a decider that
  // was actually consulted, not because nothing matched.
  const requests = Testing.requests();
  const otherEvent = {
    id: 1,
    url: "https://example.com/prefetch.txt",
    method: "GET",
    resourceType: "other",
    referrer: "",
    timestamp: 0,
  } as const;
  const imageEvent = { ...otherEvent, url: "https://example.com/img.png", resourceType: "image" };
  const otherCalls: string[] = [];
  const imageCalls: string[] = [];
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* requests.intercept(
          Decidables.Session.Request,
          { urls: ["<all_urls>"], types: ["other"] },
          Decision.sync((event) => {
            otherCalls.push(event.resourceType);
            return { kind: "block" };
          }),
        );
        yield* requests.intercept(
          Decidables.Session.Request,
          { urls: ["<all_urls>"], types: ["image"] },
          Decision.sync((event) => {
            imageCalls.push(event.resourceType);
            return Decision.Pass;
          }),
        );
        assert.deepEqual(
          yield* requests.resolve(Decidables.Session.Request, otherEvent),
          { kind: "block" },
          "the other-only decider still blocks with the image-only decider co-installed",
        );
        assert.deepEqual(
          yield* requests.resolve(Decidables.Session.Request, imageEvent),
          { kind: "allow" },
          "the image-only decider passes, so the stage's fallback answers",
        );
        assert.deepEqual(
          otherCalls,
          ["other"],
          "the other-only decider is consulted for the other event, once",
        );
        assert.deepEqual(
          imageCalls,
          ["image"],
          "the image-only decider is consulted for the image event, once",
        );
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});
