import { app, protocol } from "electron";
import * as Declaration from "../Declaration.ts";
import * as Protocol from "../Protocol.ts";
import { SewedError } from "../SewedError.ts";
import { protocolError, validateScheme } from "./Protocol.ts";
import * as StandardSchemes from "./StandardSchemes.ts";

/**
 * `declare`'s own registration step: the one piece of `Protocol` that touches Electron's `app`/
 * `protocol` values at module scope. Kept apart from `internal/Protocol.ts` (`serve`, `handle`,
 * `serveWeb`, `handleWeb`, scheme validation) so that module stays importable under plain Node —
 * this one imports back from it (`validateScheme`, `protocolError`), never the reverse, and
 * `ProtocolMain.ts` is the only file that combines both into `sewed/main`'s own `Protocol`.
 */
const startupError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Startup", message, ...(cause === undefined ? {} : { cause }) });

const nativePrivileges = (value: Protocol.Privileges): Electron.Privileges => {
  const privileges: Electron.Privileges = {};
  if (value.standard !== undefined) privileges.standard = value.standard;
  if (value.secure !== undefined) privileges.secure = value.secure;
  if (value.supportFetchAPI !== undefined) privileges.supportFetchAPI = value.supportFetchAPI;
  if (value.corsEnabled !== undefined) privileges.corsEnabled = value.corsEnabled;
  if (value.stream !== undefined) privileges.stream = value.stream;
  if (value.serviceWorkers !== undefined) privileges.allowServiceWorkers = value.serviceWorkers;
  if (value.codeCache !== undefined) privileges.codeCache = value.codeCache;
  return privileges;
};

let schemeRegistrationAttempted = false;

/** Registers all privileged schemes before Electron emits `ready`. */
const registerSchemes = (values: readonly Protocol.Scheme[]): void => {
  if (values.length === 0) return;
  if (schemeRegistrationAttempted) {
    throw startupError("Privileged protocol schemes can only be registered once");
  }
  const seen = new Set<string>();
  const standard: string[] = [];
  const customSchemes = values.map((value) => {
    const details = validateScheme(value);
    if (seen.has(details.name)) {
      throw protocolError(`Duplicate protocol scheme: ${details.name}`);
    }
    seen.add(details.name);
    if (details.privileges.standard === true) standard.push(details.name);
    return { scheme: details.name, privileges: nativePrivileges(details.privileges) };
  });
  if (app.isReady())
    throw startupError("Privileged protocol schemes must be registered before ready");
  schemeRegistrationAttempted = true;
  try {
    protocol.registerSchemesAsPrivileged(customSchemes);
  } catch (cause) {
    throw startupError("Could not register privileged protocol schemes", cause);
  }
  StandardSchemes.register(standard);
};

/**
 * Declares privileged schemes, registered in one call before readiness. Electron accepts that
 * call once per process, so one declaration carries every scheme and a second in the same list
 * fails `Startup`.
 */
export const declare = (...schemes: readonly Protocol.Scheme[]): Declaration.Declaration =>
  Declaration.make("privileged protocol schemes", () => registerSchemes(schemes));
