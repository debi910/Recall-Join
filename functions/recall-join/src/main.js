// Recall Join Appwrite Function: every write goes through here so the rules,
// permissions and audit trail are enforced server-side.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { Client, TablesDB, Users, Query, Permission, Role, ID } from 'node-appwrite';
import { normBatch, skelBatch } from './core/normalize.js';
import { matchStock, TIER } from './core/match.js';
import { stockFromCsv } from './core/csv.js';

const DB = process.env.APPWRITE_DB_ID || 'recall';
const SHOP_PREFIX = 'shop-';
const DIST_TEAM = process.env.DEMO_DIST_TEAM || 'dist-demo';
const ADMIN_TEAM = process.env.ADMIN_TEAM || 'admins';
const DEMO_SHOP = process.env.DEMO_SHOP_TEAM || 'shop-demo';
const DEMO_IDLE_MS = Number(process.env.DEMO_IDLE_MINUTES ?? 20) * 60 * 1000;
const CHUNK = 100;

const rowId = (...parts) => createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 32);
const chunks = (a, n = CHUNK) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key']);
  const db = new TablesDB(client);
  const users = new Users(client);
  // Hourly schedule: put the shared demo shop back to its opening state for the next judge.
  if (req.headers['x-appwrite-trigger'] === 'schedule') {
    try {
      const out = await resetDemo(db);
      log(JSON.stringify(out));
      return res.json({ ok: true, ...out });
    } catch (err) {
      error(err.stack || String(err));
      return res.json({ ok: false, error: err.message }, 500);
    }
  }
  const userId = req.headers['x-appwrite-user-id'];
  if (!userId) return res.json({ ok: false, error: 'Sign in first' }, 401);

  const teamIds = (await users.listMemberships({ userId })).memberships.map((m) => m.teamId);
  const shop = teamIds.find((t) => t.startsWith(SHOP_PREFIX));
  const isAdmin = teamIds.includes(ADMIN_TEAM);
  const isDistributor = teamIds.includes(DIST_TEAM);

  const body = typeof req.body === 'string' && req.body ? JSON.parse(req.body) : req.bodyJson ?? {};
  const ctx = { db, log, userId, shop, isAdmin, isDistributor };
  try {
    const handler = ACTIONS[body.action];
    if (!handler) return res.json({ ok: false, error: `Unknown action ${body.action}` }, 400);
    return res.json({ ok: true, ...(await handler(ctx, body)) });
  } catch (err) {
    error(err.stack || String(err));
    return res.json({ ok: false, error: err.message }, err.status || 500);
  }
};

const deny = (msg) => Object.assign(new Error(msg), { status: 403 });

async function listAll(db, tableId, queries = []) {
  const out = [];
  let cursor;
  for (;;) {
    const page = await db.listRows({ databaseId: DB, tableId, queries: [...queries, Query.limit(500), ...(cursor ? [Query.cursorAfter(cursor)] : [])] });
    out.push(...page.rows);
    if (page.rows.length < 500) return out;
    cursor = page.rows.at(-1).$id;
  }
}

async function audit(db, shop, action, detail, actor, verified = false, transactionId) {
  return db.createRow({
    databaseId: DB, tableId: 'audit', rowId: ID.unique(), transactionId,
    data: { shop_id: shop, action, detail: JSON.stringify(detail), actor, verified },
    permissions: [Permission.read(Role.team(shop))],
  });
}

