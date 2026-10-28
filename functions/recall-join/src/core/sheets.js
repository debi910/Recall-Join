// Reads the first sheet of a spreadsheet into a table of cells, in the browser
// or in Node. Handles .xlsx, legacy .xls (BIFF8, which Marg/BUSY/Tally ERP 9
// era tools still write), HTML tables saved as .xls, and CSV/TSV text.
// Date cells come back as "YYYY-MM-DD" strings.
import { unzipSync, strFromU8 } from 'fflate';
import { textToRows, decodeEntities, excelSerialToISO } from './import.js';

export function readSheet(bytes, name = '') {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0x50 && b[1] === 0x4b) return readXlsx(b);
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return readXls(b);
  return textToRows(decodeText(b));
}

// UTF-8, or Windows-1252 when the bytes aren't valid UTF-8 (older Windows tools).
function decodeText(b) {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('windows-1252').decode(b); }
}

// ---------------------------------------------------------------- number formats
const BUILTIN_DATES = new Set([14, 15, 16, 17, 22, 45, 46, 47, 57, 58]);
const isDateFormat = (code) => /[dmy]/i.test(String(code).replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/^general$/i.test(code);

function cellValue(v, isDate) {
  return isDate && typeof v === 'number' && v > 0 ? excelSerialToISO(v) : v;
}

// ---------------------------------------------------------------- xlsx
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export function readXlsx(bytes) {
  const zip = unzipSync(bytes, { filter: (f) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(f.name) });
  const file = (p) => (zip[p] ? strFromU8(zip[p]) : '');
  const wb = file('xl/workbook.xml');
  const rid = attr(wb.match(/<sheet\b[^>]*>/)?.[0] || '', 'r:id');
  const rels = file('xl/_rels/workbook.xml.rels');
  let target = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, 'Id') === rid);
  target = target ? attr(target, 'Target').replace(/^\/?(xl\/)?/, '') : 'worksheets/sheet1.xml';
  const sheet = file(`xl/${target}`) || file('xl/worksheets/sheet1.xml');

  const text = (xml) => decodeEntities([...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
  const shared = [...file('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => text(m[1]));

  const styles = file('xl/styles.xml');
  const fmts = Object.fromEntries([...styles.matchAll(/<numFmt\b[^>]*>/g)].map((m) => [Number(attr(m[0], 'numFmtId')), decodeEntities(attr(m[0], 'formatCode') || '')]));
  const xfs = [...(styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || '').matchAll(/<xf\b[^>]*>/g)].map((m) => Number(attr(m[0], 'numFmtId') || 0));
  const dateStyle = xfs.map((id) => BUILTIN_DATES.has(id) || (fmts[id] !== undefined && isDateFormat(fmts[id])));

  const rows = [];
  for (const rm of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = Number(attr(rm[0], 'r')) - 1 || rows.length;
    const row = [];
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = `<c ${cm[1]}>`, body = cm[2] || '';
      const ref = attr(tag, 'r');
      const c = ref ? colIndex(ref) : row.length;
      const t = attr(tag, 't'), s = Number(attr(tag, 's') || 0);
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = '';
      if (t === 's') val = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') val = text(body);
      else if (t === 'str' || t === 'e') val = decodeEntities(v ?? '');
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== undefined) val = cellValue(Number(v), dateStyle[s]);
      row[c] = val;
    }
    rows[r] = Array.from(row, (x) => x ?? '');
  }
  return Array.from(rows, (x) => x ?? []).filter((r) => r.some((x) => String(x).trim()));
}

// ---------------------------------------------------------------- xls (BIFF8 in a compound file)
function cfbStream(b, names) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const secSize = 1 << dv.getUint16(0x1e, true), miniSize = 1 << dv.getUint16(0x20, true);
  const sec = (i) => 512 + i * secSize;
  // FAT from the header DIFAT (109 entries) and any DIFAT sectors.
  const fatSecs = [];
  for (let i = 0; i < 109; i++) { const s = dv.getInt32(0x4c + i * 4, true); if (s >= 0) fatSecs.push(s); }
  for (let d = dv.getInt32(0x44, true), n = dv.getUint32(0x48, true); d >= 0 && n--;) {
    for (let i = 0; i < secSize / 4 - 1; i++) { const s = dv.getInt32(sec(d) + i * 4, true); if (s >= 0) fatSecs.push(s); }
    d = dv.getInt32(sec(d) + secSize - 4, true);
  }
  const fat = [];
  for (const s of fatSecs) for (let i = 0; i < secSize / 4; i++) fat.push(dv.getInt32(sec(s) + i * 4, true));
  const chain = (start, table, guard = 1e6) => { const out = []; for (let s = start; s >= 0 && guard--; s = table[s]) out.push(s); return out; };
  const read = (start, size) => {
    const out = new Uint8Array(size); let o = 0;
    for (const s of chain(start, fat)) { const n = Math.min(secSize, size - o); if (n <= 0) break; out.set(b.subarray(sec(s), sec(s) + n), o); o += n; }
    return out;
  };
  const dirBytes = chain(dv.getInt32(0x30, true), fat).map((s) => b.subarray(sec(s), sec(s) + secSize));
  const entries = [];
  for (const d of dirBytes) for (let o = 0; o < d.length; o += 128) {
    const e = new DataView(d.buffer, d.byteOffset + o, 128);
    const nameLen = e.getUint16(64, true);
    const name = String.fromCharCode(...new Uint16Array(d.buffer.slice(d.byteOffset + o, d.byteOffset + o + Math.max(0, nameLen - 2))));
    entries.push({ name, type: e.getUint8(66), start: e.getInt32(116, true), size: e.getUint32(120, true) });
  }
  const root = entries[0];
  const ent = entries.find((e) => e.type === 2 && names.includes(e.name));
  if (!ent) throw new Error('This .xls file has no workbook inside it');
  if (ent.size >= dv.getUint32(0x38, true)) return read(ent.start, ent.size);
  // Small streams live in the mini stream.
  const miniFat = [];
  for (const s of chain(dv.getInt32(0x3c, true), fat)) for (let i = 0; i < secSize / 4; i++) miniFat.push(dv.getInt32(sec(s) + i * 4, true));
  const mini = read(root.start, root.size);
  const out = new Uint8Array(ent.size); let o = 0;
  for (const s of chain(ent.start, miniFat)) { const n = Math.min(miniSize, ent.size - o); out.set(mini.subarray(s * miniSize, s * miniSize + n), o); o += n; }
  return out;
}

