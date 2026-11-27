import { Context, Effect, Layer, Schema, Stream } from "effect";
import { McpSchema, McpServer, Tool, Toolkit } from "effect/ai";
import type { Rpc, RpcGroup, RpcSchema } from "effect/rpc";
import { RpcSchema as RpcSchemaRuntime } from "effect/rpc";
import { Binary, type Capability, SewedError } from "sewed";
import type { ToolAccess } from "./Policy.ts";

/** Extracts the tags of all unary (non-streaming) RPCs in a protocol. */
export type UnaryTags<Rpcs extends Rpc.Any> =
  Rpcs extends Rpc.Rpc<
    infer Tag,
    infer _Payload,
    infer Success,
    infer _Error,
    infer _Middleware,
    infer _Requires
  >
    ? Success extends RpcSchema.Stream<any, any>
      ? never
      : Tag
    : never;

/** Extracts the decoded success type of a unary RPC by tag. */
export type UnarySuccess<Rpcs extends Rpc.Any, Tag extends string> =
  Extract<Rpcs, { readonly _tag: Tag }> extends Rpc.Rpc<
    Tag,
    infer _Payload,
    infer Success,
    infer _Error,
    infer _Middleware,
    infer _Requires
  >
    ? Success["Type"]
    : never;

export interface ProjectOptions<Rpcs extends Rpc.Any> {
  /** Optional prefix prepended to every generated MCP tool name (for example `"canvas_"`). */
  readonly prefix?: string;
  /** When set, exposes only these unary RPC tags. */
  readonly include?: readonly UnaryTags<Rpcs>[];
  /** Excludes these unary RPC tags from the generated MCP tools. */
  readonly exclude?: readonly UnaryTags<Rpcs>[];
  /** Human-readable descriptions shown to MCP clients per RPC tag. */
  readonly descriptions?: Partial<Record<UnaryTags<Rpcs>, string>>;
  /** Display titles per RPC tag. */
  readonly titles?: Partial<Record<UnaryTags<Rpcs>, string>>;
  /**
   * Read/write classification per RPC tag. Tools marked `"read"` receive `readOnlyHint: true` and
   * are permitted in `policy({ initial: "read-only" })`; unmarked tools default to `"write"`.
   */
  readonly access?: Partial<Record<UnaryTags<Rpcs>, ToolAccess>>;
  /** Marks specific RPC tags with `idempotentHint`. */
  readonly idempotent?: Partial<Record<UnaryTags<Rpcs>, boolean>>;
  /**
   * Custom MCP content mappers per RPC tag, for example turning a `Uint8Array` render or
   * screenshot into an image content block.
   */
  readonly content?: {
    readonly [Tag in UnaryTags<Rpcs>]?: (
      value: UnarySuccess<Rpcs, Tag>,
    ) => McpSchema.CallToolResult["content"];
  };
}

const isVoidSchema = (schema: Schema.Top): boolean => schema.ast._tag === "Void";

const isObjectRootSchema = (schema: Schema.Top): boolean => schema.ast._tag === "Objects";

const isBinaryBytesSchema = (schema: Schema.Top): boolean => {
  if (schema === Binary.Bytes || schema === Schema.Uint8Array) return true;
  const ast = schema.ast;
  if (ast._tag !== "Declaration") return false;
  const annotations = ast.annotations as Record<string, unknown> | undefined;
  return (
    annotations?.["expected"] === "Uint8Array" ||
    annotations?.["identifier"] === "Uint8Array" ||
    annotations?.["title"] === "Uint8Array"
  );
};

const toParametersSchema = (
  payloadSchema: Schema.Top,
): { readonly schema: Schema.Top; readonly mode: "void" | "direct" | "wrapped" } => {
  if (isVoidSchema(payloadSchema)) {
    return { schema: Tool.EmptyParams, mode: "void" };
  }
  if (isObjectRootSchema(payloadSchema)) {
    return { schema: payloadSchema, mode: "direct" };
  }
  return {
    schema: Schema.Struct({ input: payloadSchema }),
    mode: "wrapped",
  };
};

