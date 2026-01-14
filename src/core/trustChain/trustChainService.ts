/**
 * trustChainService.ts - Unified Trust Chain Service
 *
 * SINGLE ENTRY POINT for all trust chain operations:
 * - commit: Commit approved state (DRAFT updates)
 * - freeze: Transition to FROZEN state
 * - release: Transition to RELEASED state
 * - exportBundle: Export bundle (requires RELEASED)
 * - verifyBundle: Verify bundle integrity
 *
 * NORTH STAR: Export requires RELEASED state
 */

import type { ManifestStore } from '../manifest/manifestStoreTypes';
import type { Keyring } from '../crypto/keyring';
import type { CollisionReport } from '../collision/collisionReport';
import type { SignedJobManifest } from '../trust/manifestChainTypes';
import type { SpecStatus } from '../spec/specState';
import type { CabinetForGate, CommitResult } from '../export/commitApprovedState';
import type { RunGatePerCabinetFn } from '../gate/runGateBundle';
import type { ExportArtifact } from '../export/exportPipeline';
import type { FactoryAcceptanceChecklist } from '../factory/generateFactoryChecklist';
import type { BundleVerificationResult } from '../bundle/bundleTypes';

import { commitApprovedState, createGenesisManifest } from '../export/commitApprovedState';
import { guardedExport } from '../export/exportPipeline';
import { generateFactoryChecklist } from '../factory/generateFactoryChecklist';
import { loadManifestChain, loadChainProof } from '../manifest/loadManifestChain';
import { buildExportBundle, generateBundleFilename } from '../bundle/buildExportBundle';
import { quickVerifyBundle } from '../bundle/verifyExportBundle';
import { verifyChain } from '../trust/verifyManifestChain';
import {
  assertExportAllowed,
  getSpecStateFromHead,
  getSpecStatusFromHead,
} from '../spec/specPolicy';
import { createFrozenStatus, createReleasedStatus, createDraftStatus } from '../spec/specState';
import { buildTimeline, type AcceptanceTimeline } from '../chainEvents/buildTimeline';
import { verifySignedFactoryReceipt, type ReceiptVerificationResult } from '../receipt/verifyFactoryReceipt';
import { appendReceipt, type AppendReceiptResult } from '../receipt/appendReceiptManifest';
import type { SignedFactoryReceipt } from '../receipt/factoryReceiptTypes';
import {
  parseRevisionFromJobId,
  generateRevisionJobId,
  createForkedRevisionMeta,
  type RevisionMeta,
} from '../trust/manifestChainTypes';
import type { JobRegistryStore } from '../jobRegistry/jobRegistryStore';
import type { ApprovalSigner } from '../trust/approvalSigner';
import type { IssuePack, IssueItem, IssueStatus } from '../issues/issueTypes';
import { buildIssuePackFromRejectedReceipt } from '../issues/buildIssuePackFromReceipt';
import { findIssueInPacks } from '../issues/findIssue';
import { updateIssueInPacks, type IssuePatch } from '../issues/updateIssuePack';
import { validateIssueStatusChange, validateUnwaive } from '../issues/issueValidation';
import { checkManifestBlocking, type BlockingResult } from '../issues/issueRules';
import { buildPreflightReport, type PreflightReport } from '../preflight/buildPreflightReport';
import type { ArtifactStore } from '../infra/artifacts/artifactStoreTypes';
import type { FactoryPackageExporter } from '../export/factoryPackageExporter';
import type { ExportRecord, ExportArtifactRef, ExportBundleCore } from '../export/exportBundleTypes';
import { makeExportId } from '../export/exportBundleTypes';
import { sha256CanonicalHex } from '../crypto/sha256';

// ============================================
// SERVICE CONFIG
// ============================================

/**
 * Trust chain service configuration
 */
export interface TrustChainConfig {
  /** Manifest store */
  store: ManifestStore;

  /** Keyring for signature verification */
  keyring: Keyring;

  // ---- Signing Keys ----
  /** Approval key ID (for trust signing) */
  approvalKeyId: string;

  /** Approval private key (hex) */
  approvalPrivateKeyHex: string;

  /** Manifest key ID */
  manifestKeyId: string;

  /** Manifest private key (hex) */
  manifestPrivateKeyHex: string;

  // ---- Policies ----
  /** Minimum gap for collision checking (mm) */
  minGapMm: number;

  /** Maximum chain depth for verification */
  chainDepthMax: number;

  /** Chain proof depth to include in bundle */
  bundleProofDepth: number;

  /** Creator identifier */
  createdBy?: string;

  /** Job registry for tracking job IDs (optional, for fork) */
  jobRegistry?: JobRegistryStore;

  // ---- Export Pipeline (optional) ----
  /** Artifact store for export files (optional, for exportFactoryPackageAndAppend) */
  artifactStore?: ArtifactStore;

  /** Factory package exporter (optional, for exportFactoryPackageAndAppend) */
  factoryExporter?: FactoryPackageExporter;
}

// ============================================
// FORK REVISION RESULT
// ============================================

/**
 * Result of forking a revision from rejected receipt
 */
export interface ForkRevisionResult {
  ok: boolean;
  reason?: string;
  newJobId?: string;
  newRevisionNumber?: number;
  genesisHash?: string;
  forkedFromJobId?: string;
  forkedFromManifestHashHex?: string;
  revision?: RevisionMeta;
}

// ============================================
// SERVICE CLASS
// ============================================

/**
 * Trust Chain Service
 *
 * Unified entry point for all trust chain operations.
 */
export class TrustChainService {
  constructor(private cfg: TrustChainConfig) {}

  // ============================================
  // HEAD ACCESS
  // ============================================

  /**
   * Get HEAD manifest for job
   */
  async getHead(
    jobId: string
  ): Promise<
    | { ok: true; headHash: string; head: SignedJobManifest }
    | { ok: false; reason: string }
  > {
    const headHash = await this.cfg.store.getHead(jobId);
    if (!headHash) {
      return { ok: false, reason: 'No HEAD manifest for job' };
    }

    const head = await this.cfg.store.loadByHash(headHash);
    if (!head) {
      return { ok: false, reason: 'HEAD manifest missing from store' };
    }

    return { ok: true, headHash, head };
  }

