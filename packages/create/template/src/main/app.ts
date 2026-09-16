import { Effect } from "effect";
import { Binding, Capability, Renderer } from "sewed";
import { App, BrowserWindow, NativeTheme, WindowControls, Worker } from "sewed/main";
import { Clock, Controls, Theme, bindings } from "../shared/bindings.js";
import { ClockProtocol } from "../shared/contracts.js";

App.run(
  Effect.gen(function* () {
    const clock = yield* Worker.spawn(
      Worker.entry(new URL("../worker/clock.js", import.meta.url), ClockProtocol, {
        bindings: [],
      }),
    );
    const theme = yield* Capability.serve(NativeTheme.capability).pipe(
      Effect.provide(NativeTheme.native({ allowSetSource: true })),
    );
    const window = yield* BrowserWindow.make({ title: "Sewed", width: 960, height: 640 });
    const controls = yield* Capability.serve(WindowControls.capability).pipe(
      Effect.provide(WindowControls.native(window)),
    );
    const url = new URL(
      process.env.SEWED_RENDERER_URL ?? "../renderer/index.html",
      import.meta.url,
    );
    yield* window.webContents.load(Renderer.entry(url, { bindings }), {
      bindings: [
        Binding.to(Clock, clock),
        Binding.to(Controls, controls),
        Binding.to(Theme, theme),
      ],
    });
  }),
);
