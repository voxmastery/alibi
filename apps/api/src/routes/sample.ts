import { Router } from "express";
import { loadSample } from "../store/sample.js";
import type { AppDeps } from "../app.js";

/** Loads the sample register on demand. Idempotent: a second call inserts nothing. */
export function sampleRoutes(deps: AppDeps): Router {
  const router = Router();
  router.post("/vendors/sample", async (_req, res) => {
    res.json(await loadSample(deps.store));
  });
  return router;
}