  /**
   * Get current spec status from HEAD
   */
  async getSpecStatus(
    jobId: string
  ): Promise<
    | { ok: true; spec: SpecStatus; head: SignedJobManifest }
    | { ok: false; reason: string }
  > {
    const headR = await this.getHead(jobId);
    if (!headR.ok) return headR;

    return {
      ok: true,
      spec: getSpecStatusFromHead(headR.head),
      head: headR.head,
    };
  }

  // ============================================
  // GENESIS
  // ============================================

  /**
   * Create genesis manifest for new job
   */
  async createGenesis(
    jobId: string
  ): Promise<{ ok: true; headHash: string } | { ok: false; reason: string }> {
    return createGenesisManifest({
      jobId,
      store: this.cfg.store,
      approvalKeyId: this.cfg.approvalKeyId,
      approvalPrivateKeyHex: this.cfg.approvalPrivateKeyHex,
      manifestKeyId: this.cfg.manifestKeyId,
      manifestPrivateKeyHex: this.cfg.manifestPrivateKeyHex,
      createdBy: this.cfg.createdBy,
    });
  }

  // ============================================
  // COMMIT (DRAFT UPDATES)
  // ============================================

  /**
   * Commit approved state
   *
   * Used for geometry/param updates in DRAFT state.
   */
  async commit(args: {
    jobId: string;
    selectionPreview: CabinetForGate[];
    selectionIds: string[];
    activeId: string | null;
    collision: CollisionReport | null;
    spec?: SpecStatus;
    runGatePerCabinet: RunGatePerCabinetFn;
    commitAll: (cabs: CabinetForGate[]) => void;
    allowGenesis?: boolean;
  }): Promise<CommitResult> {
    return commitApprovedState({
      jobId: args.jobId,
      selectionPreview: args.selectionPreview,
      selectionIds: args.selectionIds,
      activeId: args.activeId,
      collision: args.collision,
      spec: args.spec,
      minGapMm: this.cfg.minGapMm,
      runGatePerCabinet: args.runGatePerCabinet,
      commitAll: args.commitAll,
      store: this.cfg.store,
      approvalKeyId: this.cfg.approvalKeyId,
      approvalPrivateKeyHex: this.cfg.approvalPrivateKeyHex,
      manifestKeyId: this.cfg.manifestKeyId,
      manifestPrivateKeyHex: this.cfg.manifestPrivateKeyHex,
      allowGenesis: args.allowGenesis,
      createdBy: this.cfg.createdBy,
    });
  }

  // ============================================
  // STATE TRANSITIONS
  // ============================================

  /**
   * Set spec state (freeze/release/unfreeze)
   *
   * This creates a new manifest with updated spec status.
   * Gate must still pass for the transition.
   */
  async setSpecState(args: {
    jobId: string;
    nextSpec: SpecStatus;
    selectionPreview: CabinetForGate[];
    selectionIds: string[];
    activeId: string | null;
    collision: CollisionReport | null;
    runGatePerCabinet: RunGatePerCabinetFn;
    commitAll: (cabs: CabinetForGate[]) => void;
  }): Promise<CommitResult> {
    return this.commit({
      ...args,
      spec: args.nextSpec,
      allowGenesis: false,
    });
  }

  /**
   * Freeze spec (DRAFT → FROZEN)
   */
  async freeze(args: {
    jobId: string;
    selectionPreview: CabinetForGate[];
    selectionIds: string[];
    activeId: string | null;
    collision: CollisionReport | null;
    runGatePerCabinet: RunGatePerCabinetFn;
    commitAll: (cabs: CabinetForGate[]) => void;
  }): Promise<CommitResult> {
    // Get current spec
    const headR = await this.getHead(args.jobId);
    if (!headR.ok) {
      return { ok: false, reason: headR.reason };
    }

    const currentSpec = getSpecStatusFromHead(headR.head);
    if (currentSpec.state !== 'DRAFT') {
      return { ok: false, reason: `Cannot freeze from ${currentSpec.state} state` };
    }

    const frozenSpec = createFrozenStatus(currentSpec);
    return this.setSpecState({ ...args, nextSpec: frozenSpec });
  }

  /**
   * Release spec (FROZEN → RELEASED)
   */
  async release(args: {
    jobId: string;
    selectionPreview: CabinetForGate[];
    selectionIds: string[];
    activeId: string | null;
    collision: CollisionReport | null;
    runGatePerCabinet: RunGatePerCabinetFn;
    commitAll: (cabs: CabinetForGate[]) => void;
  }): Promise<CommitResult> {
    // Get current spec
    const headR = await this.getHead(args.jobId);
    if (!headR.ok) {
      return { ok: false, reason: headR.reason };
    }

    const currentSpec = getSpecStatusFromHead(headR.head);
    if (currentSpec.state !== 'FROZEN') {
      return { ok: false, reason: `Cannot release from ${currentSpec.state} state` };
    }

    const releasedSpec = createReleasedStatus(currentSpec);
    return this.setSpecState({ ...args, nextSpec: releasedSpec });
  }

  /**
   * Unfreeze spec (FROZEN → DRAFT)
   */
  async unfreeze(args: {
    jobId: string;
    selectionPreview: CabinetForGate[];
    selectionIds: string[];
    activeId: string | null;
    collision: CollisionReport | null;
    runGatePerCabinet: RunGatePerCabinetFn;
    commitAll: (cabs: CabinetForGate[]) => void;
  }): Promise<CommitResult> {
    // Get current spec
    const headR = await this.getHead(args.jobId);
    if (!headR.ok) {
      return { ok: false, reason: headR.reason };
    }

    const currentSpec = getSpecStatusFromHead(headR.head);
    if (currentSpec.state !== 'FROZEN') {
      return { ok: false, reason: `Cannot unfreeze from ${currentSpec.state} state` };
    }

    const draftSpec = createDraftStatus(currentSpec.note);
    return this.setSpecState({ ...args, nextSpec: draftSpec });
  }

