/**
 * `sewed/main`'s own `Protocol` namespace: everything `internal/Protocol.ts` exports (Electron-free
 * at module scope, so a test can import it directly), plus `declare` from `internal/ProtocolSchemes.ts`
 * (the one piece that touches `app`/`protocol` values). Nothing else imports this file — `main.ts`
 * is its only consumer — so combining the two here, rather than re-exporting either through the
 * other, is what keeps `internal/Protocol.ts` free of a hard Electron dependency.
 */
export * from "./Protocol.ts";
export { declare } from "./ProtocolSchemes.ts";
