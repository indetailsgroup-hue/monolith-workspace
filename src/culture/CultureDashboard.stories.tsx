/**
 * CultureDashboard.stories.tsx
 * Storybook 8.x stories for CultureDashboard component.
 *
 * Key quirk: CultureDashboard calls store selectors as STATE METHODS
 * (e.g. s.selectScoresForChart()). These methods do NOT exist on the
 * real Zustand state — they are standalone helper functions exported
 * from cultureStore.ts. The withCultureStore() decorator MUST inject
 * them as mock functions inside the setState patch, or the component
 * will throw at render.
 *
 * Admin gate: ORG_ROLE_HIERARCHY[currentMember.role] >= 80
 *   OWNER=100 ✓   ADMIN=80 ✓   DESIGNER/FACTORY/FINANCE=60 ✗
 *   INSTALLER=40 ✗   VIEWER=10 ✗
 */
import type { Meta, StoryObj } from '@storybook/react';
import { within, userEvent, expect, fn } from '@storybook/test';
import { CultureDashboard } from './CultureDashboard';
import { useCultureStore } from './cultureStore';
import { useTenantStore } from '../tenant/tenantStore';
import type { PsScore, AnonymousFeedback } from './types';
import type { OrgMember } from '../tenant/types';
import { THAI_MANUFACTURING_PS_BENCHMARK } from './types';

// ─── Mock data ────────────────────────────────────────────────────────────────

const ORG_ID = 'org-stories-001';

/** PsScore above benchmark (score=62 > 55) */
const mockScoreAbove = {
  id: 'ps-001',
  orgId: ORG_ID,
  surveyId: 'survey-001',
  periodLabel: '2569-Q2',
  periodType: 'QUARTERLY',
  score: 62,
  overallScore: 62,
  dimensionScores: {
    SPEAK_UP: 65,
    HELP_SEEKING: 60,
    RISK_TAKING: 58,
    INCLUSION: 64,
  },
  responseCount: 24,
  computedAt: '2026-07-01T00:00:00Z',
} as unknown as PsScore;

/** PsScore below benchmark (score=42 < 55) */
const mockScoreBelow = {
  id: 'ps-002',
  orgId: ORG_ID,
  surveyId: 'survey-001',
  periodLabel: '2569-Q1',
  periodType: 'QUARTERLY',
  score: 42,
  overallScore: 42,
  dimensionScores: {
    SPEAK_UP: 40,
    HELP_SEEKING: 38,
    RISK_TAKING: 45,
    INCLUSION: 44,
  },
  responseCount: 18,
  computedAt: '2026-04-01T00:00:00Z',
} as unknown as PsScore;

const mockScoreMultiple = [
  { ...mockScoreAbove, id: 'ps-q2', periodLabel: '2569-Q2', score: 62, overallScore: 62 },
  { ...mockScoreBelow, id: 'ps-q1', periodLabel: '2569-Q1', score: 42, overallScore: 42 },
  {
    id: 'ps-q3',
    orgId: ORG_ID,
    surveyId: 'survey-003',
    periodLabel: '2569-Q3',
    periodType: 'QUARTERLY' as const,
    score: 71,
    overallScore: 71,
    dimensionScores: {
      SPEAK_UP: 72,
      HELP_SEEKING: 68,
      RISK_TAKING: 70,
      INCLUSION: 73,
    },
    responseCount: 30,
    computedAt: '2026-10-01T00:00:00Z',
  },
] as unknown as PsScore[];

const mockFeedbackPending: AnonymousFeedback = {
  id: 'fb-001',
  orgId: ORG_ID,
  category: 'SAFETY',
  sentiment: 'NEGATIVE',
  content: 'เครื่องจักรบางเครื่องยังไม่มีการล็อกก่อนซ่อมบำรุง',
  actionStatus: 'PENDING',
  actionNote: null,
  actionedBy: null,
  actionedAt: null,
  createdAt: '2026-07-10T08:30:00Z',
};

