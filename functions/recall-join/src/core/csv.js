// Minimal RFC-4180 CSV reader (quoted fields, embedded commas/newlines).
export function parseCsv(text, delim = ',') {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

// Billing exports name columns differently ("Item Name", "Batch No", "Exp.").
const HEADERS = {
  product: ['item', 'product', 'item name', 'product name', 'name', 'description'],
  batch: ['batch', 'batch no', 'batch no.', 'batchno', 'batch number'],
  expiry: ['expiry', 'exp', 'exp.', 'exp date', 'expiry date'],
  mfr: ['mfr', 'mfg by', 'company', 'manufacturer', 'mfr.', 'make'],
  qty: ['qty', 'quantity', 'stock', 'closing', 'closing stock', 'bal qty'],
  mrp: ['mrp', 'rate', 'price'],
  supplier: ['supplier', 'party', 'vendor', 'distributor', 'purchased from'],
};
export function stockFromCsv(text) {
  const [head, ...body] = parseCsv(text);
  const norm = head.map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(Object.entries(HEADERS).map(([k, names]) => [k, norm.findIndex((h) => names.includes(h))]));
  if (col.product < 0 || col.batch < 0) throw new Error('CSV needs at least an item/product column and a batch column');
  return body
    .map((r) => ({
      product: r[col.product]?.trim() ?? '',
      batch: r[col.batch]?.trim() ?? '',
      expiry: col.expiry >= 0 ? r[col.expiry]?.trim() : '',
      mfr: col.mfr >= 0 ? r[col.mfr]?.trim() : '',
      qty: col.qty >= 0 ? Number(r[col.qty]) || 0 : 0,
      mrp: col.mrp >= 0 ? Number(String(r[col.mrp]).replace(/[^\d.]/g, '')) || 0 : 0,
      supplier: col.supplier >= 0 ? r[col.supplier]?.trim() : '',
    }))
    .filter((s) => s.product && s.batch);
}
