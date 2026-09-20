import type { Session } from "electron";
import { Effect, Schema } from "effect";
import type { Scope } from "effect";
import type { Stream } from "effect";
import * as Decidables from "../Decidables.ts";
import * as Decision from "../Decision.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as WebRequest from "../WebRequest.ts";
import * as ContentsRegistry from "./ContentsRegistry.ts";
import type * as Registry from "./DecisionRegistry.ts";
import * as NativeAnswer from "./NativeAnswer.ts";
import * as Observation from "./Observation.ts";

/** The three native stages a decider can be installed on, named as Electron names its listeners. */
type Stage = "request" | "requestHeaders" | "responseHeaders";

/**
 * One installed decider's *scope*, which is all the union filter needs from it. The decider itself
 * lives in the session's `"requests"` decision registry, keyed by decidable; this is only what
 * decides which requests Electron hands the stage's single native listener at all.
 */
interface Install {
  readonly stage: Stage;
  readonly urls: readonly string[];
  readonly types: readonly string[] | undefined;
}

interface Tap {
  readonly matches: (url: URL, type: string) => boolean;
  readonly urls: readonly string[];
  readonly types: readonly string[] | undefined;
  readonly offer: (event: WebRequest.Event) => void;
}

/**
 * What this module has wired onto one native session: the decider installs, per stage, and the
 * observers. Deliberately not called `Registry` — that name means `internal/DecisionRegistry.ts`
 * here now, and the decision registry is where the deciders themselves live.
 */
interface Wiring {
  readonly native: Session;
  readonly installs: Set<Install>;
  readonly taps: Set<Tap>;
}

const wirings = new WeakMap<Session, Wiring>();
const decodeFilter = Schema.decodeUnknownSync(WebRequest.Filter);

const protocolError = (message: string, cause?: unknown) =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

const wiringOf = (native: Session): Wiring => {
  const existing = wirings.get(native);
  if (existing !== undefined) return existing;
  const wiring: Wiring = { native, installs: new Set(), taps: new Set() };
  wirings.set(native, wiring);
  return wiring;
};

type Details = Pick<
  Electron.OnBeforeRequestListenerDetails,
  "id" | "url" | "method" | "resourceType" | "referrer" | "timestamp" | "webContentsId"
>;
const requestOf = (details: Details): WebRequest.Request => {
  const sourceId = ContentsRegistry.handleIdOf(details.webContentsId);
  return {
    id: details.id,
    url: details.url,
    method: details.method,
    resourceType: details.resourceType,
    referrer: details.referrer,
    timestamp: details.timestamp,
    ...(details.webContentsId === undefined ? {} : { webContentsId: details.webContentsId }),
    ...(sourceId === undefined ? {} : { sourceId }),
  };
};

type UploadData = Pick<Electron.UploadData, "bytes" | "file" | "blobUUID">;

/** A part is kept only when it fits the remaining budget; the first that does not ends the body. */
export const assembleBody = async (
  parts: readonly UploadData[],
  filter: WebRequest.BodyFilter,
  blob: (id: string) => Promise<Uint8Array>,
): Promise<WebRequest.Body> => {
  const kept: WebRequest.UploadPart[] = [];
  let bytes = 0;
  for (const part of parts) {
    if (part.file !== undefined) {
      kept.push({ kind: "file", path: part.file });
      continue;
    }
    if (part.blobUUID !== undefined && filter.blobs === "reference") {
      kept.push({ kind: "blob", id: part.blobUUID });
      continue;
    }
    const data =
      part.blobUUID === undefined ? new Uint8Array(part.bytes) : await blob(part.blobUUID);
    if (bytes + data.byteLength > filter.maxBytes) return { parts: kept, bytes, truncated: true };
    bytes += data.byteLength;
    kept.push({ kind: "bytes", bytes: data });
  }
  return { parts: kept, bytes, truncated: false };
};

/** What one request carried, for the installs whose filter asked for a body. */
interface Upload {
  readonly parts: readonly UploadData[];
  /** Reads a blob at most once per request, however many installs go on to ask for one. */
  readonly blob: (id: string) => Promise<Uint8Array>;
}

