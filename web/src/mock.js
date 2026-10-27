// Design preview without a backend: open /?mock. Builds the same state the
// real app gets from TablesDB, using the core matcher on the bundled demo data.
import { stockFromCsv } from '../../core/csv.js';
import { matchStock } from '../../core/match.js';

export async function mockState(state) {
  const csv = await (await fetch('/data/demo-stock.csv')).text();
  const nsq = await (await fetch('/data/2025-03-central.json')).json();
  const stock = stockFromCsv(csv).map((s, i) => ({ ...s, $id: `s${i}` }));
  const nsqRows = nsq.map((n, i) => ({ ...n, $id: `n${i}` }));
  const m = matchStock(stock.map((s) => ({ ...s, id: s.$id })), nsqRows);
  Object.assign(state, {
    user: { name: 'Demo Chemist' }, role: new URLSearchParams(location.search).get('mock') === 'dist' ? 'distributor' : 'chemist',
    shopName: 'Maa Tarini Medical Store (demo)', isAdmin: true, stockCount: stock.length,
    teams: [{ $id: 'shop-demo', name: 'Maa Tarini Medical Store (demo)' }],
    alerts: [{ period: '2025-03', source: 'central' }],
    stock: new Map(stock.map((s) => [s.$id, s])), nsq: new Map(nsqRows.map((n) => [n.$id, n])),
    matches: m.map((x, i) => ({ $id: `m${i}`, stock_id: x.stock.$id, nsq_id: x.nsq.$id, tier: x.tier, reasons: JSON.stringify(x.reasons), decision: 'pending', value: x.stock.qty * x.stock.mrp })),
    notes: [{ $id: 'r1', shop_name: 'Maa Tarini Medical Store (demo)', status: 'open', total_value: 1252, items: JSON.stringify([{ product: 'PANTOSHANG-40 TAB', batch: 'sp240165', qty: 40, value: 740, reason: 'Dissolution (Buffer Stage)', period: '2025-03' }, { product: 'VITAMIN C', batch: 'CP-937', qty: 25, value: 240, reason: 'Particulate Matter and Description', period: '2025-03' }]) }],
    audit: [
      { $id: 'a3', action: 'join', verified: true, $createdAt: new Date().toISOString(), detail: JSON.stringify({ stock: stock.length, counts: { flag: 3, collision: 1, near: 1, info: 1 } }) },
      { $id: 'a2', action: 'stock_upload', verified: true, $createdAt: new Date(Date.now() - 6e4).toISOString(), detail: JSON.stringify({ rows: stock.length }) },
    ],
  });
}
