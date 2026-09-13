import { Schema } from "effect";

/** Where the updater asks for releases; Squirrel on Windows and macOS read this feed. */
export const Feed = Schema.Struct({
  url: Schema.String.check(Schema.isPattern(/^https?:\/\//)),
  headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  serverType: Schema.optionalKey(Schema.Literals(["json", "default"])),
});
export type Feed = typeof Feed.Type;

/** A GitHub repository that Forge's GitHub publisher releases to and update.electronjs.org serves. */
export const GithubRepository = Schema.Struct({
  owner: Schema.String.check(Schema.isMinLength(1)),
  repo: Schema.String.check(Schema.isMinLength(1)),
  host: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
});
export type GithubRepository = typeof GithubRepository.Type;

export const State = Schema.Union([
  Schema.Struct({ status: Schema.Literal("idle") }),
  Schema.Struct({ status: Schema.Literal("checking") }),
  Schema.Struct({ status: Schema.Literal("available") }),
  Schema.Struct({ status: Schema.Literal("not-available") }),
  Schema.Struct({
    status: Schema.Literal("downloaded"),
    releaseName: Schema.String,
    releaseNotes: Schema.String,
    releaseDate: Schema.String,
    updateUrl: Schema.String,
  }),
  Schema.Struct({ status: Schema.Literal("installing") }),
  Schema.Struct({ status: Schema.Literal("error"), message: Schema.String }),
]);
export type State = typeof State.Type;

/** The update.electronjs.org feed for a repository, platform, architecture, and version. */
export const feedUrl = (
  repository: GithubRepository,
  platform: string,
  arch: string,
  version: string,
): string =>
  `https://${repository.host ?? "update.electronjs.org"}/${repository.owner}/${repository.repo}/${platform}-${arch}/${version}`;
