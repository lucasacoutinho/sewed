import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Nothing in the toolchain reads a block comment's interior. A doc comment whose paragraph break
 * was mangled — a sentence joined to the one before it, leaving a stray `*` at the end of three
 * lines — passed `oxfmt`, `tsc`, the generated-reference check and a real Electron run, and shipped
 * into the published `lib/*.d.ts` a consumer hovers and into `docs/reference.md`. It was caught by a
 * human reading generated output, which is the only check that was looking.
 *
 * These two are that check, encoded. Both describe the shape of a body line inside a block comment,
 * so neither knows anything about what a comment says, only about how it is laid out:
 *
 * - A body line whose content ends in whitespace and then `*` is the mangling that shipped. A
 *   legitimate line ending in an asterisk has no whitespace before it (`https://*`, `**bold**`).
 * - A body line that does not begin with `*` at all is the same accident one step further along.
 *
 * Scanning every package's source rather than this one's: the slip is a property of how a comment
 * is written, and every package publishes `.d.ts` from the same emit.
 */

const packages = fileURLToPath(new URL("../../", import.meta.url));

const sourcesUnder = (directory: string): readonly string[] => {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...sourcesUnder(path));
    else if (entry.name.endsWith(".ts")) found.push(path);
  }
  return found;
};

const sources = readdirSync(packages, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    try {
      return sourcesUnder(join(packages, entry.name, "src"));
    } catch {
      return [];
    }
  });

/** Every line inside a block comment's body, with its file and one-based line number. */
const commentBodies = (): readonly { readonly where: string; readonly line: string }[] => {
  const bodies: { where: string; line: string }[] = [];
  for (const file of sources) {
    let inside = false;
    const lines = readFileSync(file, "utf8").split("\n");
    for (const [index, line] of lines.entries()) {
      const trimmed = line.trim();
      if (!inside) {
        if (trimmed.startsWith("/*") && !trimmed.endsWith("*/")) inside = true;
        continue;
      }
      if (trimmed.startsWith("*/")) {
        inside = false;
        continue;
      }
      bodies.push({ where: `${relative(packages, file)}:${index + 1}`, line });
      if (trimmed.endsWith("*/")) inside = false;
    }
  }
  return bodies;
};

test("no doc comment has a mangled paragraph break", () => {
  const bodies = commentBodies();
  assert.ok(
    bodies.length > 1000,
    `the walk found ${bodies.length} comment lines, so it proves little`,
  );
  assert.deepEqual(
    bodies.filter(({ line }) => /\S[ \t]+\*[ \t]*$/.test(line)).map(({ where }) => where),
    [],
    "a comment body line ending in a stray asterisk is a paragraph break that was joined to the text before it",
  );
  assert.deepEqual(
    bodies.filter(({ line }) => !line.trim().startsWith("*")).map(({ where }) => where),
    [],
    "every line inside a block comment begins with an asterisk",
  );
});
