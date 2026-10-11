import { shell } from "electron";
import path from "node:path";
import { Effect, Layer, Schema } from "effect";
import * as Capability from "../Capability.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as Shell from "../Shell.ts";
import { only } from "./Platform.ts";
import * as ShellPolicy from "./ShellPolicy.ts";

export { Grants, OpenResult, Policy, Shortcut, capability, protocol } from "../Shell.ts";
export type { Options } from "../Shell.ts";

const nativeError = (cause: unknown) =>
  cause instanceof SewedError
    ? cause
    : new SewedError({ code: "Native", message: "Shell operation failed", cause });

const operation = <A>(run: () => A): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(MainContext, Effect.try({ try: run, catch: nativeError }));

const asynchronous = <A>(run: () => Promise<A>): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(MainContext, Effect.tryPromise({ try: run, catch: nativeError }));

// Electron only ever sees a URL the policy allowed and a path it resolved inside a configured root
// or a live grant.
const core: ShellPolicy.Core<MainContext> = {
  openExternal: (href) => asynchronous(() => shell.openExternal(href)),
  openPath: (target) =>
    Effect.map(
      asynchronous(() => shell.openPath(target)),
      (message) => ({ opened: message === "", message }),
    ),
  showItemInFolder: (target) =>
    operation(() => {
      shell.showItemInFolder(target);
    }),
  trashItem: (target) => asynchronous(() => shell.trashItem(target)),
  beep: operation(() => {
    shell.beep();
  }),
};

/**
 * The shell capability for main, and the scoped grant beside it. The policy lives in this Layer,
 * not in a separate host, so `Capability.serve(Shell.capability)` gives a document exactly the
 * rules a main-side call obeys — `Shell.Grants` carries no RPC of its own, so a served document has
 * no route to it. Both services come from the one `ShellPolicy.operations` call below, so a path
 * `Shell.Grants["allow"]` admits is the very root `allowedPath` already consults, not a second copy
 * of the containment rule.
 */
export const native = (
  options: Shell.Options,
): Layer.Layer<typeof Shell.capability | Shell.Grants, SewedError, MainContext> =>
  Layer.unwrap(
    Effect.map(ShellPolicy.operations(options, core), ({ operations, allow }) =>
      Layer.mergeAll(
        Capability.fromHandlers(Shell.capability, (implement) =>
          implement(
            Effect.succeed({
              openExternal: ({ url }) => operations.openExternal(url),
              openPath: ({ path: target }) => operations.openPath(target),
              showItemInFolder: ({ path: target }) => operations.showItemInFolder(target),
              trashItem: ({ path: target }) => operations.trashItem(target),
              beep: () => operations.beep,
            }),
          ),
        ),
        Layer.succeed(Shell.Grants, { allow }),
      ),
    ),
  );

const decodeShortcut = Schema.decodeUnknownSync(Shell.Shortcut);
const decodeMode = Schema.decodeUnknownSync(Schema.Literals(["create", "update", "replace"]));
const shortcutPath = (target: string): Effect.Effect<string, SewedError> =>
  Effect.try({
    try: () => {
      if (typeof target !== "string" || !path.isAbsolute(target) || !target.endsWith(".lnk"))
        throw new SewedError({
          code: "Protocol",
          message: "A shortcut path must be absolute and end in .lnk",
        });
      return target;
    },
    catch: nativeError,
  });

/**
 * Reads a Windows shortcut. Main-only and outside the shell policy, which governs what a document
 * may ask for: main names the path itself.
 */
export const readShortcutLink = (
  target: string,
): Effect.Effect<Shell.Shortcut, SewedError, MainContext> =>
  Effect.andThen(shortcutPath(target), (value) =>
    operation(() => {
      only(["win32"], "Shortcut links");
      const details = shell.readShortcutLink(value);
      return {
        target: details.target,
        ...(details.cwd === undefined ? {} : { cwd: details.cwd }),
        ...(details.args === undefined ? {} : { args: details.args }),
        ...(details.description === undefined ? {} : { description: details.description }),
        ...(details.icon === undefined ? {} : { icon: details.icon }),
        ...(details.iconIndex === undefined ? {} : { iconIndex: details.iconIndex }),
        ...(details.appUserModelId === undefined ? {} : { appUserModelId: details.appUserModelId }),
        ...(details.toastActivatorClsid === undefined
          ? {}
          : { toastActivatorClsid: details.toastActivatorClsid }),
      };
    }),
  );

/** Creates, updates or replaces a Windows shortcut; `create` is the default. */
export const writeShortcutLink = (
  target: string,
  shortcut: Shell.Shortcut,
  mode: "create" | "update" | "replace" = "create",
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    Effect.andThen(shortcutPath(target), (value) =>
      Effect.try({
        try: () => [value, decodeShortcut(shortcut), decodeMode(mode)] as const,
        catch: (cause) => new SewedError({ code: "Protocol", message: "Invalid shortcut", cause }),
      }),
    ),
    ([value, details, operationMode]) =>
      operation(() => {
        only(["win32"], "Shortcut links");
        if (!shell.writeShortcutLink(value, operationMode, { ...details }))
          throw new SewedError({ code: "Native", message: "Could not write the shortcut" });
      }),
  );
