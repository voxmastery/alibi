import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vite's resolver does not honour package self-references, so a test inside packages/core
// cannot import "@alibi/core" by name without these aliases.
const source = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    conditions: ["source"],
    alias: {
      "@alibi/core": source("./packages/core/src/index.ts"),
      "@alibi/db": source("./packages/db/src/index.ts"),
      "@alibi/sample": source("./packages/sample/src/index.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: [
            "packages/core/test/**/*.test.ts",
            "packages/sample/test/**/*.test.ts",
            "apps/api/test/**/*.test.ts",
            "apps/web/test/**/*.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["packages/db/test/**/*.test.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
