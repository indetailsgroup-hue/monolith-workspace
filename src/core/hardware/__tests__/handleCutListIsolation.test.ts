/** @vitest-environment jsdom */
/**
 * handleCutListIsolation.test.ts - Handles must never reach the cut list.
 *
 * A handle is bought hardware, not a cut part. This drives the REAL store
 * through two identical cabinets whose only difference is the handle
 * configuration, and asserts the generated panels — count, roles, cut sizes,
 * edge lengths and totals — are indistinguishable.
 *
 * That is the concrete proof that nothing this lane adds can leak into
 * flatPartBuilder, the DXF export or the gate, all of which consume panels.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { useCabinetStore } from '../../store/useCabinetStore';
import type { Cabinet, CabinetPanel } from '../../types/Cabinet';
import { buildHandleBomItems } from '../handleBom';
import { resolveHandlePlacements } from '../handlePlacement';

/** The panel fields that actually drive the cut list and the DXF. */
interface CutListRow {
  role: string;
  finishWidth: number;
  finishHeight: number;
  cutWidth: number;
  cutHeight: number;
  realThickness: number;
  edgeLength: number;
  grainDirection: string;
}

function toCutList(panels: CabinetPanel[]): CutListRow[] {
  return panels.map((p) => ({
    role: p.role,
    finishWidth: p.finishWidth,
    finishHeight: p.finishHeight,
    cutWidth: p.computed.cutWidth,
    cutHeight: p.computed.cutHeight,
    realThickness: p.computed.realThickness,
    edgeLength: p.computed.edgeLength,
    grainDirection: p.grainDirection,
  }));
}

/**
 * Build a base cabinet with 2 doors and 2 drawer rows, then set every handle to
 * `handleType`. Returns the resulting cabinet.
 */
function buildCabinet(handleType: 'pull' | 'knob' | 'none'): Cabinet {
  useCabinetStore.setState({
    cabinets: [],
    cabinet: null,
    activeCabinetId: null,
    selectedPanelId: null,
    hiddenCabinetIds: [],
  });

  const store = useCabinetStore.getState();
  store.createCabinet('BASE', 'Isolation Test');

  useCabinetStore.getState().enableDoors(2);
  useCabinetStore.getState().enableDrawers('undermount');
  useCabinetStore.getState().addDrawerRow();
  useCabinetStore.getState().addDrawerRow();

  const doorCount = useCabinetStore.getState().cabinet!.structure.doorConfig?.doors.length ?? 0;
  for (let i = 0; i < doorCount; i++) {
    useCabinetStore.getState().updateDoorPanel(i, {
      handleConfig: { type: handleType, height: 400, offset: 40 },
    });
  }

  const rowCount = useCabinetStore.getState().cabinet!.structure.drawerConfig?.rows.length ?? 0;
  for (let i = 0; i < rowCount; i++) {
    useCabinetStore.getState().updateDrawerRow(i, {
      handleConfig: { type: handleType === 'none' ? 'none' : handleType, position: 'center' },
    });
  }

  return useCabinetStore.getState().cabinet!;
}

describe('handles are invisible to the cut list', () => {
  it('produces a byte-identical cut list with handles on and with handles off', () => {
    const withHandles = buildCabinet('pull');
    const cutListWith = toCutList(withHandles.panels);
    const totalsWith = withHandles.computed;

    const withoutHandles = buildCabinet('none');
    const cutListWithout = toCutList(withoutHandles.panels);
    const totalsWithout = withoutHandles.computed;

    expect(cutListWith.length).toBe(cutListWithout.length);
    expect(cutListWith).toEqual(cutListWithout);
    expect(totalsWith.totalCost).toBe(totalsWithout.totalCost);
    expect(totalsWith.totalSurfaceArea).toBe(totalsWithout.totalSurfaceArea);
    expect(totalsWith.totalCO2).toBe(totalsWithout.totalCO2);
    expect(totalsWith.panelCount).toBe(totalsWithout.panelCount);
    expect(totalsWith.totalEdgeLength).toBe(totalsWithout.totalEdgeLength);
  });

  it('changing the handle form does not move a single panel either', () => {
    const pull = toCutList(buildCabinet('pull').panels);
    const knob = toCutList(buildCabinet('knob').panels);
    expect(pull).toEqual(knob);
  });

  it('still produces handles for that same cabinet, so the test is not vacuous', () => {
    // If the cabinet had no doors or drawers the equality above would be trivial.
    const cabinet = buildCabinet('pull');
    const placements = resolveHandlePlacements(cabinet);
    const items = buildHandleBomItems(cabinet);

    expect(placements.length).toBeGreaterThan(0);
    expect(items.length).toBeGreaterThan(0);
    expect(items.reduce((s, i) => s + (i.totalPrice ?? 0), 0)).toBeGreaterThan(0);
  });

  it('never introduces a panel whose role could be mistaken for a handle', () => {
    const roles = new Set(buildCabinet('pull').panels.map((p) => p.role));
    expect([...roles].some((r) => r.includes('HANDLE'))).toBe(false);
  });
});
