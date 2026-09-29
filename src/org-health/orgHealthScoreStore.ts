// src/org-health/orgHealthScoreStore.ts
// MONOLITH v18.5 — 2S2P1C Org Health Score Zustand Store

import { create } from 'zustand';
import { supabase } from '../core/supabase';
import type { OrgPlan } from '../tenant/types';
import {
  canAccessOrgHealthScore,
  OrgHealthScorePlanGateError,
  mapOhsScoringConfigRow,
  mapOhsHealthSnapshotRow,
  mapOhsDimensionScoreRow,
  mapOhsCurrentScoreRow,
  DEFAULT_OHS_SCORING_CONFIG,
  ALL_OHS_DIMENSIONS,
  type OhsDimension,
  type OhsCurrentScore,
  type OhsHealthSnapshot,
  type OhsDimensionScore,
  type OhsScoringConfig,
  type OhsScoringConfigRow,
  type OhsHealthSnapshotRow,
  type OhsDimensionScoreRow,
  type OhsCurrentScoreRow,
  type OhsScoringConfigMap,
} from './orgHealthScoreTypes';

// ─────────────────────────────────────────────────────────────
// State + Actions Interface
// ─────────────────────────────────────────────────────────────

interface OrgHealthScoreState {
  // ── Data ──────────────────────────────────────────────────
  currentScore:     OhsCurrentScore | null;
  history:          OhsHealthSnapshot[];
  dimensionScores:  OhsDimensionScore[];    // for the current snapshot
  scoringConfig:    OhsScoringConfig[];      // per-dimension configs for current org
  selectedSnapshotId: string | null;

  // ── Status ────────────────────────────────────────────────
  isLoading:        boolean;
  isComputing:      boolean;
  isConfigLoading:  boolean;
  error:            string | null;

  // ── 6 ENTERPRISE-gated actions ────────────────────────────
  fetchLatestScore:    (orgId: string, orgPlan: OrgPlan) => Promise<void>;
  fetchHistory:        (orgId: string, orgPlan: OrgPlan, fromDate?: string, toDate?: string) => Promise<void>;
  computeScore:        (orgId: string, snapshotDate: string, orgPlan: OrgPlan) => Promise<number>;
  fetchScoringConfig:  (orgId: string, orgPlan: OrgPlan) => Promise<void>;
  updateScoringConfig: (configId: string, weight: number, description: string | undefined, orgPlan: OrgPlan) => Promise<void>;
  upsertScoringConfig: (orgId: string, weights: Partial<OhsScoringConfigMap>, orgPlan: OrgPlan) => Promise<void>;

  // ── UI helpers ────────────────────────────────────────────
  selectSnapshot: (snapshotId: string | null) => void;
  clearError:     () => void;
}

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

