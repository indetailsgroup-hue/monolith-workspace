/**
 * generateDrawerPanels.test.ts - Unit Tests for Drawer Panel Generation
 *
 * @version 1.0.0 - Initial drawer system tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateDrawerPanels,
  calculateDrawerStackRequiredHeight,
  validateDrawerFit,
  type DrawerMaterialProps,
  type GenerateDrawerPanelsInput,
} from '../generateDrawerPanels';
import type {
  CabinetDimensions,
  CabinetStructure,
  DrawerConfig,
  DrawerRowConfig,
} from '../../../types/Cabinet';
import { DEFAULT_DRAWER_CONFIG, DEFAULT_DRAWER_BOX_MATERIALS } from '../../../types/Cabinet';

// ============================================
// TEST DATA
// ============================================

const defaultDimensions: CabinetDimensions = {
  width: 600,
  height: 720,
  depth: 560,
  toeKickHeight: 100,
};

const defaultMaterialProps: DrawerMaterialProps = {
  edgeThickness: 1,
  cabinetPanelThickness: 18,
  backObstruction: 12, // 8mm groove + 4mm back
};

const defaultStructure: CabinetStructure = {
  topJoint: 'OVERLAY',
  bottomJoint: 'OVERLAY',
  hasBackPanel: true,
  backPanelConstruction: 'inset',
  backPanelInset: 20,
  shelfCount: 0,
  dividerCount: 0,
  drawerConfig: undefined,
};

const createDrawerRow = (
  frontHeight: number,
  gapAbove = 3
): DrawerRowConfig => ({
  id: `test-row-${Date.now()}`,
  frontHeight,
  gapAbove,
  slideSystemId: 'metropush',
  handleConfig: { type: 'pull', position: 'center' },
});

// ============================================
// generateDrawerPanels TESTS
// ============================================

describe('generateDrawerPanels', () => {
  describe('empty/disabled cases', () => {
    it('returns empty result when drawerConfig is undefined', () => {
      const input: GenerateDrawerPanelsInput = {
        dimensions: defaultDimensions,
        structure: { ...defaultStructure, drawerConfig: undefined },
        frontCoreId: 'core-pb-18',
        frontSurfaceId: 'surf-mel-white',
        edgeId: 'edge-pvc-white',
        materialProps: defaultMaterialProps,
      };

      const result = generateDrawerPanels(input);

      expect(result.panels).toHaveLength(0);
      expect(result.rowCount).toBe(0);
      expect(result.panelCount).toBe(0);
    });

    it('returns empty result when drawers are disabled', () => {
      const config: DrawerConfig = {
        ...DEFAULT_DRAWER_CONFIG,
        hasDrawers: false,
        rows: [createDrawerRow(140)],
      };

      const input: GenerateDrawerPanelsInput = {
        dimensions: defaultDimensions,
        structure: { ...defaultStructure, drawerConfig: config },
        frontCoreId: 'core-pb-18',
        frontSurfaceId: 'surf-mel-white',
        edgeId: 'edge-pvc-white',
        materialProps: defaultMaterialProps,
      };

      const result = generateDrawerPanels(input);

      expect(result.panels).toHaveLength(0);
    });

    it('returns empty result when rows array is empty', () => {
      const config: DrawerConfig = {
        ...DEFAULT_DRAWER_CONFIG,
        hasDrawers: true,
        rows: [],
      };

      const input: GenerateDrawerPanelsInput = {
        dimensions: defaultDimensions,
        structure: { ...defaultStructure, drawerConfig: config },
        frontCoreId: 'core-pb-18',
        frontSurfaceId: 'surf-mel-white',
        edgeId: 'edge-pvc-white',
        materialProps: defaultMaterialProps,
      };

      const result = generateDrawerPanels(input);

      expect(result.panels).toHaveLength(0);
    });
  });

  describe('single drawer row', () => {
    it('generates 5 panels for one drawer row', () => {
      const config: DrawerConfig = {
        hasDrawers: true,
        rows: [createDrawerRow(140)],
        slideType: 'undermount',
        boxMaterials: DEFAULT_DRAWER_BOX_MATERIALS,
        frontOverlay: 18,
      };

      const input: GenerateDrawerPanelsInput = {
        dimensions: defaultDimensions,
        structure: { ...defaultStructure, drawerConfig: config },
        frontCoreId: 'core-pb-18',
        frontSurfaceId: 'surf-mel-white',
        edgeId: 'edge-pvc-white',
        materialProps: defaultMaterialProps,
      };

      const result = generateDrawerPanels(input);

      expect(result.panels).toHaveLength(5);
      expect(result.rowCount).toBe(1);
      expect(result.panelCount).toBe(5);
    });

    it('generates panels with correct roles', () => {
      const config: DrawerConfig = {
        hasDrawers: true,
        rows: [createDrawerRow(140)],
        slideType: 'undermount',
        boxMaterials: DEFAULT_DRAWER_BOX_MATERIALS,
        frontOverlay: 18,
      };

      const input: GenerateDrawerPanelsInput = {
        dimensions: defaultDimensions,
        structure: { ...defaultStructure, drawerConfig: config },
        frontCoreId: 'core-pb-18',
        frontSurfaceId: 'surf-mel-white',
        edgeId: 'edge-pvc-white',
        materialProps: defaultMaterialProps,
      };

      const result = generateDrawerPanels(input);
      const roles = result.panels.map(p => p.role);

      expect(roles).toContain('DRAWER_FRONT');
      expect(roles.filter(r => r === 'DRAWER_SIDE')).toHaveLength(2);
      expect(roles).toContain('DRAWER_BACK');
      expect(roles).toContain('DRAWER_BOTTOM');
    });

    it('assigns correct material IDs', () => {
      const config: DrawerConfig = {
        hasDrawers: true,
        rows: [createDrawerRow(140)],
        slideType: 'undermount',
        boxMaterials: {
          sideThickness: 12,
          backThickness: 12,
          bottomThickness: 6,
          sideCore: 'core-ply-12',
          bottomCore: 'core-mdf-6',
        },
        frontOverlay: 18,
      };

      const input: GenerateDrawerPanelsInput = {
        dimensions: defaultDimensions,
        structure: { ...defaultStructure, drawerConfig: config },
        frontCoreId: 'core-pb-18',
        frontSurfaceId: 'surf-mel-white',
        edgeId: 'edge-pvc-white',
        materialProps: defaultMaterialProps,
      };

      const result = generateDrawerPanels(input);

      const front = result.panels.find(p => p.role === 'DRAWER_FRONT');
      const side = result.panels.find(p => p.role === 'DRAWER_SIDE');
      const bottom = result.panels.find(p => p.role === 'DRAWER_BOTTOM');

      expect(front?.coreMaterialId).toBe('core-pb-18');
      expect(side?.coreMaterialId).toBe('core-ply-12');
      expect(bottom?.coreMaterialId).toBe('core-mdf-6');
    });

    it('generates unique panel IDs', () => {
      const config: DrawerConfig = {
        hasDrawers: true,
        rows: [createDrawerRow(140)],
        slideType: 'undermount',
        boxMaterials: DEFAULT_DRAWER_BOX_MATERIALS,
        frontOverlay: 18,
      };

      const input: GenerateDrawerPanelsInput = {
        dimensions: defaultDimensions,
        structure: { ...defaultStructure, drawerConfig: config },
        frontCoreId: 'core-pb-18',
        frontSurfaceId: 'surf-mel-white',
        edgeId: 'edge-pvc-white',
        materialProps: defaultMaterialProps,
      };

      const result = generateDrawerPanels(input);
      const ids = result.panels.map(p => p.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('multiple drawer rows', () => {
    it('generates 15 panels for 3 drawer rows', () => {
      const config: DrawerConfig = {
        hasDrawers: true,
        rows: [
          createDrawerRow(100),
          createDrawerRow(140),
          createDrawerRow(180),
        ],
        slideType: 'undermount',
        boxMaterials: DEFAULT_DRAWER_BOX_MATERIALS,
        frontOverlay: 18,
      };

      const input: GenerateDrawerPanelsInput = {
        dimensions: defaultDimensions,
        structure: { ...defaultStructure, drawerConfig: config },
        frontCoreId: 'core-pb-18',
        frontSurfaceId: 'surf-mel-white',
        edgeId: 'edge-pvc-white',
        materialProps: defaultMaterialProps,
      };

      const result = generateDrawerPanels(input);

      expect(result.panels).toHaveLength(15);
      expect(result.rowCount).toBe(3);
      expect(result.panelCount).toBe(15);
    });

    it('names panels with drawer number', () => {
      const config: DrawerConfig = {
        hasDrawers: true,
        rows: [createDrawerRow(100), createDrawerRow(140)],
        slideType: 'undermount',
        boxMaterials: DEFAULT_DRAWER_BOX_MATERIALS,
        frontOverlay: 18,
      };

      const input: GenerateDrawerPanelsInput = {
        dimensions: defaultDimensions,
        structure: { ...defaultStructure, drawerConfig: config },
        frontCoreId: 'core-pb-18',
        frontSurfaceId: 'surf-mel-white',
        edgeId: 'edge-pvc-white',
        materialProps: defaultMaterialProps,
      };

      const result = generateDrawerPanels(input);

      const drawer1Panels = result.panels.filter(p => p.name.includes('Drawer 1'));
      const drawer2Panels = result.panels.filter(p => p.name.includes('Drawer 2'));

      expect(drawer1Panels).toHaveLength(5);
      expect(drawer2Panels).toHaveLength(5);
    });

    it('stacks drawers vertically (Y positions increase)', () => {
      const config: DrawerConfig = {
        hasDrawers: true,
        rows: [createDrawerRow(100), createDrawerRow(140)],
        slideType: 'undermount',
        boxMaterials: DEFAULT_DRAWER_BOX_MATERIALS,
        frontOverlay: 18,
      };

      const input: GenerateDrawerPanelsInput = {
        dimensions: defaultDimensions,
        structure: { ...defaultStructure, drawerConfig: config },
        frontCoreId: 'core-pb-18',
        frontSurfaceId: 'surf-mel-white',
        edgeId: 'edge-pvc-white',
        materialProps: defaultMaterialProps,
      };

      const result = generateDrawerPanels(input);

      const drawer1Front = result.panels.find(
        p => p.role === 'DRAWER_FRONT' && p.name.includes('Drawer 1')
      );
      const drawer2Front = result.panels.find(
        p => p.role === 'DRAWER_FRONT' && p.name.includes('Drawer 2')
      );

      expect(drawer2Front!.position[1]).toBeGreaterThan(drawer1Front!.position[1]);
    });
  });

  describe('slide type variations', () => {
    it('generates wider drawer box for side-mount slides', () => {
      const undermountConfig: DrawerConfig = {
        hasDrawers: true,
        rows: [createDrawerRow(140)],
        slideType: 'undermount',
        boxMaterials: DEFAULT_DRAWER_BOX_MATERIALS,
        frontOverlay: 18,
      };

      const sideMountConfig: DrawerConfig = {
        ...undermountConfig,
        slideType: 'side_mount',
      };

      const undermountInput: GenerateDrawerPanelsInput = {
        dimensions: defaultDimensions,
        structure: { ...defaultStructure, drawerConfig: undermountConfig },
        frontCoreId: 'core-pb-18',
        frontSurfaceId: 'surf-mel-white',
        edgeId: 'edge-pvc-white',
        materialProps: defaultMaterialProps,
      };

      const sideMountInput: GenerateDrawerPanelsInput = {
        ...undermountInput,
        structure: { ...defaultStructure, drawerConfig: sideMountConfig },
      };

      const undermountResult = generateDrawerPanels(undermountInput);
      const sideMountResult = generateDrawerPanels(sideMountInput);

      const undermountFront = undermountResult.panels.find(p => p.role === 'DRAWER_FRONT');
      const sideMountFront = sideMountResult.panels.find(p => p.role === 'DRAWER_FRONT');

      // Front panels should have same width (overlay is the same)
      expect(undermountFront!.finishWidth).toBe(sideMountFront!.finishWidth);

      // But sides should be positioned differently due to different clearances
      const undermountLeftSide = undermountResult.panels.find(
        p => p.role === 'DRAWER_SIDE' && p.name.includes('Left')
      );
      const sideMountLeftSide = sideMountResult.panels.find(
        p => p.role === 'DRAWER_SIDE' && p.name.includes('Left')
      );

      // Side mount has smaller clearance (12.5mm vs 20.5mm), so box is wider
      // Wider box = sides positioned further OUT from center (larger absolute X)
      expect(Math.abs(sideMountLeftSide!.position[0])).toBeGreaterThan(
        Math.abs(undermountLeftSide!.position[0])
      );
    });
  });

  describe('panel dimensions', () => {
    it('calculates correct front panel dimensions with overlay', () => {
      const config: DrawerConfig = {
        hasDrawers: true,
        rows: [createDrawerRow(140)],
        slideType: 'undermount',
        boxMaterials: DEFAULT_DRAWER_BOX_MATERIALS,
        frontOverlay: 18,
      };

      const input: GenerateDrawerPanelsInput = {
        dimensions: defaultDimensions,
        structure: { ...defaultStructure, drawerConfig: config },
        frontCoreId: 'core-pb-18',
        frontSurfaceId: 'surf-mel-white',
        edgeId: 'edge-pvc-white',
        materialProps: defaultMaterialProps,
      };

      const result = generateDrawerPanels(input);
      const front = result.panels.find(p => p.role === 'DRAWER_FRONT');

      // Cabinet inner width = 600 - 2×18 = 564
      // Front width = 564 + 2×18 = 600
      expect(front!.finishWidth).toBe(600);
      expect(front!.finishHeight).toBe(140);
    });

    it('bottom panel has horizontal orientation (rotated)', () => {
      const config: DrawerConfig = {
        hasDrawers: true,
        rows: [createDrawerRow(140)],
        slideType: 'undermount',
        boxMaterials: DEFAULT_DRAWER_BOX_MATERIALS,
        frontOverlay: 18,
      };

      const input: GenerateDrawerPanelsInput = {
        dimensions: defaultDimensions,
        structure: { ...defaultStructure, drawerConfig: config },
        frontCoreId: 'core-pb-18',
        frontSurfaceId: 'surf-mel-white',
        edgeId: 'edge-pvc-white',
        materialProps: defaultMaterialProps,
      };

      const result = generateDrawerPanels(input);
      const bottom = result.panels.find(p => p.role === 'DRAWER_BOTTOM');

      // Bottom should be rotated to lay flat
      expect(bottom!.rotation[0]).toBe(Math.PI / 2);
    });
  });

  describe('edge assignments', () => {
    it('drawer front has all 4 edges', () => {
      const config: DrawerConfig = {
        hasDrawers: true,
        rows: [createDrawerRow(140)],
        slideType: 'undermount',
        boxMaterials: DEFAULT_DRAWER_BOX_MATERIALS,
        frontOverlay: 18,
      };

      const input: GenerateDrawerPanelsInput = {
        dimensions: defaultDimensions,
        structure: { ...defaultStructure, drawerConfig: config },
        frontCoreId: 'core-pb-18',
        frontSurfaceId: 'surf-mel-white',
        edgeId: 'edge-pvc-white',
        materialProps: defaultMaterialProps,
      };

      const result = generateDrawerPanels(input);
      const front = result.panels.find(p => p.role === 'DRAWER_FRONT');

      expect(front!.edges.top).toBe('edge-pvc-white');
      expect(front!.edges.bottom).toBe('edge-pvc-white');
      expect(front!.edges.left).toBe('edge-pvc-white');
      expect(front!.edges.right).toBe('edge-pvc-white');
    });

    it('drawer bottom has no edges', () => {
      const config: DrawerConfig = {
        hasDrawers: true,
        rows: [createDrawerRow(140)],
        slideType: 'undermount',
        boxMaterials: DEFAULT_DRAWER_BOX_MATERIALS,
        frontOverlay: 18,
      };

      const input: GenerateDrawerPanelsInput = {
        dimensions: defaultDimensions,
        structure: { ...defaultStructure, drawerConfig: config },
        frontCoreId: 'core-pb-18',
        frontSurfaceId: 'surf-mel-white',
        edgeId: 'edge-pvc-white',
        materialProps: defaultMaterialProps,
      };

      const result = generateDrawerPanels(input);
      const bottom = result.panels.find(p => p.role === 'DRAWER_BOTTOM');

      expect(bottom!.edges.top).toBeNull();
      expect(bottom!.edges.bottom).toBeNull();
      expect(bottom!.edges.left).toBeNull();
      expect(bottom!.edges.right).toBeNull();
    });
  });
});

// ============================================
// calculateDrawerStackRequiredHeight TESTS
// ============================================

describe('calculateDrawerStackRequiredHeight', () => {
  it('returns 0 for empty array', () => {
    expect(calculateDrawerStackRequiredHeight([])).toBe(0);
  });

  it('calculates height including gaps', () => {
    const rows: DrawerRowConfig[] = [
      createDrawerRow(100, 3),
      createDrawerRow(140, 3),
    ];

    const result = calculateDrawerStackRequiredHeight(rows);

    expect(result).toBe(100 + 3 + 140 + 3);
  });
});

// ============================================
// validateDrawerFit TESTS
// ============================================

describe('validateDrawerFit', () => {
  it('returns fits:true when stack fits', () => {
    const rows: DrawerRowConfig[] = [
      createDrawerRow(100, 3),
      createDrawerRow(140, 3),
    ];

    const result = validateDrawerFit(500, rows);

    expect(result.fits).toBe(true);
    expect(result.required).toBe(246);
    expect(result.available).toBe(500);
  });

  it('returns fits:false when stack exceeds available', () => {
    const rows: DrawerRowConfig[] = [
      createDrawerRow(200, 3),
      createDrawerRow(200, 3),
      createDrawerRow(200, 3),
    ];

    const result = validateDrawerFit(500, rows);

    expect(result.fits).toBe(false);
    expect(result.required).toBe(609);
    expect(result.available).toBe(500);
  });
});
