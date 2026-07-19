/** @vitest-environment jsdom */
/**
 * useCabinetStore Integration Tests
 *
 * Comprehensive test suite for the Zustand+Immer cabinet store.
 * Covers: creation, dimensions, panels, materials, edges, structure,
 * shelf/divider management, computed values, multi-cabinet, drawers, doors.
 *
 * @version 2.0.0 - T021 Full Integration Coverage
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCabinetStore } from '../useCabinetStore';

// ============================================
// HELPERS
// ============================================

/** Reset store to clean state and create a default BASE cabinet */
function resetAndCreate(type: 'BASE' | 'WALL' | 'TALL' | 'DRAWER' | 'CORNER' = 'BASE', name = 'Test Cabinet') {
  useCabinetStore.setState({
    cabinets: [],
    cabinet: null,
    activeCabinetId: null,
    selectedPanelId: null,
    hiddenCabinetIds: [],
  });
  useCabinetStore.getState().createCabinet(type, name);
  return useCabinetStore.getState();
}

/** Get current cabinet (non-null assertion safe in tests after create) */
function getCabinet() {
  return useCabinetStore.getState().cabinet!;
}

/** Find a panel by role */
function findPanel(role: string) {
  return getCabinet().panels.find(p => p.role === role);
}

/** Find all panels by role */
function findPanels(role: string) {
  return getCabinet().panels.filter(p => p.role === role);
}

// ============================================
// 1. CABINET CREATION
// ============================================

describe('Cabinet Creation', () => {
  beforeEach(() => resetAndCreate());

  it('should create a cabinet with correct type', () => {
    expect(getCabinet().type).toBe('BASE');
  });

  it('should create a cabinet with correct name', () => {
    expect(getCabinet().name).toBe('Test Cabinet');
  });

  it('should create a cabinet with a unique ID', () => {
    expect(getCabinet().id).toBeTruthy();
    expect(getCabinet().id).toContain('panel-');
  });

  it('should set default dimensions', () => {
    const dims = getCabinet().dimensions;
    expect(dims.width).toBe(600);

    // CHANGED 720 -> 760, because the test encoded a WRONG CONSTANT, not because the code
    // regressed. 720 is the EUROPEAN carcass height. The owner of the Thai kitchen
    // business this system is built for confirms 760, and that outranks the published
    // corpus, which describes a different market's practice. A European tenant gets 720
    // from MARKET_HEIGHT_PROFILES.EU rather than from this default.
    expect(dims.height).toBe(760);

    // CHANGED 560 -> 600, because the test encoded a WRONG CONSTANT, not because the
    // code regressed. 600 is the base carcass depth Thai sources, JIS A0017:2018 and
    // AU all specify; JIS does not list 560 at all. 560 remains selectable as a
    // shallow/UK profile (BASE_DEPTH_SET_MM).
    expect(dims.depth).toBe(600);

    // CHANGED 100 -> 70, likewise. toeKickHeight is no longer a literal anywhere: it is
    // DERIVED as counterHeight(850 TH) - carcass(760) - worktop(20) = 70.
    // The old 100 built a counter at 100 + 720 + 18.6 = 838.6mm — 11.4mm below the Thai
    // 850 target, and 61.4mm below the 900 this codebase used to declare.
    // 70 is not an arbitrary result: it is EXACTLY the minimum height of the adjustable
    // leg the owner actually buys, so the Thai default stands with every leg wound fully
    // down and 100% of its adjustment available as floor-levelling headroom.
    // See src/core/catalog/PlinthLegCatalog.ts and __tests__/heightStack.test.ts.
    expect(dims.toeKickHeight).toBe(70);
  });

  it('should set default structure', () => {
    const s = getCabinet().structure;
    expect(s.topJoint).toBe('INSET');
    expect(s.bottomJoint).toBe('INSET');
    expect(s.hasBackPanel).toBe(true);
    expect(s.shelfCount).toBe(1);
    expect(s.dividerCount).toBe(0);
  });

  it('should set default materials', () => {
    const m = getCabinet().materials;
    expect(m.defaultCore).toBe('core-hmr-18');
    expect(m.defaultSurface).toBe('surf-hpl-grey-oak');
    expect(m.defaultEdge).toBe('edge-pvc-grey-10');
  });

  it('should generate panels on creation', () => {
    expect(getCabinet().panels.length).toBeGreaterThan(0);
  });

  it('should set the cabinet as active', () => {
    const state = useCabinetStore.getState();
    expect(state.activeCabinetId).toBe(getCabinet().id);
    expect(state.cabinet).not.toBeNull();
  });

  it('should add cabinet to cabinets array', () => {
    expect(useCabinetStore.getState().cabinets).toHaveLength(1);
  });

  it('should create a cabinet with timestamps', () => {
    expect(getCabinet().createdAt).toBeGreaterThan(0);
    expect(getCabinet().updatedAt).toBeGreaterThan(0);
  });

  it('should create default cabinet when no args provided', () => {
    useCabinetStore.setState({ cabinets: [], cabinet: null, activeCabinetId: null });
    useCabinetStore.getState().createCabinet();
    expect(getCabinet().type).toBe('BASE');
    expect(getCabinet().name).toBe('Base Cabinet');
  });

  it('should apply hardware config on creation', () => {
    expect(getCabinet().hardware).toBeDefined();
    expect(getCabinet().hardware?.minifixConfig).toBeDefined();
  });
});

// ============================================
// 2. DIMENSION UPDATES
// ============================================

describe('Dimension Updates', () => {
  beforeEach(() => resetAndCreate());

  it('should update width', () => {
    useCabinetStore.getState().setDimension('width', 800);
    expect(getCabinet().dimensions.width).toBe(800);
  });

  it('should update height', () => {
    useCabinetStore.getState().setDimension('height', 900);
    expect(getCabinet().dimensions.height).toBe(900);
  });

  it('should update depth', () => {
    useCabinetStore.getState().setDimension('depth', 600);
    expect(getCabinet().dimensions.depth).toBe(600);
  });

  it('should update toeKickHeight', () => {
    useCabinetStore.getState().setDimension('toeKickHeight', 150);
    expect(getCabinet().dimensions.toeKickHeight).toBe(150);
  });

  it('should regenerate panels after width change', () => {
    const panelsBefore = getCabinet().panels.map(p => p.id);
    useCabinetStore.getState().setDimension('width', 800);
    const panelsAfter = getCabinet().panels.map(p => p.id);
    // Panel IDs should change because panels are regenerated
    expect(panelsAfter).not.toEqual(panelsBefore);
  });

  it('should cascade width change to top panel finishWidth', () => {
    useCabinetStore.getState().setDimension('width', 800);
    const top = findPanel('TOP');
    expect(top).toBeDefined();
    // For INSET top joint: topW = W - 2*T
    // T is realThickness of default materials
    // Default core-hmr-18 (18mm) + surf-hpl-grey-oak (0.8mm) = 18.8 realThickness
    // With INSET: topW = 800 - 2*T
    expect(top!.finishWidth).toBeLessThan(800);
    expect(top!.finishWidth).toBeGreaterThan(700);
  });

  it('should cascade depth change to side panel finishWidth', () => {
    useCabinetStore.getState().setDimension('depth', 600);
    const side = findPanel('LEFT_SIDE');
    expect(side).toBeDefined();
    // Side finishWidth = D - backDepthReduction
    // With inset back panel construction, backDepthReduction = 0
    expect(side!.finishWidth).toBeGreaterThan(500);
    expect(side!.finishWidth).toBeLessThanOrEqual(600);
  });

  it('should cascade height change to side panel finishHeight', () => {
    useCabinetStore.getState().setDimension('height', 900);
    const side = findPanel('LEFT_SIDE');
    expect(side).toBeDefined();
    // Side height for INSET joints = full H
    expect(side!.finishHeight).toBe(900);
  });
});

// ============================================
// 3. PANEL GENERATION
// ============================================

