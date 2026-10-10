import { Effect, Layer, Scope } from "effect";
import { HttpClient } from "effect/http";
import { ContentTracing as TracingData, MainContext, Net as NetData, SewedError } from "sewed";
import { ContentTracing, Net, NetLog, PowerSaveBlocker, Session } from "sewed/main";

declare const session: Session.Handle;

// The net layer provides Effect's HTTP client and requires main.
const client: Layer.Layer<HttpClient.HttpClient, SewedError, MainContext> = Net.layer();
const scoped: Layer.Layer<HttpClient.HttpClient, SewedError, MainContext> = Net.layer({
  session,
  bypassCustomProtocolHandlers: true,
});
const online: Effect.Effect<boolean, SewedError, MainContext> = Net.online;
const resolved: Effect.Effect<NetData.ResolvedHost, SewedError, MainContext> =
  Net.resolveHost("localhost");
void client;
void scoped;
void online;
void resolved;
const request: Effect.Effect<string, unknown, MainContext> = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const response = yield* http.get("https://example.com");
  return yield* response.text;
}).pipe(Effect.scoped, Effect.provide(Net.layer()));
void request;
// @ts-expect-error The net layer cannot be built without main.
const withoutMain: Layer.Layer<HttpClient.HttpClient, SewedError> = Net.layer();
void withoutMain;

// Power save blocks, net logs, and traces are scoped resources.
const block: Effect.Effect<PowerSaveBlocker.Handle, SewedError, MainContext | Scope.Scope> =
  PowerSaveBlocker.hold("prevent-display-sleep");
const log: Effect.Effect<NetLog.Handle, SewedError, MainContext | Scope.Scope> = NetLog.record(
  "/tmp/net.json",
  { captureMode: "everything" },
);
const trace: Effect.Effect<ContentTracing.Handle, SewedError, MainContext | Scope.Scope> =
  ContentTracing.record("/tmp/trace.json", { included: ["*"], mode: "record-until-full" });
const usage: Effect.Effect<TracingData.BufferUsage, SewedError, MainContext> =
  ContentTracing.bufferUsage;
void block;
void log;
void trace;
void usage;
// @ts-expect-error Power save blocker kinds are a closed set.
PowerSaveBlocker.hold("prevent-everything");
// @ts-expect-error A power save block lives in a scope.
const unscoped: Effect.Effect<PowerSaveBlocker.Handle, SewedError, MainContext> =
  PowerSaveBlocker.hold("prevent-app-suspension");
void unscoped;
// @ts-expect-error Trace modes are a closed set.
ContentTracing.record("/tmp/trace.json", { mode: "forever" });