/**
 * The upload data the request listener read off `details`, keyed by the exact event object it
 * built. Only the request stage carries a body, and that stage composes `restrictive`, so every
 * decider is handed that same object — which makes the event its own key and keeps the assembly
 * per-install, where the filter that asked for it is. A lookup that finds nothing means only that
 * the event did not come from that listener, and an empty body is the honest answer for one.
 */
const uploads = new WeakMap<object, Upload>();

const noUpload: Upload = {
  parts: [],
  blob: (id) => Promise.reject(new TypeError(`No upload data was recorded for blob ${id}`)),
};

/** What one event's listener recorded, or an empty body for an event no listener of ours built. */
const uploadFor = (event: unknown): Upload =>
  (typeof event === "object" && event !== null ? uploads.get(event) : undefined) ?? noUpload;

/**
 * What the door needs to know about a request stage that its `Decidable` type does not carry: which
 * native listener's union filter its installs join, how to read the url and resource type a filter
 * matches against, and whether a `body` option means anything on it.
 *
 * All three stages share one `target`, because all three events carry the same `requestFields`. It
 * is declared with **method** syntax deliberately, for the reason `internal/DecisionRegistry.ts`'s
 * `Entry` gives at length: TypeScript checks a method's parameter bivariantly, so a reader written
 * against those three concrete event types fills this erased `(event: unknown) => …` slot with no
 * cast and no decode. Calling it back is sound because the only events that reach it are the ones
 * the listeners below build, and a chain's `advance` copies `url` and `resourceType` across
 * unchanged — which is why a header decider's filter still matches on the fold's later rounds.
 */
interface StageOps {
  readonly stage: Stage;
  target(event: unknown): { readonly url: string; readonly type: string };
  readonly carriesBody: boolean;
}

const targetOf = (event: WebRequest.Request | WebRequest.RequestHeaders | WebRequest.Response) => ({
  url: event.url,
  type: event.resourceType,
});

/**
 * Which members of the session catalog are request stages, *derived* from what they declare rather
 * than re-listed here: every key of `Decidables.Session` whose value is a `"requests"`-owned
 * decidable. Deriving it is the whole point — {@link stageTable} below is a mapped type over this
 * union, so a fourth stage added to the catalog and forgotten here is `TS2741: Property '…' is
 * missing` at the build, not a `Protocol` failure at install. That is this wave's own thesis,
 * closing the gap structurally instead of by remembering to, applied to the one place in this
 * module that was still relying on memory.
 *
 * The two `infer` parameters are the event and answer types, which this union has no use for: they
 * exist only so the conditional can name the three that follow. `Timing` is pinned to `"async"` and
 * `C` widened to `Decision.Composition` because the stages differ on composition (one ranks, two
 * chain) and agree on timing.
 */
type SessionCatalog = typeof Decidables.Session;
export type RequestStageKey = {
  [K in keyof SessionCatalog]: SessionCatalog[K] extends Decision.Decidable<
    infer _Event,
    infer _Answer,
    "async",
    Decision.Composition,
    "requests"
  >
    ? K
    : never;
}[keyof SessionCatalog];

/**
 * What this module knows about each stage, one entry per derived key. The value keeps the decidable
 * beside its ops so {@link stages} can be built from `Object.values` without naming the three again.
 */
const stageTable: { readonly [K in RequestStageKey]: readonly [SessionCatalog[K], StageOps] } = {
  Request: [Decidables.Session.Request, { stage: "request", target: targetOf, carriesBody: true }],
  RequestHeaders: [
    Decidables.Session.RequestHeaders,
    { stage: "requestHeaders", target: targetOf, carriesBody: false },
  ],
  ResponseHeaders: [
    Decidables.Session.ResponseHeaders,
    { stage: "responseHeaders", target: targetOf, carriesBody: false },
  ],
};

/**
 * `stageTable`'s own type, exported so a contract file can assert `keyof StageTable` against
 * {@link RequestStageKey} — the guarantee the mapped type above exists to give, pinned against
 * *this* table rather than a copy of its spelling. A `stageTable` degraded to a plain
 * `Record<string, …>` still compiles and runs identically, so the build alone cannot say the
 * annotation is still there; `keyof` can.
 */
export type StageTable = typeof stageTable;

