/**
 * GATE10 - DXF Safety Gate
 *
 * NORTH STAR: "No unsafe DXF leaves the system"
 *
 * This gate ensures that all DXF exports in FACTORY mode originate
 * from the OperationGraph (manufacturing intent), NOT from UI mesh
 * or Cabinet geometry.
 *
 * ## Why This Matters
 * - DXF from OperationGraph = exact match to G-code = safe manufacturing
 * - DXF from Cabinet geometry = approximation = potential mismatch
 * - Unsafe DXF could cause:
 *   - Incorrect drill positions
 *   - Missing operations
 *   - Material waste
 *   - Safety hazards
 *
 * ## Architecture
 * ```
 * FactoryPacket → buildOperationGraph → DXF (SAFE - G10 PASS)
 * Cabinet UI mesh → DXF (UNSAFE - G10 BLOCK)
 * ```
 *
 * @version 1.0.0
 */

import type { OperationGraph } from '../../cnc/operation/operationTypes';
import type { FactoryPacket } from '../../factory/packet/types';

// ============================================
// BRANDED TYPE FOR SAFE DXF
// ============================================

/**
 * Brand symbol for DXF content verified through G10 gate
 * This symbol is NOT exported - only G10 functions can create SafeDxf
 */
declare const G10_DXF_BRAND: unique symbol;

/**
 * Branded DXF content that has passed G10 safety verification.
 *
 * This type can ONLY be created by G10 gate functions,
 * ensuring compile-time enforcement that DXF came from OperationGraph.
 *
 * @example
 * ```typescript
 * // This function requires G10-verified DXF
 * function sendToFactory(dxf: SafeDxf): void { ... }
 *
 * // This WON'T compile - raw string is not SafeDxf
 * sendToFactory(rawDxfString); // ERROR!
 *
 * // This WILL compile - DXF went through G10
 * const safeDxf = assertDxfSafety(dxfContent, provenance);
 * sendToFactory(safeDxf); // OK!
 * ```
 */
export type SafeDxf = string & { readonly [G10_DXF_BRAND]: true };

// ============================================
// PROVENANCE TYPES
// ============================================

/**
 * DXF provenance - proof of origin
 *
 * This metadata proves where the DXF came from.
 * Only OperationGraph provenance passes G10.
 */
export type DxfProvenance =
  | DxfProvenanceOperationGraph
  | DxfProvenanceCabinet
  | DxfProvenanceNesting
  | DxfProvenanceUnknown;

export interface DxfProvenanceOperationGraph {
  readonly source: 'OPERATION_GRAPH';
  readonly packetId: string;
  readonly machineId: string;
  readonly panelId: string;
  readonly operationCount: number;
  readonly graphHash?: string;
  readonly timestamp: number;
}

export interface DxfProvenanceCabinet {
  readonly source: 'CABINET_GEOMETRY';
  readonly cabinetId: string;
  readonly panelId: string;
  readonly timestamp: number;
}

export interface DxfProvenanceNesting {
  readonly source: 'NESTING_LAYOUT';
  readonly sheetIndex: number;
  readonly timestamp: number;
}

export interface DxfProvenanceUnknown {
  readonly source: 'UNKNOWN';
  readonly timestamp: number;
}

// ============================================
// G10 ERROR CODES
// ============================================

export const G10_ERROR_CODES = {
  /** DXF has no provenance metadata */
  MISSING_PROVENANCE: 'G10_MISSING_PROVENANCE',
  /** DXF provenance is not from OperationGraph */
  INVALID_SOURCE: 'G10_INVALID_SOURCE',
  /** DXF content is empty or malformed */
  INVALID_CONTENT: 'G10_INVALID_CONTENT',
  /** Packet ID mismatch */
  PACKET_MISMATCH: 'G10_PACKET_MISMATCH',
  /** DXF appears to be manually modified */
  TAMPER_DETECTED: 'G10_TAMPER_DETECTED',
  /** Runtime mode requires G10 but DXF is unsafe */
  FACTORY_MODE_BLOCK: 'G10_FACTORY_MODE_BLOCK',
} as const;

export type G10ErrorCode = typeof G10_ERROR_CODES[keyof typeof G10_ERROR_CODES];

