import React, { useEffect } from 'react';

import type { OrgPlan } from '../tenant/types';
import { useQcAnomalyStore } from './qcAnomalyStore';
import {
  canAccessQcAnomaly,
  getQcaAnomalySeverityLabel,
  getQcaAnomalyStatusLabel,
  getQcaMetricKeyLabel,
  getQcaThresholdTypeLabel,
} from './qcAnomalyTypes';

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────

interface QcAnomalyDashboardProps {
  orgId: string;
  orgPlan: OrgPlan;
  isAdmin?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_ACCENT: Record<string, string> = {
  LOW:      '#6b7280',
  MEDIUM:   '#f59e0b',
  HIGH:     '#f97316',
  CRITICAL: '#ef4444',
};

const STATUS_ACCENT: Record<string, string> = {
  OPEN:         '#ef4444',
  ACKNOWLEDGED: '#f59e0b',
  RESOLVED:     '#22c55e',
};

const METRIC_KEYS = [
  'DEFECT_RATE',
  'CYCLE_TIME',
  'YIELD_RATE',
  'SCRAP_RATE',
  'REWORK_RATE',
  'DOWNTIME',
  'CUSTOM',
] as const;

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const STATUSES   = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label:  string;
  value:  number;
  accent: string;
  testId: string;
}

