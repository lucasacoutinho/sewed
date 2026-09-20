export interface DocLink {
  readonly label: string;
  readonly slug: string;
}

export interface DocGroup {
  readonly label: string;
  readonly items: readonly DocLink[];
}

/** Every guide in `docs/` appears exactly once; `scripts/sync-docs.mjs` checks the two agree. */
export const docsGroups: readonly DocGroup[] = [
  {
    label: "Start",
    items: [
      { label: "Getting started", slug: "getting-started" },
      { label: "API and lifecycle", slug: "api" },
    ],
  },
  {
    label: "Concepts",
    items: [
      { label: "The decision model", slug: "native-policy" },
      { label: "Binding composition", slug: "binding-composition" },
      { label: "Worker dependencies", slug: "worker-bindings" },
      { label: "Stream transport", slug: "transport" },
      { label: "Binary streams", slug: "binary-streams" },
      { label: "Testing", slug: "testing" },
      { label: "Vite development", slug: "development" },
      { label: "Diagnostics", slug: "diagnostics" },
      { label: "DevTools package", slug: "devtools" },
    ],
  },
  {
    label: "Windows and documents",
    items: [
      { label: "Window controls", slug: "window-controls" },
      { label: "Window geometry", slug: "window-geometry" },
      { label: "Web contents lifecycle", slug: "webcontents-lifecycle" },
      { label: "Native views", slug: "native-views" },
      { label: "Guest views", slug: "guest-views" },
      { label: "Message dialogs", slug: "dialogs" },
      { label: "File pickers", slug: "file-dialogs" },
      { label: "Context menus", slug: "context-menus" },
      { label: "Application menus", slug: "application-menus" },
    ],
  },
  {
    label: "Sessions",
    items: [
      { label: "Session isolation", slug: "sessions" },
      { label: "Storage clearing", slug: "session-storage" },
      { label: "Protocols and downloads", slug: "session-resources" },
      { label: "Cookies, interception, settings", slug: "session-extras" },
    ],
  },
  {
    label: "Application and desktop",
    items: [
      { label: "Application lifecycle", slug: "app-lifecycle" },
      { label: "Tray and shortcuts", slug: "desktop-resources" },
      { label: "Desktop surfaces", slug: "desktop-surfaces" },
      { label: "Platform-specific surfaces", slug: "platform-surfaces" },
      { label: "Displays", slug: "screen" },
      { label: "Network, power, logging", slug: "operations" },
    ],
  },
  {
    label: "Processes and distribution",
    items: [
      { label: "Utility processes", slug: "utility-processes" },
      { label: "Remote resources", slug: "remote-resources" },
      { label: "Electron Forge", slug: "forge" },
    ],
  },
  {
    label: "Reference",
    items: [
      { label: "API reference", slug: "reference" },
      { label: "Electron coverage plan", slug: "electron-coverage" },
      { label: "Origin", slug: "upstream" },
    ],
  },
];

export const docsSidebar = docsGroups.map((group) => ({
  label: group.label,
  items: group.items.map((item) => ({ label: item.label, slug: item.slug })),
}));
