/**
 * unzipPacket.ts - Client-side ZIP extraction for Factory Packets
 *
 * Extracts and parses factory packet ZIP files in the browser.
 * Uses JSZip for ZIP handling.
 *
 * @version 1.0.0 - Phase C: Factory Ingest & Verify
 */

import JSZip from 'jszip';
import type {
  FactoryPacket,
  PacketManifest,
  PacketDrillMap,
  PacketConnectors,
  PacketCutList,
  PacketGateResult,
} from './types';

// ============================================
// TYPES
// ============================================

export interface UnzipResult {
  /** Successfully extracted packet */
  success: boolean;
  /** The extracted packet (if success) */
  packet?: FactoryPacket;
  /** Raw file contents */
  files: Map<string, string>;
  /** Extraction errors */
  errors: string[];
  /** Warnings (non-fatal issues) */
  warnings: string[];
}

export interface ExtractedFile {
  path: string;
  content: string;
  sizeBytes: number;
}

// ============================================
// CONSTANTS
// ============================================

/** Expected files in a factory packet */
export const EXPECTED_FILES = [
  'manifest.json',
  'drillmap.json',
  'connectors.minifix.json',
  'cutlist.json',
  'gate-result.json',
] as const;

export type ExpectedFileName = typeof EXPECTED_FILES[number];

// ============================================
// MAIN EXTRACTION
// ============================================

/**
 * Extract and parse a factory packet from a ZIP file.
 *
 * @param zipData - The ZIP file as ArrayBuffer, Blob, or Uint8Array
 * @returns Extraction result with packet data or errors
 */
export async function unzipPacket(
  zipData: ArrayBuffer | Blob | Uint8Array
): Promise<UnzipResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const files = new Map<string, string>();

  try {
    // Load ZIP
    const zip = await JSZip.loadAsync(zipData);

    // Extract all files
    const extractPromises: Promise<ExtractedFile | null>[] = [];

    zip.forEach((relativePath, file) => {
      if (!file.dir) {
        extractPromises.push(
          file.async('string').then((content) => ({
            path: relativePath,
            content,
            sizeBytes: new TextEncoder().encode(content).length,
          }))
        );
      }
    });

    const extractedFiles = await Promise.all(extractPromises);

    // Store extracted files
    for (const file of extractedFiles) {
      if (file) {
        files.set(file.path, file.content);
      }
    }

    // Check for expected files
    const missingFiles: string[] = [];
    for (const expectedFile of EXPECTED_FILES) {
      if (!files.has(expectedFile)) {
        missingFiles.push(expectedFile);
      }
    }

    if (missingFiles.length > 0) {
      errors.push(`Missing required files: ${missingFiles.join(', ')}`);
      return { success: false, files, errors, warnings };
    }

    // Parse JSON files
    const manifest = parseJsonFile<PacketManifest>(
      files.get('manifest.json')!,
      'manifest.json',
      errors
    );

    const drillMap = parseJsonFile<PacketDrillMap>(
      files.get('drillmap.json')!,
      'drillmap.json',
      errors
    );

    const connectors = parseJsonFile<PacketConnectors>(
      files.get('connectors.minifix.json')!,
      'connectors.minifix.json',
      errors
    );

    const cutList = parseJsonFile<PacketCutList>(
      files.get('cutlist.json')!,
      'cutlist.json',
      errors
    );

    const gateResult = parseJsonFile<PacketGateResult>(
      files.get('gate-result.json')!,
      'gate-result.json',
      errors
    );

    // Check for parse errors
    if (errors.length > 0) {
      return { success: false, files, errors, warnings };
    }

    // Validate manifest structure
    if (!manifest || !manifest.schema || !manifest.version) {
      errors.push('Invalid manifest: missing schema or version');
      return { success: false, files, errors, warnings };
    }

    // Check for extra files (warning only)
    const expectedSet = new Set(EXPECTED_FILES);
    for (const filePath of files.keys()) {
      if (!expectedSet.has(filePath as ExpectedFileName)) {
        warnings.push(`Unexpected file in packet: ${filePath}`);
      }
    }

    // Build packet object
    const packet: FactoryPacket = {
      manifest: manifest!,
      drillMap: drillMap!,
      connectors: connectors!,
      cutList: cutList!,
      gateResult: gateResult!,
    };

    return {
      success: true,
      packet,
      files,
      errors,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Failed to extract ZIP: ${message}`);
    return { success: false, files, errors, warnings };
  }
}

/**
 * Extract a factory packet from a File object.
 *
 * @param file - The File object (from file input or drop)
 * @returns Extraction result
 */
export async function unzipPacketFromFile(file: File): Promise<UnzipResult> {
  const arrayBuffer = await file.arrayBuffer();
  return unzipPacket(arrayBuffer);
}

/**
 * Extract a factory packet from a base64 string.
 *
 * @param base64 - Base64-encoded ZIP data
 * @returns Extraction result
 */
export async function unzipPacketFromBase64(base64: string): Promise<UnzipResult> {
  try {
    // Decode base64 to binary
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return unzipPacket(bytes);
  } catch (error) {
    return {
      success: false,
      files: new Map(),
      errors: ['Invalid base64 data'],
      warnings: [],
    };
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Parse a JSON file with error handling.
 */
function parseJsonFile<T>(
  content: string,
  filename: string,
  errors: string[]
): T | null {
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON';
    errors.push(`Failed to parse ${filename}: ${message}`);
    return null;
  }
}

/**
 * List all files in a ZIP without extracting.
 *
 * @param zipData - The ZIP file data
 * @returns Array of file paths
 */
export async function listZipContents(
  zipData: ArrayBuffer | Blob | Uint8Array
): Promise<string[]> {
  const zip = await JSZip.loadAsync(zipData);
  const paths: string[] = [];

  zip.forEach((relativePath, file) => {
    if (!file.dir) {
      paths.push(relativePath);
    }
  });

  return paths.sort();
}

/**
 * Extract a single file from a ZIP.
 *
 * @param zipData - The ZIP file data
 * @param filePath - Path to extract
 * @returns File content or null if not found
 */
export async function extractSingleFile(
  zipData: ArrayBuffer | Blob | Uint8Array,
  filePath: string
): Promise<string | null> {
  const zip = await JSZip.loadAsync(zipData);
  const file = zip.file(filePath);

  if (!file) {
    return null;
  }

  return file.async('string');
}

/**
 * Quick check if data is a valid ZIP file.
 *
 * @param data - Data to check
 * @returns true if valid ZIP
 */
export function isValidZip(data: ArrayBuffer | Uint8Array): boolean {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

  // ZIP files start with PK\x03\x04 or PK\x05\x06 (empty) or PK\x07\x08
  if (bytes.length < 4) return false;

  return (
    bytes[0] === 0x50 && // 'P'
    bytes[1] === 0x4b && // 'K'
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  );
}
