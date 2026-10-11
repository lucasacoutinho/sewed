# Platform-specific surfaces

Add platform features such as system preferences, a dock, or a Touch Bar through `sewed/main`. The APIs share types across platforms, so your application can compile once.

Availability follows Electron. An unsupported operation fails with `Native`, which you can handle where you choose the feature's fallback.

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
an asynchronous decider that receives the requesting origin and flags and
answers with one source id, with optional system audio, or a denial, for the
caller's scope. The decider runs with the installing Effect's services, so it
can show an application-owned picker.

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

Without a decider there is no handler at all, so the request is not Sewed's to
answer and Electron's own default handling applies; once a decider is installed
and later fails, the handler itself still exists and its fallback denies. There
is no `null`-removal path; closing the decider's own scope is what removes it.
See [the decision model](native-policy.md) for composition, fallback, and
scope.

## Touch Bar

`window.touchBar.set(options)` builds a macOS Touch Bar from inert data:
buttons, labels, spacers, sliders, segmented controls, color pickers, and
nested popovers and groups, with item ids unique across the whole bar.
`window.touchBar.interactions` streams clicks, slider values, segment
selections, and colors by item id, and `clear` removes the bar. Both
operations fail with `Native` outside macOS.
Closing the window ends active interaction subscriptions on every platform.

A touch bar also takes a `scrubber` item, a scrollable strip whose selection and highlight
arrive as `scrubber` interactions with the item's index, and an `other-items-proxy` item that
marks where the system's own items go.

## Share sheet, store, and push

`window.menu.share(item, position)` opens the macOS share sheet for URLs,
file paths, or texts. `InAppPurchase` covers payment availability, products,
purchases, finishing and restoring transactions, the receipt URL, and a
transactions stream. `PushNotifications.register` returns the APNS device
token, `unregister` drops it, and `notifications` streams received payloads
as JSON. All of them fail with `Native` outside macOS.

## Members that exist on macOS or Windows only

Electron implements a good part of its API on one or two platforms. Sewed exposes those members
under the same handles and modules as everything else, and each one fails with `Native`, naming
the platforms it exists on, wherever Electron does not implement it. Input is still validated
first, so a bad argument is `Protocol` on every platform.

### Windows

A window handle has, on macOS and Windows, `setFocusable` with `focusable`, and `contentProtected`.

On macOS it has `setRepresentedFilename` with `representedFilename`, `setDocumentEdited` with
`documentEdited`, `setVibrancy` over `WindowControls.Vibrancy`, `setWindowButtonPosition` with
`windowButtonPosition`, `setSheetOffset`, `previewFile` and `closeFilePreview`,
`setHiddenInMissionControl` with `hiddenInMissionControl`, `setAutoHideCursor`, `invalidateShadow`,
`setExcludedFromShownWindowsMenu` with its read, and `tabs` for native window tabs: `identifier`,
`selectNext`, `selectPrevious`, `showAll`, `mergeAll`, `moveToNewWindow`, `toggleBar` and
`add(window)`. A web contents has `showDefinitionForSelection`.

On Windows it has `setAccentColor`, `setAppDetails`, `setBackgroundMaterial`, `setThumbnailClip`,
`setThumbnailToolTip`, `snapped`, `tabletMode`, and `setThumbarButtons(buttons)`, whose presses
arrive on `thumbarClicks` as the pressed button's `id`. `windowMessages(code)` streams a raw
Windows message as it reaches the window, with its parameters as bytes; observers of one code
share Electron's single hook for it.

`window.events` also reports `moved`, `resized`, `will-move` and `will-resize` (macOS and
Windows), `swipe`, `rotate-gesture`, `sheet-begin`, `sheet-end` and `new-window-for-tab` (macOS),
and `session-end` (Windows). `Decidables.Window.SessionEnd` is asked on Windows when the user's
session is about to end; a denial asks the system to wait.

The window options gained the matching creation settings: `useContentSize`, `center`, `focusable`,
`hasShadow`, `darkTheme`, `roundedCorners`, `thickFrame`, `titleBarOverlay`, `vibrancy`,
`visualEffectState`, `backgroundMaterial`, `tabbingIdentifier`, `hiddenInMissionControl`,
`acceptFirstMouse` and `type`.

### Application

- `App.recentDocuments` (`add`, `clear`, `list`), on macOS and Windows.
- `App.accessibility` (`enabled`, `setEnabled`, `features`, `setFeatures`, `changes`), on macOS
  and Windows.
