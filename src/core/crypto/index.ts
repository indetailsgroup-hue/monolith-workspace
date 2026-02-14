/**
 * Crypto Module Index
 *
 * Cryptographic utilities for Trust Chain verification
 */

// Canonical JSON
export {
  canonicalJson,
  canonicalEquals,
  parseCanonical,
  canonicalPretty,
} from './canonicalJson';

// SHA-256 Hashing
export {
  hexOf,
  bytesOf,
  sha256Bytes,
  sha256String,
  sha256Hex,
  sha256CanonicalHex,
  sha256CanonicalBytes,
  verifyCanonicalHash,
  withCanonicalHash,
} from './sha256';

// Ed25519 Signatures
export type { SignatureInfo } from './ed25519';
export {
  bytesFromHex,
  hexFromBytes,
  signHashHex,
  verifyHashHex,
  generateKeypair,
  derivePublicKey,
  signWithMetadata,
} from './ed25519';

// Keyring
export type { KeyPurpose, KeyInfo, Keyring } from './keyring';
export {
  createPinnedKeyring,
  pinnedKeyring,
  keyringFromArray,
  emptyKeyring,
  mergeKeyrings,
  validateKeyInfo,
  createDevKeyring,
} from './keyring';

// Byte/Text Hashing Helpers
export {
  sha256BytesHex,
  sha256TextHex,
  sha256FileHex,
  sha256BlobHex,
  verifyBytesHash,
  verifyTextHash,
} from './hashBytes';
