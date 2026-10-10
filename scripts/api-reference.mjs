import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { SyntaxKind } from "typescript/unstable/ast";
import { createScanner, tokenIsIdentifierOrKeyword } from "typescript/unstable/ast/scanner";
import { readManifest, readObject, typedExports } from "./internal/package-manifest.mjs";

const args = process.argv.slice(2);
if (args.length !== 0 && !(args.length === 1 && args[0] === "--check")) {
  console.error("Usage: api-reference.mjs [--check]");
  process.exit(2);
}
const checking = args.length === 1;
const root = fileURLToPath(new URL("..", import.meta.url));
const output = join(root, "docs/reference.md");
const projects = readObject(join(root, "tsconfig.json")).references;
if (!Array.isArray(projects)) throw new Error("tsconfig.json references must be an array");
/** @type {[string, string][]} */
const entries = [];
for (const value of projects) {
  /** @type {unknown} */
  const project = value;
  if (
    project === null ||
    typeof project !== "object" ||
    !("path" in project) ||
    typeof project.path !== "string"
  )
    throw new Error("tsconfig.json references require project paths");
  const pkg = readManifest(join(root, project.path, "package.json"));
  for (const [name, types] of typedExports(pkg))
    entries.push([name, join(root, project.path, types)]);
}

/** @typedef {{ text: string; doc: string }} Statement */
/** @typedef {{ file: string; name: string; typeOnly: boolean }} Origin */
/** @typedef {{ kind: "namespace"; file: string; typeOnly: boolean } | { kind: "declaration"; origins: Origin[] }} Member */
/** @typedef {{ kind: "namespace"; file: string; typeOnly: boolean } | { kind: "local"; name: string; typeOnly: boolean } | { kind: "reexport"; file: string; name: string; typeOnly: boolean }} Export */
/** @typedef {{ kind: "namespace"; specifier: string; typeOnly: boolean } | { kind: "named"; specifier: string; name: string; typeOnly: boolean }} Import */
/** @typedef {{ path: string; statements: Statement[]; exports: Map<string, Export[]>; imports: Map<string, Import>; stars: { file: string; typeOnly: boolean }[] }} File */

/** Required capture groups are present after their fixed declaration regex matches. @param {RegExpMatchArray} match @param {number} index */
const capture = (match, index) => {
  const value = match[index];
  if (value === undefined) throw new Error(`Missing declaration capture ${index}`);
  return value;
};

