/**
 * generateFactoryChecklist.ts - Factory Acceptance Checklist
 *
 * Generates a checklist for factory inspectors to verify
 * before accepting or rejecting a job.
 *
 * @version 1.0.0
 */

import type { ManifestStore } from '../manifest/manifestStoreTypes';
import type { Keyring } from '../crypto/keyring';
import type { SignedJobManifest } from '../trust/manifestChainTypes';
import { verifyChain } from '../trust/verifyManifestChain';

/**
 * Single checklist item
 */
export interface ChecklistItem {
  /** Item ID */
  id: string;
  /** Category */
  category: 'CHAIN' | 'GATE' | 'SPEC' | 'EXPORT' | 'ISSUE';
  /** Description */
  description: string;
  /** Status */
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  /** Detail message */
  detail?: string;
}

/**
 * Factory acceptance checklist
 */
export interface FactoryAcceptanceChecklist {
  /** Job ID */
  jobId: string;
  /** Checklist items */
  items: ChecklistItem[];
  /** Overall status */
  status: 'READY' | 'PENDING' | 'ISSUE';
  /** Head manifest hash */
  headManifestHashHex: string;
  /** Generated timestamp */
  createdIso: string;
}

/**
 * Generate factory acceptance checklist
 */
export async function generateFactoryChecklist(args: {
  jobId: string;
  store: ManifestStore;
  keyring: Keyring;
  maxDepth: number;
}): Promise<
  | { ok: true; checklist: FactoryAcceptanceChecklist }
  | { ok: false; reason: string }
> {
  const { jobId, store, keyring, maxDepth } = args;

  // Load HEAD
  const headHash = await store.getHead(jobId);
  if (!headHash) {
    return { ok: false, reason: `No HEAD manifest for job: ${jobId}` };
  }

  const head = await store.loadByHash(headHash);
  if (!head) {
    return { ok: false, reason: `HEAD manifest missing: ${headHash}` };
  }

  const items: ChecklistItem[] = [];

  // 1. Chain integrity
  const chainResult = await verifyChain({ head, keyring, store, maxDepth });
  items.push({
    id: 'CHAIN_INTEGRITY',
    category: 'CHAIN',
    description: 'Manifest chain integrity verified',
    status: chainResult.ok ? 'PASS' : 'FAIL',
    detail: chainResult.ok
      ? `Chain length: ${chainResult.chainLength}`
      : `Chain error: ${chainResult.reason}`,
  });

  // 2. Gate status
  const gateOk = !!head.signedTrust?.trust?.gate?.ok;
  items.push({
    id: 'GATE_STATUS',
    category: 'GATE',
    description: 'Gate validation passed',
    status: gateOk ? 'PASS' : 'FAIL',
    detail: gateOk
      ? 'All manufacturing constraints met'
      : `Gate errors: ${head.signedTrust?.trust?.gate?.errorCount ?? 'unknown'}`,
  });

  // 3. Spec state
  const specState = head.signedTrust?.trust?.spec?.state ?? 'DRAFT';
  items.push({
    id: 'SPEC_STATE',
    category: 'SPEC',
    description: 'Spec in RELEASED state',
    status: specState === 'RELEASED' ? 'PASS' : specState === 'FROZEN' ? 'WARN' : 'FAIL',
    detail: `Current state: ${specState}`,
  });

  // 4. Export bundles
  const exportsCount = head.exports?.length ?? 0;
  items.push({
    id: 'EXPORT_BUNDLES',
    category: 'EXPORT',
    description: 'At least one export bundle recorded',
    status: exportsCount > 0 ? 'PASS' : 'FAIL',
    detail: `Export count: ${exportsCount}`,
  });

  // 5. Blocking issues
  const allIssues = (head.issuePacks ?? []).flatMap((p) => p.items);
  const blocking = allIssues.filter(
    (i) => i.severity === 'ERROR' && (i.status === 'OPEN' || i.status === 'IN_PROGRESS')
  );
  items.push({
    id: 'BLOCKING_ISSUES',
    category: 'ISSUE',
    description: 'No blocking issues',
    status: blocking.length === 0 ? 'PASS' : 'FAIL',
    detail: blocking.length === 0
      ? 'No blocking issues found'
      : `${blocking.length} blocking issue(s)`,
  });

  // Determine overall status
  const hasFailure = items.some((i) => i.status === 'FAIL');
  const hasWarning = items.some((i) => i.status === 'WARN');
  const status: FactoryAcceptanceChecklist['status'] = hasFailure
    ? 'ISSUE'
    : hasWarning
      ? 'PENDING'
      : 'READY';

  return {
    ok: true,
    checklist: {
      jobId,
      items,
      status,
      headManifestHashHex: headHash,
      createdIso: new Date().toISOString(),
    },
  };
}
