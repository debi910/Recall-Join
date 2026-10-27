import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stockFromCsv } from '../core/csv.js';

test('reads a Marg-style export with quoted names', () => {
  const rows = stockFromCsv('Item Name,Batch No,Exp.,Company,Qty,MRP,Party\n"PAN 40, TAB",SP-240165,05/26,Shangrila,30,"₹112.50",Kalinga Pharma\n');
  assert.deepEqual(rows[0], { product: 'PAN 40, TAB', batch: 'SP-240165', expiry: '05/26', mfr: 'Shangrila', qty: 30, mrp: 112.5, supplier: 'Kalinga Pharma' });
});
