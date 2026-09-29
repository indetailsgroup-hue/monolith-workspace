/**
 * src/culture-metrics/__tests__/cultureMetricsStore.test.ts
 *
 * MONOLITH v17.5 — Culture Metrics Dashboard Store
 * Framework: Vitest + capturing thenable Proxy Supabase mock
 *
 * Mock strategy: vi.hoisted declares mockSupabase so the vi.mock factory can
 * reference it safely after hoisting.  Mutable state (mockResult, lastInsertArgs,
 * lastFromTable) lives at module scope; beforeEach wires mockSupabase.from to a
 * fresh makeCapturingProxy so captures reset every test.
 *
 * Coverage:
 *  Plan gate — PROFESSIONAL+ (PROFESSIONAL or ENTERPRISE)
 *    - createMetricDefinition: FREE / STARTER throw CultureMetricsPlanGateError;
 *      PROFESSIONAL / ENTERPRISE resolve
 *    - createEnpsSurvey: FREE / STARTER throw; PROFESSIONAL / ENTERPRISE resolve
 *    - updateMetricDefinition, recordSnapshot, activateEnpsSurvey, closeEnpsSurvey
 *      throw for FREE
 *
 *  submitEnpsResponse — plan-gate exemption
 *    - resolves without an orgPlan argument
 *    - inserts to cmd_enps_responses table
 *    - insert args contain NO user_id / employee_id columns (anonymity model)
 *    - insert args contain anonymous_token, score, survey_id
 *    - supabase.auth.getUser is NOT called
 *
 *  fetchEnpsResults — view behaviour
 *    - queries cmd_enps_results_v
 *    - empty data → enpsResults remains empty
 *    - populated data → rows mapped and stored correctly
 *    - npsScore null when view returns null (total_responses < min_responses)
 *    - sets error on DB failure
 *    - resets isEnpsLoading to false after completion
 *
 *  setFilters — partial merge without clobbering other fields
 *  clearError — resets error to null, idempotent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCK SUPABASE — hoisted so vi.mock factory can reference it
// ============================================================================

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(),
  auth: {
    getUser: vi.fn(),
  },
}));

vi.mock('../../core/supabase', () => ({ supabase: mockSupabase }));

// ============================================================================
// IMPORTS (after mock)
// ============================================================================

import { useCultureMetricsStore } from '../cultureMetricsStore';
import { CultureMetricsPlanGateError, DEFAULT_CMD_FILTERS } from '../cultureMetricsTypes';
import type { EnpsResultsRow } from '../cultureMetricsTypes';

// ============================================================================
// CAPTURING PROXY — module-level state reset in beforeEach
// ============================================================================

let mockResult: { data: unknown; error: unknown } = { data: null, error: null };
let lastInsertArgs: unknown = null;
let lastUpdateArgs: unknown = null;
let lastFromTable: string | null = null;

function makeCapturingProxy(): unknown {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string | symbol) {
      if (prop === 'then') {
        return (
          onFulfilled?: (v: unknown) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) => Promise.resolve(mockResult).then(onFulfilled, onRejected);
      }
      if (prop === 'insert') {
        return (args: unknown) => {
          lastInsertArgs = args;
          return makeCapturingProxy();
        };
      }
      if (prop === 'update') {
        return (args: unknown) => {
          lastUpdateArgs = args;
          return makeCapturingProxy();
        };
      }
      return (..._args: unknown[]) => makeCapturingProxy();
    },
  };
  return new Proxy({} as Record<string, unknown>, handler);
}

// ============================================================================
// HELPERS
// ============================================================================

function makeEnpsResultsRow(overrides: Partial<EnpsResultsRow> = {}): EnpsResultsRow {
  return {
    survey_id: 'survey-1',
    org_id: 'org-1',
    title: 'Q1 2027 eNPS',
    status: 'CLOSED',
    closes_at: '2027-03-31',
    min_responses: 3,
    total_responses: 10,
    promoter_count: 6,
    passive_count: 3,
    detractor_count: 1,
    nps_score: 50,
    avg_score: 7.8,
    ...overrides,
  };
}

function makeMetricDefinitionRow() {
  return {
    id: 'metric-1',
    org_id: 'org-1',
    metric_category: 'ENGAGEMENT',
    metric_source: 'PS_SURVEY',
    display_name: 'Employee Satisfaction',
    display_name_th: null,
    min_score: 0,
    max_score: 100,
    target_score: 75,
    warning_threshold: 60,
    critical_threshold: 40,
    health_weight: 1.0,
    description: null,
    is_active: true,
    is_system: false,
    created_by: 'user-cmd-001',
    created_at: new Date().toISOString(),
  };
}

function makeEnpsSurveyRow() {
  return {
    id: 'survey-1',
    org_id: 'org-1',
    title: 'Q1 2027 eNPS',
    title_th: null,
    status: 'DRAFT',
    question_text: 'คุณมีแนวโน้มแนะนำองค์กรนี้แก่คนรู้จักมากน้อยแค่ไหน? (0–10)',
    followup_question: null,
    opens_at: null,
    closes_at: null,
    min_responses: 3,
    total_responses: 0,
    notes: null,
    created_by: 'user-cmd-001',
    created_at: new Date().toISOString(),
  };
}

// ============================================================================
// TEST SETUP
// ============================================================================

beforeEach(() => {
  useCultureMetricsStore.setState({
    metricDefinitions: [],
    snapshots: [],
    orgHealth: [],
    enpsSurveys: [],
    enpsResults: [],
    filters: { ...DEFAULT_CMD_FILTERS },
    isLoading: false,
    isSnapshotLoading: false,
    isEnpsLoading: false,
    error: null,
  });

  lastInsertArgs = null;
  lastUpdateArgs = null;
  lastFromTable = null;
  mockResult = { data: null, error: null };

  mockSupabase.from.mockClear();
  mockSupabase.auth.getUser.mockClear();

  mockSupabase.from.mockImplementation((table: string) => {
    lastFromTable = table;
    return makeCapturingProxy();
  });
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: { id: 'user-cmd-001' } },
    error: null,
  });
});

// ============================================================================
// PLAN GATE — PROFESSIONAL+ only
// ============================================================================

describe('Plan gate — PROFESSIONAL+ only', () => {
  const nonProfessionalPlans = ['FREE', 'STARTER'] as const;
  const professionalPlans = ['PROFESSIONAL', 'ENTERPRISE'] as const;
  const orgId = 'org-1';

  describe('createMetricDefinition', () => {
    for (const plan of nonProfessionalPlans) {
      it(`throws CultureMetricsPlanGateError for ${plan}`, async () => {
        await expect(
          useCultureMetricsStore.getState().createMetricDefinition(orgId, plan, {
            metricCategory: 'ENGAGEMENT',
            metricSource: 'PS_SURVEY',
            displayName: 'Satisfaction',
          }),
        ).rejects.toBeInstanceOf(CultureMetricsPlanGateError);
      });
    }

    for (const plan of professionalPlans) {
      it(`resolves for ${plan}`, async () => {
        mockResult = { data: makeMetricDefinitionRow(), error: null };
        await expect(
          useCultureMetricsStore.getState().createMetricDefinition(orgId, plan, {
            metricCategory: 'ENGAGEMENT',
            metricSource: 'PS_SURVEY',
            displayName: 'Satisfaction',
          }),
        ).resolves.toMatchObject({ id: 'metric-1', displayName: 'Employee Satisfaction' });
      });
    }
  });

  describe('createEnpsSurvey', () => {
    for (const plan of nonProfessionalPlans) {
      it(`throws CultureMetricsPlanGateError for ${plan}`, async () => {
        await expect(
          useCultureMetricsStore.getState().createEnpsSurvey(orgId, plan, {
            title: 'Q1 Survey',
          }),
        ).rejects.toBeInstanceOf(CultureMetricsPlanGateError);
      });
    }

    for (const plan of professionalPlans) {
      it(`resolves for ${plan}`, async () => {
        mockResult = { data: makeEnpsSurveyRow(), error: null };
        await expect(
          useCultureMetricsStore.getState().createEnpsSurvey(orgId, plan, {
            title: 'Q1 Survey',
          }),
        ).resolves.toMatchObject({ id: 'survey-1', title: 'Q1 2027 eNPS' });
      });
    }
  });

  describe('other gated write actions throw for FREE', () => {
    it('updateMetricDefinition throws CultureMetricsPlanGateError', async () => {
      await expect(
        useCultureMetricsStore
          .getState()
          .updateMetricDefinition(orgId, 'FREE', 'metric-1', { targetScore: 80 }),
      ).rejects.toBeInstanceOf(CultureMetricsPlanGateError);
    });

    it('recordSnapshot throws CultureMetricsPlanGateError', async () => {
      await expect(
        useCultureMetricsStore.getState().recordSnapshot(orgId, 'FREE', {
          metricId: 'metric-1',
          periodType: 'MONTHLY',
          periodLabel: '2027-02',
          snapshotDate: '2027-02-28',
          score: 72,
        }),
      ).rejects.toBeInstanceOf(CultureMetricsPlanGateError);
    });

    it('activateEnpsSurvey throws CultureMetricsPlanGateError', async () => {
      await expect(
        useCultureMetricsStore.getState().activateEnpsSurvey(orgId, 'FREE', 'survey-1'),
      ).rejects.toBeInstanceOf(CultureMetricsPlanGateError);
    });

    it('closeEnpsSurvey throws CultureMetricsPlanGateError', async () => {
      await expect(
        useCultureMetricsStore.getState().closeEnpsSurvey(orgId, 'FREE', 'survey-1'),
      ).rejects.toBeInstanceOf(CultureMetricsPlanGateError);
    });
  });
});

// ============================================================================
// submitEnpsResponse — plan-gate exemption
// ============================================================================

describe('submitEnpsResponse — plan-gate exemption', () => {
  const orgId = 'org-1';
  const payload = {
    surveyId: 'survey-1',
    score: 9,
    anonymousToken: 'anon-tok-abc123',
    followupText: 'Great culture!',
    departmentLabel: 'Engineering',
  };

  it('resolves without providing orgPlan (no gate)', async () => {
    mockResult = { data: null, error: null };
    await expect(
      useCultureMetricsStore.getState().submitEnpsResponse(orgId, payload),
    ).resolves.toBeUndefined();
  });

  it('inserts to cmd_enps_responses table', async () => {
    mockResult = { data: null, error: null };
    await useCultureMetricsStore.getState().submitEnpsResponse(orgId, payload);
    expect(lastFromTable).toBe('cmd_enps_responses');
  });

  it('insert args contain score, survey_id, and anonymous_token', async () => {
    mockResult = { data: null, error: null };
    await useCultureMetricsStore.getState().submitEnpsResponse(orgId, payload);
    const args = lastInsertArgs as Record<string, unknown>;
    expect(args.score).toBe(9);
    expect(args.survey_id).toBe('survey-1');
    expect(args.anonymous_token).toBe('anon-tok-abc123');
  });

  it('insert args do NOT include user_id or employee_id (anonymity)', async () => {
    mockResult = { data: null, error: null };
    await useCultureMetricsStore.getState().submitEnpsResponse(orgId, payload);
    const args = lastInsertArgs as Record<string, unknown>;
    expect(args).not.toHaveProperty('user_id');
    expect(args).not.toHaveProperty('employee_id');
  });

  it('does NOT call supabase.auth.getUser (anonymous submission)', async () => {
    mockResult = { data: null, error: null };
    await useCultureMetricsStore.getState().submitEnpsResponse(orgId, payload);
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
  });
});

// ============================================================================
// fetchEnpsResults — view behaviour / min_responses
// ============================================================================

describe('fetchEnpsResults', () => {
  const orgId = 'org-1';

  it('queries the cmd_enps_results_v view', async () => {
    mockResult = { data: [], error: null };
    await useCultureMetricsStore.getState().fetchEnpsResults(orgId);
    expect(lastFromTable).toBe('cmd_enps_results_v');
  });

  it('stores empty enpsResults when data array is empty', async () => {
    mockResult = { data: [], error: null };
    await useCultureMetricsStore.getState().fetchEnpsResults(orgId);
    expect(useCultureMetricsStore.getState().enpsResults).toHaveLength(0);
  });

  it('maps and stores rows when data is populated', async () => {
    const row1 = makeEnpsResultsRow({ survey_id: 'survey-1', nps_score: 50 });
    const row2 = makeEnpsResultsRow({ survey_id: 'survey-2', nps_score: 30, total_responses: 5 });
    mockResult = { data: [row1, row2], error: null };

    await useCultureMetricsStore.getState().fetchEnpsResults(orgId);
    const { enpsResults } = useCultureMetricsStore.getState();
    expect(enpsResults).toHaveLength(2);
    expect(enpsResults[0].surveyId).toBe('survey-1');
    expect(enpsResults[0].npsScore).toBe(50);
    expect(enpsResults[1].surveyId).toBe('survey-2');
    expect(enpsResults[1].totalResponses).toBe(5);
  });

  it('maps npsScore: null when view returns null (below min_responses threshold)', async () => {
    const row = makeEnpsResultsRow({
      survey_id: 'survey-3',
      total_responses: 1,
      nps_score: null,
      promoter_count: null,
      passive_count: null,
      detractor_count: null,
    });
    mockResult = { data: [row], error: null };

    await useCultureMetricsStore.getState().fetchEnpsResults(orgId);
    const { enpsResults } = useCultureMetricsStore.getState();
    expect(enpsResults[0].npsScore).toBeNull();
    expect(enpsResults[0].promoterCount).toBeNull();
    expect(enpsResults[0].totalResponses).toBe(1);
  });

  it('sets error state on DB failure', async () => {
    // Store catches the Supabase error object (not instanceof Error) and uses
    // the fallback message string defined in the catch block.
    mockResult = { data: null, error: { message: 'view unavailable' } };
    await useCultureMetricsStore.getState().fetchEnpsResults(orgId);
    expect(useCultureMetricsStore.getState().error).toBe('Failed to load eNPS results');
  });

  it('resets isEnpsLoading to false after fetch completes', async () => {
    mockResult = { data: [], error: null };
    await useCultureMetricsStore.getState().fetchEnpsResults(orgId);
    expect(useCultureMetricsStore.getState().isEnpsLoading).toBe(false);
  });
});

// ============================================================================
// setFilters — partial merge
// ============================================================================

describe('setFilters — partial merge', () => {
  it('merges a single field without clobbering other fields', () => {
    const store = useCultureMetricsStore.getState();
    store.setFilters({ metricCategory: 'ENGAGEMENT', periodType: 'MONTHLY' });
    useCultureMetricsStore.getState().setFilters({ metricCategory: 'CUSTOM' });
    const { filters } = useCultureMetricsStore.getState();
    expect(filters.metricCategory).toBe('CUSTOM');
    expect(filters.periodType).toBe('MONTHLY');
  });

  it('updates fromDate and toDate independently', () => {
    const store = useCultureMetricsStore.getState();
    store.setFilters({ fromDate: '2027-01-01' });
    useCultureMetricsStore.getState().setFilters({ toDate: '2027-06-30' });
    const { filters } = useCultureMetricsStore.getState();
    expect(filters.fromDate).toBe('2027-01-01');
    expect(filters.toDate).toBe('2027-06-30');
  });
});

// ============================================================================
// clearError
// ============================================================================

describe('clearError', () => {
  it('resets error to null', () => {
    useCultureMetricsStore.setState({ error: 'Network timeout' });
    useCultureMetricsStore.getState().clearError();
    expect(useCultureMetricsStore.getState().error).toBeNull();
  });

  it('is idempotent when error is already null', () => {
    useCultureMetricsStore.setState({ error: null });
    expect(() => useCultureMetricsStore.getState().clearError()).not.toThrow();
    expect(useCultureMetricsStore.getState().error).toBeNull();
  });
});

// ============================================================================
// fetchOrgHealth
// ============================================================================

function makeOrgHealthRow(overrides: Partial<{
  org_id: string; metric_id: string; display_name: string; display_name_th: string | null;
  metric_category: string; metric_source: string; target_score: number | null;
  warning_threshold: number | null; critical_threshold: number | null; health_weight: number;
  latest_score: number; latest_respondent_count: number; latest_period: string;
  latest_snapshot_date: string; health_status: string;
}> = {}) {
  return {
    org_id:                  'org-1',
    metric_id:               'metric-eng-1',
    display_name:            'Employee Engagement',
    display_name_th:         null,
    metric_category:         'ENGAGEMENT',
    metric_source:           'PS_SURVEY',
    target_score:            80,
    warning_threshold:       60,
    critical_threshold:      40,
    health_weight:           0.3,
    latest_score:            72,
    latest_respondent_count: 45,
    latest_period:           '2026-Q3',
    latest_snapshot_date:    '2026-09-30',
    health_status:           'NORMAL',
    ...overrides,
  };
}

describe('fetchOrgHealth', () => {
  const orgId = 'org-1';

  it('queries the cmd_org_health_v view', async () => {
    mockResult = { data: [], error: null };
    await useCultureMetricsStore.getState().fetchOrgHealth(orgId);
    expect(lastFromTable).toBe('cmd_org_health_v');
  });

  it('stores empty orgHealth when data array is empty', async () => {
    mockResult = { data: [], error: null };
    await useCultureMetricsStore.getState().fetchOrgHealth(orgId);
    expect(useCultureMetricsStore.getState().orgHealth).toHaveLength(0);
  });

  it('maps DB rows to camelCase CmdOrgHealth objects', async () => {
    const row1 = makeOrgHealthRow({ metric_id: 'metric-1', latest_score: 72, health_status: 'NORMAL' });
    const row2 = makeOrgHealthRow({ metric_id: 'metric-2', latest_score: 55, health_status: 'WARNING', display_name_th: 'ประสิทธิภาพ' });
    mockResult = { data: [row1, row2], error: null };

    await useCultureMetricsStore.getState().fetchOrgHealth(orgId);
    const { orgHealth } = useCultureMetricsStore.getState();

    expect(orgHealth).toHaveLength(2);
    expect(orgHealth[0].metricId).toBe('metric-1');
    expect(orgHealth[0].latestScore).toBe(72);
    expect(orgHealth[0].healthStatus).toBe('NORMAL');
    expect(orgHealth[1].metricId).toBe('metric-2');
    expect(orgHealth[1].latestScore).toBe(55);
    expect(orgHealth[1].healthStatus).toBe('WARNING');
    expect(orgHealth[1].displayNameTh).toBe('ประสิทธิภาพ');
  });

  it('maps all camelCase fields from a single row correctly', async () => {
    const row = makeOrgHealthRow({
      org_id: 'org-99', metric_id: 'metric-turnover',
      display_name: 'Turnover', display_name_th: 'อัตราการลาออก',
      metric_category: 'CUSTOM', metric_source: 'OTHER',
      target_score: 15, warning_threshold: 20, critical_threshold: 30,
      health_weight: 0.5, latest_score: 35, latest_respondent_count: 50,
      latest_period: '2026-Q4', latest_snapshot_date: '2026-12-31',
      health_status: 'CRITICAL',
    });
    mockResult = { data: [row], error: null };

    await useCultureMetricsStore.getState().fetchOrgHealth('org-99');
    const h = useCultureMetricsStore.getState().orgHealth[0];

    expect(h.orgId).toBe('org-99');
    expect(h.metricId).toBe('metric-turnover');
    expect(h.displayName).toBe('Turnover');
    expect(h.displayNameTh).toBe('อัตราการลาออก');
    expect(h.metricCategory).toBe('CUSTOM');
    expect(h.metricSource).toBe('OTHER');
    expect(h.targetScore).toBe(15);
    expect(h.warningThreshold).toBe(20);
    expect(h.criticalThreshold).toBe(30);
    expect(h.healthWeight).toBe(0.5);
    expect(h.latestRespondentCount).toBe(50);
    expect(h.latestPeriod).toBe('2026-Q4');
    expect(h.latestSnapshotDate).toBe('2026-12-31');
    expect(h.healthStatus).toBe('CRITICAL');
  });

  it('sets error to "Failed to load org health data" on DB failure', async () => {
    mockResult = { data: null, error: { message: 'relation does not exist' } };
    await useCultureMetricsStore.getState().fetchOrgHealth(orgId);
    expect(useCultureMetricsStore.getState().error).toBe('Failed to load org health data');
  });

  it('resets isLoading to false after fetch completes (success)', async () => {
    mockResult = { data: [], error: null };
    await useCultureMetricsStore.getState().fetchOrgHealth(orgId);
    expect(useCultureMetricsStore.getState().isLoading).toBe(false);
  });

  it('resets isLoading to false after fetch completes (error)', async () => {
    mockResult = { data: null, error: { message: 'timeout' } };
    await useCultureMetricsStore.getState().fetchOrgHealth(orgId);
    expect(useCultureMetricsStore.getState().isLoading).toBe(false);
  });
});

// ============================================================================
// createMetricDefinition — payload mapping, state update, error path
// ============================================================================

describe('createMetricDefinition — payload mapping and state update', () => {
  const orgId = 'org-1';
  const plan  = 'PROFESSIONAL' as const;

  const fullPayload = {
    metricCategory:    'ENGAGEMENT' as const,
    metricSource:      'PS_SURVEY' as const,
    displayName:       'Employee Satisfaction',
    displayNameTh:     'ความพึงพอใจพนักงาน',
    minScore:          0,
    maxScore:          100,
    targetScore:       75,
    warningThreshold:  60,
    criticalThreshold: 40,
    healthWeight:      1.5,
    description:       'Quarterly satisfaction survey score',
  };

  it('inserts into cmd_metric_definitions with snake_case field mapping', async () => {
    mockResult = { data: makeMetricDefinitionRow(), error: null };
    await useCultureMetricsStore.getState().createMetricDefinition(orgId, plan, fullPayload);

    const args = lastInsertArgs as Record<string, unknown>;
    expect(args.org_id).toBe('org-1');
    expect(args.metric_category).toBe('ENGAGEMENT');
    expect(args.metric_source).toBe('PS_SURVEY');
    expect(args.display_name).toBe('Employee Satisfaction');
    expect(args.display_name_th).toBe('ความพึงพอใจพนักงาน');
    expect(args.min_score).toBe(0);
    expect(args.max_score).toBe(100);
    expect(args.target_score).toBe(75);
    expect(args.warning_threshold).toBe(60);
    expect(args.critical_threshold).toBe(40);
    expect(args.health_weight).toBe(1.5);
    expect(args.description).toBe('Quarterly satisfaction survey score');
  });

  it('applies null defaults for optional fields when omitted', async () => {
    mockResult = { data: makeMetricDefinitionRow(), error: null };
    await useCultureMetricsStore.getState().createMetricDefinition(orgId, plan, {
      metricCategory: 'ENGAGEMENT',
      metricSource:   'PS_SURVEY',
      displayName:    'Minimal Metric',
    });

    const args = lastInsertArgs as Record<string, unknown>;
    expect(args.display_name_th).toBeNull();
    expect(args.target_score).toBeNull();
    expect(args.warning_threshold).toBeNull();
    expect(args.critical_threshold).toBeNull();
    expect(args.description).toBeNull();
    expect(args.min_score).toBe(0);
    expect(args.max_score).toBe(100);
    expect(args.health_weight).toBe(1.0);
  });

  it('appends the new definition to metricDefinitions state', async () => {
    mockResult = { data: makeMetricDefinitionRow(), error: null };
    await useCultureMetricsStore.getState().createMetricDefinition(orgId, plan, {
      metricCategory: 'ENGAGEMENT',
      metricSource:   'PS_SURVEY',
      displayName:    'Satisfaction',
    });
    expect(useCultureMetricsStore.getState().metricDefinitions).toHaveLength(1);
    expect(useCultureMetricsStore.getState().metricDefinitions[0].id).toBe('metric-1');
  });

  it('accumulates multiple definitions without clobbering previous ones', async () => {
    const row2 = { ...makeMetricDefinitionRow(), id: 'metric-2', display_name: 'Training' };
    mockResult = { data: makeMetricDefinitionRow(), error: null };
    await useCultureMetricsStore.getState().createMetricDefinition(orgId, plan, {
      metricCategory: 'ENGAGEMENT', metricSource: 'PS_SURVEY', displayName: 'Satisfaction',
    });

    mockResult = { data: row2, error: null };
    await useCultureMetricsStore.getState().createMetricDefinition(orgId, plan, {
      metricCategory: 'CUSTOM', metricSource: 'OTHER', displayName: 'Training',
    });

    const defs = useCultureMetricsStore.getState().metricDefinitions;
    expect(defs).toHaveLength(2);
    expect(defs[0].id).toBe('metric-1');
    expect(defs[1].id).toBe('metric-2');
  });

  it('sets error to "Failed to create metric definition" on DB failure and re-throws', async () => {
    mockResult = { data: null, error: { message: 'insert failed' } };
    await expect(
      useCultureMetricsStore.getState().createMetricDefinition(orgId, plan, {
        metricCategory: 'ENGAGEMENT', metricSource: 'PS_SURVEY', displayName: 'Will fail',
      }),
    ).rejects.toBeDefined();
    expect(useCultureMetricsStore.getState().error).toBe('Failed to create metric definition');
  });

  it('does not append to metricDefinitions on DB failure', async () => {
    mockResult = { data: null, error: { message: 'unique violation' } };
    await expect(
      useCultureMetricsStore.getState().createMetricDefinition(orgId, plan, {
        metricCategory: 'ENGAGEMENT', metricSource: 'PS_SURVEY', displayName: 'Dupe',
      }),
    ).rejects.toBeDefined();
    expect(useCultureMetricsStore.getState().metricDefinitions).toHaveLength(0);
  });
});
