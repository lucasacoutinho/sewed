import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** @type {ReadonlyMap<string, ReadonlySet<string>>} */
const files = new Map([
  [
    "getting-started.md",
    new Set([
      "src/shared/contracts.ts",
      "src/shared/bindings.ts",
      "src/worker/clock.ts",
      "src/main/app.ts",
      "src/renderer/App.tsx",
      "src/renderer/main.tsx",
      "src/shared/attempt.ts",
    ]),
  ],
  [
    "binding-composition.md",
    new Set([
      "src/shared/workspace.ts",
      "src/worker/workspace.ts",
      "src/main/workspace-window.ts",
      "src/main/workspace.ts",
      "src/main/app.ts",
      "src/renderer/main.tsx",
      "src/renderer/App.tsx",
    ]),
  ],
]);

/** @param {string} guide @param {string} consumer */
export const materializeWalkthrough = (guide, consumer) => {
  const expected = files.get(basename(guide));
  if (expected === undefined) throw new Error(`Unsupported application walkthrough ${guide}`);
  const markdown = readFileSync(guide, "utf8").replaceAll("\r\n", "\n");
  /** @type {Map<string, string>} */
  const sources = new Map();
  for (const match of markdown.matchAll(/^```(?:ts|tsx) title="([^"]+)"\n([\s\S]*?)^```$/gm)) {
    const file = match[1];
    const source = match[2];
    if (file === undefined || source === undefined || !expected.has(file))
      throw new Error(`${guide}: unexpected walkthrough file ${file}`);
    if (sources.has(file)) throw new Error(`${guide}: duplicate walkthrough file ${file}`);
    sources.set(file, source);
  }
  for (const file of expected) {
    if (!sources.has(file)) throw new Error(`${guide}: missing walkthrough file ${file}`);
  }
  for (const [file, source] of sources) {
    const target = join(consumer, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
};
