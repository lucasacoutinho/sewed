import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { WebContents } from "electron";
import { Effect } from "effect";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import * as Testing from "../src/Testing.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";
import { core } from "../src/internal/WebContentsCore.ts";

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
  use: (contents: FakeContents, registry: ReturnType<typeof Registry.make>) => Effect.Effect<A>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const contents = new FakeContents();
        // Test-only bridge: `core` reads these members structurally, the same idiom
        // `webcontents-core.test.ts` uses.
        const native = contents as unknown as WebContents;
        const registry = Registry.make();
        const blocked: { kind: string; url: string }[] = [];
        yield* core(native, { registry, blocked: (kind, url) => blocked.push({ kind, url }) });
        return yield* use(contents, registry);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );

test("two navigation deciders compose restrictively, and neither can widen the other's denial", () => {
  const registry = Registry.make();
  const event = { url: "https://example.com/", kind: "navigation" as const };
  registry.install(
    Decidables.WebContents.Navigation,
    Decision.sync(() => "allow"),
  );
  registry.install(
    Decidables.WebContents.Navigation,
    Decision.sync(() => "deny"),
  );
  assert.equal(
    registry.resolveSync(Decidables.WebContents.Navigation, event),
    "deny",
    "a denial from one decider must not be widened by an allow from another",
  );
});

test('a denied navigation still appears on "blocked" with kind: "navigation"', async () => {
  const seen = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const contents = new FakeContents();
        const native = contents as unknown as WebContents;
        const registry = Registry.make();
        const blocked: { kind: string; url: string }[] = [];
        yield* core(native, { registry, blocked: (kind, url) => blocked.push({ kind, url }) });
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

test("a popup is denied with no decider installed, and can be allowed by a decider", async () => {
  await withCore((contents, registry) =>
    Effect.sync(() => {
      const handler = contents.windowOpenHandler;
      assert.ok(handler !== undefined, "core must install a window-open handler");
      assert.deepEqual(
        handler({ url: "https://popup.example/" }),
        { action: "deny" },
        "today's default: a popup is denied with nothing installed",
      );
      registry.install(
        Decidables.WebContents.Popup,
        Decision.sync(() => "allow"),
      );
      assert.deepEqual(handler({ url: "https://popup.example/" }), { action: "allow" });
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

test('a decider on "contents/title-update" keeps the title by default, and can accept it', async () => {
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
      assert.equal(prevented, true, "keeping the title by default must preventDefault");
      registry.install(
        Decidables.WebContents.TitleUpdate,
        Decision.sync(() => "accept"),
      );
      fire();
      assert.equal(prevented, false, "an installed accept decider must let the title change stand");
    }),
  );
});

test("will-attach-webview is denied unconditionally, even when a Navigation decider or the owner's own allowance would allow the same URL", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const contents = new FakeContents();
        const native = contents as unknown as WebContents;
        const registry = Registry.make();
        const blocked: { kind: string; url: string }[] = [];
        // Both an owner allowance and an always-allow decider would let this URL through if
        // will-attach-webview consulted either one — it must consult neither.
        yield* core(native, {
          registry,
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
        assert.equal(prevented, true, "webview attachment must be denied unconditionally");
        assert.deepEqual(blocked, [{ kind: "webview", url: "https://webview.example/" }]);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("a close decider sees the event, which guardClose could not: which window is closing", async () => {
  // `guardClose`'s decision was `Effect<boolean, never, R>` — a bare boolean, with no way for the
  // decision to know which window asked. `Decidables.Window.Close`'s event carries the window's own
  // id, so one decider installed across several per-window registries can tell them apart.
  const registryA = Registry.make();
  const registryB = Registry.make();
  const seen: string[] = [];
  const decider = Decision.async((event: { readonly windowId: string }) =>
    Effect.sync(() => {
      seen.push(event.windowId);
      return "allow" as const;
    }),
  );
  registryA.install(Decidables.Window.Close, decider);
  registryB.install(Decidables.Window.Close, decider);
  const answerA = await Effect.runPromise(
    registryA.resolveAsync(Decidables.Window.Close, { windowId: "window-a" }),
  );
  const answerB = await Effect.runPromise(
    registryB.resolveAsync(Decidables.Window.Close, { windowId: "window-b" }),
  );
  assert.equal(answerA, "allow");
  assert.equal(answerB, "allow");
  assert.deepEqual(seen, ["window-a", "window-b"]);
});
