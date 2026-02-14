/**
 * factoryPackageTypes.ts - OneClick Factory Package Types
 *
 * UI State Machine for the release & export flow:
 * 1. IDLE → Start
 * 2. PREFLIGHT → Loading head, checking gate/collision
 * 3. PREVIEW_READY → Checklist preview available
 * 4. CONFIRMING → User typing "RELEASE"
 * 5. RELEASING → Committing RELEASED state
 * 6. EXPORTING → Building export bundle
 * 7. DONE → Success, zip downloaded
 * 8. ERROR → Something failed
 */

// ============================================
// UI STATE MACHINE
// ============================================

/**
 * Factory package workflow step
 */
export type FactoryPackageStep =
  | 'IDLE'
  | 'PREFLIGHT'
  | 'PREVIEW_READY'
  | 'CONFIRMING'
  | 'RELEASING'
  | 'EXPORTING'
  | 'VERIFYING'
  | 'DONE'
  | 'ERROR';

/**
 * Confirmation text required for release
 */
export const CONFIRM_TEXT_REQUIRED = 'RELEASE' as const;

// ============================================
// PREFLIGHT RESULT
// ============================================

/**
 * Preflight check result
 */
export interface PreflightResult {
  /** Whether preflight passed */
  ok: boolean;

  /** Reason for failure */
  reason?: string;

  /** HEAD hash */
  headHash?: string;

  /** Current spec state */
  specState?: 'DRAFT' | 'FROZEN' | 'RELEASED';

  /** Gate status */
  gateOk?: boolean;

  /** Gate error count */
  gateErrorCount?: number;

  /** Gate warning count */
  gateWarningCount?: number;

  /** Collision blocked */
  collisionBlocked?: boolean;

  /** Collision pair count */
  collisionPairCount?: number;

  /** Chain verified */
  chainVerified?: boolean;

  /** Export count from previous exports */
  previousExportCount?: number;
}

// ============================================
// CHECKLIST PREVIEW (simplified for UI)
// ============================================

/**
 * Simplified checklist preview for UI display
 */
export interface ChecklistPreview {
  jobId: string;
  headHash: string;

  // Gate summary
  gate: {
    ok: boolean;
    errorCount: number;
    warningCount: number;
    perCabinetErrors: Array<{ id: string; codes: string[] }>;
  };

  // Collision summary
  collision: {
    blocked: boolean;
    pairCount: number;
    worstPenetrationMm?: number;
    worstGapMm?: number;
  };

  // Chain verification
  verification: {
    chainOk: boolean;
    chainLength?: number;
    keyIdApproval?: string;
    keyIdManifest?: string;
  };

  // Existing exports
  exports: Array<{ kind: string; filename: string; hash: string }>;
}

// ============================================
// VERIFICATION RESULT
// ============================================

/**
 * Post-export verification result
 */
export interface VerifyResult {
  ok: boolean;
  reason?: string;
  fileCount?: number;
}

// ============================================
// STEP HELPERS
// ============================================

/**
 * Check if step is busy (loading)
 */
export function isStepBusy(step: FactoryPackageStep): boolean {
  return ['PREFLIGHT', 'CONFIRMING', 'RELEASING', 'EXPORTING', 'VERIFYING'].includes(step);
}

/**
 * Check if step allows actions
 */
export function canTakeAction(step: FactoryPackageStep): boolean {
  return step === 'PREVIEW_READY' || step === 'IDLE' || step === 'ERROR' || step === 'DONE';
}

/**
 * Get step description for UI
 */
export function getStepDescription(step: FactoryPackageStep): string {
  switch (step) {
    case 'IDLE':
      return 'Ready to start';
    case 'PREFLIGHT':
      return 'Running preflight checks...';
    case 'PREVIEW_READY':
      return 'Preview ready - confirm to proceed';
    case 'CONFIRMING':
      return 'Validating confirmation...';
    case 'RELEASING':
      return 'Releasing spec (signing)...';
    case 'EXPORTING':
      return 'Building export bundle...';
    case 'VERIFYING':
      return 'Verifying bundle...';
    case 'DONE':
      return 'Complete!';
    case 'ERROR':
      return 'Error occurred';
  }
}

/**
 * Get step color for UI
 */
export function getStepColor(step: FactoryPackageStep): string {
  switch (step) {
    case 'IDLE':
      return 'text-gray-400';
    case 'PREFLIGHT':
    case 'CONFIRMING':
    case 'RELEASING':
    case 'EXPORTING':
    case 'VERIFYING':
      return 'text-blue-400';
    case 'PREVIEW_READY':
      return 'text-amber-400';
    case 'DONE':
      return 'text-green-400';
    case 'ERROR':
      return 'text-red-400';
  }
}
