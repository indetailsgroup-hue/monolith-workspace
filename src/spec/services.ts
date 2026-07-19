/**
 * MONOLITH SpecState Services
 *
 * Service interfaces for Freeze/Gate/Release APIs
 * Includes deterministic mock implementation for development
 */

import type {
  DraftDoc,
  DraftSummary,
  FrozenSnapshot,
  GateReport,
  GateIssue,
  ReleasePackage,
  Severity,
} from './types';

// Gate v0.1 integration
import { runGateV01, DEFAULT_GATE_POLICY_V1 } from '../gate';
import { buildDemoGateInputFromPolicy } from '../gate/demo';
import {
  buildGateInputFromBreakdown,
  createDefaultEdgeConfig,
  createNoEdgeConfig,
} from '../gate/builders';
import type { PartBreakdownRow } from '../gate/builders';

// Release manifest
import {
  buildSignedManifestWithArtifacts,
  type SignedManifest,
} from '../release';

// Export
import { exportCutListCsv } from '../export';

// Artifact Store
import { artifactStore } from '../artifacts';
import type { ArtifactBundle } from '../artifacts';
import { sha256Hex } from '../crypto';

// ============================================
// SERVICE INPUT TYPES
// ============================================

export type FreezeInput = {
  projectId: string;
  revisionId: string;
  note?: string;
  /** Immutable manufacturing payload (from DRAFT UI → captured at Freeze) */
  payload?: {
    breakdownRows: PartBreakdownRow[];
    drillOps?: import('../gate').DrillOp[];
    fittings?: import('../gate').FittingIntent[];
    cabinet?: { backPanelThicknessMm?: number };
  };
};

export type GateRunInput = {
  snapshotId: string;
  policyVersion: string;
  machineProfileId?: string;
};

export type ReleaseInput = {
  snapshotId: string;
  gateReportId: string;
  typedConfirm: string; // Must be "RELEASE"
  approverUserIds?: string[];
};

export type CreateRevisionInput = {
  projectId: string;
  snapshotId: string;
};

// ============================================
// SERVICE INTERFACE
// ============================================

/**
 * SpecServices - Backend integration interface
 *
 * Implement this interface to connect the spec state machine
 * to your actual backend services.
 */
export interface SpecServices {
  /**
   * Freeze current draft to create immutable snapshot
   */
  freezeToSnapshot(input: FreezeInput): Promise<FrozenSnapshot>;

  /**
   * Run gate validation on frozen snapshot
   */
  runGate(input: GateRunInput): Promise<GateReport>;

  /**
   * Release package with signed manifest
   */
  releasePackage(input: ReleaseInput): Promise<ReleasePackage>;

  /**
   * Create new revision from existing snapshot (fork to edit)
   */
  createRevisionFromSnapshot(input: CreateRevisionInput): Promise<DraftDoc>;
}

// ============================================
// DETERMINISTIC HELPERS
// ============================================

function nowIso(): string {
  return new Date().toISOString();
}

function pad(n: number, w = 4): string {
  const s = String(n);
  return s.length >= w ? s : '0'.repeat(w - s.length) + s;
}

/**
 * Simple deterministic hash (NOT cryptographic)
 * Replace with sha256 for production
 */
function stableHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // unsigned 32-bit
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Stable ID generator scoped by namespace
 */
class IdGen {
  private counters = new Map<string, number>();

  next(prefix: string): string {
    const cur = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, cur);
    return `${prefix}_${pad(cur, 6)}`;
  }

  reset(): void {
    this.counters.clear();
  }
}

/**
 * Deterministic pseudo-random (0..1) from a hash string
 */
function rand01(hex: string): number {
  const x = parseInt(hex.slice(0, 8).padEnd(8, '0'), 16);
  return (x % 10000) / 10000;
}

// ============================================
// IN-MEMORY DATABASE
// ============================================

export type UserCtx = {
  userId: string;
};

export type MockDb = {
  draftsByProject: Map<string, DraftDoc>;
  snapshotsById: Map<string, FrozenSnapshot>;
  gateReportsById: Map<string, GateReport>;
  releaseById: Map<string, ReleasePackage>;
  latestGateBySnapshotId: Map<string, string>;
};