const mockFeedbackAcknowledged: AnonymousFeedback = {
  id: 'fb-002',
  orgId: ORG_ID,
  category: 'MANAGEMENT',
  sentiment: 'NEGATIVE',
  content: 'การสื่อสารระหว่างหัวหน้างานและพนักงานยังไม่ชัดเจน',
  actionStatus: 'ACKNOWLEDGED',
  actionNote: 'รับทราบแล้ว จะปรับปรุงการประชุมรายสัปดาห์',
  actionedBy: 'member-admin-001',
  actionedAt: '2026-07-12T10:00:00Z',
  createdAt: '2026-07-08T14:00:00Z',
};

const mockFeedbackResolved: AnonymousFeedback = {
  id: 'fb-003',
  orgId: ORG_ID,
  category: 'ENVIRONMENT',
  sentiment: 'POSITIVE',
  content: 'อุณหภูมิในโรงงานปรับดีขึ้นมากหลังติดตั้งระบบระบายอากาศใหม่',
  actionStatus: 'RESOLVED',
  actionNote: 'ดำเนินการติดตั้งระบบเสร็จสิ้นแล้ว',
  actionedBy: 'member-admin-001',
  actionedAt: '2026-07-20T09:00:00Z',
  createdAt: '2026-07-05T11:00:00Z',
};

const mockFeedbackProcess: AnonymousFeedback = {
  id: 'fb-004',
  orgId: ORG_ID,
  category: 'PROCESS',
  sentiment: 'NEUTRAL',
  content: 'ขั้นตอนการตรวจรับวัตถุดิบใช้เวลานานเกินไป',
  actionStatus: 'IN_PROGRESS',
  actionNote: 'กำลังทบทวนขั้นตอน',
  actionedBy: 'member-admin-001',
  actionedAt: '2026-07-15T08:00:00Z',
  createdAt: '2026-07-09T09:00:00Z',
};

const allMockFeedback: AnonymousFeedback[] = [
  mockFeedbackPending,
  mockFeedbackAcknowledged,
  mockFeedbackResolved,
  mockFeedbackProcess,
];

// ─── Helper: build radar chart data from a PsScore ───────────────────────────

function buildChartData(scores: PsScore[]) {
  if (!scores.length) return [];
  const latest = scores[scores.length - 1];
  return [
    { subject: 'พูดออกมา', value: latest.dimensionScores.SPEAK_UP, fullMark: 100 },
    { subject: 'ขอความช่วยเหลือ', value: latest.dimensionScores.HELP_SEEKING, fullMark: 100 },
    { subject: 'กล้าลองสิ่งใหม่', value: latest.dimensionScores.RISK_TAKING, fullMark: 100 },
    { subject: 'การรวมกลุ่ม', value: latest.dimensionScores.INCLUSION, fullMark: 100 },
  ];
}

// ─── OrgMember factories ──────────────────────────────────────────────────────

function makeMember(role: OrgMember['role']): OrgMember {
  return {
    memberId: `member-${role.toLowerCase()}-001`,
    orgId: ORG_ID,
    userId: `user-${role.toLowerCase()}-001`,
    email: `${role.toLowerCase()}@daph-decor.th`,
    displayName: `${role} User`,
    role,
    isActive: true,
    joinedAt: '2025-01-15T00:00:00Z',
    lastActiveAt: '2026-07-28T10:00:00Z',
  };
}

const memberOwner = makeMember('OWNER');
const memberAdmin = makeMember('ADMIN');
const memberViewer = makeMember('VIEWER');

// ─── Decorators ──────────────────────────────────────────────────────────────

/**
 * withCultureStore — patches Zustand store state for each story.
 *
 * IMPORTANT: The CultureDashboard component calls store selectors as
 * zero-argument methods on the state object (s.selectScoresForChart()).
 * These methods are NOT part of the real Zustand state. We must inject
 * them here as mock functions to prevent runtime errors in stories.
 */
