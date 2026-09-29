/**
 * people/peopleStore.ts — Zustand store for People module (P2 dimension of 2S2P1C)
 *
 * Manages:
 * - Employee profiles      (STARTER plan: ≤10 employees)
 * - Org skills catalogue   (PROFESSIONAL+ plan gate)
 * - Employee ↔ Skill proficiency junctions (PROFESSIONAL+)
 * - Training records       (PROFESSIONAL+)
 * - Super Employee AI-augmentation journey (ENTERPRISE plan gate)
 *
 * SLR Evidence (756 articles, PRISMA 2020):
 * People (P2) = 89% success factor weight — the #1 organizational transformation lever.
 * Super Employees reduce resource usage 8–33× vs traditional employees.
 *
 * Data shape (lazy-loaded, keyed by employeeId to avoid loading everything upfront):
 * - employees[]                     — org-wide, loaded on People module mount
 * - skills[]                        — org skills catalogue, loaded on mount
 * - employeeSkillsByEmployee{}      — per-employee, loaded on profile open or matrix view
 * - trainingByEmployee{}            — per-employee, loaded on profile open
 * - progressByEmployee{}            — per-employee, loaded on profile open
 *
 * Loading flags are granular per operation — not a single global isLoading flag.
 * This lets the UI show partial loaders (e.g., saving a skill while the list stays visible).
 *
 * Persist strategy:
 * - Persisted: employees, skills, filters (UX continuity across refreshes)
 * - NOT persisted: employee skills / training / progress (always fresh from DB)
 *   and all loading/error flags (always reset to defaults on hydration)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../core/supabase';
import {
  DEFAULT_EMPLOYEE_FILTERS,
  filterEmployees,
  computeSkillGap,
  computePeopleDashboardMetrics,
  mapEmployee,
  mapSkill,
  mapEmployeeSkill,
  mapTrainingRecord,
  mapSuperEmployeeProgress,
} from './types';
import type {
  Employee,
  Skill,
  EmployeeSkill,
  EmployeeSkillWithDetails,
  EmployeeWithSkills,
  TrainingRecord,
  SuperEmployeeProgress,
  EmployeeFilters,
  SkillGapAnalysis,
  PeopleDashboardMetrics,
  SuperEmployeeStage,
  SkillLevel,
  SkillCategory,
  TrainingType,
  TrainingStatus,
  EmployeeRow,
  SkillRow,
  EmployeeSkillRow,
  TrainingRecordRow,
  SuperEmployeeProgressRow,
} from './types';
import type { OrgRole } from '../tenant/types';

// ============================================================================
// Action Input Types  (exported so components can type their form state)
// ============================================================================

export interface CreateEmployeeInput {
  name: string;
  role: OrgRole;
  /** Linked auth account — null for factory workers without platform access */
  userId?: string | null;
  department?: string | null;
  hireDate?: string | null;
  avatarUrl?: string | null;
  notes?: string | null;
}

export interface UpdateEmployeeInput {
  name?: string;
  role?: OrgRole;
  department?: string | null;
  hireDate?: string | null;
  avatarUrl?: string | null;
  notes?: string | null;
  isActive?: boolean;
  /** Use advanceSuperEmployeeStage() for stage changes — this field is for admin overrides only */
  superEmployeeStage?: SuperEmployeeStage;
}

export interface CreateSkillInput {
  name: string;
  category: SkillCategory;
  description?: string | null;
  roleRelevance?: OrgRole[];
  isAiSkill?: boolean;
  aiPartnerThreshold?: SkillLevel | null;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string | null;
  category?: SkillCategory;
  roleRelevance?: OrgRole[];
  isAiSkill?: boolean;
  aiPartnerThreshold?: SkillLevel | null;
}

export interface SetEmployeeSkillInput {
  employeeId: string;
  skillId: string;
  level: SkillLevel;
  /** null = self-assessed */
  assessedBy?: string | null;
  notes?: string | null;
}

export interface CreateTrainingInput {
  employeeId: string;
  title: string;
  type: TrainingType;
  skillIds?: string[];
  status?: TrainingStatus;
  startDate?: string | null;
  endDate?: string | null;
  hours?: number | null;
  certificateUrl?: string | null;
  notes?: string | null;
}

export interface UpdateTrainingInput {
  title?: string;
  type?: TrainingType;
  skillIds?: string[];
  status?: TrainingStatus;
  startDate?: string | null;
  endDate?: string | null;
  hours?: number | null;
  certificateUrl?: string | null;
  notes?: string | null;
}

