/**
 * pubkeysRoute.ts - P13.3 Receipt Public Keys Endpoint
 *
 * Exposes pinned public keys for offline verification.
 * Useful for air-gapped QC machines and auditors.
 *
 * @version 0.13.3
 */

import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PinnedPublicKey } from '../crypto/receiptKeyStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const pubkeysRoute = Router();

// ============================================================================
// Types
// ============================================================================

export const PUBKEYS_VERSION = 'MONOLITH_RECEIPT_KEYS_V1' as const;

export interface PubkeysResponse {
  ok: true;
  version: typeof PUBKEYS_VERSION;
  keys: PinnedPublicKey[];
  generatedAt: string;
}

export interface PubkeysErrorResponse {
  ok: false;
  error: string;
  message: string;
}

// ============================================================================
// Key Loading
// ============================================================================

let cachedKeys: PinnedPublicKey[] | null = null;

function loadPinnedKeys(): PinnedPublicKey[] {
  if (cachedKeys) return cachedKeys;

  const keysPath = join(__dirname, '..', 'crypto', 'production.receipt.pubkeys.v1.json');

  if (!existsSync(keysPath)) {
    console.warn('[PubkeysRoute] Pinned keys file not found:', keysPath);
    return [];
  }

  try {
    const data = readFileSync(keysPath, 'utf-8');
    cachedKeys = JSON.parse(data);
    return cachedKeys || [];
  } catch (err) {
    console.error('[PubkeysRoute] Failed to load pinned keys:', err);
    return [];
  }
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/factory/receipt/pubkeys
 *
 * Returns all pinned public keys for receipt verification.
 */
pubkeysRoute.get('/api/factory/receipt/pubkeys', (req, res) => {
  try {
    const keys = loadPinnedKeys();

    // Filter out revoked keys unless ?include_revoked=true
    const includeRevoked = req.query.include_revoked === 'true';
    const filteredKeys = includeRevoked
      ? keys
      : keys.filter((k) => !k.revoked);

    const response: PubkeysResponse = {
      ok: true,
      version: PUBKEYS_VERSION,
      keys: filteredKeys,
      generatedAt: new Date().toISOString(),
    };

    // Allow caching for 1 hour (keys don't change often)
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(response);
  } catch (err) {
    const response: PubkeysErrorResponse = {
      ok: false,
      error: 'KEYS_LOAD_FAILED',
      message: err instanceof Error ? err.message : 'Failed to load keys',
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/factory/receipt/pubkeys/:keyId
 *
 * Returns a specific public key by ID.
 */
pubkeysRoute.get('/api/factory/receipt/pubkeys/:keyId', (req, res) => {
  try {
    const { keyId } = req.params;
    const keys = loadPinnedKeys();
    const key = keys.find((k) => k.keyId === keyId);

    if (!key) {
      const response: PubkeysErrorResponse = {
        ok: false,
        error: 'KEY_NOT_FOUND',
        message: `Key not found: ${keyId}`,
      };
      return res.status(404).json(response);
    }

    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
      ok: true,
      key,
    });
  } catch (err) {
    const response: PubkeysErrorResponse = {
      ok: false,
      error: 'KEYS_LOAD_FAILED',
      message: err instanceof Error ? err.message : 'Failed to load keys',
    };
    res.status(500).json(response);
  }
});

/**
 * Clear cached keys (for testing/key rotation).
 */
export function clearKeysCache(): void {
  cachedKeys = null;
}
