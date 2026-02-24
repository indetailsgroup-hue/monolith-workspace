/**
 * buildPreflightReport.ts - Build Preflight Report from HEAD
 *
 * Analyzes current HEAD manifest and produces a deterministic
 * preflight report for release readiness assessment.
 *
 * POLICY CHECKS:
 * - No blocking issues (ERROR + OPEN/IN_PROGRESS)
 * - Gate must be OK
 * - At least one export bundle recorded
 * - No stations with REJECTED last verdict
 */

import type { SignedJobManifest } from '../trust/manifestChainTypes';
import type { PreflightReport, StationReceiptSummary } from './preflightTypes';
import { getAllIssuesFromPacks } from '../issues/issueRules';

// ============================================
// HELPERS
// ============================================

/**
 * Sort by ISO timestamp descending (newest first)
 */
function sortIsoDesc(a?: string, b?: string): number {
  const A = a ? Date.parse(a) : 0;
  const B = b ? Date.parse(b) : 0;
  return B - A;
}

// ============================================
// BUILD PREFLIGHT REPORT
// ============================================

/**
 * Build preflight report from HEAD manifest
 *
 * @param args.jobId - Job ID
 * @param args.headHashHex - Current HEAD hash
 * @param args.head - Current HEAD manifest
 * @returns Preflight report with readiness indicators
 */
export function buildPreflightReport(args: {
  jobId: string;
  headHashHex: string;
  head: SignedJobManifest;
}): PreflightReport {
  const { jobId, headHashHex, head } = args;
  const trust = head.signedTrust?.trust;

  // ---- Spec State ----
  const specState = (trust?.spec?.state ?? 'DRAFT') as 'DRAFT' | 'FROZEN' | 'RELEASED';

  // ---- Issues ----
  const packs = head.issuePacks ?? [];
  const allIssues = getAllIssuesFromPacks(packs);

  const blocking = allIssues.filter(
    (i) => i.severity === 'ERROR' && (i.status === 'OPEN' || i.status === 'IN_PROGRESS')
  );
  const waived = allIssues.filter((i) => i.status === 'WAIVED');
  const resolvedOrInfo = allIssues.filter(
    (i) => !blocking.includes(i) && !waived.includes(i)
  );

  // ---- Receipts per station ----
  const receipts = head.receipts ?? [];
  const byStation = new Map<string, typeof receipts>();

  for (const sr of receipts) {
    const st = sr.receipt.stationId ?? 'UNKNOWN';
    const arr = byStation.get(st) ?? [];
    arr.push(sr);
    byStation.set(st, arr);
  }

  const stations: StationReceiptSummary[] = Array.from(byStation.entries())
    .map(([stationId, arr]) => {
      // Sort by acceptedAtIso descending to get latest
      arr.sort((a, b) =>
        sortIsoDesc(a.receipt.acceptedAtIso, b.receipt.acceptedAtIso)
      );
      const last = arr[0];

      return {
        stationId,
        lastVerdict: last.receipt.verdict,
        lastReceiptHashHex: last.receiptHashHex,
        lastHeadManifestHashHex: last.receipt.headManifestHashHex,
        inspector: last.receipt.inspector,
        timestampIso: last.receipt.acceptedAtIso,
      };
    })
    .sort((a, b) => (a.stationId > b.stationId ? 1 : -1));

  // Overall last verdict (most recent receipt across all stations)
  const lastVerdict = stations
    .slice()
    .sort((a, b) => sortIsoDesc(a.timestampIso, b.timestampIso))[0]?.lastVerdict;

  // ---- Exports ----
  // Handle both new ExportRecord format and legacy ExportArtifactRecord format
  const exportsCount = head.exports?.length ?? 0;
  const lastExportRaw = exportsCount > 0 ? head.exports![exportsCount - 1] : undefined;

  // Extract export info based on format
  let lastExportId: string | undefined;
  let lastExportHash: string | undefined;
  let lastCreatedIso: string | undefined;
  let lastSpecStateAtExport: 'DRAFT' | 'FROZEN' | 'RELEASED' | undefined;
  let lastArtifactCount: number | undefined;

  if (lastExportRaw) {
    // Check if it's new ExportRecord format (has exportId)
    if ('exportId' in lastExportRaw) {
      const record = lastExportRaw as {
        exportId: string;
        createdIso: string;
        proof?: { bundleHashHex: string };
        specStateAtExport?: 'DRAFT' | 'FROZEN' | 'RELEASED';
        artifacts?: unknown[];
      };
      lastExportId = record.exportId;
      lastExportHash = record.proof?.bundleHashHex;
      lastCreatedIso = record.createdIso;
      lastSpecStateAtExport = record.specStateAtExport;
      lastArtifactCount = record.artifacts?.length;
    } else {
      // Legacy ExportArtifactRecord format
      const legacy = lastExportRaw as {
        contentHashHex?: string;
        createdIso?: string;
      };
      lastExportHash = legacy.contentHashHex;
      lastCreatedIso = legacy.createdIso;
    }
  }

  // ---- Gate ----
  const gateOk = !!trust?.gate?.ok;

  // ---- Readiness Reasons ----
  const reasons: string[] = [];

  // Policy: must not have blocking issues
  if (blocking.length > 0) {
    reasons.push(`Blocking issues: ${blocking.length}`);
  }

  // Policy: must have at least one export bundle for factory
  if (exportsCount === 0) {
    reasons.push('No factory export bundle recorded');
  }

  // Policy: gate must be ok
  if (!gateOk) {
    reasons.push('Gate not OK');
  }

  // Policy: if any station last verdict is REJECTED, require resolution
  if (stations.some((s) => s.lastVerdict === 'REJECTED')) {
    reasons.push('One or more stations have REJECTED receipt');
  }

  // ---- Readiness Indicators ----
  // Re-export is allowed if gate ok and no blocking issues
  const canReExport = gateOk && blocking.length === 0;

  // Release request: strictest gate (all policies must pass)
  const canRequestRelease = canReExport && exportsCount > 0 && reasons.length === 0;

  return {
    jobId,
    headHashHex,
    specState,

    issues: {
      blocking,
      waived,
      resolvedOrInfo,
    },

    receipts: {
      stations,
      lastVerdict,
    },

    exports: {
      count: exportsCount,
      lastExportId,
      lastExportHash,
      lastCreatedIso,
      lastSpecStateAtExport,
      lastArtifactCount,
    },

    gate: {
      ok: gateOk,
    },

    ready: {
      canReExport,
      canRequestRelease,
      reasons,
    },
  };
}

// ============================================
// EXPORTS
// ============================================

export { type PreflightReport, type StationReceiptSummary } from './preflightTypes';
