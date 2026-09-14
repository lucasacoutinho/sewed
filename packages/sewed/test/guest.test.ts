import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { Automation, GuestView, WebContents } from "sewed";
import * as Download from "../src/Download.ts";

const tags = (group: { readonly requests: ReadonlyMap<string, unknown> }) =>
  [...group.requests.keys()].sort();

test("the guest protocol serves state, focus, navigate, capture, zoom, history, and find", () => {
  assert.deepEqual(tags(GuestView.protocol), [
    "back",
    "capture",
    "find",
    "findNext",
    "focus",
    "forward",
    "history",
    "navigate",
    "setZoom",
    "state",
    "stopFind",
    "zoom",
  ]);
});

test("guest settings validate patterns, methods, and closed sets", () => {
  const settings = Schema.decodeUnknownExit(GuestView.Settings);
  assert.equal(settings({ navigation: ["https://*/*"] })._tag, "Success");
  assert.equal(settings({ navigation: [] })._tag, "Success");
  assert.equal(settings({ navigation: ["example.com"] })._tag, "Failure");
  assert.equal(settings({ navigation: [], webRtc: "off" })._tag, "Failure");
  assert.equal(
    settings({ navigation: [], automation: { devtools: ["Runtime.evaluate"] } })._tag,
    "Success",
  );
  assert.equal(settings({ navigation: [], automation: { devtools: [] } })._tag, "Failure");
  assert.equal(
    settings({ navigation: [], automation: { devtools: ["evaluate"] } })._tag,
    "Failure",
  );
  assert.equal(settings({ navigation: [], automation: { evaluate: false } })._tag, "Failure");
});

test("guest events and decisions keep their shapes", () => {
  const blocked = Schema.decodeUnknownExit(WebContents.Blocked);
  assert.equal(blocked({ kind: "popup", url: "https://x/" })._tag, "Success");
  assert.equal(blocked({ kind: "iframe", url: "https://x/" })._tag, "Failure");
  const decision = Schema.decodeUnknownExit(Download.Decision);
  assert.equal(decision({ kind: "save", path: "/tmp/x" })._tag, "Success");
  assert.equal(decision({ kind: "save" })._tag, "Failure");
  const input = Schema.decodeUnknownExit(Automation.InputEvent);
  assert.equal(
    input({ type: "mouseDown", x: 1, y: 2, button: "left", clickCount: 1 })._tag,
    "Success",
  );
  assert.equal(input({ type: "keyDown", keyCode: "Enter" })._tag, "Success");
  assert.equal(input({ type: "mouseWheel", x: 0, y: 0, deltaY: -10 })._tag, "Success");
  assert.equal(input({ type: "keyDown" })._tag, "Failure");
  const policy = Schema.decodeUnknownExit(GuestView.HostPolicy);
  assert.equal(policy({ navigate: true })._tag, "Failure");
});
