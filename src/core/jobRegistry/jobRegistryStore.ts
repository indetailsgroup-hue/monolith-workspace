/**
 * jobRegistryStore.ts - Job Registry Store Interface
 *
 * ARCHITECTURE:
 * - Tracks all job IDs in the system
 * - Used for:
 *   - Listing all jobs
 *   - Checking if job exists
 *   - Deriving next revision ID (JOB__R2, JOB__R3, etc.)
 *
 * IMPLEMENTATIONS:
 * - localStorage (MVP, single-user)
 * - IndexedDB (multi-user, larger datasets)
 * - Server API (production, multi-device sync)
 */

// ============================================
// INTERFACE
// ============================================

/**
 * Job registry store contract
 */
export interface JobRegistryStore {
  /**
   * Add a job ID to the registry
   * @param jobId - Job ID to register
   */
  addJobId: (jobId: string) => Promise<void>;

  /**
   * List all registered job IDs
   * @returns Array of job IDs (sorted)
   */
  listJobIds: () => Promise<string[]>;

  /**
   * Check if a job ID exists in registry
   * @param jobId - Job ID to check
   */
  hasJobId: (jobId: string) => Promise<boolean>;

  /**
   * Remove a job ID from registry (optional)
   * @param jobId - Job ID to remove
   */
  removeJobId?: (jobId: string) => Promise<void>;
}
