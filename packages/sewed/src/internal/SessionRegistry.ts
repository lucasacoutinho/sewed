import type { Session } from "electron";

export const sessionHandle: unique symbol = Symbol("sewed/SessionHandle");

export interface SessionIdentity {
  readonly [sessionHandle]: true;
}

const natives = new WeakMap<SessionIdentity, Session>();

export const register = (handle: SessionIdentity, session: Session): void => {
  natives.set(handle, session);
};

export const resolve = (handle: SessionIdentity): Session => {
  const native = natives.get(handle);
  if (native === undefined) throw new TypeError("Unknown Sewed session handle");
  return native;
};
