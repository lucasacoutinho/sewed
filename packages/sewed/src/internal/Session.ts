import type { Session } from "electron";
import { Schema } from "effect";
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
interface State {
  readonly native: Session;
  rules: readonly Rule[];
}
const handles = new WeakMap<Session, Handle>();
const sessions = new WeakMap<Handle, State>();
const decodePolicy = Schema.decodeUnknownSync(Permission.Policy);

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
    if (origin !== undefined && new URL(origin).origin !== current.origin) return false;
    return state.rules.some((rule) => rule.permissions.has(permission) && rule.matches(requesting));
  } catch {
    return false;
  }
};

export const fromNative = (session: Session): Handle => {
  const existing = handles.get(session);
  if (existing !== undefined) return existing;
  const handle = Object.freeze<Handle>({ [sessionHandle]: true });
  const state: State = { native: session, rules: [] };
  session.setPermissionCheckHandler((contents, permission, origin, details) =>
    allowed(state, contents, permission, details, origin),
  );
  session.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(allowed(state, contents, permission, details)),
  );
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

export const setPermissions = (handle: Handle, policy: Permission.Policy): void => {
  const state = stateOf(handle);
  const rules = decodePolicy(policy).map((rule) => ({
    matches: UrlRule.compile(rule),
    permissions: new Set(rule.permissions),
  }));
  state.rules = rules;
};
