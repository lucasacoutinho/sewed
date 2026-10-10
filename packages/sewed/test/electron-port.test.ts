import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { SewedError } from "../src/SewedError.ts";
import { electronPort } from "../src/internal/ElectronPort.ts";

for (const stage of ["message", "close", "start"] as const) {
  test(`a port ${stage} failure removes listeners installed by the failed subscription`, () => {
    const cause = new Error("start refused");
    class Port extends EventEmitter {
      postMessage(_message: unknown) {}
      close() {
        this.emit("close");
      }
      start() {
        if (stage === "start") throw cause;
      }
    }
    const port = new Port();
    const connection = electronPort(port);
    const baseline = port.listenerCount("close");
    port.on("newListener", (event: string | symbol) => {
      if (event === stage) throw cause;
    });
    let closes = 0;
    assert.throws(
      () =>
        connection.subscribe(
          () => {},
          () => {
            closes += 1;
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof SewedError);
        assert.equal(error.code, "Protocol");
        assert.equal(error.cause, cause);
        return true;
      },
    );
    assert.equal(closes, 1);
    assert.equal(port.listenerCount("message"), 0);
    assert.equal(port.listenerCount("close"), baseline);
    connection.close();
    assert.equal(port.listenerCount("close"), 0);
  });
}
