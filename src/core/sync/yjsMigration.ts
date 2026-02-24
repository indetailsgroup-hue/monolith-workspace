/**
 * yjsMigration.ts - localStorage → IndexedDB Migration
 *
 * Migrates existing project data from localStorage (useProjectStore pattern)
 * into the Yjs Y.Doc + IndexedDB persistence layer.
 *
 * ## Migration Flow
 * 1. Check `MIGRATION_FLAG_KEY` in localStorage
 * 2. If not migrated: read `monolith-current-project` from localStorage
 * 3. Parse and validate the data
 * 4. Populate Y.Doc with the data
 * 5. y-indexeddb auto-persists to IndexedDB
 * 6. Set migration flag
 *
 * ## Safety
 * - localStorage data is NOT deleted after migration (kept as backup)
 * - Migration is idempotent (flag prevents re-migration)
 * - Failed migrations leave localStorage untouched
 *
 * @version 1.0.0 - T029 Phase 1
 */

import type { MonolithDoc } from './types';
import { MIGRATION_FLAG_KEY, type MigrationResult } from './types';
import { populateDoc } from './yjsDocument';
import { readString } from '../persistence/unsafeStorage';

// ============================================================================
// Constants
// ============================================================================

/** localStorage key used by useProjectStore */
const LEGACY_PROJECT_KEY = 'monolith-current-project';

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if migration from localStorage has already been performed.
 *
 * @returns true if migration flag is set
 */
export function hasMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATION_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Migrate existing localStorage project data into the Y.Doc.
 *
 * Reads the current project from localStorage (`monolith-current-project`),
 * parses it, and populates the Y.Doc. The y-indexeddb provider will
 * automatically persist the populated doc to IndexedDB.
 *
 * This function is idempotent — it checks the migration flag first.
 *
 * @param mdoc - Target MonolithDoc to populate
 * @param force - If true, ignore migration flag and re-migrate
 * @returns Migration result
 */
export function migrateFromLocalStorage(
  mdoc: MonolithDoc,
  force: boolean = false
): MigrationResult {
  // Check if already migrated
  if (!force && hasMigrated()) {
    return {
      migrated: false,
      projectId: null,
      cabinetCount: 0,
      migratedAt: Date.now(),
      error: null,
    };
  }

  try {
    // Read legacy project data via G9 boundary
    const raw = readString(LEGACY_PROJECT_KEY);
    if (!raw) {
      // No data to migrate — mark as migrated (nothing to do)
      setMigrationFlag();
      return {
        migrated: false,
        projectId: null,
        cabinetCount: 0,
        migratedAt: Date.now(),
        error: null,
      };
    }

    // Parse the raw JSON
    const projectData = JSON.parse(raw);

    if (!projectData || typeof projectData !== 'object') {
      setMigrationFlag();
      return {
        migrated: false,
        projectId: null,
        cabinetCount: 0,
        migratedAt: Date.now(),
        error: 'Invalid project data format',
      };
    }

    // Extract components from legacy format
    const metadata = projectData.metadata ?? null;
    const cabinet = projectData.cabinet ?? null;
    const cabinets = projectData.cabinets ?? [];

    if (!metadata || !cabinet) {
      setMigrationFlag();
      return {
        migrated: false,
        projectId: metadata?.id ?? null,
        cabinetCount: 0,
        migratedAt: Date.now(),
        error: 'Missing metadata or cabinet in project data',
      };
    }

    // Serialize cabinet materials.overrides from Object back to plain object
    // (useProjectStore already converts Map → Object for JSON serialization)
    const serializedCabinet = { ...cabinet };
    if (cabinet.materials?.overrides && typeof cabinet.materials.overrides === 'object') {
      // Already a plain object from JSON parse — no conversion needed
      serializedCabinet.materials = {
        ...cabinet.materials,
        overrides: cabinet.materials.overrides,
      };
    }

    // Extract material data if present
    const materials = serializedCabinet.materials ?? null;

    // Build scene cabinets list
    const sceneCabinets = (cabinets || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      scenePosition: c.scenePosition ?? [0, 0, 0],
      sceneRotation: c.sceneRotation ?? [0, 0, 0],
    }));

    // Populate Y.Doc with migrated data
    populateDoc(mdoc, {
      cabinet: serializedCabinet,
      metadata,
      cabinets: sceneCabinets,
      materials: materials ? { defaults: materials } : undefined,
    });

    // Set migration flag (but DON'T delete localStorage — keep as backup)
    setMigrationFlag();

    const now = Date.now();
    console.log(
      `[Sync] Migration complete: project "${metadata.name}" (${metadata.id}), ` +
      `${sceneCabinets.length} cabinet(s) in scene`
    );

    return {
      migrated: true,
      projectId: metadata.id,
      cabinetCount: sceneCabinets.length || 1,
      migratedAt: now,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Sync] Migration failed:', message);

    return {
      migrated: false,
      projectId: null,
      cabinetCount: 0,
      migratedAt: Date.now(),
      error: message,
    };
  }
}

/**
 * Reset the migration flag (for testing or re-migration).
 *
 * After calling this, the next `migrateFromLocalStorage()` call will
 * attempt migration again.
 */
export function resetMigrationFlag(): void {
  try {
    localStorage.removeItem(MIGRATION_FLAG_KEY);
  } catch {
    // Ignore
  }
}

// ============================================================================
// Internal Helpers
// ============================================================================

function setMigrationFlag(): void {
  try {
    localStorage.setItem(MIGRATION_FLAG_KEY, '1');
  } catch {
    // Ignore — migration still succeeds even if flag can't be persisted
  }
}