  // ============================================
  // EXPORT BUNDLE
  // ============================================

  /**
   * Export bundle (requires RELEASED state)
   *
   * Creates a zip bundle containing:
   * - Export artifacts
   * - Signed manifest
   * - Factory acceptance checklist
   * - Bundle index
   * - Optional chain proof
   */
  async exportBundle(args: {
    jobId: string;
    generateExports: () => Promise<ExportArtifact[]>;
  }): Promise<
    | { ok: true; zipBlob: Blob; filename: string; checklist: FactoryAcceptanceChecklist }
    | { ok: false; reason: string }
  > {
    const { jobId, generateExports } = args;

    // 1. Get HEAD and check permissions
    const headR = await this.getHead(jobId);
    if (!headR.ok) return headR;

    // 2. Check spec state (must be RELEASED)
    const exportCheck = assertExportAllowed(headR.head);
    if (!exportCheck.ok) return exportCheck;

    // 3. Generate exports
    let artifacts: ExportArtifact[];
    try {
      artifacts = await generateExports();
    } catch (e) {
      return {
        ok: false,
        reason: `Export generation failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
      };
    }

    if (artifacts.length === 0) {
      return { ok: false, reason: 'No artifacts generated' };
    }

    // 4. Create guarded export (appends export manifest)
    const exportResult = await guardedExport({
      jobId,
      store: this.cfg.store,
      keyring: this.cfg.keyring,
      manifestKeyId: this.cfg.manifestKeyId,
      manifestPrivateKeyHex: this.cfg.manifestPrivateKeyHex,
      generate: async () => artifacts,
      persist: async () => {}, // No-op, we'll bundle instead
      maxDepth: this.cfg.chainDepthMax,
      createdBy: this.cfg.createdBy,
    });

    if (!exportResult.ok) {
      return { ok: false, reason: exportResult.reason };
    }

    // 5. Generate checklist
    const checklistResult = await generateFactoryChecklist({
      jobId,
      store: this.cfg.store,
      keyring: this.cfg.keyring,
      maxDepth: this.cfg.chainDepthMax,
    });

    if (!checklistResult.ok) {
      return { ok: false, reason: checklistResult.reason };
    }

    // 6. Convert artifacts to bytes map
    const artifactContent = new Map<string, Uint8Array>();
    for (const artifact of artifacts) {
      const bytes =
        typeof artifact.content === 'string'
          ? new TextEncoder().encode(artifact.content)
          : artifact.content;
      artifactContent.set(artifact.filename, bytes);
    }

    // 7. Build bundle
    const bundleResult = await buildExportBundle({
      jobId,
      store: this.cfg.store,
      keyring: this.cfg.keyring,
      artifactContent,
      options: {
        includeChainProof: true,
        chainProofDepth: this.cfg.bundleProofDepth,
        createdBy: this.cfg.createdBy,
      },
    });

    if (!bundleResult.ok) {
      return { ok: false, reason: bundleResult.reason };
    }

    return {
      ok: true,
      zipBlob: bundleResult.zipBlob,
      filename: generateBundleFilename(jobId),
      checklist: checklistResult.checklist,
    };
  }

  // ============================================
  // VERIFY BUNDLE
  // ============================================

  /**
   * Verify bundle integrity
   */
  async verifyBundle(zipBlob: Blob): Promise<BundleVerificationResult> {
    return quickVerifyBundle(zipBlob, this.cfg.keyring);
  }

  // ============================================
  // CHAIN VERIFICATION
  // ============================================

  /**
   * Verify chain for job
   */
  async verifyChain(jobId: string): Promise<
    | { ok: true; chainLength: number; genesisHashHex?: string }
    | { ok: false; reason: string; chainLength?: number }
  > {
    const headR = await this.getHead(jobId);
    if (!headR.ok) return { ok: false, reason: headR.reason };

    const result = await verifyChain({
      head: headR.head,
      keyring: this.cfg.keyring,
      store: this.cfg.store,
      maxDepth: this.cfg.chainDepthMax,
    });

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason ?? 'Chain verification failed',
        chainLength: result.chainLength,
      };
    }

    return {
      ok: true,
      chainLength: result.chainLength,
      genesisHashHex: result.genesisHashHex,
    };
  }

  /**
   * Load chain for job
   */
  async loadChain(jobId: string) {
    return loadManifestChain({
      jobId,
      store: this.cfg.store,
      maxDepth: this.cfg.chainDepthMax,
    });
  }

  // ============================================
  // CHECKLIST
  // ============================================

  /**
   * Generate factory checklist
   */
  async generateChecklist(jobId: string): Promise<
    | { ok: true; checklist: FactoryAcceptanceChecklist }
    | { ok: false; reason: string }
  > {
    return generateFactoryChecklist({
      jobId,
      store: this.cfg.store,
      keyring: this.cfg.keyring,
      maxDepth: this.cfg.chainDepthMax,
    });
  }

  // ============================================
  // TIMELINE & ACCEPTANCE STATUS
  // ============================================

  /**
   * Get acceptance timeline for job
   *
   * Loads the manifest chain and builds a timeline with:
   * - Classified events (APPROVAL, FREEZE, RELEASE, EXPORT, FACTORY_RECEIPT)
   * - Diff between manifests
   * - Acceptance status derivation
   * - Milestone markers
   */
  async getTimeline(jobId: string): Promise<
    | { ok: true; timeline: AcceptanceTimeline }
    | { ok: false; reason: string }
  > {
    try {
      const result = await loadManifestChain({
        jobId,
        store: this.cfg.store,
        maxDepth: this.cfg.chainDepthMax,
      });

      if (!result.ok) {
        return { ok: false, reason: result.reason };
      }

      if (result.chain.length === 0) {
        return { ok: false, reason: 'No manifests in chain' };
      }

      const timeline = buildTimeline(result.chain, jobId);
      return { ok: true, timeline };
    } catch (e) {
      return {
        ok: false,
        reason: e instanceof Error ? e.message : 'Timeline build failed',
      };
    }
  }

  // ============================================
  // FACTORY RECEIPTS
  // ============================================

  /**
   * Verify a factory receipt signature
   */
  async verifyReceipt(signedReceipt: SignedFactoryReceipt): Promise<ReceiptVerificationResult> {
    return verifySignedFactoryReceipt({
      signed: signedReceipt,
      keyring: this.cfg.keyring,
    });
  }

  /**
   * Append factory receipt to manifest chain
   *
   * Creates a new manifest with the receipt included.
   * This closes the loop from factory back to design.
   *
   * POLICY ENFORCEMENT:
   * - Must be in RELEASED state
   * - Must have exports recorded in HEAD
   * - Receipt must reference current HEAD manifest
   */
  async appendReceipt(args: {
    jobId: string;
    signedReceipt: SignedFactoryReceipt;
  }): Promise<AppendReceiptResult> {
    // 1. Policy: Load HEAD and check state
    const headR = await this.getHead(args.jobId);
    if (!headR.ok) {
      return { ok: false, reason: headR.reason };
    }

    // 2. Policy: Must be RELEASED
    const spec = headR.head.signedTrust?.trust?.spec?.state ?? 'DRAFT';
    if (spec !== 'RELEASED') {
      return {
        ok: false,
        reason: `Cannot append receipt unless RELEASED. Current state: ${spec}`,
      };
    }

    // 3. Policy: Must have exports
    const exportsCount = headR.head.exports?.length ?? 0;
    if (exportsCount === 0) {
      return {
        ok: false,
        reason: 'Cannot append receipt: no exports recorded in HEAD manifest',
      };
    }

    // 4. Delegate to domain function
    return appendReceipt({
      jobId: args.jobId,
      store: this.cfg.store,
      keyring: this.cfg.keyring,
      signedReceipt: args.signedReceipt,
      manifestKeyId: this.cfg.manifestKeyId,
      manifestPrivateKeyHex: this.cfg.manifestPrivateKeyHex,
      createdBy: this.cfg.createdBy,
    });
  }

  // ============================================
  // REVISION FORK (for rejected receipts)
  // ============================================

  /**
   * Fork revision from rejected receipt
   *
   * When a factory REJECTS a job, this creates a new revision:
   * 1. Generate new job ID (e.g., JOB_123__R2)
   * 2. Copy design state from HEAD
   * 3. Reset to DRAFT state
   * 4. Create genesis with RevisionMeta linking to original
   *
   * WORKFLOW:
   * - Factory rejects JOB_123
   * - User clicks "Create Revision" in UI
   * - This creates JOB_123__R2 in DRAFT state
   * - User fixes issues and re-releases
   *
   * PRODUCTION NOTES:
   * - Uses ApprovalSigner to properly re-sign TrustReport
   * - Registers new job ID in registry (if configured)
   * - Gate resets to false (must re-validate on next commit)
   *
   * @param args.jobId - Current job ID (the rejected one)
   * @param args.rejectedReceipt - The REJECTED receipt
   * @param args.approvalSigner - Signer for the new TrustReport
   * @returns New revision job ID and genesis hash
   */
  async forkRevisionFromRejectedReceipt(args: {
    jobId: string;
    rejectedReceipt: SignedFactoryReceipt;
    approvalSigner: ApprovalSigner;
  }): Promise<ForkRevisionResult> {
    const { jobId, rejectedReceipt, approvalSigner } = args;

    // 1. Validate receipt is REJECTED
    if (rejectedReceipt.receipt.verdict !== 'REJECTED') {
      return {
        ok: false,
        reason: 'Cannot fork from non-REJECTED receipt. Use for REJECTED only.',
      };
    }

    // 2. Validate receipt belongs to this job
    if (rejectedReceipt.receipt.jobId !== jobId) {
      return {
        ok: false,
        reason: `Receipt is for job ${rejectedReceipt.receipt.jobId}, not ${jobId}`,
      };
    }

    // 3. Get current HEAD
    const headR = await this.getHead(jobId);
    if (!headR.ok) {
      return { ok: false, reason: headR.reason };
    }

    // 4. Calculate new revision number using registry if available
    let newRevisionNumber: number;
    let newJobId: string;

    if (this.cfg.jobRegistry) {
      // Use registry to find highest existing revision
      const allJobIds = await this.cfg.jobRegistry.listJobIds();
      const { originalJobId } = parseRevisionFromJobId(jobId);

      // Find highest existing revision for this job
      const revisionPattern = new RegExp(`^${originalJobId}__R(\\d+)$`);
      let maxRevision = 0;

      for (const id of allJobIds) {
        const match = id.match(revisionPattern);
        if (match) {
          maxRevision = Math.max(maxRevision, parseInt(match[1], 10));
        }
      }

      // Also check the source job's revision number
      const sourceRevision = parseRevisionFromJobId(jobId).revisionNumber;
      maxRevision = Math.max(maxRevision, sourceRevision);

      newRevisionNumber = maxRevision + 1;
      newJobId = generateRevisionJobId(jobId, newRevisionNumber);
    } else {
      // Fallback: use simple increment from source job
      const { originalJobId, revisionNumber } = parseRevisionFromJobId(jobId);
      newRevisionNumber = revisionNumber + 1;
      newJobId = generateRevisionJobId(jobId, newRevisionNumber);
    }

    // 5. Check if new job ID already exists
    const existingHead = await this.cfg.store.getHead(newJobId);
    if (existingHead) {
      return {
        ok: false,
        reason: `Revision ${newJobId} already exists`,
      };
    }

    // 6. Create revision metadata
    const revisionMeta = createForkedRevisionMeta({
      newRevisionNumber,
      originalJobId: parseRevisionFromJobId(jobId).originalJobId,
      forkedFromJobId: jobId,
      forkedFromManifestHashHex: headR.head.manifestHashHex,
      forkedFromReceiptHashHex: rejectedReceipt.receiptHashHex,
      reason: `REJECTED by ${rejectedReceipt.receipt.stationId ?? 'factory'}: ${rejectedReceipt.receipt.note ?? 'No note'}`,
    });

    // 6b. Build IssuePack from rejected receipt (if has reject reasons)
    const issuePack = await buildIssuePackFromRejectedReceipt({
      revisionJobId: newJobId,
      parentReleaseHashHex: headR.head.manifestHashHex,
      signedReceipt: rejectedReceipt,
    });

    // 7. Create genesis manifest for new revision using ApprovalSigner
    const genesisResult = await this.createGenesisWithRevision({
      jobId: newJobId,
      revision: revisionMeta,
      issuePacks: [issuePack],
      approvalSigner,
    });

    if (!genesisResult.ok) {
      return { ok: false, reason: genesisResult.reason };
    }

    // 8. Register new job ID in registry
    if (this.cfg.jobRegistry) {
      await this.cfg.jobRegistry.addJobId(newJobId);
    }

    return {
      ok: true,
      newJobId,
      newRevisionNumber,
      genesisHash: genesisResult.headHash,
      forkedFromJobId: jobId,
      forkedFromManifestHashHex: headR.head.manifestHashHex,
      revision: revisionMeta,
    };
  }

  /**
   * Create genesis manifest with revision metadata
   *
   * Uses ApprovalSigner to properly sign the new TrustReport.
   * This is an internal helper for forkRevisionFromRejectedReceipt.
   */
  private async createGenesisWithRevision(args: {
    jobId: string;
    revision: RevisionMeta;
    issuePacks?: IssuePack[];
    approvalSigner: ApprovalSigner;
  }): Promise<{ ok: true; headHash: string } | { ok: false; reason: string }> {
    // Import the genesis builder with extras support
    const { buildSignedManifestWithExtras } = await import('../trust/buildManifestWithExtras');
    const { createEmptyCollisionSummary } = await import('../trust/trustReportTypes');

    // Create minimal TrustReport for genesis (DRAFT state)
    // Gate is false - must re-validate on next commit
    const trustReport = {
      version: '1.0' as const,
      jobId: args.jobId,
      timestampIso: new Date().toISOString(),
      selectionIds: [],
      activeId: null,
      spec: createDraftStatus(`Revision ${args.revision.revisionNumber} forked from ${args.revision.forkedFromJobId}`),
      gate: {
        ok: false, // Must re-validate
        perCabinet: [],
        globalIssues: [],
        totalIssues: 0,
        errorCount: 0,
        warningCount: 0,
      },
      collision: createEmptyCollisionSummary(),
      snapshotHashHex: '0'.repeat(64), // Placeholder, will be filled on first commit
    };

    // CRITICAL: Sign with ApprovalSigner (proper approval key handling)
    const signedTrust = await args.approvalSigner.signTrust(trustReport);

    // Build genesis manifest with revision metadata and issue packs
    const manifest = await buildSignedManifestWithExtras({
      jobId: args.jobId,
      prevManifestHashHex: null, // Genesis
      signedTrust,
      exports: [],
      manifestKeyId: this.cfg.manifestKeyId,
      manifestPrivateKeyHex: this.cfg.manifestPrivateKeyHex,
      createdBy: this.cfg.createdBy,
      coreExtras: {
        revision: args.revision,
        issuePacks: args.issuePacks,
      },
    });

    // Store and set as HEAD
    await this.cfg.store.put(manifest);
    await this.cfg.store.setHead(args.jobId, manifest.manifestHashHex);

    return { ok: true, headHash: manifest.manifestHashHex };
  }

  // ============================================
  // ISSUE PACK OPERATIONS
  // ============================================

  /**
   * Check if job has blocking issues
   *
   * Use this before allowing release/export.
   *
   * @param jobId - Job ID to check
   * @returns Blocking result
   */
  async checkBlockingIssues(jobId: string): Promise<{ ok: true; result: BlockingResult } | { ok: false; reason: string }> {
    const headR = await this.getHead(jobId);
    if (!headR.ok) {
      return { ok: false, reason: headR.reason };
    }

    const result = checkManifestBlocking(headR.head);
    return { ok: true, result };
  }

  /**
   * Ensure job has no blocking issues
   *
   * Returns error if any ERROR issues are OPEN or IN_PROGRESS.
   * Use this to gate release/export.
   */
  async ensureNoBlockingIssues(jobId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const checkResult = await this.checkBlockingIssues(jobId);
    if (!checkResult.ok) {
      return checkResult;
    }

    if (checkResult.result.blocked) {
      return {
        ok: false,
        reason: `Blocked by Issue Pack: ${checkResult.result.count} blocking issue(s). ${checkResult.result.summary}`,
      };
    }

    return { ok: true };
  }

  /**
   * Update an issue within issue packs
   *
   * Creates a new manifest with updated issue packs (append-only audit trail).
   * Enforces WAIVE strict rules at service level.
   *
   * @param args.jobId - Job ID
   * @param args.issueId - Issue ID to update
   * @param args.patch - Fields to update
   * @returns New head hash or error
   */
  async updateIssue(args: {
    jobId: string;
    issueId: string;
    patch: {
      status?: IssueStatus;
      owner?: string;
      note?: string;
      waivedBy?: string;
      waivedReason?: string;
    };
  }): Promise<{ ok: true; newHeadHash: string } | { ok: false; reason: string }> {
    const { jobId, issueId, patch } = args;

    // 1. Get current HEAD
    const headR = await this.getHead(jobId);
    if (!headR.ok) {
      return { ok: false, reason: headR.reason };
    }

    const head = headR.head;
    const packs = head.issuePacks ?? [];

    if (packs.length === 0) {
      return { ok: false, reason: 'No issue packs on this job' };
    }

    // 2. Find the issue
    const current = findIssueInPacks(packs, issueId);
    if (!current) {
      return { ok: false, reason: `Issue ${issueId} not found` };
    }

    // 3. WAIVED IMMUTABILITY GUARD
    // Once WAIVED, cannot change through updateIssue - must use unwaiveIssue
    if (current.status === 'WAIVED') {
      return {
        ok: false,
        reason: 'Cannot modify WAIVED issue via updateIssue. Use unwaiveIssue() to reopen.',
      };
    }

    const now = new Date().toISOString();

    // 4. Determine next status
    const nextStatus = (patch.status ?? current.status) as IssueStatus;

    // 5. Build complete patch
    const completePatch: IssuePatch = {
      ...patch,
      status: nextStatus,
    };

    // 6. If WAIVED, validate and set waivedAtIso
    if (nextStatus === 'WAIVED') {
      completePatch.waivedAtIso = now;

      const validation = validateIssueStatusChange({
        current,
        nextStatus,
        patch: {
          waivedBy: patch.waivedBy,
          waivedReason: patch.waivedReason,
        },
      });

      if (!validation.ok) {
        return { ok: false, reason: validation.reason };
      }
    }

    // 7. Update issue in packs
    const nextPacks = updateIssueInPacks({
      packs,
      issueId,
      patch: completePatch,
      nowIso: now,
    });

    // 8. Build new manifest with updated issue packs
    const { buildSignedManifestWithExtras } = await import('../trust/buildManifestWithExtras');

    const manifest = await buildSignedManifestWithExtras({
      jobId,
      prevManifestHashHex: head.manifestHashHex,
      signedTrust: head.signedTrust,
      exports: head.exports ?? [],
      manifestKeyId: this.cfg.manifestKeyId,
      manifestPrivateKeyHex: this.cfg.manifestPrivateKeyHex,
      createdBy: this.cfg.createdBy,
      coreExtras: {
        revision: head.revision,
        receipts: head.receipts,
        issuePacks: nextPacks,
      },
    });

    // 9. Store and update HEAD
    await this.cfg.store.put(manifest);
    await this.cfg.store.setHead(jobId, manifest.manifestHashHex);

    return { ok: true, newHeadHash: manifest.manifestHashHex };
  }

  /**
   * Unwaive an issue (reopen a WAIVED issue)
   *
   * UNWAIVE STRICT POLICY:
   * - Can only unwaive issues that are currently WAIVED
   * - Requires unwaivedBy (who is reopening)
   * - Requires unwaivedReason (why reopening, min 8 chars)
   * - Preserves original WAIVE audit fields
   * - Adds UNWAIVE audit fields for full trail
   *
   * @param args.jobId - Job ID
   * @param args.issueId - Issue ID to unwaive
   * @param args.nextStatus - Target status after unwaive (OPEN, IN_PROGRESS, or RESOLVED)
   * @param args.unwaivedBy - Who is unwaiving
   * @param args.unwaivedReason - Why unwaiving
   * @returns New head hash or error
   */
  async unwaiveIssue(args: {
    jobId: string;
    issueId: string;
    nextStatus: Exclude<IssueStatus, 'WAIVED'>;
    unwaivedBy: string;
    unwaivedReason: string;
  }): Promise<{ ok: true; newHeadHash: string } | { ok: false; reason: string }> {
    const { jobId, issueId, nextStatus, unwaivedBy, unwaivedReason } = args;

    // 1. Get current HEAD
    const headR = await this.getHead(jobId);
    if (!headR.ok) {
      return { ok: false, reason: headR.reason };
    }

    const head = headR.head;
    const packs = head.issuePacks ?? [];

    if (packs.length === 0) {
      return { ok: false, reason: 'No issue packs on this job' };
    }

    // 2. Find the issue
    const current = findIssueInPacks(packs, issueId);
    if (!current) {
      return { ok: false, reason: `Issue ${issueId} not found` };
    }

    // 3. Validate UNWAIVE operation
    const validation = validateUnwaive({
      current,
      nextStatus,
      unwaivedBy,
      unwaivedReason,
    });

    if (!validation.ok) {
      return { ok: false, reason: validation.reason };
    }

    const now = new Date().toISOString();

    // 4. Build patch with UNWAIVE audit fields
    // NOTE: We preserve waivedAtIso, waivedBy, waivedReason for audit trail
    const completePatch: IssuePatch = {
      status: nextStatus,
      unwaivedAtIso: now,
      unwaivedBy: unwaivedBy.trim(),
      unwaivedReason: unwaivedReason.trim(),
    };

    // 5. Update issue in packs
    const nextPacks = updateIssueInPacks({
      packs,
      issueId,
      patch: completePatch,
      nowIso: now,
    });

    // 6. Build new manifest with updated issue packs
    const { buildSignedManifestWithExtras } = await import('../trust/buildManifestWithExtras');

    const manifest = await buildSignedManifestWithExtras({
      jobId,
      prevManifestHashHex: head.manifestHashHex,
      signedTrust: head.signedTrust,
      exports: head.exports ?? [],
      manifestKeyId: this.cfg.manifestKeyId,
      manifestPrivateKeyHex: this.cfg.manifestPrivateKeyHex,
      createdBy: this.cfg.createdBy,
      coreExtras: {
        revision: head.revision,
        receipts: head.receipts,
        issuePacks: nextPacks,
      },
    });

    // 7. Store and update HEAD
    await this.cfg.store.put(manifest);
    await this.cfg.store.setHead(jobId, manifest.manifestHashHex);

    return { ok: true, newHeadHash: manifest.manifestHashHex };
  }

  /**
   * Get all issues from job's current HEAD
   */
  async getIssues(jobId: string): Promise<{ ok: true; issues: IssueItem[]; packs: IssuePack[] } | { ok: false; reason: string }> {
    const headR = await this.getHead(jobId);
    if (!headR.ok) {
      return { ok: false, reason: headR.reason };
    }

    const packs = headR.head.issuePacks ?? [];
    const issues = packs.flatMap((p) => p.items ?? []);

    return { ok: true, issues, packs };
  }

  // ============================================
  // PREFLIGHT
  // ============================================

  /**
   * Get preflight report for release readiness
   *
   * Analyzes current HEAD and returns a comprehensive report:
   * - Blocking issues
   * - Waived issues (audited)
   * - Factory receipts per station
   * - Export bundle status
   * - Gate status
   * - Readiness indicators
   *
   * @param jobId - Job ID to analyze
   * @returns Preflight report or error
   */
  async getPreflightReport(
    jobId: string
  ): Promise<{ ok: true; report: PreflightReport } | { ok: false; reason: string }> {
    const headR = await this.getHead(jobId);
    if (!headR.ok) {
      return { ok: false, reason: headR.reason };
    }

    const report = buildPreflightReport({
      jobId,
      headHashHex: headR.headHash,
      head: headR.head,
    });

    return { ok: true, report };
  }

  /**
   * Enforce preflight before release
   *
   * Call this before transitioning to RELEASED state.
   * Returns error if preflight fails.
   *
   * @param jobId - Job ID to check
   * @returns Success or preflight failure reason
   */
  async enforcePreflightForRelease(
    jobId: string
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const pr = await this.getPreflightReport(jobId);
    if (!pr.ok) {
      return pr;
    }

    if (!pr.report.ready.canRequestRelease) {
      return {
        ok: false,
        reason: `Preflight failed: ${pr.report.ready.reasons.join('; ') || 'Unknown reason'}`,
      };
    }

    return { ok: true };
  }

  // ============================================
  // EXPORT PIPELINE (with chain append)
  // ============================================

  /**
   * Export factory package and append to chain
   *
   * FLOW:
   * 1. Check preflight (gate ok, no blocking issues)
   * 2. Generate export files via factoryExporter
   * 3. Store files in artifactStore
   * 4. Build ExportRecord with deterministic proof
   * 5. Append manifest with new export record
   *
   * REQUIREMENTS:
   * - artifactStore must be configured
   * - factoryExporter must be configured
   * - Job must pass preflight canReExport
   *
   * @param args.jobId - Job ID
   * @param args.notes - Optional notes
   * @returns Export ID and new head hash
   */
  async exportFactoryPackageAndAppend(args: {
    jobId: string;
    notes?: string;
  }): Promise<
    | { ok: true; exportId: string; newHeadHash: string; artifactCount: number }
    | { ok: false; reason: string }
  > {
    const { jobId, notes } = args;

    // 0. Check config
    if (!this.cfg.artifactStore) {
      return { ok: false, reason: 'artifactStore not configured' };
    }
    if (!this.cfg.factoryExporter) {
      return { ok: false, reason: 'factoryExporter not configured' };
    }

    // 1. Preflight check (gate ok + no blocking issues)
    const pr = await this.getPreflightReport(jobId);
    if (!pr.ok) {
      return { ok: false, reason: pr.reason };
    }

    if (!pr.report.ready.canReExport) {
      return {
        ok: false,
        reason: `Preflight blocked: ${pr.report.ready.reasons.join('; ')}`,
      };
    }

    // 2. Get HEAD
    const headR = await this.getHead(jobId);
    if (!headR.ok) {
      return { ok: false, reason: headR.reason };
    }

    const head = headR.head;
    const headHashHex = headR.headHash;
    const specStateAtExport = (head.signedTrust?.trust?.spec?.state ?? 'DRAFT') as
      | 'DRAFT'
      | 'FROZEN'
      | 'RELEASED';

    // 3. Generate export files
    let files: Awaited<
      ReturnType<FactoryPackageExporter['exportFactoryPackage']>
    >;
    try {
      files = await this.cfg.factoryExporter.exportFactoryPackage({
        jobId,
        headManifestHashHex: headHashHex,
      });
    } catch (e) {
      return {
        ok: false,
        reason: `Export generation failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
      };
    }

    if (!files || files.length === 0) {
      return { ok: false, reason: 'Exporter returned no files' };
    }

    // 4. Store files in ArtifactStore and collect refs
    const refs: ExportArtifactRef[] = [];
    for (const f of files) {
      const put = await this.cfg.artifactStore.put({
        bytes: f.bytes,
        mime: f.mime,
        filename: f.filename,
      });

      refs.push({
        artifactId: put.artifactId,
        path: f.path,
        mime: f.mime,
        bytes: put.bytes,
        sha256Hex: put.sha256Hex,
      });
    }

    // 5. Build bundle proof (canonical, deterministic)
    // Sort refs by path for determinism
    const sorted = refs.slice().sort((a, b) => (a.path > b.path ? 1 : -1));

    const createdIso = new Date().toISOString();

    const bundleCore: ExportBundleCore = {
      kind: 'FACTORY_PACKAGE',
      jobId,
      sourceManifestHashHex: headHashHex,
      specStateAtExport,
      createdIso,
      artifacts: sorted.map((x) => ({
        path: x.path,
        sha256Hex: x.sha256Hex,
        bytes: x.bytes,
        mime: x.mime,
      })),
      notes: notes ?? '',
    };

    const bundleHashHex = await sha256CanonicalHex(bundleCore);
    const exportId = makeExportId(bundleHashHex);

    // 6. Build ExportRecord
    const record: ExportRecord = {
      exportId,
      kind: 'FACTORY_PACKAGE',
      createdIso,
      artifacts: sorted,
      proof: {
        bundleHashHex,
        algorithm: 'SHA256',
        createdIso,
      },
      sourceManifestHashHex: headHashHex,
      specStateAtExport,
      notes,
      createdBy: this.cfg.createdBy,
    };

    // 7. Append manifest with new export record
    // NOTE: We store ExportRecord in manifest.exports[] but the existing
    // manifest type expects ExportArtifactRecord[]. For compatibility,
    // we'll store the full ExportRecord and the preflight builder will
    // handle both formats.
    const { buildSignedManifestWithExtras } = await import(
      '../trust/buildManifestWithExtras'
    );

    // Merge new export with existing exports
    const existingExports = head.exports ?? [];
    const nextExports = [...existingExports, record as any];

    const manifest = await buildSignedManifestWithExtras({
      jobId,
      prevManifestHashHex: head.manifestHashHex,
      signedTrust: head.signedTrust,
      exports: nextExports,
      manifestKeyId: this.cfg.manifestKeyId,
      manifestPrivateKeyHex: this.cfg.manifestPrivateKeyHex,
      createdBy: this.cfg.createdBy,
      coreExtras: {
        revision: head.revision,
        receipts: head.receipts,
        issuePacks: head.issuePacks,
      },
    });

    // 8. Store and update HEAD
    await this.cfg.store.put(manifest);
    await this.cfg.store.setHead(jobId, manifest.manifestHashHex);

    // 9. Register job ID if registry available
    if (this.cfg.jobRegistry) {
      await this.cfg.jobRegistry.addJobId(jobId);
    }

    return {
      ok: true,
      exportId,
      newHeadHash: manifest.manifestHashHex,
      artifactCount: refs.length,
    };
  }

