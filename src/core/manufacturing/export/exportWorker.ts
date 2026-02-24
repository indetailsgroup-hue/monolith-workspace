// src/core/manufacturing/export/exportWorker.ts
/**
 * Export Worker.
 *
 * Orchestrates export flow with gate enforcement and signing.
 * Designed for server-side execution but works client-side for MVP.
 *
 * Flow:
 * 1. Load job snapshot from storage
 * 2. Enforce gate (NO BYPASS)
 * 3. Build factory packet artifacts
 * 4. Sign manifest (if signer available)
 * 5. Build final packet with signature
 * 6. Return result
 *
 * v0.10.8.5 - Cross-Language Signing
 */

import {
  ExportRequest,
  ExportResult,
  ExportPacketInfo,
  createBlockedResult,
  createSuccessResult,
} from "./exportGate.v1";
import {
  enforceExportGate,
  ExportGateContext,
  GateSpecState,
  GateVerdict,
  ExportPolicy,
  DEFAULT_EXPORT_POLICY,
} from "./enforceExportGate";
import {
  buildFactoryPacketArtifacts,
  BuildPacketRequest,
  BuildPacketResult,
  PacketArtifact,
} from "./factoryPacketBuilder";
import { ToolpathManifestV1 } from "../manifest/toolpathManifest.v1";
import { sha256 } from "../audit/hashing";
import { SignerClient, signManifestAndGetBlock } from "./signerClient";
import { PinnedKeySetV1 } from "./sigVerify";

// =============================================================================
// STORAGE INTERFACE
// =============================================================================

/**
 * Job snapshot from storage.
 */
export interface JobSnapshot {
  jobId: string;
  specState: GateSpecState;
}

/**
 * Gate report from storage.
 */
export interface StoredGateReport {
  status: GateVerdict;
  json: string;
}

/**
 * Simulation report from storage.
 */
export interface StoredSimReport {
  sheetId: string;
  verdict: GateVerdict;
  json: string;
}

/**
 * Verifier report from storage.
 */
export interface StoredVerifierReport {
  sheetId: string;
  badgeStatus: GateVerdict;
  json: string;
}

/**
 * Consistency report from storage.
 */
export interface StoredConsistencyReport {
  sheetId: string;
  verdict: GateVerdict;
  json: string;
}

/**
 * NC file from storage.
 */
export interface StoredNcFile {
  sheetId: string;
  content: string;
}

/**
 * DXF file from storage.
 */
export interface StoredDxfFile {
  sheetId: string;
  content: string;
}

/**
 * IR file from storage.
 */
export interface StoredIrFile {
  sheetId: string;
  json: string;
}

/**
 * Storage provider interface.
 *
 * Implement this for your storage backend (IndexedDB, S3, etc.)
 */
export interface ExportStorageProvider {
  /** Get job snapshot */
  getJob(jobId: string): Promise<JobSnapshot | null>;

  /** Get gate report */
  getGateReport(jobId: string): Promise<StoredGateReport | null>;

  /** Get all sim reports */
  getSimReports(jobId: string): Promise<StoredSimReport[]>;

  /** Get all verifier reports */
  getVerifierReports(jobId: string): Promise<StoredVerifierReport[]>;

  /** Get all consistency reports */
  getConsistencyReports(jobId: string): Promise<StoredConsistencyReport[]>;

  /** Get manifest */
  getManifest(jobId: string): Promise<ToolpathManifestV1 | null>;

  /** Get NC files */
  getNcFiles(jobId: string): Promise<StoredNcFile[]>;

  /** Get DXF files */
  getDxfFiles(jobId: string): Promise<StoredDxfFile[]>;

  /** Get IR files */
  getIrFiles(jobId: string): Promise<StoredIrFile[]>;

  /** Store export packet */
  storePacket?(
    jobId: string,
    packetId: string,
    artifacts: PacketArtifact[]
  ): Promise<void>;
}

// =============================================================================
// EXPORT WORKER
// =============================================================================

/**
 * Export worker options.
 */
export interface ExportWorkerOptions {
  /** Export policy */
  policy?: ExportPolicy;

  /** Storage provider */
  storage: ExportStorageProvider;

  /** Signer client (optional, required if policy.signatureRequired) */
  signerClient?: SignerClient;

  /** Pinned key set for signature verification */
  pinnedKeySet?: PinnedKeySetV1;

  /** Signer ID for audit trail */
  signerId?: string;
}

/**
 * Export factory packet.
 *
 * Main entry point for export with gate enforcement.
 *
 * @param request Export request
 * @param options Worker options
 * @returns Export result
 */
