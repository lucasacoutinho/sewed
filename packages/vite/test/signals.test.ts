import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

test(
  "SIGTERM closes the Vite server and gracefully releases its owned child",
  { timeout: 10000, skip: process.platform === "win32" },
  async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), "sewed-vite-sigterm-")));
    const finalized = join(directory, "finalized");
    const require = createRequire(import.meta.url);
    const vite = pathToFileURL(require.resolve("vite")).href;
    const sewed = new URL("../lib/index.js", import.meta.url).href;
    await mkdir(join(directory, "node_modules"));
    await symlink(
      fileURLToPath(new URL("../../../node_modules/typescript", import.meta.url)),
      join(directory, "node_modules/typescript"),
      "junction",
    );
    await writeFile(join(directory, "app.ts"), "export const app = 1;\n");
    await writeFile(join(directory, "package.json"), '{"type":"module"}\n');
    await writeFile(
      join(directory, "tsconfig.json"),
      '{"compilerOptions":{"module":"NodeNext"},"files":["app.ts"]}\n',
    );
    const childProgram = `import { writeFileSync } from "node:fs";
    process.on("message", (message) => {
      if (message !== "sewed:shutdown") return;
      writeFileSync(process.env.FINALIZED, "finalized"); process.exit(0);
    }); setInterval(() => {}, 1000);`;
    await writeFile(
      join(directory, "host.mjs"),
      `
    import { createServer } from ${JSON.stringify(vite)};
    import { sewed } from ${JSON.stringify(sewed)};
    const server = await createServer({ configFile: false, root: ${JSON.stringify(directory)}, logLevel: "silent",
      server: { host: "127.0.0.1", port: 0 },
      plugins: [sewed({ cwd: ${JSON.stringify(directory)}, main: "app.ts", electronPath: process.execPath,
        electronArgs: ["--input-type=module", "-e", ${JSON.stringify(childProgram)}],
        env: { FINALIZED: ${JSON.stringify(finalized)} }, onEvent: event => process.send(event) })] });
    await server.listen();
  `,
    );
    const host = spawn(process.execPath, [join(directory, "host.mjs")], {
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    const exit = new Promise<number | null>((resolve) => host.once("exit", resolve));
    let childPid: number | undefined;
    try {
      childPid = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Vite child did not start")), 4000);
        host.on("message", (message: unknown) => {
          if (
            typeof message === "object" &&
            message !== null &&
            "type" in message &&
            message.type === "started" &&
            "pid" in message &&
            typeof message.pid === "number"
          ) {
            clearTimeout(timer);
            resolve(message.pid);
          }
        });
      });
      host.kill("SIGTERM");
      assert.equal(await exit, 143);
      assert.equal(alive(childPid), false);
      assert.equal(await readFile(finalized, "utf8"), "finalized");
    } finally {
      host.kill("SIGKILL");
      if (childPid !== undefined && alive(childPid))
        process.kill(process.platform === "win32" ? childPid : -childPid, "SIGKILL");
      await rm(directory, { recursive: true, force: true });
    }
  },
);

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
