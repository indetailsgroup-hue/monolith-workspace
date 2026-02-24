#!/usr/bin/env npx ts-node
/**
 * Pinned Keys Update Utility.
 *
 * Validates and updates the production.pubkeys.v1.json file.
 *
 * Usage:
 *   npx ts-node scripts/ci/update_pinned_keys.ts validate
 *   npx ts-node scripts/ci/update_pinned_keys.ts add <json-entry-file>
 *   npx ts-node scripts/ci/update_pinned_keys.ts list
 *   npx ts-node scripts/ci/update_pinned_keys.ts export-factory [output-file]
 *
 * v0.10.8.5 - PR-S4.1: Pinned Public Key Export Pipeline
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// =============================================================================
// TYPES (matches sigVerify.ts)
// =============================================================================

interface PinnedKey {
  publicKeyId: string;
  scheme: "ED25519";
  spkiPem: string;
  note?: string;
  createdAt?: string;
  expiresAt?: string;
}

interface PinnedKeySetV1 {
  version: "1.0";
  allowed: PinnedKey[];
  note?: string;
  updatedAt?: string;
}

// =============================================================================
// PATHS
// =============================================================================

const KEYS_DIR = path.resolve(__dirname, "../../public/keys");
const PRODUCTION_KEYS_FILE = path.join(KEYS_DIR, "production.pubkeys.v1.json");
const DEVELOPMENT_KEYS_FILE = path.join(KEYS_DIR, "development.pubkeys.v1.json");

// =============================================================================
// VALIDATION
// =============================================================================

function validatePinnedKey(key: unknown, index: number): string[] {
  const errors: string[] = [];
  const k = key as Record<string, unknown>;

  if (!k.publicKeyId || typeof k.publicKeyId !== "string") {
    errors.push(`[${index}] publicKeyId must be a non-empty string`);
  }

  if (k.scheme !== "ED25519") {
    errors.push(`[${index}] scheme must be "ED25519", got "${k.scheme}"`);
  }

  if (!k.spkiPem || typeof k.spkiPem !== "string") {
    errors.push(`[${index}] spkiPem must be a non-empty string`);
  } else {
    const pem = k.spkiPem as string;
    if (!pem.includes("-----BEGIN PUBLIC KEY-----")) {
      errors.push(`[${index}] spkiPem must start with BEGIN PUBLIC KEY`);
    }
    if (!pem.includes("-----END PUBLIC KEY-----")) {
      errors.push(`[${index}] spkiPem must end with END PUBLIC KEY`);
    }

    // Try to parse the PEM
    try {
      const keyObj = crypto.createPublicKey({
        key: pem,
        format: "pem",
      });
      if (keyObj.asymmetricKeyType !== "ed25519") {
        errors.push(
          `[${index}] Key is not Ed25519, got ${keyObj.asymmetricKeyType}`
        );
      }
    } catch (e) {
      errors.push(`[${index}] Invalid PEM format: ${(e as Error).message}`);
    }
  }

  return errors;
}

function validateKeySet(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Data must be an object"] };
  }

  const ks = data as Record<string, unknown>;

  if (ks.version !== "1.0") {
    errors.push(`version must be "1.0", got "${ks.version}"`);
  }

  if (!Array.isArray(ks.allowed)) {
    errors.push("allowed must be an array");
    return { valid: false, errors };
  }

  for (let i = 0; i < ks.allowed.length; i++) {
    errors.push(...validatePinnedKey(ks.allowed[i], i));
  }

  // Check for duplicate key IDs
  const keyIds = (ks.allowed as PinnedKey[]).map((k) => k.publicKeyId);
  const duplicates = keyIds.filter(
    (id, idx) => keyIds.indexOf(id) !== idx
  );
  if (duplicates.length > 0) {
    errors.push(`Duplicate key IDs: ${[...new Set(duplicates)].join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// FILE OPERATIONS
// =============================================================================

function loadKeySet(filePath: string): PinnedKeySetV1 {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as PinnedKeySetV1;
}

function saveKeySet(filePath: string, keySet: PinnedKeySetV1): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  keySet.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(keySet, null, 2) + "\n");
}

function loadKeyEntry(filePath: string): PinnedKey {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as PinnedKey;
}

// =============================================================================
// COMMANDS
// =============================================================================

function cmdValidate(): void {
  console.log("Validating production.pubkeys.v1.json...\n");

  try {
    const keySet = loadKeySet(PRODUCTION_KEYS_FILE);
    const result = validateKeySet(keySet);

    if (result.valid) {
      console.log("✓ Key set is valid");
      console.log(`  Keys: ${keySet.allowed.length}`);
      console.log(`  Updated: ${keySet.updatedAt}`);

      if (keySet.allowed.length > 0) {
        console.log("\n  Key IDs:");
        for (const key of keySet.allowed) {
          const expired = key.expiresAt && new Date(key.expiresAt) < new Date();
          const status = expired ? "(EXPIRED)" : "";
          console.log(`    - ${key.publicKeyId} ${status}`);
        }
      }
    } else {
      console.error("✗ Validation failed:");
      for (const error of result.errors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }
  } catch (e) {
    console.error(`✗ Error: ${(e as Error).message}`);
    process.exit(1);
  }
}

function cmdAdd(entryFile: string): void {
  console.log(`Adding key from ${entryFile}...\n`);

  try {
    // Load existing key set
    let keySet: PinnedKeySetV1;
    try {
      keySet = loadKeySet(PRODUCTION_KEYS_FILE);
    } catch {
      // Create new if doesn't exist
      keySet = {
        version: "1.0",
        allowed: [],
        note: "MONOLITH Production Signing Keys",
      };
    }

    // Load new key entry
    const newKey = loadKeyEntry(entryFile);

    // Validate new key
    const keyErrors = validatePinnedKey(newKey, 0);
    if (keyErrors.length > 0) {
      console.error("✗ Invalid key entry:");
      for (const error of keyErrors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }

    // Check for duplicate
    if (keySet.allowed.some((k) => k.publicKeyId === newKey.publicKeyId)) {
      console.error(`✗ Key ${newKey.publicKeyId} already exists in key set`);
      process.exit(1);
    }

    // Add key
    keySet.allowed.push(newKey);

    // Save
    saveKeySet(PRODUCTION_KEYS_FILE, keySet);

    console.log(`✓ Added key: ${newKey.publicKeyId}`);
    console.log(`  Total keys: ${keySet.allowed.length}`);
  } catch (e) {
    console.error(`✗ Error: ${(e as Error).message}`);
    process.exit(1);
  }
}

function cmdList(): void {
  console.log("Production Pinned Keys:\n");

  try {
    const keySet = loadKeySet(PRODUCTION_KEYS_FILE);

    if (keySet.allowed.length === 0) {
      console.log("  (no keys configured)");
      return;
    }

    for (const key of keySet.allowed) {
      const expired = key.expiresAt && new Date(key.expiresAt) < new Date();
      const status = expired ? " [EXPIRED]" : "";

      console.log(`Key: ${key.publicKeyId}${status}`);
      console.log(`  Scheme: ${key.scheme}`);
      if (key.note) console.log(`  Note: ${key.note}`);
      if (key.createdAt) console.log(`  Created: ${key.createdAt}`);
      if (key.expiresAt) console.log(`  Expires: ${key.expiresAt}`);
      console.log(`  PEM: ${key.spkiPem.substring(0, 40)}...`);
      console.log("");
    }

    console.log(`Total: ${keySet.allowed.length} keys`);
    console.log(`Updated: ${keySet.updatedAt}`);
  } catch (e) {
    console.error(`✗ Error: ${(e as Error).message}`);
    process.exit(1);
  }
}

function cmdExportFactory(outputFile?: string): void {
  console.log("Exporting key set for factory...\n");

  try {
    const keySet = loadKeySet(PRODUCTION_KEYS_FILE);

    // Filter out expired keys
    const validKeys = keySet.allowed.filter((k) => {
      if (!k.expiresAt) return true;
      return new Date(k.expiresAt) > new Date();
    });

    const exportSet: PinnedKeySetV1 = {
      version: "1.0",
      allowed: validKeys,
      note: `Factory export - ${new Date().toISOString()}`,
      updatedAt: new Date().toISOString(),
    };

    const output = JSON.stringify(exportSet, null, 2);

    if (outputFile) {
      fs.writeFileSync(outputFile, output + "\n");
      console.log(`✓ Exported to ${outputFile}`);
    } else {
      console.log(output);
    }

    console.log(`\n  Valid keys: ${validKeys.length}`);
    if (validKeys.length < keySet.allowed.length) {
      console.log(
        `  Expired keys excluded: ${keySet.allowed.length - validKeys.length}`
      );
    }
  } catch (e) {
    console.error(`✗ Error: ${(e as Error).message}`);
    process.exit(1);
  }
}

function cmdHelp(): void {
  console.log(`
Pinned Keys Update Utility

Usage:
  npx ts-node scripts/ci/update_pinned_keys.ts <command> [args]

Commands:
  validate              Validate production.pubkeys.v1.json
  add <entry-file>      Add a key entry from JSON file
  list                  List all pinned keys
  export-factory [out]  Export key set for factory (excludes expired)
  help                  Show this help

Files:
  public/keys/production.pubkeys.v1.json - Production pinned keys

Example workflow:
  1. Export key from AWS KMS:
     python services/signer/scripts/export_pubkey.py --format json > key.json

  2. Add to pinned keys:
     npx ts-node scripts/ci/update_pinned_keys.ts add key.json

  3. Validate:
     npx ts-node scripts/ci/update_pinned_keys.ts validate

  4. Export for factory:
     npx ts-node scripts/ci/update_pinned_keys.ts export-factory factory-keys.json
`);
}

// =============================================================================
// MAIN
// =============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  switch (command) {
    case "validate":
      cmdValidate();
      break;
    case "add":
      if (!args[1]) {
        console.error("Usage: update_pinned_keys.ts add <entry-file>");
        process.exit(1);
      }
      cmdAdd(args[1]);
      break;
    case "list":
      cmdList();
      break;
    case "export-factory":
      cmdExportFactory(args[1]);
      break;
    case "help":
    default:
      cmdHelp();
      break;
  }
}

main();
