import path from "node:path";
import { type Cause, Effect, Layer, Schema, type Scope } from "effect";
import { McpServer, Tool, Toolkit } from "effect/ai";
import type { Rpc } from "effect/rpc";
import { Binding, ClientContext, MainContext, SewedError, WebContents } from "sewed";
import { serveHttp, type ServeHttpOptions, type ServerHandle } from "./Http.ts";
import { type ProjectOptions, registerProtocolTools } from "./Project.ts";

export type { ServeHttpOptions, ServerHandle } from "./Http.ts";
export type { ProjectOptions } from "./Project.ts";

export interface MainServeOptions<RA = never, RE = never, RR = never> extends ServeHttpOptions<
  RA,
  RE,
  RR
> {
  /**
   * Controls the `0600` discovery manifest file. Defaults to `true`, writing to
   * `path.join(app.getPath("userData"), "mcp.json")` unless `discoveryPath` is explicitly set.
   * Set `discovery: false` to disable writing a discovery file.
   */
  readonly discovery?: boolean;
}

const defaultElectronDiscoveryPath: Effect.Effect<string, SewedError> = Effect.tryPromise({
  try: async () => {
    const { app } = await import("electron");
    return path.join(app.getPath("userData"), "mcp.json");
  },
  catch: (cause) =>
    new SewedError({
      code: "Startup",
      message:
        "Could not resolve Electron userData path for MCP discovery manifest; pass discoveryPath or discovery: false outside Electron",
      cause,
    }),
});

/**
 * Starts a scoped Streamable HTTP MCP server inside the Electron main process.
 *
 * Defaults to `127.0.0.1`, an ephemeral port (`0`), `/mcp`, per-launch Bearer authentication,
 * strict `Origin` rejection, and an atomic `0600` discovery manifest at `userData/mcp.json` that
 * is removed automatically when the application scope closes.
 */
export const serve = <RA = never, RE = never, RR = never>(
  options: MainServeOptions<RA, RE, RR>,
): Effect.Effect<
  ServerHandle,
  SewedError | Cause.IllegalArgumentError | RE,
  MainContext | Scope.Scope | Exclude<McpServer.McpRequest.Without<RR>, McpServer.McpServer>
> =>
  Effect.gen(function* () {
    yield* MainContext;
    const { discovery = true, discoveryPath, ...rest } = options;
    const resolvedDiscoveryPath =
      discoveryPath !== undefined
        ? discoveryPath
        : discovery
          ? yield* defaultElectronDiscoveryPath
          : undefined;
    return yield* serveHttp({
      ...rest,
      ...(resolvedDiscoveryPath === undefined ? {} : { discoveryPath: resolvedDiscoveryPath }),
    });
  }) as Effect.Effect<
    ServerHandle,
    SewedError | Cause.IllegalArgumentError | RE,
    MainContext | Scope.Scope | Exclude<McpServer.McpRequest.Without<RR>, McpServer.McpServer>
  >;

let syntheticSlotCounter = 0;

/**
 * Projects any running Sewed `Binding.Owner` (a worker, utility process, in-process host, or
 * served capability) into MCP tools over its existing Sewed `MessagePort` binding.
 *
 * Calls fail cleanly with `SewedError({ code: "Closed" })` if the owner exits; nothing is
 * silently retried or respawned.
 */
export const fromOwner = <Rpcs extends Rpc.Any>(
  owner: Binding.Owner<Rpcs>,
  options?: ProjectOptions<Rpcs>,
): Layer.Layer<never, SewedError, McpServer.McpServer | MainContext> =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      yield* MainContext;
      syntheticSlotCounter += 1;
      const synthetic = Binding.slot(
        `mcp-${owner.id}-${String(syntheticSlotCounter)}`,
        owner.protocol,
      );
      const bound = Binding.to(synthetic, owner);
      const clientCtx = yield* Binding.clientContext([bound]);
      const client = yield* Binding.client(synthetic).pipe(
        Effect.provideService(ClientContext, clientCtx),
      );
      const table = client as Record<
        string,
        (input: unknown) => Effect.Effect<unknown, unknown, ClientContext | Scope.Scope>
      >;
      yield* registerProtocolTools(
        owner.protocol,
        (tag, input) =>
          table[tag]!(input).pipe(Effect.provideService(ClientContext, clientCtx), Effect.scoped),
        options,
      );
    }),
  );

/** Any Sewed web contents surface that supports `capture` (such as `window.webContents`). */
export interface Capturable {
  readonly capture: (
    options?: WebContents.CaptureOptions,
  ) => Effect.Effect<WebContents.Capture, SewedError, MainContext>;
}

export interface CaptureToolOptions {
  /** MCP tool name. Defaults to `"capture_window"`. */
  readonly name?: string;
  /** Human-readable tool description shown to MCP clients. */
  readonly description?: string;
  /** Optional display title for the tool. */
  readonly title?: string;
}

/**
 * Registers an opt-in read-only MCP tool that captures a PNG screenshot of a Sewed window or
 * web contents view and returns it as an MCP image content block.
 */
export const captureTool = (
  target: Capturable,
  options: CaptureToolOptions = {},
): Layer.Layer<never, never, McpServer.McpServer | MainContext> =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const mainCtx = yield* Effect.context<MainContext>();
      const name = options.name ?? "capture_window";
      let tool = Tool.make(name, {
        description: options.description ?? "Captures a PNG screenshot of the application window.",
        parameters: WebContents.CaptureOptions,
        success: Schema.Any,
        failure: SewedError,
      })
        .annotate(Tool.Readonly, true)
        .annotate(Tool.Destructive, false);

      if (options.title !== undefined) {
        tool = tool.annotate(Tool.Title, options.title);
      }

      const toolkit = Toolkit.make(tool);
      const handlers = (
        toolkit.toLayer as (
          h: Record<
            string,
            (params: WebContents.CaptureOptions) => Effect.Effect<unknown, SewedError>
          >,
        ) => Layer.Layer<Tool.HandlersFor<Record<string, Tool.Any>>>
      )({
        [name]: (params: WebContents.CaptureOptions) =>
          target.capture(params).pipe(Effect.provideContext(mainCtx)),
      });

      yield* McpServer.registerToolkit(toolkit, {
        content: {
          [name]: (value: unknown) => {
            const capture = value as WebContents.Capture;
            return [
              {
                type: "image" as const,
                data: capture.bytes,
                mimeType: "image/png",
              },
            ];
          },
        },
      }).pipe(Effect.provide(handlers));
    }),
  );
