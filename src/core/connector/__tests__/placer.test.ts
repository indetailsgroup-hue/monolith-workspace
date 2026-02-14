/**
 * Connector OS v1.1 - Placer Unit Tests
 *
 * Tests System 32 grid placement with load class constraints.
 *
 * @see docs/connector-os/compiler-pipeline.md
 */

import { describe, it, expect } from 'vitest';
import { getConnectorPositions } from '../placer';
import { KITCHEN_PREMIUM_PROFILE } from '../catalog';

describe('getConnectorPositions', () => {
  // ──────────────────────────────────────────────────────────────────────
  // Test 6 (spec): 600mm joint HEAVY → ≥7 connectors
  // ──────────────────────────────────────────────────────────────────────
  it('600mm joint HEAVY → at least 7 connectors', () => {
    const positions = getConnectorPositions(
      600,
      KITCHEN_PREMIUM_PROFILE,
      'HEAVY',
    );

    // HEAVY: maxSpacing = 96mm, usableLen = 600 - 80 = 520mm
    // requiredCount = max(2, ceil(520/96) + 1) = max(2, 7) = 7
    expect(positions.length).toBeGreaterThanOrEqual(7);
  });

  // ──────────────────────────────────────────────────────────────────────
  // 600mm joint STANDARD → positions on System 32 grid
  // ──────────────────────────────────────────────────────────────────────
  it('600mm joint STANDARD → positions are on System 32 grid', () => {
    const positions = getConnectorPositions(
      600,
      KITCHEN_PREMIUM_PROFILE,
      'STANDARD',
    );

    // Every position should be firstHole + n*pitch from System 32
    const sys = KITCHEN_PREMIUM_PROFILE.system32;
    for (const pos of positions) {
      // Either on grid or added as endOffset fallback
      const fromFirst = pos - sys.firstHole;
      if (fromFirst >= 0) {
        expect(fromFirst % sys.pitch).toBe(0);
      }
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Short joint → minimum 2 connectors (Rule of Two)
  // ──────────────────────────────────────────────────────────────────────
  it('120mm joint → at least 2 connectors (Rule of Two)', () => {
    const positions = getConnectorPositions(
      120,
      KITCHEN_PREMIUM_PROFILE,
      'STANDARD',
    );

    expect(positions.length).toBeGreaterThanOrEqual(2);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Positions are sorted ascending
  // ──────────────────────────────────────────────────────────────────────
  it('positions are sorted ascending', () => {
    const positions = getConnectorPositions(
      600,
      KITCHEN_PREMIUM_PROFILE,
      'HEAVY',
    );

    for (let i = 0; i < positions.length - 1; i++) {
      expect(positions[i]).toBeLessThan(positions[i + 1]);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Positions are unique
  // ──────────────────────────────────────────────────────────────────────
  it('positions are unique (no duplicates)', () => {
    const positions = getConnectorPositions(
      600,
      KITCHEN_PREMIUM_PROFILE,
      'STANDARD',
    );

    const unique = new Set(positions);
    expect(unique.size).toBe(positions.length);
  });

  // ──────────────────────────────────────────────────────────────────────
  // First position starts at System 32 first hole
  // ──────────────────────────────────────────────────────────────────────
  it('first position is 69mm (first grid position past endOffset)', () => {
    const positions = getConnectorPositions(
      600,
      KITCHEN_PREMIUM_PROFILE,
      'STANDARD',
    );

    // firstHole=37 < endOffset=40, so first valid position is 37+32=69
    expect(positions[0]).toBe(69);
  });

  // ──────────────────────────────────────────────────────────────────────
  // End offset respected
  // ──────────────────────────────────────────────────────────────────────
  it('no position exceeds jointLen - endOffset', () => {
    const jointLen = 600;
    const positions = getConnectorPositions(
      jointLen,
      KITCHEN_PREMIUM_PROFILE,
      'HEAVY',
    );

    const maxAllowed = jointLen - KITCHEN_PREMIUM_PROFILE.system32.endOffset;
    for (const pos of positions) {
      expect(pos).toBeLessThanOrEqual(maxAllowed);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Very short joint still produces at least 1 position
  // ──────────────────────────────────────────────────────────────────────
  it('very short joint (50mm) → at least 1 position', () => {
    const positions = getConnectorPositions(
      50,
      KITCHEN_PREMIUM_PROFILE,
      'STANDARD',
    );

    expect(positions.length).toBeGreaterThanOrEqual(1);
  });
});
