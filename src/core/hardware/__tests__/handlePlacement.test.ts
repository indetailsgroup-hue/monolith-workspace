/**
 * handlePlacement.test.ts - Placement math for bought handles.
 *
 * Handles are hardware, not panels. These tests pin the panel-local geometry
 * so the 3D layer and the BOM agree on where and how many there are.
 */

import { describe, it, expect } from 'vitest';
import { resolveHandlePlacements } from '../handlePlacement';
import { getHandleSpec, resolveHandleSku } from '../handleCatalog';
import {
  makeCabinet,
  makeDoorConfig,
  makeDrawerConfig,
  makePanel,
  makeWorkedExampleDoorPanel,
} from './fixtures';

const DOOR_DEFAULTS = {
  style: 'slab' as const,
  overlayType: 'full' as const,
  hingeId: 'blum-clip-top-full',
};

describe('resolveHandleSku', () => {
  it('normalises the j-pull / j_pull spelling mismatch to the same (no-hardware) answer', () => {
    expect(resolveHandleSku('j-pull')).toBeNull();
    expect(resolveHandleSku('j_pull')).toBeNull();
  });

  it('returns nothing for the off states', () => {
    expect(resolveHandleSku('none')).toBeNull();
    expect(resolveHandleSku('push_latch')).toBeNull();
  });

  it('maps pull and knob to real catalog entries', () => {
    const pull = resolveHandleSku('pull');
    const knob = resolveHandleSku('knob');
    expect(pull).not.toBeNull();
    expect(knob).not.toBeNull();
    expect(getHandleSpec(pull!)?.form).toBe('BAR');
    expect(getHandleSpec(knob!)?.form).toBe('KNOB');
  });
});

describe('door placement - hinge mirroring', () => {
  it("puts the handle on the edge opposite the hinge for openingDirection 'left'", () => {
    const cab = makeCabinet(
      {
        doorConfig: makeDoorConfig([
          {
            ...DOOR_DEFAULTS,
            openingDirection: 'left',
            handleConfig: { type: 'pull', height: 400, offset: 40 },
          },
        ]),
      },
      [makePanel('DOOR', 596, 716, 18, [0, 460, 289])]
    );

    const [p] = resolveHandlePlacements(cab);
    expect(p.localPosition[0]).toBe(596 / 2 - 40);
  });

  it("mirrors exactly for openingDirection 'right'", () => {
    const cab = makeCabinet(
      {
        doorConfig: makeDoorConfig([
          {
            ...DOOR_DEFAULTS,
            openingDirection: 'right',
            handleConfig: { type: 'pull', height: 400, offset: 40 },
          },
        ]),
      },
      [makePanel('DOOR', 596, 716, 18, [0, 460, 289])]
    );

    const [p] = resolveHandlePlacements(cab);
    expect(p.localPosition[0]).toBe(-(596 / 2 - 40));
  });

  it('places a matched double-door pair symmetrically about x=0 in panel-local space', () => {
    const cab = makeCabinet(
      {
        doorConfig: makeDoorConfig([
          {
            ...DOOR_DEFAULTS,
            openingDirection: 'left',
            handleConfig: { type: 'pull', height: 400, offset: 40 },
          },
          {
            ...DOOR_DEFAULTS,
            openingDirection: 'right',
            handleConfig: { type: 'pull', height: 400, offset: 40 },
          },
        ]),
      },
      [
        makePanel('DOOR_LEFT', 296, 716, 18, [-150, 460, 289]),
        makePanel('DOOR_RIGHT', 296, 716, 18, [150, 460, 289]),
      ]
    );

    const [left, right] = resolveHandlePlacements(cab);
    expect(left.localPosition[0]).toBe(-right.localPosition[0]);
  });
});

describe('door placement - vertical clamping', () => {
  it('clamps the shipped DEFAULT_DOOR_PANEL height of 1000 onto a 716mm door', () => {
    const cab = makeCabinet(
      {
        doorConfig: makeDoorConfig([
          {
            ...DOOR_DEFAULTS,
            openingDirection: 'left',
            handleConfig: { type: 'pull', height: 1000, offset: 40 },
          },
        ]),
      },
      [makeWorkedExampleDoorPanel()]
    );

    const [p] = resolveHandlePlacements(cab);
    // halfSpan = 716/2 - 192/2 - 20 = 242
    expect(p.localPosition[1]).toBe(242);
    expect(p.clamped).toBe(true);

    // The grip must land fully on the panel.
    const half = p.spec.overallLength / 2;
    expect(Math.abs(p.localPosition[1]) + half).toBeLessThanOrEqual(716 / 2);
  });

  it('passes a legal height straight through unclamped', () => {
    const cab = makeCabinet(
      {
        doorConfig: makeDoorConfig([
          {
            ...DOOR_DEFAULTS,
            openingDirection: 'left',
            handleConfig: { type: 'pull', height: 500, offset: 40 },
          },
        ]),
      },
      [makeWorkedExampleDoorPanel()]
    );

    const [p] = resolveHandlePlacements(cab);
    expect(p.localPosition[1]).toBe(500 - 716 / 2);
    expect(p.clamped).toBe(false);
  });
});

