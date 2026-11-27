import type { Array as Arr, Cause, Effect, Layer, Scope } from "effect";
import { type McpProtocol, type McpServer, McpTest } from "effect/ai";
import { defaultProtocols } from "./Http.ts";

export {
  Discovery,
  readDiscovery,
  writeDiscovery,
  removeDiscovery,
  clientConfigOf,
  type ClientConfig,
} from "./Discovery.ts";
export {
  PolicyMode,
  policy,
  type ToolAccess,
  type ApprovalRequest,
  type PolicyOptions,
  type PolicyController,
} from "./Policy.ts";
export {
  fromProtocol,
  fromCapability,
  stateResource,
  type UnaryTags,
  type UnarySuccess,
  type ProjectOptions,
  type StateResourceOptions,
} from "./Project.ts";
export {
  defaultProtocols,
  serveHttp,
  type HttpAuth,
  type ServeHttpOptions,
  type ServerHandle,
} from "./Http.ts";
export {
  nodeStdio,
  stdio,
  bridge,
  type NodeStdioOptions,
  type StdioOptions,
  type StdioHandle,
  type BridgeTarget,
  type BridgeOptions,
} from "./Stdio.ts";

export interface TestClientOptions<
  Protocols extends Arr.NonEmptyReadonlyArray<McpProtocol.ProtocolAdapter> =
    typeof defaultProtocols,
> {
  readonly name?: string;
  readonly version?: string;
  readonly instructions?: string;
  readonly protocols?: Protocols;
}

/**
 * Connects an in-memory typed MCP client to a registration layer for fast Node tests without
 * opening an HTTP port or stdio pipe.
 */
export const testClient = <
  RA = never,
  RE = never,
  RR = never,
  const Protocols extends Arr.NonEmptyReadonlyArray<McpProtocol.ProtocolAdapter> =
    typeof defaultProtocols,
>(
  registrations: Layer.Layer<RA, RE, RR>,
  options: TestClientOptions<Protocols> = {},
): Effect.Effect<
  McpTest.Client,
  Cause.IllegalArgumentError | RE,
  Scope.Scope | Exclude<McpServer.McpRequest.Without<RR>, McpServer.McpServer>
> =>
  McpTest.makeClient(registrations, {
    protocols: (options.protocols ?? defaultProtocols) as Protocols,
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.version === undefined ? {} : { version: options.version }),
    ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
  }) as Effect.Effect<
    McpTest.Client,
    Cause.IllegalArgumentError | RE,
    Scope.Scope | Exclude<McpServer.McpRequest.Without<RR>, McpServer.McpServer>
  >;
