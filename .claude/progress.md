# Monolith Implementation Progress

> **Current product version:** `v17.5.2` — sourced from the root `package.json`. This release candidate contains the completed v17.5.2 work and the 2026-09-07 release-readiness stabilization; v17.5.3+ and v18.x remain forward implementation records until separately released.
>
> **Public release status:** All production gates for v17.5.2 passed on 2026-09-07, including both Edge Functions deployments. Publication proceeds from the exact release-PR merge commit after its final CI run passes.

**Status last verified:** 2026-09-07

## Forward implementation track — Interactive OrgChart, Role Network View, QC Anomaly Detection, AI Quotation Draft, Leadership Action Tracker (target: Q2 2027; not released)

### ✅ Completed (v18.0 — sprint 1: Interactive OrgChart schema + types + store)
- `supabase/migrations/20270201_interactive_orgchart.sql` — `org_chart_nodes`, `org_reporting_lines`, `org_chart_hierarchy_v` (recursive CTE), `oc_is_professional_plus()`, trigger, 6 indexes, 7 RLS policies, assertion block
- `src/orgchart/orgChartTypes.ts` — `OrgNodeType`/`OcLineType` unions; DB + app-layer types; 4 payloads; `OcFilters`/`DEFAULT_OC_FILTERS`; `canAccessOrgChart`/`OrgChartPlanGateError`; Thai label constants; `mapOcNodeRow`, `mapOcReportingLineRow`, `buildOcTree`, `flattenOcTree`
- `src/orgchart/orgChartStore.ts` — `useOrgChartStore`; 7 async actions (PROFESSIONAL+ gated writes); `moveNode` optimistic drag update; `fetchChart` parallel fetch + tree build; UI helpers: `selectNode`, `toggleExpand`, `setDragging`, `setFilters`, `clearError`

### ✅ Completed (v18.0 — sprint 2: OrgChartCanvas UI + orgChartTypes tests + Role Network View schema/types/store)
- `src/orgchart/OrgChartCanvas.tsx` — PROFESSIONAL+-gated canvas; `NodeCard`/`ReportingLinesSvg`/`NodeDetailPanel` sub-components; pointer-event drag with `dragState` useRef; `moveNode` on pointerUp; reporting line toggle; node detail panel with line type swap
- `src/orgchart/__tests__/orgChartTypes.test.ts` — 42 Vitest unit tests (all passing); 8 describe blocks: `canAccessOrgChart` plan gate, `buildOcTree` parent-child wiring, `flattenOcTree` depth-first order, `mapOcNodeRow` depth/path fields, and mappers/payloads/constants
- `supabase/migrations/20270205_role_network_view.sql` — `rnv_roles`, `rnv_role_relationships`, `rnv_employee_roles`; `rnv_role_network_v` view (current_headcount + relationship_count); `rnv_is_enterprise()` gate; full RLS; 8 indexes; assertion block
- `src/role-network/roleNetworkTypes.ts` — `RnvRelationshipType` (5 types) + `RnvSeniority` (5 levels); DB + app-layer types; payloads; `canAccessRoleNetwork`/`RoleNetworkPlanGateError` (ENTERPRISE only); Thai label constants; mappers
- `src/role-network/roleNetworkStore.ts` — `useRoleNetworkStore`; 8 ENTERPRISE-gated actions; `fetchNetwork` parallel fetch; `deleteRole` immediate local cleanup (cascades relationships/employeeRoles, resets selectedRoleId)

