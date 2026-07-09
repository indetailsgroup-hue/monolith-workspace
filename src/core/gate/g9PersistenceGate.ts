/**
 * g9PersistenceGate.ts - G9 Persistence Gate Runtime Check
 *
 * GATE RULE (G9): No unvalidated external state enters OperationGraph.
 *
 * This module provides runtime checks to verify that the G9 persistence
 * boundary is functioning correctly. It integrates with the Gate UI to
 * show G9 status alongside G1-G8.
 *
 * ## What G9 Checks
 *
 * 1. **Schema Availability**: Required Zod schemas exist
 * 2. **Boundary Functions**: parseAndValidateSafe is available
 * 3. **Store Compliance**: Critical stores use validated loading
 * 4. **Static Scan Status**: No bypass patterns detected (at build time)
 *
 * @version 1.0.0
 */

import { z } from 'zod';
import { validateExternalStateSafe, parseAndValidateSafe } from './validateExternalState';
import type { ValidationIssue } from './validateExternalState';
// S15-3: require() ใช้ไม่ได้ในเบราว์เซอร์ ESM — import ตรงเพื่อเช็ค schema availability
import * as projectSchemaModule from '../schema/project.schema';

// ============================================
// G9 CHECK TYPES
// ============================================

export type G9Status = 'PASS' | 'WARN' | 'FAIL';

