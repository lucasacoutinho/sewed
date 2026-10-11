import { Cause, Effect, Schema } from "effect";
import { Binding, Renderer } from "sewed";
import { binarySlot, idleSlots, jsonSlot, median, Payload, slots } from "./electron-protocol.mjs";

const decode = Schema.decodeUnknownSync(Payload);
const portReady = new Promise((resolve) => {
  const receive = (event) => {
    if (
      event.source !== window ||
      event.data?.type !== "benchmark:port" ||
      event.ports.length !== 1
    )
      return;
    window.removeEventListener("message", receive);
    resolve(event.ports[0]);
  };
  window.addEventListener("message", receive);
});

Renderer.run(
  Renderer.entry(new URL(location.href), { bindings: slots }),
  Effect.gen(function* () {
    const json = yield* Binding.deferred(jsonSlot);
    const binary = yield* Binding.deferred(binarySlot);
    const port = yield* Effect.promise(() => portReady);
    const waiting = new Map();
    let request = 0;
    port.onmessage = ({ data }) => {
      const resolve = waiting.get(data.id);
      if (!resolve) throw new Error("Unknown direct Electron reply");
      waiting.delete(data.id);
      resolve(decode(data.value));
    };
    port.start();
    const direct = (payload) =>
      Effect.promise(
        () =>
          new Promise((resolve) => {
            const id = request++;
            waiting.set(id, resolve);
            port.postMessage({ id, payload });
          }),
      );
    yield* json.ready();
    yield* json.begin();
    const result = yield* Effect.exit(
      Effect.gen(function* () {
        const warm = { sequence: -1, value: "open both measured connections" };
        yield* json.echo(warm);
        yield* binary.echo(warm);
        const rows = [];
        let opened = 0;
        for (const idleBindings of [0, 32]) {
          while (opened < idleBindings) {
            const idle = yield* Binding.deferred(idleSlots[opened++]);
            const echoed = yield* idle.echo(warm);
            if (echoed.sequence !== warm.sequence || echoed.value !== warm.value)
              throw new Error("Idle owner mismatch");
          }
          const cases = [];
          for (const bytes of [1024, 65536]) {
            const payload = { sequence: bytes, value: "x".repeat(bytes - 8) + '\u{10437}"\\\n' };
            for (const [path, call] of [
              ["electron", () => direct(payload)],
              ["json", () => json.echo(payload)],
              ["binary", () => binary.echo(payload)],
            ]) {
              cases.push({
                path,
                bytes,
                payload,
                call,
                iterations: bytes === 1024 ? 300 : 80,
                samples: [],
              });
            }
          }
          for (let round = 0; round < 7; round++) {
            for (let index = 0; index < cases.length; index++) {
              const item = cases[(index + round * 5) % cases.length];
              const start = performance.now();
              let last;
              for (let call = 0; call < item.iterations; call++) last = yield* item.call();
              const elapsed = performance.now() - start;
              if (last.sequence !== item.payload.sequence || last.value !== item.payload.value)
                throw new Error("Round trip changed the payload");
              if (round >= 2) item.samples.push(elapsed);
            }
          }
          for (const item of cases) {
            const ms = median(item.samples);
            rows.push({
              path: item.path,
              bytes: item.bytes,
              idleBindings,
              iterations: item.iterations,
              us: (ms * 1000) / item.iterations,
              madPct: (median(item.samples.map((sample) => Math.abs(sample - ms))) * 100) / ms,
            });
          }
        }
        for (const client of [json, binary]) {
          const failure = yield* Effect.exit(client.reject());
          const error =
            failure._tag === "Failure" ? Cause.findErrorOption(failure.cause) : undefined;
          if (error?._tag !== "Some" || error.value.code !== "Protocol")
            throw new Error("Declared RPC failure was lost");
        }
        if (waiting.size !== 0) throw new Error("Direct Electron replies remain pending");
        return { success: true, rows, typedFailures: true, activeConnections: [2, 34] };
      }),
    );
    yield* json.report(
      result._tag === "Success"
        ? result.value
        : { success: false, error: Cause.pretty(result.cause) },
    );
    yield* Effect.never;
  }),
);
