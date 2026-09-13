import { safeStorage } from "electron";
import { Effect, Redacted, Schema } from "effect";
import { MainContext } from "../RuntimeContext.ts";
import * as SafeStorage from "../SafeStorage.ts";
import { SewedError } from "../SewedError.ts";

export { Availability, Sealed } from "../SafeStorage.ts";

const decodeSealed = Schema.decodeUnknownSync(SafeStorage.Sealed);

const operation = <A>(run: () => A): Effect.Effect<A, SewedError, MainContext> =>
  Effect.andThen(
    MainContext,
    Effect.try({
      try: run,
      catch: (cause) =>
        cause instanceof SewedError
          ? cause
          : new SewedError({ code: "Native", message: "Safe storage operation failed", cause }),
    }),
  );

const backend = (): string =>
  process.platform === "linux" ? safeStorage.getSelectedStorageBackend() : process.platform;

const requireAvailable = () => {
  if (!safeStorage.isEncryptionAvailable())
    throw new SewedError({ code: "Native", message: "OS encryption is unavailable" });
};

/** Linux only: lets the in-memory `basic_text` backend serve encryption when no OS keyring exists; a no-op elsewhere. */
export const allowPlainText: Effect.Effect<void, SewedError, MainContext> = operation(() => {
  safeStorage.setUsePlainTextEncryption(true);
});

export const availability: Effect.Effect<SafeStorage.Availability, SewedError, MainContext> =
  operation(() => ({ available: safeStorage.isEncryptionAvailable(), backend: backend() }));

/** Encrypts with the OS keystore; the plaintext never leaves its `Redacted` wrapper except here. */
export const encrypt = (
  value: Redacted.Redacted<string>,
): Effect.Effect<SafeStorage.Sealed, SewedError, MainContext> =>
  operation(() => {
    requireAvailable();
    const bytes = safeStorage.encryptString(Redacted.value(value));
    return { version: 1 as const, backend: backend(), bytes: new Uint8Array(bytes) };
  });

export const decrypt = (
  sealed: SafeStorage.Sealed,
): Effect.Effect<Redacted.Redacted<string>, SewedError, MainContext> =>
  Effect.andThen(
    Effect.try({
      try: () => decodeSealed(sealed),
      catch: (cause) =>
        new SewedError({ code: "Protocol", message: "Invalid sealed value", cause }),
    }),
    (value) =>
      operation(() => {
        requireAvailable();
        return Redacted.make(safeStorage.decryptString(Buffer.from(value.bytes)));
      }),
  );
