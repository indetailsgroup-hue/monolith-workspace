/**
 * issueId.ts - Deterministic Issue ID Generator
 *
 * Creates stable, unique issue IDs based on:
 * - Pack ID
 * - Issue index within pack
 * - Issue code
 *
 * This ensures the same rejection always produces
 * the same issue IDs (idempotent).
 */

import { sha256CanonicalHex } from '../crypto/sha256';

/**
 * Generate deterministic issue ID
 *
 * @param args.packId - Parent pack ID
 * @param args.index - Issue index within pack
 * @param args.code - Issue code
 * @returns Stable issue ID (ISSUE_ + 16 hex chars)
 */
export async function makeIssueId(args: {
  packId: string;
  index: number;
  code: string;
}): Promise<string> {
  const hash = await sha256CanonicalHex({
    packId: args.packId,
    index: args.index,
    code: args.code,
  });

  return `ISSUE_${hash.slice(0, 16)}`;
}

/**
 * Generate deterministic pack ID
 *
 * @param args - Pack creation parameters
 * @returns Stable pack ID (64 hex chars)
 */
export async function makePackId(args: {
  revisionJobId: string;
  parentReleaseHashHex: string;
  receiptHashHex: string;
  reasons: string[];
}): Promise<string> {
  return sha256CanonicalHex({
    v: 'IssuePack-1.0',
    revisionJobId: args.revisionJobId,
    parentReleaseHashHex: args.parentReleaseHashHex,
    receiptHashHex: args.receiptHashHex,
    reasons: args.reasons,
  });
}
