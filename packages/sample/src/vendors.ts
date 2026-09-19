import { gstinCheckDigit } from "@alibi/core";
import type { SampleVendor } from "./index.js";
import { makeRandom, type Random } from "./random.js";

/** State names ported from docs/reference/generate_data.py plus the ring's Punjab code. */
const STATE_NAMES: Record<string, string> = {
  "29": "Karnataka",
  "27": "Maharashtra",
  "07": "Delhi",
  "33": "Tamil Nadu",
  "24": "Gujarat",
  "06": "Haryana",
  "03": "Punjab",
};

interface CleanEntry {
  legalName: string;
  tradeName: string;
  stateCode: string;
  address: string;
  /** Overrides the derived key; only set where the derived slug would be wrong (see brief). */
  key?: string;
}

/** Ported verbatim (legal name, trade name, state code, address) from generate_data.py's CLEAN list. */
const CLEAN: CleanEntry[] = [
  { legalName: "Sundaram Steel Traders", tradeName: "Sundaram Steel", stateCode: "29", address: "Peenya Industrial Area, Phase II, Bengaluru 560058", key: "sundaram" },
  { legalName: "Kaveri Packaging Pvt Ltd", tradeName: "Kaveri Pack", stateCode: "29", address: "Bommasandra Industrial Area, Bengaluru 560099" },
  { legalName: "Deccan Polymers", tradeName: "Deccan Poly", stateCode: "29", address: "Jigani Link Road, Anekal, Bengaluru 562106" },
  { legalName: "Anand Engineering Works", tradeName: "Anand Engg", stateCode: "27", address: "MIDC Bhosari, Pune 411026" },
  { legalName: "Mahalaxmi Fasteners", tradeName: "Mahalaxmi", stateCode: "27", address: "Andheri East, Mumbai 400093" },
  { legalName: "Nirmal Chemicals LLP", tradeName: "Nirmal Chem", stateCode: "24", address: "GIDC Vatva, Ahmedabad 382445" },
  { legalName: "Sagar Logistics Services", tradeName: "Sagar Log", stateCode: "24", address: "Sarkhej Road, Ahmedabad 380055" },
  { legalName: "Kapoor Electricals", tradeName: "Kapoor Elec", stateCode: "07", address: "Naraina Industrial Area, New Delhi 110028" },
  { legalName: "Sri Balaji Textiles", tradeName: "Balaji Tex", stateCode: "33", address: "Tirupur Road, Coimbatore 641604" },
  { legalName: "Vel Murugan Spinners", tradeName: "Vel Murugan", stateCode: "33", address: "SIDCO Industrial Estate, Coimbatore 641021" },
  { legalName: "Hindustan Abrasives", tradeName: "Hind Abrasives", stateCode: "06", address: "Sector 25, Faridabad 121004" },
  { legalName: "Trimurti Castings", tradeName: "Trimurti", stateCode: "27", address: "Waluj MIDC, Chhatrapati Sambhajinagar 431136", key: "trimurti" },
  { legalName: "Godavari Rubber Products", tradeName: "Godavari Rub", stateCode: "29", address: "Yeshwanthpur Industrial Suburb, Bengaluru 560022" },
  { legalName: "Sharda Industrial Supplies", tradeName: "Sharda Ind", stateCode: "07", address: "Wazirpur Industrial Area, New Delhi 110052" },
  { legalName: "Konark Metals", tradeName: "Konark", stateCode: "24", address: "Odhav GIDC, Ahmedabad 382415" },
  { legalName: "Amrit Tools & Dies", tradeName: "Amrit Tools", stateCode: "06", address: "Sector 6, IMT Manesar 122050" },
  { legalName: "Prakash Wire Industries", tradeName: "Prakash Wire", stateCode: "29", address: "Doddaballapur Industrial Area 561203" },
  { legalName: "Nandi Hydraulics", tradeName: "Nandi Hyd", stateCode: "29", address: "Hebbal Industrial Area, Mysuru 570016" },
  { legalName: "Bharat Insulation Co", tradeName: "Bharat Ins", stateCode: "27", address: "Taloja MIDC, Navi Mumbai 410208" },
  { legalName: "Suvarna Alloys", tradeName: "Suvarna", stateCode: "33", address: "Ambattur Industrial Estate, Chennai 600058" },
  { legalName: "Ganga Paper Mills", tradeName: "Ganga Paper", stateCode: "06", address: "Sector 57, Faridabad 121004" },
  { legalName: "Vindhya Forgings", tradeName: "Vindhya", stateCode: "24", address: "Rajkot Industrial Area 360004" },
  { legalName: "Chetak Bearings", tradeName: "Chetak", stateCode: "27", address: "Chinchwad, Pune 411019" },
  { legalName: "Ashoka Lubricants", tradeName: "Ashoka Lub", stateCode: "07", address: "Okhla Phase I, New Delhi 110020" },
  { legalName: "Malabar Coir Exports", tradeName: "Malabar Coir", stateCode: "29", address: "Attibele Industrial Area, Bengaluru 562107" },
  { legalName: "Rajdhani Sheet Metal", tradeName: "Rajdhani", stateCode: "07", address: "Mayapuri Industrial Area, New Delhi 110064" },
  { legalName: "Saraswati Adhesives", tradeName: "Saraswati", stateCode: "24", address: "Naroda GIDC, Ahmedabad 382330" },
  { legalName: "Neelkanth Valves", tradeName: "Neelkanth", stateCode: "27", address: "Ambernath MIDC, Thane 421506" },
];