describe('Panel Generation', () => {
  beforeEach(() => resetAndCreate());

  it('should create LEFT_SIDE panel', () => {
    expect(findPanel('LEFT_SIDE')).toBeDefined();
  });

  it('should create RIGHT_SIDE panel', () => {
    expect(findPanel('RIGHT_SIDE')).toBeDefined();
  });

  it('should create TOP panel', () => {
    expect(findPanel('TOP')).toBeDefined();
  });

  it('should create BOTTOM panel', () => {
    expect(findPanel('BOTTOM')).toBeDefined();
  });

  it('should create BACK panel when hasBackPanel is true', () => {
    expect(findPanel('BACK')).toBeDefined();
  });

  it('should create exactly 1 SHELF by default (shelfCount=1)', () => {
    const shelves = findPanels('SHELF');
    expect(shelves).toHaveLength(1);
  });

  it('should create 0 DIVIDERs by default (dividerCount=0)', () => {
    const dividers = findPanels('DIVIDER');
    expect(dividers).toHaveLength(0);
  });

  it('should create 7 panels total by default (L, R, T, B, Kickboard, Back, 1 Shelf)', () => {
    // Was 6 before the KICKBOARD role existed. DEFAULT_DIMENSIONS.toeKickHeight
    // is 100mm, so the default cabinet now also carries a plinth — a real part
    // with real cost that the old model left as open air.
    expect(getCabinet().panels).toHaveLength(7);
    expect(findPanels('KICKBOARD')).toHaveLength(1);
  });

  it('should assign correct names to panels', () => {
    expect(findPanel('LEFT_SIDE')!.name).toBe('Left Side');
    expect(findPanel('RIGHT_SIDE')!.name).toBe('Right Side');
    expect(findPanel('TOP')!.name).toBe('Top Panel');
    expect(findPanel('BOTTOM')!.name).toBe('Bottom Panel');
    expect(findPanel('BACK')!.name).toBe('Back Panel');
  });

  it('should set correct grain direction for side panels', () => {
    expect(findPanel('LEFT_SIDE')!.grainDirection).toBe('VERTICAL');
    expect(findPanel('RIGHT_SIDE')!.grainDirection).toBe('VERTICAL');
  });

  it('should set correct grain direction for horizontal panels', () => {
    expect(findPanel('TOP')!.grainDirection).toBe('HORIZONTAL');
    expect(findPanel('BOTTOM')!.grainDirection).toBe('HORIZONTAL');
  });

  it('should initialize all panels as visible', () => {
    getCabinet().panels.forEach(p => {
      expect(p.visible).toBe(true);
    });
  });

  it('should initialize all panels as not selected', () => {
    getCabinet().panels.forEach(p => {
      expect(p.selected).toBe(false);
    });
  });

  it('should assign core material to all panels', () => {
    getCabinet().panels.forEach(p => {
      expect(p.coreMaterialId).toBeTruthy();
    });
  });

  it('should assign edge materials to structural panels', () => {
    const left = findPanel('LEFT_SIDE')!;
    // Front edge should always be assigned
    expect(left.edges.top).toBeTruthy();
  });

  it('should not assign edges to back panel', () => {
    const back = findPanel('BACK')!;
    expect(back.edges.top).toBeNull();
    expect(back.edges.bottom).toBeNull();
    expect(back.edges.left).toBeNull();
    expect(back.edges.right).toBeNull();
  });

  it('should use MDF for back panel core', () => {
    expect(findPanel('BACK')!.coreMaterialId).toBe('core-mdf-6');
  });

  it('should assign surface material to faceA for structural panels', () => {
    const left = findPanel('LEFT_SIDE')!;
    expect(left.faces.faceA).toBeTruthy();
  });

  it('should assign 2-sided surface to back panel', () => {
    const back = findPanel('BACK')!;
    expect(back.faces.faceA).toBeTruthy();
    expect(back.faces.faceB).toBeTruthy();
  });
});

// ============================================
// 4. MATERIAL ASSIGNMENT
// ============================================

describe('Material Assignment', () => {
  let leftPanelId: string;

  beforeEach(() => {
    resetAndCreate();
    leftPanelId = findPanel('LEFT_SIDE')!.id;
  });

  it('should update panel core material', () => {
    useCabinetStore.getState().updatePanelMaterial(leftPanelId, 'core', 'core-pb-16');
    const panel = findPanel('LEFT_SIDE')!;
    expect(panel.coreMaterialId).toBe('core-pb-16');
  });

  it('should update panel faceA material', () => {
    useCabinetStore.getState().updatePanelMaterial(leftPanelId, 'faceA', 'surf-mel-white');
    const panel = findPanel('LEFT_SIDE')!;
    expect(panel.faces.faceA).toBe('surf-mel-white');
  });

  it('should update panel faceB material', () => {
    useCabinetStore.getState().updatePanelMaterial(leftPanelId, 'faceB', 'surf-mel-black');
    const panel = findPanel('LEFT_SIDE')!;
    expect(panel.faces.faceB).toBe('surf-mel-black');
  });

  it('should recalculate realThickness after core change', () => {
    const thickBefore = findPanel('LEFT_SIDE')!.computed.realThickness;
    // Change from 18mm core to 16mm core
    useCabinetStore.getState().updatePanelMaterial(leftPanelId, 'core', 'core-pb-16');
    const thickAfter = findPanel('LEFT_SIDE')!.computed.realThickness;
    expect(thickAfter).not.toBe(thickBefore);
    // 16mm core should be thinner
    expect(thickAfter).toBeLessThan(thickBefore);
  });

  it('should recalculate totals after material change', () => {
    // updatePanelMaterial recalculates cabinet totals via calculateTotals
    // but individual panel cost is not recomputed inline (only thickness is).
    // Verify that totalCost is the sum of panel costs (consistency check).
    useCabinetStore.getState().updatePanelMaterial(leftPanelId, 'core', 'core-ply-18');
    const cabinet = getCabinet();
    const expectedTotal = cabinet.panels.reduce((sum, p) => sum + p.computed.cost, 0);
    expect(cabinet.computed.totalCost).toBeCloseTo(expectedTotal, 2);
  });

  it('should update default core for all panels via setDefaultCore', () => {
    useCabinetStore.getState().setDefaultCore('core-pb-16');
    // After recalculate, panels get regenerated with new default
    const state = useCabinetStore.getState();
    expect(state.cabinet!.materials.defaultCore).toBe('core-pb-16');
  });

  it('should update default surface for all panels via setDefaultSurface', () => {
    useCabinetStore.getState().setDefaultSurface('surf-mel-white');
    expect(getCabinet().materials.defaultSurface).toBe('surf-mel-white');
  });

  it('should update default edge for all panels via setDefaultEdge', () => {
    useCabinetStore.getState().setDefaultEdge('edge-pvc-white-10');
    expect(getCabinet().materials.defaultEdge).toBe('edge-pvc-white-10');
  });

  it('should apply edge material to all non-back panels when setting default edge', () => {
    useCabinetStore.getState().setDefaultEdge('edge-pvc-white-10');
    const cabinet = getCabinet();
    cabinet.panels.forEach(p => {
      if (p.role !== 'BACK') {
        expect(p.edges.top).toBe('edge-pvc-white-10');
      }
    });
  });

  it('should not assign edges to back panel when setting default edge', () => {
    useCabinetStore.getState().setDefaultEdge('edge-pvc-white-10');
    const back = findPanel('BACK')!;
    // Back panel edges remain null because setDefaultEdge skips BACK
    expect(back.edges.top).toBeNull();
  });
});

// ============================================
// 5. EDGE UPDATES
// ============================================

