import { html, svg, render as litRender, nothing } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { classMap } from 'lit-html/directives/class-map.js';
import { account, teams, db, call, rows, realtime, Channel, Query, DB } from './appwrite.js';
import { normBatch } from '../../core/normalize.js';
import { reasonCategory } from '../../core/reasons.js';
import { toast, toaster } from './toast.js';
import { holdButton } from './hold.js';
import { joinGraphic } from './join-graphic.js';

const $app = document.getElementById('app');
const state = {
  user: null, role: null, teams: [], shopName: '', isAdmin: false,
  matches: [], stock: new Map(), nsq: new Map(), notes: [], audit: [], alerts: [], stockCount: 0,
  open: null, busy: '', firstPaint: true, arrived: new Set(), live: false,
};

const TIER = {
  flag: { label: 'On the CDSCO list', tone: 'red', blurb: 'The batch, and the maker or expiry, match a sample that failed a government lab test.' },
  collision: { label: 'Same batch code', tone: 'amber', blurb: 'Batch codes repeat across makers. The listed maker or expiry does not match your record. Check the strip.' },
  near: { label: 'One character off', tone: 'amber', blurb: 'Your batch differs from a listed batch by one look-alike character (0/O, 1/I, 5/S, 8/B). Check the strip.' },
  info: { label: 'Brand flagged, not your batch', tone: 'grey', blurb: 'The same product failed in a different batch. No action needed.' },
};
const rupees = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const month = (p) => (p ? new Date(`${p}-01T00:00:00`).toLocaleString('en-IN', { month: 'short', year: 'numeric' }) : '');
const short = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s ?? '');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- data
async function boot() {
  try {
    state.user = await account.get();
    state.teams = (await teams.list()).teams;
    const shop = state.teams.find((t) => t.$id.startsWith('shop-'));
    state.role = shop ? 'chemist' : 'distributor';
    state.shopName = shop?.name || state.teams[0]?.name || '';
    state.isAdmin = state.teams.some((t) => t.$id === 'admins');
    await load();
    subscribe();
  } catch {
    state.user = null;
  }
  paint();
}

async function load() {
  if (state.role === 'chemist') {
    state.matches = await rows('matches', [Query.orderDesc('$createdAt'), Query.limit(200)]);
    const sIds = [...new Set(state.matches.map((m) => m.stock_id))];
    const nIds = [...new Set(state.matches.map((m) => m.nsq_id))];
    if (sIds.length) for (const r of await rows('stock_items', [Query.equal('$id', sIds), Query.limit(200)])) state.stock.set(r.$id, r);
    if (nIds.length) for (const r of await rows('nsq_batches', [Query.equal('$id', nIds), Query.limit(200)])) state.nsq.set(r.$id, r);
    state.stockCount = (await db.listRows({ databaseId: DB, tableId: 'stock_items', queries: [Query.limit(1)] })).total;
    state.alerts = await rows('alerts', [Query.orderDesc('period'), Query.limit(24)]);
    state.audit = await rows('audit', [Query.orderDesc('$createdAt'), Query.limit(30)]);
    state.reasons = await reasonStats();
  }
  state.notes = await rows('return_notes', [Query.orderDesc('$createdAt'), Query.limit(50)]);
}