### ✅ Completed (v18.0 — sprint 3: OrgChartCanvas stories + orgChartStore tests + RoleNetworkCanvas UI)
- `src/orgchart/OrgChartCanvas.stories.tsx` — 10 CSF3 Storybook stories; `withOrgChartStore` decorator; stories cover plan gate, empty, node drag, reporting line toggle, node detail panel; `userEvent` play functions; `fn()` spies
- `src/orgchart/__tests__/orgChartStore.test.ts` — 34 Vitest unit tests (**all passing**); plan gate on all 6 write actions, `moveNode` optimistic update + rollback + error persistence, `fetchChart` tree build, `deleteNode` cascade
- `src/orgchart/orgChartStore.ts` — fix: `moveNode` catch block re-ordered (`fetchChart` → `set({error})`) to preserve error after rollback re-fetch
- `src/role-network/RoleNetworkCanvas.tsx` — ENTERPRISE-gated canvas; `computeNodePositions`/`computeCanvasSize` layout utils; sub-components: `RoleNodeCard` (seniority + headcount badges), `RelationshipEdgesSvg` (SVG arrowheads + dashed DEPENDS_ON + Thai labels), `RoleDetailPanel` (add/remove relationship controls); all data-testids; named + default export

### ✅ Completed (v18.0 — sprint 4: RoleNetworkCanvas stories + roleNetworkStore tests + QC Anomaly Detection module)
- `src/role-network/RoleNetworkCanvas.stories.tsx` — 10 CSF3 Storybook stories; `withRoleNetworkStore` decorator; `addRelationshipSpy`/`removeRelationshipSpy` fn() spies; play functions for add/remove relationship interactions; full ENTERPRISE gate wall, empty state, loading, error, node graph, edge rendering coverage
- `src/role-network/__tests__/roleNetworkStore.test.ts` — **52 Vitest unit tests, all passing**; 24 plan gate reject tests; 8 ENTERPRISE pass tests; fetchNetwork (5), deleteRole (4), addRelationship (4), removeRelationship (2), UI helpers (5)
- `supabase/migrations/20270210_qc_anomaly_detection.sql` — 4 enums; `qca_threshold_configs`, `qca_measurements`, `qca_anomaly_events` tables; `qca_anomaly_summary_v` view; `qca_is_enterprise()` plan gate; `qca_detect_anomaly()` AFTER INSERT trigger (MIN/MAX/RANGE + ZSCORE with rolling 30-measurement stddev_pop); RLS (ENTERPRISE SELECT, ADMIN+ write); 7 indexes; assertion block
- `src/qc-anomaly/qcAnomalyTypes.ts` — 4 enum types; DB row + app-layer types; payloads; `DEFAULT_QCA_FILTERS`; `canAccessQcAnomaly`/`QcAnomalyPlanGateError`; Thai label constants × 4 + getters × 4 + mappers × 4
- `src/qc-anomaly/qcAnomalyStore.ts` — `useQcAnomalyStore`; 8 ENTERPRISE-gated actions (fetchThresholds, createThreshold, updateThreshold, deleteThreshold, fetchAnomalies, acknowledgeAnomaly, resolveAnomaly, submitMeasurement); 3 UI helpers

### ✅ Completed (v18.0 — sprint 5: QcAnomalyDashboard + qcAnomalyStore tests + AI Quotation Draft module)
- `src/qc-anomaly/QcAnomalyDashboard.tsx` — ENTERPRISE-gated dashboard; ThresholdConfigPanel (inline CRUD), AnomalyEventList (severity badges, acknowledge/resolve), SummaryMetricCards, QcaFilters bar
- `src/qc-anomaly/__tests__/qcAnomalyStore.test.ts` — **57 Vitest unit tests, all passing**; plan gate (32), fetchAnomalies (5), acknowledgeAnomaly (4), resolveAnomaly (4), submitMeasurement (6), fetchThresholds (3), threshold CRUD (3); loading-state tests use `useQcAnomalyStore.subscribe` pattern (React 18 batch-safe)
- `supabase/migrations/20270215_ai_quotation_draft.sql` — 2 enums, 3 tables (with GENERATED column), view, 3 functions+triggers, RLS (ENTERPRISE+hierarchy≥80 for writes), 8 indexes, assertion block
- `src/ai-quotation/aiQuotationDraftTypes.ts` — full type system; AqdDraftStatus/AqdLineItemType enums; DB + app-layer types; payloads; `canAccessAiQuotation`/`AiQuotationPlanGateError`; Thai labels; mappers; `AqdFilters`/`DEFAULT_AQD_FILTERS`
- `src/ai-quotation/aiQuotationDraftStore.ts` — `useAiQuotationDraftStore`; 10 ENTERPRISE-gated actions; optimistic rollback on submitForReview/approveDraft/rejectDraft; UI helpers

