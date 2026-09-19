import csv, json, hashlib, random
from datetime import date, timedelta

random.seed(1947)

STATES = [("29","Karnataka"),("27","Maharashtra"),("07","Delhi"),("33","Tamil Nadu"),("24","Gujarat"),("06","Haryana")]

def gstin(state, pan, n=1):
    return f"{state}{pan}{n}Z{random.choice('123456789')}"

def pan(seed):
    random.seed(seed)
    L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return "".join(random.choice(L) for _ in range(3)) + "A" + random.choice(L) + str(random.randint(1000,9999)) + random.choice(L)

CLEAN = [
 ("Sundaram Steel Traders","Sundaram Steel","29","Peenya Industrial Area, Phase II, Bengaluru 560058"),
 ("Kaveri Packaging Pvt Ltd","Kaveri Pack","29","Bommasandra Industrial Area, Bengaluru 560099"),
 ("Deccan Polymers","Deccan Poly","29","Jigani Link Road, Anekal, Bengaluru 562106"),
 ("Anand Engineering Works","Anand Engg","27","MIDC Bhosari, Pune 411026"),
 ("Mahalaxmi Fasteners","Mahalaxmi","27","Andheri East, Mumbai 400093"),
 ("Nirmal Chemicals LLP","Nirmal Chem","24","GIDC Vatva, Ahmedabad 382445"),
 ("Sagar Logistics Services","Sagar Log","24","Sarkhej Road, Ahmedabad 380055"),
 ("Kapoor Electricals","Kapoor Elec","07","Naraina Industrial Area, New Delhi 110028"),
 ("Sri Balaji Textiles","Balaji Tex","33","Tirupur Road, Coimbatore 641604"),
 ("Vel Murugan Spinners","Vel Murugan","33","SIDCO Industrial Estate, Coimbatore 641021"),
 ("Hindustan Abrasives","Hind Abrasives","06","Sector 25, Faridabad 121004"),
 ("Trimurti Castings","Trimurti","27","Waluj MIDC, Chhatrapati Sambhajinagar 431136"),
 ("Godavari Rubber Products","Godavari Rub","29","Yeshwanthpur Industrial Suburb, Bengaluru 560022"),
 ("Sharda Industrial Supplies","Sharda Ind","07","Wazirpur Industrial Area, New Delhi 110052"),
 ("Konark Metals","Konark","24","Odhav GIDC, Ahmedabad 382415"),
 ("Amrit Tools & Dies","Amrit Tools","06","Sector 6, IMT Manesar 122050"),
 ("Prakash Wire Industries","Prakash Wire","29","Doddaballapur Industrial Area 561203"),
 ("Nandi Hydraulics","Nandi Hyd","29","Hebbal Industrial Area, Mysuru 570016"),
 ("Bharat Insulation Co","Bharat Ins","27","Taloja MIDC, Navi Mumbai 410208"),
 ("Suvarna Alloys","Suvarna","33","Ambattur Industrial Estate, Chennai 600058"),
 ("Ganga Paper Mills","Ganga Paper","06","Sector 57, Faridabad 121004"),
 ("Vindhya Forgings","Vindhya","24","Rajkot Industrial Area 360004"),
 ("Chetak Bearings","Chetak","27","Chinchwad, Pune 411019"),
 ("Ashoka Lubricants","Ashoka Lub","07","Okhla Phase I, New Delhi 110020"),
 ("Malabar Coir Exports","Malabar Coir","29","Attibele Industrial Area, Bengaluru 562107"),
 ("Rajdhani Sheet Metal","Rajdhani","07","Mayapuri Industrial Area, New Delhi 110064"),
 ("Saraswati Adhesives","Saraswati","24","Naroda GIDC, Ahmedabad 382330"),
 ("Neelkanth Valves","Neelkanth","27","Ambernath MIDC, Thane 421506"),
]