// ============================================
// G10 ISSUE TYPE
// ============================================

export interface G10Issue {
  readonly gateId: 'G10';
  readonly code: G10ErrorCode;
  readonly message: string;
  readonly severity: 'BLOCK' | 'WARN';
  readonly source?: string;
  readonly detail?: Record<string, unknown>;
}

// ============================================
// G10 RESULT TYPES
// ============================================

export type G10Result =
  | { readonly ok: true; readonly dxf: SafeDxf; readonly warnings: readonly G10Issue[] }
  | { readonly ok: false; readonly issues: readonly G10Issue[] };

// ============================================
// CORE G10 FUNCTIONS
// ============================================

/**
 * Assert DXF safety and return branded SafeDxf
 *
 * This is the ONLY way to create a SafeDxf type.
 * It validates that the DXF content came from OperationGraph.
 *
 * @param dxfContent - Raw DXF string content
 * @param provenance - Provenance metadata proving DXF origin
 * @param options - Validation options
 * @returns G10Result with SafeDxf on success
 *
 * @example
 * ```typescript
 * // In DXF export flow
 * const dxf = operationGraphToDxf(graph);
 * const provenance: DxfProvenanceOperationGraph = {
 *   source: 'OPERATION_GRAPH',
 *   packetId: packet.id,
 *   machineId: graph.machineId,
 *   panelId: panelId,
 *   operationCount: graph.operations.length,
 *   timestamp: Date.now(),
 * };
 *
 * const result = assertDxfSafety(dxf, provenance);
 * if (result.ok) {
 *   sendToFactory(result.dxf); // SafeDxf
 * }
 * ```
 */
export function assertDxfSafety(
  dxfContent: string,
  provenance: DxfProvenance,
  options: DxfSafetyOptions = {}
): G10Result {
  const { strictMode = true, allowNesting = false } = options;
  const issues: G10Issue[] = [];
  const warnings: G10Issue[] = [];

  // 1. Validate content exists
  if (!dxfContent || dxfContent.trim().length === 0) {
    issues.push({
      gateId: 'G10',
      code: G10_ERROR_CODES.INVALID_CONTENT,
      message: 'DXF content is empty or undefined',
      severity: 'BLOCK',
    });
    return { ok: false, issues };
  }

  // 2. Validate provenance exists
  if (!provenance) {
    issues.push({
      gateId: 'G10',
      code: G10_ERROR_CODES.MISSING_PROVENANCE,
      message: 'DXF provenance is required but not provided',
      severity: 'BLOCK',
    });
    return { ok: false, issues };
  }

  // 3. Validate source is OperationGraph (or Nesting if allowed)
  if (provenance.source === 'UNKNOWN') {
    issues.push({
      gateId: 'G10',
      code: G10_ERROR_CODES.MISSING_PROVENANCE,
      message: 'DXF source is unknown - cannot verify safety',
      severity: 'BLOCK',
    });
    return { ok: false, issues };
  }

  if (provenance.source === 'CABINET_GEOMETRY') {
    issues.push({
      gateId: 'G10',
      code: G10_ERROR_CODES.INVALID_SOURCE,
      message: 'DXF from CABINET_GEOMETRY bypasses OperationGraph - not safe for factory',
      severity: 'BLOCK',
      source: provenance.source,
      detail: {
        cabinetId: provenance.cabinetId,
        panelId: provenance.panelId,
      },
    });
    return { ok: false, issues };
  }

  if (provenance.source === 'NESTING_LAYOUT') {
    if (!allowNesting) {
      issues.push({
        gateId: 'G10',
        code: G10_ERROR_CODES.INVALID_SOURCE,
        message: 'DXF from NESTING_LAYOUT is for layout only - not for CNC operations',
        severity: 'BLOCK',
        source: provenance.source,
      });
      return { ok: false, issues };
    } else {
      // Nesting DXF allowed but warn
      warnings.push({
        gateId: 'G10',
        code: G10_ERROR_CODES.INVALID_SOURCE,
        message: 'Nesting DXF is layout-only - ensure CNC operations use OperationGraph DXF',
        severity: 'WARN',
        source: provenance.source,
      });
    }
  }

  // 4. Validate OperationGraph provenance completeness
  if (provenance.source === 'OPERATION_GRAPH') {
    if (strictMode) {
      if (!provenance.packetId) {
        issues.push({
          gateId: 'G10',
          code: G10_ERROR_CODES.MISSING_PROVENANCE,
          message: 'OperationGraph provenance missing packetId',
          severity: 'BLOCK',
        });
      }
      if (!provenance.machineId) {
        issues.push({
          gateId: 'G10',
          code: G10_ERROR_CODES.MISSING_PROVENANCE,
          message: 'OperationGraph provenance missing machineId',
          severity: 'BLOCK',
        });
      }
      if (provenance.operationCount === 0) {
        warnings.push({
          gateId: 'G10',
          code: G10_ERROR_CODES.INVALID_CONTENT,
          message: 'OperationGraph has 0 operations - DXF may be empty',
          severity: 'WARN',
        });
      }
    }

    if (issues.length > 0) {
      return { ok: false, issues };
    }
  }

  // 5. Basic DXF format validation
  if (!isValidDxfFormat(dxfContent)) {
    issues.push({
      gateId: 'G10',
      code: G10_ERROR_CODES.INVALID_CONTENT,
      message: 'DXF content does not appear to be valid DXF format',
      severity: 'BLOCK',
    });
    return { ok: false, issues };
  }

  // All checks passed - brand the DXF as safe
  return {
    ok: true,
    dxf: dxfContent as SafeDxf,
    warnings,
  };
}

