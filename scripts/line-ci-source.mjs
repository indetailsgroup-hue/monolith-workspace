#!/usr/bin/env node
// Captures a deterministic, credential-free manifest of the LINE DB verification sources.
// Usage (cwd = repository root): node scripts/line-ci-source.mjs <output-json>
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FORMAT = 'sha256-lf-v1';
export const ENV_NAME = 'LINE_DB_EVIDENCE_SOURCE_SHA256';
// Fixed files are always required, even when untracked (local pre-commit smoke).
export const REQUIRED = [
  '.github/workflows/db-verify.yml',
  'scripts/line-ci-source.mjs',
  'scripts/line-ci-tap.mjs',
  'scripts/run-line-db-suites.sh',
  'tests/line-oa-commerce/ci/source-evidence.test.mjs',
  'tests/line-oa-commerce/ci/tap-evidence.test.mjs',
];
const PATTERNS = [
  /^tests\/line-oa-commerce\/(ci|concurrency)\/.+\.mjs$/,
  /^supabase\/(migrations|tests)\/.+\.sql$/,
];

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const isSource = (rel) => REQUIRED.includes(rel) || PATTERNS.some((re) => re.test(rel));

// Read-only git queries; errors never echo git output.
function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    throw new Error(`git ${args[0]} failed`);
  }
}

export function hashSource(root, rel) {
  const parts = String(rel).split('/');
  if (!isSource(rel) || rel.includes('\\') || parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`not an allowlisted source path: ${rel}`);
  }
  const base = realpathSync(root);
  const abs = path.join(base, ...parts);
  let stat;
  try {
    stat = lstatSync(abs);
  } catch {
    throw new Error(`source missing: ${rel}`);
  }
  if (!stat.isFile()) throw new Error(`source is not a regular file: ${rel}`);
  if (path.relative(base, realpathSync(abs)).split(path.sep).join('/') !== rel) {
    throw new Error(`source resolves outside its path: ${rel}`);
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(abs));
  } catch {
    throw new Error(`source is not valid UTF-8: ${rel}`);
  }
  return { path: rel, sha256: sha256(text.replace(/\r\n/g, '\n')) };
}

export function captureSource(root) {
  const base = realpathSync(root);
  if (git(base, ['rev-parse', '--show-cdup']).trim() !== '') throw new Error('root must be the repository top level');
  const commit = git(base, ['rev-parse', '--verify', 'HEAD']).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('HEAD is not a 40-hex commit');
  const ref = git(base, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  if (!ref) throw new Error('ref is empty');
  const tracked = git(base, ['ls-files', '-z']).split('\0').filter(isSource);
  const paths = [...new Set([...REQUIRED, ...tracked])].sort();
  for (const kind of ['migrations', 'tests']) {
    if (!paths.some((rel) => rel.startsWith(`supabase/${kind}/`))) throw new Error(`no tracked SQL under supabase/${kind}`);
  }
  return { commit, files: paths.map((rel) => hashSource(base, rel)), format: FORMAT, ref };
}

// Canonical JSON: fixed key order, no whitespace, trailing LF.
export function serializeManifest(manifest) {
  const files = manifest.files.map((row) => ({ path: row.path, sha256: row.sha256 }));
  return `${JSON.stringify({ commit: manifest.commit, files, format: manifest.format, ref: manifest.ref })}\n`;
}

function canonical(file, label) {
  let dir;
  try {
    dir = realpathSync(path.dirname(file));
  } catch {
    throw new Error(`${label} directory is missing`);
  }
  const full = path.join(dir, path.basename(file));
  let stat = null;
  try {
    stat = lstatSync(full);
  } catch {
    // absent is fine
  }
  if (stat && !stat.isFile()) throw new Error(`${label} is not a regular file`);
  return full;
}

// Case-insensitive on every platform so a case variant can never shadow a source.
function collides(base, file) {
  const rel = path.relative(base, file);
  if (rel === '') return true;
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return false;
  return isSource(rel.split(path.sep).join('/').toLowerCase());
}

export function writeSource(root, outputArg, githubEnv) {
  const base = realpathSync(root);
  const manifest = captureSource(base);
  const output = canonical(path.resolve(base, outputArg), 'output');
  const envFile = githubEnv ? canonical(path.resolve(base, githubEnv), 'GITHUB_ENV') : null;
  if (collides(base, output)) throw new Error('output collides with a source path');
  if (envFile && collides(base, envFile)) throw new Error('GITHUB_ENV collides with a source path');
  if (envFile && envFile.toLowerCase() === output.toLowerCase()) throw new Error('output collides with GITHUB_ENV');
  const bytes = Buffer.from(serializeManifest(manifest), 'utf8');
  try {
    // wx: never overwrite an existing file.
    writeFileSync(output, bytes, { flag: 'wx' });
  } catch (error) {
    throw new Error(error.code === 'EEXIST' ? 'output already exists' : 'output write failed');
  }
  const digest = sha256(bytes);
  if (envFile) {
    try {
      appendFileSync(envFile, `${ENV_NAME}=${digest}\n`);
    } catch {
      throw new Error('GITHUB_ENV append failed');
    }
  }
  return { digest, count: manifest.files.length };
}

function main() {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1 || !args[0]) throw new Error('usage: node scripts/line-ci-source.mjs <output-json>');
    const { digest, count } = writeSource(process.cwd(), args[0], process.env.GITHUB_ENV);
    process.stdout.write(`${digest}\nfiles=${count}\n`);
  } catch (error) {
    process.stderr.write(`line-ci-source: ${error.message}\n`);
    process.exitCode = 1;
  }
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) main();
