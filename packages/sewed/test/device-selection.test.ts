import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Session } from "electron";
import { Deferred, Effect, Fiber, Stream } from "effect";
import type { Scope } from "effect";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import type * as Device from "../src/Device.ts";
import type { MainContext } from "../src/RuntimeContext.ts";
import * as Testing from "../src/Testing.ts";
import * as ContentsBluetooth from "../src/internal/ContentsBluetooth.ts";
import * as Registry from "../src/internal/DecisionRegistry.ts";
import * as DeviceSelection from "../src/internal/DeviceSelection.ts";
import * as Native from "../src/internal/Session.ts";
import * as SessionDevices from "../src/internal/SessionDevices.ts";

type PairingHandler = (
  details: Record<string, unknown>,
  callback: (response: unknown) => void,
) => void;
type ProtectedClassesHandler = (details: { protectedClasses: string[] }) => string[];

const hidDevice = { deviceId: "hid-1", name: "Pad", vendorId: 1, productId: 2, collections: [] };
const usbDevice = {
  deviceId: "usb-1",
  vendorId: 3,
  productId: 4,
  deviceClass: 0,
  deviceSubclass: 0,
  deviceProtocol: 0,
  productName: "Scale",
  configurations: [],
};
const port = { portId: "port-1", portName: "ttyUSB0", vendorId: "0403" };

/**
 * A structural session: `internal/Session.ts` reads these members at `fromNative`, and Electron's
 * own class is not loadable in Node. Chooser events are emitted the way Electron emits them, and
 * each helper resolves with what the library answered Electron.
 */
const fakeSession = () => {
  let pairing: PairingHandler | undefined;
  let protectedClasses: ProtectedClassesHandler | undefined;
  const emitter = Object.assign(new EventEmitter(), {
    setPermissionCheckHandler: () => {},
    setPermissionRequestHandler: () => {},
    setDevicePermissionHandler: () => {},
    setCertificateVerifyProc: () => {},
    setDisplayMediaRequestHandler: () => {},
    setBluetoothPairingHandler: (handler: PairingHandler | null) => {
      pairing = handler ?? undefined;
    },
    setUSBProtectedClassesHandler: (handler: ProtectedClassesHandler | null) => {
      protectedClasses = handler ?? undefined;
    },
  });
  const choose = (name: string, ...payload: unknown[]) => {
    const state = { prevented: false };
    const answer = new Promise<unknown[]>((resolve) => {
      emitter.emit(
        name,
        { preventDefault: () => (state.prevented = true) },
        ...payload,
        (...args: unknown[]) => resolve(args),
      );
    });
    return { state, answer };
  };
  return {
    // Test-only bridge: the library reads these members structurally.
    native: emitter as unknown as Session,
    emitter,
    choose,
    hasPairingHandler: () => pairing !== undefined,
    protectedClasses: () => protectedClasses,
    pair: (details: Record<string, unknown>) =>
      new Promise<unknown>((resolve) => {
        assert.ok(pairing !== undefined, "no pairing handler installed");
        pairing({ frame: null, ...details }, resolve);
      }),
  };
};

const inMain = <A, E>(program: Effect.Effect<A, E, MainContext | Scope.Scope>) =>
  Effect.scoped(program).pipe(Effect.provide(Testing.main));

const chooserEvents = [
  "select-hid-device",
  "select-usb-device",
  "select-serial-port",
  "select-webauthn-account",
] as const;

test("chooser listeners and the pairing handler exist only while a decider does", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const counts = () => chooserEvents.map((name) => fake.emitter.listenerCount(name));
  assert.deepEqual(counts(), [0, 0, 0, 0], "nothing listens at acquisition");
  assert.equal(fake.hasPairingHandler(), false);
  const cancel = Decision.async(() => Effect.succeed({ kind: "cancel" } as const));
  await Effect.runPromise(
    inMain(
      Effect.gen(function* () {
        yield* handle.decide(Decidables.Session.HidDevice, cancel);
        yield* handle.decide(Decidables.Session.UsbDevice, cancel);
        yield* handle.decide(Decidables.Session.SerialPort, cancel);
        yield* handle.decide(Decidables.Session.WebAuthnAccount, cancel);
        yield* handle.decide(Decidables.Session.BluetoothPairing, cancel);
        assert.deepEqual(counts(), [1, 1, 1, 1]);
        // macOS pairs by itself: Electron has no handler to set there.
        assert.equal(fake.hasPairingHandler(), process.platform !== "darwin");
      }),
    ),
  );
  assert.deepEqual(counts(), [0, 0, 0, 0], "closing the scope removes every listener");
  assert.equal(fake.hasPairingHandler(), false);
});