const blockKeywords = new Set(["interface", "class", "namespace", "module", "enum"]);
const reservedNames = new Set(
  "break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with implements interface let package private protected public static yield await".split(
    " ",
  ),
);
const declarationPattern =
  /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(const\s+enum|const|let|var|function|class|interface|type|enum|namespace|module)\s+([$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*)/u;

/** @typedef {{ kind: "word" | "literal" | "comment" | "punctuation"; text: string; start: number; end: number }} Token */
const groups = new Map([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
]);
const closingGroups = new Set(groups.values());

/**
 * The compiler's own scanner, reduced to what the structural passes read: words, whole literals
 * (a template with its substitutions is one), comments, and punctuation one character at a time
 * except `=>`. @param {string} source @returns {Token[]}
 */
const tokensOf = (source) => {
  /** @type {Token[]} */
  const tokens = [];
  const scanner = createScanner(false, undefined, source);
  /** The template being read, and per open substitution the groups opened inside it. */
  /** @type {{ start: number; substitutions: { start: number; expected: string[] }[] } | undefined} */
  let template;
  /** @param {SyntaxKind} kind */
  const isTemplatePart = (kind) =>
    kind === SyntaxKind.NoSubstitutionTemplateLiteral ||
    kind === SyntaxKind.TemplateHead ||
    kind === SyntaxKind.TemplateMiddle ||
    kind === SyntaxKind.TemplateTail;
  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
    const substitution = template?.substitutions.at(-1);
    if (kind === SyntaxKind.CloseBraceToken && substitution?.expected.length === 0)
      kind = scanner.reScanTemplateToken(false);
    const start = scanner.getTokenStart();
    const end = scanner.getTokenEnd();
    const text = source.slice(start, end);
    if (scanner.isUnterminated()) {
      const what =
        kind === SyntaxKind.MultiLineCommentTrivia
          ? "comment"
          : isTemplatePart(kind)
            ? "template"
            : "string";
      throw new Error(`Unterminated declaration ${what} at offset ${start}`);
    }
    if (kind === SyntaxKind.TemplateHead) {
      template ??= { start, substitutions: [] };
      template.substitutions.push({ start: end - 2, expected: [] });
      continue;
    }
    if (template !== undefined && substitution !== undefined) {
      if (kind === SyntaxKind.TemplateTail) template.substitutions.pop();
      else if (kind !== SyntaxKind.TemplateMiddle) {
        const closing = groups.get(text);
        if (closing !== undefined) substitution.expected.push(closing);
        else if (closingGroups.has(text) && substitution.expected.pop() !== text)
          throw new Error(`Mismatched template delimiter ${text} at offset ${start}`);
      }
      if (template.substitutions.length === 0) {
        tokens.push({
          kind: "literal",
          text: source.slice(template.start, end),
          start: template.start,
          end,
        });
        template = undefined;
      }
      continue;
    }
    if (kind === SyntaxKind.WhitespaceTrivia || kind === SyntaxKind.NewLineTrivia) continue;
    if (kind === SyntaxKind.SingleLineCommentTrivia || kind === SyntaxKind.MultiLineCommentTrivia)
      tokens.push({ kind: "comment", text, start, end });
    else if (tokenIsIdentifierOrKeyword(kind)) tokens.push({ kind: "word", text, start, end });
    else if (
      kind === SyntaxKind.StringLiteral ||
      kind === SyntaxKind.NumericLiteral ||
      kind === SyntaxKind.BigIntLiteral ||
      isTemplatePart(kind)
    )
      tokens.push({ kind: "literal", text, start, end });
    else if (kind === SyntaxKind.PrivateIdentifier) {
      tokens.push({ kind: "punctuation", text: "#", start, end: start + 1 });
      tokens.push({ kind: "word", text: text.slice(1), start: start + 1, end });
    } else if (text === "=>") tokens.push({ kind: "punctuation", text, start, end });
    else
      for (const [offset, character] of [...text].entries())
        tokens.push({
          kind: "punctuation",
          text: character,
          start: start + offset,
          end: start + offset + 1,
        });
  }
  const open = template?.substitutions.at(-1);
  if (open !== undefined)
    throw new Error(`Unterminated template interpolation at offset ${open.start}`);
  return tokens;
};

/** Splits top-level declarations and retains leading JSDoc while ignoring other leading comments. @param {string} source @returns {Statement[]} */
const statements = (source) => {
  /** @type {Statement[]} */
  const result = [];
  /** @type {number | undefined} */
  let start;
  /** @type {string | undefined} */
  let keyword;
  let doc = "";
  /** @type {{ closing: string; start: number }[]} */
  const expected = [];
  /** @param {number} end */
  const finish = (end) => {
    if (start !== undefined) result.push({ text: source.slice(start, end).trim(), doc });
    start = undefined;
    keyword = undefined;
    doc = "";
  };
  for (const token of tokensOf(source)) {
    if (token.kind === "comment") {
      if (start === undefined && token.text.startsWith("/**")) doc = token.text;
      continue;
    }
    if (start === undefined && token.text === ";") continue;
    start ??= token.start;
    if (keyword === undefined && !["export", "declare", "abstract"].includes(token.text))
      keyword = token.text;
    if (
      keyword === "const" &&
      token.text === "enum" &&
      /^(?:export\s+)?(?:declare\s+)?const\s+enum$/.test(source.slice(start, token.end))
    )
      keyword = "enum";
    if (token.kind !== "punctuation") continue;
    const closing = groups.get(token.text);
    if (closing !== undefined) expected.push({ closing, start: token.start });
    else if (closingGroups.has(token.text)) {
      if (expected.pop()?.closing !== token.text)
        throw new Error(`Mismatched declaration delimiter ${token.text} at offset ${token.start}`);
      if (expected.length === 0 && token.text === "}" && blockKeywords.has(keyword ?? ""))
        finish(token.end);
    }
    if (token.text === ";" && expected.length === 0) finish(token.end);
  }
  const unclosed = expected.at(-1);
  if (unclosed !== undefined)
    throw new Error(
      `Unterminated declaration group at offset ${unclosed.start}; expected ${unclosed.closing}`,
    );
  finish(source.length);
  return result;
};

/** @param {string} from @param {string} specifier */
const target = (from, specifier) => {
  if (!specifier.startsWith("./") && !specifier.startsWith("../"))
    throw new Error(`Unsupported external declaration re-export ${specifier} in ${from}`);
  if (!/\.(?:[cm]?[jt]s)$/.test(specifier))
    throw new Error(`Unsupported declaration module specifier ${specifier} in ${from}`);
  const declaration = specifier.replace(/(?<!\.d)\.([cm]?)[jt]s$/, ".d.$1ts");
  return resolve(dirname(from), declaration);
};