### ✅ Completed (v18.5 — sprint 8: LAT Component Tests + Stories + 2S2P1C Org Health Score Module)
- `src/leadership-actions/__tests__/LeadershipActionBoard.test.tsx` — **58 Vitest component tests, all passing**; ENTERPRISE plan gate renders gate wall (FREE/PROFESSIONAL), loading state, summary bar counts, filter bar select interactions, new-action form submit + cancel, detail panel complete/cancel/reassign, admin delete visibility, post-update form, error banner + clear, no-selection placeholder; `renderBoard` helper; `vi.mock('../leadershipActionStore')` auto-mock pattern
- `src/leadership-actions/LeadershipActionBoard.stories.tsx` — **15 CSF3 Storybook stories**; `withLeadershipActionStore` decorator; all async spies `.mockResolvedValue(undefined)`; 5 play-function stories (FilterBar, NewActionForm, Complete, Cancel, PostUpdate)
- `supabase/migrations/20270227_org_health_score.sql` — `ohs_dimension`/`ohs_score_grade` enums; `ohs_scoring_configs`, `ohs_health_snapshots`, `ohs_dimension_scores` tables; `ohs_current_score_v` view; `ohs_compute_health_score` SECURITY DEFINER function (SAFETY/PROCESS from QCA, SATISFACTION from eNPS, CULTURE from culture_metrics, PERFORMANCE placeholder); full RLS + indexes
- `src/org-health/orgHealthScoreTypes.ts` — `OhsDimension`/`OhsScoreGrade`; row types + app-layer types including `OhsCurrentScore` with `dimensionMap`; Thai labels; `deriveOhsGrade`; `canAccessOrgHealthScore`/`OrgHealthScorePlanGateError`; mappers × 4; `DEFAULT_OHS_SCORING_CONFIG`
- `src/org-health/orgHealthScoreStore.ts` — `useOrgHealthScoreStore`; 6 ENTERPRISE-gated actions (fetchLatestScore, fetchHistory, computeScore, fetchScoringConfig, updateScoringConfig, upsertScoringConfig); UI helpers (selectSnapshot, clearError)

### ✅ Completed (v18.5 — sprint 9: OrgHealthScoreBoard UI + OHS Store Tests + QcAnomalyDashboard Component Tests)
- `src/org-health/OrgHealthScoreBoard.tsx` — full ENTERPRISE-gated UI (640 lines): plan gate wall, score gauge, grade badge, 5-dimension cards with progress bars (SAFETY/SATISFACTION/PERFORMANCE/PROCESS/CULTURE), snapshot history table, inline weight config panel (per-dimension %, edit/save/cancel), compute button, error banner; all `ohs-*` testids
- `src/org-health/__tests__/orgHealthScoreStore.test.ts` — Vitest unit tests for all 6 store actions + UI helpers; `vi.hoisted` mock with `setResult`/`setRpcResult`/`resetMock`/`makeChain` (terminalOp pattern handles upsertScoringConfig double from() call); `describe.each(PLAN_GATE_ACTIONS)` for 6-action plan gate; success/loading/error/null paths
- `src/qc-anomaly/__tests__/QcAnomalyDashboard.test.tsx` — Vitest component tests: explicit `StoreShape` interface (resolves Zustand auto-mock unknown issue); `makeStore`/`renderBoard` helpers; plan gate · loading · summary cards · filter bar · anomaly list · acknowledge · resolve · threshold toggle · error banner
- `src/qc-anomaly/QcAnomalyDashboard.tsx` — fixed 4 tsc errors: `METRIC_KEYS` corrected to QcaMetricKey values, `threshold_value` → `threshold_breach_detail`, `acknowledgeAnomaly`/`resolveAnomaly` 3-arg → 2-arg

