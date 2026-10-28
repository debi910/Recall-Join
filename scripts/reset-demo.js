// Puts the live demo back to its starting state: no stock, no matches, returns or
// audit entries. All bundled lists stay loaded, so the demo shop opens with matches
// (the web app reloads the demo stock on sign-in).
// Usage: npm run reset:demo
//        DEMO_LIVE_PERIOD=2026-09 npm run reset:demo   (also drops Sep, to import it live on camera)
import { Query } from 'node-appwrite';
import { tables } from './client.js';
import { DB } from '../appwrite/schema.js';

const LIVE_PERIOD = process.env.DEMO_LIVE_PERIOD;
for (const [tableId, queries] of [
  ['stock_items', []], ['matches', []], ['return_notes', []], ['audit', []],
  ...(LIVE_PERIOD ? [['nsq_batches', [Query.equal('period', LIVE_PERIOD)]], ['alerts', [Query.equal('period', LIVE_PERIOD)]]] : []),
]) {
  const { total } = await tables.listRows({ databaseId: DB, tableId, queries: [...queries, Query.limit(1)] });
  if (total) await tables.deleteRows({ databaseId: DB, tableId, queries });
  console.log(`cleared ${String(total).padStart(4)} rows from ${tableId}`);
}
