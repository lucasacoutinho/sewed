import { Effect, Schema, Stream, SubscriptionRef } from "effect";
import type { Scope } from "effect";
import {
  Certificate,
  Decidables,
  Decision,
  MainContext,
  Navigation,
  Permission,
  SewedError,
  WebRequest,
} from "sewed";
import { App, CommandLine, DesktopCapturer, Gpu, Paths, Protocol, Session } from "sewed/main";
import type { BrowserWindow, GuestView } from "sewed/main";
import * as Testing from "sewed/testing";

/**
 * Guide examples are not type-checked where they are written. This file holds the **natural
 * spelling** of each guide's main example — unannotated exactly as the guide writes it — so a
 * signature change breaks this build instead of leaving a guide quietly wrong. Each section names
 * its guide, and each example is the one a reader would copy first.
 *
 * Two liberties, both deliberate. A `yield*` example is wrapped in the `Effect.gen` it would be
 * written inside, since a guide elides the surrounding program. And handles a guide already has in
 * hand (`window`, `guest`, `session`) are `declare const` here rather than acquired, which is what
 * the surface contract files beside this one already do.
 */

declare const window: BrowserWindow.Handle;
declare const guest: GuestView.Handle;
declare const session: Session.Handle;
declare const root: string;
declare const join: (...parts: readonly string[]) => string;
declare const fingerprint: string;
declare const traceId: string;
declare const allowedOrigins: ReadonlySet<string>;
declare const locked: SubscriptionRef.SubscriptionRef<{ readonly locked: boolean }>;
declare const sync: { readonly pending: Effect.Effect<boolean> };
declare const request: WebRequest.RequestEvent;

type Program<A = void> = Effect.Effect<A, SewedError, MainContext | Scope.Scope>;

// --- docs/native-policy.md --------------------------------------------------------------------

// "Write a feature against the door it needs and nothing more."
const allowDocs = (contents: Decision.Owner<"contents">) =>
  contents.decide(
    Decidables.WebContents.Navigation,
    Decision.policy(Navigation.Policy, [{ kind: "origin", origin: "https://docs.example" }]),
  );

// The application's door is a free function, so a feature written against `Decision.Owner<"app">`
// is handed `{ decide: App.decide }`. The guide shows this; nothing else in the repository does.
const stayOpen = (app: Decision.Owner<"app">) =>
  app.decide(
    Decidables.App.Quit,
    Decision.async(() => Effect.map(sync.pending, (busy) => (busy ? "deny" : Decision.Pass))),
  );
export const nativePolicyAppDoor: Program = stayOpen({ decide: App.decide });

// A synchronous decider reads main-owned state through `fromState`, and passes when it has no
// opinion.
export const nativePolicyTiming: Program = Effect.gen(function* () {
  const contents = window.webContents;
  yield* contents.decide(
    Decidables.WebContents.Input,
    Decision.fromState(locked, (state) => (state.locked ? "block" : Decision.Pass)),
  );
});

// One worked example per composition: `first`, `restrictive`, `chain`.
export const nativePolicyCompositions: Program = Effect.gen(function* () {
  yield* App.decide(
    Decidables.App.LastWindowClosed,
    Decision.sync(() => "quit"),
  );
  yield* session.decide(
    Decidables.Session.Permission,
    Decision.sync(({ name, origin }) =>
      name === "notifications" && origin === "https://app.example" ? "allow" : Decision.Pass,
    ),
  );
  yield* session.intercept(
    Decidables.Session.RequestHeaders,
    { urls: ["https://*.example.com/*"] },
    Decision.sync(({ headers }) => ({
      kind: "headers",
      headers: { ...headers, "x-trace": traceId },
    })),
  );
});

// Grant against cap: the same decidable, the two spellings the guide contrasts.
export const nativePolicyGrant = Decision.sync(
  ({ name, origin }: { readonly name: string; readonly origin: string | null }) =>
    name === "geolocation" && origin === "https://maps.example" ? "allow" : Decision.Pass,
);
export const nativePolicyCap = Decision.sync(({ origin }: { readonly origin: string | null }) =>
  origin !== null && allowedOrigins.has(origin) ? "allow" : "deny",
);

// A policy takes rule data alone, and a navigation policy accepts both rule shapes.
export const nativePolicyPolicies: Program = Effect.gen(function* () {
  const contents = window.webContents;
  yield* contents.decide(
    Decidables.WebContents.Navigation,
    Decision.policy(Navigation.Policy, [
      { kind: "origin", origin: "https://example.com" },
      "https://*.example.com/*",
    ]),
  );
});

// The request-stage example, with its required filter.
export const nativePolicyRequestStage: Program = Effect.gen(function* () {
  yield* session.intercept(
    Decidables.Session.Request,
    { urls: ["https://*.tracker.example/*"], types: ["xhr", "script"] },
    Decision.sync(() => ({ kind: "block" })),
  );
});