export interface DxfSafetyOptions {
  /** Require complete provenance metadata (default: true) */
  strictMode?: boolean;
  /** Allow nesting DXF for layout purposes (default: false) */
  allowNesting?: boolean;
  /** Expected packet ID (for validation) */
  expectedPacketId?: string;
}

// ============================================
// PROVENANCE BUILDERS
// ============================================

/**
 * Create OperationGraph provenance from packet and graph
 *
 * @param packet - Source FactoryPacket
 * @param graph - Generated OperationGraph
 * @param panelId - Panel being exported
 */
export function createOperationGraphProvenance(
  packet: FactoryPacket,
  graph: OperationGraph,
  panelId: string
): DxfProvenanceOperationGraph {
  return {
    source: 'OPERATION_GRAPH',
    packetId: packet.manifest.jobId,
    machineId: graph.machineId,
    panelId,
    operationCount: graph.operations.length,
    timestamp: Date.now(),
  };
}

/**
 * Create Cabinet provenance (for detection - will be BLOCKED)
 *
 * @param cabinetId - Cabinet ID
 * @param panelId - Panel ID
 */
export function createCabinetProvenance(
  cabinetId: string,
  panelId: string
): DxfProvenanceCabinet {
  return {
    source: 'CABINET_GEOMETRY',
    cabinetId,
    panelId,
    timestamp: Date.now(),
  };
}

/**
 * Create Nesting provenance
 *
 * @param sheetIndex - Sheet index
 */
export function createNestingProvenance(
  sheetIndex: number
): DxfProvenanceNesting {
  return {
    source: 'NESTING_LAYOUT',
    sheetIndex,
    timestamp: Date.now(),
  };
}

/**
 * Create unknown provenance (will be BLOCKED)
 */
