// @vitest-environment jsdom
/**
 * MachineShadow — stale-features toast banner Vitest unit tests
 *
 * Asserts:
 *   1. `stale-features-toast` is absent when staleFeatures=false
 *   2. `stale-features-toast` appears when staleFeatures=true
 *   3. Banner disappears after clicking the dismiss button
 *   4. Dismissed banner resets (reappears) when selectedMachineId changes
 *   5. Clicking force-refresh-btn calls loadMaintenance with { forceRefresh: true }
 *
 * Test file path: src/factory/pages/__tests__/MachineShadow.stale.test.tsx
 */

import React from 'react';
import { render, fireEvent, act, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MachineShadow } from '../MachineShadow';

// ── Hoisted mutable store state ────────────────────────────────────────────────
// Created in vi.hoisted() so tests can mutate properties between renders and
// the vi.mock() factory can reference the same object reference.

const { fakeEs, mockOpenEventStream, mockLoadMaintenance, storeState } = vi.hoisted(() => {
  /** Minimal EventSource stub whose handlers MachineShadow will wire. */
  const fakeEs = {
    onopen:  null as ((e?: Event) => void) | null,
    onerror: null as ((e?: Event) => void) | null,
  };
  const mockOpenEventStream  = vi.fn();
  const mockLoadMaintenance  = vi.fn().mockResolvedValue(undefined);

  /**
   * Mutable store snapshot.  Tests may mutate _maintenance and
   * selectedMachineId directly, then call rerender() to trigger a new
   * render cycle and React effect evaluation.
   */
  const storeState = {
    activeEventSource: fakeEs as unknown as EventSource,
    selectedMachineId: 'machine-001' as string | null,
    openEventStream:   mockOpenEventStream,
    loadMaintenance:   mockLoadMaintenance,
    /** Backing field read by the selectSelectedMaintenance selector mock. */
    _maintenance: null as null | { staleFeatures: boolean | null; cacheAge: number | null },
  };

  return { fakeEs, mockOpenEventStream, mockLoadMaintenance, storeState };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../state/machineShadowStore', () => ({
  /**
   * Generic selector adapter: if a selector is passed, call it with the
   * mutable storeState so tests can control the return value by mutating
   * the object.  Otherwise return the whole state.
   */
  useMachineShadowStore: vi.fn(
    (selector?: (s: typeof storeState) => unknown) =>
      selector ? selector(storeState) : storeState,
  ),
  /**
   * selectSelectedMaintenance is imported directly by MachineShadow.tsx.
   * Expose it as a real selector that reads from the mutable _maintenance
   * field so tests can configure it without needing vi.fn().mockReturnValue.
   */
  selectSelectedMaintenance: (s: typeof storeState) => s._maintenance,
}));

vi.mock('../../components/shadow/MachineShadowPanel', () => ({
  MachineShadowPanel: () => <div data-testid="machine-shadow-panel" />,
}));

