import { Schema } from "effect";
import * as Application from "./Application.ts";
import * as Certificate from "./Certificate.ts";
import * as Decision from "./Decision.ts";
import * as DesktopCapturer from "./DesktopCapturer.ts";
import * as Device from "./Device.ts";
import * as Download from "./Download.ts";
import * as SessionStorage from "./SessionStorage.ts";
import * as WebRequest from "./WebRequest.ts";

/**
 * The catalog: every decidable native event, declared once, grouped by the owner that resolves it —
 * and each one now *names* that owner, so a decider for it installs on that owner alone. The group
 * a decidable sits in, its `owner`, and its `key` prefix all say the same thing, and
 * `Decision.decidable` refuses a declaration where the last two disagree.
 *
 * The one group that holds two owners is `Session`, and deliberately: its last three members are a
 * session's *request stages*, which name `owner: "requests"` and install through
 * `session.intercept(decidable, filter, decider)` rather than `session.decide`. They belong to a
 * session however they are installed — they share its `session/` key prefix and sit beside its other
 * events here — but a filter is not a registry concept, so the door that takes one is its own, and
 * each of the two refuses the other's decidables at compile time.
 */

const Allowance = Schema.Literals(["deny", "allow"]);

export const App = {
  /**
   * Asked before the application quits; a denial keeps it running. Nobody objecting allows the
   * quit, but a *broken* quit guard denies it: a decider that throws, dies, or answers off-schema
   * decided nothing, and quitting on the strength of that would lose whatever it was guarding.
   */
  Quit: Decision.decidable({
    key: "app/quit",
    owner: "app",
    event: Schema.Struct({}),
    answer: Allowance,
    fallback: "allow",
    failure: "deny",
    timing: "async",
    composition: "restrictive",
    order: ["deny", "allow"],
  }),
  /**
   * Asked when the last window closes. The fallback preserves today's platform default
   * (`options.quitOnLastWindowClosed ?? process.platform !== "darwin"`): a constant would silently
   * change macOS behavior, and a library-installed darwin decider would out-rank every consumer
   * decider under `first` composition, since it would install before any of them.
   */
  LastWindowClosed: Decision.decidable({
    key: "app/last-window-closed",
    owner: "app",
    event: Schema.Struct({}),
    answer: Schema.Literals(["quit", "stay"]),
    // Guarded: this module is re-exported from the renderer-safe root entry, and a bare top-level
    // `process.platform` read ships into any renderer bundle that imports anything from it, throwing
    // "process is not defined" in the browser. `typeof process !== "undefined"` keeps this an
    // expression rather than a constant, which is what the fallback has to be: see the doc above
    // for why a constant would change macOS behavior and a library-installed decider would outrank
    // every consumer's.
    fallback: typeof process !== "undefined" && process.platform === "darwin" ? "stay" : "quit",
    timing: "sync",
    composition: "first",
  }),
  /** Asked for each HTTP authentication challenge; without an answer the challenge is cancelled. */
  Login: Decision.decidable({
    key: "app/login",
    owner: "app",
    event: Application.LoginChallenge,
    answer: Application.LoginResponse,
    fallback: { kind: "cancel" },
    timing: "async",
    composition: "first",
  }),
  /**
   * Asked for each TLS error; without an answer Chromium's rejection stands. The event carries only
   * what a trust decision needs from the presented certificate — see {@link Certificate.Presented}
   * — plus `hostname` (`URL.parse(url)?.hostname ?? ""` in `App.ts`'s builder), so `Certificate.Policy`
   * installs here the same way it installs on `Session.Certificate`.
   */
  CertificateError: Decision.decidable({
    key: "app/certificate-error",
    owner: "app",
    event: Schema.Struct({
      url: Schema.String,
      hostname: Schema.String,
      certificate: Certificate.Presented,
    }),
    answer: Schema.Literals(["trust", "reject"]),
    fallback: "reject",
    timing: "async",
    composition: "restrictive",
    order: ["reject", "trust"],
  }),
  /**
   * Asked when a server requests a client certificate, with the certificates the store offers.
   * `default` sends the store's first, which is what Electron does by itself and so the fallback;
   * `select` sends the one named by fingerprint, and `none` sends none. It composes restrictively,
   * `none` first, and a decider that fails sends none: a broken chooser must not present an
   * identity nobody chose. A fingerprint the request did not offer sends none.
   */
  ClientCertificate: Decision.decidable({
    key: "app/client-certificate",
    owner: "app",
    event: Application.ClientCertificateRequest,
    answer: Application.ClientCertificateChoice,
    fallback: { kind: "default" },
    failure: { kind: "none" },
    timing: "async",
    composition: "restrictive",
    order: ["none", "select", "default"],
  }),
};

