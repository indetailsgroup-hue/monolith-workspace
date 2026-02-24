/**
 * Connector OS v1.1 - Gate G11 Mode Validation
 *
 * Manufacturing audit rules for mode consistency, pairing, and spacing.
 * Runs on ConnectorDrillOp[] (panel-local coordinates) and blocks
 * export if violations are found.
 *
 * @see docs/connector-os/gate-g11.md
 */

import type { ConnectorDrillOp } from './types';
import type { ManufacturingMode } from './calculateCncCoordinate';

export interface G11ModeIssue {
  id: string;
  severity: 'BLOCKER';
  code: 'G11_MODE_MISMATCH' | 'G11_PAIRING_VIOLATION' | 'G11_SPACING_VIOLATION';
  message: string;
  opId: string;
}

export interface G11ModeResult {
  status: 'PASS' | 'FAIL';
  issues: G11ModeIssue[];
}

/**
 * G11.6: Validate V-coordinates match declared manufacturing mode.
 *
 * For each STRUCTURAL bore, checks that the MODE tag matches the declared mode.
 * A mismatch indicates the compiler emitted coordinates for the wrong mode,
 * producing scrap parts.
 */
export function validateG11Mode(
  ops: ConnectorDrillOp[],
  declaredMode: ManufacturingMode,
): G11ModeResult {
  const issues: G11ModeIssue[] = [];

  for (const op of ops) {
    if (op.meta.role !== 'STRUCTURAL') continue;

    const modeTag = op.tags.find((t) => t.startsWith('MODE='));
    if (!modeTag) continue;

    const tagMode = modeTag.replace('MODE=', '');
    if (tagMode !== declaredMode) {
      issues.push({
        id: `G11_MODE_${op.meta.pairId}_${op.meta.featureId}`,
        severity: 'BLOCKER',
        code: 'G11_MODE_MISMATCH',
        message:
          `Mode mismatch: operation tagged ${tagMode} but declared mode is ${declaredMode}. ` +
          `V=${op.params.v}mm may produce scrap.`,
        opId: op.meta.pairId,
      });
    }
  }

  return {
    status: issues.length > 0 ? 'FAIL' : 'PASS',
    issues,
  };
}

/**
 * G11.7: Validate connector pairing completeness.
 *
 * Every pairId must have at least 2 operations (e.g., CAM + BOLT).
 * A missing counterpart means hardware cannot be assembled.
 */
export function validateG11Pairing(
  ops: ConnectorDrillOp[],
): G11ModeResult {
  const issues: G11ModeIssue[] = [];
  const opsByPair = new Map<string, ConnectorDrillOp[]>();

  for (const op of ops) {
    const group = opsByPair.get(op.meta.pairId) ?? [];
    group.push(op);
    opsByPair.set(op.meta.pairId, group);
  }

  for (const [pairId, pairOps] of Array.from(opsByPair)) {
    if (pairOps.length < 2) {
      issues.push({
        id: `G11_PAIR_${pairId}`,
        severity: 'BLOCKER',
        code: 'G11_PAIRING_VIOLATION',
        message: `Missing counterpart in ${pairId}: found ${pairOps.length} operation(s), need at least 2.`,
        opId: pairId,
      });
    }
  }

  return {
    status: issues.length > 0 ? 'FAIL' : 'PASS',
    issues,
  };
}

/**
 * G11.8: Validate connector spacing per joint.
 *
 * Groups operations by joint prefix and checks that the actual V-spacing
 * between connectors does not exceed maxSpacingMm.
 */
export function validateG11Spacing(
  ops: ConnectorDrillOp[],
  maxSpacingMm: number,
): G11ModeResult {
  const issues: G11ModeIssue[] = [];

  // Group by joint: extract from pairId pattern "PAIR_{jointId}_{index}"
  const opsByJoint = new Map<string, number[]>();
  for (const op of ops) {
    const parts = op.meta.pairId.split('_');
    const jointId = parts.slice(0, 2).join('_');
    const vPositions = opsByJoint.get(jointId) ?? [];
    vPositions.push(op.params.v);
    opsByJoint.set(jointId, vPositions);
  }

  for (const [jointId, vPositions] of Array.from(opsByJoint)) {
    const uniqueV = Array.from(new Set(vPositions)).sort((a, b) => a - b);
    for (let i = 0; i < uniqueV.length - 1; i++) {
      const gap = uniqueV[i + 1] - uniqueV[i];
      if (gap > maxSpacingMm) {
        issues.push({
          id: `G11_SPACING_${jointId}_${i}`,
          severity: 'BLOCKER',
          code: 'G11_SPACING_VIOLATION',
          message:
            `Joint ${jointId}: spacing ${gap.toFixed(1)}mm between ` +
            `${uniqueV[i]}mm and ${uniqueV[i + 1]}mm exceeds max ${maxSpacingMm}mm.`,
          opId: jointId,
        });
      }
    }
  }

  return {
    status: issues.length > 0 ? 'FAIL' : 'PASS',
    issues,
  };
}
