import { account, teams, db, call, rows, realtime, Channel, Query, DB } from './appwrite.js';
import { normBatch } from '../../core/normalize.js';

const $app = document.getElementById('app');
const state = { user: null, teams: [], role: null, matches: [], stock: new Map(), nsq: new Map(), notes: [], audit: [], stockCount: 0, open: null, busy: '' };

const TIER_COPY = {
  flag: { label: 'On the CDSCO list', tone: 'red', blurb: 'Batch, and maker or expiry, match a failed sample.' },
  collision: { label: 'Same batch code, check the strip', tone: 'amber', blurb: 'Batch numbers repeat across makers. The maker or expiry on the list does not match your record.' },
  near: { label: 'One character off', tone: 'amber', blurb: 'Your batch differs from a listed one by a look-alike character (0/O, 1/I, 5/S, 8/B).' },
  info: { label: 'Brand flagged, not your batch', tone: 'grey', blurb: 'The same product failed in another batch. No action needed.' },
};
const rupees = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const monthName = (p) => (p ? new Date(`${p}-01T00:00:00`).toLocaleString('en-IN', { month: 'short', year: 'numeric' }) : '');

// ---------- boot ----------
async function boot() {
  try {
    state.user = await account.get();
    state.teams = (await teams.list()).teams;
    state.role = state.teams.some((x) => x.$id.startsWith('shop-')) ? 'chemist' : 'distributor';
    state.shopName = state.teams.find((x) => x.$id.startsWith('shop-'))?.name;
    state.isAdmin = state.teams.some((x) => x.$id === 'admins');
    await load();
    subscribe();
  } catch {
    state.user = null;
  }
  render();
}

async function load() {
  if (state.role === 'chemist') {
    state.matches = await rows('matches', [Query.orderDesc('$createdAt'), Query.limit(200)]);
    const sIds = [...new Set(state.matches.map((m) => m.stock_id))];
    const nIds = [...new Set(state.matches.map((m) => m.nsq_id))];
    state.stock = new Map((sIds.length ? await rows('stock_items', [Query.equal('$id', sIds), Query.limit(200)]) : []).map((r) => [r.$id, r]));
    state.nsq = new Map((nIds.length ? await rows('nsq_batches', [Query.equal('$id', nIds), Query.limit(200)]) : []).map((r) => [r.$id, r]));
    state.stockCount = (await db.listRows({ databaseId: DB, tableId: 'stock_items', queries: [Query.limit(1)] })).total;
    state.alerts = await rows('alerts', [Query.orderDesc('period'), Query.limit(24)]);
  }
  state.notes = await rows('return_notes', [Query.orderDesc('$createdAt'), Query.limit(50)]);
  if (state.role === 'chemist') state.audit = await rows('audit', [Query.orderDesc('$createdAt'), Query.limit(30)]);
}

function subscribe() {
  const ch = (t) => Channel.tablesdb(DB).table(t).row();
  realtime.subscribe([ch('matches'), ch('audit'), ch('return_notes')], async (ev) => {
    const r = ev.payload;
    if (r.$tableId === 'matches' && ev.events.some((e) => e.endsWith('.create'))) {
      // A new match arrived: fetch its two sides, then animate it in.
      const [s] = await rows('stock_items', [Query.equal('$id', r.stock_id)]);
      const [n] = await rows('nsq_batches', [Query.equal('$id', r.nsq_id)]);
      if (s) state.stock.set(s.$id, s);
      if (n) state.nsq.set(n.$id, n);
      state.matches = [r, ...state.matches.filter((m) => m.$id !== r.$id)];
      state.fresh = new Set([...(state.fresh || []), r.$id]);
    } else if (r.$tableId === 'matches') {
      state.matches = state.matches.map((m) => (m.$id === r.$id ? r : m));
    } else if (r.$tableId === 'audit') {
      state.audit = [r, ...state.audit.filter((a) => a.$id !== r.$id)].slice(0, 30);
    } else if (r.$tableId === 'return_notes') {
      state.notes = [r, ...state.notes.filter((x) => x.$id !== r.$id)];
    }
    render();
  });
}

// ---------- actions ----------
async function act(label, fn) {
  state.busy = label;
  state.error = '';
  render();
  try { await fn(); } catch (e) { state.error = e.message; }
  state.busy = '';
  await load().catch(() => {});
  render();
}

