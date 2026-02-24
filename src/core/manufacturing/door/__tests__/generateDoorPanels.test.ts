/**
 * generateDoorPanels.test.ts - Unit tests for door panel generation
 */

import { describe, expect, it } from 'vitest';
import {
  generateDoorPanels,
  calculateDoorHingePositions,
  validateDoorFit,
  type GenerateDoorPanelsInput,
} from '../generateDoorPanels';
import type {
  CabinetDimensions,
  CabinetStructure,
  DoorConfig,
  DoorPanelConfig,
} from '../../../types/Cabinet';

describe('generateDoorPanels', () => {
  // ============================================
  // Test Fixtures
  // ============================================

  const baseDimensions: CabinetDimensions = {
    width: 600,
    height: 720,
    depth: 560,
    toeKickHeight: 100,
  };

  const baseDoorConfig: DoorConfig = {
    hasDoors: true,
    doorCount: 1,
    doors: [{
      id: 'door-1',
      openingDirection: 'left',
      style: 'slab',
      overlayType: 'full',
      hingeId: 'blum-clip-top',
      hingeCount: 2,
    }],
    doorThickness: 18,
    overlayAmount: 18,
    doorGap: 3,
    revealGap: 2,
  };

  const baseStructure: CabinetStructure = {
    topJoint: 'INSET',
    bottomJoint: 'INSET',
    shelfCount: 1,
    dividerCount: 0,
    hasBackPanel: true,
    backPanelConstruction: 'inset',
    backPanelInset: 0,
    doorConfig: baseDoorConfig,
  };

  const baseMaterialProps = {
    edgeThickness: 1,
    cabinetPanelThickness: 18,
  };

  const createInput = (overrides: Partial<{
    dimensions: Partial<CabinetDimensions>;
    structure: Partial<CabinetStructure>;
    doorConfig: Partial<DoorConfig>;
  }> = {}): GenerateDoorPanelsInput => {
    const doorConfig = {
      ...baseDoorConfig,
      ...(overrides.doorConfig || {}),
    };

    return {
      dimensions: { ...baseDimensions, ...(overrides.dimensions || {}) },
      structure: {
        ...baseStructure,
        ...(overrides.structure || {}),
        doorConfig,
      },
      coreId: 'core-hmr-18',
      surfaceId: 'surf-mel-white',
      edgeId: 'edge-pvc-white-10',
      materialProps: baseMaterialProps,
    };
  };

  // ============================================
  // generateDoorPanels - Basic Tests
  // ============================================
  describe('generateDoorPanels', () => {
    it('returns empty result when doors are disabled', () => {
      const input = createInput({
        doorConfig: { hasDoors: false },
      });

      const result = generateDoorPanels(input);

      expect(result.panels).toHaveLength(0);
      expect(result.doorCount).toBe(0);
      expect(result.panelCount).toBe(0);
    });

    it('returns empty result when no door config', () => {
      const input: GenerateDoorPanelsInput = {
        dimensions: baseDimensions,
        structure: { ...baseStructure, doorConfig: undefined },
        coreId: 'core-hmr-18',
        surfaceId: 'surf-mel-white',
        edgeId: 'edge-pvc-white-10',
        materialProps: baseMaterialProps,
      };

      const result = generateDoorPanels(input);

      expect(result.panels).toHaveLength(0);
    });

    it('generates single door panel correctly', () => {
      const input = createInput();
      const result = generateDoorPanels(input);

      expect(result.panels).toHaveLength(1);
      expect(result.doorCount).toBe(1);
      expect(result.panelCount).toBe(1);

      const door = result.panels[0];
      expect(door.role).toBe('DOOR');
      expect(door.name).toBe('Door');
      expect(door.coreMaterialId).toBe('core-hmr-18');
      expect(door.faces.faceA).toBe('surf-mel-white');
      expect(door.faces.faceB).toBe('surf-mel-white');
      expect(door.edges.top).toBe('edge-pvc-white-10');
      expect(door.edges.bottom).toBe('edge-pvc-white-10');
      expect(door.edges.left).toBe('edge-pvc-white-10');
      expect(door.edges.right).toBe('edge-pvc-white-10');
    });

    it('generates double door panels correctly', () => {
      const input = createInput({
        doorConfig: {
          doorCount: 2,
          doors: [
            {
              id: 'door-left',
              openingDirection: 'left',
              style: 'slab',
              overlayType: 'full',
              hingeId: 'blum-clip-top',
            },
            {
              id: 'door-right',
              openingDirection: 'right',
              style: 'slab',
              overlayType: 'full',
              hingeId: 'blum-clip-top',
            },
          ],
        },
      });

      const result = generateDoorPanels(input);

      expect(result.panels).toHaveLength(2);
      expect(result.doorCount).toBe(2);
      expect(result.panelCount).toBe(2);

      expect(result.panels[0].role).toBe('DOOR_LEFT');
      expect(result.panels[0].name).toBe('Left Door');
      expect(result.panels[1].role).toBe('DOOR_RIGHT');
      expect(result.panels[1].name).toBe('Right Door');
    });

    it('calculates door dimensions based on overlay type', () => {
      // Full overlay
      const fullInput = createInput({
        doorConfig: {
          doors: [{ ...baseDoorConfig.doors[0], overlayType: 'full' }],
        },
      });
      const fullResult = generateDoorPanels(fullInput);

      // Inset
      const insetInput = createInput({
        doorConfig: {
          doors: [{ ...baseDoorConfig.doors[0], overlayType: 'inset' }],
        },
      });
      const insetResult = generateDoorPanels(insetInput);

      // Full overlay door should be larger than inset
      expect(fullResult.panels[0].finishWidth).toBeGreaterThan(
        insetResult.panels[0].finishWidth
      );
      expect(fullResult.panels[0].finishHeight).toBeGreaterThan(
        insetResult.panels[0].finishHeight
      );
    });

    it('positions doors at front of cabinet', () => {
      const input = createInput();
      const result = generateDoorPanels(input);

      const door = result.panels[0];
      const depth = baseDimensions.depth;
      const doorThickness = baseDoorConfig.doorThickness;

      // Z position should be at front (D/2 + thickness/2)
      expect(door.position[2]).toBe(depth / 2 + doorThickness / 2);
    });

    it('positions doors vertically centered with toe kick offset', () => {
      const input = createInput();
      const result = generateDoorPanels(input);

      const door = result.panels[0];
      const height = baseDimensions.height;
      const toeKick = baseDimensions.toeKickHeight;

      // Y position should be H/2 + toeKickHeight
      expect(door.position[1]).toBe(height / 2 + toeKick);
    });

    it('handles empty doors array', () => {
      const input = createInput({
        doorConfig: {
          hasDoors: true,
          doors: [],
        },
      });

      const result = generateDoorPanels(input);
      expect(result.panels).toHaveLength(0);
    });
  });

  // ============================================
  // calculateDoorHingePositions
  // ============================================
  describe('calculateDoorHingePositions', () => {
    it('returns custom positions when provided', () => {
      const config: DoorPanelConfig = {
        id: 'door-1',
        openingDirection: 'left',
        style: 'slab',
        overlayType: 'full',
        hingeId: 'test',
        hingePositions: [100, 300, 600],
      };

      const positions = calculateDoorHingePositions(700, config);

      expect(positions).toEqual([100, 300, 600]);
    });

    it('uses custom hinge count when provided', () => {
      const config: DoorPanelConfig = {
        id: 'door-1',
        openingDirection: 'left',
        style: 'slab',
        overlayType: 'full',
        hingeId: 'test',
        hingeCount: 4,
      };

      const positions = calculateDoorHingePositions(1500, config);

      expect(positions).toHaveLength(4);
    });

    it('calculates positions based on door height when no custom config', () => {
      const config: DoorPanelConfig = {
        id: 'door-1',
        openingDirection: 'left',
        style: 'slab',
        overlayType: 'full',
        hingeId: 'test',
      };

      const positions = calculateDoorHingePositions(700, config);

      // 700mm door gets 2 hinges by default
      expect(positions).toHaveLength(2);
    });

    it('ignores single-position custom positions', () => {
      const config: DoorPanelConfig = {
        id: 'door-1',
        openingDirection: 'left',
        style: 'slab',
        overlayType: 'full',
        hingeId: 'test',
        hingePositions: [100], // Invalid - needs at least 2
      };

      const positions = calculateDoorHingePositions(700, config);

      // Should calculate based on height instead
      expect(positions.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================
  // validateDoorFit
  // ============================================
  describe('validateDoorFit', () => {
    it('returns fits=true when doors are disabled', () => {
      const result = validateDoorFit(720, 600, {
        ...baseDoorConfig,
        hasDoors: false,
      });

      expect(result.fits).toBe(true);
    });

    it('returns fits=true for valid configuration', () => {
      const result = validateDoorFit(720, 600, baseDoorConfig);

      expect(result.fits).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('returns fits=false for very short cabinet', () => {
      const result = validateDoorFit(150, 600, {
        ...baseDoorConfig,
        overlayAmount: 0,
      });

      expect(result.fits).toBe(false);
      expect(result.message).toContain('height too small');
    });

    it('returns fits=false for very narrow double doors', () => {
      const result = validateDoorFit(720, 200, {
        ...baseDoorConfig,
        doorCount: 2,
        overlayAmount: 0,
        doorGap: 10,
      });

      expect(result.fits).toBe(false);
      expect(result.message).toContain('width too small');
    });

    it('returns fits=false for overly wide single door', () => {
      const result = validateDoorFit(720, 1200, {
        ...baseDoorConfig,
        doorCount: 1,
        overlayAmount: 50,
      });

      expect(result.fits).toBe(false);
      expect(result.message).toContain('width too large');
    });
  });

  // ============================================
  // Panel Properties
  // ============================================
  describe('panel properties', () => {
    it('sets grain direction to vertical', () => {
      const input = createInput();
      const result = generateDoorPanels(input);

      expect(result.panels[0].grainDirection).toBe('VERTICAL');
    });

    it('sets visible and selected flags', () => {
      const input = createInput();
      const result = generateDoorPanels(input);

      expect(result.panels[0].visible).toBe(true);
      expect(result.panels[0].selected).toBe(false);
    });

    it('sets rotation to zero', () => {
      const input = createInput();
      const result = generateDoorPanels(input);

      expect(result.panels[0].rotation).toEqual([0, 0, 0]);
    });

    it('creates unique IDs for each panel', () => {
      const input = createInput({
        doorConfig: {
          doorCount: 2,
          doors: [
            { id: 'd1', openingDirection: 'left', style: 'slab', overlayType: 'full', hingeId: 'h1' },
            { id: 'd2', openingDirection: 'right', style: 'slab', overlayType: 'full', hingeId: 'h1' },
          ],
        },
      });

      const result = generateDoorPanels(input);

      expect(result.panels[0].id).not.toBe(result.panels[1].id);
    });

    it('applies edge banding to all four sides', () => {
      const input = createInput();
      const result = generateDoorPanels(input);

      const edges = result.panels[0].edges;
      expect(edges.top).toBe('edge-pvc-white-10');
      expect(edges.bottom).toBe('edge-pvc-white-10');
      expect(edges.left).toBe('edge-pvc-white-10');
      expect(edges.right).toBe('edge-pvc-white-10');
    });
  });
});
