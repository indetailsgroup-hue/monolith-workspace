/**
 * WALL CABINET PLACEMENT — the constant that was declared but never enforced.
 *
 * ERGONOMIC_STANDARDS.wallCabinetBottom and .backsplashHeight existed in
 * CabinetTaxonomy.ts with ZERO consumers. An audit of src/, tests/ and e2e/ found only
 * the interface declaration and the value assignment: nothing read them, so nothing
 * stopped a wall unit being placed on the floor, colliding with the worktop, or hung
 * out of reach. That is WORSE than having no constant at all, because a reader believes
 * it is enforced.
 *
 * These tests exist in two halves:
 *   1. The derivation is correct (counter height in, mounting height out).
 *   2. The derivation is WIRED. The final describe block fails if someone deletes the
 *      store wiring, so the constant cannot silently become decorative again.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  deriveWallCabinetPlacement,
  validateWallCabinetUnderside,
  assertPlaceableWallCabinet,
  DEFAULT_WALL_CABINET_GAP_MM,
  WALL_CABINET_UNDERSIDE_SNAP_MM,
  DEFAULT_WALL_CABINET_PLACEMENT,
  ERGONOMIC_REACH_MAX_MM,
  ERGONOMIC_STANDARDS,
  JIS_A0017_2018,
  DEFAULT_COUNTER_HEIGHT_MM,
  COUNTER_HEIGHT_TARGETS_MM,
} from '../CabinetTaxonomy';
import { useCabinetStore } from '../../store/useCabinetStore';

/**
 * scenePosition is attached to the cabinet by the store rather than declared on the
 * Cabinet type, so it needs a narrowing read. A typed helper keeps that in ONE place
 * instead of scattering casts through the assertions.
 */
function scenePositionOf(cab: unknown): [number, number, number] {
  return (cab as { scenePosition: [number, number, number] }).scenePosition;
}

/** The floor-to-underside height the store actually placed a cabinet at, mm. */
function placedUndersideOf(cab: unknown): number {
  return scenePositionOf(cab)[1];
}

/** Same strictness the height stack tests use. These are exact integers, not floats. */
const EXACT = 9;

describe('wall cabinet placement — the Thai default', () => {
  it('derives 1350mm from the Thai 850mm counter and a 500mm gap', () => {
    const p = deriveWallCabinetPlacement();

    expect(p.counterHeight).toBe(850);
    expect(p.wallGap).toBe(500);
    expect(p.undersideHeight).toBe(1350);
  });

  it('closes the arithmetic exactly: counter + gap === underside', () => {
    const p = deriveWallCabinetPlacement();
    // The Thai default needs no snapping, so the raw and snapped values coincide and
    // the invariant is exact rather than approximate.
    expect(p.counterHeight + p.wallGap).toBeCloseTo(p.undersideHeight, EXACT);
    expect(p.snapAdjustmentMm).toBe(0);
    expect(p.effectiveGapMm).toBe(DEFAULT_WALL_CABINET_GAP_MM);
  });

  it('clears the JIS A0017:2018 1300mm minimum with 50mm to spare', () => {
    const p = deriveWallCabinetPlacement();
    expect(p.jisMinimumMm).toBe(JIS_A0017_2018.wallUnitMinUndersideMm);
    expect(p.jisMinimumMm).toBe(1300);
    expect(p.meetsJisMinimum).toBe(true);
    // A minimum is a bound to clear, not a target to land on.
    expect(p.undersideHeight - p.jisMinimumMm).toBe(50);
  });

  it('is placeable, with no errors and no warnings', () => {
    const p = deriveWallCabinetPlacement();
    expect(p.placeable).toBe(true);
    expect(p.errors).toEqual([]);
    expect(p.warnings).toEqual([]);
  });
});

describe('wall cabinet placement — other markets', () => {
  it('derives 1400mm for an EU 900mm counter', () => {
    const p = deriveWallCabinetPlacement({
      counterHeight: COUNTER_HEIGHT_TARGETS_MM.EU,
    });
    expect(p.counterHeight).toBe(900);
    expect(p.undersideHeight).toBe(1400);
    expect(p.placeable).toBe(true);
    expect(p.snapAdjustmentMm).toBe(0);
  });

  it('tracks the counter height rather than being a fixed number', () => {
    // The whole point: mounting height is DERIVED. If it were a constant, all three of
    // these would be equal.
    expect(deriveWallCabinetPlacement({ counterHeight: 800 }).undersideHeight).toBe(1300);
    expect(deriveWallCabinetPlacement({ counterHeight: 850 }).undersideHeight).toBe(1350);
    expect(deriveWallCabinetPlacement({ counterHeight: 900 }).undersideHeight).toBe(1400);
    expect(deriveWallCabinetPlacement({ counterHeight: 950 }).undersideHeight).toBe(1450);
  });

  it('tracks the gap as well as the counter height', () => {
    const tight = deriveWallCabinetPlacement({ wallGap: 450 });
    expect(tight.undersideHeight).toBe(1300);
    expect(tight.meetsJisMinimum).toBe(true); // exactly on the floor, still legal
  });
});

