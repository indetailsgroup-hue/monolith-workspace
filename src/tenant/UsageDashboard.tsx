/**
 * tenant/UsageDashboard.tsx — Real-time Plan Consumption Widget
 *
 * Displays current usage metrics with progress bars and alerts.
 * Designed to embed inside OrgSettingsPage or /settings route.
 *
 * Features:
 * - Jobs/month usage with progress bar
 * - Members count with limit indicator
 * - Storage usage visualization
 * - Alert banners for high usage
 * - Upgrade CTA when approaching limits
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { UsageMetrics, UsageAlert } from './usageMetering';
import {
  buildUsageMetrics,
  getUsageAlerts,
  PLAN_STORAGE_LIMITS,
  getCurrentPeriod,
} from './usageMetering';
import { PLAN_LIMITS } from './types';
import { useTenantStore } from './tenantStore';

// ============================================================================
// Types
// ============================================================================

interface UsageDashboardProps {
  /** Override metrics (for testing). In production, fetched from Supabase RPC. */
  metrics?: UsageMetrics;
  /** Show compact version (no header) */
  compact?: boolean;
  /** Callback when user clicks upgrade */
  onUpgrade?: () => void;
}

// ============================================================================
// Sub-components
// ============================================================================

interface ProgressBarProps {
  label: string;
  current: number;
  limit: number;
  unit?: string;
  formatValue?: (n: number) => string;
}

function ProgressBar({ label, current, limit, unit = '', formatValue }: ProgressBarProps) {
  const percent = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const fmt = formatValue || ((n: number) => n.toLocaleString('th-TH'));

  let barColor = '#3b82f6'; // blue
  if (percent >= 95) barColor = '#ef4444'; // red
  else if (percent >= 80) barColor = '#f59e0b'; // amber

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>{label}</span>
        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          {fmt(current)} / {fmt(limit)} {unit}
        </span>
      </div>
      <div
        style={{
          width: '100%',
          height: '8px',
          background: '#e5e7eb',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        <div
          data-testid={`progress-${label.toLowerCase().replace(/\s/g, '-')}`}
          style={{
            width: `${percent}%`,
            height: '100%',
            background: barColor,
            borderRadius: '4px',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.125rem' }}>
        {percent.toFixed(0)}% ใช้งานแล้ว
      </div>
    </div>
  );
}

interface AlertBannerProps {
  alert: UsageAlert;
}

function AlertBanner({ alert }: AlertBannerProps) {
  const bgColors = { warning: '#fffbeb', critical: '#fef3c7', blocked: '#fef2f2' };
  const borderColors = { warning: '#f59e0b', critical: '#d97706', blocked: '#ef4444' };
  const icons = { warning: '⚠️', critical: '🔶', blocked: '🚫' };

  return (
    <div
      data-testid="usage-alert"
      style={{
        padding: '0.75rem 1rem',
        background: bgColors[alert.type],
        border: `1px solid ${borderColors[alert.type]}`,
        borderRadius: '6px',
        marginBottom: '0.75rem',
        fontSize: '0.875rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      <span>{icons[alert.type]}</span>
      <span>{alert.message}</span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function UsageDashboard({ metrics: propMetrics, compact = false, onUpgrade }: UsageDashboardProps) {
  const { currentOrg } = useTenantStore();
  const [loading, setLoading] = useState(!propMetrics);
  const [fetchedMetrics, setFetchedMetrics] = useState<UsageMetrics | null>(null);

  // In production, fetch from Supabase RPC: get_org_usage(org_id)
  useEffect(() => {
    if (propMetrics || !currentOrg) return;

    const fetchUsage = async () => {
      setLoading(true);
      try {
        // Simulated — replace with:
        // const { data } = await supabase.rpc('get_org_usage', { p_org_id: currentOrg.orgId });
        await new Promise((r) => setTimeout(r, 200));

        // Build from defaults until real data is available
        const defaultMetrics = buildUsageMetrics(currentOrg, 0, 1, 0);
        setFetchedMetrics(defaultMetrics);
      } finally {
        setLoading(false);
      }
    };

    fetchUsage();
  }, [currentOrg, propMetrics]);

  const metrics = propMetrics || fetchedMetrics;
  const alerts = useMemo(() => (metrics ? getUsageAlerts(metrics) : []), [metrics]);

  if (!currentOrg) {
    return <div style={{ padding: '1rem', color: '#6b7280' }}>ไม่พบข้อมูลองค์กร</div>;
  }

  if (loading) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280' }}>
        กำลังโหลดข้อมูลการใช้งาน...
      </div>
    );
  }

  if (!metrics) {
    return <div style={{ padding: '1rem', color: '#6b7280' }}>ไม่สามารถโหลดข้อมูลได้</div>;
  }

  const storageFormatted = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)} GB`;
    return `${n.toFixed(0)} MB`;
  };

  return (
    <div
      data-testid="usage-dashboard"
      style={{
        padding: compact ? '1rem' : '1.5rem',
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
      }}
    >
      {/* Header */}
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>📊 การใช้งาน</h2>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.25rem 0 0' }}>
              รอบบิล: {metrics.period} • แพลน: {currentOrg.plan}
            </p>
          </div>
          {onUpgrade && currentOrg.plan !== 'ENTERPRISE' && (
            <button
              onClick={onUpgrade}
              style={{
                padding: '0.5rem 1rem',
                background: '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              อัพเกรดแพลน
            </button>
          )}
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          {alerts.map((alert, i) => (
            <AlertBanner key={i} alert={alert} />
          ))}
        </div>
      )}

      {/* Usage Bars */}
      <ProgressBar
        label="งาน/เดือน"
        current={metrics.jobsCreated}
        limit={metrics.jobsLimit}
        unit="งาน"
      />
      <ProgressBar
        label="สมาชิก"
        current={metrics.membersCount}
        limit={metrics.membersLimit}
        unit="คน"
      />
      <ProgressBar
        label="พื้นที่จัดเก็บ"
        current={metrics.storageUsedMb}
        limit={metrics.storagelimitMb}
        formatValue={storageFormatted}
      />

      {/* Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.75rem',
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid #f3f4f6',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
            {metrics.jobsLimit - metrics.jobsCreated}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>งานเหลือเดือนนี้</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
            {metrics.membersLimit - metrics.membersCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>ที่นั่งว่าง</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
            {storageFormatted(metrics.storagelimitMb - metrics.storageUsedMb)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>พื้นที่เหลือ</div>
        </div>
      </div>
    </div>
  );
}

export type { UsageDashboardProps };