function withCultureStore(patch: {
  psScores?: PsScore[];
  anonymousFeedback?: AnonymousFeedback[];
  isLoading?: boolean;
}) {
  return (Story: React.ComponentType) => {
    const psScores = patch.psScores ?? [];
    const anonymousFeedback = patch.anonymousFeedback ?? [];
    const isLoading = patch.isLoading ?? false;

    useCultureStore.setState({
      psScores,
      anonymousFeedback,
      // 10 loading flags — set all via the composite mock
      loadingScores: isLoading,
      loadingFeedback: isLoading,
      loadingTemplates: false,
      loadingActiveSurvey: false,
      creatingTemplate: false,
      updatingTemplate: false,
      submittingResponse: false,
      submittingFeedback: false,
      computingScore: false,
      actioningFeedback: false,
      // Mock async actions (no-ops for stories)
      fetchPsScores: async () => {},
      fetchAnonymousFeedback: async () => {},
      actionFeedback: async () => false,
      // ── CRITICAL: inject selector methods onto the state object ──────────
      // CultureDashboard calls these as: useCultureStore((s) => s.selectXxx())
      // They do NOT exist on the real store — we must stub them here.
      selectScoresForChart: () => buildChartData(psScores),
      selectIsAnyLoading: () => isLoading,
      selectPendingFeedback: () =>
        anonymousFeedback.filter((f) => f.actionStatus === 'PENDING'),
      selectCurrentPeriodLabel: () =>
        psScores.length > 0 ? psScores[psScores.length - 1].periodLabel : '—',
    } as any);

    return <Story />;
  };
}

/**
 * withTenantStore — sets currentMember in tenantStore for RBAC testing.
 */
function withTenantStore(member: OrgMember | null) {
  return (Story: React.ComponentType) => {
    useTenantStore.setState({ currentMember: member } as any);
    return <Story />;
  };
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<typeof CultureDashboard> = {
  title: 'Culture/CultureDashboard',
  component: CultureDashboard,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
**CultureDashboard** แสดงผล Psychological Safety scores, PS radar chart,
และ Anonymous Feedback ของ MONOLITH Manufacturing OS.

**RBAC gate:** \`ORG_ROLE_HIERARCHY[currentMember.role] >= 80\`
(OWNER=100, ADMIN=80 เห็น feedback panel; VIEWER=10 เห็นแค่ amber banner)

**Benchmark:** \`THAI_MANUFACTURING_PS_BENCHMARK = ${THAI_MANUFACTURING_PS_BENCHMARK}\`
        `,
      },
    },
  },
  args: {
    orgId: ORG_ID,
    animateCharts: false,
  },
  argTypes: {
    orgId: {
      description: 'Organization ID (scopes all store queries)',
      control: 'text',
    },
  },
};

export default meta;
type Story = StoryObj<typeof CultureDashboard>;

// ─── RBAC Stories ─────────────────────────────────────────────────────────────

/**
 * VIEWER role — ORG_ROLE_HIERARCHY['VIEWER']=10 < 80.
 * Shows amber banner "ความคิดเห็นนิรนามแสดงเฉพาะผู้ดูแลระบบ (ADMIN ขึ้นไป) เท่านั้น"
 * and does NOT render the anonymous feedback panel.
 */
export const NonAdminView: Story = {
  name: 'NonAdmin — VIEWER (Thai HiPD gate)',
  decorators: [
    withCultureStore({ psScores: [mockScoreAbove], anonymousFeedback: allMockFeedback }),
    withTenantStore(memberViewer),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'VIEWER role (hierarchy=10) — feedback panel is hidden; amber notice is shown.',
      },
    },
  },
};

/**
 * ADMIN role — ORG_ROLE_HIERARCHY['ADMIN']=80 >= 80.
 * Full dashboard with PS score, radar chart, and anonymous feedback panel.
 */
