# Platform-specific surfaces

These surfaces exist in the types on every platform and fail with `Native`
where Electron does not implement them, so an application can compile once
and branch on the failure instead of on `process.platform`.

## System preferences

`SystemPreferences.animation` is available everywhere and reports rich
animation, system scroll animation, and reduced motion. `accentColor`,
`appearance`, `mediaAccess(kind)`, `askForMediaAccess(kind)`, `color(name)`,
and `systemColor(name)` cover Windows and macOS; Electron leaves their
functions undefined elsewhere and the library reports that as `Native`.
`SystemPreferences.changes` streams accent and theme color changes with the
usual bounded observers.

## Desktop capture

`DesktopCapturer.sources(options)` lists capturable screens and windows with
PNG thumbnails and optional icons. Screen sharing itself is a session
decidable: `session.decide(Decidables.Session.DisplayMedia, decider)` installs
an async decider that receives the requesting origin and flags and answers
with one source id, with optional system audio, or a denial, for the caller's
scope. The decider runs with the installing Effect's services, so it can show
an application-owned picker; without a decider, and when a decider fails, the
request is denied. There is no `null`-removal path; closing the decider's own
scope is what removes it.

## Touch Bar

`window.touchBar.set(options)` builds a macOS Touch Bar from inert data:
buttons, labels, spacers, sliders, segmented controls, color pickers, and
nested popovers and groups, with item ids unique across the whole bar.
`window.touchBar.interactions` streams clicks, slider values, segment
selections, and colors by item id, and `clear` removes the bar. Both
operations fail with `Native` outside macOS.

## Share sheet, store, and push

`window.menu.share(item, position)` opens the macOS share sheet for URLs,
file paths, or texts. `InAppPurchase` covers payment availability, products,
purchases, finishing and restoring transactions, the receipt URL, and a
transactions stream. `PushNotifications.register` returns the APNS device
token, `unregister` drops it, and `notifications` streams received payloads
as JSON. All of them fail with `Native` outside macOS.

## Verification

The external playground's `pnpm verify:platform` runs on Linux, so it proves
the animation query, capture source listing with thumbnails, the display media
decider receiving a real `getDisplayMedia` request, input validation, and the
`Native` gating of every macOS and Windows operation. The macOS and Windows
behavior itself still needs runs on those platforms.
