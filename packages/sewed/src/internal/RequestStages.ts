import type { WebRequestFilter } from "electron";
import { Effect, Schema } from "effect";
import * as Decidables from "../Decidables.ts";
import * as Decision from "../Decision.ts";
import { SewedError } from "../SewedError.ts";
import * as WebRequest from "../WebRequest.ts";

/**
 * Everything the two intercept doors share, with no Electron in it: which decidables are request
 * stages, what a filter selects, and the wrapper that makes a decider pass on a request its own
 * filter does not select.
 *
 * It is a module of its own because both doors need all three and only one of them has a native
 * session. `internal/WebRequest.ts` adds the native half — the listeners, the union filter, and
 * upload assembly — and `sewed/testing`'s owner stand-in adds nothing, so a feature's filter is
 * exercised in a Node test by the same code that applies it in production. Body *assembly* stays
 * native: it reads Electron's `uploadData` off the request listener's own details, so a test hands
 * its decider the `body` it wants it to see instead.
 */

/** The three native stages a decider can be installed on, named as Electron names its listeners. */
export type Stage = "request" | "requestHeaders" | "responseHeaders";

/**
 * What a door needs to know about a request stage that its `Decidable` type does not carry: which
 * native listener's union filter its installs join, how to read the url and resource type a filter
 * matches against, and whether a `body` option means anything on it.
 *
 * All three stages share one `target`, because all three events carry the same `requestFields`. It
 * is declared with **method** syntax deliberately, for the reason `internal/DecisionRegistry.ts`'s
 * `Entry` gives at length: TypeScript checks a method's parameter bivariantly, so a reader written
 * against those three concrete event types fills this erased `(event: unknown) => …` slot with no
 * cast and no decode. Calling it back is sound because the only events that reach it are the ones a
 * request listener builds or a test writes to the decidable's own event schema, and a chain's
 * `advance` copies `url` and `resourceType` across unchanged — which is why a header decider's
 * filter still matches on the fold's later rounds.
 */