export const AdminWithFeedback: Story = {
  name: 'Admin — Full Dashboard (RBAC pass)',
  decorators: [
    withCultureStore({ psScores: [mockScoreAbove], anonymousFeedback: allMockFeedback }),
    withTenantStore(memberAdmin),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'ADMIN role (hierarchy=80) — full feedback panel rendered with 4 mock feedback items.',
      },
    },
  },
};

/**
 * OWNER role — hierarchy=100.
 * Same as Admin but with owner-level access.
 */
export const OwnerView: Story = {
  name: 'Owner — Full Dashboard (hierarchy=100)',
  decorators: [
    withCultureStore({ psScores: [mockScoreAbove], anonymousFeedback: allMockFeedback }),
    withTenantStore(memberOwner),
  ],
};

/**
 * No currentMember (null) — component should default isAdmin=false,
 * showing the non-admin amber banner.
 */
export const UnauthenticatedView: Story = {
  name: 'Unauthenticated (no currentMember)',
  decorators: [
    withCultureStore({ psScores: [mockScoreAbove], anonymousFeedback: allMockFeedback }),
    withTenantStore(null),
  ],
};

// ─── PS Score / Radar Chart Stories ──────────────────────────────────────────

/**
 * PS score = 62 > benchmark(55) — should show a positive/green indicator.
 */
export const PsScoresAboveBenchmark: Story = {
  name: 'PS Scores — Above Benchmark (62 > 55)',
  decorators: [
    withCultureStore({ psScores: [mockScoreAbove], anonymousFeedback: [] }),
    withTenantStore(memberAdmin),
  ],
  parameters: {
    docs: {
      description: {
        story: `Score 62 exceeds THAI_MANUFACTURING_PS_BENCHMARK=${THAI_MANUFACTURING_PS_BENCHMARK}. Radar chart should show all dimensions above midpoint.`,
      },
    },
  },
};

/**
 * PS score = 42 < benchmark(55) — should show warning/red indicator.
 */
export const PsScoresBelowBenchmark: Story = {
  name: 'PS Scores — Below Benchmark (42 < 55)',
  decorators: [
    withCultureStore({ psScores: [mockScoreBelow], anonymousFeedback: [] }),
    withTenantStore(memberAdmin),
  ],
  parameters: {
    docs: {
      description: {
        story: `Score 42 is below THAI_MANUFACTURING_PS_BENCHMARK=${THAI_MANUFACTURING_PS_BENCHMARK}. Dashboard should highlight low-score warning.`,
      },
    },
  },
};

/**
 * Multiple periods — 3 quarterly scores (Q1=42, Q2=62, Q3=71).
 * Chart should reflect the latest period (Q3).
 */
export const MultiplePeriods: Story = {
  name: 'PS Scores — Multiple Periods (Q1→Q3 trend)',
  decorators: [
    withCultureStore({ psScores: mockScoreMultiple, anonymousFeedback: allMockFeedback }),
    withTenantStore(memberAdmin),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'Three quarterly scores. selectCurrentPeriodLabel() returns "2569-Q3". Trend should be visible in chart.',
      },
    },
  },
};

// ─── Loading / Empty States ───────────────────────────────────────────────────

/**
 * selectIsAnyLoading() → true — skeleton / spinner state.
 */
export const LoadingState: Story = {
  name: 'Loading State (selectIsAnyLoading=true)',
  decorators: [
    withCultureStore({ psScores: [], anonymousFeedback: [], isLoading: true }),
    withTenantStore(memberAdmin),
  ],
};

/**
 * Empty store — no scores, no feedback. Shows empty-state UI.
 */
export const NoDataState: Story = {
  name: 'No Data (empty arrays)',
  decorators: [
    withCultureStore({ psScores: [], anonymousFeedback: [] }),
    withTenantStore(memberAdmin),
  ],
};

// ─── Category Filter Stories (play functions) ─────────────────────────────────

/**
 * Clicks the "ความปลอดภัย" (SAFETY) category tab button.
 * After click, only SAFETY feedback should be visible (1 item).
 */