describe('Edge Updates', () => {
  let leftPanelId: string;

  beforeEach(() => {
    resetAndCreate();
    leftPanelId = findPanel('LEFT_SIDE')!.id;
  });

  it('should update top edge of a panel', () => {
    useCabinetStore.getState().updatePanelEdge(leftPanelId, 'top', 'edge-pvc-white-20');
    expect(findPanel('LEFT_SIDE')!.edges.top).toBe('edge-pvc-white-20');
  });

  it('should update bottom edge of a panel', () => {
    useCabinetStore.getState().updatePanelEdge(leftPanelId, 'bottom', 'edge-pvc-white-20');
    expect(findPanel('LEFT_SIDE')!.edges.bottom).toBe('edge-pvc-white-20');
  });

  it('should update left edge of a panel', () => {
    useCabinetStore.getState().updatePanelEdge(leftPanelId, 'left', 'edge-pvc-white-20');
    expect(findPanel('LEFT_SIDE')!.edges.left).toBe('edge-pvc-white-20');
  });

  it('should update right edge of a panel', () => {
    useCabinetStore.getState().updatePanelEdge(leftPanelId, 'right', 'edge-pvc-white-20');
    expect(findPanel('LEFT_SIDE')!.edges.right).toBe('edge-pvc-white-20');
  });

  it('should clear edge by passing null', () => {
    useCabinetStore.getState().updatePanelEdge(leftPanelId, 'top', null);
    expect(findPanel('LEFT_SIDE')!.edges.top).toBeNull();
  });

  it('should recalculate cut dimensions after edge change', () => {
    const cutWidthBefore = findPanel('LEFT_SIDE')!.computed.cutWidth;
    // Change to thicker edge
    useCabinetStore.getState().updatePanelEdge(leftPanelId, 'left', 'edge-pvc-white-20');
    const cutWidthAfter = findPanel('LEFT_SIDE')!.computed.cutWidth;
    // Thicker edge should affect cut width
    expect(cutWidthAfter).not.toBe(cutWidthBefore);
  });

  it('should recalculate edge length after edge update', () => {
    // Remove all edges first
    useCabinetStore.getState().updatePanelEdge(leftPanelId, 'top', null);
    useCabinetStore.getState().updatePanelEdge(leftPanelId, 'bottom', null);
    useCabinetStore.getState().updatePanelEdge(leftPanelId, 'left', null);
    useCabinetStore.getState().updatePanelEdge(leftPanelId, 'right', null);
    const zeroLen = findPanel('LEFT_SIDE')!.computed.edgeLength;
    expect(zeroLen).toBe(0);

    // Add front edge back
    useCabinetStore.getState().updatePanelEdge(leftPanelId, 'top', 'edge-pvc-grey-10');
    const oneEdgeLen = findPanel('LEFT_SIDE')!.computed.edgeLength;
    expect(oneEdgeLen).toBeGreaterThan(0);
  });

  it('should update cabinet totals after edge change', () => {
    const totalsBefore = { ...getCabinet().computed };
    useCabinetStore.getState().updatePanelEdge(leftPanelId, 'top', null);
    const totalsAfter = getCabinet().computed;
    expect(totalsAfter.totalEdgeLength).not.toBe(totalsBefore.totalEdgeLength);
  });
});

// ============================================
// 6. STRUCTURE CHANGES
// ============================================

describe('Structure Changes', () => {
  beforeEach(() => resetAndCreate());

  it('should update shelf count', () => {
    useCabinetStore.getState().setShelfCount(3);
    expect(getCabinet().structure.shelfCount).toBe(3);
    expect(findPanels('SHELF')).toHaveLength(3);
  });

  it('should clamp shelf count to max 10', () => {
    useCabinetStore.getState().setShelfCount(15);
    expect(getCabinet().structure.shelfCount).toBe(10);
  });

  it('should clamp shelf count to min 0', () => {
    useCabinetStore.getState().setShelfCount(-5);
    expect(getCabinet().structure.shelfCount).toBe(0);
  });

  it('should update divider count', () => {
    useCabinetStore.getState().setDividerCount(2);
    expect(getCabinet().structure.dividerCount).toBe(2);
    expect(findPanels('DIVIDER')).toHaveLength(2);
  });

  it('should clamp divider count to max 5', () => {
    useCabinetStore.getState().setDividerCount(10);
    expect(getCabinet().structure.dividerCount).toBe(5);
  });

  it('should clamp divider count to min 0', () => {
    useCabinetStore.getState().setDividerCount(-3);
    expect(getCabinet().structure.dividerCount).toBe(0);
  });

  it('should regenerate panels when shelf count changes', () => {
    const idsBefore = getCabinet().panels.map(p => p.id);
    useCabinetStore.getState().setShelfCount(3);
    const idsAfter = getCabinet().panels.map(p => p.id);
    expect(idsAfter).not.toEqual(idsBefore);
  });

  it('should regenerate panels when divider count changes', () => {
    const countBefore = getCabinet().panels.length;
    useCabinetStore.getState().setDividerCount(2);
    const countAfter = getCabinet().panels.length;
    expect(countAfter).toBeGreaterThan(countBefore);
  });

  it('should set top joint type', () => {
    useCabinetStore.getState().setJointType('top', 'OVERLAY');
    expect(getCabinet().structure.topJoint).toBe('OVERLAY');
  });

  it('should set bottom joint type', () => {
    useCabinetStore.getState().setJointType('bottom', 'OVERLAY');
    expect(getCabinet().structure.bottomJoint).toBe('OVERLAY');
  });

  it('should affect panel dimensions when joint changes to OVERLAY', () => {
    // INSET: side is full height
    const insetSideH = findPanel('LEFT_SIDE')!.finishHeight;
    useCabinetStore.getState().setJointType('top', 'OVERLAY');
    const overlaySideH = findPanel('LEFT_SIDE')!.finishHeight;
    // OVERLAY: side should be shorter (top panel sits on top)
    expect(overlaySideH).toBeLessThan(insetSideH);
  });

  it('should toggle back panel', () => {
    expect(getCabinet().structure.hasBackPanel).toBe(true);
    useCabinetStore.getState().toggleBackPanel();
    expect(getCabinet().structure.hasBackPanel).toBe(false);
    expect(findPanel('BACK')).toBeUndefined();
  });

  it('should toggle back panel on again', () => {
    useCabinetStore.getState().toggleBackPanel(); // false
    useCabinetStore.getState().toggleBackPanel(); // true
    expect(getCabinet().structure.hasBackPanel).toBe(true);
    expect(findPanel('BACK')).toBeDefined();
  });

  it('should change back panel construction type', () => {
    useCabinetStore.getState().setBackPanelConstruction('overlay');
    expect(getCabinet().structure.backPanelConstruction).toBe('overlay');
  });

  it('should split shelves into segments when dividers are added', () => {
    useCabinetStore.getState().setShelfCount(1);
    useCabinetStore.getState().setDividerCount(1);
    const shelves = findPanels('SHELF');
    // With 1 divider, each shelf row gets split into 2 segments (a, b)
    expect(shelves).toHaveLength(2);
    // Shelf names should include segment letters
    const names = shelves.map(s => s.name).sort();
    expect(names).toContain('Main Shelf 1a');
    expect(names).toContain('Main Shelf 1b');
  });

  it('should create correct number of segments with multiple dividers', () => {
    useCabinetStore.getState().setShelfCount(2);
    useCabinetStore.getState().setDividerCount(2);
    const shelves = findPanels('SHELF');
    // 2 shelves * 3 segments = 6 shelf panels
    expect(shelves).toHaveLength(6);
  });
});

// ============================================
// 7. SHELF / DIVIDER ADDITION & REMOVAL
// ============================================

