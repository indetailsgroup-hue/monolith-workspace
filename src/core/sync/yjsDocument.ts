/**
 * yjsDocument.ts - Yjs Document Factory
 *
 * Creates and manages the Monolith Y.Doc structure.
 * The Y.Doc is the central CRDT document that holds all project data.
 *
 * ## Document Structure
 * ```
 * Y.Doc
 * ├── cabinet (Y.Map)      - Active cabinet state
 * ├── metadata (Y.Map)     - Project metadata
 * ├── cabinets (Y.Array)   - Scene cabinet list
 * └── materials (Y.Map)    - Material overrides
 * ```
 *
 * ## Phase 1 Scope
 * - Local persistence via y-indexeddb
 * - Full project state in CRDT format
 * - Bidirectional sync with Zustand stores
 *
 * @version 1.0.0 - T029 Phase 1
 */

import * as Y from 'yjs';
import {
  DOC_KEYS,
  type MonolithDoc,
  type SerializedMetadata,
  type SerializedSceneCabinet,
} from './types';

// ============================================================================
// Document Factory
// ============================================================================

/**
 * Create a new MonolithDoc with empty shared types.
 *
 * @param clientId - Optional Y.Doc client ID (auto-generated if omitted)
 * @returns MonolithDoc wrapper around Y.Doc
 */
export function createMonolithDoc(clientId?: number): MonolithDoc {
  const doc = new Y.Doc();

  if (clientId !== undefined) {
    // Setting clientID helps with deterministic behavior in tests
    // and consistent identity across reconnections
    doc.clientID = clientId;
  }

  return {
    doc,
    cabinet: doc.getMap(DOC_KEYS.CABINET),
    metadata: doc.getMap(DOC_KEYS.METADATA),
    cabinets: doc.getArray(DOC_KEYS.CABINETS),
    materials: doc.getMap(DOC_KEYS.MATERIALS),
  };
}

/**
 * Destroy a MonolithDoc, cleaning up resources.
 *
 * @param mdoc - MonolithDoc to destroy
 */
export function destroyMonolithDoc(mdoc: MonolithDoc): void {
  mdoc.doc.destroy();
}

// ============================================================================
// Serialization: Plain Object → Y.Doc
// ============================================================================

/**
 * Populate the Y.Doc with project data from plain objects.
 *
 * Wraps all writes in a single Y.Doc transaction for atomicity.
 * Existing data is cleared before populating.
 *
 * @param mdoc - Target MonolithDoc
 * @param data - Project data to populate
 */
export function populateDoc(
  mdoc: MonolithDoc,
  data: {
    cabinet?: Record<string, any>;
    metadata?: SerializedMetadata;
    cabinets?: SerializedSceneCabinet[];
    materials?: Record<string, any>;
  }
): void {
  mdoc.doc.transact(() => {
    // --- Cabinet ---
    if (data.cabinet) {
      // Clear existing cabinet data
      for (const key of Array.from(mdoc.cabinet.keys())) {
        mdoc.cabinet.delete(key);
      }
      // Set each top-level field
      for (const [key, value] of Object.entries(data.cabinet)) {
        mdoc.cabinet.set(key, value);
      }
    }

    // --- Metadata ---
    if (data.metadata) {
      for (const key of Array.from(mdoc.metadata.keys())) {
        mdoc.metadata.delete(key);
      }
      for (const [key, value] of Object.entries(data.metadata)) {
        mdoc.metadata.set(key, value);
      }
    }

    // --- Cabinets (scene list) ---
    if (data.cabinets) {
      // Clear existing
      if (mdoc.cabinets.length > 0) {
        mdoc.cabinets.delete(0, mdoc.cabinets.length);
      }
      // Add each cabinet as Y.Map
      for (const cab of data.cabinets) {
        const yMap = new Y.Map();
        for (const [key, value] of Object.entries(cab)) {
          yMap.set(key, value);
        }
        mdoc.cabinets.push([yMap]);
      }
    }

    // --- Materials ---
    if (data.materials) {
      for (const key of Array.from(mdoc.materials.keys())) {
        mdoc.materials.delete(key);
      }
      for (const [key, value] of Object.entries(data.materials)) {
        mdoc.materials.set(key, value);
      }
    }
  });
}

