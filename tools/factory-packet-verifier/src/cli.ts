#!/usr/bin/env node
/**
 * cli.ts - factory-packet-verify entrypoint (plan Task 10, design §14)
 *
 *   factory-packet-verify --packet <zip> --trust <json> --status <json> \
 *     --policy <json> --state <json> --report <json> [--now <iso>]
 *
 * The CLI is the ONLY place a clock or filesystem is touched. It reads the
 * inputs, derives the verifier build hash from its own emitted bytes, calls the
 * pure `verify()` core, writes the `VerificationReportV1`, and - only on PASS -
 * advances the persistent state atomically (temp file + rename). Exit code: 0 on
 * PASS, 2 on FAIL, 3 on a usage/IO error.
 *
 * Imports no builder code.
 *
 * Phase: NOT_FOR_PRODUCTION.
 */

import { readFileSync, writeFileSync, renameSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { verify } from './verify.js';
import { bootstrapStateFromCheckpoint } from './freshnessStore.js';
import type {
  TrustBundleV1,
  ReleaseStatusBundleV1,
  VerifierPolicyV1,
  VerifierStateV1,
} from './types.js';

interface Args {
  packet: string;
  trust: string;
  status: string;
  policy: string;
  state: string;
  report: string;
  now?: string;
}

function parseArgs(argv: string[]): Args {
  const map: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const val = argv[i + 1];
    if (!key?.startsWith('--') || val === undefined) {
      throw new Error(`bad argument near "${key ?? ''}"`);
    }
    map[key.slice(2)] = val;
  }
  for (const req of ['packet', 'trust', 'status', 'policy', 'state', 'report']) {
    if (map[req] === undefined) throw new Error(`missing required --${req}`);
  }
  return map as unknown as Args;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

/** A deterministic identity of the running verifier: sha256 over its emitted bytes. */
function verifierBuildHash(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const hash = createHash('sha256');
  for (const name of readdirSync(here).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js')).sort()) {
    hash.update(name);
    hash.update(readFileSync(join(here, name)));
  }
  return hash.digest('hex');
}

/** Load persistent state; accept either a VerifierStateV1 or a bootstrap checkpoint doc. */
function loadState(path: string): VerifierStateV1 {
  if (!existsSync(path)) return { bootstrapCheckpoint: {}, highWaterMarks: {} };
  const doc = readJson<Record<string, unknown>>(path);
  if (doc && typeof doc === 'object' && 'minimumSequences' in doc) {
    return bootstrapStateFromCheckpoint(doc);
  }
  return {
    bootstrapCheckpoint: (doc.bootstrapCheckpoint as Record<string, number>) ?? {},
    highWaterMarks: (doc.highWaterMarks as Record<string, number>) ?? {},
  };
}

/** Atomic write: temp file in the same directory + rename over the target. */
function writeAtomic(path: string, contents: string): void {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, contents);
  renameSync(tmp, path);
}

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`usage error: ${(e as Error).message}\n`);
    process.stderr.write(
      'factory-packet-verify --packet <zip> --trust <json> --status <json> --policy <json> --state <json> --report <json> [--now <iso>]\n',
    );
    return 3;
  }

  let outcome;
  try {
    const packetBytes = new Uint8Array(readFileSync(args.packet));
    const trustBundle = readJson<TrustBundleV1>(args.trust);
    const statusBundle = readJson<ReleaseStatusBundleV1>(args.status);
    const policy = readJson<VerifierPolicyV1>(args.policy);
    const state = loadState(args.state);
    const nowIso = args.now ?? new Date().toISOString();

    outcome = await verify({
      packetBytes,
      trustBundle,
      statusBundle,
      policy,
      state,
      nowIso,
      verifierBuildHash: verifierBuildHash(),
    });
  } catch (e) {
    process.stderr.write(`io/parse error: ${(e as Error).message}\n`);
    return 3;
  }

  writeAtomic(args.report, JSON.stringify(outcome.report, null, 2) + '\n');
  if (outcome.report.verdict === 'PASS' && outcome.nextState !== null) {
    writeAtomic(args.state, JSON.stringify(outcome.nextState, null, 2) + '\n');
  }

  process.stdout.write(
    `${outcome.report.verdict} ${outcome.report.codes.join(',') || '-'} ${outcome.report.summary}\n`,
  );
  return outcome.report.verdict === 'PASS' ? 0 : 2;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`fatal: ${(e as Error).message}\n`);
    process.exit(3);
  },
);
