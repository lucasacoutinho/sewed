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
import * as NativeAnswer from "./NativeAnswer.ts";
import { decoded } from "./ProtocolError.ts";
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
   *
   * The three request stages are not among them: they name `owner: "requests"`, so this refuses
   * them at compile time and {@link Handle.intercept} is where they install.
   */
  readonly decide: Decision.Owner<"session">["decide"];
  /**
   * Installs a decider for one of the three request stages — `Decidables.Session.Request`,
   * `.RequestHeaders`, `.ResponseHeaders` — on the requests one filter selects, for the caller's
   * scope. Any number of deciders may be installed on any of them, independently: one feature
   * blocking trackers and another rewriting headers neither know nor need to know about each other,
   * and removing one leaves the other deciding.
   *
   * The filter's own contract — why it is required and separate from the decidable, what a `body`
   * option does, and how several deciders on one stage compose — is {@link Decision.Requests},
   * which `sewed/testing`'s owner stand-in publishes too, so a feature that intercepts names that
   * interface and takes either this handle or a stand-in.
   */
  readonly intercept: Decision.Requests["intercept"];
}

const handles = new WeakMap<Session, Handle>();
const natives = new WeakMap<Handle, Session>();

const decodeClearOptions = Schema.decodeUnknownSync(SessionStorage.ClearOptions);
const decodeHost = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));
const decodeResolveHostOptions = Schema.decodeUnknownSync(Net.ResolveHostOptions);
const decodeBlobId = Schema.decodeUnknownSync(Schema.String.check(Schema.isMinLength(1)));

/**
 * `UrlRule.originOf` returns the literal string `"null"` for an opaque origin — `file:`, `data:`,
 * and any unregistered scheme — which is Chromium's own `URL.origin` spelling for "this document has
 * no origin", not a real identity: every `file:` document in an app shares that same string. The
 * event this module builds must not hand a decider a value that looks like an identity and is not,
 * the same reasoning `Decidables.Session.Permission`'s own doc gives for `document: null` on a
 * device check — so the opaque case becomes a real `null` here, at the one place both `allowed` and
 * `deviceAllowed` build the event. The hard gate that already compares two origins (`allowed`,
 * below) is unaffected: it compares `UrlRule.originOf`'s own string output directly and does not go
 * through this function, so an opaque document's gate still compares `"null"` to `"null"`, exactly
 * as it always has.
 */
const originOrNull = (url: URL): string | null => {
  const value = UrlRule.originOf(url);
  return value === "null" ? null : value;
};

/**
 * Device access follows the same permission decidable as browser permissions: `deviceType` becomes
 * `name`, the requesting origin becomes `origin` (or `null` if it is opaque), and `document` is
 * `null` — a device check identifies no requesting document at all, and the event says so rather
 * than reusing `origin`'s own value under the `document` key, which would make an origin
 * indistinguishable from a document key to a decider (see `Decidables.Session.Permission`'s own
 * doc). Wrapped in `try`/`catch` the same way `allowed` is: a native security handler is the one
 * place a catch around code that should not throw is justified, and the asymmetry of leaving it off
 * here, now that this calls `resolveSync` instead of the pure lookup it used to be, is exactly the
 * kind of gap that stops being unreachable later.
 */
const deviceAllowed = (
  registry: Registry.Resolver<"session">,
  details: Electron.DevicePermissionHandlerHandlerDetails,
): boolean => {
  try {
    const origin = URL.parse(details.origin);
    return (
      origin !== null &&
      registry.resolveSync(Decidables.Session.Permission, {
        name: details.deviceType,
        origin: originOrNull(origin),
        document: null,
        mediaTypes: [],
      }) === "allow"
    );
  } catch {
    return false;
  }
};

/**
 * The details shape either permission handler hands `allowed`: the check handler's own
 * `PermissionCheckHandlerHandlerDetails`, whose `mediaType` is singular, or the request handler's
 * `PermissionRequest | FilesystemPermissionRequest | MediaAccessPermissionRequest |
 * OpenExternalPermissionRequest` union, whose media member alone carries the plural `mediaTypes`
 * array — named at each handler's own real type rather than down-typed to the check handler's,
 * which is what used to make `mediaTypes` unreachable from the request handler's own call.
 */
type PermissionDetails =
  | Electron.PermissionCheckHandlerHandlerDetails
  | Electron.PermissionRequest
  | Electron.FilesystemPermissionRequest
  | Electron.MediaAccessPermissionRequest
  | Electron.OpenExternalPermissionRequest;

