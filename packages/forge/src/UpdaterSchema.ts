import { Schema } from "effect";

/**
 * Where the updater asks for releases; Squirrel on Windows and macOS read this feed. Only HTTPS
 * is accepted, because a feed a network attacker can rewrite is a feed that installs their code.
 */
export const Feed = Schema.Struct({
  url: Schema.String.check(Schema.isPattern(/^https:\/\/[^\s/]+/)),
  headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  serverType: Schema.optionalKey(Schema.Literals(["json", "default"])),
});
export type Feed = typeof Feed.Type;

/** A GitHub repository that Forge's GitHub publisher releases to and update.electronjs.org serves. */
const Name = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/));
const Host = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d{1,5})?$/),
);
export const GithubRepository = Schema.Struct({
  owner: Name,
  repo: Name,
  host: Schema.optionalKey(Host),
});
export type GithubRepository = typeof GithubRepository.Type;
const decodeRepository = Schema.decodeUnknownSync(GithubRepository);

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

/**
 * The update.electronjs.org feed for a repository, platform, architecture, and version. The
 * repository is validated and every path segment is encoded, so no input can escape its segment.
 */
export const feedUrl = (
  repository: GithubRepository,
  platform: string,
  arch: string,
  version: string,
): string => {
  const { owner, repo, host } = decodeRepository(repository);
  const segment = (value: string) => encodeURIComponent(value);
  return `https://${host ?? "update.electronjs.org"}/${segment(owner)}/${segment(repo)}/${segment(`${platform}-${arch}`)}/${segment(version)}`;
};