/** Only simple quoted module paths are supported; escaped paths fail before resolution. @param {Token | undefined} token */
const moduleSpecifier = (token) => {
  if (token?.kind !== "literal" || !/^(?:"[^"\\]*"|'[^'\\]*')$/.test(token.text))
    throw new Error(`Unsupported declaration module specifier ${token?.text ?? "<missing>"}`);
  return token.text.slice(1, -1);
};

/** @param {Token[]} tokens @returns {{ local: string; exported: string; typeOnly: boolean }[]} */
const names = (tokens) => {
  /** @type {{ local: string; exported: string; typeOnly: boolean }[]} */
  const result = [];
  let index = 0;
  while (index < tokens.length) {
    let typeOnly = false;
    if (
      tokens[index]?.text === "type" &&
      tokens[index + 1]?.kind === "word" &&
      tokens[index + 1]?.text !== "as"
    ) {
      typeOnly = true;
      index += 1;
    }
    const local = tokens[index++];
    if (local?.kind !== "word")
      throw new Error(`Unsupported declaration export name ${local?.text ?? "<missing>"}`);
    let exported = local.text;
    if (tokens[index]?.text === "as") {
      const alias = tokens[++index];
      if (alias?.kind !== "word")
        throw new Error(`Unsupported declaration export name ${alias?.text ?? "<missing>"}`);
      exported = alias.text;
      index += 1;
    }
    result.push({ local: local.text, exported, typeOnly });
    if (index < tokens.length && tokens[index++]?.text !== ",")
      throw new Error("Unsupported declaration export list");
  }
  return result;
};

/** Reject compound variables and adjacent semicolonless declarations instead of publishing partial coverage. @param {string} text @param {Token[]} tokens */
const checkDeclaration = (text, tokens) => {
  const match = text.match(declarationPattern);
  if (match === null) return;
  let depth = 0;
  let angles = 0;
  const variable = ["const", "let", "var"].includes(capture(match, 1));
  for (const [index, token] of tokens.entries()) {
    if (token.start < match[0].length) continue;
    if (token.kind === "punctuation") {
      if (groups.has(token.text)) depth += 1;
      else if (closingGroups.has(token.text)) depth -= 1;
      else if (token.text === "<") angles += 1;
      else if (token.text === ">") angles -= 1;
      if (variable && token.text === "," && depth === 0 && angles === 0)
        throw new Error("Unsupported compound variable declaration");
    }
    const next = tokens[index + 1];
    const declarationStart =
      ["export", "declare"].includes(token.text) ||
      (token.text === "import" && next?.text !== "(") ||
      ([
        "type",
        "interface",
        "class",
        "const",
        "let",
        "var",
        "function",
        "enum",
        "namespace",
        "module",
      ].includes(token.text) &&
        next?.kind === "word");
    if (
      token.kind === "word" &&
      depth === 0 &&
      angles === 0 &&
      declarationStart &&
      /[\r\n]/.test(text.slice(tokens[index - 1]?.end ?? 0, token.start))
    )
      throw new Error("Unsupported adjacent semicolonless declarations");
  }
};

/** @type {Map<string, File>} */
const files = new Map();
/** @param {string} file @returns {File} */
const load = (file) => {
  const path = resolve(file);
  const cached = files.get(path);
  if (cached !== undefined) return cached;
  /** @type {File} */
  const loaded = {
    path,
    statements: statements(readFileSync(path, "utf8")),
    exports: new Map(),
    imports: new Map(),
    stars: [],
  };
  /** @param {string} name @param {Export} member */
  const addExport = (name, member) => {
    const exports = loaded.exports.get(name) ?? [];
    exports.push(member);
    loaded.exports.set(name, exports);
  };
  for (const { text } of loaded.statements) {
    const tokens = tokensOf(text).filter((token) => token.kind !== "comment");
    checkDeclaration(text, tokens);
    if (tokens.at(-1)?.text === ";") tokens.pop();
    const operation = tokens[0]?.text;
    const typeOnly = tokens[1]?.text === "type" && ["{", "*"].includes(tokens[2]?.text ?? "");
    let index = typeOnly ? 2 : 1;
    const form = tokens[index]?.text;
    if ((operation === "export" || operation === "import") && (form === "*" || form === "{")) {
      /** @type {string | undefined} */
      let namespace;
      /** @type {{ local: string; exported: string; typeOnly: boolean }[] | undefined} */
      let entries;
      if (form === "*") {
        index += 1;
        if (tokens[index]?.text === "as") {
          const alias = tokens[++index];
          if (alias?.kind !== "word")
            throw new Error(`Unsupported declaration export name ${alias?.text ?? "<missing>"}`);
          namespace = alias.text;
          index += 1;
        }
      } else {
        const end = tokens.findIndex((token, position) => position > index && token.text === "}");
        if (end === -1) throw new Error(`Unsupported declaration export list in ${path}`);
        entries = names(tokens.slice(index + 1, end));
        index = end + 1;
      }
      /** @type {string | undefined} */
      let specifier;
      if (tokens[index]?.text === "from") {
        specifier = moduleSpecifier(tokens[index + 1]);
        index += 2;
      }
      if (
        index !== tokens.length ||
        (specifier === undefined && (form === "*" || operation === "import")) ||
        (operation === "import" && form === "*" && namespace === undefined)
      )
        throw new Error(`Unsupported declaration ${operation} in ${path}: ${text}`);
      if (namespace !== undefined && specifier !== undefined) {
        if (operation === "export")
          addExport(namespace, { kind: "namespace", file: target(path, specifier), typeOnly });
        else loaded.imports.set(namespace, { kind: "namespace", specifier, typeOnly });
      } else if (entries !== undefined) {
        for (const entry of entries) {
          if (operation === "export")
            addExport(
              entry.exported,
              specifier === undefined
                ? { kind: "local", name: entry.local, typeOnly: typeOnly || entry.typeOnly }
                : {
                    kind: "reexport",
                    file: target(path, specifier),
                    name: entry.local,
                    typeOnly: typeOnly || entry.typeOnly,
                  },
            );
          else if (specifier !== undefined)
            loaded.imports.set(entry.exported, {
              kind: "named",
              specifier,
              name: entry.local,
              typeOnly: typeOnly || entry.typeOnly,
            });
        }
      } else if (specifier !== undefined)
        loaded.stars.push({ file: target(path, specifier), typeOnly });
      continue;
    }
    const declared = text.match(declarationPattern);
    if (declared && operation === "export") {
      const name = capture(declared, 2);
      addExport(name, { kind: "local", name, typeOnly: false });
    } else if (operation === "export" || operation === "import") {
      throw new Error(`Unsupported declaration ${operation} in ${path}: ${text}`);
    }
  }
  files.set(path, loaded);
  return loaded;
};

/** @param {File} file @param {string} name @param {Set<string>} resolving @returns {Member | undefined} */
const localMember = (file, name, resolving) => {
  if (file.statements.some(({ text }) => text.match(declarationPattern)?.[2] === name))
    return { kind: "declaration", origins: [{ file: file.path, name, typeOnly: false }] };
  const imported = file.imports.get(name);
  if (imported?.kind === "namespace")
    return {
      kind: "namespace",
      file: target(file.path, imported.specifier),
      typeOnly: imported.typeOnly,
    };
  if (imported?.kind === "named")
    return withTypeOnly(
      resolveExport(target(file.path, imported.specifier), imported.name, resolving),
      imported.typeOnly,
    );
  return undefined;
};

/** Public import/export qualifiers restrict the original declaration without changing its identity. @param {Member | undefined} member @param {boolean} typeOnly @returns {Member | undefined} */
const withTypeOnly = (member, typeOnly) => {
  if (member === undefined || !typeOnly) return member;
  return member.kind === "namespace"
    ? { ...member, typeOnly }
    : { kind: "declaration", origins: member.origins.map((origin) => ({ ...origin, typeOnly })) };
};

/** @param {Member} left @param {Member} right @returns {Member} */
const mergeMembers = (left, right) => {
  if (left.kind === "declaration" && right.kind === "declaration")
    return { kind: "declaration", origins: origins([...left.origins, ...right.origins]) };
  if (left.kind === "namespace" && right.kind === "namespace" && left.file === right.file)
    return { ...left, typeOnly: left.typeOnly && right.typeOnly };
  throw new Error("Unsupported merged namespace export");
};

/** Follows one export to its original declaration. Branch-local keys terminate cycles without hiding sibling paths. @param {string} file @param {string} name @param {Set<string>} resolving @returns {Member | undefined} */
const resolveExport = (file, name, resolving) => {
  const loaded = load(file);
  const key = JSON.stringify([loaded.path, name]);
  if (resolving.has(key)) return undefined;
  resolving.add(key);
  try {
    const explicit = loaded.exports.get(name);
    if (explicit !== undefined) {
      /** @type {Member | undefined} */
      let member;
      for (const entry of explicit) {
        const candidate =
          entry.kind === "namespace"
            ? entry
            : entry.kind === "local"
              ? withTypeOnly(localMember(loaded, entry.name, resolving), entry.typeOnly)
              : withTypeOnly(resolveExport(entry.file, entry.name, resolving), entry.typeOnly);
        if (candidate === undefined) return undefined;
        if (member === undefined) member = candidate;
        else member = mergeMembers(member, candidate);
      }
      return member;
    }
    if (name === "default") return undefined;
    /** @type {Member | undefined} */
    let member;
    for (const star of loaded.stars) {
      const candidate = withTypeOnly(resolveExport(star.file, name, resolving), star.typeOnly);
      if (candidate === undefined) continue;
      if (member !== undefined && !sameMember(member, candidate))
        throw new Error(`Ambiguous declaration export ${name} in ${loaded.path}`);
      member = member === undefined ? candidate : mergeMembers(member, candidate);
    }
    return member;
  } finally {
    resolving.delete(key);
  }
};

/** @param {Origin[]} values */
const origins = (values) => {
  /** @type {Map<string, Origin>} */
  const unique = new Map();
  for (const origin of values) {
    const key = JSON.stringify([origin.file, origin.name]);
    const previous = unique.get(key);
    unique.set(key, { ...origin, typeOnly: (previous?.typeOnly ?? true) && origin.typeOnly });
  }
  return [...unique.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, origin]) => origin);
};

