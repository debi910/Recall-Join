# Changelog (all work inside the hackathon window, 19–31 Oct 2026)

## 2026-10-27
- Matching engine (`core/`): batch normalization, look-alike skeleton key, maker/expiry/product checks, four-tier classifier. 11 unit tests.
- CDSCO PDF parser (`tools/parse_nsq.py`), tested on the March 2025 central list (70/70 rows).
- 50-case eval built from real rows, compared against two baselines (`eval/`).
- TablesDB schema + setup script, NSQ import script, Appwrite Function (upload, join, ingest, quarantine transaction with read-back verification, review, returns).
- Web app (Vite): chemist view, match detail with character-level batch diff, review flow, distributor returns, audit trail, mock preview mode.
- Loaded the real Jul–Sep 2026 NSQ exports (739 batches, `tools/csv_to_nsq.py`). Imports group rows by list (central/state).
- Held-out eval on Sep 2026 with frozen rules. Demo stock re-seeded from the Sep 2026 list.
- UI redesign following Emil Kowalski's design-engineering rules: animated join graphic, shelf-scan strip, list and failure-reason charts (read from TablesDB), hold-to-quarantine, character-tile batch diff, slide-in drawer, Sonner-style toasts, reduced-motion support, dark mode. Moved to lit-html for keyed DOM updates.
- Function only ingests CDSCO lists bundled with it, so a demo login can't inject made-up rows.
