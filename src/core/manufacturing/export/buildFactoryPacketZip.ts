// src/core/manufacturing/export/buildFactoryPacketZip.ts
/**
 * Factory Packet ZIP Builder.
 *
 * Creates deterministic ZIP archives from packet artifacts.
 * Browser-compatible using JSZip library.
 *
 * Key principles:
 * - Sorted file order for deterministic output
 * - Normalized timestamps (epoch)
 * - UTF-8 encoding for text files
 *
 * v0.10.8.5 - Cross-Language Signing
 */

import { PacketArtifact, BuildPacketResult } from "./factoryPacketBuilder";
import { sha256 } from "../audit/hashing";

// =============================================================================
// ZIP CREATION TYPES
// =============================================================================

/**
 * ZIP creation options.
 */
export interface ZipOptions {
  /** Compression level (0-9, default: 6) */
  compressionLevel?: number;

  /** Include comment in ZIP */
  comment?: string;

  /** Use fixed timestamp for determinism */
  fixedTimestamp?: Date;
}

/**
 * ZIP creation result.
 */
export interface ZipResult {
  /** ZIP file as Blob */
  blob: Blob;

  /** ZIP file as ArrayBuffer */
  buffer: ArrayBuffer;

  /** SHA-256 hash of ZIP file */
  sha256Hex: string;

  /** Total size in bytes */
  sizeBytes: number;

  /** File count */
  fileCount: number;
}

// =============================================================================
// ZIP BUILDER (Browser-compatible)
// =============================================================================

/**
 * Build ZIP from packet artifacts.
 *
 * Uses JSZip for browser compatibility.
 * Requires JSZip to be available globally or imported.
 *
 * @param artifacts Packet artifacts (sorted by path)
 * @param options ZIP options
 * @returns ZIP result
 */
export async function buildFactoryPacketZip(
  artifacts: PacketArtifact[],
  options?: ZipOptions
): Promise<ZipResult> {
  // Dynamically import JSZip (browser-compatible)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const JSZip = (await import("jszip")).default;

  const zip = new JSZip();

  // Fixed timestamp for determinism
  const timestamp = options?.fixedTimestamp ?? new Date(0);

  // Add files in sorted order (artifacts should already be sorted)
  const sortedArtifacts = [...artifacts].sort((a, b) =>
    a.path.localeCompare(b.path)
  );

  for (const artifact of sortedArtifacts) {
    const content =
      artifact.contentType === "binary"
        ? base64ToArrayBuffer(artifact.content)
        : artifact.content;

    zip.file(artifact.path, content, {
      date: timestamp,
      // Note: JSZip handles directories automatically
    });
  }

  // Generate ZIP
  const compressionLevel = options?.compressionLevel ?? 6;
  const blob = await zip.generateAsync({
    type: "blob",
    compression: compressionLevel > 0 ? "DEFLATE" : "STORE",
    compressionOptions: {
      level: compressionLevel,
    },
    // Add comment if provided (must be in generateAsync options, not on instance)
    ...(options?.comment && { comment: options.comment }),
  });

  // Convert to ArrayBuffer for hashing
  const buffer = await blob.arrayBuffer();

  // Compute SHA-256 of ZIP bytes
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sha256Hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return {
    blob,
    buffer,
    sha256Hex,
    sizeBytes: buffer.byteLength,
    fileCount: sortedArtifacts.length,
  };
}

/**
 * Build complete factory packet ZIP.
 *
 * Takes BuildPacketResult and creates final ZIP with computed fingerprint.
 *
 * @param packetResult Result from buildFactoryPacketArtifacts
 * @param options ZIP options
 * @returns ZIP result with updated packet info
 */
export async function buildCompleteFactoryPacket(
  packetResult: BuildPacketResult,
  options?: ZipOptions
): Promise<{
  zip: ZipResult;
  packetInfo: typeof packetResult.info & { fileFp: string; fileSizeBytes: number };
}> {
  const zip = await buildFactoryPacketZip(packetResult.artifacts, options);

  return {
    zip,
    packetInfo: {
      ...packetResult.info,
      fileFp: zip.sha256Hex,
      fileSizeBytes: zip.sizeBytes,
    },
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Convert base64 string to ArrayBuffer.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert ArrayBuffer to base64 string.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Trigger browser download of ZIP file.
 *
 * @param blob ZIP blob
 * @param filename Filename for download
 */
export function downloadZip(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate standard filename for factory packet.
 *
 * @param jobId Job identifier
 * @param manifestHashPrefix First 8 chars of manifest hash
 * @param date Optional date (defaults to now)
 */
export function generatePacketFilename(
  jobId: string,
  manifestHashPrefix: string,
  date?: Date
): string {
  const d = date ?? new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
  return `FACTORY_PACKET_${jobId}_${dateStr}_${manifestHashPrefix}.zip`;
}

// =============================================================================
// VERIFICATION
// =============================================================================

/**
 * Verify ZIP file hash.
 *
 * @param blob ZIP blob
 * @param expectedHash Expected SHA-256 hash
 * @returns true if hash matches
 */
export async function verifyZipHash(
  blob: Blob,
  expectedHash: string
): Promise<boolean> {
  const buffer = await blob.arrayBuffer();
  const actualHash = await sha256(
    Array.from(new Uint8Array(buffer))
      .map((b) => String.fromCharCode(b))
      .join("")
  );
  return actualHash.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Extract manifest from ZIP.
 *
 * @param blob ZIP blob
 * @param manifestPath Path to manifest in ZIP
 * @returns Manifest JSON string or null if not found
 */
export async function extractManifestFromZip(
  blob: Blob,
  manifestPath: string = "manifest.toolpath.v1.json"
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const JSZip = (await import("jszip")).default;

  const zip = await JSZip.loadAsync(blob);

  // Find manifest file (may be in root or in job_xxx directory)
  let manifestFile = zip.file(manifestPath);

  if (!manifestFile) {
    // Search for manifest in subdirectories
    const files = Object.keys(zip.files);
    const found = files.find((f) => f.endsWith("/manifest.toolpath.v1.json"));
    if (found) {
      manifestFile = zip.file(found);
    }
  }

  if (!manifestFile) {
    return null;
  }

  return manifestFile.async("string");
}
