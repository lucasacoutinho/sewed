import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { WebContents } from "electron";
import { Effect } from "effect";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import { generateInstanceId } from "../src/InstanceId.ts";
import * as Testing from "../src/Testing.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";
import { core } from "../src/internal/WebContentsCore.ts";
import * as WindowClose from "../src/internal/WindowClose.ts";
import * as WindowTitle from "../src/internal/WindowTitle.ts";
import { waitUntil } from "./wait.ts";

/**
 * A structural stand-in for Electron's `WebContents`, minimal enough for `core`'s synchronous
 * construction (zoom, audio, history reads) and for emitting the native events this file gates.
 */
class FakeContents extends EventEmitter {
  url = "";
  windowOpenHandler:
    | ((details: { readonly url: string }) => { readonly action: string })
    | undefined;
  setWindowOpenHandler = (
    handler: (details: { readonly url: string }) => { readonly action: string },
  ) => {
    this.windowOpenHandler = handler;
  };
  isDestroyed = () => false;
  getOSProcessId = () => 42;
  getURL = () => this.url;
  isLoadingMainFrame = () => false;
  getZoomFactor = () => 1;
  isAudioMuted = () => false;
  isCurrentlyAudible = () => false;
  navigationHistory = {
    getAllEntries: () => [],
    getActiveIndex: () => 0,
    canGoBack: () => false,
    canGoForward: () => false,
  };
}

/** Runs `use` against a fresh `core` instance built over a fresh, decider-free registry. */
const withCore = <A>(
  use: (
    contents: FakeContents,
    registry: Registry.Registry<"contents">,
    blocked: readonly { readonly kind: string; readonly url: string }[],
  ) => Effect.Effect<A>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const contents = new FakeContents();
        // Test-only bridge: `core` reads these members structurally, the same idiom
        // `webcontents-core.test.ts` uses.
        const native = contents as unknown as WebContents;
        const registry = Registry.make({ owner: "contents" });
        const blocked: { kind: string; url: string }[] = [];
        yield* core(native, {
          registry,
          displayScaleFactor: () => 1,
          imageOf: () => {
            throw new Error("no image module in this test");
          },
          blocked: (kind, url) => blocked.push({ kind, url }),
        });
        return yield* use(contents, registry, blocked);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );

test("two navigation deciders compose restrictively, and neither can widen the other's denial", () => {
  const event = { url: "https://example.com/", kind: "navigation" as const };
  const allowThenDeny = Registry.make({ owner: "contents" });
  allowThenDeny.install(
    Decidables.WebContents.Navigation,
    Decision.sync(() => "allow"),
  );
  allowThenDeny.install(
    Decidables.WebContents.Navigation,
    Decision.sync(() => "deny"),
  );
  assert.equal(
    allowThenDeny.resolveSync(Decidables.WebContents.Navigation, event),
    "deny",
    "a denial from one decider must not be widened by an allow from another",
  );
  // Mirrored install order: a "last installed wins" regression — exactly what restrictive
  // composition replaces — would answer "allow" here and survive the case above alone.
  const denyThenAllow = Registry.make({ owner: "contents" });
  denyThenAllow.install(
    Decidables.WebContents.Navigation,
    Decision.sync(() => "deny"),
  );
  denyThenAllow.install(
    Decidables.WebContents.Navigation,
    Decision.sync(() => "allow"),
  );
  assert.equal(
    denyThenAllow.resolveSync(Decidables.WebContents.Navigation, event),
    "deny",
    "install order must not decide the outcome",
  );
});

test('a denied navigation still appears on "blocked" with kind: "navigation"', async () => {
  const seen = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const contents = new FakeContents();
        const native = contents as unknown as WebContents;
        const registry = Registry.make({ owner: "contents" });
        const blocked: { kind: string; url: string }[] = [];
        yield* core(native, {
          registry,
          displayScaleFactor: () => 1,
          imageOf: () => {
            throw new Error("no image module in this test");
          },
          blocked: (kind, url) => blocked.push({ kind, url }),
        });
        let prevented = false;
        contents.emit("will-navigate", {
          isMainFrame: true,
          url: "https://blocked.example/",
          preventDefault: () => {
            prevented = true;
          },
        });
        assert.equal(prevented, true, "an unmatched navigation must be prevented");
        return blocked;
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.deepEqual(seen, [{ kind: "navigation", url: "https://blocked.example/" }]);
});

