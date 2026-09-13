import { Cause } from "effect";
import { useAction, useClient, useStream } from "@sewed/react";
import { Clock, Controls } from "../shared/bindings.js";

export function App() {
  const clock = useClient(Clock, { connection: "shared" });
  const controls = useClient(Controls, { connection: "shared" });
  const ticks = useStream(() => clock.ticks(), [clock]);
  const thread = useAction(() => clock.thread());
  const maximize = useAction(() => controls.maximize());

  return (
    <main>
      <h1>Sewed</h1>
      <p>
        Worker ticks:{" "}
        {ticks.status === "value"
          ? ticks.value
          : ticks.status === "failure"
            ? Cause.pretty(ticks.cause)
            : "waiting"}
      </p>
      <p>
        <button type="button" onClick={() => thread.run()}>
          Ask the worker for its thread id
        </button>{" "}
        {thread.status === "success" ? `thread ${thread.value}` : thread.status}
      </p>
      <p>
        <button type="button" onClick={() => maximize.run()}>
          Maximize this window
        </button>
      </p>
    </main>
  );
}