export const Window = {
  /**
   * Asked before a window closes; a denial keeps it open. The decider sees which window. Nobody
   * objecting closes the window, but a *broken* guard keeps it open: an unsaved-changes decider that
   * throws has not established that there is nothing to lose.
   */
  Close: Decision.decidable({
    key: "window/close",
    owner: "window",
    event: Schema.Struct({ windowId: Schema.String }),
    answer: Allowance,
    fallback: "allow",
    failure: "deny",
    timing: "async",
    composition: "restrictive",
    order: ["deny", "allow"],
  }),
  /**
   * Asked on Windows when the user's session is about to end (shutdown, restart or log off) and
   * the system asks each window whether it may. A denial asks the system to wait, which it shows
   * the user and may override. Nobody objecting allows it.
   */
  SessionEnd: Decision.decidable({
    key: "window/session-end",
    owner: "window",
    event: Schema.Struct({
      windowId: Schema.String,
      reasons: Schema.Array(Schema.Literals(["shutdown", "close-app", "critical", "logoff"])),
    }),
    answer: Allowance,
    fallback: "allow",
    timing: "sync",
    composition: "restrictive",
    order: ["deny", "allow"],
  }),
};

export const WebContents = {
  /**
   * Asked for each main-frame navigation or redirect the page starts. `kind` also admits
   * `"webview"` in its type, reserved for the day webview attachment becomes decidable — nothing
   * dispatches that kind today: webview attach is denied unconditionally and never resolves this
   * decidable.
   */
  Navigation: Decision.decidable({
    key: "contents/navigation",
    owner: "contents",
    event: Schema.Struct({
      url: Schema.String,
      kind: Schema.Literals(["navigation", "redirect", "webview"]),
    }),
    answer: Allowance,
    // The entry document stays allowed without consulting deciders; this is what an out-of-scope
    // destination falls back to once no installed decider answers otherwise.
    fallback: "deny",
    timing: "sync",
    composition: "restrictive",
    order: ["deny", "allow"],
  }),
  /** Asked when the page requests a new window; without an answer the popup is denied. */
  Popup: Decision.decidable({
    key: "contents/popup",
    owner: "contents",
    event: Schema.Struct({ url: Schema.String }),
    answer: Allowance,
    fallback: "deny",
    timing: "sync",
    composition: "restrictive",
    order: ["deny", "allow"],
  }),
  /** Asked when the page sets its title; the fallback keeps whatever title main last set. */
  TitleUpdate: Decision.decidable({
    key: "contents/title-update",
    owner: "contents",
    event: Schema.Struct({ title: Schema.String }),
    answer: Schema.Literals(["keep", "accept"]),
    fallback: "keep",
    timing: "sync",
    composition: "first",
  }),
  /** Asked when the page tries to prevent its own unload; the fallback honors the page's request. */
  Unload: Decision.decidable({
    key: "contents/unload",
    owner: "contents",
    event: Schema.Struct({ url: Schema.String }),
    answer: Schema.Literals(["honor", "override"]),
    fallback: "honor",
    timing: "sync",
    composition: "first",
  }),
  /**
   * Asked for each keyboard or mouse event; without an answer input reaches the page. Deliberately
   * declares no `failure`, unlike the guards that close a window or quit the application: its closed
   * answer is `block`, asked of every keystroke and every click, so a buggy input decider that
   * contributed it would brick the application. A failing decider here contributes the fallback and
   * input keeps reaching the page — the one place in this catalog where a broken decider is the
   * lesser hazard.
   */
  Input: Decision.decidable({
    key: "contents/input",
    owner: "contents",
    event: Schema.Struct({ kind: Schema.Literals(["key", "mouse"]) }),
    answer: Schema.Literals(["block", "allow"]),
    fallback: "allow",
    timing: "sync",
    composition: "restrictive",
    order: ["block", "allow"],
  }),
  /**
   * Asked for each download a document starts. The catalog fallback is `deny`, the safe end for any
   * owner that declares nothing; a guest's own registry keeps it, and a plain web contents' registry
   * overrides it to `prompt` — see `internal/GuestView.ts` and `internal/WebContents.ts`, where each
   * owner's `Registry.make({ fallbacks })` makes its own posture visible at its construction site.
   *
   * The failure is declared rather than left to that fallback, which is what makes this decidable
   * unlike the other two-posture cases: an undeclared failure *is* the effective fallback, per-owner
   * override included, so on a window a decider that throws, dies, or answers off-schema would
   * contribute `prompt` and hand the file to Electron's save dialog. A download guard that vets a
   * file and crashes has established nothing about that file, on either owner — the same reasoning
   * `Window.Close` and `App.Quit` declare a failure for, on the one decidable whose fallback is not
   * the same answer for everyone who resolves it.
   */
  Download: Decision.decidable({
    key: "contents/download",
    owner: "contents",
    event: Download.Offer,
    answer: Download.Decision,
    fallback: { kind: "deny" },
    failure: { kind: "deny" },
    timing: "sync",
    composition: "restrictive",
    order: ["deny", "prompt", "save"],
  }),
  /**
   * Asked each time a page's `navigator.bluetooth.requestDevice` scan reports the devices found so
   * far. `select` gives the page one of them, `cancel` ends the request, and `wait` keeps scanning:
   * the next report asks again, and interrupts a decider still deciding on the older list. Without
   * an answer the request is cancelled, which is also what Electron does with no listener; the
   * native listener exists only while a decider is installed.
   */
  BluetoothDevice: Decision.decidable({
    key: "contents/bluetooth-device",
    owner: "contents",
    event: Device.BluetoothRequest,
    answer: Device.BluetoothSelection,
    fallback: { kind: "cancel" },
    timing: "async",
    composition: "first",
  }),
};

