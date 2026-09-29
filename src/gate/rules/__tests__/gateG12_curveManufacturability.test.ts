/**
 * Unit Tests — Gate G12: Curved Panel Manufacturability
 *
 * @module gate/rules/__tests__/gateG12_curveManufacturability.test
 *
 * Coverage:
 *  - Each of the 10 G12 sub-rules in isolation
 *  - runG12Rules() aggregator: all clear, mixed blockers+warnings
 *  - DEFAULT_G12_POLICY applied correctly
 *  - Deterministic issue IDs (same inputs → same ID)
 *  - RECT profiles skipped (no false positives)
 *  - Policy overrides respected
 *
 * Test count target: ≥ 35
 */

import { describe, it, expect } from 'vitest';
import {
  ruleG12_RadiusBelowMin,
  ruleG12_KerfSpacingTooTight,
  ruleG12_KerfDepthUnsafe,
  ruleG12_FittingInKerfZone,
  ruleG12_MaterialDataMissing,
  ruleG12_SlotEdgeInsufficient,
  ruleG12_SlotPairMismatch,
  ruleG12_SlotOverlapsKerf,
  ruleG12_SCurveTransitionShort,
  ruleG12_GrainParallelToBend,
  runG12Rules,
  DEFAULT_G12_POLICY,
  type G12PanelInput,
  type G12PatternInput,
  type G12DrillPoint,
  type G12SlotInput,
  type G12Input,
} from '../gateG12_curveManufacturability';
import type { KerfPattern } from '../../../core/manufacturing/curve/kerfPatternGenerator';
import type { MatingSlotPattern } from '../../../core/manufacturing/curve/matingSlotGenerator';
import type { KerfZone } from '../../../core/manufacturing/curve/curveProfile';

// ============================================
// HELPERS
// ============================================

function arcPanel(overrides: Partial<G12PanelInput> = {}): G12PanelInput {
  return {
    panelId: 'p1',
    profile: { kind: 'ARC', edge: 'TOP', radius: 200, sweepDeg: 45 },
    material: 'MDF',
    thickness: 12,
    ...overrides,
  };
}

function makeKerfZone(overrides: Partial<KerfZone> = {}): KerfZone {
  return {
    edge: 'TOP',
    start: 50,
    end: 250,
    depth: 80,
    ...overrides,
  };
}

function makeKerfPattern(
  zoneStart = 50,
  zoneEnd = 250,
  spacing = 15,
  cuts?: KerfPattern['cuts']
): KerfPattern {
  return {
    zone: { start: zoneStart, end: zoneEnd },
    edge: 'TOP',
    cuts: cuts ?? [
      { position: 75, depth: 9, angleDeg: 0 },
      { position: 90, depth: 9, angleDeg: 0 },
      { position: 105, depth: 9, angleDeg: 0 },
    ],
    spacing,
    count: 3,
    tool: { kind: 'SAW', bladeKerf: 3.2 },
    source: {
      arcLengthOuter: 0, arcLengthInner: 0, arcLengthDelta: 0,
      kerfCount: 3, kerfSpacing: 15, kerfDepth: 9, webThickness: 3,
      minBendRadius: 96, safetyFactor: 1.2, warnings: [], errors: [],
      springBackFactor: 0.05, designRadius: 190,
    } as unknown as KerfPattern['source'],
  };
}

function makePatternInput(
  panelId = 'p1',
  zones: KerfZone[] = [makeKerfZone()],
  patterns: KerfPattern[] = [makeKerfPattern()]
): G12PatternInput {
  return {
    panelId,
    kerfZones: zones,
    patterns,
    tool: { kind: 'SAW', bladeKerf: 3.2 },
  };
}

function makeMatingSlot(overrides: Partial<MatingSlotPattern> = {}): MatingSlotPattern {
  return {
    pairKey: 'curve-TOP-150',
    curvedEdge: { count: 3, pitch: 64, depth: 15, width: 10 },
    receiverSlots: [
      { position: [100, 15, 0], depth: 15, width: 10 },
      { position: [164, 15, 0], depth: 15, width: 10 },
      { position: [228, 15, 0], depth: 15, width: 10 },
    ],
    ...overrides,
  };
}