test("a HID decider sees the offered devices and its requester, and its choice reaches Electron", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const seen: Device.HidRequest[] = [];
  const result = await Effect.runPromise(
    inMain(
      Effect.gen(function* () {
        yield* handle.decide(
          Decidables.Session.HidDevice,
          Decision.async((event) => {
            seen.push(event);
            return Effect.succeed({ kind: "select", id: "hid-1" } as const);
          }),
        );
        const request = fake.choose("select-hid-device", {
          deviceList: [hidDevice],
          frame: { url: "https://example.com/pair?x=1" },
        });
        return { answer: yield* Effect.promise(() => request.answer), state: request.state };
      }),
    ),
  );
  assert.deepEqual(result.answer, ["hid-1"]);
  assert.equal(result.state.prevented, true, "the event's default is always prevented");
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.origin, "https://example.com");
  assert.equal(typeof seen[0]?.document, "string");
  assert.deepEqual(seen[0]?.devices, [
    { deviceId: "hid-1", name: "Pad", vendorId: 1, productId: 2 },
  ]);
});

test("an id the request did not offer, a failing decider, and no answer all cancel", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const ask = (decider: (event: Device.UsbRequest) => Effect.Effect<Device.Selection>) =>
    Effect.runPromise(
      inMain(
        Effect.gen(function* () {
          yield* handle.decide(Decidables.Session.UsbDevice, Decision.async(decider));
          return yield* Effect.promise(
            () => fake.choose("select-usb-device", { deviceList: [usbDevice], frame: null }).answer,
          );
        }),
      ),
    );
  assert.deepEqual(await ask(() => Effect.succeed({ kind: "select", id: "usb-9" } as const)), []);
  assert.deepEqual(await ask(() => Effect.die(new Error("usb decider boom"))), []);
  assert.deepEqual(await ask(() => Effect.succeed({ kind: "cancel" } as const)), []);
  assert.deepEqual(await ask(() => Effect.succeed({ kind: "select", id: "usb-1" } as const)), [
    "usb-1",
  ]);
});

test("a serial request names its web contents' document and cancels with an empty id", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const seen: Device.SerialPortRequest[] = [];
  const contents = { getURL: () => "file:///app/index.html" };
  const answers = await Effect.runPromise(
    inMain(
      Effect.gen(function* () {
        let next: Device.Selection = { kind: "cancel" };
        yield* handle.decide(
          Decidables.Session.SerialPort,
          Decision.async((event) => {
            seen.push(event);
            return Effect.succeed(next);
          }),
        );
        const first = yield* Effect.promise(
          () => fake.choose("select-serial-port", [port], contents).answer,
        );
        next = { kind: "select", id: "port-1" };
        const second = yield* Effect.promise(
          () => fake.choose("select-serial-port", [port], contents).answer,
        );
        return [first, second];
      }),
    ),
  );
  assert.deepEqual(answers, [[""], ["port-1"]]);
  assert.equal(seen[0]?.origin, null, 'an opaque origin is null, not the string "null"');
  assert.equal(typeof seen[0]?.document, "string");
  assert.deepEqual(seen[0]?.ports, [{ portId: "port-1", portName: "ttyUSB0", vendorId: "0403" }]);
});

