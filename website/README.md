# Sewed website

The landing page and documentation site for Sewed, built with Astro and Starlight.

## Content

The guides are not authored here. `scripts/sync-docs.mjs` copies every file in the repository's `docs/` directory into `src/content/docs/`, turns the first heading into the page title, derives a description from the first paragraph, rewrites relative links into site routes, and points each page's edit link at the source file. The generated directory is ignored by git and recreated by every `dev`, `build`, and `check` run.

`src/sidebar.ts` lists every guide by slug and group. The sync script fails when a guide is missing from the sidebar or the sidebar names a guide that no longer exists, so adding a document to `docs/` means adding one line there.

## Commands

From the repository root:

```sh
pnpm website:dev      # sync the docs and start the Astro dev server
pnpm website:build    # sync the docs and build the static site into website/dist
pnpm website:check    # sync the docs and run astro check
```

Set `SEWED_SITE_URL` to the site's public URL when building for deployment. Its origin becomes Astro's `site`, which enables canonical URLs and the sitemap, and its path becomes Astro's `base`, so `https://lucasacoutinho.github.io/sewed` builds every link under `/sewed/`. Without it the build still succeeds as a root deployment. The output in `website/dist` is a static site with no server component.

## Deployment

`.github/workflows/website.yml` builds the site on every push to `main` that touches `docs/`, `website/`, or the lockfile, and deploys it to GitHub Pages through the Actions deployment flow. The workflow reads the Pages URL from `actions/configure-pages` and passes it as `SEWED_SITE_URL`, so the base path is never hardcoded. Pages has to be enabled once in the repository settings with "GitHub Actions" as the source; a private repository needs a GitHub plan that includes Pages, or the repository has to be public.

## Layout

| Path                                 | Role                                                             |
| ------------------------------------ | ---------------------------------------------------------------- |
| `src/pages/index.astro`              | The landing page, rendered through `src/layouts/Marketing.astro` |
| `src/components/marketing/`          | Nav, footer, logo mark, section, eyebrow, button, and code block |
| `src/components/starlight/`          | Starlight component overrides                                    |
| `src/components/ThemeProvider.astro` | Pre-paint theme script shared by the docs and marketing pages    |
| `src/styles/tokens.css`              | The design tokens and font imports                               |
| `src/styles/custom.css`              | Maps the tokens onto Starlight's variables                       |
| `src/styles/marketing.css`           | Landing page primitives                                          |
| `ec.config.mjs`                      | The code block theme                                             |
