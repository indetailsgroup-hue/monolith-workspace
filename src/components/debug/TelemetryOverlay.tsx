/**
 * TelemetryOverlay.tsx - Debug Overlay for Telemetry
 *
 * PURPOSE:
 * - Display real-time telemetry data during drag
 * - Show FPS, velocity, snap state, collision stats
 * - Alert badges with auto-suggest tuning recommendations
 *
 * USAGE:
 * import { TelemetryOverlay } from './debug/TelemetryOverlay';
 *
 * // In your app
 * <TelemetryOverlay />
 *
 * HOTKEYS:
 * - Ctrl+Shift+T: Toggle overlay
 * - Ctrl+Shift+R: Reset telemetry
 */

import React, { useEffect, useState, useCallback } from 'react';
import { TELEMETRY } from '../../core/telemetry/telemetrySingleton';
import { ALERTS, SUGGEST } from '../../core/telemetry/telemetryPipeline';
import {
  latestDrag,
  latestCollision,
  latestGate,
} from '../../core/telemetry/telemetrySelectors';
import type { TelemetryAlertEvent } from '../../core/telemetry/alertTypes';
import { getAlertColor, getAlertMetadata } from '../../core/telemetry/alertTypes';
import type { TuningSuggestionEvent, ProposedChange } from '../../core/telemetry/tuningSuggestionTypes';
import { getSuggestionMetadata, getSuggestionColor } from '../../core/telemetry/tuningSuggestionTypes';

// Shadow simulation imports
import { runQuickSimulation, createShadowInput, type ShadowRunInput } from '../../core/telemetry/shadowRunner';
import { pushShadowReport, type TelemetryShadowReport } from '../../core/telemetry/shadowTelemetry';
import { overridesFromSuggestions, hasSimulatableOverrides } from '../../core/telemetry/suggestionToOverrides';
import { getVerdictColor, getVerdictIcon, formatDelta, getDeltaColor, type ShadowReport } from '../../core/telemetry/shadowMetrics';

// Apply/Rollback imports
import { evaluateAndApply, rollbackTuning, canApply, canRollback, getTuningStatus } from '../../core/config/runtimeTuningApply';
import { RUNTIME_TUNING } from '../../core/config/runtimeTuningStore';
import { getRecentAudits, type TuningAuditEvent, getAuditActionColor, getAuditActionIcon } from '../../core/telemetry/auditTelemetry';

// ============================================
// STYLES (Operational Intelligence theme)
// ============================================

const OVERLAY_STYLE: React.CSSProperties = {
  position: 'fixed',
  right: 12,
  bottom: 12,
  width: 360,
  maxHeight: '80vh',
  overflowY: 'auto',
  padding: 12,
  borderRadius: 12,
  background: 'rgba(15, 23, 42, 0.92)',
  backdropFilter: 'blur(8px)',
  color: '#e2e8f0',
  fontFamily: 'JetBrains Mono, Consolas, monospace',
  fontSize: 11,
  lineHeight: 1.4,
  zIndex: 99999,
  border: '1px solid rgba(100, 116, 139, 0.3)',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
};

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 10,
  paddingBottom: 8,
  borderBottom: '1px solid rgba(100, 116, 139, 0.3)',
};

const SECTION_STYLE: React.CSSProperties = {
  marginBottom: 10,
  paddingBottom: 8,
  borderBottom: '1px solid rgba(100, 116, 139, 0.15)',
};

const SECTION_TITLE_STYLE: React.CSSProperties = {
  opacity: 0.7,
  marginBottom: 4,
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: 2,
};

const LABEL_STYLE: React.CSSProperties = {
  opacity: 0.7,
};

const VALUE_STYLE: React.CSSProperties = {
  fontWeight: 500,
};

const BUTTON_STYLE: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid rgba(100, 116, 139, 0.4)',
  background: 'rgba(51, 65, 85, 0.5)',
  color: '#e2e8f0',
  cursor: 'pointer',
  fontSize: 10,
};

// ============================================
// HELPER: COLORS
// ============================================

function getFpsColor(fps: number): string {
  if (fps >= 55) return '#4ade80'; // Green
  if (fps >= 45) return '#a3e635'; // Lime
  if (fps >= 30) return '#facc15'; // Yellow
  return '#f87171'; // Red
}

