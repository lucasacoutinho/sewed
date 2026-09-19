import { Context, Effect, Layer, Scope, Stream } from "effect";
import {
  Binding,
  Certificate,
  Cookie,
  Decidables,
  Decision,
  Extension,
  MainContext,
  Net,
  Proxy,
  Renderer,
  ServiceWorker,
  SewedError,
  WebRequest,
} from "sewed";
import { Capability, Cookies, Session } from "sewed/main";
import * as Testing from "sewed/testing";

class Audit extends Context.Service<Audit, { readonly note: (line: string) => void }>()(
  "session-extras/Audit",
) {}

declare const session: Session.Handle;
const entry = Renderer.entry(new URL("file:///renderer.html"), { bindings: [] });

// Cookies are a handle over the session; hosting them takes an origin policy.
const cookies: Session.Cookies = session.cookies;
// @ts-expect-error Session.cookies is gone; cookie access is a property on the handle.
Session.cookies(session);
const read: Effect.Effect<readonly Cookie.Cookie[], SewedError, MainContext> = cookies.get({
  url: "https://example.com",
});
const write: Effect.Effect<void, SewedError, MainContext> = cookies.set({
  url: "https://example.com",
  name: "token",
  value: "1",
  sameSite: "lax",
});
const changes: Stream.Stream<Cookie.Change, SewedError, MainContext> = cookies.changes;
const hosted = Effect.gen(function* () {
  const owner = yield* Capability.serve(Cookie.capability).pipe(
    Effect.provide(Cookies.native(session, [{ kind: "origin", origin: "https://example.com" }])),
  );
  return Binding.to(Cookie.capability.slot, owner);
});
void read;
void write;
void changes;
void hosted;
// @ts-expect-error Cookie access is main-owned.
Renderer.run(entry, read);
// @ts-expect-error Cookie policies are origins, not documents.
Cookies.native(session, [{ kind: "document", url: "https://example.com/page" }]);

// A session's cookies are one capability. Unlike the ambient surfaces, its native Layer threads
// the acquired session handle; it keeps the main requirement, and the memory Layer needs neither.
const cookieNative: Layer.Layer<typeof Cookie.capability, SewedError, MainContext> = Cookies.native(
  session,
  [{ kind: "origin", origin: "https://example.com" }],
);
void cookieNative;

// @ts-expect-error The native cookie Layer cannot be built without the main runtime.
const cookieNativeWithoutMain: Layer.Layer<typeof Cookie.capability, SewedError> = Cookies.native(
  session,
  [],
);
void cookieNativeWithoutMain;

// The memory Layer provides the same capability plus its recorder, and needs no session at all.
const cookieMemory: Layer.Layer<typeof Cookie.capability | Testing.Recorder, SewedError> =
  Testing.Cookies.memory([{ kind: "origin", origin: "https://example.com" }]);
void cookieMemory;

// An operation carries no runtime requirement: acquiring the capability is what proved it.
const cookieCall = Effect.gen(function* () {
  const jar = yield* Cookie.capability;
  const found: Effect.Effect<readonly Cookie.Cookie[], SewedError> = jar.get({
    filter: { url: "https://example.com" },
  });
  yield* jar.set({ details: { url: "https://example.com", name: "token", value: "1" } });
  yield* jar.remove({ url: "https://example.com", name: "token" });
  yield* jar.flush();
  return yield* found;
});
const cookieProgram: Effect.Effect<readonly Cookie.Cookie[], SewedError, MainContext> =
  cookieCall.pipe(Effect.provide(cookieNative));
void cookieProgram;

// @ts-expect-error The removed hosted owner is gone; there is no Session.hostCookies.
Session.hostCookies(session, []);

// Interception installs deciders on a filter for a scope and carries their requirements.
const intercept: Effect.Effect<void, SewedError, MainContext | Scope.Scope | Audit> =
  Session.intercept(session, {
    filter: { urls: ["https://*.example.com/api/*"], types: ["xhr"] },
    request: (request) =>
      Effect.map(Audit, ({ note }) => {
        note(request.url);
        return request.method === "DELETE"
          ? ({ kind: "block" } satisfies WebRequest.RequestDecision)
          : ({ kind: "allow" } satisfies WebRequest.RequestDecision);
      }),
    requestHeaders: ({ headers }) =>
      Effect.succeed<WebRequest.RequestHeadersDecision>({
        kind: "headers",
        headers: { ...headers, "x-sewed": "1" },
      }),
    responseHeaders: () => Effect.succeed<WebRequest.ResponseDecision>({ kind: "allow" }),
  });
