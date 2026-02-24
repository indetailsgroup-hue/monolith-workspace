/**
 * useSpecStore.test.ts - Comprehensive unit tests for SpecStore validation rules
 *
 * Tests all validation rule categories:
 * - DIMENSIONAL: width, height, depth min/max/ok
 * - STRUCTURAL: shelf span, back panel
 * - MATERIAL: core material assignment
 * - MACHINE: panel size vs machine limits
 * - SAFETY: clearance (always PASS)
 *
 * Also tests gate status (canFreeze, canRelease, canExport)
 * and format-specific export rules (CUT_LIST, DXF, CNC).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// MOCKS - must be declared before imports
// ============================================

vi.mock('../useCabinetStore', () => {
  let mockState: any = {};
  const store = {
    getState: () => mockState,
    setState: (s: any) => {
      mockState = { ...mockState, ...s };
    },
    subscribe: () => () => {},
  };
  return {
    useCabinetStore: Object.assign(() => mockState, store),
    registerSpecStore: vi.fn(),
  };
});

vi.mock('../useDrillMapStore', () => {
  return {
    useDrillMapStore: Object.assign(() => ({}), {
      getState: () => ({ drillMap: null }),
      subscribe: () => () => {},
    }),
  };
});

vi.mock('../useProjectStore', () => {
  return {
    useProjectStore: Object.assign(() => ({}), {
      getState: () => ({ metadata: { id: 'test-project', name: 'Test' } }),
      subscribe: () => () => {},
    }),
  };
});

vi.mock('../../../crypto/sha256', () => ({
  sha256Hex: vi.fn(async () => 'mock-hash'),
}));

vi.mock('../../api/stateApi', () => ({
  getJobState: vi.fn(),
  freezeJob: vi.fn(),
  releaseJob: vi.fn(),
  revokeJob: vi.fn(),
  checkCanExport: vi.fn(),
}));

vi.mock('../../gate/g9PersistenceGate', () => ({
  g9ToValidationRules: () => [],
}));

// ============================================
// IMPORTS - after mocks
// ============================================

import { useSpecStore } from '../useSpecStore';
import { useCabinetStore } from '../useCabinetStore';

// ============================================
// HELPERS
// ============================================

/** Deep-merge utility: merges source into target, returning a new object. */
function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/** Default valid cabinet state used as baseline for all tests. */
const BASE_CABINET = {
  cabinet: {
    dimensions: { width: 600, height: 720, depth: 560 },
    structure: { dividerCount: 0, shelfCount: 1, hasBackPanel: true },
    panels: [
      { id: 'p1', coreMaterialId: 'PB-MEL', finishWidth: 580, finishHeight: 700 },
    ],
    materials: { defaultCore: 'PB-MEL' },
  },
};

/**
 * Sets mock cabinet state. Applies deep-merge of overrides on top of BASE_CABINET.
 * Pass `{ cabinet: null }` to simulate no-cabinet scenario.
 */
function setCabinetState(overrides: any = {}) {
  if (overrides.cabinet === null) {
    (useCabinetStore as any).setState({ cabinet: null });
    return;
  }
  const merged = deepMerge(BASE_CABINET, overrides);
  (useCabinetStore as any).setState(merged);
}

/**
 * Find a rule by its id in validation results.
 */
function findRule(rules: any[], id: string) {
  return rules.find((r: any) => r.id === id);
}

/**
 * Reset the spec store to its default state before each test.
 */
function resetSpecStore() {
  useSpecStore.setState({
    specState: 'DRAFT',
    validation: null,
    selectedMachine: 'homag-centateq',
    gateStatus: {
      canFreeze: false,
      canRelease: false,
      canExport: false,
      blockers: ['Run validation first'],
    },
    syncStatus: 'synced',
    lastServerResponse: null,
    serverRevisionId: null,
    pendingTransition: null,
    releaseRecords: [],
    currentReleaseId: null,
  });
}

// ============================================
// TESTS
// ============================================

