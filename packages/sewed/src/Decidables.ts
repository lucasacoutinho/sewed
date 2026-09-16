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
    fallback: "allow" as const,
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
    fallback: process.platform === "darwin" ? ("stay" as const) : ("quit" as const),
    timing: "sync",
    composition: "first",
  }),
  /** Asked for each HTTP authentication challenge; without an answer the challenge is cancelled. */
  Login: Decision.decidable({
    key: "app/login",
    event: Application.LoginChallenge,
    answer: Application.LoginResponse,
    fallback: { kind: "cancel" } as const,
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
    fallback: "reject" as const,
    timing: "async",
    composition: "restrictive",
    order: ["reject", "trust"],
  }),
};
