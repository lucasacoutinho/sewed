import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import {
  Application,
  Decidables,
  Notification,
  Shell,
  SystemPreferences,
  Tray,
  WindowControls,
} from "sewed";
import { SewedError } from "../src/SewedError.ts";
import { only } from "../src/internal/Platform.ts";
import * as SeenCertificates from "../src/internal/SeenCertificates.ts";

const accepts = <A, I>(schema: Schema.Codec<A, I>, value: unknown) =>
  Schema.decodeUnknownExit(schema)(value)._tag === "Success";

test("a platform guard passes on a named platform and fails Native elsewhere", () => {
  const current =
    process.platform === "darwin" || process.platform === "win32" ? process.platform : "linux";
  only([current], "This member");
  const other = current === "darwin" ? "win32" : "darwin";
  assert.throws(
    () => only([other], "Vibrancy"),
    (error) =>
      error instanceof SewedError &&
      error.code === "Native" &&
      error.message.startsWith("Vibrancy is available only on "),
  );
});

test("recently presented certificates are found by fingerprint, oldest out first", () => {
  const certificate = (fingerprint: string) => ({ fingerprint }) as Electron.Certificate;
  SeenCertificates.remember(certificate("first"));
  for (let index = 0; index < 63; index++) SeenCertificates.remember(certificate(`c${index}`));
  assert.equal(SeenCertificates.find("first")?.fingerprint, "first");
  SeenCertificates.remember(certificate("first"));
  SeenCertificates.remember(certificate("one-more"));
  assert.equal(SeenCertificates.find("first")?.fingerprint, "first", "seen again, so kept");
  assert.equal(SeenCertificates.find("c0"), undefined, "the oldest was dropped");
  assert.equal(SeenCertificates.find("unknown"), undefined);
});

test("window platform schemas keep Electron's closed sets", () => {
  assert.ok(accepts(WindowControls.Vibrancy, "sidebar"));
  assert.ok(accepts(WindowControls.Vibrancy, null));
  assert.ok(!accepts(WindowControls.Vibrancy, "glass"));
  assert.ok(accepts(WindowControls.BackgroundMaterial, "mica"));
  assert.ok(!accepts(WindowControls.BackgroundMaterial, "glass"));
  assert.ok(accepts(WindowControls.AccentColor, true));
  assert.ok(accepts(WindowControls.AccentColor, "#ff0000"));
  assert.ok(accepts(WindowControls.AccentColor, null));
  assert.ok(!accepts(WindowControls.AccentColor, ""));
  assert.ok(accepts(WindowControls.ThumbarButton, { id: "play", icon: "/icons/play.png" }));
  assert.ok(!accepts(WindowControls.ThumbarButton, { id: "", icon: "/icons/play.png" }));
  assert.ok(
    !accepts(WindowControls.ThumbarButton, { id: "play", icon: "/i.png", flags: ["sticky"] }),
  );
  for (const event of [
    { kind: "moved" },
    { kind: "will-resize", bounds: { x: 0, y: 0, width: 1, height: 1 }, edge: "left" },
    { kind: "swipe", direction: "left" },
    { kind: "rotate-gesture", rotation: 12.5 },
    { kind: "sheet-begin" },
    { kind: "new-window-for-tab" },
    { kind: "session-end", reasons: ["shutdown"] },
    { kind: "persisted-state-restored" },
  ])
    assert.ok(accepts(WindowControls.Event, event), event.kind);
  assert.ok(!accepts(WindowControls.Event, { kind: "will-move" }), "a move names its bounds");
  assert.equal(Decidables.Window.SessionEnd.fallback, "allow");
});

test("tray, notification, activity, defaults and shortcut schemas", () => {
  for (const event of [
    { kind: "middle-click" },
    { kind: "mouse-move", x: 1, y: 2 },
    { kind: "balloon-click" },
    { kind: "drop-files", files: ["/tmp/a"] },
    { kind: "drop-text", text: "hello" },
  ])
    assert.ok(accepts(Tray.Event, event), event.kind);
  assert.ok(!accepts(Tray.Event, { kind: "mouse-move" }));
  assert.ok(accepts(Tray.Balloon, { title: "Done", content: "Saved", iconType: "info" }));
  assert.ok(!accepts(Tray.Balloon, { title: "Done" }));
  assert.ok(accepts(Notification.Options, { title: "Hi", id: "n1", groupId: "g", sound: "Ping" }));
  assert.ok(!accepts(Notification.Options, { title: "Hi", groupId: "" }));
  assert.ok(accepts(Notification.Activation, { type: "foreground", arguments: "open=1" }));
  assert.ok(accepts(Application.Activity, { type: "com.example.edit", userInfo: { document: 7 } }));
  assert.ok(!accepts(Application.Activity, { type: "", userInfo: null }));
  assert.ok(accepts(Application.ActivationPolicy, "accessory"));
  assert.ok(accepts(SystemPreferences.Defaults, { theme: "dark", count: 2, on: true }));
  assert.ok(!accepts(SystemPreferences.Defaults, { nested: { a: 1 } }));
  assert.ok(accepts(SystemPreferences.NotificationCenter, "workspace"));
  assert.ok(accepts(Shell.Shortcut, { target: "C:\\App\\app.exe", args: "--flag" }));
  assert.ok(!accepts(Shell.Shortcut, { args: "--flag" }));
});