// The join itself. Stock rows are probed against the regulator table through
// the batch_skel index; every candidate pair is then classified by core/match.js.
async function runJoin(db, shop, actor) {
  const stock = (await listAll(db, 'stock_items', [Query.equal('shop_id', shop), Query.equal('status', 'active')]))
    .map((r) => ({ ...r, batch: r.batch, id: r.$id }));
  const skels = [...new Set(stock.map((s) => s.batch_skel))];
  const candidates = [];
  for (const part of chunks(skels)) candidates.push(...(await listAll(db, 'nsq_batches', [Query.equal('batch_skel', part)])));
  // INFO tier (same product, other batch) needs the whole list, which is a few thousand rows at most.
  const allNsq = await listAll(db, 'nsq_batches', [Query.select(['$id', 'product', 'batch', 'expiry', 'mfr', 'period', 'result', 'batch_skel'])]);
  const byId = new Map([...allNsq, ...candidates].map((n) => [n.$id, n]));
  const results = matchStock(stock, [...byId.values()]);

  let created = 0;
  for (const m of results) {
    const id = rowId(m.stock.id, m.nsq.$id);
    try {
      await db.createRow({
        databaseId: DB, tableId: 'matches', rowId: id,
        data: {
          shop_id: shop, stock_id: m.stock.id, nsq_id: m.nsq.$id, tier: m.tier, reasons: JSON.stringify(m.reasons),
          value: (m.stock.qty || 0) * (m.stock.mrp || 0), period: m.nsq.period,
        },
        permissions: [Permission.read(Role.team(shop))],
      });
      created++;
    } catch (err) {
      if (err.code !== 409) throw err; // already known: keep the pharmacist's earlier decision
    }
  }
  const counts = Object.fromEntries(Object.values(TIER).map((t) => [t, results.filter((r) => r.tier === t).length]));
  await audit(db, shop, 'join', { stock: stock.length, candidates: byId.size, counts, newMatches: created }, actor, true);
  return { stock: stock.length, counts, newMatches: created };
}

// Every judge shares one demo shop. Once someone has quarantined, dismissed or
// uploaded their own stock, and nobody has touched it for 20 minutes, wipe the shop's
// rows and load the demo stock again. Every bundled CDSCO list is (re)loaded first,
// so the demo stock always meets the September list it was seeded from.
async function resetDemo(db) {
  const shop = DEMO_SHOP;
  const [last] = (await db.listRows({ databaseId: DB, tableId: 'audit', queries: [Query.equal('shop_id', shop), Query.orderDesc('$createdAt'), Query.limit(1)] })).rows;
  if (last && Date.now() - new Date(last.$createdAt).getTime() < DEMO_IDLE_MS) return { reset: false, why: 'in use' };

  const demoCsv = readFileSync(new URL('./data/demo-stock.csv', import.meta.url), 'utf8');
  const loaded = new Set((await listAll(db, 'alerts')).map((a) => a.period));
  const bundled = readdirSync(new URL('./data/', import.meta.url)).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 7));
  const missing = bundled.filter((p) => !loaded.has(p));
  const touched = (await db.listRows({ databaseId: DB, tableId: 'matches', queries: [Query.equal('shop_id', shop), Query.notEqual('decision', 'pending'), Query.limit(1)] })).total
    + (await db.listRows({ databaseId: DB, tableId: 'return_notes', queries: [Query.equal('shop_id', shop), Query.limit(1)] })).total;
  const stockRows = (await db.listRows({ databaseId: DB, tableId: 'stock_items', queries: [Query.equal('shop_id', shop), Query.limit(1)] })).total;
  if (!missing.length && !touched && stockRows === stockFromCsv(demoCsv).length) return { reset: false, why: 'already in demo state' };

  for (const tableId of ['matches', 'return_notes', 'stock_items', 'audit']) {
    await db.deleteRows({ databaseId: DB, tableId, queries: [Query.equal('shop_id', shop)] });
  }
  for (const period of missing) await ACTIONS.ingestAlert({ db, isAdmin: true, userId: 'schedule' }, { period });
  const up = await ACTIONS.uploadStock({ db, shop, userId: 'schedule' }, { csv: demoCsv });
  await audit(db, shop, 'demo_reset', { lists: missing, stock: up.uploaded }, 'schedule', true);
  return { reset: true, listsLoaded: missing, ...up };
}

