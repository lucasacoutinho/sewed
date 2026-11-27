# MCP servers (`@sewed/mcp`)

`@sewed/mcp` turns a Sewed desktop application into a Model Context Protocol (MCP) server using Effect's built-in `effect/ai` `McpServer`.

It projects your existing Sewed `RpcGroup` protocols, `Capability` services, `Binding.Owner` handles (workers, utility processes, and hosts), and state streams into MCP tools and resources while staying composable with raw `McpServer` registration layers (`McpServer.toolkit`, `McpServer.resource`, `McpServer.prompt`, `McpServer.skill`, and `McpServer.middleware`).

## Live desktop server

Inside your Electron main process, call `serve` from `@sewed/mcp/main` inside `App.run`.

```ts
import { Effect, Layer } from "effect";
import * as Mcp from "@sewed/mcp";
import * as McpMain from "@sewed/mcp/main";
import { App, BrowserWindow, Worker } from "sewed/main";
import { CanvasProtocol } from "../shared/contracts.js";

App.run(
  [],
  Effect.gen(function* () {
    const canvas = yield* Worker.spawn(
      Worker.entry(new URL("../worker/canvas.js", import.meta.url), CanvasProtocol),
    );
    const window = yield* BrowserWindow.make({ title: "Studio", width: 1280, height: 800 });

    const access = Mcp.policy({ initial: "read-only" });

    const server = yield* McpMain.serve({
      name: "studio",
      version: "1.0.0",
      registrations: Layer.mergeAll(
        access.layer,
        McpMain.fromOwner(canvas, {
          prefix: "canvas_",
          access: { inspect: "read", render: "read" },
          descriptions: {
            inspect: "Return the current document layers and bounds.",
            render: "Render the canvas as a PNG image.",
          },
          content: {
            render: (bytes) => [{ type: "image", data: bytes, mimeType: "image/png" }],
          },
        }),
        Mcp.stateResource({
          uri: "app://window/state",
          name: "Window state",
          current: window.state.pipe(Stream.runHead),
          state: window.state,
        }),
        McpMain.captureTool(window.webContents),
      ),
    });

    // Show `server.clientConfig.claudeCode` or `server.clientConfig.mcpJson` in your Settings UI.
    // Call `access.updateMode("allow-writes")` or `access.updateMode("ask-writes")` when the user toggles permissions.
  }),
);
```

### Transport defaults

`McpMain.serve` and `Mcp.serveHttp` bind to `127.0.0.1` on an ephemeral port (`0`) at `/mcp`.

- Each launch generates a 32-byte random hex Bearer token and checks `Authorization: Bearer <token>` with `crypto.timingSafeEqual`. Pass `auth: { token }` to supply your own token or `auth: "none"` to disable Bearer checks.
- Browser `Origin` headers are rejected by default (`allowedOrigins: []`) to prevent DNS rebinding and cross-site browser requests. Non-browser MCP clients that omit `Origin` remain allowed.
- Non-loopback bind addresses fail with `SewedError` (`code: "Protocol"`) unless `allowNonLoopback: true` is passed.
- `McpMain.serve` atomically writes a `0600` discovery manifest to `path.join(app.getPath("userData"), "mcp.json")` and removes it when the application scope closes. Pass `discoveryPath` to override the location or `discovery: false` to skip writing the file.

## Projecting protocols, capabilities, and owners

`@sewed/mcp` provides three projection layers that reuse your RPC Effect `Schema` definitions directly:

- `Mcp.fromProtocol(protocol, operations, options?)` projects any `RpcGroup` and operation table into MCP tools.
- `Mcp.fromCapability(capability, options?)` resolves a Sewed `Capability` from the Effect context (works with `native`, `client`, and `memory` layers).
- `McpMain.fromOwner(owner, options?)` opens a scoped Sewed `Binding.client` to a running worker, utility process, host, or served capability. Calls preserve typed errors and fail with `SewedError` (`code: "Closed"`) if the owner exits without retrying.

Projection rules:

- Unary RPCs become MCP tools. Streaming RPCs are omitted from tool projection; expose state streams as MCP resources with `Mcp.stateResource`.
- `Schema.Void` payloads map to `Tool.EmptyParams`. Object payloads pass through directly. Scalar or array payloads wrap as `{ input: <payload> }`.
- `Schema.Void` return values return `{ ok: true }`. Top-level `Binary.Bytes` return values encode as base64 unless a `content` mapper converts them into an `ImageContent` or custom content block.
- Declared RPC errors and `SewedError` failures return `isError: true` tool results rather than crashing the server.

## Access policy

`Mcp.policy` enforces tool access using `McpServer.visibility` and `McpServer.middleware`.

Tools marked `access: "read"` (or annotated with `Tool.Readonly`) are treated as reads. Unmarked tools default to writes.

- `"read-only"` (default): hides write tools from `tools/list` and refuses write calls with JSON-RPC error `-32003`.
- `"allow-writes"`: exposes and allows all tools.
- `"ask-writes"`: exposes write tools and runs your `approve({ tool, input, access })` Effect before executing each write call. Denials (or omitting `approve`) fail with `-32003`.
- `"off"`: hides and refuses every tool.

Calling `access.setMode(next)` or `access.updateMode(next)` updates the policy live and emits `notifications/tools/list_changed` to connected MCP clients.

## Headless stdio and live-app bridge

Desktop apps often ship a CLI entry point with two modes:

1. Headless mode (`Mcp.stdio`): runs the same `registrations` directly in Node without launching an Electron window.
2. Connect mode (`Mcp.bridge`): proxies newline-delimited JSON-RPC over stdio to a running Electron app's HTTP endpoint, reading the `0600` discovery manifest automatically.

```ts
import { Effect } from "effect";
import * as Mcp from "@sewed/mcp";

if (process.argv.includes("--connect")) {
  await Effect.runPromise(Mcp.bridge({ discoveryPath }));
} else {
  await Effect.runPromise(
    Effect.scoped(
      Effect.flatMap(
        Mcp.stdio({
          name: "studio",
          version: "1.0.0",
          registrations: headlessRegistrations,
        }),
        (handle) => handle.awaitClose,
      ),
    ),
  );
}
```

## Testing

Use `Mcp.testClient(registrations)` to exercise your projected tools, resources, policies, and custom `effect/ai` registrations in memory without opening a socket or starting Electron:

```ts
import { Effect, Layer } from "effect";
import * as Mcp from "@sewed/mcp";

const result = await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* Mcp.testClient(
        Layer.mergeAll(
          access.layer,
          Mcp.fromProtocol(CanvasProtocol, ops, { access: { inspect: "read" } }),
        ),
      );
      const { tools } = yield* client.listTools();
      const call = yield* client.callTool({ name: "inspect", arguments: {} });
      return { tools, call };
    }),
  ),
);
```
