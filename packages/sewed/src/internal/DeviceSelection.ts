import type { Session } from "electron";
import type { Effect } from "effect";
import * as Decidables from "../Decidables.ts";
import type * as Device from "../Device.ts";
import * as Registry from "./DecisionRegistry.ts";
import * as NativeAnswer from "./NativeAnswer.ts";
import { requesterOfContents, requesterOfFrame } from "./Origin.ts";

export const hid = (device: Electron.HIDDevice): Device.Hid => ({
  deviceId: device.deviceId,
  name: device.name,
  vendorId: device.vendorId,
  productId: device.productId,
  ...(device.serialNumber === undefined ? {} : { serialNumber: device.serialNumber }),
  ...(device.guid === undefined ? {} : { guid: device.guid }),
});

export const usb = (device: Electron.USBDevice): Device.Usb => ({
  deviceId: device.deviceId,
  vendorId: device.vendorId,
  productId: device.productId,
  deviceClass: device.deviceClass,
  deviceSubclass: device.deviceSubclass,
  deviceProtocol: device.deviceProtocol,
  ...(device.productName === undefined ? {} : { productName: device.productName }),
  ...(device.manufacturerName === undefined ? {} : { manufacturerName: device.manufacturerName }),
  ...(device.serialNumber === undefined ? {} : { serialNumber: device.serialNumber }),
});

export const serialPort = (port: Electron.SerialPort): Device.SerialPort => ({
  portId: port.portId,
  portName: port.portName,
  ...(port.displayName === undefined ? {} : { displayName: port.displayName }),
  ...(port.vendorId === undefined ? {} : { vendorId: port.vendorId }),
  ...(port.productId === undefined ? {} : { productId: port.productId }),
  ...(port.serialNumber === undefined ? {} : { serialNumber: port.serialNumber }),
});

const account = (value: Electron.WebAuthnAccount): Device.WebAuthnAccount => ({
  credentialId: value.credentialId,
  ...(value.name === undefined ? {} : { name: value.name }),
  ...(value.displayName === undefined ? {} : { displayName: value.displayName }),
  ...(value.userHandle === undefined ? {} : { userHandle: value.userHandle }),
});

/**
 * Answers one chooser request. `preventDefault` comes first and unconditionally: the answer arrives
 * after this listener has returned, and Electron's own default for an unprevented chooser event is
 * not the same for every kind. The id a decider selects reaches Electron only if the request
 * offered it; anything else, and every failure, is `cancel`.
 */
const choose = (options: {
  readonly label: string;
  readonly event: Electron.Event;
  readonly resolution: Effect.Effect<Device.Selection>;
  readonly offered: ReadonlyArray<string>;
  readonly select: (id: string) => void;
  readonly cancel: () => void;
}): void => {
  options.event.preventDefault();
  NativeAnswer.run({
    label: options.label,
    resolution: options.resolution,
    reply: (answer) => {
      if (answer.kind === "select" && options.offered.includes(answer.id))
        options.select(answer.id);
      else options.cancel();
    },
    failed: options.cancel,
  });
};

/** What a pairing answer means to Electron; an answer of the wrong kind for its prompt cancels. */
export const pairingResponse = (
  kind: Device.Pairing["kind"],
  answer: Device.PairingAnswer,
): Electron.Response => {
  if (answer.kind === "pin" && kind === "providePin") return { confirmed: true, pin: answer.pin };
  if (answer.kind === "confirm" && kind !== "providePin") return { confirmed: true };
  return { confirmed: false };
};

/**
 * The native side of a session's chooser decidables and its restricted-path prompt: each listener
 * and the pairing handler exists only while its decidable has a decider, so a session nobody asked to choose devices for keeps
 * Electron's own behaviour, which is to cancel. `registry` is read when an event arrives, not when
 * the hooks are built, because the registry is built from them.
 */
