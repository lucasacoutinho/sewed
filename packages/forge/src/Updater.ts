import { app, autoUpdater } from "electron";
import { Effect, Schema, Stream, SubscriptionRef } from "effect";
import type { Scope } from "effect";
import { MainContext, SewedError } from "sewed";
import { Feed, GithubRepository, type State, feedUrl } from "./UpdaterSchema.ts";

export { Feed, GithubRepository, State, feedUrl } from "./UpdaterSchema.ts";

const decodeFeed = Schema.decodeUnknownSync(Feed);
const decodeRepository = Schema.decodeUnknownSync(GithubRepository);

/** The feed for the running application's platform, architecture, and version. */
export const githubFeed = (
  repository: GithubRepository,
): Effect.Effect<Feed, SewedError, MainContext> =>
  Effect.andThen(
    Effect.try({
      try: () => decodeRepository(repository),
      catch: (cause) =>
        new SewedError({ code: "Protocol", message: "Invalid GitHub repository", cause }),
    }),
    (value) =>
      Effect.andThen(MainContext, () =>
        Effect.try({
          try: () => ({ url: feedUrl(value, process.platform, process.arch, app.getVersion()) }),
          catch: (cause) =>
            new SewedError({
              code: "Native",
              message: "Could not read the application version",
              cause,
            }),
        }),
      ),
  );

export interface Handle {
  /** Replays the current state and follows the updater's events. */
  readonly state: Stream.Stream<State, SewedError, MainContext>;
  readonly current: Effect.Effect<State, SewedError, MainContext>;
  readonly check: Effect.Effect<void, SewedError, MainContext>;
  /** Restarts into the downloaded update; `Protocol` unless the state is downloaded. */
  readonly install: Effect.Effect<void, SewedError, MainContext>;
  readonly feed: Effect.Effect<string, SewedError, MainContext>;
}

const nativeError = (message: string, cause: unknown) =>
  new SewedError({ code: "Native", message, cause });
let active = false;

/**
 * Points Electron's updater at a feed for the scope's lifetime and observes it. One updater is
 * active at a time, and Linux has no updater, so `make` fails with `Native` there.
 */
export const make = (feed: Feed): Effect.Effect<Handle, SewedError, MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const settings = yield* Effect.try({
      try: () => decodeFeed(feed),
      catch: (cause) => new SewedError({ code: "Protocol", message: "Invalid update feed", cause }),
    });
    if (process.platform === "linux")
      return yield* Effect.fail(nativeError("Updates are unavailable on this platform", undefined));
    const state = yield* SubscriptionRef.make<State>({ status: "idle" });
    const set = (value: State) => {
      Effect.runSync(SubscriptionRef.set(state, value));
    };
    const listeners: readonly (readonly [string, (...args: never[]) => void])[] = [
      ["checking-for-update", () => set({ status: "checking" })],
      ["update-available", () => set({ status: "available" })],
      ["update-not-available", () => set({ status: "not-available" })],
      [
        "update-downloaded",
        (
          _event: unknown,
          releaseNotes: string,
          releaseName: string,
          releaseDate: Date,
          updateUrl: string,
        ) =>
          set({
            status: "downloaded",
            releaseName,
            releaseNotes,
            releaseDate: releaseDate.toISOString(),
            updateUrl,
          }),
      ],
      ["before-quit-for-update", () => set({ status: "installing" })],
      ["error", (error: Error) => set({ status: "error", message: error.message })],
    ];
    yield* Effect.acquireRelease(
      Effect.suspend(() =>
        active
          ? Effect.fail(new SewedError({ code: "Limit", message: "An updater is already active" }))
          : Effect.try({
              try: () => {
                for (const [name, listener] of listeners)
                  autoUpdater.on(name as "error", listener as () => void);
                autoUpdater.setFeedURL({
                  url: settings.url,
                  ...(settings.headers === undefined ? {} : { headers: { ...settings.headers } }),
                  ...(settings.serverType === undefined ? {} : { serverType: settings.serverType }),
                });
                active = true;
              },
              catch: (cause) => nativeError("Could not configure the updater", cause),
            }),
      ),
      () =>
        Effect.sync(() => {
          for (const [name, listener] of listeners)
            autoUpdater.off(name as "error", listener as () => void);
          active = false;
        }),
    );
    const operation = <A>(message: string, run: () => A) =>
      Effect.andThen(
        MainContext,
        Effect.try({
          try: run,
          catch: (cause) => (cause instanceof SewedError ? cause : nativeError(message, cause)),
        }),
      );
    return {
      state: Stream.unwrap(Effect.as(MainContext, SubscriptionRef.changes(state))),
      current: Effect.andThen(MainContext, SubscriptionRef.get(state)),
      check: operation("Could not check for updates", () => {
        autoUpdater.checkForUpdates();
      }),
      install: Effect.andThen(SubscriptionRef.get(state), (value) =>
        value.status === "downloaded"
          ? operation("Could not install the update", () => {
              autoUpdater.quitAndInstall();
            })
          : Effect.fail(
              new SewedError({ code: "Protocol", message: "No downloaded update to install" }),
            ),
      ),
      feed: operation("Could not read the update feed", () => autoUpdater.getFeedURL()),
    };
  });
