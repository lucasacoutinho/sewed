import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import { test } from "node:test";
import type { Session } from "electron";
import { Effect, Fiber, Stream } from "effect";
import type { Scope } from "effect";
import * as Decidables from "../src/Decidables.ts";
import * as Decision from "../src/Decision.ts";
import type { MainContext } from "../src/RuntimeContext.ts";
import type { SewedError } from "../src/SewedError.ts";
import type * as SessionStorage from "../src/SessionStorage.ts";
import * as Testing from "../src/Testing.ts";
import * as Native from "../src/internal/Session.ts";
import * as SessionData from "../src/internal/SessionData.ts";

const extension = { id: "abc", name: "Helper", version: "1.2.3", url: "chrome-extension://abc/" };

/** A structural session: the library reads these members, and each command records its call. */
const fakeSession = () => {
  const calls: unknown[][] = [];
  const extensions = Object.assign(new EventEmitter(), {
    getAllExtensions: () => [{ ...extension, manifest: {}, path: "/ext" }],
  });
  const emitter = Object.assign(new EventEmitter(), {
    setPermissionCheckHandler: () => {},
    setPermissionRequestHandler: () => {},
    setDevicePermissionHandler: () => {},
    extensions,
    clearData: (options: unknown) => {
      calls.push(["clearData", options]);
      return Promise.resolve();
    },
    getSharedDictionaryUsageInfo: () =>
      Promise.resolve([
        { frameOrigin: "https://a.example", topFrameSite: "https://a.example", totalSizeBytes: 9 },
      ]),
    getSharedDictionaryInfo: (key: unknown) => {
      calls.push(["getSharedDictionaryInfo", key]);
      return Promise.resolve([
        {
          id: "d1",
          dictionaryUrl: "https://a.example/dict",
          match: "/*",
          matchDestinations: ["document"],
          hash: "ff",
          size: 9,
          expirationDuration: 60,
          responseTime: new Date(1000),
          lastFetchTime: new Date(2000),
          lastUsedTime: new Date(3000),
        },
      ]);
    },
    clearSharedDictionaryCache: () => {
      calls.push(["clearSharedDictionaryCache"]);
      return Promise.resolve();
    },
    clearSharedDictionaryCacheForIsolationKey: (key: unknown) => {
      calls.push(["clearSharedDictionaryCacheForIsolationKey", key]);
      return Promise.resolve();
    },
    setSpellCheckerDictionaryDownloadURL: (url: string) => calls.push(["dictionaryUrl", url]),
    allowNTLMCredentialsForDomains: (domains: string) => calls.push(["ntlm", domains]),
    setCodeCachePath: (path: string) => calls.push(["codeCache", path]),
  });
  // Test-only bridge: the library reads these members structurally.
  return { emitter, extensions, calls, handle: Native.fromNative(emitter as unknown as Session) };
};

const run = <A, E>(effect: Effect.Effect<A, E, MainContext>) =>
  Effect.runPromise(Effect.provide(effect, Testing.main));
const refused = async (effect: Effect.Effect<unknown, SewedError, MainContext>) =>
  (await run(Effect.flip(effect))).code;

test("clearData passes decoded options and refuses contradictory ones", async () => {
  const fake = fakeSession();
  await run(SessionData.clearData(fake.handle));
  await run(
    SessionData.clearData(fake.handle, {
      dataTypes: ["cookies", "cache"],
      origins: ["https://a.example"],
      originMatchingMode: "origin-in-all-contexts",
    }),
  );
  assert.deepEqual(fake.calls, [
    ["clearData", {}],
    [
      "clearData",
      {
        dataTypes: ["cookies", "cache"],
        origins: ["https://a.example"],
        originMatchingMode: "origin-in-all-contexts",
      },
    ],
  ]);
  assert.equal(
    await refused(
      SessionData.clearData(fake.handle, {
        origins: ["https://a.example"],
        excludeOrigins: ["https://b.example"],
      }),
    ),
    "Protocol",
  );
  const invalid = SessionData.clearData(fake.handle, {
    // @ts-expect-error not a data type
    dataTypes: ["history"],
  });
  assert.equal(await refused(invalid), "Protocol");
});

test("shared dictionaries are read as plain data and cleared by key or all at once", async () => {
  const fake = fakeSession();
  const key = { frameOrigin: "https://a.example", topFrameSite: "https://a.example" };
  assert.deepEqual(await run(SessionData.sharedDictionaryUsage(fake.handle)), [
    { ...key, totalSizeBytes: 9 },
  ]);
  const [dictionary] = await run(SessionData.sharedDictionaries(fake.handle, key));
  assert.deepEqual(dictionary, {
    id: "d1",
    dictionaryUrl: "https://a.example/dict",
    match: "/*",
    matchDestinations: ["document"],
    hash: "ff",
    size: 9,
    expirationDuration: 60,
    responseTime: 1000,
    lastFetchTime: 2000,
    lastUsedTime: 3000,
  });
  await run(SessionData.clearSharedDictionaries(fake.handle));
  await run(SessionData.clearSharedDictionaries(fake.handle, key));
  assert.deepEqual(fake.calls.slice(1), [
    ["clearSharedDictionaryCache"],
    ["clearSharedDictionaryCacheForIsolationKey", key],
  ]);
  assert.equal(
    await refused(
      SessionData.sharedDictionaries(fake.handle, { frameOrigin: "", topFrameSite: "x" }),
    ),
    "Protocol",
  );
});

