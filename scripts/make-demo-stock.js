// Writes a SYNTHETIC chemist stock export for the demo, seeded with a few
// variants of real listed batches so the join has something to find.
// Usage: node scripts/make-demo-stock.js data/nsq/<live-month>.json > web/public/data/demo-stock.csv
import { readFileSync } from 'node:fs';
import { normBatch } from '../core/normalize.js';

const live = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (a) => a[Math.floor(rand() * a.length)];

// Invented makers and distributors: nothing here refers to a real company's batch.
const MAKERS = ['Mahanadi Remedies', 'Konark Lifesciences', 'Chilika Pharma', 'Daya Formulations', 'Tarini Healthcare', 'Lingaraj Labs'];
const SUPPLIERS = ['Kalinga Pharma Distributors (demo)', 'Utkal Medical Agencies (demo)'];
const ITEMS = [
  ['PARACETAMOL 650 TAB', 2.1], ['AMOXYCILLIN 500 CAP', 7.5], ['AZITHROMYCIN 500 TAB', 22], ['PANTOPRAZOLE 40 TAB', 9.8],
  ['METFORMIN 500 TAB', 2.4], ['TELMISARTAN 40 TAB', 6.2], ['AMLODIPINE 5 TAB', 3.1], ['CETIRIZINE 10 TAB', 1.8],
  ['ORS SACHET', 21], ['CEFIXIME 200 TAB', 11], ['IBUPROFEN 400 TAB', 1.9], ['ATORVASTATIN 10 TAB', 7.4],
  ['DICLOFENAC GEL 30G', 98], ['B-COMPLEX SYP 200ML', 64], ['ONDANSETRON 4 TAB', 4.6], ['MONTELUKAST 10 TAB', 12.5],
  ['LEVOCETIRIZINE 5 TAB', 3.2], ['DOMPERIDONE 10 TAB', 2.8], ['VITAMIN D3 60K CAP', 31], ['CALCIUM 500 TAB', 5.5],
];
const listed = new Set(live.map((r) => normBatch(r.batch)));
const fillerBatch = () => { for (;;) { const b = `${pick(['K', 'T', 'MR', 'CL', 'DF'])}${Math.floor(rand() * 9e5 + 1e5)}`; if (!listed.has(normBatch(b))) return b; } };
const exp = () => `${String(Math.floor(rand() * 12) + 1).padStart(2, '0')}/${pick(['26', '27', '28'])}`;

const out = [['Item Name', 'Batch No', 'Exp.', 'Company', 'Qty', 'MRP', 'Party']];
for (let i = 0; i < 300; i++) {
  const [item, mrp] = pick(ITEMS);
  out.push([item, fillerBatch(), exp(), pick(MAKERS), Math.floor(rand() * 60) + 5, mrp, pick(SUPPLIERS)]);
}

// Seeded rows from the live list (labels are for the README, not the CSV).
const brand = (p) => (p.match(/\(([^()]+)\)\s*$/)?.[1] ?? p.split(/[\s,]+/).slice(0, 2).join(' ')).toUpperCase();
const maker = (m) => m.replace(/^M\/s\.?\s*/i, '').split(/[,(]/)[0].trim();
const mm = (e) => e.replace(/^(\d{2})\/\d{2}(\d{2})$/, '$1/$2');
const real = live.filter((r) => r.batch && r.mfr && /\d/.test(r.batch));
const [f1, f2, f3, col, near, inf] = [real[1], real[4], real[9], real[12], real.find((r) => /[0158OISB]/.test(r.batch.slice(1))) , real[20]];
out.push([brand(f1.product) + ' TAB', f1.batch.toLowerCase(), mm(f1.expiry), maker(f1.mfr), 40, 18.5, SUPPLIERS[0]]);
out.push([brand(f2.product), f2.batch.replace(/-/g, ' '), mm(f2.expiry), maker(f2.mfr), 12, 145, SUPPLIERS[0]]);
out.push([brand(f3.product), f3.batch, mm(f3.expiry), maker(f3.mfr), 25, 9.6, SUPPLIERS[1]]);
out.push([col.product.split(/[\s,]+/)[0].toUpperCase() + ' TAB', col.batch, '03/28', 'Daya Formulations', 18, 42, SUPPLIERS[1]]); // same batch code, different maker
const swap = { 0: 'O', 1: 'I', 5: 'S', 8: 'B', O: '0', I: '1', S: '5', B: '8' };
const nb = near.batch.replace(/[0158OISB](?=[^0158OISB]*$)/, (c) => swap[c]);
out.push([brand(near.product), nb, mm(near.expiry), maker(near.mfr), 20, 55, SUPPLIERS[0]]); // look-alike character
out.push([brand(inf.product), fillerBatch(), mm(inf.expiry), maker(inf.mfr), 15, 30, SUPPLIERS[1]]); // same product, other batch

const csv = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
process.stdout.write(out.map((r) => r.map(csv).join(',')).join('\n') + '\n');
