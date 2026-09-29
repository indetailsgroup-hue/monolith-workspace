/**
 * JobBoard.tsx — Kanban + List view for job lifecycle tracking
 *
 * Features:
 * - Toggle between Kanban (grouped by status) and List view
 * - Status transition buttons on each job card
 * - Priority badges, deadline indicators
 * - Filter by status, priority, search
 * - Link to create new job
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useJobStore } from './jobStore';
import {
  type Job,
  type JobStatus,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  getNextStatuses,
} from './types';
import { BatchActionBar } from './BatchStatusUpdate';

// ============================================================================
// Props
// ============================================================================

export interface JobBoardProps {
  /** Open create job wizard */
  onCreateJob?: () => void;
  /** Open job detail */
  onSelectJob?: (jobId: string) => void;
  /** View mode override */
  defaultView?: 'kanban' | 'list';
}

// ============================================================================
// Component
// ============================================================================

export function JobBoard({
  onCreateJob,
  onSelectJob,
  defaultView = 'kanban',
}: JobBoardProps): React.ReactElement {
  const jobs = useJobStore((s) => s.jobs);
  const transitionStatus = useJobStore((s) => s.transitionStatus);
  const [view, setView] = useState<'kanban' | 'list'>(defaultView);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<JobStatus | 'ALL'>('ALL');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');

  // Multi-select state for batch operations
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);

  const toggleJobSelection = useCallback((jobId: string) => {
    setSelectedJobIds((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId],
    );
  }, []);

  const clearSelection = useCallback(() => setSelectedJobIds([]), []);

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    let result = [...jobs];
    if (filterStatus !== 'ALL') {
      result = result.filter((j) => j.status === filterStatus);
    }
    if (filterPriority !== 'ALL') {
      result = result.filter((j) => j.priority === filterPriority);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.jobCode.toLowerCase().includes(q) ||
          j.customer.name.toLowerCase().includes(q),
      );
    }
    return result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [jobs, filterStatus, filterPriority, search]);

  const toggleSelectAll = useCallback(() => {
    if (selectedJobIds.length === filteredJobs.length) {
      setSelectedJobIds([]);
    } else {
      setSelectedJobIds(filteredJobs.map((j) => j.jobId));
    }
  }, [selectedJobIds.length, filteredJobs]);

  // Group by status for kanban
  const grouped = useMemo(() => {
    const map: Record<JobStatus, Job[]> = {} as any;
    for (const s of JOB_STATUSES) map[s] = [];
    for (const j of filteredJobs) map[j.status].push(j);
    return map;
  }, [filteredJobs]);

  const handleTransition = useCallback(
    (jobId: string, newStatus: JobStatus) => {
      transitionStatus(jobId, newStatus);
    },
    [transitionStatus],
  );

  return (
    <div style={styles.container} data-testid="job-board">
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Job Board</h2>
        <div style={styles.controls}>
          {/* Search */}
          <input
            style={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหางาน..."
            data-testid="job-search"
          />
          {/* Filter status */}
          <select
            style={styles.select}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as JobStatus | 'ALL')}
          >
            <option value="ALL">ทุกสถานะ</option>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>
            ))}
          </select>
          {/* View toggle */}
          <button
            style={{ ...styles.viewBtn, background: view === 'kanban' ? '#4ade80' : '#374151' }}
            onClick={() => setView('kanban')}
          >
            Kanban
          </button>
          <button
            style={{ ...styles.viewBtn, background: view === 'list' ? '#4ade80' : '#374151' }}
            onClick={() => setView('list')}
          >
            List
          </button>
          {/* Create */}
          {onCreateJob && (
            <button style={styles.createBtn} onClick={onCreateJob} data-testid="create-job-btn">
              + สร้างงาน
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div style={styles.statsBar}>
        <span style={styles.stat}>ทั้งหมด: {filteredJobs.length}</span>
        <span style={styles.stat}>กำลังผลิต: {grouped.IN_PRODUCTION?.length ?? 0}</span>
        <span style={styles.stat}>รอส่ง: {grouped.DELIVERED?.length ?? 0}</span>
      </div>

      {/* Kanban View */}
      {view === 'kanban' && (
        <div style={styles.kanban} data-testid="kanban-view">
          {JOB_STATUSES.filter((s) => s !== 'CLOSED').map((status) => (
            <div key={status} style={styles.column}>
              <div style={{ ...styles.columnHeader, borderTopColor: JOB_STATUS_COLORS[status] }}>
                <span>{JOB_STATUS_LABELS[status]}</span>
                <span style={styles.count}>{grouped[status].length}</span>
              </div>
              <div style={styles.columnBody}>
                {grouped[status].map((job) => (
                  <JobCard
                    key={job.jobId}
                    job={job}
                    onSelect={onSelectJob}
                    onTransition={handleTransition}
                    selected={selectedJobIds.includes(job.jobId)}
                    onToggleSelect={toggleJobSelection}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div style={styles.list} data-testid="list-view">
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>
                  <input
                    type="checkbox"
                    checked={filteredJobs.length > 0 && selectedJobIds.length === filteredJobs.length}
                    onChange={toggleSelectAll}
                    data-testid="select-all-checkbox"
                  />
                </th>
                <th style={styles.th}>รหัส</th>
                <th style={styles.th}>งาน</th>
                <th style={styles.th}>ลูกค้า</th>
                <th style={styles.th}>สถานะ</th>
                <th style={styles.th}>ระดับ</th>
                <th style={styles.th}>กำหนดส่ง</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => (
                <tr
                  key={job.jobId}
                  style={{ ...styles.tr, background: selectedJobIds.includes(job.jobId) ? '#1e3a5f' : undefined }}
                  onClick={() => onSelectJob?.(job.jobId)}
                  data-testid={`job-row-${job.jobCode}`}
                >
                  <td style={styles.td}>
                    <input
                      type="checkbox"
                      checked={selectedJobIds.includes(job.jobId)}
                      onChange={(e) => { e.stopPropagation(); toggleJobSelection(job.jobId); }}
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`select-job-${job.jobCode}`}
                    />
                  </td>
                  <td style={styles.td}>{job.jobCode}</td>
                  <td style={styles.td}>{job.title}</td>
                  <td style={styles.td}>{job.customer.name}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, background: JOB_STATUS_COLORS[job.status] + '30', color: JOB_STATUS_COLORS[job.status] }}>
                      {JOB_STATUS_LABELS[job.status]}
                    </span>
                  </td>
                  <td style={styles.td}>{job.priority}</td>
                  <td style={styles.td}>{job.deadline ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredJobs.length === 0 && (
        <div style={styles.empty}>
          ไม่พบงาน {search && `ที่ตรงกับ "${search}"`}
        </div>
      )}

      {/* Batch action bar — visible when jobs are selected */}
      <BatchActionBar
        selectedJobIds={selectedJobIds}
        onClearSelection={clearSelection}
      />
    </div>
  );
}

// ============================================================================
// JobCard Sub-component
// ============================================================================

function JobCard({
  job,
  onSelect,
  onTransition,
  selected,
  onToggleSelect,
}: {
  job: Job;
  onSelect?: (id: string) => void;
  onTransition: (id: string, status: JobStatus) => void;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}): React.ReactElement {
  const nextStatuses = getNextStatuses(job.status);
  const isOverdue = job.deadline && new Date(job.deadline) < new Date();

  return (
    <div
      style={{ ...styles.card, borderLeftColor: JOB_STATUS_COLORS[job.status], background: selected ? '#1e3a5f' : '#111827' }}
      onClick={() => onSelect?.(job.jobId)}
      data-testid={`job-card-${job.jobCode}`}
    >
      <div style={styles.cardHeader}>
        <input
          type="checkbox"
          checked={!!selected}
          onChange={(e) => { e.stopPropagation(); onToggleSelect?.(job.jobId); }}
          onClick={(e) => e.stopPropagation()}
          data-testid={`select-card-${job.jobCode}`}
          style={{ marginRight: '6px' }}
        />
        <span style={styles.cardCode}>{job.jobCode}</span>
        {job.priority === 'URGENT' && <span style={styles.urgentBadge}>URGENT</span>}
        {job.priority === 'HIGH' && <span style={styles.highBadge}>HIGH</span>}
      </div>
      <div style={styles.cardTitle}>{job.title}</div>
      <div style={styles.cardCustomer}>{job.customer.name}</div>
      {job.deadline && (
        <div style={{ ...styles.cardDeadline, color: isOverdue ? '#ef4444' : '#6b7280' }}>
          📅 {job.deadline} {isOverdue && '(เลยกำหนด!)'}
        </div>
      )}
      <div style={styles.cardMeta}>
        {job.totalPanelCount} ชิ้น • {job.materialGroup}
      </div>
      {/* Transition buttons */}
      {nextStatuses.length > 0 && (
        <div style={styles.cardActions}>
          {nextStatuses.map((ns) => (
            <button
              key={ns}
              style={styles.transBtn}
              onClick={(e) => {
                e.stopPropagation();
                onTransition(job.jobId, ns);
              }}
              data-testid={`transition-${job.jobCode}-${ns}`}
            >
              → {JOB_STATUS_LABELS[ns]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '24px', fontFamily: 'Inter, system-ui, sans-serif', color: '#f3f4f6' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' },
  title: { margin: 0, fontSize: '20px', fontWeight: 700 },
  controls: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  searchInput: { padding: '8px 12px', borderRadius: '6px', border: '1px solid #374151', background: '#1f2937', color: '#f3f4f6', fontSize: '13px', width: '180px' },
  select: { padding: '8px 10px', borderRadius: '6px', border: '1px solid #374151', background: '#1f2937', color: '#f3f4f6', fontSize: '12px' },
  viewBtn: { padding: '6px 12px', borderRadius: '6px', border: 'none', color: '#000', fontSize: '11px', fontWeight: 600, cursor: 'pointer' },
  createBtn: { padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#4ade80', color: '#000', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  statsBar: { display: 'flex', gap: '16px', marginBottom: '16px', padding: '8px 0', borderBottom: '1px solid #1f2937' },
  stat: { fontSize: '12px', color: '#9ca3af' },
  kanban: { display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '16px' },
  column: { minWidth: '220px', flex: '1 0 220px', background: '#0d1117', borderRadius: '8px', border: '1px solid #1f2937' },
  columnHeader: { padding: '12px', borderTop: '3px solid', fontSize: '13px', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  columnBody: { padding: '8px', display: 'flex', flexDirection: 'column' as const, gap: '8px', maxHeight: '500px', overflowY: 'auto' },
  count: { background: '#374151', borderRadius: '10px', padding: '2px 8px', fontSize: '11px', color: '#9ca3af' },
  card: { background: '#111827', borderRadius: '8px', padding: '12px', border: '1px solid #1f2937', borderLeft: '3px solid', cursor: 'pointer', transition: 'background 0.2s' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  cardCode: { fontSize: '10px', color: '#6b7280', fontFamily: 'monospace' },
  cardTitle: { fontSize: '13px', fontWeight: 600, color: '#e5e7eb', marginBottom: '2px' },
  cardCustomer: { fontSize: '11px', color: '#9ca3af', marginBottom: '4px' },
  cardDeadline: { fontSize: '11px', marginBottom: '4px' },
  cardMeta: { fontSize: '10px', color: '#6b7280' },
  cardActions: { display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' },
  transBtn: { padding: '3px 8px', borderRadius: '4px', border: '1px solid #374151', background: 'none', color: '#4ade80', fontSize: '10px', cursor: 'pointer' },
  urgentBadge: { fontSize: '9px', fontWeight: 700, color: '#ef4444', background: '#7f1d1d', padding: '2px 6px', borderRadius: '4px' },
  highBadge: { fontSize: '9px', fontWeight: 700, color: '#f59e0b', background: '#78350f', padding: '2px 6px', borderRadius: '4px' },
  list: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  th: { textAlign: 'left' as const, padding: '10px 12px', borderBottom: '1px solid #374151', color: '#9ca3af', fontSize: '11px', textTransform: 'uppercase' as const },
  tr: { cursor: 'pointer', borderBottom: '1px solid #1f2937' },
  td: { padding: '10px 12px' },
  badge: { padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 },
  empty: { textAlign: 'center' as const, padding: '48px', color: '#6b7280', fontSize: '14px' },
};

export default JobBoard;
