/**
 * safetyHotkey — S18 Slice 3
 *
 * Shift+G / T เปิดแท็บ Safety "ในแอป" (DesignerIntentPanel)
 * แทนการ navigate ไป /safety ซึ่งเป็นหน้า demo/mock
 *
 * ต้องเรียกก่อน tool hotkeys ใน App.tsx เพราะ handleToolHotkey จับ 'G'
 * แบบ case-insensitive (Shift+G เดิมโดน Move tool กินคีย์ไปก่อน)
 */

import { openSafetyTab } from '../../designer/state/useIntentPanelStore';
import { useSketchStore } from '../../core/sketch/useSketchStore';

/**
 * จัดการ hotkey เปิดแท็บ Safety Gate
 * - Shift+G: เปิดแท็บ Safety
 * - T (นอก sketch mode): เปิดแท็บ Safety (backwards compat กับ T014)
 * - T ใน sketch mode: ไม่กินคีย์ — T คือ rect tool
 *
 * @returns true ถ้ากินคีย์แล้ว (caller ควร return ทันที)
 */
export function handleSafetyHotkey(e: Pick<KeyboardEvent, 'key' | 'shiftKey'>): boolean {
  if (e.key === 'G' && e.shiftKey) {
    openSafetyTab();
    return true;
  }

  if (e.key === 't' && !e.shiftKey) {
    if (useSketchStore.getState().enabled) {
      // T is the rect tool in sketch mode — do not consume
      return false;
    }
    openSafetyTab();
    return true;
  }

  return false;
}
