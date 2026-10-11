import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { docsGroups } from "../src/sidebar.ts";
import { withBase } from "../src/site.ts";

const website = fileURLToPath(new URL("..", import.meta.url));
const source = path.resolve(website, "../docs");
const target = path.join(website, "src/content/docs");
const repository = "https://github.com/lucasacoutinho/sewed";

const listed = new Set(docsGroups.flatMap((group) => group.items.map((item) => item.slug)));
const files = (await readdir(source)).filter((name) => name.endsWith(".md")).sort();
const slugs = new Set(files.map((name) => name.slice(0, -".md".length)));

const missing = [...slugs].filter((slug) => !listed.has(slug));
const stale = [...listed].filter((slug) => !slugs.has(slug));
if (missing.length > 0 || stale.length > 0) {
  const lines = [
    ...missing.map((slug) => `docs/${slug}.md is not listed in website/src/sidebar.ts`),
    ...stale.map(
      (slug) => `website/src/sidebar.ts lists ${slug}, but docs/${slug}.md does not exist`,
    ),
  ];
  throw new Error(lines.join("\n"));
}

const plainText = (markdown) =>
  markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const describe = (lines) => {
  const paragraph = [];
  for (const line of lines) {
    if (paragraph.length === 0) {
      if (line.trim() === "") continue;
      if (/^(```|[|>#-]|\d+\. )/.test(line)) return "";
    } else if (line.trim() === "") break;
    paragraph.push(line);
  }
  const text = plainText(paragraph.join(" "));
  if (text.length <= 180) return text;
  let summary = "";
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const next = summary === "" ? sentence : `${summary} ${sentence}`;
    if (next.length > 180) break;
    summary = next;
  }
  return summary === "" ? `${text.slice(0, text.lastIndexOf(" ", 177))}…` : summary;
};

const rewriteLink = (url) => {
  if (/^(?:[a-z]+:|#)/i.test(url)) return url;
  const [file, fragment] = url.split("#", 2);
  const suffix = fragment === undefined ? "" : `#${fragment}`;
  if (file.endsWith(".md")) {
    const slug = path.posix.basename(file, ".md");
    if (path.posix.dirname(file) === "." && slugs.has(slug))
      return `${withBase(`/${slug}/`)}${suffix}`;
  }
  const relative = path.posix.normalize(path.posix.join("docs", file));
  return `${repository}/blob/main/${relative}${suffix}`;
};

const rewriteLinks = (body) => {
  let fenced = false;
  return body
    .split("\n")
    .map((line) => {
      if (line.startsWith("```")) {
        fenced = !fenced;
        return line;
      }
      return fenced ? line : line.replace(/\]\(([^)\s]+)\)/g, (_, url) => `](${rewriteLink(url)})`);
    })
    .join("\n");
};

const frontmatter = (slug, title, description) => {
  const lines = [`title: ${JSON.stringify(title)}`];
  if (description !== "") lines.push(`description: ${JSON.stringify(description)}`);
  lines.push(`editUrl: ${JSON.stringify(`${repository}/edit/main/docs/${slug}.md`)}`);
  if (slug === "reference") {
    lines.push("tableOfContents:", "  minHeadingLevel: 2", "  maxHeadingLevel: 3");
  }
  return `---\n${lines.join("\n")}\n---\n`;
};

/**
 * The API reference is one generated file in `docs/`, far too large to serve as one page. It
 * becomes an index and a page per module: an entry point's `###` sections each get a page when
 * the entry point is large, and a small entry point is one page.
 */
const splitAbove = 30_000;
const pageSlug = (name) =>
  name
    .replace(/`/g, "")
    .replace(/^@/, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
const sections = (lines, marker) => {
  const found = [];
  let preamble = [];
  for (const line of lines) {
    if (line.startsWith(marker)) found.push({ name: line.slice(marker.length).trim(), lines: [] });
    else if (found.length === 0) preamble.push(line);
    else found.at(-1).lines.push(line);
  }
  return { preamble, found };
};
const referencePage = (title, body) =>
  `---\ntitle: ${JSON.stringify(title)}\neditUrl: false\ntableOfContents:\n  minHeadingLevel: 2\n  maxHeadingLevel: 3\n---\n\n${body.replace(/^\n+/, "")}\n`;
/** Raises headings so a page's own sections start at level two. */
const raise = (lines, by) =>
  lines.map((line) => (/^#{3,6} /.test(line) ? line.slice(by) : line)).join("\n");
const writeReference = async (title, rest) => {
  const { preamble, found: entries } = sections(rest, "## ");
  const index = [...preamble, ""];
  const directory = path.join(target, "reference");
  await mkdir(directory, { recursive: true });
  const taken = new Set();
  const claim = (slug) => {
    let unique = slug;
    for (let count = 2; taken.has(unique); count++) unique = `${slug}-${count}`;
    taken.add(unique);
    return unique;
  };
  let pages = 0;
  for (const entry of entries) {
    const entrySlug = pageSlug(entry.name);
    const label = entry.name.replace(/`/g, "");
    index.push(`## ${entry.name}`, "");
    const size = entry.lines.reduce((sum, line) => sum + line.length + 1, 0);
    if (size <= splitAbove) {
      const slug = claim(entrySlug);
      await writeFile(
        path.join(directory, `${slug}.md`),
        referencePage(label, raise(entry.lines, 1)),
      );
      index.push(`- [Everything in ${entry.name}](${withBase(`/reference/${slug}/`)})`, "");
      pages += 1;
      continue;
    }
    const { preamble: lead, found: modules } = sections(entry.lines, "### ");
    index.push(...lead);
    for (const module of modules) {
      const slug = claim(`${entrySlug}-${pageSlug(module.name)}`);
      await writeFile(
        path.join(directory, `${slug}.md`),
        referencePage(`${module.name.replace(/`/g, "")} (${label})`, raise(module.lines, 2)),
      );
      index.push(`- [${module.name}](${withBase(`/reference/${slug}/`)})`);
      pages += 1;
    }
    index.push("");
  }
  const body = index.join("\n");
  await writeFile(
    path.join(target, "reference.md"),
    `${frontmatter("reference", title, describe(preamble))}\n${body.replace(/^\n+/, "")}\n`,
  );
  return pages;
};

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
let referencePages = 0;

for (const name of files) {
  const slug = name.slice(0, -".md".length);
  const text = await readFile(path.join(source, name), "utf8");
  const lines = text.split("\n");
  const heading = lines.findIndex((line) => line.startsWith("# "));
  if (heading === -1) throw new Error(`docs/${name} has no level-one heading`);
  const title = lines[heading].slice(2).trim();
  const rest = lines.slice(heading + 1);
  if (slug === "reference") {
    referencePages = await writeReference(title, rest);
    continue;
  }
  const body = rewriteLinks(rest.join("\n")).replace(/^\n+/, "");
  const page = `${frontmatter(slug, title, describe(rest))}\n${body}`;
  await writeFile(path.join(target, name), page.endsWith("\n") ? page : `${page}\n`);
}

console.log(
  `Synced ${files.length} guides from docs/ into website/src/content/docs/, the API reference as ${referencePages} pages`,
);
