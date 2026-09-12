/**
 * src/culture-metrics/__tests__/CultureDashboard.test.tsx
 *
 * MONOLITH v17.5 — Vitest unit tests for CultureDashboard component
 *
 * Coverage:
 *   Plan gate        — FREE/STARTER blocked; PROFESSIONAL/ENTERPRISE pass
 *   Loading          — isLoading / isEnpsLoading → dashboard-loading
 *   Error banner     — error string → error-banner shown
 *   Surveys section  — no-surveys empty state; survey-card count;
 *                      survey-activate-btn (admin + DRAFT only);
 *                      survey-close-btn (admin + ACTIVE only);
 *                      activateEnpsSurvey / closeEnpsSurvey called correctly
 *   eNPS results     — nps-score-display above threshold; nps-hidden below
 *   Org health       — no-health-data empty state; health-metric-row count
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CultureDashboard from '../CultureDashboard';
import { useCultureMetricsStore } from '../cultureMetricsStore';
import type { CmdEnpsSurvey, CmdEnpsResults, CmdOrgHealth } from '../cultureMetricsTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Auto-mock the Zustand store
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../cultureMetricsStore');
const pulseBoard = vi.hoisted(() => vi.fn());
vi.mock('../TeamPulseBoard', () => ({
  default: (props: unknown) => { pulseBoard(props); return <div data-testid="pulse-integration" />; },
}));

it('mounts Team Pulse on its tab and forwards the authenticated identity', () => {
  vi.mocked(useCultureMetricsStore).mockReturnValue(makeStore());
  render(<CultureDashboard orgId="org-a" orgPlan="ENTERPRISE" isAdmin userId="user-a" />);
  expect(screen.queryByTestId('pulse-integration')).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('culture-tab-pulse'));
  expect(screen.getByTestId('pulse-integration')).toBeInTheDocument();
  expect(pulseBoard).toHaveBeenLastCalledWith({ orgId: 'org-a', plan: 'ENTERPRISE', isAdmin: true, userId: 'user-a' });
  fireEvent.click(screen.getByTestId('culture-tab-surveys'));
  expect(screen.queryByTestId('pulse-integration')).not.toBeInTheDocument();
});

// ─────────────────────────────────────────────────────────────────────────────
// Store factory
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeStore = (overrides: Record<string, any> = {}) => ({
  metricDefinitions:      [],
  snapshots:              [],
  orgHealth:              [] as CmdOrgHealth[],
  enpsSurveys:            [] as CmdEnpsSurvey[],
  enpsResults:            [] as CmdEnpsResults[],
  filters:                { metricCategory: 'ALL', periodType: 'ALL', fromDate: null, toDate: null },
  isLoading:              false,
  isSnapshotLoading:      false,
  isEnpsLoading:          false,
  error:                  null,
  fetchMetricDefinitions: vi.fn(),
  createMetricDefinition: vi.fn(),
  updateMetricDefinition: vi.fn(),
  recordSnapshot:         vi.fn(),
  fetchSnapshots:         vi.fn(),
  fetchOrgHealth:         vi.fn(),
  createEnpsSurvey:       vi.fn(),
  activateEnpsSurvey:     vi.fn(),
  closeEnpsSurvey:        vi.fn(),
  submitEnpsResponse:     vi.fn(),
  fetchEnpsSurveys:       vi.fn(),
  fetchEnpsResults:       vi.fn(),
  setFilters:             vi.fn(),
  clearError:             vi.fn(),
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// Sample data
// ─────────────────────────────────────────────────────────────────────────────

const DRAFT_SURVEY: CmdEnpsSurvey = {
  id:               'survey-draft',
  orgId:            'org-1',
  title:            'Q1 2027 eNPS Survey',
  titleTh:          'แบบสำรวจ eNPS Q1 2027',
  status:           'DRAFT',
  questionText:     'How likely are you to recommend working here?',
  followupQuestion: 'Why?',
  opensAt:          null,
  closesAt:         null,
  minResponses:     3,
  notes:            null,
  createdBy:        'user-1',
  createdAt:        '2027-01-01T00:00:00Z',
  updatedAt:        '2027-01-01T00:00:00Z',
};

const ACTIVE_SURVEY: CmdEnpsSurvey = {
  ...DRAFT_SURVEY,
  id:       'survey-active',
  status:   'ACTIVE',
  opensAt:  '2026-12-01T00:00:00Z',
  closesAt: '2026-12-31T00:00:00Z',
};

const CLOSED_SURVEY: CmdEnpsSurvey = {
  ...DRAFT_SURVEY,
  id:       'survey-closed',
  status:   'CLOSED',
  opensAt:  '2026-09-01T00:00:00Z',
  closesAt: '2026-09-30T00:00:00Z',
};

/** totalResponses (10) >= minResponses (3) → score revealed */
const RESULT_ABOVE: CmdEnpsResults = {
  surveyId:       'survey-closed',
  orgId:          'org-1',
  title:          'Q3 2026 eNPS',
  status:         'CLOSED',
  closesAt:       '2026-09-30T00:00:00Z',
  minResponses:   3,
  totalResponses: 10,
  promoterCount:  6,
  passiveCount:   2,
  detractorCount: 2,
  npsScore:       40,
  avgScore:       7.8,
};

