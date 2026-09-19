import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { ApiError, errorBody } from "./errors.js";
import type { RegisterLookup } from "./lookup/types.js";
import type { MemoryStore } from "./store/memory.js";
import { mountWebDist } from "./static.js";
import { alertRoutes } from "./routes/alerts.js";
import { checkRoutes } from "./routes/checks.js";
import { defenceRoutes } from "./routes/defence.js";
import { healthRoutes } from "./routes/health.js";
import { modeRoutes } from "./routes/mode.js";
import { networkRoutes } from "./routes/network.js";
import { sampleRoutes } from "./routes/sample.js";
import { vendorRoutes } from "./routes/vendors.js";
import { verifyRoutes } from "./routes/verify.js";

export interface AppDeps {
  store: MemoryStore;
  lookup: RegisterLookup;
  sample: boolean;
  webDist: string | null;
  now(): Date;
}

export interface AppOptions {
  store: MemoryStore;
  lookup: RegisterLookup;
  sample: boolean;
  webDist: string | null;
  now?: () => Date;
}

const isApiPath = (pathname: string): boolean => pathname === "/api" || pathname.startsWith("/api/");

/**
 * One app serves the API and the built site, so a single host runs the whole product.
 * Every route validates its input before a service sees it and every failure leaves through
 * the same envelope.
 */
export function createApp(options: AppOptions): Express {
  const deps: AppDeps = {
    store: options.store,
    lookup: options.lookup,
    sample: options.sample,
    webDist: options.webDist,
    now: options.now ?? (() => new Date()),
  };

  const app = express();
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
    next();
  });

  app.use(express.json({ limit: "6mb" }));

  app.use("/api", healthRoutes());
  app.use("/api", modeRoutes(deps));
  app.use("/api", checkRoutes(deps));
  // /vendors/sample and /vendors/import are literal paths: both are mounted ahead of /vendors/:id.
  app.use("/api", sampleRoutes(deps));
  app.use("/api", vendorRoutes(deps));
  app.use("/api", defenceRoutes(deps));
  app.use("/api", networkRoutes(deps));
  app.use("/api", verifyRoutes());
  app.use("/api", alertRoutes(deps));

  app.use((req, res, next) => {
    if (!isApiPath(req.path)) {
      next();
      return;
    }
    res.status(404).json(errorBody(new ApiError(404, "not_found", `No route for ${req.method} ${req.path}`)));
  });

  if (deps.webDist) mountWebDist(app, deps.webDist);

  app.use((req, res) => {
    res.status(404).json(errorBody(new ApiError(404, "not_found", `No route for ${req.method} ${req.path}`)));
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const apiError = ApiError.from(error);
    if (apiError.status >= 500) console.error(error);
    res.status(apiError.status).json(errorBody(apiError));
  });

  return app;
}
