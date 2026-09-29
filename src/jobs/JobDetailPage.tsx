/**
 * jobs/JobDetailPage.tsx — Job Detail with real-time status timeline and panel list
 *
 * Features:
 * - Real-time status updates via Supabase subscription on single job
 * - Visual status timeline showing progression through lifecycle
 * - Panel list with material/dimension info
 * - Status transition buttons (role-gated)
 * - Print-friendly CSS for site supervisors (A4)
 * - PDF export (browser print / programmatic jsPDF)
 * - Link to quotation/invoice when available
 *
 * @version 15.3.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  type Job,
  type JobStatus,
  type JobPanel,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  JOB_TRANSITIONS,
  canTransition,
  isTerminal,
} from './types';
import { useJobStore } from './jobStore';
import { useJobDetailPdf } from './useJobDetailPdf';
import './JobDetailPrint.css';

// ============================================================================
// Props & Types
// ============================================================================

export interface JobDetailPageProps {
  /** Job ID from route params */
  jobId: string;
  /** Current user role for gating transitions */
  userRole?: 'DESIGNER' | 'FACTORY' | 'INSTALLER' | 'FINANCE' | 'ADMIN';
  /** Navigate callback */
  onNavigate?: (path: string) => void;
}

interface StatusTimelineEntry {
  status: JobStatus;
  label: string;
  color: string;
  reached: boolean;
  current: boolean;
  timestamp?: string;
}

// ============================================================================
// Status Timeline Component
// ============================================================================

