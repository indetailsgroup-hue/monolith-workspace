/**
 * yjsBridge.test.ts - Zustand ↔ Yjs Bridge Tests
 *
 * Tests bidirectional sync, anti-loop mechanism, debouncing,
 * and lifecycle management of the bridge.
 *
 * @version 1.0.0 - T029 Phase 1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMonolithDoc,
  destroyMonolithDoc,
  populateDoc,
  extractCabinet,
} from '../yjsDocument';
import {
  setupBridge,
  disposeBridge,
  isBridgeActive,
  type BridgeCallbacks,
} from '../yjsBridge';
import type { MonolithDoc, BridgeConfig } from '../types';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestCallbacks(): BridgeCallbacks & {
  cabinetUpdates: Record<string, any>[];
  metadataUpdates: Record<string, any>[];
  cabinetsUpdates: Record<string, any>[][];
} {
  const cabinetUpdates: Record<string, any>[] = [];
  const metadataUpdates: Record<string, any>[] = [];
  const cabinetsUpdates: Record<string, any>[][] = [];

  return {
    cabinetUpdates,
    metadataUpdates,
    cabinetsUpdates,
    onCabinetUpdate: (cabinet) => cabinetUpdates.push(cabinet),
    onMetadataUpdate: (metadata) => metadataUpdates.push(metadata),
    onCabinetsUpdate: (cabinets) => cabinetsUpdates.push(cabinets),
  };
}

const IMMEDIATE_CONFIG: BridgeConfig = {
  zustandToYjsDebounceMs: 0, // No debounce for tests
  debug: false,
};

// ============================================================================
// Tests
// ============================================================================

describe('yjsBridge', () => {
  let mdoc: MonolithDoc;

  beforeEach(() => {
    vi.useFakeTimers();
    mdoc = createMonolithDoc();
  });

  afterEach(() => {
    disposeBridge();
    destroyMonolithDoc(mdoc);
    vi.useRealTimers();
  });

  // ==========================================================================
  // Bridge Lifecycle
  // ==========================================================================

  describe('lifecycle', () => {
    it('setupBridge activates bridge', () => {
      const callbacks = createTestCallbacks();
      setupBridge(mdoc, callbacks, IMMEDIATE_CONFIG);
      expect(isBridgeActive()).toBe(true);
    });

    it('disposeBridge deactivates bridge', () => {
      const callbacks = createTestCallbacks();
      setupBridge(mdoc, callbacks, IMMEDIATE_CONFIG);
      disposeBridge();
      expect(isBridgeActive()).toBe(false);
    });

    it('setupBridge replaces previous bridge', () => {
      const cb1 = createTestCallbacks();
      const cb2 = createTestCallbacks();

      setupBridge(mdoc, cb1, IMMEDIATE_CONFIG);
      setupBridge(mdoc, cb2, IMMEDIATE_CONFIG);

      // Modify doc — only cb2 should fire
      mdoc.doc.transact(() => {
        mdoc.cabinet.set('id', 'test');
      });

      expect(cb1.cabinetUpdates).toHaveLength(0);
      expect(cb2.cabinetUpdates).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Y.Doc → Zustand (Observer Direction)
  // ==========================================================================

  describe('Y.Doc → Zustand', () => {
    it('fires onCabinetUpdate when cabinet changes in Y.Doc', () => {
      const callbacks = createTestCallbacks();
      setupBridge(mdoc, callbacks, IMMEDIATE_CONFIG);

      // External (non-bridge) change to Y.Doc
      mdoc.doc.transact(() => {
        mdoc.cabinet.set('id', 'cab-ext');
        mdoc.cabinet.set('name', 'External Cabinet');
      });

      expect(callbacks.cabinetUpdates).toHaveLength(1);
      expect(callbacks.cabinetUpdates[0].id).toBe('cab-ext');
      expect(callbacks.cabinetUpdates[0].name).toBe('External Cabinet');
    });

    it('fires onMetadataUpdate when metadata changes', () => {
      const callbacks = createTestCallbacks();
      setupBridge(mdoc, callbacks, IMMEDIATE_CONFIG);

      mdoc.doc.transact(() => {
        mdoc.metadata.set('id', 'proj-ext');
        mdoc.metadata.set('name', 'External Project');
      });

      expect(callbacks.metadataUpdates).toHaveLength(1);
      expect(callbacks.metadataUpdates[0].name).toBe('External Project');
    });

    it('fires onCabinetsUpdate when cabinets list changes', () => {
      const callbacks = createTestCallbacks();
      setupBridge(mdoc, callbacks, IMMEDIATE_CONFIG);

      // Use populateDoc with non-bridge origin
      populateDoc(mdoc, {
        cabinets: [
          { id: 'cab-1', name: 'C1', scenePosition: [0, 0, 0], sceneRotation: [0, 0, 0] },
        ],
      });

      expect(callbacks.cabinetsUpdates).toHaveLength(1);
      expect(callbacks.cabinetsUpdates[0]).toHaveLength(1);
    });

    it('does NOT fire callbacks after dispose', () => {
      const callbacks = createTestCallbacks();
      const bridge = setupBridge(mdoc, callbacks, IMMEDIATE_CONFIG);
      bridge.dispose();

      mdoc.doc.transact(() => {
        mdoc.cabinet.set('id', 'should-not-fire');
      });

      expect(callbacks.cabinetUpdates).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Zustand → Y.Doc (Push Direction)
  // ==========================================================================

  describe('Zustand → Y.Doc (pushToDocImmediate)', () => {
    it('pushes cabinet data to Y.Doc', () => {
      const callbacks = createTestCallbacks();
      const bridge = setupBridge(mdoc, callbacks, IMMEDIATE_CONFIG);

      bridge.pushToDocImmediate({
        cabinet: { id: 'cab-pushed', name: 'Pushed Cabinet', type: 'BASE' },
      });

      // Verify Y.Doc has the data
      expect(mdoc.cabinet.get('id')).toBe('cab-pushed');
      expect(mdoc.cabinet.get('name')).toBe('Pushed Cabinet');
    });

    it('pushes metadata to Y.Doc', () => {
      const callbacks = createTestCallbacks();
      const bridge = setupBridge(mdoc, callbacks, IMMEDIATE_CONFIG);

      bridge.pushToDocImmediate({
        metadata: { id: 'proj-pushed', name: 'Pushed Project' },
      });

      expect(mdoc.metadata.get('id')).toBe('proj-pushed');
      expect(mdoc.metadata.get('name')).toBe('Pushed Project');
    });

    it('replaces existing data (not merges)', () => {
      const callbacks = createTestCallbacks();
      const bridge = setupBridge(mdoc, callbacks, IMMEDIATE_CONFIG);

      // First push
      bridge.pushToDocImmediate({
        cabinet: { id: 'v1', name: 'Version 1', extra: 'field' },
      });

      // Second push (without 'extra')
      bridge.pushToDocImmediate({
        cabinet: { id: 'v2', name: 'Version 2' },
      });

      expect(mdoc.cabinet.get('id')).toBe('v2');
      expect(mdoc.cabinet.get('extra')).toBeUndefined();
    });
  });

  // ==========================================================================
  // Anti-Loop Mechanism
  // ==========================================================================

  describe('anti-loop', () => {
    it('pushToDocImmediate does NOT trigger onCabinetUpdate callback', () => {
      const callbacks = createTestCallbacks();
      const bridge = setupBridge(mdoc, callbacks, IMMEDIATE_CONFIG);

      bridge.pushToDocImmediate({
        cabinet: { id: 'from-zustand', name: 'From Zustand' },
      });

      // The callback should NOT fire for bridge-originated writes
      expect(callbacks.cabinetUpdates).toHaveLength(0);
    });

    it('pushToDocImmediate does NOT trigger onMetadataUpdate callback', () => {
      const callbacks = createTestCallbacks();
      const bridge = setupBridge(mdoc, callbacks, IMMEDIATE_CONFIG);

      bridge.pushToDocImmediate({
        metadata: { id: 'proj-z', name: 'From Zustand' },
      });

      expect(callbacks.metadataUpdates).toHaveLength(0);
    });

    it('external Y.Doc change DOES trigger callback', () => {
      const callbacks = createTestCallbacks();
      setupBridge(mdoc, callbacks, IMMEDIATE_CONFIG);

      // Simulate external change (e.g., from remote peer)
      mdoc.doc.transact(() => {
        mdoc.cabinet.set('id', 'from-remote');
      }, 'remote-peer');

      expect(callbacks.cabinetUpdates).toHaveLength(1);
      expect(callbacks.cabinetUpdates[0].id).toBe('from-remote');
    });
  });

  // ==========================================================================
  // Debouncing
  // ==========================================================================

  describe('debouncing', () => {
    it('pushToDoc debounces writes', () => {
      const callbacks = createTestCallbacks();
      const bridge = setupBridge(mdoc, callbacks, {
        zustandToYjsDebounceMs: 100,
        debug: false,
      });

      // Rapid pushes
      bridge.pushToDoc({ cabinet: { id: 'v1' } });
      bridge.pushToDoc({ cabinet: { id: 'v2' } });
      bridge.pushToDoc({ cabinet: { id: 'v3' } });

      // Not yet written (debounce pending)
      expect(mdoc.cabinet.get('id')).toBeUndefined();

      // Advance timer
      vi.advanceTimersByTime(150);

      // Only the last value should be written
      expect(mdoc.cabinet.get('id')).toBe('v3');
    });

    it('pushToDocImmediate bypasses debounce', () => {
      const callbacks = createTestCallbacks();
      const bridge = setupBridge(mdoc, callbacks, {
        zustandToYjsDebounceMs: 1000,
        debug: false,
      });

      bridge.pushToDocImmediate({ cabinet: { id: 'immediate' } });

      // Written immediately
      expect(mdoc.cabinet.get('id')).toBe('immediate');
    });
  });

  // ==========================================================================
  // Multiple Data Types
  // ==========================================================================

  describe('multi-type push', () => {
    it('pushes cabinet + metadata in one call', () => {
      const callbacks = createTestCallbacks();
      const bridge = setupBridge(mdoc, callbacks, IMMEDIATE_CONFIG);

      bridge.pushToDocImmediate({
        cabinet: { id: 'cab-multi', name: 'Multi' },
        metadata: { id: 'proj-multi', name: 'Multi Project' },
      });

      expect(mdoc.cabinet.get('id')).toBe('cab-multi');
      expect(mdoc.metadata.get('id')).toBe('proj-multi');
    });

    it('pushes materials data', () => {
      const callbacks = createTestCallbacks();
      const bridge = setupBridge(mdoc, callbacks, IMMEDIATE_CONFIG);

      bridge.pushToDocImmediate({
        materials: { defaults: { panel: 'pb-18', edge: 'pvc-1' } },
      });

      expect(mdoc.materials.get('defaults')).toEqual({
        panel: 'pb-18',
        edge: 'pvc-1',
      });
    });
  });
});
