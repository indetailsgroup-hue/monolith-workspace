import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as source from '../../../scripts/line-ci-source.mjs';

const SCRIPT = fileURLToPath(new URL('../../../scripts/line-ci-source.mjs', import.meta.url));
const PREFIX = 'line-ci-source-';
const SENTINEL = 'fixture-sentinel-not-a-real-secret';
const TAP_TEST = 'tests/line-oa-commerce/ci/tap-evidence.test.mjs';
const SOURCE_TEST = 'tests/line-oa-commerce/ci/source-evidence.test.mjs';
const SOURCES = {
  '.github/workflows/db-verify.yml': 'name: db-verify\n',
  'scripts/line-ci-source.mjs': '// source\n',
  'scripts/line-ci-tap.mjs': '// tap\n',
  'scripts/run-line-db-suites.sh': '#!/usr/bin/env bash\n',
  [SOURCE_TEST]: '// source test\n',
  [TAP_TEST]: '// tap test\n',
  'tests/line-oa-commerce/concurrency/race.test.mjs': '// race\n',
  'supabase/migrations/0001_init.sql': 'create table t (id int);\n',
  'supabase/tests/a.sql': 'select 1;\nselect 2;\n',
};
const UNRELATED = {
  '.env': `TOKEN=${SENTINEL}\n`,
  'credentials.json': `{"key":"${SENTINEL}"}\n`,
  'src/unrelated.mjs': '// unrelated\n',
  'supabase/migrations/notes.md': 'notes\n',
  'tests/line-oa-commerce/other/skip.test.mjs': '// skip\n',
};
const GIT = ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];
const generated = new Set();

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const git = (cwd, ...args) => execFileSync('git', [...GIT, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const abs = (repo, rel) => path.join(repo, ...rel.split('/'));
const digestOf = (repo) => sha256(source.serializeManifest(source.captureSource(repo)));

function write(repo, rel, content) {
  mkdirSync(path.dirname(abs(repo, rel)), { recursive: true });
  writeFileSync(abs(repo, rel), content);
}

function cleanup(tmp) {
  const rel = path.relative(realpathSync(os.tmpdir()), realpathSync(tmp));
  assert.ok(generated.has(tmp) && rel.startsWith(PREFIX) && !rel.includes(path.sep), 'cleanup target must be a generated temp root');
  rmSync(realpathSync(tmp), { recursive: true, force: true });
}

// Overrides replace fixture content; null omits the file from the commit.
function fixture(t, overrides = {}) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), PREFIX));
  generated.add(tmp);
  t.after(() => cleanup(tmp));
  const repo = path.join(tmp, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q');
  for (const [rel, content] of Object.entries({ ...SOURCES, ...UNRELATED, ...overrides })) {
    if (content !== null) write(repo, rel, content);
  }
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'fixture');
  return { tmp, repo };
}

function runCli(repo, args, githubEnv) {
  const env = { ...process.env, FIXTURE_SENTINEL: SENTINEL };
  delete env.GITHUB_ENV;
  if (githubEnv) env.GITHUB_ENV = githubEnv;
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, env, encoding: 'utf8' });
}

test('manifest is deterministic, sorted and limited to allowlisted sources', (t) => {
  const { repo } = fixture(t);
  write(repo, 'supabase/tests/untracked.sql', 'select 3;\n');
  const manifest = source.captureSource(repo);
  assert.equal(manifest.format, 'sha256-lf-v1');
  assert.match(manifest.commit, /^[0-9a-f]{40}$/);
  assert.equal(manifest.commit, git(repo, 'rev-parse', 'HEAD').trim());
  assert.equal(manifest.ref, git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim());
  assert.deepEqual(manifest.files.map((row) => row.path), Object.keys(SOURCES).sort());
  for (const row of manifest.files) {
    assert.deepEqual(Object.keys(row), ['path', 'sha256']);
    assert.equal(row.sha256, sha256(SOURCES[row.path]));
  }
  const text = source.serializeManifest(manifest);
  assert.ok(text.endsWith('}\n') && !text.includes(SENTINEL));
  assert.deepEqual(JSON.parse(text), manifest);
  assert.equal(text, source.serializeManifest(source.captureSource(repo)));
});

test('detached HEAD is recorded as ref HEAD', (t) => {
  const { repo } = fixture(t);
  git(repo, 'checkout', '-q', '--detach');
  assert.equal(source.captureSource(repo).ref, 'HEAD');
});

test('CRLF and LF sources hash to the same row', (t) => {
  const { repo } = fixture(t);
  const lf = source.hashSource(repo, 'supabase/tests/a.sql');
  const before = digestOf(repo);
  write(repo, 'supabase/tests/a.sql', 'select 1;\r\nselect 2;\r\n');
  assert.deepEqual(source.hashSource(repo, 'supabase/tests/a.sql'), lf);
  assert.deepEqual(lf, { path: 'supabase/tests/a.sql', sha256: sha256('select 1;\nselect 2;\n') });
  assert.equal(digestOf(repo), before);
});

test('relevant source changes alter the digest and unrelated changes do not', (t) => {
  const { repo } = fixture(t);
  const before = digestOf(repo);
  write(repo, '.env', 'TOKEN=changed\n');
  write(repo, 'src/unrelated.mjs', '// changed\n');
  assert.equal(digestOf(repo), before);
  write(repo, 'supabase/migrations/0001_init.sql', 'create table t (id bigint);\n');
  assert.notEqual(digestOf(repo), before);
});

