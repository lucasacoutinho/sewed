import { Deferred, Effect, Layer } from "effect";
import * as Worker from "sewed/worker";
import { Rejected, RecoveryProtocol } from "./recovery-protocol.ts";
import { SewedError } from "sewed";

export default Worker.define(RecoveryProtocol, (implement) =>
  Layer.unwrap(
    Effect.gen(function* () {
      /** @type {Deferred.Deferred<number>} */
      const committed = yield* Deferred.make();
      let saved = 0;
      return implement({
        save: ({ value }) =>
          value === "reject"
            ? Effect.fail(new Rejected({ message: "Document is locked" }))
            : Effect.gen(function* () {
                saved++;
                yield* Deferred.succeed(committed, saved);
                if (value === "hold-after-save") return yield* Effect.never;
                if (value === "closed-after-save")
                  return yield* new SewedError({ code: "Closed", message: "Storage closed" });
                return saved;
              }),
        committed: () => Deferred.await(committed),
        count: () => Effect.sync(() => saved),
      });
    }),
  ),
);
