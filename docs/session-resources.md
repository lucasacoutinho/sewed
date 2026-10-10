# Session protocols and downloads

Serve application URLs and handle downloads within a browser session. Declare shared protocol and download contracts through the `Protocol` and `Download` exports from `sewed`.

Register native handlers and perform session operations through `sewed/main`. Those operations require `MainContext`; the shared definitions can be imported by renderers and workers too.

## Privileged protocols

Create a scheme definition with `Protocol.scheme`:

```ts
const assets = Protocol.scheme("assets", {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  corsEnabled: true,
  stream: true,
  serviceWorkers: true,
  codeCache: true,
});
```

The value is an opaque, inert definition. `Protocol.declare(...schemes)` is the
declaration `App.run` applies before readiness:

```ts
App.run([Protocol.declare(assets)], program);
```

Registration is process-wide and one-shot. Names must be lowercase and match
`[a-z][a-z0-9+.-]*`; duplicate, reserved, unknown, and unsupported definitions
fail during startup. The accepted privilege names map to Electron's
`Privileges` fields. `serviceWorkers` maps to Electron's
`allowServiceWorkers`; a CSP bypass privilege is not exposed.
Electron 44 requires `codeCache` to be used with `standard`; invalid combinations
fail at the registration boundary.

Install a handler against an acquired `Session.Handle` in a scoped main effect:

```ts
yield *
  Protocol.handle(session, assets, (request) => Effect.succeed(HttpServerResponse.text("ready")));
```

The handler receives Effect's `HttpServerRequest` and returns an Effect HTTP
response. The native adapter captures the handler context, including services
and the request scope. A request scope remains open while a response body is
being consumed and closes at end of body, response-stream cancellation, handler
failure, or registration cleanup. Handler failures return a generic HTTP 500. Cleanup failures surface when the
owning registration scope closes. The adapter admits at most 128 active requests per registration;
additional requests receive HTTP 503.

`Protocol.handle` installs `session.protocol.handle` and removes it when its
owning scope closes. Cleanup first rejects new requests, unhandles the scheme,
then closes active request scopes and their body readers.

`Protocol.handleWeb(session, scheme, handler)` takes the web's own shape instead:
`handler` is `(request: Request) => Response | Promise<Response>`, the same
`Request`/`Response` a browser's own `fetch` handler speaks, with no
`HttpServerRequest`/`HttpServerResponse` wrapping and no Effect requirement —
useful for a handler that is really a thin proxy, chaining its own `fetch`:

```ts
yield * Protocol.handleWeb(session, assets, (request) => fetch(upstream(request.url), request));
```

`request.signal` aborts on the native request's own cancellation, on the
registration's own scope closing while the call is still in flight, on a
handler that throws or whose returned promise rejects, and when the page
cancels the response body it was handed — never merely because the handler
returned. A body-less response finishes the request at once, with no abort; a
response carrying a body is rebuilt around a stream that pulls from the
handler's own reader and finishes, still with no abort, once that reader
reports it is done. A proxy handler chaining its own
`fetch(upstream, { signal: request.signal })` therefore keeps reading the
upstream body for exactly as long as the page keeps reading the response it
was handed, and that upstream call is cancelled only when one of the four
triggers above actually fires — not the instant the handler itself returns.
A handler that throws or whose returned promise rejects answers the same
generic HTTP 500 a `Protocol.handle` handler's own failure does; the same
128-active-request admission and HTTP 503 overflow apply. `handleWeb` and
`handle` are two names, not one overload, because a caller passing `(request)
=> Response` and a caller passing `(request) => Effect<HttpServerResponse>`
cannot be told apart by parameter position alone.

Electron's [protocol adapter](https://github.com/electron/electron/blob/main/lib/browser/api/protocol.ts)
constructs its request without forwarding the caller's abort signal. Aborting a
fetch after response headers destroys its response stream and closes the Sewed
request scope. Before headers, the handler remains owned by the registration
until it finishes or that scope closes. Bound potentially unending handler work
with `Effect.timeout`; cancelling the client is not a deadline for that work.
The external native fixture records both cases. When using Electron's main-side
`session.fetch`, abort its request with an `AbortController`; discarding its body
reader alone does not establish network cancellation.

## Downloads

Download acquisition is main-only and scoped:

```ts
const download =
  yield *
  Download.start(session, {
    url: "https://example.test/archive.zip",
    savePath: "/tmp/archive.zip",
  });
```

`url` must be an absolute URL and `savePath` must be absolute according to the
running platform's `path.isAbsolute`. Optional headers are passed to Electron's
`webContents.downloadURL` call.

Each acquisition owns one unattached Electron 44 `WebContentsView` configured
with the supplied session, sandbox, context isolation, and disabled Node
integration. It does not create a window or load a document. The adapter listens
to that session's `will-download` event and accepts an item only when Electron's
third argument is the exact private `webContents` identity. It calls
`setSavePath` synchronously inside that event, before allowing the item to
continue. `Download.start` returns its pending handle before that event arrives. This identity check keeps
simultaneous downloads of the same URL and foreign session downloads independent.
Each session admits at most 128 pending or active acquisitions.

`handle.snapshot` returns the latest state. `handle.progress` replays the
current state, then emits progress updates and the terminal state. Each
subscriber retains two pending updates; slow consumers can skip superseded progress. A native
`updated` event with `interrupted` is represented as an active resumable phase;
only the native `done` event produces a terminal `interrupted` outcome. Late
subscribers receive the latest state and a completed stream receives its terminal
state before ending.

`pause` and `resume` call the native item operations and refresh `canResume` and
`paused`. `cancel` requests native cancellation; `awaitDone` resolves with a
tagged `completed`, `cancelled`, or `interrupted` outcome. Cancelling a pending
handle before its native item arrives produces `cancelled` and disposes its
private contents. Native failures are
reported as `SewedError` values. There are no automatic retries and partial files
are not deleted by the adapter. Pause and resume on a terminal handle fail with
`Closed`, because the native item is no longer an active resource.

Closing the owning scope cancels a pending or active native item, closes the
private contents and listeners, ends progress subscribers, and releases the
per-session reservation. Waiting operations fail with `Closed`; scope cleanup
does not manufacture a native interrupted outcome. Operations on a closed handle
fail `Closed`, while an explicit `cancel` after closure is idempotent.

Downloads a document starts are separate from `Download.start`. `Decidables.WebContents.Download`
decides them — install a decider through `webContents.decide` or a guest's own
`guest.webContents.decide` with a `Download.Decision` answer — and a renderer's `webContents.downloads`
and a guest view's `downloads` are the plain streams of what a decider accepted; see
[web contents lifecycle](webcontents-lifecycle.md) and
[guest views](guest-views.md).

The implementation follows Electron's [privileged protocol API](https://www.electronjs.org/docs/latest/api/protocol),
[session protocol handlers](https://www.electronjs.org/docs/latest/api/session#sesprotocol),
and [DownloadItem API](https://www.electronjs.org/docs/latest/api/download-item).
The separate playground exercises these APIs through `pnpm verify:session-resources`
against the installed package.