vi.mock('lucide-react', () => ({
  AlertCircle: ({ size, ...p }: { size?: number; [k: string]: unknown }) => (
    <svg data-testid="alert-circle" width={size} {...p} />
  ),
  Clock: ({ size, ...p }: { size?: number; [k: string]: unknown }) => (
    <svg data-testid="clock-icon" width={size} {...p} />
  ),
  X: ({ size, ...p }: { size?: number; [k: string]: unknown }) => (
    <svg data-testid="icon-x" width={size} {...p} />
  ),
  RefreshCw: ({ size, ...p }: { size?: number; [k: string]: unknown }) => (
    <svg data-testid="refresh-cw-icon" width={size} {...p} />
  ),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MachineShadow — stale-features toast banner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset all mutable storeState fields before each test
    fakeEs.onopen  = null;
    fakeEs.onerror = null;
    storeState.selectedMachineId = 'machine-001';
    storeState._maintenance      = null;
    mockLoadMaintenance.mockClear();
    mockOpenEventStream.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ── 1. Banner absent when not stale ─────────────────────────────────────────

  it('does not render stale-features-toast when staleFeatures=false', () => {
    storeState._maintenance = { staleFeatures: false, cacheAge: 10_000 };

    const { queryByTestId } = render(<MachineShadow />);

    expect(queryByTestId('stale-features-toast')).toBeNull();
  });

  it('does not render stale-features-toast when maintenance is null (no cache)', () => {
    storeState._maintenance = null;

    const { queryByTestId } = render(<MachineShadow />);

    expect(queryByTestId('stale-features-toast')).toBeNull();
  });

  // ── 2. Banner appears when stale ─────────────────────────────────────────────

  it('shows stale-features-toast when staleFeatures=true', () => {
    storeState._maintenance = { staleFeatures: true, cacheAge: 400_000 };

    const { getByTestId } = render(<MachineShadow />);

    const banner = getByTestId('stale-features-toast');
    expect(banner).toBeDefined();
    // Verify copy contains the key warning phrase
    expect(banner.textContent).toMatch(/stale/i);
  });

  // ── 3. Dismiss hides the banner ───────────────────────────────────────────────

  it('hides stale-features-toast after clicking the dismiss button', () => {
    storeState._maintenance = { staleFeatures: true, cacheAge: 400_000 };

    const { getByTestId, queryByTestId } = render(<MachineShadow />);

    // Banner is visible
    expect(getByTestId('stale-features-toast')).toBeDefined();

    // Click dismiss
    const dismissBtn = screen.getByRole('button', { name: /dismiss stale/i });
    fireEvent.click(dismissBtn);

    // Banner must be gone
    expect(queryByTestId('stale-features-toast')).toBeNull();
  });

  // ── 4. Reset: banner reappears after selectedMachineId changes ───────────────
  //
  //   Flow:
  //     a. Render with machine-001 and staleFeatures=true → banner shows
  //     b. Dismiss the banner (staleDismissed → true)
  //     c. Change selectedMachineId to machine-002 + rerender
  //        → useEffect([selectedMachineId]) fires → setStaleDismissed(false)
  //     d. staleFeatures is still true → banner reappears

  it('resets dismissed state when selectedMachineId changes, re-showing the banner', () => {
    storeState._maintenance      = { staleFeatures: true, cacheAge: 400_000 };
    storeState.selectedMachineId = 'machine-001';

    const { getByTestId, queryByTestId, rerender } = render(<MachineShadow />);

    // (a) Banner visible
    expect(getByTestId('stale-features-toast')).toBeDefined();

    // (b) Dismiss
    fireEvent.click(screen.getByRole('button', { name: /dismiss stale/i }));
    expect(queryByTestId('stale-features-toast')).toBeNull();

    // (c) Switch machine — wrap in act so React flushes the useEffect
    act(() => {
      storeState.selectedMachineId = 'machine-002';
    });
    rerender(<MachineShadow />);

    // (d) Banner reappears because staleDismissed was reset to false
    expect(getByTestId('stale-features-toast')).toBeDefined();
  });

  // ── 5. Force-refresh button calls loadMaintenance with { forceRefresh: true } ─

  it('clicking force-refresh-btn calls loadMaintenance with { forceRefresh: true }', async () => {
    storeState._maintenance      = { staleFeatures: true, cacheAge: 400_000 };
    storeState.selectedMachineId = 'machine-001';

    const { getByTestId } = render(<MachineShadow />);

    // Verify stale banner and button are present
    expect(getByTestId('stale-features-toast')).toBeDefined();
    const btn = getByTestId('force-refresh-btn');
    expect(btn).toBeDefined();

    // Click — wrap in act(async) so the awaited promise inside handleForceRefresh resolves
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(mockLoadMaintenance).toHaveBeenCalledWith('machine-001', { forceRefresh: true });
  });
});
