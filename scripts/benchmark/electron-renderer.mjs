import { Cause, Effect, Schema } from "effect";
import { Binding, Renderer } from "sewed";
import {
  binarySlot,
  configuration,
  idleSlots,
  jsonSlot,
  Measurement,
  RawReply,
  slots,
} from "./electron-protocol.mjs";

/** @typedef {typeof RawReply.Type.value} Echo */

const decodeReply = Schema.decodeUnknownSync(RawReply);
const isPortSignal = Schema.is(Schema.Struct({ type: Schema.Literal("benchmark:port") }));
/** @type {Promise<MessagePort>} */
const portReady = new Promise((resolve) => {
  /** @param {MessageEvent<unknown>} event */
  const receive = (event) => {
    const port = event.ports[0];
    if (
      event.source !== window ||
      !isPortSignal(event.data) ||
      event.ports.length !== 1 ||
      port === undefined
    )
      return;
    window.removeEventListener("message", receive);
    resolve(port);
  };
  window.addEventListener("message", receive);
});

/** @param {readonly Echo[]} replies @param {readonly Echo[]} payloads */
const validate = (replies, payloads) => {
  if (replies.length !== payloads.length) throw new Error("Round trip lost a reply");
  for (let index = 0; index < payloads.length; index++) {
    const expected = payloads[index];
    const actual = replies[index];
    if (
      expected === undefined ||
      actual === undefined ||
      actual.sequence !== expected.sequence ||
      actual.value !== expected.value
    )
      throw new Error(`Round trip changed payload ${index}`);
  }
};

/** @param {readonly Echo[]} payloads @param {(payload: Echo) => Promise<Echo>} call */
const measureRaw = async (payloads, call) => {
  /** @type {Echo[]} */
  const replies = [];
  const start = performance.now();
  for (const payload of payloads) replies.push(await call(payload));
  const us = ((performance.now() - start) * 1000) / payloads.length;
  validate(replies, payloads);
  return us;
};

/**
 * @template E, R
 * @param {readonly Echo[]} payloads
 * @param {(payload: Echo) => Effect.Effect<Echo, E, R>} call
 */
const measureSewed = (payloads, call) =>
  Effect.gen(function* () {
    /** @type {Echo[]} */
    const replies = [];
    const start = performance.now();
    for (const payload of payloads) replies.push(yield* call(payload));
    const us = ((performance.now() - start) * 1000) / payloads.length;
    validate(replies, payloads);
    return us;
  });