const RING_ADDRESS = "Shop 14, Gill Road, Industrial Area B, Ludhiana 141003";
const RING_BANK = "50100294471";
const RING_PHONE = "+919812204471";
const RING_IP = "103.87.44.19";
const RING = [
  { key: "meridian", legalName: "Meridian Traders", tradeName: "Meridian", registeredOn: "2025-02-12" },
  { key: "kavach", legalName: "Kavach Supplies Co", tradeName: "Kavach", registeredOn: "2025-02-15" },
  { key: "orbit", legalName: "Orbit Metal Corporation", tradeName: "Orbit Metal", registeredOn: "2025-01-30" },
];

const PAIR_ADDRESS = "2nd Floor, 42 Ranjit Nagar, New Delhi 110008";
const PAIR_EMAIL = "accounts.filing2024@rediffmail.com";
const PAIR = [
  { key: "zenith", legalName: "Zenith Commodities", tradeName: "Zenith", registeredOn: "2024-08-18" },
  { key: "apex", legalName: "Apex Trade Links", tradeName: "Apex Trade", registeredOn: "2024-08-31" },
];

function buildGstin(stateCode: string, pan: string): string {
  const first14 = `${stateCode}${pan}1Z`;
  return first14 + gstinCheckDigit(first14);
}

function drawPan(rand: Random): string {
  return rand.letters(3) + "A" + rand.letters(1) + String(rand.int(1000, 9999)) + rand.letters(1);
}

function drawDigits(rand: Random, count: number, firstNonZero: boolean): string {
  let out = "";
  for (let i = 0; i < count; i++) {
    out += String(rand.int(i === 0 && firstNonZero ? 1 : 0, 9));
  }
  return out;
}

function drawBankAccount(rand: Random): string {
  return drawDigits(rand, 11, true);
}

function drawPhone(rand: Random): string {
  return `+9198${drawDigits(rand, 8, false)}`;
}

function drawFilingIp(rand: Random): string {
  return `49.${rand.int(30, 60)}.${rand.int(1, 254)}.${rand.int(1, 254)}`;
}

const ORDINARY_REG_START = Date.UTC(2019, 0, 1);
const ORDINARY_REG_END = Date.UTC(2023, 11, 31);
const ORDINARY_REG_SPAN_DAYS = Math.round((ORDINARY_REG_END - ORDINARY_REG_START) / 86_400_000);