export interface AdvanceStageInput {
  employeeId: string;
  stage: SuperEmployeeStage;
  aiToolsUsed?: string[];
  /** % productivity increase vs previous stage (self-reported or manager-set) */
  productivityDelta?: number | null;
  /** Cross-role jobs completed since last stage */
  jobsCrossRole?: number;
  notes?: string | null;
}

// ============================================================================
// Store Interface
// ============================================================================

interface PeopleState {
  // Core data
  employees: Employee[];
  skills: Skill[];
  /** Employee skills keyed by employeeId — loaded lazily */
  employeeSkillsByEmployee: Record<string, EmployeeSkill[]>;
  /** Training records keyed by employeeId — loaded lazily */
  trainingByEmployee: Record<string, TrainingRecord[]>;
  /** Stage progression history keyed by employeeId — loaded lazily */
  progressByEmployee: Record<string, SuperEmployeeProgress[]>;
  /** Active list/filter state */
  filters: EmployeeFilters;
  /** Last error message — cleared on each new operation attempt */
  error: string | null;

  // Granular loading flags (one per logical operation)
  loadingEmployees: boolean;
  loadingSkills: boolean;
  loadingEmployeeSkills: boolean;
  loadingTraining: boolean;
  loadingProgress: boolean;
  creatingEmployee: boolean;
  updatingEmployee: boolean;
  deactivatingEmployee: boolean;
  savingSkill: boolean;         // covers create, update, delete skill
  savingEmployeeSkill: boolean; // upsert employee ↔ skill junction
  removingEmployeeSkill: boolean;
  savingTraining: boolean;      // covers add + update training record
  advancingStage: boolean;
}

interface PeopleActions {
  // ---------- Employees ----------
  /** Load all employees for the org (active and inactive), sorted by name */
  loadEmployees: (orgId: string) => Promise<void>;
  /** Create a new employee profile. Returns the created Employee or null on failure. */
  createEmployee: (input: CreateEmployeeInput, orgId: string) => Promise<Employee | null>;
  /** Patch employee fields. Returns the updated Employee or null on failure. */
  updateEmployee: (employeeId: string, input: UpdateEmployeeInput, orgId: string) => Promise<Employee | null>;
  /** Soft-delete: sets is_active = false. Employee is retained in DB and history. */
  deactivateEmployee: (employeeId: string, orgId: string) => Promise<void>;

  // ---------- Skills Catalogue ----------
  /** Load all skills defined in the org's catalogue */
  loadSkills: (orgId: string) => Promise<void>;
  /** Add a new skill to the catalogue. Returns the created Skill or null on failure. */
  createSkill: (input: CreateSkillInput, orgId: string) => Promise<Skill | null>;
  /** Update skill metadata. Returns the updated Skill or null on failure. */
  updateSkill: (skillId: string, input: UpdateSkillInput, orgId: string) => Promise<Skill | null>;
  /** Remove a skill from the catalogue (DB cascades employee_skills rows). */
  deleteSkill: (skillId: string, orgId: string) => Promise<void>;

  // ---------- Employee ↔ Skill ----------
  /** Load skills for one employee. Updates employeeSkillsByEmployee[employeeId]. */
  loadEmployeeSkills: (employeeId: string, orgId: string) => Promise<void>;
  /**
   * Load ALL employee_skills for the org in one query.
   * Intended for the skills matrix view. Requires employees[] to already be loaded
   * so employee IDs are used to scope the query (employee_skills has no org_id column).
   */
  loadAllEmployeeSkills: (orgId: string) => Promise<void>;
  /**
   * Upsert an employee's assessed skill level (insert or update on conflict).
   * Returns the persisted EmployeeSkill or null on failure.
   */
  setEmployeeSkill: (input: SetEmployeeSkillInput, orgId: string) => Promise<EmployeeSkill | null>;
  /**
   * Remove a skill from an employee.
   * @param employeeSkillId — primary key of the employee_skills row
   * @param employeeId — needed to update in-memory state
   */
  removeEmployeeSkill: (employeeSkillId: string, employeeId: string, orgId: string) => Promise<void>;

