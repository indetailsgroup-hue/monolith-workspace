/**
 * src/jobs/processTemplateTypes.ts
 *
 * MONOLITH v17.0 — Process Templates Module Types
 *
 * Feature: P1: Process (SLR evidence 77% — Work Redesign > Technology Deployment)
 * Plan Gate:
 *   - STARTER+   → Job Templates + Stages (create, edit, apply to jobs)
 *   - PROFESSIONAL+ → Bottleneck Heatmap + Time-in-Stage analytics
 *
 * Schema: supabase/migrations/20261201_process_templates.sql
 */

import type { OrgPlan, OrgRole } from '../tenant/types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Job template categories matching SQL check constraint */
export type JobTemplateCategory =
  | 'CABINET'     // ตู้ครัว / ตู้เสื้อผ้า
  | 'DOOR'        // ประตูบานเปิด / บานเลื่อน
  | 'DRAWER'      // ลิ้นชัก
  | 'LABEL'       // ป้ายงาน
  | 'SITE'        // งานติดตั้ง on-site
  | 'CNC'         // งาน CNC batch
  | 'QUOTATION'   // template ใบเสนอราคา
  | 'CUSTOM';     // org-defined

export const JOB_TEMPLATE_CATEGORY_LABELS: Record<JobTemplateCategory, string> = {
  CABINET:   'ตู้ครัว / ตู้เสื้อผ้า',
  DOOR:      'ประตู',
  DRAWER:    'ลิ้นชัก',
  LABEL:     'ป้ายงาน',
  SITE:      'งานติดตั้ง',
  CNC:       'งาน CNC',
  QUOTATION: 'ใบเสนอราคา',
  CUSTOM:    'กำหนดเอง',
};

export const JOB_TEMPLATE_CATEGORY_ICONS: Record<JobTemplateCategory, string> = {
  CABINET:   '🗄️',
  DOOR:      '🚪',
  DRAWER:    '📦',
  LABEL:     '🏷️',
  SITE:      '🏗️',
  CNC:       '⚙️',
  QUOTATION: '📋',
  CUSTOM:    '✏️',
};

/** Minimum plan required to access a feature */
export type PlanGate = Extract<OrgPlan, 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'>;

