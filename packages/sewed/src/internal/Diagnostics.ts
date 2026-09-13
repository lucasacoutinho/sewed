import { Context, Effect, Option } from "effect";
import type { Event } from "../Diagnostics.ts";
import { MainContext, RendererContext, WorkerContext, UtilityContext } from "../RuntimeContext.ts";

export class Sink extends Context.Service<
  Sink,
  { readonly emit: (event: Event) => void; readonly tracing?: boolean }
>()("sewed/Diagnostics") {}

export const sink = Effect.map(Effect.serviceOption(Sink), Option.getOrUndefined);

export class OwnerContext extends Context.Service<OwnerContext, { readonly id: string }>()(
  "sewed/DiagnosticOwner",
) {}

export const location = Effect.gen(function* () {
  const utility = yield* Effect.serviceOption(UtilityContext);
  const worker = yield* Effect.serviceOption(WorkerContext);
  const owner = yield* Effect.serviceOption(OwnerContext);
  if (Option.isSome(utility))
    return {
      runtime: "utility",
      threadId: 0,
      processId: utility.value.processId,
      runtimeId: Option.isSome(owner) ? owner.value.id : `utility:${utility.value.processId}`,
    } as const;
  if (Option.isSome(worker))
    return {
      runtime: "worker",
      threadId: worker.value.threadId,
      runtimeId: Option.isSome(owner) ? owner.value.id : `worker:${worker.value.threadId}`,
    } as const;
  if (Option.isSome(yield* Effect.serviceOption(RendererContext)))
    return {
      runtime: "renderer",
      threadId: 0,
      runtimeId: Option.isSome(owner) ? owner.value.id : "renderer",
    } as const;
  if (Option.isSome(yield* Effect.serviceOption(MainContext)))
    return { runtime: "main", threadId: 0, runtimeId: "main" } as const;
  return { runtime: "unknown", threadId: 0, runtimeId: "unknown" } as const;
});