export function readXls(bytes) {
  const wb = cfbStream(bytes, ['Workbook', 'Book']);
  const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
  const recs = [];
  for (let o = 0; o + 4 <= wb.length;) {
    const type = dv.getUint16(o, true), len = dv.getUint16(o + 2, true);
    recs.push({ type, off: o + 4, len });
    o += 4 + len;
  }
  if (recs[0]?.type !== 0x0809 || dv.getUint16(recs[0].off, true) !== 0x0600) {
    throw new Error('This .xls is an old Excel 95 file. Save it as .xlsx or .csv and upload again.');
  }
  const u8 = (o) => wb[o], u16 = (o) => dv.getUint16(o, true), u32 = (o) => dv.getUint32(o, true);
  const f64 = (o) => dv.getFloat64(o, true);
  const rk = (v) => {
    let n = v & 2 ? v >> 2 : (() => { const t = new DataView(new ArrayBuffer(8)); t.setUint32(4, v & 0xfffffffc, true); return t.getFloat64(0, true); })();
    return v & 1 ? n / 100 : n;
  };
  // A BIFF8 unicode string, possibly continued across CONTINUE records (segs).
  const readStr = (segs, pos, cch) => {
    let [si, o] = pos, out = '';
    let flags = u8(segs[si].off + o); o++;
    const rich = flags & 8 ? u16(segs[si].off + o) : 0; if (flags & 8) o += 2;
    const ext = flags & 4 ? u32(segs[si].off + o) : 0; if (flags & 4) o += 4;
    while (cch > 0) {
      if (o >= segs[si].len) { si++; o = 0; flags = u8(segs[si].off); o = 1; }
      const wide = flags & 1, room = Math.floor((segs[si].len - o) / (wide ? 2 : 1)), n = Math.min(cch, room);
      for (let i = 0; i < n; i++) out += String.fromCharCode(wide ? u16(segs[si].off + o + i * 2) : u8(segs[si].off + o + i));
      o += n * (wide ? 2 : 1); cch -= n;
    }
    let skip = rich * 4 + ext;
    while (skip > 0) { const n = Math.min(skip, segs[si].len - o); o += n; skip -= n; if (skip > 0) { si++; o = 0; } }
    return [out, [si, o]];
  };
  const sst = [], fmts = {}, xfs = [];
  let sheetStart = -1;
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (r.type === 0x041e) { // FORMAT
      const id = u16(r.off), cch = u16(r.off + 2);
      fmts[id] = readStr([{ off: r.off + 4, len: r.len - 4 }], [0, 0], cch)[0];
    } else if (r.type === 0x00e0) xfs.push(u16(r.off + 2)); // XF -> format id
    else if (r.type === 0x0085 && sheetStart < 0 && u8(r.off + 5) === 0) sheetStart = u32(r.off); // first worksheet
    else if (r.type === 0x00fc) { // SST + CONTINUE
      const segs = [{ off: r.off + 8, len: r.len - 8 }];
      for (let j = i + 1; recs[j]?.type === 0x003c; j++) segs.push({ off: recs[j].off, len: recs[j].len });
      let pos = [0, 0];
      const total = u32(r.off + 4);
      for (let k = 0; k < total; k++) {
        if (pos[1] >= segs[pos[0]].len) pos = [pos[0] + 1, 0];
        if (!segs[pos[0]]) break;
        const cch = u16(segs[pos[0]].off + pos[1]);
        pos = [pos[0], pos[1] + 2];
        const [s, next] = readStr(segs, pos, cch);
        sst.push(s); pos = next;
      }
    }
  }
  const dateXf = xfs.map((id) => BUILTIN_DATES.has(id) || (fmts[id] !== undefined && isDateFormat(fmts[id])));
  const rows = [];
  const put = (r, c, v) => { (rows[r] ||= [])[c] = v; };
  const num = (r, c, xf, v) => put(r, c, cellValue(v, dateXf[xf]));
  let i = recs.findIndex((r) => r.off - 4 === sheetStart);
  if (i < 0) throw new Error('Could not find the first sheet in this .xls file');
  for (i++; i < recs.length && recs[i].type !== 0x000a; i++) {
    const { type, off, len } = recs[i];
    if (type === 0x00fd) put(u16(off), u16(off + 2), sst[u32(off + 6)] ?? ''); // LABELSST
    else if (type === 0x0203) num(u16(off), u16(off + 2), u16(off + 4), f64(off + 6)); // NUMBER
    else if (type === 0x027e) num(u16(off), u16(off + 2), u16(off + 4), rk(u32(off + 6))); // RK
    else if (type === 0x00bd) { // MULRK
      const r = u16(off), c0 = u16(off + 2), n = (len - 6) / 6;
      for (let k = 0; k < n; k++) num(r, c0 + k, u16(off + 4 + k * 6), rk(u32(off + 6 + k * 6)));
    } else if (type === 0x0204) { // LABEL
      put(u16(off), u16(off + 2), readStr([{ off: off + 8, len: len - 8 }], [0, 0], u16(off + 6))[0]);
    } else if (type === 0x0006) { // FORMULA: cached result
      const r = u16(off), c = u16(off + 2);
      if (u16(off + 12) !== 0xffff) num(r, c, u16(off + 4), f64(off + 6));
      else if (u8(off + 6) === 0 && recs[i + 1]?.type === 0x0207) {
        const s = recs[i + 1];
        put(r, c, readStr([{ off: s.off + 2, len: s.len - 2 }], [0, 0], u16(s.off))[0]);
      }
    }
  }
  return Array.from(rows, (r) => Array.from(r ?? [], (x) => x ?? '')).filter((r) => r.some((x) => String(x).trim()));
}