export const CategoryFilter_Safety: Story = {
  name: 'Category Filter — ความปลอดภัย (SAFETY)',
  decorators: [
    withCultureStore({ psScores: [mockScoreAbove], anonymousFeedback: allMockFeedback }),
    withTenantStore(memberAdmin),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Click "ความปลอดภัย" tab button
    const safetyBtn = await canvas.findByRole('button', { name: /ความปลอดภัย/i });
    await userEvent.click(safetyBtn);
    // Safety feedback content should be visible
    await expect(
      canvas.getByText(/เครื่องจักรบางเครื่องยังไม่มีการล็อก/i)
    ).toBeVisible();
    // Management feedback should NOT be rendered under SAFETY filter
    await expect(
      canvas.queryByText(/การสื่อสารระหว่างหัวหน้างาน/i)
    ).not.toBeInTheDocument();
  },
};

/**
 * Clicks the "กระบวนการ" (PROCESS) category tab to verify filtering.
 */
export const CategoryFilter_Process: Story = {
  name: 'Category Filter — กระบวนการ (PROCESS)',
  decorators: [
    withCultureStore({ psScores: [mockScoreAbove], anonymousFeedback: allMockFeedback }),
    withTenantStore(memberAdmin),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const processBtn = await canvas.findByRole('button', { name: /กระบวนการ/i });
    await userEvent.click(processBtn);
    await expect(
      canvas.getByText(/ขั้นตอนการตรวจรับวัตถุดิบ/i)
    ).toBeVisible();
  },
};

// ─── Status Filter Stories (play functions) ───────────────────────────────────

/**
 * Selects RESOLVED from the status filter <select> combobox.
 * Only the resolved feedback item should remain visible.
 */
export const StatusFilter_Resolved: Story = {
  name: 'Status Filter — RESOLVED',
  decorators: [
    withCultureStore({ psScores: [mockScoreAbove], anonymousFeedback: allMockFeedback }),
    withTenantStore(memberAdmin),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Find the status filter combobox
    const statusSelect = await canvas.findByDisplayValue('ทุกสถานะ');
    await userEvent.selectOptions(statusSelect, 'RESOLVED');
    // Resolved feedback should be visible
    await expect(
      canvas.getByText(/อุณหภูมิในโรงงานปรับดีขึ้น/i)
    ).toBeVisible();
    // Pending feedback should NOT be visible
    await expect(
      canvas.queryByText(/เครื่องจักรบางเครื่องยังไม่มีการล็อก/i)
    ).not.toBeInTheDocument();
  },
};

/**
 * Selects PENDING from the status filter — only the 1 pending item shown.
 */
export const StatusFilter_Pending: Story = {
  name: 'Status Filter — PENDING',
  decorators: [
    withCultureStore({ psScores: [mockScoreAbove], anonymousFeedback: allMockFeedback }),
    withTenantStore(memberAdmin),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const statusSelect = await canvas.findByDisplayValue('ทุกสถานะ');
    await userEvent.selectOptions(statusSelect, 'PENDING');
    await expect(
      canvas.getByText(/เครื่องจักรบางเครื่องยังไม่มีการล็อก/i)
    ).toBeVisible();
    // Resolved/acknowledged items should NOT appear
    await expect(
      canvas.queryByText(/อุณหภูมิในโรงงานปรับดีขึ้น/i)
    ).not.toBeInTheDocument();
  },
};

// ─── actionFeedback spy stories ───────────────────────────────────────────────
//
// These stories use fn() from @storybook/test as a spy on the store's
// actionFeedback action. Each story resets the spy via mockClear() in its
// decorator, then asserts in the play function that the spy was called with
// the correct (id, newStatus) arguments.
//
// Mechanism: FeedbackItem renders a <select> per item. Changing the value fires
//   onChange → handleStatusChange(status) → onAction(feedback.id, status)
//   → CultureDashboard's `actionFeedback` from useCultureStore.
//
// Target: the PENDING feedback item ("เครื่องจักรบางเครื่องยังไม่มีการล็อก")
//   closest('.rounded-lg') container → combobox inside it.

