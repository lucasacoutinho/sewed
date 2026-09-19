import type { Session } from "electron";
import { Effect, Schema } from "effect";
import type { Stream } from "effect";
import * as Decidables from "../Decidables.ts";
import type * as Decision from "../Decision.ts";
import * as Net from "../Net.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as SessionStorage from "../SessionStorage.ts";
import * as UrlRule from "../UrlRule.ts";
import type * as WebRequestData from "../WebRequest.ts";
import * as Cookies from "./Cookies.ts";
import * as Registry from "./DecisionRegistry.ts";
import * as DisplayMedia from "./DisplayMedia.ts";
import * as WebRequest from "./WebRequest.ts";

const sessionHandle: unique symbol = Symbol("sewed/SessionHandle");

/**
 * A selected browser session. The identity brand is what keeps a caller from fabricating one
 * structurally; every other member is a method or a value the session's own construction builds
 * once, matching how a window and a web contents already read.
 */
export interface Handle {
  readonly [sessionHandle]: true;
  /** Cookie access for this session; the handle is inert until an operation runs in main. */
  readonly cookies: Cookies.Handle;
  /** Clears the selected storages, for the whole session or scoped to one origin. */
  readonly clearStorage: (
    options: SessionStorage.ClearOptions,
  ) => Effect.Effect<void, SewedError, MainContext>;
  /** Closes every open connection in the session, for example after its proxy changes. */
  readonly closeAllConnections: Effect.Effect<void, SewedError, MainContext>;
  /** Resolves a host with the session's resolver; `cacheUsage: "disallowed"` skips cached answers. */
  readonly resolveHost: (
    host: string,
    options?: Net.ResolveHostOptions,
  ) => Effect.Effect<Net.ResolvedHost, SewedError, MainContext>;
  /** Reads one upload blob, for request deciders that take `body.blobs: "reference"`. */
  readonly blobData: (uuid: string) => Effect.Effect<Uint8Array, SewedError, MainContext>;
  /** Observes the request stages deciders never see, for the requests a filter selects. */
  readonly requests: (
    filter: WebRequestData.Filter,
  ) => Stream.Stream<WebRequestData.Event, SewedError, MainContext>;
  /**
   * Installs a decider for one of `Decidables.Session`'s decidables against this session's own
   * registry, for the caller's scope. Any number of deciders may be installed, and the decidable's
   * own composition decides among them. Sessions have application lifetime and no closed state of
   * their own, so nothing here ever refuses installation the way a window or web contents can once
   * closed.
   */
  readonly decide: Decision.Owner["decide"];
}

const handles = new WeakMap<Session, Handle>();
const natives = new WeakMap<Handle, Session>();

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });
const decoded = <A>(message: string, run: () => A): Effect.Effect<A, SewedError> =>
  Effect.try({
    try: run,
    catch: (cause) => (cause instanceof SewedError ? cause : protocolError(message, cause)),
  });

const decodeClearOptions = Schema.decodeUnknownSync(SessionStorage.ClearOptions);
const decodeHost = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
const decodeResolveHostOptions = Schema.decodeUnknownSync(Net.ResolveHostOptions);
const decodeBlobId = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));

/**
 * Device access follows the same permission decidable as browser permissions: `deviceType` becomes
 * `name`, and the requesting origin stands in for `document`, since a device check carries no
 * requesting document at all.
 */
const deviceAllowed = (
  registry: ReturnType<typeof Registry.make>,
  details: Electron.DevicePermissionHandlerHandlerDetails,
): boolean => {
  const origin = URL.parse(details.origin);
  return (
    origin !== null &&
    registry.resolveSync(Decidables.Session.Permission, {
      name: details.deviceType,
      document: UrlRule.originOf(origin),
    }) === "allow"
  );
};

/**
 * The hard, undecidable gates a permission check always applied — no live web contents, a subframe,
 * a cross-document check, or a mismatched requesting origin are denied outright — followed by the
 * one part that is now decided: whether the named permission is granted to the requesting document.
 * This is the event builder `Decidables.Session.Permission`'s own doc refers to, not the decision.
 */