describe('snapping to a 50mm rail increment', () => {
  it('snaps to a multiple of 50', () => {
    const p = deriveWallCabinetPlacement({ counterHeight: COUNTER_HEIGHT_TARGETS_MM.US });
    expect(p.rawUndersideHeight).toBe(1414); // 914 + 500
    expect(p.undersideHeight % WALL_CABINET_UNDERSIDE_SNAP_MM).toBe(0);
  });

  it('snaps UP, never down — snapping must not eat working clearance', () => {
    // 1414 -> 1450, NOT 1400. Rounding to nearest would have moved the unit DOWN and
    // silently delivered 486mm of clearance where 500mm was specified. Ceil can only
    // ever add clearance, which is the safe direction for a collision bound.
    const p = deriveWallCabinetPlacement({ counterHeight: 914 });
    expect(p.undersideHeight).toBe(1450);
    expect(p.snapAdjustmentMm).toBe(36);
    expect(p.effectiveGapMm).toBeGreaterThanOrEqual(p.wallGap);
  });

  it('never reduces the effective gap below the requested gap, at any counter height', () => {
    for (let counter = 700; counter <= 1000; counter += 1) {
      const p = deriveWallCabinetPlacement({ counterHeight: counter });
      expect(p.effectiveGapMm).toBeGreaterThanOrEqual(p.wallGap);
      expect(p.undersideHeight % WALL_CABINET_UNDERSIDE_SNAP_MM).toBe(0);
    }
  });
});

describe('rejection is real, not advisory', () => {
  it('rejects a wall cabinet at 1200mm — below the JIS 1300mm floor', () => {
    const check = validateWallCabinetUnderside(1200);

    expect(check.valid).toBe(false);
    expect(check.errors.map((e) => e.code)).toContain('UNDERSIDE_BELOW_JIS_MINIMUM');
    expect(check.errors[0].message).toContain('1300');
  });

  it('rejects a wall cabinet placed on the floor', () => {
    // This is exactly what addCabinet used to do: scenePosition defaulted to [0, 0, 0].
    const check = validateWallCabinetUnderside(0);
    expect(check.valid).toBe(false);
    expect(check.errors.map((e) => e.code)).toContain('UNDERSIDE_BELOW_WORKTOP');
    expect(check.errors.map((e) => e.code)).toContain('UNDERSIDE_BELOW_JIS_MINIMUM');
  });

  it('rejects a unit whose underside sits inside the worktop', () => {
    const check = validateWallCabinetUnderside(850, { counterHeight: 850 });
    expect(check.valid).toBe(false);
    expect(check.errors.map((e) => e.code)).toContain('UNDERSIDE_BELOW_WORKTOP');
  });

  it('rejects a non-positive gap in the derivation itself', () => {
    const p = deriveWallCabinetPlacement({ wallGap: 0 });
    expect(p.placeable).toBe(false);
    expect(p.errors.map((e) => e.code)).toContain('GAP_NOT_POSITIVE');
  });

  it('does NOT silently raise an illegal configuration to the legal minimum', () => {
    // The tempting wrong fix. A 700mm counter with a 450mm gap gives 1150, below the
    // JIS floor. The value must stay 1150 and be REJECTED, not be quietly bumped to
    // 1300 — bumping would deliver a 600mm gap nobody asked for and hide the conflict.
    const p = deriveWallCabinetPlacement({ counterHeight: 700, wallGap: 450 });
    expect(p.undersideHeight).toBe(1150);
    expect(p.meetsJisMinimum).toBe(false);
    expect(p.placeable).toBe(false);
    expect(p.errors.map((e) => e.code)).toContain('UNDERSIDE_BELOW_JIS_MINIMUM');
  });

  it('assertPlaceableWallCabinet throws for anything unbuildable', () => {
    const bad = deriveWallCabinetPlacement({ counterHeight: 700, wallGap: 450 });
    expect(() => assertPlaceableWallCabinet(bad)).toThrow(/UNDERSIDE_BELOW_JIS_MINIMUM/);
  });

  it('assertPlaceableWallCabinet does NOT throw for the Thai default', () => {
    expect(() => assertPlaceableWallCabinet(deriveWallCabinetPlacement())).not.toThrow();
  });
});

