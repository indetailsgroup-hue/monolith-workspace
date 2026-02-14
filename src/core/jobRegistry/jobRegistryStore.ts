/**
 * jobRegistryStore.ts - Job Registry Store Interface
 *
 * Tracks all known job IDs in the system.
 * Used by the trust chain service to manage revision forks.
 *
 * @version 1.0.0
 */

/**
 * Job registry store for tracking job identifiers
 */
export interface JobRegistryStore {
  /** List all known job IDs */
  listJobIds(): Promise<string[]>;
  /** Register a new job ID */
  addJobId(jobId: string): Promise<void>;
  /** Check if a job ID exists */
  getJobId(jobId: string): Promise<string | null>;
}