export async function exportFactoryPacket(
  request: ExportRequest,
  options: ExportWorkerOptions
): Promise<ExportResult> {
  const startTime = Date.now();
  const { jobId } = request;
  const { storage, policy = DEFAULT_EXPORT_POLICY, signerClient, pinnedKeySet, signerId } = options;

  try {
    // =========================================================================
    // 1) Load authoritative job snapshot from storage
    // =========================================================================

    const job = await storage.getJob(jobId);
    if (!job) {
      return createBlockedResult(jobId, "E_JOB_NOT_FOUND");
    }

    const gateReport = await storage.getGateReport(jobId);
    if (!gateReport) {
      return createBlockedResult(jobId, "E_GATE_NOT_PASS", {
        reason: "No gate report found",
      });
    }

    const simReports = await storage.getSimReports(jobId);
    const verifierReports = await storage.getVerifierReports(jobId);
    const consistencyReports = await storage.getConsistencyReports(jobId);
    let manifest = await storage.getManifest(jobId);

    // =========================================================================
    // 2) Sign manifest if signer available and signature required
    // =========================================================================

    if (policy.signatureRequired && !manifest?.signature?.signatureHex) {
      // Need to sign the manifest
      if (!signerClient) {
        return createBlockedResult(jobId, "E_SIGNATURE_REQUIRED", {
          reason: "Signer client required but not provided",
        });
      }

      if (!manifest) {
        return createBlockedResult(jobId, "E_MANIFEST_MISSING", {
          reason: "Manifest required for signing",
        });
      }

      try {
        // Sign the manifest
        const signatureBlock = await signManifestAndGetBlock(
          signerClient,
          manifest.chain.manifestHash.hex,
          { signerId, jobId }
        );

        // Update manifest with signature
        manifest = {
          ...manifest,
          signature: signatureBlock,
        };

        // Store updated manifest (if storage supports it)
        if (storage.storePacket) {
          // We'll store it with the packet later
        }
      } catch (signError) {
        return createBlockedResult(jobId, "E_SIGNATURE_REQUIRED", {
          reason: "Failed to sign manifest",
          error: (signError as Error).message,
        });
      }
    }

    // =========================================================================
    // 3) Build gate context (with pinned keys for verification)
    // =========================================================================

    const gateContext: ExportGateContext = {
      specState: job.specState,
      gateStatus: gateReport.status,
      simVerdicts: simReports.map((r) => r.verdict),
      verifierBadges: verifierReports.map((r) => r.badgeStatus),
      consistencyVerdicts: consistencyReports.map((r) => r.verdict),
      manifest: manifest ?? undefined,
      signatureRequired: policy.signatureRequired,
      pinnedKeySet,
      verifySignature: policy.signatureRequired && !!pinnedKeySet,
    };

    // =========================================================================
    // 4) ENFORCE GATE - NO BYPASS
    // =========================================================================

    const decision = await enforceExportGate(gateContext);

    if (!decision.ok) {
      return createBlockedResult(
        jobId,
        decision.code,
        decision.detail as Record<string, unknown>
      );
    }

    // =========================================================================
    // 5) Load artifacts for packet
    // =========================================================================

    const ncFiles = await storage.getNcFiles(jobId);
    const dxfFiles = await storage.getDxfFiles(jobId);
    const irFiles = await storage.getIrFiles(jobId);

    // =========================================================================
    // 6) Build factory packet
    // =========================================================================

    const packetRequest: BuildPacketRequest = {
      jobId,
      manifest: manifest!,
      reports: {
        gateReport: gateReport.json,
        simReports: simReports.map((r) => ({
          sheetId: r.sheetId,
          json: r.json,
        })),
        verifierReports: verifierReports.map((r) => ({
          sheetId: r.sheetId,
          json: r.json,
        })),
        consistencyReports: consistencyReports.map((r) => ({
          sheetId: r.sheetId,
          json: r.json,
        })),
      },
      files: {
        ncFiles: ncFiles.map((f) => ({
          sheetId: f.sheetId,
          content: f.content,
        })),
        dxfFiles: dxfFiles.map((f) => ({
          sheetId: f.sheetId,
          content: f.content,
        })),
        irFiles: irFiles.map((f) => ({
          sheetId: f.sheetId,
          json: f.json,
        })),
      },
      include: {
        reports: request.include?.reports ?? true,
        ir: request.include?.ir ?? true,
        hashes: true,
      },
    };

    const packetResult = await buildFactoryPacketArtifacts(packetRequest);

    // =========================================================================
    // 7) Compute packet fingerprint
    // =========================================================================

    // Compute fingerprint from all artifact hashes (sorted)
    const allHashes = packetResult.artifacts
      .filter((a) => a.hash)
      .map((a) => a.hash!)
      .sort()
      .join("");
    const packetFp = await sha256(allHashes);

    const packetInfo: ExportPacketInfo = {
      ...packetResult.info,
      fileFp: packetFp,
      fileSizeBytes: packetResult.artifacts.reduce(
        (sum, a) => sum + new TextEncoder().encode(a.content).length,
        0
      ),
    };

    // =========================================================================
    // 8) Store packet (optional)
    // =========================================================================

    if (storage.storePacket) {
      await storage.storePacket(jobId, packetInfo.packetId, packetResult.artifacts);
    }

    // =========================================================================
    // 9) Return success
    // =========================================================================

    const processingTimeMs = Date.now() - startTime;

    return createSuccessResult(jobId, packetInfo, processingTimeMs);
  } catch (error) {
    return createBlockedResult(jobId, "E_INTERNAL_ERROR", {
      message: (error as Error).message,
    });
  }
}

