import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { Effect, Exit, Layer, Queue, Schema, Scope, Stream } from "effect";
import { McpServer } from "effect/ai";
import { Rpc, RpcGroup, RpcSchema } from "effect/rpc";
import { Binary, Capability, NativeTheme } from "sewed";
import * as Testing from "sewed/testing";
import * as Mcp from "../src/index.ts";
import * as McpMain from "../src/main.ts";

const MathWorkerProtocol = RpcGroup.make(
  Rpc.make("where", {
    success: Schema.Struct({
      isMainThread: Schema.Boolean,
      threadId: Schema.Int,
    }),
  }),
  Rpc.make("add", {
    payload: Schema.Struct({ a: Schema.Finite, b: Schema.Finite }),
    success: Schema.Struct({ sum: Schema.Finite }),
  }),
);

class DocumentNotFound extends Schema.Error<DocumentNotFound>("DocumentNotFound")({
  _tag: Schema.tag("DocumentNotFound"),
  id: Schema.String,
}) {}

const CanvasProtocol = RpcGroup.make(
  Rpc.make("inspect", {
    success: Schema.Struct({ title: Schema.String, layers: Schema.Int }),
  }),
  Rpc.make("rename", {
    payload: Schema.Struct({ title: Schema.String }),
  }),
  Rpc.make("echo", {
    payload: Schema.String,
    success: Schema.String,
  }),
  Rpc.make("lookup", {
    payload: Schema.Struct({ id: Schema.String }),
    success: Schema.Struct({ title: Schema.String }),
    error: DocumentNotFound,
  }),
  Rpc.make("render", {
    success: Binary.Bytes,
  }),
  Rpc.make("events", {
    success: RpcSchema.Stream(Schema.String, Schema.Never),
  }),
);

const CanvasCapability = Capability.define("test/canvas", CanvasProtocol);

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const makeCanvasOps = () => {
  let title = "Untitled";
  return {
    getTitle: () => title,
    ops: {
      inspect: () => Effect.succeed({ title, layers: 3 }),
      rename: ({ title: next }: { readonly title: string }) =>
        Effect.sync(() => {
          title = next;
        }),
      echo: (text: string) => Effect.succeed(text.toUpperCase()),
      lookup: ({ id }: { readonly id: string }) =>
        id === "ok" ? Effect.succeed({ title }) : Effect.fail(new DocumentNotFound({ id })),
      render: () => Effect.succeed(PNG_BYTES),
      events: () => Stream.make("opened", "changed"),
    },
  };
};

test("fromProtocol projects unary RPCs, skips streams, handles void/scalar/bytes/errors, and composes with raw McpServer", async () => {
  const { ops, getTitle } = makeCanvasOps();

  const registrations = Layer.mergeAll(
    Mcp.fromProtocol(CanvasProtocol, ops, {
      prefix: "canvas_",
      access: { inspect: "read", echo: "read", lookup: "read", render: "read" },
      descriptions: {
        inspect: "Inspect document summary",
        rename: "Rename the active document",
      },
      titles: { inspect: "Inspect Canvas" },
      idempotent: { rename: true },
      content: {
        render: (bytes) => [{ type: "image", data: bytes, mimeType: "image/png" }],
      },
    }),
    McpServer.resource({
      uri: "app://about",
      name: "about",
      content: Effect.succeed("sewed-mcp"),
    }),
  );

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* Mcp.testClient(registrations, { name: "studio", version: "1.0.0" });
        const { tools } = yield* client.listTools();
        const names = tools.map((t) => t.name).sort();
        assert.deepEqual(names, [
          "canvas_echo",
          "canvas_inspect",
          "canvas_lookup",
          "canvas_rename",
          "canvas_render",
        ]);

        const inspectTool = tools.find((t) => t.name === "canvas_inspect")!;
        assert.equal(inspectTool.description, "Inspect document summary");
        assert.equal(inspectTool.annotations?.title, "Inspect Canvas");
        assert.equal(inspectTool.annotations?.readOnlyHint, true);
        assert.equal(inspectTool.annotations?.destructiveHint, false);

        const renameTool = tools.find((t) => t.name === "canvas_rename")!;
        assert.equal(renameTool.annotations?.readOnlyHint, false);
        assert.equal(renameTool.annotations?.idempotentHint, true);

        const inspected = yield* client.callTool({ name: "canvas_inspect", arguments: {} });
        assert.equal(inspected.isError, false);
        assert.deepEqual(inspected.structuredContent, { title: "Untitled", layers: 3 });

        const renamed = yield* client.callTool({
          name: "canvas_rename",
          arguments: { title: "Poster" },
        });
        assert.equal(renamed.isError, false);
        assert.deepEqual(renamed.structuredContent, { ok: true });
        assert.equal(getTitle(), "Poster");

        const echoed = yield* client.callTool({
          name: "canvas_echo",
          arguments: { input: "hello" },
        });
        assert.equal(echoed.isError, false);
        assert.equal(echoed.content[0]?.type, "text");
        if (echoed.content[0]?.type === "text") {
          assert.equal(echoed.content[0].text, "HELLO");
        }

        const rendered = yield* client.callTool({ name: "canvas_render", arguments: {} });
        assert.equal(rendered.isError, false);
        assert.equal(rendered.content[0]?.type, "image");
        if (rendered.content[0]?.type === "image") {
          assert.equal(rendered.content[0].mimeType, "image/png");
          assert.deepEqual(rendered.content[0].data, PNG_BYTES);
        }

        const missing = yield* client.callTool({
          name: "canvas_lookup",
          arguments: { id: "missing" },
        });
        assert.equal(missing.isError, true);

        const about = yield* client.readResource({ uri: "app://about" });
        assert.equal(about.contents[0]?.uri, "app://about");
      }),
    ),
  );
});

