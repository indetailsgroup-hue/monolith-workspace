/**
 * mapRejectReason.ts - Map Reject Reasons to Issue References
 *
 * Converts free-text factory rejection reasons to canonical
 * issue references with domain and code.
 *
 * STRATEGY:
 * 1. Normalize text (trim, lowercase)
 * 2. Match keywords to domains/codes
 * 3. Fall back to OTHER/FACTORY_REJECT_REASON
 *
 * This is intentionally conservative - only maps clear keywords.
 * Unknown reasons become OTHER domain for human review.
 */

import type { IssueRef, IssueDomain } from './issueTypes';

// ============================================
// TEXT NORMALIZATION
// ============================================

function normalize(s: string): string {
  return (s ?? '').trim().toLowerCase();
}

// ============================================
// KEYWORD MATCHERS
// ============================================

interface KeywordRule {
  keywords: string[];
  domain: IssueDomain;
  code: string;
}

/**
 * Keyword rules for issue classification
 * Order matters - first match wins
 */
const RULES: KeywordRule[] = [
  // Collision / Clearance
  {
    keywords: ['collision', 'clash', 'ชน', 'ทับ', 'overlap'],
    domain: 'COLLISION',
    code: 'COLLISION_BLOCKED',
  },
  {
    keywords: ['gap', 'clearance', 'ระยะ', 'ห่าง', 'spacing'],
    domain: 'COLLISION',
    code: 'CLEARANCE_OUT_OF_SPEC',
  },

  // Export / File artifacts
  {
    keywords: ['dxf', 'gcode', 'g-code', 'csv', 'file format'],
    domain: 'EXPORT',
    code: 'EXPORT_ARTIFACT_INVALID',
  },
  {
    keywords: ['missing', 'หาย', 'ไม่ครบ', 'incomplete'],
    domain: 'EXPORT',
    code: 'EXPORT_ARTIFACT_MISSING',
  },
  {
    keywords: ['hash', 'checksum', 'integrity'],
    domain: 'EXPORT',
    code: 'EXPORT_HASH_MISMATCH',
  },

  // Manufacturing / Gate
  {
    keywords: ['drill', 'เจาะ', 'รู', 'hole'],
    domain: 'GATE',
    code: 'DRILL_SPEC_INVALID',
  },
  {
    keywords: ['edge', 'edgeband', 'เข้าขอบ', 'ขอบ', 'banding'],
    domain: 'GATE',
    code: 'EDGEBAND_SPEC_INVALID',
  },
  {
    keywords: ['dimension', 'size', 'measure', 'ขนาด', 'มิติ'],
    domain: 'GATE',
    code: 'DIMENSION_OUT_OF_SPEC',
  },
  {
    keywords: ['material', 'วัสดุ', 'board', 'panel'],
    domain: 'GATE',
    code: 'MATERIAL_SPEC_INVALID',
  },
  {
    keywords: ['hardware', 'hinge', 'บานพับ', 'fitting', 'อุปกรณ์'],
    domain: 'GATE',
    code: 'HARDWARE_SPEC_INVALID',
  },
  {
    keywords: ['cnc', 'toolpath', 'machining'],
    domain: 'GATE',
    code: 'CNC_TOOLPATH_INVALID',
  },

  // Factory QC general
  {
    keywords: ['quality', 'qc', 'inspection', 'ตรวจ', 'คุณภาพ'],
    domain: 'FACTORY_QC',
    code: 'QC_INSPECTION_FAILED',
  },
  {
    keywords: ['defect', 'ตำหนิ', 'damage', 'เสียหาย'],
    domain: 'FACTORY_QC',
    code: 'DEFECT_FOUND',
  },
];

// ============================================
// MAIN MAPPER
// ============================================

/**
 * Map a reject reason string to a canonical IssueRef
 *
 * @param reason - Free-text rejection reason from factory
 * @returns Canonical issue reference with domain/code
 */
export function mapRejectReasonToIssueRef(reason: string): IssueRef {
  const normalized = normalize(reason);

  // Try each rule in order
  for (const rule of RULES) {
    for (const keyword of rule.keywords) {
      if (normalized.includes(keyword)) {
        return {
          domain: rule.domain,
          code: rule.code,
          message: reason.trim(),
        };
      }
    }
  }

  // Fallback: uncategorized factory rejection
  return {
    domain: 'OTHER',
    code: 'FACTORY_REJECT_REASON',
    message: reason.trim(),
  };
}

/**
 * Map multiple reasons, preserving order
 */
export function mapRejectReasons(reasons: string[]): IssueRef[] {
  return reasons
    .map((r) => (r ?? '').trim())
    .filter(Boolean)
    .map(mapRejectReasonToIssueRef);
}

// ============================================
// SPECIAL CASE REFERENCES
// ============================================

/**
 * Create issue ref for rejection without reasons
 */
export function createNoReasonIssueRef(): IssueRef {
  return {
    domain: 'OTHER',
    code: 'FACTORY_REJECTED_NO_REASON',
    message: 'Factory rejected without reasons provided.',
  };
}
