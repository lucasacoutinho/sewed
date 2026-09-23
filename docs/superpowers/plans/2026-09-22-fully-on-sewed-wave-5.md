# Fully on Sewed, Wave 5: The Guest-View Gaps, a Web-Shaped Handler, and a Lost Connection That Says So

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest view has a title stream, a decider can read plain state or a request's own body, a handle answers one-shot reads beside its streams, `back` and `forward` answer when the move has settled and say when there was no entry, an attachment can be raised, a partition can keep its raw name, a scheme handler can be written in the web's own `Request → Response` shape, a test can push observation events into the stand-in, and a request in flight when the connection is lost fails typed — `Closed` before it was sent, `Unknown` after.

**Architecture:** One more `SubscriptionRef` mirrored like `favicons`; one decider constructor beside `fromState`; a lazy `readBody` over upload data the listener already captures; a snapshot struct per handle where only streams existed; a settle-on-navigation wait inside `travel`; one `addChildView` call for `raise`; one option on the partition schema; one adapter over the existing `serve`; a `PubSub` inside the requests stand-in; a reordering in the transport's failure path plus one new code and an optional `reason` field on `SewedError`, set only where this wave needs it. The failure model's deadlines, hints and reason index beyond these stay the redesign's own step.

**Tech Stack:** TypeScript, Effect v4 (`4.0.0-rc.115`), Electron 44.3.0, `node:test`.

**Spec:** `request-guest-view-gaps.md` §2–§8, `request-desktop-shell-gaps.md` § D (`Protocol.handle`), `request-testing-surface-gaps.md` §3, and `bulk-bytes-handback.md`'s connection-loss defect, as consolidated in `request-fully-on-sewed.md` (G2–G8, D2, T3, step 6), with the spec's § F (lines 338–346) for the failure codes. Evidence: the wave-5 ledger's scout notes (file:line for every site named below) and the probes Task steps require.

## Global Constraints

- Commands run from the repository root: `pnpm build`, `pnpm typecheck`, `timeout 300 pnpm test`, `pnpm format`, `pnpm format:check`, `pnpm docs:reference`, and one file with `node --import tsx --test --test-timeout=20000 packages/sewed/test/<file>.test.ts` (`--test-timeout=60000` for `bulk.test.ts`).
- Effect stays at `4.0.0-rc.115`. Add no dependency to any package.
- The root package (`sewed`) imports no Electron module, no `node:` module, and reads no environment at the top level. `Decision.ts`, `WebRequest.ts`, `WebContents.ts`, `Session.ts` (root), `SewedError.ts`, `Testing.ts`'s stand-ins are Electron-free.
- Resource operations return Effects. No `…Unsafe` variant is added: where a native callback must answer synchronously, the guide shows `Effect.runSyncWith(context)` over an operation that is itself synchronous, and a test pins which operations are.
- No `any`; no `as` beyond `as const` and `import * as` in `packages/*/src` (pre-existing documented bridges excepted); no non-null assertions.
- `*.test.ts` files are never type-checked; type claims live in `*-types.ts`, every `@ts-expect-error` proven to bite after `pnpm format`.
- A test that forks work waits on a positive condition and bounds the wait; never a fixed sleep as a barrier. In-process `pair()` delivers synchronously: a test about "between parts" uses `bulk.test.ts`'s `tap.hold`.
- A JSDoc block must not contain `*/` before its end; every JSDoc body line starts with `*`.
- Breaking changes are allowed; no aliases; each removal or shape change pinned by a negative contract assertion.
- One writer in the worktree. Stage only your own paths; never `git add -A`. Checkpoint with a commit as soon as the focused suite is green. Never push. Never `git stash --all`/`-a`/`-u`, never `git clean -x`, never `rm -rf` with a glob under `.artifacts/`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Rulings

