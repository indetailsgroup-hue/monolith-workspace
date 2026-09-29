/**
 * jobs/JobAnalyticsDashboard.tsx — Throughput, cycle-time, and overdue alerts
 *
 * Features:
 * - Throughput metrics: jobs completed per week/month
 * - Average cycle time per status (how long jobs stay in each status)
 * - Overdue job alerts with severity levels
 * - Status distribution chart (horizontal bar)
 * - Trend sparkline (last 12 weeks)
 *
 * @version 15.5.0
 */

import React, { useMemo } from 'react';
import { useJobStore } from './jobStore';
import {
  type Job,
  type JobStatus,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  isActive,
} from './types';

// ============================================================================
// Types
// ============================================================================

export interface CycleTimeMetric {
  status: JobStatus;
  label: string;
  avgDays: number;
  jobCount: number;
  color: string;
}

export interface ThroughputMetric {
  period: string;
  completed: number;
  created: number;
}

export interface OverdueAlert {
  jobId: string;
  jobCode: string;
  title: string;
  customer: string;
  deadline: string;
  daysOverdue: number;
  status: JobStatus;
  severity: 'warning' | 'critical' | 'severe';
}

export interface AnalyticsSummary {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  overdueCount: number;
  avgCycleTimeDays: number;
  throughputThisWeek: number;
  throughputThisMonth: number;
}

// ============================================================================
// Analytics Computation Helpers
// ============================================================================

export function computeCycleTimeMetrics(jobs: Job[]): CycleTimeMetric[] {
  // Group jobs by current status, compute average time spent
  // We approximate cycle time by (now - updatedAt) for active jobs,
  // and (updatedAt - createdAt) / position for completed jobs
  const metrics: CycleTimeMetric[] = [];

  for (const status of JOB_STATUSES) {
    const statusJobs = jobs.filter((j) => j.status === status);
    if (statusJobs.length === 0) {
      metrics.push({
        status,
        label: JOB_STATUS_LABELS[status],
        avgDays: 0,
        jobCount: 0,
        color: JOB_STATUS_COLORS[status],
      });
      continue;
    }

    const now = Date.now();
    const totalDays = statusJobs.reduce((sum, j) => {
      const updated = new Date(j.updatedAt).getTime();
      const created = new Date(j.createdAt).getTime();
      // For active statuses, measure time since last update
      // For terminal, measure total lifecycle
      const elapsed = isActive(j.status)
        ? (now - updated) / (1000 * 60 * 60 * 24)
        : (updated - created) / (1000 * 60 * 60 * 24);
      return sum + Math.max(0, elapsed);
    }, 0);

    metrics.push({
      status,
      label: JOB_STATUS_LABELS[status],
      avgDays: Math.round((totalDays / statusJobs.length) * 10) / 10,
      jobCount: statusJobs.length,
      color: JOB_STATUS_COLORS[status],
    });
  }

  return metrics;
}

export function computeThroughput(jobs: Job[]): ThroughputMetric[] {
  const now = new Date();
  const metrics: ThroughputMetric[] = [];

  // Last 12 weeks
  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - i * 7);

    const label = `W${12 - i}`;
    const completed = jobs.filter((j) => {
      const updated = new Date(j.updatedAt);
      return (
        (j.status === 'CLOSED' || j.status === 'DELIVERED' || j.status === 'INVOICED') &&
        updated >= weekStart &&
        updated < weekEnd
      );
    }).length;

    const created = jobs.filter((j) => {
      const created = new Date(j.createdAt);
      return created >= weekStart && created < weekEnd;
    }).length;

    metrics.push({ period: label, completed, created });
  }

  return metrics;
}

