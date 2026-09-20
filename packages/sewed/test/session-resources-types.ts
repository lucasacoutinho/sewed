import { Effect, Scope, Stream, Context } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  Download as DownloadContract,
  MainContext,
  Protocol as ProtocolContract,
  SewedError,
} from "sewed";
import { App, Download, Protocol, Session } from "sewed/main";

class HandlerService extends Context.Service<HandlerService, { readonly body: string }>()(
  "session-resources/HandlerService",
) {}

const scheme: ProtocolContract.Scheme = Protocol.scheme("sewed-types", {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  corsEnabled: true,
  stream: true,
  serviceWorkers: true,
  codeCache: true,
});

const options: DownloadContract.Options = {
  url: "http://127.0.0.1:1/file.bin",
  savePath: "/tmp/sewed-file.bin",
};

const pending: DownloadContract.State = {
  status: "pending",
  receivedBytes: 0,
  totalBytes: 0,
  percent: 0,
  currentBytesPerSecond: 0,
  canResume: false,
  paused: false,
};
const active: DownloadContract.State = {
  ...pending,
  status: "active",
  phase: "interrupted",
};
const terminal: DownloadContract.State = {
  ...pending,
  status: "terminal",
  outcome: "cancelled",
};
void pending;
void active;
void terminal;

const handler: Protocol.Handler<never, HandlerService> = () =>
  Effect.map(HandlerService, ({ body }) => HttpServerResponse.text(body));

const mainProgram = Effect.gen(function* () {
  const session = yield* Session.defaultSession;
  const download = Download.start(session, options);
  const expectedDownload: Effect.Effect<
    DownloadContract.Handle,
    SewedError,
    MainContext | Scope.Scope
  > = download;
  const progress: Stream.Stream<DownloadContract.State, SewedError, MainContext> =
    yield* Effect.map(download, (handle) => handle.progress);
  const response: Effect.Effect<void, SewedError, MainContext | HandlerService | Scope.Scope> =
    Protocol.handle(session, scheme, handler);
  void expectedDownload;
  void progress;
  void response;
});
void mainProgram;

App.run([Protocol.declare(scheme)], Effect.void);

// @ts-expect-error registerSchemes is no longer public; Protocol.declare is the only door.
Protocol.registerSchemes([scheme]);

// Shared contracts expose definitions only. Native acquisition stays in `sewed/main`.
// @ts-expect-error Renderer-safe Download has no native start operation.
DownloadContract.start({} as Session.Handle, options);
// @ts-expect-error Renderer-safe Protocol has no native handler operation.
ProtocolContract.handle({} as Session.Handle, scheme, handler);

// Main operations retain their capability and scope requirements.
// @ts-expect-error Download acquisition cannot erase MainContext.
const missingMain: Effect.Effect<DownloadContract.Handle, SewedError, Scope.Scope> = Download.start(
  {} as Session.Handle,
  options,
);
void missingMain;
