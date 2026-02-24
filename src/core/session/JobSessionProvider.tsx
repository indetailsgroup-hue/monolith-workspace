/**
 * JobSessionProvider.tsx - Job Session Context Management
 *
 * PURPOSE:
 * - Provides React context for current job session
 * - Manages Zustand store lifecycle per job
 * - Enables "Open new revision" navigation after fork
 *
 * ARCHITECTURE:
 * - JobSessionContext: Current job ID and navigation callback
 * - useJobSession: Hook for accessing session context
 * - JobSessionProvider: Provider component with store recreation
 *
 * USAGE:
 * // In app root
 * <JobSessionProvider
 *   jobId={currentJobId}
 *   createStore={(jobId) => createReceiptIngestStore({ jobId, svc })}
 *   onOpenJob={(newJobId) => navigate(`/job/${newJobId}`)}
 * >
 *   <ReceiptIngestPanel />
 * </JobSessionProvider>
 *
 * // In component
 * const { jobId, openJob, store } = useJobSession();
 * openJob('JOB_001__R2'); // Navigate to new revision
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { ReceiptIngestState } from '../receiptIngest/receiptIngestStore';

// ============================================
// CONTEXT TYPE
// ============================================

export interface JobSessionContextValue<TStore = ReceiptIngestState> {
  /** Current job ID */
  jobId: string;

  /** Navigate to a different job */
  openJob: (newJobId: string) => void;

  /** Current store instance */
  store: UseBoundStore<StoreApi<TStore>> | null;
}

// ============================================
// CONTEXT
// ============================================

const JobSessionContext = createContext<JobSessionContextValue | null>(null);

// ============================================
// HOOK
// ============================================

/**
 * Hook for accessing job session context
 *
 * @throws Error if used outside JobSessionProvider
 */
export function useJobSession<TStore = ReceiptIngestState>(): JobSessionContextValue<TStore> {
  const ctx = useContext(JobSessionContext);

  if (!ctx) {
    throw new Error('useJobSession must be used within JobSessionProvider');
  }

  return ctx as JobSessionContextValue<TStore>;
}

// ============================================
// PROVIDER PROPS
// ============================================

export interface JobSessionProviderProps<TStore> {
  /** Initial job ID */
  jobId: string;

  /** Factory to create store for a job */
  createStore: (jobId: string) => UseBoundStore<StoreApi<TStore>>;

  /** Callback when user requests to open a different job */
  onOpenJob?: (newJobId: string) => void;

  /** Children */
  children: React.ReactNode;
}

// ============================================
// PROVIDER COMPONENT
// ============================================

/**
 * Job session provider component
 *
 * Manages Zustand store lifecycle per job ID.
 * When job ID changes, a new store is created.
 */
export function JobSessionProvider<TStore = ReceiptIngestState>({
  jobId,
  createStore,
  onOpenJob,
  children,
}: JobSessionProviderProps<TStore>) {
  // Track current job ID internally (for external navigation)
  const [currentJobId, setCurrentJobId] = useState(jobId);

  // Create store for current job
  const [store, setStore] = useState<UseBoundStore<StoreApi<TStore>> | null>(() =>
    createStore(currentJobId)
  );

  // Update when external jobId prop changes
  useEffect(() => {
    if (jobId !== currentJobId) {
      setCurrentJobId(jobId);
      setStore(createStore(jobId));
    }
  }, [jobId, currentJobId, createStore]);

  // Navigate to a new job
  const openJob = useCallback(
    (newJobId: string) => {
      // Update internal state
      setCurrentJobId(newJobId);
      setStore(createStore(newJobId));

      // Notify parent for URL update
      if (onOpenJob) {
        onOpenJob(newJobId);
      }
    },
    [createStore, onOpenJob]
  );

  // Memoize context value
  const value = useMemo<JobSessionContextValue<TStore>>(
    () => ({
      jobId: currentJobId,
      openJob,
      store,
    }),
    [currentJobId, openJob, store]
  );

  return (
    <JobSessionContext.Provider value={value as JobSessionContextValue}>
      {children}
    </JobSessionContext.Provider>
  );
}

// ============================================
// EXPORTS
// ============================================

export default JobSessionProvider;