function createMockDb(): MockDb {
  return {
    draftsByProject: new Map(),
    snapshotsById: new Map(),
    gateReportsById: new Map(),
    releaseById: new Map(),
    latestGateBySnapshotId: new Map(),
  };
}

// Global ID generator (shared across mock instances for consistency)
const idGen = new IdGen();

// ============================================
// MOCK BREAKDOWN ROWS
// ============================================

/**
 * Create deterministic mock breakdown rows for demo/testing
 * Replace with real breakdown from UI later
 */
function makeMockBreakdownRows(): PartBreakdownRow[] {
  const edgeDefaults = createDefaultEdgeConfig(0.8, 0.5);

  return [
    {
      partId: 'PANEL_SIDE_L',
      name: 'Side Left',
      finishW: 560,
      finishH: 720,
      material: { coreThicknessMm: 16, surfaceAThicknessMm: 0.3, surfaceBThicknessMm: 0.3 },
      edge: { ...edgeDefaults, edgeB: false, tB: 0, pB: 0 },
      tags: ['SIDE_PANEL'],
    },
    {
      partId: 'PANEL_SIDE_R',
      name: 'Side Right',
      finishW: 560,
      finishH: 720,
      material: { coreThicknessMm: 16, surfaceAThicknessMm: 0.3, surfaceBThicknessMm: 0.3 },
      edge: { ...edgeDefaults, edgeB: false, tB: 0, pB: 0 },
      tags: ['SIDE_PANEL'],
    },
    {
      partId: 'PANEL_BOTTOM',
      name: 'Bottom',
      finishW: 900,
      finishH: 560,
      material: { coreThicknessMm: 16, surfaceAThicknessMm: 0.3, surfaceBThicknessMm: 0.3 },
      edge: { ...edgeDefaults, edgeB: false, tB: 0, pB: 0 },
      tags: ['BOTTOM'],
    },
    {
      partId: 'PANEL_BACK',
      name: 'Back Panel',
      finishW: 900,
      finishH: 720,
      material: { coreThicknessMm: 9, surfaceAThicknessMm: 0, surfaceBThicknessMm: 0 },
      edge: createNoEdgeConfig(),
      tags: ['BACK_PANEL'],
    },
    {
      partId: 'PANEL_SHELF_1',
      name: 'Shelf',
      finishW: 900,
      finishH: 540,
      material: { coreThicknessMm: 16, surfaceAThicknessMm: 0.3, surfaceBThicknessMm: 0.3 },
      edge: { ...edgeDefaults, edgeB: false, tB: 0, pB: 0 },
      tags: ['SHELF'],
    },
  ];
}

// ============================================
// INITIAL DRAFT FACTORY
// ============================================

/**
 * Create initial draft document for a project
 */
export function createInitialDraftDoc(
  projectId: string,
  user: UserCtx
): DraftDoc {
  const revisionId = idGen.next('rev');
  const updatedAt = nowIso();

  const summary: DraftSummary = {
    partsCount: 18,
    fittingsCount: 42,
    materialsCount: 6,
    warnings: [
      {
        code: 'W_PREFLIGHT_001',
        message: 'Some shelves are near minimum clearance. Gate will validate.',
      },
    ],
  };

  return {
    state: 'DRAFT',
    projectId,
    revisionId,
    spec: {
      version: 1,
      name: 'Kitchen Base Unit A',
      updatedAt,
    },
    summary,
  };
}

// ============================================
// GATE OUTCOME HELPERS
// ============================================

/**
 * Compute deterministic key for gate outcome
 */
function computeGateOutcomeKey(
  snapshot: FrozenSnapshot,
  input: GateRunInput
): string {
  return stableHash(
    [snapshot.snapshotId, input.policyVersion, input.machineProfileId ?? ''].join(
      '|'
    )
  );
}

/**
 * Create a gate issue
 */
function createIssue(
  severity: Severity,
  code: string,
  message: string,
  partIds?: string[],
  context?: Record<string, string | number | boolean | null>
): GateIssue {
  return {
    id: idGen.next('issue'),
    severity,
    code,
    message,
    partIds,
    context,
  };
}