// ============================================================================
// Deserialization: Y.Doc → Plain Object
// ============================================================================

/**
 * Extract cabinet data from Y.Doc as a plain object.
 *
 * @param mdoc - Source MonolithDoc
 * @returns Plain cabinet object or null if empty
 */
export function extractCabinet(mdoc: MonolithDoc): Record<string, any> | null {
  if (mdoc.cabinet.size === 0) return null;
  return mdoc.cabinet.toJSON();
}

/**
 * Extract metadata from Y.Doc as a plain object.
 *
 * @param mdoc - Source MonolithDoc
 * @returns Serialized metadata or null if empty
 */
export function extractMetadata(mdoc: MonolithDoc): SerializedMetadata | null {
  if (mdoc.metadata.size === 0) return null;
  return mdoc.metadata.toJSON() as SerializedMetadata;
}

/**
 * Extract scene cabinets from Y.Doc as plain objects.
 *
 * @param mdoc - Source MonolithDoc
 * @returns Array of scene cabinet entries
 */
export function extractCabinets(mdoc: MonolithDoc): SerializedSceneCabinet[] {
  if (mdoc.cabinets.length === 0) return [];
  return mdoc.cabinets.toArray().map((yMap) => {
    if (yMap instanceof Y.Map) {
      return yMap.toJSON() as SerializedSceneCabinet;
    }
    // Fallback for plain objects (shouldn't happen with proper Y.Map usage)
    return yMap as unknown as SerializedSceneCabinet;
  });
}

/**
 * Extract materials data from Y.Doc as a plain object.
 *
 * @param mdoc - Source MonolithDoc
 * @returns Materials data or null if empty
 */
export function extractMaterials(mdoc: MonolithDoc): Record<string, any> | null {
  if (mdoc.materials.size === 0) return null;
  return mdoc.materials.toJSON();
}

/**
 * Extract all project data from Y.Doc as plain objects.
 *
 * @param mdoc - Source MonolithDoc
 * @returns Complete project data (cabinet, metadata, cabinets, materials)
 */
export function extractAll(mdoc: MonolithDoc): {
  cabinet: Record<string, any> | null;
  metadata: SerializedMetadata | null;
  cabinets: SerializedSceneCabinet[];
  materials: Record<string, any> | null;
} {
  return {
    cabinet: extractCabinet(mdoc),
    metadata: extractMetadata(mdoc),
    cabinets: extractCabinets(mdoc),
    materials: extractMaterials(mdoc),
  };
}

// ============================================================================
// Snapshot & Update Helpers
// ============================================================================

/**
 * Get the full state vector of the Y.Doc.
 * Useful for comparing document versions.
 *
 * @param mdoc - Source MonolithDoc
 * @returns Encoded state vector
 */
export function getStateVector(mdoc: MonolithDoc): Uint8Array {
  return Y.encodeStateVector(mdoc.doc);
}

/**
 * Get a full snapshot of the Y.Doc as a binary blob.
 * Can be used for backups or manual transfer.
 *
 * @param mdoc - Source MonolithDoc
 * @returns Encoded document state
 */
export function getSnapshot(mdoc: MonolithDoc): Uint8Array {
  return Y.encodeStateAsUpdate(mdoc.doc);
}

/**
 * Apply a snapshot/update to the Y.Doc.
 *
 * @param mdoc - Target MonolithDoc
 * @param update - Encoded update to apply
 */
export function applyUpdate(mdoc: MonolithDoc, update: Uint8Array): void {
  Y.applyUpdate(mdoc.doc, update);
}

/**
 * Check if the Y.Doc has any content.
 *
 * @param mdoc - MonolithDoc to check
 * @returns true if document has data in any shared type
 */
export function isDocEmpty(mdoc: MonolithDoc): boolean {
  return (
    mdoc.cabinet.size === 0 &&
    mdoc.metadata.size === 0 &&
    mdoc.cabinets.length === 0 &&
    mdoc.materials.size === 0
  );
}
