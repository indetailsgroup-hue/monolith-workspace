/**
 * loadManifestChain.ts - Load Manifest Chain from HEAD
 *
 * Loads the complete manifest chain from HEAD back to genesis
 * (or up to maxDepth). Used for Chain Viewer UI and auditing.
 */

import type { ManifestStore } from './manifestStoreTypes';
import type { SignedJobManifest } from '../trust/manifestChainTypes';

// ============================================
// TYPES
// ============================================

export interface LoadChainResult {
  ok: true;
  headHash: string;
  chain: SignedJobManifest[];
  reachedGenesis: boolean;
}

export interface LoadChainError {
  ok: false;
  reason: string;
}

export type LoadChainOutcome = LoadChainResult | LoadChainError;

// ============================================
// LOAD CHAIN
// ============================================

/**
 * Load manifest chain from HEAD back to genesis
 *
 * @param args.jobId - Job identifier
 * @param args.store - Manifest store
 * @param args.maxDepth - Maximum chain depth to load (default: 50)
 * @returns Chain array (HEAD first) or error
 */
export async function loadManifestChain(args: {
  jobId: string;
  store: ManifestStore;
  maxDepth?: number;
}): Promise<LoadChainOutcome> {
  const { jobId, store, maxDepth = 50 } = args;

  const headHash = await store.getHead(jobId);
  if (!headHash) {
    return { ok: false, reason: 'No HEAD manifest for job' };
  }

  const chain: SignedJobManifest[] = [];
  let currentHash: string | null = headHash;
  let reachedGenesis = false;

  for (let i = 0; i < maxDepth; i++) {
    if (!currentHash) {
      reachedGenesis = true;
      break;
    }

    const manifest = await store.loadByHash(currentHash);
    if (!manifest) {
      return {
        ok: false,
        reason: `Missing manifest in chain: ${currentHash}`,
      };
    }

    chain.push(manifest);

    // Move to previous
    currentHash = manifest.prevManifestHashHex;

    // Check if genesis
    if (currentHash === null) {
      reachedGenesis = true;
      break;
    }
  }

  return {
    ok: true,
    headHash,
    chain,
    reachedGenesis,
  };
}

/**
 * Load specific depth of chain (for proof bundle)
 */
export async function loadChainProof(args: {
  jobId: string;
  store: ManifestStore;
  depth: number;
}): Promise<SignedJobManifest[]> {
  const result = await loadManifestChain({
    jobId: args.jobId,
    store: args.store,
    maxDepth: args.depth,
  });

  if (!result.ok) {
    return [];
  }

  return result.chain;
}

/**
 * Get chain statistics
 */
export function getChainStats(chain: SignedJobManifest[]): {
  length: number;
  totalExports: number;
  gateOkCount: number;
  gateBlockedCount: number;
  oldestIso: string | null;
  newestIso: string | null;
} {
  let totalExports = 0;
  let gateOkCount = 0;
  let gateBlockedCount = 0;

  for (const m of chain) {
    totalExports += m.exports?.length ?? 0;
    if (m.signedTrust?.trust?.gate?.ok) {
      gateOkCount++;
    } else {
      gateBlockedCount++;
    }
  }

  const oldest = chain.length > 0 ? chain[chain.length - 1].createdIso : null;
  const newest = chain.length > 0 ? chain[0].createdIso : null;

  return {
    length: chain.length,
    totalExports,
    gateOkCount,
    gateBlockedCount,
    oldestIso: oldest,
    newestIso: newest,
  };
}
