/**
 * Gate G11 — FACE bore vs EDGE bore discrimination (S19)
 *
 * @module gate/rules/__tests__/gateG11_boreAxis.test
 *
 * The S16 fix taught ruleG11_DowelDepth to read the drill NORMAL instead of the
 * panel ROLE, which stopped it condemning every OVERLAY cabinet. But its
 * classifier split the Y axis from {X, Z} and never split X from Z:
 *
 *     const isHorizontalNormal = (nx > ny) || (nz > ny);
 *
 * For a side panel the thickness runs along X, so ±X is the face and ±Z is the
 * BACK EDGE — two completely different amounts of material (18mm vs 560mm) that
 * the classifier could not tell apart. Every back-panel joint dowel, which is a
 * correct Ø8x30 split 12 + 18, was reported as a BLOCKER.
 *
 * These tests pin BOTH directions. Deleting the rule, loosening DEPTH_TOLERANCE,
 * or widening the dowel constants all break the "still blocks" half.
 */

import { describe, it, expect } from 'vitest';
import {
  ruleG11_DowelDepth,
  ruleG11_DrillType,
  type G11DrillPoint,
  type G11Panel,
} from '../gateG11_minifixSystem32';
import {
  G11_CONSTANTS,
  thicknessAxisOf,
  thicknessAxisFromRole,
  panelSpanFromRole,
  type G11PanelSpan,
} from '../gateG11_types';

// ============================================
// FIXTURES — a real 600x720x560 cabinet, 18mm board
// ============================================

const T = 18;
const HEIGHT = 720;
const DEPTH = 560;
const WIDTH = 600;
const BACK_T = 6; // production default (useCabinetStore: backThickness: 6)

/** LEFT_SIDE panel: thickness along X, height along Y, cabinet depth along Z. */
const SIDE_SPAN: G11PanelSpan = [T, HEIGHT, DEPTH];
/** BACK panel: width along X, height along Y, thickness along Z. */
const BACK_SPAN: G11PanelSpan = [WIDTH, HEIGHT, BACK_T];

function sidePanel(span: G11PanelSpan = SIDE_SPAN): G11Panel {
  return {
    id: 'panel-left',
    role: 'LEFT_SIDE',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    finishWidth: DEPTH,
    finishHeight: HEIGHT,
    computed: { realThickness: T },
    spanMm: span,
  };
}

function backPanel(): G11Panel {
  return {
    id: 'panel-back',
    role: 'BACK',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    finishWidth: WIDTH,
    finishHeight: HEIGHT,
    computed: { realThickness: BACK_T },
    spanMm: BACK_SPAN,
  };
}

function dowel(
  id: string,
  panelId: string,
  panelRole: string,
  normal: [number, number, number],
  depth: number,
): G11DrillPoint {
  return {
    id,
    panelId,
    position: [0, 100, 0],
    normal,
    diameter: G11_CONSTANTS.DOWEL_DIAMETER,
    depth,
    purpose: 'DOWEL',
    componentType: 'DOWEL',
    connectedPanelRole: panelRole,
  };
}

const codes = (issues: { code: string }[]) => issues.map(i => i.code);

// ============================================
// THE HEADLINE FALSE POSITIVE
// ============================================

describe('S19 back-edge dowel on a SIDE panel (the false positive)', () => {
  // generateBackPanelJointPoints emits normal [0,0,1] into the side panel's
  // back edge at dowelDepthHorizEdge = 18mm. The bore runs along the cabinet's
  // 560mm depth; it never touches the 18mm thickness.
  const point = dowel('dowel-BACK_LEFT-1', 'panel-left', 'LEFT_SIDE', [0, 0, 1], 18);

  it('PASSES: 18mm edge bore along the 560mm depth axis is correct joinery', () => {
    const issues = ruleG11_DowelDepth([point], [sidePanel()]);
    expect(issues).toEqual([]);
  });

  it('classifies it EDGE_BORE, not FACE_BORE', () => {
    // Force a failure so the context is observable, by using a wrong depth.
    const wrong = dowel('d', 'panel-left', 'LEFT_SIDE', [0, 0, 1], 12);
    const issues = ruleG11_DowelDepth([wrong], [sidePanel()]);
    expect(issues[0].context?.boreType).toBe('EDGE_BORE');
  });

  it('still resolves correctly with no panels supplied (role convention fallback)', () => {
    const issues = ruleG11_DowelDepth([point], []);
    expect(issues).toEqual([]);
  });
});

