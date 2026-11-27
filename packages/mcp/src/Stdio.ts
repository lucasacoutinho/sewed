import type { Readable, Writable } from "node:stream";
import {
  type Array as Arr,
  Cause,
  Deferred,
  Effect,
  Fiber,
  Layer,
  PlatformError,
  Queue,
  type Scope,
  Sink,
  Stdio,
  Stream,
} from "effect";
import { type McpProtocol, type McpSchema, McpServer } from "effect/ai";
import { SewedError } from "sewed";
import { readDiscovery } from "./Discovery.ts";
import { defaultProtocols } from "./Http.ts";

export interface NodeStdioOptions {
  /** Readable stream for incoming NDJSON-RPC messages. Defaults to `process.stdin`. */
  readonly input?: Readable;
  /** Writable stream for outgoing NDJSON-RPC messages. Defaults to `process.stdout`. */
  readonly output?: Writable;
  /** Writable stream for stderr output. Defaults to `process.stderr`. */
  readonly error?: Writable;
  /** Command-line arguments exposed on `Stdio.args`. Defaults to `process.argv.slice(2)`. */
  readonly args?: ReadonlyArray<string>;
}

const toPlatformError = (method: string, cause: unknown): PlatformError.PlatformError =>
  PlatformError.systemError({
    _tag: "Unknown",
    module: "Stdio",
    method,
    cause,
  });

const writableSink = (
  stream: Writable,
  method: string,
  endOnDone?: boolean,
): Sink.Sink<void, string | Uint8Array, never, PlatformError.PlatformError> => {
  const sink = Sink.forEach((chunk: string | Uint8Array) =>
    Effect.callback<void, PlatformError.PlatformError>((resume) => {
      const ok = stream.write(chunk, (error) => {
        if (error !== null && error !== undefined) {
          resume(Effect.fail(toPlatformError(method, error)));
        } else if (ok) {
          resume(Effect.void);
        }
      });
      if (!ok) {
        const onDrain = () => {
          stream.off("error", onError);
          resume(Effect.void);
        };
        const onError = (error: Error) => {
          stream.off("drain", onDrain);
          resume(Effect.fail(toPlatformError(method, error)));
        };
        stream.once("drain", onDrain);
        stream.once("error", onError);
      }
    }),
  );
  return endOnDone === true
    ? Sink.mapEffect(sink, () =>
        Effect.callback<void>((resume) => {
          stream.end(() => resume(Effect.void));
        }),
      )
    : sink;
};

const readableStream = (stream: Readable): Stream.Stream<Uint8Array, PlatformError.PlatformError> =>
  Stream.callback<Uint8Array, PlatformError.PlatformError>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const onData = (chunk: Buffer | Uint8Array | string) => {
          const bytes =
            typeof chunk === "string"
              ? Buffer.from(chunk, "utf8")
              : chunk instanceof Uint8Array
                ? chunk
                : new Uint8Array(chunk);
          Queue.offerUnsafe(queue, bytes);
        };
        const onEnd = () => {
          Queue.endUnsafe(queue);
        };
        const onError = (error: Error) => {
          Queue.failCauseUnsafe(queue, Cause.fail(toPlatformError("stdin", error)));
        };
        stream.on("data", onData);
        stream.once("end", onEnd);
        stream.once("error", onError);
        return { onData, onEnd, onError };
      }),
      ({ onData, onEnd, onError }) =>
        Effect.sync(() => {
          stream.off("data", onData);
          stream.off("end", onEnd);
          stream.off("error", onError);
        }),
    ),
  );

/** Creates an Effect `Stdio` layer backed by Node streams (defaulting to `process.stdin`/`stdout`). */
export const nodeStdio = (options: NodeStdioOptions = {}): Layer.Layer<Stdio.Stdio> => {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const error = options.error ?? process.stderr;
  const args = options.args ?? process.argv.slice(2);
  return Layer.succeed(
    Stdio.Stdio,
    Stdio.make({
      args: Effect.succeed(args),
      stdin: readableStream(input),
      stdout: (opts) => writableSink(output, "stdout", opts?.endOnDone),
      stderr: (opts) => writableSink(error, "stderr", opts?.endOnDone),
    }),
  );
};

export interface StdioOptions<RA = never, RE = never, RR = never> {
  readonly name: string;
  readonly version: string;
  readonly instructions?: string;
  readonly description?: string;
  readonly websiteUrl?: string;
  readonly icons?: ReadonlyArray<McpSchema.Icon>;
  /** Supported MCP protocol adapters. Defaults to {@link defaultProtocols}. */
  readonly protocols?: Arr.NonEmptyReadonlyArray<McpProtocol.ProtocolAdapter>;
  /** MCP tools, resources, prompts, skills, and policies to register on the server. */
  readonly registrations?: Layer.Layer<RA, RE, RR>;
  /** Custom Node streams for testing; defaults to `process.stdin` and `process.stdout`. */
  readonly stdio?: NodeStdioOptions;
}