  /**
   * Get last export record from job
   *
   * @param jobId - Job ID
   * @returns Last export record or null
   */
  async getLastExport(
    jobId: string
  ): Promise<
    | { ok: true; export: ExportRecord | null }
    | { ok: false; reason: string }
  > {
    const headR = await this.getHead(jobId);
    if (!headR.ok) {
      return { ok: false, reason: headR.reason };
    }

    const exports = headR.head.exports ?? [];
    if (exports.length === 0) {
      return { ok: true, export: null };
    }

    // Get last export - may be ExportRecord or legacy ExportArtifactRecord
    const last = exports[exports.length - 1];

    // Check if it's an ExportRecord (has exportId)
    if ('exportId' in last) {
      return { ok: true, export: last as unknown as ExportRecord };
    }

    // Legacy format - return null
    return { ok: true, export: null };
  }

  // ============================================
  // EXPORT VIEWER API
  // ============================================

  /**
   * Get latest export record with head hash
   *
   * Used by ExportViewer to display current export.
   */
  async getLatestExport(
    jobId: string
  ): Promise<
    | { ok: true; export: ExportRecord; headHash: string }
    | { ok: false; reason: string }
  > {
    const headR = await this.getHead(jobId);
    if (!headR.ok) {
      return { ok: false, reason: headR.reason };
    }

    const exportsArr = headR.head.exports ?? [];
    if (exportsArr.length === 0) {
      return { ok: false, reason: 'No exports recorded' };
    }

    const exportRec = exportsArr[exportsArr.length - 1];

    // Check if it's an ExportRecord (has exportId)
    if (!('exportId' in exportRec)) {
      return { ok: false, reason: 'Latest export is legacy format, not supported' };
    }

    return {
      ok: true,
      export: exportRec as unknown as ExportRecord,
      headHash: headR.headHash,
    };
  }

