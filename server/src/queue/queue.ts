/**
 * BullMQ Queue System
 *
 * Step 10: Multi-process job queue with Redis
 *
 * Features:
 * - Shared queue between API and Worker processes
 * - Redis connection management
 * - Job type definitions
 */

import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';

// ============================================================================
// Constants
// ============================================================================

export const QUEUE_NAME = 'iimos_export_jobs';

// ============================================================================
// Job Types
// ============================================================================

export interface ExportJobData {
  bundleId: string;
  format: 'CUTLIST_CSV' | 'DXF_R12' | 'DXF_SHEET' | 'DXF_SHEET_V2' | 'GCODE' | 'GCODE_KDT_MVP';
  jobName: string;
  options?: Record<string, unknown>;
}

export interface ExportJobResult {
  ok: boolean;
  outputPublicIndexPath?: string;
  error?: string;
}

// ============================================================================
// Redis Connection
// ============================================================================

let redisInstance: Redis | null = null;

/**
 * Create or return existing Redis connection.
 */
export function makeRedis(): Redis {
  if (redisInstance) return redisInstance;

  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  redisInstance = new Redis(url, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
  });

  redisInstance.on('error', (err: Error) => {
    console.error('[Redis] Connection error:', err.message);
  });

  redisInstance.on('connect', () => {
    console.log('[Redis] Connected to', url);
  });

  return redisInstance;
}

/**
 * Close Redis connection.
 */
export async function closeRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
}

// ============================================================================
// Queue Factory
// ============================================================================

let queueInstance: Queue<ExportJobData, ExportJobResult> | null = null;

/**
 * Create or return existing queue instance.
 */
export function makeQueue(): Queue<ExportJobData, ExportJobResult> {
  if (queueInstance) return queueInstance;

  const connection = makeRedis();
  queueInstance = new Queue<ExportJobData, ExportJobResult>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: {
        age: 3600, // Keep completed jobs for 1 hour
        count: 100, // Keep at most 100 completed jobs
      },
      removeOnFail: {
        age: 86400, // Keep failed jobs for 24 hours
      },
    },
  });

  return queueInstance;
}

/**
 * Close queue connection.
 */
export async function closeQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}

// ============================================================================
// Worker Factory
// ============================================================================

export type JobProcessor = (job: Job<ExportJobData, ExportJobResult>) => Promise<ExportJobResult>;

/**
 * Create a worker for processing export jobs.
 */
export function makeWorker(
  processor: JobProcessor,
  options?: { concurrency?: number }
): Worker<ExportJobData, ExportJobResult> {
  const connection = makeRedis();

  const worker = new Worker<ExportJobData, ExportJobResult>(
    QUEUE_NAME,
    processor,
    {
      connection,
      concurrency: options?.concurrency ?? 2,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Worker] Error:', err.message);
  });

  return worker;
}

// ============================================================================
// Queue Helpers
// ============================================================================

/**
 * Get queue statistics.
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = makeQueue();

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Add an export job to the queue.
 */
export async function enqueueExportJob(
  data: ExportJobData
): Promise<Job<ExportJobData, ExportJobResult>> {
  const queue = makeQueue();
  const job = await queue.add('export', data);
  console.log(`[Queue] Job ${job.id} added: ${data.format} for bundle ${data.bundleId}`);
  return job;
}

/**
 * Get a job by ID.
 */
export async function getJobById(
  jobId: string
): Promise<Job<ExportJobData, ExportJobResult> | undefined> {
  const queue = makeQueue();
  return queue.getJob(jobId);
}
