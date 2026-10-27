// Hold-to-confirm: a deliberate, slow fill on press (1.2s linear), a fast snap back
// on release (200ms ease-out). Used for the one irreversible-feeling action: quarantine.
import { html } from 'lit-html';

const HOLD_MS = 1200;

export function holdButton({ label, done, onConfirm, tone = 'red' }) {
  let timer;
  const start = (e) => {
    const btn = e.currentTarget;
    if (btn.dataset.state === 'done') return;
    btn.setPointerCapture?.(e.pointerId);
    btn.dataset.state = 'holding';
    timer = setTimeout(() => {
      btn.dataset.state = 'done';
      btn.querySelector('.hold-label').textContent = done;
      onConfirm();
    }, HOLD_MS);
  };
  const cancel = (e) => {
    const btn = e.currentTarget;
    clearTimeout(timer);
    if (btn.dataset.state === 'holding') btn.dataset.state = '';
  };
  const key = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (e.type === 'keydown' && !e.repeat) start(e);
    if (e.type === 'keyup') cancel(e);
  };
  return html`<button class="btn hold ${tone}" style="--hold:${HOLD_MS}ms"
      @pointerdown=${start} @pointerup=${cancel} @pointerleave=${cancel} @pointercancel=${cancel}
      @keydown=${key} @keyup=${key} @contextmenu=${(e) => e.preventDefault()}>
    <span class="hold-fill" aria-hidden="true"></span>
    <span class="hold-label" .textContent=${label}></span>
  </button>`;
}