/** Running handle for a headless stdio MCP server. */
export interface StdioHandle {
  readonly server: McpServer.McpServer["Service"];
  /** Resolves cleanly once `input` reaches EOF and all queued responses have been flushed. */
  readonly awaitClose: Effect.Effect<void>;
}

/**
 * Starts a scoped headless MCP server over stdio (newline-delimited JSON-RPC), suitable for CLI
 * subcommands and stdio-only MCP clients.
 */
export const stdio = <RA = never, RE = never, RR = never>(
  options: StdioOptions<RA, RE, RR>,
): Effect.Effect<
  StdioHandle,
  Cause.IllegalArgumentError | RE,
  Scope.Scope | Exclude<McpServer.McpRequest.Without<RR>, McpServer.McpServer>
> =>
  Effect.gen(function* () {
    const layer = McpServer.layerStdio({
      name: options.name,
      version: options.version,
      ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
      ...(options.description === undefined ? {} : { description: options.description }),
      ...(options.websiteUrl === undefined ? {} : { websiteUrl: options.websiteUrl }),
      ...(options.icons === undefined ? {} : { icons: options.icons }),
      protocols: options.protocols ?? defaultProtocols,
      ...(options.registrations === undefined ? {} : { registrations: options.registrations }),
    }).pipe(Layer.provide(nodeStdio(options.stdio)));

    const started = yield* Deferred.make<
      McpServer.McpServer["Service"],
      Cause.IllegalArgumentError | RE
    >();

    // Isolate `makeProtocolStdio`'s self-interruption on stdin EOF inside a scoped child fiber
    // so shutting down stdio never interrupts the caller's own fiber.
    const fiber = yield* Effect.forkScoped(
      Effect.scoped(
        Effect.gen(function* () {
          const ctx = yield* Layer.build(layer);
          const server = ctx.mapUnsafe.get(
            McpServer.McpServer.key,
          ) as McpServer.McpServer["Service"];
          yield* Deferred.succeed(started, server);
          return yield* Effect.never;
        }),
      ).pipe(Effect.catchCause((cause) => Deferred.failCause(started, cause))),
    );

    const server = yield* Deferred.await(started);
    return {
      server,
      awaitClose: Fiber.await(fiber).pipe(Effect.asVoid),
    };
  }) as Effect.Effect<
    StdioHandle,
    Cause.IllegalArgumentError | RE,
    Scope.Scope | Exclude<McpServer.McpRequest.Without<RR>, McpServer.McpServer>
  >;

export type BridgeTarget =
  | { readonly discoveryPath: string }
  | { readonly url: string; readonly token?: string };

export type BridgeOptions = BridgeTarget & {
  /** Custom Node streams for testing; defaults to `process.stdin` and `process.stdout`. */
  readonly input?: Readable;
  readonly output?: Writable;
  /** Custom `fetch` implementation; defaults to `globalThis.fetch`. */
  readonly fetch?: typeof globalThis.fetch;
};

const writeLine = (output: Writable, line: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const payload = line.endsWith("\n") ? line : `${line}\n`;
    const ok = output.write(payload, (err) => {
      if (err !== null && err !== undefined) reject(err);
      else if (ok) resolve();
    });
    if (!ok) {
      output.once("drain", () => resolve());
      output.once("error", reject);
    }
  });

