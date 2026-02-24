/**
 * preflight/index.ts - Release Preflight Module Exports
 *
 * Preflight report for release readiness:
 * - Blocking issues check
 * - Factory receipts summary
 * - Export bundle status
 * - Gate validation
 */

// ============================================
// TYPES
// ============================================

export type {
  StationReceiptSummary,
  ExportSummary,
  PreflightReport,
} from './preflightTypes';

// ============================================
// BUILDER
// ============================================

export { buildPreflightReport } from './buildPreflightReport';

// ============================================
// STORE
// ============================================

export type { PreflightState, CreatePreflightStoreArgs } from './preflightStore';

export {
  createPreflightStore,
  createPreflightStoreWithExportPipeline,
  selectCanReExport,
  selectCanRequestRelease,
  selectBlockingReasons,
  selectBlockingIssueCount,
  selectWaivedIssueCount,
} from './preflightStore';
