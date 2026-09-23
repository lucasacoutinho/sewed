# Session cookies, interception, and settings

`sewed/main` extends a selected `Session.Handle` with the rest of Electron's
session surface. Every operation requires `MainContext`, validates its input
before Electron runs, and fails with `Protocol` for invalid input, `Native`
for Electron failures, and `Limit` when an observer's queue overflows.

## Cookies

`session.cookies` is an inert handle with `get(filter)`,
`set(details)`, `remove(url, name)`, `flush`, and a `changes` stream of
`Cookie.Change` values. Each observer owns its native listener and a queue of
128 changes. Those are main-only operations.

The cookie surface is one capability, scoped to a session rather than ambient,
so its Layer takes the acquired handle beside the policy.
`Cookies.native(session, policy)` provides it in main,
`Capability.serve(Cookie.capability)` turns that Layer into an owner a document
binds to, and `Testing.Cookies.memory(policy)` provides the same capability in a
Node test with no session at all. Reads and writes need a URL inside the policy,
the change stream only carries cookies whose domain belongs to a policy origin,
and flushing asks the policy nothing. An invalid policy fails with `Protocol`
while the Layer builds.

```ts
const jar =
  yield *
  Capability.serve(Cookie.capability).pipe(
    Effect.provide(Cookies.native(session, [{ kind: "origin", origin: "https://app.example" }])),
  );
yield * window.webContents.load(entry, { bindings: [Binding.to(Cookie.capability.slot, jar)] });
```

## Request interception

A session's three request stages are decidables —
`Decidables.Session.Request`, `Decidables.Session.RequestHeaders`, and
`Decidables.Session.ResponseHeaders` — and
`session.intercept(decidable, filter, decider)` installs one decider on one of
them, for the requests one filter selects, for the caller's scope. The filter
uses Chromium match patterns such as `https://*.example.com/api/*` or
`<all_urls>` plus optional resource types; `WebRequest.compilePattern` is the
same matcher the library applies, exported so applications can test their
patterns. The model behind all three — deciders, timing, composition, fallback
against failure, and scope — is [the decision model](native-policy.md); this
section is what the three of them decide.

```ts
yield *
  session.intercept(
    Decidables.Session.Request,
    { urls: ["https://*.example.com/*"], types: ["xhr", "script"] },
    Decision.sync((request) => (request.method === "DELETE" ? { kind: "block" } : Decision.Pass)),
  );
yield *
  session.intercept(
    Decidables.Session.RequestHeaders,
    { urls: ["https://*.example.com/*"] },
    Decision.sync(({ headers }) => ({
      kind: "headers",
      headers: { ...headers, "x-trace": traceId },
    })),
  );
```

A decider with no opinion about a request answers `Decision.Pass`, leaving the
remaining deciders and the stage's own fallback to answer; that is what lets two
features install on the same stage without either knowing the other exists. A
decider that must refuse whatever anyone else says answers `{ kind: "block" }`,
and no other decider can widen it. See [the decision model](native-policy.md)
for when each of those is the right spelling.

The filter is a separate, required argument rather than part of the decidable
because it is a cost rather than a key: a filter over every URL routes every
request in the session through the main process, and naming the scope at the
call site is what keeps that visible. Each install carries its own, and a
decider is never asked about a request its own filter does not select.

An asynchronous decider runs in main with the services the installing Effect
had, so it can read application state or log through its own layers, and those
services reach the installing Effect's own requirements. Decisions are data:
`allow`, `block`, `redirect` for requests; `allow`, `block`, or replacement
`headers` for request and response headers, with an optional `statusLine` on
responses.

How several deciders on one stage combine is declared on the decidable rather
than left to whoever resolves it:

| Stage                     | Several deciders                                                                 | Nobody answered | A decider failed |
| ------------------------- | -------------------------------------------------------------------------------- | --------------- | ---------------- |
| `Session.Request`         | most restrictive wins: `block` beats `redirect` beats `allow`                    | `allow`         | `block`          |
| `Session.RequestHeaders`  | chains: each sees the headers the previous produced                              | `allow`         | `block`          |
| `Session.ResponseHeaders` | chains, and a `statusLine` one decider set survives a later headers-only decider | `allow`         | `block`          |

Chaining is what a ranking cannot express: two `headers` answers rank equal, so
one feature's headers would silently vanish. A `block` from any decider ends
the chain and cancels the request, leaving later deciders unconsulted. On every
stage, a decider that fails, dies, or answers off-schema blocks its request and
logs the cause — a gate that crashed established nothing.

