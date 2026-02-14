/**
 * useCabinetStore.test.ts - Unit tests for Cabinet Store (Rotation & Position)
 *
 * Tests cabinet rotation functions and scene position management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useCabinetStore } from '../useCabinetStore';

describe('useCabinetStore - Rotation & Position', () => {
  let testCabinetId: string;

  beforeEach(() => {
    // Reset store and create a test cabinet
    useCabinetStore.setState({ cabinets: [], cabinet: null, activeCabinetId: null });
    useCabinetStore.getState().createCabinet('BASE', 'Test Cabinet');
    const cabinet = useCabinetStore.getState().cabinet;
    testCabinetId = cabinet?.id || '';
  });

  describe('Scene Position', () => {
    it('should initialize with zero position', () => {
      const cabinet = useCabinetStore.getState().cabinets[0] as any;
      expect(cabinet.scenePosition).toEqual([0, 0, 0]);
    });

    it('should update cabinet position', () => {
      useCabinetStore.getState().updateCabinetPosition(testCabinetId, [100, 0, 200]);
      const cabinet = useCabinetStore.getState().cabinets.find(c => c.id === testCabinetId) as any;
      expect(cabinet.scenePosition).toEqual([100, 0, 200]);
    });

    it('should reject corrupted positions (> 10000mm)', () => {
      useCabinetStore.getState().updateCabinetPosition(testCabinetId, [100, 0, 0]);
      // Try to set corrupted position
      useCabinetStore.getState().updateCabinetPosition(testCabinetId, [99999, 0, 0]);
      const cabinet = useCabinetStore.getState().cabinets.find(c => c.id === testCabinetId) as any;
      // Should remain at previous valid position
      expect(cabinet.scenePosition).toEqual([100, 0, 0]);
    });
  });

  describe('Scene Rotation', () => {
    it('should initialize with zero rotation', () => {
      const cabinet = useCabinetStore.getState().cabinets[0] as any;
      expect(cabinet.sceneRotation).toEqual([0, 0, 0]);
    });

    it('should update cabinet rotation', () => {
      const rotation: [number, number, number] = [0, Math.PI / 2, 0];
      useCabinetStore.getState().updateCabinetRotation(testCabinetId, rotation);
      const cabinet = useCabinetStore.getState().cabinets.find(c => c.id === testCabinetId) as any;
      expect(cabinet.sceneRotation).toEqual(rotation);
    });

    it('should rotate 90° clockwise', () => {
      useCabinetStore.getState().rotateCabinet90(testCabinetId, 'cw');
      const cabinet = useCabinetStore.getState().cabinets.find(c => c.id === testCabinetId) as any;
      // CW = negative Y rotation
      expect(cabinet.sceneRotation[1]).toBeCloseTo(-Math.PI / 2);
    });

    it('should rotate 90° counter-clockwise', () => {
      useCabinetStore.getState().rotateCabinet90(testCabinetId, 'ccw');
      const cabinet = useCabinetStore.getState().cabinets.find(c => c.id === testCabinetId) as any;
      // CCW = positive Y rotation
      expect(cabinet.sceneRotation[1]).toBeCloseTo(Math.PI / 2);
    });

    it('should accumulate rotations', () => {
      useCabinetStore.getState().rotateCabinet90(testCabinetId, 'cw');
      useCabinetStore.getState().rotateCabinet90(testCabinetId, 'cw');
      const cabinet = useCabinetStore.getState().cabinets.find(c => c.id === testCabinetId) as any;
      expect(cabinet.sceneRotation[1]).toBeCloseTo(-Math.PI); // 180°
    });

    it('should handle full rotation (360°)', () => {
      for (let i = 0; i < 4; i++) {
        useCabinetStore.getState().rotateCabinet90(testCabinetId, 'cw');
      }
      const cabinet = useCabinetStore.getState().cabinets.find(c => c.id === testCabinetId) as any;
      expect(cabinet.sceneRotation[1]).toBeCloseTo(-2 * Math.PI);
    });
  });

  describe('Duplicate Cabinet', () => {
    it('should duplicate cabinet with offset position', () => {
      const original = useCabinetStore.getState().cabinets[0];
      const duplicate = useCabinetStore.getState().duplicateCabinet(testCabinetId);

      expect(duplicate).not.toBeNull();
      expect(duplicate?.id).not.toBe(testCabinetId);
      expect(duplicate?.name).toContain('(Copy)');

      const dupPos = (duplicate as any).scenePosition;
      const origPos = (original as any).scenePosition || [0, 0, 0];
      // Should be offset by width + 100mm gap
      expect(dupPos[0]).toBeGreaterThan(origPos[0]);
    });

    it('should copy rotation to duplicate', () => {
      useCabinetStore.getState().rotateCabinet90(testCabinetId, 'cw');
      const duplicate = useCabinetStore.getState().duplicateCabinet(testCabinetId);

      const origRot = (useCabinetStore.getState().cabinets.find(c => c.id === testCabinetId) as any).sceneRotation;
      const dupRot = (duplicate as any).sceneRotation;

      expect(dupRot[1]).toBeCloseTo(origRot[1]);
    });
  });

  describe('Reset Scene Positions', () => {
    it('should reset all cabinets to line up', () => {
      // Add another cabinet
      useCabinetStore.getState().addCabinet('BASE', 'Second Cabinet', { width: 600, height: 720, depth: 580 });

      // Scatter them
      const cabinets = useCabinetStore.getState().cabinets;
      useCabinetStore.getState().updateCabinetPosition(cabinets[0].id, [1000, 0, 500]);
      useCabinetStore.getState().updateCabinetPosition(cabinets[1].id, [-500, 0, 1000]);

      // Reset
      useCabinetStore.getState().resetScenePositions();

      // Check positions are sequential along X
      const resetCabinets = useCabinetStore.getState().cabinets;
      const pos0 = (resetCabinets[0] as any).scenePosition;
      const pos1 = (resetCabinets[1] as any).scenePosition;

      expect(pos0[0]).toBe(0);
      expect(pos0[2]).toBe(0);
      expect(pos1[0]).toBeGreaterThan(pos0[0]);
    });

    it('should reset rotations to zero', () => {
      useCabinetStore.getState().rotateCabinet90(testCabinetId, 'cw');
      useCabinetStore.getState().resetScenePositions();

      const cabinet = useCabinetStore.getState().cabinets.find(c => c.id === testCabinetId) as any;
      expect(cabinet.sceneRotation).toEqual([0, 0, 0]);
    });
  });
});