function getAxisLockColor(lock: string): string {
  switch (lock) {
    case 'X':
      return '#f87171'; // Red
    case 'Y':
      return '#4ade80'; // Green
    case 'Z':
      return '#60a5fa'; // Blue
    default:
      return '#94a3b8'; // Gray
  }
}

// ============================================
// COMPONENT
// ============================================

export function TelemetryOverlay() {
  const [tick, setTick] = useState(0);
  const [enabled, setEnabled] = useState(TELEMETRY.isEnabled());
  const [collapsed, setCollapsed] = useState(false);
  const [showSuggestion, setShowSuggestion] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [showAudit, setShowAudit] = useState(true);
  const [applyingState, setApplyingState] = useState<'idle' | 'applying' | 'rolling-back'>('idle');
  const [tuningActive, setTuningActive] = useState(RUNTIME_TUNING.isActive());

  // Refresh every 200ms
  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), 200);
    return () => window.clearInterval(id);
  }, []);

  // Sync enabled state
  useEffect(() => {
    const id = window.setInterval(() => {
      setEnabled(TELEMETRY.isEnabled());
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  // Subscribe to tuning state changes
  useEffect(() => {
    const unsubscribe = RUNTIME_TUNING.subscribe(() => {
      setTuningActive(RUNTIME_TUNING.isActive());
    });
    return unsubscribe;
  }, []);

  const events = TELEMETRY.snapshot(200);
  const d = latestDrag(events);
  const c = latestCollision(events);
  const g = latestGate(events);

  // Get alerts from events (filter ALERT kind)
  const alertEvents = events
    .filter(e => e.kind === 'ALERT')
    .slice(0, 5) as TelemetryAlertEvent[];

  // Get suggestions from events (filter SUGGESTION kind)
  const suggestionEvents = events
    .filter(e => e.kind === 'SUGGESTION')
    .slice(0, 3) as TuningSuggestionEvent[];

  // Get shadow reports from events
  const shadowReports = events
    .filter(e => e.kind === 'SHADOW_REPORT')
    .slice(0, 1) as TelemetryShadowReport[];

  // Get counts
  const totalAlerts = ALERTS.getTotalAlerts();
  const totalSuggestions = SUGGEST.getTotalSuggestions();

  // Check if simulation is possible
  const overrides = overridesFromSuggestions(suggestionEvents);
  const canSimulate = suggestionEvents.length > 0 && hasSimulatableOverrides(overrides);

  // Handle simulation
  const handleSimulate = useCallback(() => {
    if (simulating || !canSimulate) return;
    setSimulating(true);

    try {
      // Create input from current telemetry data
      const ctx = SUGGEST.getContext();
      const input = createShadowInput({
        config: {
          nearPaddingMm: ctx.nearPaddingMm,
          cellSizeMm: ctx.cellSizeMm,
          snapThresholdMm: ctx.snapThresholdMm,
          engageThresholdMm: ctx.engageThresholdMm,
          disengageThresholdMm: ctx.disengageThresholdMm,
          stickyScoreMargin: ctx.stickyScoreMargin,
          lookaheadMinMs: ctx.lookaheadMinMs,
          lookaheadMaxMs: ctx.lookaheadMaxMs,
          maxLookaheadMm: ctx.maxLookaheadMm,
          fixedStepHz: ctx.fixedStepHz,
        },
        velocityWorld: d?.velocity ?? { x: 0, y: 0, z: 0 },
        speed: d?.speed ?? 0,
        engaged: d?.engaged ?? false,
        candidateCount: d?.candidateCount ?? 0,
        dtSec: d?.dtSec ?? 0.016,
        lastCollisionMs: c?.ms,
        lastSatPairs: c?.satPairsTried,
        lastNearItems: c?.nearItems,
        durationSec: 1.0,
      });

      // Run quick simulation
      const report = runQuickSimulation({
        input,
        trial: overrides,
        sampleCount: 100,
      });

      // Push to telemetry
      pushShadowReport(report);
    } finally {
      setSimulating(false);
    }
  }, [simulating, canSimulate, d, c, overrides]);

  // Handle apply tuning
  const handleApply = useCallback((report: ShadowReport) => {
    if (applyingState !== 'idle') return;
    if (!canApply(report)) return;

    setApplyingState('applying');
    try {
      const result = evaluateAndApply({
        report,
        suggestions: suggestionEvents,
      });

      if (result.success) {
        console.log(`[TelemetryOverlay] Applied tuning (session: ${result.sessionId})`);
      } else {
        console.log(`[TelemetryOverlay] Apply rejected:`, result.reasons);
      }
    } finally {
      setApplyingState('idle');
    }
  }, [applyingState, suggestionEvents]);

  // Handle rollback tuning
  const handleRollback = useCallback(() => {
    if (applyingState !== 'idle') return;
    if (!canRollback()) return;

    setApplyingState('rolling-back');
    try {
      const result = rollbackTuning({ reason: 'User requested rollback' });

      if (result.success) {
        console.log('[TelemetryOverlay] Rolled back tuning');
      }
    } finally {
      setApplyingState('idle');
    }
  }, [applyingState]);

  // Get recent audits for display
  const recentAudits = getRecentAudits(5);

  return (
    <div style={OVERLAY_STYLE}>
      {/* Header */}
      <div style={HEADER_STYLE}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 12 }}>Telemetry</strong>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: enabled ? '#4ade80' : '#f87171',
          }} />
          {totalAlerts > 0 && (
            <span style={{
              background: '#f8717130',
              color: '#f87171',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 9,
            }}>
              {totalAlerts} alerts
            </span>
          )}
          {totalSuggestions > 0 && (
            <span style={{
              background: '#3b82f630',
              color: '#60a5fa',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 9,
            }}>
              {totalSuggestions} suggest
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            style={BUTTON_STYLE}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? '▼' : '▲'}
          </button>
          <button
            style={BUTTON_STYLE}
            onClick={() => {
              TELEMETRY.setEnabled(!enabled);
              ALERTS.setEnabled(!enabled);
              SUGGEST.setEnabled(!enabled);
              setEnabled(!enabled);
            }}
          >
            {enabled ? 'OFF' : 'ON'}
          </button>
        </div>
      </div>

      {!enabled && (
        <div style={{ opacity: 0.6, textAlign: 'center', padding: 12 }}>
          Disabled (Ctrl+Shift+T)
        </div>
      )}

      {enabled && !collapsed && (
        <>
          {/* Alerts Section */}
          {alertEvents.length > 0 && (
            <div style={SECTION_STYLE}>
              <div style={SECTION_TITLE_STYLE}>Alerts</div>
              {alertEvents.map((alert, i) => (
                <AlertCard key={i} alert={alert} />
              ))}
            </div>
          )}

          {/* Suggestions Section */}
          {suggestionEvents.length > 0 && showSuggestion && (
            <div style={SECTION_STYLE}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}>
                <div style={SECTION_TITLE_STYLE}>Suggestions</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {canSimulate && (
                    <button
                      style={{
                        ...BUTTON_STYLE,
                        padding: '2px 8px',
                        fontSize: 9,
                        background: simulating ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)',
                        border: '1px solid rgba(59, 130, 246, 0.5)',
                        color: '#60a5fa',
                      }}
                      onClick={handleSimulate}
                      disabled={simulating}
                    >
                      {simulating ? 'Running...' : 'Simulate'}
                    </button>
                  )}
                  <button
                    style={{ ...BUTTON_STYLE, padding: '2px 6px', fontSize: 9 }}
                    onClick={() => setShowSuggestion(false)}
                  >
                    Hide
                  </button>
                </div>
              </div>
              {suggestionEvents.map((suggestion, i) => (
                <SuggestionCard key={i} suggestion={suggestion} />
              ))}
            </div>
          )}

          {/* Shadow Simulation Report */}
          {shadowReports.length > 0 && (
            <ShadowReportCard
              report={shadowReports[0]}
              onApply={handleApply}
              onRollback={handleRollback}
              tuningActive={tuningActive}
              applyingState={applyingState}
            />
          )}

          {/* FPS & Frame */}
          <div style={SECTION_STYLE}>
            <div style={SECTION_TITLE_STYLE}>Frame</div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>fps</span>
              <span style={{ ...VALUE_STYLE, color: getFpsColor(d?.fps ?? 0) }}>
                {d?.fps?.toFixed(1) ?? '-'}
              </span>
            </div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>dt</span>
              <span style={VALUE_STYLE}>
                {d?.dtSec ? `${(d.dtSec * 1000).toFixed(2)}ms` : '-'}
              </span>
            </div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>subSteps</span>
              <span style={VALUE_STYLE}>{d?.subSteps ?? '-'}</span>
            </div>
          </div>

          {/* Velocity */}
          <div style={SECTION_STYLE}>
            <div style={SECTION_TITLE_STYLE}>Velocity</div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>speed</span>
              <span style={VALUE_STYLE}>
                {d?.speed?.toFixed(1) ?? '-'} mm/s
              </span>
            </div>
            {d?.velocity && (
              <div style={{ ...ROW_STYLE, opacity: 0.7 }}>
                <span style={LABEL_STYLE}>vec</span>
                <span style={VALUE_STYLE}>
                  [{d.velocity.x.toFixed(0)}, {d.velocity.y.toFixed(0)}, {d.velocity.z.toFixed(0)}]
                </span>
              </div>
            )}
          </div>

          {/* Snap */}
          <div style={SECTION_STYLE}>
            <div style={SECTION_TITLE_STYLE}>Snap</div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>enabled</span>
              <span style={{ ...VALUE_STYLE, color: d?.snapEnabled ? '#4ade80' : '#94a3b8' }}>
                {d?.snapEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>engaged</span>
              <span style={{ ...VALUE_STYLE, color: d?.engaged ? '#facc15' : '#94a3b8' }}>
                {d?.engaged ? 'YES' : 'NO'}
              </span>
            </div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>axisLock</span>
              <span style={{ ...VALUE_STYLE, color: getAxisLockColor(d?.axisLock ?? 'NONE') }}>
                {d?.axisLock ?? 'NONE'}
              </span>
            </div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>candidates</span>
              <span style={VALUE_STYLE}>{d?.candidateCount ?? '-'}</span>
            </div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>active</span>
              <span style={VALUE_STYLE}>{d?.activeIndex ?? '-'}</span>
            </div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>lookahead</span>
              <span style={VALUE_STYLE}>
                {d?.lookaheadMs?.toFixed(0) ?? '-'} ms
              </span>
            </div>
            {d?.intentAxis && (
              <div style={ROW_STYLE}>
                <span style={LABEL_STYLE}>intent</span>
                <span style={VALUE_STYLE}>
                  {d.intentAxis} ({((d.intentConfidence ?? 0) * 100).toFixed(0)}%)
                </span>
              </div>
            )}
          </div>

          {/* Collision */}
          <div style={SECTION_STYLE}>
            <div style={SECTION_TITLE_STYLE}>Collision</div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>phase</span>
              <span style={VALUE_STYLE}>{c?.phase ?? '-'}</span>
            </div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>nearItems</span>
              <span style={VALUE_STYLE}>{c?.nearItems ?? '-'}</span>
            </div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>satPairs</span>
              <span style={VALUE_STYLE}>{c?.satPairsTried ?? '-'}</span>
            </div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>satHits</span>
              <span style={{ ...VALUE_STYLE, color: (c?.satHits ?? 0) > 0 ? '#f87171' : '#4ade80' }}>
                {c?.satHits ?? '-'}
              </span>
            </div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>time</span>
              <span style={{ ...VALUE_STYLE, color: (c?.ms ?? 0) > 5 ? '#facc15' : 'inherit' }}>
                {c?.ms?.toFixed(2) ?? '-'} ms
              </span>
            </div>
          </div>

          {/* Gate */}
          <div style={SECTION_STYLE}>
            <div style={SECTION_TITLE_STYLE}>Gate</div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>ok</span>
              <span style={{ ...VALUE_STYLE, color: g?.ok !== false ? '#4ade80' : '#f87171' }}>
                {g ? (g.ok ? 'YES' : 'NO') : '-'}
              </span>
            </div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>errors</span>
              <span style={{ ...VALUE_STYLE, color: (g?.errorCount ?? 0) > 0 ? '#f87171' : 'inherit' }}>
                {g?.errorCount ?? '-'}
              </span>
            </div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>warnings</span>
              <span style={{ ...VALUE_STYLE, color: (g?.warnCount ?? 0) > 0 ? '#facc15' : 'inherit' }}>
                {g?.warnCount ?? '-'}
              </span>
            </div>
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>time</span>
              <span style={VALUE_STYLE}>{g?.ms?.toFixed(2) ?? '-'} ms</span>
            </div>
          </div>

          {/* Tuning Status (when active) */}
          {tuningActive && (
            <div style={{
              ...SECTION_STYLE,
              background: 'rgba(74, 222, 128, 0.1)',
              border: '1px solid rgba(74, 222, 128, 0.3)',
              borderRadius: 8,
              padding: 8,
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#4ade80', fontSize: 12 }}>●</span>
                  <strong style={{ color: '#4ade80', fontSize: 11 }}>Tuning Active</strong>
                </div>
                <button
                  style={{
                    ...BUTTON_STYLE,
                    padding: '2px 8px',
                    fontSize: 9,
                    background: 'rgba(248, 113, 113, 0.2)',
                    border: '1px solid rgba(248, 113, 113, 0.5)',
                    color: '#f87171',
                  }}
                  onClick={handleRollback}
                  disabled={applyingState !== 'idle'}
                >
                  {applyingState === 'rolling-back' ? 'Rolling Back...' : 'Rollback'}
                </button>
              </div>
              <div style={{ fontSize: 9, opacity: 0.8, marginTop: 4 }}>
                Session: {getTuningStatus().sessionId?.slice(0, 16)}...
              </div>
            </div>
          )}

          {/* Audit Trail */}
          {showAudit && recentAudits.length > 0 && (
            <div style={{ marginBottom: 0 }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}>
                <div style={SECTION_TITLE_STYLE}>Audit Trail</div>
                <button
                  style={{ ...BUTTON_STYLE, padding: '2px 6px', fontSize: 9 }}
                  onClick={() => setShowAudit(false)}
                >
                  Hide
                </button>
              </div>
              {recentAudits.map((audit, i) => (
                <AuditCard key={i} audit={audit} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Collapsed mini view */}
      {enabled && collapsed && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: getFpsColor(d?.fps ?? 0) }}>
            {d?.fps?.toFixed(0) ?? '-'} fps
          </span>
          <span>{d?.speed?.toFixed(0) ?? '-'} mm/s</span>
          <span style={{ color: d?.engaged ? '#facc15' : '#94a3b8' }}>
            {d?.engaged ? 'SNAP' : 'FREE'}
          </span>
          <span style={{ color: getAxisLockColor(d?.axisLock ?? 'NONE') }}>
            {d?.axisLock !== 'NONE' ? `LOCK:${d?.axisLock}` : ''}
          </span>
          {totalAlerts > 0 && (
            <span style={{ color: '#f87171' }}>
              {totalAlerts} alerts
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// ALERT CARD COMPONENT
// ============================================

function AlertCard({ alert }: { alert: TelemetryAlertEvent }) {
  const meta = getAlertMetadata(alert.code);
  const color = getAlertColor(alert.code);

  return (
    <div style={{
      padding: '6px 8px',
      borderRadius: 8,
      border: `1px solid ${color}30`,
      background: `${color}10`,
      marginBottom: 6,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12 }}>{meta?.icon ?? '⚠️'}</span>
          <strong style={{ color }}>{alert.code}</strong>
        </div>
        <span style={{
          opacity: 0.7,
          fontSize: 9,
          background: 'rgba(255,255,255,0.1)',
          padding: '1px 4px',
          borderRadius: 3,
        }}>
          #{alert.count}
        </span>
      </div>
      <div style={{ opacity: 0.9, fontSize: 10, marginTop: 2 }}>
        {alert.title}
      </div>
      <div style={{ opacity: 0.7, fontSize: 9, marginTop: 1 }}>
        {alert.detail}
      </div>
      {alert.suggestion && (
        <div style={{
          marginTop: 4,
          padding: '3px 6px',
          background: 'rgba(59, 130, 246, 0.15)',
          borderRadius: 4,
          fontSize: 9,
          color: '#60a5fa',
        }}>
          💡 {alert.suggestion}
        </div>
      )}
    </div>
  );
}

// ============================================
// SUGGESTION CARD COMPONENT
// ============================================

function SuggestionCard({ suggestion }: { suggestion: TuningSuggestionEvent }) {
  const meta = getSuggestionMetadata(suggestion.code);
  const color = getSuggestionColor(suggestion.code);

  // Get first proposed change for display
  const proposedEntries = Object.entries(suggestion.proposed);
  const [paramName, change] = proposedEntries[0] ?? ['', null];

  const arrow = change?.direction === 'increase' ? '↑' : '↓';
  const arrowColor = change?.direction === 'increase' ? '#4ade80' : '#f87171';

  return (
    <div style={{
      padding: '6px 8px',
      borderRadius: 8,
      border: `1px solid ${color}30`,
      background: `${color}10`,
      marginBottom: 6,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12 }}>{meta?.icon ?? '💡'}</span>
          <strong style={{ color, fontSize: 10 }}>{suggestion.code}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            opacity: 0.7,
            fontSize: 9,
            background: 'rgba(255,255,255,0.1)',
            padding: '1px 4px',
            borderRadius: 3,
          }}>
            #{suggestion.count}
          </span>
          <span style={{
            fontSize: 9,
            color: suggestion.confidence >= 0.8 ? '#4ade80' : (suggestion.confidence >= 0.6 ? '#facc15' : '#94a3b8'),
          }}>
            {Math.round(suggestion.confidence * 100)}%
          </span>
        </div>
      </div>

      <div style={{ opacity: 0.9, fontSize: 10, marginTop: 4 }}>
        {suggestion.title}
      </div>

      {change && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 4,
          padding: '4px 6px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 4,
          fontSize: 10,
        }}>
          <span style={{ color: arrowColor, fontWeight: 'bold' }}>{arrow}</span>
          <span style={{ opacity: 0.7 }}>{paramName}:</span>
          <span style={{ fontWeight: 500 }}>
            {change.from}{change.unit ?? ''} → {change.to}{change.unit ?? ''}
          </span>
          <span style={{ opacity: 0.5 }}>
            ({change.percentChange.toFixed(0)}%)
          </span>
        </div>
      )}

      {suggestion.expectedImpact && (
        <div style={{
          marginTop: 4,
          padding: '3px 6px',
          background: 'rgba(59, 130, 246, 0.15)',
          borderRadius: 4,
          fontSize: 9,
          color: '#60a5fa',
        }}>
          💡 {suggestion.expectedImpact}
        </div>
      )}
    </div>
  );
}

// ============================================
// SHADOW REPORT CARD COMPONENT
// ============================================

interface ShadowReportCardProps {
  report: TelemetryShadowReport;
  onApply: (report: ShadowReport) => void;
  onRollback: () => void;
  tuningActive: boolean;
  applyingState: 'idle' | 'applying' | 'rolling-back';
}

function ShadowReportCard({ report, onApply, onRollback, tuningActive, applyingState }: ShadowReportCardProps) {
  const r = report.report;
  const verdictColor = getVerdictColor(r.verdict);
  const verdictIcon = getVerdictIcon(r.verdict);
  const canApplyNow = r.verdict === 'IMPROVES' && !tuningActive && applyingState === 'idle';

  return (
    <div style={{
      ...SECTION_STYLE,
      background: `${verdictColor}10`,
      border: `1px solid ${verdictColor}30`,
      borderRadius: 8,
      padding: 8,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>
            {r.verdict === 'IMPROVES' ? '✓' : r.verdict === 'WORSENS' ? '✗' : '~'}
          </span>
          <strong style={{ color: verdictColor, fontSize: 11 }}>
            {r.verdict}
          </strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ opacity: 0.7, fontSize: 9 }}>
            {r.durationSec.toFixed(1)}s
          </span>
          {/* Apply button - only show when verdict is IMPROVES */}
          {canApplyNow && (
            <button
              style={{
                ...BUTTON_STYLE,
                padding: '2px 8px',
                fontSize: 9,
                background: 'rgba(74, 222, 128, 0.2)',
                border: '1px solid rgba(74, 222, 128, 0.5)',
                color: '#4ade80',
              }}
              onClick={() => onApply(r)}
            >
              Apply
            </button>
          )}
          {/* Rollback button - show when tuning is active */}
          {tuningActive && (
            <button
              style={{
                ...BUTTON_STYLE,
                padding: '2px 8px',
                fontSize: 9,
                background: 'rgba(248, 113, 113, 0.2)',
                border: '1px solid rgba(248, 113, 113, 0.5)',
                color: '#f87171',
              }}
              onClick={onRollback}
              disabled={applyingState !== 'idle'}
            >
              {applyingState === 'rolling-back' ? 'Rolling...' : 'Rollback'}
            </button>
          )}
        </div>
      </div>

      {/* Delta metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 4,
        fontSize: 9,
        marginBottom: 6,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ opacity: 0.7 }}>collision</span>
          <span style={{ color: getDeltaColor(r.delta.collisionMsAvgPct) }}>
            {r.delta.collisionMsAvgPct > 0 ? '+' : ''}{r.delta.collisionMsAvgPct.toFixed(1)}%
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ opacity: 0.7 }}>satPairs</span>
          <span style={{ color: getDeltaColor(r.delta.satPairsAvgPct) }}>
            {r.delta.satPairsAvgPct > 0 ? '+' : ''}{r.delta.satPairsAvgPct.toFixed(1)}%
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ opacity: 0.7 }}>candidates</span>
          <span style={{ color: getDeltaColor(r.delta.candidateAvgPct) }}>
            {r.delta.candidateAvgPct > 0 ? '+' : ''}{r.delta.candidateAvgPct.toFixed(1)}%
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ opacity: 0.7 }}>flipFlop</span>
          <span style={{ color: getDeltaColor(r.delta.flipFlopPct) }}>
            {r.delta.flipFlopPct > 0 ? '+' : ''}{r.delta.flipFlopPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Notes */}
      {r.notes.length > 0 && (
        <div style={{
          fontSize: 9,
          opacity: 0.8,
          borderTop: '1px solid rgba(255,255,255,0.1)',
          paddingTop: 4,
        }}>
          {r.notes.slice(0, 2).map((note, i) => (
            <div key={i} style={{ marginTop: i > 0 ? 2 : 0 }}>
              • {note}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// AUDIT CARD COMPONENT
// ============================================

function AuditCard({ audit }: { audit: TuningAuditEvent }) {
  const color = getAuditActionColor(audit.action);
  const icon = getAuditActionIcon(audit.action);

  // Format time ago
  const now = Date.now();
  const ageMs = now - audit.ts;
  const ageSec = Math.floor(ageMs / 1000);
  const ageMin = Math.floor(ageSec / 60);
  const timeAgo = ageMin > 0 ? `${ageMin}m ago` : `${ageSec}s ago`;

  return (
    <div style={{
      padding: '4px 8px',
      borderRadius: 6,
      border: `1px solid ${color}30`,
      background: `${color}10`,
      marginBottom: 4,
      fontSize: 9,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color, fontWeight: 'bold' }}>{icon}</span>
          <strong style={{ color }}>{audit.action}</strong>
        </div>
        <span style={{ opacity: 0.6 }}>{timeAgo}</span>
      </div>

      {/* Session info */}
      {audit.sessionId && (
        <div style={{ opacity: 0.7, marginTop: 2 }}>
          Session: {audit.sessionId.slice(0, 12)}...
        </div>
      )}

      {/* Rejection reasons */}
      {audit.action === 'REJECT' && audit.reasons && audit.reasons.length > 0 && (
        <div style={{ marginTop: 2, color: '#f87171' }}>
          {audit.reasons.slice(0, 2).map((reason, i) => (
            <div key={i}>• {reason}</div>
          ))}
        </div>
      )}

      {/* Rollback duration */}
      {audit.action === 'ROLLBACK' && audit.activeDurationMs != null && (
        <div style={{ opacity: 0.7, marginTop: 2 }}>
          Active for {(audit.activeDurationMs / 1000).toFixed(1)}s
        </div>
      )}
    </div>
  );
}

// ============================================
// EXPORT DEFAULT
// ============================================

export default TelemetryOverlay;
