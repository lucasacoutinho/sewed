import { Effect, Schema } from "effect";
import type { Stream } from "effect";
import type * as NativeTheme from "../NativeTheme.ts";
import { SewedError } from "../SewedError.ts";

/**
 * The decoded form of `NativeTheme.Options`. That type is a plain interface, so nothing but a
 * check keeps this schema in step with it; `surfaces-types.ts` asserts the two agree in both
 * directions, and a field added to either side fails there.
 */
export const Options = Schema.Struct({ allowSetSource: Schema.optionalKey(Schema.Boolean) });
const decodeOptions = Schema.decodeUnknownSync(Options);

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

/**
 * The platform calls a theme capability makes once its options have allowed them. `native`
 * supplies Electron's `nativeTheme`; a test supplies its own. `R` is whatever that implementation
 * requires, so the policy above it stays free of any runtime requirement of its own.
 */
export interface Core<R> {
  readonly state: Stream.Stream<NativeTheme.State, SewedError, R>;
  readonly setSource: (source: NativeTheme.Source) => Effect.Effect<void, SewedError, R>;
}

/**
 * The theme operations a capability serves, each one already behind the options. The options gate
 * `setSource` without changing any signature, so this is the core's shape exactly. One declaration,
 * so the two cannot drift.
 */
export type Operations<R> = Core<R>;

/**
 * Reads the options once and returns operations that check them before the core runs. This is the
 * only place the theme's rules live, so the native Layer, a served renderer call, and the memory
 * Layer cannot drift apart. Invalid options fail here, while the Layer is building, rather than on
 * the first call. Observing is always allowed; only changing the source is gated.
 */
export const operations = <R>(
  options: NativeTheme.Options,
  core: Core<R>,
): Effect.Effect<Operations<R>, SewedError> =>
  Effect.map(
    Effect.try({
      try: () => decodeOptions(options),
      catch: (cause) =>
        cause instanceof SewedError ? cause : protocolError("Invalid native theme options", cause),
    }),
    (settings) => ({
      state: core.state,
      setSource: (source) =>
        settings.allowSetSource === true
          ? core.setSource(source)
          : Effect.fail(protocolError("This theme capability does not allow source changes")),
    }),
  );
