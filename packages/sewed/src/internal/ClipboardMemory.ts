import { Effect, Layer } from "effect";
import * as Clipboard from "../Clipboard.ts";
import type { SewedError } from "../SewedError.ts";
import * as CapabilityMemory from "./CapabilityMemory.ts";
import * as ClipboardPolicy from "./ClipboardPolicy.ts";

const present: readonly Clipboard.Format[] = ["text", "html", "image"];

// A core that stands in for Electron: a clipboard holding one piece of text, reporting three
// formats. The policy above it is the very code the native Layer runs, so a test meets the rules a
// renderer would, on a machine with no desktop clipboard to reach.
const core: ClipboardPolicy.Core<never> = {
  read: (format) => Effect.succeed(format === "text" ? { kind: "text", text: "sewed" } : null),
  write: () => Effect.void,
  formats: Effect.succeed(present),
  clear: Effect.void,
};

/**
 * The clipboard capability for tests: the same policy `Clipboard.native` carries, no Electron, and
 * a recorder listing the calls. An invalid policy still fails as the Layer builds.
 */
export const memory = (
  policy: Clipboard.Policy,
): Layer.Layer<typeof Clipboard.capability | CapabilityMemory.Recorder, SewedError> =>
  CapabilityMemory.memory(Clipboard.capability, (implement) =>
    implement(
      Effect.map(ClipboardPolicy.operations(policy, core), (operations) => ({
        read: ({ format }) => operations.read(format),
        write: ({ content }) => operations.write(content),
        formats: () => operations.formats,
        clear: () => operations.clear,
      })),
    ),
  );
