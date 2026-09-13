import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sewed } from "@sewed/vite";

const renderer = fileURLToPath(new URL("./src/renderer", import.meta.url));

export default defineConfig({
  root: renderer,
  base: "./",
  server: { host: "127.0.0.1" },
  plugins: [
    sewed({ main: "src/main/app.ts", tsconfig: "tsconfig.electron.json" }),
    react(),
    {
      name: "development-csp",
      apply: "serve",
      transformIndexHtml(html) {
        return html.replace(
          "script-src 'self'; style-src 'self'",
          "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:*",
        );
      },
    },
  ],
  build: {
    outDir: fileURLToPath(new URL("./dist/renderer", import.meta.url)),
    emptyOutDir: true,
  },
});
