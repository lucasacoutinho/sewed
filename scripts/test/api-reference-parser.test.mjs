import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("../../", import.meta.url));

test("reference aliases preserve dollar and Unicode identifiers literally", () => {
  fixture(
    {
      "index.d.ts":
        'declare type $Original = string;\ndeclare type Ending$ = number;\ndeclare type Original = boolean;\nexport { $Original as Renamed, Ending$ as AlsoRenamed, Original as $1 };\nexport type Café = string;\nexport * as $Values from "./value.js";\n',
      "value.d.ts": "export type 值 = number;\n",
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      for (const declaration of [
        "type $Original = string;",
        "export type { $Original as Renamed };",
        "type Ending$ = number;",
        "export type { Ending$ as AlsoRenamed };",
        "type Original = boolean;",
        "export type { Original as $1 };",
        "type Café = string;",
        "type 值 = number;",
      ])
        assert.ok(output.includes(declaration), declaration);
      assert.match(output, /### `Café`/);
      assert.match(output, /#### `\$Values.值`/);
    },
  );
});

test("star barrels include declarations and namespaces, excluding the default export", () => {
  fixture(
    {
      "index.d.ts": "export * from './value.js';\nexport type * from \"./types.js\";\n",
      "value.d.ts":
        'export type Value = string;\nexport { Value as default };\nexport * as Nested from "./types.js";\n',
      "types.d.ts": "export type Other = number;\n",
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      assert.match(output, /### `Value`/);
      assert.match(output, /### `Other`/);
      assert.match(output, /#### `Nested.Other`/);
      assert.doesNotMatch(output, /`default`/);
    },
  );
});

test("imported namespace aliases expose their original members", () => {
  fixture(
    {
      "index.d.ts": 'import * as Values from "./value.js";\nexport { Values as Alias };\n',
      "value.d.ts": "export type Value = string;\n",
    },
    ({ validate, render }) => {
      validate();
      assert.match(render(), /#### `Alias.Value`/);
    },
  );
});

test("cyclic star barrels resolve declarations through either branch", () => {
  fixture(
    {
      "index.d.ts": 'export * from "./other.js";\nexport type Value = string;\n',
      "other.d.ts": 'export * from "./index.js";\nexport type Other = number;\n',
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      assert.match(output, /type Value = string;/);
      assert.match(output, /type Other = number;/);
    },
  );
});

test("explicit exports shadow conflicting stars regardless of statement order", () => {
  fixture(
    {
      "index.d.ts":
        'export { Value } from "./preferred.js";\nexport * from "./left.js";\nexport * from "./right.js";\n',
      "preferred.d.ts": "export type Value = boolean;\n",
      "left.d.ts": "export type Value = string;\n",
      "right.d.ts": "export type Value = number;\n",
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      assert.match(output, /type Value = boolean;/);
      assert.doesNotMatch(output, /type Value = (string|number);/);
    },
  );
});

test("diamond stars recognize the same declaration through imported aliases", () => {
  fixture(
    {
      "index.d.ts": 'export * from "./left.js";\nexport * from "./right.js";\n',
      "left.d.ts": 'export { Original as Value } from "./origin.js";\n',
      "right.d.ts":
        'import type { Original as Local } from "./origin.js";\nexport type { Local as Value };\n',
      "origin.d.ts": "/** The original description. */\nexport type Original = string;\n",
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      assert.equal(output.match(/### `Value`/g)?.length, 1);
      assert.match(output, /type Original = string;/);
      assert.match(output, /export type \{ Original as Value \};/);
      assert.match(output, /The original description\./);
    },
  );
});

test("merged type and value exports retain both declarations and function overloads", () => {
  fixture(
    {
      "index.d.ts":
        "export type Item = string;\ndeclare const ItemSchema: { readonly value: Item };\nexport { ItemSchema as Item };\nexport declare function choose(value: string): string;\nexport declare function choose(value: number): number;\n",
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      assert.match(output, /type Item = string;/);
      assert.match(output, /const ItemSchema: \{/);
      assert.match(output, /export \{ ItemSchema as Item \};/);
      assert.match(output, /function choose\(value: string\): string;/);
      assert.match(output, /function choose\(value: number\): number;/);
    },
  );
});

test("self-referencing namespaces link back to the package instead of recursing", () => {
  fixture(
    { "index.d.ts": 'export * as Self from "./index.js";\nexport type Value = string;\n' },
    ({ validate, render }) => {
      validate();
      const output = render();
      assert.match(output, /### `Self`\n\nNamespace; see `fixture` above\./);
      assert.match(output, /type Value = string;/);
      assert.doesNotMatch(output, /Self\.Self/);
    },
  );
});

test("namespace cycles link to their ancestor while shared modules render in each branch", () => {
  fixture(
    {
      "index.d.ts": 'export * as Left from "./other.js";\nexport * as Right from "./other.js";\n',
      "other.d.ts": 'export * as Again from "./cycle.js";\nexport type Value = number;\n',
      "cycle.d.ts": 'export * as Back from "./other.js";\nexport type Leaf = string;\n',
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      for (const branch of ["Left", "Right"]) {
        assert.ok(output.includes(`#### \`${branch}.Value\``));
        assert.ok(output.includes(`#### \`${branch}.Again.Leaf\``));
        assert.ok(output.includes(`Namespace; see \`${branch}\` above.`));
      }
      assert.doesNotMatch(output, /members below\.\n\nNamespace; see/);
    },
  );
});

test("an unresolved named-export cycle fails promptly and preserves the guide", () => {
  fixture(
    {
      "index.d.ts": 'export { Value } from "./other.js";\n',
      "other.d.ts": 'export { Value } from "./index.js";\n',
    },
    ({ validate, reject }) => {
      validate(false);
      reject(/No declaration found for Value/);
    },
  );
});

test("ambiguous star exports fail explicitly and preserve the guide", () => {
  fixture(
    {
      "index.d.ts": 'export * from "./left.js";\nexport * from "./right.js";\n',
      "left.d.ts": "export type Value = string;\n",
      "right.d.ts": "export type Value = number;\n",
    },
    ({ validate, reject }) => {
      validate(false);
      reject(/Ambiguous declaration export Value/);
    },
  );
});

test("an unterminated comment fails promptly in generation and check modes", () => {
  fixture(
    { "index.d.ts": "export type Value = string;\n/* unterminated" },
    ({ validate, reject }) => {
      validate(false);
      reject(/Unterminated declaration comment/, []);
      reject(/Unterminated declaration comment/, ["--check"]);
    },
  );
});

test("unsupported export forms fail explicitly and preserve the guide", () => {
  fixture(
    { "index.d.ts": "declare const value: number;\nexport default value;\n" },
    ({ validate, reject }) => {
      validate();
      reject(/Unsupported declaration export.*export default value/);
    },
  );
});

test("nested template literal types keep the next declaration separate", () => {
  fixture(
    {
      "index.d.ts":
        'export type Template = `before${"}" | `nested${"{"}`}after`;\nexport type Next = string;\n',
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      assert.match(output, /### `Next`\n\n```ts\ntype Next = string;/);
      assert.match(output, /### `Template`/);
    },
  );
});

test("leading line comments do not hide declarations or their JSDoc", () => {
  fixture(
    {
      "index.d.ts":
        "// Public types.\n/** Value description. */\n// Kept with its declaration.\nexport type Value = string;\n// Next entry.\nexport type Next = number;\n",
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      assert.match(output, /### `Value`\n\nValue description\./);
      assert.match(output, /### `Next`/);
      assert.doesNotMatch(output, /Public types|Next entry|Kept with its declaration/);
    },
  );
});

test("carriage-return line endings terminate comments and preserve block declarations", () => {
  fixture(
    {
      "index.d.ts":
        "// Public types.\rexport declare abstract class Value {}\r// Next entry.\rexport interface Next { readonly value: string; }\r",
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      assert.match(output, /### `Value`/);
      assert.match(output, /### `Next`/);
    },
  );
});

test("quoted braces and backticks inside nested templates keep the next export separate", () => {
  fixture(
    {
      "index.d.ts":
        'export type Template = `${"}" | "`"}`;\nexport type Nested = `${"}" | `inner${"`"}`}`;\nexport type Next = string;\n',
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      assert.match(output, /### `Next`\n\n```ts\ntype Next = string;/);
      assert.match(output, /### `Nested`/);
      assert.ok(output.includes('type Template = `${"}" | "`"}`;'));
      assert.ok(output.includes('type Nested = `${"}" | `inner${"`"}`}`;'));
    },
  );
});

test("comments inside template substitutions do not become structural delimiters", () => {
  fixture(
    {
      "index.d.ts": 'export type Template = `${/* } ` */ "value"}`;\nexport type Next = string;\n',
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      assert.match(output, /### `Next`\n\n```ts\ntype Next = string;/);
      assert.ok(output.includes('type Template = `${/* } ` */ "value"}`;'));
    },
  );
});

test("escaped literal contents stay intact across declaration boundaries", () => {
  fixture(
    {
      "index.d.ts":
        'export type Quoted = "a\\\";[}";\nexport type Template = `escaped\\${text}\\`end`;\nexport type Next = string;\n',
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      assert.match(output, /### `Quoted`/);
      assert.match(output, /### `Template`/);
      assert.match(output, /### `Next`/);
      assert.ok(output.includes("type Quoted = 'a\";[}';"), output);
      assert.ok(output.includes("type Template = `escaped\\${text}\\`end`;"));
    },
  );
});

test("unfinished strings and templates preserve the guide in generation and check modes", () => {
  /** @type {[string, RegExp][]} */
  const cases = [
    ['export type Value = "unterminated;\n', /Unterminated declaration string/],
    ["export type Value = 'unterminated;\n", /Unterminated declaration string/],
    ["export type Value = `unterminated;\n", /Unterminated declaration template/],
    ['export type Value = "escaped\\', /Unterminated declaration string/],
  ];
  for (const [source, error] of cases) {
    fixture({ "index.d.ts": source }, ({ validate, reject }) => {
      validate(false);
      reject(error);
      reject(error, ["--check"]);
    });
  }
});

test("unfinished or mismatched template substitutions preserve the guide", () => {
  /** @type {[string, RegExp][]} */
  const cases = [
    ["export type Value = `${string", /Unterminated template interpolation/],
    ["export type Value = `${[string)}`;", /Mismatched template delimiter/],
  ];
  for (const [source, error] of cases) {
    fixture({ "index.d.ts": source }, ({ validate, reject }) => {
      validate(false);
      reject(error);
      reject(error, ["--check"]);
    });
  }
});

test("unclosed, mismatched, and unexpected groups preserve the guide", () => {
  /** @type {[string, RegExp][]} */
  const cases = [
    ["export interface Value { readonly name: string;\n", /Unterminated declaration group/],
    ["export type Value = [string;", /Unterminated declaration group/],
    ["export type Value = (string;", /Unterminated declaration group/],
    ["export type Value = [string);", /Mismatched declaration delimiter/],
    ["export type Value = string];", /Mismatched declaration delimiter/],
  ];
  for (const [source, error] of cases) {
    fixture({ "index.d.ts": source }, ({ validate, reject }) => {
      validate(false);
      reject(error);
      reject(error, ["--check"]);
    });
  }
});

for (const { name, declaration, success } of [
  {
    name: "literal punctuation",
    declaration: 'export declare const make: () => Effect.Effect<"value,>({[">;',
    success: '"value,>({["',
  },
  {
    name: "function results",
    declaration: "export declare const make: () => Effect.Effect<(value: string) => number>;",
    success: "(value: string) => number",
  },
  {
    name: "Effect parameters",
    declaration:
      "export declare const make: (input: Effect.Effect<number>) => Effect.Effect<string>;",
    success: "string",
  },
  {
    name: "overloads",
    declaration:
      'export declare function make(value: string): Effect.Effect<"first">;\nexport declare function make(value: number): Effect.Effect<"last">;',
    success: '"last"',
  },
  {
    name: "generic factories",
    declaration: "export declare const make: <A>(value: A) => Effect.Effect<A>;",
    success: "unknown",
  },
  {
    name: "nested non-Effect returns",
    declaration: "export declare const make: () => Promise<Effect.Effect<string>>;",
    success: "never",
  },
  {
    name: "union returns",
    declaration: "export declare const make: () => Effect.Effect<string> | Effect.Effect<number>;",
    success: "string | number",
  },
]) {
  test(`constructor-result aliases preserve compiler semantics for ${name}`, () => {
    fixture(
      {
        "index.d.ts": `import type { Effect } from "effect";
${declaration}
export type Handle = Effect.Success<ReturnType<typeof make>>;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type Check = Assert<Equal<Handle, ${success}>>;
`,
      },
      ({ validate, render }) => {
        validate();
        const output = render();
        assert.match(
          output,
          /### `Handle`\n\n```ts\ntype Handle = Effect\.Success<ReturnType<typeof make>>;/,
        );
      },
    );
  });
}

test("inline import shortening preserves string, template, interpolation, and comment contents", () => {
  fixture(
    {
      "index.d.ts": `export type Quoted = 'import("effect/Schema").Schema';
export type Template = \`import("effect/Schema").Schema\`;
export type Nested = \`\${'import("effect/Schema").Schema'}\`;
export type Comment = /* import("effect/Schema").Schema */ string;
`,
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      assert.equal(output.match(/import\("effect\/Schema"\)\.Schema/g)?.length, 4);
      assert.match(output, /type Template = `import\("effect\/Schema"\)\.Schema`;/);
      assert.match(output, /type Comment = \/\* import\("effect\/Schema"\)\.Schema \*\/ string;/);
    },
  );
});

test("actual inline imports shorten either quote style without consuming comments", () => {
  fixture(
    {
      "index.d.ts": `export type First = import("./value.js").Value;
export type Second = import('./value.js').Value;
export type Commented = import(/* path */ "./value.js").Value;
export type Nested = \`\${import("./value.js").Value}\`;
`,
      "value.d.ts": 'export type Value = "literal";',
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      assert.match(output, /type First = value\.Value;/);
      assert.match(output, /type Second = value\.Value;/);
      assert.match(output, /import\(\/\* path \*\/ ["']\.\/value\.js["']\)\.Value/);
      assert.match(output, /`\$\{import\(["']\.\/value\.js["']\)\.Value\}`/);
    },
  );
});

test("inline imports with punctuation or reserved basenames retain their paths", () => {
  fixture(
    {
      "index.d.ts":
        'export type Punctuation = import("./value-type.js").Value;\nexport type Reserved = import("./class.js").Value;\n',
      "value-type.d.ts": "export type Value = string;",
      "class.d.ts": "export type Value = number;",
    },
    ({ validate, render, checkPrinted }) => {
      validate();
      const output = render();
      assert.match(output, /import\(["']\.\/value-type\.js["']\)\.Value/);
      assert.match(output, /import\(["']\.\/class\.js["']\)\.Value/);
      checkPrinted(output);
    },
  );
});

test("default and reserved export aliases keep legal declaration identifiers", () => {
  fixture(
    {
      "index.d.ts": "declare const Value: number;\nexport { Value as default, Value as class };\n",
    },
    ({ validate, render, checkPrinted }) => {
      validate();
      const output = render();
      assert.match(output, /export \{ Value as default \};/);
      assert.match(output, /export \{ Value as class \};/);
      assert.doesNotMatch(output, /const (default|class):/);
      checkPrinted(output);
    },
  );
});

test("recursive aliases preserve the declaration name used by self references", () => {
  fixture(
    {
      "index.d.ts":
        "interface Original { readonly next: Original | null; }\nexport { Original as Public };\n",
    },
    ({ validate, render, checkPrinted }) => {
      validate();
      const output = render();
      assert.match(output, /interface Original \{/);
      assert.match(output, /readonly next: Original \| null;/);
      assert.match(output, /export type \{ Original as Public \};/);
      checkPrinted(output);
    },
  );
});

test("aliased overloads and merged declarations retain their original definitions", () => {
  fixture(
    {
      "index.d.ts": `interface Original { readonly value: number; }
declare const Original: { readonly value: string };
declare function choose(value: string): string;
declare function choose(value: number): number;
export { Original as Public, choose as select };
`,
    },
    ({ validate, render, checkPrinted }) => {
      validate();
      const output = render();
      assert.equal(output.match(/export \{ Original as Public \};/g)?.length, 1);
      assert.equal(output.match(/export \{ choose as select \};/g)?.length, 1);
      assert.match(output, /function choose\(value: string\): string;/);
      assert.match(output, /function choose\(value: number\): number;/);
      checkPrinted(output);
    },
  );
});

test("quoted export aliases fail clearly without replacing the guide", () => {
  for (const name of ["public-name", "public,name", "public as name", "tick`name"])
    fixture(
      {
        "index.d.ts": `declare const Value: number;\nexport { Value as ${JSON.stringify(name)} };\n`,
      },
      ({ validate, reject }) => {
        validate();
        reject(/Unsupported declaration export name/);
        reject(/Unsupported declaration export name/, ["--check"]);
      },
    );
  fixture(
    {
      "index.d.ts": 'export * as "public-name" from "./value.js";\n',
      "value.d.ts": "export type Value = string;",
    },
    ({ validate, reject }) => {
      validate();
      reject(/Unsupported declaration export name/);
      reject(/Unsupported declaration export name/, ["--check"]);
    },
  );
});

test("export lists ignore comments and distinguish a name called type from a type modifier", () => {
  fixture(
    {
      "index.d.ts": `import { /* } */ Value as /* alias */ Local } from "./value.js";
declare const type: string;
export { /* { */ Local as /* alias */ Public, type as Kind };
export { type Value as ValueType } from "./value.js";
`,
      "value.d.ts": "export interface Value { readonly value: number; }",
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      assert.match(output, /### `Public`/);
      assert.match(output, /export type \{ Value as Public \};/);
      assert.match(output, /const type: string;/);
      assert.match(output, /export \{ type as Kind \};/);
      assert.match(output, /### `ValueType`/);
    },
  );
});

test("relative ESM and CommonJS module extensions resolve their declarations", () => {
  fixture(
    {
      "index.d.ts":
        'export * from "./esm.mjs";\nexport * from "./common.cjs";\nexport * from "./source.mts";\nexport * from "./common-source.cts";\n',
      "esm.d.mts": "export type ESM = string;",
      "common.d.cts": "export type Common = number;",
      "source.d.mts": "export type Source = boolean;",
      "common-source.d.cts": "export type CommonSource = null;",
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      for (const name of ["ESM", "Common", "Source", "CommonSource"])
        assert.ok(output.includes(`### \`${name}\``));
    },
  );
});

test("module specifiers may contain the other quote character", () => {
  fixture(
    {
      "index.d.ts": 'export * from "./value\'s.js";\n',
      "value's.d.ts": "export type Value = string;",
    },
    ({ validate, render }) => {
      validate();
      assert.match(render(), /### `Value`/);
    },
  );
});

test("escaped module specifiers fail explicitly before file resolution", () => {
  fixture(
    {
      "index.d.ts": 'export * from "./\\u0076alue.js";\n',
      "value.d.ts": "export type Value = string;",
    },
    ({ validate, reject }) => {
      validate();
      reject(/Unsupported declaration module specifier/);
      reject(/Unsupported declaration module specifier/, ["--check"]);
    },
  );
});

test("semicolonless adjacent declarations fail instead of hiding exports", () => {
  for (const source of [
    "export type First = number\nexport type Second = string\n",
    "declare type First = number\ntype Second = string\nexport { First, Second };\n",
    "declare const Value: number;\nexport { Value }\nexport type Second = string;\n",
    'export * from "./value.js"\nexport type Second = string;\n',
    'export type First = string\nimport type { Value } from "./value.js";\n',
  ])
    fixture(
      { "index.d.ts": source, "value.d.ts": "export type Value = string;" },
      ({ validate, reject }) => {
        validate();
        reject(/Unsupported (?:adjacent semicolonless declarations|declaration export)/);
        reject(/Unsupported (?:adjacent semicolonless declarations|declaration export)/, [
          "--check",
        ]);
      },
    );
});

test("compound exported and privately aliased variables fail without partial output", () => {
  for (const source of [
    "export declare const First: number, Second: string;\n",
    "declare let First: Map<string, number>, Second: string;\nexport { Second };\n",
    "export declare var First: number, Second: string;\n",
  ])
    fixture({ "index.d.ts": source }, ({ validate, reject }) => {
      validate();
      reject(/Unsupported compound variable declaration/);
      reject(/Unsupported compound variable declaration/, ["--check"]);
    });
});

test("unsupported default and side-effect imports fail before hiding following exports", () => {
  for (const source of [
    'import Value from "./value.js";\nexport { Value };\n',
    'import "./value.js";\nexport type Public = string;\n',
    'import Value from "./value.js"\nexport type Public = string;\n',
  ])
    fixture(
      { "index.d.ts": source, "value.d.ts": "declare const Value: number;\nexport default Value;" },
      ({ validate, reject }) => {
        validate();
        reject(/Unsupported declaration import/);
        reject(/Unsupported declaration import/, ["--check"]);
      },
    );
});

test("type-only aliases retain global, binding, and imported qualifiers", () => {
  fixture(
    {
      "index.d.ts": `import type { Value as Imported } from "./value.js";
export { Imported as ViaImport };
export type { Value as Global } from "./value.js";
export { type Value as Binding, type Model } from "./value.js";
`,
      "value.d.ts":
        "export declare const Value: number;\nexport declare class Model { readonly value: number; }",
    },
    ({ validate, render, checkPrinted }) => {
      validate();
      const output = render();
      for (const name of ["ViaImport", "Global", "Binding"])
        assert.ok(output.includes(`export type { Value as ${name} };`));
      assert.match(output, /export type \{ Model as Model \};/);
      checkPrinted(output);
    },
  );
});

test("type-only stars preserve qualifiers through ordinary re-export barrels", () => {
  fixture(
    {
      "index.d.ts":
        'export type * from "./barrel.js";\nexport { Value as Runtime } from "./value.js";',
      "barrel.d.ts": 'export * from "./value.js";',
      "value.d.ts": "export declare const Value: number;",
    },
    ({ validate, render, checkPrinted }) => {
      validate();
      const output = render();
      assert.match(output, /export type \{ Value as Value \};/);
      assert.match(output, /export \{ Value as Runtime \};/);
      checkPrinted(output);
    },
  );
});

test("mixed type and value star diamonds retain the available value export", () => {
  fixture(
    {
      "index.d.ts": 'export * from "./left.js";\nexport * from "./right.js";',
      "left.d.ts": 'export type * from "./value.js";',
      "right.d.ts": 'export * from "./value.js";',
      "value.d.ts": "export declare const Value: number;",
    },
    ({ validate, render, checkPrinted }) => {
      validate();
      const output = render();
      assert.match(output, /const Value: number;/);
      assert.doesNotMatch(output, /export type/);
      checkPrinted(output);
    },
  );
});

test("type-only namespace exports show their public restriction", () => {
  fixture(
    {
      "index.d.ts":
        'import type * as Values from "./value.js";\nexport { Values as Imported };\nexport type * as Direct from "./value.js";',
      "value.d.ts": "export declare const Value: number;",
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      for (const name of ["Imported", "Direct"])
        assert.ok(output.includes(`### \`${name}\`\n\nType-only export.`));
    },
  );
});

test("const enum modifiers retain the actual name and following exports", () => {
  fixture(
    {
      "index.d.ts": `export declare const enum Choice { First, Second }
export type Next = string;
declare const enum Original { One, Two }
export { Original as Alias };
`,
    },
    ({ validate, render, checkPrinted }) => {
      validate();
      const output = render();
      for (const name of ["Choice", "Next", "Alias"]) assert.ok(output.includes(`### \`${name}\``));
      assert.doesNotMatch(output, /### `enum`/);
      assert.match(output, /const enum Choice \{/);
      assert.match(output, /export \{ Original as Alias \};/);
      checkPrinted(output);
    },
  );
});

test("single semicolonless declarations and generic commas remain supported", () => {
  fixture(
    {
      "index.d.ts":
        "export declare const First: Map<string, number>;\nexport declare const make: <A, B>(first: A, second: B) => readonly [A, B];\nexport type Last = string\n",
    },
    ({ validate, render }) => {
      validate();
      const output = render();
      for (const name of ["First", "make", "Last"]) assert.ok(output.includes(`### \`${name}\``));
    },
  );
});

/** @typedef {{ validate: (accepted?: boolean) => void; render: () => string; checkPrinted: (output: string) => void; reject: (error: RegExp, args?: string[]) => void }} Fixture */
/** @param {Record<string, string>} declarations @param {(fixture: Fixture) => void} runTest */
function fixture(declarations, runTest) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "sewed-reference-parser-")));
  try {
    for (const directory of ["scripts/internal", "packages/fixture/lib", "docs", "node_modules"])
      mkdirSync(join(root, directory), { recursive: true });
    for (const file of ["api-reference.mjs", "internal/package-manifest.mjs"])
      cpSync(join(workspace, "scripts", file), join(root, "scripts", file));
    writeFileSync(join(root, "docs/reference.md"), "Accepted reference\n");
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({ references: [{ path: "packages/fixture" }] }),
    );
    writeFileSync(
      join(root, "packages/fixture/package.json"),
      JSON.stringify({
        name: "fixture",
        version: "1.0.0",
        type: "module",
        exports: { ".": { types: "./lib/index.d.ts" } },
      }),
    );
    for (const [file, source] of Object.entries(declarations))
      writeFileSync(join(root, "packages/fixture/lib", file), source);
    symlinkSync(
      join(workspace, "node_modules/oxfmt"),
      join(root, "node_modules/oxfmt"),
      "junction",
    );
    symlinkSync(
      join(workspace, "node_modules/typescript"),
      join(root, "node_modules/typescript"),
      "junction",
    );
    symlinkSync(
      join(workspace, "packages/sewed/node_modules/effect"),
      join(root, "node_modules/effect"),
      "junction",
    );
    /** @param {string[]} args */
    const generate = (args) =>
      spawnSync(process.execPath, [join(root, "scripts/api-reference.mjs"), ...args], {
        cwd: root,
        encoding: "utf8",
        timeout: 10000,
      });
    /** @param {string} file */
    const compile = (file) =>
      spawnSync(
        process.execPath,
        [
          join(workspace, "node_modules/typescript/bin/tsc"),
          "--ignoreConfig",
          "--noEmit",
          "--strict",
          "--module",
          "NodeNext",
          "--moduleResolution",
          "NodeNext",
          "--target",
          "ES2023",
          "--lib",
          "ES2023,ESNext.Disposable,DOM",
          file,
        ],
        { cwd: root, encoding: "utf8" },
      );
    runTest({
      validate: (accepted = true) => {
        const result = compile(join(root, "packages/fixture/lib/index.d.ts"));
        assert.equal(result.error, undefined);
        if (accepted) assert.equal(result.status, 0, result.stdout + result.stderr);
        else assert.notEqual(result.status, 0, "invalid fixture unexpectedly compiles");
      },
      render: () => {
        const result = generate([]);
        assert.equal(result.error, undefined);
        assert.equal(result.status, 0, result.stderr);
        return readFileSync(join(root, "docs/reference.md"), "utf8");
      },
      checkPrinted: (output) => {
        for (const match of output.matchAll(/```ts\n([\s\S]*?)\n```/g)) {
          const source = (match[1] ?? "").replace(
            /^(const|let|var|function|class|abstract class|enum|namespace|module) /gm,
            "declare $1 ",
          );
          const path = join(root, "packages/fixture/lib/printed.d.ts");
          writeFileSync(path, source);
          const result = compile(path);
          assert.equal(result.error, undefined);
          assert.equal(result.status, 0, result.stdout + result.stderr);
        }
      },
      reject: (error, args = []) => {
        const result = generate(args);
        assert.equal(result.error, undefined, "generation must finish before its timeout");
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, error);
        assert.equal(readFileSync(join(root, "docs/reference.md"), "utf8"), "Accepted reference\n");
        assert.ok(readdirSync(root).every((name) => !name.startsWith(".sewed-reference-")));
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
