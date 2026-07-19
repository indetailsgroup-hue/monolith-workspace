/**
 * GateProvider - Reactive Gate Validation Context
 *
 * React component that provides automatic gate validation lifecycle:
 * - Auto-runs gate when design state changes (debounced)
 * - Clears results when entering DRAFT state
 * - Provides useGate() hook for consuming gate status
 * - Integrates with existing useGateStore for state management
 *
 * ARCHITECTURE:
 * - Wraps children with React Context for convenience hooks
 * - Uses Zustand (useGateStore) for actual state storage
 * - useEffect lifecycle manages auto-run/clear behavior
 * - Debounced validation prevents excessive re-runs during editing
 *
 * @version 1.0.0 - Phase 4: GateProvider React Context
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useGateStore } from './gateStore';
import type { GateResult, GateFinding } from './gateTypes';

// ============================================
// CONTEXT TYPES
// ============================================

export interface GateContextValue {
  /** Latest gate validation result */
  result: GateResult | null;

  /** Is validation currently running */
  isRunning: boolean;

  /** Is there at least one blocker */
  isBlocked: boolean;

  /** Number of blocker issues */
  blockerCount: number;

  /** Number of warning issues */
  warningCount: number;

  /** Number of info issues */
  infoCount: number;

  /** Whether gate has been run at all */
  hasRun: boolean;

  /** Run gate validation manually */
  runGate: () => void;

  /** Clear gate results */
  clearGate: () => void;

  /** Get all blockers */
  getBlockers: () => GateFinding[];

  /** Get issues for a specific cabinet/entity */
  getIssuesForEntity: (entityId: string) => GateFinding[];

  /** Check if design can proceed to freeze/export */
  canProceed: boolean;
}

// ============================================
// CONTEXT
// ============================================

const GateContext = createContext<GateContextValue | null>(null);

// ============================================
// PROVIDER PROPS
// ============================================

export interface GateProviderProps {
  children: ReactNode;

  /**
   * Function to run gate validation.
   * Called automatically on design changes and manually via runGate().
   * Should update useGateStore with results.
   */
  onRunGate?: () => Promise<void> | void;

  /**
   * Debounce delay in ms for auto-validation.
   * Default: 500ms
   */
  debounceMs?: number;

  /**
   * Whether auto-validation is enabled.
   * When true, gate runs automatically when dependencies change.
   * Default: false (manual trigger only)
   */
  autoRun?: boolean;

  /**
   * Dependencies that trigger auto-validation.
   * When any value in this array changes, gate will re-run (debounced).
   * Typically: [cabinets, drillMap, specState]
   */
  dependencies?: unknown[];
}

// ============================================
// PROVIDER COMPONENT
// ============================================

/**
 * GateProvider wraps the application with gate validation context.
 *
 * Usage:
 * ```tsx
 * <GateProvider
 *   onRunGate={async () => {
 *     const result = await runMyValidation();
 *     useGateStore.getState().setResult(result);
 *   }}
 *   autoRun={specState === 'FROZEN'}
 *   dependencies={[cabinets, drillMap]}
 *   debounceMs={500}
 * >
 *   <App />
 * </GateProvider>
 * ```
 */
export function GateProvider({
  children,
  onRunGate,
  debounceMs = 500,
  autoRun = false,
  dependencies = [],
}: GateProviderProps) {
  // Read from Zustand store
  const lastResult = useGateStore((s) => s.lastResult);
  const isRunning = useGateStore((s) => s.isRunning);
  const setRunning = useGateStore((s) => s.setRunning);
  const storeReset = useGateStore((s) => s.reset);

  // Track previous dependencies for change detection
  const prevDepsRef = useRef<unknown[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Run gate validation
  const runGate = useCallback(async () => {
    if (!onRunGate || isRunning) return;

    setRunning(true);
    try {
      await onRunGate();
    } catch (error) {
      console.error('[GateProvider] Validation error:', error);
      if (mountedRef.current) {
        setRunning(false);
      }
    }
    // Note: onRunGate should call setResult() which sets isRunning=false
  }, [onRunGate, isRunning, setRunning]);

  // Clear gate results
  const clearGate = useCallback(() => {
    storeReset();
  }, [storeReset]);

  // Auto-run gate when dependencies change (debounced)
  useEffect(() => {
    if (!autoRun || !onRunGate) return;

    // Check if dependencies actually changed
    const depsChanged =
      prevDepsRef.current.length !== dependencies.length ||
      dependencies.some((dep, i) => dep !== prevDepsRef.current[i]);

    prevDepsRef.current = dependencies;

    if (!depsChanged) return;

    // Debounce the validation run
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        runGate();
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
    // NOTE(react-hooks/exhaustive-deps): intentionally not satisfied —
    // deps array spreads caller-supplied ...dependencies, which the rule cannot analyse.
    // The rule is not installed yet; restore a real eslint-disable directive
    // when eslint-plugin-react-hooks is added.
  }, [autoRun, debounceMs, runGate, ...dependencies]);

  // Derive context value
  const blockerCount = lastResult?.findings.blockers.length ?? 0;
  const warningCount = lastResult?.findings.warnings.length ?? 0;
  const infoCount = lastResult?.findings.info.length ?? 0;
  const hasRun = lastResult !== null;

  // Get all blockers
  const getBlockers = useCallback((): GateFinding[] => {
    return lastResult?.findings.blockers ?? [];
  }, [lastResult]);

  // Get issues for a specific entity
  const getIssuesForEntity = useCallback(
    (entityId: string): GateFinding[] => {
      if (!lastResult) return [];
      const all = [
        ...lastResult.findings.blockers,
        ...lastResult.findings.warnings,
        ...lastResult.findings.info,
      ];
      return all.filter((f) => f.entityIds.includes(entityId));
    },
    [lastResult]
  );

  const value: GateContextValue = {
    result: lastResult,
    isRunning,
    isBlocked: blockerCount > 0,
    blockerCount,
    warningCount,
    infoCount,
    hasRun,
    runGate,
    clearGate,
    getBlockers,
    getIssuesForEntity,
    canProceed: hasRun && blockerCount === 0,
  };

  return (
    <GateContext.Provider value={value}>
      {children}
    </GateContext.Provider>
  );
}

// ============================================
// HOOKS
// ============================================

/**
 * Access the Gate context.
 * Must be used within a GateProvider.
 *
 * @throws Error if used outside GateProvider
 */
export function useGate(): GateContextValue {
  const context = useContext(GateContext);
  if (!context) {
    throw new Error('useGate must be used within a GateProvider');
  }
  return context;
}

/**
 * Get gate result only.
 */
export function useGateResult(): GateResult | null {
  return useGate().result;
}

/**
 * Check if gate is blocked (has blockers).
 */
export function useIsGateBlocked(): boolean {
  return useGate().isBlocked;
}

/**
 * Check if design can proceed (gate passed without blockers).
 */
export function useCanProceed(): boolean {
  return useGate().canProceed;
}

/**
 * Get issues for a specific cabinet.
 */
export function useGateIssuesForEntity(entityId: string): GateFinding[] {
  return useGate().getIssuesForEntity(entityId);
}

// ============================================
// OPTIONAL GATE PROVIDER (No-throw version)
// ============================================

/**
 * Use gate context with fallback for components that may render
 * outside of GateProvider. Returns null if no provider found.
 */
export function useGateOptional(): GateContextValue | null {
  return useContext(GateContext);
}

export default GateProvider;
