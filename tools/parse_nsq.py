"""Parse a CDSCO NSQ / spurious alert PDF into JSON rows.

Usage: python3 -I tools/parse_nsq.py <alert.pdf> --period 2026-09 --source central|state [--url URL] > out.json

CDSCO renames columns between months and splits rows across pages, so columns
are mapped by keyword and rows without a serial number are glued onto the
previous row.
"""
import argparse, json, re, sys
import pdfplumber

COLUMNS = {
    "product": ["product", "drug name", "name of the drug"],
    "batch": ["batch"],
    "mfg": ["manufacturing", "mfg"],
    "expiry": ["expiry", "exp"],
    "mfr": ["manufactured by", "manufacturer", "name of manufacturer"],
    "result": ["nsq result", "result", "reason", "parameter"],
    "lab": ["reported by", "laboratory", "tested by", "state"],
}

def clean(s):
    return re.sub(r"\s+", " ", (s or "").replace("\n", " ")).strip()

def map_header(row):
    cells = [clean(c).lower() for c in row]
    if not any("batch" in c for c in cells):
        return None
    mapping = {}
    for key, words in COLUMNS.items():
        for i, c in enumerate(cells):
            if i in mapping.values():
                continue
            if any(w in c for w in words):
                mapping[key] = i
                break
    return mapping if {"product", "batch"} <= mapping.keys() else None

def parse(path):
    rows, header = [], None
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for raw in table:
                    h = map_header(raw)
                    if h:
                        header = h
                        continue
                    if not header:
                        continue
                    get = lambda k: raw[header[k]] if k in header and header[k] < len(raw) else ""
                    serial = clean(raw[0]) if raw else ""
                    rec = {k: clean(get(k)) for k in COLUMNS}
                    if re.match(r"^\d+\.?$", serial):
                        rec["sno"] = int(serial.rstrip("."))
                        rows.append(rec)
                    elif rows and any(rec.values()):
                        # continuation of the previous row (split across a page break)
                        for k, v in rec.items():
                            if v:
                                rows[-1][k] = (rows[-1].get(k, "") + " " + v).strip()
    return rows

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--period", required=True, help="alert month, YYYY-MM")
    ap.add_argument("--source", required=True, choices=["central", "state", "spurious"])
    ap.add_argument("--url", default="")
    a = ap.parse_args()
    rows = parse(a.pdf)
    for r in rows:
        r.update(period=a.period, source=a.source, source_url=a.url)
    print(f"parsed {len(rows)} rows from {a.pdf}", file=sys.stderr)
    json.dump(rows, sys.stdout, indent=1, ensure_ascii=False)
