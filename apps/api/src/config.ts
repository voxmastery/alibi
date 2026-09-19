import path from "node:path";
import { fileURLToPath } from "node:url";

export interface Config {
  port: number;
  sample: boolean;
  provider: "sample" | "gstinapi";
  webDist: string | null;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid PORT: ${env.PORT}`);
  const sample = !env.GSTINAPI_KEY;
  const webDist =
    env.NODE_ENV === "production"
      ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist")
      : null;
  return { port, sample, provider: sample ? "sample" : "gstinapi", webDist };
}
