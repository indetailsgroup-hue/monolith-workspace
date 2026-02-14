/**
 * RightInspectorSafetySection
 *
 * Contextual safety section for the right inspector panel.
 * Shows Gate findings relevant to the selected cabinet only.
 *
 * @version 1.0.0 - Phase A: Gate → UI Integration
 */

import React from 'react';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import { useDrillMapStore } from '../../core/store/useDrillMapStore';
import { useGateStore } from './gateStore';
import { resolveSelectionToEntityIds } from './selectionResolvers';
import { focusAndSelectFinding } from './focusEntity';
import { applyFindingFix } from './applyGatePatch';
import type { GateFinding } from './gateTypes';
import { SEVERITY_COLORS, SEVERITY_BG } from './gateTypes';

// ============================================
// ICONS
// ============================================

const FocusIcon = () => (
  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const WrenchIcon = () => (
  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

// ============================================
// COMPACT FINDING ROW
// ============================================

interface CompactFindingRowProps {
  finding: GateFinding;
  onFocus: () => void;
  onFix: () => void;
}

function CompactFindingRow({ finding, onFocus, onFix }: CompactFindingRowProps) {
  const hasFix = finding.patch && finding.patch.length > 0;

  return (
    <div
      className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-white/5 transition-colors"
      style={{ borderLeft: `2px solid ${SEVERITY_COLORS[finding.severity]}` }}
    >
      {/* Severity dot */}
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: SEVERITY_COLORS[finding.severity] }}
      />

      {/* Code & message */}
      <div className="flex-1 min-w-0">
        <span className="text-[9px] font-mono text-white">{finding.code}</span>
        <span className="text-[9px] text-gray-500 ml-1 truncate">
          ({finding.entityIds.length})
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={onFocus}
          className="p-1 rounded text-gray-500 hover:text-blue-400 hover:bg-blue-500/20 transition-colors"
          title="Focus"
        >
          <FocusIcon />
        </button>
        {hasFix && (
          <button
            onClick={onFix}
            className="p-1 rounded text-gray-500 hover:text-green-400 hover:bg-green-500/20 transition-colors"
            title="Apply Fix"
          >
            <WrenchIcon />
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function RightInspectorSafetySection() {
  const activeCabinetId = useCabinetStore(s => s.activeCabinetId);
  const drillMap = useDrillMapStore(s => s.drillMap);
  const lastResult = useGateStore(s => s.lastResult);

  // ────────────────────────────────────────────────────────────────────────
  // Get entity IDs for selected cabinet
  // ────────────────────────────────────────────────────────────────────────

  const cabinetEntityIds = React.useMemo(() => {
    return resolveSelectionToEntityIds(drillMap, activeCabinetId);
  }, [drillMap, activeCabinetId]);

  // ────────────────────────────────────────────────────────────────────────
  // Filter findings to those affecting this cabinet
  // ────────────────────────────────────────────────────────────────────────

  const relevantFindings = React.useMemo<GateFinding[]>(() => {
    if (!lastResult || cabinetEntityIds.length === 0) return [];

    const entitySet = new Set(cabinetEntityIds);
    const allFindings = [
      ...lastResult.findings.blockers,
      ...lastResult.findings.warnings,
      ...lastResult.findings.info,
    ];

    return allFindings.filter(finding =>
      finding.entityIds.some(id => entitySet.has(id))
    );
  }, [lastResult, cabinetEntityIds]);

  // ────────────────────────────────────────────────────────────────────────
  // Counts
  // ────────────────────────────────────────────────────────────────────────

  const blockerCount = relevantFindings.filter(f => f.severity === 'BLOCKER').length;
  const warningCount = relevantFindings.filter(f => f.severity === 'WARNING').length;
  const infoCount = relevantFindings.filter(f => f.severity === 'INFO').length;

  // ────────────────────────────────────────────────────────────────────────
  // Handlers
  // ────────────────────────────────────────────────────────────────────────

  const handleFocus = (finding: GateFinding) => {
    focusAndSelectFinding(finding.key, finding.entityIds);
  };

  const handleFix = (finding: GateFinding) => {
    applyFindingFix(finding);
  };

  // ────────────────────────────────────────────────────────────────────────
  // Render: No cabinet selected or no drill map
  // ────────────────────────────────────────────────────────────────────────

  if (!activeCabinetId || !drillMap) {
    return null;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Render: No Gate result
  // ────────────────────────────────────────────────────────────────────────

  if (!lastResult) {
    return (
      <div className="px-2 py-1.5 border-t border-[#333]">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[9px]">🛡️</span>
          <span className="text-[9px] font-medium text-gray-500">Safety</span>
        </div>
        <div className="text-[9px] text-gray-600">
          Run Gate to check
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // Render: Has result
  // ────────────────────────────────────────────────────────────────────────

  const hasIssues = relevantFindings.length > 0;

  return (
    <div className="px-2 py-1.5 border-t border-[#333]">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px]">🛡️</span>
          <span className="text-[9px] font-medium text-white">Safety</span>
        </div>
        <div className="flex items-center gap-1.5 text-[8px]">
          {blockerCount > 0 && (
            <span className="text-red-400">{blockerCount}</span>
          )}
          {warningCount > 0 && (
            <span className="text-amber-400">{warningCount}</span>
          )}
          {infoCount > 0 && (
            <span className="text-blue-400">{infoCount}</span>
          )}
          {!hasIssues && (
            <span className="text-green-400">✓</span>
          )}
        </div>
      </div>

      {/* Findings */}
      {hasIssues ? (
        <div className="space-y-0.5 max-h-32 overflow-y-auto">
          {relevantFindings.map(finding => (
            <CompactFindingRow
              key={finding.key}
              finding={finding}
              onFocus={() => handleFocus(finding)}
              onFix={() => handleFix(finding)}
            />
          ))}
        </div>
      ) : (
        <div className="text-[9px] text-green-400/70 py-1">
          All checks passed
        </div>
      )}
    </div>
  );
}

export default RightInspectorSafetySection;
