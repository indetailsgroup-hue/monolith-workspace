/**
 * Project-Scoped Storage for Zustand Persist
 *
 * Creates a custom storage adapter that uses the current projectId
 * as part of the localStorage key, enabling per-project settings.
 *
 * Key format: `${baseName}:${projectId}` (e.g., 'monolith:toolstore:proj-123')
 *
 * @version 1.0.0
 */

import type { StateStorage } from 'zustand/middleware';
import { useProjectStore } from './useProjectStore';

// ============================================
// TYPES
// ============================================

export interface ProjectScopedStorageOptions {
  /** Fallback project ID when no project is loaded */
  fallbackProjectId?: string;
}

// ============================================
// HELPER
// ============================================

/**
 * Get current project ID from useProjectStore
 */
function getCurrentProjectId(fallback: string = 'default'): string {
  const metadata = useProjectStore.getState().metadata;
  return metadata?.id || fallback;
}

// ============================================
// STORAGE FACTORY
// ============================================

/**
 * Creates a project-scoped storage adapter for Zustand persist.
 *
 * Usage:
 * ```ts
 * persist(
 *   immer((set, get) => ({ ... })),
 *   {
 *     name: 'monolith:toolstore',
 *     storage: createProjectScopedStorage(),
 *   }
 * )
 * ```
 */
export function createProjectScopedStorage(
  options: ProjectScopedStorageOptions = {}
): StateStorage {
  const { fallbackProjectId = 'default' } = options;

  return {
    getItem: (name: string): string | null => {
      const projectId = getCurrentProjectId(fallbackProjectId);
      const key = `${name}:${projectId}`;
      const value = localStorage.getItem(key);
      // console.log(`[ProjectStorage] GET ${key}:`, value ? 'found' : 'null');
      return value;
    },

    setItem: (name: string, value: string): void => {
      const projectId = getCurrentProjectId(fallbackProjectId);
      const key = `${name}:${projectId}`;
      localStorage.setItem(key, value);
      // console.log(`[ProjectStorage] SET ${key}`);
    },

    removeItem: (name: string): void => {
      const projectId = getCurrentProjectId(fallbackProjectId);
      const key = `${name}:${projectId}`;
      localStorage.removeItem(key);
      // console.log(`[ProjectStorage] REMOVE ${key}`);
    },
  };
}

/**
 * Default instance of project-scoped storage
 */
export const projectScopedStorage = createProjectScopedStorage();

export default projectScopedStorage;
