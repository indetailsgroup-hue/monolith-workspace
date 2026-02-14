/**
 * MONOLITH Server Types
 *
 * Step 9: Server-side types for bundle verification and export
 */

// ============================================================================
// Artifact Bundle Types (matches client-side)
// ============================================================================

export interface ArtifactFile {
  name: string;
  content: string; // Base64 or UTF-8 depending on type
  contentType: string;
  hashHex: string; // SHA-256 hex
}

export interface ArtifactBundle {
  version: string;
  createdAtIso: string;
  files: ArtifactFile[];
}

// ============================================================================
// Manifest Types
// ============================================================================

export interface ManifestFileEntry {
  name: string;
  hashHex: string;
  sizeBytes: number;
}

export interface Manifest {
  version: string;
  bundleId: string;
  createdAtIso: string;
  factoryId?: string;
  files: ManifestFileEntry[];
}

export interface SignatureEnvelope {
  alg: 'ECDSA_P256_SHA256' | 'ED25519';
  keyId: string;
  signedAtIso: string;
  signatureB64: string;
}

// ============================================================================
// Verification Types
// ============================================================================

export type VerifySeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface VerifyIssue {
  severity: VerifySeverity;
  code: string;
  message: string;
  file?: string;
}

export interface VerifyReport {
  ok: boolean;
  issues: VerifyIssue[];
}

// ============================================================================
// Policy Types
// ============================================================================

export type PolicyEffect = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';

export interface PolicyDecision {
  effect: PolicyEffect;
  reason: string;
}

export interface PolicyRule {
  id: string;
  effect: PolicyEffect;
  condition: {
    type: 'ALWAYS' | 'VERIFY_FAILED' | 'FORMAT_MATCH' | 'FACTORY_MATCH';
    format?: string;
    factoryId?: string;
  };
  reason: string;
}

export interface ExportPolicy {
  version: string;
  name: string;
  rules: PolicyRule[];
  defaultEffect: PolicyEffect;
}

export interface PolicyReport {
  ok: boolean;
  decisions: PolicyDecision[];
}

// ============================================================================
// Export Types
// ============================================================================

export type ExportFormat = 'CUTLIST_CSV' | 'DXF_R12' | 'DXF_R12_PER_PART' | 'GCODE' | 'STEP' | 'PDF';

export interface ExportRequest {
  format: ExportFormat;
  jobName: string;
  options?: Record<string, unknown>;
}

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ExportJob {
  id: string;
  status: JobStatus;
  request: ExportRequest;
  bundleId: string;
  createdAtIso: string;
  startedAtIso?: string;
  completedAtIso?: string;
  result?: ExportJobResult;
  error?: string;
}

export interface ExportJobResult {
  files: ArtifactFile[];
  processingTimeMs: number;
}

// ============================================================================
// API Types
// ============================================================================

export interface UploadBundleRequest {
  bundle: ArtifactBundle;
  signature: SignatureEnvelope;
}

export interface UploadBundleResponse {
  ok: boolean;
  bundleId?: string;
  verify?: VerifyReport;
  error?: string;
  message?: string;
}

export interface ExportQueueRequest {
  bundleId: string;
  request: ExportRequest;
}

export interface ExportQueueResponse {
  ok: boolean;
  jobId?: string;
  error?: string;
}

export interface ExportStatusResponse {
  ok: boolean;
  job?: ExportJob;
  error?: string;
}
