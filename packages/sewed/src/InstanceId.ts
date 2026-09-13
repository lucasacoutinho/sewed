import * as Effect from "effect/Effect";

/**
 * @returns Hex-encoded instance ID (16 random bytes)
 */
export const generateInstanceId = () =>
  Effect.sync(() => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  });
