import { Context, Effect, Layer } from "effect";
import type { Rpc } from "effect/rpc";
import type { Capability, Operations } from "../Capability.ts";
import type { MainContext } from "../RuntimeContext.ts";

const closeSignals = new WeakMap<object, Effect.Effect<void, never, MainContext>>();

/**
 * Associates a capability's `Operations` object with its underlying owner's close signal so
 * `Capability.serve` closes the served `Binding.Owner` when that owner closes.
 */
export const attach = (
  operations: object,
  awaitClosed: Effect.Effect<void, never, MainContext>,
): void => {
  closeSignals.set(operations, awaitClosed);
};

export const signalOf = (operations: object): Effect.Effect<void, never, MainContext> | undefined =>
  closeSignals.get(operations);

/**
 * Attaches an optional owner close signal to the `Operations` value produced by a capability
 * Layer, preserving the Layer's error and service types.
 */
export const bindOwner = <Rpcs extends Rpc.Any, Key extends string, E, R>(
  capability: Capability<Rpcs, Key>,
  layer: Layer.Layer<Capability<Rpcs, Key>, E, R>,
  awaitClosed: Effect.Effect<void, never, MainContext> | undefined,
): Layer.Layer<Capability<Rpcs, Key>, E, R> =>
  awaitClosed === undefined
    ? layer
    : Layer.effect(
        capability,
        Effect.map(Layer.build(layer), (context) => {
          const operations: Operations<Rpcs> = Context.get(context, capability);
          attach(operations, awaitClosed);
          return operations;
        }),
      );
