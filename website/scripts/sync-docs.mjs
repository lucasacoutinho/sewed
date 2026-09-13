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

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const name of files) {
  const slug = name.slice(0, -".md".length);
  const text = await readFile(path.join(source, name), "utf8");
  const lines = text.split("\n");
  const heading = lines.findIndex((line) => line.startsWith("# "));
  if (heading === -1) throw new Error(`docs/${name} has no level-one heading`);
  const title = lines[heading].slice(2).trim();
  const rest = lines.slice(heading + 1);
  const body = rewriteLinks(rest.join("\n")).replace(/^\n+/, "");
  const page = `${frontmatter(slug, title, describe(rest))}\n${body}`;
  await writeFile(path.join(target, name), page.endsWith("\n") ? page : `${page}\n`);
}

console.log(`Synced ${files.length} guides from docs/ into website/src/content/docs/`);
