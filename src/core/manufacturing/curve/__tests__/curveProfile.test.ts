/**
 * Unit tests for curveProfile.ts — Phase 1.4
 *
 * Coverage:
 *  - RECT: passthrough (undefined, explicit)
 *  - ROUNDED_CORNER: valid, invalid (r≤0, overlap)
 *  - ARC: valid, invalid (r≤0, sweepDeg out-of-range, radius > half-perp)
 *  - S_CURVE: valid, invalid (r≤0, sweepDeg≤0), tangency warning
 *  - KerfZone start/end/depth invariants
 *  - Backward compat: undefined profile → RECT (no errors, no segments)
 */

import { describe, it, expect } from 'vitest';
import {
  validatePanelProfile,
  computeCurveProfile,
  type ArcSegment,
  type KerfZone,
  type CurveProfileResult,
} from '../curveProfile';
import type { PanelProfile } from '../../../types/Cabinet';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const W = 600;  // panel width  mm
const H = 800;  // panel height mm

function noBlockers(errors: string[]): boolean {
  const BLOCKERS = [
    'G12_RADIUS_BELOW_MIN',
    'G12_FITTING_IN_KERF_ZONE',
    'G12_KERF_SPACING_TOO_TIGHT',
    'G12_KERF_DEPTH_UNSAFE',
    'G12_MATERIAL_DATA_MISSING',
  ];
  return !errors.some(e => BLOCKERS.includes(e));
}