describe('Shelf and Divider Addition/Removal', () => {
  beforeEach(() => resetAndCreate());

  it('should increase panel count when adding shelves', () => {
    const countWith1 = getCabinet().panels.length;
    useCabinetStore.getState().setShelfCount(3);
    const countWith3 = getCabinet().panels.length;
    expect(countWith3).toBe(countWith1 + 2); // 2 more shelves
  });

  it('should decrease panel count when removing shelves', () => {
    useCabinetStore.getState().setShelfCount(3);
    const countWith3 = getCabinet().panels.length;
    useCabinetStore.getState().setShelfCount(1);
    const countWith1 = getCabinet().panels.length;
    expect(countWith1).toBe(countWith3 - 2);
  });

  it('should have zero shelves when setting shelf count to 0', () => {
    useCabinetStore.getState().setShelfCount(0);
    expect(findPanels('SHELF')).toHaveLength(0);
  });

  it('should add divider panels when increasing count', () => {
    useCabinetStore.getState().setDividerCount(1);
    expect(findPanels('DIVIDER')).toHaveLength(1);
    useCabinetStore.getState().setDividerCount(3);
    expect(findPanels('DIVIDER')).toHaveLength(3);
  });

  it('should remove dividers when decreasing count', () => {
    useCabinetStore.getState().setDividerCount(3);
    useCabinetStore.getState().setDividerCount(1);
    expect(findPanels('DIVIDER')).toHaveLength(1);
  });

  it('should name shelves sequentially', () => {
    useCabinetStore.getState().setShelfCount(3);
    const shelves = findPanels('SHELF');
    const names = shelves.map(s => s.name).sort();
    expect(names).toContain('Main Shelf 1');
    expect(names).toContain('Main Shelf 2');
    expect(names).toContain('Main Shelf 3');
  });

  it('should name dividers sequentially', () => {
    useCabinetStore.getState().setDividerCount(3);
    const dividers = findPanels('DIVIDER');
    const names = dividers.map(d => d.name).sort();
    expect(names).toContain('Main Divider 1');
    expect(names).toContain('Main Divider 2');
    expect(names).toContain('Main Divider 3');
  });

  it('should add sub shelf in compartment', () => {
    useCabinetStore.getState().addShelfInCompartment(0, 0);
    const shelves = findPanels('SHELF');
    const subShelves = shelves.filter(s => s.name.startsWith('Sub'));
    expect(subShelves).toHaveLength(1);
    expect(subShelves[0].name).toBe('Sub Shelf 1');
  });

  it('should add sub divider in compartment', () => {
    useCabinetStore.getState().addDividerInCompartment(0, 0);
    const dividers = findPanels('DIVIDER');
    const subDividers = dividers.filter(d => d.name.startsWith('Sub'));
    expect(subDividers).toHaveLength(1);
    expect(subDividers[0].name).toBe('Sub Divider 1');
  });

  it('should remove sub panel via removePanel', () => {
    useCabinetStore.getState().addShelfInCompartment(0, 0);
    const subShelf = findPanels('SHELF').find(s => s.name.startsWith('Sub'));
    expect(subShelf).toBeDefined();

    useCabinetStore.getState().removePanel(subShelf!.id);
    const remaining = findPanels('SHELF').filter(s => s.name.startsWith('Sub'));
    expect(remaining).toHaveLength(0);
  });

  it('should not allow removal of main panels', () => {
    const leftId = findPanel('LEFT_SIDE')!.id;
    const countBefore = getCabinet().panels.length;
    useCabinetStore.getState().removePanel(leftId);
    // Main panels should not be removed
    expect(getCabinet().panels.length).toBe(countBefore);
  });
});

// ============================================
// 8. COMPUTED VALUES (Cost / CO2)
// ============================================

describe('Computed Values', () => {
  beforeEach(() => resetAndCreate());

  it('should compute totalCost as sum of panel costs', () => {
    const panels = getCabinet().panels;
    const expectedTotal = panels.reduce((sum, p) => sum + p.computed.cost, 0);
    expect(getCabinet().computed.totalCost).toBeCloseTo(expectedTotal, 2);
  });

  it('should compute totalCO2 as sum of panel CO2', () => {
    const panels = getCabinet().panels;
    const expectedCO2 = panels.reduce((sum, p) => sum + p.computed.co2, 0);
    expect(getCabinet().computed.totalCO2).toBeCloseTo(expectedCO2, 2);
  });

  it('should compute correct panelCount', () => {
    expect(getCabinet().computed.panelCount).toBe(getCabinet().panels.length);
  });

  it('should compute totalSurfaceArea as sum of panel surface areas', () => {
    const panels = getCabinet().panels;
    const expected = panels.reduce((sum, p) => sum + p.computed.surfaceArea, 0);
    expect(getCabinet().computed.totalSurfaceArea).toBeCloseTo(expected, 4);
  });

  it('should compute totalEdgeLength as sum of panel edge lengths', () => {
    const panels = getCabinet().panels;
    const expected = panels.reduce((sum, p) => sum + p.computed.edgeLength, 0);
    expect(getCabinet().computed.totalEdgeLength).toBeCloseTo(expected, 4);
  });

  it('should have non-zero totalCost', () => {
    expect(getCabinet().computed.totalCost).toBeGreaterThan(0);
  });

  it('should have non-zero totalCO2', () => {
    expect(getCabinet().computed.totalCO2).toBeGreaterThan(0);
  });

  it('should update cost when more shelves are added', () => {
    const costWith1 = getCabinet().computed.totalCost;
    useCabinetStore.getState().setShelfCount(5);
    const costWith5 = getCabinet().computed.totalCost;
    expect(costWith5).toBeGreaterThan(costWith1);
  });

  it('should update panelCount when structure changes', () => {
    const count1 = getCabinet().computed.panelCount;
    useCabinetStore.getState().setShelfCount(4);
    const count4 = getCabinet().computed.panelCount;
    expect(count4).toBeGreaterThan(count1);
  });

  it('should have positive surfaceArea for each panel', () => {
    getCabinet().panels.forEach(p => {
      expect(p.computed.surfaceArea).toBeGreaterThan(0);
    });
  });

  it('should compute correct cutWidth (finishWidth minus edges)', () => {
    const left = findPanel('LEFT_SIDE')!;
    // cutWidth = finishWidth - leftEdge - rightEdge (approx)
    expect(left.computed.cutWidth).toBeLessThanOrEqual(left.finishWidth);
    expect(left.computed.cutWidth).toBeGreaterThan(0);
  });

  it('should compute correct cutHeight (finishHeight minus edges)', () => {
    const left = findPanel('LEFT_SIDE')!;
    expect(left.computed.cutHeight).toBeLessThanOrEqual(left.finishHeight);
    expect(left.computed.cutHeight).toBeGreaterThan(0);
  });
});

// ============================================
// 9. PANEL DIMENSION ACCURACY
// ============================================

describe('Panel Dimension Accuracy', () => {
  beforeEach(() => resetAndCreate());

  it('should compute left/right side panels with same dimensions', () => {
    const left = findPanel('LEFT_SIDE')!;
    const right = findPanel('RIGHT_SIDE')!;
    expect(left.finishWidth).toBe(right.finishWidth);
    expect(left.finishHeight).toBe(right.finishHeight);
  });

  it('should compute top and bottom with same depth', () => {
    const top = findPanel('TOP')!;
    const bottom = findPanel('BOTTOM')!;
    expect(top.finishHeight).toBe(bottom.finishHeight);
  });

  it('should compute top/bottom width based on INSET joint', () => {
    const T = findPanel('LEFT_SIDE')!.computed.realThickness;
    const W = getCabinet().dimensions.width;
    const top = findPanel('TOP')!;
    // INSET: topW = W - 2*T
    expect(top.finishWidth).toBeCloseTo(W - 2 * T, 0);
  });

  it('should compute side height as full body height for INSET joints', () => {
    const H = getCabinet().dimensions.height;
    const side = findPanel('LEFT_SIDE')!;
    // Both INSET: side = full H
    expect(side.finishHeight).toBe(H);
  });

  it('should reduce side height for OVERLAY top joint', () => {
    const H = getCabinet().dimensions.height;
    useCabinetStore.getState().setJointType('top', 'OVERLAY');
    const side = findPanel('LEFT_SIDE')!;
    const T = side.computed.realThickness;
    // Only top is OVERLAY: side = H - T (top panel thickness)
    expect(side.finishHeight).toBeCloseTo(H - T, 0);
  });

  it('should compute correct shelf depth', () => {
    const shelf = findPanel('SHELF');
    expect(shelf).toBeDefined();
    // Shelf finishHeight is its depth (horizontal panel)
    expect(shelf!.finishHeight).toBeGreaterThan(0);
    expect(shelf!.finishHeight).toBeLessThan(getCabinet().dimensions.depth);
  });

  it('should compute shelf width as internal width (no dividers)', () => {
    const shelf = findPanels('SHELF')[0];
    const T = findPanel('LEFT_SIDE')!.computed.realThickness;
    const W = getCabinet().dimensions.width;
    // Internal width = W - 2*T (rounded to 1 decimal)
    expect(shelf.finishWidth).toBeCloseTo(W - 2 * T, 0);
  });

  it('should correctly position left side panel at negative X', () => {
    const left = findPanel('LEFT_SIDE')!;
    expect(left.position[0]).toBeLessThan(0);
  });

  it('should correctly position right side panel at positive X', () => {
    const right = findPanel('RIGHT_SIDE')!;
    expect(right.position[0]).toBeGreaterThan(0);
  });

  it('should position shelves between bottom and top panels', () => {
    const bottom = findPanel('BOTTOM')!;
    const top = findPanel('TOP')!;
    const shelf = findPanels('SHELF')[0];
    expect(shelf.position[1]).toBeGreaterThan(bottom.position[1]);
    expect(shelf.position[1]).toBeLessThan(top.position[1]);
  });

  it('should have dividers at full usable height', () => {
    useCabinetStore.getState().setDividerCount(1);
    const divider = findPanels('DIVIDER')[0];
    const T = findPanel('LEFT_SIDE')!.computed.realThickness;
    const H = getCabinet().dimensions.height;
    const usableHeight = H - 2 * T;
    expect(divider.finishHeight).toBeCloseTo(usableHeight, 0);
  });

  it('should evenly space dividers', () => {
    useCabinetStore.getState().setDividerCount(2);
    const dividers = findPanels('DIVIDER').sort((a, b) => a.position[0] - b.position[0]);
    expect(dividers).toHaveLength(2);
    // The two dividers should be at roughly 1/3 and 2/3 of internal width
    const T = findPanel('LEFT_SIDE')!.computed.realThickness;
    const W = getCabinet().dimensions.width;
    const leftEdge = -W / 2 + T;
    const rightEdge = W / 2 - T;
    const span = rightEdge - leftEdge;
    const expected1 = leftEdge + span / 3;
    const expected2 = leftEdge + 2 * span / 3;
    expect(dividers[0].position[0]).toBeCloseTo(expected1, 0);
    expect(dividers[1].position[0]).toBeCloseTo(expected2, 0);
  });

  it('should update all panel dimensions after width change', () => {
    useCabinetStore.getState().setDimension('width', 900);
    const T = findPanel('LEFT_SIDE')!.computed.realThickness;
    const top = findPanel('TOP')!;
    // Top width should reflect new cabinet width
    expect(top.finishWidth).toBeCloseTo(900 - 2 * T, 0);
  });
});

