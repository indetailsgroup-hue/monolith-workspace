/**
 * MONOLITH Export Module
 *
 * Factory artifact generation with SpecState enforcement
 *
 * Step 7: Added ArtifactBundle, Verify, Policy, Exporters
 * Step 8: Added v2 with real crypto (SHA-256, ECDSA P-256)
 */

// Cut List CSV (legacy)
export type { CutListCsvMode, ExportCutListCsvInput } from './cutList';
export {
  exportCutListCsv,
  computeCutW,
  computeCutH,
  computeTReal,
  downloadTextFile,
} from './cutList';

// ============================================================================
// Step 7: Factory Export System
// ============================================================================

// Types
export type { BytesLike, ArtifactFile, ArtifactBundle, ExportFormat, ExportRequest } from './types';

// Artifact Bundle
export { toArtifactBundle } from './artifactBundle';

// Verify (v1 mock + v2 real)
export type { VerifySeverity, VerifyIssue, VerifyReport } from './verify';
export { verifyManifestSigMock, verifyArtifactBundle, extractManifestFromArtifact } from './verify';
export { verifyManifestSigV2, verifyArtifactBundleV2, extractManifestFromArtifactV2 } from './verify';

// Policy
export type { PolicyEffect, PolicyDecision, ExportPolicy, PolicyReport } from './policy';
export { evalExportPolicy, DEFAULT_EXPORT_POLICY } from './policy';

// Exporters (v1 mock + v2 real)
export type { ExportResult, Exporter, SpecState, ExportGateReport, ExportOnlyReleasedResult } from './exporters';
export { mockCutlistCsvExporter, exportOnlyReleased, exportOnlyReleasedV2 } from './exporters';

// UI
export { ExportPanel } from './ui/ExportPanel';
