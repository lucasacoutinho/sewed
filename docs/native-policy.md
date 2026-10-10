# The decision model

Electron asks your application to make decisions: can a window close, can a page navigate, or can an origin use the camera? Sewed gives those decisions a common model so separate features can contribute their own rules.

A **decidable** describes the question and how answers combine. A **decider** supplies an answer. Install the decider on the event's **owner** for an Effect scope, and its rule stays active for that scope. This guide explains the model used throughout the native APIs.

## A decidable is a declared question

`Decidables` is the catalog. Each entry is declared with `Decision.decidable`, and fixes everything
about the question that does not depend on who answers it:

| Declared      | What it fixes                                                                |
| ------------- | ---------------------------------------------------------------------------- |
| `key`         | the name in every diagnostic, such as `window/close`                         |
| `owner`       | which owner resolves the event, and so where a decider may install           |
| `event`       | the schema of what a decider is handed                                       |
| `answer`      | the schema of what a decider may say                                         |
| `fallback`    | what the resolution answers when nobody has an opinion                       |
| `failure`     | what a decider that breaks contributes, where that differs from the fallback |
| `timing`      | `"sync"` when Electron needs the answer inside its own callback              |
| `composition` | how several deciders combine: `first`, `restrictive`, or `chain`             |

A declaration is inert. Importing `Decidables` creates no native object, installs nothing, and reads
the same in main, in a renderer bundle, and in a Node test. `Decision.decidable` is public, but a
decidable declared outside the catalog has no native event behind it: Sewed resolves the catalog's
and nothing else. Through `decide`, one you declare yourself installs cleanly and is never
consulted; through a session's `intercept` it is refused outright, since a request stage with no
native listener behind it could never be resolved at all. So declaring your own is for a test
against a [stand-in](testing.md): `Testing.owner` and `Testing.contents` install and answer one, and
`Testing.requests` refuses it with `Protocol` exactly as the real `intercept` does, because its door
is the production door. No real owner ever answers one.

## Owners

A decidable names the owner that resolves its event, and a decider installs on that owner and
nowhere else.

| Owner                                 | Door                | Its decidables                                                                  |
| ------------------------------------- | ------------------- | ------------------------------------------------------------------------------- |
| the running application               | `App.decide`        | `Decidables.App.*`                                                              |
| a window                              | `window.decide`     | `Decidables.Window.Close`                                                       |
| a web contents, a guest view included | `contents.decide`   | `Decidables.WebContents.*`                                                      |
| a session                             | `session.decide`    | `Decidables.Session.Permission`, `.Preconnect`, `.Certificate`, `.DisplayMedia` |
| a session's request stages            | `session.intercept` | `Decidables.Session.Request`, `.RequestHeaders`, `.ResponseHeaders`             |

The key spells the owner too — `app/quit`, `window/close`, `contents/navigation`,
`session/permission` — and a declaration whose `owner` and key prefix disagree is refused.

Installing elsewhere is a compile error naming both owners, and a runtime refusal for a caller not
compiling against these types. It has to be, because the alternative is the quietest failure there
is: the decider registers, nothing ever consults it, and its decidable answers the fallback forever.
A window's close guard installed on `window.webContents` is a guard that does not guard.

A session is the one owner that holds two kinds. Its own events go through `session.decide`; the
three request stages name `owner: "requests"` and go through `session.intercept`, because that door
also takes a filter. Each door refuses the other's decidables.

Write a feature against the door it needs and nothing more. The minimal interface is
`Decision.Owner<O>` for `decide` and `Decision.Requests` for `intercept`, which is what makes a
feature portable between the real owner and a stand-in:

```ts
const allowDocs = (contents: Decision.Owner<"contents">) =>
  contents.decide(
    Decidables.WebContents.Navigation,
    Decision.policy(Navigation.Policy, [{ kind: "origin", origin: "https://docs.example" }]),
  );
```

