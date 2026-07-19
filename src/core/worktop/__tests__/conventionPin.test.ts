/** @vitest-environment jsdom */
/**
 * CONVENTION PIN — scenePosition is the footprint CENTRE, not the min corner.
 *
 * This test exists because the tree contradicts itself: App.tsx comments
 * scenePosition as "the CORNER" and useSnapTargets.ts builds min = position,
 * max = position + dims, while generatePanels emits LEFT_SIDE at -W/2 + T/2.
 * The renderer is the arbiter — Cabinet3D binds <group position={scenePosition}>
 * and each panel binds straight off panel.position inside that group — so the
 * panel geometry decides what scenePosition means in world space.
 *
 * Every worktop slab coordinate is derived from this convention. If this test
 * ever goes red, deriveWorktopPanels is offset by (W/2, ·, D/2) and must be
 * rewritten before anything downstream is trusted.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCabinetStore } from '../../store/useCabinetStore';

function resetAndCreate() {
  useCabinetStore.setState({
    cabinets: [],
    cabinet: null,
    activeCabinetId: null,
    selectedPanelId: null,
    hiddenCabinetIds: [],
  });
  useCabinetStore.getState().createCabinet('BASE', 'Convention Pin');
  return useCabinetStore.getState().cabinet!;
}

describe('scenePosition convention pin', () => {
  beforeEach(() => {
    resetAndCreate();
  });

  it('centres the carcass on local X: sides straddle x = 0', () => {
    const cabinet = useCabinetStore.getState().cabinet!;
    const W = cabinet.dimensions.width;

    const left = cabinet.panels.find(p => p.role === 'LEFT_SIDE')!;
    const right = cabinet.panels.find(p => p.role === 'RIGHT_SIDE')!;
    const t = left.computed.realThickness;

    // Centre convention: -W/2 + T/2 and +W/2 - T/2.
    expect(left.position[0]).toBeCloseTo(-W / 2 + t / 2, 6);
    expect(right.position[0]).toBeCloseTo(W / 2 - t / 2, 6);

    // Corner convention would put them at +T/2 and W - T/2. Prove it is NOT that.
    expect(left.position[0]).toBeLessThan(0);
    expect(right.position[0]).toBeGreaterThan(0);
  });

  it('centres the carcass on local Z: TOP panel sits at z ~ 0', () => {
    const cabinet = useCabinetStore.getState().cabinet!;
    const top = cabinet.panels.find(p => p.role === 'TOP')!;

    // carcassZ is a small back-panel offset, never ~D/2. Corner convention
    // would place the top panel at z = D/2 (280mm for a 560mm carcass).
    expect(Math.abs(top.position[2])).toBeLessThan(cabinet.dimensions.depth / 4);
  });

  it('puts local Y = 0 at the FLOOR: carcass top is toeKickHeight + height', () => {
    const cabinet = useCabinetStore.getState().cabinet!;
    const { height: H, toeKickHeight: Leg } = cabinet.dimensions;

    const top = cabinet.panels.find(p => p.role === 'TOP')!;
    const t = top.computed.realThickness;

    // Top panel centre lies within half a thickness of the carcass top face.
    const carcassTopY = Leg + H;
    expect(Math.abs(top.position[1] - (carcassTopY - t / 2))).toBeLessThanOrEqual(t);

    // And the bottom panel is near the floor + leg, not near zero-minus.
    const bottom = cabinet.panels.find(p => p.role === 'BOTTOM')!;
    expect(bottom.position[1]).toBeGreaterThanOrEqual(Leg - t);
    expect(bottom.position[1]).toBeLessThan(Leg + H / 2);
  });
});
