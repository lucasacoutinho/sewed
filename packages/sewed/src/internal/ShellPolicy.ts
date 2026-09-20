import path from "node:path";
import { Effect, Schema } from "effect";
import type { Scope } from "effect";
import * as Shell from "../Shell.ts";
import { SewedError } from "../SewedError.ts";
import * as UrlRule from "../UrlRule.ts";
import * as WebRequest from "../WebRequest.ts";
import * as StandardSchemes from "./StandardSchemes.ts";

const recipientParameters = new Set(["to", "cc", "bcc"]);

const decodedRecipient = (url: URL): string | undefined => {
  try {
    return decodeURIComponent(url.pathname).toLowerCase();
  } catch {
    return undefined;
  }
};

const mailto = (address: string) => {
  const expected = address.toLowerCase();
  return (url: URL): boolean =>
    url.protocol === "mailto:" &&
    ![...url.searchParams.keys()].some((name) => recipientParameters.has(name.toLowerCase())) &&
    decodedRecipient(url) === expected;
};

// A shell pattern is allowlisted rather than following `WebRequest.Pattern`'s open syntax: it hands
// the URL straight to the operating system, so `<all_urls>` and schemes such as `javascript:` or
// `data:` never compile, whatever the caller intended. `file` is excluded too: a pattern's path is
// matched against the URL as written, and the WHATWG URL parser normalizes a literal `..` but
// leaves a percent-encoded separator such as `..%2f` untouched, so `file:///tmp/*` would grant
// `file:///tmp/..%2f..%2fetc/passwd` at this glob even though it never leaves `/tmp` in appearance.
// Local files go through `openPath`/`showItemInFolder` with a configured root — a real path
// containment check — or an exact `document` rule, which compares one whole URL rather than
// matching a wildcard against it.
const shellSchemes = new Set(["*", "http", "https"]);

const pattern = (value: string): ((url: URL) => boolean) => {
  if (value === "<all_urls>")
    throw new TypeError("A shell policy names its schemes; <all_urls> grants every one");
  const colon = value.indexOf(":");
  if (colon < 0) throw new TypeError(`A shell pattern names a scheme before its colon: ${value}`);
  const scheme = value.slice(0, colon);
  if (!shellSchemes.has(scheme) && !StandardSchemes.has(scheme))
    throw new TypeError(
      `A shell pattern's scheme must be *, http, https, or registered standard: ${value}`,
    );
  return WebRequest.compilePattern(value);
};

/** Compiles a decoded shell policy into one predicate over the URLs `openExternal` receives. */
export const compile = (policy: Shell.Policy): ((url: URL) => boolean) => {
  const rules = policy.map((rule) =>
    typeof rule === "string"
      ? pattern(rule)
      : rule.kind === "mailto"
        ? mailto(rule.address)
        : UrlRule.compile(rule),
  );
  return (url) => rules.some((allows) => allows(url));
};

const decodePolicy = Schema.decodeUnknownSync(Shell.Policy);

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

/**
 * The platform calls a shell capability makes once its policy has allowed them. `native` supplies
 * Electron's `shell`; a test supplies its own. `R` is whatever that implementation requires, so the
 * policy above it stays free of any runtime requirement of its own.
 */
export interface Core<R> {
  readonly openExternal: (href: string) => Effect.Effect<void, SewedError, R>;
  readonly openPath: (target: string) => Effect.Effect<Shell.OpenResult, SewedError, R>;
  readonly showItemInFolder: (target: string) => Effect.Effect<void, SewedError, R>;
  readonly trashItem: (target: string) => Effect.Effect<void, SewedError, R>;
  readonly beep: Effect.Effect<void, SewedError, R>;
}

/**
 * The shell operations a capability serves, each one already behind the policy. The policy check
 * rejects a disallowed URL or path without changing any signature, so this is the core's shape
 * exactly. One declaration, so the two cannot drift.
 */
export type Operations<R> = Core<R>;

/**
 * What {@link operations} answers: the checked operations, plus `allow`, the same function
 * `Shell.Grants["Service"]` carries. Handing both out of one call means a Layer that builds
 * `operations` once can give the served capability and the grant service the identical containment
 * state, rather than two copies of it that could drift apart.
 */
