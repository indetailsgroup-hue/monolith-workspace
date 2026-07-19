/**
 * SafetyPanel
 *
 * Left sidebar panel content for Safety Gate validation.
 * Shows all Gate findings with Focus, Apply Fix, and Copy actions.
 *
 * @version 1.0.0 - Phase A: Gate → UI Integration
 */

import React from 'react';
import { useGateStore } from './gateStore';
import { focusAndSelectFinding, clearEntityFocus } from './focusEntity';
import { applyFindingFix } from './applyGatePatch';
import type { GateFinding, GateResult, Severity } from './gateTypes';
import { SEVERITY_COLORS, SEVERITY_BG, countBySeverity } from './gateTypes';
import { useDrillMapStore } from '../../core/store/useDrillMapStore';
import { validateMinifixGate } from '../rules/connectors/validateMinifixConnector';
import { validateG11FromDrillMap } from '../rules/gateG11_minifixSystem32';
import { runConnectorOsAudit, type ConnectorAuditIssue } from '../rules/gateG11_connectorAudit';
import { runShadowCompare } from '../../core/connector/shadowCompare';
import { compareWorldParity } from '../../core/connector/worldSynthesis';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import { buildDrillOpsFromDrillMap, buildPartsFromDrillMap } from '../builders/fromDrillMap';
import { ruleDrillDepthSafety } from '../rules/rule_drillDepthSafety';
import { ruleMinMargins } from '../rules/rule_minMargins';
import { DEFAULT_GATE_POLICY_V1 } from '../policy';
import type { GateIssue } from '../types';

// ============================================
// ICONS
// ============================================

const FocusIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const WrenchIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const CopyIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

// ============================================
// FINDING CARD
// ============================================

interface FindingCardProps {
  finding: GateFinding;
  isSelected: boolean;
  onFocus: () => void;
  onApplyFix: () => void;
  onCopy: () => void;
}