// Failure reasons across every imported list, read straight from TablesDB.
async function reasonStats() {
  const counts = {};
  let cursor;
  for (;;) {
    const page = await rows('nsq_batches', [Query.select(['$id', 'result']), Query.limit(500), ...(cursor ? [Query.cursorAfter(cursor)] : [])]);
    for (const r of page) counts[reasonCategory(r.result)] = (counts[reasonCategory(r.result)] || 0) + 1;
    if (page.length < 500) break;
    cursor = page.at(-1).$id;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function subscribe() {
  const ch = (t) => Channel.tablesdb(DB).table(t).row();
  realtime.subscribe([ch('matches'), ch('audit'), ch('return_notes')], async (ev) => {
    const r = ev.payload;
    const created = ev.events.some((e) => e.endsWith('.create'));
    if (r.$tableId === 'matches' && created) {
      const [[s], [n]] = await Promise.all([rows('stock_items', [Query.equal('$id', r.stock_id)]), rows('nsq_batches', [Query.equal('$id', r.nsq_id)])]);
      if (s) state.stock.set(s.$id, s);
      if (n) state.nsq.set(n.$id, n);
      state.matches = [r, ...state.matches.filter((m) => m.$id !== r.$id)];
      state.arrived.add(r.$id);
      if (r.tier === 'flag') toast(`New: ${short(s?.product, 28)} is on the ${month(r.period)} list`, 'red');
    } else if (r.$tableId === 'matches') {
      state.matches = state.matches.map((m) => (m.$id === r.$id ? r : m));
    } else if (r.$tableId === 'audit') {
      state.audit = [r, ...state.audit.filter((a) => a.$id !== r.$id)].slice(0, 30);
    } else if (r.$tableId === 'return_notes') {
      state.notes = [r, ...state.notes.filter((x) => x.$id !== r.$id)];
      if (created && state.role === 'distributor') toast(`New return note from ${r.shop_name}`, 'amber');
    }
    paint();
  });
  state.live = true;
}

// ---------------------------------------------------------------- actions
async function act(label, fn, done) {
  state.busy = label;
  paint();
  try {
    const out = await fn();
    if (done) toast(typeof done === 'function' ? done(out) : done, 'green');
  } catch (e) {
    toast(e.message, 'error');
  }
  state.busy = '';
  await load().catch(() => {});
  paint();
}

const A = {
  async login(e) {
    e.preventDefault();
    const f = e.target;
    await act('Signing in', async () => {
      await account.createEmailPasswordSession({ email: f.email.value, password: f.password.value });
      await boot();
    });
  },
  demo(email) {
    const f = document.querySelector('.login form');
    f.email.value = email;
    f.password.focus();
  },
  async logout() { await account.deleteSession({ sessionId: 'current' }).catch(() => {}); location.reload(); },
  demoStock: () => act('Uploading stock and running the join', async () => call('uploadStock', { csv: await (await fetch('/data/demo-stock.csv')).text() }),
    (o) => `${o.uploaded} rows uploaded · ${o.join.counts.flag} on the list`),
  async upload(e) {
    const file = e.target.files[0];
    if (file) await act('Uploading stock and running the join', async () => call('uploadStock', { csv: await file.text() }), (o) => `${o.uploaded} rows uploaded · ${o.join.counts.flag} on the list`);
  },
  ingest: () => act('Importing the CDSCO list and re-running the join', () => call('ingestAlert', { period: document.getElementById('ingest').value }),
    (o) => `Join re-ran for ${o.shops} shop${o.shops === 1 ? '' : 's'}`),
  open(id) { state.open = id; paint(); },
  close() { state.open = null; paint(); },
  quarantine: (ids, confirmedReview = false) => act('Quarantining in one transaction', async () => {
    const out = await call('quarantine', { matchIds: ids, confirmedReview });
    state.open = null;
    return out;
  }, (o) => `${o.quarantined} batch${o.quarantined === 1 ? '' : 'es'} quarantined${o.verified ? ' · verified' : ''}`),
  dismiss: (id) => act('Recording your review', async () => { await call('dismiss', { matchId: id, reason: 'Pharmacist checked the strip: not the listed batch' }); state.open = null; }, 'Marked as not the listed batch'),
  collected: (id) => act('Marking collected', () => call('markCollected', { noteId: id }), 'Return marked collected'),
};
addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.open) A.close(); });

// ---------------------------------------------------------------- views
function paint() {
  litRender(state.user ? appView() : loginView(), $app);
  state.firstPaint = false;
  state.arrived = new Set();
}