const actions = {
  async login(form) {
    await act('Signing in', async () => {
      await account.createEmailPasswordSession({ email: form.email.value, password: form.password.value });
      await boot();
    });
  },
  async logout() { await account.deleteSession({ sessionId: 'current' }).catch(() => {}); location.reload(); },
  async demoStock() {
    await act('Uploading stock and running the join', async () => {
      const csv = await (await fetch('/data/demo-stock.csv')).text();
      state.last = await call('uploadStock', { csv });
    });
  },
  async uploadFile(input) {
    const file = input.files[0];
    if (!file) return;
    await act('Uploading stock and running the join', async () => { state.last = await call('uploadStock', { csv: await file.text() }); });
  },
  async ingest(select) {
    const file = select.value;
    await act('Importing the CDSCO list', async () => {
      const data = await (await fetch(`/data/${file}`)).json();
      state.last = await call('ingestAlert', { rows: data });
    });
  },
  open(id) { state.open = id; render(); },
  close() { state.open = null; render(); },
  async quarantine(ids, confirmedReview = false) {
    await act('Quarantining in one transaction', async () => {
      state.last = await call('quarantine', { matchIds: ids, confirmedReview });
      state.open = null;
    });
  },
  async dismiss(id) {
    await act('Recording your review', async () => { await call('dismiss', { matchId: id, reason: 'Pharmacist checked the strip: not the listed batch' }); state.open = null; });
  },
  async collected(id) { await act('Marking collected', () => call('markCollected', { noteId: id })); },
};
window.rj = actions;

// ---------- views ----------
function render() {
  if (!state.user) return ($app.innerHTML = loginView());
  $app.innerHTML = `
    ${header()}
    ${state.error ? `<div class="toast error">${esc(state.error)}</div>` : ''}
    ${state.busy ? `<div class="toast">${esc(state.busy)}…</div>` : ''}
    <main class="${state.role}">${state.role === 'chemist' ? chemistView() : distributorView()}</main>
    ${state.open ? detailView(state.matches.find((m) => m.$id === state.open)) : ''}`;
  state.fresh = new Set();
}

function loginView() {
  return `<section class="login">
    <div class="login-card">
      <p class="eyebrow">Recall Join</p>
      <h1>Every month CDSCO lists the batches that failed.<br/><em>Is one of them on your shelf?</em></h1>
      <form onsubmit="event.preventDefault(); rj.login(this)">
        <label>Email<input name="email" type="email" required placeholder="chemist@recalljoin.demo" /></label>
        <label>Password<input name="password" type="password" required /></label>
        <button class="primary">${state.busy ? 'Signing in…' : 'Sign in'}</button>
        ${state.error ? `<p class="err">${esc(state.error)}</p>` : ''}
      </form>
      <p class="fine">Demo accounts: a chemist shop and its distributor. Stock data in the demo is synthetic; the regulator lists are real.</p>
    </div>
  </section>`;
}

function header() {
  return `<header class="top">
    <div class="brand"><span class="cross">✚</span> Recall Join</div>
    <div class="who">${esc(state.shopName || state.teams[0]?.name || state.user.name)} <button class="link" onclick="rj.logout()">Sign out</button></div>
  </header>`;
}

