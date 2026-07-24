/**
 * isolatedVerifierRunner.integration.test.ts — Task 12 carry-forward (b).
 *
 * The isolated QA runner is the ONLY path P2 shadow bytes leave the sealed store, and
 * it must (design §9, §14, §16.3):
 *   - SPAWN the independent verifier as a CHILD PROCESS (never import it) — the module
 *     imports no verifier code and invokes the CLI path through an injected spawner;
 *   - RECHECK revocation at request start — a REVOKED release is refused before ANY
 *     byte is read;
 *   - CLEAN UP transient local bytes after the run (PASS, FAIL, or spawner error) so
 *     the sealed store stays the only durable copy;
 *   - return hashes/verdict/evidence only — never a URL or a raw locator.
 *
 * This integration test drives the real runner over the real filesystem with injected
 * workload/status/byte/spawner adapters (no ambient authority, no real network).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readdir, rm, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runIsolatedVerification,
  type IsolatedVerifierDeps,
  type IsolatedVerificationRequest,
  type VerifierSpawner,
  type VerifierSpawnArgs,
} from '../artifacts/isolatedVerifierRunner.js';

const PACKET = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);

function baseRequest(over: Partial<IsolatedVerificationRequest> = {}): IsolatedVerificationRequest {
  return {
    releaseRevisionId: 'RR-1',
    locator: 'T-001/S-001/RR-1/' + 'a'.repeat(64),
    trustBundleJson: '{"bundleType":"TRUST"}',
    statusBundleJson: '{"bundleType":"RELEASE_STATUS"}',
    policyJson: '{"maxOfflineStaleness":"P7D"}',
    stateJson: '{"now":"2026-07-24T00:00:00.000Z"}',
    nowIso: '2026-07-24T00:00:00.000Z',
    ...over,
  };
}

/** A spawner that behaves like the CLI: it reads the --report path from argv, and
 *  writes a verifier report there — proving the runner talks to a *process* by argv. */
function fakeCliSpawner(
  report: { verdict: 'PASS' | 'FAIL'; codes: string[] },
  seen: { args?: readonly string[]; command?: string },
): VerifierSpawner {
  return async (a: VerifierSpawnArgs) => {
    seen.command = a.command;
    seen.args = a.args;
    const idx = a.args.indexOf('--report');
    const reportPath = a.args[idx + 1];
    // Written by the "child process" — the runner reads it back from disk.
    await (await import('node:fs/promises')).writeFile(reportPath, JSON.stringify(report));
    return { exitCode: report.verdict === 'PASS' ? 0 : 20, stdout: '', stderr: '' };
  };
}

function deps(over: Partial<IsolatedVerifierDeps> = {}): IsolatedVerifierDeps {
  return {
    workload: { async authenticate() { return { ok: true, value: { token: 'workload-jwt' } }; } },
    status: { async statusAt() { return { ok: true, value: 'ACTIVE' }; } },
    bytes: { async readBytes() { return { ok: true, value: PACKET }; } },
    verifierCliPath: '/opt/monolith/verifier/dist/cli.js',
    spawnVerifier: fakeCliSpawner({ verdict: 'PASS', codes: [] }, {}),
    ...over,
  };
}

let tmpRoot: string;
beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'runner-it-'));
});
afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
});

async function scratchDirsUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isDirectory() && e.name.startsWith('monolith-p2-verify-')).map((e) => e.name);
}