A decider that never _settles_ is a different matter, and **liveness is the
decider's own responsibility**. The library imposes no deadline: a request whose
decider never completes is never answered rather than blocked, the page
waits, and closing the installing scope does not release it. Bound a decider
that can wait on anything — a network call, a lock, a prompt — with
`Effect.timeout`, and let the timeout failure block:

```ts
yield *
  session.intercept(
    Decidables.Session.Request,
    { urls: ["https://*.example.com/*"] },
    Decision.async((request) =>
      Effect.gen(function* () {
        const safe = yield* reputation.check(request.url).pipe(Effect.timeout(500), Effect.orDie);
        return safe ? Decision.Pass : { kind: "block" };
      }),
    ),
  );
```

`Effect.orDie` is what turns the timeout into a failed decider, which blocks —
the same closed answer a crashing decider gets. Leaving it out would leave the
timeout for the decider to handle itself, which is where it started.

Electron allows one native listener per stage per session, so the library keeps
one listener over the union of the installed filters and recomputes it on every
install and every removal; a stage with no decider left has no listener at all.
Closing one scope removes that decider alone: the other stages, and the other
deciders on the same stage, keep deciding. A registration Electron refuses
fails that install by itself and leaves the stage's other deciders installed:
the library re-registers the surviving installs' listener rather than assume
Electron left the previous one in place, an assumption that holds only for
the native filter's own `"other"`-throwing case above — a bad `urls` pattern
throws too, but only after Electron has already discarded the old listener.
On Electron 44 on Linux, Sewed's own `urls` schema currently accepts a few
patterns Electron refuses at registration, among them a non-standard scheme
such as `custom://host/*` and a port outside 0-65535 such as
`https://example.com:99999/*`; both now fail with a typed error instead of
silencing every other decider on the stage.

A filter's `urls` scheme matters: `<all_urls>` is everything a webRequest hook
can see at all, WebSocket handshakes included — a `ws:` or `wss:` upgrade
reports `resourceType: "webSocket"`, and `<all_urls>` delivers it like any
other request. A bare `*` scheme, as in `*://*/*`, means http and https
**only**, so it silently excludes WebSocket, `file:`, and `data:` requests; a
rule meant to see everything says `<all_urls>`, not `*://*/*`. A filter's
`types` list is the same union one layer down: an install naming no `types`
asks for every resource type, and so does an install naming `"other"` —
Electron's own native filter throws on the literal `"other"`, so once any
install on a stage asks for it, the native filter drops its type restriction
entirely for the whole stage, and Sewed's own per-install matching narrows
back down to exactly the types each decider asked for.

`session.requests(filter)` is the observation tap beside interception: a
stream of the stages deciders never see, with headers sent, response started,
redirects, completion, and errors for the requests the filter selects, each
carrying the request fields and the cache flag. It keeps the same one-listener-
per-stage discipline over its own observation stages and gives every observer
its own bounded queue.

A `Session.Request` filter may ask for the request's upload data with `body`:
`maxBytes` caps the bytes the decider receives and `blobs` selects `resolve`,
which reads blob parts through the session and counts them, or `reference`,
which keeps their ids and counts nothing. A part is kept only when it fits the
remaining budget; the first part that does not ends the body as `truncated`.
A resolved blob part keeps its `id` beside its `bytes`, so a rule that would
refuse the blob by id can still recognize it after resolution. File parts are
metadata the library never reads, and a request without upload data gets an
empty body. Only the installs whose own filter asked for a body pay to
assemble one eagerly, a blob is read at most once per request however many
installs ask, and a body that cannot be read fails that decider, which blocks
the request. The two header stages carry no upload data at all and refuse a
filter that asks for a body with `Protocol` rather than ignoring it. That
once-per-request cache belongs to `body`/`readBody` alone and shares nothing
with `session.blobData` below, so a decider that reads a blob through one and
then the other still reads Electron's blob twice — and Electron's blob reads
only once, so the second read fails.

The event also carries `readBody(options?)`, which assembles the same way but
lazily: an install over `<all_urls>` pays for a body only on the request whose
decider actually calls it. A field left out of `options` takes the install's
own `body` filter option when it named one, else `{ maxBytes: 3_000_000,
blobs: "reference" }`. Unlike the install-time `body` option, `readBody` fails
`Limit` rather than truncating, since a decider that explicitly asked should
not mistake a partial body for the whole one — discharge it with `Effect.orDie`
if the decider has no use for that distinction:

