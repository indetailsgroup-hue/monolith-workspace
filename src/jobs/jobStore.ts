/**
 * jobs/jobStore.ts — Zustand store for Job lifecycle management
 *
 * Features:
 * - CRUD operations (create, update, delete)
 * - Status transitions with validation
 * - Filtering by status, priority, customer
 * - Persist to localStorage (MVP), Supabase-ready interface
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type Job,
  type JobStatus,
  type CreateJobInput,
  canTransition,
  generateJobCode,
} from './types';

// ============================================================================
// Store Interface
// ============================================================================

interface JobState {
  jobs: Job[];
  selectedJobId: string | null;
}

interface JobActions {
  /** Create a new job (DRAFT status) */
  createJob: (input: CreateJobInput, createdBy: string) => Job;
  /** Update job fields (non-status) */
  updateJob: (jobId: string, updates: Partial<Omit<Job, 'jobId' | 'jobCode' | 'createdAt' | 'createdBy'>>) => void;
  /** Transition job status with validation */
  transitionStatus: (jobId: string, newStatus: JobStatus) => { success: boolean; error?: string };
  /** Delete a job (only DRAFT/CLOSED) */
  deleteJob: (jobId: string) => { success: boolean; error?: string };
  /** Select a job for detail view */
  selectJob: (jobId: string | null) => void;
  /** Get job by ID */
  getJob: (jobId: string) => Job | undefined;
  /** Get jobs by status */
  getJobsByStatus: (status: JobStatus) => Job[];
  /** Get active jobs (not CLOSED/DELIVERED/INVOICED) */
  getActiveJobs: () => Job[];
  /** Link quotation to job */
  linkQuotation: (jobId: string, quotationId: string) => void;
  /** Link invoice to job */
  linkInvoice: (jobId: string, invoiceId: string) => void;
}

type JobStore = JobState & JobActions;

// ============================================================================
// Store Implementation
// ============================================================================

export const useJobStore = create<JobStore>()(
  persist(
    (set, get) => ({
      jobs: [],
      selectedJobId: null,

      createJob: (input, createdBy) => {
        const now = new Date().toISOString();
        const job: Job = {
          jobId: crypto.randomUUID(),
          jobCode: generateJobCode(),
          title: input.title,
          customer: input.customer,
          panels: input.panels,
          status: 'DRAFT',
          priority: input.priority,
          deadline: input.deadline,
          materialGroup: input.materialGroup,
          totalPanelCount: input.panels.reduce((sum, p) => sum + p.qty, 0),
          notes: input.notes,
          createdAt: now,
          updatedAt: now,
          createdBy,
        };

        set((state) => ({ jobs: [...state.jobs, job] }));
        return job;
      },

      updateJob: (jobId, updates) => {
        set((state) => ({
          jobs: state.jobs.map((j) =>
            j.jobId === jobId
              ? { ...j, ...updates, updatedAt: new Date().toISOString() }
              : j,
          ),
        }));
      },

      transitionStatus: (jobId, newStatus) => {
        const job = get().jobs.find((j) => j.jobId === jobId);
        if (!job) return { success: false, error: 'Job not found' };
        if (!canTransition(job.status, newStatus)) {
          return {
            success: false,
            error: `Cannot transition from ${job.status} to ${newStatus}`,
          };
        }

        set((state) => ({
          jobs: state.jobs.map((j) =>
            j.jobId === jobId
              ? { ...j, status: newStatus, updatedAt: new Date().toISOString() }
              : j,
          ),
        }));
        return { success: true };
      },

      deleteJob: (jobId) => {
        const job = get().jobs.find((j) => j.jobId === jobId);
        if (!job) return { success: false, error: 'Job not found' };
        if (job.status !== 'DRAFT' && job.status !== 'CLOSED') {
          return { success: false, error: 'Can only delete DRAFT or CLOSED jobs' };
        }

        set((state) => ({
          jobs: state.jobs.filter((j) => j.jobId !== jobId),
          selectedJobId: state.selectedJobId === jobId ? null : state.selectedJobId,
        }));
        return { success: true };
      },

      selectJob: (jobId) => set({ selectedJobId: jobId }),

      getJob: (jobId) => get().jobs.find((j) => j.jobId === jobId),

      getJobsByStatus: (status) => get().jobs.filter((j) => j.status === status),

      getActiveJobs: () =>
        get().jobs.filter((j) => !['CLOSED', 'DELIVERED', 'INVOICED'].includes(j.status)),

      linkQuotation: (jobId, quotationId) => {
        set((state) => ({
          jobs: state.jobs.map((j) =>
            j.jobId === jobId ? { ...j, quotationId, updatedAt: new Date().toISOString() } : j,
          ),
        }));
      },

      linkInvoice: (jobId, invoiceId) => {
        set((state) => ({
          jobs: state.jobs.map((j) =>
            j.jobId === jobId ? { ...j, invoiceId, updatedAt: new Date().toISOString() } : j,
          ),
        }));
      },
    }),
    {
      name: 'monolith-jobs-store',
      version: 1,
    },
  ),
);
