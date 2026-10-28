// Stock-export layouts used by the import eval and the sample files.
//
// None of these vendors publishes a sample stock export, so the layouts are
// reconstructed, not copied: header names come from vendor help pages and
// import guides where they name the fields (LOGIC ERP's batch-wise closing stock
// lists its columns; Tally's Batch Summary has Mfg/Expiry options; BUSY's
// batch-wise stock shows qty, mfg and expiry dates), and from the header aliases
// in open-source parsers of Marg/eVitalRx/Vyapar exports. They are a test of the
// engine's tolerance, not a claim that a given vendor writes exactly this file.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const serial = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);

// Writes a "YYYY-MM" month the way a layout writes expiry dates.
export const DATE = {
  'MM/YY': (y, m) => `${p2(m)}/${p2(y % 100)}`,
  'MM/YYYY': (y, m) => `${p2(m)}/${y}`,
  'MMM-YY': (y, m) => `${MON[m - 1]}-${p2(y % 100)}`,
  'MMM-YYYY': (y, m) => `${MON[m - 1]}-${y}`,
  'MMM YYYY': (y, m) => `${MON[m - 1].toUpperCase()} ${y}`,
  "MMM'YY": (y, m) => `${MON[m - 1]}'${p2(y % 100)}`,
  'DD/MM/YYYY': (y, m) => `${lastDay(y, m)}/${p2(m)}/${y}`,
  'DD-MM-YYYY': (y, m) => `${lastDay(y, m)}-${p2(m)}-${y}`,
  'DD-MM-YY': (y, m) => `${lastDay(y, m)}-${p2(m)}-${p2(y % 100)}`,
  'DD.MM.YYYY': (y, m) => `${lastDay(y, m)}.${p2(m)}.${y}`,
  'DD-MMM-YY': (y, m) => `${lastDay(y, m)}-${MON[m - 1]}-${p2(y % 100)}`,
  'DD-MMM-YYYY': (y, m) => `${lastDay(y, m)}-${MON[m - 1]}-${y}`,
  'YYYY-MM-DD': (y, m) => `${y}-${p2(m)}-${lastDay(y, m)}`,
  'YYYY-MM': (y, m) => `${y}-${p2(m)}`,
  'MM/DD/YYYY': (y, m) => `${p2(m)}/${lastDay(y, m)}/${y}`,
  'MMYY': (y, m) => `${p2(m)}${p2(y % 100)}`,
  'Excel date cell': (y, m) => serial(y, m, lastDay(y, m)),
};

