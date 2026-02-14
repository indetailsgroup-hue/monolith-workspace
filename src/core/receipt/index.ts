/**
 * Receipt Module - Factory Receipt for Closed-Loop Verification
 *
 * EXPORTS:
 * - Types: FactoryReceipt, SignedFactoryReceipt
 * - Sign: signFactoryReceipt
 * - Verify: verifySignedFactoryReceipt
 * - Chain: appendReceipt
 */

// Types
export type {
  FactoryReceiptVersion,
  FactoryVerdict,
  FactoryReceipt,
  SignedFactoryReceipt,
} from './factoryReceiptTypes';

export {
  createReceiptTemplate,
  createRejectionReceipt,
  validateReceiptStructure,
  validateSignedReceiptStructure,
} from './factoryReceiptTypes';

// Signing
export { signFactoryReceipt, signReceiptFromTemplate } from './signFactoryReceipt';

// Verification
export type { ReceiptVerificationResult } from './verifyFactoryReceipt';

export {
  verifySignedFactoryReceipt,
  verifyReceiptBatch,
  verifyReceiptManifestLink,
  verifyReceiptSnapshotLink,
} from './verifyFactoryReceipt';

// Chain append
export type { AppendReceiptResult } from './appendReceiptManifest';

export { appendReceipt, appendReceiptBatch } from './appendReceiptManifest';
