import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const manifests = process.argv.slice(2);
if (manifests.length === 0) {
  console.error('Usage: node scripts/verify-sha256-manifest.mjs <manifest.sha256>...');
  process.exit(1);
}

let failed = false;
for (const manifestPath of manifests) {
  const text = (await readFile(manifestPath, 'utf8')).replace(/\r\n?/g, '\n');
  for (const line of text.split('\n').filter(Boolean)) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    if (!match) {
      console.error(`INVALID  ${manifestPath}: ${line}`);
      failed = true;
      continue;
    }
    const filePath = resolve(dirname(manifestPath), match[2]);
    const bytes = await readFile(filePath);
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== match[1]) {
      console.error(`FAIL  ${filePath}`);
      failed = true;
    } else {
      console.log(`PASS  ${filePath}`);
    }
  }
}

if (failed) process.exit(1);