// cols: [header, field or a function of the row]. Fields: product batch expiry mfr qty mrp supplier.
export const LAYOUTS = [
  {
    id: 'marg-style', name: 'Marg-style batch-wise stock', file: 'csv', date: 'MM/YY',
    title: [['SHREE JAGANNATH MEDICOS'], ['Stock Status (Batch Wise)'], ['As on 28/10/2026']],
    cols: [['S.No', (r, i) => i + 1], ['Item Name', 'product'], ['Pack', () => '10S'], ['Batch No.', 'batch'], ['Expiry', 'expiry'],
      ['Company', 'mfr'], ['Stock', 'qty'], ['M.R.P.', 'mrp'], ['Rate', (r) => (r.mrp * 0.8).toFixed(2)], ['Supplier', 'supplier']],
  },
  {
    id: 'tally-style', name: 'Tally-style batch summary, batches grouped under each item', file: 'xlsx', date: 'DD-MMM-YY', grouped: true,
    title: [['Shree Jagannath Medicos'], ['Batch Summary'], ['1-Apr-2026 to 28-Oct-2026']],
    cols: [['Particulars', 'product'], ['Batch', 'batch'], ['Mfg Dt', () => '1-Jun-24'], ['Expiry Date', 'expiry'],
      ['Quantity', 'qty'], ['Rate', 'mrp'], ['Value', (r) => (r.qty * r.mrp).toFixed(2)]],
  },
  {
    id: 'busy-style', name: 'BUSY-style batch-wise stock', file: 'xls', date: 'DD-MM-YYYY',
    title: [['Batch-wise Stock Status'], ['Shree Jagannath Medicos']],
    cols: [['Item Details', 'product'], ['Batch No.', 'batch'], ['Mfg. Date', () => '01-06-2024'], ['Exp. Date', 'expiry'],
      ['Qty.', 'qty'], ['Unit', () => 'Strip'], ['MRP', 'mrp'], ['Manufacturer', 'mfr']],
  },
  {
    id: 'gofrugal-style', name: 'GoFrugal-style item stock', file: 'xlsx', date: 'MMM-YYYY',
    cols: [['Item Code', (r, i) => 10000 + i], ['Item Name', 'product'], ['Manufacturer', 'mfr'], ['Batch', 'batch'], ['Expiry', 'expiry'],
      ['MRP', 'mrp'], ['Selling Price', (r) => (r.mrp * 0.9).toFixed(2)], ['Stock', 'qty']],
  },
  {
    id: 'retailgraph-style', name: 'RetailGraph-style closing stock, tab separated', file: 'tsv', date: 'YYYY-MM-DD',
    cols: [['Product', 'product'], ['Pack', () => '1x10'], ['Batch', 'batch'], ['Exp Date', 'expiry'], ['Closing Stock', 'qty'],
      ['MRP', 'mrp'], ['Supplier', 'supplier']],
  },
  {
    id: 'logic-erp', name: 'LOGIC ERP batch-wise closing stock (columns as documented)', file: 'csv', date: 'DD/MM/YYYY',
    cols: [['Company Name', 'mfr'], ['Item Name', 'product'], ['Batch No.', 'batch'], ['Expiry Date', 'expiry'],
      ['Pack Rate', (r) => (r.mrp * 0.7).toFixed(2)], ['Sale Rate', 'mrp'], ['Closing Stock', 'qty'], ['Closing Value', (r) => (r.qty * r.mrp * 0.7).toFixed(2)]],
  },
  {
    id: 'excel-dates', name: 'Hand-made Excel sheet with real date cells', file: 'xlsx', date: 'Excel date cell',
    cols: [['Medicine', 'product'], ['Lot No', 'batch'], ['Expiry', 'expiry'], ['Qty', 'qty'], ['Price', 'mrp'], ['Distributor', 'supplier']],
  },
  {
    id: 'semicolon-us-dates', name: 'Semicolon CSV with month-first dates', file: 'csv;', date: 'MM/DD/YYYY',
    cols: [['Product Name', 'product'], ['Batch Number', 'batch'], ['Expiration Date', 'expiry'], ['Quantity', 'qty'], ['MRP (Rs)', 'mrp'], ['Mfg By', 'mfr']],
  },
  {
    id: 'no-header', name: 'No header row (columns found from their values)', file: 'csv', date: 'MMM-YY', noHeader: true,
    cols: [['', 'product'], ['', 'batch'], ['', 'expiry'], ['', 'mfr'], ['', 'qty'], ['', 'mrp']],
  },
];

// Renders stock rows ({product, batch, ym: 'YYYY-MM'|null, mfr, qty, mrp, supplier}) as a table of cells.
export function renderLayout(layout, stock) {
  const fmt = DATE[layout.date];
  const value = (r, i, f) => (typeof f === 'function' ? f(r, i) : f === 'expiry' ? (r.ym ? fmt(+r.ym.slice(0, 4), +r.ym.slice(5)) : '') : r[f] ?? '');
  const rows = [...(layout.title || []), ...(layout.title ? [[]] : [])];
  if (!layout.noHeader) rows.push(layout.cols.map(([h]) => h));
  let last = null;
  stock.forEach((r, i) => {
    if (layout.grouped) {
      if (r.product !== last) rows.push(layout.cols.map(([, f]) => (f === 'product' ? r.product : '')));
      last = r.product;
      rows.push(layout.cols.map(([, f]) => (f === 'product' ? '' : value(r, i, f))));
    } else rows.push(layout.cols.map(([, f]) => value(r, i, f)));
  });
  rows.push(layout.cols.map(([, f], k) => (k === 0 ? 'Grand Total' : f === 'qty' ? stock.reduce((a, r) => a + r.qty, 0) : '')));
  return rows;
}

export function toText(rows, delim = ',') {
  const q = (v) => (new RegExp(`["\\n${delim === '\t' ? '\\t' : delim}]`).test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return rows.map((r) => r.map(q).join(delim)).join('\r\n') + '\r\n';
}
