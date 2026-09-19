import { Router } from "express";
import { z } from "zod";
import type { ImportResult } from "@alibi/contracts";
import { ApiError, parseOrThrow } from "../errors.js";
import { parseCsv, validateTransactionsCsv, validateVendorsCsv } from "../services/csv.js";
import { todayIso } from "../services/format.js";
import { chainExport, vendorDetail, vendorRows } from "../services/vendor.js";
import type { AppDeps } from "../app.js";

const FIVE_MB = 5 * 1024 * 1024;

export const asOfQuery = z.object({
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "as_of must be a date in YYYY-MM-DD form.").optional(),
});

const importBody = z.object({
  kind: z.enum(["vendors", "transactions"]),
  csv: z.string().max(FIVE_MB, "The file is larger than 5 MB."),
});

/** The as_of every read defaults to: today in UTC. */
export function readAsOf(deps: AppDeps, query: unknown): string {
  return parseOrThrow(asOfQuery, query).as_of ?? todayIso(deps.now());
}

export function vendorRoutes(deps: AppDeps): Router {
  const router = Router();

  router.get("/vendors", (req, res) => {
    res.json(vendorRows(deps.store, readAsOf(deps, req.query)));
  });

  // Registered before /vendors/:id so the literal path is not read as an id.
  router.post("/vendors/import", (req, res) => {
    const body = parseOrThrow(importBody, req.body);
    const rows = parseCsv(body.csv);
    if (body.kind === "vendors") {
      const { records, errors } = validateVendorsCsv(rows);
      let inserted = 0;
      let updated = 0;
      for (const record of records) {
        if (deps.store.vendorByGstin(record.gstin)) updated += 1;
        else inserted += 1;
        deps.store.upsertVendor(record);
      }
      const result: ImportResult = { inserted, updated, errors };
      res.json(result);
      return;
    }
    const { records, errors } = validateTransactionsCsv(rows, deps.store);
    deps.store.addTransactions(records);
    const result: ImportResult = { inserted: records.length, updated: 0, errors };
    res.json(result);
  });

  router.get("/vendors/:id", async (req, res) => {
    const detail = await vendorDetail(deps.store, req.params.id, readAsOf(deps, req.query));
    if (!detail) throw new ApiError(404, "not_found", "No vendor with that id is on record.");
    res.json(detail);
  });

  router.post("/vendors/:id/watch", (req, res) => {
    requireVendor(deps, req.params.id);
    res.json({ watched: deps.store.setVendorFlags(req.params.id, { watched: true }).watched });
  });

  router.delete("/vendors/:id/watch", (req, res) => {
    requireVendor(deps, req.params.id);
    res.json({ watched: deps.store.setVendorFlags(req.params.id, { watched: false }).watched });
  });

  router.post("/vendors/:id/track", (req, res) => {
    requireVendor(deps, req.params.id);
    res.json({ tracking: deps.store.setVendorFlags(req.params.id, { tracking: "tracked" }).tracking });
  });

  router.get("/vendors/:id/chain", (req, res) => {
    const exported = chainExport(deps.store, req.params.id, deps.now());
    if (!exported) throw new ApiError(404, "not_found", "No vendor with that id is on record.");
    res.json(exported);
  });

  return router;
}

function requireVendor(deps: AppDeps, id: string): void {
  if (!deps.store.vendor(id)) throw new ApiError(404, "not_found", "No vendor with that id is on record.");
}