/**
 * The stages this module resolves, by decidable identity. The door refuses anything absent from it,
 * which the type above cannot do on its own: `Decision.decidable` is public, so a consumer can
 * declare their own decidable with `owner: "requests"` and a `session/` key outside the catalog
 * entirely, and that one would install cleanly into the registry and never be resolved by anything —
 * the silent-inert-decider failure this whole wave exists to end, one owner further along. The
 * mapped type covers the catalog; this covers everything else.
 */
const stages = new WeakMap<object, StageOps>(Object.values(stageTable));

/**
 * One native listener per stage covers the union of the installed filters — Electron accepts only
 * one listener per `webRequest` event per session, so the union is what keeps two features' filters
 * from clobbering each other. An install that names no resource types widens the union to every
 * type, since it asked for every type.
 */
const unionFilter = (
  entries: readonly {
    readonly urls: readonly string[];
    readonly types: readonly string[] | undefined;
  }[],
): Electron.WebRequestFilter | undefined => {
  if (entries.length === 0) return undefined;
  const urls = [...new Set(entries.flatMap((entry) => entry.urls))];
  const everything = entries.some((entry) => entry.types === undefined);
  const types = everything
    ? undefined
    : [...new Set(entries.flatMap((entry) => entry.types ?? []))].filter(
        (type): type is Exclude<WebRequest.ResourceType, "other"> => type !== "other",
      );
  return types === undefined ? { urls } : { urls, types };
};

const stageFilter = (wiring: Wiring, stage: Stage) =>
  unionFilter([...wiring.installs].filter((install) => install.stage === stage));

const observedOf = <D extends Details & { readonly fromCache: boolean }>(details: D) => ({
  ...requestOf(details),
  fromCache: details.fromCache,
});

const reinstallTaps = (wiring: Wiring) => {
  const { webRequest } = wiring.native;
  const filter = unionFilter([...wiring.taps]);
  const dispatch = (url: string, type: string, event: WebRequest.Event) => {
    const parsed = URL.parse(url);
    if (parsed === null) return;
    for (const tap of wiring.taps) if (tap.matches(parsed, type)) tap.offer(event);
  };
  if (filter === undefined) {
    webRequest.onSendHeaders(null);
    webRequest.onResponseStarted(null);
    webRequest.onBeforeRedirect(null);
    webRequest.onCompleted(null);
    webRequest.onErrorOccurred(null);
    return;
  }
  webRequest.onSendHeaders(filter, (details) =>
    dispatch(details.url, details.resourceType, {
      ...requestOf(details),
      stage: "sent",
      headers: { ...details.requestHeaders },
    }),
  );
  webRequest.onResponseStarted(filter, (details) =>
    dispatch(details.url, details.resourceType, {
      ...observedOf(details),
      stage: "response",
      statusCode: details.statusCode,
      statusLine: details.statusLine,
      headers: Object.fromEntries(
        Object.entries(details.responseHeaders ?? {}).map(([name, values]) => [name, [...values]]),
      ),
    }),
  );
  webRequest.onBeforeRedirect(filter, (details) =>
    dispatch(details.url, details.resourceType, {
      ...observedOf(details),
      stage: "redirect",
      statusCode: details.statusCode,
      redirectUrl: details.redirectURL,
    }),
  );
  webRequest.onCompleted(filter, (details) =>
    dispatch(details.url, details.resourceType, {
      ...observedOf(details),
      stage: "completed",
      statusCode: details.statusCode,
      statusLine: details.statusLine,
    }),
  );
  webRequest.onErrorOccurred(filter, (details) =>
    dispatch(details.url, details.resourceType, {
      ...observedOf(details),
      stage: "error",
      error: details.error,
    }),
  );
};

/**
 * Observes the request stages deciders never see: headers sent, response started, redirects,
 * completion, and errors. One native listener per stage covers the union of the installed
 * filters; each observer owns its registration and a bounded queue.
 */
export const observe = (
  native: Session,
  filter: WebRequest.Filter,
): Stream.Stream<WebRequest.Event, SewedError, MainContext> =>
  Observation.listen<WebRequest.Event>("Request", (offer) =>
    Effect.try({
      try: () => {
        const settings = decodeFilter(filter);
        const patterns = settings.urls.map(WebRequest.compilePattern);
        const types = settings.types === undefined ? undefined : new Set<string>(settings.types);
        const tap: Tap = {
          matches: (url, type) =>
            (types === undefined || types.has(type)) && patterns.some((allows) => allows(url)),
          urls: settings.urls,
          types: settings.types,
          offer,
        };
        const wiring = wiringOf(native);
        wiring.taps.add(tap);
        reinstallTaps(wiring);
        return () => {
          wiring.taps.delete(tap);
          reinstallTaps(wiring);
        };
      },
      catch: (cause) =>
        cause instanceof SewedError ? cause : protocolError("Invalid request filter", cause),
    }),
  );

