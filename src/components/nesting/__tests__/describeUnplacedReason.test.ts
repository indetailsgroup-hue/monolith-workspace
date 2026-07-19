/**
 * The failure reason shown to the operator must be MEASURED, not inferred from
 * the grain flag.
 *
 * The old text branched purely on `grainDirection !== 'NONE'` and printed
 * "grain locks rotation — part cannot be turned to fit". For the headline case
 * — a 2440x640 worktop against a 1210x2430 usable area — that is false and
 * actively harmful: rotated it is 640x2440, which still does not fit, so
 * clearing the grain flag scraps grain consistency AND leaves the part
 * unplaceable. The remedy is to split the run, not to touch the grain.
 */

import { describe, it, expect } from 'vitest';
import { describeUnplacedReason } from '../NestingPanel';
import type { NestingPart, GrainDirection } from '../../../nesting/types';

// Usable area for core-pb-18 (1230 x 2450) at the default 10mm edge clearance.
const USABLE_W = 1210;
const USABLE_H = 2430;

function part(
  width: number,
  height: number,
  grainDirection: GrainDirection,
): NestingPart {
  return {
    id: 'P',
    sourcePartId: 'P',
    cabinetId: 'CAB1',
    width,
    height,
    materialId: 'core-pb-18',
    canRotate: grainDirection === 'NONE',
    grainDirection,
  };
}

describe('describeUnplacedReason', () => {
  it('blames SIZE, not grain, for a full-length worktop run', () => {
    // 2440 > 2430 unrotated AND rotated. Grain is irrelevant here.
    const reason = describeUnplacedReason(part(2440, 640, 'HORIZONTAL'), USABLE_W, USABLE_H);
    expect(reason).toMatch(/too large for the board in every orientation/);
    expect(reason).not.toMatch(/grain/i);
  });

  it('gives the same size answer when the same worktop has grain NONE', () => {
    const grained = describeUnplacedReason(part(2440, 640, 'VERTICAL'), USABLE_W, USABLE_H);
    const plain = describeUnplacedReason(part(2440, 640, 'NONE'), USABLE_W, USABLE_H);
    expect(grained).toBe(plain);
  });

  it('blames grain ONLY when rotation would actually have placed the part', () => {
    // 1400 wide > 1210 usable width, but 1400 <= 2430 usable height: rotating
    // it would fit. Grain is genuinely what blocks this one.
    const reason = describeUnplacedReason(part(1400, 600, 'VERTICAL'), USABLE_W, USABLE_H);
    expect(reason).toMatch(/grain locks rotation/);
    expect(reason).toMatch(/would fit turned 90/);
  });

  it('does not blame grain for a rotation-only fit whose grain is NONE', () => {
    const reason = describeUnplacedReason(part(1400, 600, 'NONE'), USABLE_W, USABLE_H);
    expect(reason).not.toMatch(/grain/i);
    expect(reason).toMatch(/rotation was not permitted/);
  });

  it('reports a packing shortfall when the part fits an empty board as-is', () => {
    const reason = describeUnplacedReason(part(400, 700, 'VERTICAL'), USABLE_W, USABLE_H);
    expect(reason).toMatch(/packing shortfall/);
  });
});