function chemistView() {
  const live = state.matches.filter((m) => m.decision === 'pending');
  const flags = live.filter((m) => m.tier === 'flag');
  const reviews = live.filter((m) => m.tier === 'collision' || m.tier === 'near');
  const info = live.filter((m) => m.tier === 'info');
  const value = flags.reduce((a, m) => a + (m.value || 0), 0);
  const strips = flags.reduce((a, m) => a + (state.stock.get(m.stock_id)?.qty || 0), 0);
  const months = (state.alerts || []).map((a) => `${monthName(a.period)} (${a.source})`).join(', ');
  return `
    <section class="hero ${flags.length ? 'alarm' : 'calm'}">
      <div>
        <p class="eyebrow">Your shelf vs. ${state.alerts?.length || 0} CDSCO list${state.alerts?.length === 1 ? '' : 's'}</p>
        <h1>${flags.length ? `${flags.length} batch${flags.length > 1 ? 'es' : ''} on your shelf ${flags.length > 1 ? 'are' : 'is'} on the CDSCO list` : 'No listed batch found on your shelf'}</h1>
        <p class="sub">${flags.length ? `${strips} units · ${rupees(value)} at MRP` : 'Checked against every list below. This is not a safety certificate: only listed batches are checked.'}</p>
      </div>
      ${flags.length ? `<button class="primary big" onclick="rj.quarantine(${esc(JSON.stringify(flags.map((m) => m.$id)))})">Quarantine all ${flags.length} &amp; raise returns</button>` : ''}
    </section>
    <div class="grid">
      <section class="feed">
        ${group('Act now', flags)}
        ${group('Check the strip', reviews)}
        ${group('For your information', info)}
        ${!live.length ? `<p class="empty">Nothing pending. ${state.stockCount ? `${state.stockCount} stock rows are being watched.` : 'Upload your stock to start.'}</p>` : ''}
        ${done()}
      </section>
      <aside>
        <div class="panel">
          <h3>Stock</h3>
          <p class="muted">${state.stockCount} batch rows on file. Upload a billing-software export (CSV with Item, Batch, Expiry, Company, Qty, MRP, Party).</p>
          <label class="file">Upload CSV<input type="file" accept=".csv" onchange="rj.uploadFile(this)" /></label>
          <button class="ghost" onclick="rj.demoStock()">Use demo stock (synthetic)</button>
        </div>
        ${state.isAdmin ? `<div class="panel demo">
          <h3>Demo controls</h3>
          <p class="muted">Import a real CDSCO list. The join re-runs for every shop and new matches arrive over Realtime.</p>
          <select id="ingest">${(window.RJ_LISTS || []).map((f) => `<option value="${f.file}">${esc(f.label)}</option>`).join('')}</select>
          <button class="ghost" onclick="rj.ingest(document.getElementById('ingest'))">Import list</button>
        </div>` : ''}
        <div class="panel">
          <h3>Lists checked</h3>
          <p class="muted small">${esc(months) || 'None yet'}</p>
        </div>
        <div class="panel audit">
          <h3>Audit trail</h3>
          <ol>${state.audit.map(auditItem).join('')}</ol>
        </div>
      </aside>
    </div>`;
}

function group(title, list) {
  if (!list.length) return '';
  return `<h2 class="group">${title} <span>${list.length}</span></h2><ul class="cards">${list.map(card).join('')}</ul>`;
}

function card(m) {
  const s = state.stock.get(m.stock_id) || {}, n = state.nsq.get(m.nsq_id) || {};
  const t = TIER_COPY[m.tier];
  return `<li class="card ${t.tone} ${state.fresh?.has(m.$id) ? 'fresh' : ''}" onclick="rj.open('${m.$id}')">
    <span class="stamp">${t.label}</span>
    <strong>${esc(s.product)}</strong>
    <span class="batch">${esc(s.batch)}</span>
    <span class="meta">${s.qty ?? 0} units · ${rupees(m.value)} · ${esc(n.result || '').slice(0, 60)}</span>
  </li>`;
}

function done() {
  const closed = state.matches.filter((m) => m.decision !== 'pending');
  if (!closed.length) return '';
  return `<h2 class="group">Handled <span>${closed.length}</span></h2><ul class="cards handled">${closed.map((m) => {
    const s = state.stock.get(m.stock_id) || {};
    return `<li class="card done"><span class="stamp">${m.decision === 'quarantined' ? 'Quarantined' : 'Dismissed after review'}</span><strong>${esc(s.product)}</strong><span class="batch">${esc(s.batch)}</span></li>`;
  }).join('')}</ul>`;
}

// Character-level view of the two batch numbers, so the pharmacist sees the 0/O.
function batchDiff(a, b) {
  const A = normBatch(a), B = normBatch(b);
  if (A.length !== B.length) return `<span class="batch">${esc(a)}</span>`;
  return `<span class="batch">${[...A].map((c, i) => (c === B[i] ? esc(c) : `<mark>${esc(c)}</mark>`)).join('')}</span>`;
}

