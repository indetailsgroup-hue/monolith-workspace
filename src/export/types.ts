/**
 * Export Types - ArtifactBundle + ExportRequest
 *
 * Step 7 of Plasticity-Style Modeling Layer:
 * - ArtifactBundle: Verified bundle for factory export
 * - ExportRequest: Format + job configuration
 *
 * v1.0: Initial export types
 */

// ============================================================================
// Artifact Types
// ============================================================================

/** Content type for MVP (string content; later Uint8Array) */
export type BytesLike = string;

/**
 * Individual artifact file in bundle.
 */
export interface ArtifactFile {
  /** File path in bundle */
  path: string;
  /** File size in bytes */
  bytes: number;
  /** Content hash (FNV-1a for MVP) */
  hash: string;
  /** File content */
  content: BytesLike;
}

/**
 * Artifact bundle for verified export.
 */
export interface ArtifactBundle {
  /** Bundle version */
  version: 'artifact-bundle.v1';
  /** Creation timestamp */
  createdAtIso: string;
  /** All artifact files */
  files: ArtifactFile[];
}

// ============================================================================
// Export Request Types
// ============================================================================

/** Supported export formats */
export type ExportFormat = 'CUTLIST_CSV' | 'DXF_R12' | 'GCODE';

/**
 * Export request configuration.
 */
export interface ExportRequest {
  /** Target format */
  format: ExportFormat;
  /** Job name for output files */
  jobName: string;
}
