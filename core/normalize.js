// Deterministic normalizers shared by the join Function, the web app and the eval.
// Nothing in here guesses: every rule is a plain string transform you can read.

// Batch numbers: case, spaces and punctuation are formatting noise, so drop them.
export function normBatch(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Characters that OCR and hand-typing confuse. The skeleton collapses each group
// to one symbol so near-misses share a join key. A skeleton match alone never
// flags anything; it only puts a row up for human review.
const CONFUSABLE = { O: '0', Q: '0', D: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6' };
export function skelBatch(raw) {
  return normBatch(raw).replace(/[OQDILSBZG]/g, (c) => CONFUSABLE[c]);
}

// Manufacturer: keep the distinctive words, drop legal suffixes and filler.
const MFR_STOP = new Set([
  'M', 'S', 'MS', 'PVT', 'PRIVATE', 'LTD', 'LIMITED', 'LLP', 'INC', 'CO', 'COMPANY', 'CORP',
  'CORPORATION', 'INDIA', 'THE', 'AND', 'OF', 'UNIT', 'PLOT', 'NO', 'VILLAGE', 'DIST',
  'DISTRICT', 'ROAD', 'RD', 'NEAR', 'PO', 'TEHSIL', 'STATE', 'INDUSTRIAL', 'AREA', 'ESTATE',
  'PHASE', 'SECTOR', 'MFD', 'BY', 'MANUFACTURED', 'MKTD', 'MARKETED',
  // Industry words every second maker uses; sharing one proves nothing.
  'PHARMA', 'PHARMACEUTICAL', 'PHARMACEUTICALS', 'PHARMACEUTICS', 'LAB', 'LABS', 'LABORATORY', 'LABORATORIES',
  'HEALTHCARE', 'HEALTH', 'CARE', 'LIFECARE', 'LIFESCIENCES', 'LIFESCIENCE', 'LIFE', 'SCIENCES', 'SCIENCE',
  'BIOSCIENCES', 'BIOTECH', 'BIOTEC', 'BIOLOGICALS', 'FORMULATIONS', 'FORMULATION', 'REMEDIES', 'DRUGS', 'DRUG',
  'MEDICARE', 'MEDICAL', 'MEDICINES', 'PARENTERALS', 'INDUSTRIES', 'ORGANICS', 'GENERICS', 'CHEMICALS',
  'ENTERPRISES', 'GLOBAL', 'INTERNATIONAL', 'DIVISION', 'IMPEX', 'EXPORTS', 'BIO', 'GROUP',
]);
export function mfrTokens(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !MFR_STOP.has(t) && !/^\d+$/.test(t))
    .map((t) => t.replace(/(IES|S)$/, (m) => (m === 'IES' ? 'Y' : '')));
}

// Two manufacturer strings agree when a distinctive (4+ letter) word is shared,
// e.g. "Hindustan Antibiotics" vs "M/s. Hindustan Antibiotics Ltd., Pimpri, Pune".
export function mfrMatch(a, b) {
  const A = mfrTokens(a).filter((t) => t.length >= 4);
  const B = new Set(mfrTokens(b));
  if (!A.length || !B.size) return null; // unknown, not "different"
  return A.some((t) => B.has(t));
}

// Expiry dates arrive as "Jan-2027", "01/2027", "1/27", "2027-01", "JAN 27".
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export function normMonth(raw) {
  const s = String(raw ?? '').toUpperCase().trim();
  if (!s) return null;
  let m, y;
  const word = s.match(/([A-Z]{3})[A-Z]*[\s\-\/.,']*(\d{2,4})/);
  if (word && MONTHS.includes(word[1])) {
    m = MONTHS.indexOf(word[1]) + 1;
    y = Number(word[2]);
  } else {
    const iso = s.match(/^(\d{4})[\-\/.](\d{1,2})/);
    const dmy = s.match(/^(?:\d{1,2}[\-\/.])?(\d{1,2})[\-\/.](\d{2,4})$/);
    if (iso) [y, m] = [Number(iso[1]), Number(iso[2])];
    else if (dmy) [m, y] = [Number(dmy[1]), Number(dmy[2])];
    else return null;
  }
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12) || y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, '0')}`;
}

// Product names: regulator writes "Telmisartan & Hydrochlorothiazide Tablets IP
// (TELMA-H)", the shop's software writes "TELMA H TAB 10S". Compare the meaningful
// words plus the strengths.
const PRODUCT_STOP = new Set([
  'TABLET', 'TABLETS', 'TAB', 'TABS', 'CAPSULE', 'CAPSULES', 'CAP', 'CAPS', 'INJECTION', 'INJ',
  'SYRUP', 'SYP', 'SUSPENSION', 'SUSP', 'ORAL', 'SOLUTION', 'SOL', 'DROPS', 'CREAM', 'GEL',
  'OINTMENT', 'IP', 'BP', 'USP', 'FILM', 'COATED', 'SUGAR', 'UNCOATED', 'DISPERSIBLE', 'DT',
  'SR', 'ER', 'XR', 'CR', 'MR', 'PR', 'AND', 'WITH', 'EACH', 'CONTAINS', 'OF', 'FOR', 'THE',
  'MG', 'ML', 'MCG', 'GM', 'IU', 'W', 'V', 'STRIP', 'PACK', 'BOTTLE', 'VIAL', 'AMP', 'S',
]);
export function productTokens(raw) {
  const s = String(raw ?? '').toUpperCase();
  const strengths = [...s.matchAll(/(\d+(?:\.\d+)?)\s*(MG|MCG|ML|GM|G|IU|%)/g)].map((m) => Number(m[1]));
  const words = s
    .replace(/(\d+(?:\.\d+)?)\s*(MG|MCG|ML|GM|G|IU|%)/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !PRODUCT_STOP.has(t) && !/^\d+S?$/.test(t));
  return { words: [...new Set(words)], strengths: [...new Set(strengths)] };
}

// 0..1. Words count as shared on an exact match or a 4+ letter prefix
// ("TELMA" ~ "TELMAH" after hyphen removal). Conflicting strengths halve the score.
export function productSimilarity(a, b) {
  const A = productTokens(a), B = productTokens(b);
  if (!A.words.length || !B.words.length) return 0;
  const shared = (x, ys) => ys.some((y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))));
  const hitA = A.words.filter((w) => shared(w, B.words)).length;
  const hitB = B.words.filter((w) => shared(w, A.words)).length;
  // Score against the shorter name: shop names are short, regulator names are long.
  let score = Math.max(hitA / A.words.length, hitB / B.words.length);
  if (A.strengths.length && B.strengths.length && !A.strengths.some((x) => B.strengths.includes(x))) score *= 0.5;
  return Math.round(score * 100) / 100;
}
