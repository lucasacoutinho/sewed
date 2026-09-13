/** Prefixes a root-relative path with Astro's configured base, for hand-written links. */
export const href = (path: string): string => {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  return `${base}${path}`;
};