test("the owner's pre-decider allowance is checked before any decider runs, and a decider cannot override it", async () => {
  const entry = "https://entry.example/document";
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const contents = new FakeContents();
        const native = contents as unknown as WebContents;
        const registry = Registry.make({ owner: "contents" });
        const blocked: { kind: string; url: string }[] = [];
        yield* core(native, {
          registry,
          displayScaleFactor: () => 1,
          imageOf: () => {
            throw new Error("no image module in this test");
          },
          blocked: (kind, url) => blocked.push({ kind, url }),
          allows: (url) => url.href === entry,
        });
        let prevented = false;
        const fire = (url: string) => {
          prevented = false;
          contents.emit("will-navigate", {
            isMainFrame: true,
            url,
            preventDefault: () => {
              prevented = true;
            },
          });
        };
        fire(entry);
        assert.equal(
          prevented,
          false,
          "the owner's own entry document must be allowed with no decider installed",
        );
        assert.deepEqual(blocked, []);
        fire("https://other.example/");
        assert.equal(
          prevented,
          true,
          "a URL outside the allowance still falls back to Navigation's deny",
        );
        assert.deepEqual(blocked, [{ kind: "navigation", url: "https://other.example/" }]);
        // The allowance short-circuits before the registry is consulted at all, so an installed
        // "deny" decider — which would win under restrictive composition if it were consulted —
        // must not be able to override it.
        registry.install(
          Decidables.WebContents.Navigation,
          Decision.sync(() => "deny"),
        );
        blocked.length = 0;
        fire(entry);
        assert.equal(
          prevented,
          false,
          "an installed deny decider must not override the owner's own allowance",
        );
        assert.deepEqual(blocked, []);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("a popup is denied with no decider installed, and can be allowed by a decider", async () => {
  await withCore((contents, registry, blocked) =>
    Effect.sync(() => {
      const handler = contents.windowOpenHandler;
      assert.ok(handler !== undefined, "core must install a window-open handler");
      assert.deepEqual(
        handler({ url: "https://popup.example/" }),
        { action: "deny" },
        "today's default: a popup is denied with nothing installed",
      );
      assert.deepEqual(blocked, [{ kind: "popup", url: "https://popup.example/" }]);
      registry.install(
        Decidables.WebContents.Popup,
        Decision.sync(() => "allow"),
      );
      assert.deepEqual(handler({ url: "https://popup.example/" }), { action: "allow" });
      // An allowed popup is not reported: it opens, so it was not denied.
      assert.deepEqual(blocked, [{ kind: "popup", url: "https://popup.example/" }]);
    }),
  );
});

test("will-prevent-unload honors the page by default, and an override decider can force it through", async () => {
  await withCore((contents, registry) =>
    Effect.sync(() => {
      let prevented = false;
      const fire = () => {
        prevented = false;
        contents.emit("will-prevent-unload", {
          preventDefault: () => {
            prevented = true;
          },
        });
      };
      fire();
      assert.equal(prevented, false, "honoring the page's own request must not preventDefault");
      registry.install(
        Decidables.WebContents.Unload,
        Decision.sync(() => "override"),
      );
      fire();
      assert.equal(prevented, true, "an installed override decider must force the unload through");
    }),
  );
});

test('the CONTENTS-level "page-title-updated" resolves "contents/title-update" but its own preventDefault is inert either way', async () => {
  await withCore((contents, registry) =>
    Effect.sync(() => {
      let prevented = false;
      const fire = () => {
        prevented = false;
        contents.emit(
          "page-title-updated",
          {
            preventDefault: () => {
              prevented = true;
            },
          },
          "New title",
        );
      };
      fire();
      assert.equal(
        prevented,
        false,
        "the default keep fallback answers, but this event's own preventDefault does nothing",
      );
      registry.install(
        Decidables.WebContents.TitleUpdate,
        Decision.sync(() => "accept"),
      );
      fire();
      assert.equal(prevented, false, "an accept decider changes nothing here either");
    }),
  );
});

test("a window's own contents leave the title decision to the window: one question per change", async () => {
  // Electron emits a browser window's `page-title-updated` and then its contents' event for the
  // same change; the window's listener asks, so the contents' listener must not ask again. A
  // guest's contents have no window event and keep asking on their own.
  const asked = async (windowDecidesTitle: boolean) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const contents = new FakeContents();
          const native = contents as unknown as WebContents;
          const registry = Registry.make({ owner: "contents" });
          const { contents: web } = yield* core(native, {
            registry,
            blocked: () => {},
            displayScaleFactor: () => 1,
            imageOf: () => {
              throw new Error("no image module in this test");
            },
            windowDecidesTitle,
          });
          let questions = 0;
          registry.install(
            Decidables.WebContents.TitleUpdate,
            Decision.sync(() => {
              questions++;
              return "accept";
            }),
          );
          contents.emit("page-title-updated", { preventDefault: () => {} }, "Page title");
          const current = yield* web.current;
          return { questions, title: current.title };
        }),
      ).pipe(Effect.provide(Testing.main)),
    );
  assert.deepEqual(await asked(true), { questions: 0, title: "Page title" });
  assert.deepEqual(await asked(false), { questions: 1, title: "Page title" });
});

