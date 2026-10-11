import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { Application, Decidables, Download, Net, WebContents, WindowControls } from "sewed";

test("network emulation and TLS settings refuse values Chromium would misread", () => {
  const emulation = Schema.decodeUnknownExit(Net.Emulation);
  assert.equal(emulation({})._tag, "Success");
  assert.equal(emulation({ offline: true, latency: 0, uploadThroughput: 512 })._tag, "Success");
  assert.equal(emulation({ latency: -1 })._tag, "Failure");
  assert.equal(emulation({ downloadThroughput: Number.POSITIVE_INFINITY })._tag, "Failure");
  const tls = Schema.decodeUnknownExit(Net.SSLConfig);
  assert.equal(tls({ minVersion: "tls1.2", maxVersion: "tls1.3" })._tag, "Success");
  assert.equal(tls({ maxVersion: "tls1.1" })._tag, "Failure");
  assert.equal(tls({ disabledCipherSuites: [0xc002] })._tag, "Success");
  assert.equal(tls({ disabledCipherSuites: [0x10000] })._tag, "Failure");
  assert.equal(tls({ disabledCipherSuites: [1.5] })._tag, "Failure");
});

test("window sizes are whole and non-negative, and an aspect ratio is never negative", () => {
  const size = Schema.decodeUnknownExit(WindowControls.Size);
  assert.equal(size({ width: 0, height: 0 })._tag, "Success");
  assert.equal(size({ width: 320 })._tag, "Failure");
  assert.equal(size({ width: -1, height: 10 })._tag, "Failure");
  assert.equal(size({ width: 1.5, height: 10 })._tag, "Failure");
  const ratio = Schema.decodeUnknownExit(WindowControls.AspectRatio);
  assert.equal(ratio(0)._tag, "Success");
  assert.equal(ratio(16 / 9)._tag, "Success");
  assert.equal(ratio(-1)._tag, "Failure");
  assert.equal(ratio(Number.NaN)._tag, "Failure");
});

test("page save types, relaunch options and download offers are closed shapes", () => {
  const save = Schema.decodeUnknownExit(WebContents.SaveType);
  assert.equal(save("MHTML")._tag, "Success");
  assert.equal(save("PDF")._tag, "Failure");
  const relaunch = Schema.decodeUnknownExit(Application.Relaunch);
  assert.equal(relaunch({})._tag, "Success");
  assert.equal(relaunch({ args: ["--restarted"], execPath: "/opt/app/app" })._tag, "Success");
  assert.equal(relaunch({ execPath: "" })._tag, "Failure");
  assert.equal(relaunch({ args: [1] })._tag, "Failure");
  const offer = Schema.decodeUnknownExit(Download.Offer);
  const base = {
    url: "https://example.com/report.pdf",
    filename: "report.pdf",
    mimeType: "application/pdf",
    totalBytes: 42,
    sourceId: "window-1",
  };
  assert.equal(offer(base)._tag, "Failure");
  assert.equal(
    offer({ ...base, urlChain: [base.url], userGesture: false, contentDisposition: "" })._tag,
    "Success",
  );
});

test("window overlay and event schemas accept what Electron reports and refuse the rest", () => {
  const overlay = Schema.decodeUnknownExit(WindowControls.TitleBarOverlay);
  assert.equal(overlay({ color: "#202020", height: 32 })._tag, "Success");
  assert.equal(overlay({ height: -1 })._tag, "Failure");
  assert.equal(overlay({ color: "" })._tag, "Failure");
  const event = Schema.decodeUnknownExit(WindowControls.Event);
  assert.equal(event({ kind: "ready-to-show" })._tag, "Success");
  assert.equal(event({ kind: "app-command", command: "browser-backward" })._tag, "Success");
  assert.equal(event({ kind: "system-context-menu", x: 1, y: 2 })._tag, "Success");
  assert.equal(event({ kind: "teleported" })._tag, "Failure");
});

test("application schemas for the host resolver and client certificates", () => {
  const resolver = Schema.decodeUnknownExit(Application.HostResolver);
  assert.equal(resolver({})._tag, "Success");
  assert.equal(
    resolver({ secureDnsMode: "secure", secureDnsServers: ["https://d/q"] })._tag,
    "Success",
  );
  assert.equal(resolver({ secureDnsMode: "always" })._tag, "Failure");
  assert.equal(resolver({ secureDnsServers: [""] })._tag, "Failure");
  const choice = Schema.decodeUnknownExit(Application.ClientCertificateChoice);
  assert.equal(choice({ kind: "default" })._tag, "Success");
  assert.equal(choice({ kind: "select", fingerprint: "sha256/AA" })._tag, "Success");
  assert.equal(choice({ kind: "select", fingerprint: "" })._tag, "Failure");
  assert.equal(Decidables.App.ClientCertificate.fallback.kind, "default");
});