Four of the five doors are methods on a handle, so a handle is already a `Decision.Owner`. The
application's is a free function, `App.decide`, because there is no application handle to hang it
on; a feature written against `Decision.Owner<"app">` is handed `{ decide: App.decide }`.

```ts
const stayOpen = (app: Decision.Owner<"app">) =>
  app.decide(
    Decidables.App.Quit,
    Decision.async(() => Effect.map(sync.pending, (busy) => (busy ? "deny" : Decision.Pass))),
  );

yield * stayOpen({ decide: App.decide });
```

## Deciders and timing

A decider is `Decision.sync(decide)` or `Decision.async(decide)`. Both take the event and return an
answer or `Decision.Pass`; an asynchronous one returns an Effect and runs with the services the
installing Effect had, so it can read application state or show a picker.

A `"sync"` decidable refuses an asynchronous decider at compile time. Electron requires the answer
inside its own callback for those events — a navigation, a download offer, a keystroke — and a
decider that might suspend could never honor that. A synchronous decider therefore cannot wait for
anything. `Decision.fromState(state, decide)` is how one reads main-owned state, where `state` is a
`SubscriptionRef` rather than a plain `Ref`: the read is atomic, and the value it sees is the one
current at the callback, never one an update in flight is about to replace.

```ts
yield *
  contents.decide(
    Decidables.WebContents.Input,
    Decision.fromState(locked, (state) => (state.locked ? "block" : Decision.Pass)),
  );
```

`Decision.fromRead(read, decide)` sits beside `fromState`, for state that does not live in a
`SubscriptionRef` — a mutable closure, a getter a framework already owns. `read` runs inside the
same callback and must be just as current:

```ts
yield *
  contents.decide(
    Decidables.WebContents.Input,
    Decision.fromRead(
      () => model.locked,
      (locked) => (locked ? "block" : Decision.Pass),
    ),
  );
```

`Decision.pass` is a decider that always passes, for a feature that installs a place-holder. The
natural spelling, `Decision.sync(() => Decision.Pass)`, installs too — `Decision.pass` stays the
explicit one for a standalone place-holder decider.

A decider's Effect has no error channel. A decider that needs a fallible call empties its own first
— `Effect.orDie`, for one — and a decider that dies is treated exactly like one that throws or
answers off-schema: see **Fallback and failure** below. A `Session.Request` decider's own
`request.readBody(options?)` is one such fallible call — `Effect<WebRequest.Body, SewedError>`,
failing `Limit` when the body would exceed its own `maxBytes` — so it takes `Effect.orDie` too; see
[session extras](session-extras.md) for the shape and its defaults.

## Composition

How several deciders combine is declared on the decidable, not chosen by whoever resolves it. Any
number of deciders may be installed on one decidable, and none of them needs to know the others
exist.

**`first` keeps the earliest non-`Pass` answer**, which is install order. `App.LastWindowClosed`
composes this way: the first feature with an opinion about closing the last window is the one that
gets it.

```ts
yield *
  App.decide(
    Decidables.App.LastWindowClosed,
    Decision.sync(() => "quit"),
  );
```

**`restrictive` ranks every answer and keeps the best-ranked**, so no decider can widen another's
denial. The order is declared beside the event — `["deny", "allow"]` for `Session.Permission` — and
an answer outside it never wins. Two features granting different permissions compose as a union of
grants; one feature's `"deny"` outranks every other's `"allow"`, whichever installed first.

```ts
yield *
  session.decide(
    Decidables.Session.Permission,
    Decision.sync(({ name, origin }) =>
      name === "notifications" && origin === "https://app.example" ? "allow" : Decision.Pass,
    ),
  );
```

**`chain` folds instead of ranking**: each decider sees the event the previous one produced, and an
answer the decidable lists in `stop` ends the resolution with later deciders unconsulted. The two
header stages compose this way, and a ranking cannot express what they need — two `headers` answers
rank equal, so under a ranking the first-installed would win and the second feature's headers would
vanish, which is Electron's own single-listener clobbering reintroduced one level up.

