import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { WebContents, WindowControls } from "sewed";

test("window controls expose the web contents extras", () => {
  const tags = [...WindowControls.protocol.requests.keys()];
  for (const tag of [
    "zoom",
    "setZoom",
    "audio",
    "setAudioMuted",
    "history",
    "back",
    "forward",
    "find",
    "findNext",
    "stopFind",
  ])
    assert.ok(tags.includes(tag), tag);
});

test("web contents option schemas keep Electron's limits", () => {
  const zoom = Schema.decodeUnknownExit(WebContents.ZoomFactor);
  assert.equal(zoom(0.25)._tag, "Success");
  assert.equal(zoom(5)._tag, "Success");
  assert.equal(zoom(0.1)._tag, "Failure");
  assert.equal(zoom(6)._tag, "Failure");
  const print = Schema.decodeUnknownExit(WebContents.PrintOptions);
  assert.equal(print({ pageSize: "A4", copies: 2 })._tag, "Success");
  assert.equal(print({ pageSize: "Ledger" })._tag, "Failure");
  assert.equal(print({ copies: 0 })._tag, "Failure");
  const pdf = Schema.decodeUnknownExit(WebContents.PdfOptions);
  assert.equal(pdf({ pageSize: "Ledger" })._tag, "Success");
  assert.equal(pdf({ pageSize: { width: 8.5, height: 11 } })._tag, "Success");
  assert.equal(pdf({ scale: 0 })._tag, "Failure");
  const text = Schema.decodeUnknownExit(WebContents.FindText);
  assert.equal(text("")._tag, "Failure");
  const capture = Schema.decodeUnknownExit(WebContents.CaptureOptions);
  assert.equal(capture({ rect: { x: 0, y: 0, width: -1, height: 1 } })._tag, "Failure");
});
