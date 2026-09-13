import path from "node:path";
import { shell } from "electron";
import { Effect, Schema } from "effect";
import type { Scope } from "effect";
import type { RpcGroup } from "effect/unstable/rpc";
import type { Owner } from "../Binding.ts";
import { host as hostOwner } from "../Host.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as Shell from "../Shell.ts";
import * as UrlRule from "../UrlRule.ts";

export { OpenResult, Policy, protocol } from "../Shell.ts";

const decodePolicy = Schema.decodeUnknownSync(Shell.Policy);

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });

export interface Options {
  /** Origins and documents `openExternal` may open. */
  readonly policy: Shell.Policy;
  /** Absolute directories whose contents `openPath`, `showItemInFolder`, and `trashItem` may touch. */
  readonly paths?: readonly string[];
}

export interface Handle {
  readonly openExternal: (url: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly openPath: (target: string) => Effect.Effect<Shell.OpenResult, SewedError, MainContext>;
  readonly showItemInFolder: (target: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly trashItem: (target: string) => Effect.Effect<void, SewedError, MainContext>;
  readonly beep: Effect.Effect<void, SewedError, MainContext>;
  readonly host: Effect.Effect<
    Owner<RpcGroup.Rpcs<typeof Shell.protocol>>,
    SewedError,
    MainContext | Scope.Scope
  >;
}

const operation = <A>(run: () => A): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: run,
      catch: (cause) =>
        cause instanceof SewedError ? cause : nativeError("Shell operation failed", cause),
    }),
  );

const asynchronous = <A>(run: () => Promise<A>): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.tryPromise({
      try: run,
      catch: (cause) =>
        cause instanceof SewedError ? cause : nativeError("Shell operation failed", cause),
    }),
  );

/** A shell handle carries its policy; every operation checks it before Electron runs. */
export const make = (options: Options): Effect.Effect<Handle, SewedError, MainContext> =>
  Effect.gen(function* () {
    yield* MainContext;
    const settings = yield* Effect.try({
      try: () => {
        const rules = decodePolicy(options.policy).map(UrlRule.compile);
        const roots = (options.paths ?? []).map((root) => {
          if (!path.isAbsolute(root))
            throw protocolError(`Shell path root must be absolute: ${root}`);
          return path.resolve(root);
        });
        return { rules, roots };
      },
      catch: (cause) =>
        cause instanceof SewedError ? cause : protocolError("Invalid shell policy", cause),
    });
    const allowedUrl = (raw: string) =>
      Effect.suspend(() => {
        const url = URL.parse(raw);
        return url !== null && settings.rules.some((allows) => allows(url))
          ? Effect.succeed(url.href)
          : Effect.fail(protocolError(`URL is outside the shell policy: ${raw}`));
      });
    const allowedPath = (raw: string) =>
      Effect.suspend(() => {
        if (!path.isAbsolute(raw))
          return Effect.fail(protocolError(`Shell path must be absolute: ${raw}`));
        const resolved = path.resolve(raw);
        return settings.roots.some(
          (root) => resolved === root || resolved.startsWith(root + path.sep),
        )
          ? Effect.succeed(resolved)
          : Effect.fail(protocolError(`Path is outside the shell policy: ${raw}`));
      });
    const handle: Handle = {
      openExternal: (url) =>
        Effect.andThen(allowedUrl(url), (href) => asynchronous(() => shell.openExternal(href))),
      openPath: (target) =>
        Effect.andThen(allowedPath(target), (resolved) =>
          Effect.map(
            asynchronous(() => shell.openPath(resolved)),
            (message) => ({ opened: message === "", message }),
          ),
        ),
      showItemInFolder: (target) =>
        Effect.andThen(allowedPath(target), (resolved) =>
          operation(() => {
            shell.showItemInFolder(resolved);
          }),
        ),
      trashItem: (target) =>
        Effect.andThen(allowedPath(target), (resolved) =>
          asynchronous(() => shell.trashItem(resolved)),
        ),
      beep: operation(() => {
        shell.beep();
      }),
      host: Effect.suspend(() =>
        hostOwner(
          Shell.protocol,
          Shell.protocol.toLayer({
            openExternal: ({ url }) => handle.openExternal(url),
            openPath: ({ path: target }) => handle.openPath(target),
            showItemInFolder: ({ path: target }) => handle.showItemInFolder(target),
            trashItem: ({ path: target }) => handle.trashItem(target),
          }),
        ),
      ),
    };
    return handle;
  });
