import { defineConfig } from "vite";

export default defineConfig({
  resolve: { conditions: ["source"] },
  build: { target: "es2022", sourcemap: true },
  server: { proxy: { "/api": "http://localhost:3000" } },
});
