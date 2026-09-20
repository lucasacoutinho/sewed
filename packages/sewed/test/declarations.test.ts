import assert from "node:assert/strict";
import { test } from "node:test";
import * as Declaration from "../src/Declaration.ts";
import * as Declarations from "../src/internal/Declarations.ts";

test("a declaration is inert when made, frozen, and readable through its definition", () => {
  let applied = 0;
  const value = Declaration.make("counter", () => {
    applied++;
  });
  assert.equal(applied, 0);
  assert.ok(Object.isFrozen(value));
  const definition = Declaration.definition(value);
  assert.equal(definition?.name, "counter");
  definition?.apply();
  assert.equal(applied, 1);
  assert.equal(Declaration.definition({ name: "forged", apply() {} } as never), undefined);
});

test("apply walks the list in order, calling thunks where they stand", () => {
  const order: string[] = [];
  const step = (name: string) => Declaration.make(name, () => order.push(name));
  const error = Declarations.apply([step("a"), () => step("b"), step("c")]);
  assert.equal(error, undefined);
  assert.deepEqual(order, ["a", "b", "c"]);
});

test("a failing declaration stops the walk with Startup naming it, and later ones do not apply", () => {
  const order: string[] = [];
  const error = Declarations.apply([
    Declaration.make("first", () => order.push("first")),
    Declaration.make("broken", () => {
      throw new Error("no");
    }),
    Declaration.make("never", () => order.push("never")),
  ]);
  assert.equal(error?.code, "Startup");
  assert.match(error?.message ?? "", /"broken"/);
  assert.equal((error?.cause as Error).message, "no");
  assert.deepEqual(order, ["first"]);
});

test("a thunk that throws fails Startup with its position, and a foreign value is refused", () => {
  const thrown = Declarations.apply([
    Declaration.make("ok", () => {}),
    () => {
      throw new Error("cannot compute");
    },
  ]);
  assert.equal(thrown?.code, "Startup");
  assert.match(thrown?.message ?? "", /1/);
  const foreign = Declarations.apply([{ name: "x", apply() {} } as never]);
  assert.equal(foreign?.code, "Startup");
});

test("commandLine appends a switch with or without a value, and refuses a bad name at apply", () => {
  const appended: unknown[][] = [];
  const native: Declarations.CommandLineNative = {
    appendSwitch: (...args) => {
      appended.push(args);
    },
  };
  assert.equal(
    Declarations.apply([
      Declarations.commandLine(native, { name: "lang", value: "en" }),
      Declarations.commandLine(native, { name: "enable-logging" }),
    ]),
    undefined,
  );
  assert.deepEqual(appended, [["lang", "en"], ["enable-logging"]]);
  const bad = Declarations.apply([
    Declarations.commandLine(native, { name: "--lang", value: "en" }),
  ]);
  assert.equal(bad?.code, "Startup");
  assert.equal(appended.length, 2);
});

test("paths decodes every entry before setting any, so a bad name sets nothing", () => {
  const set: [string, string][] = [];
  const native: Declarations.PathsNative = {
    setPath: (name, path) => {
      set.push([name, path]);
    },
  };
  assert.equal(
    Declarations.apply([Declarations.paths(native, { sessionData: "/s", crashDumps: "/c" })]),
    undefined,
  );
  assert.deepEqual(set, [
    ["sessionData", "/s"],
    ["crashDumps", "/c"],
  ]);
  const bad = Declarations.apply([
    Declarations.paths(native, { userData: "/u", cache: "/x" } as never),
  ]);
  assert.equal(bad?.code, "Startup");
  assert.equal(set.length, 2);
  const empty = Declarations.apply([Declarations.paths(native, { userData: "" })]);
  assert.equal(empty?.code, "Startup");
});

test("gpu disables acceleration only when told to, and refuses a non-boolean", () => {
  let disabled = 0;
  const native: Declarations.GpuNative = {
    disableHardwareAcceleration: () => {
      disabled++;
    },
  };
  assert.equal(Declarations.apply([Declarations.gpu(native, { acceleration: true })]), undefined);
  assert.equal(disabled, 0);
  assert.equal(Declarations.apply([Declarations.gpu(native, { acceleration: false })]), undefined);
  assert.equal(disabled, 1);
  assert.equal(
    Declarations.apply([Declarations.gpu(native, { acceleration: "no" } as never)])?.code,
    "Startup",
  );
});

test("identity sets the user model id, and refuses an empty one", () => {
  const ids: string[] = [];
  const native: Declarations.IdentityNative = {
    setAppUserModelId: (id) => {
      ids.push(id);
    },
  };
  assert.equal(
    Declarations.apply([Declarations.identity(native, { userModelId: "dev.sewed.app" })]),
    undefined,
  );
  assert.deepEqual(ids, ["dev.sewed.app"]);
  assert.equal(Declarations.apply([Declarations.identity(native, {})]), undefined);
  assert.equal(
    Declarations.apply([Declarations.identity(native, { userModelId: "" })])?.code,
    "Startup",
  );
  assert.deepEqual(ids, ["dev.sewed.app"]);
});
