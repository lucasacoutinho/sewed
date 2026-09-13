import type { Event, Observation } from "../Diagnostics.ts";
import type { Bridge } from "./Bridge.ts";

const maxBytes = 256 * 1024;
const utf8 = new TextEncoder();

/** Only observations cross the renderer boundary; owner state comes from main. */
export const forward = (bridge: Bridge, session: string) => {
  const pending: Observation[] = [];
  let inFlight = false;
  let closed = false;
  let dropped = 0;
  const flush = () => {
    if (closed || inFlight || (pending.length === 0 && dropped === 0)) return;
    const events = pending.splice(0, 64);
    let batch = JSON.stringify({ events, dropped });
    while (utf8.encode(batch).byteLength > maxBytes && events.length > 0) {
      events.pop();
      dropped++;
      batch = JSON.stringify({ events, dropped });
    }
    dropped = 0;
    inFlight = true;
    void bridge.observe(session, batch).then(
      () => {
        inFlight = false;
        flush();
      },
      () => {
        closed = true;
        pending.length = 0;
      },
    );
  };
  return {
    tracing: true,
    emit(event: Event) {
      if (closed) return;
      switch (event._tag) {
        case "TraceSpan":
        case "TraceEvent":
        case "RuntimeSample":
        case "QueueSample":
        case "QueueClosed":
          if (pending.length < 256) pending.push(event);
          else dropped++;
          flush();
      }
    },
    close() {
      closed = true;
      pending.length = 0;
    },
  };
};
