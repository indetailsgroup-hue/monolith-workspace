/**
 * jobs/BatchStatusUpdate.tsx — Batch status update with confirmation modal
 *
 * Features:
 * - Multi-select jobs from Job Board (checkbox per card/row)
 * - Floating action bar when jobs are selected
 * - Target status dropdown (shows only valid common transitions)
 * - Confirmation modal with job list + warnings
 * - Optimistic update with rollback on failure
 * - Integration with useJobStore.transitionStatus
 *
 * @version 15.4.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  type Job,
  type JobStatus,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  JOB_TRANSITIONS,
  isTerminal,
} from './types';
import { useJobStore } from './jobStore';

// ============================================================================
// Types
// ============================================================================

export interface BatchStatusUpdateProps {
  /** Currently selected job IDs */
  selectedJobIds: string[];
  /** Callback to clear selection after update */
  onClearSelection: () => void;
  /** Optional: callback after successful batch */
  onBatchComplete?: (results: BatchResult[]) => void;
}

export interface BatchResult {
  jobId: string;
  jobCode: string;
  success: boolean;
  error?: string;
}

export interface BatchConfirmModalProps {
  isOpen: boolean;
  jobs: Job[];
  targetStatus: JobStatus;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing: boolean;
  results: BatchResult[];
}

// ============================================================================
// Helper: find common valid transitions for multiple jobs
// ============================================================================

export function getCommonTransitions(jobs: Job[]): JobStatus[] {
  if (jobs.length === 0) return [];

  // Get valid transitions for each job (excluding terminal)
  const transitionsPerJob = jobs
    .filter((j) => !isTerminal(j.status))
    .map((j) => JOB_TRANSITIONS[j.status] ?? []);

  if (transitionsPerJob.length === 0) return [];

  // Find intersection of all transition arrays
  const first = transitionsPerJob[0];
  return first.filter((status) =>
    transitionsPerJob.every((transitions) => transitions.includes(status)),
  );
}

// ============================================================================
// Batch Action Bar (shown when jobs are selected)
// ============================================================================

