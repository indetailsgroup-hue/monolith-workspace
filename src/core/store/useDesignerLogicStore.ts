/**
 * Designer Logic Store - Zustand store for designer intent evaluation
 *
 * Manages:
 * - Designer intent state
 * - Rule evaluation results
 * - Gate status (blocked/warnings)
 * - UI display preferences
 *
 * v1.0: Initial implementation
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import type {
  DesignerIntentPDF,
  DesignerEvaluationPDF,
  RuleEffect,
  HardwareItemPDF,
  DrillOpPDF,
  AssemblyStepPDF,
} from '../designerIntent/types';
import {
  evaluateIntent,
  createDefaultIntentPDF,
} from '../designerIntent';

// ============================================
// TYPES
// ============================================

export type DesignerLogicTab = 'hardware' | 'drilling' | 'assembly';

export interface DesignerLogicFilter {
  showBlocks: boolean;
  showWarnings: boolean;
  showInfo: boolean;
  hardwareCategory: string | null;
  drillPanel: string | null;
}

export interface DesignerLogicState {
  // ---- DATA ----
  intent: DesignerIntentPDF;
  evaluation: DesignerEvaluationPDF | null;
  isEvaluating: boolean;
  lastEvaluatedAt: string | null;

  // ---- UI ----
  activeTab: DesignerLogicTab;
  isPanelExpanded: boolean;
  filter: DesignerLogicFilter;

  // ---- ACTIONS (Intent) ----
  setIntent: (intent: DesignerIntentPDF) => void;
  updateIntent: (partial: Partial<DesignerIntentPDF>) => void;
  resetIntent: () => void;

  // ---- ACTIONS (Evaluation) ----
  evaluate: () => void;
  clearEvaluation: () => void;

  // ---- ACTIONS (UI) ----
  setActiveTab: (tab: DesignerLogicTab) => void;
  togglePanel: () => void;
  setPanelExpanded: (expanded: boolean) => void;
  updateFilter: (updates: Partial<DesignerLogicFilter>) => void;
  resetFilter: () => void;

  // ---- SELECTORS ----
  getFilteredEffects: () => RuleEffect[];
  getBlockCount: () => number;
  getWarningCount: () => number;
  getHardwareByCategory: (category?: string) => HardwareItemPDF[];
  getDrillsByPanel: (panelId?: string) => DrillOpPDF[];
  isGateBlocked: () => boolean;
}

// ============================================
// DEFAULTS
// ============================================

const DEFAULT_FILTER: DesignerLogicFilter = {
  showBlocks: true,
  showWarnings: true,
  showInfo: true,
  hardwareCategory: null,
  drillPanel: null,
};

// ============================================
// STORE
// ============================================

export const useDesignerLogicStore = create<DesignerLogicState>()(
  persist(
    immer((set, get) => ({
      // ============================================
      // DATA
      // ============================================
      intent: createDefaultIntentPDF(),
      evaluation: null,
      isEvaluating: false,
      lastEvaluatedAt: null,

      // ============================================
      // UI
      // ============================================
      activeTab: 'hardware',
      isPanelExpanded: true,
      filter: { ...DEFAULT_FILTER },

      // ============================================
      // ACTIONS (Intent)
      // ============================================

      setIntent: (intent) => {
        set((state) => {
          state.intent = intent;
          state.evaluation = null; // Clear stale evaluation
        });
      },

      updateIntent: (partial) => {
        set((state) => {
          Object.assign(state.intent, partial);
          state.evaluation = null; // Clear stale evaluation
        });
      },

      resetIntent: () => {
        set((state) => {
          state.intent = createDefaultIntentPDF();
          state.evaluation = null;
        });
      },

      // ============================================
      // ACTIONS (Evaluation)
      // ============================================

      evaluate: () => {
        const { intent } = get();

        set((state) => {
          state.isEvaluating = true;
        });

        try {
          const result = evaluateIntent(intent);

          set((state) => {
            state.evaluation = result;
            state.isEvaluating = false;
            state.lastEvaluatedAt = new Date().toISOString();
          });
        } catch (error) {
          console.error('[DesignerLogic] Evaluation failed:', error);
          set((state) => {
            state.isEvaluating = false;
          });
        }
      },

      clearEvaluation: () => {
        set((state) => {
          state.evaluation = null;
          state.lastEvaluatedAt = null;
        });
      },

      // ============================================
      // ACTIONS (UI)
      // ============================================

      setActiveTab: (tab) => {
        set((state) => {
          state.activeTab = tab;
        });
      },

      togglePanel: () => {
        set((state) => {
          state.isPanelExpanded = !state.isPanelExpanded;
        });
      },

      setPanelExpanded: (expanded) => {
        set((state) => {
          state.isPanelExpanded = expanded;
        });
      },

      updateFilter: (updates) => {
        set((state) => {
          Object.assign(state.filter, updates);
        });
      },

      resetFilter: () => {
        set((state) => {
          state.filter = { ...DEFAULT_FILTER };
        });
      },

      // ============================================
      // SELECTORS
      // ============================================

      getFilteredEffects: () => {
        const { evaluation, filter } = get();
        if (!evaluation) return [];

        return evaluation.effects.filter((effect) => {
          if (effect.severity === 'block' && !filter.showBlocks) return false;
          if (effect.severity === 'warn' && !filter.showWarnings) return false;
          if (effect.severity === 'info' && !filter.showInfo) return false;
          return true;
        });
      },

      getBlockCount: () => {
        const { evaluation } = get();
        return evaluation?.gate.blocks.length ?? 0;
      },

      getWarningCount: () => {
        const { evaluation } = get();
        return evaluation?.gate.warnings.length ?? 0;
      },

      getHardwareByCategory: (category) => {
        const { evaluation } = get();
        if (!evaluation) return [];

        const hardware = evaluation.hardware.hardware;
        if (!category) return hardware;

        // Simple category extraction from catalogId
        return hardware.filter((h) => h.catalogId.startsWith(category));
      },

      getDrillsByPanel: (panelId) => {
        const { evaluation } = get();
        if (!evaluation) return [];

        const drills = evaluation.drilling.operations;
        if (!panelId) return drills;

        return drills.filter((d) => d.panel === panelId);
      },

      isGateBlocked: () => {
        const { evaluation } = get();
        return evaluation?.gate.blocked ?? false;
      },
    })),
    {
      name: 'designer-logic-settings',
      version: 1,
      partialize: (state) => ({
        // Only persist UI preferences
        activeTab: state.activeTab,
        isPanelExpanded: state.isPanelExpanded,
        filter: state.filter,
      }),
    }
  )
);

// ============================================
// SELECTOR HOOKS
// ============================================

/**
 * Select gate status.
 */
export const useGateStatus = () =>
  useDesignerLogicStore((state) => ({
    blocked: state.evaluation?.gate.blocked ?? false,
    blockCount: state.evaluation?.gate.blocks.length ?? 0,
    warningCount: state.evaluation?.gate.warnings.length ?? 0,
  }));

/**
 * Select hardware items.
 */
export const useHardwareSelection = () =>
  useDesignerLogicStore((state) => state.evaluation?.hardware.hardware ?? []);

/**
 * Select drilling operations.
 */
export const useDrillingOperations = () =>
  useDesignerLogicStore((state) => state.evaluation?.drilling.operations ?? []);

/**
 * Select assembly steps.
 */
export const useAssemblySteps = () =>
  useDesignerLogicStore((state) => state.evaluation?.assembly.steps ?? []);

/**
 * Select active effects.
 */
export const useActiveEffects = () =>
  useDesignerLogicStore((state) => state.evaluation?.effects ?? []);