- `App.activity`, Handoff on macOS: `current`, `set`, `update`, `invalidate`, `resign`, and
  `events`, which claims each activity it reports by preventing its default.
- `App.active`, `App.hidden` and `App.activeChanges`, `App.newWindowForTab`,
  `App.setActivationPolicy`, `App.applicationsFolder` (`contains`, `move`),
  `App.configureWebAuthn(keychainAccessGroup)`, `App.sendActionToFirstResponder(action)` and
  `App.dock.downloadFinished(path)`, on macOS.
- `App.toastActivatorClsid` with `App.setToastActivatorClsid`, and
  `App.taskbar.jumpListSettings`, on Windows.
- `App.showEmojiPanel` with `App.emojiPanelSupported`, `App.runningUnderArm64Translation`, and
  `App.showCertificateTrustDialog(fingerprint, message)`, on macOS and Windows. The dialog is
  shown for a certificate a certificate or client certificate decider was recently asked about,
  named by its fingerprint; an unknown fingerprint is `Protocol`.
- `App.securityScopedResource(bookmark)` opens a sandboxed file for a scope, in a Mac App Store
  build.

### Tray, notifications, and the rest

A tray handle has `displayBalloon(balloon)` and `removeBalloon` on Windows, `popUpMenu(position)`,
`closeMenu` and `guid` on macOS and Windows, and `setIgnoreDoubleClickEvents` and
`setPressedImage` on macOS. Its `events` also report `middle-click` and the balloon events on
Windows, pointer events on macOS and Windows, and drags and drops on macOS. Pointer movement
arrives at the pointer's rate, so an observer that falls 128 events behind fails with `Limit`.

`Notification.Options` gained `id`, `groupId`, `groupTitle`, `sound` and `toastXml`.
`Notification.delivered`, `remove(ids)`, `removeGroup(groupId)` and `removeAll` manage what is in
the macOS Notification Center, and `Notification.activations` streams Windows toasts the user
acted on, including the one that launched the application.

`SystemPreferences` gained, on macOS, `canPromptTouchId` and `promptTouchId(reason)`,
`trustedAccessibilityClient(prompt)`, `swipeTrackingFromScrollEvents`, `registerDefaults`,
`removeUserDefault`, and the notification centers: `notifications(center, event)` streams and
`postNotification(center, event, userInfo)` posts, for the `distributed`, `local` and `workspace`
centers. `NativeTheme.State` carries `shouldDifferentiateWithoutColor` on macOS and
`shouldUseDarkColorsForSystemIntegratedUI` on macOS and Windows.

`Shell.readShortcutLink` and `Shell.writeShortcutLink` read and write Windows shortcuts,
`Screen.dipToScreenRect` and `Screen.screenToDipRect` convert rectangles on Windows,
`Image.thumbnail(path, size)` asks the system for a file's preview on macOS and Windows, and
`Image.named(name)` and `Image.menuSymbol(name)` read macOS system images. Menu items take a
`sublabel` everywhere and a `toolTip` on macOS.

The playground's native harness runs on Windows and macOS runners as well as on Linux, and its
platform check calls a member of each group above on each platform: the member runs where
Electron implements it and fails `Native` elsewhere. That is evidence that the calls reach
Electron and that the guards name the right platforms, not that each member's effect was
observed: nothing looked at a vibrancy material or pressed a thumbnail toolbar button. Members
with no call there at all (Handoff events, Touch ID prompts, balloons, the Applications folder
move, the certificate trust dialog, security-scoped resources, raw window messages) are
type-checked and their inputs unit-tested only.

On Linux the hardware-dependent deciders are verified natively with stand-ins: the WebAuthn
account chooser, the Bluetooth device chooser and pairing prompt, and the client certificate
choice with a certificate imported into a throwaway store. See
[session extras](session-extras.md).

On the hosted macOS runner some window sizes and fullscreen transitions do not settle, and
which ones varies between runs; the harness prints them and does not claim them there. A real
Mac is needed to tell the runner's behavior from Electron's.

## Verification

The external playground's `pnpm verify:platform` runs on Linux, so it proves
the animation query, capture source listing with thumbnails, the display media
decider receiving a real `getDisplayMedia` request, input validation, and the
`Native` gating of every macOS and Windows operation. The macOS and Windows
behavior itself still needs runs on those platforms.