/** Module-level spy — reset per story via mockClear() in decorator */
const mockActionFeedbackSpy = fn().mockResolvedValue(true);

/**
 * Extended withCultureStore decorator that wires the spy as actionFeedback.
 * Resets the spy before each story render via mockClear().
 */
function withCultureStoreAndActionSpy(patch: {
  psScores?: PsScore[];
  anonymousFeedback?: AnonymousFeedback[];
}) {
  return (Story: React.ComponentType) => {
    mockActionFeedbackSpy.mockClear();

    const psScores = patch.psScores ?? [];
    const anonymousFeedback = patch.anonymousFeedback ?? [];

    useCultureStore.setState({
      psScores,
      anonymousFeedback,
      loadingScores: false,
      loadingFeedback: false,
      loadingTemplates: false,
      loadingActiveSurvey: false,
      creatingTemplate: false,
      updatingTemplate: false,
      submittingResponse: false,
      submittingFeedback: false,
      computingScore: false,
      actioningFeedback: false,
      fetchPsScores: async () => {},
      fetchAnonymousFeedback: async () => {},
      // ── spy replaces no-op ──────────────────────────────────────────────
      actionFeedback: mockActionFeedbackSpy,
      // ── required selector stubs ─────────────────────────────────────────
      selectScoresForChart: () => buildChartData(psScores),
      selectIsAnyLoading: () => false,
      selectPendingFeedback: () =>
        anonymousFeedback.filter((f) => f.actionStatus === 'PENDING'),
      selectCurrentPeriodLabel: () =>
        psScores.length > 0 ? psScores[psScores.length - 1].periodLabel : '—',
    } as any);

    return <Story />;
  };
}

/**
 * INTERACTION TEST: Acknowledge
 *
 * Finds the PENDING feedback item by its content text, locates the
 * action <select> inside that card, and changes it to "ACKNOWLEDGED".
 * Asserts actionFeedback was called with (feedbackId='fb-001', 'ACKNOWLEDGED').
 */
