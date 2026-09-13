import type { ReactNode } from "react";
import { Cause } from "effect";
import { Renderer } from "sewed";
import { mount } from "@sewed/react";
import { bindings } from "../../shared/bindings.js";

export function mountDesktop(children: ReactNode) {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing React root");
  const entry = Renderer.entry(new URL(location.href), { bindings });
  const lifetime = Renderer.run(entry, mount(root, children));
  lifetime.addObserver((exit) => {
    if (exit._tag === "Failure") console.error(Cause.pretty(exit.cause));
  });
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      lifetime.interruptUnsafe();
    });
  }
}
