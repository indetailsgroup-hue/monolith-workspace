// src/core/manufacturing/export/factoryPacketBuilder.ts
/**
 * Factory Packet Builder.
 *
 * Deterministic packet construction for factory export.
 *
 * Key principles:
 * - File paths sorted lexicographically
 * - Timestamps normalized (for deterministic zip)
 * - Newlines normalized (\n)
 * - files.sha256.txt generated for convenience
 *
 * v0.10.8.4 - Export Gate Enforcement
 */

import { ExportPacketFile, ExportPacketInfo } from "./exportGate.v1";
import {
  ToolpathManifestV1,
  getFactoryPackStructure,
} from "../manifest/toolpathManifest.v1";
import { generateHashesFile, HashFileEntry } from "../manifest/buildToolpathManifest";
import { stableStringify, sha256 } from "../audit/hashing";

// =============================================================================
// PACKET TYPES
// =============================================================================

/**
 * File artifact for packet.
 */
export interface PacketArtifact {
  /** File path (relative to packet root) */
  path: string;

  /** File content (string for text, base64 for binary) */
  content: string;

  /** Content type */
  contentType: "text" | "binary";

  /** Pre-computed hash (optional, will compute if missing) */
  hash?: string;
}

/**
 * Report artifacts for packet.
 */
export interface PacketReports {
  /** Gate report JSON */
  gateReport: string;

  /** Simulation reports JSON (per sheet) */
  simReports: Array<{ sheetId: string; json: string }>;

  /** Verifier reports JSON (per sheet) */
  verifierReports: Array<{ sheetId: string; json: string }>;

  /** Consistency reports JSON (per sheet) */
  consistencyReports: Array<{ sheetId: string; json: string }>;
}

/**
 * NC/DXF files for packet.
 */
export interface PacketFiles {
  /** NC files */
  ncFiles: Array<{ sheetId: string; content: string }>;

  /** DXF files */
  dxfFiles: Array<{ sheetId: string; content: string }>;

  /** IR programs (optional) */
  irFiles?: Array<{ sheetId: string; json: string }>;
}

/**
 * Build packet request.
 */
export interface BuildPacketRequest {
  /** Job identifier */
  jobId: string;

  /** Toolpath manifest */
  manifest: ToolpathManifestV1;

  /** Reports */
  reports: PacketReports;

  /** NC/DXF files */
  files: PacketFiles;

  /** Include options */
  include?: {
    reports?: boolean;
    ir?: boolean;
    hashes?: boolean;
  };
}

/**
 * Build packet result.
 */
export interface BuildPacketResult {
  /** All artifacts sorted by path */
  artifacts: PacketArtifact[];

  /** Packet info */
  info: ExportPacketInfo;

  /** Hash file content */
  hashesFileContent: string;
}

// =============================================================================
// BUILDER
// =============================================================================

/**
 * Build factory packet artifacts.
 *
 * Does NOT create actual ZIP - returns sorted artifacts for zip builder.
 *
 * @param req Build request
 * @returns Packet artifacts
 */
