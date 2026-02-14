/**
 * loadManifestChain.ts - Load Manifest Chain
 *
 * Loads the full manifest chain from HEAD backward to genesis.
 * Used for timeline building and chain proof generation.
 *
 * @version 1.0.0
 */

import type { SignedJobManifest } from '../trust/manifestChainTypes';
import type { ManifestStore } from './manifestStoreTypes';

/**
 * Load manifest chain result
 */
type LoadChainResult =
  | { ok: true; chain: SignedJobManifest[] }
  | { ok: false; reason: string };

/**
 * Load the full manifest chain for a job
 *
 * Walks backward from HEAD to genesis, collecting all manifests.
 * Returns manifests in chronological order (genesis first).
 */
export async function loadManifestChain(args: {
  jobId: string;
  store: ManifestStore;
  maxDepth: number;
}): Promise<LoadChainResult> {
  const { jobId, store, maxDepth } = args;

  // Get HEAD
  const headHash = await store.getHead(jobId);
  if (!headHash) {
    return { ok: false, reason: `No HEAD manifest for job: ${jobId}` };
  }

  const head = await store.loadByHash(headHash);
  if (!head) {
    return { ok: false, reason: `HEAD manifest missing: ${headHash}` };
  }

  // Walk chain backward
  const chain: SignedJobManifest[] = [head];
  let current = head;
  let depth = 0;

  while (current.prevManifestHashHex && depth < maxDepth) {
    const prev = await store.loadByHash(current.prevManifestHashHex);
    if (!prev) {
      return {
        ok: false,
        reason: `Chain broken: missing manifest ${current.prevManifestHashHex}`,
      };
    }
    chain.push(prev);
    current = prev;
    depth++;
  }

  // Reverse to chronological order (genesis first)
  chain.reverse();

  return { ok: true, chain };
}

/**
 * Load a chain proof (subset of chain for bundle inclusion)
 *
 * Returns the most recent `depth` manifests in the chain.
 */
export async function loadChainProof(args: {
  jobId: string;
  store: ManifestStore;
  depth: number;
}): Promise<SignedJobManifest[] | null> {
  const result = await loadManifestChain({
    jobId: args.jobId,
    store: args.store,
    maxDepth: args.depth,
  });

  if (!result.ok) return null;
  return result.chain;
}
