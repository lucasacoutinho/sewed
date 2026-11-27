import { Effect, Layer, Schema } from "effect";
import { McpServer } from "effect/ai";
import { Rpc, RpcGroup, RpcSchema } from "effect/rpc";
import { Binary, type Binding, Capability, MainContext, type WebContents } from "sewed";
import * as Mcp from "../src/index.ts";
import * as McpMain from "../src/main.ts";

const SampleProtocol = RpcGroup.make(
  Rpc.make("inspect", {
    success: Schema.Struct({ layers: Schema.Int }),
  }),
  Rpc.make("rename", {
    payload: Schema.Struct({ name: Schema.String }),
  }),
  Rpc.make("render", {
    success: Binary.Bytes,
  }),
  Rpc.make("events", {
    success: RpcSchema.Stream(Schema.String, Schema.Never),
  }),
);

const SampleCapability = Capability.define("test/sample", SampleProtocol);

// 1. UnaryTags excludes stream RPCs; content receives exact decoded UnarySuccess type.
export const validProjection = Mcp.fromCapability(SampleCapability, {
  prefix: "doc_",
  include: ["inspect", "rename", "render"],
  access: { inspect: "read", render: "read" },
  descriptions: { inspect: "Inspect document" },
  content: {
    render: (bytes) => {
      const check: Uint8Array = bytes;
      return [{ type: "image", data: check, mimeType: "image/png" }];
    },
  },
});

export const invalidInclude = Mcp.fromCapability(SampleCapability, {
  // @ts-expect-error stream RPCs cannot be included as MCP tools
  include: ["events"],
});

export const invalidAccess = Mcp.fromCapability(SampleCapability, {
  // @ts-expect-error unknown RPC tag
  access: { nonexistent: "read" },
});

export const invalidContent = Mcp.fromCapability(SampleCapability, {
  content: {
    render: (bytes) => {
      // @ts-expect-error render returns Uint8Array, not string
      const wrong: string = bytes;
      return [{ type: "text", text: wrong }];
    },
  },
});

// 2. fromCapability preserves the capability service requirement in its Layer.
export const requiresCapability: Layer.Layer<
  never,
  never,
  McpServer.McpServer | typeof SampleCapability
> = validProjection;

// @ts-expect-error SampleCapability is required unless provided
export const missingCapability: Layer.Layer<never, never, McpServer.McpServer> = validProjection;

// 3. @sewed/mcp/main exports require MainContext at compile time.
export const checkMainServe = () => {
  const running = McpMain.serve({ name: "app", version: "1.0.0" });
  const ok: Effect.Effect<
    McpMain.ServerHandle,
    unknown,
    MainContext | import("effect").Scope.Scope
  > = running;
  // @ts-expect-error serve requires MainContext
  const missingMain: Effect.Effect<McpMain.ServerHandle, unknown, import("effect").Scope.Scope> =
    running;
  return { ok, missingMain };
};

export const checkFromOwner = (owner: Binding.Owner<RpcGroup.Rpcs<typeof SampleProtocol>>) => {
  const layer = McpMain.fromOwner(owner, {
    include: ["inspect"],
    access: { inspect: "read" },
  });
  const ok: Layer.Layer<never, unknown, McpServer.McpServer | MainContext> = layer;
  // @ts-expect-error fromOwner requires MainContext
  const missingMain: Layer.Layer<never, unknown, McpServer.McpServer> = layer;
  return { ok, missingMain };
};

export const checkCaptureTool = (target: {
  readonly capture: (
    options?: WebContents.CaptureOptions,
  ) => Effect.Effect<WebContents.Capture, import("sewed").SewedError, MainContext>;
}) => {
  const layer = McpMain.captureTool(target);
  const ok: Layer.Layer<never, never, McpServer.McpServer | MainContext> = layer;
  // @ts-expect-error captureTool requires MainContext
  const missingMain: Layer.Layer<never, never, McpServer.McpServer> = layer;
  return { ok, missingMain };
};
