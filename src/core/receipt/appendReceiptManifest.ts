/**
 * appendReceiptManifest.ts - Append Receipt to Manifest Chain
 *
 * Appends a factory receipt to the manifest chain by creating
 * a new manifest that includes the receipt.
 *
 * @version 1.0.0
 */

import type { SignedFactoryReceipt } from './factoryReceiptTypes';
import type { ManifestStore } from '../manifest/manifestStoreTypes';
import type { Keyring } from '../crypto/keyring';
import type { SignedJobManifest } from '../trust/manifestChainTypes';

/**
 * Append receipt result
 */
export type AppendReceiptResult =
  | { ok: true; newHeadHash: string }
  | { ok: false; reason: string };

/**
 * Append a factory receipt to the manifest chain
 *
 * Creates a new manifest that carries forward the current trust state
 * and adds the receipt. Uses dynamic import of buildManifestWithExtras
 * to avoid circular dependencies.
 */
export async function appendReceipt(args: {
  jobId: string;
  store: ManifestStore;
  keyring: Keyring;
  signedReceipt: SignedFactoryReceipt;
  manifestKeyId: string;
  manifestPrivateKeyHex: string;
  createdBy?: string;
}): Promise<AppendReceiptResult> {
  const {
    jobId,
    store,
    signedReceipt,
    manifestKeyId,
    manifestPrivateKeyHex,
    createdBy,
  } = args;

  // Load HEAD
  const headHash = await store.getHead(jobId);
  if (!headHash) {
    return { ok: false, reason: `No HEAD manifest for job: ${jobId}` };
  }

  const head = await store.loadByHash(headHash);
  if (!head) {
    return { ok: false, reason: `HEAD manifest missing: ${headHash}` };
  }

  // Collect existing receipts + new receipt
  const existingReceipts = head.receipts ?? [];
  const allReceipts = [...existingReceipts, signedReceipt];

  // Build new manifest with receipt
  const { buildSignedManifestWithExtras } = await import('../trust/buildManifestWithExtras');

  const newManifest = await buildSignedManifestWithExtras({
    jobId,
    prevManifestHashHex: head.manifestHashHex,
    signedTrust: head.signedTrust,
    exports: head.exports ?? [],
    manifestKeyId,
    manifestPrivateKeyHex,
    createdBy,
    coreExtras: {
      receipts: allReceipts,
      issuePacks: head.issuePacks,
      revision: head.revision,
    },
  });

  // Save + set HEAD
  await store.put(newManifest);
  await store.setHead(jobId, newManifest.manifestHashHex);

  return { ok: true, newHeadHash: newManifest.manifestHashHex };
}
