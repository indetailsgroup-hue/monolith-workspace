#!/usr/bin/env npx tsx
/**
 * verify_job.ts - CI Job Verification Script
 *
 * Verifies job manifest chain from filesystem store.
 *
 * USAGE:
 *   npx tsx scripts/ci/verify_job.ts <jobId> --store <manifestDir> [--keys <keyring.json>]
 *
 * EXIT CODES:
 *   0 - Verification passed
 *   1 - Verification failed
 *   2 - Invalid arguments
 *
 * MANIFEST DIRECTORY STRUCTURE:
 *   manifestDir/
 *     heads/
 *       {jobId}.json
 *     manifests/
 *       {hashHex}.json
 *
 * EXAMPLE:
 *   npx tsx scripts/ci/verify_job.ts job-123 --store ./manifests --keys ./keys/prod.json
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { Keyring } from '../../src/core/crypto/keyring';
import { emptyKeyring, addPublicKey } from '../../src/core/crypto/keyring';
import { FileManifestStore } from './FileManifestStore';
import { verifyChain } from '../../src/core/trust/verifyManifestChain';
import { loadManifestChain, getChainStats } from '../../src/core/manifest/loadManifestChain';

// ============================================
// HELPERS
// ============================================

function printUsage(): void {
  console.log(`
Usage: npx tsx scripts/ci/verify_job.ts <jobId> [options]

Options:
  --store <dir>   Manifest store directory (required)
  --keys <file>   Keyring JSON file with public keys
  --depth <n>     Maximum chain depth to verify (default: 50)
  --help          Show this help

Example:
  npx tsx scripts/ci/verify_job.ts job-123 --store ./manifests --keys ./keys/prod.json
`);
}

async function loadKeyring(keyringPath: string): Promise<Keyring> {
  const content = await readFile(keyringPath, 'utf8');
  const data = JSON.parse(content);

  let keyring = emptyKeyring();

  if (data.keys && Array.isArray(data.keys)) {
    for (const key of data.keys) {
      keyring = addPublicKey(keyring, {
        keyId: key.keyId,
        publicKeyHex: key.publicKeyHex,
        role: key.role ?? 'approval',
      });
    }
  } else if (data.publicKeyHex && data.keyId) {
    keyring = addPublicKey(keyring, {
      keyId: data.keyId,
      publicKeyHex: data.publicKeyHex,
      role: data.role ?? 'approval',
    });
  }

  return keyring;
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
  let jobId: string | null = null;
  let storePath: string | null = null;
  let keyringPath: string | null = null;
  let maxDepth = 50;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--store' && args[i + 1]) {
      storePath = args[++i];
    } else if (arg === '--keys' && args[i + 1]) {
      keyringPath = args[++i];
    } else if (arg === '--depth' && args[i + 1]) {
      maxDepth = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-')) {
      jobId = arg;
    }
  }

  if (!jobId) {
    console.error('Error: Job ID required');
    printUsage();
    process.exit(2);
  }

  if (!storePath) {
    console.error('Error: Manifest store path required (--store)');
    printUsage();
    process.exit(2);
  }

  console.log('═══════════════════════════════════════════');
  console.log('   JOB VERIFICATION');
  console.log('═══════════════════════════════════════════');
  console.log(`Job ID: ${jobId}`);
  console.log(`Store: ${storePath}`);
  console.log(`Keyring: ${keyringPath ?? '(none - signatures not verified)'}`);
  console.log(`Max Depth: ${maxDepth}`);
  console.log('');

  try {
    // Load keyring
    let keyring = emptyKeyring();
    if (keyringPath) {
      keyring = await loadKeyring(resolve(keyringPath));
      console.log(`Loaded ${keyring.keys.length} public key(s)`);
    }

    // Create manifest store
    const store = new FileManifestStore(resolve(storePath));

    // Load HEAD
    const headHash = await store.getHead(jobId);
    if (!headHash) {
      console.error(`Error: No HEAD manifest for job "${jobId}"`);
      process.exit(1);
    }

    console.log(`HEAD: ${headHash.slice(0, 16)}...`);

    // Load HEAD manifest
    const head = await store.loadByHash(headHash);
    if (!head) {
      console.error(`Error: HEAD manifest missing from store`);
      process.exit(1);
    }

    console.log('');
    console.log('Loading chain...');

    // Load chain
    const chainResult = await loadManifestChain({
      jobId,
      store,
      maxDepth,
    });

    if (!chainResult.ok) {
      console.error(`Error: Failed to load chain - ${chainResult.reason}`);
      process.exit(1);
    }

    const stats = getChainStats(chainResult.chain);
    console.log(`Chain length: ${stats.length}`);
    console.log(`Reached genesis: ${chainResult.reachedGenesis}`);
    console.log(`Total exports: ${stats.totalExports}`);
    console.log(`Gate OK: ${stats.gateOkCount}, Blocked: ${stats.gateBlockedCount}`);
    console.log('');

    // Verify chain
    if (keyringPath) {
      console.log('Verifying chain signatures...');

      const verifyResult = await verifyChain({
        head,
        keyring,
        store,
        maxDepth,
      });

      console.log('');
      console.log('─────────────────────────────────────────');
      console.log('RESULT');
      console.log('─────────────────────────────────────────');

      if (verifyResult.ok) {
        console.log('✓ VERIFICATION PASSED');
        console.log(`  Chain length: ${verifyResult.chainLength}`);
        console.log(`  Reached genesis: ${verifyResult.reachedGenesis}`);
        if (verifyResult.genesisHashHex) {
          console.log(`  Genesis: ${verifyResult.genesisHashHex.slice(0, 16)}...`);
        }

        // Check gate status
        const trust = head.signedTrust?.trust;
        if (trust?.gate?.ok) {
          console.log('  Gate: OK ✓');
        } else {
          console.log(`  Gate: BLOCKED (${trust?.gate?.errorCount ?? 0} errors)`);
        }

        process.exit(0);
      } else {
        console.log('✗ VERIFICATION FAILED');
        console.log(`  Reason: ${verifyResult.reason}`);
        process.exit(1);
      }
    } else {
      // No keyring - just report chain info
      console.log('─────────────────────────────────────────');
      console.log('CHAIN INFO (no signature verification)');
      console.log('─────────────────────────────────────────');
      console.log(`Chain length: ${stats.length}`);
      console.log(`Reached genesis: ${chainResult.reachedGenesis}`);

      const trust = head.signedTrust?.trust;
      if (trust?.gate?.ok) {
        console.log('Gate: OK');
      } else {
        console.log(`Gate: BLOCKED (${trust?.gate?.errorCount ?? 0} errors)`);
      }

      console.log('');
      console.log('⚠️  Signatures not verified (no keyring provided)');

      process.exit(0);
    }
  } catch (e) {
    console.error('');
    console.error('ERROR:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

main();
