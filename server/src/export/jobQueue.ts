/**
 * Export Job Queue
 *
 * Step 9: Simple in-memory job queue for export workers
 *
 * Features:
 * - FIFO queue with status tracking
 * - Concurrent processing limit
 * - Job status updates
 * - Simple worker processing
 */

import { v4 as uuid } from 'uuid';
import type { ExportJob, ExportRequest, JobStatus, ExportJobResult } from '../types.js';

// ============================================================================
// In-Memory Queue
// ============================================================================

const jobs = new Map<string, ExportJob>();
const queue: string[] = []; // FIFO queue of job IDs
let isProcessing = false;
const MAX_CONCURRENT = 2;
let activeCount = 0;

// Job processor function (set by exportService)
let jobProcessor: ((job: ExportJob) => Promise<ExportJobResult>) | null = null;

// ============================================================================
// Queue Operations
// ============================================================================

/**
 * Set the job processor function.
 */
export function setJobProcessor(
  processor: (job: ExportJob) => Promise<ExportJobResult>
): void {
  jobProcessor = processor;
}

/**
 * Add a new job to the queue.
 */
export function enqueueJob(bundleId: string, request: ExportRequest): ExportJob {
  const job: ExportJob = {
    id: uuid(),
    status: 'QUEUED',
    request,
    bundleId,
    createdAtIso: new Date().toISOString(),
  };

  jobs.set(job.id, job);
  queue.push(job.id);

  // Start processing if not already running
  processQueue();

  return job;
}

/**
 * Get a job by ID.
 */
export function getJob(jobId: string): ExportJob | null {
  return jobs.get(jobId) ?? null;
}

/**
 * Get all jobs.
 */
export function getAllJobs(): ExportJob[] {
  return Array.from(jobs.values());
}

/**
 * Get jobs by status.
 */
export function getJobsByStatus(status: JobStatus): ExportJob[] {
  return Array.from(jobs.values()).filter((j) => j.status === status);
}

/**
 * Get queue stats.
 */
export function getQueueStats(): {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
} {
  const all = Array.from(jobs.values());
  return {
    total: all.length,
    queued: all.filter((j) => j.status === 'QUEUED').length,
    processing: all.filter((j) => j.status === 'PROCESSING').length,
    completed: all.filter((j) => j.status === 'COMPLETED').length,
    failed: all.filter((j) => j.status === 'FAILED').length,
  };
}

// ============================================================================
// Queue Processing
// ============================================================================

async function processQueue(): Promise<void> {
  if (isProcessing || !jobProcessor) return;

  isProcessing = true;

  while (queue.length > 0 && activeCount < MAX_CONCURRENT) {
    const jobId = queue.shift();
    if (!jobId) continue;

    const job = jobs.get(jobId);
    if (!job || job.status !== 'QUEUED') continue;

    activeCount++;
    processJob(job).finally(() => {
      activeCount--;
      // Continue processing if there are more jobs
      if (queue.length > 0) {
        processQueue();
      }
    });
  }

  isProcessing = false;
}

async function processJob(job: ExportJob): Promise<void> {
  if (!jobProcessor) {
    updateJobStatus(job.id, 'FAILED', undefined, 'No job processor configured');
    return;
  }

  try {
    // Update to processing
    updateJobStatus(job.id, 'PROCESSING');
    job.startedAtIso = new Date().toISOString();

    // Process the job
    const result = await jobProcessor(job);

    // Update to completed
    updateJobStatus(job.id, 'COMPLETED', result);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    updateJobStatus(job.id, 'FAILED', undefined, errorMessage);
  }
}

function updateJobStatus(
  jobId: string,
  status: JobStatus,
  result?: ExportJobResult,
  error?: string
): void {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = status;

  if (status === 'COMPLETED' || status === 'FAILED') {
    job.completedAtIso = new Date().toISOString();
  }

  if (result) {
    job.result = result;
  }

  if (error) {
    job.error = error;
  }
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Remove completed/failed jobs older than the specified age.
 */
export function cleanupOldJobs(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const now = Date.now();
  let removed = 0;

  for (const [jobId, job] of jobs) {
    if (job.status === 'COMPLETED' || job.status === 'FAILED') {
      const completedAt = job.completedAtIso
        ? new Date(job.completedAtIso).getTime()
        : 0;
      if (now - completedAt > maxAgeMs) {
        jobs.delete(jobId);
        removed++;
      }
    }
  }

  return removed;
}

/**
 * Clear all jobs (for testing).
 */
export function clearJobs(): void {
  jobs.clear();
  queue.length = 0;
  activeCount = 0;
  isProcessing = false;
}
