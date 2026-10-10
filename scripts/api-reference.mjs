import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { SyntaxKind } from "typescript/unstable/ast";
import { isExportDeclaration } from "typescript/unstable/ast/is";
import {
  createScanner,
  getLeadingCommentRanges,
  skipTrivia,
  tokenIsIdentifierOrKeyword,
} from "typescript/unstable/ast/scanner";
import { API, SymbolFlags } from "typescript/unstable/sync";
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

/** @typedef {{ text: string; doc: string; name: string; typeOnly: boolean; typeDeclaration: boolean }} Declaration */
/** @typedef {{ kind: "namespace"; file: string; typeOnly: boolean } | { kind: "declaration"; declarations: Declaration[] }} Member */

const reservedNames = new Set(
  "break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with implements interface let package private protected public static yield await".split(
    " ",
  ),
);

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

const directory = mkdtempSync(join(root, ".sewed-reference-"));
// The compiler itself reads the built declarations: one throwaway project whose roots are the
// public entries. Its checker resolves every export, alias, star and namespace.
const config = join(directory, "tsconfig.json");
writeFileSync(
  config,
  JSON.stringify({
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      noEmit: true,
      skipLibCheck: true,
      types: [],
    },
    files: entries.map(([, file]) => file),
  }),
);
const api = new API({ cwd: root });