export interface Granted<R> {
  readonly operations: Operations<R>;
  /**
   * Admits one absolute path — a file, or a directory and everything under it — for the caller's
   * scope, under the same containment rule a configured root already uses. A relative path fails
   * `Protocol` before anything is admitted. Two scopes admitting the same path are counted, so
   * closing one leaves the other's grant live; the path is withdrawn only once every admitting
   * scope has closed.
   */
  readonly allow: (path: string) => Effect.Effect<void, SewedError, Scope.Scope>;
}

/**
 * Compiles the options once and returns operations that check every URL and path — against the
 * static roots and every path a live grant has admitted — before the core runs, plus `allow` to
 * grant one more. This is the only place the shell's rules live, so the native Layer, a served
 * renderer call, the memory Layer, and a grant cannot drift apart. An invalid policy or a relative
 * root fails here, while the Layer is building, rather than on the first call.
 */
export const operations = <R>(
  options: Shell.Options,
  core: Core<R>,
): Effect.Effect<Granted<R>, SewedError> =>
  Effect.gen(function* () {
    const settings = yield* Effect.try({
      try: () => {
        const allows = compile(decodePolicy(options.policy));
        const roots = (options.paths ?? []).map((root) => {
          if (!path.isAbsolute(root))
            throw protocolError(`Shell path root must be absolute: ${root}`);
          return path.resolve(root);
        });
        return { allows, roots };
      },
      catch: (cause) =>
        cause instanceof SewedError ? cause : protocolError("Invalid shell policy", cause),
    });
    // A path a scope has granted, counted rather than deleted on first release: two scopes
    // granting the same path leave it admitted until both have closed.
    const granted = new Map<string, number>();
    const withinRoot = (resolved: string, root: string): boolean =>
      resolved === root || resolved.startsWith(root + path.sep);
    const allowedUrl = (raw: string) =>
      Effect.suspend(() => {
        const url = URL.parse(raw);
        if (url === null)
          return Effect.fail(protocolError(`URL is outside the shell policy: ${raw}`));
        // `shell.openExternal` hands the URL to the operating system, so credentials in it —
        // `https://trusted@evil.example/` reads as a login prompt for `trusted` — are refused
        // before any rule runs, whatever kind of rule would otherwise have allowed the URL.
        if (url.username !== "" || url.password !== "")
          return Effect.fail(protocolError(`URL carries credentials: ${raw}`));
        return settings.allows(url)
          ? Effect.succeed(url.href)
          : Effect.fail(protocolError(`URL is outside the shell policy: ${raw}`));
      });
    const allowedPath = (raw: string) =>
      Effect.suspend(() => {
        if (!path.isAbsolute(raw))
          return Effect.fail(protocolError(`Shell path must be absolute: ${raw}`));
        const resolved = path.resolve(raw);
        const admitted =
          settings.roots.some((root) => withinRoot(resolved, root)) ||
          [...granted.keys()].some((root) => withinRoot(resolved, root));
        return admitted
          ? Effect.succeed(resolved)
          : Effect.fail(protocolError(`Path is outside the shell policy: ${raw}`));
      });
    const allow = (raw: string): Effect.Effect<void, SewedError, Scope.Scope> =>
      Effect.suspend(() => {
        if (!path.isAbsolute(raw))
          return Effect.fail(protocolError(`Shell path must be absolute: ${raw}`));
        const resolved = path.resolve(raw);
        return Effect.acquireRelease(
          Effect.sync(() => {
            granted.set(resolved, (granted.get(resolved) ?? 0) + 1);
          }),
          () =>
            Effect.sync(() => {
              const count = granted.get(resolved);
              if (count === undefined) return;
              if (count <= 1) granted.delete(resolved);
              else granted.set(resolved, count - 1);
            }),
        );
      });
    return {
      operations: {
        openExternal: (url) => Effect.andThen(allowedUrl(url), (href) => core.openExternal(href)),
        openPath: (target) =>
          Effect.andThen(allowedPath(target), (resolved) => core.openPath(resolved)),
        showItemInFolder: (target) =>
          Effect.andThen(allowedPath(target), (resolved) => core.showItemInFolder(resolved)),
        trashItem: (target) =>
          Effect.andThen(allowedPath(target), (resolved) => core.trashItem(resolved)),
        beep: core.beep,
      },
      allow,
    };
  });
