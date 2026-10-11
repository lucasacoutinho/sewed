import assert from "node:assert/strict";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { app, BrowserWindow as NativeWindow, MessageChannelMain, session } from "electron";
import { Cause, Deferred, Effect, Schema, Stream } from "effect";
import { Binding, Renderer, SewedError } from "sewed";
import { App, BrowserWindow, host } from "sewed/main";
import {
  binaryProtocol,
  binarySlot,
  idleSlots,
  jsonSlot,
  median,
  Payload,
  protocol,
  slots,
} from "./electron-protocol.mjs";

app.setPath("userData", join(import.meta.dirname, "electron-user-data"));
const program = Effect.gen(function* () {
  const ready = yield* Deferred.make();
  const begin = yield* Deferred.make();
  const report = yield* Deferred.make();
  const handlers = {
    echo: (value) => Effect.succeed(value),
    ready: () =>
      Effect.sync(() => {
        Deferred.doneUnsafe(ready, Effect.void);
      }),
    begin: () => Deferred.await(begin),
    report: (value) =>
      Effect.sync(() => {
        Deferred.doneUnsafe(report, Effect.succeed(value));
      }),
    reject: () =>
      Effect.fail(new SewedError({ code: "Protocol", message: "Expected benchmark failure" })),
  };
  const jsonOwner = yield* host(protocol, (implement) => implement(handlers));
  const binaryOwner = yield* host(binaryProtocol, (implement) => implement(handlers));
  const preload = session.defaultSession.registerPreloadScript({
    type: "frame",
    filePath: join(import.meta.dirname, "electron-raw.cjs"),
  });
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => session.defaultSession.unregisterPreloadScript(preload)),
  );
  const window = yield* BrowserWindow.make({
    title: "Sewed overhead benchmark",
    show: false,
    backgroundThrottling: false,
  });
  const native = NativeWindow.getAllWindows().find(
    (candidate) => candidate.getTitle() === "Sewed overhead benchmark",
  );
  assert.ok(native);
  const nativeCases = [
    {
      path: "electron",
      call: (index) => Effect.sync(() => native.setTitle(`title-${index & 1}`)),
      samples: [],
    },
    { path: "sewed", call: (index) => window.setTitle(`title-${index & 1}`), samples: [] },
  ];
  for (let round = 0; round < 9; round++) {
    for (let index = 0; index < nativeCases.length; index++) {
      const item = nativeCases[(index + round) % nativeCases.length];
      const start = performance.now();
      for (let call = 0; call < 2000; call++) yield* item.call(call);
      yield* Effect.promise(() => new Promise((resolve) => setImmediate(resolve)));
      const ms = performance.now() - start;
      assert.equal(native.getTitle(), "title-1");
      if (round >= 2) item.samples.push(ms);
    }
  }
  const nativeRows = nativeCases.map((item) => {
    const ms = median(item.samples);
    return {
      path: item.path,
      us: (ms * 1000) / 2000,
      madPct: (median(item.samples.map((sample) => Math.abs(sample - ms))) * 100) / ms,
    };
  });
  const original = native.getBounds;
  let stateReads = 0;
  native.getBounds = function () {
    stateReads++;
    return original.call(this);
  };
  yield* window.setTitle("without observers");
  const readsWithoutObservers = stateReads;
  native.getBounds = original;
  const first = yield* window.state.pipe(Stream.take(1), Stream.runCollect);
  assert.equal(first[0]?.title, "without observers");
  yield* window.setTitle("between subscriptions");
  const second = yield* window.state.pipe(Stream.take(1), Stream.runCollect);
  assert.equal(second[0]?.title, "between subscriptions");
  assert.equal((yield* window.current).title, native.getTitle());

  const channel = new MessageChannelMain();
  const decode = Schema.decodeUnknownSync(Payload);
  channel.port1.on("message", ({ data }) =>
    channel.port1.postMessage({ id: data.id, value: decode(data.payload) }),
  );
  channel.port1.start();
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      channel.port1.close();
      channel.port2.close();
    }),
  );
  yield* window.webContents.load(
    Renderer.entry(new URL("./electron.html", import.meta.url), { bindings: slots }),
    {
      bindings: [
        Binding.to(jsonSlot, jsonOwner),
        Binding.to(binarySlot, binaryOwner),
        ...idleSlots.map((slot) => Binding.to(slot, jsonOwner)),
      ],
    },
  );
  native.webContents.postMessage("benchmark:port", {}, [channel.port2]);
  yield* Deferred.await(ready);
  Deferred.doneUnsafe(begin, Effect.void);
  const result = yield* Deferred.await(report);
  if (!result.success) throw new Error(result.error);
  const ratios = [nativeRows[1].us / nativeRows[0].us];
  for (const row of result.rows) {
    if (row.path === "electron") continue;
    const direct = result.rows.find(
      (candidate) =>
        candidate.path === "electron" &&
        candidate.bytes === row.bytes &&
        candidate.idleBindings === row.idleBindings,
    );
    assert.ok(direct);
    ratios.push(row.us / direct.us);
    console.log(`METRIC ${row.path}_${row.bytes}_idle${row.idleBindings}_us=${row.us.toFixed(6)}`);
  }
  const overhead = Math.exp(
    ratios.reduce((sum, ratio) => sum + Math.log(ratio), 0) / ratios.length,
  );
  console.log(`METRIC electron_overhead_ratio=${overhead.toFixed(6)}`);
  console.log(`METRIC native_set_title_us=${nativeRows[1].us.toFixed(6)}`);
  console.log(`METRIC native_direct_set_title_us=${nativeRows[0].us.toFixed(6)}`);
  console.log(`METRIC state_reads_without_observers=${readsWithoutObservers}`);
  console.log(`ASI electron=${process.versions.electron}`);
  console.log(`ASI node=${process.versions.node}`);
  console.log(
    `BENCHMARK_ELECTRON ${JSON.stringify({ nativeRows, rows: result.rows, ratios, typedFailures: result.typedFailures, freshState: true, readsWithoutObservers })}`,
  );
});

App.run(
  [],
  Effect.gen(function* () {
    const result = yield* Effect.exit(program.pipe(Effect.timeout("150 seconds")));
    if (result._tag === "Failure") {
      console.error(Cause.pretty(result.cause));
      app.exit(1);
    } else app.quit();
  }),
);
