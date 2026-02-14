/**
 * verifyPacket.ts - Client-side Packet Verification
 *
 * Verifies factory packet integrity:
 * - File hash verification (SHA-256)
 * - Content hash verification
 * - Schema validation
 * - Gate status check
 *
 * @version 1.0.0 - Phase C: Factory Ingest & Verify
 */

import type { FactoryPacket, PacketManifest, FACTORY_PACKET_SCHEMA } from './types';
import { sha256, verifyFileHash, computeContentHash } from './manifestHash';
import { unzipPacket, type UnzipResult } from './unzipPacket';

// ============================================
// TYPES
// ============================================

export type VerifyCheckId =
  | 'MANIFEST_PRESENT'
  | 'SCHEMA_VALID'
  | 'FILES_COMPLETE'
  | 'HASHES_MATCH'
  | 'CONTENT_HASH'
  | 'GATE_PASSED'
  | 'NO_EXTRA_FILES';

export type VerifyStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';

export interface VerifyCheck {
  id: VerifyCheckId;
  name: string;
  status: VerifyStatus;
  message: string;
  details?: string;
}

export interface VerifyPacketResult {
  /** Overall verification passed */
  valid: boolean;
  /** Timestamp of verification */
  timestamp: number;
  /** Individual check results */
  checks: VerifyCheck[];
  /** Summary counts */
  summary: {
    passed: number;
    failed: number;
    warned: number;
    skipped: number;
  };
  /** The verified packet (if extraction succeeded) */
  packet?: FactoryPacket;
  /** Extraction result */
  extraction?: UnzipResult;
  /** Files that failed hash verification */
  hashMismatches: string[];
  /** Files missing from manifest */
  missingFiles: string[];
  /** Extra files not in manifest */
  extraFiles: string[];
}

export interface VerifyOptions {
  /** Skip gate check (allow failed gate) */
  allowFailedGate?: boolean;
  /** Skip extra files check */
  allowExtraFiles?: boolean;
  /** Skip content hash check */
  skipContentHash?: boolean;
}

// ============================================
// MAIN VERIFICATION
// ============================================

/**
 * Verify a factory packet from ZIP data.
 *
 * @param zipData - ZIP file data
 * @param options - Verification options
 * @returns Verification result
 */
export async function verifyPacket(
  zipData: ArrayBuffer | Blob | Uint8Array,
  options: VerifyOptions = {}
): Promise<VerifyPacketResult> {
  const checks: VerifyCheck[] = [];
  const hashMismatches: string[] = [];
  const missingFiles: string[] = [];
  const extraFiles: string[] = [];

  // Step 1: Extract ZIP
  const extraction = await unzipPacket(zipData);

  if (!extraction.success) {
    checks.push({
      id: 'MANIFEST_PRESENT',
      name: 'Manifest Present',
      status: 'FAIL',
      message: 'Failed to extract packet',
      details: extraction.errors.join('\n'),
    });

    return buildResult(false, checks, {
      extraction,
      hashMismatches,
      missingFiles,
      extraFiles,
    });
  }

  const { packet, files } = extraction;

  // Step 2: Check manifest present and valid
  checks.push({
    id: 'MANIFEST_PRESENT',
    name: 'Manifest Present',
    status: 'PASS',
    message: 'manifest.json found and parsed',
  });

  // Step 3: Validate schema
  const schemaCheck = validateSchema(packet!.manifest);
  checks.push(schemaCheck);

  // Step 4: Check all manifest files present
  const fileCheck = await checkFilesComplete(packet!.manifest, files);
  checks.push(fileCheck.check);
  missingFiles.push(...fileCheck.missing);

  // Step 5: Verify file hashes
  const hashCheck = await verifyFileHashes(packet!.manifest, files);
  checks.push(hashCheck.check);
  hashMismatches.push(...hashCheck.mismatches);

  // Step 6: Verify content hash (optional)
  if (!options.skipContentHash) {
    const contentCheck = await verifyContentHashIntegrity(packet!.manifest, files);
    checks.push(contentCheck);
  } else {
    checks.push({
      id: 'CONTENT_HASH',
      name: 'Content Hash',
      status: 'SKIP',
      message: 'Skipped by option',
    });
  }

  // Step 7: Check gate status
  const gateCheck = checkGateStatus(packet!, options.allowFailedGate);
  checks.push(gateCheck);

  // Step 8: Check for extra files (warning)
  const extraCheck = checkExtraFiles(packet!.manifest, files);
  if (!options.allowExtraFiles && extraCheck.extra.length > 0) {
    checks.push({
      id: 'NO_EXTRA_FILES',
      name: 'No Extra Files',
      status: 'WARN',
      message: `${extraCheck.extra.length} extra file(s) found`,
      details: extraCheck.extra.join(', '),
    });
  } else if (extraCheck.extra.length === 0) {
    checks.push({
      id: 'NO_EXTRA_FILES',
      name: 'No Extra Files',
      status: 'PASS',
      message: 'All files accounted for',
    });
  } else {
    checks.push({
      id: 'NO_EXTRA_FILES',
      name: 'No Extra Files',
      status: 'SKIP',
      message: 'Extra files allowed by option',
    });
  }
  extraFiles.push(...extraCheck.extra);

  // Determine overall validity
  const criticalFailed = checks.filter(
    (c) => c.status === 'FAIL' && !['NO_EXTRA_FILES'].includes(c.id)
  ).length > 0;

  return buildResult(!criticalFailed, checks, {
    packet,
    extraction,
    hashMismatches,
    missingFiles,
    extraFiles,
  });
}

