import { Schema } from "effect";

const Id = Schema.String.check(Schema.isMinLength(1));

/**
 * A HID device a page may be given. Carries what identifies a device to a person or a policy; the
 * report descriptors Electron also reports (`collections`) are not copied.
 */
export const Hid = Schema.Struct({
  deviceId: Schema.String,
  name: Schema.String,
  vendorId: Schema.Finite,
  productId: Schema.Finite,
  serialNumber: Schema.optionalKey(Schema.String),
  guid: Schema.optionalKey(Schema.String),
});
export type Hid = typeof Hid.Type;

/**
 * A USB device a page may be given. Carries what identifies a device to a person or a policy; the
 * configuration and interface descriptors Electron also reports are not copied.
 */
export const Usb = Schema.Struct({
  deviceId: Schema.String,
  vendorId: Schema.Finite,
  productId: Schema.Finite,
  deviceClass: Schema.Finite,
  deviceSubclass: Schema.Finite,
  deviceProtocol: Schema.Finite,
  productName: Schema.optionalKey(Schema.String),
  manufacturerName: Schema.optionalKey(Schema.String),
  serialNumber: Schema.optionalKey(Schema.String),
});
export type Usb = typeof Usb.Type;

/** A serial port a page may be given; Electron reports its USB ids as strings. */
export const SerialPort = Schema.Struct({
  portId: Schema.String,
  portName: Schema.String,
  displayName: Schema.optionalKey(Schema.String),
  vendorId: Schema.optionalKey(Schema.String),
  productId: Schema.optionalKey(Schema.String),
  serialNumber: Schema.optionalKey(Schema.String),
});
export type SerialPort = typeof SerialPort.Type;

/** A Bluetooth device found while a page's request is scanning. */
export const Bluetooth = Schema.Struct({ deviceId: Schema.String, deviceName: Schema.String });
export type Bluetooth = typeof Bluetooth.Type;

/** One discoverable WebAuthn credential; `credentialId` is URL-safe base64 without padding. */
export const WebAuthnAccount = Schema.Struct({
  credentialId: Schema.String,
  name: Schema.optionalKey(Schema.String),
  displayName: Schema.optionalKey(Schema.String),
  userHandle: Schema.optionalKey(Schema.String),
});
export type WebAuthnAccount = typeof WebAuthnAccount.Type;

/**
 * Who is asking. `origin` is `null` for a document with an opaque origin (`file:`, `data:`), and
 * both are `null` when the requesting frame is already gone — the same convention
 * `Decidables.Session.Permission` follows.
 */
const requester = {
  origin: Schema.NullOr(Schema.String),
  document: Schema.NullOr(Schema.String),
};

export const HidRequest = Schema.Struct({ ...requester, devices: Schema.Array(Hid) });
export type HidRequest = typeof HidRequest.Type;

export const UsbRequest = Schema.Struct({ ...requester, devices: Schema.Array(Usb) });
export type UsbRequest = typeof UsbRequest.Type;

export const SerialPortRequest = Schema.Struct({ ...requester, ports: Schema.Array(SerialPort) });
export type SerialPortRequest = typeof SerialPortRequest.Type;

export const BluetoothRequest = Schema.Struct({ ...requester, devices: Schema.Array(Bluetooth) });
export type BluetoothRequest = typeof BluetoothRequest.Type;

export const WebAuthnRequest = Schema.Struct({
  ...requester,
  relyingPartyId: Schema.String,
  accounts: Schema.Array(WebAuthnAccount),
});
export type WebAuthnRequest = typeof WebAuthnRequest.Type;

/**
 * What a chooser request receives: nothing, or the id of one of the entries it offered. An id the
 * request did not offer cancels it.
 */
export const Selection = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("cancel") }),
  Schema.Struct({ kind: Schema.Literal("select"), id: Id }),
]);
export type Selection = typeof Selection.Type;

/**
 * What a Bluetooth request receives each time its scan reports devices: `wait` keeps the request
 * scanning, so the next report asks again.
 */
export const BluetoothSelection = Schema.Union([
  ...Selection.members,
  Schema.Struct({ kind: Schema.Literal("wait") }),
]);
export type BluetoothSelection = typeof BluetoothSelection.Type;

/**
 * A Bluetooth pairing prompt. `confirm` asks whether to pair, `confirmPin` asks whether `pin`
 * matches the one the device shows, and `providePin` asks for the device's pin.
 */
export const Pairing = Schema.Struct({
  ...requester,
  deviceId: Schema.String,
  kind: Schema.Literals(["confirm", "confirmPin", "providePin"]),
  pin: Schema.optionalKey(Schema.String),
});
export type Pairing = typeof Pairing.Type;

/**
 * The answer to a pairing prompt. `confirm` answers `confirm` and `confirmPin`; `pin` answers
 * `providePin`. An answer of the wrong kind for its prompt cancels the pairing.
 */
export const PairingAnswer = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("cancel") }),
  Schema.Struct({ kind: Schema.Literal("confirm") }),
  Schema.Struct({ kind: Schema.Literal("pin"), pin: Id }),
]);
export type PairingAnswer = typeof PairingAnswer.Type;

/**
 * A device that appeared or went away while a chooser request is pending (`added`, `removed`), or
 * whose access a page gave up (`revoked`, which carries the origin when Electron reports one).
 */
export const Change = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("hid"),
    change: Schema.Literals(["added", "removed", "revoked"]),
    device: Hid,
    origin: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("usb"),
    change: Schema.Literals(["added", "removed", "revoked"]),
    device: Usb,
    origin: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("serial"),
    change: Schema.Literals(["added", "removed", "revoked"]),
    port: SerialPort,
    origin: Schema.NullOr(Schema.String),
  }),
]);
export type Change = typeof Change.Type;

/** A USB class Chromium can keep away from pages. */
export const UsbClass = Schema.Literals([
  "audio",
  "audio-video",
  "hid",
  "mass-storage",
  "smart-card",
  "video",
  "wireless",
]);
export type UsbClass = typeof UsbClass.Type;
