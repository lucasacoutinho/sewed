# Browser permissions and navigation

Main assigns declarative permission rules to a selected session. Sewed installs both Electron permission handlers when it first acquires that session. Newly acquired sessions and the default session selected by a Sewed window deny permissions until main grants them.

```ts
const session = yield * Session.fromPartition({ kind: "memory", name: "preview" });
yield *
  Session.setPermissions(session, [
    { kind: "origin", origin: "https://example.com", permissions: ["notifications"] },
    { kind: "document", url: view.url.href, permissions: ["fullscreen"] },
  ]);
const window = yield * BrowserWindow.make({ session });
```

An origin is a canonical non-opaque origin such as `https://example.com`; it has no path, credentials or wildcard. A document rule selects an HTTP, HTTPS or file URL, including its query string and excluding its fragment. This supports local packaged pages without treating every `file:` document as one origin.

`Permission.Policy` is an inert root-package schema. Rules currently support notifications, geolocation, fullscreen, pointer lock, media, clipboard read/write, persistent storage, screen wake lock, and HID, serial, and USB device access, which Electron asks about through its device permission handler with the requesting origin. Native permission names are preserved in the schema. `media` grants the combined native media permission; camera-only or microphone-only rules are not provided. Operating-system consent and feature support still apply.

Rules grant access only to the current main-frame document. Subframes, requests without a live WebContents, unknown permission names and mismatched document/origin metadata are denied. Permission callbacks make synchronous decisions from a copied policy; they never run asynchronous user code.

`Session.setPermissions(handle, policy)` requires `MainContext` and returns an Effect with `SewedError`. Invalid updates preserve the previous policy. An empty array denies future checks and requests. The policy is an application-lived session setting; caller-scope closure does not restore it. Updating a policy does not promise to terminate previously granted device access. Sewed owns these two native handlers for acquired sessions; native code must not replace them behind the library.

## Navigation and window creation

Sewed windows deny renderer-initiated `window.open` creation. Main creates native windows explicitly through `BrowserWindow.make`.

By default, main-frame navigation may return to the explicitly loaded entry document at its current same-document URL; History API and fragment changes move that URL without leaving the document. Other main-frame destinations and redirects require a rule:

```ts
yield *
  window.webContents.setNavigationPolicy([
    { kind: "document", url: "https://example.com/signed-in" },
  ]);
```

`WebContents.NavigationPolicy` uses the same origin/document rule shapes. Policy updates require main and fail on a closed window. Invalid updates preserve the previous rules. Explicit main-owned `load` remains available, while redirects from that load still check the destination policy. Subframe navigation is outside this policy; subframes never receive a Sewed bridge or permission grants from these rules.

Nothing the policy denies is an error in main. `window.webContents.blocked` is an observation stream of `WebContents.Blocked` values, `{ kind, url }`, for each popup, `<webview>`, main-frame navigation, and redirect the policy prevented, and for each download a running `downloads` decider denied. Each observer owns a bounded queue and fails with `Limit` when it overflows, and the stream ends when the web contents closes. Main's explicit `load` is not a page-started navigation and never appears there.

Allowing navigation does not grant RPC bindings. The bridge remains tied to its configured document at its current same-document URL, and full navigation disconnects its old clients. To bind a new document, main explicitly loads its `Renderer.entry` with the selected owners. Redirected documents likewise need an explicit bound load of their final URL.

The APIs follow the pinned [Electron permission contract](https://github.com/electron/electron/blob/v44.3.0/docs/api/session.md) and [navigation/window-opening events](https://www.electronjs.org/docs/latest/api/web-contents). The external session fixture distinguishes real browser checks from injected native callback metadata. It checks denial, granting, replacement, isolation, subframes, navigation, redirects and explicit rebinding on Linux/X11.
