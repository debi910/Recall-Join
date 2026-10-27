# Recall Join

**A drug recall is a database JOIN that nobody runs.** Every month India's drug regulator (CDSCO) publishes the batches that failed quality tests (330 samples in September 2026). Every chemist already has batch numbers in their billing software. Recall Join joins the two tables, tells the chemist which strips on their shelf are listed, and runs the quarantine and the return to the distributor in one transaction.

Built solo for the [Appwrite Databases Hackathon](https://hackathon.appwrite.io/) (19–31 Oct 2026) on **Appwrite TablesDB**.

## Why existing tools aren't enough

Public lookups ([blacklisted.co.in](https://blacklisted.co.in/medicines/check), [drugquality.in](https://drugquality.in/), the CDSCO page itself) answer one question at a time for one consumer: *"is this batch listed?"* Nobody checks a shop's **whole stock** against **every** list and then follows the return through to the distributor. Matching is also harder than an exact lookup:

- **Batch numbers aren't unique.** Real lists contain codes like `0081`, `07493` and `00 57`. A batch-only lookup raises false alarms for other makers' products.
- **Formatting differs** between the regulator and billing software (`SP-240165`, `sp240165`, `SP 240165`).
- **Look-alike characters** (0/O, 1/I, 5/S, 8/B) get mistyped or mis-scanned.

## Results

### Held-out: September 2026 list (`CASES=./cases-2026-09.json npm run eval`)

The matching rules were frozen before this list was loaded. The 50 stock rows are **synthetic variants of real Sep 2026 CDSCO rows**: 15 formatting variants, 10 batch-code collisions, 10 look-alike typos and 15 clean rows. Labels are known by construction.

| Method | Flag precision | Flag recall | False flags | Typos sent to a human |
|---|---|---|---|---|
| Exact batch lookup | 41% | 47% | 10 | 0/10 |
| Batch-only, ignore spaces/hyphens (what public lookups do) | 60% | 100% | 10 | 0/10 |
| **Recall Join** | **100%** | **100%** | **0** | **10/10** |

The development set (March 2025 central list, `npm run eval`) gives the same pattern. These numbers measure the matching logic on constructed variants, not a field study.

### What the real Jul–Sep 2026 lists show (739 batches)

- **53 batch codes (7%) are 4 characters or fewer**, e.g. `4063`, `A-1`, `0064`. Codes this short repeat across makers.
- **3 batch codes appear for two different makers within three months**. In one case (`VBC0116`), the same product name is listed under two different manufacturers.
- Data: the CDSCO NSQ portal export for Jul, Aug and Sep 2026. Central-lab counts match the press reports (40 / 29 / 42). The state-lab rows in the export (199 / 171 / 258) are fewer than the reported totals (240 / 191 / 288), so some state data is missing from the export.

## How Appwrite Databases do the work

| TablesDB feature | Used for |
|---|---|
| Tables + indexes (`batch_skel`, `shop_id+batch_skel`) | The join: stock rows probe the regulator table through an index on a look-alike-safe batch key |
| Bulk operations (`createRows`, `upsertRows`, `deleteRows`) | Importing a month's list and a 300+ row stock export |
| **Transactions** | Quarantine: block stock rows, close matches, create return notes and write the audit entry together, or not at all |
| **Row-level permissions** + Teams | A shop sees only its stock. A distributor sees only return notes addressed to it. Regulator data is readable by any signed-in user. |
| **Realtime** | New matches slide into the chemist's screen the moment a new list is imported |
| Functions | All writes go through one server function that enforces the rules |

```
CDSCO PDF ──parse_nsq.py──▶ nsq_batches ──┐
                                           ├─ index join on batch_skel ─▶ classify (core/match.js) ─▶ matches ──Realtime──▶ chemist UI
billing CSV ──uploadStock──▶ stock_items ──┘                                                            │
                                                               quarantine (one transaction) ◀────────────┘
                                                               ├─ stock_items.status = quarantined
                                                               ├─ return_notes (visible to distributor team)
                                                               └─ audit ── read-back check ─▶ "✓ verified"
```

## Where it stops

- It **never says a batch is safe**. "No match" means "not on the lists we imported", and the UI lists which months those are.
- A **FLAG needs two independent agreements**: the same normalized batch, plus the same maker, or the same expiry/product when the maker is unknown. Product-name similarity alone never flags anything.
- **Collisions and look-alike typos go to the pharmacist** ("check the strip"). They can be quarantined only after a human confirms.
- Quarantine is **one transaction**. Afterwards the function **reads the rows back** and only then marks the audit entry verified.
- It gives no medical advice and contacts no patients.

The matching logic is explained step by step in [`core-logic-explained.md`](core-logic-explained.md).

## Setup (5 commands)

```bash
npm install
cp .env.example .env        # fill in endpoint, project ID, an API key with databases/teams/users scopes
npm run setup               # tables, columns, indexes, demo teams and users
npm run import:nsq -- data/nsq/2026-07.json data/nsq/2026-08.json   # Sep 2026 is imported live in the demo
npm run dev                 # web app on http://localhost:5173  (design preview without a backend: /?mock)
```

Deploy `functions/recall-join` as an Appwrite Function (Node 22, entry `src/main.js`, execute access: users, scopes: `databases.*`, `users.read`). Run `npm run build:function` first so it carries the current `core/`. Deploy `web/` to Appwrite Sites (build `npm run build`, output `web/dist`).

## Real vs mocked

| Part | Status |
|---|---|
| CDSCO NSQ rows | **Real**: Jul–Sep 2026 portal exports (`tools/csv_to_nsq.py`) and the Mar 2025 PDF (`tools/parse_nsq.py`), in `data/nsq/` |
| Appwrite TablesDB, Realtime, Teams, Functions, Auth | **Real** |
| Chemist stock (`web/public/data/demo-stock.csv`) | **Synthetic**: invented makers and distributors, seeded with 6 variants of real listed batches |
| Eval stock rows | **Synthetic** variants of real rows (see above) |

## Tech stack and libraries

Appwrite Cloud (TablesDB, Functions, Realtime, Teams, Auth, Sites) · `node-appwrite` · `appwrite` (web SDK) · Vite · `pdfplumber` (Python, PDF table extraction) · `dotenv` · fonts: Fraunces, IBM Plex Sans/Mono (Google Fonts). All code was written during the hackathon window; see [`CHANGELOG.md`](CHANGELOG.md).

## Sources

- CDSCO NSQ alerts: https://cdsco.gov.in/opencms/opencms/en/Notifications/nsq-drugs/
- Sep 2026 figures (330 NSQ, 42 central / 288 state): https://news.webindia123.com/news/Articles/India/20261023/4514127.html
- Recall guidelines lack legal force: https://theprint.in/health/drug-regulators-latest-guidelines-on-recall-lack-teeth-legal-backing-have-too-many-loopholes/2232507/
- "No guarantee that such drugs are withdrawn": https://www.sentinelassam.com/topheadlines/india-faces-rising-threat-of-spurious-drugs-amid-poor-pharmacy-monitoring
