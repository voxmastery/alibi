import { Router } from "express";
import { z } from "zod";
import { ApiError, parseOrThrow } from "../errors.js";
import { defenceFile } from "../services/defence.js";
import { renderDefenceHtml } from "../templates/defence.js";
import { asOfQuery, readAsOf } from "./vendors.js";
import type { AppDeps } from "../app.js";

const formatQuery = asOfQuery.extend({ format: z.enum(["json", "html"]).optional() });

/** The record a vendor's file rests on, as JSON for the app or as a print-ready page. */
export function defenceRoutes(deps: AppDeps): Router {
  const router = Router();
  router.get("/vendors/:id/defence", async (req, res) => {
    const { format } = parseOrThrow(formatQuery, req.query);
    const file = await defenceFile(deps.store, req.params.id, readAsOf(deps, req.query), deps.sample);
    if (!file) throw new ApiError(404, "not_found", "No vendor with that id is on record.");
    if (format === "html") {
      res.type("html").send(renderDefenceHtml(file));
      return;
    }
    res.json(file);
  });
  return router;
}
