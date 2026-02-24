/**
 * yjsDocument.test.ts - Y.Doc Factory & Serialization Tests
 *
 * Tests MonolithDoc creation, population, extraction, and snapshot utilities.
 *
 * @version 1.0.0 - T029 Phase 1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import {
  createMonolithDoc,
  destroyMonolithDoc,
  populateDoc,
  extractCabinet,
  extractMetadata,
  extractCabinets,
  extractMaterials,
  extractAll,
  getSnapshot,
  applyUpdate,
  isDocEmpty,
  getStateVector,
} from '../yjsDocument';
import type { MonolithDoc, SerializedMetadata, SerializedSceneCabinet } from '../types';

// ============================================================================
// Test Data
// ============================================================================

const TEST_METADATA: SerializedMetadata = {
  id: 'proj-test-001',
  name: 'Test Kitchen Cabinet',
  version: '1.0.0',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  description: 'A test project',
  author: 'Test User',
};

const TEST_CABINET: Record<string, any> = {
  id: 'cab-001',
  name: 'Base Cabinet 600',
  type: 'BASE',
  dimensions: { width: 600, height: 720, depth: 560, toeKickHeight: 100 },
  structure: {
    shelfCount: 1,
    dividerCount: 0,
    backPanel: true,
    topJoint: 'DADO',
    bottomJoint: 'DADO',
  },
  materials: {
    carcassThickness: 18,
    overrides: { 'panel-side-l': { materialId: 'core-pb-18' } },
  },
  panels: [
    { id: 'p-side-l', role: 'SIDE_LEFT', width: 560, height: 620 },
    { id: 'p-side-r', role: 'SIDE_RIGHT', width: 560, height: 620 },
    { id: 'p-bottom', role: 'BOTTOM', width: 564, height: 560 },
  ],
  computed: { totalPanels: 3, totalArea: 1.2 },
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const TEST_SCENE_CABINETS: SerializedSceneCabinet[] = [
  {
    id: 'cab-001',
    name: 'Base Cabinet 600',
    category: 'BASE',
    scenePosition: [0, 0, 0],
    sceneRotation: [0, 0, 0],
  },
  {
    id: 'cab-002',
    name: 'Wall Cabinet 800',
    category: 'WALL',
    scenePosition: [700, 0, 0],
    sceneRotation: [0, Math.PI / 2, 0],
  },
];

// ============================================================================
// Tests
// ============================================================================

describe('yjsDocument', () => {
  let mdoc: MonolithDoc;

  beforeEach(() => {
    mdoc = createMonolithDoc();
  });

  // ==========================================================================
  // Document Creation
  // ==========================================================================

  describe('createMonolithDoc', () => {
    it('creates a MonolithDoc with all shared types', () => {
      expect(mdoc.doc).toBeInstanceOf(Y.Doc);
      expect(mdoc.cabinet).toBeInstanceOf(Y.Map);
      expect(mdoc.metadata).toBeInstanceOf(Y.Map);
      expect(mdoc.cabinets).toBeInstanceOf(Y.Array);
      expect(mdoc.materials).toBeInstanceOf(Y.Map);
    });

    it('creates empty shared types by default', () => {
      expect(mdoc.cabinet.size).toBe(0);
      expect(mdoc.metadata.size).toBe(0);
      expect(mdoc.cabinets.length).toBe(0);
      expect(mdoc.materials.size).toBe(0);
    });

    it('respects custom clientId', () => {
      const custom = createMonolithDoc(42);
      expect(custom.doc.clientID).toBe(42);
      destroyMonolithDoc(custom);
    });
  });

  // ==========================================================================
  // isDocEmpty
  // ==========================================================================

  describe('isDocEmpty', () => {
    it('returns true for empty doc', () => {
      expect(isDocEmpty(mdoc)).toBe(true);
    });

    it('returns false after populating cabinet', () => {
      populateDoc(mdoc, { cabinet: TEST_CABINET });
      expect(isDocEmpty(mdoc)).toBe(false);
    });

    it('returns false after populating metadata only', () => {
      populateDoc(mdoc, { metadata: TEST_METADATA });
      expect(isDocEmpty(mdoc)).toBe(false);
    });
  });

  // ==========================================================================
  // Populate & Extract: Cabinet
  // ==========================================================================

  describe('cabinet population & extraction', () => {
    it('populates and extracts cabinet data', () => {
      populateDoc(mdoc, { cabinet: TEST_CABINET });
      const extracted = extractCabinet(mdoc);

      expect(extracted).not.toBeNull();
      expect(extracted!.id).toBe('cab-001');
      expect(extracted!.name).toBe('Base Cabinet 600');
      expect(extracted!.type).toBe('BASE');
    });

    it('preserves nested dimensions', () => {
      populateDoc(mdoc, { cabinet: TEST_CABINET });
      const extracted = extractCabinet(mdoc)!;

      expect(extracted.dimensions.width).toBe(600);
      expect(extracted.dimensions.height).toBe(720);
      expect(extracted.dimensions.depth).toBe(560);
    });

    it('preserves panels array', () => {
      populateDoc(mdoc, { cabinet: TEST_CABINET });
      const extracted = extractCabinet(mdoc)!;

      expect(extracted.panels).toHaveLength(3);
      expect(extracted.panels[0].id).toBe('p-side-l');
      expect(extracted.panels[0].role).toBe('SIDE_LEFT');
    });

    it('preserves materials overrides', () => {
      populateDoc(mdoc, { cabinet: TEST_CABINET });
      const extracted = extractCabinet(mdoc)!;

      expect(extracted.materials.overrides).toBeDefined();
      expect(extracted.materials.overrides['panel-side-l']).toEqual({
        materialId: 'core-pb-18',
      });
    });

    it('returns null for empty cabinet', () => {
      expect(extractCabinet(mdoc)).toBeNull();
    });

    it('clears existing data before repopulating', () => {
      // First population
      populateDoc(mdoc, { cabinet: { id: 'old', name: 'Old' } });
      expect(extractCabinet(mdoc)!.id).toBe('old');

      // Second population should replace, not merge
      populateDoc(mdoc, { cabinet: { id: 'new', name: 'New' } });
      const extracted = extractCabinet(mdoc)!;
      expect(extracted.id).toBe('new');
      expect(extracted.name).toBe('New');
    });
  });

  // ==========================================================================
  // Populate & Extract: Metadata
  // ==========================================================================

  describe('metadata population & extraction', () => {
    it('populates and extracts metadata', () => {
      populateDoc(mdoc, { metadata: TEST_METADATA });
      const extracted = extractMetadata(mdoc);

      expect(extracted).not.toBeNull();
      expect(extracted!.id).toBe('proj-test-001');
      expect(extracted!.name).toBe('Test Kitchen Cabinet');
      expect(extracted!.version).toBe('1.0.0');
      expect(extracted!.author).toBe('Test User');
    });

    it('returns null for empty metadata', () => {
      expect(extractMetadata(mdoc)).toBeNull();
    });
  });

  // ==========================================================================
  // Populate & Extract: Scene Cabinets
  // ==========================================================================

  describe('cabinets (scene) population & extraction', () => {
    it('populates and extracts scene cabinets', () => {
      populateDoc(mdoc, { cabinets: TEST_SCENE_CABINETS });
      const extracted = extractCabinets(mdoc);

      expect(extracted).toHaveLength(2);
      expect(extracted[0].id).toBe('cab-001');
      expect(extracted[0].scenePosition).toEqual([0, 0, 0]);
      expect(extracted[1].id).toBe('cab-002');
      expect(extracted[1].scenePosition).toEqual([700, 0, 0]);
    });

    it('preserves rotation values', () => {
      populateDoc(mdoc, { cabinets: TEST_SCENE_CABINETS });
      const extracted = extractCabinets(mdoc);

      expect(extracted[1].sceneRotation).toEqual([0, Math.PI / 2, 0]);
    });

    it('returns empty array for no cabinets', () => {
      expect(extractCabinets(mdoc)).toEqual([]);
    });

    it('clears existing cabinets before repopulating', () => {
      populateDoc(mdoc, { cabinets: [TEST_SCENE_CABINETS[0]] });
      expect(extractCabinets(mdoc)).toHaveLength(1);

      populateDoc(mdoc, { cabinets: TEST_SCENE_CABINETS });
      expect(extractCabinets(mdoc)).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Populate & Extract: Materials
  // ==========================================================================

  describe('materials population & extraction', () => {
    const testMaterials = {
      defaults: {
        panel: 'core-pb-18',
        edge: 'edge-pvc-1',
      },
      customPalette: ['walnut', 'oak', 'maple'],
    };

    it('populates and extracts materials', () => {
      populateDoc(mdoc, { materials: testMaterials });
      const extracted = extractMaterials(mdoc);

      expect(extracted).not.toBeNull();
      expect(extracted!.defaults.panel).toBe('core-pb-18');
      expect(extracted!.customPalette).toEqual(['walnut', 'oak', 'maple']);
    });

    it('returns null for empty materials', () => {
      expect(extractMaterials(mdoc)).toBeNull();
    });
  });

  // ==========================================================================
  // extractAll
  // ==========================================================================

  describe('extractAll', () => {
    it('extracts all data at once', () => {
      populateDoc(mdoc, {
        cabinet: TEST_CABINET,
        metadata: TEST_METADATA,
        cabinets: TEST_SCENE_CABINETS,
        materials: { defaults: { panel: 'pb-18' } },
      });

      const all = extractAll(mdoc);
      expect(all.cabinet).not.toBeNull();
      expect(all.metadata).not.toBeNull();
      expect(all.cabinets).toHaveLength(2);
      expect(all.materials).not.toBeNull();
    });

    it('returns nulls for empty doc', () => {
      const all = extractAll(mdoc);
      expect(all.cabinet).toBeNull();
      expect(all.metadata).toBeNull();
      expect(all.cabinets).toEqual([]);
      expect(all.materials).toBeNull();
    });
  });

  // ==========================================================================
  // Snapshot & Update
  // ==========================================================================

  describe('snapshot & update', () => {
    it('creates a snapshot and restores it to a new doc', () => {
      // Populate original
      populateDoc(mdoc, {
        cabinet: TEST_CABINET,
        metadata: TEST_METADATA,
      });

      // Take snapshot
      const snapshot = getSnapshot(mdoc);
      expect(snapshot).toBeInstanceOf(Uint8Array);
      expect(snapshot.length).toBeGreaterThan(0);

      // Apply to new doc
      const newDoc = createMonolithDoc();
      applyUpdate(newDoc, snapshot);

      const restored = extractCabinet(newDoc);
      expect(restored).not.toBeNull();
      expect(restored!.id).toBe('cab-001');
      expect(restored!.name).toBe('Base Cabinet 600');

      const restoredMeta = extractMetadata(newDoc);
      expect(restoredMeta!.id).toBe('proj-test-001');

      destroyMonolithDoc(newDoc);
    });

    it('getStateVector returns Uint8Array', () => {
      populateDoc(mdoc, { cabinet: TEST_CABINET });
      const sv = getStateVector(mdoc);
      expect(sv).toBeInstanceOf(Uint8Array);
      expect(sv.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Transaction Atomicity
  // ==========================================================================

  describe('transaction atomicity', () => {
    it('populateDoc wraps all writes in a single transaction', () => {
      let txCount = 0;
      mdoc.doc.on('afterTransaction', () => {
        txCount++;
      });

      populateDoc(mdoc, {
        cabinet: TEST_CABINET,
        metadata: TEST_METADATA,
        cabinets: TEST_SCENE_CABINETS,
        materials: { defaults: { panel: 'pb-18' } },
      });

      // All writes happen in ONE transaction
      expect(txCount).toBe(1);
    });
  });

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  describe('destroyMonolithDoc', () => {
    it('destroys without error', () => {
      populateDoc(mdoc, { cabinet: TEST_CABINET });
      expect(() => destroyMonolithDoc(mdoc)).not.toThrow();
    });
  });
});
