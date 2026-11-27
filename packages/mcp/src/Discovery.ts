import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Effect, Schema } from "effect";
import { SewedError } from "sewed";

/** Connection metadata written to disk while a live desktop MCP server is running. */
export const Discovery = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1)),
  version: Schema.String.check(Schema.isMinLength(1)),
  url: Schema.String.check(Schema.isMinLength(1)),
  token: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
  pid: Schema.Int.check(Schema.isGreaterThan(0)),
  startedAt: Schema.String.check(Schema.isMinLength(1)),
});
export type Discovery = typeof Discovery.Type;

/** Ready-to-use client configuration snippets for connecting an external agent. */
export interface ClientConfig {
  /** Command to register this live server with Claude Code over Streamable HTTP. */
  readonly claudeCode: string;
  /** Standard `mcpServers` JSON entry for Streamable HTTP clients. */
  readonly mcpJson: {
    readonly type: "http";
    readonly url: string;
    readonly headers?: { readonly Authorization: string };
  };
}

export const clientConfigOf = (
  name: string,
  url: string,
  token: string | undefined,
): ClientConfig => {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "-");
  const claudeCode =
    token === undefined
      ? `claude mcp add --transport http ${safeName} ${url}`
      : `claude mcp add --transport http ${safeName} ${url} --header "Authorization: Bearer ${token}"`;
  return {
    claudeCode,
    mcpJson:
      token === undefined
        ? { type: "http", url }
        : { type: "http", url, headers: { Authorization: `Bearer ${token}` } },
  };
};

export const generateToken = (): string => randomBytes(32).toString("hex");

const decodeDiscovery = Schema.decodeUnknownEffect(Discovery);

/** Reads and validates a running application's MCP discovery manifest. */
export const readDiscovery = (filePath: string): Effect.Effect<Discovery, SewedError> =>
  Effect.gen(function* () {
    const raw = yield* Effect.tryPromise({
      try: () => readFile(filePath, "utf8"),
      catch: (cause) =>
        new SewedError({
          code: "Startup",
          message: `Could not read MCP discovery file at ${filePath}`,
          cause,
        }),
    });
    const parsed: unknown = yield* Effect.try({
      try: () => JSON.parse(raw),
      catch: (cause) =>
        new SewedError({
          code: "Protocol",
          message: `Invalid JSON in MCP discovery file at ${filePath}`,
          cause,
        }),
    });
    return yield* decodeDiscovery(parsed).pipe(
      Effect.mapError(
        (cause) =>
          new SewedError({
            code: "Protocol",
            message: `Invalid MCP discovery manifest at ${filePath}`,
            cause,
          }),
      ),
    );
  });

/** Atomically writes a `0600` discovery manifest and returns a cleanup Effect. */
export const writeDiscovery = (
  filePath: string,
  manifest: Discovery,
): Effect.Effect<void, SewedError> =>
  Effect.tryPromise({
    try: async () => {
      const directory = path.dirname(filePath);
      await mkdir(directory, { recursive: true });
      const tempPath = `${filePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
      const content = `${JSON.stringify(manifest, null, 2)}\n`;
      await writeFile(tempPath, content, { encoding: "utf8", mode: 0o600 });
      try {
        await chmod(tempPath, 0o600);
      } catch {
        // chmod is a no-op on platforms without POSIX mode bits.
      }
      await rename(tempPath, filePath);
    },
    catch: (cause) =>
      new SewedError({
        code: "Startup",
        message: `Could not write MCP discovery file at ${filePath}`,
        cause,
      }),
  });

/** Removes a discovery manifest only if it still belongs to this server instance. */
export const removeDiscovery = (filePath: string, url: string): Effect.Effect<void> =>
  Effect.tryPromise({
    try: async () => {
      const raw = await readFile(filePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "url" in parsed &&
        parsed.url === url &&
        "pid" in parsed &&
        parsed.pid === process.pid
      ) {
        await rm(filePath, { force: true });
      }
    },
    catch: () => undefined,
  }).pipe(Effect.ignore);
