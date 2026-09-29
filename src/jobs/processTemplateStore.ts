/**
 * src/jobs/processTemplateStore.ts
 *
 * MONOLITH v17.0 — Process Templates Zustand Store
 *
 * Handles:
 *   - Fetching global + org-specific job templates
 *   - CRUD for templates + stages (ADMIN+)
 *   - Applying templates to jobs (STARTER+)
 *   - Bottleneck Heatmap data (PROFESSIONAL+)
 *
 * Plan Gate enforcement:
 *   - Bottleneck functions throw PlanGateError if org < PROFESSIONAL
 *   - UI layer should also hide gated features via meetsplanGate()
 */

import { create } from 'zustand';
import { supabase } from '../core/supabase';
import type {
  JobTemplate,
  JobTemplateSummary,
  JobTemplateInput,
  JobTemplateStage,
  JobTemplateStageInput,
  JobTemplateFilters,
  TimeInStageEntry,
  StageEntryInput,
  StageExitInput,
  BottleneckHeatmapRow,
  ApplyTemplateResult,
  ProcessTemplateState,
} from './processTemplateTypes';
import { meetsplanGate } from './processTemplateTypes';
import type { OrgPlan } from '../tenant/types';

// ============================================================================
// PLAN GATE ERROR
// ============================================================================

export class PlanGateError extends Error {
  constructor(requiredPlan: OrgPlan, currentPlan: OrgPlan) {
    super(
      `ฟีเจอร์นี้ต้องการ plan ${requiredPlan} (แผนปัจจุบัน: ${currentPlan})`
    );
    this.name = 'PlanGateError';
  }
}

// ============================================================================
// STORE ACTIONS
// ============================================================================

interface ProcessTemplateActions {
  // ── Fetch ────────────────────────────────────────────────────────────────
  fetchTemplates: (orgId: string, filters?: JobTemplateFilters) => Promise<void>;
  fetchTemplateById: (templateId: string) => Promise<void>;
  fetchBottleneckData: (orgId: string, orgPlan: OrgPlan, templateId?: string) => Promise<void>;

  // ── CRUD ─────────────────────────────────────────────────────────────────
  createTemplate: (orgId: string, input: JobTemplateInput) => Promise<JobTemplate>;
  updateTemplate: (templateId: string, updates: Partial<JobTemplateInput>) => Promise<void>;
  deleteTemplate: (templateId: string) => Promise<void>;
  cloneGlobalTemplate: (templateId: string, orgId: string, overrideName?: string) => Promise<JobTemplate>;

  // ── Stage management ─────────────────────────────────────────────────────
  addStage: (templateId: string, orgId: string, stage: JobTemplateStageInput) => Promise<JobTemplateStage>;
  updateStage: (stageId: string, updates: Partial<JobTemplateStageInput>) => Promise<void>;
  deleteStage: (stageId: string) => Promise<void>;
  reorderStages: (templateId: string, orderedIds: string[]) => Promise<void>;

  // ── Apply template to job ─────────────────────────────────────────────────
  applyTemplateToJob: (
    templateId: string,
    jobId: string,
    orgId: string
  ) => Promise<ApplyTemplateResult>;

  // ── Stage time logging (PROFESSIONAL+) ───────────────────────────────────
  logStageEntry: (
    orgId: string,
    orgPlan: OrgPlan,
    input: StageEntryInput
  ) => Promise<TimeInStageEntry>;
  logStageExit: (
    orgId: string,
    orgPlan: OrgPlan,
    input: StageExitInput
  ) => Promise<void>;