### ✅ Completed (v18.5 — sprint 12: CultureDashboard Component Tests + Admin UI Extensions)
- `src/culture-metrics/CultureDashboard.tsx` — extended: `useState` import; `createEnpsSurvey`/`createMetricDefinition` destructured from store; create-survey mini-form (`create-survey-form`, `create-survey-title-input`, `create-survey-submit-btn`) in `no-surveys` empty state (admin only) with blank/whitespace guard; `create-metric-btn` in `no-health-data` empty state (admin only) with default CUSTOM payload
- `src/culture-metrics/__tests__/CultureDashboard.test.tsx` — 23 new tests across 4 describe blocks: `effects on mount` (5: fetch actions called for PROFESSIONAL/ENTERPRISE; blocked FREE/STARTER; loading skeleton); `createMetricDefinition — admin button` (5: presence by role/state; args verification); `admin create-survey form` (7: presence; blank/whitespace guard; valid submit with trim); `WithMetricGrid scenario` (6: row count; no-health-data absent; CRITICAL/NORMAL/WARNING badge colours; CRITICAL score display)
- Vitest: **87/87 passed** (CultureDashboard.test.tsx: 47 | cultureMetricsStore.test.ts: 40)
- CHANGELOG: `[18.5.4]` entry added

### ✅ Completed (v18.5 — sprint 11: CultureDashboard Store Tests + WithMetricGrid Story)
- `src/culture-metrics/__tests__/cultureMetricsStore.test.ts` — extended: `fetchOrgHealth` (6 tests: view query, empty data, row mapping, full camelCase field mapping, error path, isLoading resets x2); `createMetricDefinition — payload mapping and state update` (6 tests: snake_case insert mapping, null defaults, state append, accumulation, error path, no-append on failure)
- `src/culture-metrics/CultureDashboard.stories.tsx` — story #12 `WithMetricGrid`: org-health-section grid with NORMAL + WARNING + CRITICAL health status rows (3-item `METRIC_GRID` fixture)

### ✅ Completed (v18.5 — sprint 10: OrgHealthScoreBoard Stories + Component Tests + Culture Metrics Store)
- `src/org-health/OrgHealthScoreBoard.stories.tsx` — 13 CSF3 stories; decorator factory; fn() spies; 2 play functions (ConfigPanelEditSave, ComputeNow)
- `src/org-health/__tests__/OrgHealthScoreBoard.test.tsx` — Vitest component tests: plan gate, score gauge, dimension weights, config panel inline edit/cancel/save, compute button, error banner
- `src/culture-metrics/cultureMetricsTypes.ts` — rewritten: standalone camelCase app-layer types; CmdFilters updated (metricCategory/periodType); CMD_HEALTH_STATUS_COLOR/CMD_HEALTH_STATUS_LABEL_TH with HEALTHY key; EnpsResultsRow alias; new mappers
- `src/culture-metrics/cultureMetricsStore.ts` — rewritten: state fields aligned (enpsSurveys/enpsResults/orgHealth/isSnapshotLoading/isEnpsLoading); 11 actions with correct signatures; fetchEnpsResults with isEnpsLoading + 'Failed to load eNPS results'; submitEnpsResponse plan-gate exempt (no auth.getUser); all camelCase payloads

### ✅ Completed (v18.0 — sprint 7: Leadership Action Board UI + Storybook Stories + LAT Tests)
- `src/leadership-actions/LeadershipActionBoard.tsx` — ENTERPRISE-gated UI; plan-gate wall, loading state, summary bar (open/in-progress/blocked/completed counts from `actions` array), filter bar (status/priority/category), new-action form, action list with status/priority/category Thai-label badges, detail panel (complete/cancel/reassign via `window.prompt`, post-update form, updates list), error banner; all `lat-*` data-testids; zero TS errors
- `src/ai-quotation/AiQuotationDraftBoard.stories.tsx` — 18 CSF3 Storybook stories; `withAiQuotationDraftStore` decorator (no explicit return type — inferred); `fn()` spies; `userEvent` play functions for 5 interactive stories; TS clean
- `src/qc-anomaly/QcAnomalyDashboard.stories.tsx` — 14 CSF3 Storybook stories; `withQcAnomalyStore` decorator; `fn()` spies; `userEvent` play functions; fixed `last_anomaly_at` field in SUMMARIES fixtures; TS clean
- `src/leadership-actions/__tests__/leadershipActionStore.test.ts` — **70 Vitest unit tests, all passing**; ENTERPRISE plan gate (30 reject + 10 pass); full CRUD + optimistic rollback; loading-state tests use subscribe pattern; mock helpers return full app-layer types (`LatAction`/`LatActionAssignment`/`LatActionUpdate`); TS clean

