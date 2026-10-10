import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

test("native connection, callback, and acquisition lifetimes", async () => {
  await promisify(execFile)(
    process.execPath,
    [
      "--experimental-test-module-mocks",
      "--test",
      "--test-timeout=10000",
      fileURLToPath(new URL("./native-lifetimes-fixture.mjs", import.meta.url)),
    ],
    { timeout: 20000 },
  );
});
