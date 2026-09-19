import { Router } from "express";
import type { ModeInfo } from "@alibi/contracts";
import type { AppDeps } from "../app.js";

export const SAMPLE_BANNER =
  "Sample register: every capture on this screen is sample data, not a live lookup. Add a provider key to check real GSTINs.";

/** The app-wide badge. Sample mode is never hidden from the reader. */
export function modeRoutes(deps: AppDeps): Router {
  const router = Router();
  router.get("/mode", (_req, res) => {
    const mode: ModeInfo = {
      sample: deps.sample,
      provider: deps.sample ? "none" : "gstinapi",
      banner: deps.sample ? SAMPLE_BANNER : null,
    };
    res.json(mode);
  });
  return router;
}
