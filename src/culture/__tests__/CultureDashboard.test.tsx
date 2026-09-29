/**
 * CultureDashboard.test.tsx
 * MONOLITH v16.0 — Culture Module
 *
 * Vitest + @testing-library/react tests for CultureDashboard.
 *
 * Coverage:
 *  • fetchPsScores always called on mount (all roles + null member)
 *  • ADMIN role — feedback list visible, fetchAnonymousFeedback called
 *  • OWNER role — same as ADMIN (ORG_ROLE_HIERARCHY >= 80)
 *  • VIEWER / DESIGNER role — amber notice shown, fetchAnonymousFeedback NOT called
 *  • null currentMember — treated as non-admin (amber notice shown)
 *  • loading state renders skeleton area without breaking
 *  • empty PS scores renders "ยังไม่มีข้อมูลมิติ" placeholder
 *  • empty feedback list renders "ไม่มีความคิดเห็นที่ตรงกับเงื่อนไข"
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CultureDashboard } from '../CultureDashboard';

// ─── Hoisted mock state ───────────────────────────────────────────────────────
// vi.hoisted ensures refs are available inside vi.mock factories (hoisted before imports).
const { mockCultureState, mockTenantState } = vi.hoisted(() => {
  const mockCultureState = {
    psScores: [] as any[],
    anonymousFeedback: [] as any[],
    fetchPsScores: vi.fn(),
    fetchAnonymousFeedback: vi.fn(),
    actionFeedback: vi.fn(),
    // Inline selector methods — component calls s.selectXxx() inside useCultureStore selector
    selectScoresForChart: vi.fn(() => []),
    selectIsAnyLoading: vi.fn(() => false),
    selectPendingFeedback: vi.fn(() => []),
    selectCurrentPeriodLabel: vi.fn(() => null as string | null),
  };

  const mockTenantState = {
    currentMember: null as any,
  };

  return { mockCultureState, mockTenantState };
});

vi.mock('../cultureStore', () => ({
  useCultureStore: vi.fn((selector: any) => selector(mockCultureState)),
  selectScoresForChart: vi.fn(() => mockCultureState.selectScoresForChart()),
  selectIsAnyLoading: vi.fn(() => mockCultureState.selectIsAnyLoading()),
  selectPendingFeedback: vi.fn(() => mockCultureState.selectPendingFeedback()),
  selectCurrentPeriodLabel: vi.fn(() => mockCultureState.selectCurrentPeriodLabel()),
}));

vi.mock('../../tenant/tenantStore', () => ({
  useTenantStore: vi.fn((selector: any) => selector(mockTenantState)),
}));

// recharts components are not functional in jsdom — replace with inert wrappers
vi.mock('recharts', () => {
  const Passthrough = ({ children }: any) => <div>{children}</div>;
  return {
    LineChart: Passthrough,
    Line: Passthrough,
    BarChart: Passthrough,
    Bar: Passthrough,
    XAxis: Passthrough,
    YAxis: Passthrough,
    CartesianGrid: Passthrough,
    Tooltip: Passthrough,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
    ReferenceLine: Passthrough,
    Cell: Passthrough,
    Legend: Passthrough,
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const MOCK_ORG_ID = 'org-test-001';

const ADMIN_MEMBER = {
  id: 'member-admin',
  orgId: MOCK_ORG_ID,
  userId: 'user-admin',
  role: 'ADMIN' as const,
  name: 'Admin User',
  isActive: true,
};

const OWNER_MEMBER = {
  ...ADMIN_MEMBER,
  id: 'member-owner',
  role: 'OWNER' as const,
  name: 'Owner User',
};

const VIEWER_MEMBER = {
  ...ADMIN_MEMBER,
  id: 'member-viewer',
  role: 'VIEWER' as const,
  name: 'Viewer User',
};

const DESIGNER_MEMBER = {
  ...ADMIN_MEMBER,
  id: 'member-designer',
  role: 'DESIGNER' as const,
  name: 'Designer User',
};

const MOCK_FEEDBACK: any[] = [
  {
    id: 'fb-001',
    orgId: MOCK_ORG_ID,
    category: 'SAFETY',
    content: 'พื้นที่ทำงานยังขาดมาตรการป้องกันที่ชัดเจน',
    actionStatus: 'PENDING',
    actionNote: null,
    submittedAt: '2026-08-01T00:00:00Z',
    reviewedAt: null,
    reviewedBy: null,
  },
  {
    id: 'fb-002',
    orgId: MOCK_ORG_ID,
    category: 'PROCESS',
    content: 'ขั้นตอน QC ซ้ำซ้อนและใช้เวลานาน',
    actionStatus: 'IN_PROGRESS',
    actionNote: null,
    submittedAt: '2026-08-05T00:00:00Z',
    reviewedAt: null,
    reviewedBy: null,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function renderDashboard() {
  return render(<CultureDashboard orgId={MOCK_ORG_ID} />);
}

function resetMockState() {
  mockCultureState.psScores = [];
  mockCultureState.anonymousFeedback = [];
  mockCultureState.fetchPsScores = vi.fn();
  mockCultureState.fetchAnonymousFeedback = vi.fn();
  mockCultureState.actionFeedback = vi.fn();
  mockCultureState.selectScoresForChart = vi.fn(() => []);
  mockCultureState.selectIsAnyLoading = vi.fn(() => false);
  mockCultureState.selectPendingFeedback = vi.fn(() => []);
  mockCultureState.selectCurrentPeriodLabel = vi.fn(() => null);
  mockTenantState.currentMember = null;
}

// ─── Test suites ──────────────────────────────────────────────────────────────
describe('CultureDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  // ── fetchPsScores always called ─────────────────────────────────────────
  describe('fetchPsScores on mount', () => {
    it('calls fetchPsScores with orgId for ADMIN', () => {
      mockTenantState.currentMember = ADMIN_MEMBER;
      renderDashboard();
      expect(mockCultureState.fetchPsScores).toHaveBeenCalledOnce();
      expect(mockCultureState.fetchPsScores).toHaveBeenCalledWith(MOCK_ORG_ID);
    });

    it('calls fetchPsScores with orgId for VIEWER', () => {
      mockTenantState.currentMember = VIEWER_MEMBER;
      renderDashboard();
      expect(mockCultureState.fetchPsScores).toHaveBeenCalledOnce();
      expect(mockCultureState.fetchPsScores).toHaveBeenCalledWith(MOCK_ORG_ID);
    });

    it('calls fetchPsScores when currentMember is null', () => {
      mockTenantState.currentMember = null;
      renderDashboard();
      expect(mockCultureState.fetchPsScores).toHaveBeenCalledOnce();
      expect(mockCultureState.fetchPsScores).toHaveBeenCalledWith(MOCK_ORG_ID);
    });
  });

  // ── isAdmin conditional render: ADMIN ────────────────────────────────────
  describe('ADMIN role — feedback list visible', () => {
    it('renders "ความคิดเห็นนิรนาม" section heading', () => {
      mockTenantState.currentMember = ADMIN_MEMBER;
      mockCultureState.anonymousFeedback = MOCK_FEEDBACK;
      renderDashboard();
      expect(screen.getByText('ความคิดเห็นนิรนาม')).toBeInTheDocument();
    });

    it('does NOT render the amber access-restriction notice', () => {
      mockTenantState.currentMember = ADMIN_MEMBER;
      renderDashboard();
      expect(
        screen.queryByText(/ความคิดเห็นนิรนามแสดงเฉพาะผู้ดูแลระบบ/),
      ).not.toBeInTheDocument();
    });

    it('renders feedback content rows for each feedback item', () => {
      mockTenantState.currentMember = ADMIN_MEMBER;
      mockCultureState.anonymousFeedback = MOCK_FEEDBACK;
      renderDashboard();
      expect(
        screen.getByText('พื้นที่ทำงานยังขาดมาตรการป้องกันที่ชัดเจน'),
      ).toBeInTheDocument();
      expect(screen.getByText('ขั้นตอน QC ซ้ำซ้อนและใช้เวลานาน')).toBeInTheDocument();
    });

    it('renders empty-state message when feedback list is empty', () => {
      mockTenantState.currentMember = ADMIN_MEMBER;
      mockCultureState.anonymousFeedback = [];
      renderDashboard();
      expect(
        screen.getByText('ไม่มีความคิดเห็นที่ตรงกับเงื่อนไข'),
      ).toBeInTheDocument();
    });
  });

  // ── fetchAnonymousFeedback gate ──────────────────────────────────────────
  describe('fetchAnonymousFeedback gate', () => {
    it('calls fetchAnonymousFeedback with orgId for ADMIN on mount', () => {
      mockTenantState.currentMember = ADMIN_MEMBER;
      renderDashboard();
      expect(mockCultureState.fetchAnonymousFeedback).toHaveBeenCalledOnce();
      expect(mockCultureState.fetchAnonymousFeedback).toHaveBeenCalledWith(MOCK_ORG_ID);
    });

    it('calls fetchAnonymousFeedback for OWNER (ORG_ROLE_HIERARCHY >= 80)', () => {
      mockTenantState.currentMember = OWNER_MEMBER;
      renderDashboard();
      expect(mockCultureState.fetchAnonymousFeedback).toHaveBeenCalledOnce();
      expect(mockCultureState.fetchAnonymousFeedback).toHaveBeenCalledWith(MOCK_ORG_ID);
    });

    it('does NOT call fetchAnonymousFeedback for VIEWER (role < 80)', () => {
      mockTenantState.currentMember = VIEWER_MEMBER;
      renderDashboard();
      expect(mockCultureState.fetchAnonymousFeedback).not.toHaveBeenCalled();
    });

    it('does NOT call fetchAnonymousFeedback for DESIGNER (role < 80)', () => {
      mockTenantState.currentMember = DESIGNER_MEMBER;
      renderDashboard();
      expect(mockCultureState.fetchAnonymousFeedback).not.toHaveBeenCalled();
    });

    it('does NOT call fetchAnonymousFeedback when currentMember is null', () => {
      mockTenantState.currentMember = null;
      renderDashboard();
      expect(mockCultureState.fetchAnonymousFeedback).not.toHaveBeenCalled();
    });
  });

  // ── isAdmin conditional render: non-admin ────────────────────────────────
  describe('non-admin roles — amber access notice', () => {
    it('shows amber notice for VIEWER', () => {
      mockTenantState.currentMember = VIEWER_MEMBER;
      renderDashboard();
      expect(
        screen.getByText(/ความคิดเห็นนิรนามแสดงเฉพาะผู้ดูแลระบบ/),
      ).toBeInTheDocument();
    });

    it('shows amber notice for DESIGNER', () => {
      mockTenantState.currentMember = DESIGNER_MEMBER;
      renderDashboard();
      expect(
        screen.getByText(/ความคิดเห็นนิรนามแสดงเฉพาะผู้ดูแลระบบ/),
      ).toBeInTheDocument();
    });

    it('shows amber notice when currentMember is null', () => {
      mockTenantState.currentMember = null;
      renderDashboard();
      expect(
        screen.getByText(/ความคิดเห็นนิรนามแสดงเฉพาะผู้ดูแลระบบ/),
      ).toBeInTheDocument();
    });

    it('does NOT show "ความคิดเห็นนิรนาม" heading for VIEWER', () => {
      mockTenantState.currentMember = VIEWER_MEMBER;
      renderDashboard();
      expect(screen.queryByText('ความคิดเห็นนิรนาม')).not.toBeInTheDocument();
    });
  });

  // ── loading state ────────────────────────────────────────────────────────
  describe('loading state', () => {
    it('does not crash when selectIsAnyLoading returns true (ADMIN)', () => {
      mockTenantState.currentMember = ADMIN_MEMBER;
      mockCultureState.selectIsAnyLoading = vi.fn(() => true);
      mockCultureState.anonymousFeedback = [];
      expect(() => renderDashboard()).not.toThrow();
    });

    it('renders feedback section heading even during loading (ADMIN)', () => {
      mockTenantState.currentMember = ADMIN_MEMBER;
      mockCultureState.selectIsAnyLoading = vi.fn(() => true);
      mockCultureState.anonymousFeedback = [];
      renderDashboard();
      expect(screen.getByText('ความคิดเห็นนิรนาม')).toBeInTheDocument();
    });
  });

  // ── PS scores empty state ────────────────────────────────────────────────
  describe('PS scores empty state', () => {
    it('shows "ยังไม่มีข้อมูลมิติ" when chartData is empty', () => {
      mockTenantState.currentMember = ADMIN_MEMBER;
      mockCultureState.selectScoresForChart = vi.fn(() => []);
      mockCultureState.psScores = [];
      renderDashboard();
      expect(screen.getByText('ยังไม่มีข้อมูลมิติ')).toBeInTheDocument();
    });
  });
});