/** totalResponses (2) < minResponses (3) → score hidden */
const RESULT_BELOW: CmdEnpsResults = {
  surveyId:       'survey-active',
  orgId:          'org-1',
  title:          'Q4 2026 eNPS',
  status:         'ACTIVE',
  closesAt:       '2026-12-31T00:00:00Z',
  minResponses:   3,
  totalResponses: 2,
  promoterCount:  1,
  passiveCount:   1,
  detractorCount: 0,
  npsScore:       0,
  avgScore:       6.0,
};

const HEALTH_ROWS: CmdOrgHealth[] = [
  {
    orgId:                 'org-1',
    metricId:              'metric-engagement',
    displayName:           'Employee Engagement',
    displayNameTh:         'ความผูกพันพนักงาน',
    metricCategory:        'ENGAGEMENT',
    metricSource:          'PS_SURVEY',
    targetScore:           80,
    warningThreshold:      60,
    criticalThreshold:     40,
    healthWeight:          0.3,
    latestScore:           72,
    latestRespondentCount: 45,
    latestPeriod:          '2026-Q3',
    latestSnapshotDate:    '2026-09-30',
    healthStatus:          'NORMAL',
  },
  {
    orgId:                 'org-1',
    metricId:              'metric-training',
    displayName:           'Training Completion',
    displayNameTh:         'อัตราการเรียนรู้สำเร็จ',
    metricCategory:        'CUSTOM',
    metricSource:          'OTHER',
    targetScore:           90,
    warningThreshold:      70,
    criticalThreshold:     50,
    healthWeight:          0.2,
    latestScore:           65,
    latestRespondentCount: 50,
    latestPeriod:          '2026-Q3',
    latestSnapshotDate:    '2026-09-30',
    healthStatus:          'WARNING',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Re-bind the mock before each test with a fresh store state */
function seedStore(overrides: Record<string, unknown> = {}) {
  vi.mocked(useCultureMetricsStore).mockReturnValue(
    makeStore(overrides) as ReturnType<typeof useCultureMetricsStore>,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('CultureDashboard', () => {
  beforeEach(() => {
    seedStore();
  });

  // ── Plan gate ──────────────────────────────────────────────────────────────
  describe('plan gate', () => {
    it('shows plan-gate-wall and hides culture-dashboard for FREE plan', () => {
      render(<CultureDashboard orgId="org-1" orgPlan="FREE" />);
      expect(screen.getByTestId('plan-gate-wall')).toBeInTheDocument();
      expect(screen.queryByTestId('culture-dashboard')).not.toBeInTheDocument();
    });

    it('shows plan-gate-wall and hides culture-dashboard for STARTER plan', () => {
      render(<CultureDashboard orgId="org-1" orgPlan="STARTER" />);
      expect(screen.getByTestId('plan-gate-wall')).toBeInTheDocument();
      expect(screen.queryByTestId('culture-dashboard')).not.toBeInTheDocument();
    });

    it('shows culture-dashboard and hides plan-gate-wall for PROFESSIONAL plan', () => {
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
      expect(screen.getByTestId('culture-dashboard')).toBeInTheDocument();
      expect(screen.queryByTestId('plan-gate-wall')).not.toBeInTheDocument();
    });

    it('shows culture-dashboard and hides plan-gate-wall for ENTERPRISE plan', () => {
      render(<CultureDashboard orgId="org-1" orgPlan="ENTERPRISE" />);
      expect(screen.getByTestId('culture-dashboard')).toBeInTheDocument();
      expect(screen.queryByTestId('plan-gate-wall')).not.toBeInTheDocument();
    });
  });

  // ── Loading ────────────────────────────────────────────────────────────────
  describe('loading state', () => {
    it('shows dashboard-loading when isLoading is true', () => {
      seedStore({ isLoading: true });
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
      expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
    });

    it('shows dashboard-loading when isEnpsLoading is true', () => {
      seedStore({ isEnpsLoading: true });
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
      expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
    });

    it('does not show dashboard-loading when both isLoading and isEnpsLoading are false', () => {
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
      expect(screen.queryByTestId('dashboard-loading')).not.toBeInTheDocument();
    });
  });

  // ── Error banner ───────────────────────────────────────────────────────────
  describe('error banner', () => {
    it('renders error-banner when store has an error', () => {
      seedStore({ error: 'เกิดข้อผิดพลาดในการโหลดข้อมูล' });
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
      expect(screen.getByTestId('error-banner')).toBeInTheDocument();
    });

    it('does not render error-banner when error is null', () => {
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
      expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
    });
  });

  // ── Surveys section ────────────────────────────────────────────────────────
  describe('surveys section', () => {
    it('shows no-surveys when enpsSurveys is empty', () => {
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
      expect(screen.getByTestId('no-surveys')).toBeInTheDocument();
    });

    it('renders the correct number of survey-card elements', () => {
      seedStore({ enpsSurveys: [DRAFT_SURVEY, ACTIVE_SURVEY, CLOSED_SURVEY] });
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
      expect(screen.getAllByTestId('survey-card')).toHaveLength(3);
    });

    it('shows survey-activate-btn for admin with a DRAFT survey', () => {
      seedStore({ enpsSurveys: [DRAFT_SURVEY] });
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin />);
      expect(screen.getByTestId('survey-activate-btn')).toBeInTheDocument();
    });

    it('hides survey-activate-btn for non-admin with a DRAFT survey', () => {
      seedStore({ enpsSurveys: [DRAFT_SURVEY] });
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin={false} />);
      expect(screen.queryByTestId('survey-activate-btn')).not.toBeInTheDocument();
    });

    it('shows survey-close-btn for admin with an ACTIVE survey', () => {
      seedStore({ enpsSurveys: [ACTIVE_SURVEY] });
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin />);
      expect(screen.getByTestId('survey-close-btn')).toBeInTheDocument();
    });

    it('hides survey-close-btn for admin with a DRAFT survey', () => {
      seedStore({ enpsSurveys: [DRAFT_SURVEY] });
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin />);
      expect(screen.queryByTestId('survey-close-btn')).not.toBeInTheDocument();
    });

    it('hides survey-close-btn for admin with a CLOSED survey', () => {
      seedStore({ enpsSurveys: [CLOSED_SURVEY] });
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin />);
      expect(screen.queryByTestId('survey-close-btn')).not.toBeInTheDocument();
    });

    it('calls activateEnpsSurvey(orgId, orgPlan, surveyId) when activate btn is clicked', () => {
      const activateEnpsSurvey = vi.fn();
      seedStore({ enpsSurveys: [DRAFT_SURVEY], activateEnpsSurvey });
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin />);
      fireEvent.click(screen.getByTestId('survey-activate-btn'));
      expect(activateEnpsSurvey).toHaveBeenCalledWith('org-1', 'PROFESSIONAL', 'survey-draft');
    });

    it('calls closeEnpsSurvey(orgId, orgPlan, surveyId) when close btn is clicked', () => {
      const closeEnpsSurvey = vi.fn();
      seedStore({ enpsSurveys: [ACTIVE_SURVEY], closeEnpsSurvey });
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin />);
      fireEvent.click(screen.getByTestId('survey-close-btn'));
      expect(closeEnpsSurvey).toHaveBeenCalledWith('org-1', 'PROFESSIONAL', 'survey-active');
    });
  });

  // ── eNPS results ───────────────────────────────────────────────────────────
  describe('eNPS results', () => {
    it('shows nps-score-display when totalResponses >= minResponses', () => {
      seedStore({ enpsResults: [RESULT_ABOVE] });
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
      expect(screen.getByTestId('nps-score-display')).toBeInTheDocument();
      expect(screen.queryByTestId('nps-hidden')).not.toBeInTheDocument();
    });

    it('shows nps-hidden when totalResponses < minResponses', () => {
      seedStore({ enpsResults: [RESULT_BELOW] });
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
      expect(screen.getByTestId('nps-hidden')).toBeInTheDocument();
      expect(screen.queryByTestId('nps-score-display')).not.toBeInTheDocument();
    });

    it('shows both nps-score-display and nps-hidden when results have mixed threshold states', () => {
      seedStore({ enpsResults: [RESULT_ABOVE, RESULT_BELOW] });
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
      expect(screen.getByTestId('nps-score-display')).toBeInTheDocument();
      expect(screen.getByTestId('nps-hidden')).toBeInTheDocument();
    });
  });

  // ── Org health section ─────────────────────────────────────────────────────
  describe('org health section', () => {
    it('shows no-health-data when orgHealth is empty', () => {
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
      expect(screen.getByTestId('no-health-data')).toBeInTheDocument();
    });

    it('renders the correct number of health-metric-row elements', () => {
      seedStore({ orgHealth: HEALTH_ROWS });
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
      expect(screen.getAllByTestId('health-metric-row')).toHaveLength(2);
    });

    it('does not show no-health-data when orgHealth rows are present', () => {
      seedStore({ orgHealth: HEALTH_ROWS });
      render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
      expect(screen.queryByTestId('no-health-data')).not.toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 12 additions
// ─────────────────────────────────────────────────────────────────────────────

// ── Effects on mount ──────────────────────────────────────────────────────────
describe('effects on mount', () => {
  it('calls fetchEnpsSurveys, fetchEnpsResults, and fetchOrgHealth with orgId on mount (PROFESSIONAL)', () => {
    const fetchEnpsSurveys   = vi.fn();
    const fetchEnpsResults   = vi.fn();
    const fetchOrgHealth     = vi.fn();
    seedStore({ fetchEnpsSurveys, fetchEnpsResults, fetchOrgHealth });
    render(<CultureDashboard orgId="org-42" orgPlan="PROFESSIONAL" />);
    expect(fetchEnpsSurveys).toHaveBeenCalledWith('org-42');
    expect(fetchEnpsResults).toHaveBeenCalledWith('org-42');
    expect(fetchOrgHealth).toHaveBeenCalledWith('org-42');
  });

  it('calls all three fetch actions with orgId on mount (ENTERPRISE)', () => {
    const fetchEnpsSurveys   = vi.fn();
    const fetchEnpsResults   = vi.fn();
    const fetchOrgHealth     = vi.fn();
    seedStore({ fetchEnpsSurveys, fetchEnpsResults, fetchOrgHealth });
    render(<CultureDashboard orgId="org-ent" orgPlan="ENTERPRISE" />);
    expect(fetchEnpsSurveys).toHaveBeenCalledWith('org-ent');
    expect(fetchEnpsResults).toHaveBeenCalledWith('org-ent');
    expect(fetchOrgHealth).toHaveBeenCalledWith('org-ent');
  });

  it('does NOT call fetchOrgHealth when plan is FREE (gate blocks effect)', () => {
    const fetchOrgHealth = vi.fn();
    seedStore({ fetchOrgHealth });
    render(<CultureDashboard orgId="org-1" orgPlan="FREE" />);
    expect(fetchOrgHealth).not.toHaveBeenCalled();
  });

  it('does NOT call fetchEnpsSurveys when plan is STARTER (gate blocks effect)', () => {
    const fetchEnpsSurveys = vi.fn();
    seedStore({ fetchEnpsSurveys });
    render(<CultureDashboard orgId="org-1" orgPlan="STARTER" />);
    expect(fetchEnpsSurveys).not.toHaveBeenCalled();
  });

  it('shows dashboard-loading skeleton while fetchOrgHealth is in progress (isLoading: true)', () => {
    const fetchOrgHealth = vi.fn();
    seedStore({ isLoading: true, fetchOrgHealth });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('org-health-section')).not.toBeInTheDocument();
  });
});

// ── createMetricDefinition — admin button ─────────────────────────────────────
describe('createMetricDefinition — admin button', () => {
  it('shows create-metric-btn for admin when orgHealth is empty', () => {
    seedStore({ orgHealth: [] });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin />);
    expect(screen.getByTestId('create-metric-btn')).toBeInTheDocument();
  });

  it('hides create-metric-btn for non-admin even when orgHealth is empty', () => {
    seedStore({ orgHealth: [] });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin={false} />);
    expect(screen.queryByTestId('create-metric-btn')).not.toBeInTheDocument();
  });

  it('hides create-metric-btn when orgHealth rows are present (not in empty state)', () => {
    seedStore({ orgHealth: HEALTH_ROWS });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin />);
    expect(screen.queryByTestId('create-metric-btn')).not.toBeInTheDocument();
  });

  it('calls createMetricDefinition with orgId, orgPlan, and default CUSTOM payload on click', () => {
    const createMetricDefinition = vi.fn().mockResolvedValue({});
    seedStore({ orgHealth: [], createMetricDefinition });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin />);
    fireEvent.click(screen.getByTestId('create-metric-btn'));
    expect(createMetricDefinition).toHaveBeenCalledWith(
      'org-1',
      'PROFESSIONAL',
      { metricCategory: 'CUSTOM', metricSource: 'OTHER', displayName: 'Metric ใหม่' },
    );
  });

  it('calls createMetricDefinition with ENTERPRISE plan when orgPlan is ENTERPRISE', () => {
    const createMetricDefinition = vi.fn().mockResolvedValue({});
    seedStore({ orgHealth: [], createMetricDefinition });
    render(<CultureDashboard orgId="org-ent" orgPlan="ENTERPRISE" isAdmin />);
    fireEvent.click(screen.getByTestId('create-metric-btn'));
    expect(createMetricDefinition).toHaveBeenCalledWith(
      'org-ent',
      'ENTERPRISE',
      { metricCategory: 'CUSTOM', metricSource: 'OTHER', displayName: 'Metric ใหม่' },
    );
  });
});

