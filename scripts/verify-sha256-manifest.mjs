import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep, win32 } from 'node:path';

const manifests = process.argv.slice(2);
if (manifests.length === 0) {
  console.error('Usage: node scripts/verify-sha256-manifest.mjs <manifest.sha256>...');
  process.exit(1);
}

let failed = false;
let invalidCount = 0;

function markInvalid(manifestPath, reason) {
  console.error(`INVALID  ${manifestPath}: ${reason}`);
  failed = true;
  invalidCount += 1;
}

function isContained(root, candidate) {
  const relativePath = relative(root, candidate);
  return relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

function validateCanonicalPath(path) {
  const segments = path.split('/');
  const windowsReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
  return Boolean(path) &&
    path === path.normalize('NFC') &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !win32.isAbsolute(path) &&
    // INTENTIONAL: control chars in a manifest path are exactly what this
    // validator exists to reject.
    // eslint-disable-next-line no-control-regex -- see comment above
    !/[\u0000-\u001f\u007f]/u.test(path) &&
    segments.every((segment) =>
      segment &&
      segment !== '.' &&
      segment !== '..' &&
      !/[<>:"|?*]/u.test(segment) &&
      !/[. ]$/u.test(segment) &&
      !windowsReserved.test(segment)
    );
}

for (const manifestPath of manifests) {
  const invalidCountAtStart = invalidCount;
  const manifestAbsolute = resolve(manifestPath);
  const manifestRoot = dirname(manifestAbsolute);
  let bytes;
  try {
    const manifestStat = await lstat(manifestAbsolute);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
      markInvalid(manifestPath, 'manifest is not a regular non-symlink file');
      continue;
    }
    bytes = await readFile(manifestAbsolute);
  } catch (error) {
    markInvalid(manifestPath, error.message);
    continue;
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    markInvalid(manifestPath, 'UTF-8 BOM is forbidden');
    continue;
  }
  if (bytes.includes(0x0d)) {
    markInvalid(manifestPath, 'CR/CRLF is forbidden; use LF only');
    continue;
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    markInvalid(manifestPath, 'invalid UTF-8');
    continue;
  }
  if (!text.endsWith('\n') || text.endsWith('\n\n')) {
    markInvalid(manifestPath, 'manifest must end with exactly one LF');
    continue;
  }

  const lines = text.slice(0, -1).split('\n');
  if (lines.some((line) => line.length === 0)) {
    markInvalid(manifestPath, 'blank lines are forbidden');
    continue;
  }

  const parsed = [];
  const seen = new Set();
  const seenCaseFolded = new Set();
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{64}) {2}(.+)$/);
    if (!match) {
      markInvalid(manifestPath, `invalid entry: ${line}`);
      continue;
    }
    const canonical = match[2];
    const folded = canonical.toLowerCase();
    if (!validateCanonicalPath(canonical)) {
      markInvalid(manifestPath, `non-canonical path: ${canonical}`);
      continue;
    }
    if (seen.has(canonical) || seenCaseFolded.has(folded)) {
      markInvalid(manifestPath, `duplicate or case-fold-colliding path: ${canonical}`);
      continue;
    }
    parsed.push({ expected: match[1], canonical });
    seen.add(canonical);
    seenCaseFolded.add(folded);
  }
  if (invalidCount > invalidCountAtStart) continue;

  for (let index = 1; index < parsed.length; index += 1) {
    const previous = Buffer.from(parsed[index - 1].canonical, 'utf8');
    const current = Buffer.from(parsed[index].canonical, 'utf8');
    if (Buffer.compare(previous, current) >= 0) {
      markInvalid(
        manifestPath,
        `entries are not in unsigned UTF-8 byte order: ${parsed[index - 1].canonical} before ${parsed[index].canonical}`,
      );
      break;
    }
  }
  if (invalidCount > invalidCountAtStart) continue;

  let rootReal;
  let manifestReal;
  try {
    rootReal = await realpath(manifestRoot);
    manifestReal = await realpath(manifestAbsolute);
  } catch (error) {
    markInvalid(manifestPath, error.message);
    continue;
  }

  for (const { expected, canonical } of parsed) {
    const filePath = resolve(manifestRoot, ...canonical.split('/'));
    if (!isContained(manifestRoot, filePath)) {
      markInvalid(manifestPath, `path escapes manifest directory: ${canonical}`);
      continue;
    }
    try {
      const stat = await lstat(filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        markInvalid(manifestPath, `entry is not a regular file: ${canonical}`);
        continue;
      }
      const fileReal = await realpath(filePath);
      if (!isContained(rootReal, fileReal) || fileReal === manifestReal) {
        markInvalid(manifestPath, `entry escapes root or lists the manifest itself: ${canonical}`);
        continue;
      }
      const fileBytes = await readFile(fileReal);
      const actual = createHash('sha256').update(fileBytes).digest('hex');
      if (actual !== expected) {
        console.error(`FAIL  ${filePath}`);
        failed = true;
      } else {
        console.log(`PASS  ${filePath}`);
      }
    } catch (error) {
      markInvalid(manifestPath, `${canonical}: ${error.message}`);
    }
  }
}

if (failed) process.exit(1);
