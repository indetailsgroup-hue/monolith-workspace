/**
 * src/training/__tests__/TrainingEnrollmentPanel.test.tsx
 *
 * MONOLITH v17.5 — Vitest unit tests for TrainingEnrollmentPanel
 *
 * Coverage:
 *  - Plan gate wall (FREE / STARTER → locked; PROFESSIONAL / ENTERPRISE → open)
 *  - Employee tag add via button click and Enter key
 *  - Employee tag remove + bulk-enroll-count update
 *  - Submit button disabled when no employee IDs
 *  - bulkEnroll error path (Error instance + non-Error rejection + store.error)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TrainingEnrollmentPanel } from '../TrainingEnrollmentPanel';
import { useTrainingStore } from '../trainingStore';

// ── Module mock ───────────────────────────────────────────────────────────────
vi.mock('../trainingStore', () => ({
  useTrainingStore: vi.fn(),
}));

const mockUseTrainingStore = vi.mocked(useTrainingStore);

// ── Default store mock ────────────────────────────────────────────────────────
const buildStoreMock = (overrides: Record<string, unknown> = {}) => ({
  bulkEnroll: vi.fn().mockResolvedValue([]),
  fetchEnrollments: vi.fn().mockResolvedValue(undefined),
  enrollments: [],
  isEnrollmentLoading: false,
  error: null,
  clearError: vi.fn(),
  ...overrides,
});

// ── Common props ──────────────────────────────────────────────────────────────
const BASE_PROPS = {
  orgId: 'org-001',
  courseId: 'course-abc',
  courseName: 'AI Fundamentals',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTrainingStore.mockReturnValue(buildStoreMock());
});

// ============================================================================
// Plan Gate Wall
// ============================================================================

describe('plan gate wall', () => {
  it('renders plan-gate-wall and hides enrollment-panel for FREE plan', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="FREE" />);

    expect(screen.getByTestId('plan-gate-wall')).toBeInTheDocument();
    expect(screen.queryByTestId('enrollment-panel')).not.toBeInTheDocument();
  });

  it('renders plan-gate-wall for STARTER plan', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="STARTER" />);

    expect(screen.getByTestId('plan-gate-wall')).toBeInTheDocument();
    expect(screen.queryByTestId('enrollment-panel')).not.toBeInTheDocument();
  });

  it('renders enrollment-panel (not gate wall) for PROFESSIONAL plan', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    expect(screen.queryByTestId('plan-gate-wall')).not.toBeInTheDocument();
    expect(screen.getByTestId('enrollment-panel')).toBeInTheDocument();
  });

  it('renders enrollment-panel (not gate wall) for ENTERPRISE plan', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="ENTERPRISE" />);

    expect(screen.queryByTestId('plan-gate-wall')).not.toBeInTheDocument();
    expect(screen.getByTestId('enrollment-panel')).toBeInTheDocument();
  });

  it('plan-gate-wall contains upgrade copy', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="FREE" />);

    expect(screen.getByTestId('plan-gate-wall')).toHaveTextContent('PROFESSIONAL+');
  });

  it('does NOT call fetchEnrollments when plan is gated', () => {
    const fetchEnrollments = vi.fn().mockResolvedValue(undefined);
    mockUseTrainingStore.mockReturnValue(buildStoreMock({ fetchEnrollments }));

    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="FREE" />);

    expect(fetchEnrollments).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Employee tag add
// ============================================================================

describe('employee tag add', () => {
  it('adds a tag when clicking the Add button', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    fireEvent.change(screen.getByTestId('employee-id-input'), {
      target: { value: 'EMP-001' },
    });
    fireEvent.click(screen.getByTestId('add-employee-btn'));

    const tags = screen.getAllByTestId('employee-tag');
    expect(tags).toHaveLength(1);
    expect(tags[0]).toHaveTextContent('EMP-001');
  });

  it('adds a tag when pressing Enter in the input', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    const input = screen.getByTestId('employee-id-input');
    fireEvent.change(input, { target: { value: 'EMP-002' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    const tags = screen.getAllByTestId('employee-tag');
    expect(tags).toHaveLength(1);
    expect(tags[0]).toHaveTextContent('EMP-002');
  });

  it('clears the input field after adding a tag via button', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    const input = screen.getByTestId('employee-id-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'EMP-003' } });
    fireEvent.click(screen.getByTestId('add-employee-btn'));

    expect(input.value).toBe('');
  });

  it('clears the input field after adding a tag via Enter', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    const input = screen.getByTestId('employee-id-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'EMP-003' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(input.value).toBe('');
  });

  it('does not add duplicate employee IDs', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    const input = screen.getByTestId('employee-id-input');
    const addBtn = screen.getByTestId('add-employee-btn');

    fireEvent.change(input, { target: { value: 'EMP-001' } });
    fireEvent.click(addBtn);
    fireEvent.change(input, { target: { value: 'EMP-001' } });
    fireEvent.click(addBtn);

    expect(screen.getAllByTestId('employee-tag')).toHaveLength(1);
  });

  it('does not add a tag for blank / whitespace-only input', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    fireEvent.change(screen.getByTestId('employee-id-input'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('add-employee-btn'));

    expect(screen.queryByTestId('employee-tag')).not.toBeInTheDocument();
  });

  it('shows bulk-enroll-count after adding employees', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    const input = screen.getByTestId('employee-id-input');
    const addBtn = screen.getByTestId('add-employee-btn');

    fireEvent.change(input, { target: { value: 'EMP-001' } });
    fireEvent.click(addBtn);
    fireEvent.change(input, { target: { value: 'EMP-002' } });
    fireEvent.click(addBtn);

    expect(screen.getByTestId('bulk-enroll-count')).toHaveTextContent('2 คน');
  });

  it('multiple tags appear in correct order', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    const input = screen.getByTestId('employee-id-input');
    const addBtn = screen.getByTestId('add-employee-btn');

    ['EMP-A', 'EMP-B', 'EMP-C'].forEach((id) => {
      fireEvent.change(input, { target: { value: id } });
      fireEvent.click(addBtn);
    });

    const tags = screen.getAllByTestId('employee-tag');
    expect(tags).toHaveLength(3);
    expect(tags[0]).toHaveTextContent('EMP-A');
    expect(tags[1]).toHaveTextContent('EMP-B');
    expect(tags[2]).toHaveTextContent('EMP-C');
  });
});

// ============================================================================
// Employee tag remove
// ============================================================================

describe('employee tag remove', () => {
  it('removes a tag when its remove button is clicked', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    const input = screen.getByTestId('employee-id-input');
    const addBtn = screen.getByTestId('add-employee-btn');

    fireEvent.change(input, { target: { value: 'EMP-001' } });
    fireEvent.click(addBtn);
    fireEvent.change(input, { target: { value: 'EMP-002' } });
    fireEvent.click(addBtn);

    expect(screen.getAllByTestId('employee-tag')).toHaveLength(2);

    fireEvent.click(screen.getAllByTestId('remove-employee-tag-btn')[0]);

    expect(screen.getAllByTestId('employee-tag')).toHaveLength(1);
    expect(screen.getByTestId('employee-tag')).toHaveTextContent('EMP-002');
  });

  it('updates bulk-enroll-count after removing a tag', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    const input = screen.getByTestId('employee-id-input');
    const addBtn = screen.getByTestId('add-employee-btn');

    fireEvent.change(input, { target: { value: 'EMP-001' } });
    fireEvent.click(addBtn);
    fireEvent.change(input, { target: { value: 'EMP-002' } });
    fireEvent.click(addBtn);

    expect(screen.getByTestId('bulk-enroll-count')).toHaveTextContent('2 คน');

    fireEvent.click(screen.getAllByTestId('remove-employee-tag-btn')[0]);

    expect(screen.getByTestId('bulk-enroll-count')).toHaveTextContent('1 คน');
  });

  it('hides employee-tag and bulk-enroll-count when the last tag is removed', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    fireEvent.change(screen.getByTestId('employee-id-input'), {
      target: { value: 'EMP-001' },
    });
    fireEvent.click(screen.getByTestId('add-employee-btn'));

    fireEvent.click(screen.getByTestId('remove-employee-tag-btn'));

    expect(screen.queryByTestId('employee-tag')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bulk-enroll-count')).not.toBeInTheDocument();
  });

  it('removes only the correct tag when multiple tags exist', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    const input = screen.getByTestId('employee-id-input');
    const addBtn = screen.getByTestId('add-employee-btn');

    ['EMP-X', 'EMP-Y', 'EMP-Z'].forEach((id) => {
      fireEvent.change(input, { target: { value: id } });
      fireEvent.click(addBtn);
    });

    // Remove the middle tag (index 1 → EMP-Y)
    fireEvent.click(screen.getAllByTestId('remove-employee-tag-btn')[1]);

    const remaining = screen.getAllByTestId('employee-tag');
    expect(remaining).toHaveLength(2);
    expect(remaining[0]).toHaveTextContent('EMP-X');
    expect(remaining[1]).toHaveTextContent('EMP-Z');
  });
});

// ============================================================================
// Submit button disabled state
// ============================================================================

describe('submit button disabled state', () => {
  it('is disabled when no employee IDs have been added', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    expect(screen.getByTestId('enroll-submit-btn')).toBeDisabled();
  });

  it('becomes enabled after adding at least one employee ID', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    fireEvent.change(screen.getByTestId('employee-id-input'), {
      target: { value: 'EMP-001' },
    });
    fireEvent.click(screen.getByTestId('add-employee-btn'));

    expect(screen.getByTestId('enroll-submit-btn')).not.toBeDisabled();
  });

  it('becomes disabled again after all tags are removed', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    fireEvent.change(screen.getByTestId('employee-id-input'), {
      target: { value: 'EMP-001' },
    });
    fireEvent.click(screen.getByTestId('add-employee-btn'));
    expect(screen.getByTestId('enroll-submit-btn')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('remove-employee-tag-btn'));
    expect(screen.getByTestId('enroll-submit-btn')).toBeDisabled();
  });
});

// ============================================================================
// bulkEnroll error path
// ============================================================================

describe('bulkEnroll error path', () => {
  const addOneEmployee = () => {
    fireEvent.change(screen.getByTestId('employee-id-input'), {
      target: { value: 'EMP-001' },
    });
    fireEvent.click(screen.getByTestId('add-employee-btn'));
  };

  it('shows error-banner with Error.message when bulkEnroll rejects with Error', async () => {
    mockUseTrainingStore.mockReturnValue(
      buildStoreMock({
        bulkEnroll: vi.fn().mockRejectedValue(new Error('เซิร์ฟเวอร์ขัดข้อง')),
      })
    );

    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);
    addOneEmployee();
    fireEvent.click(screen.getByTestId('enroll-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeInTheDocument();
    });

    expect(screen.getByTestId('error-banner')).toHaveTextContent('เซิร์ฟเวอร์ขัดข้อง');
  });

  it('shows fallback message when bulkEnroll rejects with a non-Error value', async () => {
    mockUseTrainingStore.mockReturnValue(
      buildStoreMock({
        bulkEnroll: vi.fn().mockRejectedValue('unknown string rejection'),
      })
    );

    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);
    addOneEmployee();
    fireEvent.click(screen.getByTestId('enroll-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeInTheDocument();
    });

    expect(screen.getByTestId('error-banner')).toHaveTextContent('มอบหมายไม่สำเร็จ');
  });

  it('displays store-level error in error-banner', () => {
    mockUseTrainingStore.mockReturnValue(
      buildStoreMock({ error: 'Plan quota exceeded for this org' })
    );

    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    expect(screen.getByTestId('error-banner')).toBeInTheDocument();
    expect(screen.getByTestId('error-banner')).toHaveTextContent(
      'Plan quota exceeded for this org'
    );
  });

  it('error-banner is absent when bulkEnroll resolves successfully', async () => {
    mockUseTrainingStore.mockReturnValue(
      buildStoreMock({
        bulkEnroll: vi.fn().mockResolvedValue([{ id: 'enr-1' }]),
      })
    );

    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);
    addOneEmployee();
    fireEvent.click(screen.getByTestId('enroll-submit-btn'));

    await waitFor(() => {
      // Submit button returns to its base label after success
      expect(screen.getByTestId('enroll-submit-btn')).not.toHaveTextContent('กำลังมอบหมาย');
    });

    expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
  });

  it('calls clearError when error-banner close button is clicked', async () => {
    const clearError = vi.fn();
    mockUseTrainingStore.mockReturnValue(
      buildStoreMock({
        bulkEnroll: vi.fn().mockRejectedValue(new Error('Test error')),
        clearError,
      })
    );

    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);
    addOneEmployee();
    fireEvent.click(screen.getByTestId('enroll-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeInTheDocument();
    });

    // Click the ✕ button inside the error banner
    fireEvent.click(screen.getByRole('button', { name: /ปิด error/i }));

    expect(clearError).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// Timeline + loading state
// ============================================================================

describe('enrollment timeline', () => {
  it('renders panel-loading indicator while enrollments are loading', () => {
    mockUseTrainingStore.mockReturnValue(
      buildStoreMock({ isEnrollmentLoading: true })
    );

    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    expect(screen.getByTestId('panel-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('enrollment-timeline')).not.toBeInTheDocument();
  });

  it('renders empty-state text when there are no enrollments', () => {
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    expect(screen.getByTestId('enrollment-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('enrollment-timeline')).toHaveTextContent(
      'ยังไม่มีการมอบหมาย'
    );
  });

  it('renders timeline-items for existing enrollments', () => {
    mockUseTrainingStore.mockReturnValue(
      buildStoreMock({
        enrollments: [
          {
            id: 'enr-1',
            courseId: 'course-abc',
            employeeId: 'EMP-100',
            status: 'ENROLLED',
            enrolledAt: '2027-01-10T00:00:00Z',
            dueDate: null,
            completedAt: null,
          },
          {
            id: 'enr-2',
            courseId: 'course-abc',
            employeeId: 'EMP-101',
            status: 'COMPLETED',
            enrolledAt: '2027-01-08T00:00:00Z',
            dueDate: null,
            completedAt: '2027-01-09T00:00:00Z',
          },
        ],
      })
    );

    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    expect(screen.getAllByTestId('timeline-item')).toHaveLength(2);
    expect(screen.getAllByTestId('enrollment-status-badge')).toHaveLength(2);
  });

  it('filters timeline to only show enrollments for the current courseId', () => {
    mockUseTrainingStore.mockReturnValue(
      buildStoreMock({
        enrollments: [
          {
            id: 'enr-1',
            courseId: 'course-abc',
            employeeId: 'EMP-100',
            status: 'ENROLLED',
            enrolledAt: '2027-01-10T00:00:00Z',
            dueDate: null,
            completedAt: null,
          },
          {
            id: 'enr-2',
            courseId: 'other-course',
            employeeId: 'EMP-200',
            status: 'ENROLLED',
            enrolledAt: '2027-01-10T00:00:00Z',
            dueDate: null,
            completedAt: null,
          },
        ],
      })
    );

    // courseId = 'course-abc' — only enr-1 should appear
    render(<TrainingEnrollmentPanel {...BASE_PROPS} orgPlan="PROFESSIONAL" />);

    expect(screen.getAllByTestId('timeline-item')).toHaveLength(1);
    expect(screen.getByTestId('timeline-item')).toHaveTextContent('EMP-100');
  });
});
