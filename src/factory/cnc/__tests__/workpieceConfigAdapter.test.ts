/**
 * workpieceConfigAdapter.test.ts - Tests for UI ↔ CNC workpiece config conversion
 *
 * @version 1.0.0 - Phase D4
 */

import { describe, it, expect } from 'vitest';
import {
  adaptWorkpieceConfigToTransforms,
  validateWorkpieceConfig,
  hasActiveTransforms,
} from '../workpieceConfigAdapter';
import type { PacketDrillPanel } from '../../packet/types';
import type { WorkpieceConfig, WorkpiecePanelConfig } from '../../types/cnc';

// Test fixtures
const createTestPanels = (): PacketDrillPanel[] => [
  {
    panelId: 'panel-left',
    cabinetId: 'cab-1',
    role: 'LEFT',
    dimensions: [600, 720, 18],
    points: [],
  },
  {
    panelId: 'panel-right',
    cabinetId: 'cab-1',
    role: 'RIGHT',
    dimensions: [600, 720, 18],
    points: [],
  },
  {
    panelId: 'panel-bottom',
    cabinetId: 'cab-1',
    role: 'BOTTOM',
    dimensions: [564, 500, 18],
    points: [],
  },
];

const createDefaultPanelConfig = (panelId: string): WorkpiecePanelConfig => ({
  panelId,
  face: 'TOP',
  datum: 'FRONT_LEFT',
  offset: { x: 0, y: 0, z: 0 },
  rotationDeg: 0,
});

describe('adaptWorkpieceConfigToTransforms', () => {
  it('should return empty map when applyTransforms is false', () => {
    const panels = createTestPanels();
    const config: WorkpieceConfig = {
      panels: new Map([['panel-left', createDefaultPanelConfig('panel-left')]]),
      applyTransforms: false,
    };

    const result = adaptWorkpieceConfigToTransforms(config, panels);

    expect(result.size).toBe(0);
  });

  it('should convert panel config to transform context', () => {
    const panels = createTestPanels();
    const config: WorkpieceConfig = {
      panels: new Map([
        [
          'panel-left',
          {
            panelId: 'panel-left',
            face: 'TOP',
            datum: 'FRONT_LEFT',
            offset: { x: 100, y: 50, z: 0 },
            rotationDeg: 0,
          },
        ],
      ]),
      applyTransforms: true,
    };

    const result = adaptWorkpieceConfigToTransforms(config, panels);

    expect(result.size).toBe(1);
    const context = result.get('panel-left');
    expect(context).toBeDefined();
    expect(context!.panelId).toBe('panel-left');
    expect(context!.frame.face).toBe('TOP');
    expect(context!.frame.datum).toBe('FRONT_LEFT');
    expect(context!.frame.dimensions).toEqual({
      length: 600,
      width: 720,
      thickness: 18,
    });
    expect(context!.placement.offset).toEqual({ x: 100, y: 50, z: 0 });
    expect(context!.placement.rotationZ).toBeCloseTo(0);
  });

  it('should convert rotation from CW degrees to CCW radians', () => {
    const panels = createTestPanels();
    const config: WorkpieceConfig = {
      panels: new Map([
        [
          'panel-left',
          {
            panelId: 'panel-left',
            face: 'TOP',
            datum: 'FRONT_LEFT',
            offset: { x: 0, y: 0, z: 0 },
            rotationDeg: 90, // 90° CW
          },
        ],
      ]),
      applyTransforms: true,
    };

    const result = adaptWorkpieceConfigToTransforms(config, panels);
    const context = result.get('panel-left');

    // CW 90° = CCW -90° = -π/2
    expect(context!.placement.rotationZ).toBeCloseTo(-Math.PI / 2);
  });

  it('should convert 180° rotation correctly', () => {
    const panels = createTestPanels();
    const config: WorkpieceConfig = {
      panels: new Map([
        [
          'panel-left',
          {
            panelId: 'panel-left',
            face: 'TOP',
            datum: 'FRONT_LEFT',
            offset: { x: 0, y: 0, z: 0 },
            rotationDeg: 180,
          },
        ],
      ]),
      applyTransforms: true,
    };

    const result = adaptWorkpieceConfigToTransforms(config, panels);
    const context = result.get('panel-left');

    expect(context!.placement.rotationZ).toBeCloseTo(-Math.PI);
  });

  it('should convert BOTTOM face correctly', () => {
    const panels = createTestPanels();
    const config: WorkpieceConfig = {
      panels: new Map([
        [
          'panel-left',
          {
            panelId: 'panel-left',
            face: 'BOTTOM',
            datum: 'BACK_RIGHT',
            offset: { x: 0, y: 0, z: 0 },
            rotationDeg: 0,
          },
        ],
      ]),
      applyTransforms: true,
    };

    const result = adaptWorkpieceConfigToTransforms(config, panels);
    const context = result.get('panel-left');

    expect(context!.frame.face).toBe('BOTTOM');
    expect(context!.frame.datum).toBe('BACK_RIGHT');
  });

  it('should skip panels not in drill map', () => {
    const panels = createTestPanels();
    const config: WorkpieceConfig = {
      panels: new Map([
        ['panel-left', createDefaultPanelConfig('panel-left')],
        ['panel-unknown', createDefaultPanelConfig('panel-unknown')],
      ]),
      applyTransforms: true,
    };

    const result = adaptWorkpieceConfigToTransforms(config, panels);

    expect(result.size).toBe(1);
    expect(result.has('panel-left')).toBe(true);
    expect(result.has('panel-unknown')).toBe(false);
  });

  it('should handle multiple panels', () => {
    const panels = createTestPanels();
    const config: WorkpieceConfig = {
      panels: new Map([
        [
          'panel-left',
          {
            panelId: 'panel-left',
            face: 'TOP',
            datum: 'FRONT_LEFT',
            offset: { x: 0, y: 0, z: 0 },
            rotationDeg: 0,
          },
        ],
        [
          'panel-right',
          {
            panelId: 'panel-right',
            face: 'BOTTOM',
            datum: 'BACK_LEFT',
            offset: { x: 700, y: 0, z: 0 },
            rotationDeg: 90,
          },
        ],
      ]),
      applyTransforms: true,
    };

    const result = adaptWorkpieceConfigToTransforms(config, panels);

    expect(result.size).toBe(2);
    expect(result.get('panel-left')!.frame.face).toBe('TOP');
    expect(result.get('panel-right')!.frame.face).toBe('BOTTOM');
    expect(result.get('panel-right')!.placement.offset.x).toBe(700);
  });
});

