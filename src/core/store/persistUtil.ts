/**
 * Persist Utilities for Zustand Stores
 *
 * Provides helpers for project-scoped persistence with versioning and migration.
 *
 * Features:
 * - Project-scoped storage (separate data per project)
 * - Version tracking for schema migrations
 * - Type-safe migration functions
 *
 * @version 1.0.0
 */

import { StateCreator, StoreMutatorIdentifier } from 'zustand';
import { persist, createJSONStorage, PersistOptions } from 'zustand/middleware';
import { projectScopedStorage } from './projectScopedStorage';

// ============================================
// TYPES
// ============================================

export interface ProjectPersistOptions<T> {
  /** Storage key name (e.g., 'monolith:cabinetstore') */
  name: string;

  /** Schema version - increment when state shape changes */
  version?: number;

  /**
   * Migration function for upgrading old state versions
   * @param persistedState - State from storage (may be old version)
   * @param version - Version number of the persisted state
   * @returns Migrated state matching current schema
   */
  migrate?: (persistedState: unknown, version: number) => T;

  /**
   * Partial state selector - choose which parts to persist
   * @param state - Full store state
   * @returns Partial state to persist
   */
  partialize?: (state: T) => Partial<T>;

  /**
   * Called when rehydration completes
   */
  onRehydrateStorage?: (state: T | undefined) => ((state?: T, error?: unknown) => void) | void;
}

// ============================================
// HELPER
// ============================================

/**
 * Creates persist options configured for project-scoped storage.
 *
 * Usage:
 * ```ts
 * export const useMyStore = create<MyState>()(
 *   persist(
 *     immer((set, get) => ({ ... })),
 *     createProjectPersistOptions<MyState>({
 *       name: 'monolith:mystore',
 *       version: 1,
 *       migrate: (old, ver) => { ... },
 *       partialize: (state) => ({ ...pick fields... }),
 *     })
 *   )
 * );
 * ```
 */
export function createProjectPersistOptions<T>(
  options: ProjectPersistOptions<T>
): PersistOptions<T, Partial<T>> {
  const {
    name,
    version = 1,
    migrate,
    partialize,
    onRehydrateStorage,
  } = options;

  return {
    name,
    version,
    storage: createJSONStorage(() => projectScopedStorage),
    migrate: migrate as PersistOptions<T, Partial<T>>['migrate'],
    partialize,
    onRehydrateStorage,
  };
}

/**
 * Default migration that returns state as-is.
 * Use as a starting point for migrations.
 */
export function defaultMigration<T>(persistedState: unknown, _version: number): T {
  // Version 0 → 1: No changes, just return as-is
  return persistedState as T;
}

/**
 * Creates a migration function with version handlers.
 *
 * Usage:
 * ```ts
 * const migrate = createMigration<MyState>({
 *   1: (state) => ({ ...state, newField: 'default' }),
 *   2: (state) => ({ ...state, renamedField: state.oldField }),
 * });
 * ```
 */
export function createMigration<T>(
  handlers: Record<number, (state: any) => any>
): (persistedState: unknown, version: number) => T {
  return (persistedState: unknown, version: number): T => {
    let state = persistedState as any;
    const targetVersion = Math.max(...Object.keys(handlers).map(Number));

    // Apply migrations in order
    for (let v = version + 1; v <= targetVersion; v++) {
      if (handlers[v]) {
        console.log(`[Persist] Migrating ${v - 1} → ${v}`);
        state = handlers[v](state);
      }
    }

    return state as T;
  };
}

// ============================================
// EXPORTS
// ============================================

export { projectScopedStorage } from './projectScopedStorage';
