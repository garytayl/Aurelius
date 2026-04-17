import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  publicDir: "public",
  server: {
    port: 5173,
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "pwa-icon.svg",
        "meditations.json",
        "meditations-long.json",
        "meditations-chrystal.json",
        "guided-sessions.json",
      ],
      manifest: {
        name: "Aurelius",
        short_name: "Aurelius",
        description: "Read the Meditations and follow guided sessions.",
        theme_color: "#161311",
        background_color: "#161311",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/pwa-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,svg,json}"],
      },
    }),
  ],
});
