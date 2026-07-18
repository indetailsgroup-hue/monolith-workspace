/**
 * runGateValidation — warnings-only aggregate result (S18 fix)
 *
 * Warnings-only (เช่น ยังไม่มี drill map → MONO_MINIFIX_NO_DRILL_MAP) ต้องไม่ทำให้
 * GateResult.passed = false: passed สื่อ "ไม่มี blocker" ทั้งระบบ
 * (useExportGate: warnings don't fail · gateG11/connectorAudit: FAIL เมื่อ blockers > 0)
 * และถูก embed ลง packet gate_result.json (buildGateResult) ซึ่ง factory verifyPacket
 * ตีความ passed=false เป็น FAIL — ถ้า warnings ทำให้ passed=false จะได้
 * "Gate FAILED: 0 blocker(s)" ทั้งที่ไม่มี blocker จริง (เปลี่ยน semantics ข้าม lane)
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runGateValidation } from '../SafetyPanel';
import { useGateStore } from '../gateStore';
import { useDrillMapStore } from '../../../core/store/useDrillMapStore';
import { buildGateResultData } from '../../../factory/packet/builders/buildGateResult';

describe('runGateValidation — warnings-only (no drill map)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGateStore.getState().reset();
    useDrillMapStore.setState({ drillMap: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Run gate and advance past runGateValidation inner delay (50ms) */
  function runGate() {
    runGateValidation();
    vi.advanceTimersByTime(100);
  }

  it('surfaces the no-drill-map warning without failing the gate (0 blockers = passed)', () => {
    runGate();

    const result = useGateStore.getState().lastResult;
    expect(result).not.toBeNull();
    // S18 Slice 2: not a silent PASS — warning must be visible
    expect(
      result!.findings.warnings.some((w) => w.code === 'MONO_MINIFIX_NO_DRILL_MAP')
    ).toBe(true);
    // ...but warnings don't fail: no blockers = passed (same contract as useExportGate)
    expect(result!.findings.blockers).toHaveLength(0);
    expect(result!.passed).toBe(true);
  });

  it('embeds passed=true into packet gate_result (factory verifyPacket contract)', () => {
    runGate();

    const packetGate = buildGateResultData(useGateStore.getState().lastResult);
    expect(packetGate.summary.blockerCount).toBe(0);
    expect(packetGate.summary.warningCount).toBeGreaterThanOrEqual(1);
    // factory verifyPacket: passed=false → "Gate FAILED: N blocker(s)" —
    // warnings-only packet ต้องไม่โดนตีตก
    expect(packetGate.passed).toBe(true);
  });
});
