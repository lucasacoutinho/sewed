import { Cause } from "effect";
import { useAction, useClient, useStream } from "@sewed/react";
import { Clock, Controls, Theme } from "../shared/bindings.js";

export function App() {
  const clock = useClient(Clock, { connection: "shared" });
  const controls = useClient(Controls, { connection: "shared" });
  const theme = useClient(Theme, { connection: "shared" });
  const ticks = useStream(() => clock.ticks(), [clock]);
  const thread = useAction(() => clock.thread());
  const maximize = useAction(() => controls.maximize());
  const themeState = useStream(() => theme.state(), [theme]);
  const setTheme = useAction((source: "system" | "light" | "dark") => theme.setSource({ source }));

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
      <p>
        Theme:{" "}
        {themeState.status === "value"
          ? `${themeState.value.source} (${themeState.value.shouldUseDarkColors ? "dark" : "light"})`
          : "waiting"}{" "}
        <button type="button" onClick={() => setTheme.run("dark")}>
          Dark
        </button>{" "}
        <button type="button" onClick={() => setTheme.run("system")}>
          System
        </button>
      </p>
    </main>
  );
}
