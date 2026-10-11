import { SewedError } from "../SewedError.ts";

/** A platform Electron tags a member with; `mas` is a Mac App Store build. */
export type Platform = "darwin" | "win32" | "linux" | "mas";
const names: Record<Platform, string> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
  mas: "the Mac App Store build",
};
const here = (platform: Platform): boolean =>
  platform === "mas" ? process.mas === true : process.platform === platform;

/**
 * Throws `Native` on a platform Electron does not implement a member for, so the member fails
 * there instead of pretending to succeed. Call it after decoding, so invalid input is still
 * `Protocol` everywhere.
 */
export const only = (platforms: ReadonlyArray<Platform>, what: string): void => {
  if (platforms.some(here)) return;
  throw new SewedError({
    code: "Native",
    message: `${what} is available only on ${platforms.map((platform) => names[platform]).join(" and ")}`,
  });
};
