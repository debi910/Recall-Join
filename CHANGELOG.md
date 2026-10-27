# Changelog (all work inside the hackathon window, 19–31 Oct 2026)

## 2026-10-27
- Matching engine (`core/`): batch normalization, look-alike skeleton key, maker/expiry/product checks, four-tier classifier. 11 unit tests.
- CDSCO PDF parser (`tools/parse_nsq.py`), tested on the March 2025 central list (70/70 rows).
- 50-case eval built from real rows, compared against two baselines (`eval/`).
- TablesDB schema + setup script, NSQ import script, Appwrite Function (upload, join, ingest, quarantine transaction with read-back verification, review, returns).
- Web app (Vite): chemist view, match detail with character-level batch diff, review flow, distributor returns, audit trail, mock preview mode.
