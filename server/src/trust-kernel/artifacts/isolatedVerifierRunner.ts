/**
 * isolatedVerifierRunner.ts - the isolated QA runner that reads shadow P2 bytes
 * under a WORKLOAD identity and streams them into the INDEPENDENT verifier as a
 * CHILD PROCESS (design §9, §14; plan Task 11).
 *
 * Containment invariants (the reason this file exists):
 *   - No human path. Bytes are read only under an isolated workload identity; a
 *     human/client never receives P2 plaintext, a raw locator, or a signed URL.
 *   - Spawn, never import. The verifier is invoked as a separate process (its CLI
 *     binary), so this module imports NO verifier code and cannot be coupled to it
 *     (design §14: the independent verifier shares only schemas + golden bytes).
 *   - Revocation is rechecked at request start; a REVOKED release is refused before
 *     any byte is read (design §16.3: revocation racing with a P2 read).
 *   - Transient local bytes are always removed after the run (finally), whatever the
 *     verdict — the sealed store remains the only durable copy.
 *
 * The runner is dependency-injected (workload identity, status provider, byte
 * reader, spawner) so it holds no ambient authority; `index.ts`/the worker construct
 * the real adapters. The default spawner uses `node:child_process`.
 *
 * Phase: NOT_FOR_PRODUCTION.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { ok, err, type TrustResult } from '../result.js';
import { propagateFailure } from '../signing/managedSignerPort.js';

/** The isolated workload identity used to read the private store (never a human). */
export interface WorkloadIdentity {
  authenticate(): Promise<TrustResult<{ token: string }>>;
}

/** Rechecks the authoritative release status at request start (design §16.3). */
export interface RevocationStatusProvider {
  statusAt(releaseRevisionId: string, nowIso: string): Promise<TrustResult<'ACTIVE' | 'REVOKED'>>;
}

/**
 * Reads exact bytes from the private store under the workload identity. This is the
 * ONLY way P2 bytes leave the store, and it returns raw bytes to THIS process only —
 * never a URL or locator to a caller (mirrors artifactRepository's URL-free port).
 */
export interface WorkloadByteReader {
  readBytes(locator: string): Promise<TrustResult<Uint8Array>>;
}

export interface VerifierSpawnArgs {
  command: string;
  args: readonly string[];
}
export interface VerifierSpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
/** Runs the verifier as a child process; the default uses node:child_process.spawn. */
export type VerifierSpawner = (args: VerifierSpawnArgs) => Promise<VerifierSpawnResult>;

export interface IsolatedVerificationRequest {
  releaseRevisionId: string;
  /** The internal object locator (tenantId/siteId/releaseRevisionId/contentHash). */
  locator: string;
  /** Independent-verifier inputs, pre-serialized JSON (schemas/golden bytes only). */
  trustBundleJson: string;
  statusBundleJson: string;
  policyJson: string;
  stateJson: string;
  nowIso: string;
}

export interface IsolatedVerifierDeps {
  workload: WorkloadIdentity;
  status: RevocationStatusProvider;
  bytes: WorkloadByteReader;
  /** Absolute path to the independent verifier CLI (tools/factory-packet-verifier/dist/cli.js). */
  verifierCliPath: string;
  /** Override the child-process spawner (tests inject a fake; production uses spawn). */
  spawnVerifier?: VerifierSpawner;
  /** Root for the transient scratch directory (defaults to the OS temp dir). */
  tmpRoot?: string;
  nodeExecPath?: string;
}

/** Automated evidence a human MAY receive — hashes, verdict, and codes only. */
export interface IsolatedVerificationEvidence {
  releaseRevisionId: string;
  verdict: 'PASS' | 'FAIL';
  /** SHA-256 over the emitted VerificationReportV1 bytes. */
  reportSha256: string;
  reportCodes: string[];
  verifierExitCode: number;
  checkedAtIso: string;
  /** The read mode; never a URL/locator — reaffirms the human-plaintext boundary. */
  mode: 'WORKLOAD_STREAM';
}