// `WindowTitle.holdsTitle` is where the decision actually has a native effect: `internal/Window.ts`
// calls it from the BROWSER WINDOW's own `page-title-updated` listener, whose `preventDefault`
// Electron documents as holding the title bar. It is isolated into its own Electron-free module for
// the same reason `WindowClose.make` is — the comment above the close-decider test below explains
// why nothing that imports `internal/Window.ts` itself can run here — so this suite drives the real
// decision with a plain registry, no window at all.
test('WindowTitle.holdsTitle keeps by default, and lets an installed "accept" decider through', () => {
  const registry = Registry.make({ owner: "contents" });
  assert.equal(WindowTitle.holdsTitle(registry, "New title"), true);
  registry.install(
    Decidables.WebContents.TitleUpdate,
    Decision.sync(() => "accept"),
  );
  assert.equal(WindowTitle.holdsTitle(registry, "New title"), false);
});

test("will-attach-webview is denied without a WebviewAttach decider, even when a Navigation decider or the owner's own allowance would allow the same URL", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const contents = new FakeContents();
        const native = contents as unknown as WebContents;
        const registry = Registry.make({ owner: "contents" });
        const blocked: { kind: string; url: string }[] = [];
        // Both an owner allowance and an always-allow decider would let this URL through if
        // will-attach-webview consulted either one — it must consult neither.
        yield* core(native, {
          registry,
          displayScaleFactor: () => 1,
          imageOf: () => {
            throw new Error("no image module in this test");
          },
          blocked: (kind, url) => blocked.push({ kind, url }),
          allows: () => true,
        });
        registry.install(
          Decidables.WebContents.Navigation,
          Decision.sync(() => "allow"),
        );
        let prevented = false;
        contents.emit(
          "will-attach-webview",
          {
            preventDefault: () => {
              prevented = true;
            },
          },
          {},
          { src: "https://webview.example/" },
        );
        assert.equal(
          prevented,
          true,
          "webview attachment is denied unless its own decider allows it",
        );
        assert.deepEqual(blocked, [{ kind: "webview", url: "https://webview.example/" }]);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

// `internal/Window.ts` cannot be imported by this suite at all: it transitively imports the real
// `electron` module for a value (`internal/View.ts`'s `new NativeView()`), which does not exist
// outside a real Electron process — confirmed by `node --import tsx -e
// "import('.../internal/Window.ts')"` failing with "The requested module 'electron' does not
// provide an export named 'View'". That is why nothing in this suite drove the real close-gate
// wiring before, and why `internal/Window.ts:126`'s `{ windowId: id }` literal survived being
// blanked to `{ windowId: "" }`: no test loads that file at all. `internal/WindowClose.ts` isolates
// exactly that wiring — a per-window registry, `Decidables.Window.Close` gated on `{ windowId: id }`,
// and the `decide` the handle exposes — with no Electron import, so it is what `internal/Window.ts`
// itself now calls and what this test can actually drive.
test("a close decider sees the event, which guardClose could not: the window's own generated id", async () => {
  const id = await Effect.runPromise(generateInstanceId());
  let approvals = 0;
  const { gate, decide } = WindowClose.make(
    id,
    () => {
      approvals += 1;
    },
    () => false,
  );
  const seen: string[] = [];
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* decide(
          Decidables.Window.Close,
          Decision.async((event) =>
            Effect.sync(() => {
              seen.push(event.windowId);
              return "deny" as const;
            }),
          ),
        );
        gate.request();
        yield* Effect.promise(() => waitUntil(() => seen.length === 1, "the close decider to run"));
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.equal(approvals, 0, "a deny decider must not approve");
  assert.deepEqual(seen, [id], "the decider must see this exact window's own generated id");
});

test("a crashing close guard denies the close", async () => {
  const id = await Effect.runPromise(generateInstanceId());
  let approvals = 0;
  let allowed = 0;
  const { gate, decide } = WindowClose.make(
    id,
    () => {
      approvals += 1;
    },
    () => false,
  );
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        // The unsaved-changes guard every application writes, with a bug in it. `Window.Close`
        // declares `failure: "deny"`, so this contributes a denial rather than the `"allow"`
        // fallback — the window stays open and the crash is logged, which is what the wave's base
        // did ("Close guard failed; request denied") before composition replaced the single guard.
        yield* decide(
          Decidables.Window.Close,
          Decision.async(() =>
            Effect.sync((): "allow" => {
              throw new Error("unsaved-changes guard boom");
            }),
          ),
        );
        // Installed second so that *it* is the barrier: the crash and its log both happen before
        // this runs, so once `allowed` is observable nothing asynchronous is left between the walk
        // and the gate's own approve check. It also makes the denial's strength visible — a real
        // "allow" from a working decider must not widen a broken one's contribution.
        yield* decide(
          Decidables.Window.Close,
          Decision.async(() =>
            Effect.sync(() => {
              allowed += 1;
              return "allow" as const;
            }),
          ),
        );
        gate.request();
        yield* Effect.promise(() =>
          waitUntil(() => allowed === 1, "both close deciders to have run"),
        );
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.equal(approvals, 0, "a crashing guard must not let the window close");
});

test('a close decider\'s "allow" answer is what lets approve() run, and a "deny" is what keeps it from running', async () => {
  const id = await Effect.runPromise(generateInstanceId());
  let approvals = 0;
  const { gate, decide } = WindowClose.make(
    id,
    () => {
      approvals += 1;
    },
    () => false,
  );
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* decide(
          Decidables.Window.Close,
          Decision.async(() => Effect.succeed("allow" as const)),
        );
        gate.request();
        yield* Effect.promise(() => waitUntil(() => approvals === 1, "approve to run"));
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
  assert.equal(approvals, 1, "an allow decider must approve exactly once");
});

test("a WebviewAttach decider allows an attachment, and the webview is locked down whatever it asked for", async () => {
  await withCore((contents, registry, blocked) =>
    Effect.sync(() => {
      const seen: { src: string; partition: string | null }[] = [];
      registry.install(
        Decidables.WebContents.WebviewAttach,
        Decision.sync((event) => {
          seen.push(event);
          return event.src.startsWith("https://trusted.example/") ? "allow" : "deny";
        }),
      );
      const attach = (src: string) => {
        const state = { prevented: false };
        const preferences: Record<string, unknown> = {
          preload: "/tmp/evil-preload.js",
          nodeIntegration: true,
          contextIsolation: false,
          sandbox: false,
        };
        contents.emit(
          "will-attach-webview",
          { preventDefault: () => (state.prevented = true) },
          preferences,
          { src, partition: "persist:webview" },
        );
        return { state, preferences };
      };
      const allowed = attach("https://trusted.example/page");
      assert.equal(allowed.state.prevented, false);
      assert.equal("preload" in allowed.preferences, false, "the webview's own preload is dropped");
      assert.equal(allowed.preferences.nodeIntegration, false);
      assert.equal(allowed.preferences.contextIsolation, true);
      assert.equal(allowed.preferences.sandbox, true);
      const denied = attach("https://other.example/");
      assert.equal(denied.state.prevented, true);
      assert.deepEqual(blocked, [{ kind: "webview", url: "https://other.example/" }]);
      assert.deepEqual(seen[0], {
        src: "https://trusted.example/page",
        partition: "persist:webview",
      });
    }),
  );
});
