import { nativeTheme } from "electron";
import { Effect, Layer, Queue, Schema, Stream } from "effect";
import * as Capability from "../Capability.ts";
import * as NativeTheme from "../NativeTheme.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as NativeThemePolicy from "./NativeThemePolicy.ts";

export { Source, State, capability, protocol } from "../NativeTheme.ts";
export type { Options } from "../NativeTheme.ts";

const decodeSource = Schema.decodeUnknownSync(NativeTheme.Source);

const read = (): NativeTheme.State => ({
  source: nativeTheme.themeSource,
  shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
  shouldUseHighContrastColors: nativeTheme.shouldUseHighContrastColors,
  shouldUseInvertedColorScheme: nativeTheme.shouldUseInvertedColorScheme,
  inForcedColorsMode: nativeTheme.inForcedColorsMode,
  prefersReducedTransparency: nativeTheme.prefersReducedTransparency,
  ...(process.platform === "darwin"
    ? { shouldDifferentiateWithoutColor: nativeTheme.shouldDifferentiateWithoutColor }
    : {}),
  ...(process.platform === "darwin" || process.platform === "win32"
    ? {
        shouldUseDarkColorsForSystemIntegratedUI:
          nativeTheme.shouldUseDarkColorsForSystemIntegratedUI,
      }
    : {}),
});

const operation = <A>(run: () => A): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: run,
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : new SewedError({ code: "Native", message: "Native theme operation failed", cause }),
    }),
  );

export const current: Effect.Effect<NativeTheme.State, SewedError, MainContext> = operation(read);

// Electron only emits "updated" when a derived flag changes, so source changes that keep the same
// colors would go unobserved; every observer also republishes after an explicit setSource.
const observers = new Set<() => void>();

export const setSource = (
  source: NativeTheme.Source,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    Effect.try({
      try: () => decodeSource(source),
      catch: (cause) =>
        new SewedError({ code: "Protocol", message: "Invalid theme source", cause }),
    }),
    (value) =>
      operation(() => {
        nativeTheme.themeSource = value;
        for (const publish of observers) publish();
      }),
  );

/** Replays the current theme and follows native updates; slow observers skip superseded states. */
export const state: Stream.Stream<NativeTheme.State, SewedError, MainContext> = Stream.callback<
  NativeTheme.State,
  SewedError,
  MainContext
>(
  (queue) =>
    Effect.gen(function* () {
      yield* MainContext;
      let last: string | undefined;
      const publish = () => {
        const state = read();
        const key = JSON.stringify(state);
        if (key === last) return;
        last = key;
        Queue.offerUnsafe(queue, state);
      };
      yield* Effect.acquireRelease(
        operation(() => {
          nativeTheme.on("updated", publish);
          observers.add(publish);
        }),
        () =>
          Effect.sync(() => {
            nativeTheme.off("updated", publish);
            observers.delete(publish);
          }),
      );
      publish();
    }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
  { bufferSize: 2, strategy: "sliding" },
);

// Electron only ever sees a source the options allowed.
const core: NativeThemePolicy.Core<MainContext> = { state, setSource };

/**
 * The theme capability for main. The options live in this Layer, not in a separate host, so
 * `Capability.serve(NativeTheme.capability)` gives a document exactly the rules a main-side call
 * obeys.
 */
export const native = (
  options: NativeTheme.Options = {},
): Layer.Layer<typeof NativeTheme.capability, SewedError, MainContext> =>
  Capability.fromHandlers(NativeTheme.capability, (implement) =>
    implement(
      Effect.map(NativeThemePolicy.operations(options, core), (operations) => ({
        state: () => operations.state,
        setSource: ({ source }) => operations.setSource(source),
      })),
    ),
  );
