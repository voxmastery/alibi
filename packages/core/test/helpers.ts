import type {
  EdgeAttribute,
  EdgeInput,
  Finding,
  RiskResult,
  SnapshotInput,
  TransactionInput,
  VendorInput,
} from "@alibi/core";

export function vendor(fields: Partial<VendorInput> & Pick<VendorInput, "id" | "legal_name">): VendorInput {
  return {
    state: "Karnataka",
    registered_on: "2020-01-01",
    pan: null,
    bank_account: null,
    address: null,
    phone: null,
    email: null,
    filing_ip: null,
    aadhaar_authenticated: true,
    ...fields,
  };
}

export function snap(
  vendor_id: string,
  captured_at: string,
  status = "Active",
  returns_current: boolean | null = true,
  retrospective_from: string | null = null,
): SnapshotInput {
  return { vendor_id, captured_at, lookup_ok: true, status, returns_current, retrospective_from };
}

export function failedSnap(vendor_id: string, captured_at: string): SnapshotInput {
  return { vendor_id, captured_at, lookup_ok: false, status: null, returns_current: null, retrospective_from: null };
}

export function tx(
  vendor_id: string,
  date: string,
  amount: number,
  payment_mode = "NEFT",
  eway_bill: string | null = "EWB000000000001",
): TransactionInput {
  return { vendor_id, date, amount, itc_claimed: Math.round((amount * 0.18) / 1.18), payment_mode, eway_bill };
}

const EDGE_ATTRIBUTES: EdgeAttribute[] = ["pan", "bank_account", "address", "phone", "email", "filing_ip"];

/**
 * Test-only pairwise edge builder. It mirrors what R2's edge maintenance must produce:
 * one edge per shared attribute value, and no address edge between vendors that share a PAN.
 * Production never scans pairwise; it reads the edges table.
 */
export function edgesFromVendors(vendors: VendorInput[]): EdgeInput[] {
  const edges: EdgeInput[] = [];
  for (let i = 0; i < vendors.length; i++) {
    for (let j = i + 1; j < vendors.length; j++) {
      const a = vendors[i]!;
      const b = vendors[j]!;
      for (const attribute of EDGE_ATTRIBUTES) {
        const value = a[attribute];
        if (!value || value !== b[attribute]) continue;
        if (attribute === "address" && a.pan && a.pan === b.pan) continue;
        edges.push({ from_vendor: a.id, to_vendor: b.id, attribute, value });
      }
    }
  }
  return edges;
}

export function findingsOf(result: RiskResult, ruleId: string): Finding[] {
  return result.findings.filter((f) => f.rule_id === ruleId);
}

export function resultFor(results: RiskResult[], vendorId: string): RiskResult {
  const result = results.find((r) => r.vendor_id === vendorId);
  if (!result) throw new Error(`no result for ${vendorId}`);
  return result;
}

/** The three-vendor ring from the reference data: same bank account, address, phone and filing IP. */
export function ringVendors(): VendorInput[] {
  const shared = {
    state: "Punjab",
    address: "Shop 14, Gill Road, Industrial Area B, Ludhiana 141003",
    bank_account: "50100294471",
    phone: "+919812204471",
    filing_ip: "103.87.44.19",
    aadhaar_authenticated: false,
  };
  return [
    vendor({ id: "V030", legal_name: "Meridian Traders", pan: "AMVAV4988P", registered_on: "2025-02-12", email: "meridian.ludhiana@gmail.com", ...shared }),
    vendor({ id: "V031", legal_name: "Kavach Supplies Co", pan: "ZJAAU4995C", registered_on: "2025-02-15", email: "kavach.ludhiana@gmail.com", ...shared }),
    vendor({ id: "V032", legal_name: "Orbit Metal Corporation", pan: "DUJAB3278B", registered_on: "2025-01-30", email: "orbit.ludhiana@gmail.com", ...shared }),
  ];
}

/** The legitimate multi-state pair: one PAN, two states, everything else distinct. */
export function multiStateVendors(): VendorInput[] {
  return [
    vendor({ id: "V001", legal_name: "Sundaram Steel Traders", pan: "FCOAM1497S", state: "Karnataka", registered_on: "2023-06-15", address: "Peenya Industrial Area, Phase II, Bengaluru 560058", bank_account: "92782703481", phone: "+919818199485", email: "accounts@sundaramsteel.co.in", filing_ip: "49.42.102.79" }),
    vendor({ id: "V029", legal_name: "Sundaram Steel Traders (Maharashtra)", pan: "FCOAM1497S", state: "Maharashtra", registered_on: "2023-06-15", address: "Kalamboli Steel Market, Navi Mumbai 410218", bank_account: "31184402216", phone: "+919820011223", email: "accounts@sundaramsteelmh.co.in", filing_ip: "49.42.118.5" }),
  ];
}

/** The soft pair: shared address and email only. */
export function softPairVendors(): VendorInput[] {
  const shared = { state: "Delhi", address: "2nd Floor, 42 Ranjit Nagar, New Delhi 110008", email: "accounts.filing2024@rediffmail.com" };
  return [
    vendor({ id: "V033", legal_name: "Zenith Commodities", pan: "CHZAU5045K", registered_on: "2024-08-18", bank_account: "85716771760", phone: "+919890383329", filing_ip: "49.36.112.129", ...shared }),
    vendor({ id: "V034", legal_name: "Apex Trade Links", pan: "CBWAE5286Y", registered_on: "2024-08-31", bank_account: "81120255178", phone: "+919820098396", filing_ip: "49.43.49.185", ...shared }),
  ];
}
