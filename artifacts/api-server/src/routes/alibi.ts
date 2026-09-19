import { Router } from "express";
import {
  debugRiskText,
  defenceFile,
  graphAt,
  listVendors,
  vendorDetail,
  verifyChain,
} from "../lib/alibi-store";

const router = Router();

router.get("/vendors", (_req, res) => {
  res.json(listVendors());
});

router.get("/graph", (req, res) => {
  const asOf =
    typeof req.query["asof"] === "string"
      ? req.query["asof"]
      : new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(asOf)) {
    res.status(400).json({ error: "asof must use YYYY-MM format" });
    return;
  }
  res.json(graphAt(asOf));
});

router.get("/vendor/:id", (req, res) => {
  const vendor = vendorDetail(req.params.id);
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  res.json(vendor);
});

router.get("/defence/:id", (req, res) => {
  const defence = defenceFile(req.params.id);
  if (!defence) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  res.json(defence);
});

router.get("/verify", (_req, res) => {
  res.json(verifyChain());
});

router.get("/debug/risk", (_req, res) => {
  res.type("text/plain").send(debugRiskText());
});

export default router;