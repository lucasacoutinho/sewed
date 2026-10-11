import { SewedError } from "../SewedError.ts";

export type Platform = "darwin" | "win32" | "linux";
const names: Record<Platform, string> = { darwin: "macOS", win32: "Windows", linux: "Linux" };

/**
 * Throws `Native` on a platform Electron does not implement a member for, so the member fails
 * there instead of pretending to succeed. Call it after decoding, so invalid input is still
 * `Protocol` everywhere.
 */
export const only = (platforms: ReadonlyArray<Platform>, what: string): void => {
  if (platforms.some((platform) => platform === process.platform)) return;
  throw new SewedError({
    code: "Native",
    message: `${what} is available only on ${platforms.map((platform) => names[platform]).join(" and ")}`,
  });
};
