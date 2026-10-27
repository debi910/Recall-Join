import { normBatch, skelBatch, mfrMatch, normMonth, productSimilarity } from './normalize.js';

// The four outcomes a pharmacist can see. Only FLAG offers quarantine.
export const TIER = {
  FLAG: 'flag',                 // on the list: quarantine
  REVIEW_COLLISION: 'collision', // same batch string, different maker/expiry: check the strip
  REVIEW_NEAR: 'near',          // one confusable character away: check the strip
  INFO: 'info',                 // same product flagged, but not this batch
};

const PRODUCT_SAME = 0.6;

// Compare one stock row with one regulator row that shares its batch skeleton.
// Returns null when the pair is unrelated.
export function classifyPair(stock, nsq) {
  const exact = normBatch(stock.batch) === normBatch(nsq.batch);
  const mfr = mfrMatch(stock.mfr, nsq.mfr);           // true | false | null (unknown)
  const se = normMonth(stock.expiry), ne = normMonth(nsq.expiry);
  const exp = se && ne ? se === ne : null;
  const prod = productSimilarity(stock.product, nsq.product);

  const reasons = {
    batch: exact ? 'exact' : 'confusable',
    mfr: mfr === null ? 'unknown' : mfr ? 'match' : 'differs',
    expiry: exp === null ? 'unknown' : exp ? 'match' : 'differs',
    product: prod,
  };

  if (exact) {
    // Batch strings repeat across manufacturers (and across one maker's products),
    // so the batch alone is not proof. A FLAG needs a second, independent agreement.
    const productOrExpiry = prod >= PRODUCT_SAME || exp === true;
    if (mfr === true && productOrExpiry) return { tier: TIER.FLAG, reasons };
    if (mfr === null && productOrExpiry) return { tier: TIER.FLAG, reasons };
    if (mfr === false && prod < PRODUCT_SAME && exp !== true) return null; // unrelated product sharing a batch code
    return { tier: TIER.REVIEW_COLLISION, reasons };
  }
  // Skeleton-only match: plausible typo or OCR slip, never auto-flagged.
  if (prod >= PRODUCT_SAME && mfr !== false) return { tier: TIER.REVIEW_NEAR, reasons };
  return null;
}

// In-memory join used by the eval and as the fallback when server-side joins
// are unavailable. Index regulator rows by batch skeleton, then probe.
export function matchStock(stockRows, nsqRows) {
  const bySkel = new Map();
  for (const n of nsqRows) {
    const k = skelBatch(n.batch);
    if (!k) continue;
    if (!bySkel.has(k)) bySkel.set(k, []);
    bySkel.get(k).push(n);
  }
  const out = [];
  for (const s of stockRows) {
    const hits = [];
    for (const n of bySkel.get(skelBatch(s.batch)) ?? []) {
      const r = classifyPair(s, n);
      if (r) hits.push({ stock: s, nsq: n, ...r });
    }
    if (hits.length) {
      out.push(...hits);
      continue;
    }
    // No batch-level hit: tell the pharmacist if the same product is on the list.
    const same = nsqRows.find((n) => mfrMatch(s.mfr, n.mfr) === true && productSimilarity(s.product, n.product) >= PRODUCT_SAME);
    if (same) out.push({ stock: s, nsq: same, tier: TIER.INFO, reasons: { batch: 'different', product: productSimilarity(s.product, same.product) } });
  }
  return out;
}

// What existing consumer lookup tools do: exact batch string equality.
export function baselineMatch(stockRows, nsqRows) {
  const set = new Map(nsqRows.map((n) => [String(n.batch).trim().toUpperCase(), n]));
  return stockRows
    .filter((s) => set.has(String(s.batch).trim().toUpperCase()))
    .map((s) => ({ stock: s, nsq: set.get(String(s.batch).trim().toUpperCase()), tier: TIER.FLAG }));
}
