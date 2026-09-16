import { Effect, Layer, Stream } from "effect";
import * as Notification from "../Notification.ts";
import type { SewedError } from "../SewedError.ts";
import * as CapabilityMemory from "./CapabilityMemory.ts";
import * as NotificationPolicy from "./NotificationPolicy.ts";

const lifetime: readonly Notification.Event[] = [
  { kind: "shown" },
  { kind: "clicked" },
  { kind: "closed" },
];

// A core that stands in for Electron: one notification that is shown, clicked, and closed. The
// options check above it is the very code the native Layer runs, so a test meets the rules a
// renderer would, on a machine with no desktop to notify.
const core: NotificationPolicy.Core<never> = { show: () => Stream.fromIterable(lifetime) };

/**
 * The notification capability for tests: the same options check `Notification.native` carries, no
 * Electron, and a recorder listing the calls.
 */
export const memory = (): Layer.Layer<
  typeof Notification.capability | CapabilityMemory.Recorder,
  SewedError
> =>
  CapabilityMemory.memory(Notification.capability, (implement) =>
    implement(
      Effect.map(NotificationPolicy.operations(core), (operations) => ({
        show: (options) => operations.show(options),
      })),
    ),
  );