/**
 * Recomputes all three native listeners from the installs a session currently holds, and is called
 * on every install and every removal: the union each listener's filter covers changes with both, so
 * a `Registry.hook`'s zero-to-one and one-to-zero edges would answer only two of the four moments
 * this has to. A stage with no install left is set to `null`, which is how Electron is told to stop
 * routing that stage through main at all.
 *
 * Every callback answers exactly once through `internal/NativeAnswer.ts`, whose closed form here is
 * `{ cancel: true }`: a resolution that cannot settle must not leave a request hanging, and a
 * request nobody could decide is one nobody established was safe to make.
 */
const reinstall = (wiring: Wiring, registry: Registry.Resolver<"requests">) => {
  const { webRequest } = wiring.native;
  const requests = stageFilter(wiring, "request");
  if (requests === undefined) webRequest.onBeforeRequest(null);
  else
    webRequest.onBeforeRequest(requests, (details, callback) => {
      const event = requestOf(details);
      const read = new Map<string, Promise<Uint8Array>>();
      uploads.set(event, {
        parts: details.uploadData ?? [],
        blob: (id) => {
          const existing = read.get(id);
          if (existing !== undefined) return existing;
          const reading = wiring.native.getBlobData(id).then((buffer) => new Uint8Array(buffer));
          read.set(id, reading);
          return reading;
        },
      });
      NativeAnswer.run({
        label: Decidables.Session.Request.key,
        resolution: registry.resolveAsync(Decidables.Session.Request, event),
        reply: (answer) =>
          callback(
            answer.kind === "block"
              ? { cancel: true }
              : answer.kind === "redirect"
                ? { redirectURL: answer.url }
                : {},
          ),
        failed: () => callback({ cancel: true }),
      });
    });
  const sending = stageFilter(wiring, "requestHeaders");
  if (sending === undefined) webRequest.onBeforeSendHeaders(null);
  else
    webRequest.onBeforeSendHeaders(sending, (details, callback) => {
      const event: WebRequest.RequestHeaders = {
        ...requestOf(details),
        headers: { ...details.requestHeaders },
      };
      NativeAnswer.run({
        label: Decidables.Session.RequestHeaders.key,
        resolution: registry.resolveChain(Decidables.Session.RequestHeaders, event),
        // `stop` holds `"block"` alone, so a stopped chain is a cancelled request. The identity
        // check is what lets a chain nobody changed answer Electron's own "no change" form instead
        // of handing the headers straight back: `resolveChain` returns the exact object it was
        // given when every decider passed.
        reply: (outcome) =>
          callback(
            outcome.kind === "stopped"
              ? { cancel: true }
              : outcome.event === event
                ? {}
                : { requestHeaders: { ...outcome.event.headers } },
          ),
        failed: () => callback({ cancel: true }),
      });
    });
  const receiving = stageFilter(wiring, "responseHeaders");
  if (receiving === undefined) webRequest.onHeadersReceived(null);
  else
    webRequest.onHeadersReceived(receiving, (details, callback) => {
      const event: WebRequest.Response = {
        ...requestOf(details),
        statusLine: details.statusLine,
        statusCode: details.statusCode,
        headers: { ...(details.responseHeaders ?? {}) },
      };
      NativeAnswer.run({
        label: Decidables.Session.ResponseHeaders.key,
        resolution: registry.resolveChain(Decidables.Session.ResponseHeaders, event),
        reply: (outcome) => {
          if (outcome.kind === "stopped") return callback({ cancel: true });
          if (outcome.event === event) return callback({});
          callback({
            responseHeaders: Object.fromEntries(
              Object.entries(outcome.event.headers).map(([name, values]) => [name, [...values]]),
            ),
            statusLine: outcome.event.statusLine,
          });
        },
        failed: () => callback({ cancel: true }),
      });
    });
};