```ts
yield *
  session.intercept(
    Decidables.Session.RequestHeaders,
    { urls: ["https://*.example.com/*"] },
    Decision.sync(({ headers }) => ({
      kind: "headers",
      headers: { ...headers, "x-trace": traceId },
    })),
  );
```

Installed alongside another feature's authorization header, both land.

## Fallback and failure

They answer two different questions, and conflating them is safe only when the fallback happens to
be the closed answer.

- **`fallback`** is what the resolution answers when _nobody had an opinion_: no decider is
  installed, or every installed one passed. Under `restrictive` it is the floor rather than a
  participant — it answers only when no candidate survives at all.
- **`failure`** is what a _broken_ decider contributes: one that throws, dies, or answers something
  the decidable's own `answer` schema rejects. Undeclared, it is the effective fallback, so leaving
  it out changes nothing. A failing decider is always logged, naming the decidable's key and what it
  contributed.

`Window.Close` shows why they are separate. Its fallback is `"allow"` — nobody objecting closes the
window — while its failure is `"deny"`: an unsaved-changes guard that crashed has not established
that there is nothing to lose, and closing on the strength of a crash loses it.

| Decidable                 | Composition   | Nobody had an opinion                   | A decider broke     |
| ------------------------- | ------------- | --------------------------------------- | ------------------- |
| `App.Quit`                | `restrictive` | `allow`                                 | `deny`              |
| `App.LastWindowClosed`    | `first`       | `stay` on macOS, `quit` elsewhere       | contributes nothing |
| `App.Login`               | `first`       | `{ kind: "cancel" }`                    | contributes nothing |
| `App.CertificateError`    | `restrictive` | `reject`                                | `reject`            |
| `Window.Close`            | `restrictive` | `allow`                                 | `deny`              |
| `WebContents.Navigation`  | `restrictive` | `deny`                                  | `deny`              |
| `WebContents.Popup`       | `restrictive` | `deny`                                  | `deny`              |
| `WebContents.TitleUpdate` | `first`       | `keep`                                  | contributes nothing |
| `WebContents.Unload`      | `first`       | `honor`                                 | contributes nothing |
| `WebContents.Input`       | `restrictive` | `allow`                                 | `allow`             |
| `WebContents.Download`    | `restrictive` | `prompt` on a window, `deny` on a guest | `{ kind: "deny" }`  |
| `Session.Permission`      | `restrictive` | `deny`                                  | `deny`              |
| `Session.Preconnect`      | `restrictive` | `allow`                                 | `deny`              |
| `Session.Certificate`     | `restrictive` | `system`                                | `reject`            |
| `Session.DisplayMedia`    | `restrictive` | `{ kind: "deny" }`                      | `{ kind: "deny" }`  |
| `Session.Request`         | `restrictive` | `{ kind: "allow" }`                     | `{ kind: "block" }` |
| `Session.RequestHeaders`  | `chain`       | `{ kind: "allow" }`                     | `{ kind: "block" }` |
| `Session.ResponseHeaders` | `chain`       | `{ kind: "allow" }`                     | `{ kind: "block" }` |

Two entries in that table are not arbitrary. A `first` decidable cannot declare a failure at all —
declaring one is refused at the declaration — because there a broken decider contributes nothing:
contributing anything would let it both win outright and silence every later decider, which is the
composition's own meaning inverted.

And `WebContents.Input` is the only restrictive decidable whose broken-decider answer is the
**open** end of its own order. Declaring no `failure` is not what makes it unusual: six of the
restrictive decidables declare none and take their fallback instead. What is unusual is that
`Input`'s fallback is `allow`, the loosest answer it has, and that this is a choice — its closed
answer is `block`, asked of every keystroke and every click, so a buggy input decider that
contributed `block` would brick the application. A failing input decider contributes `allow` and
input keeps reaching the page: the one place in the catalog where a broken decider is the lesser
hazard.

