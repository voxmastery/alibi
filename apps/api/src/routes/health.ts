import { Router } from "express";

/** Liveness plus the commit the bundle was built from, so a deploy can be identified. */
export function healthRoutes(): Router {
  const router = Router();
  router.get("/healthz", (_req, res) => {
    res.json({ ok: true, service: "alibi-api", commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null });
  });
  return router;
}