/** @param {Member} left @param {Member} right */
const sameMember = (left, right) =>
  left.kind === "namespace"
    ? right.kind === "namespace" && left.file === right.file
    : right.kind === "declaration" &&
      left.origins.length === right.origins.length &&
      left.origins.every(
        (origin, index) =>
          origin.file === right.origins[index]?.file && origin.name === right.origins[index]?.name,
      );

/** @param {Origin} origin @returns {Statement[]} */
const declarationsAt = (origin) =>
  load(origin.file).statements.filter(
    ({ text }) => text.match(declarationPattern)?.[2] === origin.name,
  );

/** Every exported member, including star barrels. Explicit exports shadow stars; diamonds share their original declaration. @param {string} file @returns {[string, Member][]} */
const exportsOf = (file) => {
  /** @type {Set<string>} */
  const names = new Set();
  /** @type {Set<string>} */
  const visited = new Set();
  /** @param {string} path */
  const collect = (path) => {
    const loaded = load(path);
    if (visited.has(loaded.path)) return;
    visited.add(loaded.path);
    for (const name of loaded.exports.keys())
      if (name !== "default" || loaded.path === resolve(file)) names.add(name);
    for (const star of loaded.stars) collect(star.file);
  };
  collect(file);
  return [...names]
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const member = resolveExport(file, name, new Set());
      if (member === undefined) throw new Error(`No declaration found for ${name} in ${file}`);
      return [name, member];
    });
};