  // ---------- Training Records ----------
  /** Load all training records for one employee, most recent first. */
  loadTrainingRecords: (employeeId: string, orgId: string) => Promise<void>;
  /** Add a training record. Returns the created record or null on failure. */
  addTrainingRecord: (input: CreateTrainingInput, orgId: string) => Promise<TrainingRecord | null>;
  /** Update a training record (e.g., mark completed, add certificate URL). */
  updateTrainingRecord: (trainingId: string, input: UpdateTrainingInput, orgId: string) => Promise<TrainingRecord | null>;

  // ---------- Super Employee Progress ----------
  /** Load stage progression history for one employee, oldest→newest. */
  loadProgressHistory: (employeeId: string, orgId: string) => Promise<void>;
  /**
   * Advance an employee to a new Super Employee stage.
   * Validates forward-only progression, inserts a progress milestone record,
   * and updates employee.super_employee_stage in a single action.
   * Returns the new SuperEmployeeProgress record or null on failure.
   */
  advanceSuperEmployeeStage: (input: AdvanceStageInput, orgId: string) => Promise<SuperEmployeeProgress | null>;

  // ---------- Computed Selectors ----------
  /** Returns employees filtered by current filters state. Pure in-memory — no DB call. */
  getFilteredEmployees: () => Employee[];
  /**
   * Returns a fully assembled EmployeeWithSkills for one employee.
   * Skills, training, and progress are sourced from in-memory caches —
   * call loadEmployeeSkills / loadTrainingRecords / loadProgressHistory first.
   */
  getEmployeeWithSkills: (employeeId: string) => EmployeeWithSkills | null;
  /**
   * Returns the skill gap analysis for one employee.
   * Requires skills and employeeSkillsByEmployee to be loaded.
   */
  getSkillGapAnalysis: (employeeId: string) => SkillGapAnalysis | null;
  /**
   * Returns aggregate People dashboard metrics across all loaded employees.
   * More accurate when loadAllEmployeeSkills has been called.
   */
  getDashboardMetrics: () => PeopleDashboardMetrics;

  // ---------- Filters ----------
  /** Merge partial filter updates into current filter state */
  setFilters: (partial: Partial<EmployeeFilters>) => void;
  /** Reset all filters to defaults */
  resetFilters: () => void;

  // ---------- Misc ----------
  setError: (error: string | null) => void;
  /** Clear all people data — call on logout or org switch */
  clear: () => void;
}

type PeopleStore = PeopleState & PeopleActions;

// ============================================================================
// Initial State
// ============================================================================

const initialState: PeopleState = {
  employees: [],
  skills: [],
  employeeSkillsByEmployee: {},
  trainingByEmployee: {},
  progressByEmployee: {},
  filters: DEFAULT_EMPLOYEE_FILTERS,
  error: null,
  loadingEmployees: false,
  loadingSkills: false,
  loadingEmployeeSkills: false,
  loadingTraining: false,
  loadingProgress: false,
  creatingEmployee: false,
  updatingEmployee: false,
  deactivatingEmployee: false,
  savingSkill: false,
  savingEmployeeSkill: false,
  removingEmployeeSkill: false,
  savingTraining: false,
  advancingStage: false,
};

// ============================================================================
// Store Implementation
// ============================================================================