  /**
   * Get export by ID
   *
   * Finds specific export in the exports array.
   */
  async getExportById(
    jobId: string,
    exportId: string
  ): Promise<
    | { ok: true; export: ExportRecord; headHash: string }
    | { ok: false; reason: string }
  > {
    const headR = await this.getHead(jobId);
    if (!headR.ok) {
      return { ok: false, reason: headR.reason };
    }

    const exportsArr = headR.head.exports ?? [];
    const found = exportsArr.find(
      (x: any) => 'exportId' in x && x.exportId === exportId
    );

    if (!found) {
      return { ok: false, reason: `Export ${exportId} not found on head` };
    }

    return {
      ok: true,
      export: found as unknown as ExportRecord,
      headHash: headR.headHash,
    };
  }

  /**
   * Download artifact by ID
   *
   * Retrieves artifact bytes from ArtifactStore.
   */
  async downloadArtifact(
    artifactId: string
  ): Promise<
    | { ok: true; bytes: Uint8Array; mime: string; filename: string; sha256Hex: string }
    | { ok: false; reason: string }
  > {
    if (!this.cfg.artifactStore) {
      return { ok: false, reason: 'artifactStore not configured' };
    }

    const got = await this.cfg.artifactStore.get(artifactId);
    if (!got) {
      return { ok: false, reason: `Artifact not found: ${artifactId}` };
    }

    return {
      ok: true,
      bytes: got.bytes,
      mime: got.mime,
      filename: got.filename,
      sha256Hex: got.sha256Hex,
    };
  }