describe('S19 mirror case: BACK panel face bore', () => {
  // Same corner, other half of the joint: normal [0,0,-1] into the BACK panel's
  // FACE at 12mm. The back panel's face normal IS ±Z, so the old classifier
  // called this an EDGE_BORE and demanded 18mm.
  const point = dowel('dowel-BACK_LEFT-0', 'panel-back', 'BACK', [0, 0, -1], 12);

  it('PASSES: 12mm face bore into the back panel', () => {
    const issues = ruleG11_DowelDepth([point], [backPanel()]);
    expect(issues).toEqual([]);
  });

  it('BOLT on the BACK panel face is FACE_BORE, not EDGE_BORE', () => {
    const bolt: G11DrillPoint = {
      id: 'bolt-BACK_LEFT-0',
      panelId: 'panel-back',
      position: [0, 100, 0],
      normal: [0, 0, -1],
      diameter: G11_CONSTANTS.BOLT_SLEEVE_DIAMETER,
      depth: G11_CONSTANTS.BOLT_SLEEVE_DEPTH,
      purpose: 'BOLT',
      componentType: 'BOLT',
      connectedPanelRole: 'BACK',
    };
    expect(ruleG11_DrillType([bolt], [backPanel()])).toEqual([]);
  });
});

// ============================================
// THE OTHER HALF — the rule must STILL FAIL
// ============================================

describe('S19 genuine defects must still BLOCK', () => {
  it('BLOCKS a face bore drilled to edge-bore depth (18mm into 18mm thickness)', () => {
    // normal ±X on a side panel = the real face. 18mm into 18mm of material
    // leaves nothing — this is the drill-through the gate exists to catch.
    const through = dowel('d-through', 'panel-left', 'LEFT_SIDE', [-1, 0, 0], 18);
    const issues = ruleG11_DowelDepth([through], [sidePanel()]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].code).toBe('B_G11_DOWEL_DEPTH_SIDE_WRONG');
    expect(issues[0].context?.boreType).toBe('FACE_BORE');
    expect(issues[0].context?.expected).toBe(G11_CONSTANTS.DOWEL_DEPTH_SIDE_FACE);
  });

  it('BLOCKS an edge bore drilled too shallow (12mm where 18mm is required)', () => {
    const shallow = dowel('d-shallow', 'panel-left', 'LEFT_SIDE', [0, 0, 1], 12);
    const issues = ruleG11_DowelDepth([shallow], [sidePanel()]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].context?.expected).toBe(G11_CONSTANTS.DOWEL_DEPTH_HORIZ_EDGE);
  });

  it('BLOCKS an over-deep bore into the thin BACK panel face', () => {
    const tooDeep = dowel('d-back-deep', 'panel-back', 'BACK', [0, 0, -1], 18);
    const issues = ruleG11_DowelDepth([tooDeep], [backPanel()]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('BLOCKER');
    expect(issues[0].context?.boreType).toBe('FACE_BORE');
  });

  it('the depth tolerance is still 0.5mm — not widened to hide the above', () => {
    expect(G11_CONSTANTS.DEPTH_TOLERANCE).toBe(0.5);
    expect(G11_CONSTANTS.DOWEL_DEPTH_SIDE_FACE).toBe(12);
    expect(G11_CONSTANTS.DOWEL_DEPTH_HORIZ_EDGE).toBe(18);
    expect(G11_CONSTANTS.DOWEL_DEPTH_SIDE_FACE + G11_CONSTANTS.DOWEL_DEPTH_HORIZ_EDGE)
      .toBe(G11_CONSTANTS.DOWEL_TOTAL_LENGTH);
  });

  it('a 0.6mm depth error still blocks (tolerance not silently relaxed)', () => {
    const off = dowel('d-off', 'panel-left', 'LEFT_SIDE', [0, 0, 1], 18.6);
    expect(ruleG11_DowelDepth([off], [sidePanel()])).toHaveLength(1);
  });
});

// ============================================
// FULL AXIS COVERAGE ON ONE PANEL
// ============================================

