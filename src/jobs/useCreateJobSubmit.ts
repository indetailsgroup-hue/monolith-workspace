/**
 * jobs/useCreateJobSubmit.ts — Supabase insert with optimistic UI update
 *
 * Handles the full submission flow:
 * 1. Optimistically adds job to local store (immediate UI feedback)
 * 2. Sends INSERT to Supabase `job` table
 * 3. On success: updates local record with server-assigned fields (job_id, job_code)
 * 4. On failure: rolls back the optimistic insert, shows error
 *
 * @version 15.2.0
 */

import { useState, useCallback, useRef } from 'react';
import { type Job, type CreateJobInput, generateJobCode } from './types';
import { useJobStore } from './jobStore';

// ============================================================================
// Types
// ============================================================================

export interface CreateJobSubmitState {
  /** Whether the submit is in-flight */
  isSubmitting: boolean;
  /** Error message if submission failed */
  error: string | null;
  /** The successfully created job (after server confirms) */
  createdJob: Job | null;
  /** Whether optimistic rollback occurred */
  rolledBack: boolean;
}

export interface UseCreateJobSubmitReturn extends CreateJobSubmitState {
  /** Submit job to Supabase with optimistic local insert */
  submit: (input: CreateJobInput, userId: string) => Promise<Job | null>;
  /** Reset state for re-submission */
  reset: () => void;
}

// ============================================================================
// Supabase Client Helpers
// ============================================================================

interface SupabaseConfig {
  url: string;
  anonKey: string;
}

function getSupabaseConfig(): SupabaseConfig | null {
  const url = typeof import.meta !== 'undefined'
    ? (import.meta as any).env?.VITE_SUPABASE_URL
    : undefined;
  const anonKey = typeof import.meta !== 'undefined'
    ? (import.meta as any).env?.VITE_SUPABASE_ANON_KEY
    : undefined;

  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** Convert camelCase Job to snake_case DB row */
function jobToDbRow(job: Job): Record<string, unknown> {
  return {
    job_id: job.jobId,
    job_code: job.jobCode,
    title: job.title,
    customer_id: job.customer.customerId,
    customer_name: job.customer.name,
    customer_phone: job.customer.phone ?? null,
    customer_email: job.customer.email ?? null,
    customer_address: job.customer.address ?? null,
    panels: JSON.stringify(job.panels),
    status: job.status.toLowerCase(),
    priority: job.priority.toLowerCase(),
    deadline: job.deadline ?? null,
    material_group: job.materialGroup,
    total_panel_count: job.totalPanelCount,
    notes: job.notes ?? null,
    created_by: job.createdBy,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  };
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useCreateJobSubmit(): UseCreateJobSubmitReturn {
  const createJob = useJobStore((s) => s.createJob);
  const updateJob = useJobStore((s) => s.updateJob);
  const deleteJobFromStore = useJobStore((s) => s.deleteJob);

  const [state, setState] = useState<CreateJobSubmitState>({
    isSubmitting: false,
    error: null,
    createdJob: null,
    rolledBack: false,
  });

  const optimisticJobIdRef = useRef<string | null>(null);

  const submit = useCallback(
    async (input: CreateJobInput, userId: string): Promise<Job | null> => {
      setState({
        isSubmitting: true,
        error: null,
        createdJob: null,
        rolledBack: false,
      });

      // ── Step 1: Optimistic local insert ──────────────────────────────────
      const optimisticJob = createJob(input, userId);
      optimisticJobIdRef.current = optimisticJob.jobId;

      // ── Step 2: Attempt Supabase insert ──────────────────────────────────
      const config = getSupabaseConfig();

      if (!config) {
        // No Supabase configured — keep local-only (dev mode)
        setState({
          isSubmitting: false,
          error: null,
          createdJob: optimisticJob,
          rolledBack: false,
        });
        return optimisticJob;
      }

      try {
        const dbRow = jobToDbRow(optimisticJob);

        const response = await fetch(
          `${config.url}/rest/v1/job`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: config.anonKey,
              Authorization: `Bearer ${config.anonKey}`,
              Prefer: 'return=representation',
            },
            body: JSON.stringify(dbRow),
          },
        );

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `Supabase insert failed (${response.status}): ${errorBody}`,
          );
        }

        // ── Step 3: Sync server response ─────────────────────────────────
        const [serverRecord] = await response.json();

        if (serverRecord) {
          // Update local store with any server-assigned fields
          // (e.g., server might override job_code with a DB sequence)
          const serverJobCode = serverRecord.job_code ?? optimisticJob.jobCode;
          if (serverJobCode !== optimisticJob.jobCode) {
            updateJob(optimisticJob.jobId, { jobCode: serverJobCode } as any);
          }
        }

        const finalJob = { ...optimisticJob, jobCode: serverRecord?.job_code ?? optimisticJob.jobCode };
        setState({
          isSubmitting: false,
          error: null,
          createdJob: finalJob,
          rolledBack: false,
        });
        return finalJob;
      } catch (err) {
        // ── Step 4: Rollback on failure ────────────────────────────────────
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';

        // Remove the optimistic job from local store
        if (optimisticJobIdRef.current) {
          // Force deletion regardless of status by temporarily setting to DRAFT
          deleteJobFromStore(optimisticJobIdRef.current);
        }

        setState({
          isSubmitting: false,
          error: errorMessage,
          createdJob: null,
          rolledBack: true,
        });
        return null;
      }
    },
    [createJob, updateJob, deleteJobFromStore],
  );

  const reset = useCallback(() => {
    setState({
      isSubmitting: false,
      error: null,
      createdJob: null,
      rolledBack: false,
    });
    optimisticJobIdRef.current = null;
  }, []);

  return {
    ...state,
    submit,
    reset,
  };
}