// The testing example: a feature written against the door takes a stand-in.
export const nativePolicyTesting: Effect.Effect<
  "allow" | "deny",
  SewedError,
  MainContext | Scope.Scope
> = Effect.gen(function* () {
  const contents = Testing.contents({ of: "window" });
  yield* allowDocs(contents);
  return yield* contents.resolve(Decidables.WebContents.Navigation, {
    url: "https://docs.example/start",
    kind: "navigation",
  });
});

// A consumer declares their own grant list the same way the three shipped policies are declared.
export const TenantPolicy = Decision.definePolicy({
  rules: Schema.Array(Schema.Struct({ tenant: Schema.String })),
  compile: (rules) => (event: { readonly url: string }) =>
    rules.some(({ tenant }) => event.url.startsWith(`https://${tenant}.example/`))
      ? "allow"
      : Decision.Pass,
});
export const nativePolicyOwnPolicy: Program = window.webContents.decide(
  Decidables.WebContents.Navigation,
  Decision.policy(TenantPolicy, [{ tenant: "acme" }]),
);

// --- docs/app-lifecycle.md --------------------------------------------------------------------

declare const editor: { readonly unsaved: Effect.Effect<boolean> };

export const appLifecycleCloseAndQuit: Program = Effect.gen(function* () {
  yield* window.decide(
    Decidables.Window.Close,
    Decision.async(() => Effect.map(editor.unsaved, (dirty) => (dirty ? "deny" : Decision.Pass))),
  );
  yield* App.decide(
    Decidables.App.Quit,
    Decision.async(() => Effect.map(sync.pending, (busy) => (busy ? "deny" : Decision.Pass))),
  );
  yield* App.decide(
    Decidables.App.LastWindowClosed,
    Decision.sync(() => "quit"),
  );
  yield* App.decide(
    Decidables.App.CertificateError,
    Decision.policy(Certificate.Policy, [
      { hostname: "internal.example.com", trust: { fingerprint } },
    ]),
  );
});

// --- docs/app-lifecycle.md --------------------------------------------------------------------

declare const launcherChecks: Effect.Effect<void, SewedError, MainContext>;
declare const focusMainWindow: Effect.Effect<void, SewedError>;

// "Claim the instance when the program chooses; a secondary process catches the failure and quits."
export const appLifecycleClaim: Effect.Effect<void, SewedError, MainContext | Scope.Scope> =
  Effect.gen(function* () {
    yield* launcherChecks;
    const instance = yield* App.claimInstance({ data: { source: "desktop" } });
    yield* instance.launches.pipe(
      Stream.runForEach(() => focusMainWindow),
      Effect.forkScoped,
    );
  }).pipe(Effect.catchTag("SecondaryInstance", () => App.quit));

// The declarations section's entry: declarations run in order before readiness, the claim above
// runs as the program.
declare const osLocale: () => string;
declare const sessionDataPath: string;
const jobwright = Protocol.scheme("jobwright", {
  standard: true,
  secure: true,
  supportFetchAPI: true,
});
App.run(
  [
    Protocol.declare(jobwright),
    () => CommandLine.declare({ name: "lang", value: osLocale() }),
    Paths.declare({ sessionData: sessionDataPath }),
    Gpu.declare({ acceleration: true }),
  ],
  appLifecycleClaim,
);

// --- docs/application-menus.md ----------------------------------------------------------------

// "Acquire the menu in the program; observe its selections from the handle."
export const applicationMenusExample: Program = Effect.gen(function* () {
  const menu = yield* App.menu({
    items: [
      {
        kind: "submenu",
        label: "&Window",
        items: [
          {
            kind: "command",
            id: "show",
            label: "Show window",
            accelerator: "CommandOrControl+Shift+S",
          },
          { kind: "role", role: "close" },
        ],
      },
      { kind: "role", role: "editMenu" },
    ],
  });
  yield* menu.selections.pipe(
    Stream.runForEach((selection) =>
      selection.kind === "command" && selection.id === "show" ? window.show : Effect.void,
    ),
    Effect.forkScoped,
  );
});

// --- docs/webcontents-lifecycle.md ------------------------------------------------------------

export const webContentsDecidables: Program = Effect.gen(function* () {
  yield* window.webContents.decide(
    Decidables.WebContents.Navigation,
    Decision.policy(Navigation.Policy, [{ kind: "origin", origin: "https://example.com" }]),
  );
});

// --- docs/guest-views.md ----------------------------------------------------------------------

export const guestInputAndDownloads: Program = Effect.gen(function* () {
  yield* guest.webContents.decide(
    Decidables.WebContents.Input,
    Decision.sync(() => "allow"),
  );
  yield* guest.webContents.decide(
    Decidables.WebContents.Download,
    Decision.sync((offer) =>
      offer.mimeType === "application/pdf"
        ? { kind: "save", path: join(root, offer.filename) }
        : Decision.Pass,
    ),
  );
});

