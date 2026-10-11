import type { Fiber } from "effect";
import * as Decidables from "../Decidables.ts";
import type * as Device from "../Device.ts";
import * as Registry from "./DecisionRegistry.ts";
import * as NativeAnswer from "./NativeAnswer.ts";
import { nobody, requesterOfContents } from "./Origin.ts";

type Listener = (
  event: { preventDefault(): void },
  devices: ReadonlyArray<Device.Bluetooth>,
  callback: (deviceId: string) => void,
) => void;

/** The structural subset of a web contents the Bluetooth chooser listens to. */
export interface Contents {
  on(event: "select-bluetooth-device", listener: Listener): unknown;
  off(event: "select-bluetooth-device", listener: Listener): unknown;
  getURL(): string;
}

/**
 * Resolves `Decidables.WebContents.BluetoothDevice` for a page's `navigator.bluetooth.requestDevice`,
 * while the decidable has a decider. Electron reports the devices a scan has found so far and
 * reports again as the list changes, until one report's callback is answered. Each report starts a
 * fresh resolution with its own list and interrupts the one before it, so a decider only ever
 * answers for the list it was shown: a picker waiting on a person is interrupted and asked again
 * when a device appears. `wait` leaves the request scanning, which is what Electron's own contract
 * calls not answering yet.
 *
 * `preventDefault` is unconditional: without it Electron selects the first device found. `contents`
 * and `registry` are thunks because a guest view's registry is built before its web contents
 * exists, and both exist by the time a decider can be installed.
 */
export const hook = (
  contents: () => Contents,
  registry: () => Registry.Resolver<"contents">,
): Registry.Hook => {
  let attached: Contents | undefined;
  let inFlight: Fiber.Fiber<void> | undefined;
  const listener: Listener = (event, devices, callback) => {
    event.preventDefault();
    inFlight?.interruptUnsafe();
    const offered = devices.map(({ deviceId, deviceName }) => ({ deviceId, deviceName }));
    const target = attached;
    inFlight = NativeAnswer.run({
      label: Decidables.WebContents.BluetoothDevice.key,
      resolution: registry().resolveAsync(Decidables.WebContents.BluetoothDevice, {
        ...(target === undefined ? nobody : requesterOfContents(target)),
        devices: offered,
      }),
      reply: (answer) => {
        if (answer.kind === "wait") return;
        callback(
          answer.kind === "select" && offered.some((device) => device.deviceId === answer.id)
            ? answer.id
            : "",
        );
      },
      failed: () => callback(""),
    });
  };
  return Registry.hook(Decidables.WebContents.BluetoothDevice, {
    attach: () => {
      attached = contents();
      attached.on("select-bluetooth-device", listener);
    },
    detach: () => {
      const target = attached;
      attached = undefined;
      target?.off("select-bluetooth-device", listener);
    },
  });
};
