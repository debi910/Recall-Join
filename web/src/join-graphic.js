// The product's signature visual: two tables, and the rows they share.
import { svg } from 'lit-html';

export function joinGraphic({ left = 16, right = 16, links = [], animate = true, leftLabel = 'CDSCO', rightLabel = 'Shelf' }) {
  const W = 380, H = 230, top = 28, rowH = (H - top - 8) / Math.max(left, right);
  const yL = (i) => top + i * ((H - top - 8) / left) + rowH / 2;
  const yR = (i) => top + i * ((H - top - 8) / right) + rowH / 2;
  const lx = 112, rx = W - 112;
  const hotL = new Map(links.map(([l, , t]) => [l, t]));
  const hotR = new Map(links.map(([, r, t]) => [r, t]));
  const rowsAt = (n, x, y, hot, align) => Array.from({ length: n }, (_, i) => {
    const w = 48 + ((i * 29) % 40);
    return svg`<rect class="jg-row ${hot.get(i) || ''}" x=${align === 'end' ? x - w : x} y=${y(i) - 3} width=${w} height="6" rx="3" style="--i:${i}" />`;
  });
  return svg`<svg class="join-graphic ${animate ? 'animate' : ''}" viewBox="0 0 ${W} ${H}" role="img">
    <text class="jg-label" x=${lx} y="14" text-anchor="end">${leftLabel}</text>
    <text class="jg-label" x=${rx} y="14">${rightLabel}</text>
    ${rowsAt(left, lx, yL, hotL, 'end')}
    ${rowsAt(right, rx, yR, hotR, 'start')}
    ${links.map(([l, r, tone], i) => {
      const y1 = yL(l), y2 = yR(r), mid = W / 2;
      return svg`<path class="jg-link ${tone}" pathLength="1" style="--i:${i}" d="M ${lx + 6} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${rx - 6} ${y2}" />
        <circle class="jg-dot ${tone}" style="--i:${i}" cx=${lx + 6} cy=${y1} r="3.5" /><circle class="jg-dot ${tone}" style="--i:${i}" cx=${rx - 6} cy=${y2} r="3.5" />`;
    })}
    <text class="jg-join" x=${W / 2} y=${H - 2} text-anchor="middle">JOIN ON batch</text>
  </svg>`;
}