test("a WebAuthn request carries its relying party, and a gone frame names nobody", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const seen: Device.WebAuthnRequest[] = [];
  const disposed = {
    get url(): string {
      throw new Error("Render frame was disposed");
    },
  };
  const answer = await Effect.runPromise(
    inMain(
      Effect.gen(function* () {
        yield* handle.decide(
          Decidables.Session.WebAuthnAccount,
          Decision.async((event) => {
            seen.push(event);
            return Effect.succeed({ kind: "select", id: "cred-2" } as const);
          }),
        );
        return yield* Effect.promise(
          () =>
            fake.choose("select-webauthn-account", {
              relyingPartyId: "example.com",
              accounts: [{ credentialId: "cred-1" }, { credentialId: "cred-2", name: "ada" }],
              frame: disposed,
            }).answer,
        );
      }),
    ),
  );
  assert.deepEqual(answer, ["cred-2"]);
  assert.deepEqual(seen[0], {
    origin: null,
    document: null,
    relyingPartyId: "example.com",
    accounts: [{ credentialId: "cred-1" }, { credentialId: "cred-2", name: "ada" }],
  });
});

test("a pairing answer of the wrong kind for its prompt cancels", () => {
  const response = DeviceSelection.pairingResponse;
  assert.deepEqual(response("confirm", { kind: "confirm" }), { confirmed: true });
  assert.deepEqual(response("confirmPin", { kind: "confirm" }), { confirmed: true });
  assert.deepEqual(response("providePin", { kind: "pin", pin: "0000" }), {
    confirmed: true,
    pin: "0000",
  });
  assert.deepEqual(response("providePin", { kind: "confirm" }), { confirmed: false });
  assert.deepEqual(response("confirm", { kind: "pin", pin: "0000" }), { confirmed: false });
  assert.deepEqual(response("confirmPin", { kind: "cancel" }), { confirmed: false });
});

test(
  "the pairing handler resolves the pairing decidable",
  { skip: process.platform === "darwin" },
  async () => {
    const fake = fakeSession();
    const handle = Native.fromNative(fake.native);
    const seen: Device.Pairing[] = [];
    const answer = await Effect.runPromise(
      inMain(
        Effect.gen(function* () {
          yield* handle.decide(
            Decidables.Session.BluetoothPairing,
            Decision.async((event) => {
              seen.push(event);
              return Effect.succeed({ kind: "confirm" } as const);
            }),
          );
          return yield* Effect.promise(() =>
            fake.pair({ deviceId: "bt-1", pairingKind: "confirmPin", pin: "123456" }),
          );
        }),
      ),
    );
    assert.deepEqual(answer, { confirmed: true });
    assert.deepEqual(seen, [
      { origin: null, document: null, deviceId: "bt-1", kind: "confirmPin", pin: "123456" },
    ]);
  },
);

test("device changes are observed while the stream runs", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const changes = await Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        Stream.runCollect(Stream.take(SessionDevices.deviceChanges(handle), 3)),
      );
      while (fake.emitter.listenerCount("hid-device-added") === 0) yield* Effect.yieldNow;
      fake.emitter.emit("hid-device-added", {}, { device: hidDevice, frame: null });
      fake.emitter.emit("serial-port-removed", {}, port, {
        getURL: () => "https://example.com/",
      });
      fake.emitter.emit(
        "usb-device-revoked",
        {},
        {
          device: usbDevice,
          origin: "https://example.com/",
        },
      );
      return yield* Fiber.join(fiber);
    }).pipe(Effect.provide(Testing.main)),
  );
  assert.deepEqual(
    [...changes].map((change) => [change.kind, change.change, change.origin]),
    [
      ["hid", "added", null],
      ["serial", "removed", "https://example.com"],
      ["usb", "revoked", "https://example.com"],
    ],
  );
  assert.equal(fake.emitter.listenerCount("hid-device-added"), 0, "the observer released");
});

test("USB protected classes install a fixed list, and null restores Chromium's", async () => {
  const fake = fakeSession();
  const handle = Native.fromNative(fake.native);
  const run = <A, E>(effect: Effect.Effect<A, E, MainContext>) =>
    Effect.runPromise(Effect.provide(effect, Testing.main));
  await run(SessionDevices.setUsbProtectedClasses(handle, ["hid", "video"]));
  assert.deepEqual(fake.protectedClasses()?.({ protectedClasses: ["audio"] }), ["hid", "video"]);
  await run(SessionDevices.setUsbProtectedClasses(handle, null));
  assert.equal(fake.protectedClasses(), undefined);
  const refused = await run(
    Effect.flip(
      // @ts-expect-error not a USB class
      SessionDevices.setUsbProtectedClasses(handle, ["printer"]),
    ),
  );
  assert.equal(refused.code, "Protocol");
});

