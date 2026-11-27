import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { type Array as Arr, type Cause, type Context, Effect, Layer, type Scope } from "effect";
import { McpProtocol, type McpSchema, McpServer } from "effect/ai";
import { HttpEffect, HttpRouter, type HttpServerRequest } from "effect/http";
import { SewedError } from "sewed";
import {
  type ClientConfig,
  clientConfigOf,
  generateToken,
  removeDiscovery,
  writeDiscovery,
} from "./Discovery.ts";

/** Default stateful MCP protocol versions negotiated by Sewed servers (newest first). */
export const defaultProtocols = [
  McpProtocol.v2025_11_25,
  McpProtocol.v2025_06_18,
  McpProtocol.v2025_03_26,
  McpProtocol.v2024_11_05,
] as const;

export type HttpAuth = "bearer" | "none" | { readonly token: string };

export interface ServeHttpOptions<RA = never, RE = never, RR = never> {
  readonly name: string;
  readonly version: string;
  readonly instructions?: string;
  readonly description?: string;
  readonly websiteUrl?: string;
  readonly icons?: ReadonlyArray<McpSchema.Icon>;
  /** Supported MCP protocol adapters. Defaults to {@link defaultProtocols}. */
  readonly protocols?: Arr.NonEmptyReadonlyArray<McpProtocol.ProtocolAdapter>;
  /** Bind address. Defaults to `"127.0.0.1"`. Non-loopback hosts require `allowNonLoopback: true`. */
  readonly host?: string;
  /** Permits binding to a non-loopback host. Defaults to `false`. */
  readonly allowNonLoopback?: boolean;
  /** Listening port. Defaults to `0` (ephemeral OS-assigned port). */
  readonly port?: number;
  /** HTTP endpoint path. Defaults to `"/mcp"`. */
  readonly path?: HttpRouter.PathInput;
  /**
   * Authentication mode. Defaults to `"bearer"`, which generates a per-launch 32-byte hex token
   * and requires `Authorization: Bearer <token>` on every request.
   */
  readonly auth?: HttpAuth;
  /**
   * Browser `Origin` headers allowed to call this endpoint. Defaults to `[]`, which rejects all
   * browser origins while allowing non-browser MCP clients that omit `Origin`.
   */
  readonly allowedOrigins?: ReadonlyArray<string>;
  /** Maximum accepted HTTP request body size in bytes. Defaults to 4 MiB. */
  readonly maxBodyBytes?: number;
  /**
   * Optional filesystem path for a `0600` JSON discovery manifest written while the server is
   * running and removed automatically when its scope closes.
   */
  readonly discoveryPath?: string;
  /** MCP tools, resources, prompts, skills, and policies to register on the server. */
  readonly registrations?: Layer.Layer<RA, RE, RR>;
}

/** Running handle for a loopback Streamable HTTP MCP server. */
export interface ServerHandle {
  readonly url: string;
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly token: string | undefined;
  readonly discoveryPath: string | undefined;
  readonly clientConfig: ClientConfig;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;

const verifyBearer = (header: string | undefined, expectedToken: string): boolean => {
  if (header === undefined) return false;
  const expected = `Bearer ${expectedToken}`;
  const a = Buffer.from(header, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
};

const formatUrlHost = (host: string): string => (host.includes(":") ? `[${host}]` : host);

const readBody = (req: IncomingMessage, maxBytes: number): Promise<Uint8Array | "too-large"> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    req.on("data", (chunk: Buffer | string) => {
      if (settled) return;
      const buf = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
      total += buf.byteLength;
      if (total > maxBytes) {
        settled = true;
        req.pause();
        resolve("too-large");
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(chunks.length === 0 ? new Uint8Array(0) : Buffer.concat(chunks, total));
    });
    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });

const writeJsonError = (
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
  extraHeaders?: Record<string, string>,
): void => {
  const body = JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null });
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(body)),
    ...extraHeaders,
  });
  res.end(body);
};

const toWebHeaders = (req: IncomingMessage): Headers => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
};

const writeWebResponse = async (res: ServerResponse, response: Response): Promise<void> => {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    const existing = headers[key];
    if (existing === undefined) {
      headers[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      headers[key] = [existing, value];
    }
  });

  res.writeHead(response.status, response.statusText, headers);
  if (response.body === null) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  const onClose = () => {
    void reader.cancel();
  };
  res.once("close", onClose);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.destroyed && value !== undefined && value.byteLength > 0) {
        if (!res.write(value)) {
          await new Promise<void>((resolve) => {
            res.once("drain", resolve);
            res.once("close", resolve);
          });
        }
      }
    }
  } finally {
    res.off("close", onClose);
    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  }
};

/**
 * Starts a scoped Streamable HTTP MCP server bound to loopback by default with per-launch Bearer
 * authentication, strict `Origin` rejection, and optional `0600` discovery manifest management.
 */
export const serveHttp = <RA = never, RE = never, RR = never>(
  options: ServeHttpOptions<RA, RE, RR>,
): Effect.Effect<
  ServerHandle,
  SewedError | Cause.IllegalArgumentError | RE,
  Scope.Scope | Exclude<McpServer.McpRequest.Without<RR>, McpServer.McpServer>
