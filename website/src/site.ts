/**
 * The deployment origin and base path come from one variable so the Astro config, the docs
 * sync script, and the workflow agree. `https://user.github.io/sewed` yields the origin as
 * `site` and `/sewed` as `base`; an unset variable keeps a root deployment with no canonical URLs.
 */
const raw = process.env.SEWED_SITE_URL;
export const siteUrl: URL | undefined = raw === undefined || raw === "" ? undefined : new URL(raw);
export const site: string | undefined = siteUrl?.origin;
export const base: string =
  siteUrl === undefined ? "/" : siteUrl.pathname.replace(/\/+$/, "") || "/";

/** Prefixes a root-relative path with the base path; `withBase("/a/")` is `/sewed/a/`. */
export const withBase = (path: string): string => (base === "/" ? path : `${base}${path}`);