const fakeContents = () => {
  const emitter = Object.assign(new EventEmitter(), { getURL: () => "https://example.com/" });
  const report = (devices: ReadonlyArray<Device.Bluetooth>) => {
    const state = { prevented: false, answers: [] as string[] };
    emitter.emit(
      "select-bluetooth-device",
      { preventDefault: () => (state.prevented = true) },
      devices,
      (id: string) => state.answers.push(id),
    );
    return state;
  };
  return { emitter, report };
};

/** Waits for a condition a forked resolution brings about, without betting on a duration. */
const until = (condition: () => boolean) =>
  Effect.promise(async () => {
    const deadline = Date.now() + 5_000;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error("condition was not reached");
      await new Promise<void>((resolve) => setTimeout(resolve, 2));
    }
  });

test("a Bluetooth scan asks again on each report, and a newer report supersedes an undecided one", async () => {
  const fake = fakeContents();
  const registry: Registry.Registry<"contents"> = Registry.make({
    owner: "contents",
    hooks: [
      ContentsBluetooth.hook(
        () => fake.emitter,
        () => registry,
      ),
    ],
  });
  const decide = Registry.decide(registry, { isClosed: () => false });
  const seen: number[] = [];
  let interrupted = 0;
  await Effect.runPromise(
    inMain(
      Effect.gen(function* () {
        const never = yield* Deferred.make<void>();
        yield* decide(
          Decidables.WebContents.BluetoothDevice,
          Decision.async((event): Effect.Effect<Device.BluetoothSelection> => {
            seen.push(event.devices.length);
            if (event.devices.length === 0) return Effect.succeed({ kind: "wait" } as const);
            if (event.devices.length === 1)
              return Deferred.await(never).pipe(
                Effect.as({ kind: "cancel" } as const),
                Effect.onInterrupt(() =>
                  Effect.sync(() => {
                    interrupted += 1;
                  }),
                ),
              );
            return Effect.succeed({ kind: "select", id: "bt-2" } as const);
          }),
        );
        assert.equal(fake.emitter.listenerCount("select-bluetooth-device"), 1);
        const empty = fake.report([]);
        yield* until(() => seen.length === 1);
        assert.equal(empty.prevented, true);
        assert.deepEqual(empty.answers, [], "wait leaves the request scanning");
        const one = fake.report([{ deviceId: "bt-1", deviceName: "One" }]);
        yield* until(() => seen.length === 2);
        const two = fake.report([
          { deviceId: "bt-1", deviceName: "One" },
          { deviceId: "bt-2", deviceName: "Two" },
        ]);
        yield* until(() => two.answers.length === 1 && interrupted === 1);
        assert.deepEqual(one.answers, [], "the superseded report is never answered");
        assert.deepEqual(two.answers, ["bt-2"]);
        assert.equal(interrupted, 1, "the undecided decider was interrupted");
        assert.deepEqual(seen, [0, 1, 2]);
      }),
    ),
  );
  assert.equal(fake.emitter.listenerCount("select-bluetooth-device"), 0);
});

test("a Bluetooth choice the report did not offer cancels with an empty id", async () => {
  const fake = fakeContents();
  const registry: Registry.Registry<"contents"> = Registry.make({
    owner: "contents",
    hooks: [
      ContentsBluetooth.hook(
        () => fake.emitter,
        () => registry,
      ),
    ],
  });
  const decide = Registry.decide(registry, { isClosed: () => false });
  await Effect.runPromise(
    inMain(
      Effect.gen(function* () {
        yield* decide(
          Decidables.WebContents.BluetoothDevice,
          Decision.async(() => Effect.succeed({ kind: "select", id: "bt-9" } as const)),
        );
        const report = fake.report([{ deviceId: "bt-1", deviceName: "One" }]);
        yield* until(() => report.answers.length === 1);
        assert.deepEqual(report.answers, [""]);
      }),
    ),
  );
});
