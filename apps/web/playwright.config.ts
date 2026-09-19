import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { baseURL: "http://localhost:4173", viewport: { width: 1280, height: 800 } },
  webServer: {
    command: "node ../api/dist/server.mjs",
    port: 4173,
    env: { NODE_ENV: "production", PORT: "4173" },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
