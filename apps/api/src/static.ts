import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import { ApiError } from "./errors.js";

const isApiPath = (pathname: string): boolean => pathname === "/api" || pathname.startsWith("/api/");

/**
 * Serves the built web app from one process: files straight off disk, and the app shell for
 * every other GET so the client router owns the URL. Whatever directory exists at runtime is
 * what gets served; a missing shell answers 404 rather than crashing.
 */
export function mountWebDist(app: Express, webDist: string): void {
  app.use(express.static(webDist, { index: false, maxAge: "1h" }));
  const shell = path.join(webDist, "index.html");
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (isApiPath(req.path) || !existsSync(shell)) {
      next();
      return;
    }
    res.sendFile(shell, (error) => {
      if (error) next(new ApiError(404, "not_found", `No route for ${req.method} ${req.path}`));
    });
  });
}