try {
  const project = api.updateSnapshot({ openProject: config }).getProject(config);
  if (project === undefined) throw new Error("The compiler opened no project for the reference");
  const { checker, program } = project;
  const [malformed] = program.getSyntacticDiagnostics();
  if (malformed !== undefined)
    throw new Error(`Malformed declaration file ${malformed.fileName}: ${malformed.text}`);

  /** @param {import("typescript/unstable/ast").Node} node */
  const sourceFileOf = (node) => {
    let current = node;
    while (current.kind !== SyntaxKind.SourceFile) current = current.parent;
    return /** @type {import("typescript/unstable/ast").SourceFile} */ (current);
  };

  /** Whether an import or export declaration, or the clause around it, is `type`-only. @param {import("typescript/unstable/ast").Node} node */
  const typeOnlyClause = (node) => {
    for (let current = node; current.kind !== SyntaxKind.SourceFile; current = current.parent)
      if ("isTypeOnly" in current && current.isTypeOnly === true) return true;
    return false;
  };

  /** Declarations that pass a name along instead of declaring it. */
  const forwarding = new Set([
    SyntaxKind.ExportSpecifier,
    SyntaxKind.ImportSpecifier,
    SyntaxKind.NamespaceExport,
    SyntaxKind.NamespaceImport,
    SyntaxKind.ImportClause,
    SyntaxKind.ExportAssignment,
  ]);

  /** @param {string} file */
  const moduleOf = (file) => {
    const sourceFile = program.getSourceFile(file);
    if (sourceFile === undefined) throw new Error(`No declaration file ${file}`);
    return { sourceFile, symbol: checker.getSymbolAtLocation(sourceFile) };
  };

  /** Whether a module names an export itself, by declaration or by a named re-export. @param {import("typescript/unstable/sync").Symbol} module @param {string} name */
  const declares = (module, name) =>
    [...module.getExports().keys()].some((key) => String(key) === name);

  /**
   * Whether every `export *` that brings `name` into `file` is `export type *`. A star leaves no
   * alias behind, so the qualifier is read from the declarations themselves.
   * @param {string} file @param {string} name @param {Set<string>} visited @returns {boolean | undefined}
   */
  const starTypeOnly = (file, name, visited) => {
    if (visited.has(file)) return undefined;
    visited.add(file);
    const { sourceFile } = moduleOf(file);
    /** @type {boolean | undefined} */
    let typeOnly;
    for (const statement of sourceFile.statements) {
      if (!isExportDeclaration(statement)) continue;
      if (statement.exportClause !== undefined || statement.moduleSpecifier === undefined) continue;
      const target = checker.getSymbolAtLocation(statement.moduleSpecifier);
      if (target === undefined) continue;
      const provided = checker.getExportsOfModule(target).some((symbol) => symbol.name === name);
      if (!provided) continue;
      const inner = statement.isTypeOnly === true;
      const declaration = target.declarations[0]?.resolve(project);
      const beyond =
        declaration === undefined || declares(target, name)
          ? false
          : (starTypeOnly(sourceFileOf(declaration).fileName, name, visited) ?? false);
      typeOnly = (typeOnly ?? true) && (inner || beyond);
    }
    return typeOnly;
  };

  /** Follows one export to its original declarations. @param {string} file @param {import("typescript/unstable/sync").Symbol} symbol @returns {Member | undefined} */
  const memberOf = (file, symbol) => {
    const module = moduleOf(file).symbol;
    const own = module !== undefined && declares(module, symbol.name);
    let typeOnly = own ? false : (starTypeOnly(file, symbol.name, new Set()) ?? false);
    /** @type {{ node: import("typescript/unstable/ast").Node; name: string }[]} */
    const declared = [];
    /** A name may be both declared and forwarded: a type beside `export { value as Name }`. @param {import("typescript/unstable/sync").Symbol} from */
    const collect = (from) => {
      for (const handle of from.declarations) {
        const node = handle.resolve(project);
        if (node === undefined) continue;
        if (forwarding.has(node.kind)) {
          if (typeOnlyClause(node)) typeOnly = true;
        } else declared.push({ node, name: from.name });
      }
    };
    let current = symbol;
    const seen = new Set([current]);
    for (;;) {
      collect(current);
      if ((current.flags & SymbolFlags.Alias) === 0) break;
      const next = checker.getImmediateAliasedSymbol(current);
      if (next === undefined || seen.has(next)) return undefined;
      seen.add(next);
      current = next;
    }
    const [first] = declared;
    if (first === undefined) return undefined;
    if (first.node.kind === SyntaxKind.SourceFile)
      return { kind: "namespace", file: sourceFileOf(first.node).fileName, typeOnly };
    return {
      kind: "declaration",
      declarations: declared.map(({ node, name }) => {
        // A variable's declaration is its whole statement.
        const statement = node.kind === SyntaxKind.VariableDeclaration ? node.parent.parent : node;
        const { text } = sourceFileOf(statement);
        const doc = (getLeadingCommentRanges(text, statement.pos) ?? [])
          .map((range) => text.slice(range.pos, range.end))
          .filter((comment) => comment.startsWith("/**"))
          .at(-1);
        return {
          text: text.slice(skipTrivia(text, statement.pos), statement.end).trim(),
          doc: doc ?? "",
          name,
          typeOnly,
          typeDeclaration:
            node.kind === SyntaxKind.TypeAliasDeclaration ||
            node.kind === SyntaxKind.InterfaceDeclaration,
        };
      }),
    };
  };

  /** Every exported member of a declaration file, by name. @param {string} file @returns {[string, Member][]} */
  const exportsOf = (file) => {
    const { symbol } = moduleOf(file);
    if (symbol === undefined) return [];
    return checker
      .getExportsOfModule(symbol)
      .map((exported) => {
        const member = memberOf(file, exported);
        if (member === undefined)
          throw new Error(`No declaration found for ${exported.name} in ${file}`);
        return /** @type {[string, Member]} */ ([exported.name, member]);
      })
      .sort(([left], [right]) => left.localeCompare(right));
  };

  /** @param {string} heading @param {Extract<Member, {kind: "declaration"}>} member @param {string} exported */
  const renderMember = (heading, member, exported) => {
    const lines = [`#### \`${heading}\``, ""];
    const { declarations } = member;
    const docs = declarations.map(({ doc }) => docText(doc)).filter((text) => text.length > 0);
    if (docs.length > 0) lines.push([...new Set(docs)].join("\n\n"), "");
    const code = declarations.map(({ text }) => clean(text));
    /** @type {Map<string, boolean>} */
    const aliases = new Map();
    for (const { name, typeOnly: exportedTypeOnly, typeDeclaration } of declarations) {
      if (name === exported && (!exportedTypeOnly || typeDeclaration)) continue;
      const typeOnly = exportedTypeOnly || typeDeclaration;
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

  const lines = [
    "# API reference",
    "",
    "Generated from the built declaration files by `scripts/api-reference.mjs`. Run `pnpm docs:reference` to refresh it. Inline import types use their module name when it is a valid identifier. Declarations keep their original names, followed by any public export aliases; constructor result aliases keep their declared form.",
    "",
  ];
  for (const [name, file] of entries) {
    lines.push(`## \`${name}\``, "");
    for (const [exportName, member] of exportsOf(file)) {
      lines.push(`### \`${exportName}\``, "");
      if (member.kind === "namespace") {
        if (member.typeOnly) lines.push("Type-only export.", "");
        renderNamespace(exportName, member.file, lines, new Map([[resolve(file), name]]));
      } else lines.push(...renderMember(exportName, member, exportName).slice(2));
    }
  }

  const candidate = join(directory, "reference.md");
  writeFileSync(candidate, `${lines.join("\n").trimEnd()}\n`);
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
  api.close();
  rmSync(directory, { recursive: true, force: true });
}
