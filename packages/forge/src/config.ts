import type { GithubRepository } from "./Updater.ts";

/** A Forge maker preset; each maps to the maker package Forge resolves by name. */
export type Maker = "squirrel" | "zip" | "deb" | "rpm" | "dmg";
export type Platform = "win32" | "darwin" | "linux";

export interface GithubPublish extends GithubRepository {
  readonly prerelease?: boolean;
  readonly draft?: boolean;
}

export interface Options {
  /** The executable and product name; defaults to the package name Forge reads. */
  readonly name?: string;
  /** Icon path without extension; Forge picks the platform's extension. */
  readonly icon?: string;
  readonly appBundleId?: string;
  readonly asar?: boolean;
  readonly extraResources?: readonly string[];
  /** Globs or patterns Forge leaves out of the package; the build output stays in. */
  readonly ignore?: readonly (string | RegExp)[];
  /** Maker presets; defaults to Squirrel for Windows, DMG and ZIP for macOS, DEB and RPM for Linux. */
  readonly makers?: readonly Maker[];
  /** Publishing to GitHub releases, which update.electronjs.org serves to `Updater.githubFeed`. */
  readonly github?: GithubPublish;
}

export interface Entry {
  readonly name: string;
  readonly config?: Record<string, unknown>;
  readonly platforms?: readonly Platform[];
}

/** The shape Forge reads from `forge.config.js`; it satisfies Forge's own `ForgeConfig` type. */
export interface Config {
  readonly packagerConfig: Record<string, unknown>;
  readonly rebuildConfig: Record<string, unknown>;
  readonly makers: readonly Entry[];
  readonly publishers: readonly Entry[];
  readonly plugins: readonly Entry[];
}

const makerEntries: Record<Maker, (options: Options) => Entry> = {
  squirrel: (options) => ({
    name: "@electron-forge/maker-squirrel",
    platforms: ["win32"],
    config: {
      ...(options.name === undefined ? {} : { name: options.name }),
      ...(options.icon === undefined ? {} : { setupIcon: `${options.icon}.ico` }),
    },
  }),
  zip: () => ({ name: "@electron-forge/maker-zip", platforms: ["darwin", "linux", "win32"] }),
  deb: (options) => ({
    name: "@electron-forge/maker-deb",
    platforms: ["linux"],
    config: { options: { ...(options.icon === undefined ? {} : { icon: `${options.icon}.png` }) } },
  }),
  rpm: (options) => ({
    name: "@electron-forge/maker-rpm",
    platforms: ["linux"],
    config: { options: { ...(options.icon === undefined ? {} : { icon: `${options.icon}.png` }) } },
  }),
  dmg: (options) => ({
    name: "@electron-forge/maker-dmg",
    platforms: ["darwin"],
    config: { ...(options.icon === undefined ? {} : { icon: `${options.icon}.icns` }) },
  }),
};

const defaultMakers: readonly Maker[] = ["squirrel", "dmg", "zip", "deb", "rpm"];

/**
 * Builds a Forge configuration from a few decisions. Makers are referenced by package name, so
 * only the makers you keep need installing, and the GitHub publisher shares its repository with
 * `Updater.githubFeed`, which is the whole binding between publishing and updating.
 */
export const makeConfig = (options: Options = {}): Config => ({
  packagerConfig: {
    asar: options.asar ?? true,
    ...(options.name === undefined ? {} : { name: options.name, executableName: options.name }),
    ...(options.icon === undefined ? {} : { icon: options.icon }),
    ...(options.appBundleId === undefined ? {} : { appBundleId: options.appBundleId }),
    ...(options.extraResources === undefined ? {} : { extraResource: [...options.extraResources] }),
    ...(options.ignore === undefined ? {} : { ignore: [...options.ignore] }),
  },
  rebuildConfig: {},
  makers: (options.makers ?? defaultMakers).map((maker) => makerEntries[maker](options)),
  publishers:
    options.github === undefined
      ? []
      : [
          {
            name: "@electron-forge/publisher-github",
            config: {
              repository: { owner: options.github.owner, name: options.github.repo },
              ...(options.github.host === undefined ? {} : { host: options.github.host }),
              prerelease: options.github.prerelease ?? false,
              draft: options.github.draft ?? true,
            },
          },
        ],
  plugins: [],
});