function loginView() {
  return html`<section class="login">
    <div class="login-story">
      <div class="logo-row">${logo()}<span>Recall Join</span></div>
      <h1>Every month the regulator lists the medicine batches that failed.<br /><em>Is one of them on your shelf?</em></h1>
      <p>Recall Join checks a chemist's whole stock against every CDSCO list, flags only what truly matches, and runs the quarantine and the return in one step.</p>
      <div class="login-graphic">${joinGraphic({ left: 18, right: 14, links: [[2, 3, 'red'], [7, 9, 'red'], [11, 5, 'amber'], [15, 12, 'red']], animate: !reduceMotion })}</div>
      <dl class="login-facts">
        <div><dt>739</dt><dd>failed batches, Jul–Sep 2026</dd></div>
        <div><dt>7%</dt><dd>have a batch code of 4 characters or fewer</dd></div>
        <div><dt>1</dt><dd>transaction to quarantine and raise the return</dd></div>
      </dl>
    </div>
    <div class="login-card">
      <h2>Sign in</h2>
      <form @submit=${A.login}>
        <label>Email<input name="email" type="email" required autocomplete="username" /></label>
        <label>Password<input name="password" type="password" required autocomplete="current-password" /></label>
        <button class="btn primary" ?disabled=${!!state.busy}>${state.busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div class="demo-accounts">
        <p>Demo accounts</p>
        <button class="btn ghost" @click=${() => A.demo('chemist@recalljoin.demo')}>Chemist shop</button>
        <button class="btn ghost" @click=${() => A.demo('distributor@recalljoin.demo')}>Distributor</button>
      </div>
      <p class="fine">Regulator lists are real (CDSCO, Jul–Sep 2026). Shop stock in the demo is synthetic.</p>
    </div>
    ${toaster()}
  </section>`;
}

function logo() {
  return svg`<svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
    <rect x="3" y="7" width="16" height="18" rx="4" fill="var(--green)" />
    <rect x="13" y="7" width="16" height="18" rx="4" fill="var(--red)" opacity="0.85" />
    <path d="M16 12v8M12 16h8" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />
  </svg>`;
}

function appView() {
  return html`
    <header class="top">
      <div class="brand">${logo()}<span>Recall Join</span></div>
      <div class="who">
        ${state.live ? html`<span class="live"><i></i>Live</span>` : nothing}
        <span class="shop">${state.shopName}</span>
        <button class="btn link" @click=${A.logout}>Sign out</button>
      </div>
    </header>
    <main class=${state.role}>${state.role === 'chemist' ? chemistView() : distributorView()}</main>
    ${state.open ? drawer(state.matches.find((m) => m.$id === state.open)) : nothing}
    ${state.busy ? html`<div class="busy" role="status"><span class="spinner"></span>${state.busy}…</div>` : nothing}
    ${toaster()}`;
}

