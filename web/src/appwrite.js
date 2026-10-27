import { Client, Account, Teams, TablesDB, Functions, Realtime, Channel, Query } from 'appwrite';

export const DB = import.meta.env.VITE_APPWRITE_DB_ID || 'recall';
export const FN = import.meta.env.VITE_APPWRITE_FUNCTION_ID || 'recall-join';
export const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID || 'unset');
export const account = new Account(client);
export const teams = new Teams(client);
export const db = new TablesDB(client);
export const functions = new Functions(client);
export const realtime = new Realtime(client);
export { Channel, Query };

// All writes go through the Function, which enforces the rules server-side.
export async function call(action, payload = {}) {
  const ex = await functions.createExecution({ functionId: FN, body: JSON.stringify({ action, ...payload }), async: false });
  let out;
  try { out = JSON.parse(ex.responseBody || '{}'); } catch { out = { ok: false, error: ex.responseBody }; }
  if (!out.ok) throw new Error(out.error || `Function failed (${ex.responseStatusCode})`);
  return out;
}

export async function rows(tableId, queries = []) {
  return (await db.listRows({ databaseId: DB, tableId, queries })).rows;
}
