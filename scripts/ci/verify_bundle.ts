#!/usr/bin/env npx tsx
/**
 * verify_bundle.ts - CI Bundle Verification Script
 *
 * Verifies export bundle integrity in CI/CD pipeline.
 *
 * USAGE:
 *   npx tsx scripts/ci/verify_bundle.ts <bundle.zip> [--keys <keyring.json>]
 *
 * EXIT CODES:
 *   0 - Verification passed
 *   1 - Verification failed
 *   2 - Invalid arguments
 *
 * EXAMPLE:
 *   npx tsx scripts/ci/verify_bundle.ts ./dist/export_job123.zip --keys ./keys/production.json
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import JSZip from 'jszip';
import type { Keyring } from '../../src/core/crypto/keyring';
import { emptyKeyring, addPublicKey } from '../../src/core/crypto/keyring';
import type { BundleFileReader } from '../../src/core/bundle/verifyExportBundle';
import { verifyExportBundle } from '../../src/core/bundle/verifyExportBundle';

// ============================================
// HELPERS
// ============================================

function printUsage(): void {
  console.log(`
Usage: npx tsx scripts/ci/verify_bundle.ts <bundle.zip> [options]

Options:
  --keys <file>   Keyring JSON file with public keys
  --skip-hash     Skip file hash verification (faster)
  --skip-chain    Skip chain signature verification
  --help          Show this help

Example:
  npx tsx scripts/ci/verify_bundle.ts ./exports/bundle.zip --keys ./keys/prod.json
`);
}

async function loadKeyring(keyringPath: string): Promise<Keyring> {
  const content = await readFile(keyringPath, 'utf8');
  const data = JSON.parse(content);

  let keyring = emptyKeyring();

  // Support various keyring formats
  if (data.keys && Array.isArray(data.keys)) {
    for (const key of data.keys) {
      keyring = addPublicKey(keyring, {
        keyId: key.keyId,
        publicKeyHex: key.publicKeyHex,
        role: key.role ?? 'approval',
      });
    }
  } else if (data.publicKeyHex && data.keyId) {
    // Single key format
    keyring = addPublicKey(keyring, {
      keyId: data.keyId,
      publicKeyHex: data.publicKeyHex,
      role: data.role ?? 'approval',
    });
  }

  return keyring;
}

async function createNodeZipReader(zipPath: string): Promise<BundleFileReader> {
  const buffer = await readFile(zipPath);
  const zip = await JSZip.loadAsync(buffer);

  return {
    async readFile(filename: string): Promise<Uint8Array | null> {
      const file = zip.file(filename);
      if (!file) return null;
      const buffer = await file.async('nodebuffer');
      return new Uint8Array(buffer);
    },

    async listFiles(): Promise<string[]> {
      return Object.keys(zip.files).filter((name) => !zip.files[name].dir);
    },
  };
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    printUsage();
    process.exit(2);
  }

  // Parse arguments
  let bundlePath: string | null = null;
  let keyringPath: string | null = null;
  let skipHash = false;
  let skipChain = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--keys' && args[i + 1]) {
      keyringPath = args[++i];
    } else if (arg === '--skip-hash') {
      skipHash = true;
    } else if (arg === '--skip-chain') {
      skipChain = true;
    } else if (!arg.startsWith('-')) {
      bundlePath = arg;
    }
  }

  if (!bundlePath) {
    console.error('Error: Bundle path required');
    printUsage();
    process.exit(2);
  }

  console.log('═══════════════════════════════════════════');
  console.log('   BUNDLE VERIFICATION');
  console.log('═══════════════════════════════════════════');
  console.log(`Bundle: ${bundlePath}`);
  console.log(`Keyring: ${keyringPath ?? '(none - signatures not verified)'}`);
  console.log(`Skip hash: ${skipHash}`);
  console.log(`Skip chain: ${skipChain}`);
  console.log('');

  try {
    // Load keyring
    let keyring = emptyKeyring();
    if (keyringPath) {
      keyring = await loadKeyring(resolve(keyringPath));
      console.log(`Loaded ${keyring.keys.length} public key(s)`);
    }

    // Create zip reader
    const reader = await createNodeZipReader(resolve(bundlePath));
    const files = await reader.listFiles();
    console.log(`Bundle contains ${files.length} file(s)`);
    console.log('');

    // Verify bundle
    console.log('Verifying...');
    const result = await verifyExportBundle(reader, keyring, {
      skipHashVerification: skipHash,
      skipChainVerification: skipChain || !keyringPath,
    });

    console.log('');
    console.log('─────────────────────────────────────────');
    console.log('RESULT');
    console.log('─────────────────────────────────────────');

    if (result.ok) {
      console.log('✓ VERIFICATION PASSED');
      console.log(`  Job ID: ${result.jobId}`);
      console.log(`  HEAD: ${result.headHash?.slice(0, 16)}...`);

      if (result.fileResults) {
        const passed = result.fileResults.filter((f) => f.ok).length;
        console.log(`  Files verified: ${passed}/${result.fileResults.length}`);
      }

      process.exit(0);
    } else {
      console.log('✗ VERIFICATION FAILED');
      console.log(`  Reason: ${result.reason}`);

      if (result.details) {
        console.log('  Details:');
        for (const detail of result.details) {
          console.log(`    - ${detail}`);
        }
      }

      if (result.fileResults) {
        const failed = result.fileResults.filter((f) => !f.ok);
        if (failed.length > 0) {
          console.log('  Failed files:');
          for (const f of failed.slice(0, 10)) {
            console.log(`    - ${f.filename}: ${f.reason}`);
          }
          if (failed.length > 10) {
            console.log(`    ... and ${failed.length - 10} more`);
          }
        }
      }

      process.exit(1);
    }
  } catch (e) {
    console.error('');
    console.error('ERROR:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

main();
