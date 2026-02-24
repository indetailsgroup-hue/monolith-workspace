/**
 * issues/index.ts - Issue Pack Module Exports
 *
 * Complete issue tracking system for:
 * - Factory rejection handling
 * - Issue resolution workflow
 * - Release blocking enforcement
 */

// ============================================
// TYPES
// ============================================

export type {
  IssueSeverity,
  IssueStatus,
  IssueDomain,
  IssueRef,
  IssueEvidence,
  IssueItem,
  IssuePackVersion,
  IssuePackCreatedFrom,
  IssuePack,
} from './issueTypes';

export {
  isBlockingStatus,
  isBlockingIssue,
} from './issueTypes';

// ============================================
// ID GENERATION
// ============================================

export {
  makeIssueId,
  makePackId,
} from './issueId';

// ============================================
// REASON MAPPING
// ============================================

export {
  mapRejectReasonToIssueRef,
  mapRejectReasons,
  createNoReasonIssueRef,
} from './mapRejectReason';

// ============================================
// PACK BUILDER
// ============================================

export {
  buildIssuePackFromRejectedReceipt,
  countIssuesByStatus,
  packHasBlockingIssues,
} from './buildIssuePackFromReceipt';

// ============================================
// VALIDATION
// ============================================

export type { ValidationResult } from './issueValidation';

export {
  WAIVE_REASON_MIN_LENGTH,
  UNWAIVE_REASON_MIN_LENGTH,
  validateIssueStatusChange,
  validateUnwaive,
  validateIssuePatch,
  isValidStatusTransition,
  getStatusLabel,
} from './issueValidation';

// ============================================
// FIND HELPERS
// ============================================

export {
  findIssueInPacks,
  findIssueWithPack,
  findIssues,
  countByStatus,
  countBySeverity,
  countByDomain,
} from './findIssue';

// ============================================
// UPDATE HELPERS
// ============================================

export type { IssuePatch } from './updateIssuePack';

export {
  updateIssueInPacks,
  updateMultipleIssues,
  setAllIssuesToStatus,
  filterActiveIssues,
  flattenIssues,
} from './updateIssuePack';

// ============================================
// BLOCKING RULES
// ============================================

export type {
  BlockingResult,
  ManifestWithIssuePacks,
} from './issueRules';

export {
  getAllIssuesFromPacks,
  isBlockingIssue as isIssueBlocking,
  getBlockingIssues,
  hasBlockingIssues,
  checkManifestBlocking,
  summarizeIssues,
  formatBlockingStatus,
} from './issueRules';