/** Shortens actual inline import types, preserving literals, templates, comments, and paths without an identifier basename. @param {string} text */
const shortenImports = (text) => {
  const tokens = tokensOf(text);
  let result = "";
  let start = 0;
  for (const [index, token] of tokens.entries()) {
    if (token.kind !== "word" || token.text !== "import" || tokens[index - 1]?.text === ".")
      continue;
    const specifier = tokens[index + 2];
    const end = tokens[index + 4];
    if (
      tokens[index + 1]?.text !== "(" ||
      specifier?.kind !== "literal" ||
      !/^(?:"[^"\\]*"|'[^'\\]*')$/.test(specifier.text) ||
      tokens[index + 3]?.text !== ")" ||
      end?.text !== "."
    )
      continue;
    const name = specifier.text
      .slice(1, -1)
      .split("/")
      .at(-1)
      ?.replace(/\.(?:d\.)?[cm]?[jt]s$/, "");
    if (
      name === undefined ||
      reservedNames.has(name) ||
      !/^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u.test(name)
    )
      continue;
    result += text.slice(start, token.start) + name + ".";
    start = end.end;
  }
  return result + text.slice(start);
};

/** @param {string} text */
const clean = (text) =>
  shortenImports(text)
    .replace(/^export\s+/, "")
    .replace(/^declare\s+/, "")
    .replace(/^(type|interface|class|const|function|enum|namespace)\s+/, "$1 ");