export const usePeopleStore = create<PeopleStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ======================================================================
      // Employees
      // ======================================================================

      loadEmployees: async (orgId) => {
        set({ loadingEmployees: true, error: null });
        try {
          const { data, error } = await supabase
            .from('employees')
            .select('*')
            .eq('org_id', orgId)
            .order('name', { ascending: true });

          if (error) throw error;
          set({ employees: (data as EmployeeRow[]).map(mapEmployee) });
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to load employees' });
        } finally {
          set({ loadingEmployees: false });
        }
      },

      createEmployee: async (input, orgId) => {
        set({ creatingEmployee: true, error: null });
        try {
          const payload = {
            org_id: orgId,
            user_id: input.userId ?? null,
            name: input.name,
            role: input.role,
            department: input.department ?? null,
            hire_date: input.hireDate ?? null,
            avatar_url: input.avatarUrl ?? null,
            is_active: true,
            super_employee_stage: 'AI_UNAWARE' as const,
            notes: input.notes ?? null,
          };

          const { data, error } = await supabase
            .from('employees')
            .insert(payload)
            .select()
            .single();

          if (error) throw error;
          const employee = mapEmployee(data as EmployeeRow);
          set((s) => ({ employees: [...s.employees, employee] }));
          return employee;
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to create employee' });
          return null;
        } finally {
          set({ creatingEmployee: false });
        }
      },

      updateEmployee: async (employeeId, input, orgId) => {
        set({ updatingEmployee: true, error: null });
        try {
          const patch: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };
          if (input.name !== undefined) patch.name = input.name;
          if (input.role !== undefined) patch.role = input.role;
          if (input.department !== undefined) patch.department = input.department;
          if (input.hireDate !== undefined) patch.hire_date = input.hireDate;
          if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
          if (input.notes !== undefined) patch.notes = input.notes;
          if (input.isActive !== undefined) patch.is_active = input.isActive;
          if (input.superEmployeeStage !== undefined) patch.super_employee_stage = input.superEmployeeStage;

          const { data, error } = await supabase
            .from('employees')
            .update(patch)
            .eq('id', employeeId)
            .eq('org_id', orgId) // Defence-in-depth: RLS + explicit org filter
            .select()
            .single();

          if (error) throw error;
          const updated = mapEmployee(data as EmployeeRow);
          set((s) => ({
            employees: s.employees.map((e) => (e.id === employeeId ? updated : e)),
          }));
          return updated;
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to update employee' });
          return null;
        } finally {
          set({ updatingEmployee: false });
        }
      },

      deactivateEmployee: async (employeeId, orgId) => {
        set({ deactivatingEmployee: true, error: null });
        try {
          const { error } = await supabase
            .from('employees')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', employeeId)
            .eq('org_id', orgId);

          if (error) throw error;
          set((s) => ({
            employees: s.employees.map((e) =>
              e.id === employeeId ? { ...e, isActive: false } : e
            ),
          }));
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to deactivate employee' });
        } finally {
          set({ deactivatingEmployee: false });
        }
      },

      // ======================================================================
      // Skills Catalogue
      // ======================================================================

      loadSkills: async (orgId) => {
        set({ loadingSkills: true, error: null });
        try {
          const { data, error } = await supabase
            .from('skills')
            .select('*')
            .eq('org_id', orgId)
            .order('category', { ascending: true })
            .order('name', { ascending: true });

          if (error) throw error;
          set({ skills: (data as SkillRow[]).map(mapSkill) });
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to load skills' });
        } finally {
          set({ loadingSkills: false });
        }
      },

      createSkill: async (input, orgId) => {
        set({ savingSkill: true, error: null });
        try {
          const payload = {
            org_id: orgId,
            name: input.name,
            description: input.description ?? null,
            category: input.category,
            role_relevance: input.roleRelevance ?? [],
            is_ai_skill: input.isAiSkill ?? false,
            ai_partner_threshold: input.aiPartnerThreshold ?? null,
          };

          const { data, error } = await supabase
            .from('skills')
            .insert(payload)
            .select()
            .single();

          if (error) throw error;
          const skill = mapSkill(data as SkillRow);
          set((s) => ({ skills: [...s.skills, skill] }));
          return skill;
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to create skill' });
          return null;
        } finally {
          set({ savingSkill: false });
        }
      },

      updateSkill: async (skillId, input, orgId) => {
        set({ savingSkill: true, error: null });
        try {
          const patch: Record<string, unknown> = {};
          if (input.name !== undefined) patch.name = input.name;
          if (input.description !== undefined) patch.description = input.description;
          if (input.category !== undefined) patch.category = input.category;
          if (input.roleRelevance !== undefined) patch.role_relevance = input.roleRelevance;
          if (input.isAiSkill !== undefined) patch.is_ai_skill = input.isAiSkill;
          if (input.aiPartnerThreshold !== undefined) patch.ai_partner_threshold = input.aiPartnerThreshold;

          const { data, error } = await supabase
            .from('skills')
            .update(patch)
            .eq('id', skillId)
            .eq('org_id', orgId)
            .select()
            .single();

          if (error) throw error;
          const updated = mapSkill(data as SkillRow);
          set((s) => ({
            skills: s.skills.map((sk) => (sk.id === skillId ? updated : sk)),
          }));
          return updated;
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to update skill' });
          return null;
        } finally {
          set({ savingSkill: false });
        }
      },

      deleteSkill: async (skillId, orgId) => {
        set({ savingSkill: true, error: null });
        try {
          const { error } = await supabase
            .from('skills')
            .delete()
            .eq('id', skillId)
            .eq('org_id', orgId);

          if (error) throw error;
          set((s) => ({
            skills: s.skills.filter((sk) => sk.id !== skillId),
            // Purge cached employee skills that referenced this skill
            employeeSkillsByEmployee: Object.fromEntries(
              Object.entries(s.employeeSkillsByEmployee).map(([empId, skills]) => [
                empId,
                skills.filter((es) => es.skillId !== skillId),
              ])
            ),
          }));
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to delete skill' });
        } finally {
          set({ savingSkill: false });
        }
      },

      // ======================================================================
      // Employee ↔ Skill
      // ======================================================================

      loadEmployeeSkills: async (employeeId, orgId) => {
        set({ loadingEmployeeSkills: true, error: null });
        try {
          const { data, error } = await supabase
            .from('employee_skills')
            .select('*')
            .eq('employee_id', employeeId);

          if (error) throw error;
          const mapped = (data as EmployeeSkillRow[]).map(mapEmployeeSkill);
          set((s) => ({
            employeeSkillsByEmployee: {
              ...s.employeeSkillsByEmployee,
              [employeeId]: mapped,
            },
          }));
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to load employee skills' });
        } finally {
          set({ loadingEmployeeSkills: false });
        }
      },

      loadAllEmployeeSkills: async (orgId) => {
        set({ loadingEmployeeSkills: true, error: null });
        try {
          // Scope by employee IDs already in store (employee_skills has no org_id column)
          const employeeIds = get().employees
            .filter((e) => e.orgId === orgId)
            .map((e) => e.id);

          if (employeeIds.length === 0) {
            set({ employeeSkillsByEmployee: {} });
            return;
          }

          const { data, error } = await supabase
            .from('employee_skills')
            .select('*')
            .in('employee_id', employeeIds);

          if (error) throw error;

          // Group by employeeId
          const grouped: Record<string, EmployeeSkill[]> = {};
          for (const row of data as EmployeeSkillRow[]) {
            const mapped = mapEmployeeSkill(row);
            if (!grouped[mapped.employeeId]) grouped[mapped.employeeId] = [];
            grouped[mapped.employeeId].push(mapped);
          }
          set({ employeeSkillsByEmployee: grouped });
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to load all employee skills' });
        } finally {
          set({ loadingEmployeeSkills: false });
        }
      },

      setEmployeeSkill: async (input, orgId) => {
        set({ savingEmployeeSkill: true, error: null });
        try {
          const payload = {
            employee_id: input.employeeId,
            skill_id: input.skillId,
            level: input.level,
            assessed_by: input.assessedBy ?? null,
            assessed_at: new Date().toISOString(),
            notes: input.notes ?? null,
          };

          const { data, error } = await supabase
            .from('employee_skills')
            .upsert(payload, { onConflict: 'employee_id,skill_id' })
            .select()
            .single();

          if (error) throw error;
          const upserted = mapEmployeeSkill(data as EmployeeSkillRow);

          set((s) => {
            const existing = s.employeeSkillsByEmployee[input.employeeId] ?? [];
            const alreadyExists = existing.some((es) => es.skillId === input.skillId);
            const next = alreadyExists
              ? existing.map((es) => (es.skillId === input.skillId ? upserted : es))
              : [...existing, upserted];
            return {
              employeeSkillsByEmployee: {
                ...s.employeeSkillsByEmployee,
                [input.employeeId]: next,
              },
            };
          });

          return upserted;
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to save employee skill' });
          return null;
        } finally {
          set({ savingEmployeeSkill: false });
        }
      },

      removeEmployeeSkill: async (employeeSkillId, employeeId, orgId) => {
        set({ removingEmployeeSkill: true, error: null });
        try {
          const { error } = await supabase
            .from('employee_skills')
            .delete()
            .eq('id', employeeSkillId);

          if (error) throw error;

          set((s) => ({
            employeeSkillsByEmployee: {
              ...s.employeeSkillsByEmployee,
              [employeeId]: (s.employeeSkillsByEmployee[employeeId] ?? []).filter(
                (es) => es.id !== employeeSkillId
              ),
            },
          }));
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to remove employee skill' });
        } finally {
          set({ removingEmployeeSkill: false });
        }
      },

      // ======================================================================
      // Training Records
      // ======================================================================

      loadTrainingRecords: async (employeeId, orgId) => {
        set({ loadingTraining: true, error: null });
        try {
          const { data, error } = await supabase
            .from('training_records')
            .select('*')
            .eq('employee_id', employeeId)
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });

          if (error) throw error;
          const mapped = (data as TrainingRecordRow[]).map(mapTrainingRecord);
          set((s) => ({
            trainingByEmployee: {
              ...s.trainingByEmployee,
              [employeeId]: mapped,
            },
          }));
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to load training records' });
        } finally {
          set({ loadingTraining: false });
        }
      },

      addTrainingRecord: async (input, orgId) => {
        set({ savingTraining: true, error: null });
        try {
          const payload = {
            employee_id: input.employeeId,
            org_id: orgId,
            title: input.title,
            type: input.type,
            skill_ids: input.skillIds ?? [],
            status: input.status ?? 'PLANNED',
            start_date: input.startDate ?? null,
            end_date: input.endDate ?? null,
            hours: input.hours ?? null,
            certificate_url: input.certificateUrl ?? null,
            notes: input.notes ?? null,
          };

          const { data, error } = await supabase
            .from('training_records')
            .insert(payload)
            .select()
            .single();

          if (error) throw error;
          const record = mapTrainingRecord(data as TrainingRecordRow);
          // Prepend — most recent first
          set((s) => ({
            trainingByEmployee: {
              ...s.trainingByEmployee,
              [input.employeeId]: [
                record,
                ...(s.trainingByEmployee[input.employeeId] ?? []),
              ],
            },
          }));
          return record;
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to add training record' });
          return null;
        } finally {
          set({ savingTraining: false });
        }
      },

      updateTrainingRecord: async (trainingId, input, orgId) => {
        set({ savingTraining: true, error: null });
        try {
          const patch: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };
          if (input.title !== undefined) patch.title = input.title;
          if (input.type !== undefined) patch.type = input.type;
          if (input.skillIds !== undefined) patch.skill_ids = input.skillIds;
          if (input.status !== undefined) patch.status = input.status;
          if (input.startDate !== undefined) patch.start_date = input.startDate;
          if (input.endDate !== undefined) patch.end_date = input.endDate;
          if (input.hours !== undefined) patch.hours = input.hours;
          if (input.certificateUrl !== undefined) patch.certificate_url = input.certificateUrl;
          if (input.notes !== undefined) patch.notes = input.notes;

          const { data, error } = await supabase
            .from('training_records')
            .update(patch)
            .eq('id', trainingId)
            .eq('org_id', orgId)
            .select()
            .single();

          if (error) throw error;
          const updated = mapTrainingRecord(data as TrainingRecordRow);
          const empId = updated.employeeId;
          set((s) => ({
            trainingByEmployee: {
              ...s.trainingByEmployee,
              [empId]: (s.trainingByEmployee[empId] ?? []).map((t) =>
                t.id === trainingId ? updated : t
              ),
            },
          }));
          return updated;
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to update training record' });
          return null;
        } finally {
          set({ savingTraining: false });
        }
      },

      // ======================================================================
      // Super Employee Progress
      // ======================================================================

      loadProgressHistory: async (employeeId, orgId) => {
        set({ loadingProgress: true, error: null });
        try {
          const { data, error } = await supabase
            .from('super_employee_progress')
            .select('*')
            .eq('employee_id', employeeId)
            .eq('org_id', orgId)
            .order('stage_date', { ascending: true });

          if (error) throw error;
          const mapped = (data as SuperEmployeeProgressRow[]).map(mapSuperEmployeeProgress);
          set((s) => ({
            progressByEmployee: {
              ...s.progressByEmployee,
              [employeeId]: mapped,
            },
          }));
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to load progress history' });
        } finally {
          set({ loadingProgress: false });
        }
      },

      advanceSuperEmployeeStage: async (input, orgId) => {
        set({ advancingStage: true, error: null });
        try {
          // 1. Validate forward-only progression
          const employee = get().employees.find((e) => e.id === input.employeeId);
          if (!employee) {
            throw new Error('Employee not found in store — call loadEmployees first');
          }

          const stages: SuperEmployeeStage[] = [
            'AI_UNAWARE',
            'AI_AWARE',
            'AI_ASSISTED',
            'AI_PARTNER',
            'SUPER_EMPLOYEE',
          ];
          const currentIdx = stages.indexOf(employee.superEmployeeStage);
          const targetIdx = stages.indexOf(input.stage);

          if (targetIdx <= currentIdx) {
            throw new Error(
              `Stage regression not allowed: cannot move from "${employee.superEmployeeStage}" to "${input.stage}"`
            );
          }

          // 2. Insert milestone record
          const progressPayload = {
            employee_id: input.employeeId,
            org_id: orgId,
            stage: input.stage,
            stage_date: new Date().toISOString(),
            ai_tools_used: input.aiToolsUsed ?? [],
            productivity_delta: input.productivityDelta ?? null,
            jobs_cross_role: input.jobsCrossRole ?? 0,
            notes: input.notes ?? null,
          };

          const { data: progressData, error: progressError } = await supabase
            .from('super_employee_progress')
            .insert(progressPayload)
            .select()
            .single();

          if (progressError) throw progressError;

          // 3. Update employee's current stage
          const { data: empData, error: empError } = await supabase
            .from('employees')
            .update({
              super_employee_stage: input.stage,
              updated_at: new Date().toISOString(),
            })
            .eq('id', input.employeeId)
            .eq('org_id', orgId)
            .select()
            .single();

          if (empError) throw empError;

          const progress = mapSuperEmployeeProgress(progressData as SuperEmployeeProgressRow);
          const updatedEmployee = mapEmployee(empData as EmployeeRow);

          set((s) => ({
            employees: s.employees.map((e) =>
              e.id === input.employeeId ? updatedEmployee : e
            ),
            progressByEmployee: {
              ...s.progressByEmployee,
              [input.employeeId]: [
                ...(s.progressByEmployee[input.employeeId] ?? []),
                progress,
              ],
            },
          }));

          return progress;
        } catch (err) {
          set({ error: (err as Error).message ?? 'Failed to advance Super Employee stage' });
          return null;
        } finally {
          set({ advancingStage: false });
        }
      },

      // ======================================================================
      // Computed Selectors
      // ======================================================================

      getFilteredEmployees: () => {
        const { employees, filters } = get();
        return filterEmployees(employees, filters);
      },

      getEmployeeWithSkills: (employeeId) => {
        const { employees, skills, employeeSkillsByEmployee, trainingByEmployee, progressByEmployee } = get();
        const employee = employees.find((e) => e.id === employeeId);
        if (!employee) return null;

        const rawSkills = employeeSkillsByEmployee[employeeId] ?? [];
        const skillsWithDetails: EmployeeSkillWithDetails[] = rawSkills.map((es) => {
          const skill = skills.find((s) => s.id === es.skillId) ?? {
            id: es.skillId,
            orgId: employee.orgId,
            name: '(unknown — reload skills)',
            description: null,
            category: 'TECHNICAL' as const,
            roleRelevance: [],
            isAiSkill: false,
            aiPartnerThreshold: null,
            createdAt: '',
          };
          return { ...es, skill };
        });

        return {
          ...employee,
          skills: skillsWithDetails,
          trainingRecords: trainingByEmployee[employeeId] ?? [],
          progressHistory: progressByEmployee[employeeId] ?? [],
        };
      },

      getSkillGapAnalysis: (employeeId) => {
        const { employees, skills, employeeSkillsByEmployee, trainingByEmployee } = get();
        const employee = employees.find((e) => e.id === employeeId);
        if (!employee) return null;

        return computeSkillGap(
          employee,
          skills,
          employeeSkillsByEmployee[employeeId] ?? [],
          trainingByEmployee[employeeId] ?? []
        );
      },

      getDashboardMetrics: () => {
        const { employees, skills, employeeSkillsByEmployee, trainingByEmployee } = get();
        const allEmployeeSkills = Object.values(employeeSkillsByEmployee).flat();
        const allTraining = Object.values(trainingByEmployee).flat();
        return computePeopleDashboardMetrics(employees, skills, allEmployeeSkills, allTraining);
      },

      // ======================================================================
      // Filters
      // ======================================================================

      setFilters: (partial) => {
        set((s) => ({ filters: { ...s.filters, ...partial } }));
      },

      resetFilters: () => {
        set({ filters: DEFAULT_EMPLOYEE_FILTERS });
      },

      // ======================================================================
      // Misc
      // ======================================================================

      setError: (error) => set({ error }),

      clear: () => set(initialState),
    }),
    {
      name: 'monolith-people-store',
      partialize: (state) => ({
        // Persist lightweight catalogue data and filters; reload relationships fresh
        employees: state.employees,
        skills: state.skills,
        filters: state.filters,
      }),
    }
  )
);
