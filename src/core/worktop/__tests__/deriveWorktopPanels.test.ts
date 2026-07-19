/**
 * deriveWorktopPanels — slab extents, blank splitting, corner butt, host-local
 * transform, edge assignment, deterministic ids.
 */

import { describe, it, expect } from 'vitest';
import { deriveWorktopPanels } from '../deriveWorktopPanels';
import { DEFAULT_WORKTOP_CONFIG, ISLAND_WORKTOP_CONFIG } from '../types';
import { makePlacements, STRAIGHT_RUN_OF_THREE, type FixtureSpec } from './testFixtures';

const HALF_PI = Math.PI / 2;

/**
 * Standard L: leg A runs along +X facing +Z (wall at z = -280); leg B runs
 * along +Z facing -X (wall at x = +1500). They meet at the corner.
 */
const L_CORNER: FixtureSpec[] = [
  ...STRAIGHT_RUN_OF_THREE,
  { id: 'L1', pos: [1220, 0, 580], yaw: -HALF_PI },
  { id: 'L2', pos: [1220, 0, 1180], yaw: -HALF_PI },
];

describe('deriveWorktopPanels — the design worked example', () => {
  const result = deriveWorktopPanels(makePlacements(STRAIGHT_RUN_OF_THREE), DEFAULT_WORKTOP_CONFIG);

  it('emits exactly one slab, hosted on the cabinet lowest along the run', () => {
    expect([...result.panelsByHostId.keys()]).toEqual(['c1']);
    expect(result.panelsByHostId.get('c1')).toHaveLength(1);
  });

  it('sizes the slab 1800 long x 598 deep — measured from the DOOR face', () => {
    const p = result.panelsByHostId.get('c1')![0];
    expect(p.finishWidth).toBeCloseTo(1800, 6);
    // 560 carcass + 18 door proudness + 20 overhang = 598.
    //
    // 598 IS THE PRE-EXISTING GEOMETRY AND IT IS DELIBERATELY UNCHANGED. An
    // intermediate revision moved this to 603 by bumping the overhang 20 -> 25
    // while declaring the datum. That +5mm had no source, and it changed a cut
    // size, edge-tape metreage and quoted cost on every slab. Reverted: the
    // datum here was ALREADY 'FRONT', so declaring it costs no geometric change
    // at all, and the declaration was the whole fix.
    // Two revisions back this was 580 under the CARCASS datum, which projected
    // only 2mm past an 18mm door while calling itself a 20mm overhang — THAT is
    // the bug the datum work exists to fix, and it is still fixed.
    expect(p.finishHeight).toBeCloseTo(598, 6);
  });

  it('places the slab at host-local [600, 829.3, 19] with no rotation', () => {
    const p = result.panelsByHostId.get('c1')![0];
    // carcassTopY 820 + half of the 18.6mm real thickness.
    expect(p.position[0]).toBeCloseTo(600, 6);
    expect(p.position[1]).toBeCloseTo(829.3, 6);
    // Slab spans n -280..+318 (20mm past the 18mm door face), so its centre sits
    // 19mm forward of the host's.
    expect(p.position[2]).toBeCloseTo(19, 6);
    expect(p.rotation).toEqual([0, 0, 0]);
  });

  it('rests the slab bottom exactly on the carcass top face', () => {
    const p = result.panelsByHostId.get('c1')![0];
    const bottomY = p.position[1] - p.computed.realThickness / 2;
    expect(bottomY).toBeCloseTo(820, 6);
  });

  it('carries the WORKTOP role and non-zero manufacturing data', () => {
    const p = result.panelsByHostId.get('c1')![0];
    expect(p.role).toBe('WORKTOP');
    expect(p.computed.cost).toBeGreaterThan(0);
    expect(p.computed.co2).toBeGreaterThan(0);
    expect(p.computed.edgeLength).toBeGreaterThan(0);
    expect(p.computed.cutWidth).toBeGreaterThan(0);
    expect(p.computed.cutHeight).toBeGreaterThan(0);
  });

  it('maps to a flat slab through the Cabinet3D size-axis switch', () => {
    // Cabinet3D case 'WORKTOP' returns [finishWidth, realThickness, finishHeight].
    const p = result.panelsByHostId.get('c1')![0];
    const size = [p.finishWidth, p.computed.realThickness, p.finishHeight];
    expect(size[0]).toBeCloseTo(1800, 6);
    expect(size[1]).toBeCloseTo(18.6, 6);
    expect(size[2]).toBeCloseTo(598, 6);
    // The slab lies flat: thickness is the smallest axis.
    expect(size[1]).toBeLessThan(size[0]);
    expect(size[1]).toBeLessThan(size[2]);
  });
});

