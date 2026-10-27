// Builds eval/real/retail-cases.json: REAL regulator rows paired with the REAL
// retail listing of the same brand, as a chemist's billing software would name it.
// Shop-side product and maker strings come from the public "A-Z Medicine Dataset
// of India" (253,973 retail listings scraped from an Indian e-pharmacy; Kaggle,
// shudhanshusingh). The batch code is copied from the regulator row, so the only
// non-real part is that we assume the shop holds that batch.
// Usage: node eval/real/build-retail-cases.js <path to A_Z_medicines_dataset_of_India.csv>
import { readFileSync, readdirSync } from 'node:fs';
import { parseCsv } from '../../core/csv.js';

const norm = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const spaced = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
// "LOPRA" must not match "LOPRAMIDE", "GATOVAS 20" may match "GATOVAS 20MG".
const brandPrefix = (name, key) => {
  if (!name.startsWith(key)) return false;
  const next = name[key.length];
  return !next || (/[A-Z]/.test(key.at(-1)) ? !/[A-Z]/.test(next) : !/[0-9]/.test(next));
};
const FORMS = [['inject', /INJ/], ['liquid', /SYRUP|SUSP|SOLUTION|EXPECTORANT|DROP|LIQUID/], ['topical', /CREAM|GEL|OINTMENT|LOTION/], ['soap', /SOAP/], ['oral solid', /TAB|CAP/]];
const form = (s) => FORMS.find(([, re]) => re.test(String(s).toUpperCase()))?.[0];
const [head, ...rows] = parseCsv(readFileSync(process.argv[2], 'utf8'));
const col = (name) => head.indexOf(name);
const [iName, iMfr, iC1, iC2] = ['name', 'manufacturer_name', 'short_composition1', 'short_composition2'].map(col);
const catalogue = rows.map((r) => ({ id: Number(r[0]), name: r[iName], mfr: r[iMfr], comp: `${r[iC1]} ${r[iC2]}` }));

const dir = new URL('../../data/nsq/', import.meta.url);
const nsq = readdirSync(dir).flatMap((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')).map((r) => ({ ...r, file: f })));

const cases = [];
for (const r of nsq) {
  const brand = r.product.match(/\((?:Brand Name\s*:\s*)?([^()]+)\)\s*$/i)?.[1]?.trim();
  if (!brand || /^(NA|N\.?A\.?|NIL|-)$/i.test(brand) || norm(brand).length < 4) continue;
  // Strip form words the regulator sometimes puts inside the brand ("Glimpse-2 Tablets").
  const key = spaced(brand.replace(/^Brand Name\s*:\s*/i, '').replace(/\b(tablets?|capsules?|injection|syrup|cream|suspension|dry syrup|cap\.?|tab\.?)\b/gi, ''));
  // The first active ingredient as the regulator spells it, e.g. "Cefixime".
  const ingredient = norm(r.product.split(/[\s,&]+/)[0]).slice(0, 6);
  if (key.length < 4 || ingredient.length < 5) continue;
  // Exact brand prefix AND the same first ingredient: the retail listing is this brand,
  // not a look-alike name. Lowest id wins so the build is deterministic.
  const hit = catalogue
    .filter((c) => brandPrefix(spaced(c.name), key) && norm(c.comp).includes(ingredient))
    .filter((c) => !form(r.product) || !form(c.name) || form(r.product) === form(c.name))
    .sort((a, b) => a.id - b.id)[0];
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
