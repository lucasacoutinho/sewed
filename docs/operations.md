# Networking, power, logging, and tracing

`sewed/main` covers Electron's operational modules as ordinary Effect
resources and layers.

## Networking

`Net.layer(options)` provides Effect's `HttpClient` over Electron's `net.fetch`,
so application code written against Effect's client gains Chromium's proxy,
certificate, cookie, and interception behavior without touching Electron.
Pass `session` to route requests through one session's cookies, cache,
proxy, and intercepts, and `bypassCustomProtocolHandlers` to skip handlers
registered with `Protocol.handle`. Failures are Effect's `HttpClientError`
with Electron's cause attached; building the layer requires `MainContext`.

```ts
const program = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const response = yield* http.get("https://api.example.com/status");
  return yield* response.json;
}).pipe(Effect.scoped, Effect.provide(Net.layer({ session })));
```

`Net.online` reports Chromium's connectivity guess and `Net.resolveHost`
resolves a host through Chromium's resolver, returning endpoints with their
address family.

## Power

`PowerSaveBlocker.hold(kind)` holds `prevent-app-suspension` or
`prevent-display-sleep` for the caller's scope and releases it on close; the
handle's `active` reports whether Electron still holds the block.

## Logging and tracing

`NetLog.record(path, options)` writes Chromium's network log to an absolute
path for the scope's lifetime. Electron keeps one log at a time, so a second
recording fails with `Limit` until the first scope closes.
`ContentTracing.record(path, options)` records a Chromium trace with the
given categories and mode and writes it to the path when `stop` runs or the
scope closes; `ContentTracing.categories` and `bufferUsage` report what is
available and how full the buffer is.

## Verification

The external playground's `pnpm verify:operations` fetches through the net
layer directly and through a session with its cookies, holds and releases a
power save block, records and stops a net log and a trace, and checks that
concurrent net logs fail with `Limit`.