describe('deriveWorktopPanels — edge banding', () => {
  it('bands all four edges by default — including the back', () => {
    const r = deriveWorktopPanels(makePlacements(STRAIGHT_RUN_OF_THREE), DEFAULT_WORKTOP_CONFIG);
    const e = r.panelsByHostId.get('c1')![0].edges;
    expect(e.top).toBe(DEFAULT_WORKTOP_CONFIG.edgeMaterialId);     // front
    // The back edge is banded and quoted even on a wall run. It used to be
    // derived from `backOverhang > 0`, so in production it was NEVER banded and
    // every island shipped a raw, unquoted edge. Over-banding a wall run costs
    // a metre of honestly-quoted tape; under-banding an island is a defect.
    expect(e.bottom).toBe(DEFAULT_WORKTOP_CONFIG.edgeMaterialId);  // back
    expect(e.left).toBe(DEFAULT_WORKTOP_CONFIG.edgeMaterialId);    // low-u end
    expect(e.right).toBe(DEFAULT_WORKTOP_CONFIG.edgeMaterialId);   // high-u end
  });

  it('charges tape for the back edge, so the BOM cannot silently omit it', () => {
    const r = deriveWorktopPanels(makePlacements(STRAIGHT_RUN_OF_THREE), DEFAULT_WORKTOP_CONFIG);
    const p = r.panelsByHostId.get('c1')![0];
    // front 1800 + back 1800 + two 598 ends = 4.796 m.
    expect(p.computed.edgeLength).toBeCloseTo(4.796, 6);
  });

  it('the island config additionally OVERHANGS at the back — geometry, not banding', () => {
    const r = deriveWorktopPanels(makePlacements(STRAIGHT_RUN_OF_THREE), ISLAND_WORKTOP_CONFIG);
    const p = r.panelsByHostId.get('c1')![0];
    expect(p.edges.bottom).toBe(ISLAND_WORKTOP_CONFIG.edgeMaterialId);
    // 598 as before, plus a 20mm back overhang. That back figure is a GEOMETRIC
    // MIRROR of the front, and it is deliberately NOT knee space — a 20mm
    // projection is a drip edge. See SEATED_ISLAND_WORKTOP_CONFIG and
    // seatingOverhang.test.ts for the seated case, which projects 380mm.
    expect(p.finishHeight).toBeCloseTo(618, 6);
    // ...and a 20mm overhang at each end.
    expect(p.finishWidth).toBeCloseTo(1840, 6);
  });

  it('leaves the butt-joint end untaped — that face is hidden inside the joint', () => {
    const r = deriveWorktopPanels(makePlacements(L_CORNER), DEFAULT_WORKTOP_CONFIG);
    const butting = r.panelsByHostId.get('L1')![0];
    expect(butting.edges.left).toBeNull();                          // trimmed corner end
    expect(butting.edges.right).toBe(DEFAULT_WORKTOP_CONFIG.edgeMaterialId);
    expect(butting.edges.top).toBe(DEFAULT_WORKTOP_CONFIG.edgeMaterialId);
  });
});

describe('deriveWorktopPanels — L corner butt joint', () => {
  const result = deriveWorktopPanels(makePlacements(L_CORNER), DEFAULT_WORKTOP_CONFIG);

  it('emits one slab per leg, hosted on two different cabinets', () => {
    expect([...result.panelsByHostId.keys()].sort()).toEqual(['L1', 'c1']);
  });

  it('leaves the longer leg full length and shortens only the butting leg', () => {
    const through = result.panelsByHostId.get('c1')![0];
    const butting = result.panelsByHostId.get('L1')![0];
    // Leg A: u-extent [-300, 1500] -> 1800, untouched.
    expect(through.finishWidth).toBeCloseTo(1800, 6);
    // Leg B: u-extent [280, 1480] -> 1200, trimmed back to leg A's slab face.
    // Under the FRONT datum leg A's slab reaches u = 318 (280 carcass front +
    // 18 door + 20 overhang), so leg B keeps 1480 - 318 = 1162.
    expect(butting.finishWidth).toBeCloseTo(1162, 6);
  });

  it('produces two slabs that do not overlap in plan', () => {
    const through = result.panelsByHostId.get('c1')![0];
    const butting = result.panelsByHostId.get('L1')![0];
    expect(through.finishWidth + butting.finishWidth).toBeGreaterThan(0);
    // Both slabs sit at the same height, so a plan overlap would be a real clash.
    expect(through.position[1]).toBeCloseTo(829.3, 6);
    expect(butting.position[1]).toBeCloseTo(829.3, 6);
  });

  it('records a CORNER_BUTT note rather than joining silently', () => {
    expect(result.notes.some(n => n.code === 'CORNER_BUTT')).toBe(true);
  });

  it('is order-independent: reversed input gives identical panel ids and sizes', () => {
    const a = deriveWorktopPanels(makePlacements(L_CORNER), DEFAULT_WORKTOP_CONFIG);
    const b = deriveWorktopPanels(makePlacements([...L_CORNER].reverse()), DEFAULT_WORKTOP_CONFIG);
    for (const hostId of a.panelsByHostId.keys()) {
      const pa = a.panelsByHostId.get(hostId)!;
      const pb = b.panelsByHostId.get(hostId)!;
      expect(pb.map(p => p.id)).toEqual(pa.map(p => p.id));
      expect(pb.map(p => p.finishWidth)).toEqual(pa.map(p => p.finishWidth));
      expect(pb.map(p => p.position)).toEqual(pa.map(p => p.position));
    }
  });
});

