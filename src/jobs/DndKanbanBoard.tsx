/**
 * jobs/DndKanbanBoard.tsx — Drag-and-drop Kanban using @dnd-kit
 *
 * Wraps the existing Kanban columns with drop zones.
 * Dragging a job card to a different status column triggers transitionStatus.
 * Invalid transitions show a visual rejection (red flash).
 *
 * @version 15.5.0
 */

import React, { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useJobStore } from './jobStore';
import {
  type Job,
  type JobStatus,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  canTransition,
  getNextStatuses,
} from './types';

// ============================================================================
// Types
// ============================================================================

export interface DndKanbanBoardProps {
  /** Open job detail */
  onSelectJob?: (jobId: string) => void;
  /** Callback on successful transition */
  onTransitionComplete?: (jobId: string, from: JobStatus, to: JobStatus) => void;
}

interface DragState {
  activeJobId: string | null;
  activeJob: Job | null;
  overColumn: JobStatus | null;
  isValid: boolean;
}

// ============================================================================
// Droppable Column
// ============================================================================

function KanbanColumn({
  status,
  jobs,
  isOver,
  isValidDrop,
  isDragging,
  onSelectJob,
}: {
  status: JobStatus;
  jobs: Job[];
  isOver: boolean;
  isValidDrop: boolean;
  isDragging: boolean;
  onSelectJob?: (jobId: string) => void;
}): React.ReactElement {
  const borderColor = isOver
    ? isValidDrop
      ? '#4ade80'
      : '#ef4444'
    : JOB_STATUS_COLORS[status];

  return (
    <div
      style={{
        ...colStyles.column,
        borderTopColor: borderColor,
        background: isOver ? (isValidDrop ? '#064e3b20' : '#7f1d1d20') : '#0d1117',
        transition: 'background 0.2s, border-color 0.2s',
      }}
      data-testid={`kanban-col-${status}`}
      data-status={status}
    >
      <div style={colStyles.header}>
        <span style={colStyles.headerLabel}>{JOB_STATUS_LABELS[status]}</span>
        <span style={colStyles.count}>{jobs.length}</span>
      </div>
      <div style={colStyles.body}>
        {jobs.map((job) => (
          <DraggableJobCard key={job.jobId} job={job} onSelect={onSelectJob} isDragging={isDragging} />
        ))}
        {jobs.length === 0 && (
          <div style={colStyles.emptyDrop}>
            {isDragging ? 'วางที่นี่' : '—'}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Draggable Card
// ============================================================================

function DraggableJobCard({
  job,
  onSelect,
  isDragging,
}: {
  job: Job;
  onSelect?: (id: string) => void;
  isDragging: boolean;
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSelf } = useSortable({
    id: job.jobId,
    data: { type: 'job', job },
  });

  const style: React.CSSProperties = {
    ...cardStyles.card,
    borderLeftColor: JOB_STATUS_COLORS[job.status],
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSelf ? 0.4 : 1,
    cursor: 'grab',
  };

  const isOverdue = job.deadline && new Date(job.deadline) < new Date();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-testid={`dnd-card-${job.jobCode}`}
      onDoubleClick={() => onSelect?.(job.jobId)}
    >
      <div style={cardStyles.header}>
        <span style={cardStyles.code}>{job.jobCode}</span>
        {job.priority === 'URGENT' && <span style={cardStyles.urgent}>URGENT</span>}
        {job.priority === 'HIGH' && <span style={cardStyles.high}>HIGH</span>}
      </div>
      <div style={cardStyles.title}>{job.title}</div>
      <div style={cardStyles.customer}>{job.customer.name}</div>
      {job.deadline && (
        <div style={{ fontSize: '10px', color: isOverdue ? '#ef4444' : '#6b7280', marginTop: '2px' }}>
          📅 {job.deadline} {isOverdue && '⚠'}
        </div>
      )}
      <div style={cardStyles.meta}>
        {job.totalPanelCount} ชิ้น • {job.materialGroup}
      </div>
      {/* Valid transitions hint */}
      <div style={cardStyles.transitions}>
        {getNextStatuses(job.status).map((ns) => (
          <span key={ns} style={{ ...cardStyles.transHint, color: JOB_STATUS_COLORS[ns] }}>
            → {JOB_STATUS_LABELS[ns]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Drag Overlay (ghost card while dragging)
// ============================================================================

function DragOverlayCard({ job }: { job: Job }): React.ReactElement {
  return (
    <div
      style={{
        ...cardStyles.card,
        borderLeftColor: JOB_STATUS_COLORS[job.status],
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        transform: 'rotate(2deg)',
        cursor: 'grabbing',
      }}
    >
      <div style={cardStyles.header}>
        <span style={cardStyles.code}>{job.jobCode}</span>
      </div>
      <div style={cardStyles.title}>{job.title}</div>
      <div style={cardStyles.customer}>{job.customer.name}</div>
    </div>
  );
}

// ============================================================================
// Main DndKanbanBoard Component
// ============================================================================

export function DndKanbanBoard({
  onSelectJob,
  onTransitionComplete,
}: DndKanbanBoardProps): React.ReactElement {
  const jobs = useJobStore((s) => s.jobs);
  const transitionStatus = useJobStore((s) => s.transitionStatus);

  const [dragState, setDragState] = useState<DragState>({
    activeJobId: null,
    activeJob: null,
    overColumn: null,
    isValid: false,
  });

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Determine which column a coordinate is over
  const getColumnFromId = (id: string | null): JobStatus | null => {
    if (!id) return null;
    // Check if it's a status column ID
    if (JOB_STATUSES.includes(id as JobStatus)) return id as JobStatus;
    // Otherwise it might be a job ID — find which column it belongs to
    const job = jobs.find((j) => j.jobId === id);
    return job?.status ?? null;
  };

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const jobId = event.active.id as string;
      const job = jobs.find((j) => j.jobId === jobId) ?? null;
      setDragState({ activeJobId: jobId, activeJob: job, overColumn: null, isValid: false });
      setFeedback(null);
    },
    [jobs],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const overId = event.over?.id as string | null;
      if (!overId || !dragState.activeJob) return;

      const targetColumn = getColumnFromId(overId);
      if (!targetColumn || targetColumn === dragState.activeJob.status) {
        setDragState((prev) => ({ ...prev, overColumn: null, isValid: false }));
        return;
      }

      const isValid = canTransition(dragState.activeJob.status, targetColumn);
      setDragState((prev) => ({ ...prev, overColumn: targetColumn, isValid }));
    },
    [dragState.activeJob, jobs],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { activeJob, overColumn, isValid } = dragState;

      if (activeJob && overColumn && overColumn !== activeJob.status) {
        if (isValid) {
          const result = transitionStatus(activeJob.jobId, overColumn);
          if (result.success) {
            setFeedback({ type: 'success', message: `${activeJob.jobCode} → ${JOB_STATUS_LABELS[overColumn]}` });
            onTransitionComplete?.(activeJob.jobId, activeJob.status, overColumn);
          } else {
            setFeedback({ type: 'error', message: result.error ?? 'Transition failed' });
          }
        } else {
          setFeedback({
            type: 'error',
            message: `ไม่สามารถย้าย ${activeJob.jobCode} จาก ${JOB_STATUS_LABELS[activeJob.status]} ไป ${JOB_STATUS_LABELS[overColumn]}`,
          });
        }
      }

      setDragState({ activeJobId: null, activeJob: null, overColumn: null, isValid: false });

      // Clear feedback after 3s
      setTimeout(() => setFeedback(null), 3000);
    },
    [dragState, transitionStatus, onTransitionComplete],
  );

  // Group jobs by status
  const grouped = React.useMemo(() => {
    const map: Record<JobStatus, Job[]> = {} as any;
    for (const s of JOB_STATUSES) map[s] = [];
    for (const j of jobs) map[j.status].push(j);
    return map;
  }, [jobs]);

  return (
    <div data-testid="dnd-kanban-board">
      {/* Feedback toast */}
      {feedback && (
        <div
          style={{
            ...dndStyles.feedback,
            background: feedback.type === 'success' ? '#064e3b' : '#7f1d1d',
            borderColor: feedback.type === 'success' ? '#4ade80' : '#ef4444',
          }}
          data-testid="dnd-feedback"
        >
          {feedback.type === 'success' ? '✓' : '✕'} {feedback.message}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div style={dndStyles.kanban}>
          {JOB_STATUSES.filter((s) => s !== 'CLOSED').map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              jobs={grouped[status]}
              isOver={dragState.overColumn === status}
              isValidDrop={dragState.overColumn === status && dragState.isValid}
              isDragging={!!dragState.activeJobId}
              onSelectJob={onSelectJob}
            />
          ))}
        </div>

        <DragOverlay>
          {dragState.activeJob && <DragOverlayCard job={dragState.activeJob} />}
        </DragOverlay>
      </DndContext>

      {/* Instructions */}
      <div style={dndStyles.hint}>
        💡 ลากการ์ดไปยังคอลัมน์สถานะถัดไปเพื่อเปลี่ยนสถานะ • ดับเบิ้ลคลิกเพื่อดูรายละเอียด
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const colStyles: Record<string, React.CSSProperties> = {
  column: { minWidth: '200px', flex: '1 0 200px', borderRadius: '8px', border: '1px solid #1f2937', borderTop: '3px solid' },
  header: { padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', fontWeight: 600 },
  headerLabel: { color: '#d1d5db' },
  count: { background: '#374151', borderRadius: '10px', padding: '2px 8px', fontSize: '10px', color: '#9ca3af' },
  body: { padding: '8px', display: 'flex', flexDirection: 'column' as const, gap: '6px', minHeight: '100px' },
  emptyDrop: { textAlign: 'center' as const, padding: '16px', color: '#4b5563', fontSize: '11px', border: '1px dashed #374151', borderRadius: '6px' },
};

const cardStyles: Record<string, React.CSSProperties> = {
  card: { background: '#111827', borderRadius: '8px', padding: '10px', border: '1px solid #1f2937', borderLeft: '3px solid' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' },
  code: { fontSize: '9px', color: '#6b7280', fontFamily: 'monospace' },
  title: { fontSize: '12px', fontWeight: 600, color: '#e5e7eb', marginBottom: '2px' },
  customer: { fontSize: '10px', color: '#9ca3af' },
  meta: { fontSize: '9px', color: '#6b7280', marginTop: '4px' },
  transitions: { display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' as const },
  transHint: { fontSize: '8px', opacity: 0.7 },
  urgent: { fontSize: '8px', fontWeight: 700, color: '#ef4444', background: '#7f1d1d', padding: '1px 4px', borderRadius: '3px' },
  high: { fontSize: '8px', fontWeight: 700, color: '#f59e0b', background: '#78350f', padding: '1px 4px', borderRadius: '3px' },
};

const dndStyles: Record<string, React.CSSProperties> = {
  kanban: { display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '12px' },
  feedback: { position: 'fixed' as const, top: '16px', left: '50%', transform: 'translateX(-50%)', padding: '8px 16px', borderRadius: '8px', border: '1px solid', fontSize: '12px', color: '#f3f4f6', zIndex: 9999, fontWeight: 600 },
  hint: { textAlign: 'center' as const, padding: '12px', color: '#6b7280', fontSize: '11px' },
};

export default DndKanbanBoard;
