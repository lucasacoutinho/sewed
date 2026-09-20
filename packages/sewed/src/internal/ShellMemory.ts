import { Effect, Layer } from "effect";
import type { SewedError } from "../SewedError.ts";
import * as Shell from "../Shell.ts";
import * as CapabilityMemory from "./CapabilityMemory.ts";
import * as ShellPolicy from "./ShellPolicy.ts";

export { Grants } from "../Shell.ts";

// A core that stands in for Electron. The policy above it is the very code the native Layer runs,
// so a test meets the rules a renderer would, on a machine with no desktop to open anything on.
const core: ShellPolicy.Core<never> = {
  openExternal: () => Effect.void,
  openPath: () => Effect.succeed({ opened: true, message: "" }),
  showItemInFolder: () => Effect.void,
  trashItem: () => Effect.void,
  beep: Effect.void,
};

/**
 * The shell capability for tests, and the scoped grant beside it: the same policy `Shell.native`
 * carries, no Electron, and a recorder listing the calls. Both services come from the one
 * `ShellPolicy.operations` call below, so a grant admitted here is honoured by the very operations
 * a bound test client calls, exactly as it is in production. An invalid policy or a relative root
 * still fails as the Layer builds.
 */
export const memory = (
  options: Shell.Options,
): Layer.Layer<typeof Shell.capability | Shell.Grants | CapabilityMemory.Recorder, SewedError> =>
  Layer.unwrap(
    Effect.map(ShellPolicy.operations(options, core), ({ operations, allow }) =>
      Layer.mergeAll(
        CapabilityMemory.memory(Shell.capability, (implement) =>
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
