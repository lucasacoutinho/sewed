# Explicit browser storage clearing

Clear browser data for one origin or selected storage kinds across a session. Main chooses the session and the data to remove, whether you are signing an account out or resetting a preview.

```ts
yield *
  session.clearStorage({
    kind: "origin",
    origin: "https://example.com",
    storages: ["localstorage", "indexdb"],
  });

yield *
  session.clearStorage({
    kind: "session",
    storages: ["cookies"],
  });
```

`SessionStorage.ClearOptions` is an inert schema from `sewed`. Every operation requires a nonempty storage selection. Origin clearing accepts a canonical non-opaque origin and supports local storage, IndexedDB, service workers and cache storage. Session-wide clearing additionally supports cookies, filesystem storage and shader cache. These are browser storage categories, not arbitrary filesystem paths or the network HTTP cache.

Cookie scope differs from browser origin scope, so the API only offers session-wide cookie clearing. It does not imply that a hostname cookie belongs to one port or one document. Native storage names, including Electron's `indexdb` spelling, are retained.

`session.clearStorage(options)` requires `MainContext` and resolves when Electron's clearing promise resolves. Invalid inputs fail before invocation. Native errors use `SewedError` code `Native` with their original cause. Unknown option fields do not reach Electron.

The operation has no native abort facility. Interruption abandons the caller's wait; it does not undo or stop a clearing operation already in progress. There is no retry, automatic session destruction or clearing on window/scope exit. Pages can write new data after clearing, so callers choose whether to close or reload active documents for their own workflow.

The external session fixture uses temporary profiles to check selective clearing, origin/session separation, preservation of other stores, validation and native failure handling. It follows Electron's [clearStorageData API](https://github.com/electron/electron/blob/main/docs/api/session.md#sesclearstoragedataoptions).
