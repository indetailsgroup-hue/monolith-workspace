/**
 * Verify Status Store - Cache server verify results
 * Priority 4A: Status wiring for ProjectHome
 *
 * Features:
 * - TTL-based caching (default 60s)
 * - In-flight request deduplication
 * - Manual refresh support
 *
 * @version 0.12.2
 */

import { create } from 'zustand';
import { verifyJobApi } from '../../factory/api/verifyApi';
import type { VerifyApiResponse } from '../../factory/types/job';

// Re-export verdict type for convenience
export type VerifyVerdict = VerifyApiResponse['verdict'];

export interface VerifyStatus {
  verdict: VerifyVerdict;
  code?: string;
  summary?: string;
  log?: string;
  fetchedAtMs: number;
}

interface VerifyEntry {
  status?: VerifyStatus;
  loading: boolean;
  error?: string;
  inFlight?: Promise<void>;
}

interface VerifyStatusState {
  byJobId: Record<string, VerifyEntry>;

  /**
   * Ensure status is cached. If stale or missing, fetch from server.
   * Uses in-flight deduplication to prevent concurrent requests.
   */
  ensureStatus: (jobId: string, opts?: { maxAgeMs?: number }) => Promise<void>;

  /**
   * Force refresh status, bypassing TTL cache.
   */
  refreshStatus: (jobId: string) => Promise<void>;

  /**
   * Get cached status without fetching.
   */
  getStatus: (jobId: string) => VerifyStatus | undefined;
}

function nowMs(): number {
  return Date.now();
}

function normalizeResponse(res: VerifyApiResponse): VerifyStatus {
  return {
    verdict: res.verdict,
    code: res.code,
    summary: res.summary,
    log: res.log,
    fetchedAtMs: nowMs(),
  };
}

export const useVerifyStatusStore = create<VerifyStatusState>((set, get) => ({
  byJobId: {},

  ensureStatus: async (jobId, opts) => {
    const maxAgeMs = opts?.maxAgeMs ?? 60_000; // Default 60s TTL

    const cur = get().byJobId[jobId];
    const isFresh = cur?.status && (nowMs() - cur.status.fetchedAtMs) <= maxAgeMs;

    // Return early if cache is fresh
    if (isFresh) return;

    // In-flight deduplication: return existing promise if one is running
    if (cur?.inFlight) return cur.inFlight;

    // Create new fetch promise
    const fetchPromise = (async () => {
      // Set loading state
      set((s) => ({
        byJobId: {
          ...s.byJobId,
          [jobId]: {
            ...s.byJobId[jobId],
            loading: true,
            error: undefined,
          },
        },
      }));

      try {
        const res = await verifyJobApi(jobId);
        const status = normalizeResponse(res);

        set((s) => ({
          byJobId: {
            ...s.byJobId,
            [jobId]: {
              status,
              loading: false,
              error: undefined,
              inFlight: undefined,
            },
          },
        }));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);

        set((s) => ({
          byJobId: {
            ...s.byJobId,
            [jobId]: {
              ...s.byJobId[jobId],
              loading: false,
              error: msg,
              inFlight: undefined,
            },
          },
        }));
      }
    })();

    // Store the in-flight promise for deduplication
    set((s) => ({
      byJobId: {
        ...s.byJobId,
        [jobId]: {
          ...(s.byJobId[jobId] ?? { loading: false }),
          inFlight: fetchPromise,
        },
      },
    }));

    return fetchPromise;
  },

  refreshStatus: async (jobId) => {
    // Clear cached status to force refresh
    set((s) => ({
      byJobId: {
        ...s.byJobId,
        [jobId]: {
          ...(s.byJobId[jobId] ?? { loading: false }),
          status: undefined,
        },
      },
    }));

    // Fetch with TTL=0 to bypass cache
    return get().ensureStatus(jobId, { maxAgeMs: 0 });
  },

  getStatus: (jobId) => {
    return get().byJobId[jobId]?.status;
  },
}));
