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
  configuration,
  idleSlots,
  jsonSlot,
  madPct,
  median,
  Payload,
  protocol,
  RawRequest,
  Report,
  slots,
} from "./electron-protocol.mjs";

/** @param {readonly number[]} values */
const geometricMean = (values) => {
  assert.ok(values.length > 0 && values.every((value) => Number.isFinite(value) && value > 0));
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
};

app.setPath("userData", join(import.meta.dirname, "electron-user-data"));
const program = Effect.gen(function* () {
  assert.equal(process.type, "browser");
  /** @type {Deferred.Deferred<void>} */
  const ready = yield* Deferred.make();
  /** @type {Deferred.Deferred<void>} */
  const begin = yield* Deferred.make();
  /** @type {Deferred.Deferred<typeof Report.Type>} */
  const report = yield* Deferred.make();
  const handlers = {
    /** @param {typeof Payload.Type} value */
    echo: (value) => Effect.succeed(value),
    ready: () =>
      Effect.sync(() => {
        Deferred.doneUnsafe(ready, Effect.void);
      }),
    begin: () => Deferred.await(begin),
    /** @param {typeof Report.Type} value */
    report: (value) =>
      Effect.sync(() => {
        Deferred.doneUnsafe(report, Effect.succeed(value));
      }),
    reject: () =>
      Effect.fail(
        new SewedError({
          code: "Protocol",
          message: "Expected benchmark failure",
          reason: "benchmark/expected",
        }),
      ),
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
  const rawNative = yield* Effect.acquireRelease(
    Effect.sync(
      () =>
        new NativeWindow({
          show: false,
          webPreferences: {
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            backgroundThrottling: false,
          },
        }),
    ),
    (resource) =>
      Effect.sync(() => {
        if (!resource.isDestroyed()) resource.destroy();
      }),
  );
  /** @type {number[]} */
  const directSamples = [];
  /** @type {number[]} */
  const sewedSamples = [];
  const nativeCases = [
    {
      path: "electron",
      samples: directSamples,
      native: rawNative,
      run: Effect.sync(() => {
        const start = performance.now();
        for (let call = 0; call < configuration.nativeCalls; call++)
          rawNative.setTitle(`title-${call & 1}`);
        return ((performance.now() - start) * 1000) / configuration.nativeCalls;
      }),
    },
    {
      path: "sewed",
      samples: sewedSamples,
      native,
      run: Effect.gen(function* () {
        const start = performance.now();
        for (let call = 0; call < configuration.nativeCalls; call++)
          yield* window.setTitle(`title-${call & 1}`);
        return ((performance.now() - start) * 1000) / configuration.nativeCalls;
      }),
    },
  ];
  for (let round = 0; round < configuration.warmups + configuration.samples; round++) {
    for (let index = 0; index < nativeCases.length; index++) {
      const item = nativeCases[(index + round) % nativeCases.length];
      assert.ok(item);
      const us = yield* item.run;
      assert.equal(item.native.getTitle(), "title-1");
      yield* Effect.promise(() => new Promise((resolve) => setImmediate(resolve)));
      if (round >= configuration.warmups) item.samples.push(us);
    }
  }
  rawNative.destroy();
  const nativeRows = nativeCases.map((item) => ({
    path: item.path,
    us: median(item.samples),
    madPct: madPct(item.samples),
    samples: item.samples,
  }));
  const original = native.getBounds;
  let stateReads = 0;
  native.getBounds = function () {
    stateReads++;
    return original.call(this);
  };
  yield* window.setTitle("without observers");
  yield* Effect.promise(() => new Promise((resolve) => setImmediate(resolve)));
  const readsWithoutObservers = stateReads;
  native.getBounds = original;
  const first = yield* window.state.pipe(Stream.take(1), Stream.runCollect);
  assert.equal(first[0]?.title, "without observers");
  yield* window.setTitle("between subscriptions");
  const second = yield* window.state.pipe(Stream.take(1), Stream.runCollect);
  assert.equal(second[0]?.title, "between subscriptions");
  assert.equal((yield* window.current).title, native.getTitle());

  const channel = new MessageChannelMain();
  const decode = Schema.decodeUnknownSync(RawRequest);
  channel.port1.on("message", ({ data }) => {
    const request = decode(data);
    channel.port1.postMessage({ id: request.id, value: request.payload });
  });
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
  const rendererProcess = native.webContents.getOSProcessId();
  assert.ok(rendererProcess > 0 && rendererProcess !== process.pid);
  native.webContents.postMessage("benchmark:port", {}, [channel.port2]);
  yield* Deferred.await(ready);
  Deferred.doneUnsafe(begin, Effect.void);
  const result = yield* Deferred.await(report);
  if (!result.success) throw new Error(result.error);
  assert.equal(
    result.rows.length,
    configuration.payloadBytes.length * configuration.idleBindings.length * 3,
  );
  assert.equal(
    new Set(result.rows.map((row) => `${row.path}/${row.bytes}/${row.idleBindings}`)).size,
    result.rows.length,
  );
  const rows = result.rows.map((row) => {
    assert.equal(row.samples.length, configuration.samples);
    assert.equal(row.baselines.length, configuration.samples);
    assert.ok(configuration.payloadBytes.includes(row.bytes));
    assert.ok(configuration.idleBindings.includes(row.idleBindings));
    assert.equal(
      row.iterations,
      row.bytes === 1024 ? configuration.smallCalls : configuration.largeCalls,
    );
    return { ...row, us: median(row.samples), madPct: madPct(row.samples) };
  });
  const directNative = nativeRows[0];
  const sewedNative = nativeRows[1];
  assert.ok(directNative && sewedNative);
  /** @type {number[]} */
  const ratios = [];
  /** @type {number[][]} */
  const roundRatios = Array.from({ length: configuration.samples }, () => []);
  for (const row of rows) {
    if (row.path === "electron") continue;
    /** @type {number[]} */
    const paired = [];
    for (let index = 0; index < configuration.samples; index++) {
      const sample = row.samples[index];
      const baseline = row.baselines[index];
      const round = roundRatios[index];
      assert.ok(sample !== undefined && baseline !== undefined && round !== undefined);
      const ratio = sample / baseline;
      paired.push(ratio);
      round.push(ratio);
    }
    ratios.push(median(paired));
  }
  /** @type {Array<[string, number]>} */
  const metrics = [
    ["electron_overhead_ratio", geometricMean(ratios)],
    ["electron_overhead_mad_pct", madPct(roundRatios.map(geometricMean))],
    ["native_set_title_us", sewedNative.us],
    ["native_direct_set_title_us", directNative.us],
    ["native_set_title_overhead_ratio", sewedNative.us / directNative.us],
    ["native_set_title_mad_pct", sewedNative.madPct],
    ["native_direct_set_title_mad_pct", directNative.madPct],
    ["state_reads_without_observers", readsWithoutObservers],
  ];
  for (const row of rows)
    metrics.push([`${row.path}_${row.bytes}_idle${row.idleBindings}_us`, row.us]);
  return {
    window,
    native,
    metrics,
    benchmark: {
      configuration,
      nativeRows,
      rows,
      ratios,
      typedFailures: result.typedFailures,
      freshState: true,
      readsWithoutObservers,
      rendererProcess,
    },
  };
});

App.run(
  [],
  Effect.gen(function* () {
    const result = yield* Effect.exit(
      Effect.gen(function* () {
        const measurement = yield* Effect.scoped(program);
        assert.ok(measurement.native.isDestroyed());
        assert.equal(NativeWindow.getAllWindows().length, 0);
        const closed = yield* measurement.window.setTitle("after scope closure").pipe(Effect.flip);
        assert.equal(closed.code, "Closed");
        return measurement;
      }).pipe(Effect.timeout("150 seconds")),
    );
    if (result._tag === "Failure") {
      console.error(Cause.pretty(result.cause));
      app.exit(1);
    } else {
      for (const [name, value] of result.value.metrics) {
        assert.ok(Number.isFinite(value) && value >= 0);
        console.log(`METRIC ${name}=${value.toFixed(6)}`);
      }
      console.log(`ASI electron=${process.versions.electron}`);
      console.log(`ASI node=${process.versions.node}`);
      console.log(
        `BENCHMARK_ELECTRON ${JSON.stringify({ ...result.value.benchmark, scopeClosed: true })}`,
      );
      app.quit();
    }
  }),
);
