import { Effect, Schema } from "effect";
import type { Stream } from "effect";
import * as Device from "../Device.ts";
import type { MainContext } from "../RuntimeContext.ts";
import type { SewedError } from "../SewedError.ts";
import * as DeviceSelection from "./DeviceSelection.ts";
import * as Observation from "./Observation.ts";
import { originOfRaw, requesterOfContents, requesterOfFrame } from "./Origin.ts";
import { decoded } from "./ProtocolError.ts";
import type { Handle } from "./Session.ts";
import { resolve } from "./Session.ts";
import { operation } from "./SessionSettings.ts";

type Framed<D> = { readonly device: D; readonly frame: { readonly url: string } | null };
type Revoked<D> = { readonly device: D; readonly origin?: string };

/**
 * HID, USB and serial devices that appear or go away while a chooser request is pending, and
 * devices whose access a page gave up. Each observer owns its native listeners.
 */
export const deviceChanges = (
  handle: Handle,
): Stream.Stream<Device.Change, SewedError, MainContext> =>
  Observation.fromEmitter<Device.Change>("Device", () => resolve(handle), [
    ...(["added", "removed"] as const).flatMap((change) => [
      [
        `hid-device-${change}`,
        (_event: unknown, details: Framed<Electron.HIDDevice>): Device.Change => ({
          kind: "hid",
          change,
          device: DeviceSelection.hid(details.device),
          origin: requesterOfFrame(details.frame).origin,
        }),
      ] as const,
      [
        `usb-device-${change}`,
        (
          _event: unknown,
          device: Electron.USBDevice,
          contents: Electron.WebContents,
        ): Device.Change => ({
          kind: "usb",
          change,
          device: DeviceSelection.usb(device),
          origin: requesterOfContents(contents).origin,
        }),
      ] as const,
      [
        `serial-port-${change}`,
        (
          _event: unknown,
          port: Electron.SerialPort,
          contents: Electron.WebContents,
        ): Device.Change => ({
          kind: "serial",
          change,
          port: DeviceSelection.serialPort(port),
          origin: requesterOfContents(contents).origin,
        }),
      ] as const,
    ]),
    [
      "hid-device-revoked",
      (_event: unknown, details: Revoked<Electron.HIDDevice>): Device.Change => ({
        kind: "hid",
        change: "revoked",
        device: DeviceSelection.hid(details.device),
        origin: originOfRaw(details.origin),
      }),
    ],
    [
      "usb-device-revoked",
      (_event: unknown, details: Revoked<Electron.USBDevice>): Device.Change => ({
        kind: "usb",
        change: "revoked",
        device: DeviceSelection.usb(details.device),
        origin: originOfRaw(details.origin),
      }),
    ],
    [
      "serial-port-revoked",
      (_event: unknown, details: Electron.SerialPortRevokedDetails): Device.Change => ({
        kind: "serial",
        change: "revoked",
        port: DeviceSelection.serialPort(details.port),
        origin: originOfRaw(details.origin),
      }),
    ],
  ]);

const decodeClasses = Schema.decodeUnknownSync(Schema.NullOr(Schema.Array(Device.UsbClass)));

/**
 * Sets which USB classes pages cannot reach. An empty list protects none; `null` restores
 * Chromium's own list.
 */
export const setUsbProtectedClasses = (
  handle: Handle,
  classes: ReadonlyArray<Device.UsbClass> | null,
): Effect.Effect<void, SewedError, MainContext> =>
  Effect.andThen(
    decoded("Invalid USB protected classes", () => decodeClasses(classes)),
    (value) =>
      operation(handle, "Could not set USB protected classes", (native) => {
        native.setUSBProtectedClassesHandler(value === null ? null : () => [...value]);
      }),
  );