export async function buildFactoryPacketArtifacts(
  req: BuildPacketRequest
): Promise<BuildPacketResult> {
  const artifacts: PacketArtifact[] = [];
  const hashEntries: HashFileEntry[] = [];
  const structure = getFactoryPackStructure(req.jobId);
  const rootDir = structure.rootDir;

  const includeReports = req.include?.reports ?? true;
  const includeIr = req.include?.ir ?? true;
  const includeHashes = req.include?.hashes ?? true;

  // 1) Manifest
  const manifestContent = stableStringify(req.manifest);
  const manifestHash = await sha256(manifestContent);
  artifacts.push({
    path: `${rootDir}/manifest.toolpath.v1.json`,
    content: manifestContent,
    contentType: "text",
    hash: manifestHash,
  });
  hashEntries.push({
    path: `${rootDir}/manifest.toolpath.v1.json`,
    hashHex: manifestHash,
  });

  // 2) Reports
  if (includeReports) {
    // Gate report
    const gateHash = await sha256(req.reports.gateReport);
    artifacts.push({
      path: `${rootDir}/reports/gate.report.json`,
      content: req.reports.gateReport,
      contentType: "text",
      hash: gateHash,
    });
    hashEntries.push({
      path: `${rootDir}/reports/gate.report.json`,
      hashHex: gateHash,
    });

    // Sim reports
    for (const sim of req.reports.simReports) {
      const simHash = await sha256(sim.json);
      artifacts.push({
        path: `${rootDir}/reports/sim.${sim.sheetId}.json`,
        content: sim.json,
        contentType: "text",
        hash: simHash,
      });
      hashEntries.push({
        path: `${rootDir}/reports/sim.${sim.sheetId}.json`,
        hashHex: simHash,
      });
    }

    // Verifier reports
    for (const ver of req.reports.verifierReports) {
      const verHash = await sha256(ver.json);
      artifacts.push({
        path: `${rootDir}/reports/verify.${ver.sheetId}.json`,
        content: ver.json,
        contentType: "text",
        hash: verHash,
      });
      hashEntries.push({
        path: `${rootDir}/reports/verify.${ver.sheetId}.json`,
        hashHex: verHash,
      });
    }

    // Consistency reports
    for (const con of req.reports.consistencyReports) {
      const conHash = await sha256(con.json);
      artifacts.push({
        path: `${rootDir}/reports/consistency.${con.sheetId}.json`,
        content: con.json,
        contentType: "text",
        hash: conHash,
      });
      hashEntries.push({
        path: `${rootDir}/reports/consistency.${con.sheetId}.json`,
        hashHex: conHash,
      });
    }
  }

  // 3) IR programs
  if (includeIr && req.files.irFiles) {
    for (const ir of req.files.irFiles) {
      const irHash = await sha256(ir.json);
      artifacts.push({
        path: `${rootDir}/ir/${ir.sheetId}.ir.json`,
        content: ir.json,
        contentType: "text",
        hash: irHash,
      });
      hashEntries.push({
        path: `${rootDir}/ir/${ir.sheetId}.ir.json`,
        hashHex: irHash,
      });
    }
  }

  // 4) NC files
  for (const nc of req.files.ncFiles) {
    const ncContent = normalizeNewlines(nc.content);
    const ncHash = await sha256(ncContent);
    artifacts.push({
      path: `${rootDir}/gcode/${nc.sheetId}.nc`,
      content: ncContent,
      contentType: "text",
      hash: ncHash,
    });
    hashEntries.push({
      path: `${rootDir}/gcode/${nc.sheetId}.nc`,
      hashHex: ncHash,
    });
  }

  // 5) DXF files
  for (const dxf of req.files.dxfFiles) {
    const dxfContent = normalizeNewlines(dxf.content);
    const dxfHash = await sha256(dxfContent);
    artifacts.push({
      path: `${rootDir}/dxf/${dxf.sheetId}.dxf`,
      content: dxfContent,
      contentType: "text",
      hash: dxfHash,
    });
    hashEntries.push({
      path: `${rootDir}/dxf/${dxf.sheetId}.dxf`,
      hashHex: dxfHash,
    });
  }

  // 6) Generate hashes file
  const hashesContent = generateHashesFile(hashEntries);
  if (includeHashes) {
    artifacts.push({
      path: `${rootDir}/hashes/files.sha256.txt`,
      content: hashesContent,
      contentType: "text",
    });
  }

  // 7) Sort artifacts by path (deterministic)
  artifacts.sort((a, b) => a.path.localeCompare(b.path));

  // 8) Build packet info
  const files: ExportPacketFile[] = artifacts
    .filter((a) => a.hash)
    .map((a) => ({
      path: a.path,
      hash: a.hash!,
      sizeBytes: new TextEncoder().encode(a.content).length,
    }));

  const packetId = `pkt_${req.jobId}_${req.manifest.chain.manifestHash.hex.slice(0, 12)}`;

  const info: ExportPacketInfo = {
    packetId,
    manifestHash: req.manifest.chain.manifestHash.hex,
    fileFp: "", // Will be computed from actual ZIP bytes
    files,
    createdAt: new Date().toISOString(),
  };

  return {
    artifacts,
    info,
    hashesFileContent: hashesContent,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Normalize newlines to \n (Unix style).
 */
export function normalizeNewlines(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Ensure content ends with newline.
 */
export function ensureTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : content + "\n";
}

/**
 * Compute deterministic content hash.
 */
export async function computeContentHash(content: string): Promise<string> {
  const normalized = normalizeNewlines(content);
  return sha256(normalized);
}

// =============================================================================
// PACKET ID GENERATION
// =============================================================================

/**
 * Generate packet ID from job and manifest.
 */
export function generatePacketId(
  jobId: string,
  manifestHashHex: string,
  timestamp?: Date
): string {
  const ts = timestamp ?? new Date();
  const dateStr = ts.toISOString().slice(0, 10).replace(/-/g, "");
  const hashPrefix = manifestHashHex.slice(0, 8);
  return `pkt_${jobId}_${dateStr}_${hashPrefix}`;
}

/**
 * Parse packet ID.
 */
export function parsePacketId(packetId: string): {
  jobId: string;
  dateStr?: string;
  hashPrefix?: string;
} | null {
  const match = packetId.match(/^pkt_(.+?)_(\d{8})?_?([a-f0-9]+)?$/);
  if (!match) return null;

  return {
    jobId: match[1],
    dateStr: match[2],
    hashPrefix: match[3],
  };
}

// =============================================================================
// VERIFICATION
// =============================================================================

/**
 * Verify packet artifact hash.
 */
export async function verifyPacketArtifact(
  artifact: PacketArtifact,
  expectedHash: string
): Promise<boolean> {
  const computed = await computeContentHash(artifact.content);
  return computed === expectedHash.toLowerCase();
}

/**
 * Verify all packet artifacts.
 */
export async function verifyPacketArtifacts(
  artifacts: PacketArtifact[],
  hashEntries: HashFileEntry[]
): Promise<{ valid: boolean; mismatches: string[] }> {
  const mismatches: string[] = [];

  for (const entry of hashEntries) {
    const artifact = artifacts.find((a) => a.path === entry.path);
    if (!artifact) {
      mismatches.push(`Missing: ${entry.path}`);
      continue;
    }

    const valid = await verifyPacketArtifact(artifact, entry.hashHex);
    if (!valid) {
      mismatches.push(`Hash mismatch: ${entry.path}`);
    }
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
  };
}