Renderer.run(
  Renderer.entry(new URL(location.href), { bindings: slots }),
  Effect.gen(function* () {
    const json = yield* Binding.deferred(jsonSlot);
    const binary = yield* Binding.deferred(binarySlot);
    const port = yield* Effect.promise(() => portReady);
    yield* Effect.addFinalizer(() => Effect.sync(() => port.close()));
    /** @type {Map<number, (reply: Echo) => void>} */
    const waiting = new Map();
    let request = 0;
    port.onmessage = (event) => {
      const reply = decodeReply(event.data);
      const resolve = waiting.get(reply.id);
      if (resolve === undefined) throw new Error("Unknown direct Electron reply");
      waiting.delete(reply.id);
      resolve(reply.value);
    };
    port.start();
    /** @param {Echo} payload @returns {Promise<Echo>} */
    const direct = (payload) =>
      new Promise((resolve) => {
        const id = request++;
        waiting.set(id, resolve);
        port.postMessage({ id, payload });
      });
    yield* json.ready();
    yield* json.begin();
    const result = yield* Effect.exit(
      Effect.gen(function* () {
        const warm = { sequence: -1, value: "open all measured connections" };
        validate([yield* json.echo(warm), yield* binary.echo(warm)], [warm, warm]);
        validate([yield* Effect.promise(() => direct(warm))], [warm]);
        /** @type {Array<typeof Measurement.Type>} */
        const rows = [];
        let opened = 0;
        const utf8 = new TextEncoder();
        const suffix = '\u{10437}"\\\n';
        for (const idleBindings of configuration.idleBindings) {
          while (opened < idleBindings) {
            const slot = idleSlots[opened++];
            if (slot === undefined) throw new Error("Missing idle binding");
            const idle = yield* Binding.deferred(slot);
            validate([yield* idle.echo(warm)], [warm]);
          }
          const cases = [];
          for (const bytes of configuration.payloadBytes) {
            const value = "x".repeat(bytes - utf8.encode(suffix).byteLength) + suffix;
            if (utf8.encode(value).byteLength !== bytes) throw new Error("Payload size mismatch");
            const iterations = bytes === 1024 ? configuration.smallCalls : configuration.largeCalls;
            const payloads = Array.from({ length: iterations }, (_, sequence) => ({
              sequence,
              value,
            }));
            /** @type {number[]} */
            const rawSamples = [];
            /** @type {number[]} */
            const jsonSamples = [];
            /** @type {number[]} */
            const jsonBaselines = [];
            /** @type {number[]} */
            const binarySamples = [];
            /** @type {number[]} */
            const binaryBaselines = [];
            cases.push({
              bytes,
              iterations,
              rawSamples,
              raw: Effect.promise(() => measureRaw(payloads, direct)),
              comparisons: [
                Object.freeze({
                  path: "json",
                  samples: jsonSamples,
                  baselines: jsonBaselines,
                  run: measureSewed(payloads, (payload) => json.echo(payload)),
                }),
                Object.freeze({
                  path: "binary",
                  samples: binarySamples,
                  baselines: binaryBaselines,
                  run: measureSewed(payloads, (payload) => binary.echo(payload)),
                }),
              ],
            });
          }
          for (let round = 0; round < configuration.warmups + configuration.samples; round++) {
            for (let index = 0; index < cases.length; index++) {
              const group = cases[(index + round) % cases.length];
              if (group === undefined) throw new Error("Missing benchmark case");
              let baseline = yield* group.raw;
              let rawTotal = baseline;
              for (let offset = 0; offset < group.comparisons.length; offset++) {
                const item = group.comparisons[(offset + round) % group.comparisons.length];
                if (item === undefined) throw new Error("Missing benchmark comparison");
                const us = yield* item.run;
                const after = yield* group.raw;
                if (round >= configuration.warmups) {
                  item.samples.push(us);
                  item.baselines.push((baseline + after) / 2);
                }
                rawTotal += after;
                baseline = after;
              }
              if (round >= configuration.warmups)
                group.rawSamples.push(rawTotal / (group.comparisons.length + 1));
            }
          }
          for (const group of cases) {
            rows.push({
              path: "electron",
              bytes: group.bytes,
              idleBindings,
              iterations: group.iterations,
              samples: group.rawSamples,
              baselines: group.rawSamples,
            });
            for (const item of group.comparisons) {
              rows.push({
                path: item.path,
                bytes: group.bytes,
                idleBindings,
                iterations: group.iterations,
                samples: item.samples,
                baselines: item.baselines,
              });
            }
          }
        }
        for (const client of [json, binary]) {
          const failure = yield* Effect.exit(client.reject());
          const error =
            failure._tag === "Failure" ? Cause.findErrorOption(failure.cause) : undefined;
          if (
            error?._tag !== "Some" ||
            error.value.code !== "Protocol" ||
            error.value.reason !== "benchmark/expected"
          )
            throw new Error("Declared RPC failure was lost");
        }
        if (waiting.size !== 0) throw new Error("Direct Electron replies remain pending");
        return { rows };
      }),
    );
    yield* json.report(
      result._tag === "Success"
        ? { success: true, rows: result.value.rows, typedFailures: true }
        : { success: false, error: Cause.pretty(result.cause) },
    );
    yield* Effect.never;
  }),
);