test("session settings validate their input", async () => {
  const fake = fakeSession();
  await run(
    SessionData.setSpellCheckerDictionaryDownloadUrl(fake.handle, "https://d.example/dict/"),
  );
  await run(SessionData.allowNtlmCredentialsForDomains(fake.handle, ["*.example.com", "intranet"]));
  await run(SessionData.setCodeCachePath(fake.handle, "/var/cache/app"));
  assert.deepEqual(fake.calls, [
    ["dictionaryUrl", "https://d.example/dict/"],
    ["ntlm", "*.example.com,intranet"],
    // Resolved, so on Windows it gains the drive of the working directory.
    ["codeCache", path.resolve("/var/cache/app")],
  ]);
  const { handle } = fake;
  assert.equal(
    await refused(
      SessionData.setSpellCheckerDictionaryDownloadUrl(handle, "https://d.example/dict"),
    ),
    "Protocol",
  );
  assert.equal(
    await refused(SessionData.setSpellCheckerDictionaryDownloadUrl(handle, "not a url")),
    "Protocol",
  );
  assert.equal(await refused(SessionData.allowNtlmCredentialsForDomains(handle, [])), "Protocol");
  assert.equal(
    await refused(SessionData.allowNtlmCredentialsForDomains(handle, ["a.example,b.example"])),
    "Protocol",
  );
  assert.equal(await refused(SessionData.setCodeCachePath(handle, "cache")), "Protocol");
});

test("dictionary and extension events are observed while a stream runs", async () => {
  const fake = fakeSession();
  const [dictionaries, extensions, listed] = await run(
    Effect.gen(function* () {
      const first = yield* Effect.forkChild(
        Stream.runCollect(Stream.take(SessionData.spellCheckerDictionaries(fake.handle), 2)),
      );
      const second = yield* Effect.forkChild(
        Stream.runCollect(Stream.take(SessionData.extensionEvents(fake.handle), 2)),
      );
      while (
        fake.emitter.listenerCount("spellcheck-dictionary-initialized") === 0 ||
        fake.extensions.listenerCount("extension-ready") === 0
      )
        yield* Effect.yieldNow;
      fake.emitter.emit("spellcheck-dictionary-download-begin", {}, "pt-BR");
      fake.emitter.emit("spellcheck-dictionary-download-failure", {}, "pt-BR");
      fake.extensions.emit("extension-loaded", {}, extension);
      fake.extensions.emit("extension-unloaded", {}, extension);
      return [
        [...(yield* Fiber.join(first))],
        [...(yield* Fiber.join(second))],
        yield* SessionData.extensions(fake.handle),
      ] as const;
    }),
  );
  assert.deepEqual(dictionaries, [
    { kind: "download-begin", language: "pt-BR" },
    { kind: "download-failure", language: "pt-BR" },
  ]);
  assert.deepEqual(extensions, [
    { kind: "loaded", extension },
    { kind: "unloaded", extension },
  ]);
  assert.deepEqual(listed, [extension]);
});

test("a restricted path is asked of the session's decider, and denied without a sound answer", async () => {
  const fake = fakeSession();
  const seen: SessionStorage.FileSystemAccess[] = [];
  const ask = (install: Effect.Effect<void, SewedError, MainContext | Scope.Scope>) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* install;
          const state = { prevented: false };
          const answer = yield* Effect.promise(
            () =>
              new Promise<string>((resolve) => {
                fake.emitter.emit(
                  "file-system-access-restricted",
                  { preventDefault: () => (state.prevented = true) },
                  {
                    origin: "https://a.example",
                    path: "/home/user",
                    isDirectory: true,
                    frame: { url: "https://a.example/app" },
                    webContents: null,
                  },
                  resolve,
                );
              }),
          );
          return { answer, prevented: state.prevented };
        }),
      ).pipe(Effect.provide(Testing.main)),
    );
  assert.equal(fake.emitter.listenerCount("file-system-access-restricted"), 0);
  const allowed = await ask(
    fake.handle.decide(
      Decidables.Session.FileSystemAccess,
      Decision.async((event) => {
        seen.push(event);
        return Effect.succeed("allow" as const);
      }),
    ),
  );
  assert.deepEqual(allowed, { answer: "allow", prevented: true });
  assert.equal(seen[0]?.origin, "https://a.example");
  assert.equal(seen[0]?.path, "/home/user");
  assert.equal(seen[0]?.isDirectory, true);
  const broken = await ask(
    fake.handle.decide(
      Decidables.Session.FileSystemAccess,
      Decision.async(() => Effect.die(new Error("restricted path decider boom"))),
    ),
  );
  assert.equal(broken.answer, "deny");
  assert.equal(fake.emitter.listenerCount("file-system-access-restricted"), 0);
});
