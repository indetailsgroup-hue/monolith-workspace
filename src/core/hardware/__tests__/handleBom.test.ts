/**
 * handleBom.test.ts - Handles must enter the BOM with real quantity and cost.
 *
 * A part that reaches the BOM at zero cost is a defect, not a shortcut. These
 * tests are the guard against that pattern for the handle lane specifically.
 */

import { describe, it, expect } from 'vitest';
import { buildHandleBomItems } from '../handleBom';
import { makeCabinet, makeDoorConfig, makeDrawerConfig, makePanel } from './fixtures';

const DOOR_DEFAULTS = {
  style: 'slab' as const,
  overlayType: 'full' as const,
  hingeId: 'blum-clip-top-full',
};

/** 2 doors + 3 drawer rows, all pull handles. */
function mixedCabinet(
  doorHandleTypes: Array<'pull' | 'knob' | 'none' | 'push_latch' | 'j_pull'> = ['pull', 'pull']
) {
  return makeCabinet(
    {
      doorConfig: makeDoorConfig(
        doorHandleTypes.map((type) => ({
          ...DOOR_DEFAULTS,
          openingDirection: 'left' as const,
          handleConfig: { type, height: 400, offset: 40 },
        }))
      ),
      drawerConfig: makeDrawerConfig(
        [1, 2, 3].map(() => ({
          frontHeight: 140,
          gapAbove: 3,
          slideSystemId: 'metropush',
          handleConfig: { type: 'pull' as const, position: 'center' as const },
        }))
      ),
    },
    [
      makePanel('DOOR_LEFT', 296, 716, 18, [-150, 460, 289]),
      makePanel('DOOR_RIGHT', 296, 716, 18, [150, 460, 289]),
      makePanel('DRAWER_FRONT', 564, 140, 18, [0, 200, 271]),
      makePanel('DRAWER_FRONT', 564, 140, 18, [0, 350, 271]),
      makePanel('DRAWER_FRONT', 564, 140, 18, [0, 500, 271]),
    ]
  );
}

describe('BOM honesty', () => {
  it('gives every line a real unit price and a consistent total', () => {
    const items = buildHandleBomItems(mixedCabinet());
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      expect(item.unitPrice).toBeGreaterThan(0);
      expect(item.quantity).toBeGreaterThan(0);
      expect(item.totalPrice).toBeCloseTo((item.unitPrice ?? 0) * item.quantity, 6);
    }
  });

  it('categorises handles as hardware, never as a cut material', () => {
    for (const item of buildHandleBomItems(mixedCabinet())) {
      expect(item.category).toBe('hardware');
    }
  });
});

describe('BOM quantity', () => {
  it('bills 2 doors + 3 drawers as 5 handles and 10 screws', () => {
    const items = buildHandleBomItems(mixedCabinet());

    const handleQty = items
      .filter((i) => i.sku.startsWith('HDL-'))
      .reduce((sum, i) => sum + i.quantity, 0);
    const screwQty = items
      .filter((i) => i.sku.startsWith('SCR-'))
      .reduce((sum, i) => sum + i.quantity, 0);

    expect(handleQty).toBe(5);
    expect(screwQty).toBe(10);
  });

  it('drops to 9 screws and adds a second handle SKU when one door becomes a knob', () => {
    const items = buildHandleBomItems(mixedCabinet(['knob', 'pull']));

    const handleLines = items.filter((i) => i.sku.startsWith('HDL-'));
    const screwQty = items
      .filter((i) => i.sku.startsWith('SCR-'))
      .reduce((sum, i) => sum + i.quantity, 0);

    expect(handleLines.length).toBe(2);
    expect(handleLines.reduce((s, i) => s + i.quantity, 0)).toBe(5);
    expect(screwQty).toBe(9);
  });

  it('reads quantity from config, not from panel roles', () => {
    // bom.ts filters doors with role === 'FRONT', which matches nothing. If this
    // lane made the same mistake the count below would be 0.
    const cab = mixedCabinet();
    expect(cab.panels.some((p) => p.role === 'FRONT')).toBe(false);

    const handleQty = buildHandleBomItems(cab)
      .filter((i) => i.sku.startsWith('HDL-'))
      .reduce((sum, i) => sum + i.quantity, 0);
    expect(handleQty).toBe(5);
  });
});

describe('off is total', () => {
  it('emits no lines at all when every handle is none', () => {
    const cab = makeCabinet(
      {
        doorConfig: makeDoorConfig([
          {
            ...DOOR_DEFAULTS,
            openingDirection: 'left',
            handleConfig: { type: 'none', height: 400 },
          },
        ]),
        drawerConfig: makeDrawerConfig([
          {
            frontHeight: 140,
            gapAbove: 3,
            slideSystemId: 'metropush',
            handleConfig: { type: 'none', position: 'center' },
          },
        ]),
      },
      [
        makePanel('DOOR', 596, 716, 18, [0, 460, 289]),
        makePanel('DRAWER_FRONT', 564, 140, 18, [0, 300, 271]),
      ]
    );

    expect(buildHandleBomItems(cab)).toEqual([]);
  });

  it('bills nothing for a push_latch door', () => {
    const items = buildHandleBomItems(mixedCabinet(['push_latch', 'push_latch']));
    const handleQty = items
      .filter((i) => i.sku.startsWith('HDL-'))
      .reduce((sum, i) => sum + i.quantity, 0);
    // Only the 3 drawer handles remain.
    expect(handleQty).toBe(3);
  });

  it('bills nothing for a j_pull door, because a J-pull is routed, not bought', () => {
    const items = buildHandleBomItems(mixedCabinet(['j_pull', 'j_pull']));
    const handleQty = items
      .filter((i) => i.sku.startsWith('HDL-'))
      .reduce((sum, i) => sum + i.quantity, 0);
    expect(handleQty).toBe(3);
  });
});