function drawRegisteredOn(rand: Random): string {
  const ms = ORDINARY_REG_START + rand.int(0, ORDINARY_REG_SPAN_DAYS) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function emailSlug(tradeName: string): string {
  return tradeName.toLowerCase().replace(/\s+/g, "");
}

interface VendorInput {
  key: string;
  legalName: string;
  tradeName: string;
  stateCode: string;
  address: string;
  pan?: string;
  bankAccount?: string;
  phone?: string;
  email?: string;
  filingIp?: string;
  registeredOn?: string;
  aadhaarAuthenticated: boolean;
}

/**
 * Draws every attribute not supplied explicitly from the single shared generator, in
 * vendor order, and never reseeds it. That is the fix for the old generator's bug: the
 * multi-state branch below reuses only its parent's PAN, so its bank account, phone and
 * filing IP are always freshly drawn from wherever the shared stream has advanced to.
 */
function buildVendor(rand: Random, input: VendorInput): SampleVendor {
  const pan = input.pan ?? drawPan(rand);
  const bank_account = input.bankAccount ?? drawBankAccount(rand);
  const phone = input.phone ?? drawPhone(rand);
  const filing_ip = input.filingIp ?? drawFilingIp(rand);
  const registered_on = input.registeredOn ?? drawRegisteredOn(rand);
  const email = input.email ?? `accounts@${emailSlug(input.tradeName)}.co.in`;
  const state = STATE_NAMES[input.stateCode];
  if (!state) {
    throw new Error(`buildVendor: unknown state code "${input.stateCode}"`);
  }
  return {
    key: input.key,
    legal_name: input.legalName,
    trade_name: input.tradeName,
    gstin: buildGstin(input.stateCode, pan),
    pan,
    state,
    state_code: input.stateCode,
    address: input.address,
    bank_account,
    phone,
    email,
    filing_ip,
    registered_on,
    aadhaar_authenticated: input.aadhaarAuthenticated,
  };
}

export function buildVendors(): SampleVendor[] {
  const rand = makeRandom(1947);
  const vendors: SampleVendor[] = [];

  for (const entry of CLEAN) {
    vendors.push(
      buildVendor(rand, {
        key: entry.key ?? emailSlug(entry.tradeName),
        legalName: entry.legalName,
        tradeName: entry.tradeName,
        stateCode: entry.stateCode,
        address: entry.address,
        aadhaarAuthenticated: true,
      }),
    );
  }

  // The multi-state branch (legitimate — same PAN, different state registration).
  const parentPan = vendors[0]!.pan; // "Sundaram Steel Traders" is CLEAN[0].
  vendors.push(
    buildVendor(rand, {
      key: "sundaram_mh",
      legalName: "Sundaram Steel Traders (Maharashtra)",
      tradeName: "Sundaram Steel MH",
      stateCode: "27",
      address: "Kalamboli Steel Market, Navi Mumbai 410218",
      pan: parentPan,
      aadhaarAuthenticated: true,
    }),
  );

  // The shell ring — shares bank account, address, phone and filing IP.
  for (const r of RING) {
    vendors.push(
      buildVendor(rand, {
        key: r.key,
        legalName: r.legalName,
        tradeName: r.tradeName,
        stateCode: "03",
        address: RING_ADDRESS,
        bankAccount: RING_BANK,
        phone: RING_PHONE,
        filingIp: RING_IP,
        email: `${r.key}.ludhiana@gmail.com`,
        registeredOn: r.registeredOn,
        aadhaarAuthenticated: false,
      }),
    );
  }

  // The softer pair — shares only address and email.
  for (const p of PAIR) {
    vendors.push(
      buildVendor(rand, {
        key: p.key,
        legalName: p.legalName,
        tradeName: p.tradeName,
        stateCode: "07",
        address: PAIR_ADDRESS,
        email: PAIR_EMAIL,
        registeredOn: p.registeredOn,
        aadhaarAuthenticated: true,
      }),
    );
  }

  // Two vendors that are never captured, so the unknown band is visible.
  vendors.push(
    buildVendor(rand, {
      key: "vaishnavi",
      legalName: "Vaishnavi Traders",
      tradeName: "Vaishnavi",
      stateCode: "29",
      address: "Chickpet Main Road, Bengaluru 560053",
      registeredOn: "2026-08-02",
      aadhaarAuthenticated: true,
    }),
  );
  vendors.push(
    buildVendor(rand, {
      key: "northline",
      legalName: "Northline Components",
      tradeName: "Northline",
      stateCode: "06",
      address: "Sector 18, Gurugram 122015",
      registeredOn: "2026-07-19",
      aadhaarAuthenticated: true,
    }),
  );

  return vendors;
}
