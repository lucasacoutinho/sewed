import { build } from "esbuild";
import { copyFile, cp } from "node:fs/promises";

await build({
  entryPoints: ["packages/sewed/src/internal/preload.ts"],
  outfile: "packages/sewed/lib/preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
for (const file of ["LICENSE", "NOTICE", "THIRD_PARTY_LICENSES.md", "README.md"]) {
  await copyFile(file, `packages/sewed/${file}`);
}
for (const file of ["LICENSE", "NOTICE"]) {
  await copyFile(file, `packages/react/${file}`);
  await copyFile(file, `packages/vite/${file}`);
  await copyFile(file, `packages/devtools/${file}`);
}
await copyFile("docs/devtools.md", "packages/devtools/README.md");
await cp("docs", "packages/sewed/docs", { recursive: true });