  // ── State management ─────────────────────────────────────────────────────
  setFilters: (filters: Partial<JobTemplateFilters>) => void;
  clearError: () => void;
  reset: () => void;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: ProcessTemplateState = {
  templates: [],
  selectedTemplate: null,
  filters: {
    category: null,
    planGate: null,
    isActive: true,
    search: '',
  },
  isLoading: false,
  error: null,
  bottleneckData: [],
  isBottleneckLoading: false,
};

// ============================================================================
// STORE
// ============================================================================

export const useProcessTemplateStore = create<ProcessTemplateState & ProcessTemplateActions>()(
  (set, get) => ({
    ...initialState,

    // ── fetchTemplates ──────────────────────────────────────────────────────
    async fetchTemplates(orgId, filters) {
      set({ isLoading: true, error: null });
      try {
        const { category, isActive, search } = filters ?? get().filters;

        // Fetch org-specific + global templates in one query
        let query = supabase
          .from('job_templates')
          .select('*')
          .or(`org_id.eq.${orgId},is_global.eq.true`)
          .order('category')
          .order('name');

        if (category)            query = query.eq('category', category);
        if (isActive !== undefined) query = query.eq('is_active', isActive);
        if (search)              query = query.ilike('name', `%${search}%`);

        const { data, error } = await query;
        if (error) throw error;

        set({ templates: (data ?? []) as JobTemplateSummary[], isLoading: false });
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : 'โหลด templates ไม่สำเร็จ',
          isLoading: false,
        });
      }
    },

    // ── fetchTemplateById ───────────────────────────────────────────────────
    async fetchTemplateById(templateId) {
      set({ isLoading: true, error: null });
      try {
        const { data, error } = await supabase
          .from('job_templates')
          .select(`
            *,
            stages:job_template_stages(
              *
            )
          `)
          .eq('id', templateId)
          .single();

        if (error) throw error;

        // Sort stages by stage_order
        if (data?.stages) {
          data.stages.sort(
            (a: JobTemplateStage, b: JobTemplateStage) => a.stageOrder - b.stageOrder
          );
        }

        set({ selectedTemplate: data as JobTemplate, isLoading: false });
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : 'โหลด template ไม่สำเร็จ',
          isLoading: false,
        });
      }
    },

    // ── fetchBottleneckData (PROFESSIONAL+) ─────────────────────────────────
    async fetchBottleneckData(orgId, orgPlan, templateId) {
      if (!meetsplanGate(orgPlan, 'PROFESSIONAL')) {
        throw new PlanGateError('PROFESSIONAL', orgPlan);
      }

      set({ isBottleneckLoading: true });
      try {
        let query = supabase
          .from('bottleneck_heatmap_v')
          .select('*')
          .eq('org_id', orgId)
          .order('stage_order', { ascending: true, nullsFirst: false });

        if (templateId) query = query.eq('template_id', templateId);

        const { data, error } = await query;
        if (error) throw error;

        set({
          bottleneckData: (data ?? []) as BottleneckHeatmapRow[],
          isBottleneckLoading: false,
        });
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : 'โหลด bottleneck data ไม่สำเร็จ',
          isBottleneckLoading: false,
        });
      }
    },

    // ── createTemplate ──────────────────────────────────────────────────────
    async createTemplate(orgId, input) {
      const { stages, ...templateData } = input;

      // Insert template
      const { data: template, error: tErr } = await supabase
        .from('job_templates')
        .insert({
          org_id: orgId,
          name: templateData.name,
          category: templateData.category,
          description: templateData.description,
          plan_gate: templateData.planGate ?? 'STARTER',
          tags: templateData.tags ?? [],
          estimated_total_hours: stages.reduce(
            (sum, s) => sum + (s.expectedDurationHours ?? 1), 0
          ),
        })
        .select()
        .single();

      if (tErr) throw tErr;

      // Insert stages
      if (stages.length > 0) {
        const stageRows = stages.map((s) => ({
          template_id: template.id,
          org_id: orgId,
          stage_order: s.stageOrder,
          name: s.name,
          description: s.description,
          assigned_role: s.assignedRole,
          expected_duration_hours: s.expectedDurationHours ?? 1,
          is_approval_required: s.isApprovalRequired ?? false,
          checklist_items: s.checklistItems ?? [],
          color: s.color ?? '#6b7280',
        }));

        const { error: sErr } = await supabase
          .from('job_template_stages')
          .insert(stageRows);

        if (sErr) throw sErr;
      }

      // Refresh list
      await get().fetchTemplates(orgId);
      return template as JobTemplate;
    },

    // ── updateTemplate ──────────────────────────────────────────────────────
    async updateTemplate(templateId, updates) {
      const { stages: _stages, ...rest } = updates;
      const { error } = await supabase
        .from('job_templates')
        .update({
          ...(rest.name && { name: rest.name }),
          ...(rest.category && { category: rest.category }),
          ...(rest.description !== undefined && { description: rest.description }),
          ...(rest.planGate && { plan_gate: rest.planGate }),
          ...(rest.tags && { tags: rest.tags }),
        })
        .eq('id', templateId);

      if (error) throw error;

      // Refresh selected template
      await get().fetchTemplateById(templateId);
    },

    // ── deleteTemplate ──────────────────────────────────────────────────────
    async deleteTemplate(templateId) {
      const { error } = await supabase
        .from('job_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;

      set((state) => ({
        templates: state.templates.filter((t) => t.id !== templateId),
        selectedTemplate:
          state.selectedTemplate?.id === templateId ? null : state.selectedTemplate,
      }));
    },

    // ── cloneGlobalTemplate ─────────────────────────────────────────────────
    async cloneGlobalTemplate(templateId, orgId, overrideName) {
      // Fetch source template with stages
      await get().fetchTemplateById(templateId);
      const source = get().selectedTemplate;
      if (!source) throw new Error('ไม่พบ template ต้นแบบ');

      const clonedStages: JobTemplateStageInput[] = (source.stages ?? []).map((s) => ({
        stageOrder: s.stageOrder,
        name: s.name,
        description: s.description,
        assignedRole: s.assignedRole,
        expectedDurationHours: s.expectedDurationHours,
        isApprovalRequired: s.isApprovalRequired,
        checklistItems: s.checklistItems,
        color: s.color,
      }));

      return get().createTemplate(orgId, {
        name: overrideName ?? `${source.name} (copy)`,
        category: source.category,
        description: source.description,
        planGate: source.planGate,
        tags: [...source.tags],
        stages: clonedStages,
      });
    },

    // ── addStage ────────────────────────────────────────────────────────────
    async addStage(templateId, orgId, stage) {
      const { data, error } = await supabase
        .from('job_template_stages')
        .insert({
          template_id: templateId,
          org_id: orgId,
          stage_order: stage.stageOrder,
          name: stage.name,
          description: stage.description,
          assigned_role: stage.assignedRole,
          expected_duration_hours: stage.expectedDurationHours ?? 1,
          is_approval_required: stage.isApprovalRequired ?? false,
          checklist_items: stage.checklistItems ?? [],
          color: stage.color ?? '#6b7280',
        })
        .select()
        .single();

      if (error) throw error;
      await get().fetchTemplateById(templateId);
      return data as JobTemplateStage;
    },

    // ── updateStage ─────────────────────────────────────────────────────────
    async updateStage(stageId, updates) {
      const { error } = await supabase
        .from('job_template_stages')
        .update({
          ...(updates.name && { name: updates.name }),
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.assignedRole !== undefined && { assigned_role: updates.assignedRole }),
          ...(updates.expectedDurationHours !== undefined && {
            expected_duration_hours: updates.expectedDurationHours,
          }),
          ...(updates.isApprovalRequired !== undefined && {
            is_approval_required: updates.isApprovalRequired,
          }),
          ...(updates.checklistItems !== undefined && {
            checklist_items: updates.checklistItems,
          }),
          ...(updates.color && { color: updates.color }),
        })
        .eq('id', stageId);

      if (error) throw error;
    },

    // ── deleteStage ─────────────────────────────────────────────────────────
    async deleteStage(stageId) {
      const { error } = await supabase
        .from('job_template_stages')
        .delete()
        .eq('id', stageId);

      if (error) throw error;
    },

    // ── reorderStages ───────────────────────────────────────────────────────
    async reorderStages(templateId, orderedIds) {
      // Batch update stage_order for all stages in new order
      const updates = orderedIds.map((id, idx) =>
        supabase
          .from('job_template_stages')
          .update({ stage_order: idx + 1 })
          .eq('id', id)
          .eq('template_id', templateId)
      );

      await Promise.all(updates);
      await get().fetchTemplateById(templateId);
    },

    // ── applyTemplateToJob ──────────────────────────────────────────────────
    async applyTemplateToJob(templateId, jobId, orgId) {
      // Fetch template with stages if not loaded
      if (get().selectedTemplate?.id !== templateId) {
        await get().fetchTemplateById(templateId);
      }
      const template = get().selectedTemplate;
      if (!template) throw new Error('ไม่พบ template');

      const stages = template.stages ?? [];
      if (stages.length === 0) throw new Error('Template ไม่มี stages');

      // Log the first stage entry immediately
      const firstStage = stages[0];
      const { error } = await supabase.from('time_in_stage_log').insert({
        org_id: orgId,
        job_id: jobId,
        stage_name: firstStage.name,
        stage_order: firstStage.stageOrder,
        template_id: templateId,
        expected_minutes: firstStage.expectedDurationHours * 60,
        entered_at: new Date().toISOString(),
      });

      if (error) throw error;

      return {
        jobId,
        templateId,
        templateName: template.name,
        stagesCreated: stages.length,
        firstStageName: firstStage.name,
        appliedAt: new Date().toISOString(),
      } satisfies ApplyTemplateResult;
    },

    // ── logStageEntry (PROFESSIONAL+) ───────────────────────────────────────
    async logStageEntry(orgId, orgPlan, input) {
      if (!meetsplanGate(orgPlan, 'PROFESSIONAL')) {
        throw new PlanGateError('PROFESSIONAL', orgPlan);
      }

      const { data, error } = await supabase
        .from('time_in_stage_log')
        .insert({
          org_id: orgId,
          job_id: input.jobId,
          stage_name: input.stageName,
          stage_order: input.stageOrder,
          template_id: input.templateId,
          expected_minutes: input.expectedMinutes,
          notes: input.notes,
          entered_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data as TimeInStageEntry;
    },

    // ── logStageExit (PROFESSIONAL+) ────────────────────────────────────────
    async logStageExit(orgId, orgPlan, input) {
      if (!meetsplanGate(orgPlan, 'PROFESSIONAL')) {
        throw new PlanGateError('PROFESSIONAL', orgPlan);
      }

      const { error } = await supabase
        .from('time_in_stage_log')
        .update({
          exited_at: input.exitedAt ?? new Date().toISOString(),
          ...(input.notes && { notes: input.notes }),
        })
        .eq('id', input.id)
        .eq('org_id', orgId);  // RLS guard in query layer

      if (error) throw error;
    },

    // ── setFilters ──────────────────────────────────────────────────────────
    setFilters(filters) {
      set((state) => ({
        filters: { ...state.filters, ...filters },
      }));
    },

    // ── clearError ──────────────────────────────────────────────────────────
    clearError() {
      set({ error: null });
    },

    // ── reset ───────────────────────────────────────────────────────────────
    reset() {
      set(initialState);
    },
  })
);
