// Stock import engine: turns a stock export from any billing software into
// Recall Join's stock rows. Billing tools (Marg, Tally, BUSY, GoFrugal, ...)
// differ in three ways, and each step below handles one:
//   1. title rows above the header (company name, report name, date range)
//   2. column names ("Item Name", "Particulars", "Batch No.", "Exp.Dt", "M.R.P.")
//   3. value formats (expiry as "Dec-27", "31/12/2027", Excel serial 46752, ...)
// Some reports also group batches under an item row (item name once, batches
// below it with the name blank); those rows inherit the item name.
import { parseCsv } from './csv.js';

export const FIELDS = ['product', 'batch', 'expiry', 'mfr', 'qty', 'mrp', 'supplier'];
export const REQUIRED = ['product', 'batch'];

// ---------------------------------------------------------------- text tables
// Exports are comma, tab, semicolon or pipe separated; pick the separator that
// splits the first lines into the most consistent number of columns.
export function sniffDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  let best = ',', bestScore = -1;
  for (const d of [',', '\t', ';', '|']) {
    const counts = lines.map((l) => parseCsv(l, d)[0]?.length || 0);
    const wide = counts.filter((c) => c > 1);
    if (!wide.length) continue;
    const mode = Math.max(...wide);
    const score = wide.filter((c) => c === mode).length * mode;
    if (score > bestScore) [best, bestScore] = [d, score];
  }
  return best;
}

