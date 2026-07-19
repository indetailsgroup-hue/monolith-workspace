import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const [inputPath, outputPath, language = 'en', explicitTitle] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/render-standalone-markdown.mjs <input.md> <output.html> [lang] [title]');
  process.exit(1);
}

const source = (await readFile(inputPath, 'utf8')).replace(/\r\n?/g, '\n');
const lines = source.split('\n');

const escapeHtml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function inline(value) {
  if (value.includes('\0')) throw new Error('Markdown input contains a forbidden NUL byte');

  return value.split(/(`[^`\n]+`)/g).map((segment) => {
    if (segment.startsWith('`') && segment.endsWith('`')) {
      return `<code>${escapeHtml(segment.slice(1, -1))}</code>`;
    }

    const links = [];
    let rendered = escapeHtml(segment).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      // INTENTIONAL: unsafe Markdown link targets containing control chars
      // must be rejected, not allowed.
      // eslint-disable-next-line no-control-regex -- see comment above
      if (/[\x00-\x20\x7f]/.test(href) || href.startsWith('//')) {
        throw new Error(`Unsafe Markdown link target: ${href}`);
      }
      const scheme = href.match(/^([A-Za-z][A-Za-z0-9+.-]*):/);
      if (scheme && !/^(https?|mailto)$/i.test(scheme[1])) {
        throw new Error(`Unsupported Markdown link scheme: ${scheme[1]}`);
      }
      const token = `\0LINK${links.length}\0`;
      const external = /^(https?):/i.test(href);
      links.push(`<a href="${href}"${external ? ' rel="noopener noreferrer"' : ''}>${label}</a>`);
      return token;
    });
    rendered = rendered
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    for (let i = 0; i < links.length; i += 1) rendered = rendered.replace(`\0LINK${i}\0`, links[i]);
    return rendered;
  }).join('');
}

const isTableDivider = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
const tableCells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());

const html = [];
let i = 0;
while (i < lines.length) {
  const line = lines[i];
  if (!line.trim()) { i += 1; continue; }

  const fence = line.match(/^```(.*)$/);
  if (fence) {
    const languageClass = fence[1].trim();
    const body = [];
    let closed = false;
    i += 1;
    while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
    if (i < lines.length) {
      closed = true;
      i += 1;
    }
    if (!closed) throw new Error(`Unclosed fenced code block in ${inputPath}`);
    html.push(`<pre><code${languageClass ? ` class="language-${escapeHtml(languageClass)}"` : ''}>${escapeHtml(body.join('\n'))}</code></pre>`);
    continue;
  }

  const heading = line.match(/^(#{1,6})\s+(.+)$/);
  if (heading) {
    const level = heading[1].length;
    html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    i += 1;
    continue;
  }

  if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
    html.push('<hr>');
    i += 1;
    continue;
  }

  if (i + 1 < lines.length && line.includes('|') && isTableDivider(lines[i + 1])) {
    const headers = tableCells(line);
    i += 2;
    const rows = [];
    while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(tableCells(lines[i++]));
    html.push('<div class="table-wrap"><table><thead><tr>');
    for (const cell of headers) html.push(`<th>${inline(cell)}</th>`);
    html.push('</tr></thead><tbody>');
    for (const row of rows) {
      html.push('<tr>');
      for (const cell of row) html.push(`<td>${inline(cell)}</td>`);
      html.push('</tr>');
    }
    html.push('</tbody></table></div>');
    continue;
  }

  if (/^>\s?/.test(line)) {
    const body = [];
    while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
    html.push(`<blockquote>${body.map((item) => `<p>${inline(item)}</p>`).join('')}</blockquote>`);
    continue;
  }

  const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
  const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
  if (unordered || ordered) {
    const tag = unordered ? 'ul' : 'ol';
    const pattern = unordered ? /^\s*[-*+]\s+(.+)$/ : /^\s*\d+[.)]\s+(.+)$/;
    const items = [];
    while (i < lines.length) {
      const match = lines[i].match(pattern);
      if (!match) break;
      items.push(match[1]);
      i += 1;
    }
    html.push(`<${tag}>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</${tag}>`);
    continue;
  }

  const paragraph = [line.trim()];
  i += 1;
  while (
    i < lines.length && lines[i].trim() &&
    !/^(#{1,6})\s+/.test(lines[i]) &&
    !/^```/.test(lines[i]) &&
    !/^>\s?/.test(lines[i]) &&
    !/^\s*[-*+]\s+/.test(lines[i]) &&
    !/^\s*\d+[.)]\s+/.test(lines[i]) &&
    !/^\s*(---+|\*\*\*+)\s*$/.test(lines[i]) &&
    !(i + 1 < lines.length && lines[i].includes('|') && isTableDivider(lines[i + 1]))
  ) paragraph.push(lines[i++].trim());
  html.push(`<p>${inline(paragraph.join(' '))}</p>`);
}

const firstHeading = lines.find((line) => /^#\s+/.test(line));
const title = explicitTitle || (firstHeading ? firstHeading.replace(/^#\s+/, '') : basename(inputPath));
const document = `<!doctype html>
<html lang="${escapeHtml(language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>:root{color-scheme:light;--ink:#17202a;--muted:#5b6470;--line:#d9e1ea;--paper:#fff;--soft:#f6f8fb;--accent:#0f766e;--accent-soft:#e9fbf7;--warn:#92400e;--warn-soft:#fff7ed}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#edf1f5;color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.62}main{max-width:1120px;min-height:100vh;margin:0 auto;padding:48px 58px 76px;background:var(--paper);box-shadow:0 24px 70px rgba(15,23,42,.08)}h1,h2,h3,h4{line-height:1.22}h1{margin:0 0 14px;font-size:clamp(1.65rem,3.2vw,2.45rem)}h2{margin-top:42px;padding-top:22px;border-top:1px solid var(--line);font-size:1.42rem}h3{margin-top:28px;font-size:1.13rem;color:var(--accent)}h4{margin-top:22px}p{margin:13px 0}a{color:#0b63ce}blockquote{margin:22px 0;padding:16px 20px;border-left:5px solid var(--accent);background:var(--accent-soft);font-weight:650}blockquote p{margin:6px 0}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;background:#edf2f7;padding:2px 5px;border-radius:4px;overflow-wrap:anywhere}pre{overflow:auto;padding:18px 20px;border-radius:8px;background:#17212b;color:#edf6ff;line-height:1.5}pre code{padding:0;background:transparent;color:inherit}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;margin:18px 0;font-size:.94rem}th,td{border:1px solid var(--line);padding:9px 12px;text-align:left;vertical-align:top}th{background:var(--soft)}tr:nth-child(even) td{background:#fbfcfe}hr{border:0;border-top:1px solid var(--line);margin:26px 0}ol li,ul li{margin:7px 0}@media (max-width:760px){main{padding:26px 18px 50px}}@media print{body{background:#fff}main{box-shadow:none;padding:0}}</style>
</head>
<body>
<main>
${html.join('\n')}
</main>
</body>
</html>
`;

await writeFile(outputPath, document, 'utf8');
