import type { WebContents } from "electron";
import { Effect, Schema } from "effect";
import type { Bound, Complete } from "../Binding.ts";
import type { Entry } from "../Renderer.ts";
import { MainContext } from "../RuntimeContext.ts";
import { SewedError } from "../SewedError.ts";
import { NavigationPolicy } from "../WebContents.ts";
import * as UrlRule from "../UrlRule.ts";
import { mainBridge } from "./MainBridge.ts";
import * as BindingContract from "./BindingContract.ts";
import { sink } from "./Diagnostics.ts";
import { core, decoded } from "./WebContentsCore.ts";

/** A renderer's web contents: the shared core plus the bridge, loading, and the URL-rule policy. */
export const webContents = (native: WebContents) =>
  Effect.gen(function* () {
    yield* MainContext;
    const lifetime = yield* Effect.scope;
    const bridge = mainBridge(native, lifetime, yield* sink);
    let boundDocument: string | undefined;
    let destinations: readonly ((url: URL) => boolean)[] = [];
    const { contents, control } = yield* core(native, {
      allows: (url) =>
        UrlRule.documentKey(url) === boundDocument || destinations.some((allows) => allows(url)),
    });
    // The bound document moved with the History API; a reload of that URL stays allowed.
    const inPage = (_event: Electron.Event, url: string, mainFrame: boolean) => {
      if (!mainFrame) return;
      const document = URL.parse(url);
      if (document) boundDocument = UrlRule.documentKey(document);
    };
    native.on("did-navigate-in-page", inPage);
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        native.off("did-navigate-in-page", inPage);
      }),
    );
    return {
      ...contents,
      setNavigationPolicy: (policy: NavigationPolicy) =>
        Effect.andThen(
          decoded("Invalid navigation policy", () =>
            Schema.decodeUnknownSync(NavigationPolicy)(policy).map(UrlRule.compile),
          ),
          (next) =>
            control.operation(() => {
              destinations = next;
            }),
        ),
      load: <Keys extends string, const B extends readonly Bound<Keys>[]>(
        entry: Entry<Keys> & Complete<Keys, B>,
        options: { readonly bindings: B },
      ) =>
        Effect.gen(function* () {
          yield* MainContext;
          yield* BindingContract.validate(
            entry.bindings.map((binding) => binding.key),
            options.bindings.map((binding) => binding.slot.key),
            "Window bindings do not match the renderer entry",
          );
          yield* control.operation(() => {
            boundDocument = UrlRule.documentKey(entry.url);
            bridge.configure(entry.url, options.bindings);
          });
          yield* Effect.tryPromise({
            try: () => native.loadURL(entry.url.href),
            catch: (cause) =>
              new SewedError({ code: "Native", message: "Could not load renderer", cause }),
          });
        }),
      reload: control.operation(() => {
        native.reload();
      }),
    };
  });
