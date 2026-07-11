import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const writer = join(scriptRoot, 'write-sha256-manifest.mjs');
const verifier = join(scriptRoot, 'verify-sha256-manifest.mjs');
const renderer = join(scriptRoot, 'render-standalone-markdown.mjs');

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function withTempDir(fn) {
  const root = await mkdtemp(join(tmpdir(), 'monolith-governance-tooling-'));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('writer emits sorted canonical relative paths and verifier accepts them', () => withTempDir(async (root) => {
  await mkdir(join(root, 'nested'));
  const z = join(root, 'z.txt');
  const a = join(root, 'nested', 'a.txt');
  const manifest = join(root, 'files.sha256');
  await writeFile(z, 'z', 'utf8');
  await writeFile(a, 'a', 'utf8');

  const written = run(writer, [manifest, z, a]);
  assert.equal(written.status, 0, written.stderr);
  assert.equal(
    await readFile(manifest, 'utf8'),
    `${sha256('a')}  nested/a.txt\n${sha256('z')}  z.txt\n`,
  );

  const verified = run(verifier, [manifest]);
  assert.equal(verified.status, 0, verified.stderr);
}));

test('writer rejects outside-root and duplicate inputs', () => withTempDir(async (root) => {
  const manifestRoot = join(root, 'manifest-root');
  await mkdir(manifestRoot);
  const inside = join(manifestRoot, 'inside.txt');
  const outside = join(root, 'outside.txt');
  await writeFile(inside, 'inside', 'utf8');
  await writeFile(outside, 'outside', 'utf8');

  assert.notEqual(run(writer, [join(manifestRoot, 'outside.sha256'), outside]).status, 0);
  assert.notEqual(run(writer, [join(manifestRoot, 'duplicate.sha256'), inside, inside]).status, 0);
}));

test('verifier rejects traversal, duplicates, blank lines, CRLF, and Windows-invalid paths', () => withTempDir(async (root) => {
  const manifestRoot = join(root, 'manifest-root');
  await mkdir(manifestRoot);
  const inside = join(manifestRoot, 'inside.txt');
  const outside = join(root, 'outside.txt');
  await writeFile(inside, 'inside', 'utf8');
  await writeFile(outside, 'outside', 'utf8');
  const insideLine = `${sha256('inside')}  inside.txt`;

  const fixtures = new Map([
    ['traversal.sha256', `${sha256('outside')}  ../outside.txt\n`],
    ['duplicate.sha256', `${insideLine}\n${insideLine}\n`],
    ['blank.sha256', `${insideLine}\n\n${insideLine}\n`],
    ['crlf.sha256', `${insideLine}\r\n`],
    ['windows-invalid.sha256', `${sha256('inside')}  CON.txt\n`],
  ]);
  for (const [name, content] of fixtures) {
    const path = join(manifestRoot, name);
    await writeFile(path, content, 'utf8');
    assert.notEqual(run(verifier, [path]).status, 0, `${name} unexpectedly passed`);
  }
}));

test('renderer preserves literal legacy tokens and rejects unsafe links and unclosed fences', () => withTempDir(async (root) => {
  const safeInput = join(root, 'safe.md');
  const safeOutput = join(root, 'safe.html');
  await writeFile(safeInput, '# Safe\n\nLiteral @@CODE0@@ before `safe-code`.\n', 'utf8');
  const safe = run(renderer, [safeInput, safeOutput, 'en']);
  assert.equal(safe.status, 0, safe.stderr);
  const html = await readFile(safeOutput, 'utf8');
  assert.match(html, /Literal @@CODE0@@ before <code>safe-code<\/code>/);

  const unsafeInput = join(root, 'unsafe.md');
  await writeFile(unsafeInput, '[unsafe](javascript:document.body.dataset.pwned=1)\n', 'utf8');
  assert.notEqual(run(renderer, [unsafeInput, join(root, 'unsafe.html'), 'en']).status, 0);

  const controlInput = join(root, 'control.md');
  await writeFile(controlInput, '[unsafe](java\tscript:alert)\n', 'utf8');
  assert.notEqual(run(renderer, [controlInput, join(root, 'control.html'), 'en']).status, 0);

  const fenceInput = join(root, 'fence.md');
  await writeFile(fenceInput, '```text\nnot closed\n', 'utf8');
  assert.notEqual(run(renderer, [fenceInput, join(root, 'fence.html'), 'en']).status, 0);
}));