The owner that builds a registry may override a decidable's fallback for itself, which is why
`WebContents.Download` has two postures: the catalog declares `deny`, a guest view keeps it, and a
plain web contents overrides it to `prompt` at its own construction site. A decidable that declares
no failure of its own follows that override too, so a per-owner posture stays one decision rather
than two.

That is also why `Download` declares a failure at all, where six other restrictive decidables do
not. A per-owner override moves the failure with it, so on a window a broken download decider would
have contributed `prompt` and handed the file to Electron's save dialog. It contributes
`{ kind: "deny" }` on both owners instead: a guard that vets a file and crashes has established
nothing about that file, whichever contents started the download.

## Grant or cap

**A decider with no opinion answers `Decision.Pass`.** That is the spelling almost every decider
wants.

Under `restrictive` composition, answering the closed value on a miss is not "declining" — it is a
veto. A permission decider that answers `"deny"` for every name it does not recognise outranks and
revokes every other feature's `"allow"`, for every permission and every origin, rather than only the
one it had an opinion about. Passing keeps a decider out of the way of one that has an opinion.

```ts
// A grant: it answers for what it matches and passes on the rest, so it composes with other grants.
Decision.sync(({ name, origin }) =>
  name === "geolocation" && origin === "https://maps.example" ? "allow" : Decision.Pass,
);

// A cap: it denies everything nothing else explicitly allowed, and no later decider can widen it.
Decision.sync(({ origin }) => (origin !== null && allowedOrigins.has(origin) ? "allow" : "deny"));
```

Both are valid. The second is written only when that veto is meant — a fixed ceiling no feature may
loosen — and never as a default spelling for "I have nothing to say".

## Policies

A policy is a grant list that compiles itself. `Navigation.Policy`, `Permission.Policy`, and
`Certificate.Policy` are declared once by the module that owns the matching, and a caller installs
one with rule data alone:

```ts
yield *
  contents.decide(
    Decidables.WebContents.Navigation,
    Decision.policy(Navigation.Policy, [
      { kind: "origin", origin: "https://example.com" },
      "https://*.example.com/*",
    ]),
  );
```

`Decision.policy(kind, rules)` decodes the rules through the policy's own schema and throws at
construction if they are invalid, before anything is installed. Rule data is usually static, so a
defect is the right failure mode there; a caller with dynamic rules wraps the call.

Every policy follows the grant rule above: it answers only for what its rules match and passes on
everything else, so two features' policies compose as a union of grants rather than vetoing each
other. Each compiles against the least it needs from an event, which is why `Navigation.Policy`
installs on both `Navigation` and `Popup`, and `Certificate.Policy` on both certificate decidables.
A cap is a plain `Decision.sync` decider, never a policy.

Each policy has its own rule vocabulary, because each matches a different thing.

**`Navigation.Policy`** takes an origin rule, a document rule, or a Chromium match pattern. An
origin rule names a canonical non-opaque origin such as `https://example.com`, with no path,
credentials, or wildcard; a scheme `Protocol.declare` registers as standard has scheme and host
as its origin, such as `jobwright://app`. A document rule selects an HTTP, HTTPS, file, or
registered-standard URL including its query string and excluding its fragment, which is what lets a
local packaged page be granted without treating every `file:` document as one origin. A match
pattern is Chromium's own syntax, `https://*.example.com/*`; `WebRequest.compilePattern` is exported
so an application can test its patterns against the matcher the library uses.

**`Permission.Policy`** takes the same origin and document rules, each with the `permissions` it
grants: `{ kind: "origin", origin, permissions: ["notifications"] }`. A rule naming `media` may
also narrow to `mediaTypes: ["audio"]` (or `["audio", "video"]`), naming which of Electron's
`audio`/`video` media types it grants; a media request is granted only when every type it asks for
is among them, and a rule with no `mediaTypes` still grants any media request, as before.
`mediaTypes` is refused at decode beside a rule that does not name `media` in its `permissions` —
the field would otherwise look like it narrows something it cannot reach.

