import { shell } from "electron";
import { Effect, Layer } from "effect";
import * as Capability from "../Capability.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as Shell from "../Shell.ts";
import * as ShellPolicy from "./ShellPolicy.ts";

export { OpenResult, Policy, capability, protocol } from "../Shell.ts";
export type { Options } from "../Shell.ts";

const nativeError = (cause: unknown) =>
  cause instanceof SewedError
    ? cause
    : new SewedError({ code: "Native", message: "Shell operation failed", cause });

const operation = <A>(run: () => A): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(MainContext, Effect.try({ try: run, catch: nativeError }));

const asynchronous = <A>(run: () => Promise<A>): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(MainContext, Effect.tryPromise({ try: run, catch: nativeError }));

// Electron only ever sees a URL the policy allowed and a path it resolved inside a configured root.
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
 * The shell capability for main. The policy lives in this Layer, not in a separate host, so
 * `Capability.serve(Shell.capability)` gives a document exactly the rules a main-side call obeys.
 */
export const native = (
  options: Shell.Options,
): Layer.Layer<typeof Shell.capability, SewedError, MainContext> =>
  Capability.fromHandlers(Shell.capability, (implement) =>
    implement(
      Effect.map(ShellPolicy.operations(options, core), (operations) => ({
        openExternal: ({ url }) => operations.openExternal(url),
        openPath: ({ path: target }) => operations.openPath(target),
        showItemInFolder: ({ path: target }) => operations.showItemInFolder(target),
        trashItem: ({ path: target }) => operations.trashItem(target),
        beep: () => operations.beep,
      })),
    ),
  );
