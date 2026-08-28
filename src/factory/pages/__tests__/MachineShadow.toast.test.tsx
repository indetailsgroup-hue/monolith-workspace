// @vitest-environment jsdom
/**
 * MachineShadow toast banner — Vitest unit test
 *
 * Asserts:
 *   1. `reconnect-toast` is absent on initial mount
 *   2. `reconnect-toast` appears after `onerror` fires
 *   3. `reconnect-toast` disappears after clicking the dismiss button
 */

import React from 'react';
import { render, fireEvent, act, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MachineShadow } from '../MachineShadow';

// ── Hoisted shared state — must be declared before vi.mock() factories ─────────

const { fakeEs, mockOpenEventStream } = vi.hoisted(() => {
  /** Minimal EventSource-like object whose handlers MachineShadow will wire. */
  const fakeEs = {
    onopen:  null as ((e?: Event) => void) | null,
    onerror: null as ((e?: Event) => void) | null,
  };
  const mockOpenEventStream = vi.fn();
  return { fakeEs, mockOpenEventStream };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../state/machineShadowStore', () => {
  const storeState = {
    activeEventSource: fakeEs as unknown as EventSource,
    selectedMachineId: 'machine-001' as string | null,
    openEventStream:   mockOpenEventStream,
  };
  return {
    useMachineShadowStore: vi.fn(
      (selector?: (s: typeof storeState) => unknown) =>
        selector ? selector(storeState) : storeState,
    ),
  };
});

vi.mock('../../components/shadow/MachineShadowPanel', () => ({
  MachineShadowPanel: () => <div data-testid="machine-shadow-panel" />,
}));

vi.mock('lucide-react', () => ({
  AlertCircle: ({ size, ...props }: { size?: number; [k: string]: unknown }) => (
    <svg data-testid="alert-circle" width={size} {...props} />
  ),
  X: ({ size, ...props }: { size?: number; [k: string]: unknown }) => (
    <svg data-testid="icon-x" width={size} {...props} />
  ),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MachineShadow — reconnect toast banner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset handler stubs before each test so effects wire them fresh
    fakeEs.onopen  = null;
    fakeEs.onerror = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not render reconnect-toast on initial mount', () => {
    const { queryByTestId } = render(<MachineShadow />);
    expect(queryByTestId('reconnect-toast')).toBeNull();
  });

  it('shows reconnect-toast after EventSource onerror fires', () => {
    const { getByTestId } = render(<MachineShadow />);

    // The useEffect has wired onerror by now — invoke it synchronously
    act(() => {
      fakeEs.onerror?.();
    });

    const toast = getByTestId('reconnect-toast');
    expect(toast).toBeDefined();
    // Should mention attempt number
    expect(toast.textContent).toMatch(/attempt\s*1/i);
  });

  it('hides reconnect-toast after clicking the dismiss button', () => {
    const { getByTestId, queryByTestId } = render(<MachineShadow />);

    act(() => {
      fakeEs.onerror?.();
    });

    // Toast is visible
    expect(getByTestId('reconnect-toast')).toBeDefined();

    // Click the dismiss button
    const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismissBtn);

    // Toast must disappear
    expect(queryByTestId('reconnect-toast')).toBeNull();
  });
});