test("fromProtocol encodes Binary.Bytes as base64 when no content mapper is given", async () => {
  const { ops } = makeCanvasOps();
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* Mcp.testClient(
          Mcp.fromProtocol(CanvasProtocol, ops, { include: ["render"] }),
        );
        const result = yield* client.callTool({ name: "render", arguments: {} });
        assert.equal(result.isError, false);
        assert.equal(result.content[0]?.type, "text");
        if (result.content[0]?.type === "text") {
          assert.equal(result.content[0].text, Buffer.from(PNG_BYTES).toString("base64"));
        }
      }),
    ),
  );
});

test("fromCapability works with Sewed memory capabilities including NativeTheme", async () => {
  const { ops } = makeCanvasOps();
  const canvasLayer = Capability.fromHandlers(CanvasCapability, (implement) => implement(ops));
  const themeLayer = Testing.NativeTheme.memory({ allowSetSource: true });

  const registrations = Layer.mergeAll(
    Mcp.fromCapability(CanvasCapability, { include: ["inspect"], access: { inspect: "read" } }),
    Mcp.fromCapability(NativeTheme.capability, {
      prefix: "theme_",
    }),
  ).pipe(Layer.provide(canvasLayer), Layer.provide(themeLayer));

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* Mcp.testClient(registrations);
        const { tools } = yield* client.listTools();
        assert.deepEqual(tools.map((t) => t.name).sort(), ["inspect", "theme_setSource"]);

        const updated = yield* client.callTool({
          name: "theme_setSource",
          arguments: { source: "light" },
        });
        assert.equal(updated.isError, false);
        assert.deepEqual(updated.structuredContent, { ok: true });
      }),
    ),
  );
});

test("policy enforces off, read-only, allow-writes, and ask-writes modes and emits tools/list_changed", async () => {
  const { ops, getTitle } = makeCanvasOps();
  let decision: "allow" | "deny" = "deny";
  const seenApprovals: Mcp.ApprovalRequest[] = [];

  const access = Mcp.policy({
    initial: "read-only",
    approve: (req) =>
      Effect.sync(() => {
        seenApprovals.push(req);
        return decision;
      }),
  });

  const registrations = Layer.mergeAll(
    access.layer,
    Mcp.fromProtocol(CanvasProtocol, ops, {
      include: ["inspect", "rename"],
      access: { inspect: "read" },
    }),
  );

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* Mcp.testClient(registrations);

        // Default: read-only hides write tools and refuses direct write calls.
        const readOnlyList = yield* client.listTools();
        assert.deepEqual(
          readOnlyList.tools.map((t) => t.name),
          ["inspect"],
        );
        const inspectOk = yield* client.callTool({ name: "inspect", arguments: {} });
        assert.equal(inspectOk.isError, false);

        const writeBlocked = yield* Effect.exit(
          client.callTool({ name: "rename", arguments: { title: "Blocked" } }),
        );
        assert.equal(writeBlocked._tag, "Failure");
        assert.equal(getTitle(), "Untitled");

        // Switch to ask-writes -> emits notifications/tools/list_changed and gates writes through approve.
        yield* access.updateMode("ask-writes");
        assert.equal(yield* access.current, "ask-writes");
        const notif1 = yield* Queue.take(client.notifications);
        assert.equal(notif1.method, "notifications/tools/list_changed");

        const askList = yield* client.listTools();
        assert.deepEqual(askList.tools.map((t) => t.name).sort(), ["inspect", "rename"]);

        const deniedCall = yield* Effect.exit(
          client.callTool({ name: "rename", arguments: { title: "Denied" } }),
        );
        assert.equal(deniedCall._tag, "Failure");
        assert.equal(seenApprovals.length, 1);
        assert.equal(seenApprovals[0]?.tool, "rename");
        assert.equal(getTitle(), "Untitled");

        decision = "allow";
        const allowedCall = yield* client.callTool({
          name: "rename",
          arguments: { title: "Approved" },
        });
        assert.equal(allowedCall.isError, false);
        assert.equal(getTitle(), "Approved");

        // Switch to allow-writes -> no approval prompt needed.
        yield* access.updateMode("allow-writes");
        const notif2 = yield* Queue.take(client.notifications);
        assert.equal(notif2.method, "notifications/tools/list_changed");

        const directWrite = yield* client.callTool({
          name: "rename",
          arguments: { title: "Direct" },
        });
        assert.equal(directWrite.isError, false);
        assert.equal(seenApprovals.length, 2);
        assert.equal(getTitle(), "Direct");

        // Switch to off -> hides all tools and refuses reads too.
        yield* access.updateMode("off");
        const notif3 = yield* Queue.take(client.notifications);
        assert.equal(notif3.method, "notifications/tools/list_changed");
        assert.deepEqual((yield* client.listTools()).tools, []);
        const readBlocked = yield* Effect.exit(client.callTool({ name: "inspect", arguments: {} }));
        assert.equal(readBlocked._tag, "Failure");
      }),
    ),
  );
});

