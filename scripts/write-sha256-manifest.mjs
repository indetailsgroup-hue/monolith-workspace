import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep, win32 } from 'node:path';

const [manifestPath, ...files] = process.argv.slice(2);
if (!manifestPath || files.length === 0) {
  console.error('Usage: node scripts/write-sha256-manifest.mjs <manifest.sha256> <file>...');
  process.exit(1);
}

const manifestAbsolute = resolve(manifestPath);
const manifestRoot = dirname(manifestAbsolute);
const manifestRootReal = await realpath(manifestRoot);
const entries = [];
const seen = new Set();
const seenCaseFolded = new Set();

try {
  const manifestStat = await lstat(manifestAbsolute);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
    throw new Error(`Manifest output must be a regular non-symlink file: ${manifestPath}`);
  }
  const manifestReal = await realpath(manifestAbsolute);
  if (!isContained(manifestRootReal, manifestReal)) {
    throw new Error(`Manifest output resolves outside its directory: ${manifestPath}`);
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

function isContained(root, candidate) {
  const relativePath = relative(root, candidate);
  return relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

function canonicalRelativePath(file) {
  const absolute = resolve(file);
  const relativePath = relative(manifestRoot, absolute);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Manifest input must be inside the manifest directory: ${file}`);
  }
  const canonical = relativePath.split(sep).join('/');
  const segments = canonical.split('/');
  const windowsReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
  if (
    canonical !== canonical.normalize('NFC') ||
    canonical.startsWith('/') ||
    canonical.includes('\\') ||
    win32.isAbsolute(canonical) ||
    /[\u0000-\u001f\u007f]/u.test(canonical) ||
    segments.some((segment) =>
      !segment ||
      segment === '.' ||
      segment === '..' ||
      /[<>:"|?*]/u.test(segment) ||
      /[. ]$/u.test(segment) ||
      windowsReserved.test(segment)
    )
  ) {
    throw new Error(`Non-canonical manifest path: ${canonical}`);
  }
  return { absolute, canonical };
}

for (const file of files) {
  const { absolute, canonical } = canonicalRelativePath(file);
  if (absolute === manifestAbsolute) throw new Error('A SHA-256 manifest must not list itself');
  const folded = canonical.toLowerCase();
  if (seen.has(canonical) || seenCaseFolded.has(folded)) {
    throw new Error(`Duplicate or case-fold-colliding manifest path: ${canonical}`);
  }
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Manifest input is not a regular file: ${file}`);
  const fileReal = await realpath(absolute);
  if (!isContained(manifestRootReal, fileReal)) {
    throw new Error(`Manifest input resolves outside the manifest directory: ${file}`);
  }
  const bytes = await readFile(fileReal);
  const digest = createHash('sha256').update(bytes).digest('hex');
  entries.push({ canonical, digest });
  seen.add(canonical);
  seenCaseFolded.add(folded);
}

entries.sort((a, b) => Buffer.compare(Buffer.from(a.canonical, 'utf8'), Buffer.from(b.canonical, 'utf8')));
const lines = entries.map(({ canonical, digest }) => `${digest}  ${canonical}`);
await writeFile(manifestAbsolute, `${lines.join('\n')}\n`, 'utf8');
