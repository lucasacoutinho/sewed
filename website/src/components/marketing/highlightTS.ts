/**
 * A single-pass regex highlighter for the short TypeScript snippets on the landing page.
 * Prose code blocks in the docs go through Expressive Code instead.
 */

const keywords = new Set([
  "import",
  "export",
  "default",
  "class",
  "extends",
  "const",
  "let",
  "var",
  "function",
  "return",
  "yield",
  "if",
  "else",
  "for",
  "of",
  "in",
  "as",
  "new",
  "typeof",
  "async",
  "await",
  "from",
  "interface",
  "type",
  "null",
  "true",
  "false",
  "this",
  "void",
  "throw",
]);

const token =
  /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(`(?:[^`\\]|\\.)*`)|\b([A-Za-z_$][a-zA-Z0-9_$]*)\b|\b(\d+)\b/g;

const escape = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const span = (kind: string, text: string): string => `<span class="sw-tok-${kind}">${text}</span>`;

export const highlightTS = (source: string): string => {
  let out = "";
  let last = 0;
  token.lastIndex = 0;
  for (let match = token.exec(source); match !== null; match = token.exec(source)) {
    if (match.index > last) out += escape(source.slice(last, match.index));
    const [text, lineComment, blockComment, dq, sq, template, identifier, number] = match;
    if (lineComment !== undefined || blockComment !== undefined) out += span("c", escape(text));
    else if (dq !== undefined || sq !== undefined || template !== undefined) {
      out += span("s", escape(text));
    } else if (identifier !== undefined) {
      const kind = keywords.has(identifier) ? "k" : /^[A-Z]/.test(identifier) ? "t" : "v";
      out += span(kind, identifier);
    } else if (number !== undefined) out += span("n", text);
    last = token.lastIndex;
  }
  if (last < source.length) out += escape(source.slice(last));
  return out;
};
