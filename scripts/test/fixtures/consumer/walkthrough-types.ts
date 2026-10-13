import { Context, Effect } from "effect";
import type { Scope } from "effect";
import { MainContext, RendererContext, SewedError } from "sewed";
import { BrowserWindow } from "sewed/main";
import { attempt } from "../src/shared/attempt.ts";
import type { Attempt } from "../src/shared/attempt.ts";
import { Rejected } from "./recovery-protocol.ts";

class Caller extends Context.Service<Caller, { readonly value: string }>()("guide/Caller") {}

const program = Effect.flatMap(Caller, ({ value }) => Effect.as(Effect.scope, value));
const observed = attempt(program);
const required: Effect.Effect<Attempt<string>, SewedError, Caller | Scope.Scope> = observed;
void required;

// @ts-expect-error Recovery cannot erase the caller's own service.
Effect.runPromise(Effect.scoped(observed));
// @ts-expect-error Providing the caller does not erase the program's scope.
Effect.runPromise(observed.pipe(Effect.provideService(Caller, { value: "caller" })));

const provided = observed.pipe(Effect.provideService(Caller, { value: "caller" }), Effect.scoped);
const executable: Effect.Effect<Attempt<string>, SewedError> = provided;
void executable;

declare const refused: Effect.Effect<string, Rejected, Caller>;
const refusedAttempt = attempt(refused);
// @ts-expect-error Recovery preserves application domain errors.
const withoutDomainError: Effect.Effect<Attempt<string>, SewedError, Caller> = refusedAttempt;
void withoutDomainError;

const native = attempt(BrowserWindow.make());
const main: Effect.Effect<
  Attempt<BrowserWindow.Handle>,
  SewedError,
  MainContext | Scope.Scope
> = native;
void main;
// @ts-expect-error Recovery cannot move a native operation into a renderer.
const renderer: Effect.Effect<
  Attempt<BrowserWindow.Handle>,
  SewedError,
  RendererContext | Scope.Scope
> = native;
void renderer;
