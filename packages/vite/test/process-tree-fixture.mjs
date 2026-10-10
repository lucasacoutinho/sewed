import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [mode, marker] = process.argv.slice(2);
if (process.argv.length !== 4 || marker === undefined) {
  throw new Error("Expected a process-tree fixture mode and readiness marker");
}

switch (mode) {
  case "child":
    process.on("SIGTERM", () => {});
    writeFileSync(marker, String(process.pid));
    break;
  case "stubborn":
  case "exit-on-shutdown":
    process.on("SIGTERM", () => {});
    if (mode === "exit-on-shutdown") {
      process.on("message", (message) => {
        if (message === "sewed:shutdown") process.exit(0);
      });
    }
    spawn(process.execPath, [fileURLToPath(import.meta.url), "child", marker], {
      stdio: "ignore",
    });
    break;
  default:
    throw new Error(`Unknown process-tree fixture mode: ${mode}`);
}

setInterval(() => {}, 1_000);
