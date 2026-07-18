/**
 * AppGateProvider tests — S18 Slice 3
 *
 * Gate ต้องวิ่งเอง (autoRun) เมื่อ design เปลี่ยน — ไม่ต้องรอผู้ใช้กดปุ่ม
 * Render test: mount → gate รันเองหลัง debounce, cabinets เปลี่ยน → gate รันซ้ำ
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { AppGateProvider } from '../AppGateProvider';
import { useGateStore } from '../../../gate/ui/gateStore';
import { useCabinetStore } from '../../../core/store/useCabinetStore';

describe('AppGateProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGateStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  /** Advance past GateProvider debounce (500ms) + runGateValidation inner delay (50ms) */
  function advancePastGateRun() {
    act(() => {
      vi.advanceTimersByTime(600);
    });
  }

  it('renders children', () => {
    const { getByText } = render(
      <AppGateProvider>
        <div>child-content</div>
      </AppGateProvider>
    );
    expect(getByText('child-content')).toBeInTheDocument();
  });

  it('auto-runs gate validation after mount (debounced)', () => {
    render(
      <AppGateProvider>
        <div />
      </AppGateProvider>
    );

    expect(useGateStore.getState().lastResult).toBeNull();

    advancePastGateRun();

    // Gate ran by itself — with no drill map it must report the
    // "no drill map" warning (S18 Slice 2), not stay silent
    const result = useGateStore.getState().lastResult;
    expect(result).not.toBeNull();
    expect(
      result!.findings.warnings.some((w) => w.code === 'MONO_MINIFIX_NO_DRILL_MAP')
    ).toBe(true);
  });

  it('re-runs gate automatically when cabinets change', () => {
    render(
      <AppGateProvider>
        <div />
      </AppGateProvider>
    );
    advancePastGateRun();
    expect(useGateStore.getState().lastResult).not.toBeNull();

    // Clear result, then change cabinets → gate must run again by itself
    act(() => {
      useGateStore.getState().reset();
      useCabinetStore.setState({ cabinets: [...useCabinetStore.getState().cabinets] });
    });
    expect(useGateStore.getState().lastResult).toBeNull();

    advancePastGateRun();
    expect(useGateStore.getState().lastResult).not.toBeNull();
  });
});
