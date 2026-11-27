import { Context, Effect, Layer, Schema } from "effect";
import { McpSchema, McpServer, Tool } from "effect/ai";

/** Access mode for external MCP agents calling tools on a desktop application. */
export const PolicyMode = Schema.Literals(["off", "read-only", "allow-writes", "ask-writes"]);
export type PolicyMode = typeof PolicyMode.Type;

export type ToolAccess = "read" | "write";

/** Metadata supplied to an interactive approval handler when `mode` is `"ask-writes"`. */
export interface ApprovalRequest {
  readonly tool: string;
  readonly input: unknown;
  readonly access: ToolAccess;
}

export interface PolicyOptions {
  /** Initial access mode. Defaults to `"read-only"` so write tools stay hidden until enabled. */
  readonly initial?: PolicyMode;
  /**
   * Optional approval check used when `mode` is `"ask-writes"` and an agent invokes a write tool.
   * Returning `"deny"` (or omitting `approve`) refuses the call with an MCP policy error.
   */
  readonly approve?: (request: ApprovalRequest) => Effect.Effect<"allow" | "deny">;
}

/** Live handle for inspecting and changing an MCP server's tool access policy at runtime. */
export interface PolicyController {
  /** Reads the current access mode. */
  readonly current: Effect.Effect<PolicyMode>;
  /**
   * Switches the access mode and notifies connected MCP clients (`notifications/tools/list_changed`)
   * when an `McpServer` is provided.
   */
  readonly setMode: (mode: PolicyMode) => Effect.Effect<void, never, McpServer.McpServer>;
  /** Switches the access mode without requiring `McpServer` (notifications fire when server is active). */
  readonly updateMode: (mode: PolicyMode) => Effect.Effect<void>;
  /** Global middleware + visibility layer to merge into the MCP server's `registrations`. */
  readonly layer: Layer.Layer<never, never, McpServer.McpServer>;
}

class PolicyDenied extends Schema.Error<PolicyDenied>("SewedMcpPolicyDenied")({
  ...McpSchema.McpErrorBase.fields,
  _tag: Schema.tag("SewedMcpPolicyDenied"),
  code: Schema.tag(-32003),
}) {}

const accessOfTool = (
  server: McpServer.McpServer["Service"],
  toolName: string,
): ToolAccess | undefined => {
  const entry = server.tools.find(({ tool }) => tool.name === toolName);
  if (entry === undefined) return undefined;
  return Context.get(entry.annotations, Tool.Readonly) || entry.tool.annotations?.readOnlyHint
    ? "read"
    : "write";
};

/**
 * Creates a live access-control policy for an MCP server.
 *
 * Tools annotated with `Tool.Readonly` (or `access: "read"` in `fromProtocol`/`fromOwner`) are
 * treated as reads; all other tools default to writes. In `"read-only"` mode write tools are
 * hidden from `tools/list` and refused on `tools/call`. In `"off"` mode all tools are hidden
 * and refused. In `"ask-writes"` mode every write call runs `approve` before executing.
 */
export const policy = (options: PolicyOptions = {}): PolicyController => {
  let mode: PolicyMode = options.initial ?? "read-only";
  let attachedServer: McpServer.McpServer["Service"] | undefined;

  const notifyToolsChanged = (server: McpServer.McpServer["Service"]) =>
    server.notifications["notifications/tools/list_changed"]({}).pipe(Effect.ignore);

  const visible = McpServer.visibility(
    Effect.map(McpServer.McpServer, (server) => (req: McpServer.MiddlewareOptions) => {
      if (req.method !== "tools/list" && req.method !== "tools/call") return Effect.succeed(true);
      if (mode === "off") return Effect.succeed(false);
      if (mode === "allow-writes" || mode === "ask-writes") return Effect.succeed(true);
      const access = accessOfTool(server, req.target);
      return Effect.succeed(access === "read");
    }),
  );

  const enforce = McpServer.middleware(
    Effect.map(McpServer.McpServer, (server) => {
      attachedServer = server;
      return (
        effect: Effect.Effect<McpServer.MiddlewareSuccess, McpSchema.McpErrorBase, never>,
        req: McpServer.MiddlewareOptions,
      ) => {
        if (req.method !== "tools/call") return effect;
        if (mode === "off") {
          return Effect.fail(new PolicyDenied({ message: "MCP tool execution is disabled" }));
        }
        const access = accessOfTool(server, req.target) ?? "write";
        if (access === "read" || mode === "allow-writes") return effect;
        if (mode === "read-only") {
          return Effect.fail(
            new PolicyDenied({
              message: `Tool "${req.target}" requires write access (current mode: read-only)`,
            }),
          );
        }
        if (options.approve === undefined) {
          return Effect.fail(
            new PolicyDenied({
              message: `Tool "${req.target}" requires approval, but no approval handler is configured`,
            }),
          );
        }
        return Effect.flatMap(
          options.approve({ tool: req.target, input: req.payload, access }),
          (verdict) =>
            verdict === "allow"
              ? effect
              : Effect.fail(
                  new PolicyDenied({
                    message: `Tool "${req.target}" was denied by the user`,
                  }),
                ),
        );
      };
    }),
  );

  const combined = enforce.combine(visible);

  return {
    current: Effect.sync(() => mode),
    setMode: (next) =>
      Effect.flatMap(McpServer.McpServer, (server) => {
        const changed = mode !== next;
        mode = next;
        return changed ? notifyToolsChanged(server) : Effect.void;
      }),
    updateMode: (next) =>
      Effect.suspend(() => {
        const changed = mode !== next;
        mode = next;
        return changed && attachedServer !== undefined
          ? notifyToolsChanged(attachedServer)
          : Effect.void;
      }),
    layer: combined.layerGlobal,
  };
};
