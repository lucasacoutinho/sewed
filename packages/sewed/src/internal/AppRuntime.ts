import { Cause, Context, Effect, Queue, Schema, Stream } from "effect";
import { Request } from "../Launch.ts";
import { SewedError } from "../SewedError.ts";
import * as CloseGate from "./CloseGate.ts";

const decode = Schema.decodeUnknownSync(Request);

export const make = (approveQuit: () => void) => {
  const queue = Effect.runSync(
    Queue.make<Request, SewedError | Cause.Done>({ capacity: 128, strategy: "dropping" }),
  );
  const gate = CloseGate.make(approveQuit);
  let observing = false;
  let closed = false;
  return {
    gate,
    offer(value: unknown) {
      if (closed) return;
      try {
        const request = decode(value);
        if (Buffer.byteLength(JSON.stringify(request)) > 262144) {
          throw new SewedError({
            code: "Limit",
            message: "Application launch request exceeds 256 KiB",
          });
        }
        if (!Queue.offerUnsafe(queue, request)) {
          Queue.failCauseUnsafe(
            queue,
            Cause.fail(
              new SewedError({ code: "Limit", message: "Application launch queue is full" }),
            ),
          );
        }
      } catch (cause) {
        Queue.failCauseUnsafe(
          queue,
          Cause.fail(
            cause instanceof SewedError
              ? cause
              : new SewedError({
                  code: "Protocol",
                  message: "Invalid application launch request",
                  cause,
                }),
          ),
        );
      }
    },
    launches: Stream.unwrap(
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.suspend(() => {
            if (closed)
              return Effect.fail(
                new SewedError({ code: "Closed", message: "Application launch owner is closed" }),
              );
            if (observing)
              return Effect.fail(
                new SewedError({
                  code: "Limit",
                  message: "Application launches already have a consumer",
                }),
              );
            observing = true;
            return Effect.void;
          }),
          () =>
            Effect.sync(() => {
              observing = false;
            }),
        );
        return Stream.fromQueue(queue);
      }),
    ),
    close() {
      closed = true;
      Queue.endUnsafe(queue);
      return gate.close();
    },
  };
};

export class Owner extends Context.Service<Owner, ReturnType<typeof make>>()(
  "sewed/internal/AppRuntime",
) {}