/**
 * Verify a factory packet from a File object.
 */
export async function verifyPacketFromFile(
  file: File,
  options?: VerifyOptions
): Promise<VerifyPacketResult> {
  const arrayBuffer = await file.arrayBuffer();
  return verifyPacket(arrayBuffer, options);
}

/**
 * Quick verification - just check manifest and hashes, skip gate.
 */
export async function quickVerifyPacket(
  zipData: ArrayBuffer | Blob | Uint8Array
): Promise<{ valid: boolean; errors: string[] }> {
  const result = await verifyPacket(zipData, {
    allowFailedGate: true,
    allowExtraFiles: true,
    skipContentHash: true,
  });

  const errors = result.checks
    .filter((c) => c.status === 'FAIL')
    .map((c) => `${c.name}: ${c.message}`);

  return { valid: result.valid, errors };
}

// ============================================
// CHECK IMPLEMENTATIONS
// ============================================

function validateSchema(manifest: PacketManifest): VerifyCheck {
  const expectedSchema = 'monolith.factory.packet@1.0';

  if (!manifest.schema) {
    return {
      id: 'SCHEMA_VALID',
      name: 'Schema Valid',
      status: 'FAIL',
      message: 'Missing schema field',
    };
  }

  if (manifest.schema !== expectedSchema) {
    return {
      id: 'SCHEMA_VALID',
      name: 'Schema Valid',
      status: 'WARN',
      message: `Unexpected schema: ${manifest.schema}`,
      details: `Expected: ${expectedSchema}`,
    };
  }

  return {
    id: 'SCHEMA_VALID',
    name: 'Schema Valid',
    status: 'PASS',
    message: `Schema: ${manifest.schema}`,
  };
}

async function checkFilesComplete(
  manifest: PacketManifest,
  files: Map<string, string>
): Promise<{ check: VerifyCheck; missing: string[] }> {
  const missing: string[] = [];

  for (const entry of manifest.files) {
    if (!files.has(entry.path)) {
      missing.push(entry.path);
    }
  }

  if (missing.length > 0) {
    return {
      check: {
        id: 'FILES_COMPLETE',
        name: 'Files Complete',
        status: 'FAIL',
        message: `${missing.length} file(s) missing`,
        details: missing.join(', '),
      },
      missing,
    };
  }

  return {
    check: {
      id: 'FILES_COMPLETE',
      name: 'Files Complete',
      status: 'PASS',
      message: `${manifest.files.length} files verified`,
    },
    missing: [],
  };
}

async function verifyFileHashes(
  manifest: PacketManifest,
  files: Map<string, string>
): Promise<{ check: VerifyCheck; mismatches: string[] }> {
  const mismatches: string[] = [];

  for (const entry of manifest.files) {
    const content = files.get(entry.path);
    if (!content) continue; // Already caught in FILES_COMPLETE

    const matches = await verifyFileHash(content, entry.sha256);
    if (!matches) {
      mismatches.push(entry.path);
    }
  }

  if (mismatches.length > 0) {
    return {
      check: {
        id: 'HASHES_MATCH',
        name: 'Hashes Match',
        status: 'FAIL',
        message: `${mismatches.length} file(s) have hash mismatch`,
        details: mismatches.join(', '),
      },
      mismatches,
    };
  }

  return {
    check: {
      id: 'HASHES_MATCH',
      name: 'Hashes Match',
      status: 'PASS',
      message: 'All file hashes verified',
    },
    mismatches: [],
  };
}

