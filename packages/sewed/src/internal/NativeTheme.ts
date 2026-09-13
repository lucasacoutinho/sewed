import { nativeTheme } from "electron";
import { Effect, Queue, Schema, Stream } from "effect";
import type { Scope } from "effect";
import type { RpcGroup } from "effect/unstable/rpc";
import type { Owner } from "../Binding.ts";
import { host as hostOwner } from "../Host.ts";
import * as NativeTheme from "../NativeTheme.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";

export { Source, State, protocol } from "../NativeTheme.ts";

const decodeSource = Schema.decodeUnknownSync(NativeTheme.Source);

const read = (): NativeTheme.State => ({
  source: nativeTheme.themeSource,
  shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
  shouldUseHighContrastColors: nativeTheme.shouldUseHighContrastColors,
  shouldUseInvertedColorScheme: nativeTheme.shouldUseInvertedColorScheme,
  inForcedColorsMode: nativeTheme.inForcedColorsMode,
  prefersReducedTransparency: nativeTheme.prefersReducedTransparency,
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
      const publish = () => {
        Queue.offerUnsafe(queue, read());
      };
      yield* Effect.acquireRelease(
        operation(() => {
          nativeTheme.on("updated", publish);
        }),
        () =>
          Effect.sync(() => {
            nativeTheme.off("updated", publish);
          }),
      );
      publish();
    }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
  { bufferSize: 2, strategy: "sliding" },
);

export interface HostOptions {
  /** Whether bound clients may change the theme source; observing is always allowed. */
  readonly allowSetSource?: boolean;
}

export const host = (
  options: HostOptions = {},
): Effect.Effect<
  Owner<RpcGroup.Rpcs<typeof NativeTheme.protocol>>,
  SewedError,
  MainContext | Scope.Scope
> =>
  Effect.gen(function* () {
    yield* MainContext;
    return yield* hostOwner(
      NativeTheme.protocol,
      NativeTheme.protocol.toLayer({
        state: () => state,
        setSource: ({ source }) =>
          options.allowSetSource === true
            ? setSource(source)
            : Effect.fail(
                new SewedError({
                  code: "Protocol",
                  message: "This theme owner does not allow source changes",
                }),
              ),
      }),
    );
  });