const forwardSseResponse = async (response: Response, output: Writable): Promise<void> => {
  if (response.body === null) return;
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let dataLines: string[] = [];

  const flushEvent = async (): Promise<void> => {
    if (dataLines.length === 0) return;
    const payload = dataLines.join("\n").trim();
    dataLines = [];
    if (payload.length > 0) {
      await writeLine(output, payload);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (;;) {
      const nl = buffer.indexOf("\n");
      if (nl === -1) break;
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      if (line === "") {
        await flushEvent();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
  }
  buffer += decoder.decode();
  if (buffer.length > 0) {
    const line = buffer.replace(/\r$/, "");
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  await flushEvent();
};

const writeJsonRpcBridgeError = async (
  output: Writable,
  id: unknown,
  message: string,
): Promise<void> => {
  if (id === undefined) return;
  await writeLine(
    output,
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message },
    }),
  );
};

/**
 * Proxies newline-delimited JSON-RPC over stdio to a live Streamable HTTP MCP server, allowing
 * stdio-only clients (such as Claude Desktop or `--connect` CLI wrappers) to drive a running
 * Electron application.
 */
export const bridge = (options: BridgeOptions): Effect.Effect<void, SewedError> =>
  Effect.gen(function* () {
    const target: { readonly url: string; readonly token: string | undefined } =
      "discoveryPath" in options
        ? yield* Effect.map(readDiscovery(options.discoveryPath), (manifest) => ({
            url: manifest.url,
            token: manifest.token,
          }))
        : { url: options.url, token: options.token };

    const input = options.input ?? process.stdin;
    const output = options.output ?? process.stdout;
    const fetchImpl = options.fetch ?? globalThis.fetch;

    yield* Effect.tryPromise({
      try: async () => {
        let sessionId: string | undefined;
        let protocolVersion: string | undefined;

        const handleLine = async (rawLine: string): Promise<void> => {
          const trimmed = rawLine.trim();
          if (trimmed.length === 0) return;

          let parsed: unknown;
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            await writeLine(
              output,
              JSON.stringify({
                jsonrpc: "2.0",
                id: null,
                error: { code: -32700, message: "Parse error" },
              }),
            );
            return;
          }

          const messageId =
            typeof parsed === "object" && parsed !== null && "id" in parsed ? parsed.id : undefined;

          const headers: Record<string, string> = {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          };
          if (target.token !== undefined) {
            headers["authorization"] = `Bearer ${target.token}`;
          }
          if (sessionId !== undefined) {
            headers["mcp-session-id"] = sessionId;
          }
          if (protocolVersion !== undefined) {
            headers["mcp-protocol-version"] = protocolVersion;
          }

          let response: Response;
          try {
            response = await fetchImpl(target.url, {
              method: "POST",
              headers,
              body: trimmed,
            });
          } catch (cause) {
            await writeJsonRpcBridgeError(
              output,
              messageId,
              cause instanceof Error ? cause.message : String(cause),
            );
            return;
          }

          const nextSession = response.headers.get("mcp-session-id");
          if (nextSession !== null && nextSession.length > 0) {
            sessionId = nextSession;
          }

          if (response.status === 202 || response.status === 204) {
            return;
          }

          const contentType = response.headers.get("content-type") ?? "";
          if (contentType.includes("text/event-stream")) {
            await forwardSseResponse(response, output);
            return;
          }

          const text = await response.text();
          if (text.trim().length > 0) {
            try {
              const json = JSON.parse(text) as {
                readonly result?: { readonly protocolVersion?: unknown };
              };
              if (
                typeof json.result?.protocolVersion === "string" &&
                json.result.protocolVersion.length > 0
              ) {
                protocolVersion = json.result.protocolVersion;
              }
            } catch {
              // Forward non-JSON error text below if response was not OK.
            }
            if (response.ok || text.trim().startsWith("{")) {
              await writeLine(output, text.trim());
            } else {
              await writeJsonRpcBridgeError(
                output,
                messageId,
                `HTTP ${String(response.status)}: ${text.trim()}`,
              );
            }
          } else if (!response.ok) {
            await writeJsonRpcBridgeError(
              output,
              messageId,
              `HTTP ${String(response.status)} from MCP server`,
            );
          }
        };

        let pending = Promise.resolve();
        let buffer = "";

        await new Promise<void>((resolve, reject) => {
          const onData = (chunk: Buffer | Uint8Array | string) => {
            buffer += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
            for (;;) {
              const nl = buffer.indexOf("\n");
              if (nl === -1) break;
              const line = buffer.slice(0, nl);
              buffer = buffer.slice(nl + 1);
              pending = pending.then(() => handleLine(line));
            }
          };
          const onEnd = () => {
            if (buffer.trim().length > 0) {
              const tail = buffer;
              buffer = "";
              pending = pending.then(() => handleLine(tail));
            }
            pending.then(resolve, reject);
          };
          const onError = (err: Error) => reject(err);

          input.on("data", onData);
          input.once("end", onEnd);
          input.once("error", onError);
        });

        if (sessionId !== undefined) {
          const headers: Record<string, string> = {
            "mcp-session-id": sessionId,
          };
          if (target.token !== undefined) {
            headers["authorization"] = `Bearer ${target.token}`;
          }
          if (protocolVersion !== undefined) {
            headers["mcp-protocol-version"] = protocolVersion;
          }
          try {
            await fetchImpl(target.url, { method: "DELETE", headers });
          } catch {
            // Best-effort session termination on bridge shutdown.
          }
        }
      },
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : new SewedError({
              code: "Protocol",
              message: `MCP stdio bridge failed talking to ${target.url}`,
              cause,
            }),
    });
  });
