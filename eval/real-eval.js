// Real-data eval. No invented stock rows: every string the matcher sees was written
// by a regulator lab or by a retail listing. Usage: npm run eval:real [-- --why]
//
// A. Cross-lab re-reports. CDSCO's own lists contain the same batch written down by two
//    labs (or in two months), and different products that reuse a code. Each real row
//    plays the shop's stock row against all OTHER real rows. Labels: eval/real/cross-lab-labels.json.
// B. Retail names. Real regulator rows paired with the real retail listing of the same
//    brand (eval/real/retail-cases.json), i.e. how billing software names the item and
//    its company. The batch is copied, so this tests the maker/product/expiry checks.
//    Run with and without expiry, since not every export carries it. The brand-owner
//    table (core/brand-owners.js) comes from the same catalogue, so B is also run with
//    each case's own listing removed from the table: the owner must be known from
//    another listing of the brand.
import { readFileSync, readdirSync } from 'node:fs';
import { matchStock, TIER } from '../core/match.js';
import { BRAND_OWNERS } from '../core/brand-owners.js';
import { normBatch, skelBatch } from '../core/normalize.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const dir = new URL('../data/nsq/', import.meta.url);
const nsq = readdirSync(dir).sort().flatMap((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')).map((r, i) => ({ ...r, _id: `${f}#${i}` })));
const why = process.argv.includes('--why');

const methods = {
  'Exact batch lookup': (s, list) => (list.some((n) => n.batch.trim().toUpperCase() === s.batch.trim().toUpperCase()) ? 'flag' : 'none'),
  'Batch-only, ignore spaces/hyphens': (s, list) => (list.some((n) => normBatch(n.batch) === normBatch(s.batch)) ? 'flag' : 'none'),
  'Recall Join': (s, list, owners) => {
    const tiers = matchStock([s], list, { owners }).map((m) => m.tier);
    if (tiers.includes(TIER.FLAG)) return 'flag';
    return tiers.includes(TIER.REVIEW_COLLISION) || tiers.includes(TIER.REVIEW_NEAR) ? 'review' : 'none';
  },
};
const tally = (outs) => ({ flag: outs.filter((o) => o === 'flag').length, review: outs.filter((o) => o === 'review').length, none: outs.filter((o) => o === 'none').length });
const cell = (t, n) => `${t.flag} / ${t.review} / ${t.none}`;
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');

// ---------- A. Cross-lab re-reports ----------
const { labels } = read('./real/cross-lab-labels.json');
const groupKey = (r) => {
  const sameNorm = nsq.filter((n) => n !== r && normBatch(n.batch) && normBatch(n.batch) === normBatch(r.batch));
  if (sameNorm.length) return normBatch(r.batch);
  const sameSkel = nsq.filter((n) => n !== r && skelBatch(n.batch) && skelBatch(n.batch) === skelBatch(r.batch));
  return sameSkel.length ? skelBatch(r.batch) : null;
};
const rowsA = nsq.map((r) => ({ r, key: groupKey(r) }));
const unlabelled = [...new Set(rowsA.filter((x) => x.key && !labels[x.key]).map((x) => x.key))];
if (unlabelled.length) throw new Error(`Unlabelled real groups, label them first: ${unlabelled.join(', ')}`);

console.log(`# Real-data eval\n\n## A. Cross-lab re-reports (${nsq.length} real CDSCO rows, ${Object.keys(labels).length} batch codes that appear more than once)\n`);
console.log('Each real row is matched as if it were a stock row against every other real row. Cells: flag / review / no alert.\n');
const groupsA = { same: [], different: [], ambiguous: [], unique: [] };
for (const x of rowsA) groupsA[x.key ? labels[x.key].label : 'unique'].push(x);
console.log(`| Method | Same batch, other lab (n=${groupsA.same.length}) | Different product, same code (n=${groupsA.different.length}) | Ambiguous (n=${groupsA.ambiguous.length}) | Code seen once (n=${groupsA.unique.length}) | Flag precision | Flag recall |`);
console.log('|---|---|---|---|---|---|---|');
const missesA = {};
// Second pass: the same rows with the maker blanked, as from an export with no maker column.
for (const noMaker of [false, true]) {
  if (noMaker) {
    console.log('\nSame rows, stock side without a maker (an export with no maker column):\n');
    console.log('| Method | Same batch, other lab | Different product, same code | Ambiguous | Code seen once | Flag precision | Flag recall |');
    console.log('|---|---|---|---|---|---|---|');
  }
  for (const [name, fn] of Object.entries(methods)) {
    const t = {};
    const key = `${name}${noMaker ? ' (no maker)' : ''}`;
    missesA[key] = [];
    for (const [g, xs] of Object.entries(groupsA)) {
      const outs = xs.map(({ r }) => {
        const stock = { product: r.product, batch: r.batch, expiry: r.expiry, mfr: noMaker ? '' : r.mfr };
        const o = fn(stock, nsq.filter((n) => n !== r));
        const bad = (g === 'same' && o !== 'flag') || (g === 'different' && o === 'flag') || (g === 'ambiguous' && o !== 'review') || (g === 'unique' && o !== 'none');
        if (bad) missesA[key].push(`${g.padEnd(9)} ${o.padEnd(6)} ${r.batch} | ${r.product.slice(0, 60)} | ${r.mfr.slice(0, 40)}`);
        return o;
      });
      t[g] = tally(outs);
    }
    // Ambiguous groups count as neither right nor wrong for precision/recall.
    const tp = t.same.flag, fp = t.different.flag + t.unique.flag;
    console.log(`| ${name} | ${cell(t.same)} | ${cell(t.different)} | ${cell(t.ambiguous)} | ${cell(t.unique)} | ${pct(tp, tp + fp)} | ${pct(tp, groupsA.same.length)} |`);
  }
}

// ---------- B. Retail names ----------
const { cases } = read('./real/retail-cases.json');
const { labels: rel } = read('./real/retail-labels.json');
console.log(`\n## B. Real retail names (${cases.length} regulator rows paired with the real retail listing of the same brand)\n`);
console.log('The shop row uses the retail product name and company; the batch is copied from the regulator row. Cells: flag / review / no alert.\n');
const missesB = {};
const withoutListing = (id) => Object.fromEntries(Object.entries(BRAND_OWNERS).map(([k, owners]) => [k,
  Object.fromEntries(Object.entries(owners).map(([o, ids]) => [o, ids.filter((x) => x !== id)]).filter(([, ids]) => ids.length))]));
for (const withExpiry of [true, false]) {
  console.log(`### ${withExpiry ? 'Export has expiry' : 'Export has no expiry column'}\n`);
  const groups = ['same-company', 'brand-owner', 'unclear'];
  const n = Object.fromEntries(groups.map((g) => [g, cases.filter((c) => rel[c.id].relation === g).length]));
  console.log(`| Method | Same company named (n=${n['same-company']}) | Brand owner named, regulator lists the plant (n=${n['brand-owner']}) | Two different firms (n=${n.unclear}) | Same-company auto-flag rate | Silently missed (no alert, any group) |`);
  console.log('|---|---|---|---|---|---|');
  const variants = { ...methods, 'Recall Join, own listing left out of owner table': (s, list, owners) => methods['Recall Join'](s, list, owners) };
  for (const [name, fn] of Object.entries(variants)) {
    const t = {};
    const key = `${name}${withExpiry ? '' : ' (no expiry)'}`;
    const leaveOut = name.includes('left out');
    missesB[key] = [];
    for (const g of groups) {
      t[g] = tally(cases.filter((c) => rel[c.id].relation === g).map((c) => {
        const stock = { product: c.retail.product, batch: c.nsq.batch, expiry: withExpiry ? c.nsq.expiry : '', mfr: c.retail.mfr };
        const o = fn(stock, nsq, leaveOut ? withoutListing(c.retail.catalogue_id) : BRAND_OWNERS);
        if ((g === 'same-company' && o !== 'flag') || o === 'none') missesB[key].push(`${g.padEnd(12)} ${o.padEnd(6)} ${c.id} ${c.retail.product} | ${c.retail.mfr} vs ${c.nsq.mfr.slice(0, 40)}`);
        return o;
      }));
    }
    const missed = groups.reduce((a, g) => a + t[g].none, 0);
    console.log(`| ${name} | ${cell(t['same-company'])} | ${cell(t['brand-owner'])} | ${cell(t.unclear)} | ${pct(t['same-company'].flag, n['same-company'])} | ${missed}/${cases.length} |`);
  }
  console.log('');
}

if (why) {
  console.log('## Every miss\n');
  for (const [name, xs] of Object.entries(missesA)) console.log(`A. ${name}:\n  ${xs.join('\n  ') || 'none'}\n`);
  for (const [name, xs] of Object.entries(missesB)) console.log(`B. ${name}:\n  ${xs.join('\n  ') || 'none'}\n`);
}