const toSuccessSchema = (
  successSchema: Schema.Top,
  hasContentMapper: boolean,
): { readonly schema: Schema.Top; readonly isVoid: boolean } => {
  if (isVoidSchema(successSchema)) {
    return { schema: Schema.Struct({ ok: Schema.Literal(true) }), isVoid: true };
  }
  if (hasContentMapper) {
    return { schema: Schema.Any, isVoid: false };
  }
  if (isBinaryBytesSchema(successSchema)) {
    return { schema: Schema.Uint8ArrayFromBase64, isVoid: false };
  }
  return { schema: successSchema, isVoid: false };
};

const toFailureSchema = (errorSchema: Schema.Top): Schema.Top =>
  errorSchema.ast._tag === "Never" ? SewedError : Schema.Union([errorSchema, SewedError]);

/** @internal */
export const registerProtocolTools = <Rpcs extends Rpc.Any>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  invoke: (tag: string, input: unknown) => Effect.Effect<unknown, unknown>,
  options: ProjectOptions<Rpcs> = {},
): Effect.Effect<void, never, McpServer.McpServer> => {
  const prefix = options.prefix ?? "";
  const include = options.include === undefined ? undefined : new Set<string>(options.include);
  const exclude = options.exclude === undefined ? undefined : new Set<string>(options.exclude);
  const descriptions = options.descriptions as Readonly<Record<string, string>> | undefined;
  const titles = options.titles as Readonly<Record<string, string>> | undefined;
  const accessMap = options.access as Readonly<Record<string, ToolAccess>> | undefined;
  const idempotentMap = options.idempotent as Readonly<Record<string, boolean>> | undefined;
  const contentMap = options.content as
    | Readonly<Record<string, (value: unknown) => McpSchema.CallToolResult["content"]>>
    | undefined;

  const tools: Tool.Any[] = [];
  const handlers: Record<string, (params: unknown) => Effect.Effect<unknown, unknown>> = {};
  const mappedContent: Record<string, (value: unknown) => McpSchema.CallToolResult["content"]> = {};

  for (const [tag, rawRpc] of protocol.requests) {
    const rpc = rawRpc as unknown as Rpc.AnyWithProps;
    if (RpcSchemaRuntime.isStreamSchema(rpc.successSchema)) continue;
    if (include !== undefined && !include.has(tag)) continue;
    if (exclude !== undefined && exclude.has(tag)) continue;

    const toolName = `${prefix}${tag}`;
    const mapper = contentMap?.[tag];
    const params = toParametersSchema(rpc.payloadSchema);
    const success = toSuccessSchema(rpc.successSchema, mapper !== undefined);
    const failure = toFailureSchema(rpc.errorSchema);
    const isRead = accessMap?.[tag] === "read";
    const title = titles?.[tag];
    const idempotent = idempotentMap?.[tag];

    let tool = Tool.make(toolName, {
      ...(descriptions?.[tag] === undefined ? {} : { description: descriptions[tag] }),
      parameters: params.schema as Schema.Encoder<any, never>,
      success: success.schema as Schema.Codec<any, any, never, never>,
      failure: failure as Schema.Codec<any, any, never, never>,
    }).annotate(Tool.Readonly, isRead);

    if (isRead) {
      tool = tool.annotate(Tool.Destructive, false);
    }
    if (title !== undefined) {
      tool = tool.annotate(Tool.Title, title);
    }
    if (idempotent !== undefined) {
      tool = tool.annotate(Tool.Idempotent, idempotent);
    }

    tools.push(tool);
    if (mapper !== undefined) mappedContent[toolName] = mapper;

    handlers[toolName] = (rawParams: unknown) => {
      const payload =
        params.mode === "void"
          ? undefined
          : params.mode === "wrapped"
            ? (rawParams as { readonly input: unknown }).input
            : rawParams;
      return success.isVoid ? Effect.as(invoke(tag, payload), { ok: true }) : invoke(tag, payload);
    };
  }

  if (tools.length === 0) return Effect.void;

  const toolkit = Toolkit.make(...tools);
  const handlerLayer = (
    toolkit.toLayer as (
      h: Record<string, (params: unknown) => Effect.Effect<unknown, unknown>>,
    ) => Layer.Layer<Tool.HandlersFor<Record<string, Tool.Any>>>
  )(handlers);

  return McpServer.registerToolkit(
    toolkit,
    Object.keys(mappedContent).length === 0 ? undefined : { content: mappedContent },
  ).pipe(Effect.provide(handlerLayer)) as Effect.Effect<void, never, McpServer.McpServer>;
};

