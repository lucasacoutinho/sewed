import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Layer, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import * as Mcp from "@sewed/mcp";
import { absent } from "./absent.mjs";

const PingProtocol = RpcGroup.make(
  Rpc.make("ping", {
    success: Schema.Struct({ ok: Schema.Boolean }),
  }),
);

test("MCP server runs without Electron, Vite, or React installed", async () => {
  absent({
    packages: ["electron", "vite", "@sewed/vite", "react"],
    entries: ["sewed", "@sewed/mcp", "@sewed/mcp/main"],
  });
  const access = Mcp.policy({ initial: "read-only" });
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* Mcp.testClient(
          Layer.mergeAll(
            access.layer,
            Mcp.fromProtocol(
              PingProtocol,
              { ping: () => Effect.succeed({ ok: true }) },
              { access: { ping: "read" } },
            ),
          ),
        );
        const result = yield* client.callTool({ name: "ping", arguments: {} });
        assert.equal(result.isError, false);
        assert.deepEqual(result.structuredContent, { ok: true });
      }),
    ),
  );
});
