import type { Effect, Schema, Scope, Stream } from "effect";
import type { Rpc, RpcGroup } from "effect/rpc";
import type { Binding, ClientContext, MainContext, SewedError } from "../lib/index.js";
import * as Worker from "../lib/WorkerHost.js";
import { Protocol, Rejected } from "./protocol.mjs";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type Rpcs = RpcGroup.Rpcs<typeof Protocol>;
type Client = Binding.Client<Rpcs>;

const dependencyEntry = Worker.entry<typeof import("./worker.mjs")>(
  new URL("./worker.mjs", import.meta.url),
  Protocol,
);
const consumerEntry = Worker.entry<typeof import("./dependency-consumer.mjs")>(
  new URL("./dependency-consumer.mjs", import.meta.url),
  Protocol,
);

export type FixtureContracts = [
  Assert<Equal<Schema.Schema.Type<typeof Rejected>, Rejected>>,
  Assert<Equal<Rejected["_tag"], "Rejected">>,
  Assert<Equal<ConstructorParameters<typeof Rejected>[0]["message"], string>>,
  Assert<Equal<Rpc.Payload<Rpc.ExtractTag<Rpcs, "info">>, void>>,
  Assert<Equal<Rpc.Error<Rpc.ExtractTag<Rpcs, "info">>, SewedError>>,
  Assert<Equal<Rpc.Error<Rpc.ExtractTag<Rpcs, "echo">>, SewedError>>,
  Assert<Equal<Rpc.Error<Rpc.ExtractTag<Rpcs, "wait">>, SewedError>>,
  Assert<Equal<Rpc.ErrorExit<Rpc.ExtractTag<Rpcs, "events">>, SewedError>>,
  Assert<Equal<Rpc.Error<Rpc.ExtractTag<Rpcs, "reject">>, Rejected | SewedError>>,
  Assert<Equal<Effect.Error<ReturnType<Client["reject"]>>, Rejected | SewedError>>,
  Assert<Equal<Effect.Services<ReturnType<Client["echo"]>>, ClientContext | Scope.Scope>>,
  Assert<Equal<Stream.Services<ReturnType<Client["events"]>>, ClientContext | Scope.Scope>>,
  Assert<Equal<Stream.Error<ReturnType<Client["events"]>>, SewedError>>,
  Assert<Equal<typeof dependencyEntry, Worker.Entry<Rpcs, never>>>,
  Assert<
    Equal<
      typeof consumerEntry,
      Worker.Entry<Rpcs, "sewed/binding/dependency" | "sewed/binding/main">
    >
  >,
  Assert<
    Equal<Effect.Services<ReturnType<typeof Worker.spawn<Rpcs, string>>>, MainContext | Scope.Scope>
  >,
];
