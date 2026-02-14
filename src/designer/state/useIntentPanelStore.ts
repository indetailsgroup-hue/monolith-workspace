/**
 * useIntentPanelStore - Global Tab State for DesignerIntentPanel
 *
 * Lifts tab state from local useState to Zustand global store.
 * Allows any component to switch tabs (e.g., openSafety from GateStatusIndicator).
 *
 * @version 1.0.0 - Phase A Glue
 */

import { create } from 'zustand';

// ============================================
// TYPES
// ============================================

export type TabId =
  | 'catalog'
  | 'materials'
  | 'hardware'
  | 'decor'
  | 'skills'
  | 'safety'
  | 'logic'
  | 'versions';

interface IntentPanelState {
  /** Currently active tab */
  activeTab: TabId;
}

interface IntentPanelActions {
  /** Set the active tab */
  setActiveTab: (tab: TabId) => void;
  /** Convenience: open Safety tab directly */
  openSafety: () => void;
  /** Convenience: open Logic tab directly */
  openLogic: () => void;
}

// ============================================
// STORE
// ============================================

export const useIntentPanelStore = create<IntentPanelState & IntentPanelActions>((set) => ({
  // Initial state
  activeTab: 'materials',

  // Actions
  setActiveTab: (tab) => {
    set({ activeTab: tab });
    console.log('[IntentPanel] Tab switched to:', tab);
  },

  openSafety: () => {
    set({ activeTab: 'safety' });
    console.log('[IntentPanel] Opened Safety tab');
  },

  openLogic: () => {
    set({ activeTab: 'logic' });
    console.log('[IntentPanel] Opened Logic tab');
  },
}));

// ============================================
// UTILITY (Non-React access)
// ============================================

/**
 * Open Safety tab from anywhere (non-React code).
 */
export function openSafetyTab(): void {
  useIntentPanelStore.getState().openSafety();
}

/**
 * Get current active tab.
 */
export function getActiveTab(): TabId {
  return useIntentPanelStore.getState().activeTab;
}