/** Plan gate ranking for comparison */
export const PLAN_GATE_RANK: Record<PlanGate, number> = {
  FREE: 0,
  STARTER: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

/** Returns true if org plan meets or exceeds the required gate */
export function meetsplanGate(orgPlan: OrgPlan, required: PlanGate): boolean {
  return PLAN_GATE_RANK[orgPlan] >= PLAN_GATE_RANK[required];
}

// ============================================================================
// CHECKLIST ITEM
// ============================================================================

export interface TemplateChecklistItem {
  label: string;
  required: boolean;
  photoRequired?: boolean;
  notes?: string;
}

// ============================================================================
// JOB TEMPLATE STAGE
// ============================================================================

export interface JobTemplateStage {
  id: string;                           // UUID
  templateId: string;
  orgId: string | null;                 // null = global template stage
  stageOrder: number;                   // 1-based ordering
  name: string;                         // e.g. "ออกแบบ", "ตัด CNC"
  description?: string;
  assignedRole?: OrgRole;               // default responsible role
  expectedDurationHours: number;        // for Bottleneck Heatmap comparison
  isApprovalRequired: boolean;
  checklistItems: TemplateChecklistItem[];
  color: string;                        // hex color for Kanban display
  createdAt: string;                    // ISO
  updatedAt: string;
}

/** Input for creating/updating a stage */
export interface JobTemplateStageInput {
  stageOrder: number;
  name: string;
  description?: string;
  assignedRole?: OrgRole;
  expectedDurationHours?: number;
  isApprovalRequired?: boolean;
  checklistItems?: TemplateChecklistItem[];
  color?: string;
}

// ============================================================================
// JOB TEMPLATE
// ============================================================================

export interface JobTemplate {
  id: string;                           // UUID
  orgId: string | null;                 // null = global template
  name: string;
  category: JobTemplateCategory;
  description?: string;
  planGate: PlanGate;
  isActive: boolean;
  isGlobal: boolean;
  version: number;
  tags: string[];
  estimatedTotalHours: number | null;
  stages?: JobTemplateStage[];          // populated when fetched with join
  createdBy?: string;                   // userId
  createdAt: string;
  updatedAt: string;
}

/** Input for creating a new job template */
export interface JobTemplateInput {
  name: string;
  category: JobTemplateCategory;
  description?: string;
  planGate?: PlanGate;
  tags?: string[];
  stages: JobTemplateStageInput[];
}

/** Summary row for template list views (no stages) */
export type JobTemplateSummary = Omit<JobTemplate, 'stages'>;

// ============================================================================
// TIME-IN-STAGE LOG (PROFESSIONAL+)
// ============================================================================

/** Represents a single job's passage through one stage */
export interface TimeInStageEntry {
  id: string;
  orgId: string;
  jobId: string;                        // job code or UUID
  stageName: string;
  stageOrder: number | null;
  templateId: string | null;
  enteredAt: string;                    // ISO
  exitedAt: string | null;              // null = currently active
  durationMinutes: number | null;       // computed by DB
  expectedMinutes: number | null;
  isBottleneck: boolean;                // computed: actual > expected
  enteredBy?: string;
  exitedBy?: string;
  notes?: string;
  createdAt: string;
}

/** Input for logging job stage entry */
export interface StageEntryInput {
  jobId: string;
  stageName: string;
  stageOrder?: number;
  templateId?: string;
  expectedMinutes?: number;
  notes?: string;
}

/** Input for closing out (exiting) a stage log entry */
export interface StageExitInput {
  id: string;
  exitedAt?: string;   // defaults to now() if omitted
  notes?: string;
}

// ============================================================================
// BOTTLENECK HEATMAP (PROFESSIONAL+)
// ============================================================================

/**
 * Aggregated bottleneck metrics per stage — from bottleneck_heatmap_v view
 * Gated at PROFESSIONAL+
 */
export interface BottleneckHeatmapRow {
  orgId: string;
  stageName: string;
  stageOrder: number | null;
  templateId: string | null;
  jobCount: number;
  avgDurationMinutes: number;
  avgExpectedMinutes: number;
  maxDurationMinutes: number;
  pctOfExpected: number;               // > 100 = taking longer than planned
  bottleneckCount: number;
  bottleneckRatePct: number;           // % of jobs that exceeded expected time
}

/** Severity classification for heatmap color coding */
export type BottleneckSeverity = 'OK' | 'WARNING' | 'CRITICAL';

/** Returns severity based on pct_of_expected */
export function getBottleneckSeverity(pctOfExpected: number): BottleneckSeverity {
  if (pctOfExpected <= 110) return 'OK';
  if (pctOfExpected <= 150) return 'WARNING';
  return 'CRITICAL';
}

export const BOTTLENECK_SEVERITY_COLORS: Record<BottleneckSeverity, string> = {
  OK:       '#22c55e',   // green
  WARNING:  '#f59e0b',   // amber
  CRITICAL: '#ef4444',   // red
};

export const BOTTLENECK_SEVERITY_LABELS: Record<BottleneckSeverity, string> = {
  OK:       'ปกติ',
  WARNING:  'ช้ากว่าแผน',
  CRITICAL: 'Bottleneck',
};

/** Summary of bottleneck analysis across all stages for one template/org */
export interface BottleneckAnalysisSummary {
  orgId: string;
  templateId: string | null;
  worstStage: string | null;            // stage with highest pctOfExpected
  totalBottleneckEvents: number;
  overallBottleneckRatePct: number;
  stages: BottleneckHeatmapRow[];
  generatedAt: string;                  // ISO
}

// ============================================================================
// TEMPLATE FILTER STATE
// ============================================================================

export interface JobTemplateFilters {
  category?: JobTemplateCategory | null;
  planGate?: PlanGate | null;
  isActive?: boolean;
  isGlobal?: boolean;
  search?: string;                      // fuzzy match on name/description
}

export const DEFAULT_TEMPLATE_FILTERS: JobTemplateFilters = {
  category: null,
  planGate: null,
  isActive: true,
  isGlobal: undefined,
  search: '',
};

// ============================================================================
// APPLY TEMPLATE TO JOB
// ============================================================================

/**
 * Result of applying a template to an existing job —
 * returns the stage log entries created
 */
export interface ApplyTemplateResult {
  jobId: string;
  templateId: string;
  templateName: string;
  stagesCreated: number;
  firstStageName: string;
  appliedAt: string;
}

// ============================================================================
// PROCESS TEMPLATE STORE STATE (Zustand)
// ============================================================================

export interface ProcessTemplateState {
  templates: JobTemplateSummary[];
  selectedTemplate: JobTemplate | null;
  filters: JobTemplateFilters;
  isLoading: boolean;
  error: string | null;
  bottleneckData: BottleneckHeatmapRow[];
  isBottleneckLoading: boolean;
}