# The shell ring — shares bank account + address + phone + filing IP
RING_ADDR = "Shop 14, Gill Road, Industrial Area B, Ludhiana 141003"
RING_BANK = "50100294471"
RING_PHONE = "+919812204471"
RING_IP = "103.87.44.19"
RING = [
 ("Meridian Traders","Meridian","03"),
 ("Kavach Supplies Co","Kavach","03"),
 ("Orbit Metal Corporation","Orbit Metal","03"),
]

# Softer pair — shared email + address only
PAIR_ADDR = "2nd Floor, 42 Ranjit Nagar, New Delhi 110008"
PAIR_EMAIL = "accounts.filing2024@rediffmail.com"
PAIR = [("Zenith Commodities","Zenith","07"),("Apex Trade Links","Apex Trade","07")]

vendors = []
vid = 0

def add(name, trade, st, addr, bank=None, phone=None, email=None, ip=None,
        reg=None, aadhaar=True, p=None):
    global vid
    vid += 1
    code = dict(STATES)[st] if st in dict(STATES) else "Punjab"
    pn = p or pan(name)
    vendors.append({
        "id": f"V{vid:03d}", "legal_name": name, "trade_name": trade,
        "gstin": gstin(st, pn), "pan": pn, "state": code,
        "address": addr,
        "bank_account": bank or str(random.randint(10000000000, 99999999999)),
        "phone": phone or f"+9198{random.randint(10000000,99999999)}",
        "email": email or f"accounts@{trade.lower().replace(' ','')}.co.in",
        "filing_ip": ip or f"49.{random.randint(30,60)}.{random.randint(1,254)}.{random.randint(1,254)}",
        "registered_on": (reg or date(2019,1,1) + timedelta(days=random.randint(0, 1800))).isoformat(),
        "aadhaar_authenticated": aadhaar,
    })

for n, t, s, a in CLEAN:
    add(n, t, s, a)

# multi-state branch pair (legitimate — tests rule A2)
branch_pan = pan("Sundaram Steel Traders")
add("Sundaram Steel Traders (Maharashtra)", "Sundaram Steel MH", "27",
    "Kalamboli Steel Market, Navi Mumbai 410218", p=branch_pan)

for n, t, s in RING:
    add(n, t, s, RING_ADDR, bank=RING_BANK, phone=RING_PHONE, ip=RING_IP,
        email=f"{t.lower()}.ludhiana@gmail.com",
        reg=date(2025, 1, 12) + timedelta(days=random.randint(0, 40)),
        aadhaar=False)

for n, t, s in PAIR:
    add(n, t, s, PAIR_ADDR, email=PAIR_EMAIL,
        reg=date(2024, 8, 3) + timedelta(days=random.randint(0, 60)))

ring_ids = [v["id"] for v in vendors if v["legal_name"] in [r[0] for r in RING]]
pair_ids = [v["id"] for v in vendors if v["legal_name"] in [p[0] for p in PAIR]]
lapsed_id = "V012"   # Trimurti Castings — filing gap, no cancellation

# ---------- snapshots ----------
months = []
d = date(2025, 3, 1)
while d <= date(2026, 9, 1):
    months.append(d)
    d = (d.replace(day=28) + timedelta(days=5)).replace(day=1)

snapshots = []
prev = {}

def seal(v_id, captured, status, returns_current, last_filed, retro_from=None):
    payload = json.dumps({"v": v_id, "c": captured.isoformat(), "s": status,
                          "rc": returns_current, "lf": last_filed}, sort_keys=True)
    ph = prev.get(v_id, "0" * 16)
    h = hashlib.sha256((ph + payload).encode()).hexdigest()[:16]
    prev[v_id] = h
    snapshots.append({
        "id": f"S{len(snapshots)+1:05d}", "vendor_id": v_id,
        "captured_at": captured.isoformat(), "status": status,
        "returns_current": returns_current, "last_return_filed": last_filed,
        "retrospective_from": retro_from,
        "payload_hash": h, "prev_hash": ph,
    })