`Decidables.Session.Permission`'s own event carries `mediaTypes` too:
`readonly ("audio" | "video")[]`, the request handler's own list where Electron's typing carries
one, else the check handler's singular `mediaType` as a one-element list, else empty — every
permission but `media`, and a check whose `mediaType` is `unknown` or absent, sees `[]`.

**`Certificate.Policy`** takes a bare hostname the WHATWG host parser can canonicalize — no scheme,
port, or path, within DNS's length bounds, with an optional leading `*.`, an internationalized host
in its punycode (`xn--`) form, or an IPv6 address in brackets — plus a `trust` of `"system"`,
`"always"`, or `{ fingerprint }`: `{ hostname: "*.internal.example", trust: { fingerprint } }`.

**Your own.** `Decision.definePolicy({ rules, compile })` is public and inert, and declares a policy
the same way the three above are declared: a schema for the rule data and the compile that turns it
into a decider. Reach for it when a grant list is worth reusing across features or validating as
data; a one-off decider is a plain `Decision.sync`.

```ts
export const TenantPolicy = Decision.definePolicy({
  rules: Schema.Array(Schema.Struct({ tenant: Schema.String })),
  compile: (rules) => (event: { readonly url: string }) =>
    rules.some(({ tenant }) => event.url.startsWith(`https://${tenant}.example/`))
      ? "allow"
      : Decision.Pass,
});
```

## Request stages

A session's three request stages are decidables like any other, installed through `session.intercept`
because that door also takes a filter:

```ts
yield *
  session.intercept(
    Decidables.Session.Request,
    { urls: ["https://*.tracker.example/*"], types: ["xhr", "script"] },
    Decision.sync(() => ({ kind: "block" })),
  );
```

The filter is required, and separate from the decidable, because it is a cost rather than a key: a
filter over every URL routes every request in the session through the main process, and naming the
scope at the call site is what keeps that visible. A decider is never asked about a request its own
filter does not select — it answers `Pass` for one — so two features with different filters compose
as declared instead of as a race. See
[session cookies, interception, and settings](session-extras.md) for bodies, the observation tap,
and the per-stage answer shapes.

Liveness on these three is the decider's own. A decider that _fails_ blocks its request; a decider
that never _settles_ leaves it unanswered and the page waits, and closing the installing scope does
not release a request already in flight. Bound a decider that can wait on anything with
`Effect.timeout` and let the timeout fail, so it blocks.

## Scope

`decide` and `intercept` install for the caller's scope and remove themselves when it closes. That
is the property every shape this model replaced lacked.

Precisely: a decider is not consulted by any resolution that _begins_ after its scope closes. A
resolution already in flight is unaffected — each one runs against a snapshot of the deciders
installed when it began — so a closing scope never makes a pending resolution answer with less than
it was consulting. Installing on an owner that has already closed fails `Closed` rather than
registering a decider nothing will consult.

Install a decider in the scope that owns the feature it belongs to, not in the owner's scope: that
is what makes removing the feature remove the decision.

## What a denial looks like

Nothing a decider denies is an error in main. `window.webContents.blocked` and `guest.blocked` are
observation streams of `WebContents.Blocked` values, `{ kind, url }`, one for each popup,
`<webview>`, main-frame navigation, and redirect a decision prevented, and for each download a
running decider denied. Each observer owns a bounded queue and fails with `Limit` when it overflows;
the stream ends when the web contents closes. Main's own explicit `load` is not a page-started
navigation and never appears there, and a guest's `navigate` call outside its policy is main's own
mistake, fails with `Protocol`, and is not reported there either.

A plain web contents keeps one allowance ahead of every decider: its explicitly loaded entry
document at its current same-document URL, so `load` and History moves within that document need no
decider. Every other main-frame destination and every redirect is decided. A guest view has no entry
document and no allowance, so every navigation it starts is decided. Subframe navigation is outside
this model entirely; subframes never receive a Sewed bridge or a permission grant.

Allowing a navigation does not grant bindings. The bridge stays tied to its configured document at
its current same-document URL, and a full navigation disconnects its clients; to bind a new
document, main explicitly loads its `Renderer.entry` with the selected owners.

## Testing a decider

`sewed/testing` stands in for an owner, with no Electron and no native object. There are three
constructors, and each publishes **exactly the doors its production owner has**:

| Stand-in                                                | Doors                                  | Why                                                                                                        |
| ------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Testing.owner("app" \| "window" \| "session")`         | `decide`, `resolve`                    | those three real owners build a bare registry                                                              |
| `Testing.contents({ of: "window" \| "guest", input? })` | `decide`, `resolve`                    | a web contents has no posture-free form in production                                                      |
| `Testing.requests()`                                    | `intercept`, `resolve`, `resolveChain` | a session installs a request stage through `intercept` alone, and both chain decidables are request stages |

