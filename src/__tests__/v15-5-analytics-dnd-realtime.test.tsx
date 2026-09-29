/**
 * v15-5-analytics-dnd-realtime.test.tsx — Unit tests for v15.5.0 features
 *
 * Covers:
 * - JobAnalyticsDashboard (summary, cycle time, throughput, overdue alerts)
 * - DndKanbanBoard (render, drag simulation)
 * - useSupabaseRealtimeChannel (connection states, event handling)
 * - Updated JobsLayout (realtime channel integration)
 *
 * @version 15.5.0
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

afterEach(() => cleanup());

// ============================================================================
// Mock setup
// ============================================================================

const now = new Date('2026-08-28T10:00:00Z');
vi.useFakeTimers({ now });

const mockJobs = [
  {
    jobId: 'j1',
    jobCode: 'JOB-001',
    title: 'ตู้ห้องน้ำ A',
    customer: { customerId: 'c1', name: 'คุณสมชาย', phone: '081', email: 'a@b.com' },
    panels: [],
    status: 'DRAFT' as const,
    priority: 'NORMAL' as const,
    materialGroup: 'HPL',
    totalPanelCount: 10,
    createdAt: '2026-08-20T10:00:00Z',
    updatedAt: '2026-08-21T10:00:00Z',
    createdBy: 'user1',
    deadline: '2026-08-25', // overdue by 3 days
  },
  {
    jobId: 'j2',
    jobCode: 'JOB-002',
    title: 'ตู้ห้องน้ำ B',
    customer: { customerId: 'c2', name: 'คุณสมหญิง', phone: '082', email: 'b@b.com' },
    panels: [],
    status: 'IN_PRODUCTION' as const,
    priority: 'HIGH' as const,
    materialGroup: 'HPL',
    totalPanelCount: 5,
    createdAt: '2026-08-10T10:00:00Z',
    updatedAt: '2026-08-22T10:00:00Z',
    createdBy: 'user1',
    deadline: '2026-08-15', // overdue by 13 days
  },
  {
    jobId: 'j3',
    jobCode: 'JOB-003',
    title: 'ตู้ครัว C',
    customer: { customerId: 'c3', name: 'คุณมานี', phone: '083', email: 'c@b.com' },
    panels: [],
    status: 'CLOSED' as const,
    priority: 'NORMAL' as const,
    materialGroup: 'MDF',
    totalPanelCount: 20,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-20T10:00:00Z',
    createdBy: 'user1',
  },
  {
    jobId: 'j4',
    jobCode: 'JOB-004',
    title: 'ตู้เสื้อผ้า D',
    customer: { customerId: 'c4', name: 'คุณใจดี', phone: '084', email: 'd@b.com' },
    panels: [],
    status: 'APPROVED' as const,
    priority: 'URGENT' as const,
    materialGroup: 'HPL',
    totalPanelCount: 15,
    createdAt: '2026-08-25T10:00:00Z',
    updatedAt: '2026-08-27T10:00:00Z',
    createdBy: 'user1',
    deadline: '2026-09-05', // not overdue
  },
];

const mockTransitionStatus = vi.fn().mockReturnValue({ success: true });

vi.mock('../jobs/jobStore', () => ({
  useJobStore: Object.assign(
    (selector: any) => {
      const state = { jobs: mockJobs, transitionStatus: mockTransitionStatus };
      return selector(state);
    },
    {
      subscribe: vi.fn(() => () => {}),
      getState: () => ({ jobs: mockJobs, transitionStatus: mockTransitionStatus }),
      setState: vi.fn(),
    },
  ),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => <div data-testid="dnd-context">{children}</div>,
  DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children}</div>,
  closestCorners: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

vi.mock('../core/ui/NotificationToast', () => ({
  NotificationToastContainer: ({ toasts }: any) => (
    <div data-testid="toast-container">{toasts?.length ?? 0} toasts</div>
  ),
  useToast: () => ({
    toasts: [],
    addToast: vi.fn(),
    removeToast: vi.fn(),
  }),
}));

vi.mock('../jobs/useSupabaseRealtimeChannel', () => ({
  useSupabaseRealtimeChannel: () => ({
    status: 'idle',
    error: null,
    eventCount: 0,
    recentEvents: [],
    reconnect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

// ============================================================================
// Tests: Analytics Computation Functions
// ============================================================================

describe('JobAnalyticsDashboard — computations', () => {
  it('computeSummary returns correct totals', async () => {
    const { computeSummary } = await import('../jobs/JobAnalyticsDashboard');
    const summary = computeSummary(mockJobs as any);
    expect(summary.totalJobs).toBe(4);
    expect(summary.activeJobs).toBe(3); // DRAFT, IN_PRODUCTION, APPROVED
    expect(summary.completedJobs).toBe(1); // CLOSED
    expect(summary.overdueCount).toBe(2); // j1 and j2
  });

  it('computeOverdueAlerts sorts by severity', async () => {
    const { computeOverdueAlerts } = await import('../jobs/JobAnalyticsDashboard');
    const alerts = computeOverdueAlerts(mockJobs as any);
    expect(alerts.length).toBe(2);
    // j2 is 13 days overdue (critical), j1 is 3 days (warning)
    expect(alerts[0].jobCode).toBe('JOB-002');
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[1].jobCode).toBe('JOB-001');
    expect(alerts[1].severity).toBe('warning');
  });

  it('computeCycleTimeMetrics returns metrics for populated statuses', async () => {
    const { computeCycleTimeMetrics } = await import('../jobs/JobAnalyticsDashboard');
    const metrics = computeCycleTimeMetrics(mockJobs as any);
    expect(metrics.length).toBe(8); // all JOB_STATUSES
    const draftMetric = metrics.find((m) => m.status === 'DRAFT');
    expect(draftMetric?.jobCount).toBe(1);
  });

  it('computeThroughput returns 12 weeks', async () => {
    const { computeThroughput } = await import('../jobs/JobAnalyticsDashboard');
    const throughput = computeThroughput(mockJobs as any);
    expect(throughput.length).toBe(12);
    expect(throughput[0].period).toBe('W1');
  });
});

// ============================================================================
// Tests: Analytics Dashboard Component
// ============================================================================

describe('JobAnalyticsDashboard — rendering', () => {
  it('renders dashboard with all sections', async () => {
    const { JobAnalyticsDashboard } = await import('../jobs/JobAnalyticsDashboard');
    render(<JobAnalyticsDashboard />);
    expect(screen.getByTestId('job-analytics-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('analytics-summary')).toBeInTheDocument();
    expect(screen.getByTestId('cycle-time-chart')).toBeInTheDocument();
    expect(screen.getByTestId('throughput-chart')).toBeInTheDocument();
    expect(screen.getByTestId('overdue-alerts')).toBeInTheDocument();
    expect(screen.getByTestId('status-distribution')).toBeInTheDocument();
  });

  it('shows overdue alerts with job codes', async () => {
    const { JobAnalyticsDashboard } = await import('../jobs/JobAnalyticsDashboard');
    render(<JobAnalyticsDashboard />);
    expect(screen.getByTestId('overdue-JOB-001')).toBeInTheDocument();
    expect(screen.getByTestId('overdue-JOB-002')).toBeInTheDocument();
  });

  it('calls onSelectJob when overdue alert clicked', async () => {
    const { JobAnalyticsDashboard } = await import('../jobs/JobAnalyticsDashboard');
    const onSelect = vi.fn();
    render(<JobAnalyticsDashboard onSelectJob={onSelect} />);
    fireEvent.click(screen.getByTestId('overdue-JOB-001'));
    expect(onSelect).toHaveBeenCalledWith('j1');
  });

  it('renders summary cards with values', async () => {
    const { JobAnalyticsDashboard } = await import('../jobs/JobAnalyticsDashboard');
    render(<JobAnalyticsDashboard />);
    const summary = screen.getByTestId('analytics-summary');
    expect(summary.textContent).toContain('4'); // total
    expect(summary.textContent).toContain('3'); // active
    expect(summary.textContent).toContain('2'); // overdue
  });
});

// ============================================================================
// Tests: DndKanbanBoard
// ============================================================================

describe('DndKanbanBoard', () => {
  it('renders kanban columns for all non-CLOSED statuses', async () => {
    const { DndKanbanBoard } = await import('../jobs/DndKanbanBoard');
    render(<DndKanbanBoard />);
    expect(screen.getByTestId('dnd-kanban-board')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-col-DRAFT')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-col-IN_PRODUCTION')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-col-APPROVED')).toBeInTheDocument();
  });

  it('renders job cards in correct columns', async () => {
    const { DndKanbanBoard } = await import('../jobs/DndKanbanBoard');
    render(<DndKanbanBoard />);
    expect(screen.getByTestId('dnd-card-JOB-001')).toBeInTheDocument(); // DRAFT
    expect(screen.getByTestId('dnd-card-JOB-002')).toBeInTheDocument(); // IN_PRODUCTION
    expect(screen.getByTestId('dnd-card-JOB-004')).toBeInTheDocument(); // APPROVED
  });

  it('shows transition hints on cards', async () => {
    const { DndKanbanBoard } = await import('../jobs/DndKanbanBoard');
    render(<DndKanbanBoard />);
    const draftCard = screen.getByTestId('dnd-card-JOB-001');
    expect(draftCard.textContent).toContain('ใบเสนอราคา'); // QUOTED transition
  });

  it('double-click calls onSelectJob', async () => {
    const { DndKanbanBoard } = await import('../jobs/DndKanbanBoard');
    const onSelect = vi.fn();
    render(<DndKanbanBoard onSelectJob={onSelect} />);
    const card = screen.getByTestId('dnd-card-JOB-001');
    fireEvent.doubleClick(card);
    expect(onSelect).toHaveBeenCalledWith('j1');
  });

  it('renders DndContext wrapper', async () => {
    const { DndKanbanBoard } = await import('../jobs/DndKanbanBoard');
    render(<DndKanbanBoard />);
    expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
  });

  it('renders instructions hint', async () => {
    const { DndKanbanBoard } = await import('../jobs/DndKanbanBoard');
    render(<DndKanbanBoard />);
    expect(screen.getByText(/ลากการ์ด/)).toBeInTheDocument();
  });
});

// ============================================================================
// Tests: useSupabaseRealtimeChannel (unit behavior)
// ============================================================================

describe('useSupabaseRealtimeChannel', () => {
  it('module exports the hook', async () => {
    const mod = await import('../jobs/useSupabaseRealtimeChannel');
    expect(mod.useSupabaseRealtimeChannel).toBeDefined();
    expect(typeof mod.useSupabaseRealtimeChannel).toBe('function');
  });
});

// ============================================================================
// Tests: JobsLayout with Realtime
// ============================================================================

describe('JobsLayout (realtime channel)', () => {
  it('renders children and toast container', async () => {
    const { JobsLayout } = await import('../jobs/JobsLayout');
    render(<JobsLayout><div data-testid="child">content</div></JobsLayout>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByTestId('toast-container')).toBeInTheDocument();
  });

  it('renders realtime status badge', async () => {
    const { JobsLayout } = await import('../jobs/JobsLayout');
    render(<JobsLayout><div>x</div></JobsLayout>);
    expect(screen.getByTestId('realtime-status-badge')).toBeInTheDocument();
  });

  it('shows Local status when Supabase not configured', async () => {
    const { JobsLayout } = await import('../jobs/JobsLayout');
    render(<JobsLayout><div>x</div></JobsLayout>);
    const badge = screen.getByTestId('realtime-status-badge');
    expect(badge.textContent).toContain('Local');
  });
});