void intercept;
const plain: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = Session.intercept(
  session,
  {
    filter: { urls: ["<all_urls>"] },
    request: () => Effect.succeed({ kind: "block" }),
  },
);
void plain;
// @ts-expect-error Interception requires a scope.
const unscoped: Effect.Effect<void, SewedError, MainContext> = Session.intercept(session, {
  filter: { urls: ["<all_urls>"] },
});
void unscoped;
Session.intercept(session, {
  filter: { urls: ["<all_urls>"] },
  // @ts-expect-error Decisions are a closed set.
  request: () => Effect.succeed({ kind: "rewrite" }),
});

// Observation of the request stages deciders never see is a stream over the same filter, now a
// method on the handle rather than a free function.
const observed: Stream.Stream<WebRequest.Event, SewedError, MainContext> = session.requests({
  urls: ["<all_urls>"],
  types: ["xhr"],
});
void observed;
// @ts-expect-error Request observation retains main placement.
Renderer.run(entry, Stream.runDrain(session.requests({ urls: ["<all_urls>"] })));
// @ts-expect-error Session.requests is gone; request observation is a method on the handle.
Session.requests(session, { urls: ["<all_urls>"] });

// Settings are commands and queries with main placement.
const proxy: Effect.Effect<void, SewedError, MainContext> = Session.setProxy(session, {
  mode: "fixed_servers",
  proxyRules: "socks5://127.0.0.1:1080",
});
const proxied: Effect.Effect<string, SewedError, MainContext> = Session.resolveProxy(
  session,
  "https://example.com",
);
const spell: Effect.Effect<Session.SpellChecker, SewedError, MainContext> =
  Session.spellChecker(session);
const setSpell: Effect.Effect<void, SewedError, MainContext> = Session.setSpellChecker(session, {
  enabled: true,
  languages: ["en-US"],
});
const cache: Effect.Effect<number, SewedError, MainContext> = Session.cacheSize(session);
const clear: Effect.Effect<void, SewedError, MainContext> = Session.clearCache(session);
const agent: Effect.Effect<string, SewedError, MainContext> = Session.userAgent(session);
const setAgent: Effect.Effect<void, SewedError, MainContext> = Session.setUserAgent(
  session,
  "Sewed/1",
  "en-US",
);
const downloads: Effect.Effect<void, SewedError, MainContext> = Session.setDownloadPath(
  session,
  "/tmp/downloads",
);
const extension: Effect.Effect<Extension.Info, SewedError, MainContext | Scope.Scope> =
  Session.loadExtension(session, "/opt/extension", { allowFileAccess: false });
const workers: Session.ServiceWorkers = Session.serviceWorkers(session);
const running: Effect.Effect<readonly ServiceWorker.Info[], SewedError, MainContext> =
  workers.running;
const events: Stream.Stream<ServiceWorker.Event, SewedError, MainContext> = workers.events;
void proxy;
void proxied;
void spell;
void setSpell;
void cache;
void clear;
void agent;
void setAgent;
void downloads;
void extension;
void running;
void events;

// @ts-expect-error Proxy modes are a closed set.
Session.setProxy(session, { mode: "manual" });
// @ts-expect-error Loading an extension requires a scope.
const unscopedExtension: Effect.Effect<Extension.Info, SewedError, MainContext> =
  Session.loadExtension(session, "/opt/extension");
void unscopedExtension;
const config: Proxy.Config = { mode: "direct" };
const rule: Certificate.Rule = { hostname: "example.com", trust: "system" };
void config;
void rule;

