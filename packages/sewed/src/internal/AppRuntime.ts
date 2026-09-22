import { Context, Schema } from "effect";
import * as Application from "../Application.ts";
import { App } from "../Decidables.ts";
import { Request } from "../Launch.ts";
import * as CloseGate from "./CloseGate.ts";
import * as Registry from "./DecisionRegistry.ts";
import * as LaunchQueue from "./LaunchQueue.ts";

const decode = Schema.decodeUnknownSync(Request);
// The one place that owns exit-code validity: `App.exit` decodes a caller's code against the same
// schema before it ever looks up a running owner (so an invalid code fails Protocol without
// touching the owner), and `exit` below checks the identical schema again, because it is reachable
// directly in tests that drive `AppRuntime` with no `App.exit` in front of it at all.
const isExitCode = Schema.is(Application.ExitCode);

export const make = (approveQuit: (code?: number) => boolean) => {
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
    /**
     * Requests the application's end with `code`, calling `approveQuit` directly — never through
     * `gate`, so `Decidables.App.Quit` is never consulted — and answers whether that request is the
     * one the application will exit with. An invalid code (not an integer, or outside 0-255) is
     * refused without asking, and `approveQuit` refuses once a shutdown is already in progress,
     * whichever door began it: one exit code wins, the first. The answer is what lets `App.exit`
     * fail typed instead of waiting for a shutdown it did not start — a wait that, from a finalizer
     * of the closing scope, would never end.
     */
    exit(code: number): boolean {
      return isExitCode(code) && approveQuit(code);
    },
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
