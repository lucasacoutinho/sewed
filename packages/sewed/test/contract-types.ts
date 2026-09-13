import { Effect } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Binding, Renderer } from "../lib/index.js";
import { BrowserWindow, Utility, Worker } from "../lib/main.js";
import { Dependency, Protocol } from "./worker-definition-types.ts";

const Clock = Binding.slot("clock", Protocol);
const Compute = Binding.slot("compute", Protocol);
const Extra = Binding.slot("extra", Protocol);
const OtherProtocol = RpcGroup.make(Rpc.make("other"));
const url = new URL("file:///renderer.html");

const clockKey: "sewed/binding/clock" = Clock.key;
void clockKey;
// @ts-expect-error Slot keys are literal types.
const wrongKey: "sewed/binding/compute" = Clock.key;
void wrongKey;

Effect.gen(function* () {
  const clock = yield* Worker.spawn(Worker.entry(new URL("file:///clock.js"), Protocol));
  const compute = yield* Worker.spawn(Worker.entry(new URL("file:///compute.js"), Protocol));
  const window = yield* BrowserWindow.make();
  const entry = Renderer.entry(url, { bindings: [Clock, Compute] });
  const declared: Renderer.Entry<"sewed/binding/clock" | "sewed/binding/compute"> = entry;
  void declared;

  const complete = [Binding.to(Clock, clock), Binding.to(Compute, compute)] as const;
  yield* window.webContents.load(entry, { bindings: complete });

  const partial = [Binding.to(Clock, clock)] as const;
  // @ts-expect-error A declared slot without a binding is reported before Electron starts.
  yield* window.webContents.load(entry, { bindings: partial });

  const extra = [...complete, Binding.to(Extra, clock)] as const;
  // @ts-expect-error A binding for an undeclared slot is rejected.
  yield* window.webContents.load(entry, { bindings: extra });

  const loose: Renderer.Entry = entry;
  yield* window.webContents.load(loose, { bindings: partial });
});

const typedEntry = Worker.entry<typeof import("./worker-definition-types.ts")>(
  new URL("file:///worker.js"),
  Protocol,
);
const typedKeys: Worker.Entry<
  RpcGroup.Rpcs<typeof Protocol>,
  "sewed/binding/dependency"
> = typedEntry;
void typedKeys;
// @ts-expect-error The module's definition fixes the protocol an entry may name.
Worker.entry<typeof import("./worker-definition-types.ts")>(new URL("file:///w.js"), OtherProtocol);

const declaredEntry = Worker.entry(new URL("file:///worker.js"), Protocol, {
  bindings: [Dependency],
});

Effect.gen(function* () {
  const dependency = yield* Worker.spawn(Worker.entry(new URL("file:///d.js"), Protocol));
  yield* Worker.spawn(typedEntry, { bindings: [Binding.to(Dependency, dependency)] });
  yield* Worker.spawn(declaredEntry, { bindings: [Binding.to(Dependency, dependency)] });
  // @ts-expect-error A definition-typed entry requires its declared dependency.
  yield* Worker.spawn(typedEntry);
  // @ts-expect-error A declaration-typed entry requires its declared dependency.
  yield* Worker.spawn(declaredEntry);
  // @ts-expect-error A dependency the definition never declared is rejected.
  yield* Worker.spawn(typedEntry, { bindings: [Binding.to(Clock, dependency)] });
  const untyped = Worker.entry(new URL("file:///loose.js"), Protocol);
  yield* Worker.spawn(untyped);
  yield* Worker.spawn(untyped, { bindings: [Binding.to(Clock, dependency)] });
});

const utilityEntry = Utility.entry(new URL("file:///utility.js"), Protocol, {
  bindings: [Dependency],
});
Effect.gen(function* () {
  const dependency = yield* Worker.spawn(Worker.entry(new URL("file:///d.js"), Protocol));
  yield* Utility.spawn(utilityEntry, { bindings: [Binding.to(Dependency, dependency)] });
  // @ts-expect-error Utility entries check their declared dependencies the same way.
  yield* Utility.spawn(utilityEntry);
});
