import { Router } from "express";
import { alertsFor, jobHealth } from "../services/alerts.js";
import type { AppDeps } from "../app.js";

export function alertRoutes(deps: AppDeps): Router {
  const router = Router();
  router.get("/alerts", (_req, res) => {
    res.json({ alerts: alertsFor(deps.store), health: jobHealth(deps.store, deps.sample) });
  });
  return router;
}
