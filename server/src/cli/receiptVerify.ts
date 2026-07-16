#!/usr/bin/env node
/**
 * receiptVerify.ts - P13.2 Offline Receipt Verification CLI
 *
 * Verifies export ZIP artifacts offline using embedded receipt.json.
 * Validates signatures, hashes, and proof invariants.
 *
 * Usage:
 *   npx monolith-receipt-verify <path-to-zip>
 *   node dist/cli/receiptVerify.js <path-to-zip>
 *
 * @version 0.13.2
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { createHash } from 'crypto';
import { extractReceiptFromZip, computeContentHash, extractZipEntries } from './zipExtract.js';
import { verifyReceiptSignature } from '../crypto/verifyReceiptSig.js';
import { verifyReceiptId } from '../export/exportReceipt.js';
import type { ExportReceipt } from '../export/exportReceiptTypes.js';
import { RECEIPT_VERSION } from '../export/exportReceiptTypes.js';

// ============================================================================
// Types
// ============================================================================

export const CLI_VERSION = 'MONOLITH_RECEIPT_VERIFY_V1' as const;

export type VerifyCode =
  | 'R_OK'
  | 'R_FILE_NOT_FOUND'
  | 'R_NOT_A_ZIP'
  | 'R_NO_RECEIPT'
  | 'R_INVALID_RECEIPT_JSON'
  | 'R_SCHEMA_MISMATCH'
  | 'R_RECEIPT_ID_MISMATCH'
  | 'R_CONTENT_HASH_MISMATCH'
  | 'R_ZIP_HASH_MISMATCH'
  | 'R_SIG_INVALID'
  | 'R_SIG_KEY_UNKNOWN'
  | 'R_SIG_KEY_REVOKED'
  | 'R_SIG_KEY_EXPIRED'
  | 'R_PROOF_WARNINGS'
  | 'R_INTERNAL_ERROR';

export interface CliVerifyResult {
  version: typeof CLI_VERSION;
  verdict: 'PASS' | 'FAIL';
  code: VerifyCode;
  summary: string;
  zipSha256?: string;
  contentSha256?: string;
  receiptId?: string;
  keyId?: string;
  warnings: string[];
  details?: Record<string, unknown>;
}

// ============================================================================
// Main Verification Logic
// ============================================================================

export async function verifyReceiptZip(zipPath: string): Promise<CliVerifyResult> {
  const warnings: string[] = [];

  // 1. Check file exists
  const absolutePath = resolve(zipPath);
  if (!existsSync(absolutePath)) {
    return {
      version: CLI_VERSION,
      verdict: 'FAIL',
      code: 'R_FILE_NOT_FOUND',
      summary: `File not found: ${absolutePath}`,
      warnings: [],
    };
  }

  // 2. Read ZIP file
  let zipBuffer: Buffer;
  try {
    zipBuffer = readFileSync(absolutePath);
  } catch (err) {
    return {
      version: CLI_VERSION,
      verdict: 'FAIL',
      code: 'R_NOT_A_ZIP',
      summary: `Cannot read file: ${err instanceof Error ? err.message : 'unknown error'}`,
      warnings: [],
    };
  }

  // 3. Compute ZIP hash
  const zipSha256 = createHash('sha256').update(zipBuffer).digest('hex');

  // 4. Extract receipt.json
  let receipt: ExportReceipt;
  let entries: Map<string, Buffer>;
  try {
    entries = await extractZipEntries(zipBuffer);
    const receiptBuffer = entries.get('receipt.json');
    if (!receiptBuffer) {
      return {
        version: CLI_VERSION,
        verdict: 'FAIL',
        code: 'R_NO_RECEIPT',
        summary: 'ZIP does not contain receipt.json',
        zipSha256,
        warnings: [],
      };
    }
    receipt = JSON.parse(receiptBuffer.toString('utf-8'));
  } catch (err) {
    return {
      version: CLI_VERSION,
      verdict: 'FAIL',
      code: 'R_INVALID_RECEIPT_JSON',
      summary: `Invalid receipt.json: ${err instanceof Error ? err.message : 'parse error'}`,
      zipSha256,
      warnings: [],
    };
  }

  // 5. Validate schema version
  if (receipt.version !== RECEIPT_VERSION) {
    return {
      version: CLI_VERSION,
      verdict: 'FAIL',
      code: 'R_SCHEMA_MISMATCH',
      summary: `Schema mismatch: expected ${RECEIPT_VERSION}, got ${receipt.version}`,
      zipSha256,
      receiptId: receipt.receiptId,
      warnings: [],
    };
  }

  // 6. Verify receiptId (canonical hash)
  if (!verifyReceiptId(receipt)) {
    return {
      version: CLI_VERSION,
      verdict: 'FAIL',
      code: 'R_RECEIPT_ID_MISMATCH',
      summary: 'Receipt ID does not match canonical content hash',
      zipSha256,
      receiptId: receipt.receiptId,
      warnings: [],
    };
  }

  // 7. Compute content hash (ZIP without receipt.json)
  let contentSha256: string;
  try {
    contentSha256 = await computeContentHash(zipBuffer);
  } catch (err) {
    return {
      version: CLI_VERSION,
      verdict: 'FAIL',
      code: 'R_INTERNAL_ERROR',
      summary: `Failed to compute content hash: ${err instanceof Error ? err.message : 'unknown'}`,
      zipSha256,
      receiptId: receipt.receiptId,
      warnings: [],
    };
  }

  // 8. Validate contentSha256
  if (receipt.contentSha256 !== contentSha256) {
    return {
      version: CLI_VERSION,
      verdict: 'FAIL',
      code: 'R_CONTENT_HASH_MISMATCH',
      summary: `Content hash mismatch: expected ${receipt.contentSha256}, computed ${contentSha256}`,
      zipSha256,
      contentSha256,
      receiptId: receipt.receiptId,
      warnings: [],
    };
  }

  // 9. Validate zipSha256 (if present in receipt)
  if (receipt.zipSha256 && receipt.zipSha256 !== zipSha256) {
    return {
      version: CLI_VERSION,
      verdict: 'FAIL',
      code: 'R_ZIP_HASH_MISMATCH',
      summary: `ZIP hash mismatch: expected ${receipt.zipSha256}, computed ${zipSha256}`,
      zipSha256,
      contentSha256,
      receiptId: receipt.receiptId,
      warnings: [],
    };
  }

  // 10. Verify signature
  const sigResult = verifyReceiptSignature(receipt, { allowUnsigned: true });
  const keyId = receipt.signature?.keyId;

  if (receipt.signature?.alg === 'none') {
    warnings.push('Receipt is unsigned (alg: none)');
  } else if (!sigResult.ok) {
    // Signature verification failed
    let code: VerifyCode = 'R_SIG_INVALID';
    if (sigResult.error === 'UNKNOWN_KEY') code = 'R_SIG_KEY_UNKNOWN';
    if (sigResult.error === 'KEY_REVOKED') code = 'R_SIG_KEY_REVOKED';
    if (sigResult.error === 'KEY_EXPIRED') code = 'R_SIG_KEY_EXPIRED';

    return {
      version: CLI_VERSION,
      verdict: 'FAIL',
      code,
      summary: sigResult.message,
      zipSha256,
      contentSha256,
      receiptId: receipt.receiptId,
      keyId,
      warnings,
    };
  }

  // 11. Check proof warnings
  if (receipt.proof.warnings && receipt.proof.warnings.length > 0) {
    for (const w of receipt.proof.warnings) {
      warnings.push(`PROOF_WARNING: ${w.code} - ${w.message}`);
    }
  }

  // 12. All checks passed
  return {
    version: CLI_VERSION,
    verdict: 'PASS',
    code: 'R_OK',
    summary: 'Receipt verification passed',
    zipSha256,
    contentSha256,
    receiptId: receipt.receiptId,
    keyId,
    warnings,
    details: {
      jobId: receipt.jobId,
      generatedAt: receipt.generatedAt,
      exportTarget: receipt.export.target,
      exportDialect: receipt.export.dialect,
      proofCanExport: receipt.proof.canExport,
    },
  };
}

// ============================================================================
// Output Formatter
// ============================================================================

export function formatVerifyOutput(result: CliVerifyResult): string {
  const lines: string[] = [
    result.version,
    `VERDICT: ${result.verdict}`,
    `CODE: ${result.code}`,
    `SUMMARY: ${result.summary}`,
  ];

  if (result.zipSha256) {
    lines.push(`ZIP_SHA256: ${result.zipSha256}`);
  }
  if (result.contentSha256) {
    lines.push(`CONTENT_SHA256: ${result.contentSha256}`);
  }
  if (result.receiptId) {
    lines.push(`RECEIPT_ID: ${result.receiptId}`);
  }
  if (result.keyId) {
    lines.push(`KEY_ID: ${result.keyId}`);
  }

  lines.push(`WARNINGS: ${result.warnings.length}`);
  for (const w of result.warnings) {
    lines.push(`  - ${w}`);
  }

  return lines.join('\n');
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
MONOLITH Receipt Verification CLI (P13.2)

Usage:
  monolith-receipt-verify <path-to-zip> [options]

Options:
  --json        Output as JSON instead of text
  --strict      Fail on any warnings (including unsigned)
  --help, -h    Show this help message

Examples:
  monolith-receipt-verify export.zip
  monolith-receipt-verify ./downloads/job_123_CUTLIST_CSV.zip --json
`);
    process.exit(0);
  }

  const zipPath = args[0];
  const jsonOutput = args.includes('--json');
  const strict = args.includes('--strict');

  try {
    const result = await verifyReceiptZip(zipPath);

    // Strict mode: treat warnings as failure
    if (strict && result.verdict === 'PASS' && result.warnings.length > 0) {
      result.verdict = 'FAIL';
      result.code = 'R_PROOF_WARNINGS';
      result.summary = `Strict mode: ${result.warnings.length} warning(s) treated as failure`;
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatVerifyOutput(result));
    }

    process.exit(result.verdict === 'PASS' ? 0 : 1);
  } catch (err) {
    const errorResult: CliVerifyResult = {
      version: CLI_VERSION,
      verdict: 'FAIL',
      code: 'R_INTERNAL_ERROR',
      summary: err instanceof Error ? err.message : 'Unknown error',
      warnings: [],
    };

    if (jsonOutput) {
      console.log(JSON.stringify(errorResult, null, 2));
    } else {
      console.log(formatVerifyOutput(errorResult));
    }

    process.exit(1);
  }
}

// Run only when executed directly as a CLI — never on import (tests, other modules).
const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