/** @param {string} doc */
const docText = (doc) =>
  doc
    .replace(/^\/\*\*\s*/, "")
    .replace(/\s*\*\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trimEnd())
    .join("\n")
    .trim();

/** @param {string} heading @param {Extract<Member, {kind: "declaration"}>} member @param {string} exported */
const renderMember = (heading, member, exported) => {
  const lines = [`#### \`${heading}\``, ""];
  const declarations = member.origins.flatMap((origin) =>
    declarationsAt(origin).map((declaration) => ({ ...declaration, typeOnly: origin.typeOnly })),
  );
  if (declarations.length === 0) throw new Error(`No declaration found for ${heading}`);
  const docs = declarations.map(({ doc }) => docText(doc)).filter((text) => text.length > 0);
  if (docs.length > 0) lines.push([...new Set(docs)].join("\n\n"), "");
  const code = declarations.map(({ text }) => clean(text));
  /** @type {Map<string, boolean>} */
  const aliases = new Map();
  for (const { text, typeOnly: exportedTypeOnly } of declarations) {
    const match = text.match(declarationPattern);
    if (match === null) continue;
    const name = capture(match, 2);
    const declarationTypeOnly = ["type", "interface"].includes(capture(match, 1));
    if (name === exported && (!exportedTypeOnly || declarationTypeOnly)) continue;
    const typeOnly = exportedTypeOnly || declarationTypeOnly;
    aliases.set(name, (aliases.get(name) ?? true) && typeOnly);
  }
  for (const [name, typeOnly] of aliases)
    code.push(`export ${typeOnly ? "type " : ""}{ ${name} as ${exported} };`);
  lines.push("```ts", [...new Set(code)].join("\n"), "```", "");
  return lines;
};

/** @param {string} prefix @param {string} file @param {string[]} lines @param {Map<string, string>} ancestors */
const renderNamespace = (prefix, file, lines, ancestors) => {
  const path = resolve(file);
  const previous = ancestors.get(path);
  if (previous !== undefined) {
    lines.push(`Namespace; see \`${previous}\` above.`, "");
    return;
  }
  ancestors.set(path, prefix);
  try {
    for (const [name, member] of exportsOf(file)) {
      const heading = `${prefix}.${name}`;
      if (member.kind === "namespace") {
        lines.push(`#### \`${heading}\``, "");
        if (member.typeOnly) lines.push("Type-only export.", "");
        if (!ancestors.has(resolve(member.file)))
          lines.push("Namespace; see the members below.", "");
        renderNamespace(heading, member.file, lines, ancestors);
      } else lines.push(...renderMember(heading, member, name));
    }
  } finally {
    ancestors.delete(path);
  }
};

const render = () => {
  const lines = [
    "# API reference",
    "",
    "Generated from the built declaration files by `scripts/api-reference.mjs`. Run `pnpm docs:reference` to refresh it. Inline import types use their module name when it is a valid identifier. Declarations keep their original names, followed by any public export aliases; constructor result aliases keep their declared form.",
    "",
  ];
  for (const [name, file] of entries) {
    lines.push(`## \`${name}\``, "");
    for (const [exportName, member] of exportsOf(file)) {
      if (member.kind === "namespace") {
        lines.push(`### \`${exportName}\``, "");
        if (member.typeOnly) lines.push("Type-only export.", "");
        renderNamespace(exportName, member.file, lines, new Map([[resolve(file), name]]));
      } else {
        lines.push(`### \`${exportName}\``, "");
        lines.push(...renderMember(exportName, member, exportName).slice(2));
      }
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
};

/** @param {string} file */
const format = async (file) => {
  const manifest = createRequire(import.meta.url).resolve("oxfmt/package.json");
  const { bin } = readManifest(manifest);
  const entry = typeof bin === "string" ? bin : bin?.oxfmt;
  if (entry === undefined) throw new Error("oxfmt must declare a Node entry");
  await promisify(execFile)(process.execPath, [resolve(dirname(manifest), entry), file], {
    cwd: root,
  });
};

const rendered = render();
const directory = mkdtempSync(join(root, ".sewed-reference-"));
const candidate = join(directory, "reference.md");
try {
  writeFileSync(candidate, rendered);
  await format(candidate);
  if (checking) {
    if (readFileSync(output, "utf8") !== readFileSync(candidate, "utf8")) {
      console.error("docs/reference.md is out of date; run pnpm docs:reference");
      process.exitCode = 1;
    }
  } else {
    renameSync(candidate, output);
    console.log("Wrote docs/reference.md");
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
