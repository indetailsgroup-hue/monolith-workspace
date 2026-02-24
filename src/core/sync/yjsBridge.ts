/**
 * yjsBridge.ts - Zustand ↔ Yjs Bidirectional Bridge
 *
 * Keeps Zustand stores (useCabinetStore, useProjectStore) in sync with
 * the Y.Doc. Changes flow in both directions:
 *
 * ```
 * Local edit → Zustand → Y.Doc → IndexedDB
 * IndexedDB load → Y.Doc → Zustand
 * ```
 *
 * ## Anti-Loop Mechanism
 * Uses a `_syncOrigin` transaction origin to distinguish local Zustand
 * writes from remote/loaded updates, preventing infinite sync loops.
 *
 * ## Debouncing
 * Zustand → Yjs writes are debounced (default 300ms) to avoid flooding
 * IndexedDB with rapid incremental updates during dimension dragging.
 *
 * @version 1.0.0 - T029 Phase 1
 */

import type { MonolithDoc, BridgeConfig } from './types';
import { DEFAULT_BRIDGE_CONFIG } from './types';
import { populateDoc, extractCabinet, extractMetadata, extractCabinets } from './yjsDocument';

// ============================================================================
// Constants
// ============================================================================

/**
 * Transaction origin marker for writes that originate from the Zustand bridge.
 * When the Y.Doc observer sees this origin, it skips pushing back to Zustand.
 */
const BRIDGE_ORIGIN = 'zustand-bridge';

// ============================================================================
// Types
// ============================================================================

/**
 * Disposer function returned by bridge setup.
 * Call to unsubscribe all observers and stop syncing.
 */
export type BridgeDisposer = () => void;

/**
 * Callback invoked when the Y.Doc receives changes from IndexedDB (on load)
 * or from a remote peer (future phases).
 */
export interface BridgeCallbacks {
  /**
   * Called when cabinet data changes in the Y.Doc (from IndexedDB load or remote).
   * The bridge consumer should apply this data to useCabinetStore.
   */
  onCabinetUpdate: (cabinet: Record<string, any>) => void;

  /**
   * Called when metadata changes in the Y.Doc.
   * The bridge consumer should apply this data to useProjectStore.
   */
  onMetadataUpdate: (metadata: Record<string, any>) => void;

  /**
   * Called when the scene cabinets list changes.
   */
  onCabinetsUpdate: (cabinets: Record<string, any>[]) => void;

  /**
   * Called when materials data changes.
   */
  onMaterialsUpdate?: (materials: Record<string, any>) => void;
}

// ============================================================================
// Bridge State
// ============================================================================

let _activeBridge: BridgeDisposer | null = null;
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// Public API
// ============================================================================

/**
 * Set up bidirectional sync between Zustand stores and Y.Doc.
 *
 * ## What it does:
 * 1. Observes Y.Doc shared types → calls callbacks when data changes
 * 2. Returns `pushToDoc()` function for Zustand → Y.Doc writes
 * 3. Returns disposer to tear down all observers
 *
 * ## Usage:
 * ```typescript
 * const { pushToDoc, dispose } = setupBridge(mdoc, {
 *   onCabinetUpdate: (cabinet) => {
 *     useCabinetStore.setState({ cabinet: deserializeCabinet(cabinet) });
 *   },
 *   onMetadataUpdate: (metadata) => {
 *     useProjectStore.setState({ metadata });
 *   },
 *   onCabinetsUpdate: (cabinets) => {
 *     useCabinetStore.setState({ cabinets: cabinets.map(deserialize) });
 *   },
 * }, config);
 *
 * // When Zustand changes:
 * pushToDoc({ cabinet: serializeCabinet(cabinetStore.cabinet) });
 *
 * // Cleanup:
 * dispose();
 * ```
 *
 * @param mdoc - MonolithDoc to bridge
 * @param callbacks - Callbacks for Y.Doc → Zustand direction
 * @param config - Bridge configuration
 * @returns Object with pushToDoc, dispose, and isFromBridge
 */
