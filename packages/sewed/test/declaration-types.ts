import { Effect } from "effect";
import type { Scope } from "effect";
import { MainContext, RendererContext, SewedError } from "sewed";
import { App, CommandLine, Declaration, Gpu, Paths, Protocol } from "sewed/main";

declare const program: Effect.Effect<void, SewedError, MainContext | Scope.Scope>;
declare const scheme: Protocol.Scheme;

// One signature: the declarations, then the program. Nothing to declare is an empty list.
App.run([], program);
App.run(
  [
    Protocol.declare(scheme, scheme),
    CommandLine.declare({ name: "lang", value: "en" }),
    CommandLine.declare({ name: "enable-logging" }),
    Paths.declare({ sessionData: "/tmp/session", crashDumps: "/tmp/crashes" }),
    Gpu.declare({ acceleration: false }),
    App.declare({ userModelId: "dev.sewed.app" }),
    Declaration.make("sandbox", () => {}),
    () => Paths.declare({ userData: "/tmp/data" }),
  ],
  program,
);
const value: Declaration.Declaration = Gpu.declare({ acceleration: true });
const thunk: Declaration.Entry = () => value;
// @ts-expect-error the program is the second argument; the first is the declaration list.
App.run(program);
// @ts-expect-error the options object is gone; each option is a declaration now.
App.run(program, { schemes: [scheme] });
// @ts-expect-error a thunk yields one declaration, not a list.
App.run([() => [value]], program);
Effect.gen(function* () {
  // @ts-expect-error a declaration is not an Effect and cannot be yielded.
  yield* Gpu.declare({ acceleration: true });
});
// @ts-expect-error a path name outside Application.PathName is refused at compile time.
Paths.declare({ cache: "/tmp/cache" });
// @ts-expect-error a switch name has a fixed pattern, but its value is a string.
CommandLine.declare({ name: "lang", value: 1 });
// @ts-expect-error App.Startup is gone; Declaration.make is what it was.
const step: App.Startup = { name: "x", apply: () => {} };
// @ts-expect-error App.Options is gone.
const options: App.Options = {};
// @ts-expect-error a program that needs a renderer's context cannot be run by main.
App.run([], Effect.andThen(RendererContext, Effect.void));
void thunk;
void step;
void options;
