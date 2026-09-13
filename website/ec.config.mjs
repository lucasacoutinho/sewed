import { defineEcConfig } from "@astrojs/starlight/expressive-code";
import { ExpressiveCodeTheme, InlineStyleAnnotation } from "@astrojs/starlight/expressive-code";

const ink = "#1f2230";
const linen = "#f1f0ea";
const comment = "#8b8f9e";
const keyword = "#a5b4fc";
const string = "#f5d98a";
const type = "#7dd3fc";
const literal = "#fda4af";
const tag = "#fbbf8f";

/** Dark ink surface with linen text, matching the `--sw-code-*` tokens in tokens.css. */
const sewedInkTheme = new ExpressiveCodeTheme({
  name: "sewed-ink",
  type: "dark",
  semanticHighlighting: true,
  colors: {
    "editor.background": ink,
    "editor.foreground": linen,
    "editor.lineHighlightBackground": "#2a2d3d80",
    "editor.selectionBackground": "#4453b866",
    "editorLineNumber.foreground": "#6b6f80",
    "editorLineNumber.activeForeground": linen,
    "editorIndentGuide.background": "#343749",
    "editorIndentGuide.activeBackground": "#4a4e63",
    "editorBracketMatch.background": "#4453b833",
    "editorBracketMatch.border": "#4453b8",
    "editorWidget.background": "#2a2d3d",
    "editorWidget.border": "#343749",
    "editorHoverWidget.background": "#2a2d3d",
    "editorHoverWidget.border": "#343749",
    "editorGroupHeader.tabsBackground": "#151721",
    "tab.activeBackground": ink,
    "tab.inactiveBackground": "#151721",
    "tab.activeForeground": linen,
    "tab.inactiveForeground": "#9a9db0",
    "tab.border": "#343749",
    focusBorder: "#4453b8",
    "scrollbarSlider.background": "#34374980",
    "scrollbarSlider.hoverBackground": "#4a4e6380",
    "scrollbarSlider.activeBackground": "#6b6f8080",
    "diffEditor.insertedTextBackground": "#4f7a4a26",
    "diffEditor.removedTextBackground": "#b5443a26",
  },
  tokenColors: [
    {
      scope: ["comment", "punctuation.definition.comment", "string.comment"],
      settings: { foreground: comment, fontStyle: "italic" },
    },
    {
      scope: [
        "keyword",
        "storage",
        "storage.type",
        "storage.modifier",
        "keyword.control",
        "keyword.operator.new",
        "keyword.operator.expression",
        "keyword.other",
      ],
      settings: { foreground: keyword },
    },
    {
      scope: ["keyword.operator", "punctuation.separator", "punctuation.terminator"],
      settings: { foreground: "#b8bccb" },
    },
    {
      scope: [
        "string",
        "string.quoted",
        "punctuation.definition.string",
        "string.template",
        "punctuation.definition.template-expression",
      ],
      settings: { foreground: string },
    },
    {
      scope: [
        "constant.numeric",
        "constant.language",
        "constant.character",
        "constant.language.boolean",
        "constant.language.null",
        "constant.language.undefined",
        "variable.other.enummember",
      ],
      settings: { foreground: literal },
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call entity.name.function",
        "meta.function-call.method entity.name.function",
        "variable.function",
        "meta.definition.method entity.name.function",
        "entity.name.type",
        "entity.name.class",
        "entity.name.interface",
        "entity.name.namespace",
        "support.type",
        "support.class",
        "support.other.namespace",
        "support.module",
        "meta.type",
        "variable.other.object",
        "variable.other.readwrite.alias",
        "meta.import variable.other.readwrite",
        "meta.export variable.other.readwrite",
        "meta.object-literal.key support.type.object",
        "variable.other.constant",
        "support.variable",
        "support.constant",
      ],
      settings: { foreground: type },
    },
    {
      scope: ["entity.name.tag", "meta.tag entity.name.tag"],
      settings: { foreground: tag },
    },
    {
      scope: ["entity.other.attribute-name"],
      settings: { foreground: keyword, fontStyle: "italic" },
    },
    {
      scope: [
        "variable",
        "variable.other",
        "variable.parameter",
        "meta.definition.variable variable.other",
        "variable.other.property",
        "meta.object.member",
        "punctuation.section.embedded",
        "meta.embedded",
      ],
      settings: { foreground: linen },
    },
    {
      scope: ["markup.heading", "markup.bold"],
      settings: { foreground: linen, fontStyle: "bold" },
    },
    { scope: ["markup.italic"], settings: { foreground: linen, fontStyle: "italic" } },
    { scope: ["markup.inserted", "markup.inserted.diff"], settings: { foreground: "#9ccc8f" } },
    { scope: ["markup.deleted", "markup.deleted.diff"], settings: { foreground: "#f08a80" } },
    { scope: ["invalid", "invalid.illegal"], settings: { foreground: "#f08a80" } },
  ],
});

const targetLanguages = new Set(["ts", "tsx", "typescript", "js", "jsx", "javascript", "mts", "cts"]);
const capitalized = /\b[A-Z][A-Za-z0-9_]*\b/g;
const sameColor = (a, b) => (a ?? "").toLowerCase() === b.toLowerCase();

/**
 * The TextMate grammar leaves namespace references such as `Effect` in `Effect.gen(...)`
 * untokenized. Painting every bare capitalized identifier keeps docs blocks consistent with
 * the landing page highlighter, skipping matches inside strings and comments.
 */
const capitalizedIdentifierColor = () => ({
  name: "capitalized-identifier-color",
  hooks: {
    postprocessAnalyzedCode({ codeBlock }) {
      if (!targetLanguages.has(codeBlock.language)) return;
      for (const line of codeBlock.getLines()) {
        const skip = [];
        for (const annotation of line.getAnnotations()) {
          if (!(annotation instanceof InlineStyleAnnotation) || !annotation.inlineRange) continue;
          if (sameColor(annotation.color, string) || sameColor(annotation.color, comment)) {
            skip.push(annotation.inlineRange);
          }
        }
        capitalized.lastIndex = 0;
        let match;
        while ((match = capitalized.exec(line.text)) !== null) {
          const columnStart = match.index;
          const columnEnd = columnStart + match[0].length;
          const inside = skip.some((r) => columnStart < r.columnEnd && columnEnd > r.columnStart);
          if (inside) continue;
          line.addAnnotation(
            new InlineStyleAnnotation({
              color: type,
              inlineRange: { columnStart, columnEnd },
              renderPhase: "normal",
            }),
          );
        }
      }
    },
  },
});

export default defineEcConfig({
  themes: [sewedInkTheme],
  plugins: [capitalizedIdentifierColor()],
  styleOverrides: {
    borderRadius: "10px",
    borderColor: "rgba(35, 35, 32, 0.08)",
    codeFontFamily: "var(--sw-font-mono)",
    codeFontSize: "0.85rem",
    codeLineHeight: "1.65",
    frames: {
      shadowColor: "transparent",
      editorTabBarBackground: "#151721",
      editorActiveTabBackground: ink,
      editorActiveTabForeground: linen,
      terminalBackground: ink,
      terminalTitlebarBackground: "#151721",
      terminalTitlebarDotsForeground: "#4453b8",
    },
  },
});
