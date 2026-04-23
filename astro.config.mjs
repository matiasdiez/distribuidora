import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  output: "server", // páginas estáticas + API routes server-side (antes "hybrid", removido en Astro 5)
  adapter: node({
    mode: "standalone", // para Fly.io
  }),
  integrations: [
    svelte(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