describe('door placement - worked example', () => {
  it('reproduces the 600x720x560 base cabinet case end to end', () => {
    const cab = makeCabinet(
      {
        doorConfig: makeDoorConfig([
          {
            ...DOOR_DEFAULTS,
            openingDirection: 'left',
            handleConfig: { type: 'pull', height: 1000, offset: 40 },
          },
        ]),
      },
      [makeWorkedExampleDoorPanel()]
    );

    const [p] = resolveHandlePlacements(cab);
    expect(p.localPosition).toEqual([258, 242, 9]);
    expect(p.localRotation).toEqual([0, 0, 0]);

    // Resolved into cabinet-local space by nesting under the panel group.
    const resolved = [
      p.panelPosition[0] + p.localPosition[0],
      p.panelPosition[1] + p.localPosition[1],
      p.panelPosition[2] + p.localPosition[2],
    ];
    expect(resolved).toEqual([258, 702, 298]);
  });
});

describe('drawer front placement', () => {
  const row = (position: 'center' | 'top' | 'bottom') => ({
    frontHeight: 140,
    gapAbove: 3,
    slideSystemId: 'metropush',
    handleConfig: { type: 'pull' as const, position },
  });

  const drawerCab = (position: 'center' | 'top' | 'bottom') =>
    makeCabinet({ drawerConfig: makeDrawerConfig([row(position)]) }, [
      makePanel('DRAWER_FRONT', 564, 140, 18, [0, 300, 271]),
    ]);

  it('centres horizontally and lays the bar on +X', () => {
    const [p] = resolveHandlePlacements(drawerCab('center'));
    expect(p.localPosition).toEqual([0, 0, 9]);
    expect(p.localRotation).toEqual([0, 0, Math.PI / 2]);
  });

  it('moves the handle up for top and down for bottom, staying on the front', () => {
    const [top] = resolveHandlePlacements(drawerCab('top'));
    const [bottom] = resolveHandlePlacements(drawerCab('bottom'));

    expect(top.localPosition[1]).toBeGreaterThan(0);
    expect(bottom.localPosition[1]).toBeLessThan(0);

    const limit = 140 / 2 - top.spec.gripSize / 2 - 15;
    expect(Math.abs(top.localPosition[1])).toBeLessThanOrEqual(limit);
    expect(Math.abs(bottom.localPosition[1])).toBeLessThanOrEqual(limit);
  });

  it('leaves a knob unrotated, since rotation is meaningless for it', () => {
    const cab = makeCabinet(
      {
        drawerConfig: makeDrawerConfig([
          {
            frontHeight: 140,
            gapAbove: 3,
            slideSystemId: 'metropush',
            handleConfig: { type: 'knob', position: 'center' },
          },
        ]),
      },
      [makePanel('DRAWER_FRONT', 564, 140, 18, [0, 300, 271])]
    );

    const [p] = resolveHandlePlacements(cab);
    expect(p.spec.form).toBe('KNOB');
    expect(p.localRotation).toEqual([0, 0, 0]);
  });
});

describe('off is total', () => {
  it("emits nothing when every handleConfig is 'none'", () => {
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

    expect(resolveHandlePlacements(cab)).toEqual([]);
  });

  it("emits nothing for a push_latch door", () => {
    const cab = makeCabinet(
      {
        doorConfig: makeDoorConfig([
          {
            ...DOOR_DEFAULTS,
            openingDirection: 'left',
            handleConfig: { type: 'push_latch', height: 400 },
          },
        ]),
      },
      [makePanel('DOOR', 596, 716, 18, [0, 460, 289])]
    );

    expect(resolveHandlePlacements(cab)).toEqual([]);
  });

  it('emits nothing when the cabinet has no door or drawer config at all', () => {
    expect(resolveHandlePlacements(makeCabinet({}, []))).toEqual([]);
  });
});
