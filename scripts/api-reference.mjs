import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const output = "docs/reference.md";
const entries = [
  ["sewed", "packages/sewed/lib/index.d.ts"],
  ["sewed/main", "packages/sewed/lib/main.d.ts"],
  ["sewed/worker", "packages/sewed/lib/WorkerApi.d.ts"],
  ["sewed/utility", "packages/sewed/lib/UtilityApi.d.ts"],
  ["sewed/testing", "packages/sewed/lib/Testing.d.ts"],
  ["@sewed/react", "packages/react/lib/index.d.ts"],
  ["@sewed/vite", "packages/vite/lib/index.d.ts"],
  ["@sewed/devtools", "packages/devtools/lib/index.d.ts"],
  ["@sewed/forge", "packages/forge/lib/index.d.ts"],
  ["@sewed/forge/config", "packages/forge/lib/config.d.ts"],
];

const blockKeywords = new Set(["interface", "class", "namespace", "module", "enum"]);
const declarationPattern =
  /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(const|let|var|function|class|interface|type|enum|namespace|module)\s+([A-Za-z_$][\w$]*)/;

/** Splits a declaration file into top-level statements, keeping each one's leading JSDoc. */
const statements = (source) => {
  const result = [];
  let index = 0;
  let start = 0;
  let depth = 0;
  let doc = "";
  let keyword;
  const skipToLineEnd = () => {
    while (index < source.length && source[index] !== "\n") index += 1;
  };
  const skipString = (quote) => {
    index += 1;
    while (index < source.length && source[index] !== quote) {
      if (source[index] === "\\") index += 1;
      if (quote === "`" && source[index] === "$" && source[index + 1] === "{") {
        index += 2;
        let inner = 1;
        while (index < source.length && inner > 0) {
          if (source[index] === "{") inner += 1;
          if (source[index] === "}") inner -= 1;
          index += 1;
        }
        continue;
      }
      index += 1;
    }
    index += 1;
  };
  const finish = (end) => {
    const text = source.slice(start, end).trim();
    if (text.length > 0) result.push({ text, doc });
    doc = "";
    keyword = undefined;
    start = end;
  };
  while (index < source.length) {
    const character = source[index];
    if (character === "/" && source[index + 1] === "*") {
      const close = source.indexOf("*/", index + 2);
      const comment = source.slice(index, close + 2);
      if (depth === 0 && source.slice(start, index).trim().length === 0) {
        doc = comment.startsWith("/**") ? comment : "";
        start = close + 2;
      }
      index = close + 2;
      continue;
    }
    if (character === "/" && source[index + 1] === "/") {
      skipToLineEnd();
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      skipString(character);
      continue;
    }
    if (depth === 0 && keyword === undefined && /\S/.test(character)) {
      const match = source
        .slice(index)
        .match(/^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(\w+)/);
      keyword = match?.[1] ?? "";
      if (match?.[1] === "export" || match?.[1] === "import") keyword = "list";
    }
    if (character === "{" || character === "(" || character === "[") depth += 1;
    if (character === "}" || character === ")" || character === "]") {
      depth -= 1;
      if (depth === 0 && character === "}" && blockKeywords.has(keyword ?? "")) {
        index += 1;
        finish(index);
        continue;
      }
    }
    if (character === ";" && depth === 0) {
      index += 1;
      finish(index);
      continue;
    }
    index += 1;
  }
  finish(source.length);
  return result;
};

const files = new Map();
const load = (file) => {
  const path = resolve(file);
  let loaded = files.get(path);
  if (loaded === undefined) {
    const source = readFileSync(path, "utf8");
    loaded = { path, statements: statements(source) };
    files.set(path, loaded);
  }
  return loaded;
};

const target = (from, specifier) =>
  resolve(dirname(from), specifier.replace(/\.(js|ts)$/, ".d.ts"));

const names = (list) =>
  list
    .split(",")
    .map((part) => part.trim().replace(/^type\s+/, ""))
    .filter((part) => part.length > 0)
    .map((part) => {
      const [local, exported] = part.split(/\s+as\s+/);
      return { local: local.trim(), exported: (exported ?? local).trim() };
    });

/** Declarations for one exported name of a file, following re-exports and imports. */
const declarationsOf = (file, name) => {
  const { path, statements: list } = load(file);
  const found = [];
  const imports = new Map();
  for (const statement of list) {
    const imported = statement.text.match(/^import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/);
    if (imported)
      for (const entry of names(imported[1]))
        imports.set(entry.exported, [imported[2], entry.local]);
  }
  for (const statement of list) {
    const declared = statement.text.match(declarationPattern);
    if (declared && declared[2] === name && statement.text.startsWith("export")) {
      found.push(statement);
      continue;
    }
    const reexport = statement.text.match(
      /^export\s+(?:type\s+)?\{([^}]*)\}(?:\s+from\s+"([^"]+)")?/,
    );
    if (!reexport) continue;
    for (const entry of names(reexport[1])) {
      if (entry.exported !== name) continue;
      if (reexport[2] !== undefined)
        found.push(...declarationsOf(target(path, reexport[2]), entry.local));
      else if (imports.has(entry.local)) {
        const [specifier, local] = imports.get(entry.local);
        found.push(...declarationsOf(target(path, specifier), local));
      } else {
        for (const local of list) {
          const localDeclaration = local.text.match(declarationPattern);
          if (localDeclaration && localDeclaration[2] === entry.local) found.push(local);
        }
      }
    }
  }
  return found;
};