// =============================================================================
// MOCK STORAGE (for testing/MVP)
// =============================================================================

/**
 * Create in-memory mock storage provider.
 *
 * For testing and MVP only - not for production.
 */
export function createMockStorageProvider(): ExportStorageProvider & {
  setJob(job: JobSnapshot): void;
  setGateReport(jobId: string, report: StoredGateReport): void;
  setManifest(jobId: string, manifest: ToolpathManifestV1): void;
  addSimReport(jobId: string, report: StoredSimReport): void;
  addVerifierReport(jobId: string, report: StoredVerifierReport): void;
  addConsistencyReport(jobId: string, report: StoredConsistencyReport): void;
  addNcFile(jobId: string, file: StoredNcFile): void;
  addDxfFile(jobId: string, file: StoredDxfFile): void;
  addIrFile(jobId: string, file: StoredIrFile): void;
} {
  const jobs = new Map<string, JobSnapshot>();
  const gateReports = new Map<string, StoredGateReport>();
  const simReports = new Map<string, StoredSimReport[]>();
  const verifierReports = new Map<string, StoredVerifierReport[]>();
  const consistencyReports = new Map<string, StoredConsistencyReport[]>();
  const manifests = new Map<string, ToolpathManifestV1>();
  const ncFiles = new Map<string, StoredNcFile[]>();
  const dxfFiles = new Map<string, StoredDxfFile[]>();
  const irFiles = new Map<string, StoredIrFile[]>();

  return {
    // Storage provider methods
    getJob: async (jobId) => jobs.get(jobId) ?? null,
    getGateReport: async (jobId) => gateReports.get(jobId) ?? null,
    getSimReports: async (jobId) => simReports.get(jobId) ?? [],
    getVerifierReports: async (jobId) => verifierReports.get(jobId) ?? [],
    getConsistencyReports: async (jobId) => consistencyReports.get(jobId) ?? [],
    getManifest: async (jobId) => manifests.get(jobId) ?? null,
    getNcFiles: async (jobId) => ncFiles.get(jobId) ?? [],
    getDxfFiles: async (jobId) => dxfFiles.get(jobId) ?? [],
    getIrFiles: async (jobId) => irFiles.get(jobId) ?? [],

    // Setters for testing
    setJob: (job) => jobs.set(job.jobId, job),
    setGateReport: (jobId, report) => gateReports.set(jobId, report),
    setManifest: (jobId, manifest) => manifests.set(jobId, manifest),
    addSimReport: (jobId, report) => {
      const existing = simReports.get(jobId) ?? [];
      simReports.set(jobId, [...existing, report]);
    },
    addVerifierReport: (jobId, report) => {
      const existing = verifierReports.get(jobId) ?? [];
      verifierReports.set(jobId, [...existing, report]);
    },
    addConsistencyReport: (jobId, report) => {
      const existing = consistencyReports.get(jobId) ?? [];
      consistencyReports.set(jobId, [...existing, report]);
    },
    addNcFile: (jobId, file) => {
      const existing = ncFiles.get(jobId) ?? [];
      ncFiles.set(jobId, [...existing, file]);
    },
    addDxfFile: (jobId, file) => {
      const existing = dxfFiles.get(jobId) ?? [];
      dxfFiles.set(jobId, [...existing, file]);
    },
    addIrFile: (jobId, file) => {
      const existing = irFiles.get(jobId) ?? [];
      irFiles.set(jobId, [...existing, file]);
    },
  };
}