function StatusTimeline({ job }: { job: Job }): React.ReactElement {
  const currentIdx = JOB_STATUSES.indexOf(job.status);

  const entries: StatusTimelineEntry[] = JOB_STATUSES.map((status, idx) => ({
    status,
    label: JOB_STATUS_LABELS[status],
    color: JOB_STATUS_COLORS[status],
    reached: idx <= currentIdx,
    current: idx === currentIdx,
    timestamp: idx === currentIdx ? job.updatedAt : undefined,
  }));

  return (
    <div style={styles.timeline} data-testid="status-timeline">
      {entries.map((entry, idx) => (
        <div key={entry.status} style={styles.timelineItem}>
          {/* Connector line */}
          {idx > 0 && (
            <div
              style={{
                ...styles.timelineConnector,
                background: entry.reached ? entry.color : '#374151',
              }}
            />
          )}
          {/* Dot */}
          <div
            style={{
              ...styles.timelineDot,
              background: entry.reached ? entry.color : '#374151',
              border: entry.current ? `2px solid ${entry.color}` : '2px solid transparent',
              boxShadow: entry.current ? `0 0 8px ${entry.color}60` : 'none',
              transform: entry.current ? 'scale(1.3)' : 'scale(1)',
            }}
            data-testid={`timeline-dot-${entry.status}`}
          >
            {entry.reached && !entry.current && (
              <span style={{ fontSize: '8px', color: '#000' }}>✓</span>
            )}
          </div>
          {/* Label */}
          <span
            style={{
              ...styles.timelineLabel,
              color: entry.reached ? '#f3f4f6' : '#6b7280',
              fontWeight: entry.current ? 700 : 400,
            }}
          >
            {entry.label}
          </span>
          {/* Timestamp for current */}
          {entry.current && entry.timestamp && (
            <span style={styles.timelineTimestamp}>
              {new Date(entry.timestamp).toLocaleString('th-TH', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Panel List Component
// ============================================================================

function PanelList({ panels }: { panels: JobPanel[] }): React.ReactElement {
  if (panels.length === 0) {
    return (
      <div style={styles.emptyState} data-testid="panel-list-empty">
        ยังไม่มีรายการแผ่นงาน
      </div>
    );
  }

  const totalQty = panels.reduce((sum, p) => sum + p.qty, 0);
  const totalArea = panels.reduce((sum, p) => sum + (p.width * p.height * p.qty) / 1_000_000, 0);

  return (
    <div data-testid="panel-list">
      {/* Summary bar */}
      <div style={styles.panelSummary}>
        <span>{panels.length} รายการ</span>
        <span>{totalQty} ชิ้น</span>
        <span>{totalArea.toFixed(2)} m²</span>
      </div>

      {/* Panel table */}
      <table style={styles.panelTable}>
        <thead>
          <tr>
            <th style={styles.th}>#</th>
            <th style={styles.th}>ชื่อ</th>
            <th style={styles.th}>วัสดุ</th>
            <th style={styles.th}>ขนาด (mm)</th>
            <th style={styles.th}>จำนวน</th>
            <th style={styles.th}>ประเภท</th>
          </tr>
        </thead>
        <tbody>
          {panels.map((panel, idx) => (
            <tr key={panel.panelId} style={styles.panelRow} data-testid={`panel-row-${idx}`}>
              <td style={styles.td}>{idx + 1}</td>
              <td style={{ ...styles.td, fontWeight: 500, color: '#e5e7eb' }}>{panel.name}</td>
              <td style={styles.td}>{panel.material}</td>
              <td style={styles.td}>
                {panel.width} × {panel.height}
                {panel.isCurved && panel.arcRadius && ` R${panel.arcRadius}`}
              </td>
              <td style={{ ...styles.td, textAlign: 'center' }}>{panel.qty}</td>
              <td style={styles.td}>
                {panel.isCurved ? (
                  <span style={styles.curvedBadge}>🔄 Curved</span>
                ) : (
                  <span style={styles.flatBadge}>▬ Flat</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Export Toolbar
// ============================================================================

function ExportToolbar({
  job,
  pdf,
}: {
  job: Job;
  pdf: ReturnType<typeof useJobDetailPdf>;
}): React.ReactElement {
  return (
    <div style={styles.exportBar} data-testid="export-toolbar" data-print="hide">
      <span style={{ fontSize: '12px', color: '#9ca3af' }}>ส่งออก:</span>
      <button
        style={styles.exportBtn}
        onClick={pdf.printJobDetail}
        data-testid="btn-print"
        title="พิมพ์ใบสั่งงาน (Print)"
      >
        🖨️ พิมพ์
      </button>
      <button
        style={{ ...styles.exportBtn, background: '#1e40af' }}
        onClick={() => pdf.exportPdf(job)}
        disabled={pdf.isExporting}
        data-testid="btn-export-pdf"
        title="ส่งออก PDF"
      >
        {pdf.isExporting ? '⏳ กำลังสร้าง...' : '📄 PDF'}
      </button>
      {pdf.error && (
        <span style={{ fontSize: '11px', color: '#fca5a5' }} data-testid="export-error">
          {pdf.error}
        </span>
      )}
      {pdf.lastExportedAt && (
        <span style={{ fontSize: '10px', color: '#6b7280' }} data-testid="export-success">
          ✓ ส่งออกแล้ว
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Transition Actions
// ============================================================================

/** Role-based permission matrix for transitions */
const TRANSITION_PERMISSIONS: Record<string, JobStatus[]> = {
  DESIGNER: ['QUOTED'],
  FACTORY: ['IN_PRODUCTION', 'QC', 'DELIVERED'],
  FINANCE: ['INVOICED', 'CLOSED'],
  ADMIN: JOB_STATUSES, // ADMIN can do all
};

function TransitionActions({
  job,
  userRole,
  onTransition,
}: {
  job: Job;
  userRole: string;
  onTransition: (newStatus: JobStatus) => void;
}): React.ReactElement | null {
  if (isTerminal(job.status)) return null;

  const allowedByRole = TRANSITION_PERMISSIONS[userRole] ?? [];
  const possibleNext = JOB_TRANSITIONS[job.status];
  const available = possibleNext.filter(
    (s) => userRole === 'ADMIN' || allowedByRole.includes(s),
  );

  if (available.length === 0) return null;

  return (
    <div style={styles.transitionBar} data-testid="transition-actions">
      <span style={{ fontSize: '12px', color: '#9ca3af' }}>เปลี่ยนสถานะ:</span>
      {available.map((nextStatus) => (
        <button
          key={nextStatus}
          style={{
            ...styles.transitionBtn,
            background: JOB_STATUS_COLORS[nextStatus],
          }}
          onClick={() => onTransition(nextStatus)}
          data-testid={`transition-to-${nextStatus}`}
        >
          → {JOB_STATUS_LABELS[nextStatus]}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function JobDetailPage({
  jobId,
  userRole = 'DESIGNER',
  onNavigate,
}: JobDetailPageProps): React.ReactElement {
  const getJob = useJobStore((s) => s.getJob);
  const transitionStatus = useJobStore((s) => s.transitionStatus);
  const [job, setJob] = useState<Job | undefined>(() => getJob(jobId));
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'polling' | 'disconnected'>('polling');
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // ── PDF / Print hook ────────────────────────────────────────────────────
  const pdf = useJobDetailPdf();

  // ── Real-time Subscription for this single job ──────────────────────────

  useEffect(() => {
    let channel: any = null;
    let mounted = true;

    async function subscribeToJob() {
      const url = typeof import.meta !== 'undefined'
        ? (import.meta as any).env?.VITE_SUPABASE_URL
        : undefined;
      const anonKey = typeof import.meta !== 'undefined'
        ? (import.meta as any).env?.VITE_SUPABASE_ANON_KEY
        : undefined;

      if (!url || !anonKey) {
        setRealtimeStatus('polling');
        return;
      }

      try {
        const { createClient } = await import('@supabase/supabase-js');
        const client = createClient(url, anonKey);

        channel = client
          .channel(`job-detail-${jobId}`)
          .on(
            'postgres_changes' as any,
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'job',
              filter: `job_id=eq.${jobId}`,
            },
            (payload: any) => {
              if (!mounted) return;
              const record = payload.new;
              if (record) {
                setJob((prev) =>
                  prev
                    ? {
                        ...prev,
                        status: record.status?.toUpperCase() as JobStatus,
                        updatedAt: record.updated_at ?? new Date().toISOString(),
                        priority: record.priority?.toUpperCase() ?? prev.priority,
                        title: record.title ?? prev.title,
                        notes: record.notes ?? prev.notes,
                      }
                    : prev,
                );
              }
            },
          )
          .subscribe((subStatus: string) => {
            if (!mounted) return;
            if (subStatus === 'SUBSCRIBED') {
              setRealtimeStatus('connected');
            }
          });
      } catch {
        if (mounted) setRealtimeStatus('polling');
      }
    }

    subscribeToJob();

    return () => {
      mounted = false;
      channel?.unsubscribe?.();
    };
  }, [jobId]);

  // ── Sync local store changes ────────────────────────────────────────────

  useEffect(() => {
    const updated = getJob(jobId);
    if (updated) setJob(updated);
  }, [jobId, getJob]);

  // Subscribe to store updates
  useEffect(() => {
    const unsub = useJobStore.subscribe((state) => {
      const updated = state.jobs.find((j) => j.jobId === jobId);
      if (updated) setJob(updated);
    });
    return unsub;
  }, [jobId]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleTransition = useCallback(
    (newStatus: JobStatus) => {
      setTransitionError(null);
      const result = transitionStatus(jobId, newStatus);
      if (!result.success) {
        setTransitionError(result.error ?? 'Transition failed');
      }
    },
    [jobId, transitionStatus],
  );

  // ── Loading / Not Found ─────────────────────────────────────────────────

  if (!job) {
    return (
      <div style={styles.container} data-testid="job-detail-not-found">
        <div style={styles.notFound}>
          <h2 style={{ color: '#f3f4f6', margin: 0 }}>ไม่พบงาน</h2>
          <p style={{ color: '#9ca3af', marginTop: '8px' }}>
            ไม่พบงานหมายเลข {jobId}
          </p>
          {onNavigate && (
            <button style={styles.backToBoard} onClick={() => onNavigate('/jobs')}>
              ← กลับไป Job Board
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={styles.container} data-testid="job-detail-page">
      {/* Header */}
      <div style={styles.header}>
        <div style={{ flex: 1 }}>
          <div style={styles.codeRow}>
            <span style={styles.jobCode}>{job.jobCode}</span>
            <span
              style={{
                ...styles.statusBadge,
                background: `${JOB_STATUS_COLORS[job.status]}20`,
                color: JOB_STATUS_COLORS[job.status],
                borderColor: JOB_STATUS_COLORS[job.status],
              }}
            >
              {JOB_STATUS_LABELS[job.status]}
            </span>
            <span
              style={{
                ...styles.priorityBadge,
                background: job.priority === 'URGENT' ? '#dc262620' : job.priority === 'HIGH' ? '#f59e0b20' : '#37415120',
                color: job.priority === 'URGENT' ? '#ef4444' : job.priority === 'HIGH' ? '#f59e0b' : '#9ca3af',
              }}
            >
              {job.priority}
            </span>
          </div>
          <h1 style={styles.title}>{job.title}</h1>
          <div style={styles.meta}>
            <span>ลูกค้า: <strong>{job.customer.name}</strong></span>
            {job.customer.phone && <span>| {job.customer.phone}</span>}
            {job.deadline && <span>| กำหนดส่ง: {job.deadline}</span>}
          </div>
        </div>
        {/* Connection indicator */}
        <div style={styles.realtimeIndicator} data-testid="realtime-status">
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: realtimeStatus === 'connected' ? '#4ade80' : realtimeStatus === 'polling' ? '#f59e0b' : '#ef4444',
            }}
          />
          <span style={{ fontSize: '10px', color: '#6b7280' }}>
            {realtimeStatus === 'connected' ? 'Live' : realtimeStatus === 'polling' ? 'Polling' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Export Toolbar (hidden in print) */}
      <ExportToolbar job={job} pdf={pdf} />

      {/* Transition Error */}
      {transitionError && (
        <div style={styles.errorBanner} role="alert" data-testid="transition-error">
          {transitionError}
        </div>
      )}

      {/* Transition Actions */}
      <TransitionActions job={job} userRole={userRole} onTransition={handleTransition} />

      {/* Status Timeline */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>สถานะงาน</h3>
        <StatusTimeline job={job} />
      </div>

      {/* Panel List */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>
          รายการแผ่นงาน
          <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: '8px' }}>
            ({job.panels.length} รายการ, {job.totalPanelCount} ชิ้น)
          </span>
        </h3>
        <PanelList panels={job.panels} />
      </div>

      {/* Job Info Card */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>รายละเอียด</h3>
        <div style={styles.infoGrid}>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>วัสดุหลัก</span>
            <span style={styles.infoValue}>{job.materialGroup}</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>สร้างเมื่อ</span>
            <span style={styles.infoValue}>
              {new Date(job.createdAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>อัปเดตล่าสุด</span>
            <span style={styles.infoValue}>
              {new Date(job.updatedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
          {job.quotationId && (
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>ใบเสนอราคา</span>
              <span style={{ ...styles.infoValue, color: '#8b5cf6', cursor: 'pointer' }}
                onClick={() => onNavigate?.(`/quotations?id=${job.quotationId}`)}
              >
                🔗 {job.quotationId.slice(0, 8)}...
              </span>
            </div>
          )}
          {job.invoiceId && (
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>ใบแจ้งหนี้</span>
              <span style={{ ...styles.infoValue, color: '#ec4899' }}>
                🧾 {job.invoiceId.slice(0, 8)}...
              </span>
            </div>
          )}
          {job.notes && (
            <div style={{ ...styles.infoItem, gridColumn: '1 / -1' }}>
              <span style={styles.infoLabel}>หมายเหตุ</span>
              <span style={styles.infoValue}>{job.notes}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '24px',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: '#d1d5db',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '20px',
  },
  codeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '4px',
  },
  jobCode: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '13px',
    color: '#6b7280',
    background: '#1f2937',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '10px',
    border: '1px solid',
  },
  priorityBadge: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase' as const,
  },
  title: {
    margin: '0 0 6px',
    fontSize: '22px',
    fontWeight: 700,
    color: '#f3f4f6',
  },
  meta: {
    fontSize: '13px',
    color: '#9ca3af',
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  realtimeIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    borderRadius: '12px',
    background: '#1f2937',
  },
  // Export toolbar
  exportBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    background: '#1f2937',
    borderRadius: '8px',
    marginBottom: '12px',
    border: '1px solid #374151',
  },
  exportBtn: {
    padding: '6px 14px',
    borderRadius: '6px',
    border: 'none',
    background: '#374151',
    color: '#e5e7eb',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  section: {
    background: '#111827',
    borderRadius: '12px',
    padding: '20px',
    border: '1px solid #1f2937',
    marginBottom: '16px',
  },
  sectionTitle: {
    margin: '0 0 16px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#f3f4f6',
  },
  // Timeline
  timeline: {
    display: 'flex',
    alignItems: 'center',
    gap: '0',
    overflowX: 'auto' as const,
    padding: '8px 0',
  },
  timelineItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '6px',
    position: 'relative' as const,
    minWidth: '80px',
  },
  timelineConnector: {
    position: 'absolute' as const,
    top: '10px',
    left: '-40px',
    width: '40px',
    height: '3px',
    borderRadius: '2px',
  },
  timelineDot: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
  },
  timelineLabel: {
    fontSize: '10px',
    textAlign: 'center' as const,
    whiteSpace: 'nowrap' as const,
  },
  timelineTimestamp: {
    fontSize: '9px',
    color: '#6b7280',
    textAlign: 'center' as const,
  },
  // Panel List
  emptyState: {
    textAlign: 'center' as const,
    padding: '24px',
    color: '#6b7280',
    fontSize: '13px',
  },
  panelSummary: {
    display: 'flex',
    gap: '16px',
    fontSize: '12px',
    color: '#9ca3af',
    marginBottom: '12px',
    padding: '8px 12px',
    background: '#1f2937',
    borderRadius: '6px',
  },
  panelTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '12px',
  },
  th: {
    textAlign: 'left' as const,
    padding: '8px 10px',
    color: '#6b7280',
    fontWeight: 600,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    borderBottom: '1px solid #374151',
  },
  td: {
    padding: '8px 10px',
    color: '#9ca3af',
    borderBottom: '1px solid #1f2937',
  },
  panelRow: {
    transition: 'background 0.15s',
  },
  curvedBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: '#0d9488',
    color: '#ccfbf1',
  },
  flatBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: '#374151',
    color: '#9ca3af',
  },
  // Transition bar
  transitionBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    background: '#1f2937',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  transitionBtn: {
    padding: '6px 14px',
    borderRadius: '6px',
    border: 'none',
    color: '#000',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  // Info grid
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  infoLabel: {
    fontSize: '11px',
    color: '#6b7280',
    textTransform: 'uppercase' as const,
  },
  infoValue: {
    fontSize: '13px',
    color: '#e5e7eb',
    fontWeight: 500,
  },
  // Error
  errorBanner: {
    background: '#7f1d1d',
    border: '1px solid #991b1b',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#fca5a5',
    fontSize: '13px',
    marginBottom: '12px',
  },
  // Not found
  notFound: {
    textAlign: 'center' as const,
    padding: '48px',
  },
  backToBoard: {
    marginTop: '16px',
    padding: '10px 20px',
    borderRadius: '6px',
    border: '1px solid #374151',
    background: 'none',
    color: '#d1d5db',
    fontSize: '13px',
    cursor: 'pointer',
  },
};

export default JobDetailPage;