> =>
  Effect.gen(function* () {
    const host = options.host ?? "127.0.0.1";
    const allowNonLoopback = options.allowNonLoopback ?? false;
    if (!allowNonLoopback && !LOOPBACK_HOSTS.has(host)) {
      return yield* new SewedError({
        code: "Protocol",
        message: `Refusing to bind MCP HTTP server to non-loopback host "${host}" without allowNonLoopback: true`,
      });
    }

    const requestedPort = options.port ?? 0;
    if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
      return yield* new SewedError({
        code: "Protocol",
        message: `Invalid MCP HTTP port: ${String(requestedPort)}`,
      });
    }

    const endpointPath = options.path ?? "/mcp";
    const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    if (!Number.isInteger(maxBodyBytes) || maxBodyBytes <= 0) {
      return yield* new SewedError({
        code: "Protocol",
        message: `Invalid maxBodyBytes: ${String(maxBodyBytes)}`,
      });
    }

    const auth = options.auth ?? "bearer";
    const token = auth === "none" ? undefined : auth === "bearer" ? generateToken() : auth.token;
    if (typeof auth === "object" && token !== undefined && token.length === 0) {
      return yield* new SewedError({
        code: "Protocol",
        message: "MCP HTTP bearer token must be non-empty",
      });
    }

    const protocols = options.protocols ?? defaultProtocols;
    const capturedContext = yield* Effect.context<any>();

    const mcpLayer = McpServer.layerHttp({
      name: options.name,
      version: options.version,
      ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
      ...(options.description === undefined ? {} : { description: options.description }),
      ...(options.websiteUrl === undefined ? {} : { websiteUrl: options.websiteUrl }),
      ...(options.icons === undefined ? {} : { icons: options.icons }),
      path: endpointPath,
      protocols,
      allowedOrigins: options.allowedOrigins ?? [],
      allowSessionTermination: true,
      ...(options.registrations === undefined ? {} : { registrations: options.registrations }),
    });

    const httpEffect = yield* HttpRouter.toHttpEffect(
      mcpLayer as Layer.Layer<any, Cause.IllegalArgumentError | RE, HttpRouter.HttpRouter>,
    );
    const webHandler = HttpEffect.toWebHandlerWith<
      never,
      HttpServerRequest.HttpServerRequest | Scope.Scope
    >(capturedContext as Context.Context<never>)(httpEffect);

    const server = createServer((req, res) => {
      void (async () => {
        try {
          if (token !== undefined && !verifyBearer(req.headers.authorization, token)) {
            writeJsonError(res, 401, -32001, "Unauthorized", {
              "www-authenticate": "Bearer",
            });
            return;
          }

          const method = req.method ?? "GET";
          const hasBody = method !== "GET" && method !== "HEAD";
          let body: Uint8Array | undefined;
          if (hasBody) {
            const read = await readBody(req, maxBodyBytes);
            if (read === "too-large") {
              writeJsonError(res, 413, -32600, "Request body exceeds maxBodyBytes");
              return;
            }
            body = read;
          }

          const origin = `http://${req.headers.host ?? `${formatUrlHost(host)}:${String(requestedPort)}`}`;
          const requestUrl = new URL(req.url ?? "/", origin);
          const init: RequestInit = {
            method,
            headers: toWebHeaders(req),
            ...(body !== undefined && body.byteLength > 0 ? { body: Buffer.from(body) } : {}),
          };
          const response = await webHandler(new Request(requestUrl, init));
          await writeWebResponse(res, response);
        } catch {
          if (!res.headersSent && !res.destroyed) {
            writeJsonError(res, 500, -32603, "Internal server error");
          } else if (!res.destroyed) {
            res.destroy();
          }
        }
      })();
    });

    const boundPort = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          new Promise<number>((resolve, reject) => {
            const onError = (error: Error) => {
              server.off("listening", onListening);
              reject(error);
            };
            const onListening = () => {
              server.off("error", onError);
              const address = server.address() as AddressInfo | null;
              if (address === null || typeof address === "string") {
                reject(new Error("MCP HTTP server did not bind to a TCP port"));
                return;
              }
              resolve(address.port);
            };
            server.once("error", onError);
            server.once("listening", onListening);
            server.listen(requestedPort, host);
          }),
        catch: (cause) =>
          new SewedError({
            code: "Startup",
            message: `Could not start MCP HTTP server on ${host}:${String(requestedPort)}`,
            cause,
          }),
      }),
      () =>
        Effect.promise(
          () =>
            new Promise<void>((resolve) => {
              server.closeAllConnections?.();
              server.close(() => resolve());
            }),
        ),
    );

    const url = `http://${formatUrlHost(host)}:${String(boundPort)}${endpointPath}`;

    if (options.discoveryPath !== undefined) {
      const discoveryPath = options.discoveryPath;
      yield* Effect.acquireRelease(
        writeDiscovery(discoveryPath, {
          name: options.name,
          version: options.version,
          url,
          ...(token === undefined ? {} : { token }),
          pid: process.pid,
          startedAt: new Date().toISOString(),
        }),
        () => removeDiscovery(discoveryPath, url),
      );
    }

    return {
      url,
      host,
      port: boundPort,
      path: endpointPath,
      token,
      discoveryPath: options.discoveryPath,
      clientConfig: clientConfigOf(options.name, url, token),
    };
  }) as Effect.Effect<
    ServerHandle,
    SewedError | Cause.IllegalArgumentError | RE,
    Scope.Scope | Exclude<McpServer.McpRequest.Without<RR>, McpServer.McpServer>
  >;