describe('isolatedVerifierRunner — spawn-not-import', () => {
  it('does not import the verifier: the module source has no verifier import', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../artifacts/isolatedVerifierRunner.ts'),
      'utf-8',
    );
    expect(src).not.toMatch(/from ['"].*factory-packet-verifier/);
    expect(src).not.toMatch(/import\(.*factory-packet-verifier/);
    expect(src).toMatch(/from ['"]node:child_process['"]/);
  });

  it('invokes the verifier CLI as a child process by argv and reads back its report', async () => {
    const seen: { args?: readonly string[]; command?: string } = {};
    const res = await runIsolatedVerification(
      baseRequest(),
      deps({ tmpRoot, spawnVerifier: fakeCliSpawner({ verdict: 'PASS', codes: [] }, seen) }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.verdict).toBe('PASS');
      expect(res.value.mode).toBe('WORKLOAD_STREAM');
      expect(res.value.reportSha256).toMatch(/^[0-9a-f]{64}$/);
      // evidence exposes no URL/locator
      expect(JSON.stringify(res.value).toLowerCase()).not.toContain('http');
      expect(JSON.stringify(res.value).toLowerCase()).not.toContain('locator');
    }
    // the CLI path was passed as an argv token to a spawned process
    expect(seen.args).toContain('/opt/monolith/verifier/dist/cli.js');
    expect(seen.args).toContain('--packet');
  });

  it('propagates a FAIL verdict + codes emitted by the child process', async () => {
    const res = await runIsolatedVerification(
      baseRequest(),
      deps({ tmpRoot, spawnVerifier: fakeCliSpawner({ verdict: 'FAIL', codes: ['PACKET_HASH_MISMATCH'] }, {}) }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.verdict).toBe('FAIL');
      expect(res.value.reportCodes).toContain('PACKET_HASH_MISMATCH');
      expect(res.value.verifierExitCode).toBe(20);
    }
  });
});

describe('isolatedVerifierRunner — revocation recheck at request start', () => {
  it('refuses a REVOKED release BEFORE any byte is read', async () => {
    let bytesRead = false;
    const res = await runIsolatedVerification(
      baseRequest(),
      deps({
        tmpRoot,
        status: { async statusAt() { return { ok: true, value: 'REVOKED' }; } },
        bytes: { async readBytes() { bytesRead = true; return { ok: true, value: PACKET }; } },
      }),
    );
    expect(res).toMatchObject({ ok: false, code: 'STATE_RELEASE_REVOKED' });
    expect(bytesRead).toBe(false);
  });

  it('refuses when the workload identity cannot authenticate (no byte read)', async () => {
    let bytesRead = false;
    const res = await runIsolatedVerification(
      baseRequest(),
      deps({
        tmpRoot,
        workload: { async authenticate() { return { ok: false, code: 'AUTH_REQUIRED' }; } },
        bytes: { async readBytes() { bytesRead = true; return { ok: true, value: PACKET }; } },
      }),
    );
    expect(res).toMatchObject({ ok: false, code: 'STORE_PLAINTEXT_ACCESS_DENIED' });
    expect(bytesRead).toBe(false);
  });
});

describe('isolatedVerifierRunner — transient-byte cleanup', () => {
  it('removes the transient scratch dir after a successful run', async () => {
    expect(await scratchDirsUnder(tmpRoot)).toHaveLength(0);
    await runIsolatedVerification(baseRequest(), deps({ tmpRoot }));
    expect(await scratchDirsUnder(tmpRoot)).toHaveLength(0);
  });

  it('removes the transient scratch dir even when the spawner throws', async () => {
    const throwingSpawner: VerifierSpawner = async () => { throw new Error('spawn failed'); };
    await expect(
      runIsolatedVerification(baseRequest(), deps({ tmpRoot, spawnVerifier: throwingSpawner })),
    ).rejects.toThrow(/spawn failed/);
    expect(await scratchDirsUnder(tmpRoot)).toHaveLength(0);
  });

  it('returns STORE_ARTIFACT_UNAVAILABLE and cleans up when the child emits no report', async () => {
    const noReportSpawner: VerifierSpawner = async () => ({ exitCode: 0, stdout: '', stderr: '' });
    const res = await runIsolatedVerification(baseRequest(), deps({ tmpRoot, spawnVerifier: noReportSpawner }));
    expect(res).toMatchObject({ ok: false, code: 'STORE_ARTIFACT_UNAVAILABLE' });
    expect(await scratchDirsUnder(tmpRoot)).toHaveLength(0);
  });
});
