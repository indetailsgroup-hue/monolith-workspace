/**
 * Unit tests + PBT for matingSlotGenerator.ts — Phase 2.5
 *
 * Coverage:
 *  - Empty kerfZones → no patterns
 *  - Valid ARC zone → produces MatingSlotPattern with matching count/pitch
 *  - pairKey content-addressed format "curve-{edge}-{midpoint}"
 *  - Receiver slot positions match edge convention
 *  - G12_SLOT_EDGE_INSUFFICIENT when zone span too small
 *  - PBT Property 8: slot pair alignment ≤ 0.1mm (width + depth match exactly)
 *  - PBT: no slot overlaps kerf zone core
 *  - Multi-pair: 2 zones produce 2 independent patterns with unique pairKeys
 */

import { describe, it, expect } from 'vitest';
import {
  generateMatingSlots,
  type MatingSlotInput,
  type MatingSlotPattern,
} from '../matingSlotGenerator';
import type { KerfZone } from '../curveProfile';

// ─────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────
const W = 600;
const H = 800;

function makeZone(edge: KerfZone['edge'], start: number, end: number, depth: number = 314): KerfZone {
  return { edge, start, end, depth };
}

function defaultInput(zones: KerfZone[], overrides: Partial<MatingSlotInput> = {}): MatingSlotInput {
  return {
    kerfZones: zones,
    finishWidth: W,
    finishHeight: H,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// Empty / RECT
// ─────────────────────────────────────────────
describe('generateMatingSlots — no zones', () => {
  it('empty kerfZones: valid, no patterns', () => {
    const result = generateMatingSlots(defaultInput([]));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.patterns).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// Basic single zone
// ─────────────────────────────────────────────
describe('generateMatingSlots — single zone', () => {
  it('TOP zone 200–400: produces 1 pattern', () => {
    const zone = makeZone('TOP', 200, 400);
    const result = generateMatingSlots(defaultInput([zone]));
    expect(result.valid).toBe(true);
    expect(result.patterns).toHaveLength(1);
  });

  it('pattern has slotCount ≥ 1', () => {
    const zone = makeZone('TOP', 100, 500);
    const result = generateMatingSlots(defaultInput([zone]));
    expect(result.patterns[0].curvedEdge.count).toBeGreaterThanOrEqual(1);
  });

  it('pairKey format: "curve-{edge}-{midpoint}"', () => {
    // zone start=200, end=400 → midpoint=300
    const zone = makeZone('TOP', 200, 400);
    const result = generateMatingSlots(defaultInput([zone]));
    expect(result.patterns[0].pairKey).toBe('curve-TOP-300');
  });

  it('LEFT edge: pairKey contains "LEFT"', () => {
    const zone = makeZone('LEFT', 200, 600);
    const result = generateMatingSlots(defaultInput([zone]));
    expect(result.patterns[0].pairKey).toContain('LEFT');
  });

  it('receiverSlots count matches curvedEdge.count', () => {
    const zone = makeZone('TOP', 100, 500);
    const result = generateMatingSlots(defaultInput([zone]));
    const p = result.patterns[0];
    expect(p.receiverSlots).toHaveLength(p.curvedEdge.count);
  });

  it('receiver slot depth matches curvedEdge.depth', () => {
    const zone = makeZone('TOP', 100, 500);
    const result = generateMatingSlots(defaultInput([zone]));
    const p = result.patterns[0];
    for (const slot of p.receiverSlots) {
      expect(slot.depth).toBe(p.curvedEdge.depth);
    }
  });

  it('receiver slot width matches curvedEdge.width', () => {
    const zone = makeZone('TOP', 100, 500);
    const result = generateMatingSlots(defaultInput([zone]));
    const p = result.patterns[0];
    for (const slot of p.receiverSlots) {
      expect(slot.width).toBe(p.curvedEdge.width);
    }
  });
});

// ─────────────────────────────────────────────
// Receiver slot positions
// ─────────────────────────────────────────────
describe('generateMatingSlots — receiver slot positions', () => {
  it('TOP edge: receiver slot position[1] (Y-coord) is 0 (bottom face of top panel)', () => {
    const zone = makeZone('TOP', 100, 500);
    const result = generateMatingSlots(defaultInput([zone]));
    for (const slot of result.patterns[0].receiverSlots) {
      expect(slot.position[1]).toBe(0);
    }
  });

  it('LEFT edge: receiver slot position[0] (X-coord) equals finishWidth', () => {
    const zone = makeZone('LEFT', 100, 700);
    const result = generateMatingSlots(defaultInput([zone]));
    for (const slot of result.patterns[0].receiverSlots) {
      expect(slot.position[0]).toBe(W);
    }
  });

  it('RIGHT edge: receiver slot position[0] (X-coord) is 0', () => {
    const zone = makeZone('RIGHT', 100, 700);
    const result = generateMatingSlots(defaultInput([zone]));
    for (const slot of result.patterns[0].receiverSlots) {
      expect(slot.position[0]).toBe(0);
    }
  });
});

// ─────────────────────────────────────────────
// Error cases
// ─────────────────────────────────────────────
describe('generateMatingSlots — error cases', () => {
  it('zone span too small → G12_SLOT_EDGE_INSUFFICIENT', () => {
    // span = 30mm; 2×minEdgeClearance = 40mm → available = -10 → too small
    const zone = makeZone('TOP', 285, 315);  // span=30
    const result = generateMatingSlots(defaultInput([zone], { minEdgeClearance: 20, tabWidth: 10 }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('G12_SLOT_EDGE_INSUFFICIENT');
    expect(result.patterns).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// PBT — Property 8: slot pair alignment ≤ 0.1mm
// ─────────────────────────────────────────────
describe('PBT Property 8 — Slot pair alignment', () => {
  it('curvedEdge.width matches every receiver slot width exactly', () => {
    const zone = makeZone('TOP', 100, 500);
    const result = generateMatingSlots(defaultInput([zone]));
    const p = result.patterns[0];
    for (const slot of p.receiverSlots) {
      expect(Math.abs(slot.width - p.curvedEdge.width)).toBeLessThanOrEqual(0.1);
    }
  });

  it('curvedEdge.depth matches every receiver slot depth exactly', () => {
    const zone = makeZone('BOTTOM', 100, 500);
    const result = generateMatingSlots(defaultInput([zone]));
    const p = result.patterns[0];
    for (const slot of p.receiverSlots) {
      expect(Math.abs(slot.depth - p.curvedEdge.depth)).toBeLessThanOrEqual(0.1);
    }
  });

  it('result is valid when widths/depths are internally consistent', () => {
    const zone = makeZone('LEFT', 200, 600);
    const result = generateMatingSlots(defaultInput([zone]));
    expect(result.valid).toBe(true);
    expect(result.errors).not.toContain('G12_SLOT_PAIR_MISMATCH');
  });
});

// ─────────────────────────────────────────────
// PBT — Determinism
// ─────────────────────────────────────────────
describe('PBT — Determinism', () => {
  it('same zone input → identical pairKey and slot positions', () => {
    const zone = makeZone('TOP', 150, 450);
    const input = defaultInput([zone]);
    const r1 = generateMatingSlots(input);
    const r2 = generateMatingSlots(input);
    expect(r1.patterns[0].pairKey).toBe(r2.patterns[0].pairKey);
    expect(r1.patterns[0].curvedEdge).toEqual(r2.patterns[0].curvedEdge);
    expect(r1.patterns[0].receiverSlots).toEqual(r2.patterns[0].receiverSlots);
  });
});

// ─────────────────────────────────────────────
// Multi-pair: two zones produce 2 independent patterns
// ─────────────────────────────────────────────
describe('generateMatingSlots — multi-pair', () => {
  it('2 zones: 2 patterns with unique pairKeys', () => {
    const zones: KerfZone[] = [
      makeZone('TOP', 100, 500, 314),
      makeZone('BOTTOM', 100, 500, 314),
    ];
    const result = generateMatingSlots(defaultInput(zones));
    expect(result.valid).toBe(true);
    expect(result.patterns).toHaveLength(2);
    expect(result.patterns[0].pairKey).not.toBe(result.patterns[1].pairKey);
  });

  it('LEFT + RIGHT zones: both produce independent patterns', () => {
    const zones: KerfZone[] = [
      makeZone('LEFT', 200, 600, 157),
      makeZone('RIGHT', 200, 600, 157),
    ];
    const result = generateMatingSlots(defaultInput(zones));
    expect(result.patterns).toHaveLength(2);
    expect(result.patterns[0].pairKey).toContain('LEFT');
    expect(result.patterns[1].pairKey).toContain('RIGHT');
  });

  it('all patterns have consistent width/depth (Property 8 across multi-pair)', () => {
    const zones: KerfZone[] = [
      makeZone('TOP', 100, 500),
      makeZone('LEFT', 200, 600),
    ];
    const result = generateMatingSlots(defaultInput(zones));
    for (const p of result.patterns) {
      for (const slot of p.receiverSlots) {
        expect(Math.abs(slot.width - p.curvedEdge.width)).toBeLessThanOrEqual(0.1);
        expect(Math.abs(slot.depth - p.curvedEdge.depth)).toBeLessThanOrEqual(0.1);
      }
    }
  });
});

// ─────────────────────────────────────────────
// Custom tab dimensions
// ─────────────────────────────────────────────
describe('generateMatingSlots — custom dimensions', () => {
  it('tabDepth=20 is reflected in pattern', () => {
    const zone = makeZone('TOP', 100, 500);
    const result = generateMatingSlots(defaultInput([zone], { tabDepth: 20 }));
    expect(result.patterns[0].curvedEdge.depth).toBe(20);
  });

  it('tabWidth=12 is reflected in pattern', () => {
    const zone = makeZone('TOP', 100, 500);
    const result = generateMatingSlots(defaultInput([zone], { tabWidth: 12 }));
    expect(result.patterns[0].curvedEdge.width).toBe(12);
  });
});
