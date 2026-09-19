import { Router } from "express";
import { networkGraph } from "../services/network.js";
import { readAsOf } from "./vendors.js";
import type { AppDeps } from "../app.js";

export function networkRoutes(deps: AppDeps): Router {
  const router = Router();
  router.get("/network", (req, res) => {
    res.json(networkGraph(deps.store, readAsOf(deps, req.query)));
  });
  return router;
}