const ACTIONS = {
  async uploadStock({ db, shop, userId }, { csv }) {
    if (!shop) throw deny('Only a shop can upload stock');
    const rows = stockFromCsv(csv);
    // New stock replaces the old, so the old stock's matches go too; left behind they
    // point at deleted rows and every re-upload would add another copy of each alert.
    for (const tableId of ['matches', 'stock_items']) {
      await db.deleteRows({ databaseId: DB, tableId, queries: [Query.equal('shop_id', shop)] });
    }
    for (const part of chunks(rows)) {
      await db.createRows({
        databaseId: DB, tableId: 'stock_items',
        rows: part.map((s) => ({
          $id: ID.unique(), $permissions: [Permission.read(Role.team(shop))],
          shop_id: shop, ...s, batch_norm: normBatch(s.batch), batch_skel: skelBatch(s.batch), status: 'active',
        })),
      });
    }
    await audit(db, shop, 'stock_upload', { rows: rows.length }, userId, true);
    return { uploaded: rows.length, join: await runJoin(db, shop, userId) };
  },

  // Only lists bundled with the function can be ingested, so a demo login
  // can't inject made-up regulator rows.
  async ingestAlert({ db, isAdmin, userId }, { period }) {
    if (!isAdmin) throw deny('Only an admin can ingest regulator lists');
    if (!/^\d{4}-\d{2}$/.test(period || '')) throw Object.assign(new Error('period must be YYYY-MM'), { status: 400 });
    let rows;
    try { rows = JSON.parse(readFileSync(new URL(`./data/${period}.json`, import.meta.url), 'utf8')); }
    catch { throw Object.assign(new Error(`No bundled CDSCO list for ${period}`), { status: 404 }); }
    for (const group of Map.groupBy(rows, (r) => `${r.period}|${r.source}`).values()) {
      const { period, source, source_url = '' } = group[0];
      const alertId = rowId('alert', period, source);
      await db.upsertRow({ databaseId: DB, tableId: 'alerts', rowId: alertId, data: { period, source, source_url, rows_count: group.length } });
      for (const part of chunks(group)) {
        await db.upsertRows({
          databaseId: DB, tableId: 'nsq_batches',
          rows: part.map((r) => ({
            $id: rowId(period, source, r.sno, r.batch),
            product: r.product, batch: r.batch, batch_norm: normBatch(r.batch), batch_skel: skelBatch(r.batch),
            mfg: r.mfg || '', expiry: r.expiry || '', mfr: r.mfr || '', result: r.result || '', lab: r.lab || '',
            period, source, alert_id: alertId,
          })),
        });
      }
    }
    // Re-run the join for every shop so new matches stream out over Realtime.
    const shops = [...new Set((await listAll(db, 'stock_items', [Query.select(['$id', 'shop_id'])])).map((r) => r.shop_id))];
    const joins = {};
    for (const s of shops) joins[s] = await runJoin(db, s, userId);
    return { ingested: rows.length, shops: shops.length, joins };
  },

  async rejoin({ db, shop, userId }) {
    if (!shop) throw deny('Only a shop can run its join');
    return runJoin(db, shop, userId);
  },

  // One transaction: block the stock, close the matches, raise return notes, audit.
  // Then read everything back and only call it verified if the writes landed.
  async quarantine({ db, shop, userId }, { matchIds, confirmedReview = false }) {
    if (!shop) throw deny('Only a shop can quarantine');
    const matches = await listAll(db, 'matches', [Query.equal('$id', matchIds), Query.equal('shop_id', shop)]);
    // FLAGs can be quarantined directly; review tiers only after the pharmacist
    // has checked the strip and confirmed it is the listed batch.
    const flagged = matches.filter((m) => m.decision === 'pending' && (m.tier === TIER.FLAG || (confirmedReview && m.tier !== TIER.INFO)));
    if (!flagged.length) return { quarantined: 0 };
    const stock = await listAll(db, 'stock_items', [Query.equal('$id', flagged.map((m) => m.stock_id))]);
    const nsq = await listAll(db, 'nsq_batches', [Query.equal('$id', flagged.map((m) => m.nsq_id))]);
    const S = new Map(stock.map((s) => [s.$id, s])), N = new Map(nsq.map((n) => [n.$id, n]));

    const bySupplier = new Map();
    for (const m of flagged) {
      const s = S.get(m.stock_id), n = N.get(m.nsq_id);
      const key = s.supplier || 'Unknown supplier';
      if (!bySupplier.has(key)) bySupplier.set(key, []);
      bySupplier.get(key).push({ product: s.product, batch: s.batch, qty: s.qty, value: s.qty * s.mrp, reason: n.result, period: n.period, lab: n.lab });
    }

    const tx = await db.createTransaction({ ttl: 120 });
    const noteIds = [];
    try {
      for (const m of flagged) {
        await db.updateRow({ databaseId: DB, tableId: 'stock_items', rowId: m.stock_id, data: { status: 'quarantined' }, transactionId: tx.$id });
        await db.updateRow({ databaseId: DB, tableId: 'matches', rowId: m.$id, data: { decision: 'quarantined', decided_by: userId }, transactionId: tx.$id });
      }
      for (const [supplier, items] of bySupplier) {
        const id = ID.unique();
        noteIds.push(id);
        await db.createRow({
          databaseId: DB, tableId: 'return_notes', rowId: id, transactionId: tx.$id,
          data: { shop_id: shop, shop_name: process.env.DEMO_SHOP_NAME || 'Maa Tarini Medical Store (demo)', supplier, distributor_team: DIST_TEAM, items: JSON.stringify(items), total_value: items.reduce((a, i) => a + i.value, 0) },
          permissions: [Permission.read(Role.team(shop)), Permission.read(Role.team(DIST_TEAM)), Permission.update(Role.team(DIST_TEAM))],
        });
      }
      await audit(db, shop, 'quarantine', { matches: flagged.map((m) => m.$id), notes: noteIds, confirmedReview }, userId, false, tx.$id);
      await db.updateTransaction({ transactionId: tx.$id, commit: true });
    } catch (err) {
      await db.updateTransaction({ transactionId: tx.$id, rollback: true }).catch(() => {});
      throw err;
    }

    // Verify after acting.
    const after = await listAll(db, 'stock_items', [Query.equal('$id', flagged.map((m) => m.stock_id))]);
    const notes = await listAll(db, 'return_notes', [Query.equal('$id', noteIds)]);
    const verified = after.every((s) => s.status === 'quarantined') && notes.length === noteIds.length;
    await audit(db, shop, 'verify_quarantine', { stockRows: after.length, notes: notes.length, verified }, userId, verified);
    return { quarantined: flagged.length, notes: noteIds, verified };
  },

  async dismiss({ db, shop, userId }, { matchId, reason }) {
    if (!shop) throw deny('Only a shop can review matches');
    const m = await db.getRow({ databaseId: DB, tableId: 'matches', rowId: matchId });
    if (m.shop_id !== shop) throw deny('Not your match');
    await db.updateRow({ databaseId: DB, tableId: 'matches', rowId: matchId, data: { decision: 'dismissed', decided_by: userId } });
    await audit(db, shop, 'dismiss', { matchId, tier: m.tier, reason }, userId, true);
    return { dismissed: matchId };
  },

  async markCollected({ db, isDistributor, userId }, { noteId }) {
    if (!isDistributor) throw deny('Only the distributor can mark a return collected');
    const note = await db.updateRow({ databaseId: DB, tableId: 'return_notes', rowId: noteId, data: { status: 'collected' } });
    await audit(db, note.shop_id, 'return_collected', { noteId }, userId, true);
    return { collected: noteId };
  },
};
