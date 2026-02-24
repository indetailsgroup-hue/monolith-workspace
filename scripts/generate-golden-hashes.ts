#!/usr/bin/env npx tsx
/**
 * Generate Golden Hashes for Cross-Language Test Vectors.
 *
 * This script reads the test vectors from contracts/audit/stable-hash-vectors.v1.json,
 * computes the SHA-256 hashes using the TypeScript implementation, and writes
 * the results back to the file.
 *
 * Usage:
 *   npx tsx scripts/generate-golden-hashes.ts
 *
 * CRITICAL: Run this ONCE to freeze the golden hashes.
 * After that, both TS and Python implementations MUST match these values.
 *
 * v0.10.8.5 - Cross-Language Signing
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// STABLE STRINGIFY (duplicated to avoid import issues during bootstrap)
// =============================================================================

function normalizeRecursive(value: unknown, path: string = "$"): unknown {
  if (value === null) {
    return null;
  }

  if (value === undefined) {
    throw new Error(`stableStringify: undefined at ${path} (not allowed in arrays)`);
  }

  const t = typeof value;

  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new Error(`stableStringify: non-finite number at ${path}: ${value}`);
    }
    return value;
  }

  if (t === "string" || t === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (item === undefined) {
        throw new Error(`stableStringify: undefined in array at ${path}[${i}]`);
      }
      result.push(normalizeRecursive(item, `${path}[${i}]`));
    }
    return result;
  }

  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, unknown> = {};

    for (const key of sortedKeys) {
      const v = obj[key];
      if (v === undefined) {
        continue;
      }
      result[key] = normalizeRecursive(v, `${path}.${key}`);
    }

    return result;
  }

  throw new Error(`stableStringify: unsupported type at ${path}: ${t}`);
}

function stableStringify(value: unknown): string {
  const normalized = normalizeRecursive(value);
  return JSON.stringify(normalized);
}

// =============================================================================
// SHA-256
// =============================================================================

async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// =============================================================================
// MAIN
// =============================================================================

interface TestCase {
  id: string;
  description?: string;
  input: unknown;
  expectStableJson: string;
  expectSha256Hex: string;
}

interface VectorsFile {
  version: string;
  notes: string;
  rules: Record<string, string>;
  cases: TestCase[];
}

async function main() {
  const vectorsPath = join(__dirname, "..", "contracts", "audit", "stable-hash-vectors.v1.json");

  console.log("Reading vectors from:", vectorsPath);

  const content = readFileSync(vectorsPath, "utf-8");
  const vectors: VectorsFile = JSON.parse(content);

  console.log(`Found ${vectors.cases.length} test cases`);
  console.log("");

  let updated = 0;

  for (const testCase of vectors.cases) {
    const actualJson = stableStringify(testCase.input);
    const actualHash = await sha256Hex(actualJson);

    // Verify JSON matches expected
    if (actualJson !== testCase.expectStableJson) {
      console.error(`ERROR: JSON mismatch for ${testCase.id}`);
      console.error(`  Expected: ${testCase.expectStableJson}`);
      console.error(`  Actual:   ${actualJson}`);
      process.exit(1);
    }

    // Update hash if placeholder
    if (testCase.expectSha256Hex === "REPLACE_ME_AFTER_FIRST_RUN") {
      testCase.expectSha256Hex = actualHash;
      updated++;
      console.log(`✓ ${testCase.id}: ${actualHash.substring(0, 16)}...`);
    } else {
      // Verify hash matches
      if (actualHash !== testCase.expectSha256Hex) {
        console.error(`ERROR: Hash mismatch for ${testCase.id}`);
        console.error(`  Expected: ${testCase.expectSha256Hex}`);
        console.error(`  Actual:   ${actualHash}`);
        process.exit(1);
      }
      console.log(`✓ ${testCase.id}: verified`);
    }
  }

  if (updated > 0) {
    // Write back
    writeFileSync(vectorsPath, JSON.stringify(vectors, null, 2) + "\n", "utf-8");
    console.log("");
    console.log(`Updated ${updated} hashes. File saved.`);
  } else {
    console.log("");
    console.log("All hashes verified. No updates needed.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
