import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const repoRoot = process.cwd();
const sourceDir = path.join(repoRoot, 'New folder');
const outputDir = path.join(repoRoot, 'docs', 'new-folder-workbook-audit');
const summaryPath = path.join(repoRoot, 'docs', 'NEW_FOLDER_WORKBOOK_AUDIT.md');
const fullJsonPath = path.join(outputDir, 'full-workbook-extract.json');

fs.mkdirSync(outputDir, { recursive: true });

function safeFileName(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function sheetRange(ws) {
  if (!ws['!ref']) return null;
  try {
    return XLSX.utils.decode_range(ws['!ref']);
  } catch {
    return null;
  }
}

function cellToSerializable(cell) {
  if (!cell) return null;
  const out = {};
  if ('v' in cell) out.value = cell.v;
  if ('w' in cell) out.display = cell.w;
  if ('f' in cell) out.formula = cell.f;
  if ('t' in cell) out.type = cell.t;
  if ('z' in cell) out.format = cell.z;
  if ('l' in cell) out.link = cell.l;
  if ('c' in cell) out.comments = cell.c;
  return out;
}

function valueText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function markdownCell(value) {
  return valueText(value).replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|');
}

function trimTrailingEmpty(row) {
  let end = row.length;
  while (end > 0 && valueText(row[end - 1]).trim() === '') end -= 1;
  return row.slice(0, end);
}

function findHeaderRows(rows) {
  const scored = rows.slice(0, Math.min(rows.length, 25)).map((row, idx) => {
    const nonEmpty = row.filter((v) => valueText(v).trim() !== '').length;
    const textLike = row.filter((v) => {
      const s = valueText(v).trim();
      return s !== '' && /[A-Za-zก-๙]/.test(s);
    }).length;
    return { idx, nonEmpty, textLike, score: nonEmpty + textLike * 1.5 };
  });
  return scored
    .filter((r) => r.nonEmpty >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.idx - b.idx)
    .map((r) => r.idx);
}

function profileSheet(ws, sheetName) {
  const range = sheetRange(ws);
  const merges = ws['!merges'] || [];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
  const nonEmptyCells = [];
  const formulas = [];
  const hyperlinks = [];
  const comments = [];

  for (const addr of Object.keys(ws)) {
    if (addr.startsWith('!')) continue;
    const cell = ws[addr];
    if (!cell) continue;
    const payload = cellToSerializable(cell);
    const text = valueText(payload?.display ?? payload?.value).trim();
    if (text !== '' || payload?.formula) {
      nonEmptyCells.push({ address: addr, ...payload });
    }
    if (payload?.formula) formulas.push({ address: addr, formula: payload.formula, value: payload.value, display: payload.display });
    if (payload?.link) hyperlinks.push({ address: addr, link: payload.link });
    if (payload?.comments) comments.push({ address: addr, comments: payload.comments });
  }

  const headerRows = findHeaderRows(rows);
  const previewRows = rows
    .slice(0, 18)
    .map((row) => trimTrailingEmpty(row))
    .filter((row) => row.length > 0);

  const sampleNonEmpty = nonEmptyCells.slice(0, 120);
  const fullRows = rows.map((row) => trimTrailingEmpty(row));

  return {
    sheetName,
    ref: ws['!ref'] || '',
    rows: range ? range.e.r - range.s.r + 1 : rows.length,
    cols: range ? range.e.c - range.s.c + 1 : Math.max(0, ...rows.map((r) => r.length)),
    nonEmptyCellCount: nonEmptyCells.length,
    formulaCount: formulas.length,
    mergeCount: merges.length,
    merges: merges.map((m) => XLSX.utils.encode_range(m)),
    headerCandidates: headerRows.map((idx) => ({ rowNumber: idx + 1, values: trimTrailingEmpty(rows[idx] || []) })),
    previewRows,
    sampleNonEmpty,
    formulas,
    hyperlinks,
    comments,
    fullRows,
  };
}

function workbookMarkdown(wbInfo) {
  const lines = [];
  lines.push(`# ${wbInfo.fileName}`);
  lines.push('');
  lines.push(`- Path: \`${wbInfo.path}\``);
  lines.push(`- Size: ${wbInfo.sizeBytes.toLocaleString()} bytes`);
  lines.push(`- Last modified: ${wbInfo.lastModified}`);
  lines.push(`- Sheets: ${wbInfo.sheets.length}`);
  lines.push('');
  lines.push('| Sheet | Range | Rows | Cols | Non-empty cells | Formulas | Merges |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const sheet of wbInfo.sheets) {
    lines.push(`| ${markdownCell(sheet.sheetName)} | ${markdownCell(sheet.ref)} | ${sheet.rows} | ${sheet.cols} | ${sheet.nonEmptyCellCount} | ${sheet.formulaCount} | ${sheet.mergeCount} |`);
  }
  for (const sheet of wbInfo.sheets) {
    lines.push('');
    lines.push(`## Sheet: ${sheet.sheetName}`);
    lines.push('');
    lines.push(`Range: \`${sheet.ref || '(empty)'}\`; rows=${sheet.rows}; cols=${sheet.cols}; non-empty=${sheet.nonEmptyCellCount}; formulas=${sheet.formulaCount}; merges=${sheet.mergeCount}`);
    if (sheet.headerCandidates.length) {
      lines.push('');
      lines.push('Header candidates:');
      for (const h of sheet.headerCandidates) {
        lines.push(`- Row ${h.rowNumber}: ${h.values.map(markdownCell).join(' | ')}`);
      }
    }
    if (sheet.previewRows.length) {
      const maxCols = Math.min(10, Math.max(...sheet.previewRows.map((r) => r.length)));
      lines.push('');
      lines.push('Preview:');
      lines.push(`| ${Array.from({ length: maxCols }, (_, i) => `C${i + 1}`).join(' | ')} |`);
      lines.push(`| ${Array.from({ length: maxCols }, () => '---').join(' | ')} |`);
      for (const row of sheet.previewRows.slice(0, 12)) {
        const cells = Array.from({ length: maxCols }, (_, i) => markdownCell(row[i] ?? ''));
        lines.push(`| ${cells.join(' | ')} |`);
      }
    }
    if (sheet.formulaCount) {
      lines.push('');
      lines.push('Formula sample:');
      for (const f of sheet.formulas.slice(0, 20)) {
        lines.push(`- ${f.address}: \`${f.formula}\` => ${markdownCell(f.display ?? f.value)}`);
      }
    }
    if (sheet.mergeCount) {
      lines.push('');
      lines.push(`Merged ranges sample: ${sheet.merges.slice(0, 20).map((m) => `\`${m}\``).join(', ')}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

const files = fs.readdirSync(sourceDir)
  .filter((name) => /\.(xlsx|xls|csv|tsv)$/i.test(name))
  .sort((a, b) => a.localeCompare(b, 'th'));

const workbooks = [];
const errors = [];

for (const fileName of files) {
  const filePath = path.join(sourceDir, fileName);
  const stat = fs.statSync(filePath);
  try {
    const wb = XLSX.readFile(filePath, {
      cellFormula: true,
      cellHTML: false,
      cellNF: true,
      cellStyles: true,
      cellDates: true,
      bookVBA: false,
      WTF: false,
    });
    const sheets = wb.SheetNames.map((sheetName) => profileSheet(wb.Sheets[sheetName], sheetName));
    const wbInfo = {
      fileName,
      path: filePath,
      sizeBytes: stat.size,
      lastModified: stat.mtime.toISOString(),
      sheets,
    };
    workbooks.push(wbInfo);
    fs.writeFileSync(
      path.join(outputDir, `${safeFileName(fileName)}.md`),
      workbookMarkdown(wbInfo),
      'utf8',
    );
  } catch (error) {
    errors.push({ fileName, path: filePath, message: error?.message || String(error) });
  }
}

const summaryLines = [];
summaryLines.push('# New Folder Workbook Audit');
summaryLines.push('');
summaryLines.push(`Source folder: \`${sourceDir}\``);
summaryLines.push(`Generated: ${new Date().toISOString()}`);
summaryLines.push('');
summaryLines.push(`- Files scanned: ${files.length}`);
summaryLines.push(`- Workbooks read successfully: ${workbooks.length}`);
summaryLines.push(`- Errors: ${errors.length}`);
summaryLines.push(`- Total sheets: ${workbooks.reduce((sum, wb) => sum + wb.sheets.length, 0)}`);
summaryLines.push(`- Total non-empty cells: ${workbooks.reduce((sum, wb) => sum + wb.sheets.reduce((s, sh) => s + sh.nonEmptyCellCount, 0), 0)}`);
summaryLines.push('');
summaryLines.push('## Workbook Inventory');
summaryLines.push('');
summaryLines.push('| # | Workbook | Sheets | Non-empty cells | Formulas | Size | Detail report |');
summaryLines.push('|---:|---|---:|---:|---:|---:|---|');
workbooks.forEach((wb, idx) => {
  const nonEmpty = wb.sheets.reduce((sum, sh) => sum + sh.nonEmptyCellCount, 0);
  const formulas = wb.sheets.reduce((sum, sh) => sum + sh.formulaCount, 0);
  const detail = `new-folder-workbook-audit/${safeFileName(wb.fileName)}.md`;
  summaryLines.push(`| ${idx + 1} | ${markdownCell(wb.fileName)} | ${wb.sheets.length} | ${nonEmpty} | ${formulas} | ${wb.sizeBytes.toLocaleString()} | [detail](${detail}) |`);
});
if (errors.length) {
  summaryLines.push('');
  summaryLines.push('## Read Errors');
  for (const err of errors) {
    summaryLines.push(`- ${err.fileName}: ${err.message}`);
  }
}
summaryLines.push('');
summaryLines.push('## Sheet Index');
summaryLines.push('');
summaryLines.push('| Workbook | Sheet | Range | Rows | Cols | Non-empty | Header candidates |');
summaryLines.push('|---|---|---:|---:|---:|---:|---|');
for (const wb of workbooks) {
  for (const sheet of wb.sheets) {
    const headers = sheet.headerCandidates
      .map((h) => `R${h.rowNumber}: ${h.values.slice(0, 8).map(markdownCell).join(' / ')}`)
      .join('<br>');
    summaryLines.push(`| ${markdownCell(wb.fileName)} | ${markdownCell(sheet.sheetName)} | ${markdownCell(sheet.ref)} | ${sheet.rows} | ${sheet.cols} | ${sheet.nonEmptyCellCount} | ${headers} |`);
  }
}
summaryLines.push('');
summaryLines.push('## Notes');
summaryLines.push('');
summaryLines.push('- Detail reports include sheet ranges, row/column counts, header candidates, first visible preview rows, formula samples, and merged ranges.');
summaryLines.push('- Full cell extracts are saved as JSON for audit and further processing.');

fs.writeFileSync(summaryPath, summaryLines.join('\n'), 'utf8');
fs.writeFileSync(fullJsonPath, JSON.stringify({ sourceDir, generatedAt: new Date().toISOString(), workbooks, errors }, null, 2), 'utf8');

console.log(JSON.stringify({
  sourceDir,
  summaryPath,
  fullJsonPath,
  files: files.length,
  workbooks: workbooks.length,
  errors: errors.length,
  sheets: workbooks.reduce((sum, wb) => sum + wb.sheets.length, 0),
  nonEmptyCells: workbooks.reduce((sum, wb) => sum + wb.sheets.reduce((s, sh) => s + sh.nonEmptyCellCount, 0), 0),
}, null, 2));