describe('useSpecStore - Validation Rules', () => {
  beforeEach(() => {
    resetSpecStore();
    setCabinetState();
  });

  // ------------------------------------------
  // NO CABINET
  // ------------------------------------------

  describe('No cabinet', () => {
    it('should return FAIL with no-cabinet rule when cabinet is null', () => {
      setCabinetState({ cabinet: null });
      const result = useSpecStore.getState().runValidation();

      expect(result.ok).toBe(false);
      expect(result.failCount).toBe(1);
      expect(result.passCount).toBe(0);
      expect(result.warnCount).toBe(0);
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].id).toBe('no-cabinet');
      expect(result.rules[0].status).toBe('FAIL');
      expect(result.rules[0].category).toBe('STRUCTURAL');
    });

    it('should return FAIL when cabinet has no dimensions', () => {
      (useCabinetStore as any).setState({
        cabinet: { structure: { dividerCount: 0, shelfCount: 0, hasBackPanel: true } },
      });
      const result = useSpecStore.getState().runValidation();

      expect(result.ok).toBe(false);
      expect(result.rules[0].id).toBe('no-cabinet');
    });

    it('should return FAIL when cabinet has no structure', () => {
      (useCabinetStore as any).setState({
        cabinet: { dimensions: { width: 600, height: 720, depth: 560 } },
      });
      const result = useSpecStore.getState().runValidation();

      expect(result.ok).toBe(false);
      expect(result.rules[0].id).toBe('no-cabinet');
    });
  });

  // ------------------------------------------
  // DIMENSIONAL - WIDTH
  // ------------------------------------------

  describe('Dimensional - Width', () => {
    it('should FAIL when width < 200mm (e.g. 150mm)', () => {
      setCabinetState({ cabinet: { dimensions: { width: 150 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'min-width');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
      expect(rule.category).toBe('DIMENSIONAL');
      expect(rule.message).toContain('150');
      expect(result.ok).toBe(false);
    });

    it('should FAIL when width is 0mm', () => {
      setCabinetState({ cabinet: { dimensions: { width: 0 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'min-width');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
    });

    it('should FAIL when width is 199mm (just below minimum)', () => {
      setCabinetState({ cabinet: { dimensions: { width: 199 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'min-width');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
    });

    it('should PASS when width is exactly 200mm (lower boundary)', () => {
      setCabinetState({ cabinet: { dimensions: { width: 200 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'width-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });

    it('should PASS when width is 600mm (normal)', () => {
      setCabinetState({ cabinet: { dimensions: { width: 600 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'width-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
      expect(rule.category).toBe('DIMENSIONAL');
    });

    it('should PASS when width is exactly 1200mm (upper boundary)', () => {
      setCabinetState({ cabinet: { dimensions: { width: 1200 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'width-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });

    it('should WARN when width is 1201mm (just above max)', () => {
      setCabinetState({ cabinet: { dimensions: { width: 1201 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'max-width');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('WARN');
    });

    it('should WARN when width > 1200mm (e.g. 1500mm)', () => {
      setCabinetState({ cabinet: { dimensions: { width: 1500 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'max-width');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('WARN');
      expect(rule.category).toBe('DIMENSIONAL');
      expect(rule.message).toContain('1500');
      // WARN does not cause ok=false
      expect(result.failCount).toBe(0);
    });
  });

  // ------------------------------------------
  // DIMENSIONAL - HEIGHT
  // ------------------------------------------

  describe('Dimensional - Height', () => {
    it('should FAIL when height < 300mm (e.g. 250mm)', () => {
      setCabinetState({ cabinet: { dimensions: { height: 250 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'min-height');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
      expect(rule.category).toBe('DIMENSIONAL');
      expect(rule.message).toContain('250');
      expect(result.ok).toBe(false);
    });

    it('should FAIL when height is 0mm', () => {
      setCabinetState({ cabinet: { dimensions: { height: 0 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'min-height');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
    });

    it('should FAIL when height is 299mm (just below minimum)', () => {
      setCabinetState({ cabinet: { dimensions: { height: 299 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'min-height');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
    });

    it('should PASS when height is exactly 300mm (lower boundary)', () => {
      setCabinetState({ cabinet: { dimensions: { height: 300 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'height-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });

    it('should PASS when height is 720mm (normal)', () => {
      setCabinetState({ cabinet: { dimensions: { height: 720 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'height-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
      expect(rule.category).toBe('DIMENSIONAL');
    });

    it('should PASS when height is exactly 2400mm (upper boundary)', () => {
      setCabinetState({ cabinet: { dimensions: { height: 2400 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'height-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });

    it('should WARN when height is 2401mm (just above max)', () => {
      setCabinetState({ cabinet: { dimensions: { height: 2401 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'max-height');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('WARN');
    });

    it('should WARN when height > 2400mm (e.g. 2500mm)', () => {
      setCabinetState({ cabinet: { dimensions: { height: 2500 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'max-height');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('WARN');
      expect(rule.category).toBe('DIMENSIONAL');
      expect(rule.message).toContain('2500');
    });
  });

  // ------------------------------------------
  // DIMENSIONAL - DEPTH
  // ------------------------------------------

  describe('Dimensional - Depth', () => {
    it('should FAIL when depth < 200mm (e.g. 150mm)', () => {
      setCabinetState({ cabinet: { dimensions: { depth: 150 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'min-depth');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
      expect(rule.category).toBe('DIMENSIONAL');
      expect(rule.message).toContain('150');
      expect(result.ok).toBe(false);
    });

    it('should FAIL when depth is 0mm', () => {
      setCabinetState({ cabinet: { dimensions: { depth: 0 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'min-depth');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
    });

    it('should FAIL when depth is 199mm (just below minimum)', () => {
      setCabinetState({ cabinet: { dimensions: { depth: 199 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'min-depth');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
    });

    it('should PASS when depth is exactly 200mm (lower boundary)', () => {
      setCabinetState({ cabinet: { dimensions: { depth: 200 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'depth-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });

    it('should PASS when depth is 560mm (normal)', () => {
      setCabinetState({ cabinet: { dimensions: { depth: 560 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'depth-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
      expect(rule.category).toBe('DIMENSIONAL');
    });

    it('should PASS when depth is exactly 800mm (upper boundary)', () => {
      setCabinetState({ cabinet: { dimensions: { depth: 800 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'depth-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });

    it('should WARN when depth is 801mm (just above max)', () => {
      setCabinetState({ cabinet: { dimensions: { depth: 801 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'max-depth');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('WARN');
    });

    it('should WARN when depth > 800mm (e.g. 900mm)', () => {
      setCabinetState({ cabinet: { dimensions: { depth: 900 } } });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'max-depth');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('WARN');
      expect(rule.category).toBe('DIMENSIONAL');
      expect(rule.message).toContain('900');
    });
  });

  // ------------------------------------------
  // STRUCTURAL - SHELF SPAN
  // ------------------------------------------

  describe('Structural - Shelf Span', () => {
    it('should WARN when span > 800mm with shelves (1200mm wide, 0 dividers, 1 shelf)', () => {
      setCabinetState({
        cabinet: {
          dimensions: { width: 1200 },
          structure: { dividerCount: 0, shelfCount: 1 },
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'shelf-span');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('WARN');
      expect(rule.category).toBe('STRUCTURAL');
      expect(rule.message).toContain('1200');
    });

    it('should PASS when span <= 800mm (600mm wide, 0 dividers, 1 shelf)', () => {
      setCabinetState({
        cabinet: {
          dimensions: { width: 600 },
          structure: { dividerCount: 0, shelfCount: 1 },
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'shelf-span-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });

    it('should PASS when span > 800mm but shelfCount is 0 (no shelves to sag)', () => {
      setCabinetState({
        cabinet: {
          dimensions: { width: 1200 },
          structure: { dividerCount: 0, shelfCount: 0 },
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'shelf-span-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });

    it('should PASS when dividers reduce span below 800mm (1200mm wide, 1 divider)', () => {
      // span = 1200 / (1+1) = 600mm <= 800
      setCabinetState({
        cabinet: {
          dimensions: { width: 1200 },
          structure: { dividerCount: 1, shelfCount: 1 },
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'shelf-span-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });

    it('should WARN when span is exactly 801mm (boundary)', () => {
      // span = 801 / (0+1) = 801 > 800 with shelves
      setCabinetState({
        cabinet: {
          dimensions: { width: 801 },
          structure: { dividerCount: 0, shelfCount: 1 },
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'shelf-span');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('WARN');
    });

    it('should PASS when span is exactly 800mm (boundary)', () => {
      // span = 800 / (0+1) = 800 which is NOT > 800
      setCabinetState({
        cabinet: {
          dimensions: { width: 800 },
          structure: { dividerCount: 0, shelfCount: 1 },
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'shelf-span-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });

    it('should WARN with multiple shelves and wide span', () => {
      setCabinetState({
        cabinet: {
          dimensions: { width: 1000 },
          structure: { dividerCount: 0, shelfCount: 5 },
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'shelf-span');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('WARN');
    });
  });

  // ------------------------------------------
  // STRUCTURAL - BACK PANEL
  // ------------------------------------------

  describe('Structural - Back Panel', () => {
    it('should WARN when no back panel and height > 1000mm', () => {
      setCabinetState({
        cabinet: {
          dimensions: { height: 1200 },
          structure: { hasBackPanel: false },
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'back-panel-tall');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('WARN');
      expect(rule.category).toBe('STRUCTURAL');
      expect(rule.message).toContain('1000');
    });

    it('should PASS when back panel is present (tall cabinet)', () => {
      setCabinetState({
        cabinet: {
          dimensions: { height: 1200 },
          structure: { hasBackPanel: true },
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'back-panel-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });

    it('should PASS when no back panel but height <= 1000mm', () => {
      setCabinetState({
        cabinet: {
          dimensions: { height: 720 },
          structure: { hasBackPanel: false },
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'back-panel-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });

    it('should PASS when no back panel and height is exactly 1000mm (boundary)', () => {
      setCabinetState({
        cabinet: {
          dimensions: { height: 1000 },
          structure: { hasBackPanel: false },
        },
      });
      const result = useSpecStore.getState().runValidation();

      // height > 1000 is the condition, so 1000 is NOT > 1000
      const rule = findRule(result.rules, 'back-panel-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });

    it('should WARN when no back panel and height is 1001mm (just above boundary)', () => {
      setCabinetState({
        cabinet: {
          dimensions: { height: 1001 },
          structure: { hasBackPanel: false },
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'back-panel-tall');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('WARN');
    });
  });

  // ------------------------------------------
  // MATERIAL RULES
  // ------------------------------------------

  describe('Material - Missing', () => {
    it('should FAIL when panels lack coreMaterialId and no defaultCore', () => {
      setCabinetState({
        cabinet: {
          panels: [
            { id: 'p1', coreMaterialId: null, finishWidth: 580, finishHeight: 700 },
            { id: 'p2', coreMaterialId: null, finishWidth: 580, finishHeight: 700 },
          ],
          materials: { defaultCore: null },
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'material-missing');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
      expect(rule.category).toBe('MATERIAL');
      expect(rule.message).toContain('2');
      expect(result.ok).toBe(false);
    });

    it('should FAIL when one panel has no coreMaterialId and no defaultCore', () => {
      setCabinetState({
        cabinet: {
          panels: [
            { id: 'p1', coreMaterialId: 'PB-MEL', finishWidth: 580, finishHeight: 700 },
            { id: 'p2', coreMaterialId: null, finishWidth: 580, finishHeight: 700 },
          ],
          materials: { defaultCore: null },
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'material-missing');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
      expect(rule.message).toContain('1');
    });

    it('should FAIL when coreMaterialId is undefined and no defaultCore', () => {
      setCabinetState({
        cabinet: {
          panels: [
            { id: 'p1', finishWidth: 580, finishHeight: 700 },
          ],
          materials: { defaultCore: null },
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'material-missing');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
    });

    it('should FAIL when coreMaterialId is empty string and no defaultCore', () => {
      setCabinetState({
        cabinet: {
          panels: [
            { id: 'p1', coreMaterialId: '', finishWidth: 580, finishHeight: 700 },
          ],
          materials: { defaultCore: '' },
        },
      });
      const result = useSpecStore.getState().runValidation();

      // Empty string is falsy, so both !p.coreMaterialId and !defaultCore are true
      const rule = findRule(result.rules, 'material-missing');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
    });
  });

  describe('Material - OK', () => {
    it('should PASS when all panels have coreMaterialId', () => {
      setCabinetState({
        cabinet: {
          panels: [
            { id: 'p1', coreMaterialId: 'PB-MEL', finishWidth: 580, finishHeight: 700 },
            { id: 'p2', coreMaterialId: 'MDF', finishWidth: 400, finishHeight: 600 },
          ],
          materials: { defaultCore: null },
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'material-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
      expect(rule.category).toBe('MATERIAL');
    });

    it('should PASS when panels lack coreMaterialId but defaultCore is set', () => {
      setCabinetState({
        cabinet: {
          panels: [
            { id: 'p1', coreMaterialId: null, finishWidth: 580, finishHeight: 700 },
          ],
          materials: { defaultCore: 'PB-MEL' },
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'material-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });

    it('should PASS with default cabinet state (has defaultCore)', () => {
      setCabinetState();
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'material-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });
  });

  // ------------------------------------------
  // MACHINE RULES
  // ------------------------------------------

  describe('Machine - Oversize panels', () => {
    it('should FAIL when a panel finishWidth exceeds machine maxWidth (3000mm)', () => {
      setCabinetState({
        cabinet: {
          panels: [
            { id: 'p1', coreMaterialId: 'PB-MEL', finishWidth: 5000, finishHeight: 700 },
          ],
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'machine-size');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
      expect(rule.category).toBe('MACHINE');
      expect(rule.message).toContain('1');
      expect(result.ok).toBe(false);
    });

    it('should FAIL when a panel finishHeight exceeds machine maxHeight (1500mm)', () => {
      setCabinetState({
        cabinet: {
          panels: [
            { id: 'p1', coreMaterialId: 'PB-MEL', finishWidth: 500, finishHeight: 2000 },
          ],
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'machine-size');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
    });

    it('should FAIL when multiple panels exceed machine limits', () => {
      setCabinetState({
        cabinet: {
          panels: [
            { id: 'p1', coreMaterialId: 'PB-MEL', finishWidth: 3500, finishHeight: 700 },
            { id: 'p2', coreMaterialId: 'PB-MEL', finishWidth: 500, finishHeight: 1600 },
            { id: 'p3', coreMaterialId: 'PB-MEL', finishWidth: 400, finishHeight: 600 },
          ],
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'machine-size');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
      expect(rule.message).toContain('2');
    });

    it('should FAIL when panel finishWidth is 3001mm (just above machine limit)', () => {
      setCabinetState({
        cabinet: {
          panels: [
            { id: 'p1', coreMaterialId: 'PB-MEL', finishWidth: 3001, finishHeight: 700 },
          ],
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'machine-size');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
    });

    it('should FAIL when panel finishHeight is 1501mm (just above machine limit)', () => {
      setCabinetState({
        cabinet: {
          panels: [
            { id: 'p1', coreMaterialId: 'PB-MEL', finishWidth: 500, finishHeight: 1501 },
          ],
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'machine-size');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('FAIL');
    });
  });

  describe('Machine - Within limits', () => {
    it('should PASS when all panels are within machine limits', () => {
      setCabinetState({
        cabinet: {
          panels: [
            { id: 'p1', coreMaterialId: 'PB-MEL', finishWidth: 580, finishHeight: 700 },
            { id: 'p2', coreMaterialId: 'PB-MEL', finishWidth: 2000, finishHeight: 1200 },
          ],
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'machine-size-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
      expect(rule.category).toBe('MACHINE');
    });

    it('should PASS when panel finishWidth is exactly 3000mm (at machine limit)', () => {
      setCabinetState({
        cabinet: {
          panels: [
            { id: 'p1', coreMaterialId: 'PB-MEL', finishWidth: 3000, finishHeight: 700 },
          ],
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'machine-size-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });

    it('should PASS when panel finishHeight is exactly 1500mm (at machine limit)', () => {
      setCabinetState({
        cabinet: {
          panels: [
            { id: 'p1', coreMaterialId: 'PB-MEL', finishWidth: 500, finishHeight: 1500 },
          ],
        },
      });
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'machine-size-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
    });
  });

  // ------------------------------------------
  // SAFETY RULES
  // ------------------------------------------

  describe('Safety - Clearance', () => {
    it('should always include clearance-ok as PASS', () => {
      setCabinetState();
      const result = useSpecStore.getState().runValidation();

      const rule = findRule(result.rules, 'clearance-ok');
      expect(rule).toBeDefined();
      expect(rule.status).toBe('PASS');
      expect(rule.category).toBe('SAFETY');
    });
  });

  // ------------------------------------------
  // VALIDATION RESULT TOTALS
  // ------------------------------------------

  describe('Validation Result Totals', () => {
    it('should have ok=true when no FAIL rules (all PASS, default cabinet)', () => {
      setCabinetState();
      const result = useSpecStore.getState().runValidation();

      expect(result.ok).toBe(true);
      expect(result.failCount).toBe(0);
      expect(result.passCount).toBeGreaterThan(0);
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('should have ok=true even when WARN rules exist (no FAILs)', () => {
      setCabinetState({
        cabinet: {
          dimensions: { width: 1500 }, // triggers max-width WARN
        },
      });
      const result = useSpecStore.getState().runValidation();

      expect(result.ok).toBe(true);
      expect(result.warnCount).toBeGreaterThanOrEqual(1);
      expect(result.failCount).toBe(0);
    });

    it('should have ok=false when any FAIL rule exists', () => {
      setCabinetState({
        cabinet: {
          dimensions: { width: 100 }, // triggers min-width FAIL
        },
      });
      const result = useSpecStore.getState().runValidation();

      expect(result.ok).toBe(false);
      expect(result.failCount).toBeGreaterThanOrEqual(1);
    });

    it('should count rules correctly with multiple categories failing', () => {
      setCabinetState({
        cabinet: {
          dimensions: { width: 100, height: 100, depth: 100 },
          panels: [
            { id: 'p1', coreMaterialId: null, finishWidth: 5000, finishHeight: 2000 },
          ],
          materials: { defaultCore: null },
        },
      });
      const result = useSpecStore.getState().runValidation();

      // FAILs: min-width (100<200), min-height (100<300), min-depth (100<200),
      //         material-missing, machine-size
      expect(result.failCount).toBe(5);
      expect(result.ok).toBe(false);

      // passCount + warnCount + failCount should equal total rules
      expect(result.passCount + result.warnCount + result.failCount).toBe(result.rules.length);
    });

    it('should store validation result in store state', () => {
      setCabinetState();
      const result = useSpecStore.getState().runValidation();
      const stored = useSpecStore.getState().validation;

      expect(stored).toBe(result);
      expect(stored?.ok).toBe(true);
    });

    it('should include a timestamp in validation result', () => {
      const before = Date.now();
      setCabinetState();
      const result = useSpecStore.getState().runValidation();
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });

  // ------------------------------------------
  // COMBINED / EDGE CASES
  // ------------------------------------------

  describe('Edge Cases', () => {
    it('should handle all dimensions at exact lower boundaries (200, 300, 200)', () => {
      setCabinetState({
        cabinet: {
          dimensions: { width: 200, height: 300, depth: 200 },
        },
      });
      const result = useSpecStore.getState().runValidation();

      expect(findRule(result.rules, 'width-ok')?.status).toBe('PASS');
      expect(findRule(result.rules, 'height-ok')?.status).toBe('PASS');
      expect(findRule(result.rules, 'depth-ok')?.status).toBe('PASS');
      expect(result.ok).toBe(true);
    });

    it('should handle all dimensions at exact upper boundaries (1200, 2400, 800)', () => {
      setCabinetState({
        cabinet: {
          dimensions: { width: 1200, height: 2400, depth: 800 },
        },
      });
      const result = useSpecStore.getState().runValidation();

      expect(findRule(result.rules, 'width-ok')?.status).toBe('PASS');
      expect(findRule(result.rules, 'height-ok')?.status).toBe('PASS');
      expect(findRule(result.rules, 'depth-ok')?.status).toBe('PASS');
    });

    it('should handle negative dimensions as FAIL', () => {
      setCabinetState({
        cabinet: {
          dimensions: { width: -10, height: -5, depth: -1 },
        },
      });
      const result = useSpecStore.getState().runValidation();

      expect(findRule(result.rules, 'min-width')?.status).toBe('FAIL');
      expect(findRule(result.rules, 'min-height')?.status).toBe('FAIL');
      expect(findRule(result.rules, 'min-depth')?.status).toBe('FAIL');
      expect(result.failCount).toBeGreaterThanOrEqual(3);
    });

    it('should handle multiple WARN categories simultaneously', () => {
      setCabinetState({
        cabinet: {
          dimensions: { width: 1500, height: 2500, depth: 900 },
          structure: { hasBackPanel: false, dividerCount: 0, shelfCount: 1 },
        },
      });
      const result = useSpecStore.getState().runValidation();

      // WARNs: max-width, max-height, max-depth, shelf-span (1500>800), back-panel-tall (2500>1000)
      expect(result.warnCount).toBeGreaterThanOrEqual(5);
      expect(result.failCount).toBe(0);
      expect(result.ok).toBe(true);
    });

    it('should handle empty panels array', () => {
      setCabinetState({
        cabinet: {
          panels: [],
          materials: { defaultCore: 'PB-MEL' },
        },
      });
      const result = useSpecStore.getState().runValidation();

      // No panels means no material-missing, no machine-size failures
      expect(findRule(result.rules, 'material-ok')?.status).toBe('PASS');
      expect(findRule(result.rules, 'machine-size-ok')?.status).toBe('PASS');
    });
  });
});

// ============================================
// GATE STATUS TESTS
// ============================================

describe('useSpecStore - Gate Status', () => {
  beforeEach(() => {
    resetSpecStore();
    setCabinetState();
  });

  describe('canFreeze', () => {
    it('should be true when DRAFT and validation passes', () => {
      useSpecStore.setState({ specState: 'DRAFT' });
      useSpecStore.getState().runValidation();
      const gate = useSpecStore.getState().gateStatus;

      expect(gate.canFreeze).toBe(true);
    });

    it('should be false when DRAFT but validation fails', () => {
      setCabinetState({ cabinet: { dimensions: { width: 50 } } });
      useSpecStore.setState({ specState: 'DRAFT' });
      useSpecStore.getState().runValidation();
      const gate = useSpecStore.getState().gateStatus;

      expect(gate.canFreeze).toBe(false);
    });

    it('should be false when FROZEN (even with valid)', () => {
      useSpecStore.setState({ specState: 'FROZEN' });
      useSpecStore.getState().runValidation();
      const gate = useSpecStore.getState().gateStatus;

      expect(gate.canFreeze).toBe(false);
    });

    it('should be false when RELEASED', () => {
      useSpecStore.setState({ specState: 'RELEASED' });
      useSpecStore.getState().runValidation();
      const gate = useSpecStore.getState().gateStatus;

      expect(gate.canFreeze).toBe(false);
    });

    it('should be false when validation has not been run', () => {
      useSpecStore.setState({ specState: 'DRAFT', validation: null });
      useSpecStore.getState().updateGateStatus();
      const gate = useSpecStore.getState().gateStatus;

      expect(gate.canFreeze).toBe(false);
      expect(gate.blockers).toContain('Run validation first');
    });
  });

  describe('canRelease', () => {
    it('should be true when FROZEN and validation passes', () => {
      useSpecStore.setState({ specState: 'FROZEN' });
      useSpecStore.getState().runValidation();
      const gate = useSpecStore.getState().gateStatus;

      expect(gate.canRelease).toBe(true);
    });

    it('should be false when FROZEN but validation fails', () => {
      setCabinetState({ cabinet: { dimensions: { width: 50 } } });
      useSpecStore.setState({ specState: 'FROZEN' });
      useSpecStore.getState().runValidation();
      const gate = useSpecStore.getState().gateStatus;

      expect(gate.canRelease).toBe(false);
    });

    it('should be false when DRAFT (even with valid)', () => {
      useSpecStore.setState({ specState: 'DRAFT' });
      useSpecStore.getState().runValidation();
      const gate = useSpecStore.getState().gateStatus;

      expect(gate.canRelease).toBe(false);
    });

    it('should be false when RELEASED', () => {
      useSpecStore.setState({ specState: 'RELEASED' });
      useSpecStore.getState().runValidation();
      const gate = useSpecStore.getState().gateStatus;

      expect(gate.canRelease).toBe(false);
    });
  });

  describe('canExport (gate-level)', () => {
    it('should be true when FROZEN and validation passes', () => {
      useSpecStore.setState({ specState: 'FROZEN' });
      useSpecStore.getState().runValidation();
      const gate = useSpecStore.getState().gateStatus;

      expect(gate.canExport).toBe(true);
    });

    it('should be true when RELEASED and validation passes', () => {
      useSpecStore.setState({ specState: 'RELEASED' });
      useSpecStore.getState().runValidation();
      const gate = useSpecStore.getState().gateStatus;

      expect(gate.canExport).toBe(true);
    });

    it('should be false when DRAFT', () => {
      useSpecStore.setState({ specState: 'DRAFT' });
      useSpecStore.getState().runValidation();
      const gate = useSpecStore.getState().gateStatus;

      expect(gate.canExport).toBe(false);
    });

    it('should be false when FROZEN but validation fails', () => {
      setCabinetState({ cabinet: { dimensions: { width: 50 } } });
      useSpecStore.setState({ specState: 'FROZEN' });
      useSpecStore.getState().runValidation();
      const gate = useSpecStore.getState().gateStatus;

      expect(gate.canExport).toBe(false);
    });
  });

  describe('blockers', () => {
    it('should include "Run validation first" when validation is null', () => {
      useSpecStore.setState({ specState: 'DRAFT', validation: null });
      useSpecStore.getState().updateGateStatus();
      const gate = useSpecStore.getState().gateStatus;

      expect(gate.blockers).toContain('Run validation first');
    });

    it('should include fail count message when validation has failures', () => {
      setCabinetState({ cabinet: { dimensions: { width: 50 } } });
      useSpecStore.setState({ specState: 'DRAFT' });
      useSpecStore.getState().runValidation();
      const gate = useSpecStore.getState().gateStatus;

      const failBlocker = gate.blockers.find((b: string) => b.includes('validation error'));
      expect(failBlocker).toBeDefined();
    });

    it('should include FROZEN/RELEASED blocker when in DRAFT for export', () => {
      useSpecStore.setState({ specState: 'DRAFT' });
      useSpecStore.getState().runValidation();
      const gate = useSpecStore.getState().gateStatus;

      const stateBlocker = gate.blockers.find((b: string) => b.includes('FROZEN or RELEASED'));
      expect(stateBlocker).toBeDefined();
    });

    it('should have no blockers when FROZEN and valid', () => {
      useSpecStore.setState({ specState: 'FROZEN' });
      useSpecStore.getState().runValidation();
      const gate = useSpecStore.getState().gateStatus;

      expect(gate.blockers).toHaveLength(0);
    });
  });
});

// ============================================
// FORMAT-SPECIFIC EXPORT TESTS (canExport method)
// ============================================

describe('useSpecStore - canExport(format)', () => {
  beforeEach(() => {
    resetSpecStore();
    setCabinetState();
  });

  describe('when syncStatus is not synced', () => {
    it('should return false for any format when offline', () => {
      useSpecStore.setState({ specState: 'FROZEN', syncStatus: 'offline' });
      useSpecStore.getState().runValidation();

      expect(useSpecStore.getState().canExport('CUT_LIST')).toBe(false);
      expect(useSpecStore.getState().canExport('DXF')).toBe(false);
      expect(useSpecStore.getState().canExport('CNC')).toBe(false);
    });

    it('should return false for any format when pending', () => {
      useSpecStore.setState({ specState: 'FROZEN', syncStatus: 'pending' });
      useSpecStore.getState().runValidation();

      expect(useSpecStore.getState().canExport('CUT_LIST')).toBe(false);
      expect(useSpecStore.getState().canExport('DXF')).toBe(false);
      expect(useSpecStore.getState().canExport('CNC')).toBe(false);
    });

    it('should return false for any format when error', () => {
      useSpecStore.setState({ specState: 'FROZEN', syncStatus: 'error' });
      useSpecStore.getState().runValidation();

      expect(useSpecStore.getState().canExport('CUT_LIST')).toBe(false);
      expect(useSpecStore.getState().canExport('DXF')).toBe(false);
      expect(useSpecStore.getState().canExport('CNC')).toBe(false);
    });
  });

  describe('DRAFT state (synced)', () => {
    beforeEach(() => {
      useSpecStore.setState({ specState: 'DRAFT', syncStatus: 'synced' });
      useSpecStore.getState().runValidation();
    });

    it('should not allow CUT_LIST export in DRAFT', () => {
      expect(useSpecStore.getState().canExport('CUT_LIST')).toBe(false);
    });

    it('should not allow DXF export in DRAFT', () => {
      expect(useSpecStore.getState().canExport('DXF')).toBe(false);
    });

    it('should not allow CNC export in DRAFT', () => {
      expect(useSpecStore.getState().canExport('CNC')).toBe(false);
    });
  });

  describe('FROZEN state (synced, valid)', () => {
    beforeEach(() => {
      useSpecStore.setState({ specState: 'FROZEN', syncStatus: 'synced' });
      useSpecStore.getState().runValidation();
    });

    it('should allow CUT_LIST export in FROZEN', () => {
      expect(useSpecStore.getState().canExport('CUT_LIST')).toBe(true);
    });

    it('should allow DXF export in FROZEN', () => {
      expect(useSpecStore.getState().canExport('DXF')).toBe(true);
    });

    it('should NOT allow CNC export in FROZEN (requires RELEASED)', () => {
      expect(useSpecStore.getState().canExport('CNC')).toBe(false);
    });
  });

  describe('RELEASED state (synced, valid)', () => {
    beforeEach(() => {
      useSpecStore.setState({ specState: 'RELEASED', syncStatus: 'synced' });
      useSpecStore.getState().runValidation();
    });

    it('should allow CUT_LIST export in RELEASED', () => {
      expect(useSpecStore.getState().canExport('CUT_LIST')).toBe(true);
    });

    it('should allow DXF export in RELEASED', () => {
      expect(useSpecStore.getState().canExport('DXF')).toBe(true);
    });

    it('should allow CNC export in RELEASED', () => {
      expect(useSpecStore.getState().canExport('CNC')).toBe(true);
    });
  });

  describe('FROZEN state with invalid validation (synced)', () => {
    it('should not allow any format when validation fails', () => {
      setCabinetState({ cabinet: { dimensions: { width: 50 } } });
      useSpecStore.setState({ specState: 'FROZEN', syncStatus: 'synced' });
      useSpecStore.getState().runValidation();

      expect(useSpecStore.getState().canExport('CUT_LIST')).toBe(false);
      expect(useSpecStore.getState().canExport('DXF')).toBe(false);
      expect(useSpecStore.getState().canExport('CNC')).toBe(false);
    });
  });

  describe('Unknown format', () => {
    it('should return false for an unknown export format', () => {
      useSpecStore.setState({ specState: 'RELEASED', syncStatus: 'synced' });
      useSpecStore.getState().runValidation();

      expect(useSpecStore.getState().canExport('UNKNOWN' as any)).toBe(false);
    });
  });
});

// ============================================
// isWriteAllowed TESTS
// ============================================

describe('useSpecStore - isWriteAllowed', () => {
  beforeEach(() => {
    resetSpecStore();
  });

  it('should return true in DRAFT state', () => {
    useSpecStore.setState({ specState: 'DRAFT' });
    expect(useSpecStore.getState().isWriteAllowed()).toBe(true);
  });

  it('should return false in FROZEN state', () => {
    useSpecStore.setState({ specState: 'FROZEN' });
    expect(useSpecStore.getState().isWriteAllowed()).toBe(false);
  });

  it('should return false in RELEASED state', () => {
    useSpecStore.setState({ specState: 'RELEASED' });
    expect(useSpecStore.getState().isWriteAllowed()).toBe(false);
  });
});
