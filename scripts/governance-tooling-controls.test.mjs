// Supplementary regression suite for the governance tooling controls that the
// independent source review (2026-07-15, Claude) confirmed are implemented in
// source and fire at runtime, but that governance-tooling.test.mjs did not yet
// lock with a dedicated test: manifest BOM / non-lowercase-hex / malformed-hex /
// trailing-LF, self-reference, case-fold collision, and renderer link schemes
// (data:/vbscript:/protocol-relative) + inline NUL, plus writer self-listing.
//
// This suite is INTENTIONALLY a separate file so the four bytes pinned by
// CT-DEC-003-A1 §2 (render d7e05ddc / write 3cd69ca3 / verify 9fbbf535 /
// test cef61070) remain byte-identical and keep their OFFICIAL classification.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
  const root = await mkdtemp(join(tmpdir(), 'monolith-governance-controls-'));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('verifier rejects BOM, non-lowercase hex, malformed hex, and bad trailing newline', () => withTempDir(async (root) => {
  const manifestRoot = join(root, 'manifest-root');
  await mkdir(manifestRoot);
  await writeFile(join(manifestRoot, 'inside.txt'), 'inside', 'utf8');
  const good = `${sha256('inside')}  inside.txt`;

  const fixtures = new Map([
    ['bom.sha256', `﻿${good}\n`],
    ['uppercase-hex.sha256', `${sha256('inside').toUpperCase()}  inside.txt\n`],
    ['short-hex.sha256', `${sha256('inside').slice(0, 63)}  inside.txt\n`],
    ['no-final-newline.sha256', `${good}`],
    ['double-final-newline.sha256', `${good}\n\n`],
  ]);
  for (const [name, content] of fixtures) {
    const path = join(manifestRoot, name);
    await writeFile(path, content, 'utf8');
    assert.notEqual(run(verifier, [path]).status, 0, `${name} unexpectedly passed`);
  }
}));

test('verifier rejects a manifest that lists itself', () => withTempDir(async (root) => {
  const manifestRoot = join(root, 'manifest-root');
  await mkdir(manifestRoot);
  await writeFile(join(manifestRoot, 'inside.txt'), 'inside', 'utf8');
  const self = join(manifestRoot, 'self.sha256');
  // Two entries; whatever the self digest is, listing the manifest path must be rejected
  // structurally before any digest comparison.
  const content = `${sha256('inside')}  inside.txt\n${sha256('placeholder')}  self.sha256\n`;
  await writeFile(self, content, 'utf8');
  assert.notEqual(run(verifier, [self]).status, 0);
}));

test('verifier rejects case-fold-colliding entries', () => withTempDir(async (root) => {
  const manifestRoot = join(root, 'manifest-root');
  await mkdir(manifestRoot);
  await writeFile(join(manifestRoot, 'inside.txt'), 'inside', 'utf8');
  const path = join(manifestRoot, 'casefold.sha256');
  await writeFile(path, `${sha256('inside')}  File.txt\n${sha256('inside')}  file.txt\n`, 'utf8');
  assert.notEqual(run(verifier, [path]).status, 0);
}));

test('writer refuses to list the manifest itself', () => withTempDir(async (root) => {
  const manifestRoot = join(root, 'manifest-root');
  await mkdir(manifestRoot);
  const manifest = join(manifestRoot, 'm.sha256');
  // Passing the manifest path as an input must be rejected structurally.
  assert.notEqual(run(writer, [manifest, manifest]).status, 0);
}));

test('renderer rejects data:, vbscript:, and protocol-relative link targets', () => withTempDir(async (root) => {
  const cases = [
    '[x](data:text/html,<script>alert(1)</script>)\n',
    '[x](vbscript:msgbox(1))\n',
    '[x](//evil.example/path)\n',
  ];
  for (let i = 0; i < cases.length; i += 1) {
    const input = join(root, `link-${i}.md`);
    await writeFile(input, cases[i], 'utf8');
    assert.notEqual(run(renderer, [input, join(root, `link-${i}.html`), 'en']).status, 0, `case ${i} unexpectedly rendered`);
  }
}));

test('renderer rejects NUL bytes in inline text', () => withTempDir(async (root) => {
  const input = join(root, 'nul.md');
  await writeFile(input, 'paragraph with a \0 forbidden byte\n', 'utf8');
  assert.notEqual(run(renderer, [input, join(root, 'nul.html'), 'en']).status, 0);
}));

test('sanity: a valid manifest and a safe document still succeed', () => withTempDir(async (root) => {
  const manifestRoot = join(root, 'manifest-root');
  await mkdir(manifestRoot);
  await writeFile(join(manifestRoot, 'inside.txt'), 'inside', 'utf8');
  const manifest = join(manifestRoot, 'ok.sha256');
  await writeFile(manifest, `${sha256('inside')}  inside.txt\n`, 'utf8');
  assert.equal(run(verifier, [manifest]).status, 0);

  const input = join(root, 'safe.md');
  await writeFile(input, '# Title\n\nA [safe](https://example.com) link and `code`.\n', 'utf8');
  const rendered = run(renderer, [input, join(root, 'safe.html'), 'en']);
  assert.equal(rendered.status, 0, rendered.stderr);
}));
