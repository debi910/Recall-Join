// Sonner-style toasts: stack at the bottom, enter and exit from the same edge.
import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';

let toasts = [];
let seq = 0;
const repaint = () => window.dispatchEvent(new Event('rj:paint'));

export function toast(text, tone = 'ink') {
  const t = { id: ++seq, text, tone, leaving: false };
  toasts = [t, ...toasts].slice(0, 4);
  repaint();
  let timer = setTimeout(() => dismiss(t), 4200);
  // Don't let timers run out while the tab is hidden.
  const onVis = () => { if (document.hidden) clearTimeout(timer); else timer = setTimeout(() => dismiss(t), 2500); };
  document.addEventListener('visibilitychange', onVis);
  t.cleanup = () => document.removeEventListener('visibilitychange', onVis);
}

function dismiss(t) {
  if (t.leaving) return;
  t.leaving = true;
  t.cleanup?.();
  repaint();
  setTimeout(() => { toasts = toasts.filter((x) => x !== t); repaint(); }, 200);
}

export const toaster = () => html`<ol class="toaster" aria-live="polite">
  ${repeat(toasts, (t) => t.id, (t, i) => html`<li class="toast ${t.tone} ${t.leaving ? 'leaving' : ''}" style="--i:${i}" @click=${() => dismiss(t)}>
    <span class="dot"></span>${t.text}</li>`)}
</ol>`;