### ✅ Completed (v18.0 — sprint 6: AiQuotationDraftBoard + Leadership Action Tracker + aiQuotationDraftStore tests)
- `src/ai-quotation/AiQuotationDraftBoard.tsx` — ENTERPRISE-gated UI; draft list (status/AI badges), new-draft form, editable line items table (DRAFT only), AddLineItemForm, totals footer, workflow buttons (submit/approve/reject), GenerationLogPanel (lazy Supabase), SummaryBar, filter bar, error banner, plan-gate wall
- `supabase/migrations/20270220_leadership_action_tracker.sql` — 3 enums, 3 tables (lat_actions/lat_action_assignments/lat_action_updates), view (lat_action_summary_v), triggers, RLS, 10 indexes
- `src/leadership-actions/leadershipActionTypes.ts` — LatActionStatus/LatActionPriority/LatActionCategory enums; DB row types × 4; app-layer aliases; payloads × 4; canAccessLeadershipActions / LeadershipActionPlanGateError; Thai labels + getters + mappers; LatFilters/DEFAULT_LAT_FILTERS
- `src/leadership-actions/leadershipActionStore.ts` — `useLeadershipActionStore`; 10 ENTERPRISE-gated actions; optimistic rollback on completeAction/cancelAction; UI helpers
- `src/ai-quotation/__tests__/aiQuotationDraftStore.test.ts` — **74 Vitest unit tests, all passing**; plan gate (10), fetchDrafts parallel (3), CRUD (9), workflow optimistic (6), line items (12), loading-state subscribe pattern

**Roadmap target updated:** 2027-03-13

---

## v17.5 — Training Tracker + Super Employee Tracker + AI Cost Estimation (v17.5.0 and v17.5.1 tagged 2026-09-01; v17.5.2 release candidate; v17.5.3+ not released)

**Tag v17.5.0:** `3a819c17` | **Tag v17.5.1:** `532783be`
**PR #76:** merged (squash `3a819c17`) | **PR #77:** merged (squash `af6f329b`)

### ✅ All completed (v17.5.0 — Tasks 1–40 via PR #76 + PR #77)
- `supabase/migrations/20270101_training_tracker.sql` — 3 tables, `tt_is_professional_plus()`, 2 triggers, 2 views, RLS, 10 seed courses
- `src/training/trainingTypes.ts` — full type system (8 categories, 4 statuses, plan gate, all interfaces)
- `src/training/trainingStore.ts` — Zustand store; `TrainingPlanGateError`; fetchCourses, enroll, logCompletion (optimistic), bulkEnroll, CRUD
- `src/training/__tests__/trainingTypes.test.ts` — 50+ Vitest tests
- `src/training/__tests__/trainingStore.test.ts` — 55 Vitest tests; plan gate FREE/STARTER/PROFESSIONAL/ENTERPRISE; optimistic rollbacks
- `src/training/TrainingCourseList.tsx` — PROFESSIONAL+ gate, debounced search, category/stage/isActive filters, enroll button
- `src/training/TrainingEnrollmentPanel.tsx` — bulk enroll; employee tag add/remove; due date picker; status timeline; 15 data-testids
- `src/training/__tests__/TrainingEnrollmentPanel.test.tsx` — ~30 Vitest tests; plan gate wall, tag add/remove, bulkEnroll error path, timeline
- `src/training/TrainingCourseList.stories.tsx` — 10 Storybook stories incl. AdminEnrollFlow interaction test
- `src/training/superEmployeeTypes.ts` — AI Readiness types; `SuperEmployeeTrackerPlanGateError`; `STAGE_PROGRESSION_ORDER`; mappers ×5
- `src/training/superEmployeeStore.ts` — `useSuperEmployeeStore`; 9 actions; PROFESSIONAL+ gated writes; `resolveSkillGap` optimistic update
- `supabase/migrations/20270115_super_employee_tracker.sql` — `employee_ai_assessments`, `employee_stage_history`, `employee_skill_gaps`; 2 views; RLS; assertion block
- `src/jobs/ProcessTemplateList.stories.tsx` — `CloneFlowInteraction` story appended (12 total)
- `.github/ISSUE_TEMPLATE/v17-process-templates-bug.yml` — bug report template (labels: bug, v17-process-templates)

