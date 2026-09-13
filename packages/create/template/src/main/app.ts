import { Effect } from "effect";
import { Binding, Renderer } from "sewed";
import { App, BrowserWindow, Worker } from "sewed/main";
import { Clock, Controls, bindings } from "../shared/bindings.js";
import { ClockProtocol } from "../shared/contracts.js";

App.run(
  Effect.gen(function* () {
    const clock = yield* Worker.spawn(
      Worker.entry(new URL("../worker/clock.js", import.meta.url), ClockProtocol, {
        bindings: [],
      }),
    );
    const window = yield* BrowserWindow.make({ title: "Sewed", width: 960, height: 640 });
    const url = new URL(
      process.env.SEWED_RENDERER_URL ?? "../renderer/index.html",
      import.meta.url,
    );
    yield* window.webContents.load(Renderer.entry(url, { bindings }), {
      bindings: [Binding.to(Clock, clock), Binding.to(Controls, window.controls)],
    });
  }),
);
