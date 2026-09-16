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
Capability.serve(Shell): Effect.Effect<Binding.Owner<typeof ShellProtocol>, never, Shell | Scope>;
```

Every consumer writes the same code:

```ts
const shell = yield * Shell;
yield * shell.openExternal({ url });
```

### Rules

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
- Window controls and guest tabs become per-owner capabilities:
  `Capability.serve(WindowControls, { of: window })`, `Capability.serve(GuestTab, { of: guest, policy })`.
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
interface Decidable<Event, Answer, Timing extends "sync" | "async"> {
  readonly key: string;
  readonly event: Schema.Schema<Event>;
  readonly answer: Schema.Schema<Answer>;
  readonly fallback: Answer; // used when no decider answers
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

- `restrictive`: every decider runs and the most restrictive answer wins. Security-sensitive kinds use
  it: permissions, certificates, display media, navigation, downloads, popups, input, preconnect, and
  requests. A feature can therefore add a rule without another feature's rule being skipped, and no
  later decider can widen an earlier denial.
- `first`: the first answer that is not `Decision.Pass` wins. Kinds that express one application
  choice use it: quit, window close, the last-window policy, login, title updates, and unload.

With no answer, the fallback applies. Closing a decider's scope removes it. What a decider denied is
still reported on the owner's `blocked` Event stream. Answer schemas for restrictive kinds declare
their order, so "most restrictive" is data, not a convention.

### Catalog

| Decidable                 | Owner                       | Timing | Fallback                              | Replaces                                                                                                     |
| ------------------------- | --------------------------- | ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `App.Quit`                | app                         | async  | allow                                 | `App.guardQuit`                                                                                              |
| `App.LastWindowClosed`    | app                         | sync   | quit                                  | `App.run({ quitOnLastWindowClosed })`                                                                        |
| `App.Login`               | app                         | async  | cancel                                | `App.login`                                                                                                  |
| `App.CertificateError`    | app                         | async  | reject                                | `App.run({ certificateErrors })`                                                                             |
| `Window.Close`            | window                      | async  | allow                                 | `window.guardClose`                                                                                          |
| `WebContents.Navigation`  | renderer and guest contents | sync   | entry document only                   | `setNavigationPolicy` (both schemas become one `Navigation.Policy` with origin, document, and pattern rules) |
| `WebContents.Popup`       | contents                    | sync   | deny                                  | fixed denial                                                                                                 |
| `WebContents.Download`    | contents                    | sync   | deny for guests, prompt for renderers | `downloads(decide)`; accepted downloads stay an Event stream of `Download.Handle`                            |
| `WebContents.TitleUpdate` | contents                    | sync   | keep the main title                   | new (section E)                                                                                              |
| `WebContents.Unload`      | contents                    | sync   | honor the page                        | new (`will-prevent-unload`)                                                                                  |
| `WebContents.Input`       | guest contents              | sync   | allow                                 | guest `input` and `setInputPolicy`                                                                           |
| `Session.Permission`      | session                     | sync   | deny                                  | `Session.setPermissions`                                                                                     |
| `Session.Preconnect`      | session                     | sync   | allow                                 | `Session.setPreconnect`                                                                                      |
| `Session.Request`         | session                     | async  | allow                                 | `Session.intercept` (filters and body options stay)                                                          |
| `Session.Certificate`     | session                     | async  | system verdict                        | `Session.setCertificatePolicy`                                                                               |
| `Session.DisplayMedia`    | session                     | async  | deny                                  | `Session.setDisplayMedia`                                                                                    |

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
5. **Budgets in the playground.** Stable metrics fail the harness on regression: bundle bytes for the
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
  recorder, and `Testing.decide(decidable, event)` to exercise installed deciders without Electron.

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

## Still to settle during implementation

- The exact restrictive order for each answer schema (for example `deny` over `prompt` over `allow`).
- Whether `Renderer.ready` labels are free strings or a declared set per entry.
- Whether the menu skeleton's anchors are fixed by the library or extensible by features.