export function computeOverdueAlerts(jobs: Job[]): OverdueAlert[] {
  const now = new Date();
  const alerts: OverdueAlert[] = [];

  for (const job of jobs) {
    if (!job.deadline || !isActive(job.status)) continue;

    const deadline = new Date(job.deadline);
    const daysOverdue = Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24));

    if (daysOverdue > 0) {
      let severity: OverdueAlert['severity'] = 'warning';
      if (daysOverdue > 14) severity = 'severe';
      else if (daysOverdue > 7) severity = 'critical';

      alerts.push({
        jobId: job.jobId,
        jobCode: job.jobCode,
        title: job.title,
        customer: job.customer.name,
        deadline: job.deadline,
        daysOverdue,
        status: job.status,
        severity,
      });
    }
  }

  // Sort by severity (severe first) then days overdue
  return alerts.sort((a, b) => {
    const sevOrder = { severe: 0, critical: 1, warning: 2 };
    if (sevOrder[a.severity] !== sevOrder[b.severity]) return sevOrder[a.severity] - sevOrder[b.severity];
    return b.daysOverdue - a.daysOverdue;
  });
}

export function computeSummary(jobs: Job[]): AnalyticsSummary {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const activeJobs = jobs.filter((j) => isActive(j.status));
  const completedJobs = jobs.filter((j) => ['CLOSED', 'DELIVERED', 'INVOICED'].includes(j.status));
  const overdueCount = jobs.filter(
    (j) => j.deadline && isActive(j.status) && new Date(j.deadline) < now,
  ).length;

  const throughputThisWeek = completedJobs.filter(
    (j) => new Date(j.updatedAt) >= weekAgo,
  ).length;

  const throughputThisMonth = completedJobs.filter(
    (j) => new Date(j.updatedAt) >= monthAgo,
  ).length;

  const totalCycleDays = completedJobs.reduce((sum, j) => {
    const days = (new Date(j.updatedAt).getTime() - new Date(j.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    return sum + Math.max(0, days);
  }, 0);
  const avgCycleTimeDays = completedJobs.length > 0
    ? Math.round((totalCycleDays / completedJobs.length) * 10) / 10
    : 0;

  return {
    totalJobs: jobs.length,
    activeJobs: activeJobs.length,
    completedJobs: completedJobs.length,
    overdueCount,
    avgCycleTimeDays,
    throughputThisWeek,
    throughputThisMonth,
  };
}

// ============================================================================
// Component
// ============================================================================

export interface JobAnalyticsDashboardProps {
  /** Navigate to job detail */
  onSelectJob?: (jobId: string) => void;
}

export function JobAnalyticsDashboard({
  onSelectJob,
}: JobAnalyticsDashboardProps): React.ReactElement {
  const jobs = useJobStore((s) => s.jobs);

  const summary = useMemo(() => computeSummary(jobs), [jobs]);
  const cycleMetrics = useMemo(() => computeCycleTimeMetrics(jobs), [jobs]);
  const throughput = useMemo(() => computeThroughput(jobs), [jobs]);
  const overdueAlerts = useMemo(() => computeOverdueAlerts(jobs), [jobs]);

  const maxCycle = Math.max(...cycleMetrics.map((m) => m.avgDays), 1);
  const maxThroughput = Math.max(...throughput.map((t) => Math.max(t.completed, t.created)), 1);

  return (
    <div style={styles.container} data-testid="job-analytics-dashboard">
      {/* Summary Cards */}
      <div style={styles.summaryGrid} data-testid="analytics-summary">
        <SummaryCard label="งานทั้งหมด" value={summary.totalJobs} color="#3b82f6" />
        <SummaryCard label="กำลังดำเนินการ" value={summary.activeJobs} color="#f59e0b" />
        <SummaryCard label="เสร็จแล้ว" value={summary.completedJobs} color="#22c55e" />
        <SummaryCard label="เลยกำหนด" value={summary.overdueCount} color="#ef4444" />
        <SummaryCard
          label="Cycle Time เฉลี่ย"
          value={`${summary.avgCycleTimeDays}d`}
          color="#8b5cf6"
        />
        <SummaryCard label="สัปดาห์นี้" value={summary.throughputThisWeek} color="#06b6d4" subtitle="throughput" />
      </div>

      {/* Two-column layout */}
      <div style={styles.twoCol}>
        {/* Cycle Time Chart */}
        <div style={styles.card} data-testid="cycle-time-chart">
          <h3 style={styles.cardTitle}>⏱ Average Cycle Time per Status</h3>
          <div style={styles.barChart}>
            {cycleMetrics
              .filter((m) => m.jobCount > 0)
              .map((m) => (
                <div key={m.status} style={styles.barRow}>
                  <span style={styles.barLabel}>{m.label}</span>
                  <div style={styles.barTrack}>
                    <div
                      style={{
                        ...styles.barFill,
                        width: `${(m.avgDays / maxCycle) * 100}%`,
                        background: m.color,
                      }}
                      data-testid={`cycle-bar-${m.status}`}
                    />
                  </div>
                  <span style={styles.barValue}>
                    {m.avgDays}d <span style={{ fontSize: '9px', color: '#6b7280' }}>({m.jobCount})</span>
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Throughput Sparkline */}
        <div style={styles.card} data-testid="throughput-chart">
          <h3 style={styles.cardTitle}>📈 Throughput (12 Weeks)</h3>
          <div style={styles.sparkline}>
            {throughput.map((t) => (
              <div key={t.period} style={styles.sparkCol}>
                <div style={styles.sparkBars}>
                  <div
                    style={{
                      ...styles.sparkBar,
                      height: `${(t.completed / maxThroughput) * 60}px`,
                      background: '#22c55e',
                    }}
                    title={`Completed: ${t.completed}`}
                  />
                  <div
                    style={{
                      ...styles.sparkBar,
                      height: `${(t.created / maxThroughput) * 60}px`,
                      background: '#3b82f640',
                      border: '1px solid #3b82f6',
                    }}
                    title={`Created: ${t.created}`}
                  />
                </div>
                <span style={styles.sparkLabel}>{t.period}</span>
              </div>
            ))}
          </div>
          <div style={styles.legend}>
            <span style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: '#22c55e' }} /> Completed
            </span>
            <span style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: '#3b82f6' }} /> Created
            </span>
          </div>
        </div>
      </div>

      {/* Overdue Alerts */}
      <div style={styles.card} data-testid="overdue-alerts">
        <h3 style={styles.cardTitle}>
          🚨 Overdue Job Alerts
          {overdueAlerts.length > 0 && (
            <span style={styles.alertBadge}>{overdueAlerts.length}</span>
          )}
        </h3>
        {overdueAlerts.length === 0 ? (
          <div style={styles.emptyAlerts}>✓ ไม่มีงานเลยกำหนด</div>
        ) : (
          <div style={styles.alertList}>
            {overdueAlerts.map((alert) => (
              <div
                key={alert.jobId}
                style={{
                  ...styles.alertRow,
                  borderLeftColor: SEVERITY_COLORS[alert.severity],
                }}
                onClick={() => onSelectJob?.(alert.jobId)}
                data-testid={`overdue-${alert.jobCode}`}
              >
                <div style={styles.alertLeft}>
                  <span style={{ ...styles.severityBadge, background: SEVERITY_COLORS[alert.severity] + '20', color: SEVERITY_COLORS[alert.severity] }}>
                    {SEVERITY_LABELS[alert.severity]}
                  </span>
                  <span style={styles.alertCode}>{alert.jobCode}</span>
                  <span style={styles.alertTitle}>{alert.title}</span>
                </div>
                <div style={styles.alertRight}>
                  <span style={styles.alertCustomer}>{alert.customer}</span>
                  <span style={styles.alertDays}>
                    {alert.daysOverdue} วัน
                  </span>
                  <span style={{ fontSize: '10px', color: JOB_STATUS_COLORS[alert.status] }}>
                    {JOB_STATUS_LABELS[alert.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status Distribution */}
      <div style={styles.card} data-testid="status-distribution">
        <h3 style={styles.cardTitle}>📊 Status Distribution</h3>
        <div style={styles.distRow}>
          {JOB_STATUSES.map((status) => {
            const count = jobs.filter((j) => j.status === status).length;
            const pct = jobs.length > 0 ? (count / jobs.length) * 100 : 0;
            return (
              <div
                key={status}
                style={{
                  ...styles.distSegment,
                  width: `${Math.max(pct, 2)}%`,
                  background: JOB_STATUS_COLORS[status],
                  opacity: count > 0 ? 1 : 0.2,
                }}
                title={`${JOB_STATUS_LABELS[status]}: ${count} (${pct.toFixed(0)}%)`}
                data-testid={`dist-${status}`}
              />
            );
          })}
        </div>
        <div style={styles.distLabels}>
          {JOB_STATUSES.filter((s) => jobs.some((j) => j.status === s)).map((status) => (
            <span key={status} style={styles.distLabel}>
              <span style={{ ...styles.distDot, background: JOB_STATUS_COLORS[status] }} />
              {JOB_STATUS_LABELS[status]} ({jobs.filter((j) => j.status === status).length})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function SummaryCard({
  label,
  value,
  color,
  subtitle,
}: {
  label: string;
  value: number | string;
  color: string;
  subtitle?: string;
}): React.ReactElement {
  return (
    <div style={{ ...styles.summaryCard, borderTopColor: color }}>
      <div style={styles.summaryValue}>{value}</div>
      <div style={styles.summaryLabel}>{label}</div>
      {subtitle && <div style={styles.summarySubtitle}>{subtitle}</div>}
    </div>
  );
}

// ============================================================================
// Constants
// ============================================================================

const SEVERITY_COLORS = { warning: '#f59e0b', critical: '#f97316', severe: '#ef4444' };
const SEVERITY_LABELS = { warning: 'เตือน', critical: 'วิกฤต', severe: 'รุนแรง' };

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '24px', fontFamily: 'Inter, system-ui, sans-serif', color: '#f3f4f6' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' },
  summaryCard: { background: '#111827', borderRadius: '8px', padding: '16px', borderTop: '3px solid', textAlign: 'center' as const },
  summaryValue: { fontSize: '28px', fontWeight: 700, marginBottom: '4px' },
  summaryLabel: { fontSize: '12px', color: '#9ca3af' },
  summarySubtitle: { fontSize: '10px', color: '#6b7280', marginTop: '2px' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' },
  card: { background: '#111827', borderRadius: '8px', padding: '16px', border: '1px solid #1f2937' },
  cardTitle: { margin: '0 0 16px 0', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' },
  barChart: { display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  barRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  barLabel: { fontSize: '11px', color: '#9ca3af', width: '60px', textAlign: 'right' as const },
  barTrack: { flex: 1, height: '18px', background: '#1f2937', borderRadius: '4px', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: '4px', transition: 'width 0.3s ease' },
  barValue: { fontSize: '11px', color: '#d1d5db', width: '60px' },
  sparkline: { display: 'flex', gap: '4px', alignItems: 'flex-end', height: '80px', paddingBottom: '20px', position: 'relative' as const },
  sparkCol: { flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '4px' },
  sparkBars: { display: 'flex', gap: '2px', alignItems: 'flex-end', height: '60px' },
  sparkBar: { width: '8px', borderRadius: '2px', minHeight: '2px' },
  sparkLabel: { fontSize: '8px', color: '#6b7280' },
  legend: { display: 'flex', gap: '16px', marginTop: '12px', justifyContent: 'center' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#9ca3af' },
  legendDot: { width: '8px', height: '8px', borderRadius: '2px' },
  alertBadge: { background: '#7f1d1d', color: '#fca5a5', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 },
  alertList: { display: 'flex', flexDirection: 'column' as const, gap: '6px', maxHeight: '300px', overflowY: 'auto' as const },
  alertRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#0d1117', borderRadius: '6px', borderLeft: '3px solid', cursor: 'pointer' },
  alertLeft: { display: 'flex', alignItems: 'center', gap: '8px' },
  alertRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  severityBadge: { padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700 },
  alertCode: { fontSize: '11px', fontFamily: 'monospace', color: '#6b7280' },
  alertTitle: { fontSize: '12px', color: '#d1d5db' },
  alertCustomer: { fontSize: '11px', color: '#9ca3af' },
  alertDays: { fontSize: '12px', fontWeight: 700, color: '#fca5a5' },
  emptyAlerts: { textAlign: 'center' as const, padding: '24px', color: '#4ade80', fontSize: '13px' },
  distRow: { display: 'flex', borderRadius: '6px', overflow: 'hidden', height: '24px', marginBottom: '12px' },
  distSegment: { height: '100%', transition: 'width 0.3s ease' },
  distLabels: { display: 'flex', flexWrap: 'wrap' as const, gap: '8px' },
  distLabel: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#9ca3af' },
  distDot: { width: '8px', height: '8px', borderRadius: '2px' },
};

export default JobAnalyticsDashboard;