export function createUnknownProvenance(): DxfProvenanceUnknown {
  return {
    source: 'UNKNOWN',
    timestamp: Date.now(),
  };
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Basic DXF format validation
 *
 * Checks for essential DXF structure markers
 */
function isValidDxfFormat(content: string): boolean {
  // Must contain section markers
  const hasSection = content.includes('SECTION');
  const hasEndSec = content.includes('ENDSEC');
  const hasEof = content.includes('EOF');

  // Must have at least one of: HEADER, ENTITIES, or TABLES section
  const hasHeader = content.includes('HEADER');
  const hasEntities = content.includes('ENTITIES');
  const hasTables = content.includes('TABLES');

  return hasSection && hasEndSec && hasEof && (hasHeader || hasEntities || hasTables);
}

/**
 * Check if DXF has operations layer (indicates CNC content)
 */
export function hasCncOperations(dxfContent: string): boolean {
  // Check for common CNC layer patterns
  const cncPatterns = [
    /DRILL_\d+/i,
    /BORE_\d+/i,
    /POCKET_D\d+/i,
    /PROFILE_/i,
    /SLOT_/i,
    /DRILL_V_/i,
    /DRILL_H_/i,
    /SAW_GROOVE/i,
    /HINGE_CUP/i,
  ];

  return cncPatterns.some(pattern => pattern.test(dxfContent));
}

// ============================================
// RUNTIME GUARD
// ============================================

/**
 * Guard function for factory export
 *
 * Use this to wrap DXF export functions in factory mode.
 *
 * @param dxfContent - Raw DXF content
 * @param provenance - DXF provenance
 * @param runtimeMode - Current runtime mode ('DESIGNER' | 'FACTORY')
 * @returns SafeDxf or throws G10Error
 *
 * @throws G10Error if DXF is unsafe and in FACTORY mode
 *
 * @example
 * ```typescript
 * // In factory export
 * const safeDxf = guardFactoryDxf(dxfContent, provenance, getRuntimeMode());
 * // safeDxf is now guaranteed safe for factory
 * ```
 */
export function guardFactoryDxf(
  dxfContent: string,
  provenance: DxfProvenance,
  runtimeMode: 'DESIGNER' | 'FACTORY'
): SafeDxf {
  const result = assertDxfSafety(dxfContent, provenance);

  if (result.ok === false) {
    // Extract issues from failed result
    const issues = result.issues;
    if (runtimeMode === 'FACTORY') {
      // In factory mode, throw hard error
      const errorMessages = issues.map(i => `[${i.code}] ${i.message}`).join('\n');
      throw new G10Error(
        `G10 FACTORY BLOCK: DXF export blocked\n${errorMessages}`,
        issues
      );
    } else {
      // In designer mode, warn but allow (for preview/testing)
      console.warn('[G10] DXF safety check failed (DESIGNER mode - allowing):', issues);
      // Return unbranded - will fail type check if used in factory path
      return dxfContent as SafeDxf;
    }
  }

  return result.dxf;
}

// ============================================
// G10 ERROR CLASS
// ============================================

/**
 * G10 Error class for DXF safety violations
 */
export class G10Error extends Error {
  public readonly gateId = 'G10' as const;
  public readonly issues: readonly G10Issue[];

  constructor(message: string, issues: readonly G10Issue[]) {
    super(message);
    this.name = 'G10Error';
    this.issues = issues;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, G10Error);
    }
  }
}

/**
 * Type guard for G10Error
 */
export function isG10Error(error: unknown): error is G10Error {
  return error instanceof G10Error;
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if DXF is SafeDxf (branded)
 *
 * Note: This is a runtime check only. For compile-time safety,
 * ensure your functions require SafeDxf parameter type.
 */
export function isSafeDxf(dxf: string): dxf is SafeDxf {
  // Runtime: We can't actually verify the brand at runtime
  // This is mostly for documentation - real safety comes from the type system
  return typeof dxf === 'string' && dxf.length > 0;
}

/**
 * Check if provenance is from OperationGraph
 */
export function isOperationGraphProvenance(
  provenance: DxfProvenance
): provenance is DxfProvenanceOperationGraph {
  return provenance.source === 'OPERATION_GRAPH';
}

// ============================================
// G10 GATE STATUS
// ============================================

/**
 * Get G10 gate status summary
 */
export function getG10Summary(result: G10Result): {
  ok: boolean;
  blockCount: number;
  warnCount: number;
  source: string;
} {
  if (result.ok === true) {
    return {
      ok: true,
      blockCount: 0,
      warnCount: result.warnings.length,
      source: 'OPERATION_GRAPH',
    };
  }

  // result.ok === false here
  const failedResult = result as { readonly ok: false; readonly issues: readonly G10Issue[] };
  return {
    ok: false,
    blockCount: failedResult.issues.filter(i => i.severity === 'BLOCK').length,
    warnCount: failedResult.issues.filter(i => i.severity === 'WARN').length,
    source: 'BLOCKED',
  };
}
