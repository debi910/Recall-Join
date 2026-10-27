// Loads parsed CDSCO rows (tools/parse_nsq.py output) into TablesDB.
// Usage: npm run import:nsq -- data/nsq/2026-08-central.json [more.json ...]
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tables } from './client.js';
import { DB } from '../appwrite/schema.js';
import { normBatch, skelBatch } from '../core/normalize.js';

const rowId = (...p) => createHash('sha1').update(p.join('|')).digest('hex').slice(0, 32);
for (const file of process.argv.slice(2)) {
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  const { period, source, source_url } = rows[0];
  const alertId = rowId('alert', period, source);
  await tables.upsertRow({ databaseId: DB, tableId: 'alerts', rowId: alertId, data: { period, source, source_url, rows_count: rows.length } });
  for (let i = 0; i < rows.length; i += 100) {
    await tables.upsertRows({
      databaseId: DB, tableId: 'nsq_batches',
      rows: rows.slice(i, i + 100).map((r) => ({
        $id: rowId(period, source, r.sno, r.batch),
        product: r.product, batch: r.batch, batch_norm: normBatch(r.batch), batch_skel: skelBatch(r.batch),
        mfg: r.mfg || '', expiry: r.expiry || '', mfr: r.mfr || '', result: r.result || '', lab: r.lab || '',
        period, source, alert_id: alertId,
      })),
    });
  }
  console.log(`imported ${rows.length} rows from ${file} (${period}, ${source})`);
}
