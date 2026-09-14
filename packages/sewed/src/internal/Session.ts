import type { Session } from "electron";
import { Schema } from "effect";
import * as Certificate from "../Certificate.ts";
import * as Permission from "../Permission.ts";
import * as UrlRule from "../UrlRule.ts";

const sessionHandle: unique symbol = Symbol("sewed/SessionHandle");

export interface Handle {
  readonly [sessionHandle]: true;
}

interface Rule {
  readonly matches: (url: URL) => boolean;
  readonly permissions: ReadonlySet<string>;
}
interface CertificateRule {
  readonly matches: (hostname: string) => boolean;
  readonly trust: Certificate.Trust;
}
interface State {
  readonly native: Session;
  rules: readonly Rule[];
  certificates: readonly CertificateRule[];
  preconnect: boolean;
}
const handles = new WeakMap<Session, Handle>();
const sessions = new WeakMap<Handle, State>();
const decodePolicy = Schema.decodeUnknownSync(Permission.Policy);
const decodeCertificatePolicy = Schema.decodeUnknownSync(Certificate.Policy);

/** Device access follows the same origin rules as browser permissions; the origin is the requester. */
const deviceAllowed = (state: State, details: Electron.DevicePermissionHandlerHandlerDetails) => {
  const origin = URL.parse(details.origin);
  return (
    origin !== null &&
    state.rules.some((rule) => rule.permissions.has(details.deviceType) && rule.matches(origin))
  );
};

const allowed = (
  state: State,
  contents: Electron.WebContents | null,
  permission: string,
  details: Electron.PermissionCheckHandlerHandlerDetails,
  origin?: string,
): boolean => {
  if (!contents || contents.isDestroyed() || !details.isMainFrame) return false;
  try {
    const current = new URL(contents.getURL());
    const requesting = new URL(details.requestingUrl ?? current.href);
    if (UrlRule.documentKey(current) !== UrlRule.documentKey(requesting)) return false;
    if (origin !== undefined && UrlRule.originOf(new URL(origin)) !== UrlRule.originOf(current))
      return false;
    return state.rules.some((rule) => rule.permissions.has(permission) && rule.matches(requesting));
  } catch {
    return false;
  }
};

export const fromNative = (session: Session): Handle => {
  const existing = handles.get(session);
  if (existing !== undefined) return existing;
  const handle = Object.freeze<Handle>({ [sessionHandle]: true });
  const state: State = { native: session, rules: [], certificates: [], preconnect: true };
  session.setPermissionCheckHandler((contents, permission, origin, details) =>
    allowed(state, contents, permission, details, origin),
  );
  session.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(allowed(state, contents, permission, details)),
  );
  session.setDevicePermissionHandler((details) => deviceAllowed(state, details));
  session.on("preconnect", (event) => {
    if (!state.preconnect) event.preventDefault();
  });
  handles.set(session, handle);
  sessions.set(handle, state);
  return handle;
};

const stateOf = (handle: Handle): State => {
  const session = sessions.get(handle);
  if (session === undefined) throw new TypeError("Unknown Sewed session handle");
  return session;
};

export const resolve = (handle: Handle): Session => stateOf(handle).native;

/** Allows or blocks the renderer's speculative preconnections for the session. */
export const setPreconnect = (handle: Handle, enabled: boolean): void => {
  stateOf(handle).preconnect = enabled;
};

export const setPermissions = (handle: Handle, policy: Permission.Policy): void => {
  const state = stateOf(handle);
  const rules = decodePolicy(policy).map((rule) => ({
    matches: UrlRule.compile(rule),
    permissions: new Set(rule.permissions),
  }));
  state.rules = rules;
};

const hostnameMatcher = (pattern: string): ((hostname: string) => boolean) => {
  const value = pattern.toLowerCase();
  return value.startsWith("*.")
    ? (hostname) => hostname === value.slice(2) || hostname.endsWith(value.slice(1))
    : (hostname) => hostname === value;
};

/** Installs the certificate rules; an empty policy restores Chromium's verification. */
export const setCertificatePolicy = (handle: Handle, policy: Certificate.Policy): void => {
  const state = stateOf(handle);
  const rules = decodeCertificatePolicy(policy).map((rule) => ({
    matches: hostnameMatcher(rule.hostname),
    trust: rule.trust,
  }));
  state.certificates = rules;
  if (rules.length === 0) {
    state.native.setCertificateVerifyProc(null);
    return;
  }
  state.native.setCertificateVerifyProc((request, callback) => {
    const hostname = request.hostname.toLowerCase();
    const rule = state.certificates.find((candidate) => candidate.matches(hostname));
    if (rule === undefined || rule.trust === "system") return callback(-3);
    if (rule.trust === "always") return callback(0);
    callback(request.certificate.fingerprint === rule.trust.fingerprint ? 0 : -2);
  });
};