test("stateResource serves current snapshots and emits notifications/resources/updated on stream changes", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const updates = yield* Queue.unbounded<{ readonly step: number }>();
        let latest = { step: 0 };
        yield* Queue.offer(updates, latest);

        const registrations = Mcp.stateResource({
          uri: "app://doc/state",
          name: "Document state",
          description: "Live document state snapshot",
          current: Effect.sync(() => latest),
          state: Stream.fromQueue(updates),
        });

        const client = yield* Mcp.testClient(registrations);
        yield* client.subscribe({ uri: "app://doc/state" });
        const read1 = yield* client.readResource({ uri: "app://doc/state" });
        assert.equal(read1.contents.length, 1);
        const first = read1.contents[0]!;
        assert.ok("text" in first);
        assert.deepEqual(JSON.parse(first.text), { step: 0 });

        latest = { step: 1 };
        yield* Queue.offer(updates, latest);
        const notif = yield* Queue.take(client.notifications);
        assert.equal(notif.method, "notifications/resources/updated");
        assert.deepEqual(notif.payload, { uri: "app://doc/state" });

        const read2 = yield* client.readResource({ uri: "app://doc/state" });
        const second = read2.contents[0]!;
        assert.ok("text" in second);
        assert.deepEqual(JSON.parse(second.text), { step: 1 });
      }),
    ),
  );
});

test("fromOwner projects a real Sewed worker over MessagePort and fails Closed when the worker exits", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const workerScope = yield* Scope.make();
        const worker = yield* Testing.Worker.spawn(
          Testing.Worker.entry(new URL("./mcp-worker.mjs", import.meta.url), MathWorkerProtocol),
        ).pipe(Scope.provide(workerScope));

        const client = yield* Mcp.testClient(
          McpMain.fromOwner(worker, {
            prefix: "worker_",
            access: { where: "read", add: "read" },
          }),
        );

        const whereResult = yield* client.callTool({ name: "worker_where", arguments: {} });
        assert.equal(whereResult.isError, false);
        const placement = whereResult.structuredContent as {
          readonly isMainThread: boolean;
          readonly threadId: number;
        };
        assert.equal(placement.isMainThread, false);
        assert.ok(placement.threadId > 0);

        const sumResult = yield* client.callTool({
          name: "worker_add",
          arguments: { a: 19, b: 23 },
        });
        assert.equal(sumResult.isError, false);
        assert.deepEqual(sumResult.structuredContent, { sum: 42 });

        // Close the worker owner; subsequent MCP calls must fail cleanly without silently retrying.
        yield* Scope.close(workerScope, Exit.void);
        const afterExit = yield* client.callTool({ name: "worker_where", arguments: {} });
        assert.equal(afterExit.isError, true);
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("captureTool exposes an opt-in read-only PNG screenshot tool", async () => {
  const access = Mcp.policy({ initial: "read-only" });
  const fakeContents = {
    capture: () =>
      Effect.succeed({
        bytes: PNG_BYTES,
        width: 100,
        height: 50,
        scaleFactor: 2,
      }),
  };

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* Mcp.testClient(
          Layer.mergeAll(access.layer, McpMain.captureTool(fakeContents)),
        );
        const { tools } = yield* client.listTools();
        assert.deepEqual(
          tools.map((t) => t.name),
          ["capture_window"],
        );
        const shot = yield* client.callTool({ name: "capture_window", arguments: {} });
        assert.equal(shot.isError, false);
        assert.equal(shot.content[0]?.type, "image");
        if (shot.content[0]?.type === "image") {
          assert.equal(shot.content[0].mimeType, "image/png");
          assert.deepEqual(shot.content[0].data, PNG_BYTES);
        }
      }),
    ).pipe(Effect.provide(Testing.main)),
  );
});