/** Default spawner: run the verifier CLI as a separate `node` process. */
export const defaultVerifierSpawner: VerifierSpawner = (a) =>
  new Promise<VerifierSpawnResult>((resolve, reject) => {
    const child = spawn(a.command, [...a.args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => (stdout += String(d)));
    child.stderr?.on('data', (d) => (stderr += String(d)));
    child.on('error', reject);
    child.on('close', (code) => resolve({ exitCode: code ?? 0, stdout, stderr }));
  });

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Read shadow P2 bytes under the workload identity and verify them with the
 * independent verifier CHILD PROCESS. Returns hashes/verdict/evidence only.
 */
export async function runIsolatedVerification(
  req: IsolatedVerificationRequest,
  deps: IsolatedVerifierDeps,
): Promise<TrustResult<IsolatedVerificationEvidence>> {
  // (1) Only the isolated workload identity may read the private store. If it cannot
  // authenticate, no P2 byte is read — the human-plaintext boundary holds closed.
  const auth = await deps.workload.authenticate();
  if (!auth.ok) return err('STORE_PLAINTEXT_ACCESS_DENIED', { boundary: 'workload authentication failed' });

  // (2) Recheck revocation AT REQUEST START — a REVOKED release is refused before
  // any byte is read (revocation racing with a P2 read, §16.3).
  const status = await deps.status.statusAt(req.releaseRevisionId, req.nowIso);
  if (!status.ok) return propagateFailure(status);
  if (status.value !== 'ACTIVE') {
    return err('STATE_RELEASE_REVOKED', { releaseRevisionId: req.releaseRevisionId });
  }

  // (3) Read the exact bytes under the workload identity (bytes reach THIS process
  // only; the reader exposes no URL/locator to a caller).
  const read = await deps.bytes.readBytes(req.locator);
  if (!read.ok) return propagateFailure(read);
  const packetBytes = read.value;

  const spawner = deps.spawnVerifier ?? defaultVerifierSpawner;
  const nodeExec = deps.nodeExecPath ?? process.execPath;

  // (4) Stage the transient inputs in a private scratch dir, then always remove them.
  const dir = await mkdtemp(join(deps.tmpRoot ?? tmpdir(), 'monolith-p2-verify-'));
  const packetPath = join(dir, 'packet.zip');
  const trustPath = join(dir, 'trust.json');
  const statusPath = join(dir, 'status.json');
  const policyPath = join(dir, 'policy.json');
  const statePath = join(dir, 'state.json');
  const reportPath = join(dir, 'report.json');

  try {
    await writeFile(packetPath, packetBytes);
    await writeFile(trustPath, req.trustBundleJson);
    await writeFile(statusPath, req.statusBundleJson);
    await writeFile(policyPath, req.policyJson);
    await writeFile(statePath, req.stateJson);

    // (5) SPAWN the independent verifier CLI as a child process — no import.
    const spawnResult = await spawner({
      command: nodeExec,
      args: [
        deps.verifierCliPath,
        '--packet', packetPath,
        '--trust', trustPath,
        '--status', statusPath,
        '--policy', policyPath,
        '--state', statePath,
        '--report', reportPath,
        '--now', req.nowIso,
      ],
    });

    // (6) Read the emitted report (written even on a FAIL exit), hash it, extract
    // verdict + codes. A missing/unparseable report is a store/verify failure.
    let reportRaw: Buffer;
    try {
      reportRaw = await readFile(reportPath);
    } catch {
      return err('STORE_ARTIFACT_UNAVAILABLE', { detail: 'verifier emitted no report' });
    }
    let report: { verdict?: string; codes?: unknown };
    try {
      report = JSON.parse(reportRaw.toString('utf-8')) as { verdict?: string; codes?: unknown };
    } catch {
      return err('STORE_HASH_MISMATCH', { detail: 'verifier report is not valid JSON' });
    }
    const verdict: 'PASS' | 'FAIL' = report.verdict === 'PASS' ? 'PASS' : 'FAIL';
    const reportCodes = Array.isArray(report.codes) ? report.codes.map((c) => String(c)) : [];

    const evidence: IsolatedVerificationEvidence = {
      releaseRevisionId: req.releaseRevisionId,
      verdict,
      reportSha256: sha256Hex(new Uint8Array(reportRaw)),
      reportCodes,
      verifierExitCode: spawnResult.exitCode,
      checkedAtIso: req.nowIso,
      mode: 'WORKLOAD_STREAM',
    };
    return ok(evidence);
  } finally {
    // (7) Remove the transient local bytes no matter what — the sealed private store
    // stays the only durable copy; nothing lingers on the runner's disk.
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
