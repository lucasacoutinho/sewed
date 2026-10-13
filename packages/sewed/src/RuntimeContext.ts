import { Context } from "effect";
import type { Connection } from "./internal/Transport.ts";
import type { Effect, Scope } from "effect";
import type { SewedError } from "./SewedError.ts";

const runtimeIdentity: unique symbol = Symbol("sewed/RuntimeIdentity");
type Identity = { readonly [runtimeIdentity]: true };

export class MainContext extends Context.Service<MainContext, Identity>()("sewed/Main") {}
export class RendererContext extends Context.Service<RendererContext, Identity>()(
  "sewed/Renderer",
) {}
export class WorkerContext extends Context.Service<
  WorkerContext,
  Identity & {
    readonly threadId: number;
  }
>()("sewed/Worker") {}
export class UtilityContext extends Context.Service<
  UtilityContext,
  Identity & { readonly processId: number }
>()("sewed/Utility") {}
export class ClientContext extends Context.Service<
  ClientContext,
  {
    readonly identity: object;
    readonly bindings: Context.Context<never>;
    readonly owners: ReadonlyMap<string, string>;
    readonly isClosed: () => boolean;
  }
>()("sewed/Client") {}

export interface ConnectionFactory {
  readonly connect: Effect.Effect<Connection, SewedError, Scope.Scope>;
  readonly attach?: (connection: Connection) => Effect.Effect<void, SewedError, Scope.Scope>;
}

export const mainIdentity: MainContext["Service"] = { [runtimeIdentity]: true };
export const rendererIdentity: RendererContext["Service"] = { [runtimeIdentity]: true };
export const workerIdentity = (threadId: number): WorkerContext["Service"] => ({
  [runtimeIdentity]: true,
  threadId,
});
export const utilityIdentity = (processId: number): UtilityContext["Service"] => ({
  [runtimeIdentity]: true,
  processId,
});
