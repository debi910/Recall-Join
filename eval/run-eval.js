// Scores Recall Join's matcher against two baselines on eval/cases.json.
import { readFileSync } from 'node:fs';
import { matchStock, TIER } from '../core/match.js';
import { normBatch } from '../core/normalize.js';

const { cases, source } = JSON.parse(readFileSync(new URL(process.env.CASES || './cases.json', import.meta.url)));
const nsq = JSON.parse(readFileSync(source, 'utf8'));

const exact = (s) => nsq.some((n) => n.batch.trim().toUpperCase() === s.batch.trim().toUpperCase()) ? 'flag' : 'none';
// What the best public lookup does today: ignore spaces/hyphens, batch only.
const batchOnly = (s) => nsq.some((n) => normBatch(n.batch) === normBatch(s.batch)) ? 'flag' : 'none';
const ours = (s) => {
  const tiers = matchStock([s], nsq).map((m) => m.tier);
  if (tiers.includes(TIER.FLAG)) return 'flag';
  if (tiers.includes(TIER.REVIEW_COLLISION) || tiers.includes(TIER.REVIEW_NEAR)) return 'review';
  return 'none';
};

function score(name, fn) {
  let tp = 0, fp = 0, fn_ = 0, reviewHit = 0, reviewTotal = 0;
  const wrong = [];
  for (const c of cases) {
    const got = fn(c.stock);
    if (c.expect === 'flag') got === 'flag' ? tp++ : (fn_++, wrong.push(`${c.id} ${c.kind}: ${got}`));
    if (c.expect === 'no-flag' && got === 'flag') fp++, wrong.push(`${c.id} ${c.kind}: false flag`);
    if (c.expect === 'review') { reviewTotal++; got === 'review' || got === 'flag' ? reviewHit++ : wrong.push(`${c.id} ${c.kind}: ${got}`); }
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn_ ? tp / (tp + fn_) : 0;
  return { name, precision, recall, falseFlags: fp, typosCaught: `${reviewHit}/${reviewTotal}`, wrong };
}

const pct = (x) => `${Math.round(x * 100)}%`;
const rows = [score('Exact batch lookup', exact), score('Batch-only, ignore spaces/hyphens', batchOnly), score('Recall Join', ours)];
console.log(`Eval: ${cases.length} cases (synthetic stock rows built from real CDSCO rows in ${source})\n`);
console.log('| Method | Flag precision | Flag recall | False flags | Typos sent to a human |');
console.log('|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.name} | ${pct(r.precision)} | ${pct(r.recall)} | ${r.falseFlags} | ${r.typosCaught} |`);
if (process.argv.includes('--why')) for (const r of rows) console.log(`\n${r.name} misses:\n  ${r.wrong.join('\n  ') || 'none'}`);