A stand-in carries **the posture of the owner it names**, which is why a web contents says whose it
is. Both real contents build their registry with a construction-time fallback of their own — a
window's prompts for a download, a guest's denies, and a guest created with `input: "block"` blocks
input — and a decider that passes on a miss answers exactly that fallback, so a download test
written against the wrong posture asserts the wrong thing while looking right. The two postures are
not restated in the testing layer: it calls the same two functions the real owners call. For the
application, a window and a session the catalog fallback is faithful, because their real owners
build a bare registry too.

A stand-in also carries no door its owner lacks. `Testing.requests()` has no `decide`, because
`session.decide` refuses a request stage and a stage decider installed without a filter is a shape
production cannot produce; a test that wants every request writes
`{ urls: ["<all_urls>"] }` and says so. `resolveChain` is on that stand-in alone, because both chain
decidables in the catalog are request stages.

```ts
import * as Testing from "sewed/testing";

const contents = Testing.contents({ of: "window" });
yield * allowDocs(contents);
const allowed =
  yield *
  contents.resolve(Decidables.WebContents.Navigation, {
    url: "https://docs.example/start",
    kind: "navigation",
  });
```

Nothing there is a fake: the registry, the scoped install, the composition, the answer decode, the
declared `failure` a broken decider contributes, the owner's own posture, and the removal a closing
scope performs are the production ones. A feature written against `Decision.Owner<"contents">` takes
a real window's `webContents` and this stand-in alike, which is the point — write the feature against
the door, and the test exercises the code that ships.

`resolve` answers a decidable that ranks its answers; `resolveChain`, on the request-stage stand-in,
returns a `ChainOutcome` for one that folds them — either the answer that stopped it or the event
every decider folded into. Each constructor call builds its own registry, so one test's deciders are
invisible to another's and there is nothing to reset. See
[testing through public APIs](testing.md).

## Where each decidable is documented

[Application lifecycle](app-lifecycle.md) covers `Decidables.App` and `Decidables.Window.Close`.
[Web contents lifecycle](webcontents-lifecycle.md) and [guest views](guest-views.md) cover
`Decidables.WebContents`, which the two of them see differently: a window's contents prompts for a
download and keeps an entry-document allowance, a guest denies and has neither. [Session cookies,
interception, and settings](session-extras.md) covers `Decidables.Session`, and [platform-specific
surfaces](platform-surfaces.md) covers the screen-share decidable beside the capturer it picks from.
[The API and lifecycle contract](api.md) states the owner rule beside the rest of the public
surface.

The native behavior follows the
[Electron permission contract](https://github.com/electron/electron/blob/main/docs/api/session.md)
and [navigation and window-opening events](https://www.electronjs.org/docs/latest/api/web-contents).
The playground's `verify:sessions` distinguishes real browser checks from injected native callback
metadata, and checks denial, granting, replacement, isolation, subframes, navigation, redirects, and
explicit rebinding on Linux and X11.