function SummaryCard({ label, value, accent, testId }: SummaryCardProps) {
  return (
    <div
      data-testid={testId}
      style={{
        borderLeft:  `4px solid ${accent}`,
        background:  '#ffffff',
        borderRadius: 8,
        padding:     '16px 20px',
        minWidth:    140,
        boxShadow:   '0 1px 4px rgba(0,0,0,0.08)',
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color: accent }}>{value}</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function QcAnomalyDashboard({
  orgId,
  orgPlan,
  isAdmin = false,
}: QcAnomalyDashboardProps) {
  const {
    thresholds,
    anomalies,
    isLoading,
    filters,
    error,
    selectedAnomalyId,
    fetchThresholds,
    fetchAnomalies,
    acknowledgeAnomaly,
    resolveAnomaly,
    updateThreshold,
    setFilters,
    clearError,
    selectAnomaly,
  } = useQcAnomalyStore();

  useEffect(() => {
    fetchThresholds(orgId, orgPlan);
    fetchAnomalies(orgId, orgPlan);
  }, [orgId, orgPlan]);

  // ── Plan gate ────────────────────────────────────────────────
  if (!canAccessQcAnomaly(orgPlan)) {
    return (
      <div
        data-testid="qca-plan-gate-wall"
        style={{
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        64,
          gap:            12,
          color:          '#6b7280',
          textAlign:      'center',
        }}
      >
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: '#111827' }}>
          QC Anomaly Detection
        </div>
        <div style={{ fontSize: 14 }}>ฟีเจอร์นี้ต้องการแผน ENTERPRISE</div>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        data-testid="qca-loading"
        style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 15 }}
      >
        กำลังโหลดข้อมูล QC Anomaly...
      </div>
    );
  }

  // ── Derived metrics ──────────────────────────────────────────
  const openCount         = anomalies.filter(a => a.status === 'OPEN').length;
  const criticalCount     = anomalies.filter(a => a.severity === 'CRITICAL').length;
  const acknowledgedCount = anomalies.filter(a => a.status === 'ACKNOWLEDGED').length;
  const resolvedCount     = anomalies.filter(a => a.status === 'RESOLVED').length;

  // ── Filtered anomalies ───────────────────────────────────────
  const filtered = anomalies.filter(a => {
    if (filters.metricKey !== 'ALL' && a.metric_key !== filters.metricKey) return false;
    if (filters.severity  !== 'ALL' && a.severity   !== filters.severity)  return false;
    if (filters.status    !== 'ALL' && a.status      !== filters.status)    return false;
    return true;
  });

  // ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 32px', fontFamily: 'sans-serif', maxWidth: 1280 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: '#111827' }}>
        QC Anomaly Detection
      </h2>

      {/* ── Error banner ─────────────────────────────────────── */}
      {error && (
        <div
          data-testid="qca-error-banner"
          style={{
            background:     '#fef2f2',
            border:         '1px solid #fca5a5',
            borderRadius:   6,
            padding:        '10px 16px',
            marginBottom:   16,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            color:          '#b91c1c',
            fontSize:       14,
          }}
        >
          <span>{error}</span>
          <button
            onClick={clearError}
            style={{
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              fontSize:   16,
              color:      '#b91c1c',
              padding:    '0 4px',
            }}
            aria-label="ปิดข้อความแจ้งเตือน"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Summary metric cards ─────────────────────────────── */}
      <div
        data-testid="qca-summary-cards"
        style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}
      >
        <SummaryCard
          testId="qca-open-count-card"
          label="Open Anomalies"
          value={openCount}
          accent="#ef4444"
        />
        <SummaryCard
          testId="qca-critical-count-card"
          label="Critical"
          value={criticalCount}
          accent="#dc2626"
        />
        <SummaryCard
          testId="qca-acknowledged-count-card"
          label="Acknowledged"
          value={acknowledgedCount}
          accent="#f59e0b"
        />
        <SummaryCard
          testId="qca-resolved-count-card"
          label="Resolved"
          value={resolvedCount}
          accent="#22c55e"
        />
      </div>

      {/* ── Filter bar ───────────────────────────────────────── */}
      <div
        data-testid="qca-filter-bar"
        style={{
          display:     'flex',
          gap:         12,
          marginBottom: 20,
          flexWrap:    'wrap',
          alignItems:  'center',
        }}
      >
        <label style={{ fontSize: 13, color: '#374151' }}>
          Metric:&nbsp;
          <select
            data-testid="qca-filter-metric"
            value={filters.metricKey}
            onChange={e =>
              setFilters({ metricKey: e.target.value as typeof filters['metricKey'] })
            }
            style={{
              background:   '#ffffff',
              color:        '#374151',
              colorScheme:  'light',
              padding:      '6px 10px',
              borderRadius: 6,
              border:       '1px solid #d1d5db',
              fontSize:     13,
            }}
          >
            <option value="ALL">ทุก Metric</option>
            {METRIC_KEYS.map(k => (
              <option key={k} value={k}>
                {getQcaMetricKeyLabel(k)}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13, color: '#374151' }}>
          Severity:&nbsp;
          <select
            data-testid="qca-filter-severity"
            value={filters.severity}
            onChange={e =>
              setFilters({ severity: e.target.value as typeof filters['severity'] })
            }
            style={{
              background:   '#ffffff',
              color:        '#374151',
              colorScheme:  'light',
              padding:      '6px 10px',
              borderRadius: 6,
              border:       '1px solid #d1d5db',
              fontSize:     13,
            }}
          >
            <option value="ALL">ทุก Severity</option>
            {SEVERITIES.map(s => (
              <option key={s} value={s}>
                {getQcaAnomalySeverityLabel(s)}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13, color: '#374151' }}>
          Status:&nbsp;
          <select
            data-testid="qca-filter-status"
            value={filters.status}
            onChange={e =>
              setFilters({ status: e.target.value as typeof filters['status'] })
            }
            style={{
              background:   '#ffffff',
              color:        '#374151',
              colorScheme:  'light',
              padding:      '6px 10px',
              borderRadius: 6,
              border:       '1px solid #d1d5db',
              fontSize:     13,
            }}
          >
            <option value="ALL">ทุก Status</option>
            {STATUSES.map(s => (
              <option key={s} value={s}>
                {getQcaAnomalyStatusLabel(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ── Two-column layout: anomaly list + threshold panel ── */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* ── Anomaly event list ───────────────────────────── */}
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#374151' }}>
            Anomaly Events
            <span
              style={{
                marginLeft:   8,
                background:   '#f3f4f6',
                borderRadius: 10,
                padding:      '1px 8px',
                fontSize:     12,
                color:        '#6b7280',
                fontWeight:   400,
              }}
            >
              {filtered.length}
            </span>
          </h3>

          {filtered.length === 0 ? (
            <div
              data-testid="qca-empty-anomalies"
              style={{
                color:     '#9ca3af',
                fontSize:  14,
                padding:   '32px 0',
                textAlign: 'center',
              }}
            >
              ไม่พบ anomaly events ตามเงื่อนไขที่เลือก
            </div>
          ) : (
            <ul
              data-testid="qca-anomaly-list"
              style={{
                listStyle:     'none',
                padding:       0,
                margin:        0,
                display:       'flex',
                flexDirection: 'column',
                gap:           8,
              }}
            >
              {filtered.map(anomaly => (
                <li
                  key={anomaly.id}
                  data-testid="qca-anomaly-row"
                  onClick={() => selectAnomaly(anomaly.id)}
                  style={{
                    background:   selectedAnomalyId === anomaly.id ? '#f0f9ff' : '#ffffff',
                    border:       `1px solid ${
                      selectedAnomalyId === anomaly.id ? '#bae6fd' : '#e5e7eb'
                    }`,
                    borderRadius: 8,
                    padding:      '12px 16px',
                    display:      'flex',
                    alignItems:   'center',
                    gap:          12,
                    cursor:       'pointer',
                    fontSize:     13,
                    transition:   'background 0.15s',
                  }}
                >
                  {/* Severity badge */}
                  <span
                    data-testid="qca-severity-badge"
                    style={{
                      background:  SEVERITY_ACCENT[anomaly.severity] ?? '#6b7280',
                      color:       '#ffffff',
                      borderRadius: 4,
                      padding:     '2px 8px',
                      fontWeight:  700,
                      fontSize:    11,
                      minWidth:    68,
                      textAlign:   'center',
                      flexShrink:  0,
                    }}
                  >
                    {getQcaAnomalySeverityLabel(anomaly.severity as Parameters<typeof getQcaAnomalySeverityLabel>[0])}
                  </span>

                  {/* Metric + values */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>
                      {getQcaMetricKeyLabel(anomaly.metric_key as Parameters<typeof getQcaMetricKeyLabel>[0])}
                    </div>
                    <div style={{ color: '#6b7280', marginTop: 2, fontSize: 12 }}>
                      วัดได้:&nbsp;
                      <strong>{anomaly.measured_value}</strong>
                      {anomaly.threshold_breach_detail && (
                        <>&nbsp;/&nbsp;เกณฑ์:&nbsp;<strong>{JSON.stringify(anomaly.threshold_breach_detail)}</strong></>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span
                    data-testid="qca-status-badge"
                    style={{
                      background:  STATUS_ACCENT[anomaly.status] ?? '#6b7280',
                      color:       '#ffffff',
                      borderRadius: 4,
                      padding:     '2px 8px',
                      fontWeight:  600,
                      fontSize:    11,
                      flexShrink:  0,
                    }}
                  >
                    {getQcaAnomalyStatusLabel(anomaly.status as Parameters<typeof getQcaAnomalyStatusLabel>[0])}
                  </span>

                  {/* Action buttons (admin only) */}
                  {isAdmin && anomaly.status === 'OPEN' && (
                    <button
                      data-testid="qca-acknowledge-btn"
                      onClick={e => {
                        e.stopPropagation();
                        acknowledgeAnomaly(anomaly.id, orgPlan);
                      }}
                      style={{
                        background:   '#f59e0b',
                        color:        '#ffffff',
                        border:       'none',
                        borderRadius: 4,
                        padding:      '5px 11px',
                        fontSize:     12,
                        fontWeight:   600,
                        cursor:       'pointer',
                        flexShrink:   0,
                      }}
                    >
                      รับทราบ
                    </button>
                  )}

                  {isAdmin &&
                    (anomaly.status === 'OPEN' || anomaly.status === 'ACKNOWLEDGED') && (
                      <button
                        data-testid="qca-resolve-btn"
                        onClick={e => {
                          e.stopPropagation();
                          resolveAnomaly(anomaly.id, orgPlan);
                        }}
                        style={{
                          background:   '#22c55e',
                          color:        '#ffffff',
                          border:       'none',
                          borderRadius: 4,
                          padding:      '5px 11px',
                          fontSize:     12,
                          fontWeight:   600,
                          cursor:       'pointer',
                          flexShrink:   0,
                        }}
                      >
                        แก้ไขแล้ว
                      </button>
                    )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Threshold config panel ───────────────────────── */}
        <div
          data-testid="qca-threshold-panel"
          style={{
            width:        300,
            flexShrink:   0,
            background:   '#f9fafb',
            borderRadius: 8,
            border:       '1px solid #e5e7eb',
            padding:      '16px',
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#374151' }}>
            Threshold Config
          </h3>

          {thresholds.length === 0 ? (
            <div
              data-testid="qca-empty-thresholds"
              style={{
                color:     '#9ca3af',
                fontSize:  13,
                textAlign: 'center',
                padding:   '20px 0',
              }}
            >
              ยังไม่มี threshold config
            </div>
          ) : (
            <ul
              style={{
                listStyle:     'none',
                padding:       0,
                margin:        0,
                display:       'flex',
                flexDirection: 'column',
                gap:           8,
              }}
            >
              {thresholds.map(t => (
                <li
                  key={t.id}
                  data-testid="qca-threshold-row"
                  style={{
                    background:     '#ffffff',
                    border:         '1px solid #e5e7eb',
                    borderRadius:   6,
                    padding:        '10px 12px',
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'space-between',
                    fontSize:       13,
                    opacity:        t.is_active ? 1 : 0.55,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#111827' }}>
                      {getQcaMetricKeyLabel(t.metric_key as Parameters<typeof getQcaMetricKeyLabel>[0])}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                      {getQcaThresholdTypeLabel(t.threshold_type as Parameters<typeof getQcaThresholdTypeLabel>[0])}
                    </div>
                  </div>

                  {isAdmin && (
                    <input
                      type="checkbox"
                      data-testid="qca-threshold-toggle"
                      checked={!!t.is_active}
                      onChange={e =>
                        updateThreshold(t.id, { is_active: e.target.checked }, orgPlan)
                      }
                      style={{ cursor: 'pointer', width: 16, height: 16 }}
                      aria-label={`Toggle threshold ${t.metric_key}`}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default QcAnomalyDashboard;
