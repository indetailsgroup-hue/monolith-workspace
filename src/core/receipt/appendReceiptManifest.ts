/**
 * appendReceiptManifest.ts - Append Factory Receipt to Manifest Chain
 *
 * CLOSED-LOOP:
 * 1. Factory verifies bundle and signs receipt
 * 2. Receipt is sent back to design system
 * 3. This function verifies receipt and appends to chain
 * 4. New manifest becomes HEAD (includes receipt in core)
 *
 * CHAIN INTEGRITY:
 * - Receipt is included in manifest core (hashed and signed)
 * - Full audit trail from design to factory acceptance
 */

import type { ManifestStore } from '../manifest/manifestStoreTypes';
import type { Keyring } from '../crypto/keyring';
import type { SignedFactoryReceipt } from './factoryReceiptTypes';
import type { SignedJobManifest } from '../trust/manifestChainTypes';
import { verifySignedFactoryReceipt } from './verifyFactoryReceipt';
import { buildSignedManifestWithExtras } from '../trust/buildManifestWithExtras';

// ============================================
// APPEND RECEIPT RESULT
// ============================================

/**
 * Result of appending receipt to chain
 */
export interface AppendReceiptResult {
  ok: boolean;
  reason?: string;
  newHeadHash?: string;
  newManifest?: SignedJobManifest;
}

// ============================================
// APPEND RECEIPT
// ============================================

/**
 * Append factory receipt to manifest chain
 *
 * PROCESS:
 * 1. Load current HEAD manifest
 * 2. Verify receipt signature
 * 3. Verify receipt references current HEAD
 * 4. Build new manifest with receipt in core
 * 5. Store and set as new HEAD
 *
 * @param args.jobId - Job ID
 * @param args.store - Manifest store
 * @param args.keyring - Keyring with factory public keys
 * @param args.signedReceipt - Signed factory receipt
 * @param args.manifestKeyId - Key ID for manifest signature
 * @param args.manifestPrivateKeyHex - Private key for manifest signing
 * @param args.createdBy - Optional creator identifier
 * @returns Result with new HEAD hash
 *
 * @example
 * const result = await appendReceipt({
 *   jobId: 'job-001',
 *   store: manifestStore,
 *   keyring: factoryKeyring,
 *   signedReceipt: receiptFromFactory,
 *   manifestKeyId: 'manifest-key-001',
 *   manifestPrivateKeyHex: process.env.MANIFEST_PRIVATE_KEY,
 * });
 *
 * if (result.ok) {
 *   console.log('Receipt appended! New HEAD:', result.newHeadHash);
 * }
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
    keyring,
    signedReceipt,
    manifestKeyId,
    manifestPrivateKeyHex,
    createdBy,
  } = args;

  // 1. Load current HEAD
  const headHash = await store.getHead(jobId);
  if (!headHash) {
    return { ok: false, reason: 'No HEAD manifest found for job' };
  }

  const head = await store.loadByHash(headHash);
  if (!head) {
    return { ok: false, reason: 'HEAD manifest missing from store' };
  }

  // 2. Verify receipt signature
  const verifyResult = await verifySignedFactoryReceipt({
    signed: signedReceipt,
    keyring,
  });

  if (!verifyResult.ok) {
    return { ok: false, reason: `Receipt verification failed: ${verifyResult.reason}` };
  }

  // 3. Verify receipt references current HEAD
  if (signedReceipt.receipt.headManifestHashHex !== head.manifestHashHex) {
    return {
      ok: false,
      reason: `Receipt references manifest ${signedReceipt.receipt.headManifestHashHex}, but current HEAD is ${head.manifestHashHex}`,
    };
  }

  // 4. Collect existing receipts and add new one
  const existingReceipts = (head as any).receipts ?? [];
  const receipts = [...existingReceipts, signedReceipt];

  // 5. Build new manifest with receipts in core
  const newManifest = await buildSignedManifestWithExtras({
    jobId,
    prevManifestHashHex: head.manifestHashHex,
    signedTrust: head.signedTrust,
    exports: head.exports ?? [],
    manifestKeyId,
    manifestPrivateKeyHex,
    createdBy,
    coreExtras: { receipts },
  });

  // 6. Store and set HEAD
  await store.put(newManifest);
  await store.setHead(jobId, newManifest.manifestHashHex);

  return {
    ok: true,
    newHeadHash: newManifest.manifestHashHex,
    newManifest,
  };
}

// ============================================
// BATCH APPEND
// ============================================

/**
 * Append multiple receipts to chain
 *
 * Each receipt is appended sequentially (order matters for chain).
 */
export async function appendReceiptBatch(args: {
  jobId: string;
  store: ManifestStore;
  keyring: Keyring;
  signedReceipts: SignedFactoryReceipt[];
  manifestKeyId: string;
  manifestPrivateKeyHex: string;
  createdBy?: string;
}): Promise<{
  ok: boolean;
  appended: number;
  failed: number;
  results: AppendReceiptResult[];
  finalHeadHash?: string;
}> {
  const results: AppendReceiptResult[] = [];
  let appended = 0;
  let failed = 0;
  let finalHeadHash: string | undefined;

  for (const signedReceipt of args.signedReceipts) {
    const result = await appendReceipt({
      ...args,
      signedReceipt,
    });

    results.push(result);

    if (result.ok) {
      appended++;
      finalHeadHash = result.newHeadHash;
    } else {
      failed++;
    }
  }

  return {
    ok: failed === 0,
    appended,
    failed,
    results,
    finalHeadHash,
  };
}
