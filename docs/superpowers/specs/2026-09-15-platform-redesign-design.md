# Sewed platform redesign

Date: 2026-09-15. Status: design. The four questions left open in the first draft were delegated back
and are decided below.

## Inputs

- The user's core principles: performance (xAI guidance from poteto/Lauren and the Dune framework),
  cohesion, scalability with composition and extensibility, and great DX for humans and agents.
  Breaking API contracts is allowed; the playground and Jobwright migrate, and no aliases stay.
- Principles v2 with the amendments from review: synchronous and asynchronous decisions are distinct
  types; renderer long-task diagnostics and an import-graph check enforce placement; bundle claims are
  proven by measurement; budgets use stable metrics plus time to first window; complete coverage
  applies to a surface once it is adopted; menu reconciliation needs explicit ordering and ownership
  rules; main-owned state keeps a one-line mirror; memory budgets count processes.
- Alchemy's model (the origin of Sewed's binding and runtime core): a capability is a contract with
  swappable Layers, features are Layers carrying their own resources, and requirements carry phases.
- Dune: mechanical enforcement of role graphs, explicit authority, deadlines and honest unknown
  outcomes, readiness receipts, and declarative verification.
- The first consumer's gaps: launch ownership after asynchronous launcher checks, the complete macOS
  menu role set, a fixed window title, the dock icon, and a bound crash page.

## Audit findings that drive the design

Measured on the round-two worktree (`first-consumer-round-two`, head 451f032c).

| Area        | Finding                                                                                                                                              | Evidence                                                                                                                                                                                                                                                                                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cohesion    | 13 mechanisms decide 11 kinds of native event, each with its own shape                                                                               | `App.guardQuit`, `window.guardClose`, `App.login`, `App.run({ certificateErrors })`, `Session.setCertificatePolicy`, `Session.setPermissions`, `webContents.setNavigationPolicy` (URL rules), guest `navigation` (match patterns, a second schema), guest `input` and `setInputPolicy`, `Session.setPreconnect`, `Session.intercept`, `downloads(decide)`, `Session.setDisplayMedia` |
| Cohesion    | Main uses handles; renderers use a separate hosted owner for the same surface                                                                        | `Shell.make` and `shell.host`, `Clipboard.host`, `Cookies.host`, `NativeTheme.host`, `Notification.host`, `PowerMonitor.host`, `guest.host`, `window.controls`, generic `host`                                                                                                                                                                                                       |
| Cohesion    | Sessions use free functions; windows use handle methods                                                                                              | `Session.cookies(handle)` versus `window.webContents.state`                                                                                                                                                                                                                                                                                                                          |
| Composition | `App.run` carries ten options; the application menu is replaced imperatively                                                                         | `App.ts:17-32`, `App.setMenu`                                                                                                                                                                                                                                                                                                                                                        |
| Performance | A renderer that imports one slot pays for every surface's schemas; nothing tree-shakes                                                               | Root entry alone: 67.3 KiB minified, 59 modules; `sewed/main` alone: 179.4 KiB, 125 modules (esbuild, Effect external); `package.json` declares no `sideEffects`                                                                                                                                                                                                                     |
| Performance | Each JSON message makes a full UTF-8 copy only to check its size, on send and again on receive                                                       | `internal/Transport.ts:86-87`, `:160`                                                                                                                                                                                                                                                                                                                                                |
| Performance | Main parses and schema-decodes every renderer packet before relaying it, even to a worker owner that decodes it again                                | `internal/MainBridge.ts:163-169`                                                                                                                                                                                                                                                                                                                                                     |
| Performance | Queues are bounded (128) everywhere; there are no performance budgets                                                                                | `Observers.ts:58`, `Observation.ts:29`, `Transport.ts:16`; `benchmark:transport` records correctness, not thresholds                                                                                                                                                                                                                                                                 |
| Failure     | Five error codes; no deadlines; a connection lost after a request was sent reports `Closed`, the same as never sent                                  | `SewedError.ts`                                                                                                                                                                                                                                                                                                                                                                      |
| DX          | No readiness receipt; no consumer architecture check; `sewed/testing` has hosts and workers but no in-memory surfaces; errors carry no stable reason | `Testing.ts`, `SewedError.ts`                                                                                                                                                                                                                                                                                                                                                        |

## The vocabulary

Seven concepts replace the eight shapes of the coverage plan:

- **Declaration**: an inert value applied synchronously before Electron is ready.
- **Resource**: a scoped native object (window, view, tray, download, session subscription).
- **Capability**: a contract (a Context service over an RPC group) with several Layers.
- **Event**: a bounded Stream of native facts.
- **State**: a replaying Stream of snapshots with a current value.
- **Decision**: a scoped answer to a native event that can be vetoed or answered.
- **Contribution**: a feature's share of shared native state (menus, dock), reconciled by the library.

A policy is data that compiles to a decision. A feature is an ordinary Layer that provides capabilities
and makes contributions.

## A. Capabilities: one contract, several Layers

### Shape

```ts
// sewed/shell (root, Electron-free): the contract
export class Shell extends Capability.Tag<Shell>()("sewed/shell", ShellProtocol) {}

// sewed/main/shell: the native Layer carries the policy
export const native: (options: {
  readonly policy: Shell.Policy;
  readonly paths?: readonly string[];
}) => Layer.Layer<Shell, SewedError, MainContext>;

// any document or worker: the client Layer reaches the owner main bound to it
export const client: Layer.Layer<Shell, never, ClientContext>;

// sewed/testing: in-memory, same policy checks, records calls
export const memory: (options: Shell.MemoryOptions) => Layer.Layer<Shell | Shell.Recorder>;

// main: serve whichever Shell Layer is provided to a document
// sewed/main: serving needs the RPC server, so it lives beside `host`, not on the root entry
Capability.serve(Shell): Effect.Effect<
  Binding.Owner<typeof ShellProtocol>,
  SewedError,
  Shell | MainContext | Scope
>;
```

Every consumer writes the same code:

```ts
const shell = yield * Shell;
yield * shell.openExternal({ url });
```

### Rules

- `define`, `client`, and `declaration` are root exports; `serve` is a `sewed/main` export. Serving
  builds an RPC server, and a root export would pull that server into every renderer bundle that
  imports any surface. A renderer-bundle check catches this; types and node tests cannot.
- The concept is named `Capability`. `Capability.define(key, protocol)` replaces `Binding.slot`, and
  `Binding.to(capability, owner)` keeps the wiring vocabulary.
- The contract is the RPC group. The capability tag is the binding slot, so a renderer entry declares
  `bindings: [Shell]` and main binds `Binding.to(Shell, yield* Capability.serve(Shell))`.
- The native Layer runs in-process with no serialization (principle 1.2). Only the client Layer uses
  the transport.
- A capability protocol may not declare RPC middleware. Effect applies middleware inside its server,
  so an in-process call would skip a check a bound renderer call honors. `Capability.define` refuses
  such a protocol with `Protocol`, naming the operation, so both layers obey one rule. Middleware
  remains available through the binding API, which `Remote` uses for its lease guard.
- A capability's operations carry only the protocol's own schema services. Neither layer puts a client
  environment or a scope in an operation's type: the native Layer has none, and the client Layer
  captures its environment when it is built and provides it around every call.
- The schema is the transport contract. A call over a binding is encoded and validated; an in-process
  call is not, because encoding is exactly what the native path exists to avoid. A handler whose
  result contradicts its own declared schema is a compile error, and the tests pin the behavior.
- Policy lives in the native Layer. Serving it to a document carries the same policy, so a rule holds
  whichever runtime calls.
