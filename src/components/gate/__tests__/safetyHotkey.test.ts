/**
 * safetyHotkey tests — S18 Slice 3
 *
 * Shift+G / T ต้องเปิดแท็บ Safety "ในแอป" (useIntentPanelStore)
 * ไม่ใช่ navigate ไป /safety ซึ่งเป็นหน้า demo/mock
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleSafetyHotkey } from '../safetyHotkey';
import { useIntentPanelStore } from '../../../designer/state/useIntentPanelStore';
import { useSketchStore } from '../../../core/sketch/useSketchStore';

describe('handleSafetyHotkey', () => {
  beforeEach(() => {
    useIntentPanelStore.setState({ activeTab: 'materials' });
    useSketchStore.setState({ enabled: false } as never);
  });

  it('Shift+G opens the Safety tab in-app and consumes the key', () => {
    const consumed = handleSafetyHotkey({ key: 'G', shiftKey: true });

    expect(consumed).toBe(true);
    expect(useIntentPanelStore.getState().activeTab).toBe('safety');
  });

  it('plain g (no shift) is not consumed (G = Move tool)', () => {
    const consumed = handleSafetyHotkey({ key: 'g', shiftKey: false });

    expect(consumed).toBe(false);
    expect(useIntentPanelStore.getState().activeTab).toBe('materials');
  });

  it('t opens the Safety tab when sketch mode is off', () => {
    const consumed = handleSafetyHotkey({ key: 't', shiftKey: false });

    expect(consumed).toBe(true);
    expect(useIntentPanelStore.getState().activeTab).toBe('safety');
  });

  it('t is not consumed in sketch mode (T = rect tool)', () => {
    useSketchStore.setState({ enabled: true } as never);

    const consumed = handleSafetyHotkey({ key: 't', shiftKey: false });

    expect(consumed).toBe(false);
    expect(useIntentPanelStore.getState().activeTab).toBe('materials');
  });

  it('unrelated keys are not consumed', () => {
    expect(handleSafetyHotkey({ key: 'x', shiftKey: false })).toBe(false);
    expect(useIntentPanelStore.getState().activeTab).toBe('materials');
  });
});
