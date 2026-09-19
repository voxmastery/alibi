import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "dist");
await rm(dist, { recursive: true, force: true });

// express is CommonJS; this banner gives the ESM bundle a working require().
const banner = [
  'import { createRequire as __cr } from "node:module";',
  'import __path from "node:path";',
  'import __url from "node:url";',
  "globalThis.require = __cr(import.meta.url);",
  "globalThis.__filename = __url.fileURLToPath(import.meta.url);",
  "globalThis.__dirname = __path.dirname(globalThis.__filename);",
].join("\n");

await build({
  entryPoints: [path.join(here, "src/server.ts")],
  outdir: dist,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: "linked",
  // The workspace packages publish their TypeScript sources under the "source" export
  // condition and are not pre-built, so the bundler must read that condition too.
  conditions: ["source"],
  external: ["pg-native"],
  banner: { js: banner },
  logLevel: "info",
});
