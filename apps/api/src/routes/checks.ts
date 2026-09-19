import { Router } from "express";
import { z } from "zod";
import { ApiError, parseOrThrow } from "../errors.js";
import { runCheck } from "../services/check.js";
import type { AppDeps } from "../app.js";

const checkBody = z.object({ gstin: z.string().min(1).max(20) });

export function checkRoutes(deps: AppDeps): Router {
  const router = Router();

  router.post("/checks", async (req, res) => {
    const body = parseOrThrow(checkBody, req.body);
    const result = await runCheck(
      { store: deps.store, lookup: deps.lookup, sample: deps.sample, now: deps.now },
      body.gstin,
    );
    res.status(201).json(result);
  });

  router.get("/checks/:id", (req, res) => {
    const record = deps.store.check(req.params.id);
    if (!record) throw new ApiError(404, "not_found", "No check with that id is on record.");
    res.json(record.result);
  });

  return router;
}