async function verifyContentHashIntegrity(
  manifest: PacketManifest,
  files: Map<string, string>
): Promise<VerifyCheck> {
  if (!manifest.contentHash) {
    return {
      id: 'CONTENT_HASH',
      name: 'Content Hash',
      status: 'WARN',
      message: 'No content hash in manifest',
    };
  }

  // Recompute content hash from file hashes
  const fileHashes = manifest.files.map((f) => f.sha256);
  const computedHash = await computeContentHash(fileHashes);

  if (computedHash !== manifest.contentHash) {
    return {
      id: 'CONTENT_HASH',
      name: 'Content Hash',
      status: 'FAIL',
      message: 'Content hash mismatch',
      details: `Expected: ${manifest.contentHash.slice(0, 16)}...\nActual: ${computedHash.slice(0, 16)}...`,
    };
  }

  return {
    id: 'CONTENT_HASH',
    name: 'Content Hash',
    status: 'PASS',
    message: `Content hash verified: ${manifest.contentHash.slice(0, 16)}...`,
  };
}

function checkGateStatus(
  packet: FactoryPacket,
  allowFailedGate?: boolean
): VerifyCheck {
  const gateResult = packet.gateResult;

  if (!gateResult) {
    return {
      id: 'GATE_PASSED',
      name: 'Gate Passed',
      status: 'WARN',
      message: 'No gate result in packet',
    };
  }

  if (gateResult.passed) {
    return {
      id: 'GATE_PASSED',
      name: 'Gate Passed',
      status: 'PASS',
      message: `Gate passed (policy: ${gateResult.policyVersion})`,
      details: `Blockers: ${gateResult.summary.blockerCount}, Warnings: ${gateResult.summary.warningCount}`,
    };
  }

  // Gate failed
  if (allowFailedGate) {
    return {
      id: 'GATE_PASSED',
      name: 'Gate Passed',
      status: 'WARN',
      message: 'Gate FAILED (allowed by option)',
      details: `${gateResult.summary.blockerCount} blocker(s)`,
    };
  }

  return {
    id: 'GATE_PASSED',
    name: 'Gate Passed',
    status: 'FAIL',
    message: `Gate FAILED: ${gateResult.summary.blockerCount} blocker(s)`,
    details: gateResult.findings.blockers
      .map((b) => `- ${b.code}: ${b.message}`)
      .join('\n'),
  };
}

function checkExtraFiles(
  manifest: PacketManifest,
  files: Map<string, string>
): { extra: string[] } {
  const manifestPaths = new Set(manifest.files.map((f) => f.path));
  // Also include manifest.json itself
  manifestPaths.add('manifest.json');

  const extra: string[] = [];
  for (const path of files.keys()) {
    if (!manifestPaths.has(path)) {
      extra.push(path);
    }
  }

  return { extra };
}

// ============================================
// HELPERS
// ============================================

function buildResult(
  valid: boolean,
  checks: VerifyCheck[],
  extras: Partial<VerifyPacketResult>
): VerifyPacketResult {
  const summary = {
    passed: checks.filter((c) => c.status === 'PASS').length,
    failed: checks.filter((c) => c.status === 'FAIL').length,
    warned: checks.filter((c) => c.status === 'WARN').length,
    skipped: checks.filter((c) => c.status === 'SKIP').length,
  };

  return {
    valid,
    timestamp: Date.now(),
    checks,
    summary,
    hashMismatches: [],
    missingFiles: [],
    extraFiles: [],
    ...extras,
  };
}

/**
 * Format verification result for display.
 */
export function formatVerifyResult(result: VerifyPacketResult): string {
  const lines: string[] = [];

  lines.push(`Verification ${result.valid ? 'PASSED' : 'FAILED'}`);
  lines.push('─'.repeat(40));

  for (const check of result.checks) {
    const icon =
      check.status === 'PASS'
        ? '✓'
        : check.status === 'FAIL'
          ? '✗'
          : check.status === 'WARN'
            ? '⚠'
            : '○';
    lines.push(`${icon} ${check.name}: ${check.message}`);
  }

  lines.push('─'.repeat(40));
  lines.push(
    `Summary: ${result.summary.passed} passed, ${result.summary.failed} failed, ${result.summary.warned} warned`
  );

  return lines.join('\n');
}

/**
 * Get critical errors from verification result.
 */
export function getVerifyErrors(result: VerifyPacketResult): string[] {
  return result.checks
    .filter((c) => c.status === 'FAIL')
    .map((c) => `${c.name}: ${c.message}`);
}

/**
 * Get warnings from verification result.
 */
export function getVerifyWarnings(result: VerifyPacketResult): string[] {
  return result.checks
    .filter((c) => c.status === 'WARN')
    .map((c) => `${c.name}: ${c.message}`);
}