export const hooks = (
  session: Session,
  registry: () => Registry.Resolver<"session">,
): ReadonlyArray<Registry.Hook> => {
  const onHid = (
    event: Electron.Event,
    details: Electron.SelectHidDeviceDetails,
    callback: (deviceId?: string | null) => void,
  ): void => {
    const devices = details.deviceList.map(hid);
    choose({
      label: Decidables.Session.HidDevice.key,
      event,
      resolution: registry().resolveAsync(Decidables.Session.HidDevice, {
        ...requesterOfFrame(details.frame),
        devices,
      }),
      offered: devices.map((device) => device.deviceId),
      select: callback,
      cancel: () => callback(),
    });
  };
  const onUsb = (
    event: Electron.Event,
    details: Electron.SelectUsbDeviceDetails,
    callback: (deviceId?: string) => void,
  ): void => {
    const devices = details.deviceList.map(usb);
    choose({
      label: Decidables.Session.UsbDevice.key,
      event,
      resolution: registry().resolveAsync(Decidables.Session.UsbDevice, {
        ...requesterOfFrame(details.frame),
        devices,
      }),
      offered: devices.map((device) => device.deviceId),
      select: callback,
      cancel: () => callback(),
    });
  };
  const onSerial = (
    event: Electron.Event,
    portList: ReadonlyArray<Electron.SerialPort>,
    contents: Electron.WebContents,
    callback: (portId: string) => void,
  ): void => {
    const ports = portList.map(serialPort);
    choose({
      label: Decidables.Session.SerialPort.key,
      event,
      resolution: registry().resolveAsync(Decidables.Session.SerialPort, {
        ...requesterOfContents(contents),
        ports,
      }),
      offered: ports.map((port) => port.portId),
      select: callback,
      cancel: () => callback(""),
    });
  };
  const onWebAuthn = (
    event: Electron.Event,
    details: Electron.SelectWebauthnAccountDetails,
    callback: (credentialId?: string | null) => void,
  ): void => {
    const accounts = details.accounts.map(account);
    choose({
      label: Decidables.Session.WebAuthnAccount.key,
      event,
      resolution: registry().resolveAsync(Decidables.Session.WebAuthnAccount, {
        ...requesterOfFrame(details.frame),
        relyingPartyId: details.relyingPartyId,
        accounts,
      }),
      offered: accounts.map((value) => value.credentialId),
      select: callback,
      cancel: () => callback(),
    });
  };
  const onPairing = (
    details: Electron.BluetoothPairingHandlerHandlerDetails,
    callback: (response: Electron.Response) => void,
  ): void => {
    NativeAnswer.run({
      label: Decidables.Session.BluetoothPairing.key,
      resolution: registry().resolveAsync(Decidables.Session.BluetoothPairing, {
        ...requesterOfFrame(details.frame),
        deviceId: details.deviceId,
        kind: details.pairingKind,
        ...(details.pin === undefined ? {} : { pin: details.pin }),
      }),
      reply: (answer) => callback(pairingResponse(details.pairingKind, answer)),
      failed: () => callback({ confirmed: false }),
    });
  };
  const onFileSystemAccess = (
    event: Electron.Event,
    details: Electron.FileSystemAccessRestrictedDetails,
    callback: (action: "allow" | "deny" | "tryAgain") => void,
  ): void => {
    event.preventDefault();
    NativeAnswer.run({
      label: Decidables.Session.FileSystemAccess.key,
      resolution: registry().resolveAsync(Decidables.Session.FileSystemAccess, {
        ...requesterOfFrame(details.frame),
        path: details.path,
        isDirectory: details.isDirectory,
      }),
      reply: callback,
      failed: () => callback("deny"),
    });
  };
  return [
    Registry.hook(Decidables.Session.FileSystemAccess, {
      attach: () => session.on("file-system-access-restricted", onFileSystemAccess),
      detach: () => session.off("file-system-access-restricted", onFileSystemAccess),
    }),
    Registry.hook(Decidables.Session.HidDevice, {
      attach: () => session.on("select-hid-device", onHid),
      detach: () => session.off("select-hid-device", onHid),
    }),
    Registry.hook(Decidables.Session.UsbDevice, {
      attach: () => session.on("select-usb-device", onUsb),
      detach: () => session.off("select-usb-device", onUsb),
    }),
    Registry.hook(Decidables.Session.SerialPort, {
      attach: () => session.on("select-serial-port", onSerial),
      detach: () => session.off("select-serial-port", onSerial),
    }),
    Registry.hook(Decidables.Session.WebAuthnAccount, {
      attach: () => session.on("select-webauthn-account", onWebAuthn),
      detach: () => session.off("select-webauthn-account", onWebAuthn),
    }),
    // macOS pairs by itself and Electron has no handler to set there; a decider installed on
    // macOS is simply never asked.
    Registry.hook(Decidables.Session.BluetoothPairing, {
      attach: () => {
        if (process.platform !== "darwin") session.setBluetoothPairingHandler(onPairing);
      },
      detach: () => {
        if (process.platform !== "darwin") session.setBluetoothPairingHandler(null);
      },
    }),
  ];
};