test("serve (Streamable HTTP) enforces Bearer auth, Origin rejection, loopback guard, and 0600 discovery lifecycle", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sewed-mcp-http-"));
  const discoveryPath = path.join(dir, "mcp.json");
  const { ops } = makeCanvasOps();

  try {
    // Rejects non-loopback host by default.
    const nonLoopback = await Effect.runPromise(
      Effect.scoped(
        Effect.exit(
          Mcp.serveHttp({
            name: "studio",
            version: "1.0.0",
            host: "0.0.0.0",
          }),
        ),
      ),
    );
    assert.equal(nonLoopback._tag, "Failure");

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* McpMain.serve({
            name: "studio",
            version: "1.2.3",
            discoveryPath,
            registrations: Mcp.fromProtocol(CanvasProtocol, ops, {
              include: ["inspect"],
              access: { inspect: "read" },
            }),
          });

          assert.equal(handle.host, "127.0.0.1");
          assert.ok(handle.port > 0);
          assert.ok(handle.token !== undefined && handle.token.length === 64);
          assert.ok(handle.clientConfig.claudeCode.includes(handle.url));
          assert.equal(
            handle.clientConfig.mcpJson.headers?.Authorization,
            `Bearer ${handle.token}`,
          );

          // Verify 0600 discovery manifest on POSIX and schema validation via readDiscovery.
          if (process.platform !== "win32") {
            assert.equal(statSync(discoveryPath).mode & 0o777, 0o600);
          }
          const manifest = yield* Mcp.readDiscovery(discoveryPath);
          assert.equal(manifest.url, handle.url);
          assert.equal(manifest.token, handle.token);
          assert.equal(manifest.pid, process.pid);

          const initBody = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-11-25",
              capabilities: {},
              clientInfo: { name: "test-client", version: "0.1.0" },
            },
          });

          // Missing token -> 401
          const noAuth = yield* Effect.promise(() =>
            fetch(handle.url, {
              method: "POST",
              headers: { "content-type": "application/json", accept: "application/json" },
              body: initBody,
            }),
          );
          assert.equal(noAuth.status, 401);

          // Wrong token -> 401
          const badAuth = yield* Effect.promise(() =>
            fetch(handle.url, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                accept: "application/json",
                authorization: "Bearer wrong-token",
              },
              body: initBody,
            }),
          );
          assert.equal(badAuth.status, 401);

          // Disallowed Origin -> 403
          const badOrigin = yield* Effect.promise(() =>
            fetch(handle.url, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                accept: "application/json",
                authorization: `Bearer ${handle.token}`,
                origin: "https://evil.example",
              },
              body: initBody,
            }),
          );
          assert.equal(badOrigin.status, 403);

          // Valid initialize -> 200 + Mcp-Session-Id
          const initRes = yield* Effect.promise(() =>
            fetch(handle.url, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                accept: "application/json, text/event-stream",
                authorization: `Bearer ${handle.token}`,
              },
              body: initBody,
            }),
          );
          assert.equal(initRes.status, 200);
          const sessionId = initRes.headers.get("mcp-session-id");
          assert.ok(sessionId !== null && sessionId.length > 0);

          // notifications/initialized -> 202
          const ackRes = yield* Effect.promise(() =>
            fetch(handle.url, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                accept: "application/json, text/event-stream",
                authorization: `Bearer ${handle.token}`,
                "mcp-session-id": sessionId,
                "mcp-protocol-version": "2025-11-25",
              },
              body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
            }),
          );
          assert.equal(ackRes.status, 202);

          // tools/call -> 200 with inspect result
          const callRes = yield* Effect.promise(() =>
            fetch(handle.url, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                accept: "application/json, text/event-stream",
                authorization: `Bearer ${handle.token}`,
                "mcp-session-id": sessionId,
                "mcp-protocol-version": "2025-11-25",
              },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 2,
                method: "tools/call",
                params: { name: "inspect", arguments: {} },
              }),
            }),
          );
          assert.equal(callRes.status, 200);
          const callJson = (yield* Effect.promise(() => callRes.json())) as {
            readonly result: { readonly structuredContent: { readonly title: string } };
          };
          assert.equal(callJson.result.structuredContent.title, "Untitled");

          // DELETE terminates session -> 204
          const delRes = yield* Effect.promise(() =>
            fetch(handle.url, {
              method: "DELETE",
              headers: {
                authorization: `Bearer ${handle.token}`,
                "mcp-session-id": sessionId,
                "mcp-protocol-version": "2025-11-25",
              },
            }),
          );
          assert.equal(delRes.status, 204);
        }),
      ).pipe(Effect.provide(Testing.main)),
    );

    // Discovery file is removed automatically once scope closes.
    assert.throws(() => statSync(discoveryPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stdio serves headless MCP over NDJSON streams", async () => {
  const { ops } = makeCanvasOps();
  const input = new PassThrough();
  const output = new PassThrough();
  const responses: Array<Record<string, unknown>> = [];

  const waitForCount = (expected: number) =>
    new Promise<void>((resolve) => {
      let buf = "";
      const onData = (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        for (;;) {
          const nl = buf.indexOf("\n");
          if (nl === -1) break;
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line.length > 0) {
            responses.push(JSON.parse(line) as Record<string, unknown>);
            if (responses.length >= expected) {
              output.off("data", onData);
              resolve();
            }
          }
        }
      };
      output.on("data", onData);
    });

  const gotTwo = waitForCount(2);

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* Mcp.stdio({
          name: "studio-cli",
          version: "1.0.0",
          registrations: Mcp.fromProtocol(CanvasProtocol, ops, {
            include: ["inspect"],
            access: { inspect: "read" },
          }),
          stdio: { input, output },
        });

        input.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-11-25",
              capabilities: {},
              clientInfo: { name: "stdio-test", version: "0.1.0" },
            },
          })}\n`,
        );
        input.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
        input.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { name: "inspect", arguments: {} },
          })}\n`,
        );

        yield* Effect.promise(() => gotTwo);
        input.end();
        yield* handle.awaitClose;
      }),
    ),
  );

  assert.equal(responses[0]?.["id"], 1);
  assert.equal(responses[1]?.["id"], 2);
  const callResult = responses[1]?.["result"] as {
    readonly structuredContent: { readonly layers: number };
  };
  assert.equal(callResult.structuredContent.layers, 3);
});

