/**
 * fixPlanStore.ts - Fix Plan State Management
 *
 * Zustand store for managing issue resolution workflow:
 * - Load issues from HEAD manifest
 * - Update issue status (with WAIVE strict flow)
 * - Track blocking status for release gating
 */

import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { TrustChainService } from '../trustChain/trustChainService';
import type { IssueItem, IssuePack, IssueStatus } from '../issues/issueTypes';
import type { BlockingResult } from '../issues/issueRules';
import { checkManifestBlocking, summarizeIssues } from '../issues/issueRules';

// ============================================
// STORE STATE
// ============================================

export interface FixPlanState {
  // ---- Identity ----
  /** Job ID */
  jobId: string;

  // ---- Loading State ----
  /** Loading indicator */
  loading: boolean;

  /** Error message */
  error: string | null;

  // ---- Issue Data ----
  /** Current HEAD hash */
  headHash: string | null;

  /** All issue packs */
  packs: IssuePack[];

  /** All issues (flattened from packs) */
  issues: IssueItem[];

  /** Blocking status */
  blocked: BlockingResult;

  /** Issue summary */
  summary: {
    total: number;
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
    blocking: number;
  };

  // ---- Actions ----
  /** Load issues from HEAD */
  load: () => Promise<void>;

  /** Set issue status (non-WAIVE) */
  setIssueStatus: (issueId: string, status: IssueStatus) => Promise<void>;

  /** Set issue metadata (owner, note) */
  setIssueMeta: (issueId: string, patch: { owner?: string; note?: string }) => Promise<void>;

  /** Waive issue (strict - requires waivedBy and waivedReason) */
  waiveIssue: (issueId: string, args: { waivedBy: string; waivedReason: string }) => Promise<void>;

  /** Unwaive issue (strict - requires unwaivedBy and unwaivedReason) */
  unwaiveIssue: (
    issueId: string,
    args: {
      unwaivedBy: string;
      unwaivedReason: string;
      nextStatus: Exclude<IssueStatus, 'WAIVED'>;
    }
  ) => Promise<void>;

  /** Reset error */
  clearError: () => void;
}

// ============================================
// STORE FACTORY
// ============================================

export interface CreateFixPlanStoreArgs {
  /** Job ID */
  jobId: string;

  /** Trust chain service */
  svc: TrustChainService;
}

/**
 * Create fix plan store for a job
 */
export function createFixPlanStore(
  args: CreateFixPlanStoreArgs
): UseBoundStore<StoreApi<FixPlanState>> {
  const { jobId, svc } = args;

  return create<FixPlanState>((set, get) => ({
    // Initial state
    jobId,
    loading: false,
    error: null,
    headHash: null,
    packs: [],
    issues: [],
    blocked: { blocked: false, count: 0, issueIds: [], summary: 'No issues' },
    summary: { total: 0, byStatus: {}, bySeverity: {}, blocking: 0 },

    // Actions
    load: async () => {
      set({ loading: true, error: null });

      try {
        const headR = await svc.getHead(jobId);
        if (!headR.ok) {
          set({ loading: false, error: headR.reason });
          return;
        }

        const head = headR.head;
        const packs = head.issuePacks ?? [];
        const issues = packs.flatMap((p) => p.items ?? []);
        const blocked = checkManifestBlocking(head);
        const summary = summarizeIssues(packs);

        set({
          loading: false,
          headHash: headR.headHash,
          packs,
          issues,
          blocked,
          summary,
        });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to load issues',
        });
      }
    },

    setIssueStatus: async (issueId, status) => {
      // Prevent using this for WAIVED (use waiveIssue instead)
      if (status === 'WAIVED') {
        set({ error: 'Use waiveIssue() for WAIVED status (requires strict audit)' });
        return;
      }

      set({ loading: true, error: null });

      try {
        const result = await svc.updateIssue({
          jobId,
          issueId,
          patch: { status },
        });

        if (!result.ok) {
          set({ loading: false, error: result.reason });
          return;
        }

        // Reload to get updated state
        await get().load();
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to update issue',
        });
      }
    },

    setIssueMeta: async (issueId, patch) => {
      set({ loading: true, error: null });

      try {
        const result = await svc.updateIssue({
          jobId,
          issueId,
          patch,
        });

        if (!result.ok) {
          set({ loading: false, error: result.reason });
          return;
        }

        // Reload to get updated state
        await get().load();
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to update issue',
        });
      }
    },

    waiveIssue: async (issueId, { waivedBy, waivedReason }) => {
      set({ loading: true, error: null });

      try {
        const result = await svc.updateIssue({
          jobId,
          issueId,
          patch: {
            status: 'WAIVED',
            waivedBy,
            waivedReason,
          },
        });

        if (!result.ok) {
          set({ loading: false, error: result.reason });
          return;
        }

        // Reload to get updated state
        await get().load();
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to waive issue',
        });
      }
    },

    unwaiveIssue: async (issueId, { unwaivedBy, unwaivedReason, nextStatus }) => {
      set({ loading: true, error: null });

      try {
        const result = await svc.unwaiveIssue({
          jobId,
          issueId,
          nextStatus,
          unwaivedBy,
          unwaivedReason,
        });

        if (!result.ok) {
          set({ loading: false, error: result.reason });
          return;
        }

        // Reload to get updated state
        await get().load();
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to unwaive issue',
        });
      }
    },

    clearError: () => {
      set({ error: null });
    },
  }));
}

// ============================================
// SELECTORS
// ============================================

/**
 * Check if any issues are present
 */
export function selectHasIssues(state: FixPlanState): boolean {
  return state.issues.length > 0;
}

/**
 * Check if blocked
 */
export function selectIsBlocked(state: FixPlanState): boolean {
  return state.blocked.blocked;
}

/**
 * Get blocking count
 */
export function selectBlockingCount(state: FixPlanState): number {
  return state.blocked.count;
}

/**
 * Get issues by status
 */
export function selectIssuesByStatus(state: FixPlanState, status: IssueStatus): IssueItem[] {
  return state.issues.filter((i) => i.status === status);
}

/**
 * Get open issues (OPEN + IN_PROGRESS)
 */
export function selectOpenIssues(state: FixPlanState): IssueItem[] {
  return state.issues.filter((i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS');
}

/**
 * Get resolved issues (RESOLVED + WAIVED)
 */
export function selectResolvedIssues(state: FixPlanState): IssueItem[] {
  return state.issues.filter((i) => i.status === 'RESOLVED' || i.status === 'WAIVED');
}