```ts
yield *
  session.intercept(
    Decidables.Session.Request,
    { urls: ["<all_urls>"] },
    Decision.async((request) =>
      request.readBody({ maxBytes: 3_000_000, blobs: "resolve" }).pipe(
        Effect.map((body) => (body.parts.length > 0 ? { kind: "block" } : Decision.Pass)),
        Effect.orDie,
      ),
    ),
  );
```

Every request stage also carries `sourceId`, the id of the Sewed window, view,
or guest whose contents issued it, so a decider can scope to one tab:

```ts
yield *
  session.intercept(
    Decidables.Session.Request,
    {
      urls: ["https://jobs.example.com/apply/*"],
      types: ["mainFrame", "xhr"],
      body: { maxBytes: 4_000_000, blobs: "resolve" },
    },
    Decision.async((request) =>
      request.sourceId === guest.id && request.method === "POST"
        ? Effect.map(grant.matches(request.body), (ok) => (ok ? Decision.Pass : { kind: "block" }))
        : Effect.succeed(Decision.Pass),
    ),
  );
```

## Proxy, spell checker, cache, user agent, downloads

`Session.setProxy(session, config)` takes one of the `Proxy.Config` modes
and `Session.resolveProxy(session, url)` reports the proxy string Chromium
would use. `Session.spellChecker` reads the enabled flag, selected languages,
and available languages, and `Session.setSpellChecker` updates the first
two. `Session.cacheSize` and `Session.clearCache` cover the HTTP cache,
`Session.userAgent` and `Session.setUserAgent` the session-wide user agent,
and `Session.setDownloadPath` the default download directory, which must be
absolute.

## Permissions, certificates, and display media

`session.decide` installs a decider for one of `Decidables.Session`'s
decidables against the session's own registry, for the caller's scope. Any
number of deciders may be installed on the same decidable, and any number of
sessions each keep their own independent registry; the decidable's own
composition decides among the deciders installed on one.

Only `Decidables.Session`'s decidables install here: a decider installs on
the owner that resolves its event, and installing one elsewhere is a compile
error. See [the decision model](native-policy.md) for deciders, timing,
composition, fallback against failure, and scope.

`Decidables.Session.Permission` is asked for each permission check or
request, and for each HID, serial, or USB device check, which shares the same
decidable: `name` is the permission or device type Electron reports, and
`document` is the requesting document's key for a permission check or `null`
for a device check, which Electron identifies by origin only. `origin` is
`null` too, for any document whose origin is opaque — `file:`, `data:`, or an
unregistered scheme — since Electron's own `URL.origin` for those is the
literal string `"null"`, which is not an identity: every `file:` document in
an app shares it, so granting on it would grant every one of them. Both
fields are `string | null` rather than a bare string that reuses one shape
for two different things: without them told apart, a decider granting by
`document` could not tell a document key from an origin, and
`document.startsWith(origin)` would silently grant a device check too; the
same reasoning is why an opaque `origin` is `null` rather than the string
`"null"` a decider could mistake for a real value. Grant an opaque document
by `document`, never by `origin`. Rules grant access only to the current
main-frame document; subframes, requests without a live `WebContents`, and a
mismatched requesting origin never reach a decider at all — they deny before
any decision runs, the same way they always have. With no decider installed,
or when every installed decider fails or answers off-schema, the fallback
denies.

```ts
yield *
  session.decide(
    Decidables.Session.Permission,
    Decision.policy(Permission.Policy, [
      { kind: "document", url: "https://example.com/app", permissions: ["notifications"] },
    ]),
  );
```

`Permission.Policy` is declared once, with `Decision.definePolicy`, by the
`Permission` module itself; a caller installs it with rule data alone through
the two-argument `Decision.policy(kind, rules)`. It names the least it needs
from an event: an **origin** rule is answered from `origin` alone and misses
when it is `null`; a **document** rule is answered only from `document`, so a
device check (`document: null`) is never granted by a document rule, even one
whose document happens to key the same origin.