// Permission checks, and HID/serial/USB device checks, are one decidable now — a session's own
// registry decides them, installed for the caller's scope through `session.decide`.
const permission: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = session.decide(
  Decidables.Session.Permission,
  Decision.sync(({ name }) =>
    name === "hid" || name === "notifications" ? "allow" : Decision.Pass,
  ),
);
void permission;
session.decide(
  Decidables.Session.Permission,
  // @ts-expect-error An async decider cannot install on the sync-timing Permission decidable.
  Decision.async(() => Effect.succeed("allow" as const)),
);
// @ts-expect-error setPermissions is gone; permission checks are now Decidables.Session.Permission.
Session.setPermissions(session, [
  { kind: "origin", origin: "https://example.com", permissions: ["hid", "serial", "usb"] },
]);

// `document` is `null` for a device check and a string for a document-scoped permission check, so a
// decider must handle both before it can grant by document — the type, not prose, is what forces
// this. `origin` is always present, so an origin-scoped grant needs no null check at all.
const permissionByOrigin: Effect.Effect<void, SewedError, MainContext | Scope.Scope> =
  session.decide(
    Decidables.Session.Permission,
    Decision.sync(({ origin }) => (origin === "https://app.example" ? "allow" : Decision.Pass)),
  );
void permissionByOrigin;
const permissionByDocument: Effect.Effect<void, SewedError, MainContext | Scope.Scope> =
  session.decide(
    Decidables.Session.Permission,
    Decision.sync(({ document }) =>
      document !== null && document.startsWith("https://app.example/") ? "allow" : Decision.Pass,
    ),
  );
void permissionByDocument;
session.decide(
  Decidables.Session.Permission,
  Decision.sync((event) =>
    // @ts-expect-error document is `string | null`; a device check's null would throw here unchecked.
    event.document.startsWith("https://app.example/") ? "allow" : Decision.Pass,
  ),
);

// Certificate verification is a decidable too; `trust`, `reject`, and `system` map onto
// `setCertificateVerifyProc`'s numeric callback, and the fallback keeps Chromium's own verdict.
const certificateDecision: Effect.Effect<void, SewedError, MainContext | Scope.Scope> =
  session.decide(
    Decidables.Session.Certificate,
    Decision.async(({ hostname, certificate }) =>
      Effect.succeed(
        hostname.endsWith(".internal.example") || certificate.fingerprint === "sha256/abc"
          ? "trust"
          : Decision.Pass,
      ),
    ),
  );
void certificateDecision;
session.decide(
  Decidables.Session.Certificate,
  // @ts-expect-error Certificate answers are a closed set.
  Decision.async(() => Effect.succeed("never")),
);
// @ts-expect-error setCertificatePolicy is gone; certificates are now Decidables.Session.Certificate.
Session.setCertificatePolicy(session, [{ hostname: "a.example", trust: "always" }]);

// Network controls for managed browsing sessions. Preconnect is a decidable now too, and
// `closeAllConnections`, `resolveHost`, and `blobData` are methods on the handle.
const preconnect: Effect.Effect<void, SewedError, MainContext | Scope.Scope> = session.decide(
  Decidables.Session.Preconnect,
  Decision.sync(() => "deny"),
);
void preconnect;
// @ts-expect-error setPreconnect is gone; preconnects are now Decidables.Session.Preconnect.
Session.setPreconnect(session, false);
const closeConnections: Effect.Effect<void, SewedError, MainContext> = session.closeAllConnections;
const resolvedHost: Effect.Effect<Net.ResolvedHost, SewedError, MainContext> = session.resolveHost(
  "localhost",
  { cacheUsage: "disallowed", queryType: "A" },
);
const blob: Effect.Effect<Uint8Array, SewedError, MainContext> = session.blobData("blob-uuid");
void closeConnections;
void resolvedHost;
void blob;
// @ts-expect-error Cache usage is a closed set.
void session.resolveHost("localhost", { cacheUsage: "never" });
// @ts-expect-error Session.closeAllConnections is gone; it is a property on the handle.
Session.closeAllConnections(session);
// @ts-expect-error Session.resolveHost is gone; it is a method on the handle.
Session.resolveHost(session, "localhost");
// @ts-expect-error Session.blobData is gone; it is a method on the handle.
Session.blobData(session, "blob-uuid");
