/**
 * Ed25519 Signing Stub (v0.4)
 *
 * Ed25519 is not natively supported in Web Crypto API.
 * This module provides type definitions and stub implementations.
 * Use `isEd25519Supported()` to feature-detect before calling.
 *
 * Future: Implement via @noble/ed25519 or WebCrypto when available.
 */

/** Ed25519 key pair */
export interface Ed25519KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/** Exported Ed25519 public key (hex-encoded) */
export type ExportedEd25519PublicKey = string;

/** Exported Ed25519 private key (hex-encoded) */
export type ExportedEd25519PrivateKey = string;

/**
 * Check if Ed25519 is supported in the current environment.
 *
 * @returns false (stub — not yet implemented)
 */
export function isEd25519Supported(): boolean {
  return false;
}

function notSupported(): never {
  throw new Error('Ed25519 is not supported in this environment. Use ECDSA P-256 instead.');
}

/**
 * Generate Ed25519 key pair.
 * @throws Always — not implemented
 */
export function generateEd25519KeyPair(): Ed25519KeyPair {
  return notSupported();
}

/**
 * Export Ed25519 public key as hex string.
 * @throws Always — not implemented
 */
export function exportEd25519PublicKey(_kp: Ed25519KeyPair): ExportedEd25519PublicKey {
  return notSupported();
}

/**
 * Export Ed25519 private key as hex string.
 * @throws Always — not implemented
 */
export function exportEd25519PrivateKey(_kp: Ed25519KeyPair): ExportedEd25519PrivateKey {
  return notSupported();
}

/**
 * Import Ed25519 public key from hex string.
 * @throws Always — not implemented
 */
export function importEd25519PublicKey(_hex: string): Uint8Array {
  return notSupported();
}

/**
 * Import Ed25519 private key from hex string.
 * @throws Always — not implemented
 */
export function importEd25519PrivateKey(_hex: string): Uint8Array {
  return notSupported();
}

/**
 * Sign data with Ed25519 private key.
 * @throws Always — not implemented
 */
export async function ed25519Sign(_data: Uint8Array, _privateKey: Uint8Array): Promise<Uint8Array> {
  return notSupported();
}

/**
 * Verify Ed25519 signature.
 *
 * @returns false (stub — cannot verify without implementation)
 */
export async function ed25519Verify(
  _signature: Uint8Array,
  _data: Uint8Array,
  _publicKey: Uint8Array
): Promise<boolean> {
  return false;
}
