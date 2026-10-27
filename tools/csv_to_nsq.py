"""Convert a CDSCO NSQ portal CSV export into the JSON rows the importer expects.

Usage: python3 -I tools/csv_to_nsq.py <export.csv> > data/nsq/YYYY-MM.json
"""
import csv, json, re, sys
from collections import Counter

MONTHS = {m: i + 1 for i, m in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split())}

def period_of(s):
    m = re.match(r"\s*([A-Za-z]{3})[A-Za-z]*[\s\-]*(\d{4})", s or "")
    return f"{m.group(2)}-{MONTHS[m.group(1).upper()]:02d}" if m else ""

def source_of(s):
    s = (s or "").lower()
    return "spurious" if "spurious" in s else "central" if ("cdsco" in s or "central" in s or "cdl" in s) else "state"

rows = []
with open(sys.argv[1], encoding="utf-8-sig", newline="") as f:
    for r in csv.DictReader(f):
        if not (r.get("Batch No") or "").strip():
            continue
        rows.append({
            "sno": int(r["S.No"]) if r["S.No"].strip().isdigit() else len(rows) + 1,
            "product": r["Name of Product"].strip(),
            "batch": r["Batch No"].strip(),
            "mfg": r["Manufacturing Date"].strip(),
            "expiry": r["Expiry Date"].strip(),
            "mfr": r["Manufactured By"].strip(),
            "result": r["NSQ Result"].strip(),
            "lab": r["Reporting by Lab/State"].strip(),
            "period": period_of(r["Reporting Month & Year"]),
            "source": source_of(r["Reporting Source"]),
            "source_url": "https://cdsco.gov.in/opencms/opencms/en/Notifications/nsq-drugs/",
        })
print(f"{len(rows)} rows; sources {dict(Counter(x['source'] for x in rows))}; periods {dict(Counter(x['period'] for x in rows))}", file=sys.stderr)
json.dump(rows, sys.stdout, indent=1, ensure_ascii=False)
