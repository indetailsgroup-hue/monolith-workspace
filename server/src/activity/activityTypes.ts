/**
 * Activity Types - P8 Server-Authoritative Audit Trail
 *
 * Canonical types for factory activity timeline.
 * Matches frontend src/factory/types/activity.ts
 *
 * @version 0.12.8
 */

// ============================================================================
// Activity Type Taxonomy
// ============================================================================

export type ActivityType =
  | "VERIFY_RUN"
  | "EXPORT_ATTEMPT"
  | "EXPORT_SUCCESS"
  | "EXPORT_BLOCKED"
  | "EXPORT_DOWNLOAD"
  | "PACKET_VIEW";

// ============================================================================
// Actor Roles
// ============================================================================

export type ActorRole = "FACTORY" | "ADMIN" | "DESIGNER" | "SYSTEM";

// ============================================================================
// Activity Record (Server → Frontend contract)
// ============================================================================

export interface ActivityRecord {
  /** Deterministic ID (SHA-256 of key fields) */
  id: string;
  /** Activity type */
  type: ActivityType;
  /** ISO timestamp (server time) */
  at: string;
  /** Job ID this activity belongs to */
  jobId: string;

  /** Actor information */
  actor?: {
    role?: ActorRole;
    name?: string;
  };

  /** Verify details (for VERIFY_RUN) */
  verify?: {
    verdict: "PASS" | "PASS_WITH_WARN" | "FAIL";
    code?: string;
    summary?: string;
    logRef?: string;
  };

  /** Export details (for EXPORT_* events) */
  export?: {
    dialect?: "KDT" | "BIESSE" | "HOMAG";
    profileId?: string;
    mode?: "PER_SHEET" | "PER_JOB";
    target?: "GCODE" | "BUNDLE";
    ok?: boolean;
    reason?: string;
    artifactSha256?: string;
    artifactName?: string;
  };

  /** Packet integrity anchor */
  packet?: {
    packetSha256?: string;
    manifestSha256?: string;
  };
}

// ============================================================================
// Partial Record (for appending)
// ============================================================================

export type ActivityRecordPartial = Omit<ActivityRecord, "id" | "at" | "jobId">;