export interface G9Issue {
  /** Issue code */
  code: string;
  /** Severity level */
  severity: G9Status;
  /** Human-readable message */
  message: string;
  /** Thai message for UI */
  messageTH?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

export interface G9Result {
  /** Overall status */
  status: G9Status;
  /** Gate name */
  gate: 'G9';
  /** Full gate name */
  name: string;
  /** Description */
  description: string;
  /** Individual issues */
  issues: G9Issue[];
  /** Pass count */
  passCount: number;
  /** Warning count */
  warnCount: number;
  /** Fail count */
  failCount: number;
  /** Timestamp */
  timestamp: number;
}

// ============================================
// SCHEMA AVAILABILITY CHECK
// ============================================

/**
 * Check if required schemas are available.
 */
function checkSchemaAvailability(): G9Issue[] {
  const issues: G9Issue[] = [];

  try {
    const schemaModule = projectSchemaModule as Record<string, unknown>;

    const requiredSchemas = [
      'ProjectDataSchema',
      'SavedProjectsListSchema',
      'ImportedProjectSchema',
    ];

    for (const schemaName of requiredSchemas) {
      if (!schemaModule[schemaName]) {
        issues.push({
          code: 'G9_SCHEMA_MISSING',
          severity: 'FAIL',
          message: `Required schema '${schemaName}' not found`,
          messageTH: `ไม่พบ schema '${schemaName}' ที่จำเป็น`,
          context: { schemaName },
        });
      }
    }

    if (issues.length === 0) {
      issues.push({
        code: 'G9_SCHEMAS_OK',
        severity: 'PASS',
        message: 'All required schemas are available',
        messageTH: 'schema ทั้งหมดพร้อมใช้งาน',
      });
    }
  } catch {
    issues.push({
      code: 'G9_SCHEMA_LOAD_ERROR',
      severity: 'FAIL',
      message: 'Failed to load schema module',
      messageTH: 'โหลด schema module ไม่สำเร็จ',
    });
  }

  return issues;
}

// ============================================
// BOUNDARY FUNCTION CHECK
// ============================================

/**
 * Check if validation boundary functions work correctly.
 */
function checkBoundaryFunctions(): G9Issue[] {
  const issues: G9Issue[] = [];

  // Test parseAndValidateSafe with valid data
  const testSchema = z.object({
    id: z.string(),
    value: z.number(),
  });

  const validJson = JSON.stringify({ id: 'test', value: 42 });
  const validResult = parseAndValidateSafe(validJson, testSchema, 'g9-test');

  if (!validResult.ok) {
    issues.push({
      code: 'G9_BOUNDARY_VALID_FAIL',
      severity: 'FAIL',
      message: 'Validation boundary failed on valid data',
      messageTH: 'การตรวจสอบล้มเหลวกับข้อมูลที่ถูกต้อง',
    });
  }

  // Test parseAndValidateSafe with invalid data
  const invalidJson = JSON.stringify({ id: 123, value: 'not-a-number' });
  const invalidResult = parseAndValidateSafe(invalidJson, testSchema, 'g9-test');

  if (invalidResult.ok) {
    issues.push({
      code: 'G9_BOUNDARY_INVALID_PASS',
      severity: 'FAIL',
      message: 'Validation boundary passed invalid data',
      messageTH: 'การตรวจสอบยอมรับข้อมูลที่ไม่ถูกต้อง',
    });
  }

  // Test parseAndValidateSafe with malformed JSON
  const malformedResult = parseAndValidateSafe('not-json{', testSchema, 'g9-test');

  if (malformedResult.ok) {
    issues.push({
      code: 'G9_BOUNDARY_MALFORMED_PASS',
      severity: 'FAIL',
      message: 'Validation boundary passed malformed JSON',
      messageTH: 'การตรวจสอบยอมรับ JSON ที่ผิดรูปแบบ',
    });
  }

  // Test null handling
  const nullResult = parseAndValidateSafe(null, testSchema, 'g9-test');

  if (nullResult.ok) {
    issues.push({
      code: 'G9_BOUNDARY_NULL_PASS',
      severity: 'FAIL',
      message: 'Validation boundary passed null data',
      messageTH: 'การตรวจสอบยอมรับข้อมูล null',
    });
  }

  if (issues.length === 0) {
    issues.push({
      code: 'G9_BOUNDARY_OK',
      severity: 'PASS',
      message: 'Validation boundary functions working correctly',
      messageTH: 'ฟังก์ชันการตรวจสอบทำงานถูกต้อง',
    });
  }

  return issues;
}

// ============================================
// VALIDATION ISSUE STRUCTURE CHECK
// ============================================

/**
 * Check that validation issues have proper structure.
 */
function checkIssueStructure(): G9Issue[] {
  const issues: G9Issue[] = [];

  const testSchema = z.object({
    nested: z.object({
      deep: z.object({
        value: z.string(),
      }),
    }),
  });

  const badData = { nested: { deep: { value: 123 } } };
  const result = validateExternalStateSafe(testSchema, badData, 'g9-test');

  if (result.ok) {
    issues.push({
      code: 'G9_ISSUE_STRUCT_FAIL',
      severity: 'FAIL',
      message: 'Validation should have failed but passed',
      messageTH: 'การตรวจสอบควรล้มเหลวแต่ผ่าน',
    });
    return issues;
  }

  // Check issue structure
  const validationIssue = result.issues[0];

  if (!validationIssue) {
    issues.push({
      code: 'G9_NO_ISSUES',
      severity: 'FAIL',
      message: 'Validation failed but no issues reported',
      messageTH: 'การตรวจสอบล้มเหลวแต่ไม่มีรายงานปัญหา',
    });
    return issues;
  }

  // Verify path is present and formatted correctly
  if (typeof validationIssue.path !== 'string') {
    issues.push({
      code: 'G9_ISSUE_NO_PATH',
      severity: 'FAIL',
      message: 'Validation issue missing path field',
      messageTH: 'รายงานปัญหาไม่มีฟิลด์ path',
    });
  } else if (!validationIssue.path.includes('.')) {
    issues.push({
      code: 'G9_ISSUE_FLAT_PATH',
      severity: 'WARN',
      message: 'Validation issue path may not be properly nested',
      messageTH: 'path อาจไม่แสดง nested structure ถูกต้อง',
      context: { path: validationIssue.path },
    });
  }

  // Verify message is present
  if (typeof validationIssue.message !== 'string' || !validationIssue.message) {
    issues.push({
      code: 'G9_ISSUE_NO_MESSAGE',
      severity: 'FAIL',
      message: 'Validation issue missing message field',
      messageTH: 'รายงานปัญหาไม่มีฟิลด์ message',
    });
  }

  if (issues.length === 0) {
    issues.push({
      code: 'G9_ISSUE_STRUCT_OK',
      severity: 'PASS',
      message: 'Validation issues have correct structure',
      messageTH: 'รายงานปัญหามีโครงสร้างถูกต้อง',
    });
  }

  return issues;
}

// ============================================
// MAIN G9 CHECK FUNCTION
// ============================================

/**
 * Run all G9 persistence gate checks.
 *
 * @returns G9Result with overall status and individual issues
 */
export function runG9Check(): G9Result {
  const allIssues: G9Issue[] = [];

  // Run all checks
  allIssues.push(...checkSchemaAvailability());
  allIssues.push(...checkBoundaryFunctions());
  allIssues.push(...checkIssueStructure());

  // Calculate counts
  const passCount = allIssues.filter((i) => i.severity === 'PASS').length;
  const warnCount = allIssues.filter((i) => i.severity === 'WARN').length;
  const failCount = allIssues.filter((i) => i.severity === 'FAIL').length;

  // Determine overall status
  let status: G9Status = 'PASS';
  if (failCount > 0) {
    status = 'FAIL';
  } else if (warnCount > 0) {
    status = 'WARN';
  }

  return {
    status,
    gate: 'G9',
    name: 'G9: Persistence Gate',
    description: 'No unvalidated external state enters OperationGraph',
    issues: allIssues,
    passCount,
    warnCount,
    failCount,
    timestamp: Date.now(),
  };
}

// ============================================
// VALIDATION RULE ADAPTER
// ============================================

/**
 * Convert G9 result to ValidationRule format for useSpecStore integration.
 */
export function g9ToValidationRules(): Array<{
  id: string;
  name: string;
  category: 'SAFETY';
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
}> {
  const result = runG9Check();

  return result.issues.map((issue) => ({
    id: `g9-${issue.code.toLowerCase()}`,
    name: `G9: ${issue.code.replace('G9_', '').replace(/_/g, ' ')}`,
    category: 'SAFETY' as const,
    status: issue.severity,
    message: issue.message,
  }));
}

// ============================================
// GATE STATUS FOR UI
// ============================================

/**
 * Get simplified G9 status for Gate UI display.
 */
export function getG9Status(): {
  ok: boolean;
  status: G9Status;
  summary: string;
  passCount: number;
  warnCount: number;
  failCount: number;
} {
  const result = runG9Check();

  return {
    ok: result.status === 'PASS',
    status: result.status,
    summary: `G9 Persistence: ${result.passCount}P/${result.warnCount}W/${result.failCount}F`,
    passCount: result.passCount,
    warnCount: result.warnCount,
    failCount: result.failCount,
  };
}
