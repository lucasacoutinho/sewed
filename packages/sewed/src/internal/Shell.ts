import { shell } from "electron";
import { Effect, Layer } from "effect";
import * as Capability from "../Capability.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as Shell from "../Shell.ts";
import * as ShellPolicy from "./ShellPolicy.ts";

export { Grants, OpenResult, Policy, capability, protocol } from "../Shell.ts";
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
