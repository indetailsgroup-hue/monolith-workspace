/**
 * useRehydrateToolStoreOnProjectChange
 *
 * Hook that triggers useToolStore rehydration when the active project changes.
 * This ensures tool settings are loaded from the correct project-scoped storage.
 *
 * Usage:
 * ```tsx
 * function DesignerCanvas() {
 *   useRehydrateToolStoreOnProjectChange();
 *   return <Canvas>...</Canvas>;
 * }
 * ```
 *
 * @version 1.0.0
 */

import { useEffect, useRef } from 'react';
import { useProjectStore } from './useProjectStore';
import { useToolStore } from './useToolStore';

/**
 * Rehydrates useToolStore when the project ID changes.
 *
 * On mount: No rehydration (initial load already happened)
 * On project change: Calls persist.rehydrate() to load new project's settings
 */
export function useRehydrateToolStoreOnProjectChange(): void {
  const projectId = useProjectStore((s) => s.metadata?.id);
  const previousProjectIdRef = useRef<string | undefined>(projectId);

  useEffect(() => {
    // Skip initial mount
    if (previousProjectIdRef.current === undefined) {
      previousProjectIdRef.current = projectId;
      return;
    }

    // Project changed - rehydrate tool store
    if (projectId !== previousProjectIdRef.current) {
      previousProjectIdRef.current = projectId;

      // Rehydrate the store from project-scoped storage
      const persistApi = useToolStore.persist;
      if (persistApi && typeof persistApi.rehydrate === 'function') {
        persistApi.rehydrate();
      }
    }
  }, [projectId]);
}

export default useRehydrateToolStoreOnProjectChange;
