/** Scheme names `App.run({ schemes })` registered as standard. Electron-free so URL rules can read it. */
const names = new Set<string>();

export const register = (schemes: Iterable<string>): void => {
  for (const name of schemes) names.add(name.toLowerCase());
};

export const has = (name: string): boolean => names.has(name.toLowerCase());