// --- docs/sessions.md -------------------------------------------------------------------------

export const sessionsPermission: Program = Effect.gen(function* () {
  yield* session.decide(
    Decidables.Session.Permission,
    Decision.policy(Permission.Policy, [
      { kind: "origin", origin: "https://example.com", permissions: ["notifications"] },
    ]),
  );
});

// --- docs/session-extras.md -------------------------------------------------------------------

declare const reputation: { readonly check: (url: string) => Effect.Effect<boolean, Error> };

export const sessionExtrasInterception: Program = Effect.gen(function* () {
  yield* session.intercept(
    Decidables.Session.Request,
    { urls: ["https://*.example.com/*"], types: ["xhr", "script"] },
    Decision.sync((incoming) => (incoming.method === "DELETE" ? { kind: "block" } : Decision.Pass)),
  );
  yield* session.intercept(
    Decidables.Session.RequestHeaders,
    { urls: ["https://*.example.com/*"] },
    Decision.sync(({ headers }) => ({
      kind: "headers",
      headers: { ...headers, "x-trace": traceId },
    })),
  );
  // A decider that can wait on anything bounds its own liveness, and the timeout blocks.
  yield* session.intercept(
    Decidables.Session.Request,
    { urls: ["https://*.example.com/*"] },
    Decision.async((incoming) =>
      Effect.gen(function* () {
        const safe = yield* reputation.check(incoming.url).pipe(Effect.timeout(500), Effect.orDie);
        return safe ? Decision.Pass : { kind: "block" };
      }),
    ),
  );
});

// --- docs/platform-surfaces.md ----------------------------------------------------------------

export const platformDisplayMedia: Program = Effect.gen(function* () {
  yield* session.decide(
    Decidables.Session.DisplayMedia,
    Decision.async((incoming) =>
      Effect.map(DesktopCapturer.sources({ types: ["screen"] }), (found) =>
        incoming.userGesture && found[0] !== undefined
          ? { kind: "source" as const, id: found[0].id }
          : Decision.Pass,
      ).pipe(Effect.orDie),
    ),
  );
});

// --- docs/testing.md --------------------------------------------------------------------------

const blockTrackers = (requests: Decision.Requests) =>
  requests.intercept(
    Decidables.Session.Request,
    { urls: ["https://*.tracker.example/*"] },
    Decision.sync(() => ({ kind: "block" })),
  );

export const testingGuideStandIn: Effect.Effect<
  WebRequest.RequestDecision,
  SewedError,
  MainContext | Scope.Scope
> = Effect.gen(function* () {
  const requests = Testing.requests();
  yield* blockTrackers(requests);
  return yield* requests.resolve(Decidables.Session.Request, request);
});

// The chain half of the stand-in, which the model guide describes beside `resolve`.
export const testingGuideChain: Effect.Effect<
  Decision.ChainOutcome<WebRequest.RequestHeaders, WebRequest.RequestHeadersDecision>,
  never,
  never
> = Testing.requests().resolveChain(Decidables.Session.RequestHeaders, {
  id: 1,
  url: "https://api.example.com/v1",
  method: "GET",
  resourceType: "xhr",
  referrer: "",
  timestamp: 0,
  headers: {},
});

// --- what the guides promise must not compile -------------------------------------------------

// The owner rule, which every guide states and links to: a decidable installs on its own owner.
Effect.gen(function* () {
  // @ts-expect-error A window's close guard does not install on its web contents.
  yield* window.webContents.decide(Decidables.Window.Close, Decision.pass);
});
Effect.gen(function* () {
  yield* session.intercept(
    // @ts-expect-error A session's own decidable does not go through the filtered door.
    Decidables.Session.Permission,
    { urls: ["<all_urls>"] },
    Decision.pass,
  );
});
// A synchronous decidable refuses a decider that could suspend, as the timing section says.
export const guideSyncCannotSuspend = Decision.sync<{ readonly url: string }, "allow" | "deny">(
  // @ts-expect-error A synchronous decider returns the answer, never an Effect.
  () => Effect.succeed("allow"),
);
// `Schema` is imported for the negative below, which needs a decidable outside the catalog.
const Invented = Decision.decidable({
  key: "session/invented-stage",
  owner: "requests",
  event: Schema.Struct({ url: Schema.String }),
  answer: Schema.Literals(["allow", "block"]),
  fallback: "allow",
  failure: "block",
  timing: "async",
  composition: "restrictive",
  order: ["block", "allow"],
});
Effect.gen(function* () {
  // A decidable outside the catalog type-checks and is refused at run time on this door, which is
  // what the model guide means by a stage `intercept` refusing one outright.
  yield* Testing.requests().intercept(Invented, { urls: ["<all_urls>"] }, Decision.pass);
});