function chemistView() {
  const live = state.matches.filter((m) => m.decision === 'pending');
  const by = (t) => live.filter((m) => m.tier === t);
  const flags = by('flag'), reviews = [...by('collision'), ...by('near')], info = by('info');
  const value = flags.reduce((a, m) => a + (m.value || 0), 0);
  const units = flags.reduce((a, m) => a + (state.stock.get(m.stock_id)?.qty || 0), 0);
  const nsqTotal = state.alerts.reduce((a, l) => a + (l.rows_count || 0), 0);
  const periods = new Set(state.alerts.map((a) => a.period)).size;

  return html`
    <section class=${classMap({ hero: true, alarm: flags.length > 0, calm: !flags.length })}>
      <div class="hero-copy">
        <p class="eyebrow">Your shelf × ${periods} month${periods === 1 ? '' : 's'} of CDSCO lists · ${nsqTotal.toLocaleString('en-IN')} failed batches</p>
        <h1>${flags.length
          ? html`<span class="count">${flags.length}</span> batch${flags.length > 1 ? 'es' : ''} on your shelf ${flags.length > 1 ? 'are' : 'is'} on the CDSCO list`
          : state.stockCount ? 'No listed batch found on your shelf' : 'Upload your stock to run the join'}</h1>
        <p class="sub">${flags.length
          ? `${units} units · ${rupees(value)} at MRP · ${reviews.length} more to check`
          : 'Only listed batches are checked. This is not a safety certificate.'}</p>
        ${flags.length ? holdButton({ label: `Hold to quarantine all ${flags.length}`, done: 'Quarantining…', onConfirm: () => A.quarantine(flags.map((m) => m.$id)) }) : nothing}
      </div>
      <figure class="hero-graphic" aria-label="Join between the CDSCO lists and your shelf">
        ${joinGraphic({
          left: 16, right: 16, animate: state.firstPaint && !reduceMotion,
          links: [...flags.map(() => 'red'), ...reviews.map(() => 'amber'), ...info.map(() => 'grey')].slice(0, 10).map((tone, i) => [(i * 5 + 2) % 16, (i * 7 + 3) % 16, tone]),
          leftLabel: 'CDSCO lists', rightLabel: 'Your shelf',
        })}
      </figure>
    </section>

    ${shelfStrip(flags.length, reviews.length, info.length)}

    <div class="grid">
      <section class="feed">
        ${group('Act now', flags, 'Pull these from the shelf.')}
        ${group('Check the strip', reviews, 'Likely matches that need a human look.')}
        ${group('For your information', info)}
        ${!live.length && state.stockCount ? html`<div class="empty">${emptyArt()}<p>Nothing pending. ${state.stockCount} stock rows are watched against every new list.</p></div>` : nothing}
        ${handled()}
      </section>
      <aside>
        ${listsChart()}
        ${reasonsChart()}
        <div class="panel">
          <h3>Stock</h3>
          <p class="muted">${state.stockCount} batch rows on file. Upload a billing-software export (Item, Batch, Expiry, Company, Qty, MRP, Party).</p>
          <div class="row">
            <label class="btn ghost file">Upload CSV<input type="file" accept=".csv" @change=${A.upload} /></label>
            <button class="btn ghost" @click=${A.demoStock}>Use demo stock</button>
          </div>
        </div>
        ${state.isAdmin ? html`<div class="panel demo">
          <h3>Demo controls</h3>
          <p class="muted">Import a real CDSCO list. The join re-runs for every shop and new matches arrive over Realtime.</p>
          <div class="row">
            <select id="ingest"><option value="2026-09">Sep 2026 · 300 batches</option><option value="2026-08">Aug 2026 · 200 batches</option><option value="2026-07">Jul 2026 · 239 batches</option></select>
            <button class="btn ghost" @click=${A.ingest}>Import</button>
          </div>
        </div>` : nothing}
        ${auditTimeline()}
      </aside>
    </div>`;
}

// One tick per stock row (capped): the whole shelf at a glance.
function shelfStrip(f, r, i) {
  const total = Math.max(state.stockCount, f + r + i);
  if (!total) return nothing;
  const ticks = Math.min(total, 160);
  const scale = ticks / total;
  const cut = [Math.max(f ? 1 : 0, Math.round(f * scale)), Math.max(r ? 1 : 0, Math.round(r * scale)), Math.max(i ? 1 : 0, Math.round(i * scale))];
  const toneAt = (k) => (k < cut[0] ? 'red' : k < cut[0] + cut[1] ? 'amber' : k < cut[0] + cut[1] + cut[2] ? 'grey' : 'clear');
  // Scatter the coloured ticks so the strip reads like a shelf scan, not a bar chart.
  const slot = Array.from({ length: ticks }, (_, k) => (k * 37) % ticks);
  return html`<section class="strip" aria-label="Shelf scan">
    <div class="strip-ticks">${slot.map((pos, k) => html`<i class=${toneAt(slot.indexOf(k))} style="--d:${(k % 40) * 8}ms"></i>`)}</div>
    <div class="strip-legend">
      <span><b class="red"></b>${f} on the list</span><span><b class="amber"></b>${r} to check</span><span><b class="grey"></b>${i} brand flagged</span>
      <span><b class="clear"></b>${Math.max(total - f - r - i, 0)} not on any imported list</span>
    </div>
  </section>`;
}