const allowed = (
  registry: ReturnType<typeof Registry.make>,
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
    return (
      registry.resolveSync(Decidables.Session.Permission, {
        name: permission,
        document: UrlRule.documentKey(requesting),
      }) === "allow"
    );
  } catch {
    return false;
  }
};

export const fromNative = (session: Session): Handle => {
  const existing = handles.get(session);
  if (existing !== undefined) return existing;

  const registry = Registry.make();

  session.setPermissionCheckHandler((contents, permission, origin, details) =>
    allowed(registry, contents, permission, details, origin),
  );
  session.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(allowed(registry, contents, permission, details)),
  );
  session.setDevicePermissionHandler((details) => deviceAllowed(registry, details));
  session.on("preconnect", (event, preconnectUrl) => {
    if (registry.resolveSync(Decidables.Session.Preconnect, { url: preconnectUrl }) === "deny")
      event.preventDefault();
  });
  session.setCertificateVerifyProc((request, callback) => {
    Effect.runFork(
      Effect.map(
        registry.resolveAsync(Decidables.Session.Certificate, {
          hostname: request.hostname,
          certificate: {
            fingerprint: request.certificate.fingerprint,
            subjectName: request.certificate.subjectName,
            issuerName: request.certificate.issuerName,
            validStart: request.certificate.validStart,
            validExpiry: request.certificate.validExpiry,
          },
        }),
        (answer) => callback(answer === "trust" ? 0 : answer === "reject" ? -2 : -3),
      ),
    );
  });
  DisplayMedia.install(session, registry);

  const clearStorage: Handle["clearStorage"] = (options) =>
    Effect.andThen(
      MainContext,
      Effect.tryPromise({
        try: () => {
          const parsed = decodeClearOptions(options);
          if (parsed.kind === "origin") UrlRule.compile({ kind: "origin", origin: parsed.origin });
          return session.clearStorageData({
            ...(parsed.kind === "origin" ? { origin: parsed.origin } : {}),
            storages: [...parsed.storages],
          });
        },
        catch: (cause) =>
          new SewedError({ code: "Native", message: "Could not clear session storage", cause }),
      }),
    );

  const closeAllConnections: Handle["closeAllConnections"] = Effect.andThen(
    MainContext,
    Effect.tryPromise({
      try: () => session.closeAllConnections(),
      catch: (cause) =>
        new SewedError({ code: "Native", message: "Could not close session connections", cause }),
    }),
  );

  const resolveHost: Handle["resolveHost"] = (host, options = {}) =>
    Effect.andThen(
      decoded("Invalid host resolution request", () => ({
        host: decodeHost(host),
        options: decodeResolveHostOptions(options),
      })),
      (request) =>
        Effect.andThen(
          MainContext,
          Effect.tryPromise({
            try: async () => {
              const result = await session.resolveHost(request.host, { ...request.options });
              return {
                endpoints: result.endpoints.map(({ address, family }) => ({ address, family })),
              };
            },
            catch: (cause) =>
              new SewedError({ code: "Native", message: "Could not resolve host", cause }),
          }),
        ),
    );

  const blobData: Handle["blobData"] = (uuid) =>
    Effect.andThen(
      decoded("Invalid blob id", () => decodeBlobId(uuid)),
      (id) =>
        Effect.andThen(
          MainContext,
          Effect.tryPromise({
            try: async () => new Uint8Array(await session.getBlobData(id)),
            catch: (cause) =>
              new SewedError({ code: "Native", message: "Could not read blob data", cause }),
          }),
        ),
    );

  const requests: Handle["requests"] = (filter) => WebRequest.observe(session, filter);

  // Sessions have application lifetime and no closed state: `isClosed` never reports true, so
  // `decide` never refuses installation the way a window's or a web contents' own does once closed.
  const decide = Registry.decide(registry, { isClosed: () => false });

  const handle = Object.freeze<Handle>({
    [sessionHandle]: true,
    cookies: Cookies.make(session),
    clearStorage,
    closeAllConnections,
    resolveHost,
    blobData,
    requests,
    decide,
  });
  handles.set(session, handle);
  natives.set(handle, session);
  return handle;
};

export const resolve = (handle: Handle): Session => {
  const native = natives.get(handle);
  if (native === undefined) throw new TypeError("Unknown Sewed session handle");
  return native;
};
