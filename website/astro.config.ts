import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { docsSidebar } from "./src/sidebar.ts";

const repository = "https://github.com/lucasacoutinho/sewed";
const site = process.env.SEWED_SITE_URL;

export default defineConfig({
  ...(site === undefined ? {} : { site }),
  prefetch: true,
  trailingSlash: "ignore",
  integrations: [
    starlight({
      title: "Sewed",
      description: "Electron applications as Effects.",
      favicon: "/favicon.svg",
      customCss: ["./src/styles/global.css"],
      components: {
        ThemeProvider: "./src/components/ThemeProvider.astro",
        Header: "./src/components/starlight/Header.astro",
      },
      prerender: true,
      social: [{ icon: "github", label: "GitHub", href: repository }],
      sidebar: docsSidebar,
      pagination: true,
      credits: false,
    }),
  ],
});
