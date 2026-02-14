/**
 * localStorageJobRegistry.ts - Job Registry using localStorage
 *
 * MVP implementation for single-user desktop apps.
 * Suitable for Electron or local browser usage.
 *
 * For production multi-user:
 * - Use IndexedDB for larger datasets
 * - Use server API for multi-device sync
 *
 * GATE RULE (G9): Uses Zod validation for localStorage data.
 */

import { z } from 'zod';
import type { JobRegistryStore } from './jobRegistryStore';
import { parseAndValidateSafe } from '../gate/validateExternalState';

// ============================================
// CONSTANTS
// ============================================

const STORAGE_KEY = 'MONOLITH_JOB_REGISTRY_V1';

// ============================================
// G9 SCHEMA
// ============================================

/** Job IDs must be non-empty strings */
const JobIdSchema = z.string().min(1);

/** Registry is an array of job IDs */
const JobRegistrySchema = z.array(JobIdSchema);

// ============================================
// HELPERS
// ============================================

function readRegistry(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    // G9: Validate with Zod schema
    const result = parseAndValidateSafe(raw, JobRegistrySchema, 'localStorage-job-registry');
    if (!result.ok) {
      console.warn('[JobRegistry] G9 validation failed, resetting registry:', result.issues);
      return [];
    }

    return result.data;
  } catch {
    return [];
  }
}

function writeRegistry(ids: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

// ============================================
// FACTORY
// ============================================

/**
 * Create a job registry backed by localStorage
 *
 * @example
 * const registry = createLocalStorageJobRegistry();
 * await registry.addJobId('JOB_123');
 * const jobs = await registry.listJobIds();
 */
export function createLocalStorageJobRegistry(): JobRegistryStore {
  return {
    addJobId: async (jobId: string) => {
      const ids = readRegistry();

      if (!ids.includes(jobId)) {
        ids.push(jobId);
        ids.sort();
        writeRegistry(ids);
      }
    },

    listJobIds: async () => {
      return readRegistry();
    },

    hasJobId: async (jobId: string) => {
      return readRegistry().includes(jobId);
    },

    removeJobId: async (jobId: string) => {
      const ids = readRegistry();
      const filtered = ids.filter((id) => id !== jobId);
      writeRegistry(filtered);
    },
  };
}

// ============================================
// MEMORY IMPLEMENTATION (for testing)
// ============================================

/**
 * Create an in-memory job registry (for testing)
 */
export function createMemoryJobRegistry(): JobRegistryStore {
  const ids = new Set<string>();

  return {
    addJobId: async (jobId: string) => {
      ids.add(jobId);
    },

    listJobIds: async () => {
      return Array.from(ids).sort();
    },

    hasJobId: async (jobId: string) => {
      return ids.has(jobId);
    },

    removeJobId: async (jobId: string) => {
      ids.delete(jobId);
    },
  };
}
