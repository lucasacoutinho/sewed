import { Context, Effect, Scope, Stream } from "effect";
import {
  Binding,
  Certificate,
  Cookie,
  Extension,
  MainContext,
  Proxy,
  Renderer,
  ServiceWorker,
  SewedError,
  WebRequest,
} from "sewed";
import { Session } from "sewed/main";

class Audit extends Context.Service<Audit, { readonly note: (line: string) => void }>()(
  "session-extras/Audit",
) {}

declare const session: Session.Handle;
const entry = Renderer.entry(new URL("file:///renderer.html"), { bindings: [] });

// Cookies are a handle over the session; hosting them takes an origin policy.
const cookies: Session.Cookies = Session.cookies(session);
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
const CookieJar = Binding.slot("cookie-jar", Cookie.protocol);
const hosted = Effect.gen(function* () {
  const owner = yield* Session.hostCookies(session, [
    { kind: "origin", origin: "https://example.com" },
  ]);
  return Binding.to(CookieJar, owner);
});
void read;
void write;
void changes;
void hosted;
// @ts-expect-error Cookie access is main-owned.
Renderer.run(entry, read);
// @ts-expect-error Cookie policies are origins, not documents.
Session.hostCookies(session, [{ kind: "document", url: "https://example.com/page" }]);

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
const certificates: Effect.Effect<void, SewedError, MainContext> = Session.setCertificatePolicy(
  session,
  [
    { hostname: "*.internal.example", trust: "always" },
    { hostname: "pinned.example", trust: { fingerprint: "sha256/abc" } },
  ],
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
void certificates;
void extension;
void running;
void events;

// @ts-expect-error Proxy modes are a closed set.
Session.setProxy(session, { mode: "manual" });
// @ts-expect-error Certificate trust is a closed set.
Session.setCertificatePolicy(session, [{ hostname: "a", trust: "never" }]);
// @ts-expect-error Loading an extension requires a scope.
const unscopedExtension: Effect.Effect<Extension.Info, SewedError, MainContext> =
  Session.loadExtension(session, "/opt/extension");
void unscopedExtension;
const config: Proxy.Config = { mode: "direct" };
const rule: Certificate.Rule = { hostname: "example.com", trust: "system" };
void config;
void rule;

// Device permissions ride on the existing permission policy.
Session.setPermissions(session, [
  { kind: "origin", origin: "https://example.com", permissions: ["hid", "serial", "usb"] },
]);