test("bridge proxies stdio NDJSON-RPC to a live serveHttp server using the discovery manifest", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sewed-mcp-bridge-"));
  const discoveryPath = path.join(dir, "mcp.json");
  const { ops } = makeCanvasOps();

  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* Mcp.serveHttp({
            name: "studio",
            version: "1.0.0",
            discoveryPath,
            registrations: Mcp.fromProtocol(CanvasProtocol, ops, {
              include: ["inspect"],
              access: { inspect: "read" },
            }),
          });

          const input = new PassThrough();
          const output = new PassThrough();
          const chunks: Buffer[] = [];
          output.on("data", (chunk: Buffer) => chunks.push(chunk));

          input.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "initialize",
              params: {
                protocolVersion: "2025-11-25",
                capabilities: {},
                clientInfo: { name: "claude-desktop", version: "1.0.0" },
              },
            })}\n`,
          );
          input.write(
            `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
          );
          input.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "tools/list",
              params: {},
            })}\n`,
          );
          input.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id: 3,
              method: "tools/call",
              params: { name: "inspect", arguments: {} },
            })}\n`,
          );
          input.end();

          yield* Mcp.bridge({ discoveryPath, input, output });

          const lines = Buffer.concat(chunks)
            .toString("utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line) as Record<string, unknown>);

          assert.equal(lines.length, 3);
          assert.equal(lines[0]?.["id"], 1);
          assert.equal(lines[1]?.["id"], 2);
          assert.equal(lines[2]?.["id"], 3);
          const listResult = lines[1]?.["result"] as {
            readonly tools: ReadonlyArray<{ readonly name: string }>;
          };
          assert.deepEqual(
            listResult.tools.map((t) => t.name),
            ["inspect"],
          );
          const callResult = lines[2]?.["result"] as {
            readonly structuredContent: { readonly title: string; readonly layers: number };
          };
          assert.deepEqual(callResult.structuredContent, { title: "Untitled", layers: 3 });
        }),
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