export const useOrgHealthScoreStore = create<OrgHealthScoreState>((set, get) => ({
  currentScore:       null,
  history:            [],
  dimensionScores:    [],
  scoringConfig:      [],
  selectedSnapshotId: null,
  isLoading:          false,
  isComputing:        false,
  isConfigLoading:    false,
  error:              null,

  // ─── fetchLatestScore ─────────────────────────────────────
  // Reads from ohs_current_score_v — latest snapshot + dimension breakdown.
  fetchLatestScore: async (orgId, orgPlan) => {
    if (!canAccessOrgHealthScore(orgPlan)) {
      throw new OrgHealthScorePlanGateError(orgPlan);
    }
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('ohs_current_score_v')
        .select('*')
        .eq('org_id', orgId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const currentScore = mapOhsCurrentScoreRow(data as OhsCurrentScoreRow);
        const dimensionScores = Object.values(currentScore.dimensionMap);
        set({ currentScore, dimensionScores });
      } else {
        set({ currentScore: null, dimensionScores: [] });
      }
    } catch (err: unknown) {
      set({ error: (err as Error).message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  // ─── fetchHistory ─────────────────────────────────────────
  // Fetches historical snapshots for trend charts.
  fetchHistory: async (orgId, orgPlan, fromDate, toDate) => {
    if (!canAccessOrgHealthScore(orgPlan)) {
      throw new OrgHealthScorePlanGateError(orgPlan);
    }
    set({ isLoading: true, error: null });
    try {
      let query = supabase
        .from('ohs_health_snapshots')
        .select('*')
        .eq('org_id', orgId)
        .order('snapshot_date', { ascending: false });

      if (fromDate) query = query.gte('snapshot_date', fromDate);
      if (toDate)   query = query.lte('snapshot_date', toDate);

      const { data, error } = await query;
      if (error) throw error;

      const history = (data as OhsHealthSnapshotRow[]).map(mapOhsHealthSnapshotRow);
      set({ history });
    } catch (err: unknown) {
      set({ error: (err as Error).message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  // ─── computeScore ─────────────────────────────────────────
  // Calls ohs_compute_health_score() DB RPC; sets isComputing during the call.
  // Returns the computed composite score.
  computeScore: async (orgId, snapshotDate, orgPlan) => {
    if (!canAccessOrgHealthScore(orgPlan)) {
      throw new OrgHealthScorePlanGateError(orgPlan);
    }
    set({ isComputing: true, error: null });
    try {
      const { data, error } = await supabase.rpc('ohs_compute_health_score', {
        p_org_id:        orgId,
        p_snapshot_date: snapshotDate,
      });
      if (error) throw error;

      const compositeScore = data as number;

      // Re-fetch current score to sync view
      await get().fetchLatestScore(orgId, orgPlan);

      return compositeScore;
    } catch (err: unknown) {
      set({ error: (err as Error).message });
      throw err;
    } finally {
      set({ isComputing: false });
    }
  },

  // ─── fetchScoringConfig ───────────────────────────────────
  // Fetches per-dimension weight configs for an org.
  // If no overrides exist, falls back to DEFAULT_OHS_SCORING_CONFIG display only.
  fetchScoringConfig: async (orgId, orgPlan) => {
    if (!canAccessOrgHealthScore(orgPlan)) {
      throw new OrgHealthScorePlanGateError(orgPlan);
    }
    set({ isConfigLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('ohs_scoring_configs')
        .select('*')
        .eq('org_id', orgId)
        .order('dimension', { ascending: true });

      if (error) throw error;

      const scoringConfig = (data as OhsScoringConfigRow[]).map(mapOhsScoringConfigRow);
      set({ scoringConfig });
    } catch (err: unknown) {
      set({ error: (err as Error).message });
      throw err;
    } finally {
      set({ isConfigLoading: false });
    }
  },

  // ─── updateScoringConfig ──────────────────────────────────
  // Updates a single existing config row's weight and/or description.
  // Optimistic update: patches store state first, rolls back on error.
  updateScoringConfig: async (configId, weight, description, orgPlan) => {
    if (!canAccessOrgHealthScore(orgPlan)) {
      throw new OrgHealthScorePlanGateError(orgPlan);
    }

    const previousConfig = get().scoringConfig;
    // Optimistic update
    set((s) => ({
      scoringConfig: s.scoringConfig.map((c) =>
        c.id === configId
          ? { ...c, weight, description: description ?? c.description, updatedAt: new Date().toISOString(), updated_at: new Date().toISOString() }
          : c
      ),
    }));

    try {
      const updates: { weight: number; description?: string; updated_at: string } = {
        weight,
        updated_at: new Date().toISOString(),
      };
      if (description !== undefined) updates.description = description;

      const { error } = await supabase
        .from('ohs_scoring_configs')
        .update(updates)
        .eq('id', configId);

      if (error) throw error;
    } catch (err: unknown) {
      // Rollback optimistic update
      set({ scoringConfig: previousConfig, error: (err as Error).message });
      throw err;
    }
  },

  // ─── upsertScoringConfig ──────────────────────────────────
  // Upserts all provided dimension weights for an org in a single operation.
  // Useful for initial setup or bulk weight re-balancing.
  upsertScoringConfig: async (orgId, weights, orgPlan) => {
    if (!canAccessOrgHealthScore(orgPlan)) {
      throw new OrgHealthScorePlanGateError(orgPlan);
    }
    set({ isConfigLoading: true, error: null });
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session = await (supabase.auth as any).getUser() as { data: { user: { id: string } | null } };
      const userId  = session.data.user?.id ?? 'system';
      const now     = new Date().toISOString();

      // Merge provided weights with defaults — only upsert supplied dimensions
      const upsertRows = (Object.keys(weights) as OhsDimension[]).map((dim) => ({
        org_id:      orgId,
        dimension:   dim,
        weight:      weights[dim] ?? DEFAULT_OHS_SCORING_CONFIG[dim],
        created_by:  userId,
        created_at:  now,
        updated_at:  now,
      }));

      const { error } = await supabase
        .from('ohs_scoring_configs')
        .upsert(upsertRows, { onConflict: 'org_id,dimension' });

      if (error) throw error;

      // Re-fetch to sync store
      const { data, fetchError } = await (async () => {
        const res = await supabase
          .from('ohs_scoring_configs')
          .select('*')
          .eq('org_id', orgId)
          .order('dimension', { ascending: true });
        return { data: res.data, fetchError: res.error };
      })();
      if (fetchError) throw fetchError;

      const scoringConfig = ((data ?? []) as OhsScoringConfigRow[]).map(mapOhsScoringConfigRow);
      set({ scoringConfig });
    } catch (err: unknown) {
      set({ error: (err as Error).message });
      throw err;
    } finally {
      set({ isConfigLoading: false });
    }
  },

  // ─── UI helpers ───────────────────────────────────────────
  selectSnapshot: (snapshotId) => set({ selectedSnapshotId: snapshotId }),
  clearError:     ()           => set({ error: null }),
}));
