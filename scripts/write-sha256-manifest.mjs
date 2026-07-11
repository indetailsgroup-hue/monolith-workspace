import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const [manifestPath, ...files] = process.argv.slice(2);
if (!manifestPath || files.length === 0) {
  console.error('Usage: node scripts/write-sha256-manifest.mjs <manifest.sha256> <file>...');
  process.exit(1);
}

const lines = [];
for (const file of files) {
  const bytes = await readFile(file);
  const digest = createHash('sha256').update(bytes).digest('hex');
  lines.push(`${digest}  ${basename(file)}`);
}
await writeFile(manifestPath, `${lines.join('\n')}\n`, 'utf8');
