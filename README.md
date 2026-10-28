# Recall Join

> **Limitations, read first.** We have no real chemist's stock. The demo shop's stock (`web/public/data/demo-stock.csv`) is synthetic, and so is the 50-case eval behind the "100% vs 60% precision" numbers in earlier versions of this page: its 60% baseline score comes straight from how many collision cases we chose to build (15 true hits and 10 collisions give 15/25). The real-data eval below uses only strings written by regulator labs and by a real retail medicine catalogue. On it, Recall Join is more precise than a batch-only lookup but **not perfect**. Three matcher fixes were made **after** seeing the real-data failures, so the "after" numbers are not held-out; both are shown. Nothing here has been tested in a working pharmacy.

**A drug recall is a database JOIN that nobody runs.** Every month India's drug regulator (CDSCO) publishes the batches that failed quality tests (330 samples in September 2026). Every chemist already has batch numbers in their billing software. Recall Join joins the two tables, tells the chemist which strips on their shelf are listed, and runs the quarantine and the return to the distributor in one transaction.

Built solo for the [Appwrite Databases Hackathon](https://hackathon.appwrite.io/) (19–31 Oct 2026) on **Appwrite TablesDB**.

## Try it live

**https://recall-join.appwrite.network**

| Role | Email | Password |
|---|---|---|
| Chemist shop | `chemist@recalljoin.demo` | `RecallDemo-e908c4` |
| Distributor | `distributor@recalljoin.demo` | `RecallDemo-e908c4` |

These are demo-only accounts on a demo backend. The chemist account opens with demo stock already loaded and matched against the real Jul–Sep 2026 CDSCO lists (3 batches to pull, 2 to check by hand), and a notice explains that the stock is synthetic. To test your own stock, upload a billing CSV (Item, Batch, Expiry, Company, Qty, MRP, Party); "Use demo stock" on the Activity tab puts the demo stock back. The login screen shows these too, and its "Chemist shop" and "Distributor" buttons sign you in with one tap.

## Why existing tools aren't enough

Public lookups ([blacklisted.co.in](https://blacklisted.co.in/medicines/check), [drugquality.in](https://drugquality.in/), the CDSCO page itself) answer one question at a time for one consumer: *"is this batch listed?"* Nobody checks a shop's **whole stock** against **every** list and then follows the return through to the distributor. Matching is also harder than an exact lookup:

- **Batch numbers aren't unique.** 7% of real codes are 4 characters or fewer, and the real lists already contain codes reused across products and makers. A batch-only lookup flags those as hits.
- **Formatting differs** between the regulator and billing software (`SP-240165`, `sp240165`, `SP 240165`).
- **Look-alike characters** (0/O, 1/I, 5/S, 8/B) get mistyped or mis-scanned.

## Results

All numbers come from scripts in `eval/`; rerun them to check. Cells read *flag / review / no alert*.

### 1. Real data: the same batch written down by two labs (`npm run eval:real`, part A)

CDSCO's own lists (Mar 2025, Jul–Sep 2026; 809 real rows) contain 19 batch codes that appear more than once: the same batch reported by two labs or in two months, and different products that reuse a code. Each real row is matched, as if it were the shop's row, against every *other* real row. The 19 groups were labelled by hand before scoring ([`eval/real/cross-lab-labels.json`](eval/real/cross-lab-labels.json), with the reason for each).

| Method | Same batch, other lab (28) | Different product, same code (6) | Can't tell (4) | Code seen once (771) | Flag precision | Flag recall |
|---|---|---|---|---|---|---|
| Exact batch lookup | 24 / 0 / 4 | 6 / 0 / 0 | 4 / 0 / 0 | 0 / 0 / 771 | 80% | 86% |
| Batch-only, ignore spaces/hyphens | 26 / 0 / 2 | 6 / 0 / 0 | 4 / 0 / 0 | 0 / 0 / 771 | 81% | 93% |
| **Recall Join** | 24 / 4 / 0 | 2 / 4 / 0 | 2 / 2 / 0 | 0 / 0 / 771 | **92%** | 86% |

What went wrong, honestly:
- **False flag (real):** code `05` is used by one maker for two different products (a laparotomy sponge and a dressing pad) with the same expiry. Same maker + same expiry is enough for a FLAG, so Recall Join flags it.
- **Sent to a human instead of flagged:** `BKBP02601` vs `BKBP O2601` (one lab typed the letter O for zero) and `ACG25007` (one lab wrote the brand *Nicardia Retard*, the other the generic *Nifedipine SR*). Nothing was missed, but these needed a human.
- **Collisions are rarer than our synthetic eval assumed:** 4 of 809 real rows reuse another product's code. The precision gap is real but smaller than the synthetic eval suggested.

### 2. Real retail names (`npm run eval:real`, part B)

How does billing software name the item and its company? We paired real regulator rows with the real retail listing of the same brand from the public **A-Z Medicine Dataset of India** (253,973 listings; exact brand prefix plus the same first ingredient and dosage form; 93 pairs, [`eval/real/retail-cases.json`](eval/real/retail-cases.json)). The batch code is copied from the regulator row, so this part tests the maker, product and expiry checks, not batch matching. The maker relationship was labelled by hand ([`retail-labels.json`](eval/real/retail-labels.json)). Both baselines flag all 93 because they ignore names, so they never miss here.

| Recall Join | Same company named (42) | Brand owner named, CDSCO lists the factory (12) | Two different firms (39) | Silently missed |
|---|---|---|---|---|
| **Before fixes**, export has expiry | 41 / 1 / 0 | 0 / 12 / 0 | 7 / 32 / 0 | 0 / 93 |
| **Before fixes**, no expiry column | 39 / 3 / 0 | 0 / 11 / 1 | 7 / 27 / 5 | **6 / 93** |
| **After fixes**, export has expiry | 42 / 0 / 0 | 12 / 0 / 0 | 38 / 1 / 0 | 0 / 93 |
| **After fixes**, no expiry column | 40 / 2 / 0 | 0 / 12 / 0 | 0 / 39 / 0 | **0 / 93** |
| After fixes, the case's own listing left out of the owner table, with expiry | 42 / 0 / 0 | 3 / 9 / 0 | 6 / 33 / 0 | 0 / 93 |

What the real data exposed, and what changed ([`results-before.md`](eval/real/results-before.md) → [`results.md`](eval/real/results.md)):
1. **Brand owner vs factory.** Shops see *Augmentin, Glaxo SmithKline*; CDSCO lists *Medreich Ltd.*, the plant that made it. Before, these never auto-flagged, and without an expiry *Augmentin* was missed entirely. **Fix:** a brand-owner table ([`core/brand-owners.js`](core/brand-owners.js), built by `tools/build-brand-owners.js` from the same retail catalogue) for every brand on the bundled lists. A brand owner counts as the maker only when the shelf item is that brand **and** the batch **and** the expiry month agree; without an expiry it goes to the pharmacist.
2. **Maker-name bugs.** `Glaxo SmithKline` didn't match `GlaxoSmithKline`; makers named only with generic words (*Care Formulation Labs*, *Sun Life Sciences*) counted as "unknown", so product + expiry alone flagged them. **Fix:** glued word pairs are compared, and generic-only names are compared by their first word.
3. **No expiry column.** An exact batch whose maker differs was dropped when the product score was low. **Fix:** with no expiry to rule it out, a shared product word sends it to the pharmacist. Silent misses went from 6 to 0.

How far to trust the "after" rows:
- The owner table comes from the same catalogue as the test names, so the 12/12 brand-owner flags are **by construction**. The leave-one-out row is the fairer number: when a brand's owner is known only from the listing under test, it falls back to "ask the pharmacist" (9 of 12).
- The "two different firms" column has **no ground truth**. With expiry, 38 of 39 now auto-flag because the brand, batch code and expiry month all agree. That is strong evidence of the same product, but some may be a different firm's same-named brand. Only the strip can tell.
- Part A is unchanged by the fixes (92% vs 81%), including the real false flag on code `05`. The synthetic eval and the demo shop's matches are also unchanged.

### 3. Synthetic stress test (`npm run eval`, `CASES=./cases-2026-09.json npm run eval`)

50 synthetic stock rows built from real rows: 15 formatting variants, 10 constructed collisions, 10 look-alike typos, 15 clean rows. The matching rules were frozen before the Sep 2026 list was loaded. Recall Join: 100% precision and recall, all 10 typos sent to a human; batch-only lookup: 60% precision. **This checks that each designed rule works; it is not evidence of real-world accuracy.** The case mix decides the baseline's score, and the same author wrote the rules and the cases.

### What the real Jul–Sep 2026 lists show (739 batches)

- **53 batch codes (7%) are 4 characters or fewer**, e.g. `4063`, `A-1`, `0064`. Short codes like these are easy to reuse.
- **2 batch codes appear for two different makers within three months** (`MWDC-5421G`: two unrelated antibiotics; `VBC-0116`: the same vet product under two makers), plus one "Not Mentioned" placeholder in the batch column. One maker also used `05` for two different products.
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
- A **FLAG needs the batch plus independent agreement**: the same normalized batch, plus the same maker and (product or expiry), or product/expiry when the maker is unknown, or the brand's retail owner plus the same brand and expiry month. Product-name similarity alone never flags anything.
- **Collisions and look-alike typos go to the pharmacist** ("check the strip"). They can be quarantined only after a human confirms.
- Quarantine is **one transaction**. Afterwards the function **reads the rows back** and only then marks the audit entry verified.
- It gives no medical advice and contacts no patients.

The matching logic is explained step by step in [`core-logic-explained.md`](core-logic-explained.md).

## Setup (5 commands)

```bash
npm install
cp .env.example .env        # fill in endpoint, project ID, an API key with databases/teams/users scopes
npm run setup               # tables, columns, indexes, demo teams and users
npm run import:nsq -- data/nsq/2026-07.json data/nsq/2026-08.json data/nsq/2026-09.json
npm run dev                 # web app on http://localhost:5173  (design preview without a backend: /?mock)
```

Then `npm run deploy` creates and deploys the Function (Node 22, entry `src/main.js`, execute access: users, scopes: databases/tables/rows read+write, `users.read`, with the current `core/` copied in) and builds `web/` and uploads it to Appwrite Sites as static files. The API key also needs `functions.write` and `sites.write` for this step.

## Real vs mocked

| Part | Status |
|---|---|
| CDSCO NSQ rows | **Real**: Jul–Sep 2026 portal exports (`tools/csv_to_nsq.py`) and the Mar 2025 PDF (`tools/parse_nsq.py`), in `data/nsq/` |
| Appwrite TablesDB, Realtime, Teams, Functions, Auth | **Real** |
| Chemist stock (`web/public/data/demo-stock.csv`) | **Synthetic**: invented makers and distributors, seeded with 6 variants of real listed batches |
| Synthetic eval (`eval/cases*.json`) | **Synthetic** variants of real rows |
| Real-data eval (`eval/real/`) | **Real** regulator rows and real retail listings; hand labels; batch copied in part B |

## Tech stack and libraries

Appwrite Cloud (TablesDB, Functions, Realtime, Teams, Auth, Sites) · `node-appwrite` · `appwrite` (web SDK) · Vite · `pdfplumber` (Python, PDF table extraction) · `dotenv` · fonts: Fraunces, IBM Plex Sans/Mono (Google Fonts). All code was written during the hackathon window; see [`CHANGELOG.md`](CHANGELOG.md).

## Sources

- CDSCO NSQ alerts: https://cdsco.gov.in/opencms/opencms/en/Notifications/nsq-drugs/
- Retail names for the real-data eval: A-Z Medicine Dataset of India (Kaggle, shudhanshusingh), mirror used: https://github.com/junioralive/Indian-Medicine-Dataset
- Sep 2026 figures (330 NSQ, 42 central / 288 state): https://news.webindia123.com/news/Articles/India/20261023/4514127.html
- Recall guidelines lack legal force: https://theprint.in/health/drug-regulators-latest-guidelines-on-recall-lack-teeth-legal-backing-have-too-many-loopholes/2232507/
- "No guarantee that such drugs are withdrawn": https://www.sentinelassam.com/topheadlines/india-faces-rising-threat-of-spurious-drugs-amid-poor-pharmacy-monitoring
