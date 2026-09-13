# Session cookies, interception, and settings

`sewed/main` extends a selected `Session.Handle` with the rest of Electron's
session surface. Every operation requires `MainContext`, validates its input
before Electron runs, and fails with `Protocol` for invalid input, `Native`
for Electron failures, and `Limit` when an observer's queue overflows.

## Cookies

`Session.cookies(session)` returns an inert handle with `get(filter)`,
`set(details)`, `remove(url, name)`, `flush`, and a `changes` stream of
`Cookie.Change` values. Each observer owns its native listener and a queue of
128 changes. `Session.hostCookies(session, policy)` hosts the same operations
for bound renderers within a list of origins: reads and writes need a URL
inside the policy, and the change stream only carries cookies whose domain
belongs to a policy origin.

```ts
const jar =
  yield * Session.hostCookies(session, [{ kind: "origin", origin: "https://app.example" }]);
yield * window.webContents.load(entry, { bindings: [Binding.to(CookieJar, jar)] });
```

## Request interception

`Session.intercept(session, rules)` installs Effect deciders on a filter for
the caller's scope. The filter uses Chromium match patterns such as
`https://*.example.com/api/*` or `<all_urls>` plus optional resource types;
`WebRequest.compilePattern` is the same matcher the library applies, exported
so applications can test their patterns.

```ts
yield *
  Session.intercept(session, {
    filter: { urls: ["https://*.example.com/*"], types: ["xhr", "script"] },
    request: (request) =>
      Effect.succeed(request.method === "DELETE" ? { kind: "block" } : { kind: "allow" }),
    requestHeaders: ({ headers }) =>
      Effect.succeed({ kind: "headers", headers: { ...headers, "x-trace": traceId } }),
    responseHeaders: () => Effect.succeed({ kind: "allow" }),
  });
```

A decider runs in main with the services the installing Effect had, so it
can read application state or log through its own layers. Decisions are data:
`allow`, `block`, `redirect` for requests; `allow`, `block`, or replacement
`headers` for request and response headers, with an optional `statusLine` on
responses. Several intercepts can be installed on one session: each stage runs
the matching deciders in installation order, the first block or redirect wins,
header decisions chain, and a decider that fails or dies blocks its request
and logs the cause. Electron allows one native listener per stage, so the
library keeps one listener over the union of the installed filters and
dispatches to the intercepts whose own filter matches. Closing the scope
removes the deciders and reinstalls the remaining ones.

`Session.requests(session, filter)` is the observation tap beside interception: a
stream of the stages deciders never see, with headers sent, response started,
redirects, completion, and errors for the requests the filter selects, each
carrying the request fields and the cache flag. It shares the one-listener-per-
stage registry with interception and gives every observer its own bounded
queue.

A filter may ask for the request stage's upload data with `body`: `maxBytes`
caps the bytes the decider receives and `blobs` selects `resolve`, which reads
blob parts through the session and counts them, or `reference`, which keeps
their ids and counts nothing. A part is kept only when it fits the remaining
budget; the first part that does not ends the body as `truncated`. File parts
are metadata the library never reads, and a request without upload data gets
an empty body. Every request stage also carries `sourceId`, the id of the Sewed
window, view, or guest whose contents issued it, so a decider can scope to one
tab:

```ts
yield *
  Session.intercept(session, {
    filter: {
      urls: ["https://jobs.example.com/apply/*"],
      types: ["mainFrame", "xhr"],
      body: { maxBytes: 4_000_000, blobs: "resolve" },
    },
    request: (request) =>
      request.sourceId === guest.id && request.method === "POST"
        ? Effect.map(grant.matches(request.body), (ok) =>
            ok ? { kind: "allow" } : { kind: "block" },
          )
        : Effect.succeed({ kind: "allow" }),
  });
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

## Certificates and devices

`Session.setCertificatePolicy(session, rules)` decides certificates per
hostname: `system` keeps Chromium's verdict, `always` accepts the host, and a
`fingerprint` accepts only that certificate. Hostnames are exact or a `*.`
suffix, hosts without a rule keep Chromium's verdict, and an empty policy
restores native verification. The rule is a narrowing tool for pinned or
internal hosts, not a general bypass.

HID, serial, and USB device access joins the permission policy: a rule that
lists `hid`, `serial`, or `usb` for an origin grants that origin's device
requests, and everything else is denied. Display media selection is not
covered; it needs a source picker that belongs to the application.

## Extensions and service workers

`Session.loadExtension(session, directory, options)` loads an unpacked
extension for the caller's scope and returns its `Extension.Info`; closing
the scope unloads it. Electron only loads extensions into persistent
sessions, so a memory session fails with `Protocol` before Electron runs. `Session.serviceWorkers(session)` reports the running
workers and streams registration and running-status events with the same
bounded observers as the other streams.

## Verification

The external playground's `pnpm verify:session-extras` drives cookies
directly and through a bound client, blocks, redirects, and rewrites headers
on real requests from a loaded document, sets and resolves a direct proxy,
round-trips the spell checker, cache, user agent, and download path, installs
and clears a certificate policy, loads and unloads an unpacked extension, and
subscribes to service worker events.