### ✅ All completed (v17.5.1 — Tasks 41–45, merged PR #77 + direct to main)
- `src/training/__tests__/superEmployeeStore.test.ts` — ~95 Vitest tests; 11 describe blocks; plan gate guard, recordStageTransition, resolveSkillGap (no pre-mutation), fetchStageHistory, fetchSkillGaps, clearError; thenable Proxy mock + auth.getUser stub
- `src/training/SuperEmployeeProgressPanel.tsx` — 5-step stage timeline; AI Readiness badge at AI_ASSISTED+; admin resolve gap; plan gate wall; loading skeleton; 14 data-testids
- `src/training/TrainingEnrollmentPanel.stories.tsx` — 8 CSF3 stories; `withEnrollmentStore` decorator; BulkEnrollSuccess + BulkEnrollErrorPath play interactions
- `src/training/SuperEmployeeProgressPanel.stories.tsx` — 11 CSF3 stories; `withProgressStore` decorator; all 5 stage timeline states verified; AdminResolveInteraction play test
- `supabase/migrations/20270120_ai_cost_estimation.sql` — 4 tables, 2 views, `ace_is_enterprise()`, full RLS, 6 indexes, assertion block (ENTERPRISE plan)
- `src/ai-cost/aiCostEstimationTypes.ts` — complete type system; 6 union types; 6 DB row + 6 app-layer types; 5 payloads; plan gate + error; constants + utilities + 6 mappers
- `src/ai-cost/aiCostEstimationStore.ts` — `useAiCostEstimationStore`; 16 actions across 4 domains; auto-compute cost in logUsage + createTaskEstimate; ENTERPRISE gate

### ✅ All completed (v17.5.2 — AI Cost Estimation tests + dashboard + stories)
- `src/ai-cost/__tests__/aiCostEstimationTypes.test.ts` — pure unit tests; plan gate, canAccess, computeTokenCostUsd, computeRoiPct, usdToThb, DEFAULT_AI_COST_FILTERS, label constants, all 6 mappers
- `src/ai-cost/__tests__/aiCostEstimationStore.test.ts` — thenable Proxy mock; plan gate on all 8 write actions, clearError, setFilters, fetchCostModels, logUsage cost computation (all 5 CostUnit types), createTaskEstimate ROI, updateActuals
- `src/ai-cost/AiCostDashboard.tsx` — ENTERPRISE-gated; summary cards, budget utilization (progress bar + over-threshold warning), monthly trend (CSS bar chart), usage-by-tool table; 20 data-testids
- `src/ai-cost/AiCostDashboard.stories.tsx` — 8 CSF3 stories; withDashboardStore decorator; PlanGateWallFree, PlanGateWallProfessional, DashboardLoading, EmptyState, WithUsageData (play assertions), WithBudgetUtilization, BudgetOverThreshold (play assertion), AdminView, StoreError