export const ActionFeedback_Acknowledge: Story = {
  name: 'Interaction — actionFeedback: PENDING → ACKNOWLEDGED',
  decorators: [
    withCultureStoreAndActionSpy({
      psScores: [mockScoreAbove],
      anonymousFeedback: allMockFeedback,
    }),
    withTenantStore(memberAdmin),
  ],
  parameters: {
    docs: {
      description: {
        story: `
Verifies the full \`actionFeedback\` flow:

1. Locates the PENDING feedback item card by its Thai content text.
2. Finds the \`<select>\` (combobox) **inside** that card.
3. Changes the value to \`ACKNOWLEDGED\` via \`userEvent.selectOptions\`.
4. Asserts \`actionFeedback\` spy was called with \`('fb-001', 'ACKNOWLEDGED')\`.

The spy is reset via \`mockClear()\` before each story render.
        `,
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Locate the PENDING feedback item by its content text
    const feedbackText = await canvas.findByText(
      /เครื่องจักรบางเครื่องยังไม่มีการล็อก/i,
    );

    // Climb up to the rounded-lg card boundary
    const feedbackCard = feedbackText.closest('.rounded-lg') as HTMLElement;
    await expect(feedbackCard).not.toBeNull();

    // Find the action status select INSIDE this specific card
    const actionSelect = within(feedbackCard).getByRole('combobox');

    // Change status to ACKNOWLEDGED
    await userEvent.selectOptions(actionSelect, 'ACKNOWLEDGED');

    // Assert spy was called with the store action payload
    await expect(mockActionFeedbackSpy).toHaveBeenCalledOnce();
    await expect(mockActionFeedbackSpy).toHaveBeenCalledWith({
      feedbackId: 'fb-001',
      actionStatus: 'ACKNOWLEDGED',
    });
  },
};

/**
 * INTERACTION TEST: Resolve
 *
 * Changes an ACKNOWLEDGED feedback item to RESOLVED.
 * Asserts actionFeedback called with (feedbackId='fb-002', 'RESOLVED').
 */
export const ActionFeedback_Resolve: Story = {
  name: 'Interaction — actionFeedback: ACKNOWLEDGED → RESOLVED',
  decorators: [
    withCultureStoreAndActionSpy({
      psScores: [mockScoreAbove],
      anonymousFeedback: allMockFeedback,
    }),
    withTenantStore(memberAdmin),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'Changes the ACKNOWLEDGED feedback item (fb-002) to RESOLVED and asserts the spy call.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Locate the ACKNOWLEDGED feedback item (management feedback)
    const feedbackText = await canvas.findByText(
      /การสื่อสารระหว่างหัวหน้างานและพนักงาน/i,
    );
    const feedbackCard = feedbackText.closest('.rounded-lg') as HTMLElement;
    await expect(feedbackCard).not.toBeNull();

    const actionSelect = within(feedbackCard).getByRole('combobox');
    await userEvent.selectOptions(actionSelect, 'RESOLVED');

    await expect(mockActionFeedbackSpy).toHaveBeenCalledOnce();
    await expect(mockActionFeedbackSpy).toHaveBeenCalledWith({
      feedbackId: 'fb-002',
      actionStatus: 'RESOLVED',
    });
  },
};

/**
 * INTERACTION TEST: Dismiss
 *
 * Changes a PENDING feedback item to DISMISSED.
 * Asserts actionFeedback called with (feedbackId='fb-001', 'DISMISSED').
 */
export const ActionFeedback_Dismiss: Story = {
  name: 'Interaction — actionFeedback: PENDING → DISMISSED',
  decorators: [
    withCultureStoreAndActionSpy({
      psScores: [mockScoreAbove],
      anonymousFeedback: allMockFeedback,
    }),
    withTenantStore(memberAdmin),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const feedbackText = await canvas.findByText(
      /เครื่องจักรบางเครื่องยังไม่มีการล็อก/i,
    );
    const feedbackCard = feedbackText.closest('.rounded-lg') as HTMLElement;
    const actionSelect = within(feedbackCard).getByRole('combobox');

    await userEvent.selectOptions(actionSelect, 'DISMISSED');

    await expect(mockActionFeedbackSpy).toHaveBeenCalledOnce();
    await expect(mockActionFeedbackSpy).toHaveBeenCalledWith({
      feedbackId: 'fb-001',
      actionStatus: 'DISMISSED',
    });
  },
};

/**
 * INTERACTION TEST: Non-admin cannot trigger actionFeedback
 *
 * Verifies the entire feedback panel is absent for VIEWER role,
 * so actionFeedback is never callable from the UI.
 */
export const ActionFeedback_NonAdminGate: Story = {
  name: 'Interaction — VIEWER cannot access action controls (RBAC)',
  decorators: [
    withCultureStoreAndActionSpy({
      psScores: [mockScoreAbove],
      anonymousFeedback: allMockFeedback,
    }),
    withTenantStore(memberViewer),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'VIEWER role (hierarchy=10 < 80): the feedback panel is hidden, so actionFeedback spy must NOT be called. Amber notice visible.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Amber admin gate notice must be visible
    await expect(
      canvas.getByText(/ความคิดเห็นนิรนามแสดงเฉพาะผู้ดูแลระบบ/i),
    ).toBeVisible();

    // No action selects should be rendered (feedback panel is hidden)
    await expect(
      canvas.queryByText(/เครื่องจักรบางเครื่องยังไม่มีการล็อก/i),
    ).not.toBeInTheDocument();

    // Spy must never have been called
    await expect(mockActionFeedbackSpy).not.toHaveBeenCalled();
  },
};