  /**
   * Verify export bundle integrity
   *
   * Re-hashes all artifacts and compares to recorded hashes.
   * Also verifies the bundle hash.
   *
   * @param jobId - Job ID
   * @param exportId - Export ID to verify
   * @returns Verification result
   */
  async verifyExportBundle(
    jobId: string,
    exportId: string
  ): Promise<
    | { ok: true; verified: boolean; reason?: string }
    | { ok: false; reason: string }
  > {
    if (!this.cfg.artifactStore) {
      return { ok: false, reason: 'artifactStore not configured' };
    }

    const er = await this.getExportById(jobId, exportId);
    if (!er.ok) {
      return { ok: false, reason: er.reason };
    }

    const exp = er.export;

    // Re-hash each artifact and compare to recorded sha
    const sorted = (exp.artifacts ?? [])
      .slice()
      .sort((a, b) => (a.path > b.path ? 1 : -1));

    for (const a of sorted) {
      const got = await this.cfg.artifactStore.get(a.artifactId);
      if (!got) {
        return {
          ok: true,
          verified: false,
          reason: `Missing artifact: ${a.artifactId}`,
        };
      }

      const { sha256Hex } = await import('../crypto/sha256');
      const h = await sha256Hex(got.bytes);
      if (h !== a.sha256Hex) {
        return {
          ok: true,
          verified: false,
          reason: `Hash mismatch for ${a.path}`,
        };
      }
    }

    // Recompute bundle hash using the same canonical core as in exportFactoryPackageAndAppend
    const bundleCore: ExportBundleCore = {
      kind: exp.kind,
      jobId,
      sourceManifestHashHex: exp.sourceManifestHashHex,
      specStateAtExport: exp.specStateAtExport,
      createdIso: exp.createdIso,
      artifacts: sorted.map((x) => ({
        path: x.path,
        sha256Hex: x.sha256Hex,
        bytes: x.bytes,
        mime: x.mime,
      })),
      notes: exp.notes ?? '',
    };

    const recomputed = await sha256CanonicalHex(bundleCore);
    if (recomputed !== exp.proof?.bundleHashHex) {
      return {
        ok: true,
        verified: false,
        reason: 'Bundle hash mismatch',
      };
    }

    return { ok: true, verified: true };
  }
}

// ============================================
// FACTORY
// ============================================

/**
 * Create trust chain service with config
 */
export function createTrustChainService(cfg: TrustChainConfig): TrustChainService {
  return new TrustChainService(cfg);
}
