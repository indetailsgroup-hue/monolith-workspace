/**
 * MONOLITH SpecStore Provider
 *
 * React context provider for the spec state store
 */

import React, { createContext, useContext } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';
import type { SpecStoreState } from './store';

// ============================================
// CONTEXT
// ============================================

type SpecStoreApi = StoreApi<SpecStoreState>;

const SpecStoreCtx = createContext<SpecStoreApi | null>(null);

// ============================================
// PROVIDER
// ============================================

export interface SpecStoreProviderProps {
  store: SpecStoreApi;
  children: React.ReactNode;
}

/**
 * Provider component for the spec store
 *
 * @example
 * ```tsx
 * const store = createSpecStore(services, initialDoc);
 * <SpecStoreProvider store={store}>
 *   <App />
 * </SpecStoreProvider>
 * ```
 */
export function SpecStoreProvider({ store, children }: SpecStoreProviderProps) {
  return (
    <SpecStoreCtx.Provider value={store}>{children}</SpecStoreCtx.Provider>
  );
}

// ============================================
// HOOKS
// ============================================

/**
 * Access the spec store with a selector
 *
 * @example
 * ```tsx
 * const state = useSpecStore((s) => s.doc.state);
 * const freeze = useSpecStore((s) => s.freeze);
 * ```
 */
export function useSpecStore<T>(selector: (s: SpecStoreState) => T): T {
  const api = useContext(SpecStoreCtx);
  if (!api) {
    throw new Error(
      'useSpecStore must be used within a SpecStoreProvider. ' +
        'Make sure you have wrapped your app with <SpecStoreProvider store={...}>.'
    );
  }
  return useStore(api, selector);
}

/**
 * Get the full spec document
 */
export function useSpecDoc() {
  return useSpecStore((s) => s.doc);
}

/**
 * Get just the spec state (DRAFT | FROZEN | RELEASED)
 */
export function useSpecState() {
  return useSpecStore((s) => s.doc.state);
}

/**
 * Get modal visibility state
 */
export function useSpecModals() {
  return useSpecStore((s) => s.modals);
}

/**
 * Get gate UI state
 */
export function useGateUi() {
  return useSpecStore((s) => s.gateUi);
}

/**
 * Get async operation state
 */
export function useAsyncState() {
  return useSpecStore((s) => s.async);
}

/**
 * Get draft manufacturing state
 */
export function useDraftManufacturing() {
  return useSpecStore((s) => s.draftManufacturing);
}

/**
 * Get draft manufacturing actions
 */
export function useDraftManufacturingActions() {
  const setBreakdownRows = useSpecStore((s) => s.setBreakdownRows);
  const upsertBreakdownRow = useSpecStore((s) => s.upsertBreakdownRow);
  const removeBreakdownRow = useSpecStore((s) => s.removeBreakdownRow);
  const setDrillOps = useSpecStore((s) => s.setDrillOps);
  const setFittings = useSpecStore((s) => s.setFittings);
  const setCabinetContext = useSpecStore((s) => s.setCabinetContext);

  return {
    setBreakdownRows,
    upsertBreakdownRow,
    removeBreakdownRow,
    setDrillOps,
    setFittings,
    setCabinetContext,
  };
}

/**
 * Get store api for direct access (escape hatch)
 */
export function useSpecStoreApi(): SpecStoreApi {
  const api = useContext(SpecStoreCtx);
  if (!api) {
    throw new Error(
      'useSpecStoreApi must be used within a SpecStoreProvider.'
    );
  }
  return api;
}