/** Every exported member of a file, as `[name, kind, payload]`. */
const exportsOf = (file) => {
  const { path, statements: list } = load(file);
  const members = new Map();
  for (const statement of list) {
    const namespace = statement.text.match(/^export\s+\*\s+as\s+(\w+)\s+from\s+"([^"]+)"/);
    if (namespace) {
      members.set(namespace[1], { kind: "namespace", file: target(path, namespace[2]) });
      continue;
    }
    const reexport = statement.text.match(/^export\s+(?:type\s+)?\{([^}]*)\}/);
    if (reexport) {
      for (const entry of names(reexport[1]))
        members.set(entry.exported, { kind: "declaration", file: path, name: entry.exported });
      continue;
    }
    const declared = statement.text.match(declarationPattern);
    if (declared && statement.text.startsWith("export"))
      members.set(declared[2], { kind: "declaration", file: path, name: declared[2] });
  }
  return [...members.entries()].sort(([left], [right]) => left.localeCompare(right));
};

/** Shortens inline import types such as import("effect/unstable/rpc/Rpc").Rpc to Rpc.Rpc. */
const shortenImports = (text) =>
  text.replace(
    /import\("([^"]+)"\)\./g,
    (_, specifier) =>
      `${specifier
        .split("/")
        .pop()
        .replace(/\.(d\.ts|ts|js)$/, "")}.`,
  );

/** Returns the first type argument of the outermost Effect.Effect<...> in a declaration, if any. */
const successTypeOf = (text) => {
  const start = text.indexOf("Effect.Effect<");
  if (start < 0) return undefined;
  let index = start + "Effect.Effect<".length;
  let depth = 0;
  const begin = index;
  while (index < text.length) {
    const character = text[index];
    if (character === "<" || character === "(" || character === "[" || character === "{")
      depth += 1;
    else if (character === ">" || character === ")" || character === "]" || character === "}") {
      if (depth === 0) break;
      depth -= 1;
    } else if (character === "," && depth === 0) break;
    index += 1;
  }
  return text.slice(begin, index).trim();
};

const clean = (text) =>
  shortenImports(text)
    .replace(/^export\s+/, "")
    .replace(/^declare\s+/, "")
    .replace(/^(type|interface|class|const|function|enum|namespace)\s+/, "$1 ");

const docText = (doc) =>
  doc
    .replace(/^\/\*\*\s*/, "")
    .replace(/\s*\*\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trimEnd())
    .join("\n")
    .trim();

/** Prints a re-exported declaration under the name consumers import it by. */
const renamed = (text, exported) => {
  const declared = text.match(declarationPattern)?.[2];
  if (declared === undefined || declared === exported) return text;
  return text.replace(
    new RegExp(
      `^((?:const|let|var|function|class|interface|type|enum|namespace)\\s+)${declared}\\b`,
    ),
    `$1${exported}`,
  );
};

const renderMember = (heading, member) => {
  const lines = [`#### \`${heading}\``, ""];
  const declarations = declarationsOf(member.file, member.name);
  if (declarations.length === 0) throw new Error(`No declaration found for ${heading}`);
  const docs = declarations.map(({ doc }) => docText(doc)).filter((text) => text.length > 0);
  if (docs.length > 0) lines.push([...new Set(docs)].join("\n\n"), "");
  const code = [...new Set(declarations.map(({ text }) => renamed(clean(text), member.name)))];
  const resolved = code.map((text) => {
    const alias = text.match(/^type (\w+) = Effect\.Success<ReturnType<typeof (\w+)>>;$/);
    if (alias === null) return text;
    const [target] = declarationsOf(member.file, alias[2]);
    const success = target === undefined ? undefined : successTypeOf(shortenImports(target.text));
    return success === undefined
      ? text
      : `// The success type of ${alias[2]}.\ntype ${alias[1]} = ${success};`;
  });
  lines.push("```ts", resolved.join("\n"), "```", "");
  return lines;
};

const renderNamespace = (prefix, file, lines) => {
  for (const [name, member] of exportsOf(file)) {
    const heading = `${prefix}.${name}`;
    if (member.kind === "namespace") {
      lines.push(`#### \`${heading}\``, "", `Namespace; see the members below.`, "");
      renderNamespace(heading, member.file, lines);
    } else lines.push(...renderMember(heading, member));
  }
};

const render = () => {
  const lines = [
    "# API reference",
    "",
    "Generated from the built declaration files by `scripts/api-reference.mjs`. Regenerate with `pnpm docs:reference`; the root test script checks that this file is current. Inline import types are shortened to their module name, and a handle alias over a constructor's result is printed as that result type.",
    "",
  ];
  for (const [name, file] of entries) {
    lines.push(`## \`${name}\``, "");
    for (const [exportName, member] of exportsOf(file)) {
      if (member.kind === "namespace") {
        lines.push(`### \`${exportName}\``, "");
        renderNamespace(exportName, member.file, lines);
      } else {
        lines.push(`### \`${exportName}\``, "");
        lines.push(...renderMember(exportName, member).slice(2));
      }
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
};

// The repository formatter reflows the code fences, so the file is always written formatted and
// the check compares against a formatted rendering.
const format = (path) => {
  const result = spawnSync(resolve("node_modules/.bin/oxfmt"), [path], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`oxfmt failed for ${path}: ${result.stderr}`);
};

const rendered = render();
if (process.argv.includes("--check")) {
  const directory = mkdtempSync(join(tmpdir(), "sewed-reference-"));
  const candidate = join(directory, "reference.md");
  writeFileSync(candidate, rendered);
  format(candidate);
  const expected = readFileSync(candidate, "utf8");
  rmSync(directory, { recursive: true, force: true });
  if (readFileSync(output, "utf8") !== expected) {
    console.error(`${output} is out of date; run pnpm docs:reference`);
    process.exitCode = 1;
  }
} else {
  writeFileSync(output, rendered);
  format(output);
  console.log(`Wrote ${output}`);
}