// Some tools save an HTML table with an .xls name ("Excel" export). Read its cells.
export function htmlTableRows(text) {
  const rows = [];
  for (const tr of text.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const td of tr[1].matchAll(/<t([dh])([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
      const span = Number(td[2].match(/colspan\s*=\s*["']?(\d+)/i)?.[1] || 1);
      cells.push(decodeEntities(td[3].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).trim());
      for (let i = 1; i < span; i++) cells.push('');
    }
    rows.push(cells);
  }
  return rows.filter((r) => r.some((x) => x));
}

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, e) => {
    const k = e.toLowerCase();
    if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : Number(k.slice(1)));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[k];
  });
}

export function textToRows(text) {
  text = text.replace(/^﻿/, '');
  if (/^\s*<(!doctype|html|table|\?xml)/i.test(text) && /<tr/i.test(text)) return htmlTableRows(text);
  return parseCsv(text, sniffDelimiter(text));
}

// ---------------------------------------------------------------- headers
// Header names seen in billing exports and import templates. "exact" names are
// unambiguous; "words" are substrings that count only when no "not" word appears.
const RULES = {
  product: {
    exact: ['item', 'item name', 'itemname', 'product', 'product name', 'name', 'description', 'item description',
      'medicine', 'medicine name', 'drug', 'drug name', 'particulars', 'stock item', 'name of item', 'item details',
      'product description', 'sku name', 'article', 'article name'],
    words: ['item', 'product', 'medicine', 'particular', 'drug'],
    not: ['code', 'id', 'group', 'category', 'type', 'hsn', 'barcode', 'qty', 'no', 'count'],
  },
  batch: {
    exact: ['batch', 'batch no', 'batchno', 'batch number', 'batch num', 'batch code', 'bno', 'b no', 'lot', 'lot no', 'lot number', 'batch lot no', 'batch name'],
    words: ['batch', 'lot'],
    not: ['qty', 'date', 'dt', 'exp', 'mfg', 'stock', 'value', 'rate', 'wise'],
  },
  expiry: {
    exact: ['exp', 'expiry', 'expiry date', 'exp date', 'expdt', 'exp dt', 'expdate', 'expiry dt', 'expires', 'expiry month',
      'exp month', 'use before', 'best before', 'date of expiry', 'expire date', 'expiration', 'expiration date'],
    words: ['exp'],
    not: ['day', 'days', 'mfg', 'manuf', 'expense', 'export', 'value', 'qty'],
  },
  mfr: {
    exact: ['mfr', 'mfg', 'mfg by', 'mfgby', 'manufacturer', 'manufacturer name', 'mfr name', 'company', 'company name', 'comp',
      'make', 'brand company', 'marketed by', 'mkt by', 'mfg company', 'mfg co', 'manufactured by', 'mfac', 'mnfr', 'producer', 'mkt', 'marketer'],
    words: ['manufactur', 'company', 'mfr', 'marketed'],
    not: ['date', 'dt', 'code', 'month', 'year', 'lic'],
  },
  qty: {
    exact: ['qty', 'quantity', 'stock', 'closing', 'closing stock', 'closing qty', 'cl stock', 'cl qty', 'clqty', 'bal qty', 'balance',
      'balance qty', 'current stock', 'curr stock', 'available', 'available qty', 'avl qty', 'stock qty', 'on hand', 'qty on hand',
      'units', 'nos', 'pcs', 'total qty', 'closing balance', 'physical stock', 'stk', 'cur stock'],
    words: ['qty', 'quantity', 'closing', 'stock', 'balance'],
    not: ['free', 'opening', 'op', 'sale', 'sold', 'purchase', 'pur', 'value', 'val', 'amount', 'amt', 'min', 'max', 'reorder',
      'inward', 'outward', 'in', 'out', 'rate', 'price', 'item', 'date', 'pack', 'scheme'],
  },
  mrp: {
    exact: ['mrp', 'mrp rs', 'mrp inr', 'm r p', 'max retail price', 'maximum retail price', 'retail price', 'mrp per unit',
      'unit mrp', 'mrp strip', 'mrp pack'],
    words: ['mrp', 'retail price'],
    not: ['value', 'amount', 'amt', 'total', 'old'],
    // Weaker: the sale rate when the file has no MRP column.
    weak: ['rate', 'price', 'sale rate', 's rate', 'srate', 'selling price', 'sp', 'unit price'],
    weakNot: ['purchase', 'pur', 'p rate', 'prate', 'cost', 'ptr', 'pts', 'value', 'amount', 'net', 'landing',
      'gst', 'igst', 'cgst', 'sgst', 'tax', 'vat', 'disc', 'discount', 'hsn', 'margin', 'scheme'],
  },
  supplier: {
    exact: ['supplier', 'supplier name', 'party', 'party name', 'vendor', 'vendor name', 'distributor', 'distributor name',
      'purchased from', 'last supplier', 'stockist', 'wholesaler', 'supp name', 'supp'],
    words: ['supplier', 'vendor', 'party', 'distributor', 'stockist'],
    not: ['code', 'gst', 'id', 'phone', 'mobile', 'address'],
  },
};

// "M.R.P." -> "mrp", "Exp.Dt." -> "expdt", "Batch No." -> "batch no", "Qty (Nos)" -> "qty nos"
export function normHeader(h) {
  return String(h ?? '').toLowerCase().replace(/\./g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// 3: exact name, 2: contains a field word, 1.5/1: weak (sale rate as MRP), 0: no.
export function headerScore(field, header) {
  const h = normHeader(header);
  if (!h) return 0;
  const r = RULES[field];
  if (r.exact.includes(h)) return 3;
  const tokens = h.split(' ');
  const has = (w) => (w.includes(' ') ? h.includes(w) : tokens.includes(w));
  const hasPart = (w) => h.includes(w);
  if (r.words.some(hasPart) && !r.not.some(has)) return 2;
  if (r.weak && !r.weakNot.some(has)) {
    if (r.weak.includes(h)) return 1.5;
    if (r.weak.some(has)) return 1;
  }
  return 0;
}

// The header is the row (among the first 40) that names the most fields.
export function findHeaderRow(rows) {
  let best = -1, bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const s = FIELDS.reduce((a, f) => a + (rows[i].some((c) => headerScore(f, c) >= 2) ? 1 : 0), 0);
    if (s > bestScore) [best, bestScore] = [i, s];
  }
  return bestScore >= 2 ? best : -1;
}

// ---------------------------------------------------------------- values
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const month2 = (y, m) => (m >= 1 && m <= 12 && y >= 1990 && y <= 2100 ? `${y}-${String(m).padStart(2, '0')}` : null);
const year4 = (y) => (y < 100 ? 2000 + y : y);

// Excel stores dates as days since 1899-12-30.
export function excelSerialToISO(n) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return d.toISOString().slice(0, 10);
}

// Expiry -> "YYYY-MM" or null. Indian billing software writes day-first dates;
// a month-first date (12/31/2027) is accepted only when day-first is impossible.
export function parseExpiry(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') raw = raw > 20000 && raw < 80000 ? excelSerialToISO(raw) : String(raw);
  let s = String(raw).trim().toLowerCase();
  if (!s || s === '-' || s === 'na' || s === 'n/a') return null;
  if (/^\d{5}(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) s = excelSerialToISO(+s);
  // Month written as a word: "dec-27", "31-dec-2027", "december 2027", "dec'27", "tue dec 31 2027"
  const w = s.match(/(?:^|[^a-z])(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s\-\/.,']*(?:(\d{1,2})(?:st|nd|rd|th)?[\s,]+)?(\d{4}|\d{2})(?!\d)/);
  if (w) return month2(year4(Number(w[3])), MONTHS.indexOf(w[1]) + 1);
  // ISO: 2027-12, 2027-12-31, 2027/12/31 00:00:00
  let m = s.match(/^(\d{4})[\-\/.](\d{1,2})(?:[\-\/.]\d{1,2})?(?:[ t].*)?$/);
  if (m) return month2(+m[1], +m[2]);
  // Day-first full date: 31/12/2027, 31-12-27, 31.12.2027
  m = s.match(/^(\d{1,2})[\-\/.](\d{1,2})[\-\/.](\d{2}|\d{4})(?:[ t].*)?$/);
  if (m) {
    const [d, mo, y] = [+m[1], +m[2], year4(+m[3])];
    if (mo <= 12 && d <= 31) return month2(y, mo);
    if (d <= 12 && mo <= 31) return month2(y, d); // month-first
    return null;
  }
  // Month and year: 12/27, 12/2027, 12-2027, 12.27
  m = s.match(/^(\d{1,2})[\-\/.\s](\d{2}|\d{4})$/);
  if (m) return month2(year4(+m[2]), +m[1]);
  // Packed: 1227, 122027
  m = s.match(/^(\d{2})(\d{2}|\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return month2(year4(+m[2]), +m[1]);
  return null;
}

// "₹1,23,456.50" -> 123456.5, "30 Nos" -> 30, "10+2" -> 10 (free goods), "(5)" -> -5
export function parseNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const s = String(raw ?? '').replace(/,/g, '').trim();
  const m = s.match(/-?\d+(?:\.\d+)?|\.\d+/);
  if (!m) return 0;
  const n = Number(m[0]);
  return /^\(.*\)$/.test(s) ? -Math.abs(n) : n;
}

// ---------------------------------------------------------------- columns
const looksBatch = (v) => /^[a-z0-9][a-z0-9\-\/.]{2,19}$/i.test(v) && /\d/.test(v) && !/^\d+\.\d+$/.test(v) && parseExpiry(v) === null;
const isNum = (v) => typeof v === 'number' || /^[₹\s]*-?[\d,]*\.?\d+\s*$/.test(String(v));

function columnProfile(body, c) {
  const vals = body.map((r) => r[c]).filter((v) => v !== undefined && String(v).trim() !== '');
  const n = vals.length || 1;
  const frac = (fn) => vals.filter(fn).length / n;
  return {
    filled: vals.length,
    date: frac((v) => parseExpiry(v) !== null),
    batch: frac((v) => looksBatch(String(v).trim())),
    num: frac(isNum),
    int: frac((v) => isNum(v) && Number.isInteger(parseNumber(v))),
    text: frac((v) => /[a-z]{3}/i.test(String(v)) && !isNum(v)),
    len: vals.reduce((a, v) => a + String(v).length, 0) / n,
    firm: frac((v) => /\b(ltd|limited|pvt|pharma\w*|laborator\w*|labs?|industries|healthcare|remedies|formulations|m\/s|inc|llp|corporation)\b/i.test(String(v))),
    unique: new Set(vals.map(String)).size / n,
    avgMonth: vals.map(parseExpiry).filter(Boolean).sort()[Math.floor(vals.length / 2)] || '',
  };
}

// Returns { mapping: {field: colIndex|-1}, how: {field: 'header'|'weak'|'values'|'missing'} }
// 'weak' is a loose header match (a "Rate" column read as MRP) the user should check.
export function detectColumns(header, body) {
  const width = Math.max(header.length, ...body.slice(0, 200).map((r) => r.length));
  const sample = body.slice(0, 200);
  const mapping = Object.fromEntries(FIELDS.map((f) => [f, -1]));
  const how = Object.fromEntries(FIELDS.map((f) => [f, 'missing']));
  const taken = new Set();
  const prof = [];
  for (let c = 0; c < width; c++) prof[c] = columnProfile(sample, c);

  // 1. Header names, strongest first. Ties go to the leftmost column, except two
  //    date-like headers where the later expiry wins (Mfg date sits before Exp date).
  const cands = [];
  for (const f of FIELDS) for (let c = 0; c < width; c++) {
    const s = headerScore(f, header[c]);
    if (s) cands.push({ f, c, s });
  }
  cands.sort((a, b) => b.s - a.s || a.c - b.c);
  const TEXT = ['product', 'mfr', 'supplier'];
  for (const { f, c, s } of cands) {
    if (mapping[f] >= 0 || taken.has(c)) continue;
    if (prof[c].filled === 0 && body.length) continue;
    // "Mfg" can mean the maker or the manufacturing date; the values decide.
    if (TEXT.includes(f) && prof[c].filled && prof[c].text < 0.3) continue;
    mapping[f] = c; how[f] = s >= 2 ? 'header' : 'weak'; taken.add(c);
  }

  // 2. Values, for fields the header didn't name.
  const free = () => [...Array(width).keys()].filter((c) => !taken.has(c) && prof[c].filled);
  const pick = (f, score, min) => {
    if (mapping[f] >= 0) return;
    const best = free().map((c) => [c, score(prof[c], c)]).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= min) { mapping[f] = best[0]; how[f] = 'values'; taken.add(best[0]); }
  };
  // With two date columns, expiry is the later one.
  pick('expiry', (p) => p.date + (p.avgMonth > '2000' ? Number(p.avgMonth.slice(0, 4)) / 1e5 : 0), 0.7);
  pick('batch', (p) => (p.batch >= 0.7 ? p.batch + p.unique / 10 : 0), 0.7);
  // Company names carry "Ltd", "Pharma", "Labs"; of the other text columns the item name comes first.
  pick('mfr', (p) => (p.text >= 0.7 && p.firm >= 0.5 ? p.firm : 0), 0.5);
  pick('product', (p, c) => (p.text >= 0.7 ? 2 - c / 100 : 0), 1);
  pick('qty', (p) => (p.int >= 0.9 ? p.int : 0), 0.9);
  pick('mrp', (p) => (p.num >= 0.9 ? p.num : 0), 0.9);
  return { mapping, how };
}

// ---------------------------------------------------------------- rows
const TOTAL = /^(grand\s+)?(sub\s*)?total\b|^total\s*[:\-]/i;

// Applies a mapping. Returns stock rows plus counts of what was skipped and why.
export function buildStock(body, mapping) {
  const get = (r, f) => (mapping[f] >= 0 ? r[mapping[f]] : undefined);
  const str = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
  const out = [];
  const skipped = { noBatch: 0, total: 0, group: 0 };
  let badExpiry = 0, carriedName = 0;
  let lastProduct = '', lastMfr = '';
  for (const r of body) {
    let product = str(get(r, 'product'));
    const batch = str(get(r, 'batch'));
    let mfr = str(get(r, 'mfr'));
    if (TOTAL.test(product) || (!product && TOTAL.test(str(r.find((x) => str(x))) ))) { skipped.total++; continue; }
    if (!batch) {
      // An item row in a grouped report: remember its name for the batch rows below it.
      if (product) { lastProduct = product; lastMfr = mfr || lastMfr; skipped.group++; } else skipped.noBatch++;
      continue;
    }
    if (!product && lastProduct) { product = lastProduct; carriedName++; }
    if (!mfr && product === lastProduct) mfr = lastMfr;
    if (!product) { skipped.noBatch++; continue; }
    lastProduct = product; lastMfr = mfr;
    const rawExp = get(r, 'expiry');
    const ym = parseExpiry(rawExp);
    if (str(rawExp) && !ym) badExpiry++;
    out.push({
      product: product.slice(0, 500),
      batch: batch.slice(0, 64),
      // Unreadable expiry is kept as written; the matcher treats it as unknown.
      expiry: ym ? `${ym.slice(5)}/${ym.slice(0, 4)}` : str(rawExp).slice(0, 16),
      mfr: mfr.slice(0, 255),
      qty: Math.round(parseNumber(get(r, 'qty'))),
      mrp: parseNumber(get(r, 'mrp')),
      supplier: str(get(r, 'supplier')).slice(0, 255),
    });
  }
  // A grouped report's item rows aren't skipped data; don't report them as such.
  if (!carriedName) skipped.noBatch += skipped.group, skipped.group = 0;
  return { stock: out, skipped, badExpiry, carriedName };
}

// Whole pipeline on a table of cells. headerRow can be forced by the user.
export function analyze(rows, headerRow) {
  const h = headerRow ?? findHeaderRow(rows);
  const header = h >= 0 ? rows[h].map((c) => String(c ?? '').trim()) : [];
  const body = rows.slice(h + 1);
  const { mapping, how } = detectColumns(header, body);
  return { headerRow: h, header, body, mapping, how, ...buildStock(body, mapping) };
}

// Recall Join's own stock CSV, which the server reads with stockFromCsv.
export function toCanonicalCsv(stock) {
  const q = (v) => (/[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = ['Item Name,Batch No,Exp.,Company,Qty,MRP,Party'];
  for (const s of stock) lines.push([s.product, s.batch, s.expiry, s.mfr, s.qty, s.mrp, s.supplier].map(q).join(','));
  return lines.join('\n') + '\n';
}