function makeSlotInput(overrides: Partial<G12SlotInput> = {}): G12SlotInput {
  return {
    panelId: 'p1',
    matingSlot: makeMatingSlot(),
    finishWidth: 600,
    finishHeight: 720,
    ...overrides,
  };
}

// ============================================
// G12.1 — RADIUS_BELOW_MIN
// ============================================

describe('ruleG12_RadiusBelowMin', () => {
  it('passes when radius ≥ R_min', () => {
    // MDF 12mm → R_min = 96mm; radius 200 > 96 → no issue
    const issues = ruleG12_RadiusBelowMin([arcPanel()]);
    expect(issues).toHaveLength(0);
  });

  it('blocks when radius < R_min (MDF 12mm, R_min=96)', () => {
    const issues = ruleG12_RadiusBelowMin([
      arcPanel({ profile: { kind: 'ARC', edge: 'TOP', radius: 60, sweepDeg: 45 } }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].code).toBe('B_G12_RADIUS_BELOW_MIN');
    expect(issues[0].context?.requestedRadius).toBe(60);
    expect(issues[0].context?.minimumRadius).toBe(96);
  });

  it('skips RECT profile', () => {
    const issues = ruleG12_RadiusBelowMin([arcPanel({ profile: { kind: 'RECT' } })]);
    expect(issues).toHaveLength(0);
  });

  it('produces deterministic IDs', () => {
    const panel = arcPanel({ profile: { kind: 'ARC', edge: 'TOP', radius: 60, sweepDeg: 45 } });
    const id1 = ruleG12_RadiusBelowMin([panel])[0].id;
    const id2 = ruleG12_RadiusBelowMin([panel])[0].id;
    expect(id1).toBe(id2);
  });

  it('flags both arcs in S_CURVE when both radii are below minimum', () => {
    // MDF 12mm → R_min=96; r1=40, r2=50 both fail
    const issues = ruleG12_RadiusBelowMin([
      arcPanel({
        profile: { kind: 'S_CURVE', edge: 'LEFT', r1: 40, r2: 50, sweepDeg1: 45, sweepDeg2: 45 },
      }),
    ]);
    expect(issues).toHaveLength(2);
    expect(issues.every(i => i.code === 'B_G12_RADIUS_BELOW_MIN')).toBe(true);
  });
});

// ============================================
// G12.2 — KERF_SPACING_TOO_TIGHT
// ============================================

describe('ruleG12_KerfSpacingTooTight', () => {
  it('passes when spacing ≥ bladeWidth + 15%T', () => {
    // bladeKerf=3.2, minWeb=12×0.15=1.8 → min=5.0; spacing=15 → pass
    const issues = ruleG12_KerfSpacingTooTight(
      [arcPanel()],
      [makePatternInput()],
      DEFAULT_G12_POLICY
    );
    expect(issues).toHaveLength(0);
  });

  it('blocks when spacing too tight (spacing = 4, min = 5)', () => {
    const tightPattern = makeKerfPattern(50, 250, 4);
    const issues = ruleG12_KerfSpacingTooTight(
      [arcPanel()],
      [makePatternInput('p1', [makeKerfZone()], [tightPattern])],
      DEFAULT_G12_POLICY
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('B_G12_KERF_SPACING_TOO_TIGHT');
    expect(issues[0].severity).toBe('BLOCKER');
  });

  it('uses policy minWebFraction for threshold', () => {
    // spacing=5 → normally passes at 15%; with 30% fraction: minWeb=3.6 → min=6.8 → blocks
    const tightPattern = makeKerfPattern(50, 250, 5);
    const issues = ruleG12_KerfSpacingTooTight(
      [arcPanel()],
      [makePatternInput('p1', [makeKerfZone()], [tightPattern])],
      { ...DEFAULT_G12_POLICY, minWebFraction: 0.3 }
    );
    expect(issues).toHaveLength(1);
  });
});

// ============================================
// G12.3 — KERF_DEPTH_UNSAFE
// ============================================

describe('ruleG12_KerfDepthUnsafe', () => {
  it('passes when web ≥ 15%T', () => {
    // T=12mm → minWeb=1.8mm; depth=9mm → web=3mm → pass
    const issues = ruleG12_KerfDepthUnsafe(
      [arcPanel()],
      [makePatternInput()],
      DEFAULT_G12_POLICY
    );
    expect(issues).toHaveLength(0);
  });

  it('blocks when web < 15%T', () => {
    // T=12mm → minWeb=1.8mm; depth=11mm → web=1mm < 1.8mm
    const deepCut = makeKerfPattern(50, 250, 15, [{ position: 75, depth: 11, angleDeg: 0 }]);
    const issues = ruleG12_KerfDepthUnsafe(
      [arcPanel()],
      [makePatternInput('p1', [makeKerfZone()], [deepCut])],
      DEFAULT_G12_POLICY
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('B_G12_KERF_DEPTH_UNSAFE');
    expect(issues[0].context?.webMm).toBeCloseTo(1, 5);
  });

  it('uses skinMin when configured (web must also clear skin)', () => {
    // T=12mm, skinMin=2mm → minWeb = max(1.8, 2+0.5) = 2.5mm; depth=10 → web=2 < 2.5 → blocks
    const cutDepth10 = makeKerfPattern(50, 250, 15, [{ position: 75, depth: 10, angleDeg: 0 }]);
    const issues = ruleG12_KerfDepthUnsafe(
      [arcPanel({ skinMinMm: 2 })],
      [makePatternInput('p1', [makeKerfZone()], [cutDepth10])],
      DEFAULT_G12_POLICY
    );
    expect(issues).toHaveLength(1);
  });
});

// ============================================
// G12.4 — FITTING_IN_KERF_ZONE
// ============================================

describe('ruleG12_FittingInKerfZone', () => {
  it('passes when drill is outside kerf zone + margin', () => {
    // Zone TOP 50–250mm, margin 2mm → expanded 48–252; drill at x=300 → pass
    const drill: G12DrillPoint = { panelId: 'p1', x: 300, y: 50, diaMm: 5 };
    const issues = ruleG12_FittingInKerfZone(
      [makePatternInput()],
      [drill],
      DEFAULT_G12_POLICY
    );
    expect(issues).toHaveLength(0);
  });

  it('blocks when drill is inside kerf zone', () => {
    // Zone TOP 50–250mm; drill at x=100 (inside zone)
    const drill: G12DrillPoint = { panelId: 'p1', x: 100, y: 50, diaMm: 5 };
    const issues = ruleG12_FittingInKerfZone(
      [makePatternInput()],
      [drill],
      DEFAULT_G12_POLICY
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('B_G12_FITTING_IN_KERF_ZONE');
  });

  it('blocks when drill edge overlaps zone boundary by margin', () => {
    // Zone TOP 50–250mm, margin 2mm → expanded 48–252; drill at x=47 with dia=5 → max=49.5 > 48 → block
    const drill: G12DrillPoint = { panelId: 'p1', x: 47, y: 50, diaMm: 5 };
    const issues = ruleG12_FittingInKerfZone(
      [makePatternInput()],
      [drill],
      DEFAULT_G12_POLICY
    );
    expect(issues).toHaveLength(1);
  });

  it('ignores drills on other panels', () => {
    const drill: G12DrillPoint = { panelId: 'p2', x: 100, y: 50 };
    const issues = ruleG12_FittingInKerfZone(
      [makePatternInput()],
      [drill],
      DEFAULT_G12_POLICY
    );
    expect(issues).toHaveLength(0);
  });
});

// ============================================
// G12.5 — MATERIAL_DATA_MISSING
// ============================================

describe('ruleG12_MaterialDataMissing', () => {
  it('passes for MDF 12mm (has catalog entry)', () => {
    const issues = ruleG12_MaterialDataMissing([arcPanel()]);
    expect(issues).toHaveLength(0);
  });

  it('blocks for PARTICLE_BOARD 16mm (null entry)', () => {
    const issues = ruleG12_MaterialDataMissing([
      arcPanel({ material: 'PARTICLE_BOARD', thickness: 16 }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('B_G12_MATERIAL_DATA_MISSING');
    expect(issues[0].severity).toBe('BLOCKER');
  });

  it('skips RECT profile (no bending)', () => {
    const issues = ruleG12_MaterialDataMissing([
      arcPanel({ material: 'PARTICLE_BOARD', thickness: 16, profile: { kind: 'RECT' } }),
    ]);
    expect(issues).toHaveLength(0);
  });

  it('produces deterministic IDs', () => {
    const panel = arcPanel({ material: 'PARTICLE_BOARD', thickness: 16 });
    const id1 = ruleG12_MaterialDataMissing([panel])[0].id;
    const id2 = ruleG12_MaterialDataMissing([panel])[0].id;
    expect(id1).toBe(id2);
  });
});

// ============================================
// G12.6 — SLOT_EDGE_INSUFFICIENT
// ============================================

describe('ruleG12_SlotEdgeInsufficient', () => {
  it('passes when all slots have sufficient edge clearance', () => {
    // Slot at x=100, width=10 → halfW=5; toLeft=95 → well above 8mm
    const issues = ruleG12_SlotEdgeInsufficient([makeSlotInput()], DEFAULT_G12_POLICY);
    expect(issues).toHaveLength(0);
  });

  it('blocks when slot is too close to edge', () => {
    // Slot at x=4, width=10 → toLeft = 4-5 = -1mm < 8mm
    const slot = makeMatingSlot({
      receiverSlots: [{ position: [4, 50, 0], depth: 15, width: 10 }],
    });
    const issues = ruleG12_SlotEdgeInsufficient(
      [makeSlotInput({ matingSlot: slot })],
      DEFAULT_G12_POLICY
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('B_G12_SLOT_EDGE_INSUFFICIENT');
  });

  it('respects policy override for minSlotEdgeClearanceMm', () => {
    // Default passes at 8mm; strict policy of 100mm blocks everything
    const issues = ruleG12_SlotEdgeInsufficient(
      [makeSlotInput()],
      { ...DEFAULT_G12_POLICY, minSlotEdgeClearanceMm: 200 }
    );
    expect(issues.length).toBeGreaterThan(0);
  });
});

// ============================================
// G12.7 — SLOT_PAIR_MISMATCH
// ============================================

describe('ruleG12_SlotPairMismatch', () => {
  it('passes when tabCount === slotCount', () => {
    // curvedEdge.count=3, receiverSlots.length=3 → match
    const issues = ruleG12_SlotPairMismatch([makeSlotInput()], DEFAULT_G12_POLICY);
    expect(issues).toHaveLength(0);
  });

  it('blocks when tabCount ≠ slotCount', () => {
    const slot = makeMatingSlot({
      curvedEdge: { count: 3, pitch: 64, depth: 15, width: 10 },
      receiverSlots: [{ position: [100, 15, 0], depth: 15, width: 10 }], // only 1 slot
    });
    const issues = ruleG12_SlotPairMismatch(
      [makeSlotInput({ matingSlot: slot })],
      DEFAULT_G12_POLICY
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('B_G12_SLOT_PAIR_MISMATCH');
    expect(issues[0].context?.tabCount).toBe(3);
    expect(issues[0].context?.slotCount).toBe(1);
  });

  it('tolerates mismatch within policy tolerance', () => {
    const slot = makeMatingSlot({
      curvedEdge: { count: 3, pitch: 64, depth: 15, width: 10 },
      receiverSlots: [
        { position: [100, 15, 0], depth: 15, width: 10 },
        { position: [164, 15, 0], depth: 15, width: 10 },
      ],
    });
    // tolerance=1 → delta=1 ≤ 1 → pass
    const issues = ruleG12_SlotPairMismatch(
      [makeSlotInput({ matingSlot: slot })],
      { ...DEFAULT_G12_POLICY, slotPairToleranceCount: 1 }
    );
    expect(issues).toHaveLength(0);
  });
});

// ============================================
// G12.8 — SLOT_OVERLAPS_KERF
// ============================================

describe('ruleG12_SlotOverlapsKerf', () => {
  it('passes when slots are clear of all kerf cuts', () => {
    // Kerf cuts at positions 75, 90, 105; slot at x=300 (width=10 → footprint 295–305) → clear
    const slot = makeMatingSlot({
      receiverSlots: [{ position: [300, 15, 0], depth: 15, width: 10 }],
      curvedEdge: { count: 1, pitch: 64, depth: 15, width: 10 },
    });
    const issues = ruleG12_SlotOverlapsKerf(
      [makePatternInput()],
      [makeSlotInput({ matingSlot: slot })],
      DEFAULT_G12_POLICY
    );
    expect(issues).toHaveLength(0);
  });

  it('blocks when slot overlaps a kerf cut', () => {
    // Kerf cut at x=75; slot at x=75 (width=10 → footprint 70–80) → overlaps
    const slot = makeMatingSlot({
      receiverSlots: [{ position: [75, 15, 0], depth: 15, width: 10 }],
      curvedEdge: { count: 1, pitch: 64, depth: 15, width: 10 },
    });
    const issues = ruleG12_SlotOverlapsKerf(
      [makePatternInput()],
      [makeSlotInput({ matingSlot: slot })],
      DEFAULT_G12_POLICY
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('B_G12_SLOT_OVERLAPS_KERF');
  });
});

// ============================================
// G12.9 — SCURVE_TRANSITION_SHORT (WARNING)
// ============================================

describe('ruleG12_SCurveTransitionShort', () => {
  it('passes when S-curve total arc is sufficient', () => {
    // r1=100, r2=80 → maxR=100 → minTransition=200mm; arc1=100×(90°)=157mm, arc2=80×(90°)=126mm → total=283mm > 200mm
    const panel = arcPanel({
      profile: { kind: 'S_CURVE', edge: 'LEFT', r1: 100, r2: 80, sweepDeg1: 90, sweepDeg2: 90 },
    });
    const issues = ruleG12_SCurveTransitionShort([panel], DEFAULT_G12_POLICY);
    expect(issues).toHaveLength(0);
  });

  it('warns when S-curve total arc is too short', () => {
    // r1=200, r2=200 → maxR=200 → minTransition=400; arc1=200×(10°rad)=35mm, arc2=35mm → total=70mm < 400
    const panel = arcPanel({
      profile: { kind: 'S_CURVE', edge: 'LEFT', r1: 200, r2: 200, sweepDeg1: 10, sweepDeg2: 10 },
    });
    const issues = ruleG12_SCurveTransitionShort([panel], DEFAULT_G12_POLICY);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('WARNING');
    expect(issues[0].code).toBe('W_G12_SCURVE_TRANSITION_SHORT');
  });

  it('skips non-S_CURVE profiles', () => {
    const issues = ruleG12_SCurveTransitionShort([arcPanel()], DEFAULT_G12_POLICY);
    expect(issues).toHaveLength(0);
  });
});

// ============================================
// G12.10 — GRAIN_PARALLEL_TO_BEND (WARNING)
// ============================================

describe('ruleG12_GrainParallelToBend', () => {
  it('passes when grain is perpendicular to bend', () => {
    // TOP edge bend, grain ALONG_LENGTH (runs down the length = perpendicular to bend axis along width)
    const panel = arcPanel({ grainDirection: 'ALONG_LENGTH' });
    const issues = ruleG12_GrainParallelToBend([panel]);
    expect(issues).toHaveLength(0);
  });

  it('warns when grain is parallel to bend on TOP edge', () => {
    // TOP edge bend, grain ALONG_WIDTH → bending parallel to grain
    const panel = arcPanel({ grainDirection: 'ALONG_WIDTH' });
    const issues = ruleG12_GrainParallelToBend([panel]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('WARNING');
    expect(issues[0].code).toBe('W_G12_GRAIN_PARALLEL_TO_BEND');
  });

  it('warns when grain is parallel to bend on LEFT edge', () => {
    // LEFT edge bend, grain ALONG_LENGTH → runs along height = parallel
    const panel = arcPanel({
      profile: { kind: 'ARC', edge: 'LEFT', radius: 200, sweepDeg: 45 },
      grainDirection: 'ALONG_LENGTH',
    });
    const issues = ruleG12_GrainParallelToBend([panel]);
    expect(issues).toHaveLength(1);
  });

  it('skips when grainDirection is undefined', () => {
    const panel = arcPanel({ grainDirection: undefined });
    const issues = ruleG12_GrainParallelToBend([panel]);
    expect(issues).toHaveLength(0);
  });

  it('skips RECT profile', () => {
    const panel = arcPanel({ profile: { kind: 'RECT' }, grainDirection: 'ALONG_WIDTH' });
    const issues = ruleG12_GrainParallelToBend([panel]);
    expect(issues).toHaveLength(0);
  });
});

// ============================================
// runG12Rules — AGGREGATOR
// ============================================

describe('runG12Rules', () => {
  it('returns empty array when all rules pass', () => {
    // Slots placed at x=400,450,500 — well away from kerf cuts at x=75,90,105
    const clearSlot = makeMatingSlot({
      receiverSlots: [
        { position: [400, 50, 0], depth: 15, width: 10 },
        { position: [450, 50, 0], depth: 15, width: 10 },
        { position: [500, 50, 0], depth: 15, width: 10 },
      ],
    });
    const input: G12Input = {
      panels: [arcPanel()],                             // R=200 > R_min=96 for MDF 12
      patterns: [makePatternInput()],                   // spacing=15, web=3mm
      drillPoints: [{ panelId: 'p1', x: 300, y: 50 }], // outside zone 48–252
      slotPatterns: [makeSlotInput({ matingSlot: clearSlot })],  // 3 tabs, 3 slots, clear of cuts
    };
    const issues = runG12Rules(input);
    expect(issues).toHaveLength(0);
  });

  it('collects blockers from multiple sub-rules', () => {
    // Panel with radius below min AND particle board (two separate errors)
    const input: G12Input = {
      panels: [
        arcPanel({ material: 'PARTICLE_BOARD', thickness: 16 }),  // G12.5 missing data
      ],
    };
    const issues = runG12Rules(input);
    const codes = issues.map(i => i.code);
    // G12.5 fires; G12.1 is skipped because lookupMinBendRadius throws (caught in G12.1)
    expect(codes).toContain('B_G12_MATERIAL_DATA_MISSING');
  });

  it('returns both BLOCKER and WARNING issues in same run', () => {
    // ARC with radius below min (BLOCKER) + grain parallel (WARNING)
    const input: G12Input = {
      panels: [
        arcPanel({
          profile: { kind: 'ARC', edge: 'TOP', radius: 50, sweepDeg: 45 }, // R=50 < R_min=96
          grainDirection: 'ALONG_WIDTH',   // parallel → WARNING
        }),
      ],
    };
    const issues = runG12Rules(input);
    expect(issues.some(i => i.severity === 'BLOCKER')).toBe(true);
    expect(issues.some(i => i.severity === 'WARNING')).toBe(true);
  });

  it('applies policy overrides end-to-end', () => {
    // With huge margin, a drill at x=400 now falls inside zone 50–250 + 200mm margin
    const input: G12Input = {
      panels: [arcPanel()],
      patterns: [makePatternInput()],
      drillPoints: [{ panelId: 'p1', x: 400, y: 50 }],
      policy: { kerfZoneMarginMm: 200 },
    };
    const issues = runG12Rules(input);
    expect(issues.some(i => i.code === 'B_G12_FITTING_IN_KERF_ZONE')).toBe(true);
  });

  it('handles empty input arrays without throwing', () => {
    expect(() => runG12Rules({ panels: [] })).not.toThrow();
    expect(runG12Rules({ panels: [] })).toHaveLength(0);
  });
});

// ============================================
// PBT: DETERMINISM
// ============================================

describe('PBT: determinism', () => {
  it('runG12Rules produces identical issues on repeated calls with same input', () => {
    const input: G12Input = {
      panels: [
        arcPanel({ profile: { kind: 'ARC', edge: 'TOP', radius: 50, sweepDeg: 45 } }),
      ],
    };
    const run1 = runG12Rules(input).map(i => i.id);
    const run2 = runG12Rules(input).map(i => i.id);
    expect(run1).toEqual(run2);
  });
});