`Permission.Policy` is a grant, like every policy: a decider that answered
`"deny"` on a miss instead of passing would outrank and revoke every other
decider's `"allow"`, for every permission and origin rather than the one it had
an opinion about. That veto is a cap, and it is written as a plain
`Decision.sync` decider when it is meant. See
[grant or cap](native-policy.md#grant-or-cap).

`Decidables.Session.Preconnect` is asked for each of the renderer's
speculative preconnections; the fallback allows them, matching a session's
previous default, and its declared failure denies, which costs a
preconnection's latency and nothing else.
`Decidables.Session.Certificate` is asked for each server certificate
verification: an async decider answers `"trust"`, `"reject"`, or `"system"`,
which map onto `setCertificateVerifyProc`'s numeric `0`, `-2`, and `-3`
callback. With no decider installed there is no proc at all, so the
verification is not Sewed's to answer and Chromium's own verdict runs
unmediated; that is what its fallback (`"system"`) means. A decider that is
installed and then _fails_ is a different case, and this decidable declares
`"reject"` for it: a broken fingerprint pin must not silently become no pin
by deferring to the CA validity the pin exists to distrust. A decider that
needs a fallible native call must empty its own error channel first
(`Effect.orDie`, for one) — a decidable's own `Effect` never carries a typed
failure, so a decider that dies is treated exactly like one that throws or
answers off-schema: it contributes the decidable's declared failure, or its
fallback where none is declared, and is logged.
`Certificate.Policy`'s own rules are a bare hostname the WHATWG host parser
can canonicalize — no scheme, port, or path — with an internationalized host
written in its punycode (`xn--`) form, since that is the spelling Chromium
itself reports and a Unicode one would never match.

`Decidables.Session.DisplayMedia` is asked for each screen-share request; an
async decider answers `{ kind: "deny" }` or `{ kind: "source", id, audio? }`,
picking one of `DesktopCapturer.sources` or denying. With no decider
installed there is no handler at all, so the request is not Sewed's to
answer and Electron's own default handling applies — in practice a failed
request, since Electron has no built-in picker; once a decider is installed
and later fails, the handler itself still exists, so its fallback denies.
There is no separate setter and no `null`-removal path; closing the
decider's own scope is what removes it, the same as any other decidable.

The certificate proc and the display-media handler are both installed only
while a `Session.Certificate` or `Session.DisplayMedia` decider exists: the
first `decide` call on either installs the matching native handler, and
closing the last decider's own scope removes it again, restoring Electron's
own default handling. A session with no interest in certificates or screen
sharing carries neither handler at all, the same as before this decidable
model existed. The permission handlers and the preconnect listener stay
installed for the session's whole lifetime, since deciding "no opinion" for
those two is itself the default every session already needs.

```ts
yield *
  session.decide(
    Decidables.Session.DisplayMedia,
    Decision.async((request) =>
      Effect.map(DesktopCapturer.sources({ types: ["screen"] }), (found) =>
        request.userGesture && found[0] !== undefined
          ? { kind: "source" as const, id: found[0].id }
          : Decision.Pass,
      ).pipe(Effect.orDie),
    ),
  );
```

## Extensions and service workers

`Session.loadExtension(session, directory, options)` loads an unpacked
extension for the caller's scope and returns its `Extension.Info`; closing
the scope unloads it. Electron only loads extensions into persistent
sessions, so a memory session fails with `Protocol` before Electron runs. `Session.serviceWorkers(session)` reports the running
workers and streams registration and running-status events with the same
bounded observers as the other streams.

## Connections, host resolution, and blobs

`session.closeAllConnections` closes every open connection, for example after
the session's proxy changes. `session.resolveHost(host, options)` resolves
through the session's own resolver with Chromium's `queryType`, `source`,
`cacheUsage`, and `secureDnsPolicy` options and returns the `Net.ResolvedHost`
shape; `cacheUsage: "disallowed"` skips cached answers. `session.blobData(id)`
reads one upload blob, so a request decider that asks for `blobs: "reference"`
controls when, and in what order, blobs are read. Invalid arguments fail with
`Protocol`, and a native failure fails with `Native` and keeps its cause. On
Electron 44 on Linux, a response that was still streaming stayed open after
`closeAllConnections`, both through Sewed and through Electron directly, so do
not rely on it to end in-flight streams. The playground could not observe
preconnects to loopback hosts, so it verifies `Decidables.Session.Preconnect`
only as a setting.

## Verification

The external playground's `pnpm verify:session-extras` drives cookies
directly and through a bound client, blocks, redirects, and rewrites headers
on real requests from a loaded document, sets and resolves a direct proxy,
round-trips the spell checker, cache, user agent, and download path, installs
and removes a certificate decider, loads and unloads an unpacked extension,
and subscribes to service worker events.
