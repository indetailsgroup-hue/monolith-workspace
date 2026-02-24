/**
 * Build Gate Result JSON - B2 MVP
 *
 * Converts GateResult from store to PacketGateResult format.
 *
 * DETERMINISM:
 * - Findings sorted by key within each severity group
 * - All timestamps preserved exactly
 *
 * @version 1.0.0 - Phase B2: Factory Packet Generator MVP
 */

import type { GateResult, GateFinding } from '../../../gate/ui/gateTypes';
import type { PacketGateResult, PacketGateFinding } from '../types';
import { serializeDeterministicPretty } from '../manifestHash';

// ============================================
// FINDING CONVERTER
// ============================================

/**
 * Convert GateFinding to PacketGateFinding
 */
function convertFinding(finding: GateFinding): PacketGateFinding {
  return {
    key: finding.key,
    code: finding.code,
    severity: finding.severity,
    message: finding.message,
    entityIds: [...finding.entityIds].sort(), // Sort for determinism
  };
}

/**
 * Sort findings by key for determinism
 */
function sortFindings(findings: GateFinding[]): PacketGateFinding[] {
  return [...findings]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(convertFinding);
}

// ============================================
// MAIN BUILDER
// ============================================

/**
 * Build PacketGateResult from GateResult
 *
 * @param gateResult - Source GateResult from store
 * @returns PacketGateResult for factory packet
 */
export function buildGateResultData(gateResult: GateResult | null): PacketGateResult {
  if (!gateResult) {
    const now = new Date().toISOString();
    return {
      version: 'gate.v1',
      policyVersion: '0.0.0',
      passed: false,
      runAt: now,
      findings: {
        blockers: [],
        warnings: [],
        info: [],
      },
      summary: {
        blockerCount: 0,
        warningCount: 0,
        infoCount: 0,
      },
    };
  }

  return {
    version: 'gate.v1',
    policyVersion: gateResult.policyVersion,
    passed: gateResult.passed,
    runAt: gateResult.runAt,
    findings: {
      blockers: sortFindings(gateResult.findings.blockers),
      warnings: sortFindings(gateResult.findings.warnings),
      info: sortFindings(gateResult.findings.info),
    },
    summary: {
      blockerCount: gateResult.findings.blockers.length,
      warningCount: gateResult.findings.warnings.length,
      infoCount: gateResult.findings.info.length,
    },
  };
}

/**
 * Build Gate Result JSON string
 *
 * @param gateResult - Source GateResult from store
 * @returns Deterministic JSON string
 */
export function buildGateResultJson(gateResult: GateResult | null): string {
  const data = buildGateResultData(gateResult);
  return serializeDeterministicPretty(data);
}
