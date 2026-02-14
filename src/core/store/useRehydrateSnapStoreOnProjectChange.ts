/**
 * useRehydrateSnapStoreOnProjectChange
 *
 * Hook that triggers useSnapStore rehydration when the active project changes.
 *
 * @version 1.0.0
 */

import { useEffect, useRef } from 'react';
import { useProjectStore } from './useProjectStore';
import { useSnapStore } from './useSnapStore';

/**
 * Rehydrates useSnapStore when the project ID changes.
 */
export function useRehydrateSnapStoreOnProjectChange(): void {
  const projectId = useProjectStore((s) => s.metadata?.id);
  const previousProjectIdRef = useRef<string | undefined>(projectId);

  useEffect(() => {
    // Skip initial mount
    if (previousProjectIdRef.current === undefined) {
      previousProjectIdRef.current = projectId;
      return;
    }

    // Project changed - rehydrate snap store
    if (projectId !== previousProjectIdRef.current) {
      previousProjectIdRef.current = projectId;

      // Rehydrate the store from project-scoped storage
      const persistApi = (useSnapStore as any).persist;
      if (persistApi && typeof persistApi.rehydrate === 'function') {
        persistApi.rehydrate();
      }
    }
  }, [projectId]);
}

export default useRehydrateSnapStoreOnProjectChange;