// ============================================
// MOCK SERVICES FACTORY
// ============================================

export interface MockSpecServicesOptions {
  user?: UserCtx;
  db?: MockDb;
  defaultPolicyVersion?: string;
  /** Force gate to always pass (for testing release flow) */
  forceGatePass?: boolean;
  /** Force gate to always fail (for testing blocker flow) */
  forceGateFail?: boolean;
  /** Use real Gate v0.1 validation (deterministic based on snapshot) */
  useRealGate?: boolean;
}

export interface MockSpecServicesResult {
  services: SpecServices;
  db: MockDb;
  user: UserCtx;
}

/**
 * Create mock spec services with deterministic behavior
 *
 * @example
 * ```ts
 * const { services, db } = createMockSpecServices({ user: { userId: 'demo' } });
 * const initialDoc = createInitialDraftDoc('proj_001', { userId: 'demo' });
 * const store = createSpecStore(services, initialDoc);
 * ```
 */
export function createMockSpecServices(
  opts?: MockSpecServicesOptions
): MockSpecServicesResult {
  const user: UserCtx = opts?.user ?? { userId: 'user_demo' };
  const db: MockDb = opts?.db ?? createMockDb();
  const defaultPolicyVersion = opts?.defaultPolicyVersion ?? 'policy-1.0.0';

  // Ensure a draft exists for a project
  function ensureDraft(projectId: string): DraftDoc {
    const existing = db.draftsByProject.get(projectId);
    if (existing) return existing;
    const seeded = createInitialDraftDoc(projectId, user);
    db.draftsByProject.set(projectId, seeded);
    return seeded;
  }

  const services: SpecServices = {
    async freezeToSnapshot(input: FreezeInput): Promise<FrozenSnapshot> {
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 300));

      const draft = ensureDraft(input.projectId);

      // Guard: revisionId must match current draft (optimistic concurrency)
      if (draft.revisionId !== input.revisionId) {
        throw new Error('Draft revision changed. Refresh and try again.');
      }

      const snapshotId = idGen.next('snap');
      const createdAt = nowIso();

      // Canonical hash includes summary + revisionId + note
      const canonicalHash = stableHash(
        JSON.stringify({
          projectId: input.projectId,
          revisionId: input.revisionId,
          summary: draft.summary,
          note: input.note ?? '',
        })
      );

      // Use payload from input if provided, otherwise fallback to mock (for demo)
      const breakdownRows = input.payload?.breakdownRows?.length
        ? input.payload.breakdownRows
        : makeMockBreakdownRows();

      const snap: FrozenSnapshot = {
        snapshotId,
        sourceRevisionId: input.revisionId,
        createdAt,
        createdBy: user.userId,
        canonicalHash,
        summary: draft.summary,
        // Immutable payload for Gate validation
        payload: {
          breakdownRows,
          drillOps: input.payload?.drillOps ?? [],
          fittings: input.payload?.fittings ?? [],
          cabinet: input.payload?.cabinet ?? { backPanelThicknessMm: 9 },
        },
      };

      db.snapshotsById.set(snapshotId, snap);

      return snap;
    },

    async runGate(input: GateRunInput): Promise<GateReport> {
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 500));

      const snapshot = db.snapshotsById.get(input.snapshotId);
      if (!snapshot) throw new Error('Snapshot not found.');

      const policyVersion = input.policyVersion || defaultPolicyVersion;

      // ============================================
      // USE REAL GATE v0.1 VALIDATION
      // ============================================
      if (opts?.useRealGate) {
        // Check if snapshot has real payload (from Freeze)
        const hasPayload = snapshot.payload?.breakdownRows?.length;

        // Build GateInput from payload or fall back to demo
        const gateInput = hasPayload
          ? buildGateInputFromBreakdown({
              snapshotId: snapshot.snapshotId,
              rows: snapshot.payload!.breakdownRows,
              drillOps: snapshot.payload!.drillOps ?? [],
              fittings: snapshot.payload!.fittings ?? [],
              cabinet: snapshot.payload!.cabinet,
            })
          : buildDemoGateInputFromPolicy(snapshot.snapshotId, policyVersion);

        // Run Gate v0.1 with policy
        const gateOutput = runGateV01(gateInput, {
          ...DEFAULT_GATE_POLICY_V1,
          policyVersion,
        });

        // Convert GateOutput to GateReport format
        const blockers = gateOutput.issues.filter((i) => i.severity === 'BLOCKER');
        const warnings = gateOutput.issues.filter((i) => i.severity === 'WARNING');
        const info = gateOutput.issues.filter((i) => i.severity === 'INFO');

        // Make an evidence-free run impossible to mistake for a clean pass.
        //
        // The drill-depth, edge-margin and edge-bore-centring rules all read
        // gateInput.drillOps. If that array is empty, those rules examined ZERO
        // holes — yet a report with no blockers and no warnings reads as "all
        // clear". A stored, audited artifact that silently omits the fact it
        // had no evidence is worse than one that says so. Emit the fact loudly
        // (WARNING, not INFO) so the record states on its face that no holes
        // were checked. This fires only when holes are genuinely absent (e.g.
        // a Freeze taken before the drill map was generated); the normal path
        // now captures the real holes at Freeze time (see store.ts freeze()).
        if (gateInput.drillOps.length === 0) {
          warnings.push(
            createIssue(
              'WARNING',
              'W_DRILLOPS_NOT_SUPPLIED',
              'NOT CHECKED — the frozen snapshot supplied no drill operations, so the drill-depth, edge-margin and edge-bore-centring safety rules examined zero holes. This is not a pass.',
              undefined,
              { drillOpsCount: 0 }
            )
          );
        }

        // Add summary metrics as INFO
        info.push(
          createIssue(
            'INFO',
            'I_METRIC_PARTS',
            `Parts validated: ${gateOutput.metrics.partsCount}`,
            undefined,
            { partsCount: gateOutput.metrics.partsCount }
          )
        );

        const gateReportId = idGen.next('gate');
        const report: GateReport = {
          gateReportId,
          snapshotId: snapshot.snapshotId,
          runAt: nowIso(),
          runBy: user.userId,
          policyVersion,
          machineProfileId: input.machineProfileId,
          blockers,
          warnings,
          info,
          metrics: {
            estSheetCount: Math.max(1, Math.round(gateOutput.metrics.partsCount / 4)),
            estMachineMinutes: Math.max(10, Math.round(gateOutput.metrics.partsCount * 3)),
            estYieldPct: blockers.length === 0 ? 82 : 65,
          },
        };

        db.gateReportsById.set(gateReportId, report);
        db.latestGateBySnapshotId.set(snapshot.snapshotId, gateReportId);

        return report;
      }

      // ============================================
      // LEGACY RANDOM MOCK (forceGatePass/forceGateFail)
      // ============================================
      const outcomeKey = computeGateOutcomeKey(snapshot, {
        ...input,
        policyVersion,
      });
      const r = rand01(outcomeKey);

      // Deterministic issue generation
      const blockers: GateIssue[] = [];
      const warnings: GateIssue[] = [];
      const info: GateIssue[] = [];

      // Determine if blockers exist
      let hasBlockers: boolean;
      if (opts?.forceGatePass) {
        hasBlockers = false;
      } else if (opts?.forceGateFail) {
        hasBlockers = true;
      } else {
        // ~35% chance blockers exist
        hasBlockers = r < 0.35;
      }

      // Always add info metrics
      info.push(
        createIssue(
          'INFO',
          'I_METRIC_PARTS',
          `Parts: ${snapshot.summary.partsCount}`,
          undefined,
          { partsCount: snapshot.summary.partsCount }
        ),
        createIssue(
          'INFO',
          'I_METRIC_FITTINGS',
          `Fittings: ${snapshot.summary.fittingsCount}`,
          undefined,
          { fittingsCount: snapshot.summary.fittingsCount }
        )
      );

      // Warnings (2–4)
      const warnCount =
        2 + Math.floor(rand01(stableHash(outcomeKey + '|w')) * 3);
      for (let i = 0; i < warnCount; i++) {
        warnings.push(
          createIssue(
            'WARNING',
            `W_POLICY_${i + 1}`,
            'Optimization opportunity: nesting yield could be improved.',
            ['PANEL_SIDE_L', 'PANEL_SIDE_R'].slice(0, (i % 2) + 1),
            { hint: 'Consider rotating grain-safe parts for better yield.' }
          )
        );
      }

      if (hasBlockers) {
        // Create 1–2 blockers deterministically
        const bCount =
          1 + Math.floor(rand01(stableHash(outcomeKey + '|b')) * 2);
        for (let i = 0; i < bCount; i++) {
          blockers.push(
            createIssue(
              'BLOCKER',
              `B_SAFETY_${i + 1}`,
              'Drill depth exceeds safe material thickness margin.',
              ['PANEL_BACK', 'PANEL_BOTTOM'].slice(0, (i % 2) + 1),
              {
                drillDepthMm: 18,
                materialThicknessMm: 16,
                safetyMarginMm: 0.5,
              }
            )
          );
        }
      } else {
        // No blockers: add positive info
        info.push(
          createIssue(
            'INFO',
            'I_GATE_PASS',
            'All blocker checks passed for this snapshot.'
          )
        );
      }

      const gateReportId = idGen.next('gate');
      const report: GateReport = {
        gateReportId,
        snapshotId: snapshot.snapshotId,
        runAt: nowIso(),
        runBy: user.userId,
        policyVersion,
        machineProfileId: input.machineProfileId,
        blockers,
        warnings,
        info,
        metrics: {
          estSheetCount: Math.max(
            1,
            Math.round(snapshot.summary.partsCount / 12)
          ),
          estMachineMinutes: Math.max(
            10,
            Math.round(snapshot.summary.partsCount * 2.7)
          ),
          estYieldPct: Math.round(
            60 + rand01(stableHash(outcomeKey + '|y')) * 30
          ),
        },
      };

      db.gateReportsById.set(gateReportId, report);
      db.latestGateBySnapshotId.set(snapshot.snapshotId, gateReportId);

      return report;
    },

    async releasePackage(input: ReleaseInput): Promise<ReleasePackage> {
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 400));

      const snapshot = db.snapshotsById.get(input.snapshotId);
      if (!snapshot) throw new Error('Snapshot not found.');

      const report = db.gateReportsById.get(input.gateReportId);
      if (!report) throw new Error('Gate report not found.');
      if (report.snapshotId !== snapshot.snapshotId) {
        throw new Error('Gate report does not match snapshot.');
      }

      if (report.blockers.length > 0) {
        throw new Error('Cannot release: blockers exist.');
      }
      if (input.typedConfirm !== 'RELEASE') {
        throw new Error('Typed confirmation must be "RELEASE".');
      }

      const releaseId = idGen.next('rel');
      const createdAtIso = nowIso();

      // ============================================
      // GENERATE REAL ARTIFACTS WITH SHA-256 HASHES
      // ============================================

      // Generate Cut List CSV from immutable snapshot payload
      const breakdownRows = snapshot.payload?.breakdownRows ?? [];
      const cutlistCsv = exportCutListCsv({
        mode: 'RELEASED_FACTORY',
        rows: breakdownRows,
        meta: {
          projectId: snapshot.snapshotId.split('_')[0] ?? 'proj',
          snapshotId: snapshot.snapshotId,
          gateReportId: report.gateReportId,
          releaseId,
          policyVersion: report.policyVersion,
          createdAtIso,
        },
      });

      // Generate README with release info
      const readmeTxt = [
        `MONOLITH Factory Release Package`,
        `==============================`,
        ``,
        `Release ID: ${releaseId}`,
        `Snapshot ID: ${snapshot.snapshotId}`,
        `Gate Report ID: ${report.gateReportId}`,
        `Policy Version: ${report.policyVersion}`,
        `Released At: ${createdAtIso}`,
        `Released By: ${user.userId}`,
        ``,
        `Files:`,
        `- cutlist.csv: Cut list with SPEC-08 dimensions`,
        `- manifest.json: Signed manifest with SHA-256 hashes`,
        ``,
        `Verification:`,
        `All files are hashed with SHA-256 for integrity verification.`,
        `Compare manifest.json hashes against file contents to verify.`,
        ``,
      ].join('\n');

      // Build signed manifest v0.2 with Ed25519 signature
      const { manifest: signedManifest, manifestJson } =
        await buildSignedManifestWithArtifacts({
          projectId: snapshot.snapshotId.split('_')[0] ?? 'proj',
          snapshotId: snapshot.snapshotId,
          gateReportId: report.gateReportId,
          releaseId,
          policyVersion: report.policyVersion,
          createdAtIso,
          createdBy: user.userId,
          canonicalHash: snapshot.canonicalHash,
          cutListCsv: cutlistCsv,
          sign: true, // Ed25519 signing enabled
        });

      // ============================================
      // STORE ARTIFACTS IN IMMUTABLE BUNDLE
      // ============================================

      const bundleId = idGen.next('bundle');

      // Helper to compute bytes and hash
      const makeRecord = async (
        path: string,
        mime: string,
        content: string
      ) => ({
        path,
        mime,
        content,
        bytes: new TextEncoder().encode(content).byteLength,
        sha256: await sha256Hex(content),
      });

      // Create immutable artifact bundle
      const bundle: ArtifactBundle = {
        bundleId,
        releaseId,
        snapshotId: snapshot.snapshotId,
        createdAtIso,
        createdBy: user.userId,
        items: await Promise.all([
          makeRecord('cutlist.csv', 'text/csv;charset=utf-8', cutlistCsv),
          makeRecord('readme.txt', 'text/plain;charset=utf-8', readmeTxt),
          makeRecord(
            'manifest.json',
            'application/json;charset=utf-8',
            manifestJson
          ),
        ]),
      };

      // Store bundle (immutable - throws if already exists)
      artifactStore.putBundle(bundle);

      // Legacy artifact contents for backwards compatibility
      const artifactContents = new Map<string, string>();
      artifactContents.set('cutlist.csv', cutlistCsv);
      artifactContents.set('readme.txt', readmeTxt);
      artifactContents.set('manifest.json', manifestJson);

      // Legacy manifest format (for backwards compatibility)
      const legacyManifest = {
        manifestId: idGen.next('man'),
        snapshotId: snapshot.snapshotId,
        gateReportId: report.gateReportId,
        createdAt: createdAtIso,
        files: signedManifest.files,
      };

      const rel: ReleasePackage = {
        releaseId,
        snapshotId: snapshot.snapshotId,
        gateReportId: report.gateReportId,
        releasedAt: createdAtIso,
        releasedBy: user.userId,
        manifest: legacyManifest,
        signatures: [
          {
            signerUserId: user.userId,
            signedAt: createdAtIso,
            signature:
              'MOCK_SIGNATURE_' + stableHash(releaseId + '|' + user.userId),
          },
        ],
        // Extended fields for v0.1
        signedManifest,
        artifactContents,
        // NEW: Reference to immutable artifact bundle
        artifactBundleId: bundleId,
      };

      db.releaseById.set(releaseId, rel);
      return rel;
    },

    async createRevisionFromSnapshot(
      input: CreateRevisionInput
    ): Promise<DraftDoc> {
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 250));

      const snapshot = db.snapshotsById.get(input.snapshotId);
      if (!snapshot) throw new Error('Snapshot not found.');

      // New revision forks from snapshot
      const revisionId = idGen.next('rev');
      const updatedAt = nowIso();

      const nextDraft: DraftDoc = {
        state: 'DRAFT',
        projectId: input.projectId,
        revisionId,
        spec: {
          version: 1,
          name: 'Revision from ' + snapshot.snapshotId,
          updatedAt,
        },
        // Carry forward the snapshot summary as starting point
        summary: snapshot.summary,
      };

      db.draftsByProject.set(input.projectId, nextDraft);
      return nextDraft;
    },
  };

  return { services, db, user };
}

// ============================================
// UTILITY EXPORTS
// ============================================

export { stableHash, idGen as mockIdGen, makeMockBreakdownRows };
