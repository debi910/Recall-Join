// Creates the database, tables, columns, indexes and demo teams/users. Safe to re-run.
import { tables, teams, users } from './client.js';
import { DB, TABLES } from '../appwrite/schema.js';
import { Permission, Role, ID, Query } from 'node-appwrite';

const exists = (err) => err?.code === 409;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensure(label, fn) {
  try { await fn(); console.log('created', label); } catch (err) { if (exists(err)) console.log('exists ', label); else throw err; }
}

await ensure(`database ${DB}`, () => tables.create({ databaseId: DB, name: 'Recall Join' }));

for (const tb of TABLES) {
  // Regulator data is readable by any signed-in user; everything else is per-row.
  const permissions = tb.rowSecurity ? [] : [Permission.read(Role.users())];
  await ensure(`table ${tb.id}`, () => tables.createTable({ databaseId: DB, tableId: tb.id, name: tb.name, permissions, rowSecurity: tb.rowSecurity }));
  for (const c of tb.columns) {
    const base = { databaseId: DB, tableId: tb.id, key: c.key, required: c.required };
    const make = {
      varchar: () => tables.createVarcharColumn({ ...base, size: c.size }),
      text: () => tables.createTextColumn(base),
      enum: () => tables.createEnumColumn({ ...base, elements: c.elements, xdefault: c.required ? null : c.xdefault }),
      integer: () => tables.createIntegerColumn({ ...base, xdefault: c.required ? null : c.xdefault ?? null }),
      float: () => tables.createFloatColumn({ ...base, xdefault: c.required ? null : c.xdefault ?? null }),
      boolean: () => tables.createBooleanColumn({ ...base, xdefault: c.required ? null : c.xdefault ?? null }),
    }[c.type];
    await ensure(`  ${tb.id}.${c.key}`, make);
  }
}
// Columns are created asynchronously; indexes need them to be available.
await wait(4000);
for (const tb of TABLES) {
  for (const ix of tb.indexes) {
    await ensure(`  index ${tb.id}.${ix.key}`, () => tables.createIndex({ databaseId: DB, tableId: tb.id, key: ix.key, type: ix.type, columns: ix.columns }));
  }
}

// Demo actors: one chemist shop and one distributor, each a Team.
const SHOP = process.env.DEMO_SHOP_TEAM || 'shop-demo';
const DIST = process.env.DEMO_DIST_TEAM || 'dist-demo';
await ensure('team shop', () => teams.create({ teamId: SHOP, name: process.env.DEMO_SHOP_NAME || 'Maa Tarini Medical Store (demo)' }));
const ADMIN = process.env.ADMIN_TEAM || 'admins';
await ensure('team admins', () => teams.create({ teamId: ADMIN, name: 'Recall Join admins' }));
await ensure('team distributor', () => teams.create({ teamId: DIST, name: process.env.DEMO_DIST_NAME || 'Kalinga Pharma Distributors (demo)' }));

for (const [email, name, team] of [
  [process.env.DEMO_CHEMIST_EMAIL || 'chemist@recalljoin.demo', 'Demo Chemist', SHOP],
  // The demo chemist can also ingest regulator lists ("Demo controls" in the UI).
  [process.env.DEMO_CHEMIST_EMAIL || 'chemist@recalljoin.demo', 'Demo Chemist', ADMIN],
  [process.env.DEMO_DIST_EMAIL || 'distributor@recalljoin.demo', 'Demo Distributor', DIST],
]) {
  let userId;
  try {
    userId = (await users.create({ userId: ID.unique(), email, password: process.env.DEMO_PASSWORD, name })).$id;
    console.log('created user', email);
  } catch (err) {
    if (!exists(err)) throw err;
    userId = (await users.list({ queries: [Query.equal('email', email)] })).users[0].$id;
    console.log('exists  user', email);
  }
  await ensure(`  membership ${email} -> ${team}`, () => teams.createMembership({ teamId: team, roles: ['owner'], userId }));
}
console.log('\nSetup done. Next: npm run import:nsq -- data/nsq/<file>.json');
