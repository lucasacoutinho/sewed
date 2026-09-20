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
    appearing in the same list fails `Startup` with the message `registerSchemes` already produces for a
    second registration attempt. `registerSchemes` itself stops being public, since `declare` is now the
    only door onto it. Cost if wrong: a public `registerSchemes` sitting beside `declare` would let a
    consumer call Electron's one-shot registration twice through two different paths, one of them outside
    `App.run`'s ordering and failure handling entirely.
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
