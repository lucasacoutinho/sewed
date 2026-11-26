const identity: unique symbol = Symbol("sewed/Declaration");

/**
 * An inert value `App.run` applies synchronously before Electron is ready. Making one runs
 * nothing, and it is not an Effect: a program cannot yield one after readiness.
 */
export interface Declaration {
  readonly [identity]: true;
}

/** What `App.run`'s list holds: a declaration, or a synchronous thunk `App.run` calls for one. */
export type Entry = Declaration | (() => Declaration);

export interface Definition {
  readonly name: string;
  readonly apply: () => void;
}

const definitions = new WeakMap<Declaration, Definition>();

/**
 * Makes a declaration from a name and the synchronous step that applies it. Every `declare` in
 * Sewed is built on this, and a package with its own pre-readiness step (`@sewed/forge`'s crash
 * reporter) uses it directly. A throw from `apply` fails startup with code `Startup`, naming the
 * declaration.
 */
export const make = (name: string, apply: () => void): Declaration => {
  const value: Declaration = { [identity]: true };
  definitions.set(value, Object.freeze({ name, apply }));
  return Object.freeze(value);
};

export const definition = (value: Declaration): Definition | undefined => definitions.get(value);
