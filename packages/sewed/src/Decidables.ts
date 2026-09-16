import { Schema } from "effect";
import * as Application from "./Application.ts";
import * as Certificate from "./Certificate.ts";
import * as Decision from "./Decision.ts";

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
   * what a trust decision needs from the presented certificate — see {@link Certificate.Presented}.
   */
  CertificateError: Decision.decidable({
    key: "app/certificate-error",
    event: Schema.Struct({ url: Schema.String, certificate: Certificate.Presented }),
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
  /** Asked for each main-frame navigation, redirect, or webview attach the page starts. */
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
};
