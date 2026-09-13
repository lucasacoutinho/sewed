import { app } from "electron";
import { Cause, Deferred, Effect, Queue, Schema, Stream } from "effect";
import type { Scope } from "effect";
import { MainContext, mainIdentity } from "./RuntimeContext.ts";
import { SewedError } from "./SewedError.ts";
import type * as Menu from "./Menu.ts";
import type * as Protocol from "./Protocol.ts";
import * as ApplicationMenu from "./internal/ApplicationMenu.ts";
import * as AppRuntime from "./internal/AppRuntime.ts";
import * as NativeProtocol from "./internal/Protocol.ts";
import type * as Launch from "./Launch.ts";

export interface Options {
  readonly quitOnLastWindowClosed?: boolean;
  readonly menu?: Menu.ApplicationOptions;
  readonly singleInstance?: { readonly additionalData?: typeof Schema.JsonObject.Type };
  readonly schemes?: readonly Protocol.Scheme[];
}

export const menuSelections = ApplicationMenu.selections;

export const launches: Stream.Stream<Launch.Request, SewedError, MainContext> = Stream.unwrap(
  Effect.gen(function* () {
    yield* MainContext;
    const owner = yield* Effect.serviceOption(AppRuntime.Owner);
    if (owner._tag === "None")
      return yield* Effect.fail(
        new SewedError({ code: "Closed", message: "No application launch owner is running" }),
      );
    return owner.value.launches;
  }),
);

export const guardQuit = <R>(
  decision: Effect.Effect<boolean, never, R>,
): Effect.Effect<void, SewedError, R | MainContext | Scope.Scope> =>
  Effect.gen(function* () {
    yield* MainContext;
    const owner = yield* Effect.serviceOption(AppRuntime.Owner);
    if (owner._tag === "None")
      return yield* Effect.fail(
        new SewedError({ code: "Closed", message: "No application quit owner is running" }),
      );
    yield* owner.value.gate.guard(decision);
  });

export interface Activation {
  readonly hasVisibleWindows: boolean;
}

export const activations: Stream.Stream<Activation, SewedError, MainContext> = Stream.callback<
  Activation,
  SewedError,
  MainContext
>(
  (queue) =>
    Effect.gen(function* () {
      yield* MainContext;
      const onActivate = (_event: Electron.Event, hasVisibleWindows: boolean) => {
        if (!Queue.offerUnsafe(queue, { hasVisibleWindows })) {
          Queue.failCauseUnsafe(
            queue,
            Cause.fail(
              new SewedError({ code: "Limit", message: "Application activation queue is full" }),
            ),
          );
        }
      };
      yield* Effect.acquireRelease(
        Effect.try({
          try: () => app.on("activate", onActivate),
          catch: (cause) =>
            new SewedError({
              code: "Native",
              message: "Could not observe application activations",
              cause,
            }),
        }),
        () =>
          Effect.sync(() => {
            app.off("activate", onActivate);
          }),
      );
    }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
  { bufferSize: 128 },
);

export const quit: Effect.Effect<void, SewedError, MainContext> = Effect.andThen(
  MainContext,
  Effect.try({
    try: () => app.quit(),
    catch: (cause) =>
      new SewedError({ code: "Native", message: "Could not request application quit", cause }),
  }),
);

export const run = <E>(
  setup: Effect.Effect<unknown, E, MainContext | Scope.Scope>,
  options: Options = {},
) => {
  const quitRequested = Deferred.makeUnsafe<void>();
  const requestShutdown = () => {
    Deferred.doneUnsafe(quitRequested, Effect.void);
  };
  const owner = AppRuntime.make(requestShutdown);
  const parentMessage = (message: unknown) => {
    if (message === "sewed:shutdown") requestShutdown();
  };
  let finished = false;
  const beforeQuit = (event: Electron.Event) => {
    if (finished) return;
    event.preventDefault();
    owner.gate.request();
  };
  const lastWindowClosed = () => {
    if (options.quitOnLastWindowClosed ?? process.platform !== "darwin") app.quit();
  };
  const openFile = (event: Electron.Event, path: string) => {
    event.preventDefault();
    owner.offer({ kind: "file", path });
  };
  const openUrl = (event: Electron.Event, url: string) => {
    event.preventDefault();
    owner.offer({ kind: "url", url });
  };
  const secondInstance = (
    _event: Electron.Event,
    args: string[],
    workingDirectory: string,
    additionalData: unknown,
  ) => {
    owner.offer({
      kind: "second-instance",
      arguments: args,
      workingDirectory,
      additionalData: additionalData ?? null,
    });
  };
  app.on("before-quit", beforeQuit);
  app.on("window-all-closed", lastWindowClosed);
  app.on("open-file", openFile);
  app.on("open-url", openUrl);
  app.on("second-instance", secondInstance);
  process.on("message", parentMessage);
  const admission = (() => {
    try {
      NativeProtocol.registerSchemes(options.schemes ?? []);
      owner.offer({
        kind: "initial",
        arguments: [...process.argv],
        workingDirectory: process.cwd(),
      });
      if (options.singleInstance === undefined)
        return { status: "primary", locked: false } as const;
      const data = Schema.decodeUnknownSync(Schema.JsonObject)(
        options.singleInstance.additionalData ?? {},
      );
      return app.requestSingleInstanceLock(data)
        ? ({ status: "primary", locked: true } as const)
        : ({ status: "secondary" } as const);
    } catch (cause) {
      return {
        status: "failed",
        error: new SewedError({
          code: "Startup",
          message: "Could not acquire application launch ownership",
          cause,
        }),
      } as const;
    }
  })();
  return Effect.runFork(
    Effect.scoped(
      Effect.gen(function* () {
        if (admission.status === "failed") return yield* Effect.fail(admission.error);
        if (admission.status === "secondary") return;
        yield* Effect.promise(() => app.whenReady());
        const menu =
          options.menu === undefined ? undefined : yield* ApplicationMenu.make(options.menu);
        const program =
          menu === undefined ? setup : Effect.provideService(setup, ApplicationMenu.Owner, menu);
        yield* Effect.andThen(program, Effect.never);
      }).pipe(Effect.raceFirst(Deferred.await(quitRequested))),
    ).pipe(
      Effect.provideService(AppRuntime.Owner, owner),
      Effect.provideService(MainContext, mainIdentity),
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          finished = true;
          app.off("before-quit", beforeQuit);
          app.off("window-all-closed", lastWindowClosed);
          app.off("open-file", openFile);
          app.off("open-url", openUrl);
          app.off("second-instance", secondInstance);
          process.off("message", parentMessage);
          yield* owner.close();
          if (admission.status === "primary" && admission.locked) app.releaseSingleInstanceLock();
          if (exit._tag === "Failure") {
            console.error(Cause.pretty(exit.cause));
            app.exit(1);
          } else if (admission.status === "secondary") app.exit(0);
          else app.quit();
        }),
      ),
    ),
  );
};
