// src/core/manufacturing/export/packetSchema.v1.ts
/**
 * Factory Packet Schema v1.
 *
 * Defines the structure of factory packets for verification.
 * MUST match monolith-verify CLI expectations exactly.
 *
 * Key principles:
 * - toolpath.files[] contains ALL verifiable files in packet
 * - Each file has path (relative) and sha256Hex
 * - Manifest is the source of truth for packet contents
 *
 * v0.10.8.5 - Cross-Language Signing
 */

// =============================================================================
// PACKET FILE ENTRY
// =============================================================================

/**
 * File entry in packet for verification.
 *
 * MUST match monolith-verify expected format:
 * - path: relative path within packet (forward slashes)
 * - sha256Hex: lowercase hex hash
 */
export interface PacketFileEntry {
  /** Relative path within packet (e.g., "gcode/sheet_01.nc") */
  path: string;

  /** SHA-256 hash of file content (lowercase hex, 64 chars) */
  sha256Hex: string;
}

// =============================================================================
// FACTORY PACKET INDEX
// =============================================================================

/**
 * Factory packet index v1.
 *
 * Embedded in manifest.toolpath.files[] for verification.
 * This is what monolith-verify uses to verify all files.
 */
export interface FactoryPacketIndexV1 {
  /** Schema version */
  version: "1.0";

  /** All verifiable files in packet */
  files: PacketFileEntry[];

  /** Total file count */
  fileCount: number;

  /** Total size in bytes (optional) */
  totalSizeBytes?: number;
}

// =============================================================================
// EXTENDED MANIFEST TOOLPATH
// =============================================================================

/**
 * Extended ManifestToolpath with files[] for packet verification.
 *
 * This extends the base ManifestToolpath type to include
 * the files[] array required by monolith-verify.
 */
export interface ManifestToolpathWithFiles {
  /** Tool change plan artifact */
  toolChangePlan: {
    kind: string;
    id: string;
    hash: { algo: string; hex: string };
    meta?: Record<string, unknown>;
  };

  /** IR program artifacts */
  irPrograms: Array<{
    kind: string;
    id: string;
    hash: { algo: string; hex: string };
    meta?: Record<string, unknown>;
  }>;

  /** NC file artifacts */
  ncFiles: Array<{
    kind: string;
    id: string;
    hash: { algo: string; hex: string };
    meta?: Record<string, unknown>;
  }>;

  /**
   * Files for packet verification.
   *
   * Contains ALL verifiable files in the factory packet.
   * Used by monolith-verify to verify packet integrity.
   */
  files: PacketFileEntry[];
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create a packet file entry.
 *
 * @param path Relative path within packet
 * @param sha256Hex SHA-256 hash (will be lowercased)
 */
export function createPacketFileEntry(
  path: string,
  sha256Hex: string
): PacketFileEntry {
  return {
    path: normalizePath(path),
    sha256Hex: sha256Hex.toLowerCase(),
  };
}

/**
 * Normalize path to forward slashes.
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Create factory packet index from file entries.
 *
 * @param files Array of packet file entries
 * @param totalSizeBytes Optional total size in bytes
 */
export function createPacketIndex(
  files: PacketFileEntry[],
  totalSizeBytes?: number
): FactoryPacketIndexV1 {
  return {
    version: "1.0",
    files,
    fileCount: files.length,
    totalSizeBytes,
  };
}

/**
 * Validate packet file entry.
 */
export function validatePacketFileEntry(
  entry: PacketFileEntry
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!entry.path || typeof entry.path !== "string") {
    errors.push("path must be a non-empty string");
  } else if (entry.path.includes("..")) {
    errors.push("path must not contain '..'");
  }

  if (!entry.sha256Hex || typeof entry.sha256Hex !== "string") {
    errors.push("sha256Hex must be a non-empty string");
  } else if (!/^[a-f0-9]{64}$/.test(entry.sha256Hex)) {
    errors.push("sha256Hex must be 64 lowercase hex characters");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate all packet file entries.
 */
export function validatePacketFiles(
  files: PacketFileEntry[]
): { valid: boolean; errors: Array<{ index: number; errors: string[] }> } {
  const allErrors: Array<{ index: number; errors: string[] }> = [];

  for (let i = 0; i < files.length; i++) {
    const result = validatePacketFileEntry(files[i]);
    if (!result.valid) {
      allErrors.push({ index: i, errors: result.errors });
    }
  }

  return { valid: allErrors.length === 0, errors: allErrors };
}

// =============================================================================
// PACKET STRUCTURE CONSTANTS
// =============================================================================

/**
 * Standard packet directory names.
 */
export const PACKET_DIRS = {
  GCODE: "gcode",
  DXF: "dxf",
  IR: "ir",
  REPORTS: "reports",
  HASHES: "hashes",
} as const;

/**
 * Standard packet file names.
 */
export const PACKET_FILES = {
  MANIFEST: "manifest.toolpath.v1.json",
  HASHES: "hashes/files.sha256.txt",
} as const;

/**
 * Build standard packet path for a file type.
 *
 * @param rootDir Root directory (e.g., "job_abc123")
 * @param type File type
 * @param filename File name
 */
export function buildPacketPath(
  rootDir: string,
  type: keyof typeof PACKET_DIRS | "manifest" | "hashes",
  filename?: string
): string {
  if (type === "manifest") {
    return `${rootDir}/${PACKET_FILES.MANIFEST}`;
  }
  if (type === "hashes") {
    return `${rootDir}/${PACKET_FILES.HASHES}`;
  }
  if (!filename) {
    throw new Error(`filename required for type: ${type}`);
  }
  return `${rootDir}/${PACKET_DIRS[type]}/${filename}`;
}
