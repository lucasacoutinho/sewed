import type { Session } from "electron";
import { Effect, Schema } from "effect";
import type { Scope } from "effect";
import type { Stream } from "effect";
import * as Decidables from "../Decidables.ts";
import type * as Decision from "../Decision.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import * as WebRequest from "../WebRequest.ts";
import * as ContentsRegistry from "./ContentsRegistry.ts";
import type * as Registry from "./DecisionRegistry.ts";
import * as NativeAnswer from "./NativeAnswer.ts";
import * as Observation from "./Observation.ts";
import * as RequestStages from "./RequestStages.ts";
import { protocolError } from "./RequestStages.ts";

type Stage = RequestStages.Stage;

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
 * Electron's half of one stage's native filter: the union of every install joined onto it. See
 * {@link RequestStages.unionFilter} for what the union means and why an install naming `"other"`
 * widens it to every type, exactly as an install naming no types does.
 */
const stageFilter = (wiring: Wiring, stage: Stage) =>
  RequestStages.unionFilter([...wiring.installs].filter((install) => install.stage === stage));

const observedOf = <D extends Details & { readonly fromCache: boolean }>(details: D) => ({
  ...requestOf(details),
  fromCache: details.fromCache,
});

const reinstallTaps = (wiring: Wiring) => {
  const { webRequest } = wiring.native;
  const filter = RequestStages.unionFilter([...wiring.taps]);
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
 * Re-runs a stage's (or the taps') native registration for whatever survives a refused install,
 * so one bad filter cannot silence every other decider or observer on the session.
 *
 * This does not assume Electron validates a filter *before* it replaces the previous listener:
 * `.artifacts/probe-types-other` proves that order only for a `types` list naming `"other"`
 * (the throw happens before the listener is attached). `.artifacts/probe-refused-registration`
 * probes a bad `urls` pattern instead and finds the opposite — Electron discards the surviving
 * listener first and validates after, for patterns Sewed's own `compilePattern` accepts (a custom
 * scheme such as `custom://host/*`, a port outside 0-65535 such as `:99999`). So the restore
 * below runs unconditionally, on every refusal, whichever way this one throws.
 *
 * If the restore itself throws, that failure is only logged: the caller must still see the
 * ORIGINAL refusal it asked about, not a failure to recover from it — the same swallow-and-log
 * shape `internal/DecisionRegistry.ts` uses for a hook detach that fails during cleanup.
 */
const restoreAfterRefusal = (label: string, reinstallSurvivors: () => void): void => {
  try {
    reinstallSurvivors();
  } catch (restoreCause) {
    Effect.runFork(
      Effect.logError(`Could not restore ${label} after a refused registration`, restoreCause),
    );
  }
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
        try {
          reinstallTaps(wiring);
        } catch (cause) {
          // Both halves or neither, exactly as `intercept`'s own acquire path below: a tap
          // registered without its native listener is a tap nothing ever offers an event to, and
          // leaving it in `wiring.taps` would also poison every later `reinstallTaps` call with a
          // filter Electron already refused once.
          wiring.taps.delete(tap);
          restoreAfterRefusal("the request taps", () => reinstallTaps(wiring));
          // A refused *registration* is Electron rejecting the filter, not this module rejecting
          // it — `Native`, the same code `intercept` surfaces for the same event, thrown directly
          // so the outer catch's `Protocol` default below (for `decodeFilter`/`compilePattern`
          // rejecting the filter before it ever reaches Electron) does not also claim this one.
          throw new SewedError({
            code: "Native",
            message: "Could not register the native listener for a request observer",
            cause,
          });
        }
        return () => {
          wiring.taps.delete(tap);
          try {
            reinstallTaps(wiring);
          } catch (cause) {
            // Removal only ever shrinks the union to filters already accepted once — the
            // remaining taps' own — so this cannot hit the refusal the acquire path above guards
            // against; this is defensive. A release finalizer must never throw (it runs inside
            // `Effect.sync`, which does not catch), so the failure is only logged, the same
            // swallow-and-log shape `internal/DecisionRegistry.ts` uses for a hook detach failure.
            Effect.runFork(
              Effect.logError(
                "Could not reinstall the request taps after removing an observer",
                cause,
              ),
            );
          }
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
 * replaces did. Which decidables are stages, what a filter selects, and the wrapper that makes a
 * decider answer {@link Decision.Pass} for a request its own filter does not select all live in
 * `internal/RequestStages.ts`, which has no Electron in it, so `sewed/testing`'s owner stand-in
 * applies a feature's filter with this same code. The union filter above is only Electron's half of
 * the same question.
 *
 * Body assembly is the half that cannot move: it reads Electron's `uploadData` off this listener's
 * own details. It is per install and lives in the wrapper's `answer` step, so only a decider whose
 * filter asked for a body pays for one, the blob cache the listener put beside the event means a
 * blob is read once per request however many installs ask, and a body that cannot be read fails
 * *that* decider — which, on a stage declaring `failure: { kind: "block" }`, blocks the request
 * exactly as the hand-rolled listener this replaces did.
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
    const {
      ops,
      selects,
      urls,
      types,
      body: wanted,
    } = yield* RequestStages.door(decidable, filter);
    const answer = RequestStages.answerOf(decider);
    const filtered = RequestStages.filtered<Event, Answer, R>(
      ops,
      selects,
      wanted === undefined
        ? answer
        : (event) => {
            const carried = uploadFor(event);
            // `Effect.promise` turns a rejection into a defect, which is what the registry's own
            // `consult` treats as a failed decider — so an unreadable body contributes this stage's
            // declared `failure` rather than silently handing a decider a body it never got.
            return Effect.flatMap(
              Effect.promise(() => assembleBody(carried.parts, wanted, carried.blob)),
              (assembled) => answer({ ...event, body: assembled }),
            );
          },
    );
    const context = yield* Effect.context<R>();
    const wiring = wiringOf(native);
    const install: Install = { stage: ops.stage, urls, types };
    yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          const remove = registry.installOne(decidable, filtered, context);
          wiring.installs.add(install);
          try {
            reinstall(wiring, registry);
          } catch (cause) {
            // Both halves or neither: a decider registered without its stage's native listener is
            // a decider nothing consults, which is the failure the whole wave exists to end. But
            // rolling this install back is not enough on its own: `reinstall` above may already
            // have handed Electron a refused filter, and {@link restoreAfterRefusal}'s doc comment
            // is why the surviving installs' native listener is re-registered here regardless.
            wiring.installs.delete(install);
            remove();
            restoreAfterRefusal(`the "${ops.stage}" stage's request listeners`, () =>
              reinstall(wiring, registry),
            );
            throw cause;
          }
          return () => {
            remove();
            wiring.installs.delete(install);
            try {
              reinstall(wiring, registry);
            } catch (cause) {
              // Removal only ever shrinks the union to filters already accepted once — the
              // remaining installs' own — so this cannot hit the refusal the acquire path above
              // guards against; this is defensive. A release finalizer must never throw (it runs
              // inside `Effect.sync`, which does not catch), so the failure is only logged, the
              // same swallow-and-log shape `internal/DecisionRegistry.ts` uses for a hook detach
              // failure.
              Effect.runFork(
                Effect.logError(
                  `Could not reinstall the "${ops.stage}" stage's request listeners after removing a decider`,
                  cause,
                ),
              );
            }
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
