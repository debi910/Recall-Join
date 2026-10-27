// Design preview without a backend: open /?mock (chemist), /?mock=dist, /?mock=login.
// Builds the same state the real app gets from TablesDB, using the core matcher on bundled data.
import { stockFromCsv } from '../../core/csv.js';
import { matchStock } from '../../core/match.js';
import { reasonCategory } from '../../core/reasons.js';

export async function mockState(state) {
  const mode = new URLSearchParams(location.search).get('mock');
  if (mode === 'login') return;
  const csv = await (await fetch('/data/demo-stock.csv')).text();
  const nsq = (await Promise.all(['2026-07', '2026-08', '2026-09'].map((p) => fetch(`/data/${p}.json`).then((r) => r.json())))).flat();
  const stock = stockFromCsv(csv).map((s, i) => ({ ...s, $id: `s${i}`, id: `s${i}` }));
  const nsqRows = nsq.map((n, i) => ({ ...n, $id: `n${i}` }));
  const m = matchStock(stock, nsqRows);
  const reasons = {};
  for (const n of nsq) reasons[reasonCategory(n.result)] = (reasons[reasonCategory(n.result)] || 0) + 1;
  const count = (p, s) => nsq.filter((n) => n.period === p && n.source === s).length;
  const ago = (min) => new Date(Date.now() - min * 6e4).toISOString();
  Object.assign(state, {
    user: { name: 'Demo' }, role: mode === 'dist' ? 'distributor' : 'chemist', live: true,
    shopName: mode === 'dist' ? 'Kalinga Pharma Distributors (demo)' : 'Maa Tarini Medical Store (demo)', isAdmin: true, stockCount: stock.length,
    alerts: ['2026-07', '2026-08', '2026-09'].flatMap((p) => ['central', 'state'].map((s) => ({ period: p, source: s, rows_count: count(p, s) }))),
    reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]),
    stock: new Map(stock.map((s) => [s.$id, s])), nsq: new Map(nsqRows.map((n) => [n.$id, n])),
    matches: m.map((x, i) => ({ $id: `m${i}`, stock_id: x.stock.$id, nsq_id: x.nsq.$id, tier: x.tier, period: x.nsq.period, reasons: JSON.stringify(x.reasons), decision: 'pending', value: x.stock.qty * x.stock.mrp })),
    notes: [
      { $id: 'r1', shop_name: 'Maa Tarini Medical Store (demo)', status: 'open', total_value: 980, items: JSON.stringify([{ product: 'AQUA P MOL 125 60 ML', batch: 'pamla002', qty: 40, value: 740, reason: 'The sample does not conform to IP in respect of content of Paracetamol.', period: '2026-09' }, { product: 'TALGESIC', batch: 'BUP324004', qty: 25, value: 240, reason: 'Particulate matter', period: '2026-09' }]) },
      { $id: 'r2', shop_name: 'Sai Medicals, Cuttack (demo)', status: 'collected', total_value: 1740, items: JSON.stringify([{ product: 'LOFNEC TABLETS', batch: 'LOF 26002', qty: 12, value: 1740, reason: 'Dissolution', period: '2026-09' }]) },
    ],
    audit: [
      { $id: 'a3', action: 'join', verified: true, $createdAt: ago(1), detail: JSON.stringify({ stock: stock.length, counts: { flag: 3, collision: 1, near: 1, info: 1 } }) },
      { $id: 'a2', action: 'stock_upload', verified: true, $createdAt: ago(2), detail: JSON.stringify({ rows: stock.length }) },
      { $id: 'a1', action: 'verify_quarantine', verified: true, $createdAt: ago(60), detail: JSON.stringify({ verified: true }) },
    ],
  });
}