describe('deriveWorktopPanels — blank splitting', () => {
  // Six 600mm cabinets: u-extent [-300, 3300], L = 3600 > 2440.
  const SIX: FixtureSpec[] = [0, 1, 2, 3, 4, 5].map(i => ({
    id: `s${i}`,
    pos: [i * 600, 0, 0] as [number, number, number],
  }));
  const result = deriveWorktopPanels(makePlacements(SIX), DEFAULT_WORKTOP_CONFIG);
  const panels = result.panelsByHostId.get('s0')!;

  it('splits a 3600mm run into two slabs, each within one blank', () => {
    expect(panels).toHaveLength(2);
    for (const p of panels) {
      expect(p.finishWidth).toBeLessThanOrEqual(DEFAULT_WORKTOP_CONFIG.maxBlankLength);
    }
  });

  it('keeps the pieces adding up to the full run length', () => {
    const total = panels.reduce((s, p) => s + p.finishWidth, 0);
    expect(total).toBeCloseTo(3600, 6);
  });

  it('lands the joint on a carcass junction, never on an unsupported span', () => {
    // Junctions along u: 300, 900, 1500, 2100, 2700. The ideal midpoint is 1500.
    const first = panels[0];
    const jointU = -300 + first.finishWidth;
    expect(jointU).toBeCloseTo(1500, 3);
  });

  it('records a SPLIT_FOR_BLANK note', () => {
    expect(result.notes.some(n => n.code === 'SPLIT_FOR_BLANK')).toBe(true);
  });

  it('gives every piece its own honest non-zero cost', () => {
    for (const p of panels) {
      expect(p.computed.cost).toBeGreaterThan(0);
      expect(p.computed.co2).toBeGreaterThan(0);
    }
  });

  it('leaves the internal joint faces untaped and bands the two outer ends', () => {
    expect(panels[0].edges.left).toBe(DEFAULT_WORKTOP_CONFIG.edgeMaterialId);
    expect(panels[0].edges.right).toBeNull();
    expect(panels[1].edges.left).toBeNull();
    expect(panels[1].edges.right).toBe(DEFAULT_WORKTOP_CONFIG.edgeMaterialId);
  });
});

describe('deriveWorktopPanels — island and degenerate scenes', () => {
  it('gives a detached island its own slab hosted on its own cabinet', () => {
    const r = deriveWorktopPanels(
      makePlacements([
        ...STRAIGHT_RUN_OF_THREE,
        { id: 'isl1', pos: [600, 0, 2000] },
        { id: 'isl2', pos: [1200, 0, 2000] },
      ]),
      DEFAULT_WORKTOP_CONFIG
    );
    expect([...r.panelsByHostId.keys()].sort()).toEqual(['c1', 'isl1']);
    expect(r.panelsByHostId.get('isl1')![0].finishWidth).toBeCloseTo(1200, 6);
  });

  it('emits nothing for an empty scene', () => {
    const r = deriveWorktopPanels([], DEFAULT_WORKTOP_CONFIG);
    expect(r.panelsByHostId.size).toBe(0);
    expect(r.runs).toEqual([]);
  });

  it('gives stable panel ids across repeated derivation (React keys survive)', () => {
    const p1 = deriveWorktopPanels(makePlacements(STRAIGHT_RUN_OF_THREE), DEFAULT_WORKTOP_CONFIG);
    const p2 = deriveWorktopPanels(makePlacements(STRAIGHT_RUN_OF_THREE), DEFAULT_WORKTOP_CONFIG);
    expect(p2.panelsByHostId.get('c1')![0].id).toBe(p1.panelsByHostId.get('c1')![0].id);
    expect(p1.panelsByHostId.get('c1')![0].id).toMatch(/^worktop:/);
  });

  it('flags a mixed-depth run instead of silently mis-sizing the slab', () => {
    const r = deriveWorktopPanels(
      makePlacements([
        { id: 'd1', pos: [0, 0, 0], depth: 560 },
        { id: 'd2', pos: [600, 0, -20], depth: 600 },
      ]),
      DEFAULT_WORKTOP_CONFIG
    );
    expect(r.notes.some(n => n.code === 'MIXED_DEPTH')).toBe(true);
    // Slab covers the deepest member. Extreme back = d2's at -20 - 300 = -320;
    // extreme front = d2's at -20 + 300 = 280, plus 18 door + 20 overhang = 318.
    expect(r.panelsByHostId.get('d1')![0].finishHeight).toBeCloseTo(638, 6);
  });
});
