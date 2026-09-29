/**
 * v15-4-toast-batch-export.test.tsx — Unit tests for v15.4.0 features
 *
 * Covers:
 * - JobsLayout toast wiring (renders toast container, fires on job events)
 * - BatchStatusUpdate (getCommonTransitions, BatchActionBar, BatchConfirmModal)
 * - JobBoard selection state
 *
 * @version 15.4.0
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

afterEach(() => cleanup());

// ============================================================================
// Mock setup
// ============================================================================

// Mock useJobStore
const mockJobs = [
  {
    jobId: 'j1',
    jobCode: 'JOB-001',
    title: 'ตู้ห้องน้ำ A',
    customer: { name: 'คุณสมชาย', phone: '081', email: 'a@b.com' },
    panels: [],
    status: 'DRAFT' as const,
    priority: 'NORMAL' as const,
    materialGroup: 'HPL',
    totalPanelCount: 10,
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
  },
  {
    jobId: 'j2',
    jobCode: 'JOB-002',
    title: 'ตู้ห้องน้ำ B',
    customer: { name: 'คุณสมหญิง', phone: '082', email: 'b@b.com' },
    panels: [],
    status: 'DRAFT' as const,
    priority: 'HIGH' as const,
    materialGroup: 'HPL',
    totalPanelCount: 5,
    createdAt: '2025-01-02',
    updatedAt: '2025-01-02',
  },
  {
    jobId: 'j3',
    jobCode: 'JOB-003',
    title: 'ตู้ครัว C',
    customer: { name: 'คุณมานี', phone: '083', email: 'c@b.com' },
    panels: [],
    status: 'APPROVED' as const,
    priority: 'NORMAL' as const,
    materialGroup: 'MDF',
    totalPanelCount: 20,
    createdAt: '2025-01-03',
    updatedAt: '2025-01-03',
  },
];

const mockTransitionStatus = vi.fn().mockReturnValue({ success: true });
let mockSubscribeFn: ((state: any, prevState: any) => void) | null = null;

vi.mock('../jobs/jobStore', () => ({
  useJobStore: Object.assign(
    (selector: any) => {
      const state = {
        jobs: mockJobs,
        transitionStatus: mockTransitionStatus,
      };
      return selector(state);
    },
    {
      subscribe: (fn: any) => {
        mockSubscribeFn = fn;
        return () => { mockSubscribeFn = null; };
      },
      getState: () => ({ jobs: mockJobs, transitionStatus: mockTransitionStatus }),
    },
  ),
}));

vi.mock('../core/ui/NotificationToast', () => ({
  NotificationToastContainer: ({ toasts, onDismiss }: any) => (
    <div data-testid="toast-container">
      {toasts?.map((t: any) => (
        <div key={t.id} data-testid={`toast-${t.id}`}>
          {t.message}
          <button onClick={() => onDismiss(t.id)}>dismiss</button>
        </div>
      ))}
    </div>
  ),
  useToast: () => {
    const [toasts, setToasts] = React.useState<any[]>([]);
    return {
      toasts,
      addToast: (t: any) => setToasts((prev: any[]) => [...prev, { ...t, id: Date.now().toString() }]),
      removeToast: (id: string) => setToasts((prev: any[]) => prev.filter((t: any) => t.id !== id)),
    };
  },
}));

vi.mock('../jobs/useJobBoardRealtime', () => ({
  useJobBoardRealtime: () => ({ eventCount: 0, events: [] }),
}));

vi.mock('../jobs/useJobStatusToast', () => ({
  useJobStatusToast: () => ({ handleEvent: vi.fn() }),
}));

// ============================================================================
// Tests: getCommonTransitions
// ============================================================================

describe('getCommonTransitions', () => {
  it('returns common valid transitions for same-status jobs', async () => {
    const { getCommonTransitions } = await import('../jobs/BatchStatusUpdate');
    const jobs = [mockJobs[0], mockJobs[1]]; // both DRAFT
    const result = getCommonTransitions(jobs as any);
    // DRAFT -> QUOTED is the valid transition
    expect(result).toContain('QUOTED');
  });

  it('returns empty for jobs with no common transitions', async () => {
    const { getCommonTransitions } = await import('../jobs/BatchStatusUpdate');
    // DRAFT can go to QUOTED; APPROVED can go to IN_PRODUCTION
    const jobs = [mockJobs[0], mockJobs[2]]; // DRAFT + APPROVED
    const result = getCommonTransitions(jobs as any);
    // No common transitions between DRAFT→QUOTED and APPROVED→IN_PRODUCTION
    expect(result.length).toBe(0);
  });

  it('returns empty for empty job list', async () => {
    const { getCommonTransitions } = await import('../jobs/BatchStatusUpdate');
    const result = getCommonTransitions([]);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// Tests: BatchActionBar
// ============================================================================

describe('BatchActionBar', () => {
  it('does not render when no jobs selected', async () => {
    const { BatchActionBar } = await import('../jobs/BatchStatusUpdate');
    render(<BatchActionBar selectedJobIds={[]} onClearSelection={vi.fn()} />);
    expect(screen.queryByTestId('batch-action-bar')).not.toBeInTheDocument();
  });

  it('renders when jobs are selected with count', async () => {
    const { BatchActionBar } = await import('../jobs/BatchStatusUpdate');
    render(<BatchActionBar selectedJobIds={['j1', 'j2']} onClearSelection={vi.fn()} />);
    const bar = screen.getByTestId('batch-action-bar');
    expect(bar).toBeInTheDocument();
    expect(bar.textContent).toContain('2');
  });

  it('calls onClearSelection when clear button clicked', async () => {
    const { BatchActionBar } = await import('../jobs/BatchStatusUpdate');
    const onClear = vi.fn();
    render(<BatchActionBar selectedJobIds={['j1']} onClearSelection={onClear} />);
    const clearBtn = screen.getByTestId('batch-clear-btn');
    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalled();
  });

  it('shows target status dropdown', async () => {
    const { BatchActionBar } = await import('../jobs/BatchStatusUpdate');
    render(<BatchActionBar selectedJobIds={['j1', 'j2']} onClearSelection={vi.fn()} />);
    const dropdown = screen.getByTestId('batch-target-status');
    expect(dropdown).toBeInTheDocument();
  });

  it('confirm button opens modal', async () => {
    const { BatchActionBar } = await import('../jobs/BatchStatusUpdate');
    render(<BatchActionBar selectedJobIds={['j1', 'j2']} onClearSelection={vi.fn()} />);
    
    // Select a target status first
    const dropdown = screen.getByTestId('batch-target-status');
    fireEvent.change(dropdown, { target: { value: 'QUOTED' } });
    
    const confirmBtn = screen.getByTestId('batch-update-btn');
    fireEvent.click(confirmBtn);
    
    // Modal should appear
    await waitFor(() => {
      expect(screen.getByTestId('batch-confirm-modal')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// Tests: BatchConfirmModal
// ============================================================================

describe('BatchConfirmModal', () => {
  it('renders job list with current and target status', async () => {
    const { BatchConfirmModal } = await import('../jobs/BatchStatusUpdate');
    render(
      <BatchConfirmModal
        isOpen={true}
        jobs={mockJobs.slice(0, 2) as any}
        targetStatus="QUOTED"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isProcessing={false}
        results={[]}
      />,
    );
    expect(screen.getByTestId('batch-confirm-modal')).toBeInTheDocument();
    expect(screen.getByText(/JOB-001/)).toBeInTheDocument();
    expect(screen.getByText(/JOB-002/)).toBeInTheDocument();
  });

  it('shows processing state during execution', async () => {
    const { BatchConfirmModal } = await import('../jobs/BatchStatusUpdate');
    render(
      <BatchConfirmModal
        isOpen={true}
        jobs={mockJobs.slice(0, 1) as any}
        targetStatus="QUOTED"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isProcessing={true}
        results={[]}
      />,
    );
    // Processing state shows in the button text
    const btn = screen.getByTestId('batch-execute-btn');
    expect(btn.textContent).toContain('กำลังดำเนินการ');
    expect(btn).toBeDisabled();
  });

  it('shows results summary after completion', async () => {
    const { BatchConfirmModal } = await import('../jobs/BatchStatusUpdate');
    const results = [
      { jobId: 'j1', jobCode: 'JOB-001', success: true },
      { jobId: 'j2', jobCode: 'JOB-002', success: false, error: 'Invalid transition' },
    ];
    render(
      <BatchConfirmModal
        isOpen={true}
        jobs={mockJobs.slice(0, 2) as any}
        targetStatus="QUOTED"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isProcessing={false}
        results={results}
      />,
    );
    expect(screen.getByTestId('batch-results')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', async () => {
    const { BatchConfirmModal } = await import('../jobs/BatchStatusUpdate');
    const onConfirm = vi.fn();
    render(
      <BatchConfirmModal
        isOpen={true}
        jobs={mockJobs.slice(0, 1) as any}
        targetStatus="QUOTED"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        isProcessing={false}
        results={[]}
      />,
    );
    const btn = screen.getByTestId('batch-execute-btn');
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onCancel when cancel button clicked', async () => {
    const { BatchConfirmModal } = await import('../jobs/BatchStatusUpdate');
    const onCancel = vi.fn();
    render(
      <BatchConfirmModal
        isOpen={true}
        jobs={mockJobs.slice(0, 1) as any}
        targetStatus="QUOTED"
        onConfirm={vi.fn()}
        onCancel={onCancel}
        isProcessing={false}
        results={[]}
      />,
    );
    const btn = screen.getByTestId('batch-cancel-btn');
    fireEvent.click(btn);
    expect(onCancel).toHaveBeenCalled();
  });

  it('returns null when isOpen is false', async () => {
    const { BatchConfirmModal } = await import('../jobs/BatchStatusUpdate');
    const { container } = render(
      <BatchConfirmModal
        isOpen={false}
        jobs={mockJobs.slice(0, 1) as any}
        targetStatus="QUOTED"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isProcessing={false}
        results={[]}
      />,
    );
    expect(container.innerHTML).toBe('');
  });
});

// ============================================================================
// Tests: JobsLayout toast wiring
// ============================================================================

describe('JobsLayout', () => {
  it('renders toast container', async () => {
    const { JobsLayout } = await import('../jobs/JobsLayout');
    render(<JobsLayout><div>child</div></JobsLayout>);
    expect(screen.getByTestId('toast-container')).toBeInTheDocument();
  });

  it('renders children', async () => {
    const { JobsLayout } = await import('../jobs/JobsLayout');
    render(<JobsLayout><div data-testid="child">hello</div></JobsLayout>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});

// ============================================================================
// Tests: JobBoard with selection
// ============================================================================

describe('JobBoard selection integration', () => {
  it('renders with batch action bar hidden initially', async () => {
    const { JobBoard } = await import('../jobs/JobBoard');
    render(<JobBoard defaultView="list" />);
    expect(screen.queryByTestId('batch-action-bar')).not.toBeInTheDocument();
  });

  it('shows select-all checkbox in list view', async () => {
    const { JobBoard } = await import('../jobs/JobBoard');
    render(<JobBoard defaultView="list" />);
    expect(screen.getByTestId('select-all-checkbox')).toBeInTheDocument();
  });

  it('selecting a job shows batch action bar', async () => {
    const { JobBoard } = await import('../jobs/JobBoard');
    render(<JobBoard defaultView="list" />);
    
    const checkbox = screen.getByTestId('select-job-JOB-001');
    fireEvent.click(checkbox);
    
    await waitFor(() => {
      expect(screen.getByTestId('batch-action-bar')).toBeInTheDocument();
    });
  });

  it('select-all selects all filtered jobs', async () => {
    const { JobBoard } = await import('../jobs/JobBoard');
    render(<JobBoard defaultView="list" />);
    
    const selectAll = screen.getByTestId('select-all-checkbox');
    fireEvent.click(selectAll);
    
    await waitFor(() => {
      const bar = screen.getByTestId('batch-action-bar');
      expect(bar.textContent).toContain('3'); // all 3 mock jobs
    });
  });

  it('kanban view shows checkboxes on cards', async () => {
    const { JobBoard } = await import('../jobs/JobBoard');
    render(<JobBoard defaultView="kanban" />);
    
    const checkbox = screen.getByTestId('select-card-JOB-001');
    expect(checkbox).toBeInTheDocument();
  });
});
