/**
 * planFactoryPackage.ts - Deterministic Export Planning
 *
 * ARCHITECTURE:
 * - Separate "planning" from "file encoding"
 * - Plan determines WHAT to export and in WHAT ORDER
 * - Builders use the plan to produce actual files
 *
 * DETERMINISM:
 * - Plan must be deterministic: same input → same plan
 * - Stable IDs for sheets and parts (based on index, not random)
 * - Order must be consistent across runs
 */

import type { FactoryPackageProfile, FactoryProfileId } from './factoryPackageProfiles';

// ============================================
// PLANNED ITEMS
// ============================================

/**
 * Planned DXF sheet
 */
export interface PlannedSheet {
  /** 1-based sheet index */
  index1: number;

  /** Optional sheet label (for nesting identification) */
  label?: string;

  /** Stable internal ID (e.g., "SHEET_001") */
  sheetId: string;

  /** Part count on this sheet (for summary) */
  partCount?: number;

  /** Material ID (for multi-material jobs) */
  materialId?: string;
}

/**
 * Planned cut list row
 */
export interface PlannedCutListRow {
  /** Row index (1-based) */
  index1: number;

  /** Part name/ID */
  partId: string;

  /** Cabinet ID this part belongs to */
  cabinetId?: string;

  /** Material ID */
  materialId?: string;
}

/**
 * Planned cut list
 */
export interface PlannedCutList {
  /** Stable ID */
  id: string;

  /** Rows (for row count summary; actual data comes from context) */
  rowCount: number;
}

/**
 * Planned export report
 */
export interface PlannedReport {
  /** Stable ID */
  id: string;
}

// ============================================
// FACTORY PACKAGE PLAN
// ============================================

/**
 * Complete factory package export plan
 *
 * This defines the structure of the export BEFORE file generation.
 * All IDs and ordering must be deterministic.
 */
export interface FactoryPackagePlan {
  /** Profile used for this plan */
  profileId: FactoryProfileId;

  /** Planned DXF sheets (in deterministic order) */
  sheets: PlannedSheet[];

  /** Planned cut list */
  cutList: PlannedCutList;

  /** Planned export report */
  report: PlannedReport;

  /** Summary counts */
  summary: {
    sheetCount: number;
    totalPartCount: number;
    materialCount: number;
  };
}

// ============================================
// PLANNING INPUT
// ============================================

/**
 * Input for planning a factory package
 *
 * This is the minimal info needed to create a deterministic plan.
 */
export interface PlanFactoryPackageInput {
  /** Profile to use */
  profile: FactoryPackageProfile;

  /**
   * Sheet information from nesting/job state
   * Order matters: this determines the sheet order in the plan
   */
  sheetLabels: Array<{
    label?: string;
    partCount?: number;
    materialId?: string;
  }>;

  /**
   * Total part count (for summary)
   * If not provided, sum of sheet partCounts is used
   */
  totalPartCount?: number;

  /**
   * Unique material IDs in the job
   */
  materialIds?: string[];
}

// ============================================
// PLAN BUILDER
// ============================================

/**
 * Build deterministic factory package plan
 *
 * IMPORTANT: This function MUST be pure and deterministic.
 * Same input → same output, every time.
 *
 * @param args - Planning input
 * @returns Deterministic export plan
 */
export function planFactoryPackage(args: PlanFactoryPackageInput): FactoryPackagePlan {
  const { profile, sheetLabels } = args;

  // Build planned sheets with stable IDs
  const sheets: PlannedSheet[] = sheetLabels.map((sheet, idx) => ({
    index1: idx + 1,
    label: sheet.label,
    sheetId: `SHEET_${String(idx + 1).padStart(3, '0')}`,
    partCount: sheet.partCount,
    materialId: sheet.materialId,
  }));

  // Calculate totals
  const totalPartCount =
    args.totalPartCount ??
    sheets.reduce((sum, s) => sum + (s.partCount ?? 0), 0);

  const materialIds = args.materialIds ?? [];
  const materialCount = materialIds.length || 1; // At least 1 material

  // Build plan
  return {
    profileId: profile.id,
    sheets,
    cutList: {
      id: 'CUTLIST_001',
      rowCount: totalPartCount, // 1 row per part typically
    },
    report: {
      id: 'REPORT_001',
    },
    summary: {
      sheetCount: sheets.length,
      totalPartCount,
      materialCount,
    },
  };
}

// ============================================
// PLAN VALIDATION
// ============================================

/**
 * Validate a factory package plan
 *
 * @param plan - Plan to validate
 * @returns Validation result
 */
export function validatePlan(plan: FactoryPackagePlan): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Must have at least one sheet
  if (plan.sheets.length === 0) {
    errors.push('Plan must have at least one sheet');
  }

  // Sheet IDs must be unique
  const sheetIds = plan.sheets.map((s) => s.sheetId);
  const uniqueSheetIds = new Set(sheetIds);
  if (uniqueSheetIds.size !== sheetIds.length) {
    errors.push('Sheet IDs must be unique');
  }

  // Sheet indices must be sequential starting at 1
  for (let i = 0; i < plan.sheets.length; i++) {
    if (plan.sheets[i].index1 !== i + 1) {
      errors.push(`Sheet index mismatch at position ${i}: expected ${i + 1}, got ${plan.sheets[i].index1}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

// ============================================
// PLAN HELPERS
// ============================================

/**
 * Get sheet by index (1-based)
 */
export function getSheetByIndex(plan: FactoryPackagePlan, index1: number): PlannedSheet | undefined {
  return plan.sheets.find((s) => s.index1 === index1);
}

/**
 * Get sheet by ID
 */
export function getSheetById(plan: FactoryPackagePlan, sheetId: string): PlannedSheet | undefined {
  return plan.sheets.find((s) => s.sheetId === sheetId);
}