- Window controls and guest tabs become per-owner capabilities: their `native(owner)` captures the window or guest, and `serve` stays a single-argument function. Session cookies proved the shape: a per-owner surface threads its resource into the layer rather than into a serve option.
- A capability's operations carry no runtime requirement in their type; the Layer that built them
  already required `MainContext` or `ClientContext` (Alchemy's rule: the Layer proves the environment).

### Alternatives considered

- Keep main handles and hosted owners. Rejected: two APIs for one surface is the cohesion defect.
- Route main calls through RPC too. Rejected: serialization on main for no benefit (principle 1.2).
- Derive the protocol from a handle's TypeScript type. Rejected: types vanish at runtime, and the
  transport needs schemas (principle 4.6).

### Replaces

`Shell.make`, `shell.host`, `Clipboard.host`, `Cookies.host`, `NativeTheme.host`, `Notification.host`,
`PowerMonitor.host`, `guest.host`, `window.controls`, `Binding.slot` (renamed to the capability tag).
Session operations move onto a session capability or handle methods, never free functions.

## B. Decisions

### Shape

```ts
// root: a decidable native event, declared once per kind
interface Decidable<Event, Answer, Timing, Composition, Owner> {
  readonly key: string; // "<owner prefix>/<name>", checked against `owner` at declaration
  readonly owner: "app" | "window" | "contents" | "session" | "requests";
  readonly event: Schema.Codec<Event>;
  readonly answer: Schema.Codec<Answer>;
  readonly timing: "sync" | "async";
  readonly composition: "first" | "restrictive" | "chain";
  readonly order?: readonly Discriminant<Answer>[]; // restrictive: most restrictive first
  readonly chain?: { stop; advance }; // chain: which answers end it, and what the next decider sees
  readonly fallback: Answer; // nobody had an opinion
  readonly failure?: Answer; // a decider broke; defaults to the owner's effective fallback
}

// synchronous: Electron needs the answer inside its callback, so the decider cannot compute or wait
Decision.sync<E, A>((event: E) => A | Decision.Pass);
Decision.fromState<S, E, A>(state: SubscriptionRef<S>, (state: S, event: E) => A | Decision.Pass);
Decision.policy(Navigation.Policy, rules); // data compiled into a synchronous decider

// asynchronous: Electron lets the answer arrive later
Decision.async<E, A, R>((event: E) => Effect.Effect<A | Decision.Pass, never, R>);

// install on the owner of the event, for the caller's scope
yield* window.webContents.decide(WebContents.Navigation, Decision.policy(Navigation.Policy, rules));
yield* window.decide(Window.Close, Decision.async(confirmClose));
```

The type of a synchronous decider cannot return an Effect, so it cannot suspend. A synchronous decider
that throws answers the fallback and logs the cause.

### Composition

Each decidable declares how its deciders combine, so the rule is visible where the event is defined:

- `restrictive`: every decider runs and the most restrictive answer wins. Every guard uses it: quit,
  window close, permissions, certificates, display media, navigation, downloads, popups, input,
  preconnect, and the request stage. A feature can therefore add a rule without another feature's rule
  being skipped, and no later decider can widen an earlier denial. Quit and window close are here, not
  under `first`, because any feature's objection must keep the window open; they have been since the
  first commit that declared them.
- `first`: the first answer that is not `Decision.Pass` wins. Kinds that express one application
  choice use it: the last-window policy, login, title updates, and unload.
- `chain`: each decider sees what the previous one produced, and a stop answer ends it. The two header
  stages use it (settled decision 8).

With no answer, the fallback applies. Closing a decider's scope removes it. What a decider denied is
still reported on the owner's `blocked` Event stream. Answer schemas for restrictive kinds declare
their order, so "most restrictive" is data, not a convention.

### Catalog

| Decidable                 | Owner                       | Timing | Fallback                                              | Replaces                                                                                                     |
| ------------------------- | --------------------------- | ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `App.Quit`                | app                         | async  | allow                                                 | `App.guardQuit`                                                                                              |
| `App.LastWindowClosed`    | app                         | sync   | platform default (`stay` on darwin, otherwise `quit`) | `App.run({ quitOnLastWindowClosed })`                                                                        |
| `App.Login`               | app                         | async  | cancel                                                | `App.login`                                                                                                  |
| `App.CertificateError`    | app                         | async  | reject                                                | `App.run({ certificateErrors })`                                                                             |
| `Window.Close`            | window                      | async  | allow                                                 | `window.guardClose`                                                                                          |
| `WebContents.Navigation`  | renderer and guest contents | sync   | entry document only                                   | `setNavigationPolicy` (both schemas become one `Navigation.Policy` with origin, document, and pattern rules) |
| `WebContents.Popup`       | contents                    | sync   | deny                                                  | fixed denial                                                                                                 |
| `WebContents.Download`    | contents                    | sync   | deny for guests, prompt for renderers                 | `downloads(decide)`; accepted downloads stay an Event stream of `Download.Handle`                            |
| `WebContents.TitleUpdate` | contents                    | sync   | keep the main title                                   | new (section E)                                                                                              |
| `WebContents.Unload`      | contents                    | sync   | honor the page                                        | new (`will-prevent-unload`)                                                                                  |
| `WebContents.Input`       | guest contents              | sync   | allow                                                 | guest `input` and `setInputPolicy`                                                                           |
| `Session.Permission`      | session                     | sync   | deny                                                  | `Session.setPermissions`                                                                                     |
| `Session.Preconnect`      | session                     | sync   | allow                                                 | `Session.setPreconnect`                                                                                      |
| `Session.Request`         | session                     | async  | allow                                                 | `Session.intercept` (filters and body options stay)                                                          |
| `Session.Certificate`     | session                     | async  | system verdict                                        | `Session.setCertificatePolicy`                                                                               |
| `Session.DisplayMedia`    | session                     | async  | deny                                                  | `Session.setDisplayMedia`                                                                                    |

### Alternatives considered

- One decider per owner and decidable, a second fails with `Limit` (today's guards). Rejected: features
  cannot each add a rule, which breaks composition (principle 3.2).
- A single untyped `on(event, handler)` emitter. Rejected: no answer schema, no timing guarantee.

## C. Phases and launch ownership

### Declarations

```ts
App.run(
  [
    Protocol.declare(jobwrightScheme),
    CommandLine.declare({ name: "lang", value: osLocale }),
    Paths.declare({ sessionData: paths.session }),
    CrashReporter.declare({ directory: paths.crashes, upload: false }),
    Gpu.declare({ acceleration: true }),
  ],
  program,
);
```

- A declaration is an inert value. `App.run` applies all declarations synchronously before it waits
  for readiness, then fails with `Startup` if any cannot apply.
- A declaration's value can come from a synchronous thunk at the entry. Asynchronous work belongs in
  the program, after readiness.
- Declarations are not Effects, so the program cannot yield one after readiness (principle 3.1).

### Launch ownership

```ts
const instance = yield * App.claimInstance({ data: { source: "desktop" } });
// Effect<App.Instance, SewedError | App.SecondaryInstance, MainContext | Scope>
yield * instance.launches.pipe(Stream.runForEach(showWindow), Effect.forkScoped);
```

- The claim is a scoped resource acquired when the program chooses. The lock is released when its
  scope closes.
- A secondary process fails with `App.SecondaryInstance` after forwarding its arguments; the program
  decides how to exit.
- Jobwright's packaged entry runs its launcher and handoff checks first, then claims the instance.

### Replaces

`App.run` options `schemes`, `commandLine`, `appUserModelId`, `hardwareAcceleration`, `startup`,
`singleInstance`, `certificateErrors`, `quitOnLastWindowClosed`, and `menu`. `CrashReporter.startup`
becomes `CrashReporter.declare`.

**Between step 3 and step 4** the application menu is `App.menu(options)`, a scoped resource
returning `replace` and `selections`; `App.setMenu` and `App.menuSelections` are gone, and step 4
replaces `App.menu` itself.

## D. Features and shared native state

### Contributions

```ts
const UpdaterFeature = Layer.scoped(
  Updater,
  Effect.gen(function* () {
    const updater = yield* Updater.native(options);
    yield* Menu.contribute(Menu.application, {
      anchor: Menu.anchors.app.afterAbout,
      items: updater.state.pipe(Stream.map(updateMenuItems)),
      select: (id) => updater.openDialog({ source: "app-menu" }),
    });
    return updater;
  }),
);
```

- Shared native state has one owner in the library: the application menu, the dock menu, and a tray's
  menu. Features contribute items; they never replace the whole menu.
- The application menu starts from a platform skeleton built from roles, with named anchors (`app`,
  `file`, `edit`, `view`, `window`, `help`, each with `start`, `end`, and role-relative positions).
- Ordering: anchor position first, then contribution order, then item order within a contribution.
- Ownership: command IDs are namespaced by contribution, so two features cannot collide; each
  contribution receives only its own selections.
- The reconciler coalesces contribution changes within one tick and rebuilds the native menu only when
  the resolved tree changes (principles 1.5 and 1.1 for main).

### Complete coverage of adopted surfaces

- Menu roles: the whole Electron role set, including the macOS roles `services`, `hide`, `hideOthers`,
  `unhide`, `front`, `window`, `help`, `recentDocuments`, `clearRecentDocuments`, the tab roles, and the
  speech roles, plus submenu roles (`help`, `window`, `services`, `recentDocuments`). The schema records
  each role's platforms; Electron ignores a role outside them.
- Dock: `setIcon` (path or bytes), badge, bounce, visibility, and the dock menu through contributions.

### Replaces

`App.run({ menu })`, `App.setMenu`, and `Tray.setMenu` as composition mechanisms.

## E. Main-owned native state and documents

### Window title

- `WebContents.TitleUpdate` falls back to keeping the title main set.
- `webContents.documentTitle` is a State stream.
- `Window.followDocumentTitle(window, format?)` is the one-line mirror: it installs a decider and keeps
  the window title equal to the formatted document title.
- The same rule covers other document-driven native changes: fullscreen stays behind the `fullscreen`
  permission, and popups behind `WebContents.Popup`.

### Readiness receipts

```ts
// renderer
yield * Renderer.ready("workspace");

// main
const receipt = yield * window.webContents.awaitReady("workspace", { deadline: "30 seconds" });
yield * window.show;
```

- The bridge issues the receipt for the document session that completed the handshake, so another
  document cannot forge it and a reload invalidates it.
- `webContents.readiness` is an Event stream of receipts with the label, document URL, and session.
- Verification drivers wait on receipts instead of polling DOM attributes.

### Local documents

- `Renderer.local("crash/index.html", import.meta.url)` resolves a document shipped with the
  application to a file URL entry.
- `@sewed/vite` builds declared local documents as extra renderer entries, and `sewed check` fails
  when a declared local document is missing from the build output.
- Jobwright's crash page is a local document bound to a `CrashScreen` capability (open issue, email
  support, export logs).

## F. Honest failure and diagnostics

- Every client call accepts `{ deadline }`; a protocol can declare a default. An expired deadline fails
  with code `Deadline` and interrupts the request.
- A connection lost before a request is sent fails with `Closed`. A connection lost after the request
  was sent and before its response fails with `Unknown`. Nothing retries.
- Interrupting a call never implies the owner rolled back its effect.
- `SewedError` gains `reason`, a stable identifier such as `binding/missing-slot`, `policy/denied`,
  `transport/limit`, or `decision/sync-threw`, and an optional `hint` naming the fix. The docs index
  every reason.
- Codes become `Startup`, `Protocol`, `Native`, `Closed`, `Limit`, `Deadline`, and `Unknown`.

## G. Performance

Every change below starts as a hypothesis with a baseline measurement, following the perf playbook:
trace or measure, change, measure again, cite the delta.

1. **Pay only for used surfaces.** Declare `sideEffects: false` and keep the barrels free of side
   effects, then measure the renderer and main bundles for a one-capability program. Add per-capability
   module entries (`sewed/shell`, `sewed/main/shell`) only if the barrels still retain modules the
   program never uses. Fewer entry points is better DX, so the measurement decides. Set budgets from
   the result.
2. **Size checks without copies.** When `string.length * 3` is within the limit, skip the UTF-8 copy;
   otherwise count bytes without allocating. Measure allocations per call in `benchmark:transport`.
3. **Main out of the data path.** When the owner is a worker or utility process, main authorizes the
   connection and then transfers a direct MessagePort between the document and that owner, so main
   never decodes the payload. Authority stays in main: it decides whether the binding exists, creates
   the port pair, and revokes it when the document, owner, or scope closes. The owner keeps full
   schema validation, which it already performs. Owners that live in main keep today's path, where the
   single decode is the owner's own work. Measure main-thread decode count and time under a
   renderer-to-worker stream before and after.
4. **Nothing eager at boot.** Services such as the menu reconciler start only when a contribution
   exists; clients stay deferred until first use.
5. **Budgets in the playground.** Before any budget lands, remove the fixed settling window in
   `packages/sewed/test/binary.test.ts`: it waits 50 ms and then asserts an exact count, which is the
   mechanism behind the intermittent failure recorded in the coverage document. A suite that can fail
   on timing cannot measure timing. Stable metrics fail the harness on regression: bundle bytes for the
   reference programs, messages and bytes per benchmark scenario, main-thread decodes per relayed
   message, heap growth after repeated stream subscribe and unsubscribe cycles, and renderer processes
   per window and guest. Time to first window is the one timed metric, with a generous threshold.
6. **Capture for agents.** `@sewed/devtools` exposes CPU profile and heap snapshot capture for any
   Sewed-owned process, alongside the existing cross-process tracing.
7. **Renderer long tasks.** In development, the renderer adapter reports tasks over the frame budget
   with the capability call or hook that was running.

## H. Enforcement and testing

- `sewed check` (a CLI and a `@sewed/vite` plugin hook) classifies modules by the entry that reaches
  them (main, renderer, worker, utility, shared) and fails on: an `electron` import outside main or a
  declared native module; `sewed/main` in a renderer or worker graph; a main-only module in a renderer
  graph; a declared local document missing from the build. Each rule ships a negative fixture.
- Declared native modules make trusted ambient code visible (principle 3.3); `sewed check` lists them.
- `sewed/testing` provides a `memory` Layer for every capability, with the same policy checks and a
  recorder, and — amended by decision 11 — `Testing.owner(kind)`, an owner stand-in that installs and
  resolves deciders without Electron, in place of `Testing.decide(decidable, event)`.

- The preload entry needs a different kind of check. It ships as a built `lib/preload.cjs` rather than
  a TypeScript emit, so a module-graph walk does not describe it, and its rule — a narrow sandboxed
  bridge — is still prose. `sewed check` inspects the built bundle instead. This is the last entry in
  the state that produced the wave's one real regression.

- Two guards in `packages/sewed/test/root-entry.test.ts` encode a proxy for their rule rather than the
  rule itself, and `sewed check` should replace both. It selects the RPC server by the `Host.ts`
  filename suffix, which `internal/GuestHost.ts` now matches without building a server; and the module
  each entry asserts it reaches "only indirectly" is a fact about today's graph, not an invariant, so a
  future direct import would quietly weaken that assertion to proving one hop. Select the server by the
  property — the modules that reach `Host.ts` — or by an explicit marker, and prove traversal by depth
  rather than by a named module.

- Test files are not type-checked, and this has now let a defect escape in two consecutive waves.
  `packages/sewed/test/tsconfig.json` includes only `types.ts` and `*-types.ts`, so no `*.test.ts` file
  in the package is checked; `packages/vite/test/tsconfig.json` is the only one in the repository that
  includes them. The capability wave's `ClientContext` leak into native call types escaped this way, and
  so did a decision-core regression where an always-pass decider stopped type-checking. Deliberately
  invalid values written for runtime assertions are the reason the gap is not trivial to close: they
  need `@ts-expect-error`, and until they have it the whole suite cannot be checked. `sewed check` owns
  closing it, one package at a time.

- Two flaky tests shared one root cause, and both are fixed. `binary.test.ts` "a stalled binary consumer
  stops production before the full source is buffered" and `download-item.test.ts` "an adopted item reports
  progress and its terminal outcome" each used a fixed sleep as a synchronisation barrier. By the end of
  the decisions wave, which grew the suite from 309 tests to 573, they failed about one `pnpm test` run in
  five. The download test now waits on the collector's first element, which `progress` replays on
  subscription and which therefore proves the subscription exists. The binary test waits for production to
  hold still across consecutive event-loop turns rather than milliseconds, because under CPU contention
  fifty milliseconds of clock can be almost no CPU. Both were proven rather than assumed: the old download
  barrier fails every time under an injected 30 ms subscription delay (`["terminal"]`, the flake's own
  signature) and the new one passes it; the binary test failed 1 run in 15 under 48 CPU burners on 24
  cores and 0 in 60 afterwards, and still fails when its consumer never blocks. The rule this leaves
  behind: a test that forks work waits on a positive condition, never on a duration.
- There is no linter in the repository at all, and two properties depend on one. A module staying free
  of Electron imports, and a reader written without a cast where a cast would be observationally
  identical, cannot be pinned by any test — six reviews of the decision core proved both by reading,
  which is the only way a test could. A `no-restricted-imports` rule and the test-file type-checking
  above close them together, and neither exists today.
- Three further gaps the decision core surfaced, ranked as the enforcement wave should take them: a
  registry's isolation from another registry is asserted by no test, and a regression in it surfaces
  as unrelated-looking failures that evaporate under any change to test ordering; `discriminantOf`'s
  totality is untested, its `catch` unreachable from every caller yet trivially unit-testable
  directly; and the brand's documented limit — that a spread of a declared decidable carries the
  brand while skipping every check — is shipped reference text that nothing enforces. The first of
  the three is closed: `testing-owner.test.ts`'s "each stand-in owns its registry, so one test's
  deciders cannot reach another's" asserts it directly, over two stand-ins of the same owner kind.
- **Nothing reads a block comment's interior** — a mangled paragraph break shipped through `oxfmt`,
  `tsc`, the reference check and a real Electron run into a published `.d.ts` and the public
  reference, caught only by a human reading generated output. Closed by
  `packages/sewed/test/doc-comments.test.ts`, which scans every package's source for the two shapes
  a mangled body line takes: one ending in whitespace and a stray asterisk, and one not beginning
  with an asterisk at all. Both halves are mutation-proven against the exact slip that shipped.

### Carried out of the decisions wave

Measured or ruled on while the decision model was built, and open when it closed. Each is here
rather than in a workspace, so nothing survives only in a file that is deleted.

- **A decider that never settles is never released.** Closing the installing scope removes a decider
  from later resolutions, but a resolution already in flight still owes its answer, so a decider that
  never completes holds its native callback open — a request stays unanswered and the page waits.
  There is no library deadline, by ruling: a login prompt, a certificate dialog and a screen-share
  picker are human-paced. It is documented on every surface that has one, and the guides tell an
  author to bound their own with `Effect.timeout` and `Effect.orDie`.
- **`resolveSync`'s foreign-decidable report is per-resolution and uncapped**, by ruling: the silent
  inert gate it reports is exactly the failure that leaves no trace, and a bug that fires on every
  navigation should say so every time rather than scroll past once. A rate limit would be the first
  thing to add if a real consumer ever hits it.
- **Request interception costs about 2.4 µs per installed decider.** Measured at Task 7c (median of
  5 × 8000): N=1 8.51 µs against 1.86 µs at base, N=16 48.36 against 3.87. `URL.parse` is 0.249 µs
  of the marginal cost; the rest is every decider going through the registry's `consult` even on a
  filter miss. The candidate optimisation is a fast path in `consult` for a synchronous decider, or
  for a `Pass` inside an asynchronous resolution. An id-keyed per-request carrier was built and
  rejected: it recovers about 7% and leaks per never-settling decider.
- **`App.ts`'s certificate-error event builder has no executing coverage**, and `securityOriginOf` is
  covered only for `file:`. Both need an HTTPS fixture rather than a new unit test.
- **Playground fixtures are neither type-checked nor linted.** A duplicate `const` reached a run and
  surfaced as a 55-second harness timeout rather than a compile error. The playground is a separate
  checkout, so this belongs to its own `tsconfig`, not to `sewed check`.
- **Seven playground `verify:*` scripts fail on this machine for host reasons unrelated to Sewed**:
  `verify`, `verify:webcontents`, `verify:webcontents-extras`, `verify:diagnostics`,
  `verify:responsiveness`, `verify:menus`, and `verify:application-menus`. A failure in any other is
  real.

## I. What the first consumer gets

| Jobwright need                                  | Design                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| Launcher checks before the single-instance lock | C: `App.claimInstance` after the checks                                |
| `jobwright` scheme before readiness             | C: `Protocol.declare` at the entry                                     |
| Updater menu item and macOS app menu roles      | D: contribution at `app.afterAbout`; complete role set                 |
| Fixed window title                              | E: `TitleUpdate` fallback keeps the main title                         |
| Dock icon in development                        | D: `App.dock.setIcon`                                                  |
| Crash page                                      | E: local document bound to `CrashScreen`                               |
| Splash removal and reveal on mount              | E: `Renderer.ready("workspace")` and `awaitReady`                      |
| Recorder media window                           | B: `Session.Permission` decider from state with a timed grant          |
| Save-as dialog options                          | B: `WebContents.Download` sync decider answering `prompt` with options |
| Jaspace human-input gate                        | B: `WebContents.Input` decider from surface state                      |
| Jaspace preconnect deny and request guard       | B: `Session.Preconnect` and `Session.Request` deciders                 |
| Protected action outcome                        | F: `Unknown` after send, no retry                                      |
| Host bridge replaced by typed protocols         | A: capabilities served to the main window                              |
| QA automation on the main window                | Existing declared window automation, now checked by `sewed check`      |

## Order

1. Capabilities and `sewed/testing` memory Layers; migrate the hosted surfaces and window controls.
2. Decisions; migrate guards, policies, interception, downloads, input, and preconnect.
3. Declarations and `App.claimInstance`; remove the `App.run` options.
4. Contributions, the menu skeleton, complete roles, and the dock.
5. Readiness receipts, local documents, and main-owned title.
6. Failure model and error reasons.
7. Performance changes, each gated by its baseline and budget.
8. `sewed check`.

Each step is test-first, migrates the playground, updates the docs and generated reference, and ends
in a local commit. The Jobwright Phase 4 plan targets steps 1 to 6.

## Decisions on the first draft's open questions

1. **Naming.** The concept is `Capability`; `Binding.slot` disappears and `Binding.to` stays. One word
   per concept serves cohesion, and "slot" described the transport rather than the contract.
2. **Decider composition.** Declared per decidable: `restrictive` for security-sensitive kinds and
   `first` elsewhere. Composition alone would let installation order decide a permission; a single
   decider per owner would stop features composing. This keeps both properties.
3. **Relayed traffic.** Direct document-to-owner ports for worker and utility owners, with main
   authorizing and revoking them. Main leaves the data path (principle 1.2) while authority stays
   explicit (principle 3.3).
4. **Module entries.** `sideEffects: false` first, per-capability entries only if measurement shows
   the barrels retain unused modules.

## Decisions settled while implementing

Open when the draft was written, decided since. The first binds step 2's mechanism; the rest bind its
catalog and its documented semantics.

1. **Restrictive order is a list of discriminants.** An answer is either a bare string literal — twelve
   of the eighteen decidables, `"deny" | "allow"` among them — or a `kind`-tagged union, and its discriminant is
   the literal itself or its `kind`. A decidable declares its order as those discriminant values, most
   restrictive first:
   `["deny", "prompt", "save"]` for `Download.Decision`, `["block", "redirect", "allow"]` for
   `WebRequest.RequestDecision`. Answers that modify a request (`redirect`, `headers`) rank above
   `allow`, so two deciders that both modify resolve by declared order rather than by installation order.
   Amended by decision 8: that holds between kinds, not between two answers of one kind.
   The mechanism reads `kind` where there is one and the value itself otherwise, and `order` is typed
   against those discriminants, so a misspelled entry is a compile error rather than an answer that
   silently never wins. A mixed union of literals and structs has no discriminant type and cannot
   declare an order; that is deliberate.
2. **`Session.Request` becomes three decidables, amending B's catalog.** A decidable declares one answer
   schema, and the three request stages have three (`RequestDecision`, `RequestHeadersDecision`,
   `ResponseDecision`). Keeping one row would need a stage-tagged answer, which destroys the per-stage
   order that makes the row restrictive. Step 2 replaces the single `Session.Request` row with
   `Session.Request`, `Session.RequestHeaders`, and `Session.ResponseHeaders`, each installed with the
   filter and body options `intercept` already carries.
3. **`Session.Preconnect`'s answer is `["deny", "allow"]`**, fallback `allow`. A boolean carries no
   order. This breaks the published `setPreconnect(handle, boolean)` signature.
4. **`Decision.fromState` answers from the value current at the callback.** A `SubscriptionRef` read is
   atomic, so there is no torn value to observe; what a synchronous decider cannot do is wait for an
   update that has not been applied, because Electron requires the answer inside its callback. That is
   documented semantics under F, not a defect to engineer around, and a test pins it.
5. **`App.LastWindowClosed`'s fallback is platform-derived, amending the catalog's Fallback column.**
   `App.ts` computed `options.quitOnLastWindowClosed ?? process.platform !== "darwin"`, so the
   decidable declares
   `fallback: typeof process !== "undefined" && process.platform === "darwin" ? "stay" : "quit"` rather than the
   catalog's plain "quit". A constant `"quit"` would silently change macOS behavior, where closing the
   last window does not quit the app. Installing a library-side darwin decider instead is worse:
   `LastWindowClosed` composes `first`, so the library's decider would install before any consumer's
   and out-rank every one of them, and a consumer could never override it. `process.platform` is Node,
   not Electron, so `Decidables.ts` stays Electron-free and inert. The `typeof process` guard is load-bearing:
   `Decidables.ts` is a root-package module a renderer can import, and the bare read shipped into renderer
   bundles and threw in the browser. Measured on the playground's renderer bundle: 538.0 kB before
   `sideEffects: false`, 289.5 kB after, and 295.5 kB with the read shipped again once a renderer imports
   `Decidables`. No root-package module may read the environment at the top level.

6. **A policy compiles itself, and is a grant list.** B spells `Decision.policy(Navigation.Policy, rules)`
   with two arguments; the first implementation took a third, a `compile` the consumer wrote, and steps
   3, 4 and 6 each deleted one of Sewed's rule matchers on the strength of it — an app pinning one
   certificate hand-wrote fifteen lines of wildcard-hostname matching. A policy is now a value,
   `Decision.definePolicy({ rules, compile })`, and each module exports its schema as `Rules` and the policy
   as `Policy`. A policy answers only for what its rules match and passes otherwise: every policy-bearing
   decidable falls back closed, so a miss is still denied and two features' policies compose as a union of
   grants rather than vetoing each other. Deny-on-miss — a cap nobody can widen — stays an explicit
   `Decision.sync`. Each policy compiles against the least it needs from an event, so `Navigation.Policy`
   installs on `Navigation` and `Popup`, and `Certificate.Policy` on both certificate decidables
   (`App.CertificateError`'s event gains `hostname` for it). A document rule never grants a device check,
   which is deliberately tighter than the rule engine it replaces: that engine granted a root-document
   rule's devices to the whole origin, through a shared document key. Certificate hostname patterns are allowlisted and then canonicalized: a label is `[A-Za-z0-9_-]+`, with one optional leading `*.` label and an optional trailing dot, or the pattern is a bracketed IPv6 literal; the WHATWG host parser then says which host the pattern names, and one function serves both the schema's refusal and the matcher, so what decodes and what matches cannot drift. A denylist was tried three times and leaked each time. It matters because a malformed grant fails closed but a malformed _pin_ fails open: it never matches, Chromium's ordinary verdict stands, and the author believes the host is pinned. An internationalized host is therefore written in punycode, the form Chromium reports, and a wildcard over an address is refused. Two further differences from the engine this replaces are deliberate: a pin also fires for the trailing-dot form of its host, which was a bypass, and an IPv6 pattern matches with or without brackets. `Session.Permission`'s event is `{ name, origin, document }`, where each of `origin` and `document` is `null` when it identifies nothing — an opaque origin, a device check — and `DesktopCapturer.Request.origin` follows the same rule.
7. **What a failing decider contributes is declared data, amending B's "answers the fallback".** The
   fallback is what happens when nobody has an opinion; conflating it with what a broken decider
   contributes is closed only when the fallback is the closed answer. Run against step 4's code, a crashing
   unsaved-changes guard resolved `Window.Close` to `allow` and the window closed, where the guard it
   replaced logged "request denied"; a crashing pinning decider resolved `Session.Certificate` to `system`,
   turning a broken pin into no pin. A decidable may declare `failure`; undeclared, it is the effective
   fallback as before. `Window.Close`, `App.Quit` → `deny`; `Session.Certificate` → `reject`;
   `Session.Preconnect` → `deny`; the request stages → `block`. `WebContents.Input` deliberately declares
   none: its closed answer would swallow every keystroke in an app with one buggy decider.
8. **`chain` is a third composition, amending B's list and decisions 1 and 2.** Decision 1 says two
   deciders that both modify a request "resolve by declared order"; two `headers` answers rank equal, so
   they resolved by installation order and the second feature's headers vanished — Electron's
   single-listener clobbering, one level up. The interception this replaces _chained_ them. A `chain`
   decidable declares `stop` (the discriminants that end it) and `advance` (what the next decider sees),
   and resolves to the stopping answer or the folded event. `Session.RequestHeaders` and
   `Session.ResponseHeaders` chain with `stop: ["block"]`; `Session.Request` stays restrictive. A `block`
   still wins regardless of installation order, so no later decider can widen an earlier denial.
9. **A decidable names its owner.** `Owner.decide` accepted any decidable, so a window's close guard
   installed on its web contents compiled, installed, and was never consulted. A decidable declares
   `owner`; `Owner<O>` refuses another owner's decidable at compile time, and the registry refuses it at
   run time, because a fixture or an agent may be writing JavaScript. The request stages are their own
   owner kind, `requests`: they install through `session.intercept(decidable, filter, decider)`, whose
   required filter keeps the cost of routing requests through main visible at the call site.
10. **A native handler exists only while a decider does, where the code it replaces worked that way.**
    `Registry.make({ hooks })` attaches on a decidable's first decider and detaches on its last. The
    certificate verify proc and the display-media handler use it; permission handlers and the preconnect
    listener stay installed at acquisition, deliberately, as they always were. Every native callback
    answered from an asynchronous resolution goes through one helper that replies exactly once, with the
    closed form if the resolution or the reply dies. There is no deadline: a login prompt, a certificate
    dialog and a screen-share picker are human-paced, and a decider's liveness is its author's.
11. **The testing surface is three owner stand-ins, amending H's testing bullet.**
    `Testing.decide(decidable, event)` was written before owners existed and does not survive two of
    them: a registry is built for exactly one owner kind, so "a registry the testing layer owns" no
    longer type-checks, and `decide` now means _install a decider_ everywhere else in the library, so
    the same verb would have named the opposite role. A stand-in for one owner replaces it, built on
    the production registry and the production `decide` builder. Nothing is faked: the scoped
    install, scope-close removal, composition, answer decode, declared `failure` and the owner's own
    construction-time posture are all the real ones, so a feature written against the minimal
    interface (`(contents: Decision.Owner<"contents">) => …`) takes a real window's `webContents` and
    a stand-in alike. The application's door is a free function, so a feature written against
    `Decision.Owner<"app">` is handed `{ decide: App.decide }` in production.

    **One rule decides the shape: a stand-in has exactly the posture and exactly the doors its
    production owner has.** That gives three constructors rather than one.

    | Stand-in                                                          | Doors                                  | Why those                                                                                                                                                                                   |
    | ----------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `Testing.owner(kind)`, `kind` in `"app" \| "window" \| "session"` | `decide`, `resolve`                    | those three real owners build a bare registry, so the decidable's own catalog fallback is faithful and nothing more is needed                                                               |
    | `Testing.contents({ of: "window" } \| { of: "guest", input? })`   | `decide`, `resolve`                    | a web contents has no posture-free form in production: a window's registry falls back to `prompt` for a download, a guest's to `deny`, and a guest built with `input: "block"` blocks input |
    | `Testing.requests()`                                              | `intercept`, `resolve`, `resolveChain` | a session installs a request stage through `intercept` alone — `session.decide` refuses one at compile time and at run time — and both chain decidables in the catalog are request stages   |

    `owner("contents")` and `owner("requests")` do not compile, and the misspelled-kind error names
    the three kinds. `contents` calls `ContentsPosture.rendererFallbacks()` /
    `guestFallbacks(input)`, the same two functions `internal/WebContents.ts` and
    `internal/GuestView.ts` call at their own construction sites, so the two cannot drift. That the
    posture matters is not cosmetic: a decider that passes on a miss delegates to the fallback, so
    the answer a test asserts _is_ the fallback's, and a download test written against the wrong
    posture asserts the wrong thing while looking right. A single `owner(kind)` shipped without a
    posture, with `intercept` and `resolveChain` on every kind, and was corrected in two rounds.

    Three further consequences. `resolve` and `resolveChain` are separate methods with no overload:
    they return an `Answer` and a `ChainOutcome`, and a runtime check on `composition` cannot narrow
    a type parameter, since `Decidable` is an interface rather than a union. A fresh registry per
    constructor call makes the registry's non-enumerable `WeakMap` a non-problem — there is nothing
    to reset. And the request stages' filter is honored, because the stage table, the
    URL-and-resource-type match and the pass-on-a-filter-miss wrapper moved out of
    `internal/WebRequest.ts` into an Electron-free `internal/RequestStages.ts` that both doors call;
    body _assembly_ stayed native, so a test event carries the `body` it wants its decider to see.
    `Decision.Requests` is published for the same reason `Decision.Owner` is: `session.intercept` and
    the stand-in's are one signature, not two that can drift. It is also the one place `Decision.ts`
    names a schema from another surface, which `doc-comments.test.ts` now scans for rather than
    leaving to the doc comment that claims it.

12. **Every guard that could fail open declares its failure, amending decision 7.** The final review ran
    every decision surface at the wave's base and at its head with the same inputs, and found decision 7's
    own defect on a second decidable: `WebContents.Download` declared no `failure`, a window's posture
    overrides its fallback to `prompt`, and an undeclared failure is the effective fallback — so a download
    decider that threw handed the file to the save dialog where the code it replaced denied. It declares
    `failure: { kind: "deny" }`. It hid because the wave's own tests built a contents registry with no
    posture, which production cannot produce; those tests now build theirs from `ContentsPosture`. The rule
    this leaves: a test of an owner's behaviour builds the registry the way that owner does.
13. **An `Input` decider is consulted on a window's contents as well as a guest's.** Both kinds of contents
    are owner kind `"contents"`, so `window.webContents.decide(Decidables.WebContents.Input, …)` compiled,
    installed, and was never consulted: input listeners existed only for guests, as they always had. That
    is decision 9's silent inert install, inside one owner kind, and the testing stand-in answered `block`
    for it, so a feature passed its unit test and did nothing in the app. A window's registry now carries a
    `Registry.hook` for `Input` — the third user of that mechanism after the certificate verify proc and
    the display-media handler — so its two native listeners exist only while a decider does, and a window
    with no input decider pays nothing per key event. A guest still installs its listeners at construction,
    because a guest built with `input: "block"` must block with no decider installed.
14. **A decider's `Scope` is its decision's, not its installer's.** The guards this wave replaced ran each
    close and quit decision under `Effect.scoped`; the registry handed every decider its installer's scope,
    so a per-decision resource lived until the installing scope closed. Every asynchronous decider on every
    surface now gets a scope per decision, at about 0.3 µs per decider per resolution. A finalizer that dies
    makes its decider a failed one and discards its answer, which is fail-closed. One that never returns
    leaves the resolution unsettled, and `Effect.timeout` on the decider does not bound it, because the
    finalizer runs on the registry's scope, outside the decider's own effect.
15. **A subscription counts, and an accepted download is one handle.** Two subscribers to a contents'
    `downloads` broke each other: on a window, ending the second removed the native listener and a download
    the decider denied proceeded; on a guest, governance never left, but a replacement subscriber was
    silenced for good once the one it replaced ended. Registrations are counted, the first governs and
    publishes `blocked`, and an accepted download is adopted once
    and offered to every subscriber as the same handle — so one subscriber's `pause` or `cancel` is the
    download's for all of them. On a window the native listener leaves with the last subscriber; a guest's
    own construction-time entry keeps it for the guest's life, because a guest governs downloads with no
    subscriber at all. Which registration governs is unpinned and unobservable today, since every
    registration for one contents carries the same `decide` and `onBlocked`.
16. **The catalog is closed for resolution, and that is parked, not decided.** `Decision.decidable` is
    public, so a consumer can declare a decidable and install it on a real window; it compiles, and nothing
    in production resolves it. Only `Testing.owner` and `Testing.contents` do; `session.intercept` and
    `Testing.requests` already refuse one. The doc comment and the guide now say what declaring your own is
    for. The next wave either refuses a non-catalog decidable at `decide`, the way `intercept` does, or
    stops exporting `decidable`.
17. **One `App.run` signature: `App.run(declarations, program)`.** An application with nothing to declare
    writes `App.run([], program)`; there is no overload taking a bare program, so a reader never has to
    check which overload a call site chose, and the empty list is itself the visible statement that
    nothing runs before readiness. Cost if wrong: an overload for the no-declarations case would let
    "nothing to declare" disappear from the call site instead of costing one `[]`.
18. **A declaration is an opaque value with one door, and the options object it replaces is gone with
    it.** `Declaration.make(name, apply)` keeps a declaration's name and its synchronous step in a
    `WeakMap`, exactly as `Protocol.scheme` already keeps a scheme's; every `declare` in Sewed is built on
    `make`, and it is public because `@sewed/forge`'s `CrashReporter.declare` needs it from outside the
    package. A value with no enumerable shape cannot be forged structurally, so `App.run` is never handed
    an arbitrary object standing in for a declaration. `App.Options` and `App.Startup` are removed with
    nothing left in their place: `Declaration.make` is what `Startup` was, and the object it used to
    configure no longer exists to configure. The rejected alternative was a declaration as a plain object
    `App.run` inspects by shape, which a consumer could assemble by hand with no factory in the loop at
    all.
19. **`App.run`'s list holds declarations and synchronous thunks: `readonly Declaration.Entry[]`,
    `Entry = Declaration | (() => Declaration)`.** `App.run` calls a thunk, in list order, for the
    declaration it produces; a thunk keeps its entry inert at module load — a module can export a list of
    thunks and compute nothing until `App.run` asks — and a throw inside one fails `Startup` naming the
    thunk's position in the list rather than escaping as an uncaught exception before any application has
    decided to run. One thunk yields exactly one declaration. Cost if wrong: a thunk allowed to run at
    import time, or to return a list, would put Electron-touching work back at module load, which is
    exactly what declarations exist to keep out.
20. **Applying declarations is in order and stops at the first failure.** Failure is `SewedError` code
    `Startup`, message `Could not apply declaration "<name>"`, with the throw as its cause, and nothing
    after a failed declaration applies — `App.run` exits on it regardless of whether a later declaration
    might have succeeded on its own. Cost if wrong: a consumer debugging a startup failure would first
    have to work out which of several declarations actually took effect before deciding what to fix;
    stopping at the first one and naming it removes that question.
21. **Where each `declare` lives.** All of them are in `sewed/main`: `Protocol.declare(...schemes)` stays
    in `internal/Protocol.ts` beside the scheme registration it wraps; `CommandLine.declare`,
    `Paths.declare`, and `Gpu.declare` each get a new thin main module of the same name; `App.declare`
    stays in `App.ts`, because the Windows application user model id it takes is a fact about the
    application itself and has no better home; `CrashReporter.declare` stays in `@sewed/forge`, since the
    crash reporter is a Forge concern; and `Declaration.make` gets its own `sewed/main` namespace,
    `Declaration`. `internal/Declarations.ts` already holds every Electron-free factory (`commandLine`,
    `paths`, `gpu`, `identity`) plus the walker that applies them — that module is not what was rejected.
    What was rejected is a single _public_ `Declarations` namespace exporting a `declare*` for every fact,
    in place of `CommandLine`, `Paths`, `Gpu`, `App`, `Protocol`, and `CrashReporter` each owning their
    own `declare`: it would have made `App.declare` and `CrashReporter.declare` import a module unrelated
    to what they declare, for no benefit over letting each fact's `declare` live beside that fact's other
    operations. The internal module is the extraction that lets the unit suite drive every factory
    through a structural fake; the public surface is what stays spread out.
22. **`Protocol.declare` is variadic and one-shot.** Electron registers privileged schemes in exactly one
    call, so one declaration carries every scheme a consumer needs, and a second `Protocol.declare`
    appearing in the same list fails `Startup` naming the declaration, with the once-only error
    `registerSchemes` produces for a second registration attempt as its cause. `registerSchemes` itself
    stops being public, since `declare` is now the only door onto it. Cost if wrong: a public
    `registerSchemes` sitting beside `declare` would let a consumer call Electron's one-shot registration
    twice through two different paths, one of them outside `App.run`'s ordering and failure handling
    entirely.
23. **`Paths.declare` takes a partial table over `Application.PathName`.** `Schema.Record` over a literal
    union requires every key, which would force a consumer naming one path to also name every other one it
    has no opinion about; the table is typed by hand instead, and each entry is decoded before any
    `setPath` call, so a single bad name fails the whole declaration before any path is set. Cost if
    wrong: decoding and applying interleaved would not fail silently — the bad entry would still fail
    `Startup`, naming itself — but the good entries would already be set by then, leaving a partially
    applied table for a consumer to reconstruct from a single failure message naming only the one bad
    entry.
24. **`CrashReporter.declare` takes the existing `Options` plus `directory`.** `directory` sets Electron's
    `crashDumps` path before calling `crashReporter.start`, in that order — a consumer who instead set the
    crash-dumps path through `Paths.declare` could get the order wrong with no error, since nothing ties
    the two declarations together. The upload flag keeps its existing name `uploadToServer` rather than
    the spec's illustrative `upload`, because the module's `uploadToServer` query and `setUploadToServer`
    command already use it and the spec's spelling was never meant as the contract. Cost if wrong: a
    renamed flag would leave the declaration and the rest of the module disagreeing about what a crash
    reporter's upload setting is called.
25. **`App.claimInstance({ data })` is a scoped resource held one at a time, and its later launches are
    their own stream.** Acquiring it decodes `data` as a JSON object and calls
    `requestSingleInstanceLock(data)`; Electron forwards this process's arguments, working directory, and
    data to the primary process inside that same call, so a `false` result fails `App.SecondaryInstance`
    only after the forwarding has already happened — "after forwarding" is Electron's own contract, not
    something Sewed adds. A `true` result installs the `second-instance` listener and starts the launch
    queue; release removes the listener, ends the queue, and releases the lock. A second claim while one
    is held fails `Limit`; a claim made after a release succeeds, since release already cleared the held
    state. `App.run` does not special-case `SecondaryInstance`: the program catches it and decides, and
    left uncaught it exits 1 like any other failure. `instance.launches` is
    `Stream<Launch.SecondInstance, SewedError>`; each value has `arguments`, `workingDirectory`, and
    `additionalData` fields and no `kind`, and `App.launches` keeps only `initial`, `file`, and
    `url` — a `second-instance` could never arrive on `App.launches`, so the union member that could never
    occur there is removed rather than left representable for a caller to handle in vain. Both streams
    share one queue module: capacity 128, one draining consumer, launches retained before a consumer
    subscribes, `Limit` on overflow or on a launch over 256 KiB, `Closed` once the owning scope releases.
    The cost the design accepts: a secondary process reaches Electron's readiness before it learns it is
    secondary, since the program that would call `claimInstance` only runs after `whenReady`; a consumer
    wanting the cheapest possible exit claims the instance first, before doing anything else.
26. **The application menu's interim path is `App.menu(options)`: `Effect<App.Menu, SewedError, MainContext
| Scope>` with `replace` and `selections`.** `App.setMenu`, `App.menuSelections`, and the
    `ApplicationMenu.Owner` service are gone. Release stops the menu's callbacks and fails its observers
    `Closed`; it does not restore or clear the native menu, because the X11 finding recorded in
    `docs/application-menus.md` rejected a _restoring_ release specifically, not a scoped acquisition —
    that finding still stands. A second live `App.menu` fails `Limit`, since shared native state has
    exactly one owner. This is explicitly interim: step 4 of the platform redesign replaces `App.menu`
    with the menu skeleton and contributions, and nothing acquired through it today is expected to survive
    that step.
27. **A bulk request is declared on the operation and names its field: `Binary.bulk(rpc, { field, maxBytes })`.**
    The declaration is an `Rpc.annotate` under a private context key, the same annotate-and-read-back
    technique `Binary.protocol` already uses to mark a group as binary, one level down, on the operation
    rather than the group; reading it back walks the protocol's own map from tag to operation, not the
    payload's schema, so nothing walks a schema to find the bytes. `field` is instead a compile-time
    constraint on the payload's own `Uint8Array`-valued keys, so naming anything else, or a field the
    payload does not have, does not compile. `maxBytes` bounds that field's byte length exactly — the
    number a consumer already has in hand, its own attachment ceiling — and everything beside it, the
    other fields, the headers, the envelope, keeps the ordinary 256 KiB allowance it would have had
    without the declaration, on both ends: the client encodes against that field's bound plus one
    envelope, and the owner's assembly buffer is the same sum, so the assembled request the handler
    receives is at most the declared bound plus 256 KiB, and a bound on an attachment never lifts the
    limit on a command string riding beside it. A bulk operation belongs to a `Binary.protocol`, where
    `Binary.Bytes` reaches the wire as the bytes the transport measures and slices; a JSON protocol that
    declares one is refused at `Binding.slot`, which `Capability.define` builds its slot through, at
    definition, rather than once a document sends its first attachment. Only a declared operation may
    fragment, and a bound is a positive integer of at most 64 MiB, refused at `Binary.bulk` itself, also
    at definition.

    The client enforces the bound before sending, so a request it will refuse costs the wire nothing:
    three typed failures cover it, `Protocol` when the named field does not hold bytes (already turned to
    text by a codec, or simply absent), `Limit` when the field itself exceeds its bound, and `Limit` again
    when the rest of the request outgrows the one envelope riding beside it. An honest client that trips
    none of them encodes the request once and, if that fits an envelope, sends it whole; otherwise it
    sends slices of that same encoded packet, one in flight, each waiting for the owner's `PartAck` before
    the next leaves — the discipline a split stream response already uses in the other direction, pointed
    at the other end of the wire. The owner buffers slices up to the field's own bound plus the one
    envelope riding beside it — the same allowance the client encoded against — and does not decode
    until the last one arrives, then applies the identical field check to a request that arrived whole in
    one envelope, so a lying peer gains nothing by skipping fragmentation: a part for an operation that
    declared no bound, a part that would overrun the buffer, an empty part, a non-final part below the
    16 KiB floor, a second assembly on one connection, a request whose assembled field exceeds the bound,
    or a whole request stating the same, all close the connection, the way an invalid packet always has.
    One bulk request assembles per connection at a time, and the floor on a non-final part bounds the
    number of parts one assembly holds as well as their bytes — at most
    `ceil((maxBytes + 256 KiB) / 16 KiB) + 1`, about 800 parts for a 12 MiB bound. The bytes a connection
    holds while parts arrive are the largest bound any operation on it declares plus one envelope; the
    peak comes a moment later, when the parts, the single packet joined from them, and the canonical
    packet the decoder re-encodes to check that packet against are all live at once — about three to four
    times the bound while the request is validated and decoded, after which only the decoded value
    survives, its byte field a view of the joined packet rather than a further copy. An ordinary request
    sent between two parts is answered without waiting on either. A part is a slice of
    the client's own already-encoded packet, not a second codec; a relay validates each slice as the
    envelope it is and forwards it unread, and nothing between the two ends ever reassembles the parts
    itself. Interrupting the caller, or losing the connection, drops the owner's partial assembly outright
    and forwards nothing further — the `Interrupt` stops at the assembly rather than going on to a
    request server that never saw the identity; a connection lost while parts are still going out fails `Closed` naming
    that the request was not delivered, which is the one case where the handler certainly did not run. After the
    final part, the request gets whatever an ordinary in-flight request gets: a connection lost with the request
    already sent and no answer back fails `Unknown`, reason `"transport/lost-after-send"` — the handler may or may
    not have run, and nothing retries it — the fifth fully-on-Sewed wave's own reorder in `Transport.ts`'s `fail`,
    which now delivers every in-flight request's typed outcome, on the default shared connection too, before the
    shared client's own scope can close and interrupt whatever is left (entry 66). The
    in-process path —
    `Capability.fromHandlers`, the memory Layers — has no wire and applies no bound at all, since the
    bytes already live in the one process the handler runs in; the same operation is therefore bounded
    over a binding and unbounded in the runtime that owns its handler, which is documented rather than
    reconciled.

    The first implementation bounded the whole encoded request rather than one field, and was amended:
    a consumer declaring its real limit, its exact attachment ceiling, had a request of exactly that size
    refused by the envelope's own overhead riding along inside the same count, so the "N bytes passes, N
    plus one fails" test the consumer needed could not be written against a bound that also charged for
    the command string and the headers. A field-level schema found by walking the payload's schema was
    rejected too: it would have made the bound a fact about the group's shape rather than the operation's
    own declaration, and a payload with two candidate byte fields would have left the walker guessing
    which one the bound was for, where naming the field leaves nothing to guess. Raising the envelope
    limit instead of adding a bulk path was rejected on a measurement, not a preference: one 12 MiB
    structured clone stalls the port outright, which is the failure the 256 KiB limit exists to prevent,
    so widening it for everyone would have traded a declared, bounded cost for an undeclared, unbounded
    one. A transferred `MessagePort` or a stream through the preload was rejected on the same architectural
    ground every renderer connection already stands on: the port stays in preload by design, and
    `contextBridge` copies rather than transfers, so a bulk request travels the one channel every other
    request already does, in slices sized to fit it. Cost if wrong: an operation with two bulk-shaped
    byte fields declares one, and the other keeps the ordinary 256 KiB limit with no way to widen it short
    of a second operation.

    Two defects surfaced while proving this, both in how a test must be written against it rather than in
    what ships. An in-process `pair()` delivers synchronously, so a test that means to interrupt a caller
    between two parts must withhold the owner's packets first — an unheld acknowledgment resumes the
    sending fiber before the test's next turn, and the request is already delivered by the time the
    interrupt runs, so the test would silently interrupt a request that had already completed. And
    `clientProtocol`'s failure path must fail every pending part wait before it runs `onFailure`, because
    `onFailure` evicts the shared client and closing that client's scope interrupts the caller first: done
    in the other order, the caller sees its own interruption instead of the typed failure the connection
    loss was supposed to deliver. A third, found in the final review, is that the wait must cover the
    whole span in which the owner cannot have seen the request, not only the part loop: a second bulk send
    queued behind the first has sent nothing at all, which is the strongest form of "not delivered", and
    it had no wait registered, so it resolved as a bare interruption.

    **The bound counted bytes and nothing counted parts.** The first version's allowance was the field's
    bound plus one envelope, checked against the bytes an assembly had accumulated — a limit a part
    carrying zero bytes passes however many times it is sent. A peer sent two million empty non-final
    parts against a 4 KiB bound: every one was acknowledged, the connection stayed open, and the owner's
    retained heap climbed from 42.1 to 263.2 MiB with no ceiling in sight, about 116 bytes per part. One
    byte per part only moved the wall to 266 240 parts. Any peer of an owner that declared a single bulk
    operation could spend main's memory this way. The fix is a floor on a non-final part, 16 KiB, shared
    by the owner that refuses one below it and the client that stops halving a slice there: it bounds the
    _count_, which is the quantity the byte allowance never constrained, and an assembly now holds at most
    `ceil((maxBytes + 256 KiB) / 16 KiB) + 1` parts. A floor is safe precisely because an honest part is
    never small — a slice starts at 131072 bytes and is halved only when a part that size does not fit one
    envelope, which would take more than 128 KiB of overhead from a request id and a tag — and the final
    part, being the tail, keeps no floor at all. The lesson generalizes past this transport: a resource
    bound written over one dimension of a message bounds only that dimension, and a peer picks whichever
    other dimension is free.

28. **`Shell.Policy` grants URLs by match pattern, and the shell allowlists what a pattern may say.** The
    first consumer opens job listings on arbitrary sites, so an origin allowlist is impossible; it needs
    every `http` and `https` URL, plus one exact support `mailto:` recipient, `support@jobwright.io`.
    `Shell.Policy` gains `WebRequest.Pattern`, the Chromium match pattern `Navigation.Rules` already
    accepts, and the spelling for "any http or https URL" is the pattern whose scheme and host are both
    `*` and whose path is `/*` — the literal `*://*/*` is safe to write here, in this spec's Markdown; the
    JSDoc `*/` hazard recorded below is a source-comment problem, not a prose one. One vocabulary for
    "which URLs" across the library, and one validator, was preferred over adding a new
    `{ kind: "scheme" }` rule beside `UrlRule.Origin`, `UrlRule.Document`, and `Mailto`.

    The allowlist sits on top of the pattern's own syntax: a shell pattern's scheme must be `*`, `http`,
    `https`, or a scheme `App.run` registers as standard; `<all_urls>` is refused before anything else
    runs, and a value with no colon at all is refused explicitly, rather than sliced with an `indexOf`
    call that would silently return `-1`. Every refusal is a thrown `TypeError` inside
    `ShellPolicy.compile`, and `ShellPolicy.operations` turns it into a `SewedError` of code `Protocol`
    while the Layer builds — one path the native Layer and the testing Layer both go through, so a bad
    policy fails before the first call rather than on it. Before any rule runs at all, `openExternal`
    refuses a URL carrying a username or a password, whatever kind of rule would otherwise have allowed
    it: the core receives the parsed `url.href`, never the raw string a caller wrote, and
    `https://trusted@evil.example/` reads as a login prompt for `trusted`, so the core never runs for it.
    That the href is the parsed form is worth stating rather than assuming: the parser strips tabs and
    newlines from a URL before anything matches it, and `http://0x7f.1/` is handed on as
    `http://127.0.0.1/`, so a rule matches the address the system will actually visit rather than the
    spelling that reached the call.

    `*` in a pattern's scheme means exactly `http:` and `https:`. `javascript:`, `data:`, `mailto:`,
    `ftp:`, and the scheme-wrapping forms such as `blob:https://example.com/x` and
    `filesystem:https://example.com/x` are not granted by it, because a wrapped URL's own protocol is the
    wrapper, never the scheme it wraps. Ports and IPv4 literals match exactly as the pattern says.

    **The `file` lesson is the important part.** The first version of this rule also accepted `file` as a
    pattern scheme, and review found that a pattern over `file:///tmp/` with a trailing wildcard granted
    `file:///tmp/..%2f..%2fetc/passwd`: the WHATWG URL parser normalizes a literal `..` in a path, but it
    leaves a percent-encoded separator such as `%2f` untouched, and the operating system's own handler
    decodes it. `file` was removed from the pattern schemes rather than filtered, because a filter for the
    encoded form is a denylist, and entry 6 above already records that a denylist was tried three times
    and leaked each time on the certificate matcher, before an allowlist closed the class for good. Local
    files keep the tools that do real containment instead: `openPath` and `showItemInFolder`, checked
    against a configured root, and an exact `document` rule, which still grants one specific `file:` URL,
    because it compares the whole URL for equality and has no wildcard to traverse. The cost of the
    mistake: `file` had been added to the pattern schemes with no consumer ever asking for it.

    The rule the guide now states from this: a pattern's path is matched against the URL exactly as
    written, with no percent-decoding, so the host — not the path — is the boundary a grant can actually
    keep.

    Two gaps remain, known rather than closed. No fixture drives the real native `shell.openExternal` with
    a URL the policy allows, because doing so would open a browser during unattended verification, so the
    positive case is proven by the unit suite alone. And the generated `docs/reference.md` cannot carry
    the literal pattern `*://*/*` inside `Shell.Policy`'s own doc comment, because a JSDoc block comment
    closes on the first `*/` it contains; the source doc comment spells the pattern out longhand instead —
    "a wildcard scheme, host, and path — `*`, `*`, `/*`" — and this guide carries the compact form the
    source cannot. The lesson in one sentence: a match pattern written inside a block comment closes the
    comment, and it breaks the build rather than any test.

29. **A capability is served over the wire for a test in one call, and the handlers a host takes have a
    name.** The first consumer has nine capabilities of its own and a host for each, and every one of its tests wants
    the same thing: run this effect while this host serves the capability over the real schema and the
    real wire. Doing that took `Effect.scoped`, `Capability.client`, `Layer.provide`, `Testing.layer`, and
    the knowledge that a capability carries its own `slot` — `bulk-types.ts`'s own fixture, before this
    change, built exactly that composition by hand, writing the handler once for `Capability.fromHandlers`
    and a second time inside the `Testing.layer` call wrapped around `Capability.client(Attachments)`.
    Worse, the handlers type itself had no name a caller could write down: `HandlerLayer` lived in
    `internal/HandlerLayer.ts`, so a function that wanted to take "the value a host is" as a parameter had
    no cast-free spelling for it short of an instantiation expression over `Testing.layer`'s own parameter,
    and so could not take a host as a parameter at all without reaching into an internal module.

    `Testing.client(capability, handlers, options?)` is `Capability.client(capability)` provided with
    `Testing.layer(capability.slot, handlers, options)`. `Capability.Handlers<Rpcs, E, R>` is the public
    name for the union a host already was — a bare Layer of the protocol's handlers, or a function of
    `implement` returning one — and `Testing.layer` widened its own `handlers` parameter from a bare Layer
    to that same union, so one host value now serves `Capability.fromHandlers`, `Testing.client`, and
    `Testing.layer` alike. No separate helper type for a capability's `Rpcs` was added, since Effect's own
    `RpcGroup.Rpcs<typeof Protocol>` reaches the same type and is short enough to write at a call site, as
    `testing-types.ts`'s `takesHost` does.

    This corrects a pit of success rather than adding a feature. `Capability.fromHandlers` is the short,
    obvious spelling for "test my host," and it dispatches in process with no connection and no encoding,
    so a host whose own values the wire would refuse passes every test written against it — the consumer's
    first host tests did exactly that. The testing guide now says which Layer proves what: in process —
    `Capability.fromHandlers`, the memory Layers — proves behaviour, and nothing is encoded; over the wire
    — `Testing.client`, `Testing.layer` — proves the host's own values encode, over the real schema and
    transport, and is where a transport bound such as `Binary.bulk`'s applies. A test in the suite hands
    one lying host — one whose handler returns a value its own success schema refuses — to both:
    `Capability.fromHandlers` lets it through, because nothing decodes it; `Testing.client` fails it,
    because the wire does.

    Cost if wrong: before the widening, `Testing.layer`'s own signature accepted only a bare handlers
    Layer, so the shorter callback form of a host — `(implement) => implement({ … })` — was refused at
    `Testing.layer` even though the identical value was accepted one call away, at `Capability.fromHandlers`.

30. **Bytes are recognized by what they are rather than by which realm made them, and re-viewed into
    the packer's own realm before MessagePack sees them.** `internal/Bytes.ts` holds both halves:
    `isBytes(value)` is
    `ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === "[object Uint8Array]"`,
    and `here(bytes)` is a view of the same memory made by this realm, which returns the input
    itself when this realm already made it. `instanceof` asks which realm built an
    object, and at a boundary that is the wrong question: Effect's `Schema.Uint8Array` is
    `instanceOf(globalThis.Uint8Array)`, so `Binary.Bytes` refused bytes that were bytes. The
    predicate reads two internal slots, so an object with a spoofed `Symbol.toStringTag` and a
    `Proxy` over real bytes both fail it while a Node `Buffer` passes; `constructor.name` was refused
    for exactly that reason, since it answers `Buffer`.

    The reproduction came first and changed the diagnosis. The consumer's account, and the plan
    written from it, blamed a test runner that swaps the global: bytes MessagePack returns in Node's
    realm, checked against a jsdom `Uint8Array`. Measured under real vitest and jsdom, in a scratch
    package that linked this repository's own build, `globalThis.Uint8Array` is not replaced at all —
    not under forks, not under threads, not under either vm pool. The foreign value is what jsdom's
    own `TextEncoder` returns: a `Uint8Array` jsdom's realm made, whose `toString` tag is still
    `[object Uint8Array]` and whose `ArrayBuffer.isView` is still true, differing only in its
    constructor. So the failing side is the one a renderer writes — text turned into bytes — and it
    fails on encode, before anything is sent. Of three cases, a streamed byte field failed with the
    consumer's own reported `Expected Uint8Array`; a 1 MiB bulk field and a small byte field each
    failed their client's own payload encode with nothing on the wire, and packing the 1 MiB field
    raw threw `Object is too large to serialize with fast 16-bit map size`, the packer writing a
    million-entry map where the transport expected `bin`. All three pass now, and their packed frames
    start `0xc4`, `0xc5` and `0xc6`.

    `here` therefore lives on `Binary.Bytes`'s own encode side, as a transformation whose decoded and
    encoded types are both `Uint8Array`, rather than in a pass over whole messages. That is the one
    gate every byte field crosses: `RpcSerialization.json.codecFor` is literally `Schema.toCodecJson`,
    so a payload, a success value, a stream chunk and an error field all lower through this schema
    before the envelope reaches the packer. The `toCodecJson: () => undefined` annotation that keeps a
    byte field raw rather than base64 survives the transformation, proven by running the real codec
    rather than by reading its AST, and bytes this realm already made come back by identity, so an
    ordinary send allocates nothing. Two further places ask the predicate directly: the transport's
    `parse`, the single point where a whole packet enters the unpacker and the only one that can be
    handed a packet another realm deserialized, and `bulkField`, belt to the schema's braces. A
    re-view on the send side of a request part was rejected as provably dead code, since a part is a
    slice of this module's own `encodeBinary` output; that invariant lives in a comment, which is the
    weakest thing in this entry.

    The widening was reachable only after two guards stopped shadowing it. The worker relay and the
    main bridge each refused a message with `!(message instanceof Uint8Array)` before the decode ran,
    so both closed a connection over a packet the transport beneath them would have read. A guard in
    front of a decode must not decide the protocol.

    Naming the composed schema carries a trap worth stating beside it. `Binary.Bytes` prints as a
    `decodeTo` over a declaration, and roughly a dozen public schemas built on it inherited six lines
    of type each. Shortening that with `interface Bytes extends Schema.Codec<Uint8Array, Uint8Array>`
    emits exactly as intended and silently removes payload type checking: `Schema.Codec` carries the
    type, the encoded type and the two service parameters, and drops the constructor-side parameters
    `Rpc.PayloadConstructor` reads, so a string is accepted where a byte field is declared. No test
    failed; one `@ts-expect-error` stopped biting, which is the only reason it was caught. The name
    ships over the precise type instead, and `Schema.decodeTo<` went from twelve occurrences in the
    generated reference to one.

    Cost if wrong: the predicate costs about 62 ns per accepting call against about 4 ns for
    `instanceof`, measured over five million calls, and about 4 ns when `ArrayBuffer.isView`
    short-circuits a rejection — a boundary price, which is why the comment on it says it does not
    belong in a loop over bytes or over parts. A detached foreign view makes `here` throw a bare
    `TypeError` rather than failing as a schema issue; that is parked, since reaching it takes a
    consumer transferring its own `ArrayBuffer` and then handing Sewed the stale view.

    What proves it: a predicate suite driving foreign values built with `node:vm`; a relay test that
    feeds a real packet as a foreign view through the real connection server and fails by timing out
    without the fix; the byte round trips in the binary and bulk suites; a permanent test that the
    structural codec still hands a byte field on as bytes and not as base64; and the vitest harness
    itself, six cases of six passing after against three of six before.

31. **A capability's operations and its handler record have public names — `Capability.Client<C>` and
    `Capability.Implementation<C, R>` — because Effect's `RpcGroup.HandlersFrom` types every
    handler's requirement as `any` and `Testing.host` does not.** The first consumer's nine hosts each
    build their handlers through
    `type Handlers<P> = P extends RpcGroup.RpcGroup<infer R> ? RpcGroup.HandlersFrom<R> : never`,
    spread a `Partial` of that over defaults into `toLayer`, and hand the result to `Testing.host`,
    whose requirement then comes out `any` — which reads like the testing helper erasing what a
    caller must discharge. It is not. `Rpc.ToHandlerFn<Current, R = any>` defaults its requirement
    to `any`, `HandlersFrom` leaks that default into every member, a record annotated with it makes
    `toLayer` extract `R = any`, and `any | MainContext | Scope` collapses to `any`.
    `Testing.host`'s own emitted declaration is `Effect<Owner<Rpcs>, E, R | MainContext | Scope>`,
    and every call site in this repository's suite infers a concrete `R`.

    The indictment is pinned in a contract file rather than argued.
    `type IsAny<T> = 0 extends 1 & T ? true : false` holds only for `any`, and never distributes,
    because the checked type is the literal `0` rather than a naked parameter;
    `IsAny<Effect.Services<typeof thatHost>> = true` compiles with no diagnostic at all. A second
    line assigns the same host to `Effect<unknown, unknown, never>`,
    which under this repository's `exactOptionalPropertyTypes` does not silently compile but fails
    naming the leak outright — `Type 'any' is not assignable to type 'never'`. The same fact is
    therefore pinned from both sides, and stays pinned if Effect ever changes it.

    Sewed's part is the type the consumer lacked. `Implementation<C, R>` is a capability's handler
    record carrying the requirement its handlers actually share, so a host built from it over
    `toLayer` has a requirement a caller can discharge; `Client<C>` is what `yield* capability`
    answers, named so a helper can take it as a parameter.

    The bound they take is not the obvious one, and the obvious one does not work.
    `C extends Capability<Rpc.Any, string>` fails for every real capability, with TS2344 at a
    constraint site and TS1360 under `satisfies`: `RpcGroup<in out R>` declares its parameter
    invariant, and several of its own methods pattern-match `R` against the six-parameter
    `Rpc<Tag, Payload, Success, Error, Middleware, Requires>` in their return types, which the
    deliberately loose `Rpc.Any` does not match, so those conditionals take their `never` branch and
    the two instantiations are compared and found incompatible. Dropping the bound is worse rather than better: the unconstrained conditional
    resolves silently to `never`, and `Operations<never>` has no members at all, so a caller gets an
    empty object type and no error anywhere. What ships is a structural bound naming exactly what the
    types read — a `key`, and a `protocol` whose `requests` is a map of `Rpc.Any` — and a two-step
    extraction that reads the `protocol` field with an unconstrained `infer` and hands it to Effect's
    own `RpcGroup.Rpcs`, which unifies one instantiation rather than comparing two. The `key` is read
    by nothing; it is there so that a shape which is not a capability fails loudly with a missing
    property rather than collapsing to an empty type, which is this wave's whole theme.

    Cost if wrong: the bound is duck-typed, so any object carrying a `key` and a protocol-shaped
    `requests` map satisfies it. That is inert — `RpcGroup.Rpcs` needs the full branded interface, so
    a fake resolves to `never` rather than to a wrong record.

    What proves it: `Client` and `Operations<RpcGroup.Rpcs<typeof Protocol>>` assign to each other
    both ways for a real capability; the consumer's exact composition pins `IsAny` false and an exact
    `MainContext | Scope`, and carries a supplied requirement through; and three `@ts-expect-error`
    directives — a handler of the wrong payload type, a missing operation in a non-`Partial` record,
    and a shape with no `key` — were each stripped, read, and restored.

32. **`App.run` fails `Startup` when it is asked to declare after Electron is ready, and a directory a
    declaration names exists by the time the program starts.** Too late is otherwise the quietest
    failure an entry has: probed, only a privileged-scheme registration throws on its own once
    Electron is ready, while a command line switch, a path, and an app user model id all apply
    silently and do nothing. The walker now takes `isReady` through its options and refuses a
    non-empty list before applying anything, naming in its message the entry shape that would have
    worked. An empty list after readiness is allowed, because it declares nothing.

    The rule the guide states is about entry shapes rather than about an API. An ES-module entry's
    top-level `await` — including one inside a module it only statically imports, evaluated as part of
    the same graph — holds Electron's `ready` until the entry finishes evaluating. An `async function`
    invoked without an entry-level `await` on it does not, however many awaits it contains internally;
    neither does a CommonJS entry, nor a dynamic `import()`. So no "hold readiness" API was added and
    no `() => Promise<Declaration>` entry: the top-level await is the hold, and nothing else is. Two
    of this repository's own playground fixtures turned out to have a non-holding shape and had to be
    restructured before their verifiers passed again, which is the most direct evidence available that
    the refusal catches something real.

    "Declared, therefore present" is the second half. `Paths.declare` and the crash reporter's
    declaration create every directory they declare, recursively and synchronously, before setting it;
    `exe` and `module` name files and are never created. The probe behind that is worth stating,
    because the consumer reported a bare `ENOENT` and the obvious guess about it was wrong. On
    Electron 44.3.0 on Linux, `app.setPath` to a path with three missing parent levels never throws,
    for `sessionData`, `userData`, `logs` and `crashDumps` alike, while a relative path always
    throws `Path must be absolute`, which is what says `setPath` is not simply lenient about
    everything. By the time the process reaches readiness with no window ever opened, Chromium has
    created `sessionData` and `userData` itself as part of its own start-up, and has touched
    neither `logs` nor `crashDumps` — so a declaration of either is where that `ENOENT` comes from.
    `crashReporter.start` creates its own directory as part of starting, so a crash reporter
    declared with only a directory was already safe on this version. Relying on that is relying on
    which of Electron's own paths happen to be created for free, which is precisely what the rule
    removes: all four are created the same way.

    Cost if wrong: a consumer who wanted a declared path to stay absent until something else created
    it has no way to say so.

    What proves it: the walker refuses with its fake natives recording no call at all, an empty list
    still applies nothing, a fake directory maker records a create for every declared name in
    declaration order and none for the two file names, and a throwing one fails `Startup` naming
    `paths` with the path in its message and sets nothing. Against real Electron, a `logs` path
    declared three levels deep exists once the program runs — asserted by the verifier from outside
    the process — and an entry that lets Electron become ready first exits 1 with the readiness
    message on stderr. Disabling the refusal turns that second check into a hang, which is how it is
    known to be load-bearing.

33. **`App.exit(code)` ends the application with exactly that code once the application scope has
    closed, and does not consult the quit decider.** Probed first, because the ordering is not
    negotiable: Electron's `app.exit(n)` fires no `before-quit`, no `will-quit` and no `quit`, and
    no further task scheduled after it runs; the turn that calls it, and the microtasks already
    queued in it, still finish (re-probed when the forced exit was added — the first probe had
    overstated this as "not the synchronous continuation"), which is why the call is the last
    statement of its turn. A finalizer that has not completed before that call never completes. And `process.exitCode` is overridden by
    `app.quit()`, so answering a code by setting the field and quitting was never available either.

    The code therefore rides the shutdown request the run loop already has, rather than becoming a
    second exit path beside it. The deferred the loop races on carries `number | undefined`, the race
    keeps whichever arrived, the listeners come off, the application scope closes with its finalizers,
    and `app.exit(code)` is the literal last statement of its branch — `app.quit()` where no code was
    given, and `app.exit(1)` after a failure is printed. Settling that deferred a second time is a
    no-op, which is what lets a parent process's later shutdown message lose to an earlier
    `App.exit(code)` without clobbering the code that already won. Settling it also answers whether
    the request won, and that answer travels back through the owner to `App.exit`: a request made
    once a shutdown is already in progress fails `Closed` rather than waiting for the scope to close.
    The final review found why waiting was wrong — a finalizer of the closing scope that called
    `App.exit` parked itself forever, the scope never closed, and the application could not be quit
    from the UI either, because the listeners were still attached and the gate approved into a
    deferred already settled. The guide now says to call `App.exit` from the program and not from a
    finalizer, and what a failing finalizer costs: the application ends with 1, as for any failure.

    It bypasses `Decidables.App.Quit` because Electron's own `app.exit` does, and because a launcher
    that must answer 0 or 1 to whatever started it cannot be vetoed by a feature's unsaved-changes
    guard. `App.quit` remains the quit a feature may refuse, and which of the two a program wants is
    chosen at the call site rather than by a decider. One schema owns validity — an integer from 0 to
    255 inclusive — and both ends read it: `App.exit` decodes before it even looks up the owner, so an
    invalid code fails `Protocol` rather than the `Closed` that answers when no application is
    running, and the owner's own `exit` refuses against the same schema and answers false, because it
    is reachable with nothing in front of it to have validated first.

    Cost if wrong: a consumer who wants the quit decider consulted calls `App.quit`, which is the call
    they would have written anyway.

    What proves it: over the Electron-free runtime, an installed `deny` quit decider is never asked
    while `exit(7)` approves with 7 and answers true, a second exit answers false, 0 and 255 are
    accepted, and 3.5, -1, 256 and `NaN` never reach the approval at all; over the loop's own shape, a
    finalizer's exit is refused and the scope still closes with the first code. Against real Electron,
    a program that registers a finalizer, installs a denying quit decider that writes its own marker
    if it ever runs, and calls `App.exit(7)` exits 7 with the decider's marker absent — and the
    finalizer's own `App.exit(2)` is refused `Closed`, which it writes as its marker. Routing that
    exit through the gate instead makes the fixture hang, which is the regression proof that the
    bypass is load-bearing; before the refusal existed, the finalizer's call hung it the same way.

34. **`App.preferredSystemLanguages()` is a plain synchronous function, not an Effect.** Probed before
    readiness, `app.getPreferredSystemLanguages()` is both safe and meaningful — `["fr"]` under
    `LANGUAGE=fr` — where `getSystemLocale()` throws and `getLocale()` answers `""`. It exists to be
    read inside a declaration thunk, which runs before any Effect does, on the way to computing a
    `--lang` switch; an Effect there would have no runtime to run in, so the shape follows the place
    it is used rather than the namespace it sits in.

    It returns the operating system's own values unchanged, including the ones that are not language
    tags: a POSIX `C` locale answers `["c"]`. Mapping one onto a Chromium `--lang` value belongs to
    the application, because the alternative is a table of locale spellings maintained against
    Chromium's and wrong in a different way on each platform.

    Cost if wrong: one function that is not an Effect in a namespace of Effects, and a consumer who
    expected to `yield*` it gets a compile error saying so.

    What proves it: a contract that it is `readonly string[]` and not yieldable, and a fixture spawned
    under `LANGUAGE=fr` whose declaration thunk reads it, declares the first value as `--lang`, and
    reads `navigator.language` back as `fr` in a renderer.

35. **A shell grant is a main-only, scoped service, never an operation: `grants.allow(path)` admits
    one absolute path for the caller's scope.** A shell policy's roots are fixed when its Layer is
    built, and the path a user has just chosen in a save dialog is not known then — the first consumer
    wants to reveal a diagnostics bundle wherever the user put it, and had no way to say so short of
    configuring a root it could not predict. A grant is a root with a lifetime: `Shell.native` and the
    testing memory Layer each provide `Shell.Grants` beside the capability, out of one policy
    instance, so the operations and the grants share a map; closing the scope removes the grant, and
    counting rather than deleting means two scopes granting the same path leave it live until both
    close.

    There is one containment rule, not two. `allowedPath` consults the configured roots and the
    granted ones through the same predicate, so a granted directory admits a file under it and refuses
    a path that escapes it exactly as a configured root does, a granted file admits only itself, and a
    relative path is refused before the map is touched. A second containment check written for grants
    was the obvious shape and was refused on the record entry 28 already sets: the traversal that took
    `file` out of the shell's pattern schemes was a containment bug, and two containment functions are
    two chances to have it again.

    Main-only holds by provision rather than by namespace, which is worth stating exactly because the
    plan asked for the opposite proof. The root entry re-exports the shell module whole, so the
    `Grants` tag is reachable from `sewed` precisely as `MainContext` is; a tag is inert, and the only
    things that build a Layer providing a live instance are the native and memory Layers, neither of
    which a renderer can reach. A contract asserting the tag unreachable from the root entry would not
    have compiled, so the finding is pinned positively instead. A renderer has no route to `allow` for
    two independent reasons: `Capability.serve` builds its dispatch strictly from the protocol's own
    request keys and the grant is not in the protocol, and `Binding.to` compares a slot's protocol with
    the owner's by object identity, so a forged group naming an `allow` operation is refused `Protocol`
    at binding time, before any dispatch, and no public API hands out the shell's protocol for a caller
    to present as its own.

    Cost if wrong: a consumer wanting a per-call path writes a two-line scope around the call.

    What proves it: the policy's own suite, over a recording core and over the memory Layer — refused,
    granted for a scope, refused again; a directory grant admitting what is under it and refusing what
    escapes it; two scopes sharing one path; a grant under one Layer instance invisible under another.
    The playground proves the lifecycle over the memory Layer rather than asking a real file manager to
    open something, which is the rule that block already followed for an allowed `openExternal`, and
    proves the forged-protocol refusal as a real runtime call rather than a compile-time claim. Making
    the grant inert in the containment check turns both green runs red.

36. **An install that names the resource type `other` makes its stage's native filter unrestricted by
    type.** Electron accepts one `webRequest` listener per event per session, so Sewed installs one
    over the union of a stage's filters and narrows per install itself. The union used to strip
    `"other"` out of the types it emitted and keep the rest, which left a fail-open found here rather
    than reported: with one install for `types: ["other"]` and another for `types: ["image"]`, Electron
    was handed `{ urls, types: ["image"] }`, a request Chromium labels `other` — a
    `<link rel="prefetch">` is one — never reached Sewed at all, and the decider that existed to see
    it was silently never consulted. It bites only when every install on a stage names types and one
    of them names `other`, which is why nothing caught it earlier.

    The strip itself is necessary: probed on Electron 44.3.0, a native `types` list containing
    `"other"` throws `TypeError: Invalid type other`. The same probe established the rest of the
    shape — an empty list, `undefined` and no `types` key alike deliver every type, and a non-empty
    valid list genuinely restricts — and that is what makes the fix the only sound one. Electron cannot
    express `other`, so once any install on a stage asks for it, the only native filter that does not
    starve that install is every type, and the per-install matcher, which already knew `other`, does
    the narrowing. "Every type" is spelled by omitting `types` entirely and never by an empty array,
    although Electron treats the two alike, because one of them says what it means.

    The union moved into the Electron-free request-stages module as a no-behaviour-change refactor
    first, so the unit suite could pin it: the module that installs the listener imports Electron for a
    value and cannot be imported by a Node test. The same function computes the filter for a session's
    observation taps, so the identical fail-open on the observation side closed with it, at no extra
    code.

    Cost if wrong: a stage carrying an `other` install pays for delivery of every type to main, where
    an event no install selects resolves `Pass` before its body is assembled.

    What proves it: the union's own cases, with the pre-fix behaviour recorded by genuinely reverting
    the two lines and watching three of them fail; a behavioural test with an `other`-only decider and
    an `image`-only decider both installed, each consulted for its own event and neither for the
    other's; and, on one real session, a page whose prefetch the server never receives while its image
    loads. The same fixture pins the neighbouring fact an Electron upgrade could regress silently:
    `<all_urls>` delivers a WebSocket handshake to a request decider, which can block it — the socket
    closes 1006 and the server never sees the upgrade — while `*://*/*` is http and https only, and is
    the spelling a rule meant to be total must not use.

37. **A registration Electron refuses fails by itself and leaves every other decider on its stage
    installed, restored positively rather than assumed intact.** The first version rolled the refused
    install out of its own bookkeeping and stopped there, on the assumption that Electron validates a
    filter before it swaps the session's single listener. That assumption had been observed for exactly
    one refusal, the `other` type above, and it does not generalize. Probed across three hooks and
    twelve filters — thirty-six cases, each with a working first listener confirmed at the server
    before the second registration was attempted — four filters throw, and three of those four had
    already discarded the previous listener by the time they did.

    Two of them are reachable through Sewed's own public API, because its pattern compiler accepts
    them: `custom://host/*`, an unregistered scheme, and `https://example.com:99999/*`, a port out of
    range. One feature installing either on a stage where another feature already had a working decider
    silently disabled that other decider. So this is a fail-open that shipped, not a defensive tidy-up.
    The acquire path now re-registers the surviving installs unconditionally, whatever Electron's
    ordering turns out to be for a given refusal; if that restore itself throws, the failure is logged
    and the caller still receives the original error, because a recovery must not replace the
    diagnosis.

    The observation path was worse, and had been missed by the same reasoning that missed this: it
    never rolled a refused tap back at all, so a filter Electron had refused once stayed in the union
    and poisoned every later reinstall — a second, entirely valid observer installed afterwards never
    registered and never received an event. That is the specific claim the real-Electron check pins,
    and removing the rollback reproduces it deterministically.

    Both release finalizers are guarded too, swallowing and logging, because a finalizer runs inside
    `Effect.sync` and a throw there is a defect. The guard is defensive by an exact argument rather
    than a loose one: every url pattern and type in a narrowed filter was validated by an earlier
    successful registration, and narrowing cannot reintroduce either refusal cause — a literal
    `"other"` never reaches Electron, and removing an install drops patterns rather than inventing one.
    The narrowed filter object itself need not have been sent verbatim before, since removing the one
    install that named `other` turns an unrestricted filter into a typed one, which is why the claim is
    about its parts rather than about the object.

    A registration Electron refuses now fails `Native` on both paths, where the observation side used
    to answer `Protocol` for the same event; a filter Sewed's own schema refuses still fails
    `Protocol`, and the two are told apart by where the throw happens rather than by inspecting it.

    Cost if wrong: one redundant registration on a failure path.

    What proves it: the fake session's `refuse` knob drives a refused registration through the
    acquire path's rollback and restore, a double failure where the restore's own re-registration is
    refused too, a release whose reinstall is refused, and the observation path's own refusal, all
    with no Electron at all, so the restore no longer rests on the playground's two real-Electron
    checks alone.

    Known and left open: Sewed's pattern validation and Electron's disagree in both directions on this
    version. Sewed accepts the two patterns above that Electron refuses; both accept a space inside a
    hostname; both refuse a double-wildcard subdomain and an empty host. Refusing at Sewed's boundary
    what Electron will refuse at registration, so a consumer learns at decode, is queued rather than
    done.

38. **`App.appPath()` and `App.defaultPath(name)` are plain functions beside
    `App.preferredSystemLanguages`, not Effects.** Probed on Electron 44.3.0/Linux: before `ready`,
    `app.getAppPath()` and `app.getPath(name)` answer for every `PathName` Sewed declares except
    `recent`, which is Windows-only and throws "Failed to get 'recent' path"; with nothing declared,
    every pre-ready answer equals the after-ready answer for the same name; and a pre-ready
    `setPath("userData", X)` is reflected at once and moves `sessionData`, `logs`, and `crashDumps`
    under `X` with it. So `defaultPath` names exactly what Electron uses with nothing declared,
    which is the entry's own question before `App.run`; once a declaration has applied, the same
    reader keeps answering that default, while `App.path` inside the program is the reader that
    reflects the declaration. An invalid name throws `Protocol`; a name Electron cannot answer on
    this platform throws `Native`. A throw inside a declaration thunk already fails `Startup` naming
    the thunk's position, which is why neither reader needs a matching convention of its own.

    Cost if wrong: two functions that are not Effects in a namespace of Effects, beside one that
    already is.

    What proves it: a contract pins both as plain `string`-typed and not yieldable, and one more
    `@ts-expect-error` for an invalid name literal. Against real Electron, the playground's fixture
    records `App.appPath()` and `App.defaultPath` for five path names in the entry's first pass,
    before `App.run`, then compares each against `App.path` inside the program — equal for every
    name except the one a declaration moved — and asserts that `App.defaultPath("recent")` throws
    `Native` before readiness.

39. **`App.showErrorBox({ title, content })` is a plain synchronous function; `App.run` never shows
    one itself.** Probed on Electron 44.3.0/Linux: before readiness the call prints `title` and
    `content` to stderr and returns at once, with or without a display, because GTK is not up yet;
    after readiness with a display it shows a blocking native modal that does not return until
    dismissed. Electron documents a native box before readiness on Windows and macOS too, not probed
    here. It is not automatic, because a headless harness or a CI run would block on a modal nothing
    can dismiss, and because the consumer who builds a user-facing message already holds it where it
    is built — a window with something to attach a message to uses `window.dialog.message` instead.
    With it rides the print already queued: `App.run`'s failure print now names a `SewedError`'s
    code, `<code>: <message>`, on a line before `Cause.pretty`'s own cause, found with
    `Cause.findErrorOption` so a defect that is not a `SewedError` gets no code line — stderr says
    what failed even where no box can show.

    Cost if wrong: a consumer wanting an automatic box on every failure writes one `catch`.

    What proves it: `Application.ErrorBox` refuses an empty `title` or an empty `content` with
    `Protocol`. Against real Electron, the playground's dedicated fixture calls `App.showErrorBox`
    in its first pass, and the verifier's `stderrPatterns` match the title and the content on stderr
    before readiness; the too-late fixture's own `stderrPatterns` gained the failure print's code
    line, run RED against the pre-wave build and GREEN after.

40. **The Electron binary for a launcher is `resolveElectron({ cwd?, electronPath? })` from
    `@sewed/vite`: the resolution the plugin already performs, exported.** `@sewed/vite`'s own entry
    keeps `vite` a type-only import, so a Node tool that imports the resolver pays no Vite runtime
    dependency; it resolves `electron` from `cwd`'s `package.json`, defaulting `cwd` to the current
    working directory, or takes an explicit `electronPath` verbatim, and throws the plugin's own
    message naming the directory when Electron cannot be resolved there. The plugin's own call site
    now calls the exported function with the same two options rather than keeping a private copy.

    Cost if wrong: one exported function that was private.

    What proves it: `resolve-electron.test.ts` — from this repository's own `packages/vite` it
    answers an absolute path that exists on disk, from a fresh empty directory carrying its own
    `package.json` it throws naming that directory, and an explicit relative `electronPath` resolves
    against `cwd`.

41. **A forced exit is `App.terminate(code)` — a plain function with a distinct name, not an option
    of `App.exit`.** It decodes `code` against the same schema `App.exit` uses, throwing `Protocol`
    on an invalid one before anything ends, and calls Electron's `app.exit(code)`: no finalizer
    runs, no listener or decider is consulted, and nothing after the call runs. It is not
    `App.exit(code, { force })`, because that would make the one guarantee `App.exit` carries — the
    scope closed first — a flag's default; it exists for a harness whose program may hang, where a
    timeout must answer the shell even when the program's own finalizers never will.

    Its tail deviated from what was sketched, and the deviation is itself a probed fact, not a
    preference. A `throw` placed right after `app.exit(code)` to satisfy the compiler's `never` was
    tried first and hung the process: probed directly against real Electron 44.3.0/Linux,
    `app.exit(code)` does not end the process on that line — it schedules the end for once the
    calling synchronous callback returns control to the native event loop — so a throw placed
    immediately after it reaches Electron's own uncaught-exception dialog instead of the scheduled
    exit, and under X11 nothing is there to dismiss that dialog, so the process hangs.
    `process.exit(code)` replaced the throw: it is genuinely `never`-typed in `@types/node`, is not
    a throw, and forces the same code immediately if that line is ever actually reached, with
    nothing between it and `app.exit(code)`. Reprobed once landed: neither the exit code nor a child
    process is lost by adding it — a real `BrowserWindow` followed by
    `app.exit(code); process.exit(code)` leaves no orphan.

    Re-probing that call context — a post-ready event-loop callback, which is where `App.exit`'s own
    `app.exit(code)` and `App.terminate`'s `app.exit(code)` both actually run, not a synchronous
    pre-ready top-level call — also corrected entry 33's own claim about the same native call. A
    queued microtask and the rest of the calling turn still run after `app.exit()`; only a further
    task, a new timer or an I/O callback, does not get a turn. So `App.terminate`'s "nothing after
    the call" is the strongest of the two claims about `app.exit`'s aftermath in this spec, and the
    only unconditional one: `process.exit(code)` is the literal next statement, with nothing between
    it and `app.exit(code)`, and it exits synchronously the instant it runs, where entry 33's own
    claim is the narrower and correct one about `app.exit` left to run on its own.

    Cost if wrong: one function, and a harness that hangs instead of answering the shell.

    What proves it: the playground's fixture registers a finalizer that writes a marker and then
    hangs on `Effect.never`, calls `App.terminate(3)` from an external timer once the program has
    started, and the verifier confirms exit 3 with the marker absent. Routing the same call through
    `App.exit` instead is the regression proof: the fixture then times out, because `App.exit` waits
    for the scope to close and the finalizer never lets it. A contract pins the return type `never`
    and the argument type `number`.

42. **Every hook memoizes its own store on `RuntimeStore` and runs its work under the store's
    `runtime`; `RuntimeProvider` no longer subscribes, and the hooks' failure types widen to
    `E | SewedError`.** `RuntimeStore.runtime` is a self-recursive `Effect.suspend` over a
    one-shot `Deferred`: it succeeds at once when the store is ready, waits while it is
    connecting, and fails `Closed` carrying the cause once it is unavailable, short-circuiting on
    the store's own status before it ever touches the `Deferred` again once settled, so a later
    ready-to-unavailable transition is picked up at once. Every hook reads the store from
    `StatusStore` and does
    `Effect.flatMap(store.runtime, (context) => Effect.provideContext(work, context))`, memoized
    on the store itself — an object whose identity never changes across the three states — so
    `useStream` and `useResource` answer `loading` while connecting and `failure` with the
    `Closed` cause when unavailable; `useAction` answers `idle`, and its `run` starts a `running`
    invocation that proceeds once ready or fails `Closed`; `useClient` is
    `Binding.pending(slot, { context, connection })`, where `context` is
    `Effect.map(store.runtime, (c) => Context.get(c, ClientContext))` — a client built over a
    context Effect that has not resolved parks its calls until the Effect resolves, then
    dispatches; one whose context Effect fails `Closed` fails every call `Closed` with that cause;
    the client object's own identity is the same before and after. The `Runtime` context and
    `useRuntime`'s throw are deleted.

    `RuntimeProvider` is now a plain provider with no `useSyncExternalStore` of its own —
    `({ store, children }) => createElement(StatusStore.Provider, { value: store }, children)` —
    so a status change no longer re-renders the whole subtree, only the individual hooks whose own
    memoized work resolved. `mount` provides a store that is ready at once, carrying the mount's
    own context, and doing so exposed a pre-existing bug the redesign fixes as a side effect: the
    store `mount` built before this wave never carried a context at all, so `store.run` under
    `mount` always rejected `Closed`, unconditionally.

    Cost if wrong: a tree that wants to render nothing until ready still reads `useRuntimeStatus`.

    What proves it: `hooks.test.tsx`, over `react-dom/server`'s `renderToString`, renders without
    throwing under both a connecting and an unavailable store and produces byte-identical HTML
    between them, because `renderToString` never calls `useSyncExternalStore`'s `subscribe` — the
    strongest proof available that no hook is conditionally skipped, and the reason the reactive
    transition itself is pinned one layer down instead: `resource.test.ts`'s failing-runtime test
    (the factory never runs, the published cause is the `Closed` `SewedError`), a direct
    `Action.make` test, and a direct call through `useClient`'s own captured client.
    `connection.test.ts` pins `store.runtime` succeeding at once, waiting, and failing `Closed`
    with the cause; `binding.test.ts` pins `Binding.pending`'s parking, its per-call `Closed`
    failure, and its stable identity. Against a real, running tree, the playground's ungated
    runtime lane — every hook called with no gate at all — reads the same DOM node's own minted id
    and a monotonic render counter across the handshake's connecting, ready, and settled moments;
    the id never changes, so no hook ever remounted.

43. **`RuntimeStore.run(effect, { signal })` interrupts what it started, and removes its own abort
    listener once the fiber settles.** `run` forks the effect under the store's `runtime` and
    provides the resolved context once it is available; an aborted `AbortSignal` — the web's own
    cancellation handle, the one a consumer would otherwise bridge by hand — interrupts the fiber,
    so the host's own finalizers run and the returned promise rejects with the interruption
    (`Cause.squash`'s "All fibers interrupted without error"). The version this wave first landed
    registered an "abort" listener on every call and never removed it once the fiber settled on
    its own, which is the common case: a probe over five `store.run` calls on one long-lived,
    never-aborted signal — the natural shape of a component holding one `AbortController` for its
    lifetime and calling `run` repeatedly — found one dangling listener accumulating per call,
    each closing over its own already-settled fiber.

    The review that caught it found the same pattern already solved twice in this codebase, and
    the fix matches both: the handler is named and removed, unconditionally, from the fiber's own
    observer once it settles, mirroring `packages/sewed/src/internal/Protocol.ts`'s
    `removeAbortListener` and Effect's own native `RunOptions.signal`, whose built-in mechanism
    does the identical fork, listen, interrupt, and remove, and was deliberately not delegated to,
    to keep the mechanism explicit and match this codebase's own idiom for the pattern.

    Cost if wrong: none measured; an options object that only ever carries `signal` is still the
    smallest honest shape.

    What proves it: `connection.test.ts`'s interruption test — an `Effect.acquireRelease` inside a
    never-ending effect, aborted once acquisition is observed — asserts the promise rejects and
    then waits on a bounded condition for the release flag to flip, so the host's own finalizer is
    shown to have actually run, not merely inferred. The leak was demonstrated, not reasoned
    about: a probe using Node's `events.getEventListeners` counted 1, 2, 3, 4, 5 dangling
    listeners across five completed calls before the fix, and `[0, 0, 0, 0, 0]` after; a
    fake-signal test in `connection.test.ts` pins that exactly one listener is added and the same
    one removed once a call completes with no abort.

44. **A payload the client's own schema refuses fails `Protocol`, naming the operation and the
    path, before anything is sent — the mechanism is the schema constructor's own throw,
    recognized and revalidated, not `orDie` at encode.** The ruling this entry corrects cited
    Effect's `RpcClient.js:321` `Effect.orDie` on payload encode as the refusal site; probing
    rc.115 directly found that line is not reached for an ordinary Struct- or class-payload
    refusal. Instead, `rpc.payloadSchema.make(payload)` — the schema's own synchronous constructor
    — throws a bare `Error("Schema validation failed", { cause: issue })`: deferred into the
    returned Effect for an Effect-shaped operation, so it arrives as an ordinary defect only once
    that Effect runs, and thrown synchronously, before any Effect or Stream value even exists, for
    a stream-shaped one. That exact message is a documented Effect contract, not an internal
    detail — `Schema.js:573` is one of roughly eight sites in the same file that repeat it
    verbatim.

    `invoke` recognizes the throw two ways: `Schema.isSchemaError(defect)`, for a genuine
    `SchemaError` defect, and the documented message match, which — rather than trust the defect's
    own untyped `cause` — re-runs the schema's own `makeEffect(input)` on the same input to pull a
    natively typed `SchemaIssue.Issue` with no cast; a coincidental, unrelated defect that happens
    to carry the same string revalidates clean and re-escapes untouched, which is what makes the
    recognition self-verifying rather than a string match with a cast bolted on. The `orDie` path
    first cited is real too, for an encode-side transformation — a payload field whose encode
    direction can itself fail independent of whether the input decoded — and the same
    `isSchemaError` branch catches it: a field built to decode anything but always refuse on
    encode was probed directly, failed a genuine `Schema.SchemaError`, and `Effect.orDie` died
    with it. A host's own value its own success schema refuses stays a defect: the wire ships a
    handler's own die and a success-schema refusal as the identical opaque `Defect` string, with
    nothing at the client able to tell them apart, so treating either as the caller's typed
    failure would misattribute the host's own bug to the caller.

    Cost if wrong: a consumer who wanted a defect for a bad payload catches a typed error instead.

    What proves it: a handler that throws the exact coincidental message against a valid payload
    was probed and stays a defect. Both refusal sites — the constructor's throw and the
    encode-side `orDie` — were read directly in Effect's own source and driven live through
    `Testing.client`, on an Effect-shaped and a stream-shaped operation alike; a call counter on
    the host proves it never ran in either shape. `docs/api.md` and `docs/testing.md` carry the
    same sentence, matched against the same probes.

45. **`store(bindings)` from `@sewed/react/testing` is the `RuntimeStore` over in-process hosts,
    and owns only its own connection scope.** It builds `Binding.clientContext(bindings)` — made
    public for this, because `Binding.layer` hard-requires `MainContext`, which a renderer
    identity cannot supply — and `Testing.renderer`, a new Layer beside `Testing.main` binding the
    same `RendererContext` a live renderer document carries, in one scope; nothing in that path is
    genuinely asynchronous for an in-process host, so it answers `ready` at once, and `run` and
    every hook this package exports run over that context exactly as `connect` does. `close()`
    closes that one scope alone: the bindings a store receives are already built, so the store has
    no handle on whatever scope built their owner and structurally cannot release it — a host
    stays exactly where it was built, released the way any other use of it is released, by closing
    that scope, independent of the store's own `close()`. `onConnect` fires once, at construction,
    per store, not per connection and not per binding, because a store's bindings are already
    built into one shared connection scope — unlike `Testing.layer`'s own per-binding,
    per-first-use firing, which has no equivalent factory left to wrap here.

    Two packaging defects the first consumer found while adopting `resolveElectron` closed
    alongside this wave. `@sewed/vite` required `typescript` and `vite` as peers, so a Node tool
    importing only the resolver got an unmet-peer warning and both installed beside it; both are
    now optional peers, beside `electron`, and the plugin itself still needs both and still says
    so — Vite by never loading a plugin it cannot resolve, TypeScript by the plain
    "Cannot find module" its own `require.resolve` reports. A tarball's `NOTICE` named
    `THIRD_PARTY_LICENSES.md`, which only `sewed`'s own tarball actually shipped; `@sewed/react`,
    `@sewed/vite`, `@sewed/forge`, `@sewed/devtools`, and `create-sewed` now all ship a
    byte-for-byte copy, and the release check fails whenever a package's `NOTICE` names the file
    and its own copy is missing, absent from `files`, or does not match the root's copy byte for
    byte.

    Cost if wrong: one entry point.

    What proves it: five tests over a real in-process host: `store` answers `ready` at once with
    no connecting phase; `run` reaches the host for an Effect-shaped and a stream-shaped call; a
    component rendered under `RuntimeProvider` calls `useClient` unconditionally and its captured
    client reaches the real host; `close()` fails `run` and `runtime` `Closed`, while the test's
    own, separately owned host scope, closed afterward, is what actually releases the host — two
    separately attributed effects, not one conflated claim. Packaging: a scratch install against
    the packed tarball shows the unmet-peer warning and `vite`/`typescript` landing in
    `node_modules` before the fix and neither after; counting `THIRD_PARTY` entries in all five
    tarballs shows zero before and one after; the release check, run live, fails when a copy is
    removed, fails again when it is corrupted, and passes once restored.

46. **`ready` carries `httpStatus: number`, the main frame's HTTP status Electron reported for
    the committed navigation.** Probed on 44.3.0: `did-navigate` carries `httpResponseCode` and
    `httpStatusText`, 200 for a 200 document and 500 for a 500 one, and `did-finish-load` still
    fires for the 500 document — nothing before this wave told a 5xx document from a good one,
    because `navigated` only bumped a committed generation counter and discarded the event. A
    `data:` document and a `file:` document both report a synthetic 200, never 0 or null, so the
    field is always a number. `navigated` now keeps `httpResponseCode` in a closure variable set
    in the same call that sets `committed`, and `finished` reads it back only when
    `committed === generation`, the pre-existing gate unchanged — a stale `did-navigate`'s status
    can never outlive the generation it committed for, because the only write to that variable and
    to `committed` happen together, and the only read happens behind the same check that already
    guarded `ready` itself. Sewed does not turn a 5xx into `failed`: the document did load, and
    what the number means is the application's — a loader that treats 5xx as a failed load
    reloads through its own breaker.

    Cost if wrong: one number a consumer ignores.

    What proves it: `webcontents-core.test.ts` over the fake native — a `did-navigate` with
    `httpResponseCode` 500 then `did-finish-load` yields `ready` with `httpStatus: 500`; a first
    navigation committing 500, superseded by a newer one that commits and finishes at 200, settles
    `ready` at 200, the stale 500 never leaking in. The playground's `webcontents-extras-fixture.mjs`
    loads a `/five` route answering 500, a `data:` document, and a `file:` document against real
    Electron, asserting `httpStatus` 500, 200, and 200 in turn.

47. **A local document is an entry: `Renderer.local(path, importMetaUrl, { bindings })` for one
    shipped with the application, `Renderer.inline(html)` for one main writes itself.** `local`
    resolves `path` against `importMetaUrl` to a `file:` URL exactly as
    `Renderer.entry(new URL(path, importMetaUrl), { bindings })` would; the root constructor stays
    inert and node-free, and `window.webContents.load` checks that the resolved file exists before
    it configures the bridge or asks Electron to navigate, failing `Protocol` and naming the path
    when it does not — the existence check the spec's `sewed check` would have made at build time
    is instead made at load time, because `sewed check` is not part of this wave. `inline` builds
    a `data:text/html;base64,…` entry with no bindings at all: a `data:` page has an opaque origin
    and cannot load the renderer runtime, so it carries no binding keys in its type and is for a
    message with nothing behind it — a crash-loop breaker's parked page, a fatal notice — never
    for a page that offers an action, which is a `local` document bound to a capability instead,
    built the same way as any other second Vite entry (`build.rollupOptions.input`).

    A fix round closed two unguarded native throws the first review found. `fileURLToPath(entry.url)`
    ran unguarded inside `load`; an entry whose path contains an encoded slash made it throw a raw
    `TypeError [ERR_INVALID_FILE_URL_PATH]`, a `Cause.Die`, not the `Protocol` failure the ruling
    promises — wrapped in `Effect.try` now, the same shape as the existing `existsSync`-false
    branch beside it. `local`'s own `new URL(path, importMetaUrl)` ran unguarded too, and the
    review's own example for triggering it — a bare `%` in an ordinary filename,
    `"100%-crash.html"` — does not throw inside `local`'s own `new URL` on this worktree's Node
    26.7.0: the WHATWG URL parser does not validate percent-escape content inside a plain path
    segment, so `%zz`, a lone `%`, and similar pass straight through as literal characters, and
    only `decodeURIComponent`-style strict decoding would reject them. It is a real failing input
    all the same, one step later: `fileURLToPath("file:///app/100%-crash.html")` throws
    `URIError: URI malformed` on the same Node, which is exactly what the `load`-side
    `fileURLToPath` guard described above catches — the review's example was right about a throw,
    just not about which constructor throws it. What does throw inside `local` itself is a path
    beginning `//` — parsed as starting an authority component on a `file:` base — carrying an
    invalid percent-escape there, e.g. `"//%zz/crash.html"`, since host parsing is strict where
    path parsing is lenient; the fix (wrap the constructor, throw `SewedError` `Protocol`) guards
    it unconditionally regardless of which exact input reproduces the throw. Both guards were
    needed: `load`'s catches the `"100%-crash.html"`-shaped input, `local`'s the `//`-shaped one.

    Cost if wrong: two constructors over one that already worked, and one `existsSync`.

    What proves it: `renderer.test.ts` pins `local`'s URL resolution and bindings, `inline`'s
    base64 encoding and empty binding list, `inline("")` refusing `Protocol`, and — the fix round —
    `local("//%zz/crash.html", …)` refusing `Protocol` rather than letting a bare `TypeError`
    escape. The playground's `webcontents-extras-fixture.mjs` loads a fixture HTML through
    `Renderer.local`, fails `Protocol` naming a missing path with the window's state left
    untouched, loads an inline parked page, and — the fix round — fails `Protocol` for
    `Renderer.local("cra%2Fsh/index.html", …)`, a well-formed URL `fileURLToPath` itself refuses.

48. **A capture answers `{ bytes, width, height, scaleFactor }`.** Probed at
    `--force-device-scale-factor=2`: `capturePage`'s image reports `getSize()` as the pixel size
    (600×346 for a 300×173 DIP content area), its PNG carries those pixel dimensions, and the
    image's own scale factor reads 1 — so `width` and `height` are read from the native image
    itself, before it is encoded, and `scaleFactor` is derived rather than asked of the image: the
    ratio of the captured area's pixel width to its DIP width. A given `rect` fixes that DIP width
    directly, so the ratio needs no Electron at all; without one, `core` — which holds only the raw
    `WebContents`, no window or view reference, and must stay free of `electron` value imports at
    module scope so its fake-native unit test keeps running outside Electron — reaches for the
    owner window's own display scale instead, through a seam: `Owner` gains
    `displayScaleFactor: () => number`, supplied with a static `electron` import by whichever main
    module already knows how to construct that owner's `native` — `internal/WebContents.ts` for a
    window's own contents and an attached pane's, `internal/GuestView.ts` for a guest's — each
    resolving `BrowserWindow.fromWebContents(native)` and, when that finds no owner window, the
    primary display's `scaleFactor`, else the matching display's, through
    `screen.getDisplayMatching(window.getBounds()).scaleFactor`, mathematically identical to
    pixel-over-DIP-width for anything one window's compositor renders. A fix round replaced this
    wave's own first attempt — the same lookup behind a dynamic `import("electron")` inside `core`
    itself — because that made the one branch a fake native could not otherwise reach the one
    branch no unit test could exercise either; the owner-supplied seam matches the idiom `core`
    already uses for everything else it cannot construct itself (`Paths.ts`'s native, the
    registry and allowance `internal/WebContents.ts` and `internal/GuestView.ts` already pass in).
    `WebContents.Capture` is the struct's schema; both `webContents.capture` and a guest tab's own
    `capture` answer it.

    Cost if wrong: a consumer who wanted bytes alone reads one field.

    What proves it: `webcontents-core.test.ts`'s fake `capturePage` returning 2× a requested rect
    proves the `rect` branch (`scaleFactor` 2, doubled pixel dimensions); the fix round's fake
    `Owner` answers a fixed `2` from `displayScaleFactor`, and a second test proves the no-`rect`
    branch the same way, now that reaching it needs nothing Electron cannot fake. The playground
    still proves the real `BrowserWindow.fromWebContents`/`screen.getDisplayMatching` path against
    actual Electron: `verify-webcontents-extras.mjs` runs the fixture once plain and once with
    `--force-device-scale-factor=2` against the same 32×32 DIP rect, reading 1×(32×32px) and
    2×(64×64px); `verify:guest` reports a guest's own no-`rect` capture at exactly its attached DIP
    bounds times the display's scale factor.

49. **An image module: inert bitmaps and a pure compose in `sewed`, decode/resize/encode over
    `nativeImage` in `sewed/main`.** `Image.Bitmap` is BGRA, 4 bytes per pixel, row-major, exactly
    as `nativeImage.toBitmap` lays them out, checked that `bytes.byteLength === width * height * 4`;
    `Image.compose(base, layers)` copies each layer's pixels onto a copy of the base at its pixel
    offset, clipping at the edges, pure arithmetic over BGRA bytes with no Electron, no blend
    modes, no rotation, no crop — the consumer's need is one capture laid over another.
    `Image.decode`, `resize`, and `encode` are `sewed/main` Effects over `nativeImage`
    (`createFromBuffer` into `toBitmap`/`getSize`; `createFromBitmap` into `resize` into
    `toBitmap`; `createFromBitmap` into `toPNG`/`toJPEG`), each failing `Protocol` for bytes or a
    bitmap no decoder accepts and `Native` for any other Electron failure. `Image.Source` — a path
    or already-encoded bytes — is the one schema every icon door takes from now on: a window's
    `setIcon` and `setOverlayIcon` in this wave, the tray and the dock in the next, resolved
    through one main-side helper, `internal/ImageSource.ts`'s `nativeImageOf`, over
    `nativeImage.createFromPath`/`createFromBuffer`, replacing `internal/Window.ts`'s own
    bare-path-only helper. `nativeImageOf` lives in its own file rather than inside
    `internal/Image.ts`, so `main.ts`'s glob re-export of that file does not leak a cross-module
    helper into the public `Image` namespace.

    Two follow-ups from the second wave's first consumer rode along. A refused payload's
    `SewedError` now keeps the typed `SchemaIssue.Issue` as `cause` on both branches of the
    client's refusal path, and names the schema — its `title` or `identifier` annotation, read by
    walking the same `Pointer`/`Filter`/`Encoding`/`Composite`/`AnyOf` wrappers the default
    formatter itself unwraps down to the failing `InvalidType` leaf — when the formatter's own
    text does not already carry it, so a `Schema.declare` payload's generic `Expected <Declaration>`
    names which declaration refused. And `@sewed/vite` checks the consumer's resolved TypeScript
    version at run time instead of declaring `typescript` a peer at all: pnpm warns on an
    out-of-range optional peer that is already installed, so a fixed `>=7 <8` range would warn
    about whatever major version a consumer already has installed for its own reasons; `vite`
    stays the one remaining optional peer.

    Cost if wrong: one namespace with four functions and a source type.

    What proves it: `image.test.ts`, pure Node — a layer overwriting one pixel, a layer clipped at
    both edges, an empty layer list returning a distinct equal copy, a wrong-byte-length layer
    refusing `Protocol`. The playground's `verify:guest` captures the window before the guest ever
    attaches (the Electron limit above), decodes both captures, resizes the guest's own capture to
    its attached bounds times `scaleFactor`, composes it at its offset, encodes to PNG, decodes the
    result again, and samples one pixel inside the guest's area against the overlay's own bitmap.
    `testing.test.ts` refuses a titled `Schema.declare` payload over `Testing.client`, the real
    RPC-client path, and pins the message naming the schema and `error.cause !== undefined`.
    `packages/vite/test/tsc.test.ts` pins `checkTypescriptVersion` accepting `7.0.2`/`7.9.9` and
    refusing `6.0.3`/`8.0.0`/a missing version, and a scratch install against a packed tarball
    shows pnpm's unmet-peer warning before the fix and gone after, with `typescript@6.0.3`
    installed either way.

50. **The document's one runtime store needed a structural fix beyond its first cut: a stand-in's
    own restore closure, not a single previous-value slot.** The review reproduced two ways one
    `documentStore` slot broke the one-store invariant, both from `standIn`'s restore closure doing
    `documentStore = previous` unconditionally, with no check that the slot still held what it put
    there. Closing an _outer_ testing store while an _inner_ one was still open orphaned the inner
    store at once, since `document()` fell back to whatever predated the outer store; the inner
    store's own later close then handed `document()` back the outer store object — already closed,
    `document()` left pointing at a dead store. And a `connect()` landing while a testing store
    still stood in overwrote its own just-registered connection synchronously, inside `connect()`
    itself: `registerDocumentStore` sets the slot and only then closes the previous occupant, and
    when that occupant is a stand-in still open, its own restore closure runs on that same line and
    hands the slot straight back to whatever predated it. The fix is structural, not a guard on the
    single slot: `internal/Connection.ts` now keeps `connectedStore`, written only by `connect()`,
    beside `standIns`, an array `standIn(store)` pushes onto, whose returned closure removes exactly
    that entry by identity — `indexOf`, then `splice` — wherever it now sits, a no-op if it is
    already gone. `document()` answers the last entry in `standIns`, else `connectedStore`, else the
    static `unavailable` store. This also closes a residual gap the review's own alternative — an
    identity guard on the single slot — would still have left: a fully out-of-order, multi-level
    unwind now restores exactly to what stood before either store opened, hand-traced and confirmed
    by reversing the review's own two reproductions.

    Cost if wrong: a dead store handed back silently, or a fresh connection lost to a stale restore.

    What proves it: `document.test.tsx` grew from six tests to nine. The three new ones are the
    review's own two reproductions, now passing, plus a double-close-is-a-no-op case; the six
    original tests — before any connect, after connect, a second connect replacing and closing the
    first, a stand-in registering and restoring, two stand-ins unwinding in order, and
    `RuntimeProvider` with no `store` prop — are unaffected. `packages/react/README.md` and
    `docs/api.md` were corrected to say stand-ins may close in any order, not that they unwind in a
    fixed one.

51. **Every Electron role but `shareMenu` is a leaf role, and a submenu may carry one — the union
    widened from 24 to 47, and the contribution model stays the redesign's own step.** Probed on
    Linux: `Menu.buildFromTemplate` builds each of the 23 newly added roles without throwing,
    carrying Electron's own label — `services` "Services", `hide` "Hide Electron", `hideOthers`
    "Hide Others", `unhide` "Show All", `front` "Bring All to Front", `zoom` "Zoom", `help` "Help" —
    and the five tab roles with an empty label, since they are macOS-only and inert elsewhere; a
    submenu carrying `help` or `window` keeps its own custom items beside whatever the platform
    adds. `services` and `recentDocuments` are filled entirely by macOS, so `Menu.ApplicationSubmenu`
    splits into a union — an open submenu (`role?: "help" | "window"`, a nonempty items list,
    unchanged) and a filled one (`role: "services" | "recentDocuments"`, an items list refused
    nonempty at decode, `Protocol`) — because Electron silently keeps custom items on Linux the OS
    would otherwise drop there, a platform difference this wave probed and closed rather than
    assumed. `internal/Menu.ts`'s submenu arm forwards `role` the same way it already forwards
    `accelerator`, an `"role" in item` check, since `Menu.Item`'s own context-menu `Submenu` carries
    no role field at all. Naming every role settles only part of the redesign's own menu step: the
    contribution model — features contributing items to a library-owned skeleton with named anchors
    — is its own next step, not this wave, and `App.menu`'s whole-template replace stays the
    composition mechanism a consumer writes against until it lands.

    Cost if wrong: a role a platform ignores builds as an inert item carrying Electron's own label.

    What proves it: `test/types.ts` pins the seven roles Jobwright named as leaf items, a `help`
    submenu with items, a `services` submenu with none, and refuses (`@ts-expect-error`) a submenu
    role outside the four, a leaf role at the top level, and an empty role-less submenu — all
    confirmed by a clean `tsc`. `menu.test.ts`, new, decodes all 47 roles as leaves, refuses
    `shareMenu`, and proves the submenu-role accept/refuse rules at runtime, over the inert schema
    alone, no Electron needed. The playground's `application-menus` fixture builds a menu with the
    seven named roles and a `help`-role submenu, replaces it against real Electron, and records each
    item's own label.

52. **`App.dock.setIcon(image)` takes `Image.Source`, over wave 3's own helper, and fails before the
    image is even touched on a platform with no dock.** `dockOf()` is the callee of the call
    expression `dockOf().setIcon(nativeImageOf(image, "Dock icon"))`, so by ordinary evaluation
    order it runs — and can throw `Native` — before its argument is ever evaluated: a bad image
    source never reaches `nativeImageOf` on a platform where `app.dock` is undefined, exactly as
    every other dock operation in `App.ts` already behaves. `nativeImageOf` itself, wave 3's helper,
    still fails `Protocol` for a source no decoder reads back non-empty, the same `operation`/`catch`
    idiom the rest of the file uses. No Node test reaches `app.dock` at all — it is only real through
    Electron — so the type contract (`app-extras-types.ts`: a path and bytes both typecheck, a
    number is refused) carries the compile-time proof and the playground carries the rest.

    Cost if wrong: one function.

    What proves it: the playground's `app-extras` fixture pins `App.dock.setIcon("icon.png")`
    failing `Native` on Linux, alongside the dock's other Linux-only failures, and — since the
    plan's own file list also asked for a window `setIcon` from bytes — a small BGRA bitmap encoded
    to real PNG bytes through `Image.encode` and set on a live window without throwing (a hand-typed
    base64 literal proved undecodable by `nativeImage.createFromBuffer` and was replaced with an
    in-process encode instead).

53. **`Session.Permission`'s event carries `mediaTypes`, proven live only along the check handler's
    own path: Linux has no media devices, so the request handler's array never ran here.** Probed:
    the check handler is consulted once per requested type, reporting its own singular
    `details.mediaType`; Electron types the request handler's own details as carrying a plural
    `mediaTypes: Array<"video" | "audio">`, which this development machine cannot reach, since
    `getUserMedia` never resolves or rejects under Xvfb with no camera or microphone attached.
    `internal/Session.ts`'s `allowed` used to type every handler's `details` at the check handler's
    own narrower shape, discarding the request handler's real field; it now takes the full real
    union (`PermissionCheckHandlerHandlerDetails | PermissionRequest | FilesystemPermissionRequest |
MediaAccessPermissionRequest | OpenExternalPermissionRequest`) and a new `mediaTypesOf` reads
    whichever field the handler actually has, by `in`-narrowing — the request handler's array where
    Electron's typing carries one, else the check handler's singular type as a one-element list,
    else empty for every other permission and for a check whose `mediaType` is `unknown` or absent,
    including a device check, which is never a media request. `Permission.Rule` gains an optional
    `mediaTypes`, meaningful only beside a rule that already names `media`, refused `Protocol` at
    decode otherwise so the field cannot look like it narrows something it never reaches; a rule
    with `mediaTypes` set grants a request only when every type asked for is among them, and a rule
    without it still grants any media request, as before.

    Cost if wrong: an empty list on every event that is not a media request.

    What proves it: `decidables-session.test.ts`'s fake session, extended to actually drive
    `setPermissionRequestHandler` rather than stub it, gains four tests — the request handler's
    array reaching the decider, the check handler's singular type becoming a one-element list, and
    `unknown` or a non-media permission or a device check all giving `[]`. `policies.test.ts` gains
    three — narrowing to what was requested, the no-`mediaTypes` default still granting anything,
    and the decode refusal. The playground's `sessions` fixture drives the check and request
    handlers directly, the same way its own pre-existing hard-gate checks already do, since no real
    `getUserMedia` path resolves here — pinning the check handler's one-element path against real
    Electron, not the request handler's array.

54. **`Dialog.SaveOptions.properties` and `Dialog.OpenOptions.properties` are Electron's own flags,
    forwarded verbatim — and the playground's own proof that unrecognized options are dropped had
    to be rebuilt, because one of them stopped being unrecognized.** Save takes `showHiddenFiles |
createDirectory | treatPackageAsDirectory | showOverwriteConfirmation | dontAddToRecent`; open
    takes `showHiddenFiles | createDirectory | promptToCreate | noResolveAliases |
treatPackageAsDirectory | dontAddToRecent` — both excluding the mode and multiplicity flags
    `mode` and `multiple` already model structurally, refused at the type if named again inside
    `properties`. Absent, `save` keeps requesting overwrite confirmation, its long-standing default,
    and `open` adds nothing beyond its own mode flag; given, the list is forwarded exactly as
    written at both sites — the dialog capability's own `save`/`open`, and
    `internal/ContentsDownloads.ts`'s `saveDialogOptions`, the save-as decider's own options, which
    had no `properties` field to forward at all before this wave. The playground's `file-dialogs`
    fixture had one pre-existing test — "untyped extra options are dropped" — built on a
    `properties` value that this wave makes legal: what it used to prove, that Electron never sees
    an option Sewed does not recognize, would have silently stopped being true for that one value,
    not because anything broke, but because the value is no longer untyped. Its shared input
    narrowed to the options that remain genuinely unrecognized (`parent`, `signal`,
    `securityScopedBookmarks`), and `properties` got its own dedicated test block instead of being
    folded into the narrowed one.

    Cost if wrong: a flag a platform ignores.

    What proves it: `dialog.test.ts`, new, accepts and refuses both property unions at the schema,
    including a flag from the wrong dialog kind and a mode or multiplicity flag inside `properties`.
    `contents-downloads.test.ts` gains a test that a decider's `dialog.properties` reach
    `setSaveDialogOptions` verbatim, over the fake's existing `dialogOptions` observation. The
    playground's `file-dialogs` fixture, which already intercepts `showOpenDialog`/`showSaveDialog`
    and records `call.options`, adds five cases — open with one flag, open with `multiple` plus a
    flag, save with a flag, save with an empty array overriding the default to none, and a mode flag
    inside `properties` refused `Protocol` before any native call — beside its now-narrowed
    pre-existing case.

55. **`window.setSimpleFullScreen(flag)` and `state.simpleFullScreen`, mirrored on
    `WindowControls`, honoured on Linux exactly like ordinary fullscreen.** Probed: the setter is
    honoured there, both `isSimpleFullScreen()` and `isFullScreen()` answering true afterwards — its
    distinguishing macOS behavior, no Space, which is why a window minimizing to the tray leaves it
    first, was read from Electron's own documentation, not probed on this platform.
    `internal/Window.ts` reads `native.isSimpleFullScreen()` into the same state read `fullScreen`
    already comes from and adds a `setSimpleFullScreen` operation beside `setFullScreen`;
    `WindowControls`'s protocol gains a matching `setSimpleFullScreen` Rpc with a
    `{ simpleFullScreen: boolean }` payload, carried through `Core<R>`, `operations`, and `native`
    exactly as `fullScreen` already is.

    Cost if wrong: one boolean.

    What proves it: `window-state.test.ts` gains two tests — the controls protocol's
    `setSimpleFullScreen` reaching the fake window's handle, and a non-boolean payload refused
    `Protocol` at the transport boundary before the handle ever sees it. The playground's `windows`
    fixture's own `nativeState()` — the ground truth every pre-existing state comparison in the file
    already asserts against — now reads `isSimpleFullScreen()` too, so every one of those
    comparisons stayed correct with no change of its own; a dedicated check drives
    `setSimpleFullScreen(true)` and `(false)` and confirms `simpleFullScreen` and `fullScreen` both
    settle correctly, matching the probe.

56. **A tray icon is `Image.Source`, with `template?: boolean`, and construction itself had to be
    probed before the playground could prove anything real.** `Tray.Options.icon` and
    `setImage(icon, { template? })` now take a path or already-encoded bytes, over the same
    `nativeImageOf` helper `Window.setIcon` and `App.dock.setIcon` already use, replacing both
    `internal/Tray.ts`'s own local image-loading helper and the tray-specific `Tray.Icon` string
    schema, removed with no alias. `template: true` calls the resolved native image's own
    `setTemplateImage(true)` — macOS semantics, a monochrome image the system tints for light and
    dark menu bars, and a probed no-op elsewhere: `isTemplateImage` stays `false` on Linux, matching
    the scout's own earlier probe. Whether the playground's isolated X11 session can even create a
    `Tray`, with no system tray host installed there, needed probing first, before its own
    playground check could be written at all — it can: `new Tray(image)`, `setToolTip`, `setImage`,
    and `destroy` all complete without throwing, and a real PNG decodes fine — so the check is a
    real behavioral one, not a construction-only smoke test or a "say so, not tested" fallback.
    Moving onto `nativeImageOf` is a real behavior change, not only a wider type: an invalid or
    empty icon now fails `Protocol`, `nativeImageOf`'s own contract, where the tray's own removed
    helper failed `Native` with a generic message — one pre-existing playground assertion (a missing
    tray image's failure code) moved from `"Native"` to `"Protocol"` to match, confirmed as the
    ruling's own consequence, not a stray regression.

    Cost if wrong: one option.

    What proves it: `tray.test.ts`, new, decodes `Tray.Options.icon` (a path or bytes accepted,
    anything else refused) and `template` (an optional boolean) at the schema. `desktop-types.ts`
    pins bytes as an icon, `template: true`, `setImage(bytes, { template: true })`, and refuses
    (`@ts-expect-error`) both the removed `Tray.Icon` export and a non-image icon. The playground's
    `desktop-resources` fixture already runs a real private StatusNotifierItem DBus host for its
    existing tray coverage; a new check built on it proves a tray built from bytes registers with a
    tooltip readable over DBus, that `setImage(bytes, { template: true })` reapplies the same bytes
    with an identical icon pixmap signature — proving the bytes decoded to the same image a
    path-based tray would have — and that an empty `Uint8Array` is refused `Protocol` before native
    `Tray` construction.

57. **`webContents.title` mirrors `favicons` exactly, and `Decision.sync(() => Decision.Pass)` now
    infers `Answer = never` on its own — through a cast neither of two named candidates survived.**
    `internal/WebContentsCore.ts` gains a `SubscriptionRef<string>`, reset to `""` beside `favicons`
    on a real (main-frame, cross-document) navigation, set inside the existing `page-title-updated`
    handler only when `Decidables.WebContents.TitleUpdate` answers `"accept"` — the decidable still
    decides whether the native title follows, and its own `"keep"` fallback means `title` stays `""`
    forever with no decider installed. Both inference mechanisms first proposed were probed and both
    fail: a default (`sync<Event, Answer = never>`) never applies, because `Decision.Pass` is a plain
    property access, not a contextually-sensitive literal, so it always contributes `typeof Pass` as
    an inference candidate whether or not a default exists; a second overload placed before the
    general signature installs the pass-only case but reintroduces exactly the broken contextual
    typing an earlier fix round already removed, regressing `Decision.sync(() => "quit")` back to
    `Sync<Event, string>`, the literal widened. What shipped instead: `sync`'s own type parameter is
    renamed `Raw`, and the return type computes `Exclude<Raw, Pass>` after inference — `Raw` narrows
    exactly as `Answer` used to, so the ordinary spelling is unaffected, and `Exclude` collapses a
    pass-only lambda's `Raw = typeof Pass` to `never` for free. One cast is needed at the
    implementation site, since TypeScript cannot itself prove `Raw | Pass` assignable to
    `Exclude<Raw, Pass> | Pass` for an unconstrained `Raw` — conditional types are not generally
    invertible — though the runtime value never changes: `Pass` is a `unique symbol` with exactly one
    inhabitant, so any `Raw | Pass` value is either that symbol or a `Raw` value that provably is not
    it. `Decision.pass` stays the explicit spelling; its own doc comment now says the bare lambda
    installs too.

    Cost if wrong: one stream a consumer ignores; one cast whose invariant a contract stops proving.

    What proves it: `webcontents-core.test.ts`'s new title test follows an accepted
    `page-title-updated`, ignores a kept one, and resets on a fresh navigation, over a fake native.
    `decision.test.ts` gains three — `fromRead` answering a mutated closure fresh; a pass-only
    `Decision.sync` installing with no annotation and answering `Pass` at runtime; a mixed
    `Decision.sync` narrowing its real answer while still answering `Pass` on the passing branch.
    `decision-types.ts` flips the standalone-pass block from a `@ts-expect-error` (a round-1-era
    negative pin) to two positive installs — the one shape change this entry makes, pinned rather
    than left dangling. A later review probed three no-cast alternatives against the real install-call
    site (`Owner.decide`'s `NoInfer`-wrapped decider, not a bare assignment) and confirmed the shipped
    cast is the smallest one that survives: the bare default alone still fails there; `satisfies` hits
    the identical assignability barrier `as` does; an overload with a second, `unknown`-typed
    implementation signature compiles but trades the cast's own narrow, closed invariant for a body
    that type-checks against `unknown` instead.

58. **`Decision.fromRead(read, decide)` sits beside `fromState`, over a plain getter instead of a
    `SubscriptionRef`.** Same `sync` composition `fromState` already uses —
    `sync((event) => decide(read(), event))` — for a consumer whose current value lives in a mutable
    closure or a getter a framework already owns rather than a `SubscriptionRef`; `read` must be
    synchronous and current at the moment Electron calls the decider, never a value captured once at
    installation, exactly as `fromState`'s own `SubscriptionRef.get` already requires.

    Cost if wrong: one function.

    What proves it: `decision.test.ts`'s `fromRead` test mutates the closure between two decisions and
    confirms the second sees the new value, not the first. `decision-types.ts`'s `removeFromRead`
    contract pins it installing on its own event type and refused on a mismatched one.

59. **`request.readBody(options?)` reads the body a decider actually asks for, lazily, and a resolved
    blob keeps its `id` beside its `bytes`.** `internal/WebRequest.ts`'s `onBeforeRequest` handler
    already captured `details.uploadData` per request; `reinstall` now attaches a `readBody` bound to
    the fixed default (`{ maxBytes: 3_000_000, blobs: "reference" }`) to the one event object every
    decider on the request stage receives, and `intercept`'s per-install wrapper replaces it with one
    bound to that install's own `body` filter option, only for the installs that named one — so
    `readBody()` called with no arguments answers what the _calling_ install asked for, not always the
    global default. `readBody` fails `Limit`, not silently truncates, when the assembled body would
    exceed its own `maxBytes` — the install-time `body` option keeps truncating silently, since a
    decider that explicitly asks should not mistake a partial body for the whole one. `assembleBody`'s
    resolve branch now pushes `{ kind: "blob", id, bytes }` in place of an anonymous
    `{ kind: "bytes" }`, a genuine breaking shape change, so a rule that would refuse a blob by id can
    still recognize it after resolution. The two header stages carry no upload data and gain no
    `readBody`; only `Decidables.Session.Request`'s event does. A per-request
    `read: Map<string, Promise<Uint8Array>>`
    cache — one blob read shared across however many installs ask, first written for the eager `body`
    option — now also backs `readBody`, so two `readBody` calls for the same blob id, even from
    different installs, still cost Electron's native blob one read; `session.blobData` is a wholly
    separate, uncached path with its own native call, so a decider that reads the same blob id through
    both still exhausts Electron's one-time-readable native blob on whichever call runs second — a
    fact the playground's own fixture hit and routed around (two separate uploads rather than a shared
    blob id) before the docs said so explicitly.

    Cost if wrong: one lazy function on an event; one shape change a contract pins.

    What proves it: `decidables-request.test.ts` gains four tests — `readBody()` under the fixed
    default with no install-time `body` option; `readBody()` with no arguments defaulting to the
    _install's_ own `body` option, not the fixed one; `blobs` resolving or referencing independently
    of the install's own choice; `readBody({ maxBytes: 4 })` failing `Limit` on a body that would be
    truncated. `webrequest-body.test.ts`'s resolve-mode assertion moves to the new blob shape.
    `session-extras-types.ts` pins `readBody`'s natural spelling (with and without options), a
    resolved blob's `id`/`bytes` with no cast, and `@ts-expect-error` for `readBody` on both
    header-stage events. The playground's `session-extras-fixture.mjs` needed its own check a wholly
    separate upload, once sharing the pre-existing `blobData` test's own blob id revealed that
    Electron's blob is one-time-readable — the same fact the docs now name.

60. **`webContents.current` and `attachment.current` answer a fresh snapshot beside their streams,
    and no `…Unsafe` variant was added — a split `internal/View.ts` never carried before made either
    provable at all.** `webContents.current` mirrors `internal/Window.ts`'s own precedent
    (`current = operation(readState)`), reading all six `SubscriptionRef`s (`state`, `history`,
    `title`, `favicons`, `zoom`, `audio`) fresh via `Effect.runSync(SubscriptionRef.get(ref))` rather
    than waiting for a next change; `attachment.current` reads `getBounds()`/`getVisible()` straight
    from the native view. Both answer synchronously underneath — probed directly
    (`.artifacts/probe-wave-5/raise.mjs`): `getBounds`/`getVisible` need no `await` immediately after
    `setBounds`/`setVisible` — which is what let the "no `…Unsafe`" ruling stay firm: `setBounds`,
    `setVisible`, `raise`, and `detach` are documented as synchronous underneath and pinned completing
    under `Effect.runSync`, with `Effect.runSyncWith(context)` as the door a native callback that must
    answer at once uses instead of a bespoke synchronous method; `focus` stays out of that list, being
    webContents- not attachment-level. Proving any of this needed a split no file list named:
    `internal/View.ts`'s `make` did `new NativeView()` directly, a top-level _value_ import of
    `electron`'s `View` that made the module — and so `view.test.ts`, explicitly wanted — impossible
    to import under plain Node at all. `internal/View.ts`'s `make` is now
    `fromNative(native, options)`, taking an already-constructed native view (an electron-type-only
    import); the root `View.ts` gains its own `make(options)`, doing `new NativeView()` and calling
    `Native.fromNative`
    — `View.make`'s public signature is byte-for-byte unchanged, and `View.ts` is exported only from
    `sewed/main`, never the root `sewed` package, so the root stays Electron-free exactly as the
    constraints require.

    Cost if wrong: a consumer wanting a bare synchronous method writes one `runSyncWith`.

    What proves it: `view.test.ts`, new — `attachment.current` answering bounds and visible fresh
    after `setBounds`/`setVisible`; the four-operation `Effect.runSync` pin, run under a
    manually-owned `Scope.Scope` rather than `Effect.scoped` (which would close, and so detach, the
    attachment the instant the attach step's own Effect completed). `webcontents-core.test.ts` gains a
    `current` test confirming a change after the read moves the _next_ read, not the one already
    taken. `native-views-types.ts` pins `attachment.current`/`.raise`/`webContents.current` in the
    natural spelling, and `attachment.raise()` called as a function is `@ts-expect-error`, like
    `detach`.

61. **`back`, `forward`, and `go` wait for the navigation they started to settle and answer it, and a
    missing entry or a policy refusal names its own `reason`.** `travel` now makes a
    `Deferred<WebContents.Settled, SewedError>`, calls `goToIndex`, and awaits it; the existing
    `finished`/`failed`/`stopped`/`inPage` native handlers settle or fail that deferred as part of what
    they already did for the `history`/`snapshot` refs, so the Effect answers only once the move
    actually reaches a non-loading state (never `idle`, `loading`, or `gone`) — a same-document move
    settles through `inPage` too, not only a full navigation. A travel that starts while one is still
    pending supersedes the prior one with a `Protocol` refusal rather than leaving it to hang. A
    missing history entry fails `Protocol` with `reason: "history/no-entry"`; a navigation-policy
    refusal fails `Protocol` with `reason: "policy/denied"` — the first two entries in `SewedError`'s
    new optional `reason` field, indexed in `docs/api.md`. The new `WebContents.Settled` return type
    threads through every layer that re-exposes `back`/`forward`/`go`: `WindowControls`,
    `internal/GuestHost.ts`, `GuestView.ts`'s RPC definitions.

    Cost if wrong: a longer `back`; one optional field.

    What proves it: `webcontents-core.test.ts` gains five tests over a `FakeContents` extended with
    history state and `goToIndexCalls` — waiting for its own triggered navigation and answering the
    settled state; answering a failed state; failing `Protocol`/`history/no-entry`; failing
    `Protocol`/`policy/denied`; `SewedError` decoding with and without `reason`, staying optional when
    absent. `webcontents-types.ts` pins `back`/`go` to `WebContents.Settled`, with a negative pin
    against `WebContents.History` rather than `void` — `Effect<Settled, …>` was found assignable to
    `Effect<void, …>` through method-position return-type bivariance, so `void` could not itself serve
    as an incompatible shape for the `@ts-expect-error`. `guest-host.test.ts` and
    `window-state.test.ts`'s fakes updated to return `Settled` values.

62. **`attachment.raise()` is one `addChildView` call, proven by the order of `View.children` rather
    than a pixel sample, because `capturePage()` never shows a sibling `View` at all.** The
    pixel-capture plan was tried first and abandoned: `window.webContents.capturePage()` captures only
    that webContents' own rendered page, and a sibling `View` attached to `contentView` — colored, no
    webContents of its own — never appears in the bitmap, before or after attaching two overlapping
    ones, confirmed directly on real Electron (`.artifacts/probe-wave-5/raise.mjs`). The mechanism
    actually used for proof is `View.children: readonly View[]`, which `internal/View.ts` never read
    before: three views attached in order give `children === [a, b, c]`; re-adding the bottom-most
    gives `[b, c, a]` — moved to the topmost slot, no duplicate entry, `children.length` unchanged;
    re-adding the now-middle one next gives `[c, a, b]`, so this is not a one-off for whichever view is
    raised first. That confirms Electron's own doc comment on `addChildView` — a repeated call
    reorders to the top — so `raise` is `parentView.addChildView(state.native)`, one call, no
    remove-then-add fallback needed. `desktopCapturer.getSources({ types: ["window"] })` found zero
    window sources under a bare X11/WSLg session with no window manager providing the EWMH hints
    Electron's capturer needs; not retried under the playground's own Xvfb+Openbox harness, since the
    `children`-array evidence already settled the question more directly.

    Cost if wrong: one Effect.

    What proves it: `view.test.ts`'s own three-view, twice-raised test mirrors the real-Electron probe
    exactly — first-raised _and_ now-middle-raised, not a one-off. The playground's
    `native-views-fixture.mjs` reads the real native
    `contentView.children.map(child => child.getBounds())` order before and after
    `attachmentA.raise`, over real Electron rather than a fake, since the fixture already peeks at
    native state for its own verification.

63. **`Session.fromPartition({ kind, name, mapping? })` may keep the raw name Electron would have
    used, and the docs say loudly what the default costs an application switching later.** The key
    derivation moved out of `Session.ts` (which still calls Electron's own `session.fromPartition` at
    module scope, so it stays outside plain-Node coverage as it always did) into a new, pure,
    Electron-free `internal/Session.ts#partitionKey`, the piece this wave actually made testable.
    `mapping: "raw"` hands Electron `name` unchanged, `persist:`-prefixed for a persistent kind, for an
    application with real users already under a native partition name; omitted or `"hashed"` keeps the
    default `sewed-v1-<sha256>` derivation. `docs/sessions.md` states the migration cost in bold rather
    than in passing: switching an existing deployment from `hashed` to `raw` does not carry old data
    forward — `sewed-v1-<sha256 of "Work">` and `raw`'s own `persist:Work` are two different native
    partitions with two different on-disk stores, so a user who already has a hashed-keyed store
    effectively starts over unless the application plans an explicit one-time migration first.

    Cost if wrong: one option.

    What proves it: `session.test.ts`, new — `partitionKey` unit tests over the hashed default, the
    raw mapping, the `persist:` prefix, and case sensitivity, with no Electron underneath. The
    playground's `session-fixture.mjs` spies on `nativeSession.fromPartition` to confirm the raw-mapped
    call reaches Electron with the name verbatim.

64. **`Protocol.handleWeb(session, scheme, handler)` takes the web's own
    `(request: Request) => Response | Promise<Response>` shape — the native-facing signature `serve`
    already adapted to — as a distinct name, not an overload, because two handler shapes sharing one
    parameter position cannot be told apart without a runtime probe.** `serveWeb` carries the same
    bookkeeping `serve` already has: the same `active`-set admission and `maximumActiveRequests`
    limit, the same
    `internalServerError()` answer for a handler that throws or whose promise rejects (exactly as a
    failed Effect handler's fiber settles today), and `request.signal` aborting both on the native
    request's own cancellation and on the registration's own scope closing while the call is still in
    flight. Proving it needed a module split no file list named: `internal/Protocol.ts` carried a
    module-scope value import of `{app, protocol}` from `electron`, discovered when the new
    `protocol.test.ts` tried to import it and hit a bare `SyntaxError` under plain Node.
    `internal/Protocol.ts` now keeps only the testable core (`serve`, `handle`, `serveWeb`,
    `handleWeb`, scheme validation, `protocolError`, now exported); a new `internal/ProtocolSchemes.ts`
    keeps the Electron-touching `declare`/`registerSchemes`/`nativePrivileges`/`startupError`; a new
    `internal/ProtocolMain.ts` barrel recombines both for `sewed/main`'s own `Protocol` namespace,
    unchanged for every consumer.

    Cost if wrong: one function.

    What proves it: `protocol.test.ts`, new, over a fake session (`{protocol: {handle, unhandle}}`) —
    a sync `Response`, a `Promise<Response>`, a thrown handler and a rejected promise both answering
    500, native abort propagation, and abort on the registration scope's own close.
    `session-resources-types.ts` pins `webHandler`/`asyncWebHandler` positively and refuses a
    service-requirement leak and a wrong response type. The playground's
    `session-resources-fixture.mjs` drives `handleWeb` over GET, POST, a throw, and abort-on-teardown
    against real Electron.

65. **`Testing.requests().observe(filter)`/`.emit(event)` is the stand-in's own version of the
    observation stages a decider never sees, backed by a tap set rather than Electron.** `observe`
    mirrors `session.requests(filter)`'s own registration and filter vocabulary — `urls` match
    patterns, an optional `types` list — over the production `WebRequest.Event` schema
    (`sent | response | redirect | completed | error`); `emit` is synchronous and effect-free, offering
    one event to every still-open `observe` stream whose compiled filter selects it, the way a native
    tap
    would have reached it. Closing an observer's scope, or interrupting its fiber, removes its tap,
    matching how a native one is removed. `intercept` gains nothing from this entry — it has no upload
    data to assemble `readBody` from, and entry 59's own `readBody` stays scoped to the native request
    stage, not this stand-in's `intercept`.

    Cost if wrong: one stream.

    What proves it: `testing-owner.test.ts` gains four tests over sample events at all five stages —
    observe receiving a selected emission and not an unselected one; every stage round-tripping its
    schema; two observers both receiving one emission; an observer's scope closing ending its stream.
    Stream subscription via `Observation.listen`'s `Stream.callback` registers asynchronously, so each
    test uses a bounded retry-until-subscribed warmup — emit, sleep, check, repeat up to 200 times —
    before resetting counters and asserting the real case, rather than a fixed sleep or a count that
    double-counts across multi-observer tests.

66. **A request in flight when the connection is lost fails typed — `Closed` before it left,
    `Unknown` after — because `Transport.ts`'s own `fail` now delivers every in-flight request's typed
    outcome before `onFailure` can evict the shared client and interrupt what is left.** Every entry
    `clientProtocol`'s `requests` map holds — an ordinary call and a streaming one alike, since a
    stream registers through the identical `Request` message path — now carries a `sent` flag, set
    once `connection.send` (or a bulk send's last part) has actually left; `fail` iterates that map
    before calling `onFailure?.()`, answering each entry a synthetic `Exit` failure in the same wire
    shape a real answer would carry: `Closed`, reason `"transport/closed-before-send"`, for one still
    `sent: false` (the same reason an outright `connection.send` throw now carries too); `Unknown`,
    reason `"transport/lost-after-send"`, for one already sent with nothing back. `"Unknown"` joins
    `SewedError`'s codes, and a second, independently hardcoded copy of the code list in
    `internal/UtilityBindings.ts`'s `rejectionCode` — found only by a typecheck failure — gained it
    too. The first implementation delivered both outcomes this same way but failed the `Closed` case:
    `RpcClient`'s own resume logic schedules an interrupt of its internal send-fiber when that fiber is
    not yet done, and for `Closed` the calling fiber IS that not-yet-done fiber (`fail` runs from
    `Effect.tapError` on the very send that failed), so it interrupted its own typed delivery out from
    under itself. Disabling `Binding.ts`'s `onFailure` confirmed the actual interrupt source was
    `evict()`'s own `Effect.runFork(Scope.close(...))`; deferring the whole `onFailure` via
    `queueMicrotask` fixed `Closed` but broke "reconnect after eviction," since deferring the registry
    removal let a synchronous follow-up call find the stale dead client. The fix that landed splits
    `evict()` in two: `registry.clients.delete(binding.key)` stays synchronous, so a subsequent call
    reconnects correctly, and only `Effect.runFork(Scope.close(entry.scope, Exit.void))` waits one
    microtask, so an already-delivered typed answer reaches its caller before the scope — and the
    client it was talking to — is torn down. A live stream already subscribed through
    `@sewed/react`'s `useStream` when the connection is lost now receives this same typed `Unknown`
    cause, with no change of its own: `useStream` always published whatever cause its fiber failed
    with, through one `Effect.catchCause`, and the cause reaching it is now a typed `Fail` rather than
    a bare `Interrupt`.

    Cost if wrong: a caller who retried on interruption now sees `Unknown` and must not retry — which
    is the point.

    What proves it: `transport.test.ts`, new, over the real `pair()`/`RpcClient` stack with a
    `tap.hold`-style connection-drop capability — four tests: an ordinary request whose connection
    dies mid-send answers `Closed`/`transport/closed-before-send`; one sent with its answer withheld
    answers `Unknown`/`transport/lost-after-send` once the connection is lost; a stream in flight when
    the connection is lost answers `Unknown`; after the loss the shared client is evicted and the next
    call reconnects over a fresh connection. `bulk.test.ts`'s two pre-existing `Closed`-before-delivery
    tests gain the `reason` assertion, unmodified otherwise, confirming the reorder left bulk's own
    eviction/reconnect behavior alone. `docs/api.md`, `docs/transport.md`, and
    `docs/binary-streams.md`'s known-gap paragraphs are rewritten to the two typed outcomes and
    "nothing retries"; entry 27's own boundary sentence and the connection-loss known-gap bullets in
    the hardening and second fully-on-Sewed waves' closing records are corrected to match, noted
    rather than rewritten.

### Recorded when the decisions wave closed

Behaviour that changed from the code this wave replaced, and is deliberate, beyond what decisions 1 to 16
already record:

- App-level `login` and `certificate-error` always call `preventDefault` and answer asynchronously, even
  with no decider installed. Close and quit approval is likewise asynchronous with no decider; the code it
  replaced approved inside the event.
- The old guards were interrupted when their scope closed. A decider removed mid-resolution now finishes
  under the snapshot rule and still contributes its answer. The consequence for a gate: a close or quit
  decider that never settles wedges it for good, closing its scope no longer frees it, and the window then
  closes only through its owning scope. There is no library deadline, by ruling; a decider bounds itself
  with `Effect.timeout` and `Effect.orDie`.
- A guest's navigation policy cannot be widened after creation. `setNavigationPolicy` is gone and the
  guest's own policy is a permanent cap on its registry.
- The header stages answer Electron's `{}` no-change form when no decider changed anything, rather than
  echoing the headers back. Proven against real Chromium: echoing an empty header object collapses thirteen
  request header names to two. An origin that does not parse reaches a decider as `null`.
- A request stage costs more than the interception it replaced, measured at the median of 5 × 8000: one
  decider 8.51 µs against 1.86 µs, sixteen 48.36 µs against 3.87 µs. `URL.parse` is 0.249 µs of a roughly
  2.4 µs marginal cost per installed decider; the rest is every decider going through `consult` even when
  its filter does not select the request. A synchronous branch in `consult` was judged not worth it, since
  it would duplicate the failure containment that took five review rounds. If a budget complains, add an
  optional synchronous `applies(event)` predicate on the registry entry, checked before `consult`.

What the suite cannot see, and what answers it:

- Thirty-nine source files import `electron` for a value and cannot be imported by the unit suite,
  `App.ts`, `internal/Window.ts`, `internal/WebContents.ts` and `internal/GuestView.ts` among them. No
  suite-based claim about them stands. The pattern that answers it is to extract the wiring into an
  Electron-free module a structural fake can drive, leaving one line behind in the unimportable file:
  `AppRuntime`, `WindowClose`, `ContentsPosture`, `ContentsInput`, `NativeAnswer` and `RequestStages` all
  do. That one line is proven by the compiler where the types can pin it, by a playground fixture
  otherwise, and the report says which.
- Real-Electron coverage per decidable is uneven. `WebContents.Unload` and `App.CertificateError` have
  none: no fixture touches the first, and the second is installed by a fixture that never makes an HTTPS
  request that fails verification. `Session.Certificate` is exercised by calling the captured verify proc,
  not by a real TLS handshake, and `WebContents.Popup` on its deny path only. One HTTPS fixture with a
  failing certificate would close both certificate gaps. `docs/electron-coverage.md` says all of this.
- Node has no default test timeout, so an ad-hoc `node --test` run with an unbounded wait hangs rather than
  failing, and its per-file child outlives a killed parent. `pnpm test` passes `--test-timeout=60000`; any
  ad-hoc run passes its own. A test that forks work waits on a positive condition, and bounds the wait.
- Three tests were sensitive to load and all three are fixed: the two above, and `diagnostics.test.ts`
  "an injected failure after worker startup is reported as an exit", where a 20 ms crash timer raced the
  RPC reply. It now accepts a `Closed` from `crash()` by name and still asserts the exit and the diagnostic.
  The suite ran clean 22 times in 22 under 48 CPU burners on 24 cores.
- Nothing reads a block comment's interior, so a mangled JSDoc paragraph break shipped into the published
  declarations and the reference once; `doc-comments.test.ts` now scans for it. Nothing type-checks or
  lints the playground's fixtures. Nothing cleaned `lib`, so a renamed module shipped twice in the tarball
  until `release.mjs check` began refusing a built module with no source. That check judges `tsc`'s four
  output shapes only, deliberately, since `lib/preload.cjs` is a legitimate file no source emits.

The playground's procedure, because getting it wrong looks like a host failure: after the last library
commit, pack, reinstall, rebuild the playground, and confirm the installed `lib` is byte-identical to a
build from a clean `lib`. `verify` otherwise fails in under a second on stale build evidence. Raise
`SEWED_XVFB_TIMEOUT` for `verify:all`; the wrapper's 90 s default kills the sweep at target 10 of 32. On the
development machine this wave ran on, five scripts die at a deliberate renderer crash under Electron's
sandbox and four of them pass with `--no-sandbox`; the two menu scripts pass under Xvfb with Openbox and a
private D-Bus session and fail on a bare WSLg display; and `verify:windows` failed once in ten on a stale
`contentBounds` after leaving fullscreen, in a check the wave did not touch.

Naming left as it is, and known: `Decision.Pass` is the symbol a decider answers and `Decision.pass` is the
decider that always answers it, one capital apart; `Navigation.compile` is exported with only an internal
caller.

### Recorded when the declarations wave closed

Behaviour recorded beyond what entries 17 to 26 already state:

- A secondary process reaches Electron's readiness before it learns it is secondary. `App.run` waits for
  `whenReady()` before running `program`, and `App.claimInstance` can only be called from inside `program`,
  so the wait happens regardless of which process turns out to hold the lock; a consumer wanting the
  cheapest possible exit claims the instance as the first thing `program` does.
- `second-instance` moved off `App.launches` entirely rather than staying as a second, dead path on it: the
  event only ever reaches the process holding the lock, so it belongs to `App.claimInstance`'s own
  `instance.launches`, and `Launch.Request`'s union keeps only `initial`, `file`, and `url` — the kinds the
  running application's own launches can actually be.

What the suite cannot see, and what answers it:

- `Instance.make(app)` in `App.ts`, and each `declare`'s one-line binding (`CommandLine.declare`,
  `Paths.declare`, `Gpu.declare`, `App.declare`, `CrashReporter.declare`), are proven by the compiler: the
  real `app` the module captures satisfies the structural `Native` types in `internal/Instance.ts` and
  `internal/Declarations.ts`, so a binding that stopped satisfying them would fail to build before any test
  ran. `run`'s listener wiring and exit sequence, the native application menu (`internal/ApplicationMenu.ts`),
  and the scheme registration (`internal/Protocol.ts`) are proven by the playground's `verify:lifecycle`,
  `verify:application-menus`, `verify:session-resources`, `verify:app-extras`, `verify:forge`, and
  `verify:app`, all of which passed on the development machine's full sweep of this wave's build; the
  five known sandbox host failures (`verify`, `verify:webcontents`, `verify:webcontents-extras`,
  `verify:diagnostics`, `verify:responsiveness`) were unchanged by it.
- Known and deferred: a second `Protocol.declare` in one list — the once-only failure entry 22 records —
  has no runtime proof, since no fixture builds a list carrying two. Forge has no in-repo runtime test that
  `crashDumps` is set before `crashReporter.start`; the order is fixed by the statement order inside
  `CrashReporter.declare`'s step, not exercised against real Electron. No fixture proves `App.menu`
  acquired, released, and
  reacquired within one process. And the claim's on-throw path — `native.on("second-instance", ...)`
  throwing after the lock was already granted — calls `releaseSingleInstanceLock` unguarded, unlike the
  hardened multi-step release the finalizer runs; a throw there would surface as a defect rather than the
  `Native` failure the rest of the claim reports.

### Recorded when the bulk-requests wave closed

The real path — `contextBridge`'s structured clone, the preload `MessagePort`, `MainBridge`'s per-packet
decode, and the owner's assembly — is proven by the playground's `verify:binary` fixture: a renderer-to-main
`ingest` operation carries a 12 MiB patterned attachment to exactly its declared bound and back, and a
request one byte over fails `Limit` naming the field and the bound before anything is sent. The round trip
measured 503.5 ms on the development WSL2 machine this wave ran on; after the canonical-packet
compare in `decodeBinary` stopped calling a closure per byte, the same fixture measured 163.5 ms. One run
each, not a budget. `bulk.test.ts`
proves the mechanism itself over an in-process `pair()`: a field at exactly the bound reaching the handler
intact, one byte over failing before anything is sent, a request whose other fields outgrow their own
envelope beside a small field, an undeclared operation keeping the plain limit, a request under the envelope
sent whole with no `RequestPart` frame at all, a lost connection's `Closed` distinguished from delivery, a
set of hostile parts each closing the connection, an interrupted caller dropping its assembly cleanly, a
bulk declaration outside a `Binary.protocol` refused where its slot is declared, and the in-process path's
absence of any bound. The tests about the middle of a transfer withhold the owner's packets so the client
is genuinely suspended between two parts, and that is what makes them mean anything: a `pair()` delivers
synchronously, so over an unheld one a second call's whole loop runs in a turn the first never yields, and
the first version of the serialization test passed with the gate taken out.

Known gaps: peak owner memory while a request is decoding is about three to four times the declared bound,
since the parts, the packet joined from them, and the canonical packet the decoder re-encodes to check it
are all live at once before the first can be released; no
`Blob`/`File` helper ships, so a renderer hands a chosen file's bytes to a bulk operation by writing `new
Uint8Array(await file.arrayBuffer())` itself; and `benchmark:transport` has no bulk scenario yet, so the
two figures above are the only timings this wave has, not a tracked metric.

### Recorded when the hardening wave closed

Every load-bearing fact in entries 30 to 37 was probed before it was written, because none of them is a
fact the suite can hold. What each probe established:

- **Readiness is held by an entry's shape, not by an API.** An ES-module entry's top-level `await`,
  including one inside a module it only statically imports, holds Electron's `ready`; an async function
  invoked without an entry-level await on it does not, and neither does a CommonJS entry or a dynamic
  `import()`. Once ready, only a privileged-scheme registration throws: a switch, a path, and an app user
  model id apply silently and do nothing.
- **A code map, read before any code changed,** said where each claim would land: that the testing host's
  own emitted declaration carries a concrete requirement at every call site in this suite, so the `any`
  had to be coming from somewhere else; that one containment function already governed the shell's
  configured roots, so a grant had somewhere to join; and what a save dialog actually returns.
- **`<all_urls>` is everything a `webRequest` hook can see, WebSocket handshakes included** — a `ws:` or
  `wss:` upgrade arrives with `resourceType: "webSocket"` and a decider can block it — while `*://*/*` is
  http and https only, which is the trap in a rule meant to be total.
- **A native `types` list containing `"other"` throws**, an empty list and `undefined` and no key alike
  deliver every type, and a non-empty valid list restricts. Hence the first fail-open below.
- **A refused registration usually clobbers the listener it was replacing.** Of twelve filters over three
  hooks, four throw, and three of those four leave the previous listener gone. Only the `other` type
  refusal validates before it swaps.
- **vitest with jsdom does not replace `globalThis.Uint8Array`** under any pool. The foreign bytes are
  what jsdom's own `TextEncoder` returns, so the encode side fails first and a renderer's own byte field
  never leaves the client.
- **`app.setPath` to a path missing three parent levels never throws**, for `sessionData`, `userData`,
  `logs` or `crashDumps`, while a relative path always throws. At readiness with no window opened,
  Chromium has created `sessionData` and `userData` itself and has touched neither `logs` nor
  `crashDumps`; `crashReporter.start` creates its own directory.

Two fail-opens were found in the code this wave started from, both while proving something else, and
neither reported by a consumer. A stage where every install named a resource type and one of them named
`other` never delivered an `other` request to anyone; that is now proven closed on real Electron by a page
whose prefetch the server never receives while its image loads, on one session carrying both deciders. And
an install whose filter Electron refused took the stage's other deciders down with it; that is now proven
closed on real Electron by a refused install failing typed while the first decider keeps blocking, and by
observers installed before and after a refusal both still receiving events. Each of those checks was
watched to fail with its restore removed, twice, before it was trusted.

Three traps in this toolchain cost a fix round each, and each is recorded where it bit:

- Annotating a schema constant as `Schema.Codec<…>` to shorten its printed type silently removes payload
  type checking. That interface carries the type, the encoded type and the service parameters, and drops
  the constructor-side parameters `Rpc.PayloadConstructor` reads, so a string is accepted where a byte
  field is declared and no test fails. Only a negative type pin notices; alias over the precise schema
  type instead.
- `RpcGroup.HandlersFrom` types every handler's requirement as `any`, because `Rpc.ToHandlerFn` defaults
  its own requirement to `any`. Anything built from it loses the requirement of everything it touches.
- `Capability<Rpc.Any, string>` cannot serve as a bound, because `RpcGroup`'s parameter is invariant and
  `Rpc.Any` does not match the six-parameter pattern its own methods return; and the unconstrained version
  of the same conditional fails silently as `never` rather than loudly.

The suite went from 625 tests to 667. The byte predicate added twelve and three more in its fix round, the
request-type union nine, the refused registration one, the entry rule five, the shell grant eight, and the
exit code and the languages four between them; the capability names added none, because their whole
contract is type-level and is checked by the project type-check rather than run.

Known gaps, stated rather than closed:

- On the default shared connection, an ordinary request already in flight when the connection is lost
  resolves as a bare interruption rather than a typed `Closed`, because closing the shared client's scope
  interrupts it before the transport failure is delivered; today only a bulk request lost before delivery
  reports `Closed`. The gap is not specific to bulk and the redesign's failure-model step owns it. The
  guides say so, and entry 27's account of that boundary is aligned with them. (Closed by the fifth
  fully-on-Sewed wave: entry 66.)
- `Cause.pretty` prints a `SewedError`'s message and never its code, and `App.run`'s single failure print
  is the one stderr site for every failure, so a `Startup` refusal reaches stderr as its sentence and never
  as the word `Startup`. The playground asserts the exit code and the message text for exactly that reason.
  Naming the code beside the message is queued.
- No guide's code blocks are type-checked. A shell grant example treating a save dialog's tagged result as
  `string | null` shipped into a guide with the build, the reference, the suite and the project type-check
  all green, and was caught by a reviewer reading it. Extracting the guides' `ts` blocks into the same kind
  of contract file the types already use is queued.
- `WebRequest.Pattern`'s validation and Electron's own disagree in both directions on 44.3.0, so a consumer
  can learn at registration what it could have learned at decode. The two patterns Sewed accepts and
  Electron refuses are named in the session guide. Whether Electron's pattern parser accepts a scheme
  registered through `Protocol.declare` was not probed.
- Three of the first consumer's testing asks are deferred, not closed: a `RuntimeStore` over in-process
  hosts so a renderer module needs no seam of its own (the React wave), a stand-in `requests()` a test can
  push observation-stage events into (the guest-view wave), and a payload the client's own schema refuses
  becoming a typed `Protocol` failure that names the operation and the path rather than a defect (the
  typed-refusals wave). The hand-back names each.
- The relay guard in `MainBridge` that recognizes bytes by the predicate is Electron-only and has no
  runtime coverage; the identical guard in `BindingRelay` is what the suite drives with a foreign packet.
- `RequestStages.ts`, where the native-filter union lives so the unit suite can pin it, imports one name
  from `electron` as a type only; its emitted module imports nothing from Electron and runs under plain
  Node, which is what "Electron-free" asks of it.

### Recorded when the first fully-on-Sewed wave closed

Every load-bearing fact in entries 38 to 41 was probed on real Electron before it was written, the
same discipline entries 30 to 37 followed. What each probe established:

- **Every declared path answers before readiness except one, and a pre-ready declaration moves three
  of them with it.** `app.getAppPath()` and `app.getPath(name)` answer for every `PathName` Sewed
  declares before `ready`, `recent` excepted — it is Windows-only and throws "Failed to get 'recent'
  path" on this platform. With nothing declared, the pre-ready and after-ready answers are the same
  value for every name; a pre-ready `setPath("userData", X)` is reflected at once and carries
  `sessionData`, `logs`, and `crashDumps` with it, which is the fact that makes `App.defaultPath`
  mean "what Electron uses with nothing declared" rather than "the path," and keeps it meaningful
  even once a declaration has applied.
- **The error box is a stderr print before readiness and a blocking native modal after, on this
  platform.** `dialog.showErrorBox` prints `title` and `content` to stderr and returns at once
  before `ready`, display or no display, because GTK is not up yet; after `ready`, with a display,
  it shows a native modal that blocks until dismissed — probed by timing the probe script itself
  out, since nothing in the harness can dismiss a modal it never opened. Electron documents a native
  box before readiness on Windows and macOS; that was not probed here.
- **The turn that calls `app.exit()` still finishes; only a further task does not.** Reprobing the
  call context `App.terminate` actually runs in — a post-ready event-loop callback, not the
  synchronous pre-ready top-level call the first probe used — found that a queued microtask and the
  rest of the calling turn run after `app.exit()`, and only a later task, a new timer or an I/O
  callback, does not get a turn; a `throw` placed right after `app.exit()` in that same context
  reaches Electron's own uncaught-exception handling instead of the scheduled exit, and hangs the
  process under X11 rather than either running or being skipped. Entry 33 above carries the
  corrected, narrower claim this re-probe established, not its first, overstated one.

The suite went from 674 tests to 677: the three cases in `resolve-electron.test.ts`. The other three
rulings added no `*.test.ts` file — `lifecycle-types.ts` is type-only and excluded from `node:test`
— and each is proven against real Electron by the playground instead.

Known gaps, stated rather than closed:

- The error box is not verified as a box on this platform, only as the stderr print before
  readiness: the after-readiness native modal is confirmed to block by timing out a probe that could
  not dismiss it, but no fixture opens, screenshots, or dismisses one, because nothing in the
  playground's own harness can click a modal nothing scripted it to expect.
- Electron's documented native box before readiness on Windows and macOS was read, not probed; this
  wave, like every one before it, ran on Linux only.
- Whether Electron's pattern parser accepts a scheme registered through `Protocol.declare` — the
  question the hardening wave already left open — stays open; nothing in this wave touched it.

### Recorded when the second fully-on-Sewed wave closed

Every load-bearing fact in entries 42 to 45 was probed against the real mechanism before it was
written, the same discipline entries 38 to 41 followed. What each probe established:

- The refusal is the schema constructor's own throw, recognized by its documented message and
  revalidated for soundness, not the `orDie` line first cited — though that line is real too, for
  an encode-side transformation, and lands in the same catch.
- `renderToString` never calls `useSyncExternalStore`'s `subscribe`, so a hook's reactive
  transition cannot be shown by a bare server render in either state; it is pinned one layer down
  instead, at `Resource.make` and `Action.make`, and for the full live handshake with no remount,
  in the playground's ungated runtime lane over a real browser.
- `tsx`'s dev-time loader resolves one tsconfig per process, from the working directory it starts
  in, and the repository's own root tsconfig — `files: []`, no `include` — disqualifies itself
  from applying to any file; that is why `index.tsx` uses `createElement` rather than JSX, a
  smaller and toolchain-independent fix confirmed identical under both `tsx`'s default transform
  and the real build's own.
- The root package's test glob never matched a `.tsx` file, so `hooks.test.tsx` — the repository's
  first — would have run zero times under `pnpm test` without widening it.

The suite went from 677 tests to 696: three from the refusal and the client whose context arrives
later, eight from the hooks themselves and the run that cancels, two more once the review asked
for a stream-shaped refusal test and a per-call test through the pending client, five for the
testing store, and one for the abort-listener leak the review caught in its second round.

Known gaps, stated rather than closed:

- Ruling 3's refusal path is the schema constructor's own throw, recognized by its documented
  message and revalidated for soundness; Effect's own `orDie` on an encode-side transformation,
  first suspected as the whole mechanism, is real too and lands in the same catch. Both paths
  hold, and a caller cannot tell which one produced a given `Protocol` failure.
- The same `isSchemaError` catch that turns a refused payload into `Protocol` also turns the
  client's own refusal of a RESPONSE its schema rejects into `Protocol`, naming the operation and
  the path, even though the host ran and answered. Ruling 3's text covers the payload side only;
  the response-decode case is new behavior the ruling did not anticipate.
- `Binding.ts`'s `invoke` reads `binding.protocol.requests.get(tag)!` at line 405, a non-null
  assertion outside the file's original `methods`/`table` carve-out. The controller accepted it as
  the same documented bridge, since `tag` is always a key of `protocol.requests` by construction.
- `Binding.pending` and `Binding.clientContext` are now public API through `PublicBinding.ts` —
  `clientContext` beyond this wave's planned file list; `Connection.ts`'s `unavailable` and
  `runWith` are exported package-internally for `@sewed/react/testing` to share; and
  `scripts/api-reference.mjs` gained the `@sewed/react/testing` entry.
- The `tsx` loader's classic-JSX quirk that had left `index.tsx` free of JSX syntax is now moot:
  the fix round that closed this wave renamed the file to `index.ts`, since `createElement` was
  already the whole adapter's mechanism there. The root test glob's widening to `*.test.tsx`
  stands regardless, since `hooks.test.tsx` and `testing.test.tsx` are real test files.
- `hooks.test.tsx`'s coverage has a ceiling: `renderToString` never calls
  `useSyncExternalStore`'s `subscribe`, so it cannot show a hook's reactive transition in either
  state by itself; that proof lives one layer down, at `Resource.make`/`Action.make`, and in the
  playground's live browser lane.
- `mount` has no runtime test. Fixing the hooks' own mechanism silently fixed a pre-existing bug
  in it along the way: the store `mount` built never carried a context before this wave, so
  `store.run` under `mount` always rejected `Closed`, and nothing in the suite pinned either the
  bug or its fix.
- A live stream or action already running when a store turns unavailable mid-flight is pinned
  only through the connection's own failure, not through any status check of its own: it has
  already resolved its context and is no longer consulting `store.runtime`, so its transition to
  `failure` on disconnection is a bare interruption from the connection's own transport failure,
  not the typed `Closed` cause that work starting after the store turns unavailable gets — the
  same as before this wave, not a new guarantee it adds. (Closed by the fifth fully-on-Sewed wave
  for the shared connection's own loss specifically: `useStream`'s `Effect.catchCause` always
  published whatever cause its fiber failed with, unchanged, and that cause is now `Transport.ts`'s
  own typed `Unknown` rather than a bare interruption, since `fail` delivers it before eviction can
  interrupt the stream's fiber — see entry 66. A store turning unavailable for a reason other than
  the shared connection's own loss, or work that starts only after unavailability is observed,
  still gets the plain `Closed` path this bullet's own second half describes, unchanged.)
- `@sewed/react/testing`'s `store` closes only its own connection scope when `close()` runs; the
  host's own services are released by whatever scope built it, the caller's, not the store's. Its
  `onConnect` option — which fired once at the store's construction, unlike
  `Testing.layer`/`Testing.client`'s `onConnect`, which fires per connection — carried the same
  name as that other `onConnect` with different meaning and no consumer in range; the fix round
  that closed this wave deleted it.
- The playground's Xvfb `verify` run stops at the same `Page.crash` timeout exactly as the 20
  September pre-wave log already showed, so the limit is environment-bound and predates this
  wave; every check before it — including the new ungated runtime lane — passes. The run that
  produced this wave's playground evidence was still against the previously installed
  `@sewed/react` build (`d65ad592`'s adapter), not `c75ccd0a`'s abort-listener fix; a sweep that
  reinstalls and reruns `verify`/`verify:dx` was left for the closing pass.
- In every recorded run the runtime lane's early read is already `stream: "value"`, because the
  handshake beats CDP attachment. So `verify` proves an ungated first render, one stable DOM
  identity, and monotonic renders over the app's life, not a literal `loading → value` flip; that
  transition is covered instead by `verify:dx`'s ungated failure path, `hooks.test.tsx`'s SSR
  defaults, and the mechanism probes behind Ruling 1.
- `RuntimeProvider` no longer carries its own subscription — a status change re-renders only
  components that call `useRuntimeStatus` — stronger isolation than this wave's rulings asked
  for, and worth naming because a consumer relying on the old provider-wide re-render will not get
  one.
- `RuntimeStore.run(effect, { signal })` forks with `Effect.runForkWith` and its own
  `addEventListener`/`interruptUnsafe` bridge, matching `internal/Protocol.ts`'s existing house
  idiom, rather than Effect's native `RunOptions.signal`, which exists in this pinned rc and does
  the same thing. The fix round that closed this wave made the pre-fork ordering match a mid-run
  abort's own rejection value exactly, closing the one place the hand-rolled and native mechanisms
  diverged.

### Recorded when the third fully-on-Sewed wave closed

Every load-bearing fact in entries 46 to 49 was probed against the real mechanism before it was
written, the same discipline entries 42 to 45 followed. What each probe established:

- `did-navigate` carries `httpResponseCode`/`httpStatusText`, `did-finish-load` fires for a 5xx
  document exactly as it does for a 200 one, and a `data:`/`file:` document reports a synthetic
  200 — the field is always a number, and pairing it with the committed generation in the same
  call keeps a stale navigation's status from ever outliving the generation it belongs to.
- `capturePage`'s image reports its own pixel size through `getSize()`, its own scale factor reads
  1 regardless of the device scale, and the display's true scale is the ratio of that pixel width
  to the captured area's DIP width — the `rect` option's width when given, needing no Electron at
  all, else the owner window's own display scale, read through `Owner.displayScaleFactor`, a seam
  `internal/WebContents.ts` and `internal/GuestView.ts` each supply with a static `electron`
  import, since `core` holds only the raw `WebContents` and stays Electron-free at module scope
  for its fake-native tests. A fix round replaced this wave's own first attempt at that fallback —
  the same lookup behind a dynamic `import("electron")` inside `core` itself — once the review
  found it made the one branch that needs Electron the one branch no unit test could exercise
  either; the seam is proven under Node now, by a fake `Owner` answering a fixed scale.
- The composite fixture captures the window's own base before attaching the guest, by choice, not
  because attaching a full-bounds guest breaks the window's own capture: reproduced twice, once
  against raw Electron and once through `Sewed` itself, a `WebContentsView` attached at a window's
  full bounds never stopped that window's own `capturePage` from working. An earlier draft of this
  record stated a real Electron 44 limit here; it does not reproduce, and is withdrawn.
- The review's own repro for `Renderer.local`'s unguarded `URL` constructor — a bare `%` in an
  ordinary filename — does not throw on this worktree's Node 26.7.0; the WHATWG parser only
  refuses a percent-escape inside a path segment that starts an authority component,
  `"//%zz/..."`, not one that appears anywhere else in an ordinary relative path.

The suite went from 696 tests to 712: two for the HTTP status gate and its stale-generation guard,
four for `local` and `inline`, one for the capture struct's `rect` branch, four for `compose`, one
for the refusal's title/identifier and its cause, three for the TypeScript version check, and one
for the fix round's encoded-slash and bad-path guards.

Known gaps, stated rather than closed:

- The renderer-crash checks in the playground — `webContents.terminate`, `Page.crash`, and the
  responsiveness fixture's hung-renderer recovery — hang on this machine's displays, bare WSLg and
  the isolated Xvfb alike, so this wave gates them behind `SEWED_SKIP_CRASH_CHECKS` and a sweep
  here records their `SKIP` lines rather than passes. The limitation predates this wave: the 20
  September pre-wave log already shows the same `verify:responsiveness` timeout, in a different
  fixture, before wave 3 existed.
- `verify:windows`'s icon check itself passes under the isolated Xvfb display — `setIcon` refusing
  a nonexistent path with `Protocol` — but the same run then fails on an unrelated
  `setBounds`/`setFullScreen` RPC-payload-refusal check: found, closing what this record first
  left "under investigation" — the fixture's `invalidPayload` still expected the `Die` shape a
  client-side payload refusal had before wave 2's `dcb4cd49` turned it into a typed `Protocol`
  refusal; the fixture's expectation was stale by one wave, not this wave's own defect. Fixed in
  the fix round, in the playground (not git).
- No fake-native harness drives `internal/WebContents.ts`'s `load`: no test file builds the
  `webContents(native)` factory the way `webcontents-core.test.ts` builds `core(native, owner)`,
  so the `file:` existence check — and the fix round's `fileURLToPath` guard beside it — is pinned
  by the playground alone, not by a unit test.
- The generation gate `navigated` writes into has a pre-existing blind spot this wave inherits
  rather than introduces: `did-navigate` carries no generation of its own, so an older
  navigation's commit arriving after a newer one has already started settles the older document's
  status and URL, and the gate cannot tell the two navigations apart. Writing status and commit
  together keeps a stale _status_ from ever outliving the generation it belongs to, but that is
  narrower than the gate recognizing a stale _navigation_ — the record's own claim about the
  status field holds only for the reason above, not because the gate sees the whole picture.
- `diagnostics-fixture.mjs` and `webcontents-fixture.mjs` call `forcefullyCrashRenderer` directly,
  ungated, and the responsiveness fixture's own `SEWED_SKIP_CRASH_CHECKS` gate sits behind a first
  stall check that never resolves on this display, so the gate is unreachable and the fixture
  times out before it. The fix round gates all three the same way `webcontents-extras` already
  does (playground, not git; `SKIP` lines recorded in the fix round's own sweep).
- `Image`'s `Native` branch — an Electron throw inside `try`, mapped through `nativeError` — is
  unexercised by any test or probe: provoking it needs an input large enough to make
  `nativeImage`'s own decode, resize, or encode throw, which risks a multi-GB allocation. The
  mapping is correct by inspection, not by a run.
- `load`'s return type moved from `Effect<void, …>` to `Effect<undefined, …>` in the generated
  reference, a side effect of `return yield* Effect.fail(...)` inside its `Effect.gen` body rather
  than a plain `return` — this codebase's own style elsewhere, and accepted as such, but a visible
  public-type change worth naming for a consumer who pattern-matches on it.
- `guest-host.test.ts` and `internal/GuestHost.ts` changed outside the plan's own file lists,
  required by the schema changes to `WebContents.Capture` and the tab's `capture` success type;
  already covered in the wave's own reports, named here for the closing record too.

### Recorded when the fourth fully-on-Sewed wave closed

Every load-bearing fact in entries 50 to 56 was probed against the real mechanism before it was
written, the same discipline entries 46 to 49 followed. What each probe established:

- Every Electron role but `shareMenu` builds on Linux without throwing, carrying Electron's own
  label exactly — the widened union is Electron's 48 minus `shareMenu`, confirmed by a mechanical
  diff against `electron.d.ts`, zero missing and zero extra; a submenu carrying `help` or `window`
  keeps its own items beside the platform's, and `services`/`recentDocuments` are filled entirely
  by macOS, so a nonempty `items` list there is refused at decode, since Linux keeps custom items
  the OS would otherwise drop.
- The document's one runtime store needed more than its first cut: the review reproduced an
  out-of-order nested close orphaning an inner test store onto an already-closed one, and a
  `connect()` landing while a stand-in was still open losing its own registration to the stand-in's
  later restore — both from one `standIn` restore closure that did not check whether the slot it
  was about to overwrite still held what it put there. Splitting the slot into a connected store
  and an array of stand-ins, each close removing its own entry by identity wherever it now sits,
  closed both — and, hand-traced and reproduced, the residual multi-level-unwind gap the review's
  own alternative fix (an identity guard) would still have left.
- `App.dock.setIcon` fails `Native` before its image argument is even evaluated, on the platform
  with no dock, by ordinary JavaScript call-expression evaluation order — `dockOf()`, the callee,
  runs before `nativeImageOf(image, …)`, its argument.
- The permission check handler is consulted once per requested media type with a singular
  `mediaType`; the request handler's own `mediaTypes` array, which Electron's typing carries, was
  not reachable on the probe machine, since it has no media devices and `getUserMedia` never
  resolves or rejects there — so the event's `mediaTypes` list is proven live only along the check
  handler's one-element path.
- `setSimpleFullScreen` is honoured on Linux exactly like ordinary fullscreen, `isSimpleFullScreen()`
  and `isFullScreen()` both answering true afterwards; its distinguishing macOS behavior — no
  Space, which is why a window minimizing to the tray leaves it first — was read from Electron's
  own documentation, not probed here.
- A tray can be constructed under the playground's isolated X11 session with no system tray host
  installed at all, which is what let its own check become a real behavioral one rather than a
  construction-only smoke test; `setTemplateImage` is confirmed a no-op on Linux, matching the
  scout's own earlier probe.
- Two fixes outside the six rulings rode along, both closing gaps a reviewer named. A refusal's
  placeholder text for an untitled `Schema.declare`, `Expected <Declaration>`, is now substituted
  with the found name in place rather than left to repeat beside it — the existing class-field test
  the instruction named turned out never to exercise the placeholder at all, so a new dedicated
  test reproduces the exact pattern instead. `Image.resize`'s `width` and `height` are documented
  as positive integers, so a DIP rectangle that rounds down to an empty area also fails `Protocol`,
  beside the existing fractional-scale rounding note.

The suite went from 716 tests to 751: six for the document store and three more once the review's
fix closed the out-of-order and connect-racing gaps, eight for the menu roles, one for the
refusal's placeholder substitution, seven for the media types (four for the event, three for the
policy), six for the dialog properties, two for simple fullscreen, and two for the tray. The dock
icon added none of its own — `app.dock` is reachable only through real Electron, so the playground
alone carries its proof, as it already did for every other dock operation.

The final review's whole-branch pass found four issues, fixed here. `Binding.ts`'s refusal
formatter substituted the nearest titled ANCESTOR's name into a failing leaf's own
`Expected <Declaration>` text, so a titled `Schema.declare` nested under a differently titled
struct read as the struct's own name rather than its own; `innerNameOfIssue` now resolves the
substitution from the failing leaf alone — or, for a `make`-checked class field, the leaf's own
struct via `fieldAt` — leaving `nameOfIssue`'s ancestor search for the message's prefix alone, so
the two names differ whenever a titled leaf sits under a separately titled ancestor.
`internal/Dialog.ts`'s `present` decoded a dialog's options — including a bad or mode flag inside
`properties` — inside the same `try` block as the native call, so a decode refusal reported
`Native` with the raw `SchemaError` cause rather than `Protocol`; decoding now runs as its own step
before the native call runs, and its own refusal reports `Protocol`. `Menu.ts`'s `SubmenuFields`
required `label` on every submenu, including one carrying a role Electron labels itself
(`services`, `recentDocuments`, `help`, `window`); a role-carrying submenu may now omit `label`,
while a role-less submenu still needs one, enforced at the type level by splitting the open
submenu variant into a role-required, label-optional shape and a role-absent, label-required one.
`@sewed/react/testing`'s `store`'s own JSDoc still described `close()` as unwinding a strict stack,
though an earlier fix in this same wave already let stand-ins close in any order; reworded to
match. `@sewed/react`'s `document()` is renamed `documentStore()` everywhere — source, tests, the
exports contract, the README, and this doc — because it shadowed the DOM's own global `document`
in any renderer module that imported it by name, which the package's own README example did.

The scoped re-review of the fix round found the formatter's placeholder could still reach a message, for a
declaration with no name anywhere, and that a union of an untitled and a titled declaration lent the titled
member's name to the untitled one. Both read "a value of the declared type" now: the leaf's own name fills
the placeholder only when the text holds exactly one.

Known gaps, stated rather than closed:

- The request handler's own `mediaTypes` array stays unproven against real Electron: this
  development machine has no media devices, so `getUserMedia` never resolves or rejects under Xvfb
  within any bounded wait, and the playground drives the check and request handlers directly
  instead of through a real media prompt — only the check handler's singular-to-one-element path is
  exercised live. That same check handler is consulted once per requested media type rather than
  once per request, so a policy rule that narrows `mediaTypes` only ever sees one type at a time
  along this path: "every requested type named" is a request-handler property the check handler's
  own per-type calls cannot exercise, live or in the playground.
- `RuntimeProvider` given no `store` prop is a plain read of `documentStore()`, not a subscription:
  a tree already rendered before a later `connect()` — or an HMR-driven reconnect — keeps whatever
  store it captured at its own last render, and needs something else to force a re-render before it
  sees the new connection. This is a pre-existing class of limitation an explicit `store` prop
  already had; the no-prop path this wave adds is a second way to reach it, not a new one. The
  practical guidance is the same either way: call `connect` before the first render that needs it,
  not after.
- Electron's pre-Lion simple-fullscreen semantics — no Space — are documented from Electron's own
  reference, not probed; this wave, like every one before it, ran on Linux only. Whether macOS
  delivers `enter-full-screen`/`leave-full-screen` for `setSimpleFullScreen` the same way it does
  for ordinary fullscreen is reasoned from Electron's own implementation, not probed here either —
  if it did not, the next geometry or focus event would still refresh `state.simpleFullScreen`,
  since every state read re-derives it from `isSimpleFullScreen()` directly.
- A `help` or `window` role submenu still needs at least one item of its own, the pre-existing
  non-empty rule for every submenu; a macOS Window menu with nothing beyond Electron's own window
  list is expressed with the `windowMenu` leaf role, not an empty `role: "window"` submenu.
- `Image`'s `Native` branch, named as an open gap when wave 3 shipped it, stays unexercised by any
  test or probe this wave either: provoking it still needs an input large enough to make
  `nativeImage`'s own decode, resize, or encode throw, which risks a multi-GB allocation.

### Recorded when the fifth fully-on-Sewed wave closed

Every load-bearing fact in entries 57 to 66 was probed or reproduced against the real mechanism
before it was written, the same discipline entries 50 to 56 followed. What each probe established:

- `Decision.sync`'s own pass-only inference needed a third mechanism; neither of the two candidates
  first proposed survives contact. A default type parameter never applies, because `Decision.Pass`
  is a plain property access that always contributes an inference candidate whether or not a
  default exists, and a second overload reintroduces exactly the broken contextual typing an
  earlier fix round had already removed. `Exclude<Raw, Pass>` computed in the return type, plus one
  cast a contract closes over, is what shipped.
- A repeated `addChildView` on an already-attached `View` reorders it to the topmost position,
  matching Electron's own doc comment, confirmed by reading the previously-unread `View.children`
  array directly — `capturePage()` cannot prove this at all, since a sibling `View` with no
  webContents of its own never appears in a captured bitmap, before or after attaching two
  overlapping ones.
- `getBounds()`/`getVisible()` on a `WebContentsView` answer synchronously, with no `await` needed
  immediately after `setBounds`/`setVisible` — the fact `attachment.current`'s fresh read and the
  four-operation `Effect.runSync` pin both rest on.
- `internal/View.ts`'s own top-level value import of `electron`'s `View`, and
  `internal/Protocol.ts`'s own top-level value import of `{app, protocol}`, each made their module
  unimportable under plain Node, so each made the test this wave asked for — `view.test.ts`,
  `protocol.test.ts` — impossible to write at all until found. Both split the same way earlier
  waves' `internal/Window.ts` already does: construction, or the Electron-only registration
  wrapped around it, stays in the one module that carries the real value import; the rest takes an
  already-constructed native value, or is recombined by a barrel for `sewed/main` alone.
- The connection-loss reorder's first implementation delivered `Unknown` correctly but not
  `Closed`: `RpcClient`'s own resume logic interrupts its internal send-fiber when that fiber is not
  yet done, and for `Closed` the calling fiber IS that not-yet-done fiber, so it interrupted its own
  typed delivery out from under itself. The fix is not the reorder alone but a second split inside
  `Binding.ts`'s `evict()` — the registry removal stays synchronous, only the scope close (and the
  interruption it causes) waits one microtask — found by disabling `onFailure` entirely to confirm
  the interrupt's true source, then discarding a deferred-whole-`onFailure` variant that broke
  reconnect-after-eviction before landing on the two-phase version.
- `Observation.listen`'s `Stream.callback` registers its own subscription asynchronously, so a test
  pushing an `emit` immediately after starting an `observe` stream can lose the first event to a
  race that has nothing to do with the feature under test; the fix is a bounded retry-until-
  subscribed warmup in the test, not a change to `observe` itself.
- A live stream already running in `@sewed/react`'s `useStream` when the shared connection is lost
  now receives the typed `Unknown` cause the transport's own reorder delivers, with no change to
  `useStream` itself: it has always published whatever cause its fiber failed with, through one
  `Effect.catchCause`, and the cause reaching it is now a typed `Fail` rather than a bare
  `Interrupt`. The second fully-on-Sewed wave's own known-gap bullet about this is corrected to say
  so rather than rewritten.

Four fixes rode along beyond entries 57 to 66, three of them consumer asks folded into the same
commits. `Menu.Role` and its own `role` field, `Menu.RoleName`, are now exported directly, so a consumer can
type a role list without reaching into an internal schema. `Dialog.SaveOptions`'s `properties` now
merges a caller's own list with `showOverwriteConfirmation` — deduplicated, even when the caller
names an empty list — rather than replacing it outright, since a caller who named any `properties`
at all previously lost the overwrite prompt silently; the equivalent download save-as door,
`internal/ContentsDownloads.ts`'s own `setSaveDialogOptions`, stays unmerged and undefaulted, its
own separate path. `Image.decode` now takes `Image.Source` — a path or already-encoded bytes,
resolved through the same `nativeImageOf` helper every icon door uses — rather than bytes alone.
`Binding.ts`'s refusal formatter gained two related fixes in the same neighborhood a reviewer's own
instruction led to: a union whose two members resolve to the identical name now joins that name
once rather than repeating it (`"Foo | Foo"`), and a union whose two untitled members share one
field-level name now substitutes that shared name for every placeholder rather than falling back to
the generic phrase purely because more than one placeholder was in the raw formatted text — the
placeholder count is no longer consulted at all; only whether every member's own name agrees is.

The suite went from 756 tests to 795: four apiece for the title stream and `Decision.sync`'s
inference, `Decision.fromRead`, `readBody`, and the one-shot reads and attachment `raise`
(`view.test.ts`'s own three plus one `webcontents-core.test.ts` addition); five for the settled
`back`/`forward`/`go` and its `reason`; twelve for the raw partition and the web-shaped protocol handler, split
across two new files; four for the requests stand-in's `observe`/`emit`; four for the connection-loss
reorder; two more for the refusal formatter's shared-name fix. The Y1–Y3 consumer fixes added no
runtime tests of their own — `Menu.Role`'s export and `Image.decode`'s wider `Source` are pinned by
contracts and the playground; `Dialog.save`'s merge is pinned by the playground alone, since
`internal/Dialog.ts` touches Electron at module scope.

Known gaps, stated rather than closed:

- `Testing.requests()`'s `intercept` does not gain `readBody`: the stand-in has no native upload
  data to assemble one from, and entry 59's own ruling scopes `readBody` to the native request
  stage; a decider tested through the stand-in that calls `.readBody()` fails at runtime with "not a
  function," which no existing stand-in test does.
- `attachment.raise`'s draw order is proven by `View.children`'s own array order rather than a pixel
  sample, since `capturePage()` never reflects a sibling `View` at all; `desktopCapturer` was not
  retried under the playground's own window-manager harness once the `children`-array evidence
  settled the question directly, so whether it would have worked there stays unknown.
- The final review's findings are recorded in the ledger.

What remains the redesign's own: the menu skeleton — features contributing items to a
library-owned anchor structure rather than `App.menu`'s own whole-template replace, an open item
since the fourth wave's own entry 51; deadlines on a stalled call and the full `reason` index with
hints beside each entry, of which this wave's four (`history/no-entry`, `policy/denied`,
`transport/closed-before-send`, `transport/lost-after-send`) are the beginning, not the whole;
`sewed check`, the build-time verification named as unbuilt since the third wave's own entry 47;
what a `Renderer.ready` label proves and whether it is a free string or a declared set per entry;
and governing an allowed popup, an open item unchanged since the decisions wave.

## Still to settle during implementation

- **What an allowed popup is.** `WebContents.Popup` makes renderer-initiated window creation decidable,
  and its fallback denies — but nothing in this redesign says what the window a decider _allows_ should
  be. Today it is a `BrowserWindow` Sewed does not govern: no contents core, so its own navigations,
  popups, webviews and unloads are ungated; no registry entry; no owning scope; and Electron-derived
  `webPreferences`. No step of this redesign covers it — the window work was the decisions wave's own
  step, and the remaining steps are input and download, session policy, request stages, and testing and
  guides. It is opt-in behind a denying fallback, which is why documenting it was enough to ship, but it
  needs a home before any consumer allows a popup in earnest.

- Whether `Renderer.ready` labels are free strings or a declared set per entry.
- Whether the menu skeleton's anchors are fixed by the library or extensible by features.
- How a per-owner capability addresses two owners in one document. One capability is one key, so a
  renderer bound to two windows' controls still needs a hand-written slot per window. Either the key
  gains an owner-scoped suffix or binding keeps taking explicit slots for that case.
- Whether an operation may expose a scoped resource. Operations carry no scope, so a search absorbs
  its own scope inside its stream. That works, but it means a capability cannot hand a caller
  something the caller releases.
- Whether serving a per-owner capability should bound the served owner's lifetime by its owner's.
  Today a composition can hold a live owner over a closed window; its calls fail `Closed` from the
  handler rather than by the connection dropping. Revisit with the failure model, which redefines
  what `Closed` and an unknown outcome mean.
- What to call a per-owner surface's two constructors. `GuestView.make` acquires the view and `GuestView.native` builds its tab capability; both are correct per convention, and the pair still reads oddly at a glance.
- Whether an operation with an empty payload should be callable with no argument. Shell's `beep` reads as `shell.beep({})` today, which is a wart in an API whose point is good DX.
