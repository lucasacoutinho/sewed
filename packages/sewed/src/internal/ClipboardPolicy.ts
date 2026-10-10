import { Effect, Schema } from "effect";
import * as Clipboard from "../Clipboard.ts";
import type { SewedError } from "../SewedError.ts";
import { decoded, protocolError } from "./ProtocolError.ts";

const decodePolicy = Schema.decodeUnknownSync(Clipboard.Policy);
const decodeContent = Schema.decodeUnknownSync(Clipboard.Content);

/**
 * The platform calls a clipboard capability makes once its policy has allowed them. `native`
 * supplies Electron's `clipboard`; a test supplies its own. `R` is whatever that implementation
 * requires, so the policy above it stays free of any runtime requirement of its own.
 */
export interface Core<R> {
  readonly read: (
    format: Clipboard.Format,
  ) => Effect.Effect<Clipboard.Content | null, SewedError, R>;
  readonly write: (content: Clipboard.Content) => Effect.Effect<void, SewedError, R>;
  readonly formats: Effect.Effect<readonly Clipboard.Format[], SewedError, R>;
  readonly clear: Effect.Effect<void, SewedError, R>;
}

/**
 * The clipboard operations a capability serves, each one already behind the policy. The policy
 * denies formats and filters what `formats` reports without changing any signature, so this is the
 * core's shape exactly. One declaration, so the two cannot drift.
 */
export type Operations<R> = Core<R>;

/**
 * Decodes the policy once and returns operations that check every format before the core runs.
 * This is the only place the clipboard's rules live, so the native Layer, a served renderer call,
 * and the memory Layer cannot drift apart. `formats` reports only readable formats, and `clear`
 * needs some writable format. An invalid policy fails here, while the Layer is building, rather
 * than on the first call.
 */
export const operations = <R>(
  policy: Clipboard.Policy,
  core: Core<R>,
): Effect.Effect<Operations<R>, SewedError> =>
  Effect.map(
    decoded("Invalid clipboard policy", () => decodePolicy(policy)),
    (rules) => {
      const readable = new Set(rules.read);
      const writable = new Set(rules.write);
      const denied = (format: string) =>
        Effect.fail(protocolError(`Clipboard format ${format} is not allowed for this capability`));
      return {
        read: (format) => (readable.has(format) ? core.read(format) : denied(format)),
        write: (content) =>
          Effect.flatMap(
            decoded("Invalid clipboard content", () => decodeContent(content)),
            (value) => (writable.has(value.kind) ? core.write(value) : denied(value.kind)),
          ),
        formats: Effect.map(core.formats, (found) =>
          found.filter((format) => readable.has(format)),
        ),
        clear: writable.size > 0 ? core.clear : denied("clear"),
      };
    },
  );
