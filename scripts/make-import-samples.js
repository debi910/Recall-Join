// Writes the demo stock (web/public/data/demo-stock.csv) in each export layout
// from eval/import-layouts.js, for trying the importer: web/public/data/samples/.
// The layouts are reconstructions, not real vendor files (see that file).
// .xls files need LibreOffice (soffice) to convert from .xlsx.
// Usage: npm run samples:import
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';
import { stockFromCsv } from '../core/csv.js';
import { normMonth } from '../core/normalize.js';
import { LAYOUTS, renderLayout, toText } from '../eval/import-layouts.js';

const out = new URL('../web/public/data/samples/', import.meta.url);
mkdirSync(out, { recursive: true });
const stock = stockFromCsv(readFileSync(new URL('../web/public/data/demo-stock.csv', import.meta.url), 'utf8'))
  .map((s) => ({ ...s, ym: normMonth(s.expiry) }))
  .sort((a, b) => a.product.localeCompare(b.product));

// Minimal .xlsx: one sheet, inline strings, numbers; whole numbers over 40000 in a
// column whose header says expiry are written as date cells.
function xlsx(rows) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const col = (i) => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26));
  const sheet = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = `${col(ci)}${ri + 1}`;
    if (v === '' || v == null) return '';
    if (typeof v === 'number') return `<c r="${ref}"${v > 40000 && Number.isInteger(v) ? ' s="1"' : ''}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Stock" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}

for (const L of LAYOUTS) {
  const rows = renderLayout(L, stock);
  const base = new URL(L.id, out).pathname;
  if (L.file === 'csv' || L.file === 'csv;') writeFileSync(`${base}.csv`, toText(rows, L.file === 'csv;' ? ';' : ','));
  else if (L.file === 'tsv') writeFileSync(`${base}.tsv`, toText(rows, '\t'));
  else {
    writeFileSync(`${base}.xlsx`, xlsx(rows));
    if (L.file === 'xls') {
      execSync(`soffice --headless --convert-to xls --outdir ${new URL('.', out).pathname} ${base}.xlsx`, { stdio: 'ignore' });
      if (!existsSync(`${base}.xls`)) throw new Error('soffice did not write the .xls');
      rmSync(`${base}.xlsx`);
    }
  }
  console.log('wrote', L.id, L.file);
}