describe('reach ceiling is a warning, not an error', () => {
  it('warns — but does not reject — above the comfortable reach ceiling', () => {
    const check = validateWallCabinetUnderside(ERGONOMIC_REACH_MAX_MM + 100);
    // Buildable and installable; just not reachable without a stool. No sourced hard
    // ceiling exists, so inventing one as an error would be a fabricated bound.
    expect(check.valid).toBe(true);
    expect(check.warnings.map((w) => w.code)).toContain(
      'UNDERSIDE_ABOVE_COMFORTABLE_REACH'
    );
  });

  it('does not warn at the Thai default', () => {
    expect(validateWallCabinetUnderside(1350).warnings).toEqual([]);
  });
});

describe('ERGONOMIC_STANDARDS is derived, not asserted', () => {
  it('wallCabinetBottom equals the derivation', () => {
    expect(ERGONOMIC_STANDARDS.wallCabinetBottom).toBe(
      DEFAULT_WALL_CABINET_PLACEMENT.undersideHeight
    );
    expect(ERGONOMIC_STANDARDS.wallCabinetBottom).toBe(1350);
  });

  it('backsplashHeight and the wall gap cannot disagree', () => {
    // These were two independent literals describing the same measurement. They are now
    // one constant, so drift is impossible by construction.
    expect(ERGONOMIC_STANDARDS.backsplashHeight).toBe(DEFAULT_WALL_CABINET_GAP_MM);
    expect(
      ERGONOMIC_STANDARDS.counterHeight + ERGONOMIC_STANDARDS.backsplashHeight
    ).toBe(ERGONOMIC_STANDARDS.wallCabinetBottom);
  });

  it('counterHeight still tracks the Thai height stack', () => {
    expect(ERGONOMIC_STANDARDS.counterHeight).toBe(DEFAULT_COUNTER_HEIGHT_MM);
  });
});

/**
 * THE ANTI-DECORATIVE TESTS.
 *
 * Everything above would still pass if deriveWallCabinetPlacement were exported and
 * never called by anything — which is precisely the state this lane found the constant
 * in. These tests drive the real store and fail if the wiring in addCabinet is removed.
 */