function detailView(m) {
  if (!m) return '';
  const s = state.stock.get(m.stock_id) || {}, n = state.nsq.get(m.nsq_id) || {};
  const r = JSON.parse(m.reasons || '{}');
  const t = TIER_COPY[m.tier];
  const chip = (label, v) => `<span class="chip ${v === 'exact' || v === 'match' ? 'yes' : v === 'unknown' ? 'maybe' : 'no'}">${label}: ${esc(v)}</span>`;
  return `<div class="scrim" onclick="rj.close()"></div>
  <section class="detail ${t.tone}" role="dialog" aria-label="Match detail">
    <button class="close" onclick="rj.close()" aria-label="Close">×</button>
    <span class="stamp">${t.label}</span>
    <p class="muted">${t.blurb}</p>
    <div class="compare">
      <div><h4>CDSCO list · ${esc(monthName(n.period))} · ${esc(n.lab)}</h4>
        <dl><dt>Product</dt><dd>${esc(n.product)}</dd><dt>Batch</dt><dd>${batchDiff(n.batch, s.batch)}</dd><dt>Maker</dt><dd>${esc(n.mfr)}</dd><dt>Expiry</dt><dd>${esc(n.expiry)}</dd><dt>Failed test</dt><dd class="fail">${esc(n.result)}</dd></dl></div>
      <div><h4>Your shelf</h4>
        <dl><dt>Product</dt><dd>${esc(s.product)}</dd><dt>Batch</dt><dd>${batchDiff(s.batch, n.batch)}</dd><dt>Maker</dt><dd>${esc(s.mfr)}</dd><dt>Expiry</dt><dd>${esc(s.expiry)}</dd><dt>Units</dt><dd>${s.qty} · ${rupees(m.value)} · from ${esc(s.supplier)}</dd></dl></div>
    </div>
    <div class="chips">${chip('Batch', r.batch)}${r.mfr ? chip('Maker', r.mfr) : ''}${r.expiry ? chip('Expiry', r.expiry) : ''}<span class="chip maybe">Name similarity: ${Math.round((r.product || 0) * 100)}%</span></div>
    <p class="fine">Name similarity is shown for context only. A flag always needs the batch plus the maker or expiry to agree.</p>
    <div class="actions">${m.decision !== 'pending' ? `<p>Already ${m.decision}.</p>`
      : m.tier === 'flag' ? `<button class="primary" onclick="rj.quarantine(['${m.$id}'])">Quarantine &amp; raise return</button>`
      : m.tier === 'info' ? `<button class="ghost" onclick="rj.dismiss('${m.$id}')">Got it</button>`
      : `<button class="ghost" onclick="rj.dismiss('${m.$id}')">Not the same batch</button><button class="primary" onclick="rj.quarantine(['${m.$id}'], true)">I checked the strip: it is the listed batch</button>`}
    </div>
    <p class="fine">Don't stop a prescribed medicine on your own. Patients should ask their doctor or pharmacist.</p>
  </section>`;
}

function auditItem(a) {
  const d = JSON.parse(a.detail || '{}');
  const text = {
    stock_upload: `Stock uploaded: ${d.rows} rows`,
    join: `Join ran: ${d.stock} stock rows → ${d.counts?.flag ?? 0} flag, ${(d.counts?.collision ?? 0) + (d.counts?.near ?? 0)} review, ${d.counts?.info ?? 0} info`,
    quarantine: `Quarantine committed (${d.matches?.length} batch${d.matches?.length > 1 ? 'es' : ''}, ${d.notes?.length} return note${d.notes?.length > 1 ? 's' : ''})`,
    verify_quarantine: d.verified ? 'Read-back check: stock blocked, return notes present' : 'Read-back check FAILED',
    dismiss: 'Review closed: not the listed batch',
    return_collected: 'Distributor collected a return',
  }[a.action] || a.action;
  return `<li class="${a.verified ? 'ok' : ''}"><time>${new Date(a.$createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</time>${esc(text)}${a.verified ? ' <span class="tick">✓ verified</span>' : ''}</li>`;
}

function distributorView() {
  return `<section class="hero calm"><div><p class="eyebrow">Returns raised by your retailers</p><h1>${(() => { const k = state.notes.filter((n) => n.status === 'open').length; return `${k} open return note${k === 1 ? '' : 's'}`; })()}</h1><p class="sub">You only see notes addressed to you.</p></div></section>
  <ul class="notes">${state.notes.map((n) => {
    const items = JSON.parse(n.items || '[]');
    return `<li class="note ${n.status}">
      <header><strong>${esc(n.shop_name)}</strong><span class="stamp">${n.status}</span></header>
      <table><thead><tr><th>Product</th><th>Batch</th><th>Units</th><th>Value</th><th>Reason (CDSCO)</th></tr></thead><tbody>
      ${items.map((i) => `<tr><td>${esc(i.product)}</td><td class="batch">${esc(i.batch)}</td><td>${i.qty}</td><td>${rupees(i.value)}</td><td>${esc(i.reason)} · ${esc(monthName(i.period))}</td></tr>`).join('')}
      </tbody></table>
      <footer><span>${rupees(n.total_value)} to credit</span>${n.status === 'open' ? `<button class="primary" onclick="rj.collected('${n.$id}')">Mark collected</button>` : ''}</footer>
    </li>`;
  }).join('') || '<p class="empty">No returns yet.</p>'}</ul>`;
}

fetch('/data/lists.json').then((r) => r.json()).then((l) => { window.RJ_LISTS = l; render(); }).catch(() => {});
if (new URLSearchParams(location.search).has('mock')) import('./mock.js').then(async (m) => { await m.mockState(state); render(); });
else boot();
