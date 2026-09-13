# Sewed

Sewed is an Electron library built on Effect. See `docs/upstream.md` for its origin and attribution.

- The core library lives in `packages/sewed`; framework adapters live in separate packages such as `packages/react`. Trial applications belong outside this repository and consume public package exports.
- DevTools is headless diagnostics and Effect tracing. Keep UI, custom inspector windows, preloads, and renderer bridges out of `packages/devtools`.
- Core has no React dependencies or exports. `@sewed/react` uses external-store subscriptions; do not add `useEffect` or `useLayoutEffect` to the adapter or its consumers.
- Use the pinned Effect v4 version and ordinary Context services, Layers, Effects, Scopes and Streams. Preserve execution requirements through public signatures.
- Keep definitions inert. Construct native resources only in their owning runtime. Do not use cloud reconciliation to recreate user-closed windows.
- Main, renderer and worker runtimes are separate. Bindings dispatch calls to explicit owner instances. Imports do not establish execution placement.
- Validate messages and payloads at transport boundaries. Preserve typed errors and interruption. Never silently retry calls after an owner exits.
- Return Effects from resource operations. Native callbacks and promises are adapted at runtime edges; keep raw async logic out of resource programs.
- Keep shared transport and implementation helpers internal. Avoid casts and `any`; any unavoidable generic bridge needs a precise invariant and type coverage.
- Test actual worker placement and lifecycle. Keep Electron integration consumers outside the library. Run `pnpm build`, `timeout 240 pnpm test`, and consumer checks before reporting completion.
- Retain upstream licenses and notices. Do not run or recreate cloud deployment, account cleanup, credential-download, or publishing commands for this prototype.
- Releases are tags: `node scripts/release.mjs version <semver>` bumps every package and sibling pin, `node scripts/release.mjs effect <semver>` moves the Effect pin, and a pushed `v<version>` tag publishes the GitHub release with packed tarballs.
- The `website` workspace renders `docs/` with Astro and Starlight. `website/src/sidebar.ts` must list every guide; `pnpm website:build` regenerates the pages and verifies the site.
- The main thread owns architecture, type checking and acceptance. If delegation is requested, use the user's specified worker model and isolated writable paths.
