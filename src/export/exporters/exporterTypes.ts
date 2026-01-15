/**
 * Exporter Types
 *
 * Step 7 of Plasticity-Style Modeling Layer:
 * - Exporter interface for format-specific exports
 * - ExportResult with produced files
 *
 * v1.0: Initial exporter types
 */

import type { ExportRequest, ArtifactFile } from '../types';

/**
 * Export result with produced files.
 */
export interface ExportResult {
  /** Produced artifact files */
  files: ArtifactFile[];
}

/**
 * Exporter interface.
 * Implement this for each export format.
 */
export interface Exporter {
  /** Format this exporter handles */
  format: ExportRequest['format'];
  /** Export function */
  export: (input: { bundleJson: string; jobName: string }) => ExportResult;
}