describe('validateWorkpieceConfig', () => {
  it('should return empty errors when applyTransforms is false', () => {
    const panels = createTestPanels();
    const config: WorkpieceConfig = {
      panels: new Map([['panel-unknown', createDefaultPanelConfig('panel-unknown')]]),
      applyTransforms: false,
    };

    const errors = validateWorkpieceConfig(config, panels);

    expect(errors).toEqual([]);
  });

  it('should detect unknown panel IDs', () => {
    const panels = createTestPanels();
    const config: WorkpieceConfig = {
      panels: new Map([['panel-unknown', createDefaultPanelConfig('panel-unknown')]]),
      applyTransforms: true,
    };

    const errors = validateWorkpieceConfig(config, panels);

    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('panel-unknown');
  });

  it('should detect invalid rotation values', () => {
    const panels = createTestPanels();
    const config: WorkpieceConfig = {
      panels: new Map([
        [
          'panel-left',
          {
            panelId: 'panel-left',
            face: 'TOP',
            datum: 'FRONT_LEFT',
            offset: { x: 0, y: 0, z: 0 },
            rotationDeg: 45, // Invalid - not 0/90/180/270
          },
        ],
      ]),
      applyTransforms: true,
    };

    const errors = validateWorkpieceConfig(config, panels);

    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('45');
    expect(errors[0]).toContain('invalid rotation');
  });

  it('should pass valid configuration', () => {
    const panels = createTestPanels();
    const config: WorkpieceConfig = {
      panels: new Map([
        ['panel-left', createDefaultPanelConfig('panel-left')],
        [
          'panel-right',
          {
            panelId: 'panel-right',
            face: 'BOTTOM',
            datum: 'BACK_RIGHT',
            offset: { x: 100, y: 50, z: 0 },
            rotationDeg: 270,
          },
        ],
      ]),
      applyTransforms: true,
    };

    const errors = validateWorkpieceConfig(config, panels);

    expect(errors).toEqual([]);
  });
});

describe('hasActiveTransforms', () => {
  it('should return false when applyTransforms is false', () => {
    const config: WorkpieceConfig = {
      panels: new Map([
        [
          'panel-left',
          {
            panelId: 'panel-left',
            face: 'BOTTOM', // Non-default
            datum: 'FRONT_LEFT',
            offset: { x: 0, y: 0, z: 0 },
            rotationDeg: 0,
          },
        ],
      ]),
      applyTransforms: false,
    };

    expect(hasActiveTransforms(config)).toBe(false);
  });

  it('should return false when all panels have default settings', () => {
    const config: WorkpieceConfig = {
      panels: new Map([
        ['panel-left', createDefaultPanelConfig('panel-left')],
        ['panel-right', createDefaultPanelConfig('panel-right')],
      ]),
      applyTransforms: true,
    };

    expect(hasActiveTransforms(config)).toBe(false);
  });

  it('should return true when face is BOTTOM', () => {
    const config: WorkpieceConfig = {
      panels: new Map([
        [
          'panel-left',
          {
            panelId: 'panel-left',
            face: 'BOTTOM',
            datum: 'FRONT_LEFT',
            offset: { x: 0, y: 0, z: 0 },
            rotationDeg: 0,
          },
        ],
      ]),
      applyTransforms: true,
    };

    expect(hasActiveTransforms(config)).toBe(true);
  });

  it('should return true when datum is not FRONT_LEFT', () => {
    const config: WorkpieceConfig = {
      panels: new Map([
        [
          'panel-left',
          {
            panelId: 'panel-left',
            face: 'TOP',
            datum: 'CENTER',
            offset: { x: 0, y: 0, z: 0 },
            rotationDeg: 0,
          },
        ],
      ]),
      applyTransforms: true,
    };

    expect(hasActiveTransforms(config)).toBe(true);
  });

  it('should return true when rotation is non-zero', () => {
    const config: WorkpieceConfig = {
      panels: new Map([
        [
          'panel-left',
          {
            panelId: 'panel-left',
            face: 'TOP',
            datum: 'FRONT_LEFT',
            offset: { x: 0, y: 0, z: 0 },
            rotationDeg: 90,
          },
        ],
      ]),
      applyTransforms: true,
    };

    expect(hasActiveTransforms(config)).toBe(true);
  });

  it('should return true when offset is non-zero', () => {
    const config: WorkpieceConfig = {
      panels: new Map([
        [
          'panel-left',
          {
            panelId: 'panel-left',
            face: 'TOP',
            datum: 'FRONT_LEFT',
            offset: { x: 100, y: 0, z: 0 },
            rotationDeg: 0,
          },
        ],
      ]),
      applyTransforms: true,
    };

    expect(hasActiveTransforms(config)).toBe(true);
  });
});