function FindingCard({ finding, isSelected, onFocus, onApplyFix, onCopy }: FindingCardProps) {
  const severity = finding.severity;
  const hasFix = finding.patch && finding.patch.length > 0;

  return (
    <div
      className={`p-2 rounded-lg border transition-all ${
        isSelected
          ? 'border-white/30 bg-white/5'
          : 'border-[#333] bg-surface-2 hover:border-gray-500'
      }`}
      style={{ borderLeftColor: SEVERITY_COLORS[severity], borderLeftWidth: 3 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <span
          className="px-1.5 py-0.5 rounded text-[9px] font-medium"
          style={{
            backgroundColor: SEVERITY_BG[severity],
            color: SEVERITY_COLORS[severity],
          }}
        >
          {severity}
        </span>
        <span className="text-[10px] text-white font-mono">{finding.code}</span>
      </div>

      {/* Message */}
      <p className="text-[10px] text-gray-400 mb-2 line-clamp-2">{finding.message}</p>

      {/* Affected entities */}
      {finding.entityIds.length > 0 && (
        <div className="text-[9px] text-gray-500 mb-2">
          {finding.entityIds.length} affected {finding.entityIds.length === 1 ? 'point' : 'points'}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onFocus}
          className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium
            bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
          title="Focus camera on affected entities"
        >
          <FocusIcon />
          Focus
        </button>

        {hasFix && (
          <button
            onClick={onApplyFix}
            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium
              bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
            title="Apply automatic fix"
          >
            <WrenchIcon />
            Fix
          </button>
        )}

        <button
          onClick={onCopy}
          className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors ml-auto"
          title="Copy finding details"
        >
          <CopyIcon />
        </button>
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

/**
 * Run Gate validation on the current drill map and update the store.
 * Converts validateMinifixGate result to GateResult format.
 *
 * S18: exported so AppGateProvider can auto-run the gate on design changes
 * (not only when the user opens the Safety tab).
 */
export function runGateValidation(): void {
  const { setRunning, setResult } = useGateStore.getState();
  const drillMap = useDrillMapStore.getState().drillMap;

  // Set running state
  setRunning(true);

  // DEBUG: version marker to ensure HMR reloads this code
  console.log('[SafetyPanel v2] Starting validation with debug logging...');

  // Run validation (synchronous, but we use setTimeout to allow UI to update)
  setTimeout(() => {
    try {
      const gateResult = validateMinifixGate(drillMap);
      // Connector OS เป็นผู้ตรวจชั้นที่สอง (G11 rules + catalog/placer/compiler audit)
      const g11Result = validateG11FromDrillMap(drillMap);
      // ADR-061: severity ของ spacing ตาม density profile ที่ผู้ใช้เลือก
      const connectorDensity = useDrillMapStore.getState().connectorDensity;
      const connectorAudit = runConnectorOsAudit(drillMap, 'STANDARD', connectorDensity);
      // ADR-061 ขั้น shadow: compiler สังเคราะห์คู่ขนาน เทียบ parity (ยังไม่สลับตัวสร้าง)
      const shadow = runShadowCompare(drillMap);
      // ADR-061(c): world-coordinate parity — synthesis จาก cabinet geometry ล้วน เทียบ drill map จริง
      const activeCab = useCabinetStore.getState().cabinet;
      const world = activeCab ? compareWorldParity(activeCab, drillMap, { density: connectorDensity }) : null;

      // Gate v0.1 material-safety rules, on the REAL holes.
      // These two consume GateInput.drillOps, which production never filled —
      // the Freeze payload defaults it to [] and the only caller that ever put
      // data in it was a unit test. So the drill-depth safety rule had never
      // examined a real hole. The drill map is right here; feed it.
      const safetyParts = buildPartsFromDrillMap(drillMap);
      const { ops: safetyOps, skipped: safetySkipped } = buildDrillOpsFromDrillMap(drillMap);
      const safetyIssues: GateIssue[] = [
        ...ruleDrillDepthSafety(DEFAULT_GATE_POLICY_V1, safetyParts, safetyOps),
        ...ruleMinMargins(DEFAULT_GATE_POLICY_V1, safetyParts, safetyOps, []),
      ];
      if (safetySkipped.length > 0) {
        console.warn(`[SafetyPanel] ${safetySkipped.length} drill point(s) skipped — panel geometry unusable`, safetySkipped);
      }

      const safetyToFinding = (i: GateIssue): GateFinding => ({
        key: `${i.code}:${i.partIds?.join(',') ?? ''}:${String(i.context?.opId ?? '')}`,
        code: i.code,
        message: i.message,
        severity: i.severity as Severity,
        entityIds: i.context?.opId ? [String(i.context.opId)] : (i.partIds ?? []),
        context: i.context as Record<string, unknown> | undefined,
      });

      const g11ToFinding = (i: (typeof g11Result.issues)[number]): GateFinding => ({
        key: `${i.code}:${(i.drillPointIds ?? i.panelIds ?? []).join(',')}`,
        code: i.code,
        message: i.message,
        severity: (i.severity === 'BLOCKER' ? 'BLOCKER' : i.severity === 'WARNING' ? 'WARNING' : 'INFO') as Severity,
        entityIds: i.drillPointIds ?? i.panelIds ?? [],
        context: i.context as Record<string, unknown> | undefined,
      });
      const auditToFinding = (i: ConnectorAuditIssue): GateFinding => ({
        key: `${i.code}:${i.entityIds.slice(0, 4).join(',')}`,
        code: i.code,
        message: i.message,
        severity: i.severity as Severity,
        entityIds: i.entityIds,
        context: i.measured,
      });

      const extraBlockers = [
        ...g11Result.issues.filter(i => i.severity === 'BLOCKER').map(g11ToFinding),
        ...connectorAudit.issues.filter(i => i.severity === 'BLOCKER').map(auditToFinding),
        ...safetyIssues.filter(i => i.severity === 'BLOCKER').map(safetyToFinding),
      ];
      const extraWarnings = [
        ...g11Result.issues.filter(i => i.severity === 'WARNING').map(g11ToFinding),
        ...connectorAudit.issues.filter(i => i.severity === 'WARNING').map(auditToFinding),
        ...safetyIssues.filter(i => i.severity === 'WARNING').map(safetyToFinding),
      ];
      const shadowInfo: GateFinding[] = shadow.jointsCompared > 0 ? [{
        key: 'CONNECTOR_OS_SHADOW',
        code: 'CONNECTOR_OS_SHADOW',
        message: `Shadow compiler parity: ${shadow.jointsMatched}/${shadow.jointsCompared} joints ตรง` +
          (world ? ` · world-coord: ${world.matched}/${world.compared} bores (Δmax ${world.maxDeltaMm.toFixed(2)}mm${world.skippedCorners.length > 0 ? `, skip ${world.skippedCorners.length} corner` : ''})` : '') +
          ' — สลับตัวสร้างได้เมื่อเต็มทุกตู้',
        severity: 'INFO' as Severity,
        entityIds: [],
        context: { jointsMatched: shadow.jointsMatched, jointsCompared: shadow.jointsCompared },
      }] : [];

      const extraInfo = [
        ...shadowInfo,
        ...g11Result.issues.filter(i => i.severity !== 'BLOCKER' && i.severity !== 'WARNING').map(g11ToFinding),
        ...connectorAudit.issues.filter(i => i.severity === 'INFO').map(auditToFinding),
      ];

      // Convert MinifixGateResult to GateResult format
      // passed = ไม่มี blocker (FAIL) จาก checker ใด ๆ — warnings ไม่ทำให้ fail
      // (สัญญาเดียวกับ useExportGate และ factory verifyPacket ที่อ่าน gate_result.json:
      //  passed=false + 0 blockers จะกลายเป็น "Gate FAILED: 0 blocker(s)" ที่โรงงาน)
      // status 'WARNING' (เช่น ยังไม่มี drill map) = ไม่ผ่านแบบเงียบ ๆ แต่ก็ไม่ FAIL
      const safetyBlockerCount = safetyIssues.filter(i => i.severity === 'BLOCKER').length;
      const safetyWarningCount = safetyIssues.filter(i => i.severity === 'WARNING').length;

      const result: GateResult = {
        // A drill-through must FAIL the gate, not merely appear in the list.
        passed: gateResult.status !== 'FAIL'
          && g11Result.status !== 'FAIL'
          && connectorAudit.status !== 'FAIL'
          && safetyBlockerCount === 0,
        runAt: new Date().toISOString(),
        policyVersion: 'minifix-v1.0+g11-connector-os-v1.1',
        findings: {
          blockers: [
            ...gateResult.findings
              .filter(f => f.severity === 'ERROR')
              .map(f => ({
                key: `${f.code}:${f.entityIds.join(',')}`,
                code: f.code,
                message: f.message,
                severity: 'BLOCKER' as Severity,
                entityIds: f.entityIds,
                patch: f.suggestedFix?.patch?.map(p => ({
                  op: p.op as 'replace' | 'add' | 'remove',
                  path: `/useDrillMapStore/drillMap${p.path}`,
                  value: p.value,
                })),
                context: {
                  ...(f.measured || {}),
                  ...(f.tolerance || {}),
                },
              })),
            ...extraBlockers,
          ],
          warnings: [
            ...gateResult.findings
              .filter(f => f.severity === 'WARNING')
              .map(f => ({
                key: `${f.code}:${f.entityIds.join(',')}`,
                code: f.code,
                message: f.message,
                severity: 'WARNING' as Severity,
                entityIds: f.entityIds,
                context: f.measured,
              })),
            ...extraWarnings,
          ],
          info: extraInfo,
        },
        metrics: {
          errors: gateResult.summary.errors + g11Result.summary.blockers + connectorAudit.summary.blockers + safetyBlockerCount,
          warnings: gateResult.summary.warnings + g11Result.summary.warnings + connectorAudit.summary.warnings + safetyWarningCount,
          connectorJointsAudited: connectorAudit.summary.jointsAudited,
        },
      };

      setResult(result);
      console.log('[SafetyPanel] Gate validation completed:', gateResult.status,
        '| G11:', g11Result.status, `(${g11Result.issues.length} issues)`,
        '| ConnectorOS:', connectorAudit.status, `(${connectorAudit.summary.jointsAudited} joints)`,
        '| Material safety:', `${safetyOps.length} holes checked, ${safetyBlockerCount} blocker(s), ${safetyWarningCount} warning(s)`);
    } catch (error) {
      console.error('[SafetyPanel] Gate validation error:', error);
      setRunning(false);
    }
  }, 50);
}

export function SafetyPanel() {
  const lastResult = useGateStore(s => s.lastResult);
  const isRunning = useGateStore(s => s.isRunning);
  const selectedFindingKey = useGateStore(s => s.selectedFindingKey);

  // ────────────────────────────────────────────────────────────────────────
  // Handlers
  // ────────────────────────────────────────────────────────────────────────

  const handleFocus = (finding: GateFinding) => {
    focusAndSelectFinding(finding.key, finding.entityIds);
  };

  const handleApplyFix = (finding: GateFinding) => {
    const success = applyFindingFix(finding);
    if (success) {
      // Re-run validation after fix to verify the issue is resolved
      runGateValidation();
      console.log('[SafetyPanel] Fix applied successfully, re-running validation');
    }
  };

  const handleCopy = (finding: GateFinding) => {
    const text = `${finding.severity}: ${finding.code}\n${finding.message}\nEntities: ${finding.entityIds.join(', ')}`;
    navigator.clipboard.writeText(text);
    console.log('[SafetyPanel] Copied finding to clipboard');
  };

  const handleRunGate = () => {
    // Trigger Gate validation
    runGateValidation();
  };

  // ────────────────────────────────────────────────────────────────────────
  // Render: No result
  // ────────────────────────────────────────────────────────────────────────

  if (!lastResult) {
    return (
      <div className="p-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-white flex items-center gap-1.5">
            <span>🛡️</span>
            Safety Gate
          </h3>
          <button
            onClick={handleRunGate}
            disabled={isRunning}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
              bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-50 transition-colors"
          >
            <RefreshIcon />
            {isRunning ? 'Running...' : 'Run Gate'}
          </button>
        </div>

        <div className="p-4 bg-surface-2 rounded-lg border border-[#333] text-center">
          <div className="text-[10px] text-gray-500">
            No validation run yet.
          </div>
          <div className="text-[9px] text-gray-600 mt-1">
            Click "Run Gate" to validate drill patterns.
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // Render: Has result
  // ────────────────────────────────────────────────────────────────────────

  const counts = countBySeverity(lastResult);
  const allFindings = [
    ...lastResult.findings.blockers,
    ...lastResult.findings.warnings,
    ...lastResult.findings.info,
  ];

  return (
    <div className="p-2 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-white flex items-center gap-1.5">
          <span>🛡️</span>
          Safety Gate
        </h3>
        <button
          onClick={handleRunGate}
          disabled={isRunning}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
            bg-surface-3 text-gray-400 hover:text-white hover:bg-surface-4 disabled:opacity-50 transition-colors"
        >
          <RefreshIcon />
        </button>
      </div>

      {/* Status Summary */}
      <div
        className={`p-2 rounded-lg mb-2 flex items-center justify-between ${
          lastResult.passed ? 'bg-green-500/10' : 'bg-red-500/10'
        }`}
      >
        <span
          className={`text-[10px] font-medium ${
            lastResult.passed ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {lastResult.passed ? '✓ PASSED' : '✗ FAILED'}
        </span>
        <div className="flex items-center gap-2 text-[9px]">
          {counts.BLOCKER > 0 && (
            <span className="text-red-400">{counts.BLOCKER} blocker</span>
          )}
          {counts.WARNING > 0 && (
            <span className="text-amber-400">{counts.WARNING} warn</span>
          )}
          {counts.INFO > 0 && (
            <span className="text-blue-400">{counts.INFO} info</span>
          )}
        </div>
      </div>

      {/* Findings List */}
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {allFindings.length === 0 ? (
          <div className="p-4 bg-green-500/10 rounded-lg text-center">
            <div className="text-[10px] text-green-400">
              All checks passed
            </div>
          </div>
        ) : (
          allFindings.map((finding) => (
            <FindingCard
              key={finding.key}
              finding={finding}
              isSelected={finding.key === selectedFindingKey}
              onFocus={() => handleFocus(finding)}
              onApplyFix={() => handleApplyFix(finding)}
              onCopy={() => handleCopy(finding)}
            />
          ))
        )}
      </div>

      {/* Clear Selection Button */}
      {selectedFindingKey && (
        <button
          onClick={() => clearEntityFocus()}
          className="mt-2 w-full py-1.5 rounded text-[10px] font-medium
            bg-surface-3 text-gray-400 hover:text-white transition-colors"
        >
          Clear Selection
        </button>
      )}
    </div>
  );
}

export default SafetyPanel;
