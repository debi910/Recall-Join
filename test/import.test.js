import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { analyze, parseExpiry, parseNumber, textToRows, headerScore, toCanonicalCsv } from '../core/import.js';
import { readSheet } from '../core/sheets.js';
import { stockFromCsv } from '../core/csv.js';

test('expiry formats billing tools write', () => {
  const cases = {
    '08/27': '2027-08', '8/2027': '2027-08', 'Aug-27': '2027-08', 'AUG 2027': '2027-08', "Aug'27": '2027-08', 'august 2027': '2027-08',
    '31/08/2027': '2027-08', '31-08-27': '2027-08', '31.08.2027': '2027-08', '31-Aug-2027': '2027-08', '2027-08-31': '2027-08',
    '2027-08': '2027-08', '2027/08/31 00:00:00': '2027-08', '08/31/2027': '2027-08', '0827': '2027-08', 46630: '2027-08', '46630': '2027-08',
    'Tue Aug 31 2027': '2027-08', '': null, '-': null, 'N/A': null, '13/2027': null, 'soon': null,
  };
  for (const [raw, want] of Object.entries(cases)) assert.equal(parseExpiry(raw), want, raw);
  assert.equal(parseExpiry(46630), '2027-08');
  // Day-first wins when both readings are possible.
  assert.equal(parseExpiry('05/06/2027'), '2027-06');
});

test('numbers with rupee signs, Indian commas and units', () => {
  assert.equal(parseNumber('₹1,23,456.50'), 123456.5);
  assert.equal(parseNumber('30 Nos'), 30);
  assert.equal(parseNumber('10+2'), 10);
  assert.equal(parseNumber('(5)'), -5);
  assert.equal(parseNumber(''), 0);
});

test('header names: right field, and tax/date columns ignored', () => {
  assert.equal(headerScore('mrp', 'M.R.P.'), 3);
  assert.equal(headerScore('expiry', 'Exp.Dt.'), 3);
  assert.equal(headerScore('expiry', 'Mfg. Date'), 0);
  assert.equal(headerScore('mfr', 'Mfg Dt'), 0);
  assert.equal(headerScore('qty', 'Free Qty'), 0);
  assert.equal(headerScore('qty', 'Opening Stock'), 0);
  assert.equal(headerScore('mrp', 'GST Rate'), 0);
  assert.equal(headerScore('mrp', 'Purchase Rate'), 0);
  assert.ok(headerScore('mrp', 'Sale Rate') > 0 && headerScore('mrp', 'Sale Rate') < 2);
  assert.equal(headerScore('product', 'Item Code'), 0);
});

test('title rows above the header, a grand total below', () => {
  const a = analyze(textToRows('SHREE MEDICOS\nBatch Wise Stock\n\nItem Name,Batch No.,Exp.Dt,Company,Cl.Qty,M.R.P.\n"PAN 40, TAB",SP-240165,05/26,Shangrila,30,"₹112.50"\nGrand Total,,,,30,\n'));
  assert.equal(a.headerRow, 2);
  assert.deepEqual(a.stock, [{ product: 'PAN 40, TAB', batch: 'SP-240165', expiry: '05/2026', mfr: 'Shangrila', qty: 30, mrp: 112.5, supplier: '' }]);
  assert.equal(a.skipped.total, 1);
});

test('batches grouped under an item row inherit its name', () => {
  const a = analyze(textToRows('Particulars\tBatch\tExpiry Date\tQuantity\nDOLO 650\t\t\t50\n\tDL101\t31-Dec-27\t20\n\tDL102\t30-Jun-28\t30\nPAN 40\t\t\t5\n\tP9\t31-Jan-27\t5\n'));
  assert.deepEqual(a.stock.map((s) => [s.product, s.batch, s.expiry, s.qty]), [['DOLO 650', 'DL101', '12/2027', 20], ['DOLO 650', 'DL102', '06/2028', 30], ['PAN 40', 'P9', '01/2027', 5]]);
  assert.equal(a.carriedName, 3);
});

test('no header row: columns found from their values', () => {
  const body = Array.from({ length: 12 }, (_, i) => `DOLO ${i}50 TAB,DL${1000 + i},Dec-27,Micro Labs Ltd,${i + 1},31.50`).join('\n');
  const a = analyze(textToRows(body));
  assert.equal(a.headerRow, -1);
  assert.deepEqual(a.mapping, { product: 0, batch: 1, expiry: 2, mfr: 3, qty: 4, mrp: 5, supplier: -1 });
  assert.equal(a.stock.length, 12);
});

test('HTML table saved as .xls', () => {
  const rows = readSheet(new TextEncoder().encode('<html><table><tr><th>Item Name</th><th>Batch</th><th>Expiry</th></tr><tr><td>A &amp; B</td><td>X1</td><td>12/27</td></tr></table></html>'));
  assert.deepEqual(rows, [['Item Name', 'Batch', 'Expiry'], ['A & B', 'X1', '12/27']]);
});

test('every sample export (csv, tsv, xlsx, xls) reads back to the demo stock', () => {
  const demo = stockFromCsv(readFileSync('web/public/data/demo-stock.csv', 'utf8'));
  const key = (s) => `${s.product}|${s.batch}|${s.qty}`;
  const want = new Set(demo.map(key));
  const dir = 'web/public/data/samples/';
  const files = readdirSync(dir);
  assert.ok(files.some((f) => f.endsWith('.xls')) && files.some((f) => f.endsWith('.xlsx')));
  for (const f of files) {
    const a = analyze(readSheet(readFileSync(dir + f), f));
    assert.equal(a.stock.length, demo.length, f);
    assert.ok(a.stock.every((s) => want.has(key(s))), f);
    assert.equal(a.badExpiry, 0, f);
  }
});

test('canonical CSV round-trips through the server reader', () => {
  const stock = [{ product: 'PAN 40, "TAB"', batch: 'SP1', expiry: '05/2026', mfr: 'X', qty: 3, mrp: 1.5, supplier: 'Y' }];
  assert.deepEqual(stockFromCsv(toCanonicalCsv(stock)), stock);
});
