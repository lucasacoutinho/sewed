import { Effect, Layer, Stream } from "effect";
import * as NativeTheme from "../NativeTheme.ts";
import type { SewedError } from "../SewedError.ts";
import * as CapabilityMemory from "./CapabilityMemory.ts";
import * as NativeThemePolicy from "./NativeThemePolicy.ts";

const system: NativeTheme.State = {
  source: "system",
  shouldUseDarkColors: false,
  shouldUseHighContrastColors: false,
  shouldUseInvertedColorScheme: false,
  inForcedColorsMode: false,
  prefersReducedTransparency: false,
};

// A core that stands in for Electron. The policy above it is the very code the native Layer runs,
// so a test meets the rules a renderer would, on a machine with no desktop to theme.
const core: NativeThemePolicy.Core<never> = {
  state: Stream.make(system),
  setSource: () => Effect.void,
};

/**
 * The theme capability for tests: the same options `NativeTheme.native` carries, no Electron, and
 * a recorder listing the calls. Invalid options still fail as the Layer builds.
 */
export const memory = (
  options: NativeTheme.Options = {},
): Layer.Layer<typeof NativeTheme.capability | CapabilityMemory.Recorder, SewedError> =>
  CapabilityMemory.memory(NativeTheme.capability, (implement) =>
    implement(
      Effect.map(NativeThemePolicy.operations(options, core), (operations) => ({
        state: () => operations.state,
        setSource: ({ source }) => operations.setSource(source),
      })),
    ),
  );
