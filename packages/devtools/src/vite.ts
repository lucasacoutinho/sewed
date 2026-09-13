import { sewed, type SewedViteOptions } from "@sewed/vite";

export const sewedDevTools = (options: SewedViteOptions) =>
  sewed({ ...options, env: { ...options.env, SEWED_DEVTOOLS: "1" } });