for v in vendors:
    reg = date.fromisoformat(v["registered_on"])
    for m in months:
        if m < reg:
            continue
        status, rc = "Active", True
        retro = None
        lf = (m - timedelta(days=25)).strftime("%b %Y")

        if v["id"] in ring_ids:
            # active and clean-looking all through 2025, cancelled retrospectively Jul 2026
            if m >= date(2026, 3, 1):
                rc = False
                lf = "Feb 2026"
            if m >= date(2026, 5, 1):
                status = "Suspended"
            if m >= date(2026, 7, 1):
                status = "Cancelled"
                retro = "2025-04-01"

        if v["id"] in pair_ids:
            if date(2026, 1, 1) <= m < date(2026, 6, 1):
                rc = False
                lf = "Dec 2025"

        if v["id"] == lapsed_id:
            if m >= date(2026, 4, 1):
                rc = False
                lf = "Mar 2026"

        seal(v["id"], m, status, rc, lf, retro_from=retro)

# ---------- transactions ----------
tx = []
tid = 0
def txn(v_id, dt, amount, rate=0.18, mode="NEFT", eway=True):
    global tid
    tid += 1
    tx.append({
        "id": f"T{tid:04d}", "vendor_id": v_id,
        "invoice_no": f"INV/{dt.strftime('%y%m')}/{random.randint(100,999)}",
        "date": dt.isoformat(), "amount": amount,
        "itc_claimed": round(amount * rate / (1 + rate)),
        "payment_mode": mode,
        "eway_bill": f"EWB{random.randint(10**11, 10**12-1)}" if eway and amount > 50000 else "",
    })

for v in vendors:
    reg = date.fromisoformat(v["registered_on"])
    if v["id"] in ring_ids:
        # heavy, round-figure, some cash — all BEFORE the retrospective cancellation date
        for m in [date(2025,5,9), date(2025,6,21), date(2025,8,14), date(2025,9,27),
                  date(2025,11,6), date(2026,1,19), date(2026,2,25)]:
            txn(v["id"], m, random.choice([250000, 500000, 750000, 1000000]),
                mode=random.choice(["NEFT","NEFT","Cash"]), eway=random.random() > 0.55)
    elif v["id"] in pair_ids:
        for m in [date(2025,7,3), date(2025,10,17), date(2026,2,8)]:
            txn(v["id"], m, random.randrange(80000, 420000, 5000))
    else:
        for _ in range(random.randint(3, 8)):
            dt = date(2025,3,1) + timedelta(days=random.randint(0, 550))
            if dt < reg:
                continue
            txn(v["id"], dt, random.randrange(34000, 890000, 1000))

# ---------- write ----------
import os
os.makedirs("/mnt/user-data/outputs/data", exist_ok=True)
base = "/mnt/user-data/outputs/data"

with open(f"{base}/vendors.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(vendors[0].keys()))
    w.writeheader(); w.writerows(vendors)

with open(f"{base}/transactions.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(tx[0].keys()))
    w.writeheader(); w.writerows(tx)

with open(f"{base}/snapshots.json", "w") as f:
    json.dump(snapshots, f, indent=1)

ring_tx = [t for t in tx if t["vendor_id"] in ring_ids]
print(f"vendors      {len(vendors)}")
print(f"snapshots    {len(snapshots)}")
print(f"transactions {len(tx)}")
print(f"\nSHELL RING: {ring_ids}")
print(f"  ring transactions : {len(ring_tx)}")
print(f"  ring value        : Rs {sum(t['amount'] for t in ring_tx):,}")
print(f"  ITC exposed       : Rs {sum(t['itc_claimed'] for t in ring_tx):,}")
print(f"  cash payments     : {sum(1 for t in ring_tx if t['payment_mode']=='Cash')}")
print(f"  missing e-way     : {sum(1 for t in ring_tx if not t['eway_bill'])}")
print(f"\nSOFT PAIR : {pair_ids}")
print(f"LAPSED    : {lapsed_id}")