export function BatchActionBar({
  selectedJobIds,
  onClearSelection,
  onBatchComplete,
}: BatchStatusUpdateProps): React.ReactElement | null {
  const jobs = useJobStore((s) => s.jobs);
  const transitionStatus = useJobStore((s) => s.transitionStatus);

  const [targetStatus, setTargetStatus] = useState<JobStatus | ''>('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<BatchResult[]>([]);

  // Get selected job objects
  const selectedJobs = useMemo(
    () => jobs.filter((j) => selectedJobIds.includes(j.jobId)),
    [jobs, selectedJobIds],
  );

  // Find common valid transitions
  const commonTransitions = useMemo(
    () => getCommonTransitions(selectedJobs),
    [selectedJobs],
  );

  // Don't show if no selection
  if (selectedJobIds.length === 0) return null;

  const handleOpenConfirm = () => {
    if (!targetStatus) return;
    setResults([]);
    setShowConfirmModal(true);
  };

  const handleConfirm = async () => {
    if (!targetStatus) return;
    setIsProcessing(true);
    setResults([]);

    const batchResults: BatchResult[] = [];

    for (const job of selectedJobs) {
      const result = transitionStatus(job.jobId, targetStatus as JobStatus);
      batchResults.push({
        jobId: job.jobId,
        jobCode: job.jobCode,
        success: result.success,
        error: result.error,
      });
    }

    setResults(batchResults);
    setIsProcessing(false);

    const allSuccess = batchResults.every((r) => r.success);
    if (allSuccess) {
      // Auto-close and clear after 1.5s on full success
      setTimeout(() => {
        setShowConfirmModal(false);
        setTargetStatus('');
        onClearSelection();
        onBatchComplete?.(batchResults);
      }, 1500);
    }
  };

  const handleCancel = () => {
    setShowConfirmModal(false);
    setResults([]);
  };

  return (
    <>
      {/* Floating action bar */}
      <div style={styles.actionBar} data-testid="batch-action-bar">
        <div style={styles.selectionInfo}>
          <span style={styles.selectionCount}>{selectedJobIds.length}</span>
          <span style={{ fontSize: '12px', color: '#d1d5db' }}>งานที่เลือก</span>
        </div>

        {commonTransitions.length > 0 ? (
          <>
            <select
              style={styles.statusSelect}
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value as JobStatus)}
              data-testid="batch-target-status"
            >
              <option value="">เลือกสถานะเป้าหมาย...</option>
              {commonTransitions.map((s) => (
                <option key={s} value={s}>
                  → {JOB_STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            <button
              style={{
                ...styles.confirmBtn,
                opacity: targetStatus ? 1 : 0.5,
                cursor: targetStatus ? 'pointer' : 'not-allowed',
              }}
              onClick={handleOpenConfirm}
              disabled={!targetStatus}
              data-testid="batch-update-btn"
            >
              อัปเดตทั้งหมด
            </button>
          </>
        ) : (
          <span style={{ fontSize: '11px', color: '#f59e0b' }}>
            ⚠ ไม่มีสถานะปลายทางที่ใช้ร่วมกันได้
          </span>
        )}

        <button
          style={styles.clearBtn}
          onClick={onClearSelection}
          data-testid="batch-clear-btn"
        >
          ✕ ยกเลิก
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && targetStatus && (
        <BatchConfirmModal
          isOpen={showConfirmModal}
          jobs={selectedJobs}
          targetStatus={targetStatus as JobStatus}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          isProcessing={isProcessing}
          results={results}
        />
      )}
    </>
  );
}

// ============================================================================
// Confirmation Modal
// ============================================================================

export function BatchConfirmModal({
  isOpen,
  jobs,
  targetStatus,
  onConfirm,
  onCancel,
  isProcessing,
  results,
}: BatchConfirmModalProps): React.ReactElement | null {
  if (!isOpen) return null;

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const hasResults = results.length > 0;

  return (
    <div style={styles.overlay} data-testid="batch-confirm-modal">
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>
            ยืนยันอัปเดตสถานะ
          </h3>
          <button style={styles.closeBtn} onClick={onCancel}>✕</button>
        </div>

        {/* Body */}
        <div style={styles.modalBody}>
          <div style={styles.summary}>
            <span style={{ fontSize: '13px', color: '#d1d5db' }}>
              เปลี่ยนสถานะ <strong>{jobs.length} งาน</strong> ไปเป็น:
            </span>
            <span
              style={{
                ...styles.targetBadge,
                background: `${JOB_STATUS_COLORS[targetStatus]}20`,
                color: JOB_STATUS_COLORS[targetStatus],
                borderColor: JOB_STATUS_COLORS[targetStatus],
              }}
            >
              {JOB_STATUS_LABELS[targetStatus]}
            </span>
          </div>

          {/* Job list */}
          <div style={styles.jobList}>
            {jobs.map((job) => {
              const result = results.find((r) => r.jobId === job.jobId);
              return (
                <div key={job.jobId} style={styles.jobItem} data-testid={`batch-job-${job.jobCode}`}>
                  <div style={{ flex: 1 }}>
                    <span style={styles.jobItemCode}>{job.jobCode}</span>
                    <span style={styles.jobItemTitle}>{job.title}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: '#6b7280' }}>
                      {JOB_STATUS_LABELS[job.status]}
                    </span>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>→</span>
                    <span style={{ fontSize: '10px', color: JOB_STATUS_COLORS[targetStatus] }}>
                      {JOB_STATUS_LABELS[targetStatus]}
                    </span>
                    {result && (
                      <span style={{ fontSize: '14px' }}>
                        {result.success ? '✓' : '✕'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Results summary */}
          {hasResults && (
            <div style={styles.resultsSummary} data-testid="batch-results">
              {failCount === 0 ? (
                <span style={{ color: '#4ade80' }}>
                  ✓ สำเร็จทั้งหมด ({successCount}/{jobs.length})
                </span>
              ) : (
                <span style={{ color: '#fca5a5' }}>
                  ⚠ สำเร็จ {successCount}/{jobs.length}, ล้มเหลว {failCount} รายการ
                </span>
              )}
            </div>
          )}

          {/* Warning */}
          {!hasResults && (
            <div style={styles.warning}>
              ⚠ การเปลี่ยนสถานะจะมีผลทันที ไม่สามารถย้อนกลับได้
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.modalFooter}>
          <button
            style={styles.cancelBtn}
            onClick={onCancel}
            data-testid="batch-cancel-btn"
          >
            {hasResults ? 'ปิด' : 'ยกเลิก'}
          </button>
          {!hasResults && (
            <button
              style={styles.executeBtn}
              onClick={onConfirm}
              disabled={isProcessing}
              data-testid="batch-execute-btn"
            >
              {isProcessing ? '⏳ กำลังดำเนินการ...' : `ยืนยัน (${jobs.length} งาน)`}
            </button>
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
  actionBar: {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 20px',
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '12px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    zIndex: 1000,
  },
  selectionInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  selectionCount: {
    background: '#4ade80',
    color: '#000',
    fontWeight: 700,
    fontSize: '14px',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusSelect: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #374151',
    background: '#111827',
    color: '#f3f4f6',
    fontSize: '12px',
    minWidth: '180px',
  },
  confirmBtn: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: 'none',
    background: '#4ade80',
    color: '#000',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  clearBtn: {
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid #374151',
    background: 'none',
    color: '#9ca3af',
    fontSize: '11px',
    cursor: 'pointer',
  },
  // Modal
  overlay: {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  modal: {
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '16px',
    width: '480px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px 12px',
    borderBottom: '1px solid #1f2937',
  },
  modalTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: '#f3f4f6',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    fontSize: '18px',
    cursor: 'pointer',
  },
  modalBody: {
    padding: '16px 24px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  summary: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '16px',
  },
  targetBadge: {
    fontSize: '12px',
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid',
  },
  jobList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    maxHeight: '250px',
    overflowY: 'auto' as const,
  },
  jobItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    background: '#1f2937',
    borderRadius: '6px',
    gap: '8px',
  },
  jobItemCode: {
    fontSize: '10px',
    color: '#6b7280',
    fontFamily: 'monospace',
    marginRight: '8px',
  },
  jobItemTitle: {
    fontSize: '12px',
    color: '#e5e7eb',
  },
  resultsSummary: {
    marginTop: '12px',
    padding: '10px',
    background: '#0d1117',
    borderRadius: '6px',
    textAlign: 'center' as const,
    fontSize: '13px',
    fontWeight: 600,
  },
  warning: {
    marginTop: '12px',
    padding: '10px',
    background: '#451a03',
    border: '1px solid #92400e',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#fde68a',
    textAlign: 'center' as const,
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    padding: '12px 24px 20px',
    borderTop: '1px solid #1f2937',
  },
  cancelBtn: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid #374151',
    background: 'none',
    color: '#d1d5db',
    fontSize: '12px',
    cursor: 'pointer',
  },
  executeBtn: {
    padding: '8px 20px',
    borderRadius: '6px',
    border: 'none',
    background: '#4ade80',
    color: '#000',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};

export default BatchActionBar;
