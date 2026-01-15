/**
 * IIMOS Export Module
 *
 * Factory artifact generation with SpecState enforcement
 *
 * Step 7: Added ArtifactBundle, Verify, Policy, Exporters
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

// Verify
export type { VerifySeverity, VerifyIssue, VerifyReport } from './verify';
export { verifyManifestSigMock, verifyArtifactBundle, extractManifestFromArtifact } from './verify';

// Policy
export type { PolicyEffect, PolicyDecision, ExportPolicy, PolicyReport } from './policy';
export { evalExportPolicy, DEFAULT_EXPORT_POLICY } from './policy';

// Exporters
export type { ExportResult, Exporter, SpecState, ExportGateReport, ExportOnlyReleasedResult } from './exporters';
export { mockCutlistCsvExporter, exportOnlyReleased } from './exporters';

// UI
export { ExportPanel } from './ui/ExportPanel';