/**
 * The media types one permission check or request actually asks for: the request handler's own
 * `mediaTypes` array where Electron's typing carries one, else the check handler's singular
 * `mediaType` as a one-element list where it names `audio` or `video`, else empty — for every
 * permission that is not `media`, and for a check whose `mediaType` is `unknown` or absent alike.
 */
const mediaTypesOf = (details: PermissionDetails): readonly ("audio" | "video")[] => {
  if ("mediaTypes" in details && details.mediaTypes !== undefined) return details.mediaTypes;
  if ("mediaType" in details && (details.mediaType === "audio" || details.mediaType === "video"))
    return [details.mediaType];
  return [];
};

/**
 * The hard, undecidable gates a permission check always applied — no live web contents, a subframe,
 * a cross-document check, or a mismatched requesting origin are denied outright — followed by the
 * one part that is now decided: whether the named permission is granted to the requesting origin and
 * document. This is the event builder `Decidables.Session.Permission`'s own doc refers to, not the
 * decision.
 */
const allowed = (
  registry: Registry.Resolver<"session">,
  contents: Electron.WebContents | null,
  permission: string,
  details: PermissionDetails,
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
        origin: originOrNull(requesting),
        document: UrlRule.documentKey(requesting),
        mediaTypes: mediaTypesOf(details),
      }) === "allow"
    );
  } catch {
    return false;
  }
};

export const fromNative = (session: Session): Handle => {
  const existing = handles.get(session);
  if (existing !== undefined) return existing;

  const certificateProc = (request: Electron.Request, callback: (result: number) => void): void => {
    NativeAnswer.run({
      label: Decidables.Session.Certificate.key,
      resolution: registry.resolveAsync(Decidables.Session.Certificate, {
        hostname: request.hostname,
        certificate: {
          fingerprint: request.certificate.fingerprint,
          subjectName: request.certificate.subjectName,
          issuerName: request.certificate.issuerName,
          validStart: request.certificate.validStart,
          validExpiry: request.certificate.validExpiry,
        },
      }),
      reply: (answer) => callback(answer === "trust" ? 0 : answer === "reject" ? -2 : -3),
      // The decidable's own contract: when deciding fails, the verification is rejected. Reaching
      // this at all means the resolution itself could not settle — `resolveAsync` never fails, so a
      // decider that throws is already `Session.Certificate`'s declared `failure: "reject"` by the
      // time it gets here — and answering `-3` would hand Chromium back a certificate the decider
      // that was installed exists to distrust.
      failed: () => callback(-2),
    });
  };

  // The certificate proc and the display-media handler exist only while a `Session.Certificate` or
  // `Session.DisplayMedia` decider is installed, the way base's `setCertificatePolicy`/
  // `setDisplayMedia` free functions used to install them and an empty policy or a `null` decider
  // used to remove them — a main-process TLS interception point and a screen-share handler should
  // not exist in every Sewed application whether or not anyone asked for one. The permission
  // handlers and the preconnect listener stay installed unconditionally at acquisition: that timing
  // is unchanged from base and deliberate.
  const registry = Registry.make({
    owner: "session",
    hooks: [
      Registry.hook(Decidables.Session.Certificate, {
        attach: () => session.setCertificateVerifyProc(certificateProc),
        detach: () => session.setCertificateVerifyProc(null),
      }),
      Registry.hook(Decidables.Session.DisplayMedia, {
        attach: () => DisplayMedia.install(session, registry),
        detach: () => session.setDisplayMediaRequestHandler(null),
      }),
    ],
  });

  /**
   * A session holds decidables of two owner kinds, so it holds two registries: a registry is built
   * for exactly one kind, and widening `owner` to a set would give up the refusal that is the whole
   * point of naming it. `registry` above decides a session's own events through `decide`; this one
   * decides its three request stages, which install through `intercept` because that door also
   * takes a filter. Each refuses the other's decidables at compile time and at runtime, and both
   * are closure-private: `intercept` reaches this one by living on the handle, not by exporting an
   * accessor to it.
   */
  const stages = Registry.make({ owner: "requests" });

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

  const intercept: Handle["intercept"] = (decidable, filter, decider) =>
    WebRequest.intercept(session, stages, decidable, filter, decider);

  const handle = Object.freeze<Handle>({
    [sessionHandle]: true,
    cookies: Cookies.make(session),
    clearStorage,
    closeAllConnections,
    resolveHost,
    blobData,
    requests,
    decide,
    intercept,
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
