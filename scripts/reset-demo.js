// Puts the live demo back to its starting state before a recording: no stock, no
// matches, returns or audit entries, and only the Jul + Aug lists loaded.
// Usage: npm run reset:demo            (keeps Sep out so it can be imported live)
import { Query } from 'node-appwrite';
import { tables } from './client.js';
import { DB } from '../appwrite/schema.js';

const LIVE_PERIOD = process.env.DEMO_LIVE_PERIOD || '2026-09';
for (const [tableId, queries] of [
  ['stock_items', []], ['matches', []], ['return_notes', []], ['audit', []],
  ['nsq_batches', [Query.equal('period', LIVE_PERIOD)]], ['alerts', [Query.equal('period', LIVE_PERIOD)]],
]) {
  const { total } = await tables.listRows({ databaseId: DB, tableId, queries: [...queries, Query.limit(1)] });
  if (total) await tables.deleteRows({ databaseId: DB, tableId, queries });
  console.log(`cleared ${String(total).padStart(4)} rows from ${tableId}`);
}
