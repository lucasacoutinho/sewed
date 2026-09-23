import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import * as Menu from "../src/Menu.ts";

// `Menu.ts` is an inert schema with no Electron dependency, so its decode rules are provable
// with no Electron running — the same schema `internal/ApplicationMenu.ts`'s `decodeOptions`
// decodes before installing the native menu, wrapping a decode failure into `Protocol`.
const decodeOptions = Schema.decodeUnknownSync(Menu.ApplicationOptions);

const roles = [
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "pasteAndMatchStyle",
  "delete",
  "selectAll",
  "reload",
  "forceReload",
  "toggleDevTools",
  "resetZoom",
  "zoomIn",
  "zoomOut",
  "togglefullscreen",
  "minimize",
  "close",
  "about",
  "quit",
  "services",
  "hide",
  "hideOthers",
  "unhide",
  "front",
  "zoom",
  "help",
  "window",
  "recentDocuments",
  "clearRecentDocuments",
  "toggleTabBar",
  "selectNextTab",
  "selectPreviousTab",
  "showAllTabs",
  "mergeAllWindows",
  "moveTabToNewWindow",
  "toggleSpellChecker",
  "showSubstitutions",
  "toggleSmartQuotes",
  "toggleSmartDashes",
  "toggleTextReplacement",
  "startSpeaking",
  "stopSpeaking",
] as const;

test("every Electron role but shareMenu decodes as a leaf item", () => {
  for (const role of roles) {
    const decoded = decodeOptions({
      items: [{ kind: "submenu", label: "Menu", items: [{ kind: "role", role }] }],
    });
    const [submenu] = decoded.items;
    assert.equal(submenu?.kind, "submenu");
    if (submenu?.kind === "submenu") assert.deepEqual(submenu.items, [{ kind: "role", role }]);
  }
});

test("shareMenu is not a supported role, at decode", () => {
  assert.throws(() =>
    decodeOptions({
      items: [{ kind: "submenu", label: "Menu", items: [{ kind: "role", role: "shareMenu" }] }],
    }),
  );
});

test("a leaf role at the top level is refused at decode, as before", () => {
  assert.throws(() => decodeOptions({ items: [{ kind: "role", role: "undo" }] }));
});

test("a help submenu keeps its custom items", () => {
  const decoded = decodeOptions({
    items: [
      {
        kind: "submenu",
        role: "help",
        label: "Help",
        items: [{ kind: "command", id: "docs", label: "Docs" }],
      },
    ],
  });
  const [submenu] = decoded.items;
  assert.equal(submenu?.kind, "submenu");
  if (submenu?.kind === "submenu") assert.equal(submenu.items.length, 1);
});

test("a window submenu role keeps its custom items too", () => {
  const decoded = decodeOptions({
    items: [
      {
        kind: "submenu",
        role: "window",
        label: "Window",
        items: [{ kind: "role", role: "minimize" }],
      },
    ],
  });
  const [submenu] = decoded.items;
  assert.equal(submenu?.kind, "submenu");
});

test("a services submenu accepts only an empty items list", () => {
  const decoded = decodeOptions({
    items: [{ kind: "submenu", role: "services", label: "Services", items: [] }],
  });
  const [submenu] = decoded.items;
  assert.equal(submenu?.kind, "submenu");

  assert.throws(() =>
    decodeOptions({
      items: [
        {
          kind: "submenu",
          role: "services",
          label: "Services",
          items: [{ kind: "command", id: "x", label: "X" }],
        },
      ],
    }),
  );
});

test("a recentDocuments submenu with custom items is refused at decode", () => {
  assert.throws(() =>
    decodeOptions({
      items: [
        {
          kind: "submenu",
          role: "recentDocuments",
          label: "Open Recent",
          items: [{ kind: "command", id: "x", label: "X" }],
        },
      ],
    }),
  );
  const decoded = decodeOptions({
    items: [{ kind: "submenu", role: "recentDocuments", label: "Open Recent", items: [] }],
  });
  const [submenu] = decoded.items;
  assert.equal(submenu?.kind, "submenu");
});

test("a submenu with no role still refuses an empty items list", () => {
  assert.throws(() => decodeOptions({ items: [{ kind: "submenu", label: "Empty", items: [] }] }));
});

test("a role submenu may omit label; Electron supplies its own", () => {
  const help = decodeOptions({
    items: [
      { kind: "submenu", role: "help", items: [{ kind: "command", id: "docs", label: "Docs" }] },
    ],
  });
  const [helpSubmenu] = help.items;
  assert.equal(helpSubmenu?.kind, "submenu");
  if (helpSubmenu?.kind === "submenu") assert.equal(helpSubmenu.label, undefined);

  const services = decodeOptions({
    items: [{ kind: "submenu", role: "services", items: [] }],
  });
  const [servicesSubmenu] = services.items;
  assert.equal(servicesSubmenu?.kind, "submenu");
  if (servicesSubmenu?.kind === "submenu") assert.equal(servicesSubmenu.label, undefined);
});

test("a role-less submenu still needs a label of its own", () => {
  assert.throws(() =>
    decodeOptions({
      items: [{ kind: "submenu", items: [{ kind: "command", id: "docs", label: "Docs" }] }],
    }),
  );
});

test("a role Sewed does not recognize as a submenu role is refused, even beside a label and nonempty items that would otherwise pass as role-less", () => {
  assert.throws(() =>
    decodeOptions({
      items: [
        {
          kind: "submenu",
          role: "quit",
          label: "Quit-ish",
          items: [{ kind: "command", id: "x", label: "X" }],
        },
      ],
    }),
  );
});