/**
 * Projects all selected unary RPCs from a Sewed `RpcGroup` and its operation table into MCP tools.
 */
export const fromProtocol = <Rpcs extends Rpc.Any>(
  protocol: RpcGroup.RpcGroup<Rpcs>,
  operations: Capability.Operations<Rpcs>,
  options?: ProjectOptions<Rpcs>,
): Layer.Layer<never, never, McpServer.McpServer> => {
  const table = operations as unknown as Record<
    string,
    (input: unknown) => Effect.Effect<unknown, unknown>
  >;
  return Layer.effectDiscard(
    registerProtocolTools(protocol, (tag, input) => table[tag]!(input), options),
  );
};

type AnyCapability = {
  readonly key: string;
  readonly protocol: RpcGroup.RpcGroup<any>;
};

/**
 * Projects a Sewed `Capability` from the Effect environment into MCP tools. Works with `native`,
 * `client`, and `memory` capability layers alike.
 */
export const fromCapability = <C extends Context.Service<any, any> & AnyCapability>(
  capability: C,
  options?: ProjectOptions<RpcGroup.Rpcs<C["protocol"]>>,
): Layer.Layer<never, never, McpServer.McpServer | Context.Service.Identifier<C>> =>
  Layer.effectDiscard(
    Effect.flatMap(capability, (operations) => {
      const table = operations as Record<
        string,
        (input: unknown) => Effect.Effect<unknown, unknown>
      >;
      return registerProtocolTools(
        capability.protocol,
        (tag, input) => table[tag]!(input),
        options as ProjectOptions<any>,
      );
    }),
  ) as Layer.Layer<never, never, McpServer.McpServer | Context.Service.Identifier<C>>;

export interface StateResourceOptions<A, E, R> {
  /** Resource URI exposed to MCP clients (for example `"app://window/state"`). */
  readonly uri: string;
  /** Human-readable resource name. */
  readonly name: string;
  readonly description?: string;
  readonly mimeType?: string;
  /** Effect that reads the current snapshot on `resources/read`. */
  readonly current: Effect.Effect<A, E, R>;
  /**
   * Optional live state stream (such as `window.state` or `NativeTheme.state`). When provided,
   * each update after the initial replay emits `notifications/resources/updated`.
   */
  readonly state?: Stream.Stream<A, E, R>;
  /** Optional serializer for `current`; defaults to `JSON.stringify(value, null, 2)`. */
  readonly serialize?: (value: A) => string | Uint8Array;
}

/**
 * Exposes a Sewed state query (and optional change stream) as an MCP resource.
 */
export const stateResource = <A, E, R = never>(
  options: StateResourceOptions<A, E, R>,
): Layer.Layer<never, never, McpServer.McpServer | R> => {
  const mimeType = options.mimeType ?? "application/json";
  const serialize =
    options.serialize ?? ((value: A) => JSON.stringify(value, null, 2) ?? String(value));

  return Layer.effectDiscard(
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      const context = yield* Effect.context<R>();
      const readContent: Effect.Effect<string | Uint8Array, McpSchema.InternalError> =
        options.current.pipe(
          Effect.provideContext(context),
          Effect.map(serialize),
          Effect.mapError(
            (cause) =>
              new McpSchema.InternalError({
                message: cause instanceof Error ? cause.message : String(cause),
              }),
          ),
        );
      yield* McpServer.registerResource({
        uri: options.uri,
        name: options.name,
        ...(options.description === undefined ? {} : { description: options.description }),
        mimeType,
        content: readContent,
      });
      if (options.state !== undefined) {
        yield* options.state.pipe(
          Stream.drop(1),
          Stream.runForEach(() =>
            server.notifications["notifications/resources/updated"]({ uri: options.uri }).pipe(
              Effect.ignore,
            ),
          ),
          Effect.provideContext(context),
          Effect.ignore,
          Effect.forkScoped,
        );
      }
    }),
  );
};
