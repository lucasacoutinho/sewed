import { build } from "esbuild";
import { copyFile, cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.length !== 2) {
  console.error("Usage: build-preload.mjs");
  process.exit(2);
}
const root = fileURLToPath(new URL("..", import.meta.url));

await build({
  absWorkingDir: root,
  entryPoints: ["packages/sewed/src/internal/preload.ts"],
  outfile: "packages/sewed/lib/preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
for (const file of ["LICENSE", "NOTICE", "THIRD_PARTY_LICENSES.md", "README.md"]) {
  await copyFile(join(root, file), join(root, "packages/sewed", file));
}
for (const file of ["LICENSE", "NOTICE", "THIRD_PARTY_LICENSES.md"]) {
  for (const name of ["react", "vite", "devtools", "create", "forge"])
    await copyFile(join(root, file), join(root, "packages", name, file));
}
await copyFile(join(root, "docs/devtools.md"), join(root, "packages/devtools/README.md"));
await copyFile(join(root, "docs/forge.md"), join(root, "packages/forge/README.md"));

// Replaced whole, so a guide deleted from `docs/` does not stay packaged.
const destination = join(root, "packages/sewed/docs");
await rm(destination, { recursive: true, force: true });
await cp(join(root, "docs"), destination, { recursive: true });
