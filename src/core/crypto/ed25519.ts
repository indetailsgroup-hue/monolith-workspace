/**
 * ed25519.ts - Ed25519 Digital Signatures
 *
 * FEATURES:
 * - Sign hashes with Ed25519 private key
 * - Verify signatures with Ed25519 public key
 * - Uses @noble/ed25519 for browser/node compatibility
 *
 * SECURITY:
 * - Private keys should NEVER be stored in code or committed
 * - Use secure key storage (HSM, KMS, or encrypted secrets)
 * - Verify signatures before trusting any data
 *
 * USAGE:
 * npm install @noble/ed25519
 */

// ============================================
// HEX UTILITIES
// ============================================

/**
 * Convert hex string to bytes
 */
export function bytesFromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string: odd length');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert bytes to hex string
 */
export function hexFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================
// ED25519 OPERATIONS
// ============================================

/**
 * Sign a hash with Ed25519 private key
 *
 * @param args.hashHex - SHA-256 hash as hex string (64 chars)
 * @param args.privateKeyHex - Ed25519 private key as hex string (64 chars)
 * @returns Signature as hex string (128 chars)
 *
 * @example
 * const sig = await signHashHex({
 *   hashHex: '...',  // 64 char hex
 *   privateKeyHex: '...',  // 64 char hex (32 bytes)
 * });
 */
export async function signHashHex(args: {
  hashHex: string;
  privateKeyHex: string;
}): Promise<string> {
  // Dynamic import to allow tree-shaking if not used
  const ed = await import('@noble/ed25519');

  const message = bytesFromHex(args.hashHex);
  const privateKey = bytesFromHex(args.privateKeyHex);

  const signature = await ed.signAsync(message, privateKey);
  return hexFromBytes(signature);
}

/**
 * Verify a signature with Ed25519 public key
 *
 * @param args.hashHex - SHA-256 hash as hex string (64 chars)
 * @param args.signatureHex - Signature as hex string (128 chars)
 * @param args.publicKeyHex - Ed25519 public key as hex string (64 chars)
 * @returns True if signature is valid
 *
 * @example
 * const valid = await verifyHashHex({
 *   hashHex: '...',
 *   signatureHex: '...',
 *   publicKeyHex: '...',
 * });
 */
export async function verifyHashHex(args: {
  hashHex: string;
  signatureHex: string;
  publicKeyHex: string;
}): Promise<boolean> {
  try {
    const ed = await import('@noble/ed25519');

    const message = bytesFromHex(args.hashHex);
    const signature = bytesFromHex(args.signatureHex);
    const publicKey = bytesFromHex(args.publicKeyHex);

    return await ed.verifyAsync(signature, message, publicKey);
  } catch {
    // Invalid inputs or crypto error
    return false;
  }
}

/**
 * Generate new Ed25519 keypair
 *
 * WARNING: For development/testing only.
 * Production keys should be generated in secure environments.
 *
 * @returns Keypair with hex-encoded keys
 */
export async function generateKeypair(): Promise<{
  privateKeyHex: string;
  publicKeyHex: string;
}> {
  const ed = await import('@noble/ed25519');

  // Generate random 32 bytes for private key
  const privateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);

  return {
    privateKeyHex: hexFromBytes(privateKeyBytes),
    publicKeyHex: hexFromBytes(publicKeyBytes),
  };
}

/**
 * Derive public key from private key
 */
export async function derivePublicKey(privateKeyHex: string): Promise<string> {
  const ed = await import('@noble/ed25519');

  const privateKey = bytesFromHex(privateKeyHex);
  const publicKey = await ed.getPublicKeyAsync(privateKey);

  return hexFromBytes(publicKey);
}

// ============================================
// SIGNATURE METADATA
// ============================================

/**
 * Signature with metadata
 */
export interface SignatureInfo {
  signatureHex: string;
  algo: 'Ed25519';
  keyId: string;
  timestampIso: string;
}

/**
 * Create signature with metadata
 */
export async function signWithMetadata(args: {
  hashHex: string;
  privateKeyHex: string;
  keyId: string;
}): Promise<SignatureInfo> {
  const signatureHex = await signHashHex({
    hashHex: args.hashHex,
    privateKeyHex: args.privateKeyHex,
  });

  return {
    signatureHex,
    algo: 'Ed25519',
    keyId: args.keyId,
    timestampIso: new Date().toISOString(),
  };
}