describe('the derivation is WIRED into placement (fails if the wiring is deleted)', () => {
  beforeEach(() => {
    useCabinetStore.getState().createCabinet('BASE', 'Base');
  });

  it('places a wall cabinet at the derived mounting height, not on the floor', () => {
    const cab = useCabinetStore.getState().addCabinet('WALL', 'Wall Unit');
    const y = placedUndersideOf(cab);

    // If someone deletes the wiring, `position` falls back to [0, 0, 0] and y is 0.
    expect(y).not.toBe(0);
    expect(y).toBe(DEFAULT_WALL_CABINET_PLACEMENT.undersideHeight);
    expect(y).toBe(1350);
  });

  it('the placed height passes the same validator the catalog exposes', () => {
    const cab = useCabinetStore.getState().addCabinet('WALL', 'Wall Unit');
    const y = placedUndersideOf(cab);
    expect(validateWallCabinetUnderside(y).valid).toBe(true);
  });

  it('leaves base cabinets on the floor', () => {
    const cab = useCabinetStore.getState().addCabinet('BASE', 'Base Unit');
    const y = placedUndersideOf(cab);
    expect(y).toBe(0);
  });

  it('THE PRODUCTION CALL SHAPE: an explicit position still gets the derived Y', () => {
    // THIS IS THE TEST THE PREVIOUS ROUND WAS MISSING, and its absence hid a live bug.
    //
    // Every test above omits `position`, but NO production caller does.
    // CabinetTypeSelector.handleAddCabinet passes [offsetX, 0, 0] to space units along X,
    // which took the old "caller stated a position" branch: console.error, then place at
    // Y=0 anyway. So a user adding a wall cabinet got it on the floor, through the
    // worktop, while the suite reported the fix as proven.
    //
    // This call is shaped EXACTLY like CabinetTypeSelector's.
    const offsetX = 700;
    const cab = useCabinetStore
      .getState()
      .addCabinet('WALL', 'From The UI', undefined, [offsetX, 0, 0]);

    // X and Z are the caller's — that is layout, and callers own it.
    expect(scenePositionOf(cab)[0]).toBe(offsetX);
    expect(scenePositionOf(cab)[2]).toBe(0);
    // Y is DERIVED and overrides the caller's 0. This is the assertion that would have
    // caught the bug.
    expect(placedUndersideOf(cab)).toBe(1350);
    expect(placedUndersideOf(cab)).not.toBe(0);
  });

  it('a wall cabinet cannot be created below the JIS minimum, even explicitly', () => {
    // 1200 is below the 1300mm floor. The Y is replaced by the derivation, so the unit
    // lands legally rather than being created out of envelope and merely logged about.
    const cab = useCabinetStore
      .getState()
      .addCabinet('WALL', 'Tried Too Low', undefined, [0, 1200, 0]);
    expect(placedUndersideOf(cab)).toBe(1350);
    expect(validateWallCabinetUnderside(placedUndersideOf(cab)).valid).toBe(true);
  });

  it('keepExplicitY opts out — and RECORDS the violation rather than only logging it', () => {
    // The deliberate escape hatch, for a genuinely caller-owned Y: project restore,
    // import, drag commit. The position is honoured and the breach is recorded on a
    // surface code and UI can read, which is the half that was missing when this was a
    // bare console.error.
    useCabinetStore.getState().clearPlacementViolations();
    const cab = useCabinetStore
      .getState()
      .addCabinet('WALL', 'Restored', undefined, [500, 1200, 200], { keepExplicitY: true });

    expect(scenePositionOf(cab)).toEqual([500, 1200, 200]);

    const violations = useCabinetStore.getState().placementViolations;
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.map((v) => v.code)).toContain('UNDERSIDE_BELOW_JIS_MINIMUM');
    expect(violations.every((v) => v.severity === 'ERROR')).toBe(true);
    expect(violations.map((v) => v.message).join('\n')).toContain('1300');
  });
});

describe('wall placement is enforced on MOVE, not only on creation', () => {
  beforeEach(() => {
    useCabinetStore.getState().createCabinet('BASE', 'Base');
    useCabinetStore.getState().clearPlacementViolations();
  });

  it('records a violation when a wall unit is DRAGGED below the JIS minimum', () => {
    // THE BYPASS THIS CLOSES: creation was gated, movement was not. FloorDragControls,
    // CabinetTransformControls, clampDeltaByCollision and commitSnapHelpers all commit
    // through updateCabinetPosition, which wrote scenePosition with no validation at all
    // — so the 1300mm hard bound was bypassable through the primary interaction surface
    // by simply dragging.
    const cab = useCabinetStore.getState().addCabinet('WALL', 'Draggable');
    expect(placedUndersideOf(cab)).toBe(1350);

    useCabinetStore.getState().updateCabinetPosition(cab.id, [0, 900, 0]);

    // COMMITTED, because throwing mid-drag would destroy the user's interaction...
    const moved = useCabinetStore.getState().cabinets.find((c) => c.id === cab.id)!;
    expect(placedUndersideOf(moved)).toBe(900);

    // ...but MARKED, on a real surface, so nothing downstream can treat it as fine.
    const violations = useCabinetStore.getState().placementViolations;
    expect(violations.map((v) => v.code)).toContain('UNDERSIDE_BELOW_JIS_MINIMUM');
    expect(violations.some((v) => v.source === 'updateCabinetPosition')).toBe(true);
    expect(violations.some((v) => v.cabinetId === cab.id)).toBe(true);
  });

  it('records nothing for a legal move', () => {
    const cab = useCabinetStore.getState().addCabinet('WALL', 'Draggable');
    useCabinetStore.getState().clearPlacementViolations();

    useCabinetStore.getState().updateCabinetPosition(cab.id, [1200, 1400, 0]);
    expect(useCabinetStore.getState().placementViolations).toEqual([]);
  });

  it('ignores base cabinets, which have no underside bound', () => {
    const cab = useCabinetStore.getState().addCabinet('BASE', 'Base Unit');
    useCabinetStore.getState().clearPlacementViolations();

    useCabinetStore.getState().updateCabinetPosition(cab.id, [0, 0, 0]);
    expect(useCabinetStore.getState().placementViolations).toEqual([]);
  });
});
