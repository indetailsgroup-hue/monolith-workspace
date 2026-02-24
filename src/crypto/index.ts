/**
 * MONOLITH Crypto Module
 *
 * Step 8: Added Signer interface, KeyStore, ECDSA P-256
 */

// SHA-256
export type { Sha256Hex } from './sha256';
export { sha256Hex } from './sha256';

// Base64 & UTF-8
export {
  bytesToBase64,
  base64ToBytes,
  utf8ToBytes,
  bytesToUtf8,
} from './base64';

// Ed25519
export type {
  Ed25519KeyPair,
  ExportedEd25519PublicKey,
  ExportedEd25519PrivateKey,
} from './ed25519';
export {
  isEd25519Supported,
  generateEd25519KeyPair,
  exportEd25519PublicKey,
  exportEd25519PrivateKey,
  importEd25519PublicKey,
  importEd25519PrivateKey,
  ed25519Sign,
  ed25519Verify,
} from './ed25519';

// ============================================================================
// Step 8: Signer Interface + ECDSA P-256
// ============================================================================

// Signer Types
export type { SigAlg, SignatureEnvelope, Signer } from './signerTypes';

// Key Store
export type { JwkPair } from './keyStore';
export {
  loadKeyPair,
  saveKeyPair,
  deleteKeyPair,
  listKeyIds,
  hasKeyPair,
} from './keyStore';

// ECDSA P-256 Signer
export { WebCryptoEcdsaSigner, ecdsaSigner, exportPublicKeyJwk } from './ecdsaP256';
