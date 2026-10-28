// Builds eval/real/retail-cases.json: REAL regulator rows paired with the REAL
// retail listing of the same brand, as a chemist's billing software would name it.
// Shop-side product and maker strings come from the public "A-Z Medicine Dataset
// of India" (253,973 retail listings scraped from an Indian e-pharmacy; Kaggle,
// shudhanshusingh). The batch code is copied from the regulator row, so the only
// non-real part is that we assume the shop holds that batch.
// Usage: node eval/real/build-retail-cases.js <path to A_Z_medicines_dataset_of_India.csv>
import { readFileSync, readdirSync } from 'node:fs';
import { parseCsv } from '../../core/csv.js';
import { brandKey, brandMatcher } from '../../core/brands.js';

const [head, ...rows] = parseCsv(readFileSync(process.argv[2], 'utf8'));
const [iName, iMfr, iC1, iC2] = ['name', 'manufacturer_name', 'short_composition1', 'short_composition2'].map((c) => head.indexOf(c));
const catalogue = rows.map((r) => ({ id: Number(r[0]), name: r[iName], mfr: r[iMfr], comp: `${r[iC1]} ${r[iC2]}` }));
// Bucket listings by first letter so each regulator row scans a slice, not 254k rows.
const byLetter = Map.groupBy(catalogue, (c) => c.name.trim()[0]?.toUpperCase());

const dir = new URL('../../data/nsq/', import.meta.url);
const nsq = readdirSync(dir).flatMap((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')).map((r) => ({ ...r, file: f })));

const cases = [];
for (const r of nsq) {
  // Lowest id wins so the build is deterministic.
  const test = brandMatcher(r.product);
  const hit = test && (byLetter.get(brandKey(r.product)[0]) ?? []).filter(test).sort((a, b) => a.id - b.id)[0];
  if (!hit) continue;
  cases.push({
    id: `r${String(cases.length + 1).padStart(3, '0')}`,
    nsq: { file: r.file, sno: r.sno, product: r.product, batch: r.batch, expiry: r.expiry, mfr: r.mfr },
    retail: { catalogue_id: hit.id, product: hit.name, mfr: hit.mfr },
  });
}
process.stdout.write(JSON.stringify({
  note: 'Regulator rows (real) paired with the retail listing of the same brand (real). Batch copied from the regulator row. Maker relationship labelled by hand in retail-labels.json.',
  source: 'A-Z Medicine Dataset of India (Kaggle: shudhanshusingh/az-medicine-dataset-of-india), mirrored at github.com/junioralive/Indian-Medicine-Dataset',
  cases,
}, null, 1));
