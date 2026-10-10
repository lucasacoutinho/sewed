import { Effect } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Binding, Renderer } from "sewed";
import type { BrowserWindow } from "sewed/main";

declare const window: BrowserWindow.Handle;
const Protocol = RpcGroup.make(Rpc.make("ping"));
const CrashScreen = Binding.slot("renderer-types/crash-screen", Protocol);

// `local` resolves the path against the given module URL, exactly as `entry` would, and carries
// the given bindings' keys.
const local = Renderer.local("crash/index.html", "file:///app/lib/main.js", {
  bindings: [CrashScreen],
});
const declaredLocal: Renderer.Entry<"sewed/binding/renderer-types/crash-screen"> = local;
void declaredLocal;

// With no options, `local` declares no binding keys.
const bareLocal = Renderer.local("documents/local.html", "file:///app/lib/main.js");
const declaredBareLocal: Renderer.Entry<never> = bareLocal;
void declaredBareLocal;

// `inline` is `Entry<never>`: a document with nothing behind it declares no binding keys.
const parked: Renderer.Entry<never> = Renderer.inline("<!doctype html><title>Stopped</title>");
void parked;

declare const bound: Binding.Bound<"sewed/binding/renderer-types/crash-screen">;

Effect.gen(function* () {
  yield* window.webContents.load(local, { bindings: [bound] });

  // @ts-expect-error An inline document declares no bindings; nothing can be bound to it.
  yield* window.webContents.load(parked, { bindings: [bound] });
});