1. **`webContents.title` is a State stream beside `favicons`, and a pass-only `Decision.sync` infers `Answer = never`.** The title is mirrored exactly as favicons are (`WebContentsCore.ts`: a `SubscriptionRef<string>`, reset to `""` on a real navigation, set in the `page-title-updated` handler that today only decides, exposed through `observe`); `TitleUpdate` keeps deciding whether the native title follows. `Decision.sync(() => Decision.Pass)` today infers `Answer` as `Pass`'s own `unique symbol` and fails to install; the fix is whichever mechanism a contract proves — a default `Answer = never` if inference leaves the parameter unbound, else an overload for a `Pass`-only lambda — and `Decision.pass` stays as the explicit spelling. Cost if wrong: one stream a consumer ignores; one inference a contract pins.
2. **`Decision.fromRead(read, decide)` reads plain state at decision time.** Beside `fromState`, over `() => S` instead of a `SubscriptionRef`, same `sync` composition. Cost if wrong: one function.
3. **A request decider reads the body it needs: `request.readBody(options?)` on the `Session.Request` event, and a resolved blob keeps its identity.** The listener already captures `details.uploadData` per request (`internal/WebRequest.ts:316-328`) and assembles it only for installs that asked (440-448); the event gains `readBody: (options?: { maxBytes?, blobs? }) => Effect<Body, SewedError>` that assembles lazily under the options given (defaults: the install's `body` options when it named them, else `{ maxBytes: 3_000_000, blobs: "reference" }`), so one install over `<all_urls>` pays for a body only on the request whose decider asks. The install-time `body` option remains for a decider that always needs it. `blobs: "resolve"` now answers `{ kind: "blob", id, bytes }` rather than `{ kind: "bytes" }`: a rule that refuses a blob part can still see one after resolution (the consumer's security finding). Only the request stage carries upload data, so only its event has `readBody`. Cost if wrong: one lazy function on an event; one shape change pinned by a contract.
4. **One-shot reads: `webContents.current`, `attachment.current`, and no `…Unsafe` variant.** `window.current` already answers the window's state beside its `changes` stream (`internal/Window.ts:367,374`); `webContents.current` answers `{ state, history, title, favicons, zoom, audio }` as they are now, and `attachment.current` answers `{ bounds, visible }`. Mutations stay Effects; the ones that are synchronous underneath (`setBounds`, `setVisible`, `detach`, `focus` — Task 4 establishes the list by reading each) are documented as such, with `Effect.runSyncWith(context)` as the door for a native callback that must answer at once, and a test pins that each named operation completes under `Effect.runSync`. Cost if wrong: a consumer wanting a bare synchronous method writes one `runSyncWith`.
5. **`back`, `forward` and `go` answer when the move has settled, and a missing entry is its own refusal.** `travel` calls `goToIndex` and returns; it now waits for the navigation it started to reach `ready` or `failed` (the state stream's next non-`loading` state for that generation) and answers that state. A missing entry fails `Protocol` with `reason: "history/no-entry"`; a policy refusal keeps `reason: "policy/denied"`. `SewedError` gains `reason?: string` — the stable identifier the spec's § F names — set in this wave only at these two sites and at the connection-loss sites (ruling 10); `docs/api.md` indexes the reasons that exist. Cost if wrong: a longer `back`, and one optional field.
6. **`attachment.raise()` draws an attachment above its siblings.** Electron treats a repeated `addChildView` as a reorder to the top (probed in Task 4's first step; if it does not, `removeChildView` + `addChildView` is the same call in two steps). No z-index option: an index that lies once another attachment moves is worse than a verb. Cost if wrong: one Effect.
7. **A partition may keep its raw name: `Session.fromPartition({ kind, name, mapping?: "hashed" | "raw" })`.** The default stays `hashed` (`sewed-v1-<sha256>`, the documented compatibility mapping); `raw` hands Electron the name as written (`persist:` prefixed for a persistent one) for an application that already has users under a native partition, and the sessions guide says loudly what the default costs such an application at upgrade. Cost if wrong: one option.
8. **`Protocol.handleWeb(scheme, handler)` takes the web's own shape: `(request: Request) => Response | Promise<Response>`.** It is the native-facing signature `serve` already adapts to (`internal/Protocol.ts:342-347`), exposed without the `HttpServerRequest`/`HttpServerResponse` wrapping; the request's `signal` aborts when the request is; a thrown error answers the request as the Effect handler's failure does today (read `serve`), and the registration scope rules are the same. A distinct name, not an overload: two handler shapes with the same parameter position cannot be told apart by an overload without a runtime probe. Cost if wrong: one function.
9. **`Testing.requests()` observes: `observe(filter): Stream<WebRequest.Event>` and `emit(event)`.** A `PubSub` inside the stand-in, the production `WebRequest.Event` schema (`sent | response | redirect | completed | error`), the same `filter` vocabulary `session.requests` takes and the same selection; a test pushes an event and the observer sees it. Cost if wrong: one stream.
10. **A request in flight when the connection is lost fails typed: `Closed` when it had not been sent, `Unknown` when it had.** Today `Transport.ts`'s `fail` (332-361) delivers typed `Closed` to undelivered bulk sends, then calls `onFailure` — which evicts the shared client and closes its scope, interrupting every in-flight request — and only then would fail the rest, so an ordinary caller sees a bare interruption. The order changes: every in-flight request is failed typed FIRST (`Closed` with `reason: "transport/closed-before-send"` for one still queued, `Unknown` with `reason: "transport/lost-after-send"` for one whose request went out and whose response never came), then `onFailure`. `Unknown` joins `SewedError`'s codes; the guides' "known gap" paragraphs and the spec's line-834 hunk are rewritten to the new truth; `bulk.test.ts`'s `tap.hold` idiom pins both outcomes on the shared connection. Deadlines and the full reason index stay the redesign's step. Cost if wrong: a caller who retried on interruption now sees `Unknown` and must not retry — which is the point.

## What the consumer writes

```ts
// a tab's title, a decider over plain state, a body read only when the rule needs it
const title = guest.webContents.title;                                       // Stream<string>
yield* guest.webContents.decide(Decidables.WebContents.Input, Decision.fromRead(() => model, (m, e) => m.allowsHumanInput(e) ? "allow" : Decision.Pass));
yield* session.intercept(Decidables.Session.Request, { urls: ["<all_urls>"] }, Decision.async((request) =>
  isProtected(request) ? Effect.map(request.readBody({ maxBytes: 3_000_000, blobs: "reference" }), decide) : Effect.succeed(Decision.Pass)));

// one-shot reads, a settled back, a raised pointer, a raw partition
const now = yield* guest.webContents.current;                                // { state, history, title, … }
const settled = yield* guest.webContents.back;                               // ready | failed; Protocol reason "history/no-entry"
yield* pointer.raise();
const ses = yield* Session.fromPartition({ kind: "persistent", name: "jaspace", mapping: "raw" });

// a web-shaped scheme handler; a stand-in a test can push into; a lost connection that says so
yield* Protocol.handleWeb(scheme, (request) => proxy(request));
const requests = Testing.requests(); requests.emit({ stage: "completed", … });
const exit = yield* Effect.exit(client.send(command));                      // Closed (not sent) | Unknown (sent, unanswered)
```

## File Structure

- Modify: `packages/sewed/src/internal/WebContentsCore.ts` (title ref; `current`; `travel` settle), `packages/sewed/src/WebContents.ts` (`Snapshot` schema), `packages/sewed/src/GuestView.ts` (tab protocol: `title`, `current` if the tab exposes them), `packages/sewed/src/Decision.ts` (`fromRead`; the `sync` inference), `packages/sewed/src/Decidables.ts` + `packages/sewed/src/WebRequest.ts` + `packages/sewed/src/internal/WebRequest.ts` + `internal/RequestStages.ts` (`readBody`; the blob shape), `packages/sewed/src/internal/View.ts` (`current`, `raise`), `packages/sewed/src/Session.ts` (`mapping`), `packages/sewed/src/Protocol.ts` + `internal/Protocol.ts` (`handleWeb`), `packages/sewed/src/Testing.ts` (`observe`, `emit`), `packages/sewed/src/SewedError.ts` (`Unknown`, `reason?`), `packages/sewed/src/internal/Transport.ts` (+ `Binding.ts` where the eviction is wired).
- Tests: `webcontents-core` tests (fake native), `decision.test.ts`, `decidables-request.test.ts` / `request-body.test.ts`, `view.test.ts` (fake parent view), `session.test.ts`, `protocol.test.ts`, `testing.test.ts`, `transport.test.ts` + `bulk.test.ts` (the `tap.hold` cases); contracts in the matching `*-types.ts`.
- Docs: `docs/guest-views.md`, `docs/native-policy.md` (fromRead; readBody), `docs/session-extras.md` (readBody, blob shape), `docs/webcontents-lifecycle.md` (current, settled back, reasons), `docs/sessions.md` (mapping, the loud line), `docs/protocol*.md` or `docs/api.md` (handleWeb), `docs/testing.md` (observe/emit), `docs/transport.md` + `docs/api.md` + `docs/binary-streams.md` (the connection-loss truth; the known-gap paragraphs deleted), `docs/reference.md` (generated), the spec and `docs/electron-coverage.md` (Task 8).
- Playground: `guest-fixture.mjs` (title stream; current; settled back with a missing entry; raise — pin the draw order by capturing and sampling a pixel where the pointer overlaps the tab; readBody on a protected POST with a blob part), `session-resources-fixture.mjs` (`handleWeb`), `session-extras-fixture.mjs` (the stand-in is Node-only — `testing.test.ts` pins it), `verify:binary` (a lost connection mid-call: `Unknown`, over the real bridge if a fixture can drop a connection; else the transport tests are the pin and the record says so).

---

### Task 1: A title, a read, an inference

- [ ] Read `WebContentsCore.ts` 80–150 and 240–260 (favicons and title handlers), `Decision.ts` 480–530 (`sync`'s doc comment on the abandoned overload pair, `pass`, `fromState`), `decision*.test.ts` and `decision-types.ts`.
- [ ] Probe the inference first, as a contract: does `sync<Event, Answer = never>` make `Decision.sync(() => Decision.Pass)` install on a `"keep" | "accept"` decidable, or does TS still bind `Answer` to the symbol? Record the answer; pick the mechanism the contract proves (default, or an overload placed before the general signature); keep `Decision.pass`.
- [ ] Failing tests: the title ref follows `page-title-updated` and resets on navigation (fake native); `fromRead` reads at decision time (a mutated closure answers the new value); the pass-only lambda installs (contract) and a wrong answer still fails (`@ts-expect-error`).
- [ ] Implement; `GuestView.tab` gains `title` if the tab exposes streams (read how `favicons` reaches the tab). Docs (guest-views, native-policy). Commit: `feat(webcontents,decision): a title stream, a decider over a plain read, and a pass-only decider that infers`.

### Task 2: A body read by the decider that needs it

- [ ] Read `internal/WebRequest.ts` 80–103, 300–330, 418–450, `RequestStages.ts`'s door and `filtered`, `WebRequest.ts` 85–100 (the body filter schema), `Decidables.ts`'s `Session.Request` event, `decidables-request.test.ts`'s body tests and the fake session's upload data.
- [ ] Failing tests: an install without `body` whose decider calls `readBody()` sees the parts (fake upload data), under the default bound; `readBody({ maxBytes: 4 })` on a larger body fails `Limit`; `blobs: "resolve"` answers `{ kind: "blob", id, bytes }` and `"reference"` answers `{ kind: "blob", id }`; a header-stage event has no `readBody` (contract); the install-time `body` still works and its decider sees the same shape.
- [ ] Implement; the event schema gains `readBody`; the `Body` part union's blob variant gains optional `bytes`. Docs (session-extras, native-policy). Commit: `feat(requests): a decider reads the body it needs, and a resolved blob keeps its identity`.

### Task 3: One-shot reads and a raised attachment

- [ ] Read `internal/View.ts` 15–30 and 101–182, `internal/Window.ts` 360–380 (`current`), `WebContentsCore.ts`'s `observe` sites and `readHistoryUnsafe`; probe on real Electron (a 20-line script under `.artifacts/probe-wave-5/`): does a repeated `contentView.addChildView(view)` move the view to the top, and does `getBounds()` on a `WebContentsView` answer synchronously?
- [ ] Failing tests over the fake native / fake parent view: `webContents.current` answers the same values the streams last published; `attachment.current` answers bounds/visible after `setBounds`/`setVisible`; `raise` calls `addChildView` again (or remove+add, per the probe); `Effect.runSync(attachment.setBounds(b))` completes for the operations the ruling lists (pin the list).
- [ ] Implement; docs (guest-views: the one-shot reads; the synchronous-boundary paragraph with `Effect.runSyncWith`). Playground: draw order pinned by a pixel sample. Commit: `feat(view,webcontents): one-shot reads beside the streams, and an attachment that raises`.

### Task 4: A settled move and a reason

- [ ] Read `WebContentsCore.ts` 395–410 (`travel`) and the state machinery 160–240, `SewedError.ts`, every `new SewedError(` site is untouched except the two named; `webcontents-extras-fixture.mjs`'s history check.
- [ ] Failing tests (fake native): `back` completes only after `did-finish-load` (or `did-fail-load`) for the navigation it triggered and answers that state; a missing entry fails `Protocol` with `reason: "history/no-entry"`; a policy refusal `reason: "policy/denied"`; `SewedError` decodes with and without `reason` (contract: `reason` is optional and a string).
- [ ] Implement; `docs/api.md` gains a "Reasons" list with the four this wave sets. Playground: the history check waits on the settled answer. Commit: `feat(webcontents,error): back and forward settle, and a refusal carries a reason`.

### Task 5: A raw partition and a web-shaped handler

- [ ] Read `Session.ts` 27–57, `docs/sessions.md` 40–46, `Protocol.ts` 30–45, `internal/Protocol.ts` 150–240 and 310–347, `session-resources-fixture.mjs`'s handler checks.
- [ ] Failing tests: `fromPartition({ …, mapping: "raw" })` hands Electron `persist:<name>` verbatim (fake native); default unchanged; `handleWeb` serves a `Response` and a `Promise<Response>`, aborts the request's `signal` when the request scope closes, and a throw answers as the Effect handler's failure does (read `serve` for the exact status/behaviour and pin it).
- [ ] Implement; docs (sessions: the loud line; the protocol guide). Playground: `handleWeb` in the resources fixture. Commit: `feat(session,protocol): a partition keeps its raw name, and a handler in the web's own shape`.

### Task 6: A stand-in a test can push into

- [ ] Read `Testing.ts` 140–170, `internal/WebRequest.ts` 140–236 (`reinstallTaps`, `observe`), `WebRequest.ts` 160–190 (`Event`), how `session.requests` applies its filter to observation events.
- [ ] Failing tests: `observe({ urls })` receives an `emit`ted event that the filter selects and not one it does not; each of the five stages round-trips its schema; two observers both receive; an observer's scope closing ends its stream.
- [ ] Implement; docs (testing.md). Commit: `feat(testing): the requests stand-in observes what a test emits`.

### Task 7: A lost connection that says so

- [ ] Read `Transport.ts` 280–380 (`clientProtocol`, `fail`, the eviction callback), `Binding.ts` 260–300 (`sharedClient`, `evict`), `bulk.test.ts`'s `tap.hold` cases and the existing `Closed`-before-delivery test, the guides' known-gap paragraphs (`docs/transport.md`, `docs/api.md`, `docs/binary-streams.md`) and spec line ≈834 + entry 27's boundary sentence.
- [ ] Failing tests over `pair()` with `tap.hold`: an ordinary request held before send, connection lost → `Closed` with `reason: "transport/closed-before-send"`; a request whose packet was delivered and whose answer is held, connection lost → `Unknown` with `reason: "transport/lost-after-send"`; the bulk case keeps its `Closed`; a stream in flight → `Unknown`; after the loss the shared client is evicted and the next call reconnects (the existing behaviour, still pinned).
- [ ] Implement the reorder in `fail`; add `Unknown` to the codes; contracts (`SewedError.code` includes `"Unknown"`; a negative pin that no other new code exists). Docs: delete the known-gap paragraphs, state the two outcomes and "nothing retries"; fix the spec's line-834 hunk and entry 27's sentence. Commit: `fix(transport): a request in flight when the connection is lost fails Closed before send and Unknown after`.

### Task 8: Record, sweep, hand-back

- [ ] Spec entries for rulings 1–10 (after wave 4's), the closing record, coverage rows (`page-title-updated`, `navigationHistory` settle, `addChildView` reorder, the raw partition, `protocol.handle` web shape) and a wave paragraph; commit the plan file.
- [ ] `pnpm build && pnpm docs:reference && pnpm format:check && timeout 300 pnpm test && pnpm website:build`; pack; reinstall; `verify` (guest), `verify:webcontents-extras`, `verify:session-extras`, `verify:sessions`, `verify:binary`.
- [ ] The hand-back is the controller's: `fully-on-sewed-handback.md`, installment 5 — the last; it says what remains the redesign's own (contributions, deadlines, the reason index, `sewed check`).

---

## Self-review

- **Requests covered.** G2 (Task 1), G3 (Task 1), G4 (Task 2), G5 (Task 3, with the ruling against `…Unsafe`), G6 (Task 4), G7 (Task 3), G8 (Task 5), D2 (Task 5), T3 (Task 6), the connection-loss typing (Task 7).
- **Type consistency.** `webContents.title`, `webContents.current`, `attachment.current`, `attachment.raise`, `Decision.fromRead`, `request.readBody`, `Session.Partition.mapping`, `Protocol.handleWeb`, `Testing.requests().observe/emit`, `SewedError.reason`, the code `Unknown` are spelled identically throughout.
- **Ordering.** Tasks 1–6 are independent of each other; Task 7 is independent of them and the riskiest, so it goes last under the same writer rule; Task 8 depends on all. Two writers in sequence (1–3, then 4–7) keep each dispatch bounded.