// ── Admin create-survey form ───────────────────────────────────────────────────
describe('admin create-survey form', () => {
  it('renders create-survey-form for admin when surveys list is empty', () => {
    seedStore({ enpsSurveys: [] });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin />);
    expect(screen.getByTestId('create-survey-form')).toBeInTheDocument();
    expect(screen.getByTestId('create-survey-title-input')).toBeInTheDocument();
    expect(screen.getByTestId('create-survey-submit-btn')).toBeInTheDocument();
  });

  it('hides create-survey-form for non-admin', () => {
    seedStore({ enpsSurveys: [] });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin={false} />);
    expect(screen.queryByTestId('create-survey-form')).not.toBeInTheDocument();
  });

  it('hides create-survey-form when surveys already exist (not in no-surveys state)', () => {
    seedStore({ enpsSurveys: [DRAFT_SURVEY] });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin />);
    expect(screen.queryByTestId('create-survey-form')).not.toBeInTheDocument();
  });

  it('does NOT call createEnpsSurvey when title input is empty on submit', () => {
    const createEnpsSurvey = vi.fn().mockResolvedValue({});
    seedStore({ enpsSurveys: [], createEnpsSurvey });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin />);
    fireEvent.submit(screen.getByTestId('create-survey-form'));
    expect(createEnpsSurvey).not.toHaveBeenCalled();
  });

  it('does NOT call createEnpsSurvey when title is whitespace only', () => {
    const createEnpsSurvey = vi.fn().mockResolvedValue({});
    seedStore({ enpsSurveys: [], createEnpsSurvey });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin />);
    fireEvent.change(screen.getByTestId('create-survey-title-input'), {
      target: { value: '   ' },
    });
    fireEvent.submit(screen.getByTestId('create-survey-form'));
    expect(createEnpsSurvey).not.toHaveBeenCalled();
  });

  it('calls createEnpsSurvey(orgId, orgPlan, { title }) when a valid title is submitted', () => {
    const createEnpsSurvey = vi.fn().mockResolvedValue({});
    seedStore({ enpsSurveys: [], createEnpsSurvey });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin />);
    fireEvent.change(screen.getByTestId('create-survey-title-input'), {
      target: { value: 'Q2 2027 eNPS Survey' },
    });
    fireEvent.submit(screen.getByTestId('create-survey-form'));
    expect(createEnpsSurvey).toHaveBeenCalledOnce();
    expect(createEnpsSurvey).toHaveBeenCalledWith('org-1', 'PROFESSIONAL', {
      title: 'Q2 2027 eNPS Survey',
    });
  });

  it('trims leading/trailing whitespace from the title before calling createEnpsSurvey', () => {
    const createEnpsSurvey = vi.fn().mockResolvedValue({});
    seedStore({ enpsSurveys: [], createEnpsSurvey });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" isAdmin />);
    fireEvent.change(screen.getByTestId('create-survey-title-input'), {
      target: { value: '  Q2 Survey  ' },
    });
    fireEvent.submit(screen.getByTestId('create-survey-form'));
    expect(createEnpsSurvey).toHaveBeenCalledWith('org-1', 'PROFESSIONAL', {
      title: 'Q2 Survey',
    });
  });
});

