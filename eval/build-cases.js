// Builds the labelled eval set from REAL regulator rows.
// Stock rows are SYNTHETIC variants of those rows; each label is known by construction.
// Usage: node eval/build-cases.js data/nsq/2025-03-central.json > eval/cases.json
import { readFileSync } from 'node:fs';

const nsq = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (a) => a[Math.floor(rand() * a.length)];
const shuffle = (a) => a.map((x) => [rand(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);

// How a billing system tends to name the item: brand if there is one, else the
// first generic word, plus strength and a form abbreviation.
function shopName(product) {
  const brand = product.match(/\((?:Brand Name\s*:\s*)?([^()]+)\)\s*$/i)?.[1]?.replace(/^NA$/i, '') || null;
  const strength = product.match(/\d+(\.\d+)?\s*(mg|g|ml|IU)/i)?.[0] ?? '';
  const form = /inject/i.test(product) ? 'INJ' : /syrup/i.test(product) ? 'SYP' : /capsule/i.test(product) ? 'CAP' : 'TAB';
  const base = brand ?? product.split(/[\s,&]+/)[0];
  return `${base} ${strength} ${form}`.replace(/\s+/g, ' ').toUpperCase().trim();
}
const shortMfr = (m) => m.replace(/^M\/s\.?\s*/i, '').split(/[,(]/)[0].split(/\s+/).slice(0, 2).join(' ');
const mmYY = (s) => s.replace(/^(\d{2})\/(\d{2})(\d{2})$/, '$1/$3'); // 08/2028 -> 08/28
const reformat = (b) => pick([
  (x) => x.toLowerCase(),
  (x) => x.replace(/-/g, '') === x ? x.replace(/^([A-Z]+)(\d)/i, '$1-$2') : x.replace(/-/g, ''),
  (x) => x.replace(/-/g, ' '),
  (x) => ` ${x}/`,
])(b);
const CONF = { '0': 'O', O: '0', '1': 'I', I: '1', '5': 'S', S: '5', '8': 'B', B: '8' };
function confusable(b) {
  const idx = [...b].map((c, i) => (CONF[c.toUpperCase()] ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return null;
  const i = pick(idx);
  return b.slice(0, i) + CONF[b[i].toUpperCase()] + b.slice(i + 1);
}

const usable = shuffle(nsq.filter((r) => r.batch && r.product && r.mfr));
const cases = [];
let n = 0;
const add = (kind, expect, stock, from) => cases.push({ id: `c${String(++n).padStart(2, '0')}`, kind, expect, stock, nsq_sno: from?.sno ?? null });

// 15 true positives: same batch written differently, shop-style names.
for (const r of usable.slice(0, 15)) {
  const batch = reformat(r.batch);
  add('format-variant', 'flag', { product: shopName(r.product), batch, expiry: mmYY(r.expiry), mfr: shortMfr(r.mfr), qty: 10 }, r);
}
// 10 collisions: a different product from a different maker that reuses the batch code.
for (const [i, r] of usable.slice(15, 25).entries()) {
  const other = usable[(i + 30) % usable.length];
  add('batch-collision', 'no-flag', { product: shopName(other.product), batch: r.batch, expiry: mmYY(other.expiry), mfr: shortMfr(other.mfr), qty: 10 }, r);
}
// 10 near-misses: one confusable character, same product: must reach a human.
let made = 0;
for (const r of usable.slice(25)) {
  if (made === 10) break;
  const b = confusable(r.batch);
  if (!b) continue;
  add('confusable-typo', 'review', { product: shopName(r.product), batch: b, expiry: mmYY(r.expiry), mfr: shortMfr(r.mfr), qty: 10 }, r);
  made++;
}
// 15 clean negatives: real products, batches not on the list.
for (const r of usable.slice(40, 55)) {
  add('clean', 'no-flag', { product: shopName(r.product), batch: `${r.batch.replace(/[^A-Z0-9]/gi, '').slice(0, 2)}9${Math.floor(rand() * 9e4 + 1e4)}`, expiry: mmYY(r.expiry), mfr: shortMfr(r.mfr), qty: 10 }, r);
}
process.stdout.write(JSON.stringify({ note: 'Stock rows are synthetic variants of real CDSCO rows; labels are known by construction.', source: process.argv[2], cases }, null, 1));