### ✅ All completed (v17.5.5 — AiSchedulerBoard Stories & Tests + CultureDashboard UI)
- `src/ai-scheduler/AiSchedulerBoard.stories.tsx` — 12 CSF3 stories: PlanGateWallFree, PlanGateWallProfessional, EmptyRuns, 8×Timeline (all statuses), WithApproveAction, WithCancelAction; fn() spies; play functions with userEvent.click + dataset assertions
- `src/ai-scheduler/__tests__/AiSchedulerBoard.test.tsx` — 16 tests (plan gate ×4, timeline attributes ×5, approve btn ×7); all passing; vi.mock auto-mock + fireEvent pattern
- `src/culture-metrics/CultureDashboard.tsx` — PROFESSIONAL+-gated dashboard; surveys/eNPS-results/org-health sections; SurveyCard/EnpsResultCard/HealthMetricRow sub-components; 13 data-testids

### ✅ All completed (v17.5.4 — AiSchedulerBoard + APS Store Tests + Culture Metrics Store Tests)
- `src/ai-scheduler/AiSchedulerBoard.tsx` — ENTERPRISE-gated board; two-panel layout; `RunCard` with approve/cancel; `RunStatusTimeline` (6 steps + terminal CANCELLED/FAILED branch); items table + override badge; 20 data-testids
- `src/ai-scheduler/__tests__/aiSchedulerStore.test.ts` — 33 tests (plan gate ×27, auto-sequence ×4, approveRun auth write ×3, updateItemStatus is_overridden ×3, setFilters ×2, clearError ×2); all passing
- `src/culture-metrics/__tests__/cultureMetricsStore.test.ts` — 36 tests (plan gate ×12, submitEnpsResponse exemption ×5, fetchEnpsResults ×6, setFilters ×2, clearError ×2); all passing

### ✅ All completed (v17.5.3 — AI Production Scheduler + Culture Metrics Dashboard + AiCostDashboard tests)
- `supabase/migrations/20270125_ai_production_scheduler.sql` — `aps_schedule_runs`, `aps_schedule_items` (`depends_on UUID[]`, `ai_confidence_score`), `aps_run_events`; `aps_run_summary_v`; ENTERPRISE gate; RLS; 6 indexes
- `src/ai-scheduler/aiSchedulerTypes.ts` — `ApsRunStatus` (7 states), `ApsItemStatus`, `ApsEventType`; DB + app-layer types; payloads; `AiSchedulerPlanGateError`; label constants; 4 mappers
- `src/ai-scheduler/aiSchedulerStore.ts` — `useAiSchedulerStore`; 5 fetch + 5 write actions (ENTERPRISE gate); `addScheduleItem` auto-sets `sequence_order`; `approveRun` writes `approved_by`/`approved_at`; `updateItemStatus` sets `is_overridden` when `overrideReason` provided
- `supabase/migrations/20270125_culture_metrics_dashboard.sql` — `cmd_metric_definitions`, `cmd_metric_snapshots`, `cmd_enps_surveys`, `cmd_enps_responses` (no user_id); `cmd_org_health_v`, `cmd_enps_results_v` (hides until `min_responses`); PROFESSIONAL+ gate; RLS
- `src/culture-metrics/cultureMetricsTypes.ts` — `CmdMetricCategory`, `CmdSnapshotTrend`, `CmdSurveyStatus`, `CmdHealthTier`; DB + app-layer types; payloads; `CultureMetricsPlanGateError`; `DEFAULT_CMD_FILTERS`; 6 mappers
- `src/culture-metrics/cultureMetricsStore.ts` — `useCultureMetricsStore`; 14 actions; PROFESSIONAL+ gate on writes; `submitEnpsResponse` exempt (anonymous survey); queries 4 tables + 2 views
- `src/ai-cost/__tests__/AiCostDashboard.test.tsx` — 10 Vitest tests: plan gate (FREE/PROFESSIONAL), loading, empty states, 4 summary cards, budget over-threshold (90% ≥ 80%), budget under-threshold, 3 trend bars, error banner, admin upgrade copy

### ✅ Completed (v17.5.5)
- AI Production Scheduler UI (AiSchedulerBoard stories + component tests)
- Culture Metrics Dashboard UI (CultureDashboard.tsx)