// ── WithMetricGrid scenario (NORMAL + WARNING + CRITICAL) ─────────────────────
describe('WithMetricGrid scenario', () => {
  const CRITICAL_ROW: CmdOrgHealth = {
    orgId:                 'org-1',
    metricId:              'metric-turnover',
    displayName:           'Employee Turnover Rate',
    displayNameTh:         'อัตราการลาออกพนักงาน',
    metricCategory:        'ENGAGEMENT',
    metricSource:          'OTHER',
    targetScore:           15,
    warningThreshold:      20,
    criticalThreshold:     30,
    healthWeight:          0.5,
    latestScore:           35,
    latestRespondentCount: 50,
    latestPeriod:          '2026-Q3',
    latestSnapshotDate:    '2026-09-30',
    healthStatus:          'CRITICAL',
  };

  const METRIC_GRID = [...HEALTH_ROWS, CRITICAL_ROW]; // NORMAL + WARNING + CRITICAL

  it('renders exactly 3 health-metric-row elements for METRIC_GRID', () => {
    seedStore({ orgHealth: METRIC_GRID });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
    expect(screen.getAllByTestId('health-metric-row')).toHaveLength(3);
  });

  it('does NOT show no-health-data when METRIC_GRID rows are present', () => {
    seedStore({ orgHealth: METRIC_GRID });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
    expect(screen.queryByTestId('no-health-data')).not.toBeInTheDocument();
  });

  it('CRITICAL badge has the red colour classes (text-red-700 bg-red-50)', () => {
    seedStore({ orgHealth: METRIC_GRID });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
    // The CRITICAL badge is the span with data-health-status="CRITICAL"
    const criticalBadge = document.querySelector('[data-health-status="CRITICAL"]');
    expect(criticalBadge).toBeInTheDocument();
    expect(criticalBadge).toHaveClass('text-red-700');
    expect(criticalBadge).toHaveClass('bg-red-50');
  });

  it('NORMAL badge has the blue colour classes (text-blue-700 bg-blue-50)', () => {
    seedStore({ orgHealth: METRIC_GRID });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
    const normalBadge = document.querySelector('[data-health-status="NORMAL"]');
    expect(normalBadge).toBeInTheDocument();
    expect(normalBadge).toHaveClass('text-blue-700');
    expect(normalBadge).toHaveClass('bg-blue-50');
  });

  it('WARNING badge has the amber colour classes (text-amber-700 bg-amber-50)', () => {
    seedStore({ orgHealth: METRIC_GRID });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
    const warningBadge = document.querySelector('[data-health-status="WARNING"]');
    expect(warningBadge).toBeInTheDocument();
    expect(warningBadge).toHaveClass('text-amber-700');
    expect(warningBadge).toHaveClass('bg-amber-50');
  });

  it('shows the correct latestScore for the CRITICAL row', () => {
    seedStore({ orgHealth: METRIC_GRID });
    render(<CultureDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);
    // The CRITICAL row card should show score 35
    const criticalRow = document.querySelector('[data-metric-id="metric-turnover"]');
    expect(criticalRow).toBeInTheDocument();
    expect(criticalRow).toHaveTextContent('35');
  });
});
