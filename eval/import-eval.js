// Stock import eval: can a chemist's export be read without retyping it?
// Usage: npm run eval:import   (writes eval/import-results.md)
//
// Rows: the 809 real CDSCO rows (real batch codes, makers with full addresses,
// expiry months). Where eval/real/retail-cases.json pairs a row with its real
// retail listing, the shop row uses that retail name and company, as billing
// software would. Qty, MRP and supplier aren't in any public source, so they are
// generated (deterministic) and labelled as such.
//
// Layouts: eval/import-layouts.js. They are reconstructed from vendor docs, not
// real files; see the note there.
//
// Baseline: the importer Recall Join shipped with (fixed header names, header on
// the first row, CSV only, expiry stored as written and read later by the matcher).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseCsv } from '../core/csv.js';
import { normMonth } from '../core/normalize.js';
import { analyze, parseExpiry, textToRows, headerScore, FIELDS as ENGINE_FIELDS } from '../core/import.js';
import { LAYOUTS, DATE, renderLayout, toText } from './import-layouts.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const dir = new URL('../data/nsq/', import.meta.url);
const nsq = readdirSync(dir).sort().flatMap((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')).map((r) => ({ ...r, file: f })));
const retail = new Map(read('./real/retail-cases.json').cases.map((c) => [`${c.nsq.file}#${c.nsq.sno}#${c.nsq.batch}`, c.retail]));

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const truth = nsq
  .filter((r) => r.batch && r.product)
  .map((r) => {
    const rt = retail.get(`${r.file}#${r.sno}#${r.batch}`);
    return {
      product: (rt?.product || r.product).replace(/\s+/g, ' ').trim(),
      batch: r.batch.replace(/\s+/g, ' ').trim(),
      ym: normMonth(r.expiry),
      mfr: (rt?.mfr || r.mfr || '').replace(/\s+/g, ' ').trim(),
      qty: 1 + Math.floor(rand() * 120),
      mrp: Math.round(rand() * 50000) / 100,
      supplier: ['Kalinga Pharma Distributors', 'Utkal Medical Agencies', 'Mahanadi Drug House'][Math.floor(rand() * 3)],
    };
  })
  .sort((a, b) => a.product.localeCompare(b.product));

// ---------------------------------------------------------------- the old importer, verbatim
const OLD = {
  product: ['item', 'product', 'item name', 'product name', 'name', 'description'],
  batch: ['batch', 'batch no', 'batch no.', 'batchno', 'batch number'],
  expiry: ['expiry', 'exp', 'exp.', 'exp date', 'expiry date'],
  mfr: ['mfr', 'mfg by', 'company', 'manufacturer', 'mfr.', 'make'],
  qty: ['qty', 'quantity', 'stock', 'closing', 'closing stock', 'bal qty'],
  mrp: ['mrp', 'rate', 'price'],
  supplier: ['supplier', 'party', 'vendor', 'distributor', 'purchased from'],
};
function baseline(text) {
  const [head, ...body] = parseCsv(text);
  const norm = head.map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(Object.entries(OLD).map(([k, names]) => [k, norm.findIndex((h) => names.includes(h))]));
  if (col.product < 0 || col.batch < 0) return null; // "CSV needs at least an item/product column and a batch column"
  return body.map((r) => ({
    product: r[col.product]?.trim() ?? '', batch: r[col.batch]?.trim() ?? '',
    expiry: col.expiry >= 0 ? r[col.expiry]?.trim() : '', mfr: col.mfr >= 0 ? r[col.mfr]?.trim() : '',
    qty: col.qty >= 0 ? Number(r[col.qty]) || 0 : 0,
    mrp: col.mrp >= 0 ? Number(String(r[col.mrp]).replace(/[^\d.]/g, '')) || 0 : 0,
    supplier: col.supplier >= 0 ? r[col.supplier]?.trim() : '',
  })).filter((s) => s.product && s.batch);
}

// ---------------------------------------------------------------- scoring
const FIELDS = ['product', 'batch', 'expiry', 'mfr', 'qty', 'mrp', 'supplier'];
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
function score(layout, out) {
  const carried = new Set(layout.cols.map(([, f]) => f).filter((f) => typeof f === 'string'));
  const fields = FIELDS.filter((f) => carried.has(f));
  const res = { opened: !!out, rows: out?.length ?? 0, perfect: 0, spurious: 0, missed: 0, right: Object.fromEntries(fields.map((f) => [f, 0])) };
  if (!out) { res.missed = truth.length; return { res, fields }; }
  const pool = new Map();
  for (const o of out) { const k = clean(o.batch); (pool.get(k) || pool.set(k, []).get(k)).push(o); }
  for (const t of truth) {
    const o = pool.get(t.batch)?.shift();
    if (!o) { res.missed++; continue; }
    let all = true;
    for (const f of fields) {
      const ok = f === 'expiry' ? normMonth(o.expiry) === t.ym
        : f === 'qty' ? Number(o.qty) === t.qty
        : f === 'mrp' ? Math.abs(Number(o.mrp) - t.mrp) < 0.01
        : clean(o[f]) === t[f];
      if (ok) res.right[f]++; else all = false;
    }
    if (all) res.perfect++;
  }
  res.spurious = [...pool.values()].reduce((a, l) => a + l.length, 0);
  return { res, fields };
}

// ---------------------------------------------------------------- run
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(a === b ? 0 : 1)}%` : 'n/a');
const lines = [];
const log = (s = '') => { lines.push(s); console.log(s); };
const n = truth.length;

log('# Stock import eval');
log();
log(`${n} stock rows built from the real CDSCO rows (${retail.size} of them use the real retail name and company). Qty, MRP and supplier are generated. Layouts are reconstructed from vendor documentation, not real export files.`);
log();
log('## A. Whole file, no corrections by the user');
log();
log('"Perfect rows": every field the file carries came through right. Expiry counts as right when the matcher reads the same month as the source.');
log();
log('| Layout | File | Old importer: perfect rows | Import engine: perfect rows | Engine: header row found | Engine: columns detected | Engine: extra/missed rows |');
log('|---|---|---|---|---|---|---|');
const misses = [];
for (const L of LAYOUTS) {
  const cells = renderLayout(L, truth);
  const delim = L.file === 'tsv' ? '\t' : L.file === 'csv;' ? ';' : ',';
  const text = toText(cells, delim);
  // The old importer only accepted .csv; give it the CSV text anyway.
  const old = score(L, baseline(toText(cells, ',')));
  const a = analyze(L.file === 'csv' || L.file === 'tsv' || L.file === 'csv;' ? textToRows(text) : cells);
  const eng = score(L, a.stock);
  const det = eng.fields.filter((f) => a.mapping[f] >= 0 && L.cols[a.mapping[f]]?.[1] === f).length;
  const wrongCols = eng.fields.filter((f) => !(a.mapping[f] >= 0 && L.cols[a.mapping[f]]?.[1] === f));
  if (wrongCols.length) misses.push(`${L.name}: ${wrongCols.map((f) => `${f} -> ${a.mapping[f] >= 0 ? `"${L.cols[a.mapping[f]][0] || `column ${a.mapping[f] + 1}`}"` : 'not found'}`).join(', ')}`);
  const fileLabel = { csv: 'CSV', 'csv;': 'CSV (;)', tsv: 'TSV', xlsx: 'XLSX', xls: 'XLS' }[L.file];
  const oldCell = old.res.opened ? `${pct(old.res.perfect, n)}` : 'rejected';
  log(`| ${L.name} | ${fileLabel}${['xlsx', 'xls'].includes(L.file) ? ' (old importer: CSV only)' : ''} | ${oldCell} | ${pct(eng.res.perfect, n)} | ${L.noHeader ? 'none (correct)' : a.headerRow >= 0 ? `row ${a.headerRow + 1}` : 'no'} | ${det}/${eng.fields.length} | ${eng.res.spurious}/${eng.res.missed} |`);
}
log();
log(misses.length ? `Columns the engine got wrong (the user fixes these in the preview):\n\n${misses.map((m) => `- ${m}`).join('\n')}` : 'The engine picked the right column for every field in every layout.');
log();

log('## B. Expiry dates');
log();
log(`Each of the ${truth.filter((t) => t.ym).length} real expiry months written in each format. Old path: stored as written, read by the matcher's parser. Engine: parsed at import.`);
log();
log('| Format | Example | Old path reads the month | Engine reads the month |');
log('|---|---|---|---|');
const withYm = truth.filter((t) => t.ym);
for (const [name, fmt] of Object.entries(DATE)) {
  let o = 0, e = 0;
  for (const t of withYm) {
    const v = fmt(+t.ym.slice(0, 4), +t.ym.slice(5));
    if (normMonth(v) === t.ym) o++;
    if (parseExpiry(v) === t.ym) e++;
  }
  log(`| ${name} | ${fmt(2027, 8)} | ${pct(o, withYm.length)} | ${pct(e, withYm.length)} |`);
}
const rawReal = nsq.map((r) => r.expiry).filter(Boolean);
log();
log(`The ${rawReal.length} expiry strings exactly as CDSCO printed them: old path ${pct(rawReal.filter((v) => normMonth(v)).length, rawReal.length)}, engine ${pct(rawReal.filter((v) => parseExpiry(v) === normMonth(v)).length, rawReal.length)} (same month as the matcher).`);
log();
log('## C. Header names written by someone else');
log();
const held = read('./import/heldout-headers.json');
log(`${Object.values(held.aliases).flat().length} column names from an independent open-source parser of Marg / eVitalRx / Vyapar stock CSVs (${held.source}). These were not used to write the engine's name lists. "none" names (HSN, GST) must not be taken as a stock field.`);
log();
log('| Field | Names | Old importer right | Engine right |');
log('|---|---|---|---|');
const oldField = (h) => Object.entries(OLD).find(([, names]) => names.includes(h.trim().toLowerCase()))?.[0] || 'none';
const engField = (h) => { const [f, sc] = ENGINE_FIELDS.map((f) => [f, headerScore(f, h)]).sort((a, b) => b[1] - a[1])[0]; return sc > 0 ? f : 'none'; };
const heldMiss = [];
let ho = 0, he = 0, ht = 0;
for (const [want, names] of Object.entries(held.aliases)) {
  const o = names.filter((h) => oldField(h) === want).length, e = names.filter((h) => engField(h) === want).length;
  heldMiss.push(...names.filter((h) => engField(h) !== want).map((h) => `"${h}" read as ${engField(h)}, should be ${want}`));
  ho += o; he += e; ht += names.length;
  log(`| ${want} | ${names.length} | ${o} | ${e} |`);
}
log(`| **All** | ${ht} | ${ho} (${pct(ho, ht)}) | ${he} (${pct(he, ht)}) |`);
log();
log(heldMiss.length ? `Engine misses: ${heldMiss.join('; ')}.` : 'The engine reads every one of these names correctly.');
log('The first run of this check found 2 misses ("gst rate" and "tax rate" were read as a weak MRP guess). Tax and discount words now rule a column out as MRP; this table is after that fix, so it is no longer fully held out.');
log();
log('## What this does not show');
log();
log('- The layouts in A and the engine were written in the same session, so A mainly tests structure (title rows, grouped batches, file types, separators, date formats). Section C is the fairer test of column names.');
log('- No real export file from Marg, Tally, BUSY, GoFrugal or RetailGraph was available. Vendors do not publish samples, so each layout is a reconstruction from their docs. A real file may use names or structures not covered here; the mapping preview is there for that case.');
log('- Tally can also write batches in the same column as the item name (indented). That layout is not handled automatically.');
log('- "Rate" is read as MRP only when the file has no MRP column, and in some tools it is the purchase rate. The preview shows it as a guess.');

writeFileSync(new URL('./import-results.md', import.meta.url), lines.join('\n') + '\n');
