/**
 * crypto/index.ts - P13.1 Crypto Module Exports
 *
 * Exports receipt signing and verification utilities.
 *
 * @version 0.13.1
 */

// Key management
export {
  initializeKeyStore,
  getSigningKey,
  getPinnedPublicKey,
  isKeyValid,
  getKeyStoreState,
  isSigningAvailable,
  generateKeyPair,
  resetKeyStore,
  type ReceiptKeyPair,
  type PinnedPublicKey,
  type KeyStoreState,
} from './receiptKeyStore.js';

// Signing
export {
  signReceipt,
  getSignablePayload,
} from './signReceipt.js';

// Verification
export {
  verifyReceiptSignature,
  hasValidSignatureStructure,
  type ReceiptVerifyResult,
  type ReceiptVerifyError,
} from './verifyReceiptSig.js';