export interface StageOps {
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
 * closing the gap structurally instead of by remembering to.
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
 * What the doors know about each stage, one entry per derived key. The value keeps the decidable
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
 * The stages the doors resolve, by decidable identity. A door refuses anything absent from it,
 * which the type above cannot do on its own: `Decision.decidable` is public, so a consumer can
 * declare their own decidable with `owner: "requests"` and a `session/` key outside the catalog
 * entirely, and that one would install cleanly into the registry and never be resolved by anything —
 * the silent-inert-decider failure this whole wave exists to end, one owner further along. The
 * mapped type covers the catalog; this covers everything else.
 */
const stages = new WeakMap<object, StageOps>(Object.values(stageTable));

const decodeFilter = Schema.decodeUnknownSync(WebRequest.Filter);

/** The refusal shape both doors report invalid input with, before anything is installed. */
export const protocolError = (message: string, cause?: unknown): SewedError =>
  new SewedError({ code: "Protocol", message, ...(cause === undefined ? {} : { cause }) });

/**
 * One native listener per stage — and, on the observation side, one per tap — covers the union of
 * every filter joined onto it, because Electron accepts exactly one listener per `webRequest` event
 * per session. An install that names no resource types widens the native filter to every type,
 * since it asked for every type; an install that names `"other"` widens it to every type too, for a
 * different reason: Electron's own registration *throws* on the literal `"other"` in a `types`
 * array (`TypeError: Invalid type other`), so `"other"` cannot appear in what this function hands
 * Electron. Simply deleting it from the union is not enough — if some other install on the same
 * stage still names a valid, restrictive type, the resulting filter would deliver exactly that
 * type and nothing else, and Electron would never hand the shared listener a request it has
 * labelled `"other"` at all, silently starving that install's decider of every request it exists to
 * see. So an install naming `"other"` forces the *whole* union open, exactly like an install naming
 * no types: Electron cannot itself filter by `"other"`, and {@link door}'s own per-install `selects`
 * (which does know `"other"`) is what narrows the over-delivery back down once Electron hands the
 * shared listener everything.
 *
 * The result never contains `"other"` — Electron's own `WebRequestFilter.types` type has no such
 * member — and "every type" is always expressed by omitting `types` entirely, never by an empty
 * array: Electron treats `types: []`, `undefined`, and no `types` key alike, as "no restriction",
 * so an empty array would only be a less obvious spelling of the same thing.
 */
export const unionFilter = (
  entries: readonly {
    readonly urls: readonly string[];
    readonly types: readonly string[] | undefined;
  }[],
): WebRequestFilter | undefined => {
  if (entries.length === 0) return undefined;
  const urls = [...new Set(entries.flatMap((entry) => entry.urls))];
  const wanted = new Set(entries.flatMap((entry) => entry.types ?? []));
  const everything = entries.some((entry) => entry.types === undefined) || wanted.has("other");
  const types = everything
    ? undefined
    : [...wanted].filter(
        (type): type is Exclude<WebRequest.ResourceType, "other"> => type !== "other",
      );
  return types === undefined ? { urls } : { urls, types };
};

/**
 * What one install's filter comes to, checked against the stage it is for: the stage's own ops,
 * the predicate that says whether one request is selected, and the parts the native half needs to
 * join into a listener's union filter.
 */
export interface Door {
  readonly ops: StageOps;
  readonly selects: (url: string, type: string) => boolean;
  readonly urls: readonly string[];
  readonly types: readonly string[] | undefined;
  readonly body: WebRequest.BodyFilter | undefined;
}

/**
 * Everything both doors work out before anything is installed, in one place so neither can drift:
 * the decidable must be one of the three stages, the filter must decode, and a `body` option must
 * be on the one stage that carries upload data. Each of the three is a `Protocol` failure rather
 * than a silently ignored option, because each of them describes a decider that would install and
 * then never be asked what it was installed to answer.
 */
export const door = (
  decidable: Pick<Decision.Decidable<never, unknown, "async">, "key">,
  filter: WebRequest.Filter,
): Effect.Effect<Door, SewedError> =>
  Effect.gen(function* () {
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
    const patterns = settings.urls.map(WebRequest.compilePattern);
    const types = settings.types === undefined ? undefined : new Set<string>(settings.types);
    return {
      ops,
      selects: (url: string, type: string) => {
        if (types !== undefined && !types.has(type)) return false;
        const parsed = URL.parse(url);
        return parsed !== null && patterns.some((allows) => allows(parsed));
      },
      urls: settings.urls,
      types: settings.types,
      body: settings.body,
    };
  });

/** What a decider answers for one event, whichever timing it was written with. */
export const answerOf =
  <Event, Answer, R>(decider: Decision.Decider<Event, Answer, R>) =>
  (event: Event): Effect.Effect<Answer | Decision.Pass, never, R> =>
    decider._tag === "sync" ? Effect.sync(() => decider.decide(event)) : decider.decide(event);

/**
 * One decider, wrapped so a request its own filter does not select answers {@link Decision.Pass}
 * rather than reaching it. That is what lets the composition see exactly the deciders that had an
 * opinion to have: two features on one stage, with different filters, compose as declared instead
 * of as a race, and Electron's own union filter is only the other half of the same question.
 *
 * `answer` is what happens once the filter selects, and is the one thing the two doors differ on:
 * the native door assembles a body first when its filter asked for one, and the stand-in calls the
 * decider directly.
 */
export const filtered = <Event, Answer, R>(
  ops: StageOps,
  selects: (url: string, type: string) => boolean,
  answer: (event: Event) => Effect.Effect<Answer | Decision.Pass, never, R>,
): Decision.Async<Event, Answer, R> =>
  Decision.async((event) =>
    Effect.suspend(() => {
      const { url, type } = ops.target(event);
      return selects(url, type) ? answer(event) : Effect.succeed(Decision.Pass);
    }),
  );