function group(title, list, hint) {
  if (!list.length) return nothing;
  return html`<h2 class="group">${title}<span class="pill">${list.length}</span>${hint ? html`<small>${hint}</small>` : nothing}</h2>
    <ul class="cards">${repeat(list, (m) => m.$id, (m, i) => card(m, i))}</ul>`;
}

function card(m, i) {
  const s = state.stock.get(m.stock_id) || {}, n = state.nsq.get(m.nsq_id) || {};
  const t = TIER[m.tier];
  return html`<li class=${classMap({ card: true, [t.tone]: true, stagger: state.firstPaint, arrived: state.arrived.has(m.$id) })} style="--i:${i}">
    <button class="card-hit" @click=${() => A.open(m.$id)} aria-label="Open ${s.product}"></button>
    <span class="stamp">${t.label}</span>
    <strong class="product">${s.product}</strong>
    <span class="batch">${s.batch}</span>
    <span class="meta">${s.qty ?? 0} units · ${rupees(m.value)} · ${reasonCategory(n.result)} · ${month(n.period)}</span>
    <svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" /></svg>
  </li>`;
}

function handled() {
  const closed = state.matches.filter((m) => m.decision !== 'pending');
  if (!closed.length) return nothing;
  return html`<h2 class="group">Handled<span class="pill">${closed.length}</span></h2>
    <ul class="cards handled">${repeat(closed, (m) => m.$id, (m) => {
      const s = state.stock.get(m.stock_id) || {};
      return html`<li class="card done"><span class="stamp">${m.decision === 'quarantined' ? 'Quarantined' : 'Dismissed after review'}</span><strong class="product">${s.product}</strong><span class="batch">${s.batch}</span></li>`;
    })}</ul>`;
}

function listsChart() {
  const lists = [...Map.groupBy(state.alerts, (a) => a.period)].sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  if (!lists.length) return html`<div class="panel"><h3>Lists checked</h3><p class="muted">None imported yet.</p></div>`;
  const max = Math.max(...lists.map(([, l]) => l.reduce((a, x) => a + x.rows_count, 0)));
  return html`<div class="panel">
    <h3>Lists checked</h3>
    <div class="bars" role="img" aria-label="Failed batches per month">
      ${lists.map(([p, l], i) => {
        const c = l.find((x) => x.source === 'central')?.rows_count || 0, st = l.find((x) => x.source === 'state')?.rows_count || 0;
        return html`<div class="bar" style="--i:${i}"><b>${c + st}</b><div class="bar-stack" style="--h:${((c + st) / max) * 100}%">
          <span class="seg state" style="flex:${st}" title="${st} from state labs"></span><span class="seg central" style="flex:${c}" title="${c} from CDSCO labs"></span>
        </div><small>${month(p)}</small></div>`;
      })}
    </div>
    <p class="legend"><span><b class="central"></b>CDSCO labs</span><span><b class="state"></b>State labs</span></p>
  </div>`;
}

function reasonsChart() {
  if (!state.reasons?.length) return nothing;
  const max = state.reasons[0][1];
  return html`<div class="panel">
    <h3>Why batches failed</h3>
    <ul class="hbars">${state.reasons.slice(0, 6).map(([k, v], i) => html`<li style="--w:${(v / max) * 100}%;--i:${i}"><span>${k}</span><b>${v}</b><i></i></li>`)}</ul>
  </div>`;
}