// ============================================
// 10. MULTI-CABINET MANAGEMENT
// ============================================

describe('Multi-Cabinet Management', () => {
  beforeEach(() => resetAndCreate());

  it('should add a second cabinet', () => {
    useCabinetStore.getState().addCabinet('WALL', 'Wall Cabinet');
    expect(useCabinetStore.getState().cabinets).toHaveLength(2);
  });

  it('should switch active cabinet to newly added one', () => {
    const newCab = useCabinetStore.getState().addCabinet('WALL', 'Wall Cabinet');
    expect(useCabinetStore.getState().activeCabinetId).toBe(newCab.id);
    expect(useCabinetStore.getState().cabinet?.id).toBe(newCab.id);
  });

  it('should select (switch to) a specific cabinet', () => {
    const firstId = getCabinet().id;
    useCabinetStore.getState().addCabinet('WALL', 'Wall Cabinet');
    // Switch back to first
    useCabinetStore.getState().selectCabinet(firstId);
    expect(useCabinetStore.getState().activeCabinetId).toBe(firstId);
    expect(useCabinetStore.getState().cabinet?.id).toBe(firstId);
  });

  it('should remove a cabinet', () => {
    const newCab = useCabinetStore.getState().addCabinet('WALL', 'Wall Cabinet');
    useCabinetStore.getState().removeCabinet(newCab.id);
    expect(useCabinetStore.getState().cabinets).toHaveLength(1);
  });

  it('should select another cabinet after removing the active one', () => {
    const firstId = getCabinet().id;
    useCabinetStore.getState().addCabinet('WALL', 'Wall Cabinet');
    const secondId = useCabinetStore.getState().activeCabinetId!;
    useCabinetStore.getState().removeCabinet(secondId);
    // Should fall back to first cabinet
    expect(useCabinetStore.getState().activeCabinetId).toBe(firstId);
  });

  it('should set cabinet and active to null when all removed', () => {
    const id = getCabinet().id;
    useCabinetStore.getState().removeCabinet(id);
    expect(useCabinetStore.getState().cabinet).toBeNull();
    expect(useCabinetStore.getState().activeCabinetId).toBeNull();
  });

  it('should deselect all cabinets when passing null to selectCabinet', () => {
    useCabinetStore.getState().selectCabinet(null);
    expect(useCabinetStore.getState().activeCabinetId).toBeNull();
    expect(useCabinetStore.getState().cabinet).toBeNull();
  });

  it('should duplicate a cabinet', () => {
    const firstId = getCabinet().id;
    const dup = useCabinetStore.getState().duplicateCabinet(firstId);
    expect(dup).not.toBeNull();
    expect(dup!.id).not.toBe(firstId);
    expect(dup!.name).toContain('(Copy)');
    expect(useCabinetStore.getState().cabinets).toHaveLength(2);
  });

  it('should set duplicated cabinet as active', () => {
    const firstId = getCabinet().id;
    const dup = useCabinetStore.getState().duplicateCabinet(firstId);
    expect(useCabinetStore.getState().activeCabinetId).toBe(dup!.id);
  });

  it('should give duplicated cabinet new panel IDs', () => {
    const firstId = getCabinet().id;
    const origPanelIds = getCabinet().panels.map(p => p.id);
    const dup = useCabinetStore.getState().duplicateCabinet(firstId);
    const dupPanelIds = dup!.panels.map(p => p.id);
    // No duplicate IDs
    const overlap = origPanelIds.filter(id => dupPanelIds.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it('should mirror a cabinet', () => {
    const firstId = getCabinet().id;
    const mirrored = useCabinetStore.getState().mirrorCabinet(firstId, 'x');
    expect(mirrored).not.toBeNull();
    expect(mirrored!.name).toContain('(Mirror)');
    expect(useCabinetStore.getState().cabinets).toHaveLength(2);
  });

  it('should add cabinet with custom dimensions', () => {
    const custom = useCabinetStore.getState().addCabinet('BASE', 'Custom', { width: 400, height: 500, depth: 300 });
    expect(custom.dimensions.width).toBe(400);
    expect(custom.dimensions.height).toBe(500);
    expect(custom.dimensions.depth).toBe(300);
  });

  it('should add cabinet at specified position', () => {
    const cab = useCabinetStore.getState().addCabinet('BASE', 'Offset', undefined, [500, 0, 200]);
    expect((cab as any).scenePosition).toEqual([500, 0, 200]);
  });

  it('should reset scene positions', () => {
    useCabinetStore.getState().addCabinet('BASE', 'Second');
    useCabinetStore.getState().addCabinet('BASE', 'Third');
    useCabinetStore.getState().resetScenePositions();
    const first = useCabinetStore.getState().cabinets[0] as any;
    expect(first.scenePosition[0]).toBe(0);
    // Second cabinet should be offset
    const second = useCabinetStore.getState().cabinets[1] as any;
    expect(second.scenePosition[0]).toBeGreaterThan(0);
  });
});

// ============================================
// 11. PANEL SELECTION
// ============================================

describe('Panel Selection', () => {
  beforeEach(() => resetAndCreate());

  it('should select a panel by ID', () => {
    const panelId = findPanel('LEFT_SIDE')!.id;
    useCabinetStore.getState().selectPanel(panelId);
    expect(useCabinetStore.getState().selectedPanelId).toBe(panelId);
  });

  it('should deselect by passing null', () => {
    useCabinetStore.getState().selectPanel(findPanel('LEFT_SIDE')!.id);
    useCabinetStore.getState().selectPanel(null);
    expect(useCabinetStore.getState().selectedPanelId).toBeNull();
  });
});

// ============================================
// 12. PANEL VISIBILITY
// ============================================

describe('Panel Visibility', () => {
  beforeEach(() => resetAndCreate());

  it('should hide a panel', () => {
    const panelId = findPanel('LEFT_SIDE')!.id;
    useCabinetStore.getState().setPanelVisible(panelId, false);
    expect(findPanel('LEFT_SIDE')!.visible).toBe(false);
  });

  it('should show a hidden panel', () => {
    const panelId = findPanel('LEFT_SIDE')!.id;
    useCabinetStore.getState().setPanelVisible(panelId, false);
    useCabinetStore.getState().setPanelVisible(panelId, true);
    expect(findPanel('LEFT_SIDE')!.visible).toBe(true);
  });

  it('should toggle panel visibility', () => {
    const panelId = findPanel('LEFT_SIDE')!.id;
    useCabinetStore.getState().togglePanelVisibility(panelId);
    expect(findPanel('LEFT_SIDE')!.visible).toBe(false);
    useCabinetStore.getState().togglePanelVisibility(panelId);
    expect(findPanel('LEFT_SIDE')!.visible).toBe(true);
  });

  it('should show all panels', () => {
    const panelId = findPanel('LEFT_SIDE')!.id;
    useCabinetStore.getState().setPanelVisible(panelId, false);
    useCabinetStore.getState().showAllPanels();
    getCabinet().panels.forEach(p => {
      expect(p.visible).toBe(true);
    });
  });

  it('should hide unselected panels', () => {
    const keepPanelId = findPanel('LEFT_SIDE')!.id;
    useCabinetStore.getState().hideUnselectedPanels(keepPanelId);
    getCabinet().panels.forEach(p => {
      if (p.id === keepPanelId) {
        expect(p.visible).toBe(true);
      } else {
        expect(p.visible).toBe(false);
      }
    });
  });
});

// ============================================
// 13. CABINET VISIBILITY
// ============================================

describe('Cabinet Visibility', () => {
  beforeEach(() => resetAndCreate());

  it('should start with no hidden cabinets', () => {
    expect(useCabinetStore.getState().hiddenCabinetIds).toHaveLength(0);
  });

  it('should hide a cabinet', () => {
    const id = getCabinet().id;
    useCabinetStore.getState().hideCabinet(id);
    expect(useCabinetStore.getState().hiddenCabinetIds).toContain(id);
  });

  it('should show a hidden cabinet', () => {
    const id = getCabinet().id;
    useCabinetStore.getState().hideCabinet(id);
    useCabinetStore.getState().showCabinet(id);
    expect(useCabinetStore.getState().hiddenCabinetIds).not.toContain(id);
  });

  it('should show all cabinets', () => {
    const id = getCabinet().id;
    useCabinetStore.getState().hideCabinet(id);
    useCabinetStore.getState().showAllCabinets();
    expect(useCabinetStore.getState().hiddenCabinetIds).toHaveLength(0);
  });

  it('should toggle cabinet visibility', () => {
    const id = getCabinet().id;
    useCabinetStore.getState().toggleCabinetVisibility(id);
    expect(useCabinetStore.getState().hiddenCabinetIds).toContain(id);
    useCabinetStore.getState().toggleCabinetVisibility(id);
    expect(useCabinetStore.getState().hiddenCabinetIds).not.toContain(id);
  });

  it('should hide unselected cabinets', () => {
    const firstId = getCabinet().id;
    const secondCab = useCabinetStore.getState().addCabinet('WALL', 'Wall');
    useCabinetStore.getState().hideUnselectedCabinets(firstId);
    expect(useCabinetStore.getState().hiddenCabinetIds).toContain(secondCab.id);
    expect(useCabinetStore.getState().hiddenCabinetIds).not.toContain(firstId);
  });

  it('should not double-add a cabinet ID to hidden list', () => {
    const id = getCabinet().id;
    useCabinetStore.getState().hideCabinet(id);
    useCabinetStore.getState().hideCabinet(id);
    expect(useCabinetStore.getState().hiddenCabinetIds.filter(x => x === id)).toHaveLength(1);
  });
});

// ============================================
// 14. MATERIAL CRUD
// ============================================

describe('Material CRUD', () => {
  beforeEach(() => resetAndCreate());

  it('should add a new core material', () => {
    useCabinetStore.getState().addCoreMaterial({
      id: 'test-core-1',
      name: 'Test Core',
      thickness: 20,
      costPerSqm: 500,
      co2PerSqm: 12,
    });
    expect((useCabinetStore.getState().coreMaterials as any)['test-core-1']).toBeDefined();
  });

  it('should update an existing core material', () => {
    useCabinetStore.getState().updateCoreMaterial('core-pb-16', { costPerSqm: 999 });
    expect((useCabinetStore.getState().coreMaterials as any)['core-pb-16'].costPerSqm).toBe(999);
  });

  it('should delete a core material', () => {
    useCabinetStore.getState().deleteCoreMaterial('core-pb-16');
    expect((useCabinetStore.getState().coreMaterials as any)['core-pb-16']).toBeUndefined();
  });

  it('should add a new surface material', () => {
    useCabinetStore.getState().addSurfaceMaterial({
      id: 'test-surf-1',
      name: 'Test Surface',
      thickness: 1.0,
      costPerSqm: 200,
      co2PerSqm: 1.0,
      color: '#FF0000',
    });
    expect((useCabinetStore.getState().surfaceMaterials as any)['test-surf-1']).toBeDefined();
  });

  it('should add a new edge material', () => {
    useCabinetStore.getState().addEdgeMaterial({
      id: 'test-edge-1',
      name: 'Test Edge',
      code: 'TEST-1',
      thickness: 1.5,
      height: 23,
      costPerMeter: 25,
      color: '#FF0000',
    });
    expect((useCabinetStore.getState().edgeMaterials as any)['test-edge-1']).toBeDefined();
  });
});

// ============================================
// 15. JOINT TYPE EFFECTS
// ============================================

describe('Joint Type Effects on Panels', () => {
  beforeEach(() => resetAndCreate());

  it('should make top panel full width when OVERLAY', () => {
    useCabinetStore.getState().setJointType('top', 'OVERLAY');
    const top = findPanel('TOP')!;
    expect(top.finishWidth).toBe(getCabinet().dimensions.width);
  });

  it('should make bottom panel full width when OVERLAY', () => {
    useCabinetStore.getState().setJointType('bottom', 'OVERLAY');
    const bottom = findPanel('BOTTOM')!;
    expect(bottom.finishWidth).toBe(getCabinet().dimensions.width);
  });

  it('should make top panel inset (narrower) when INSET', () => {
    // Default is INSET
    const top = findPanel('TOP')!;
    expect(top.finishWidth).toBeLessThan(getCabinet().dimensions.width);
  });

  it('should reduce side height for both OVERLAY joints', () => {
    const H = getCabinet().dimensions.height;
    useCabinetStore.getState().setJointType('top', 'OVERLAY');
    useCabinetStore.getState().setJointType('bottom', 'OVERLAY');
    const side = findPanel('LEFT_SIDE')!;
    const T = side.computed.realThickness;
    // Both OVERLAY: side = H - 2*T
    expect(side.finishHeight).toBeCloseTo(H - 2 * T, 0);
  });
});

// ============================================
// 16. BACK PANEL CONSTRUCTION
// ============================================

describe('Back Panel Construction', () => {
  beforeEach(() => resetAndCreate());

  it('should create inset back panel by default', () => {
    expect(getCabinet().structure.backPanelConstruction).toBe('inset');
    const back = findPanel('BACK')!;
    // Inset: backW = (W - 2T) + 2*groove - clearance
    expect(back.finishWidth).toBeGreaterThan(0);
  });

  it('should switch to overlay back panel construction', () => {
    useCabinetStore.getState().setBackPanelConstruction('overlay');
    expect(getCabinet().structure.backPanelConstruction).toBe('overlay');
    const back = findPanel('BACK')!;
    // Overlay: backW = full cabinet width
    expect(back.finishWidth).toBe(getCabinet().dimensions.width);
  });

  it('should remove back panel when toggled off', () => {
    useCabinetStore.getState().toggleBackPanel();
    expect(findPanel('BACK')).toBeUndefined();
    expect(getCabinet().structure.hasBackPanel).toBe(false);
  });
});

// ============================================
// 17. MANUFACTURING PARAMETERS
// ============================================

describe('Manufacturing Parameters', () => {
  beforeEach(() => resetAndCreate());

  it('should have default manufacturing params', () => {
    const params = useCabinetStore.getState().manufacturingParams;
    expect(params.preMilling).toBe(0.5);
    expect(params.glueThickness).toBe(0.1);
    expect(params.clearance).toBe(2);
    expect(params.grooveDepth).toBe(8);
  });

  it('should update a manufacturing parameter', () => {
    useCabinetStore.getState().setManufacturingParam('preMilling', 1.0);
    expect(useCabinetStore.getState().manufacturingParams.preMilling).toBe(1.0);
  });

  it('should reset manufacturing params', () => {
    useCabinetStore.getState().setManufacturingParam('preMilling', 1.0);
    useCabinetStore.getState().resetManufacturingParams();
    expect(useCabinetStore.getState().manufacturingParams.preMilling).toBe(0.5);
  });
});

// ============================================
// 18. DRILLING PARAMETERS
// ============================================

describe('Drilling Parameters', () => {
  beforeEach(() => resetAndCreate());

  it('should have default drilling params', () => {
    const params = useCabinetStore.getState().drillingParams;
    expect(params.firstHoleZ).toBe(37);
    expect(params.drillingDistanceB).toBe(24);
  });

  it('should update firstHoleZ', () => {
    useCabinetStore.getState().setDrillingParam('firstHoleZ', 40);
    expect(useCabinetStore.getState().drillingParams.firstHoleZ).toBe(40);
  });

  it('should update drillingDistanceB', () => {
    useCabinetStore.getState().setDrillingParam('drillingDistanceB', 30);
    expect(useCabinetStore.getState().drillingParams.drillingDistanceB).toBe(30);
  });
});

// ============================================
// 19. CONSTRUCTION TYPE
// ============================================

describe('Construction Type', () => {
  beforeEach(() => resetAndCreate());

  it('should default to FRAMELESS', () => {
    expect(useCabinetStore.getState().constructionType).toBe('FRAMELESS');
  });

  it('should update construction type', () => {
    useCabinetStore.getState().setConstructionType('FACE_FRAME' as any);
    expect(useCabinetStore.getState().constructionType).toBe('FACE_FRAME');
  });
});

// ============================================
// 20. DRAWER CONFIGURATION
// ============================================

describe('Drawer Configuration', () => {
  beforeEach(() => resetAndCreate());

  it('should enable drawers', () => {
    useCabinetStore.getState().enableDrawers();
    expect(getCabinet().structure.drawerConfig?.hasDrawers).toBe(true);
  });

  it('should disable drawers', () => {
    useCabinetStore.getState().enableDrawers();
    useCabinetStore.getState().disableDrawers();
    expect(getCabinet().structure.drawerConfig?.hasDrawers).toBe(false);
  });

  it('should set slide type when enabling', () => {
    useCabinetStore.getState().enableDrawers('side_mount');
    expect(getCabinet().structure.drawerConfig?.slideType).toBe('side_mount');
  });

  it('should add a drawer row', () => {
    useCabinetStore.getState().enableDrawers();
    useCabinetStore.getState().addDrawerRow();
    expect(getCabinet().structure.drawerConfig?.rows).toHaveLength(1);
  });

  it('should add multiple drawer rows', () => {
    useCabinetStore.getState().enableDrawers();
    useCabinetStore.getState().addDrawerRow();
    useCabinetStore.getState().addDrawerRow();
    useCabinetStore.getState().addDrawerRow();
    expect(getCabinet().structure.drawerConfig?.rows).toHaveLength(3);
  });

  it('should remove a drawer row', () => {
    useCabinetStore.getState().enableDrawers();
    useCabinetStore.getState().addDrawerRow();
    useCabinetStore.getState().addDrawerRow();
    useCabinetStore.getState().removeDrawerRow(0);
    expect(getCabinet().structure.drawerConfig?.rows).toHaveLength(1);
  });

  it('should disable drawers when last row is removed', () => {
    useCabinetStore.getState().enableDrawers();
    useCabinetStore.getState().addDrawerRow();
    useCabinetStore.getState().removeDrawerRow(0);
    expect(getCabinet().structure.drawerConfig?.hasDrawers).toBe(false);
  });

  it('should update a drawer row', () => {
    useCabinetStore.getState().enableDrawers();
    useCabinetStore.getState().addDrawerRow();
    useCabinetStore.getState().updateDrawerRow(0, { frontHeight: 200 });
    expect(getCabinet().structure.drawerConfig?.rows[0].frontHeight).toBe(200);
  });

  it('should add drawer row with custom config', () => {
    useCabinetStore.getState().enableDrawers();
    useCabinetStore.getState().addDrawerRow({ frontHeight: 250, gapAbove: 5 });
    const row = getCabinet().structure.drawerConfig?.rows[0];
    expect(row?.frontHeight).toBe(250);
    expect(row?.gapAbove).toBe(5);
  });
});

// ============================================
// 21. DOOR CONFIGURATION
// ============================================

describe('Door Configuration', () => {
  beforeEach(() => resetAndCreate());

  it('should enable single door', () => {
    useCabinetStore.getState().enableDoors(1);
    const doorConfig = getCabinet().structure.doorConfig;
    expect(doorConfig?.hasDoors).toBe(true);
    expect(doorConfig?.doorCount).toBe(1);
    expect(doorConfig?.doors).toHaveLength(1);
  });

  it('should enable double doors', () => {
    useCabinetStore.getState().enableDoors(2);
    const doorConfig = getCabinet().structure.doorConfig;
    expect(doorConfig?.hasDoors).toBe(true);
    expect(doorConfig?.doorCount).toBe(2);
    expect(doorConfig?.doors).toHaveLength(2);
  });

  it('should disable doors', () => {
    useCabinetStore.getState().enableDoors(1);
    useCabinetStore.getState().disableDoors();
    expect(getCabinet().structure.doorConfig?.hasDoors).toBe(false);
  });

  it('should set door count', () => {
    useCabinetStore.getState().enableDoors(1);
    useCabinetStore.getState().setDoorCount(2);
    expect(getCabinet().structure.doorConfig?.doorCount).toBe(2);
  });

  it('should assign door opening directions for double doors', () => {
    useCabinetStore.getState().enableDoors(2);
    const doors = getCabinet().structure.doorConfig!.doors;
    expect(doors[0].openingDirection).toBe('left');
    expect(doors[1].openingDirection).toBe('right');
  });
});

// ============================================
// 22. SCENE POSITION & ROTATION
// ============================================

describe('Scene Position and Rotation', () => {
  beforeEach(() => resetAndCreate());

  it('should initialize with zero position', () => {
    const cabinet = useCabinetStore.getState().cabinets[0] as any;
    expect(cabinet.scenePosition).toEqual([0, 0, 0]);
  });

  it('should update cabinet position', () => {
    const id = getCabinet().id;
    useCabinetStore.getState().updateCabinetPosition(id, [100, 0, 200]);
    const cab = useCabinetStore.getState().cabinets.find(c => c.id === id) as any;
    expect(cab.scenePosition).toEqual([100, 0, 200]);
  });

  it('should reject corrupted positions (> 10000mm)', () => {
    const id = getCabinet().id;
    useCabinetStore.getState().updateCabinetPosition(id, [100, 0, 0]);
    useCabinetStore.getState().updateCabinetPosition(id, [99999, 0, 0]);
    const cab = useCabinetStore.getState().cabinets.find(c => c.id === id) as any;
    expect(cab.scenePosition).toEqual([100, 0, 0]);
  });

  it('should update cabinet rotation', () => {
    const id = getCabinet().id;
    const rot: [number, number, number] = [0, Math.PI / 2, 0];
    useCabinetStore.getState().updateCabinetRotation(id, rot);
    const cab = useCabinetStore.getState().cabinets.find(c => c.id === id) as any;
    expect(cab.sceneRotation).toEqual(rot);
  });

  it('should rotate 90 CW', () => {
    const id = getCabinet().id;
    useCabinetStore.getState().rotateCabinet90(id, 'cw');
    const cab = useCabinetStore.getState().cabinets.find(c => c.id === id) as any;
    expect(cab.sceneRotation[1]).toBeCloseTo(-Math.PI / 2);
  });

  it('should rotate 90 CCW', () => {
    const id = getCabinet().id;
    useCabinetStore.getState().rotateCabinet90(id, 'ccw');
    const cab = useCabinetStore.getState().cabinets.find(c => c.id === id) as any;
    expect(cab.sceneRotation[1]).toBeCloseTo(Math.PI / 2);
  });

  it('should accumulate rotations', () => {
    const id = getCabinet().id;
    useCabinetStore.getState().rotateCabinet90(id, 'cw');
    useCabinetStore.getState().rotateCabinet90(id, 'cw');
    const cab = useCabinetStore.getState().cabinets.find(c => c.id === id) as any;
    expect(cab.sceneRotation[1]).toBeCloseTo(-Math.PI);
  });
});

// ============================================
// 23. PANEL POSITION OVERRIDES
// ============================================

describe('Panel Position Overrides', () => {
  beforeEach(() => resetAndCreate());

  it('should update shelf front setback', () => {
    const shelf = findPanels('SHELF')[0];
    useCabinetStore.getState().updatePanelPositionOverride(shelf.id, 'frontSetback', 30);
    const updated = findPanels('SHELF').find(p => p.id === shelf.id)!;
    expect(updated.positionOverrides?.frontSetback).toBe(30);
    expect(updated.useCustomPosition).toBe(true);
  });

  it('should update shelf back setback', () => {
    const shelf = findPanels('SHELF')[0];
    useCabinetStore.getState().updatePanelPositionOverride(shelf.id, 'backSetback', 40);
    const updated = findPanels('SHELF').find(p => p.id === shelf.id)!;
    expect(updated.positionOverrides?.backSetback).toBe(40);
  });

  it('should reset panel position', () => {
    const shelf = findPanels('SHELF')[0];
    useCabinetStore.getState().updatePanelPositionOverride(shelf.id, 'frontSetback', 50);
    useCabinetStore.getState().resetPanelPosition(shelf.id);
    const reset = findPanels('SHELF').find(p => p.id === shelf.id)!;
    expect(reset.useCustomPosition).toBe(false);
    expect(reset.positionOverrides?.frontSetback).toBe(20); // default
  });
});

// ============================================
// 24. HARDWARE CONFIGURATION
// ============================================

describe('Hardware Configuration', () => {
  beforeEach(() => resetAndCreate());

  it('should have hardware config after creation', () => {
    expect(getCabinet().hardware).toBeDefined();
  });

  it('should update hardware config', () => {
    const id = getCabinet().id;
    useCabinetStore.getState().updateHardware(id, {
      shelfPinConfig: { diameter: 8, depth: 15, rowCount: 6, columnCount: 3 },
    });
    // updateHardware mutates cabinets[idx] directly without syncing state.cabinet
    const cab = useCabinetStore.getState().cabinets.find(c => c.id === id)!;
    expect(cab.hardware?.shelfPinConfig?.diameter).toBe(8);
  });

  it('should set minifix preset', () => {
    const id = getCabinet().id;
    useCabinetStore.getState().setMinifixPreset(id, 'custom-preset-1');
    // setMinifixPreset mutates cabinets[idx] directly
    const cab = useCabinetStore.getState().cabinets.find(c => c.id === id)!;
    expect(cab.hardware?.minifixPresetId).toBe('custom-preset-1');
  });

  it('should clear minifix preset', () => {
    const id = getCabinet().id;
    useCabinetStore.getState().setMinifixPreset(id, undefined);
    // setMinifixPreset with undefined clears the preset
    const cab = useCabinetStore.getState().cabinets.find(c => c.id === id)!;
    expect(cab.hardware?.minifixPresetId).toBeUndefined();
  });
});

// ============================================
// 25. REAL THICKNESS CALCULATION
// ============================================

describe('Real Thickness Calculation', () => {
  beforeEach(() => resetAndCreate());

  it('should calculate realThickness for default materials', () => {
    const left = findPanel('LEFT_SIDE')!;
    // core-hmr-18 = 18mm, surf-hpl-grey-oak = 0.8mm
    // T_real = 18 + 0.8 + 0 (only faceA) = 18.8 or similar
    expect(left.computed.realThickness).toBeGreaterThan(18);
    expect(left.computed.realThickness).toBeLessThan(22);
  });

  it('should calculate realThickness for back panel', () => {
    const back = findPanel('BACK')!;
    // core-mdf-6 = 6mm, 2-sided surface
    expect(back.computed.realThickness).toBeGreaterThanOrEqual(6);
  });

  it('should recalculate realThickness after face material change', () => {
    const leftId = findPanel('LEFT_SIDE')!.id;
    const thickBefore = findPanel('LEFT_SIDE')!.computed.realThickness;
    // Assign a FENIX surface (1.2mm thick) to faceB
    useCabinetStore.getState().updatePanelMaterial(leftId, 'faceB', 'fenix-0720-nero-ingo');
    const thickAfter = findPanel('LEFT_SIDE')!.computed.realThickness;
    expect(thickAfter).toBeGreaterThan(thickBefore);
  });
});

// ============================================
// 26. DIVIDER MOVEMENT
// ============================================

describe('Divider Movement', () => {
  beforeEach(() => {
    resetAndCreate();
    useCabinetStore.getState().setDividerCount(1);
  });

  it('should move a divider', () => {
    const divider = findPanels('DIVIDER')[0];
    const oldX = divider.position[0];
    useCabinetStore.getState().moveDivider(0, oldX + 50);
    const moved = findPanels('DIVIDER')[0];
    // Position should change (panel is regenerated, but position is preserved through overrides)
    expect(moved.position[0]).not.toBe(oldX);
  });

  it('should clamp divider within cabinet bounds', () => {
    const W = getCabinet().dimensions.width;
    // Try to move way past right edge
    useCabinetStore.getState().moveDivider(0, W * 2);
    const moved = findPanels('DIVIDER')[0];
    // Should be clamped
    expect(moved.position[0]).toBeLessThan(W / 2);
  });
});

// ============================================
// 27. RECALCULATE
// ============================================

describe('Recalculate', () => {
  beforeEach(() => resetAndCreate());

  it('should regenerate panels on explicit recalculate', () => {
    const idsBefore = getCabinet().panels.map(p => p.id);
    useCabinetStore.getState().recalculate();
    const idsAfter = getCabinet().panels.map(p => p.id);
    // Panel IDs change after regeneration
    expect(idsAfter).not.toEqual(idsBefore);
  });

  it('should preserve sub panels during recalculate', () => {
    useCabinetStore.getState().addShelfInCompartment(0, 0);
    const subShelfBefore = findPanels('SHELF').find(s => s.name.startsWith('Sub'));
    expect(subShelfBefore).toBeDefined();

    useCabinetStore.getState().recalculate();
    const subShelfAfter = findPanels('SHELF').find(s => s.name.startsWith('Sub'));
    expect(subShelfAfter).toBeDefined();
  });

  it('should update computed totals after recalculate', () => {
    useCabinetStore.getState().recalculate();
    const computed = getCabinet().computed;
    expect(computed.panelCount).toBe(getCabinet().panels.length);
    expect(computed.totalCost).toBeGreaterThan(0);
  });
});

// ============================================
// 28. EDGE CASES
// ============================================

describe('Edge Cases', () => {
  it('should handle creating a WALL cabinet', () => {
    resetAndCreate('WALL', 'Wall Cabinet');
    expect(getCabinet().type).toBe('WALL');
    expect(getCabinet().panels.length).toBeGreaterThan(0);
  });

  it('should handle creating a TALL cabinet', () => {
    resetAndCreate('TALL', 'Tall Cabinet');
    expect(getCabinet().type).toBe('TALL');
    expect(getCabinet().panels.length).toBeGreaterThan(0);
  });

  it('should handle zero shelf count gracefully', () => {
    resetAndCreate();
    useCabinetStore.getState().setShelfCount(0);
    expect(findPanels('SHELF')).toHaveLength(0);
    // 6 panels: L, R, T, B, Kickboard, Back
    expect(getCabinet().panels).toHaveLength(6);
  });

  it('should not crash when updating material on nonexistent panel', () => {
    resetAndCreate();
    // Should just be a no-op
    expect(() => {
      useCabinetStore.getState().updatePanelMaterial('nonexistent-id', 'core', 'core-pb-16');
    }).not.toThrow();
  });

  it('should not crash when updating edge on nonexistent panel', () => {
    resetAndCreate();
    expect(() => {
      useCabinetStore.getState().updatePanelEdge('nonexistent-id', 'top', 'edge-pvc-white-10');
    }).not.toThrow();
  });

  it('should not crash when removing nonexistent cabinet', () => {
    resetAndCreate();
    expect(() => {
      useCabinetStore.getState().removeCabinet('nonexistent-id');
    }).not.toThrow();
  });

  it('should not crash when duplicating nonexistent cabinet', () => {
    resetAndCreate();
    const result = useCabinetStore.getState().duplicateCabinet('nonexistent-id');
    expect(result).toBeNull();
  });

  it('should handle selecting nonexistent cabinet gracefully', () => {
    resetAndCreate();
    useCabinetStore.getState().selectCabinet('nonexistent-id');
    // Should remain on previous active cabinet since the ID was not found
    expect(useCabinetStore.getState().activeCabinetId).toBeTruthy();
  });
});