export const Session = {
  /**
   * Asked for each permission check or request, and for each HID, serial, or USB device check,
   * which shares this same decidable: `name` is the permission or device type Electron reports.
   * `document` is the requesting document's key for a permission check, and `null` for a device
   * check, which Electron identifies by origin only — `allowed`/`deviceAllowed` in
   * `internal/Session.ts` compute both fields, gated on the same main-frame, same-document, and
   * origin checks the old rule engine made unconditionally. `document: null` makes a decider that has
   * not handled the device case a compile error at the first `document.startsWith(...)` it writes,
   * rather than a same-shaped string that silently widens a document-scoped grant to the whole
   * origin — the same reasoning applies to `origin`, one level down: `URL.origin` is the literal
   * string `"null"`, not the value `null`, for `file:`, `data:`, and any other opaque-origin
   * document, so `file:///a.html` and `file:///b.html` would otherwise reach a decider with the
   * identical, non-identifying `origin: "null"`. `origin: null` here means exactly that — the
   * document has no origin to grant by — so a decider must key an opaque document by `document`
   * instead; a `document`-keyed grant is unaffected, since `document` stays exact for every request.
   *
   * `mediaTypes` names which of `audio`/`video` a `media` request actually asks for: Electron's
   * request handler reports the array `MediaAccessPermissionRequest.mediaTypes` carries, and its
   * check handler — consulted once per requested type, probed on Linux — reports its own singular
   * `mediaType` as a one-element list. Every other permission, and a check whose `mediaType` is
   * `unknown` or absent, carries an empty list: `mediaTypes` only says which media types a request
   * asks for once `name` already says `"media"`; it never distinguishes a media request from any
   * other.
   * The fallback denies.
   */
  Permission: Decision.decidable({
    key: "session/permission",
    owner: "session",
    event: Schema.Struct({
      name: Schema.String,
      origin: Schema.NullOr(Schema.String),
      document: Schema.NullOr(Schema.String),
      mediaTypes: Schema.Array(Schema.Literals(["audio", "video"])),
    }),
    answer: Allowance,
    fallback: "deny",
    timing: "sync",
    composition: "restrictive",
    order: ["deny", "allow"],
  }),
  /**
   * Asked for each of the renderer's speculative preconnections; the fallback allows them, matching
   * a session's previous default. A failing decider denies instead, which costs a preconnection's
   * latency and nothing else.
   */
  Preconnect: Decision.decidable({
    key: "session/preconnect",
    owner: "session",
    event: Schema.Struct({ url: Schema.String }),
    answer: Allowance,
    fallback: "allow",
    failure: "deny",
    timing: "sync",
    composition: "restrictive",
    order: ["deny", "allow"],
  }),
  /**
   * Asked for each server certificate verification; without an answer Chromium's own verdict stands.
   * A decider that *fails* rejects instead: a broken fingerprint pin must not silently become no pin
   * by deferring to the CA validity the pin exists to distrust. `trust`, `reject`, and `system` map
   * onto `setCertificateVerifyProc`'s numeric `0`, `-2`, and `-3` — see `internal/Session.ts`.
   */
  Certificate: Decision.decidable({
    key: "session/certificate",
    owner: "session",
    event: Schema.Struct({ hostname: Schema.String, certificate: Certificate.Presented }),
    answer: Schema.Literals(["reject", "system", "trust"]),
    fallback: "system",
    failure: "reject",
    timing: "async",
    composition: "restrictive",
    order: ["reject", "system", "trust"],
  }),
  /**
   * Asked for each screen-share request; without an answer, or when a decider fails, it is denied.
   * `order`'s two entries are `DesktopCapturer.Decision`'s own discriminants — it has no `"grant"`
   * member.
   */
  DisplayMedia: Decision.decidable({
    key: "session/display-media",
    owner: "session",
    event: DesktopCapturer.Request,
    answer: DesktopCapturer.Decision,
    fallback: { kind: "deny" },
    timing: "async",
    composition: "restrictive",
    order: ["deny", "source"],
  }),
  /**
   * Asked when a page uses the File System Access API on a file or directory Chromium treats as
   * sensitive, such as the home directory. `allow` gives the page the path, `tryAgain` reopens the
   * picker, and `deny` refuses. Without an answer, and when a decider fails, the path is denied.
   */
  FileSystemAccess: Decision.decidable({
    key: "session/file-system-access",
    owner: "session",
    event: SessionStorage.FileSystemAccess,
    answer: Schema.Literals(["deny", "tryAgain", "allow"]),
    fallback: "deny",
    timing: "async",
    composition: "restrictive",
    order: ["deny", "tryAgain", "allow"],
  }),
  /**
   * Asked when a page calls `navigator.hid.requestDevice`, with the devices that match its filters.
   * Without an answer the request is cancelled, which is also what Electron does with no listener;
   * a selected id the request did not offer cancels it too. The native listener exists only while a
   * decider is installed. Whether the page may then use the device is still
   * {@link Session.Permission}'s to say.
   */
  HidDevice: Decision.decidable({
    key: "session/hid-device",
    owner: "session",
    event: Device.HidRequest,
    answer: Device.Selection,
    fallback: { kind: "cancel" },
    timing: "async",
    composition: "first",
  }),
  /** Asked when a page calls `navigator.usb.requestDevice`; behaves as {@link Session.HidDevice}. */
  UsbDevice: Decision.decidable({
    key: "session/usb-device",
    owner: "session",
    event: Device.UsbRequest,
    answer: Device.Selection,
    fallback: { kind: "cancel" },
    timing: "async",
    composition: "first",
  }),
  /**
   * Asked when a page calls `navigator.serial.requestPort`; behaves as {@link Session.HidDevice}.
   * Electron names the requesting web contents rather than a frame, so `origin` and `document` are
   * its top-level document's.
   */
  SerialPort: Decision.decidable({
    key: "session/serial-port",
    owner: "session",
    event: Device.SerialPortRequest,
    answer: Device.Selection,
    fallback: { kind: "cancel" },
    timing: "async",
    composition: "first",
  }),
  /**
   * Asked when `navigator.credentials.get()` finds several discoverable WebAuthn credentials and
   * one must be chosen. Without an answer the request is cancelled and the page receives a
   * `NotAllowedError`; a credential id the request did not offer cancels it too.
   */
  WebAuthnAccount: Decision.decidable({
    key: "session/webauthn-account",
    owner: "session",
    event: Device.WebAuthnRequest,
    answer: Device.Selection,
    fallback: { kind: "cancel" },
    timing: "async",
    composition: "first",
  }),
  /**
   * Asked when a Bluetooth device needs confirmation or a pin before it pairs, on Linux and Windows;
   * macOS pairs by itself and never asks. Without an answer the pairing is cancelled, and so is an
   * answer of the wrong kind for its prompt.
   */
  BluetoothPairing: Decision.decidable({
    key: "session/bluetooth-pairing",
    owner: "session",
    event: Device.Pairing,
    answer: Device.PairingAnswer,
    fallback: { kind: "cancel" },
    timing: "async",
    composition: "first",
  }),
  /**
   * Asked before each request the filter selects leaves the session. Nobody objecting allows it,
   * and a *broken* decider blocks it: a tracker gate that throws has not established that the
   * request is safe to make, and a filter narrow enough to be worth installing is narrow enough
   * that failing its requests closed costs one feature rather than the application.
   *
   * `body` on this stage's filter is what makes `body` reach a decider here eagerly, capped in
   * bytes and assembled per install — see `session.intercept`. The event's own `readBody(options?)`
   * assembles lazily instead, under the options given or the install's own `body` filter when it
   * named one, so an install over `<all_urls>` pays for a body only on the request whose decider
   * asks. This is the only one of the three stages that carries upload data at all, and the other
   * two refuse a filter that asks for it — and so have no `readBody` on their own events.
   *
   * A decider that *fails* blocks; a decider that never **settles** leaves its request unanswered,
   * and the page waits. Liveness is the decider's own, and closing the installing scope does not
   * release a request already in flight: bound a decider that can wait on anything with
   * `Effect.timeout`, and let the timeout fail so it blocks.
   */
  Request: Decision.decidable({
    key: "session/request",
    owner: "requests",
    event: WebRequest.RequestEvent,
    answer: WebRequest.RequestDecision,
    fallback: { kind: "allow" },
    failure: { kind: "block" },
    timing: "async",
    composition: "restrictive",
    order: ["block", "redirect", "allow"],
  }),
  /**
   * Asked before the request headers are sent, and it **chains** rather than ranks: each decider is
   * handed the headers the previous one produced, so one feature adding an authorization header and
   * another adding a trace header both land. A ranking cannot express that — two `headers` answers
   * rank equal, so the first-installed would win and the second feature's headers would silently
   * vanish, which is Electron's own single-listener clobbering reintroduced one level up. A `block`
   * from any decider ends the chain and cancels the request, later deciders unconsulted, and a
   * broken decider contributes that same `block`.
   *
   * A decider that *fails* blocks; a decider that never **settles** leaves its request unanswered,
   * and the page waits. Liveness is the decider's own, and closing the installing scope does not
   * release a request already in flight: bound a decider that can wait on anything with
   * `Effect.timeout`, and let the timeout fail so it blocks.
   */
  RequestHeaders: Decision.decidable({
    key: "session/request-headers",
    owner: "requests",
    event: WebRequest.RequestHeaders,
    answer: WebRequest.RequestHeadersDecision,
    fallback: { kind: "allow" },
    failure: { kind: "block" },
    timing: "async",
    composition: "chain",
    chain: {
      stop: ["block"],
      advance: (event, answer) =>
        answer.kind === "headers" ? { ...event, headers: answer.headers } : event,
    },
  }),
  /**
   * Asked when the response headers arrive, chaining exactly as {@link RequestHeaders} does. Its
   * `advance` spreads `statusLine` back only when the answer carried one, so a status line set by
   * one decider survives a later decider that rewrites headers alone — the cumulative `statusLine`
   * the hand-rolled listener this replaces tracked by hand.
   *
   * A decider that *fails* blocks; a decider that never **settles** leaves its request unanswered,
   * and the page waits. Liveness is the decider's own, and closing the installing scope does not
   * release a request already in flight: bound a decider that can wait on anything with
   * `Effect.timeout`, and let the timeout fail so it blocks.
   */
  ResponseHeaders: Decision.decidable({
    key: "session/response-headers",
    owner: "requests",
    event: WebRequest.Response,
    answer: WebRequest.ResponseDecision,
    fallback: { kind: "allow" },
    failure: { kind: "block" },
    timing: "async",
    composition: "chain",
    chain: {
      stop: ["block"],
      advance: (event, answer) =>
        answer.kind === "headers"
          ? {
              ...event,
              headers: answer.headers,
              ...(answer.statusLine === undefined ? {} : { statusLine: answer.statusLine }),
            }
          : event,
    },
  }),
};
