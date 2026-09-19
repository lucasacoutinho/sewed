import { Schema } from "effect";
import * as Application from "./Application.ts";
import * as Certificate from "./Certificate.ts";
import * as Decision from "./Decision.ts";
import * as DesktopCapturer from "./DesktopCapturer.ts";
import * as Download from "./Download.ts";

/** The catalog: every decidable native event, declared once, grouped by the owner that resolves it. */

const Allowance = Schema.Literals(["deny", "allow"]);

export const App = {
  /** Asked before the application quits; a denial keeps it running. */
  Quit: Decision.decidable({
    key: "app/quit",
    event: Schema.Struct({}),
    answer: Allowance,
    fallback: "allow",
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
    event: Schema.Struct({}),
    answer: Schema.Literals(["quit", "stay"]),
    // Guarded: this module is re-exported from the renderer-safe root entry, and a bare top-level
    // `process.platform` read ships into any renderer bundle that imports anything from it, throwing
    // "process is not defined" in the browser. `typeof process !== "undefined"` keeps this an
    // expression, so the Task 3 ruling against a constant still stands.
    fallback: typeof process !== "undefined" && process.platform === "darwin" ? "stay" : "quit",
    timing: "sync",
    composition: "first",
  }),
  /** Asked for each HTTP authentication challenge; without an answer the challenge is cancelled. */
  Login: Decision.decidable({
    key: "app/login",
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
};

export const Window = {
  /** Asked before a window closes; a denial keeps it open. The decider sees which window. */
  Close: Decision.decidable({
    key: "window/close",
    event: Schema.Struct({ windowId: Schema.String }),
    answer: Allowance,
    fallback: "allow",
    timing: "async",
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
    event: Schema.Struct({ title: Schema.String }),
    answer: Schema.Literals(["keep", "accept"]),
    fallback: "keep",
    timing: "sync",
    composition: "first",
  }),
  /** Asked when the page tries to prevent its own unload; the fallback honors the page's request. */
  Unload: Decision.decidable({
    key: "contents/unload",
    event: Schema.Struct({ url: Schema.String }),
    answer: Schema.Literals(["honor", "override"]),
    fallback: "honor",
    timing: "sync",
    composition: "first",
  }),
  /** Asked for each keyboard or mouse event; without an answer input reaches the page. */
  Input: Decision.decidable({
    key: "contents/input",
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
   */
  Download: Decision.decidable({
    key: "contents/download",
    event: Download.Offer,
    answer: Download.Decision,
    fallback: { kind: "deny" },
    timing: "sync",
    composition: "restrictive",
    order: ["deny", "prompt", "save"],
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
   * The fallback denies.
   */
  Permission: Decision.decidable({
    key: "session/permission",
    event: Schema.Struct({
      name: Schema.String,
      origin: Schema.NullOr(Schema.String),
      document: Schema.NullOr(Schema.String),
    }),
    answer: Allowance,
    fallback: "deny",
    timing: "sync",
    composition: "restrictive",
    order: ["deny", "allow"],
  }),
  /** Asked for each of the renderer's speculative preconnections; the fallback allows them. */
  Preconnect: Decision.decidable({
    key: "session/preconnect",
    event: Schema.Struct({ url: Schema.String }),
    answer: Allowance,
    fallback: "allow",
    timing: "sync",
    composition: "restrictive",
    order: ["deny", "allow"],
  }),
  /**
   * Asked for each server certificate verification; without an answer, or when a decider fails,
   * Chromium's own verdict stands. `trust`, `reject`, and `system` map onto
   * `setCertificateVerifyProc`'s numeric `0`, `-2`, and `-3` — see `internal/Session.ts`.
   */
  Certificate: Decision.decidable({
    key: "session/certificate",
    event: Schema.Struct({ hostname: Schema.String, certificate: Certificate.Presented }),
    answer: Schema.Literals(["reject", "system", "trust"]),
    fallback: "system",
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
    event: DesktopCapturer.Request,
    answer: DesktopCapturer.Decision,
    fallback: { kind: "deny" },
    timing: "async",
    composition: "restrictive",
    order: ["deny", "source"],
  }),
};