function auditTimeline() {
  return html`<div class="panel">
    <h3>Audit trail</h3>
    <ol class="timeline">${repeat(state.audit, (a) => a.$id, (a) => {
      const d = JSON.parse(a.detail || '{}');
      const text = {
        stock_upload: `Stock uploaded: ${d.rows} rows`,
        join: `Join ran: ${d.stock} rows → ${d.counts?.flag ?? 0} flagged, ${(d.counts?.collision ?? 0) + (d.counts?.near ?? 0)} to check`,
        quarantine: `Quarantine committed: ${d.matches?.length} batch${d.matches?.length === 1 ? '' : 'es'}, ${d.notes?.length} return note${d.notes?.length === 1 ? '' : 's'}`,
        verify_quarantine: d.verified ? 'Read-back check passed' : 'Read-back check FAILED',
        dismiss: 'Review closed: not the listed batch',
        return_collected: 'Distributor collected a return',
      }[a.action] || a.action;
      return html`<li class=${a.verified ? 'ok' : ''}><time>${new Date(a.$createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</time><span>${text}</span>${a.verified ? html`<em>verified</em>` : nothing}</li>`;
    })}</ol>
  </div>`;
}

// Each character is a tile; tiles that differ between the two batches light up.
function batchTiles(a, other) {
  const X = normBatch(a), Y = normBatch(other);
  const same = X.length === Y.length;
  return html`<span class="tiles" aria-label=${a}>${[...X].map((c, i) => html`<span class=${classMap({ tile: true, diff: same && c !== Y[i] })} style="--i:${i}">${c}</span>`)}</span>`;
}

function drawer(m) {
  if (!m) return nothing;
  const s = state.stock.get(m.stock_id) || {}, n = state.nsq.get(m.nsq_id) || {};
  const r = JSON.parse(m.reasons || '{}');
  const t = TIER[m.tier];
  const ok = (v) => v === 'exact' || v === 'match';
  const unsure = (v) => v === 'unknown' || v === 'confusable';
  const check = (label, v) => html`<li class=${ok(v) ? 'yes' : unsure(v) ? 'maybe' : 'no'}>
    <svg viewBox="0 0 16 16" aria-hidden="true">${ok(v) ? svg`<path d="M3.5 8.5l3 3 6-7" />` : unsure(v) ? svg`<path d="M8 4v5M8 11.5v.5" />` : svg`<path d="M4 4l8 8M12 4l-8 8" />`}</svg>
    <span>${label}</span><b>${v}</b></li>`;
  return html`
    <div class="scrim" @click=${A.close}></div>
    <section class="drawer ${t.tone}" role="dialog" aria-modal="true" aria-label="Match detail">
      <header>
        <span class="stamp">${t.label}</span>
        <button class="btn icon" @click=${A.close} aria-label="Close"><svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
      </header>
      <h2>${s.product}</h2>
      <p class="muted">${t.blurb}</p>

      <div class="batches">
        <div><small>CDSCO list</small>${batchTiles(n.batch, s.batch)}</div>
        <svg class="eq" viewBox="0 0 24 24" aria-hidden="true">${r.batch === 'exact' ? svg`<path d="M5 9h14M5 15h14" />` : svg`<path d="M5 9h14M5 15h14M15 5L9 19" />`}</svg>
        <div><small>Your shelf</small>${batchTiles(s.batch, n.batch)}</div>
      </div>

      <ul class="checks">
        ${check('Batch', r.batch)}${r.mfr ? check('Maker', r.mfr) : nothing}${r.expiry ? check('Expiry', r.expiry) : nothing}
        <li class="meter"><span>Name similarity</span><b>${Math.round((r.product || 0) * 100)}%</b><i style="--w:${(r.product || 0) * 100}%"></i></li>
      </ul>
      <p class="fine">A flag needs the batch plus the maker or expiry to agree. Name similarity is context only.</p>

      <div class="compare">
        <div>
          <h4>CDSCO · ${month(n.period)} · ${n.lab}</h4>
          <dl><dt>Product</dt><dd>${n.product}</dd><dt>Maker</dt><dd>${short(n.mfr, 140)}</dd><dt>Expiry</dt><dd>${n.expiry}</dd><dt>Failed test</dt><dd class="fail">${n.result}</dd></dl>
        </div>
        <div>
          <h4>Your shelf</h4>
          <dl><dt>Product</dt><dd>${s.product}</dd><dt>Maker</dt><dd>${s.mfr}</dd><dt>Expiry</dt><dd>${s.expiry}</dd><dt>Units</dt><dd>${s.qty} · ${rupees(m.value)}</dd><dt>Supplier</dt><dd>${s.supplier}</dd></dl>
        </div>
      </div>

      <footer class="actions">
        ${m.decision !== 'pending' ? html`<p>Already ${m.decision}.</p>`
          : m.tier === 'flag' ? holdButton({ label: 'Hold to quarantine & raise return', done: 'Quarantining…', onConfirm: () => A.quarantine([m.$id]) })
          : m.tier === 'info' ? html`<button class="btn ghost" @click=${() => A.dismiss(m.$id)}>Got it</button>`
          : html`<button class="btn ghost" @click=${() => A.dismiss(m.$id)}>Not the same batch</button>
                 ${holdButton({ label: 'Hold: it is the listed batch', done: 'Quarantining…', tone: 'amber', onConfirm: () => A.quarantine([m.$id], true) })}`}
      </footer>
      <p class="fine">Patients shouldn't stop a prescribed medicine on their own. Ask the doctor or pharmacist.</p>
    </section>`;
}

function emptyArt() {
  return svg`<svg viewBox="0 0 120 64" class="empty-art" aria-hidden="true">
    <rect x="6" y="26" width="108" height="4" rx="2" /><rect x="6" y="56" width="108" height="4" rx="2" />
    ${[14, 26, 38, 60, 72, 92, 104].map((x, i) => svg`<rect x=${x} y=${i % 2 ? 10 : 40} width="9" height=${i % 2 ? 16 : 16} rx="2" class="box" />`)}
  </svg>`;
}

function distributorView() {
  const open = state.notes.filter((n) => n.status === 'open');
  const owed = open.reduce((a, n) => a + (n.total_value || 0), 0);
  return html`
    <section class="hero calm">
      <div class="hero-copy">
        <p class="eyebrow">Returns raised by your retailers</p>
        <h1>${open.length} open return${open.length === 1 ? '' : 's'}</h1>
        <p class="sub">${rupees(owed)} to credit · you only see notes addressed to you</p>
      </div>
    </section>
    <ul class="notes">${repeat(state.notes, (n) => n.$id, (n, i) => {
      const items = JSON.parse(n.items || '[]');
      return html`<li class="note ${n.status} ${state.firstPaint ? 'stagger' : ''}" style="--i:${i}">
        <header><div><small>Return note</small><strong>${n.shop_name}</strong></div><span class="stamp">${n.status}</span></header>
        <table><thead><tr><th>Product</th><th>Batch</th><th>Units</th><th>Value</th><th>Reason (CDSCO)</th></tr></thead><tbody>
          ${items.map((it) => html`<tr><td>${it.product}</td><td class="batch">${it.batch}</td><td>${it.qty}</td><td>${rupees(it.value)}</td><td>${reasonCategory(it.reason)} · ${month(it.period)}</td></tr>`)}
        </tbody></table>
        <footer><span>${rupees(n.total_value)} to credit</span>${n.status === 'open' ? html`<button class="btn primary" @click=${() => A.collected(n.$id)}>Mark collected</button>` : html`<span class="ok">Collected</span>`}</footer>
      </li>`;
    })}</ul>
    ${state.notes.length ? nothing : html`<div class="empty">${emptyArt()}<p>No returns yet.</p></div>`}`;
}

// ---------------------------------------------------------------- start
window.addEventListener('rj:paint', paint);
window.toast = toast;
if (new URLSearchParams(location.search).has('mock')) import('./mock.js').then(async (m) => { await m.mockState(state); paint(); setTimeout(() => window.toast?.('New: TALGESIC is on the Sep 2026 list', 'red'), 600); });
else boot();