### ✅ Completed (v17.5.6) — v17.5 FULLY COMPLETE
- `src/culture-metrics/CultureDashboard.stories.tsx` — 11 CSF3 Storybook stories; `withCultureStore` decorator; `activateSpy`/`closeSpy` fn() spies; play functions for ActivateSurveyAction + CloseSurveyAction
- `src/culture-metrics/__tests__/CultureDashboard.test.tsx` — 24 Vitest tests all passing; covers plan gate, loading, error, surveys, eNPS results, org health

**Roadmap target updated:** 2027-02-10

---

## v17.0 — Process Templates Module (✅ GitHub Release published 2026-09-01)

**Release tag:** v17.0.0 | **PR:** #75 (merged) | **Tag commit:** 6c575064

### ✅ All completed
- `supabase/migrations/20261201_process_templates.sql` — 3 tables, 1 view, 3 fn, 12 RLS, 5 seed templates
- `supabase/migrations/20261201_process_templates_rollback.sql` — full rollback
- `src/jobs/processTemplateTypes.ts` — PlanGate, meetsplanGate, BottleneckSeverity, all interfaces
- `src/jobs/processTemplateStore.ts` — Zustand store, PlanGateError, CRUD, PROFESSIONAL+ analytics
- `src/jobs/ProcessTemplateList.tsx` — template browser (search, category, global filter, plan gate)
- `src/jobs/BottleneckHeatmap.tsx` — PROFESSIONAL+ heatmap, severity coloring, summary bar
- `src/jobs/__tests__/processTemplateTypes.test.ts` — 30 tests
- `src/jobs/__tests__/processTemplateStore.test.ts` — 28 tests
- `src/jobs/ProcessTemplateList.stories.tsx` — 11 Storybook stories
- `src/jobs/BottleneckHeatmap.stories.tsx` — 11 Storybook stories
- `src/jobs/__tests__/ProcessTemplateList.visual.spec.ts` — 12 Playwright visual snapshots
- `src/jobs/__tests__/BottleneckHeatmap.visual.spec.ts` — 14 Playwright visual snapshots
- `src/tenant/types.ts` — PLAN_LIMITS updated (process_templates + bottleneck_heatmap)
- `CHANGELOG.md` — v17.0.0 released
- PR #75 merged, release tag v17.0.0 published ✅

---

## v16.0.0 — People & Culture Foundation (✅ Released 2026-08-28)

## Completed Systems (Summary)

- **Key Management v0.4–v0.10**: Ed25519 import, scope enforcement, admin override, signed revocation policy, policy precedence, auto requirePolicy in FACTORY
- **Release Workflow**: Spec state machine, snapshot, gate report, manifest signing, artifact bundles
- **Cabinet System**: Parametric calculations, panels, compartments, materials, 3D viz, construction type selector, BIM classification
- **3D Scene Tools**: Transform controls, snap system, Plasticity-style hotkeys
- **Manufacturing Calculators**: CNC tool panel, kerf bending, hidden door hinge, wainscoting, slat
- **Safety Gates**: G4 geometry, G11 minifix/system32 (36 tests), v4.1 bolt position fix (PRODUCTION-READY)
- **Gate UI**: GateStatusIndicator, SafetyPanel, RightInspector, GateSceneHighlights
- **DXF Export v0.11**: CAD-ready DXF with drilling patterns
- **Spec Lineage P9/P9.1**: FE + server-anchored append-only audit trail
- **CNC Pipeline v2.1.0**: DrillMap→OpGraph→G-code, ZIP bundles, cache, re-verify, tool wear D6/D6.1
- **Export**: Cut list CSV, manifest JSON, trust chain viewer
- **Connector OS v1.1**: NCenterPolicy, G11.6-8, EdgeBandMap, Gems catalog (24 new tests)

## Pending

- [ ] v0.12 TBD
- [ ] Drawer system, Door/hinge system
- [ ] Label generation
- [ ] Multi-signature release approval
- [ ] Push to GitHub (auth pending)

*Last updated: 2026-02-16*
