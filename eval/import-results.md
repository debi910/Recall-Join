# Stock import eval

809 stock rows built from the real CDSCO rows (93 of them use the real retail name and company). Qty, MRP and supplier are generated. Layouts are reconstructed from vendor documentation, not real export files.

## A. Whole file, no corrections by the user

"Perfect rows": every field the file carries came through right. Expiry counts as right when the matcher reads the same month as the source.

| Layout | File | Old importer: perfect rows | Import engine: perfect rows | Engine: header row found | Engine: columns detected | Engine: extra/missed rows |
|---|---|---|---|---|---|---|
| Marg-style batch-wise stock | CSV | rejected | 100% | row 4 | 7/7 | 0/0 |
| Tally-style batch summary, batches grouped under each item | XLSX (old importer: CSV only) | rejected | 100% | row 5 | 5/5 | 0/0 |
| BUSY-style batch-wise stock | XLS (old importer: CSV only) | rejected | 100% | row 4 | 6/6 | 0/0 |
| GoFrugal-style item stock | XLSX (old importer: CSV only) | 100% | 100% | row 1 | 6/6 | 0/0 |
| RetailGraph-style closing stock, tab separated | TSV | 100% | 100% | row 1 | 6/6 | 0/0 |
| LOGIC ERP batch-wise closing stock (columns as documented) | CSV | 0.0% | 100% | row 1 | 6/6 | 0/0 |
| Hand-made Excel sheet with real date cells | XLSX (old importer: CSV only) | rejected | 100% | row 1 | 6/6 | 0/0 |
| Semicolon CSV with month-first dates | CSV (;) | 0.0% | 100% | row 1 | 6/6 | 0/0 |
| No header row (columns found from their values) | CSV | rejected | 100% | none (correct) | 6/6 | 0/0 |

The engine picked the right column for every field in every layout.

## B. Expiry dates

Each of the 800 real expiry months written in each format. Old path: stored as written, read by the matcher's parser. Engine: parsed at import.

| Format | Example | Old path reads the month | Engine reads the month |
|---|---|---|---|
| MM/YY | 08/27 | 100% | 100% |
| MM/YYYY | 08/2027 | 100% | 100% |
| MMM-YY | Aug-27 | 100% | 100% |
| MMM-YYYY | Aug-2027 | 100% | 100% |
| MMM YYYY | AUG 2027 | 100% | 100% |
| MMM'YY | Aug'27 | 100% | 100% |
| DD/MM/YYYY | 31/08/2027 | 100% | 100% |
| DD-MM-YYYY | 31-08-2027 | 100% | 100% |
| DD-MM-YY | 31-08-27 | 100% | 100% |
| DD.MM.YYYY | 31.08.2027 | 100% | 100% |
| DD-MMM-YY | 31-Aug-27 | 100% | 100% |
| DD-MMM-YYYY | 31-Aug-2027 | 100% | 100% |
| YYYY-MM-DD | 2027-08-31 | 100% | 100% |
| YYYY-MM | 2027-08 | 100% | 100% |
| MM/DD/YYYY | 08/31/2027 | 0.0% | 100% |
| MMYY | 0827 | 0.0% | 100% |
| Excel date cell | 46630 | 0.0% | 100% |

The 800 expiry strings exactly as CDSCO printed them: old path 100%, engine 100% (same month as the matcher).

## C. Header names written by someone else

45 column names from an independent open-source parser of Marg / eVitalRx / Vyapar stock CSVs (https://github.com/NesayoHQ/marg-csv-import (README, column aliases), fetched 2026-10-28). These were not used to write the engine's name lists. "none" names (HSN, GST) must not be taken as a stock field.

| Field | Names | Old importer right | Engine right |
|---|---|---|---|
| product | 9 | 5 | 9 |
| batch | 5 | 4 | 5 |
| expiry | 6 | 4 | 6 |
| mrp | 6 | 3 | 6 |
| qty | 7 | 4 | 7 |
| none | 12 | 12 | 12 |
| **All** | 45 | 32 (71.1%) | 45 (100%) |

The engine reads every one of these names correctly.
The first run of this check found 2 misses ("gst rate" and "tax rate" were read as a weak MRP guess). Tax and discount words now rule a column out as MRP; this table is after that fix, so it is no longer fully held out.

## What this does not show

- The layouts in A and the engine were written in the same session, so A mainly tests structure (title rows, grouped batches, file types, separators, date formats). Section C is the fairer test of column names.
- No real export file from Marg, Tally, BUSY, GoFrugal or RetailGraph was available. Vendors do not publish samples, so each layout is a reconstruction from their docs. A real file may use names or structures not covered here; the mapping preview is there for that case.
- Tally can also write batches in the same column as the item name (indented). That layout is not handled automatically.
- "Rate" is read as MRP only when the file has no MRP column, and in some tools it is the purchase rate. The preview shows it as a guess.