export function setupBridge(
  mdoc: MonolithDoc,
  callbacks: BridgeCallbacks,
  config: BridgeConfig = DEFAULT_BRIDGE_CONFIG
): {
  pushToDoc: (data: {
    cabinet?: Record<string, any>;
    metadata?: Record<string, any>;
    cabinets?: Record<string, any>[];
    materials?: Record<string, any>;
  }) => void;
  pushToDocImmediate: (data: {
    cabinet?: Record<string, any>;
    metadata?: Record<string, any>;
    cabinets?: Record<string, any>[];
    materials?: Record<string, any>;
  }) => void;
  dispose: BridgeDisposer;
} {
  // Tear down previous bridge if any
  if (_activeBridge) {
    _activeBridge();
    _activeBridge = null;
  }

  const log = config.debug
    ? (...args: any[]) => console.log('[YjsBridge]', ...args)
    : () => {};

  // --- Track whether we're in a bridge write to avoid loops ---
  let _isBridgeWriting = false;

  // ========================================================================
  // Y.Doc → Zustand (observe Y.Doc changes)
  // ========================================================================

  const cabinetObserver = (events: any[], transaction: any) => {
    // Skip if this change originated from our own bridge write
    if (transaction.origin === BRIDGE_ORIGIN || _isBridgeWriting) {
      log('Skipping cabinet observer (bridge origin)');
      return;
    }

    log('Cabinet updated from Y.Doc');
    const cabinet = extractCabinet(mdoc);
    if (cabinet) {
      callbacks.onCabinetUpdate(cabinet);
    }
  };

  const metadataObserver = (events: any[], transaction: any) => {
    if (transaction.origin === BRIDGE_ORIGIN || _isBridgeWriting) return;

    log('Metadata updated from Y.Doc');
    const metadata = extractMetadata(mdoc);
    if (metadata) {
      callbacks.onMetadataUpdate(metadata);
    }
  };

  const cabinetsObserver = (event: any, transaction: any) => {
    if (transaction.origin === BRIDGE_ORIGIN || _isBridgeWriting) return;

    log('Cabinets list updated from Y.Doc');
    const cabinets = extractCabinets(mdoc);
    callbacks.onCabinetsUpdate(cabinets);
  };

  const materialsObserver = (events: any[], transaction: any) => {
    if (transaction.origin === BRIDGE_ORIGIN || _isBridgeWriting) return;

    if (callbacks.onMaterialsUpdate) {
      log('Materials updated from Y.Doc');
      const materials = mdoc.materials.toJSON();
      callbacks.onMaterialsUpdate(materials);
    }
  };

  // Register observers
  mdoc.cabinet.observeDeep(cabinetObserver);
  mdoc.metadata.observeDeep(metadataObserver);
  mdoc.cabinets.observe(cabinetsObserver);
  mdoc.materials.observeDeep(materialsObserver);

  // ========================================================================
  // Zustand → Y.Doc (push changes)
  // ========================================================================

  /**
   * Immediately push Zustand state to Y.Doc.
   * Wraps in transaction with BRIDGE_ORIGIN to prevent loop.
   */
  function pushToDocImmediate(data: {
    cabinet?: Record<string, any>;
    metadata?: Record<string, any>;
    cabinets?: Record<string, any>[];
    materials?: Record<string, any>;
  }): void {
    _isBridgeWriting = true;
    log('Pushing to Y.Doc:', Object.keys(data));

    try {
      mdoc.doc.transact(() => {
        if (data.cabinet) {
          // Clear and re-set cabinet fields
          for (const key of Array.from(mdoc.cabinet.keys())) {
            mdoc.cabinet.delete(key);
          }
          for (const [key, value] of Object.entries(data.cabinet)) {
            mdoc.cabinet.set(key, value);
          }
        }

        if (data.metadata) {
          for (const key of Array.from(mdoc.metadata.keys())) {
            mdoc.metadata.delete(key);
          }
          for (const [key, value] of Object.entries(data.metadata)) {
            mdoc.metadata.set(key, value);
          }
        }

        if (data.cabinets) {
          if (mdoc.cabinets.length > 0) {
            mdoc.cabinets.delete(0, mdoc.cabinets.length);
          }
          // Use populateDoc helper for complex array insertion
          populateDoc(mdoc, { cabinets: data.cabinets as any });
        }

        if (data.materials) {
          for (const key of Array.from(mdoc.materials.keys())) {
            mdoc.materials.delete(key);
          }
          for (const [key, value] of Object.entries(data.materials)) {
            mdoc.materials.set(key, value);
          }
        }
      }, BRIDGE_ORIGIN);
    } finally {
      _isBridgeWriting = false;
    }
  }

  /**
   * Debounced push to Y.Doc.
   * Coalesces rapid updates (e.g., dimension dragging) into a single write.
   */
  function pushToDoc(data: {
    cabinet?: Record<string, any>;
    metadata?: Record<string, any>;
    cabinets?: Record<string, any>[];
    materials?: Record<string, any>;
  }): void {
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
    }
    _debounceTimer = setTimeout(() => {
      pushToDocImmediate(data);
      _debounceTimer = null;
    }, config.zustandToYjsDebounceMs);
  }

  // ========================================================================
  // Disposer
  // ========================================================================

  function dispose(): void {
    log('Disposing bridge');

    // Cancel pending debounce
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
      _debounceTimer = null;
    }

    // Unregister observers
    mdoc.cabinet.unobserveDeep(cabinetObserver);
    mdoc.metadata.unobserveDeep(metadataObserver);
    mdoc.cabinets.unobserve(cabinetsObserver);
    mdoc.materials.unobserveDeep(materialsObserver);

    if (_activeBridge === dispose) {
      _activeBridge = null;
    }
  }

  _activeBridge = dispose;

  return {
    pushToDoc,
    pushToDocImmediate,
    dispose,
  };
}

/**
 * Dispose the active bridge if any.
 * Safe to call when no bridge is active (no-op).
 */
export function disposeBridge(): void {
  if (_activeBridge) {
    _activeBridge();
    _activeBridge = null;
  }
}

/**
 * Check if a bridge is currently active.
 */
export function isBridgeActive(): boolean {
  return _activeBridge !== null;
}