// ─────────────────────────────────────────────
// RECT
// ─────────────────────────────────────────────
describe('computeCurveProfile — RECT', () => {
  it('explicit RECT: valid, no segments, no kerf zones', () => {
    const result = computeCurveProfile({ kind: 'RECT' }, W, H);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.arcSegments).toHaveLength(0);
    expect(result.kerfZones).toHaveLength(0);
  });

  it('undefined profile (backward compat): treated as RECT', () => {
    const result = computeCurveProfile(undefined, W, H);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.arcSegments).toHaveLength(0);
    expect(result.kerfZones).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// ROUNDED_CORNER
// ─────────────────────────────────────────────
describe('computeCurveProfile — ROUNDED_CORNER', () => {
  it('valid: single TL corner r=50', () => {
    const result = computeCurveProfile(
      { kind: 'ROUNDED_CORNER', corners: { TL: 50 } },
      W, H
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    // One arc segment, one kerf zone
    expect(result.arcSegments).toHaveLength(1);
    expect(result.kerfZones).toHaveLength(1);
  });

  it('valid: all four corners r=40', () => {
    const result = computeCurveProfile(
      { kind: 'ROUNDED_CORNER', corners: { TL: 40, TR: 40, BL: 40, BR: 40 } },
      W, H
    );
    expect(result.valid).toBe(true);
    expect(result.arcSegments).toHaveLength(4);
    expect(result.kerfZones).toHaveLength(4);
  });

  it('invalid: r=0 → G12_RADIUS_BELOW_MIN', () => {
    const result = computeCurveProfile(
      { kind: 'ROUNDED_CORNER', corners: { TL: 0 } },
      W, H
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('G12_RADIUS_BELOW_MIN');
  });

  it('invalid: r<0 → G12_RADIUS_BELOW_MIN', () => {
    const result = computeCurveProfile(
      { kind: 'ROUNDED_CORNER', corners: { BR: -10 } },
      W, H
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('G12_RADIUS_BELOW_MIN');
  });

  it('invalid: adjacent corners overlap shorter dimension → G12_FITTING_IN_KERF_ZONE', () => {
    // minDim = W = 600; TL + BR = 400 > 600? No. Use W=200
    const result = computeCurveProfile(
      { kind: 'ROUNDED_CORNER', corners: { TL: 150, BR: 150 } },
      200, 400
    );
    // TL+BR = 300 > minDim(200) → G12_FITTING_IN_KERF_ZONE
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('G12_FITTING_IN_KERF_ZONE');
  });
});

// ─────────────────────────────────────────────
// ARC
// ─────────────────────────────────────────────
describe('computeCurveProfile — ARC', () => {
  it('valid: TOP edge r=100 sweep=90', () => {
    const result = computeCurveProfile(
      { kind: 'ARC', edge: 'TOP', radius: 100, sweepDeg: 90 },
      W, H
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.arcSegments).toHaveLength(1);
    expect(result.kerfZones).toHaveLength(1);
  });

  it('valid: LEFT edge r=150 sweep=60', () => {
    const result = computeCurveProfile(
      { kind: 'ARC', edge: 'LEFT', radius: 150, sweepDeg: 60 },
      W, H
    );
    expect(result.valid).toBe(true);
    expect(result.arcSegments[0].edge).toBe('LEFT');
  });

  it('invalid: radius=0 → G12_RADIUS_BELOW_MIN', () => {
    const result = computeCurveProfile(
      { kind: 'ARC', edge: 'BOTTOM', radius: 0, sweepDeg: 45 },
      W, H
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('G12_RADIUS_BELOW_MIN');
  });

  it('invalid: sweepDeg=0 → G12_FITTING_IN_KERF_ZONE', () => {
    const result = computeCurveProfile(
      { kind: 'ARC', edge: 'TOP', radius: 100, sweepDeg: 0 },
      W, H
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('G12_FITTING_IN_KERF_ZONE');
  });

  it('invalid: sweepDeg=181 → G12_FITTING_IN_KERF_ZONE', () => {
    const result = computeCurveProfile(
      { kind: 'ARC', edge: 'TOP', radius: 50, sweepDeg: 181 },
      W, H
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('G12_FITTING_IN_KERF_ZONE');
  });

  it('invalid: radius > half perpendicular dimension → G12_FITTING_IN_KERF_ZONE', () => {
    // TOP edge → perpendicular = H = 800; half = 400; radius 500 > 400
    const result = computeCurveProfile(
      { kind: 'ARC', edge: 'TOP', radius: 500, sweepDeg: 90 },
      W, H
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('G12_FITTING_IN_KERF_ZONE');
  });
});

// ─────────────────────────────────────────────
// S_CURVE
// ─────────────────────────────────────────────
describe('computeCurveProfile — S_CURVE', () => {
  it('valid: TOP edge r1=100 r2=80 sweep1=45 sweep2=45', () => {
    const result = computeCurveProfile(
      { kind: 'S_CURVE', edge: 'TOP', r1: 100, r2: 80, sweepDeg1: 45, sweepDeg2: 45 },
      W, H
    );
    expect(result.valid).toBe(true);
    expect(result.arcSegments).toHaveLength(2);
    expect(result.kerfZones).toHaveLength(1);
  });

  it('invalid: r1=0 → G12_RADIUS_BELOW_MIN', () => {
    const result = computeCurveProfile(
      { kind: 'S_CURVE', edge: 'TOP', r1: 0, r2: 80, sweepDeg1: 45, sweepDeg2: 45 },
      W, H
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('G12_RADIUS_BELOW_MIN');
  });

  it('invalid: sweepDeg2=0 → G12_FITTING_IN_KERF_ZONE', () => {
    const result = computeCurveProfile(
      { kind: 'S_CURVE', edge: 'TOP', r1: 100, r2: 80, sweepDeg1: 45, sweepDeg2: 0 },
      W, H
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('G12_FITTING_IN_KERF_ZONE');
  });

  it('tangency warning: r1=r2, sweep1+sweep2 ≥ 180 → G12_SCURVE_TRANSITION_SHORT (not a blocker)', () => {
    const result = computeCurveProfile(
      { kind: 'S_CURVE', edge: 'TOP', r1: 80, r2: 80, sweepDeg1: 90, sweepDeg2: 90 },
      W, H
    );
    // Should still be valid (warning only)
    expect(result.valid).toBe(true);
    expect(result.errors).toContain('G12_SCURVE_TRANSITION_SHORT');
    expect(noBlockers(result.errors)).toBe(true);
  });

  it('invalid: combined chord footprint exceeds edge length → G12_FITTING_IN_KERF_ZONE', () => {
    // TOP edge → edgeLength = W = 200 (use narrow panel)
    // chord1 = 2*200*sin(45°) ≈ 283; chord2 same → sum ~566 > 200
    const result = computeCurveProfile(
      { kind: 'S_CURVE', edge: 'TOP', r1: 200, r2: 200, sweepDeg1: 90, sweepDeg2: 90 },
      200, 800
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('G12_FITTING_IN_KERF_ZONE');
  });
});

// ─────────────────────────────────────────────
// KerfZone geometry invariants
// ─────────────────────────────────────────────
describe('KerfZone geometry invariants', () => {
  it('ARC: kerfZone start < end, both in [0, edgeLength]', () => {
    const result = computeCurveProfile(
      { kind: 'ARC', edge: 'TOP', radius: 100, sweepDeg: 90 },
      W, H
    );
    const zone = result.kerfZones[0];
    expect(zone.start).toBeGreaterThanOrEqual(0);
    expect(zone.end).toBeLessThanOrEqual(W);
    expect(zone.start).toBeLessThan(zone.end);
  });

  it('ARC: kerfZone depth ≈ arc length at radius (R × sweepRad)', () => {
    const radius = 100;
    const sweepDeg = 90;
    const expectedDepth = radius * (sweepDeg * Math.PI / 180);
    const result = computeCurveProfile(
      { kind: 'ARC', edge: 'BOTTOM', radius, sweepDeg },
      W, H
    );
    expect(result.kerfZones[0].depth).toBeCloseTo(expectedDepth, 5);
  });

  it('S_CURVE: kerfZone depth ≈ r1×sweep1Rad + r2×sweep2Rad', () => {
    const r1 = 100, r2 = 80, sweepDeg1 = 45, sweepDeg2 = 45;
    const expected = r1 * (sweepDeg1 * Math.PI / 180) + r2 * (sweepDeg2 * Math.PI / 180);
    const result = computeCurveProfile(
      { kind: 'S_CURVE', edge: 'LEFT', r1, r2, sweepDeg1, sweepDeg2 },
      W, H
    );
    expect(result.kerfZones[0].depth).toBeCloseTo(expected, 5);
  });

  it('LEFT edge: kerfZone start/end in [0, H]', () => {
    const result = computeCurveProfile(
      { kind: 'ARC', edge: 'LEFT', radius: 80, sweepDeg: 60 },
      W, H
    );
    const zone = result.kerfZones[0];
    expect(zone.start).toBeGreaterThanOrEqual(0);
    expect(zone.end).toBeLessThanOrEqual(H);
    expect(zone.start).toBeLessThan(zone.end);
  });
});

// ─────────────────────────────────────────────
// ArcSegment geometry
// ─────────────────────────────────────────────
describe('ArcSegment geometry', () => {
  it('ARC: arcSegment radius matches input', () => {
    const result = computeCurveProfile(
      { kind: 'ARC', edge: 'RIGHT', radius: 120, sweepDeg: 75 },
      W, H
    );
    expect(result.arcSegments[0].radius).toBe(120);
    expect(result.arcSegments[0].edge).toBe('RIGHT');
  });

  it('ARC: sweepAngle = sweepDeg * PI/180', () => {
    const sweepDeg = 75;
    const result = computeCurveProfile(
      { kind: 'ARC', edge: 'TOP', radius: 100, sweepDeg },
      W, H
    );
    expect(result.arcSegments[0].sweepAngle).toBeCloseTo(sweepDeg * Math.PI / 180, 10);
  });

  it('S_CURVE: two arcSegments have correct radii', () => {
    const result = computeCurveProfile(
      { kind: 'S_CURVE', edge: 'TOP', r1: 100, r2: 80, sweepDeg1: 45, sweepDeg2: 30 },
      W, H
    );
    expect(result.arcSegments[0].radius).toBe(100);
    expect(result.arcSegments[1].radius).toBe(80);
  });
});

// ─────────────────────────────────────────────
// validatePanelProfile (standalone)
// ─────────────────────────────────────────────
describe('validatePanelProfile standalone', () => {
  it('RECT always valid', () => {
    const { valid, errors } = validatePanelProfile({ kind: 'RECT' }, W, H);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('ARC invalid does NOT emit arcSegments from computeCurveProfile', () => {
    const result = computeCurveProfile(
      { kind: 'ARC', edge: 'TOP', radius: -1, sweepDeg: 90 },
      W, H
    );
    expect(result.valid).toBe(false);
    expect(result.arcSegments).toHaveLength(0);
    expect(result.kerfZones).toHaveLength(0);
  });
});