/**
 * Installs one decider on one request stage, for the requests one filter selects, for the caller's
 * scope. This is the whole of `session.intercept`; see `internal/Session.ts` for the handle method
 * that binds the session and its `"requests"` registry into it.
 *
 * The filter is a parameter rather than a registry concept because it is a cost, not a key: a
 * listener over every URL routes every request in the session through main, and making the caller
 * name the scope at the call site is what keeps that visible — as the `Rules<R>` bundle this
 * replaces did. What the registry gets is a decider that has already been *wrapped* to answer
 * {@link Decision.Pass} for a request its own filter does not select, so the composition sees
 * exactly the deciders that had an opinion to have, and the union filter above is only Electron's
 * half of the same question.
 *
 * Body assembly is per install and lives in that same wrapper: only a decider whose filter asked
 * for a body pays for one, the blob cache the listener put beside the event means a blob is read
 * once per request however many installs ask, and a body that cannot be read fails *that* decider —
 * which, on a stage declaring `failure: { kind: "block" }`, blocks the request exactly as the
 * hand-rolled listener this replaces did.
 */
export const intercept = <Event, Answer, R>(
  native: Session,
  registry: Registry.Registry<"requests">,
  decidable: Decision.Decidable<Event, Answer, "async", Decision.Composition, "requests">,
  filter: WebRequest.Filter,
  decider: Decision.Decider<NoInfer<Event>, NoInfer<Answer>, R>,
): Effect.Effect<void, SewedError, MainContext | Scope.Scope | R> =>
  Effect.gen(function* () {
    yield* MainContext;
    const ops = stages.get(decidable);
    if (ops === undefined)
      return yield* Effect.fail(
        protocolError(
          `Decidable "${decidable.key}" is not one of the session's request stages, so no native listener would ever resolve it`,
        ),
      );
    const settings = yield* Effect.try({
      try: () => decodeFilter(filter),
      catch: (cause) => protocolError("Invalid request filter", cause),
    });
    if (settings.body !== undefined && !ops.carriesBody)
      return yield* Effect.fail(
        protocolError(
          `Decidable "${decidable.key}" carries no upload data, so its filter cannot ask for a body`,
        ),
      );
    const wanted = settings.body;
    const patterns = settings.urls.map(WebRequest.compilePattern);
    const types = settings.types === undefined ? undefined : new Set<string>(settings.types);
    const selects = (url: string, type: string) => {
      if (types !== undefined && !types.has(type)) return false;
      const parsed = URL.parse(url);
      return parsed !== null && patterns.some((allows) => allows(parsed));
    };
    const answerOf = (event: Event) =>
      decider._tag === "sync" ? Effect.sync(() => decider.decide(event)) : decider.decide(event);
    const filtered = Decision.async<Event, Answer, R>((event) =>
      Effect.suspend(() => {
        const { url, type } = ops.target(event);
        if (!selects(url, type)) return Effect.succeed(Decision.Pass);
        if (wanted === undefined) return answerOf(event);
        const carried = uploadFor(event);
        // `Effect.promise` turns a rejection into a defect, which is what the registry's own
        // `consult` treats as a failed decider — so an unreadable body contributes this stage's
        // declared `failure` rather than silently handing a decider a body it never got.
        return Effect.flatMap(
          Effect.promise(() => assembleBody(carried.parts, wanted, carried.blob)),
          (body) => answerOf({ ...event, body }),
        );
      }),
    );
    const context = yield* Effect.context<R>();
    const wiring = wiringOf(native);
    const install: Install = {
      stage: ops.stage,
      urls: settings.urls,
      types: settings.types,
    };
    yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          const remove = registry.installOne(decidable, filtered, context);
          wiring.installs.add(install);
          try {
            reinstall(wiring, registry);
          } catch (cause) {
            // Both halves or neither: a decider registered without its stage's native listener is
            // a decider nothing consults, which is the failure the whole wave exists to end.
            wiring.installs.delete(install);
            remove();
            throw cause;
          }
          return () => {
            remove();
            wiring.installs.delete(install);
            reinstall(wiring, registry);
          };
        },
        catch: (cause) =>
          cause instanceof SewedError
            ? cause
            : new SewedError({
                code: "Native",
                message: `Could not install a request decider for ${decidable.key}`,
                cause,
              }),
      }),
      (remove) => Effect.sync(() => remove()),
    );
  });
