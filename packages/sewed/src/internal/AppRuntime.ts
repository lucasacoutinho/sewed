import { Context, Schema } from "effect";
import { App } from "../Decidables.ts";
import { Request } from "../Launch.ts";
import * as CloseGate from "./CloseGate.ts";
import * as Registry from "./DecisionRegistry.ts";
import * as LaunchQueue from "./LaunchQueue.ts";

const decode = Schema.decodeUnknownSync(Request);

export const make = (approveQuit: () => void) => {
  const registry = Registry.make({ owner: "app" });
  const queue = LaunchQueue.make("Application launch", decode);
  let closed = false;
  const gate = CloseGate.make(approveQuit, registry, App.Quit, {}, "allow");
  return {
    registry,
    gate,
    /** What `App.decide` reads through `Registry.decide`'s `Control`, so it refuses after this closes. */
    isClosed: () => closed,
    offer: queue.offer,
    launches: queue.launches,
    close() {
      closed = true;
      queue.end();
      return gate.close();
    },
  };
};

export class Owner extends Context.Service<Owner, ReturnType<typeof make>>()(
  "sewed/internal/AppRuntime",
) {}