test('untracked required files are included for local smoke runs', (t) => {
  const { repo } = fixture(t, { [SOURCE_TEST]: null });
  assert.throws(() => source.captureSource(repo), /source missing/);
  write(repo, SOURCE_TEST, SOURCES[SOURCE_TEST]);
  assert.ok(source.captureSource(repo).files.some((row) => row.path === SOURCE_TEST));
});

test('missing required file fails', (t) => {
  const { repo } = fixture(t, { 'scripts/run-line-db-suites.sh': null });
  assert.throws(() => source.captureSource(repo), /source missing: scripts.run-line-db-suites\.sh/);
});

test('missing migration or test SQL fails', (t) => {
  const noMigration = fixture(t, { 'supabase/migrations/0001_init.sql': null });
  assert.throws(() => source.captureSource(noMigration.repo), /no tracked SQL under supabase.migrations/);
  const noTest = fixture(t, { 'supabase/tests/a.sql': null });
  assert.throws(() => source.captureSource(noTest.repo), /no tracked SQL under supabase.tests/);
});

test('paths outside the allowlist or root are never read', (t) => {
  const { tmp, repo } = fixture(t);
  writeFileSync(path.join(tmp, 'outside.sql'), 'select 0;\n');
  for (const rel of ['supabase/tests/../../../outside.sql', '../outside.sql', '.env', 'credentials.json', 'src/unrelated.mjs']) {
    assert.throws(() => source.hashSource(repo, rel), /not an allowlisted source path/);
  }
});

test('symlinked sources are rejected', (t) => {
  const { tmp, repo } = fixture(t);
  const outside = path.join(tmp, 'outside.mjs');
  writeFileSync(outside, SOURCES[TAP_TEST]);
  rmSync(abs(repo, TAP_TEST));
  try {
    symlinkSync(outside, abs(repo, TAP_TEST), 'file');
  } catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') return t.skip('symlink privilege unavailable');
    throw error;
  }
  assert.throws(() => source.captureSource(repo), /not a regular file/);
});

test('CLI writes the manifest, prints only digest and count, and exports the digest', (t) => {
  const { tmp, repo } = fixture(t);
  const output = path.join(tmp, 'source-manifest.json');
  const githubEnv = path.join(tmp, 'github-env');
  writeFileSync(githubEnv, 'KEEP=1\n');
  const result = runCli(repo, [output], githubEnv);
  assert.equal(result.status, 0, result.stderr);
  const match = /^([0-9a-f]{64})\nfiles=(\d+)\n$/.exec(result.stdout);
  assert.ok(match, 'stdout must be digest plus file count');
  const bytes = readFileSync(output);
  assert.equal(match[1], sha256(bytes));
  assert.equal(bytes.toString('utf8'), source.serializeManifest(source.captureSource(repo)));
  assert.equal(Number(match[2]), JSON.parse(bytes.toString('utf8')).files.length);
  assert.equal(readFileSync(githubEnv, 'utf8'), `KEEP=1\nLINE_DB_EVIDENCE_SOURCE_SHA256=${match[1]}\n`);
  assert.ok(!(result.stdout + result.stderr + bytes.toString('utf8')).includes(SENTINEL));
});

test('CLI works without GITHUB_ENV', (t) => {
  const { tmp, repo } = fixture(t);
  const result = runCli(repo, [path.join(tmp, 'source-manifest.json')]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^[0-9a-f]{64}\nfiles=9\n$/);
});

test('CLI failure exits nonzero and exports no digest', (t) => {
  const { tmp, repo } = fixture(t, { [TAP_TEST]: null });
  const output = path.join(tmp, 'source-manifest.json');
  const githubEnv = path.join(tmp, 'github-env');
  writeFileSync(githubEnv, 'KEEP=1\n');
  const result = runCli(repo, [output], githubEnv);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /source missing/);
  assert.equal(readFileSync(githubEnv, 'utf8'), 'KEEP=1\n');
  assert.equal(existsSync(output), false);
  assert.notEqual(runCli(repo, [], githubEnv).status, 0);
  assert.equal(readFileSync(githubEnv, 'utf8'), 'KEEP=1\n');
});

test('CLI rejects output and GITHUB_ENV collisions without touching files', (t) => {
  const { tmp, repo } = fixture(t);
  const output = path.join(tmp, 'source-manifest.json');
  const githubEnv = path.join(tmp, 'github-env');
  writeFileSync(githubEnv, 'KEEP=1\n');
  const tap = abs(repo, 'scripts/line-ci-tap.mjs');
  const cases = [
    [[tap], githubEnv],
    [[path.join('supabase', 'migrations', 'new.sql')], githubEnv],
    [[githubEnv], githubEnv],
    [[output], tap],
  ];
  for (const [args, envFile] of cases) {
    const result = runCli(repo, args, envFile);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /collides/);
  }
  assert.equal(readFileSync(tap, 'utf8'), SOURCES['scripts/line-ci-tap.mjs']);
  assert.equal(readFileSync(githubEnv, 'utf8'), 'KEEP=1\n');
  assert.equal(existsSync(output), false);
  assert.equal(existsSync(abs(repo, 'supabase/migrations/new.sql')), false);
});