describe('S19 all three axes on a SIDE panel', () => {
  // The S16 fix covered ±Y (OVERLAY). This pins every axis at once so the
  // X-vs-Z half cannot regress unnoticed.
  const cases: Array<[string, [number, number, number], 'FACE_BORE' | 'EDGE_BORE', number]> = [
    ['±X — inner face (INSET corner dowel)', [-1, 0, 0], 'FACE_BORE', 12],
    ['±Y — top/bottom edge (OVERLAY corner, B-run)', [0, 1, 0], 'EDGE_BORE', 18],
    ['±Z — back edge (back panel joint)', [0, 0, 1], 'EDGE_BORE', 18],
  ];

  for (const [label, normal, expectedType, correctDepth] of cases) {
    it(`${label} → ${expectedType} @ ${correctDepth}mm`, () => {
      const ok = dowel('ok', 'panel-left', 'LEFT_SIDE', normal, correctDepth);
      expect(ruleG11_DowelDepth([ok], [sidePanel()])).toEqual([]);

      // And the opposite depth must be rejected.
      const wrongDepth = correctDepth === 12 ? 18 : 12;
      const bad = dowel('bad', 'panel-left', 'LEFT_SIDE', normal, wrongDepth);
      const issues = ruleG11_DowelDepth([bad], [sidePanel()]);
      expect(issues).toHaveLength(1);
      expect(issues[0].context?.boreType).toBe(expectedType);
    });
  }
});

// ============================================
// MEASURED GEOMETRY OUTRANKS THE ROLE CONVENTION
// ============================================

describe('S19 measured spans override the role convention', () => {
  // A LEFT_SIDE panel whose thickness genuinely runs along Z (e.g. a panel
  // placed on a rotated axis). The role convention would say "thickness is X"
  // and get both bores backwards; the measured spans get them right.
  const rotated: G11PanelSpan = [DEPTH, HEIGHT, T];

  it('reads ±Z as the FACE bore when the spans say thickness is Z', () => {
    const face = dowel('d-face', 'panel-left', 'LEFT_SIDE', [0, 0, 1], 12);
    expect(ruleG11_DowelDepth([face], [sidePanel(rotated)])).toEqual([]);
  });

  it('reads ±X as the EDGE bore for the same panel', () => {
    const edge = dowel('d-edge', 'panel-left', 'LEFT_SIDE', [1, 0, 0], 18);
    expect(ruleG11_DowelDepth([edge], [sidePanel(rotated)])).toEqual([]);
  });

  it('and still blocks a through-drill along that panel\'s real thickness', () => {
    const through = dowel('d-through', 'panel-left', 'LEFT_SIDE', [0, 0, 1], 18);
    const issues = ruleG11_DowelDepth([through], [sidePanel(rotated)]);
    expect(issues).toHaveLength(1);
    expect(issues[0].context?.boreType).toBe('FACE_BORE');
  });
});

// ============================================
// THE DISCRIMINATOR ITSELF
// ============================================

describe('thicknessAxisOf', () => {
  it('picks the axis matching the declared thickness', () => {
    expect(thicknessAxisOf(SIDE_SPAN, T)).toBe(0);
    expect(thicknessAxisOf([WIDTH, T, DEPTH], T)).toBe(1);
    expect(thicknessAxisOf(BACK_SPAN, BACK_T)).toBe(2);
  });

  it('falls back to the thinnest axis when thickness is unknown', () => {
    expect(thicknessAxisOf(SIDE_SPAN)).toBe(0);
    expect(thicknessAxisOf(BACK_SPAN)).toBe(2);
  });

  it('returns undefined rather than guessing when two axes tie', () => {
    // A cube-ish offcut: nothing distinguishes a face from an edge.
    expect(thicknessAxisOf([18, 18, 18])).toBeUndefined();
    expect(thicknessAxisOf([18, 18, 600])).toBeUndefined();
  });

  it('role convention agrees with measured spans for standard panels', () => {
    for (const role of ['LEFT_SIDE', 'RIGHT_SIDE', 'TOP', 'BOTTOM', 'SHELF', 'BACK']) {
      const span = panelSpanFromRole(role, WIDTH, HEIGHT, T);
      expect(thicknessAxisOf(span, T)).toBe(thicknessAxisFromRole(role));
    }
  });
});
