/**
 * useLiveValidationStore Tests
 *
 * Tests for the live validation store that provides real-time
 * collision feedback during drag operations.
 *
 * @version 1.0.0 - Phase 5: Real-time Validation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  useLiveValidationStore,
  hasDragCollisions,
  hasDragErrors,
  getDragCollisionTargetIds,
  getLastValidationTime,
  createDebouncedDragValidator,
} from '../useLiveValidationStore';
import type { CabinetCollisionShape } from '../../collision/obbTypes';
import type { CollisionContextOBB } from '../../collision/collisionEngine';

// ============================================
// MOCKS
// ============================================

// Mock the collision engine
vi.mock('../../collision/collisionEngine', () => ({
  detectCollisionForMovedCabinet: vi.fn().mockReturnValue(null),
  detectAllCollisions: vi.fn().mockReturnValue([]),
}));

import { detectAllCollisions } from '../../collision/collisionEngine';
const mockDetectAllCollisions = vi.mocked(detectAllCollisions);

// ============================================
// TEST FIXTURES
// ============================================

function makeBodyShape(cabinetId?: string): CabinetCollisionShape {
  return {
    cabinetId,
    obbs: [
      {
        center: { x: 0, y: 0, z: 0 },
        axisX: { x: 1, y: 0, z: 0 },
        axisY: { x: 0, y: 1, z: 0 },
        axisZ: { x: 0, y: 0, z: 1 },
        halfSize: { x: 300, y: 400, z: 100 },
      },
    ],
  };
}

function makeEnvelopeShape(): CabinetCollisionShape {
  return {
    obbs: [
      {
        center: { x: 0, y: 0, z: 200 },
        axisX: { x: 1, y: 0, z: 0 },
        axisY: { x: 0, y: 1, z: 0 },
        axisZ: { x: 0, y: 0, z: 1 },
        halfSize: { x: 300, y: 400, z: 200 },
      },
    ],
  };
}

function makeCollisionContext(): CollisionContextOBB {
  return {
    obstacles: [],
    cabinets: [
      { id: 'other-cab-1', shape: makeBodyShape('other-cab-1') },
      { id: 'other-cab-2', shape: makeBodyShape('other-cab-2') },
    ],
  };
}

// ============================================
// TESTS
// ============================================

describe('useLiveValidationStore', () => {
  beforeEach(() => {
    useLiveValidationStore.getState().reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // INITIAL STATE
  // ──────────────────────────────────────────────────────────────────────────

  describe('Initial State', () => {
    it('should start with empty state', () => {
      const state = useLiveValidationStore.getState();
      expect(state.isDragValidating).toBe(false);
      expect(state.dragCollisions).toEqual([]);
      expect(state.dragWarnings).toEqual([]);
      expect(state.lastDragResult).toBeNull();
      expect(state.dragCabinetId).toBeNull();
      expect(state.continuousValidationEnabled).toBe(false);
      expect(state.staticCollisions).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DRAG VALIDATION - NO COLLISION
  // ──────────────────────────────────────────────────────────────────────────

  describe('validateDragPosition (no collision)', () => {
    it('should set empty collisions when no collision detected', () => {
      mockDetectAllCollisions.mockReturnValue([]);

      const store = useLiveValidationStore.getState();
      store.validateDragPosition(
        'cab-1',
        makeBodyShape('cab-1'),
        undefined,
        makeCollisionContext()
      );

      const state = useLiveValidationStore.getState();
      expect(state.dragCollisions).toEqual([]);
      expect(state.dragCabinetId).toBe('cab-1');
      expect(state.isDragValidating).toBe(false);
      expect(state.lastDragResult).not.toBeNull();
      expect(state.lastDragResult!.hasCollisions).toBe(false);
      expect(state.lastDragResult!.errorCount).toBe(0);
    });

    it('should track validation time', () => {
      mockDetectAllCollisions.mockReturnValue([]);

      useLiveValidationStore.getState().validateDragPosition(
        'cab-1',
        makeBodyShape('cab-1'),
        undefined,
        makeCollisionContext()
      );

      const result = useLiveValidationStore.getState().lastDragResult;
      expect(result).not.toBeNull();
      expect(result!.validationTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DRAG VALIDATION - WITH BODY COLLISION
  // ──────────────────────────────────────────────────────────────────────────

  describe('validateDragPosition (body collision)', () => {
    it('should detect body collision as error', () => {
      mockDetectAllCollisions.mockReturnValue([
        {
          type: 'CABINET' as const,
          targetId: 'other-cab-1',
          reason: 'Body collision with other-cab-1',
        },
      ]);

      useLiveValidationStore.getState().validateDragPosition(
        'cab-1',
        makeBodyShape('cab-1'),
        undefined,
        makeCollisionContext()
      );

      const state = useLiveValidationStore.getState();
      expect(state.dragCollisions).toHaveLength(1);
      expect(state.dragCollisions[0].severity).toBe('error');
      expect(state.dragCollisions[0].hit.targetId).toBe('other-cab-1');
      expect(state.lastDragResult!.hasCollisions).toBe(true);
      expect(state.lastDragResult!.errorCount).toBe(1);
    });

    it('should detect multiple body collisions', () => {
      mockDetectAllCollisions.mockReturnValue([
        {
          type: 'CABINET' as const,
          targetId: 'other-cab-1',
          reason: 'Collision 1',
        },
        {
          type: 'OBSTACLE' as const,
          targetId: 'wall-1',
          targetKind: 'WALL',
          reason: 'Collision with wall',
        },
      ]);

      useLiveValidationStore.getState().validateDragPosition(
        'cab-1',
        makeBodyShape('cab-1'),
        undefined,
        makeCollisionContext()
      );

      const state = useLiveValidationStore.getState();
      expect(state.dragCollisions).toHaveLength(2);
      expect(state.lastDragResult!.errorCount).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DRAG VALIDATION - WITH ENVELOPE COLLISION
  // ──────────────────────────────────────────────────────────────────────────

  describe('validateDragPosition (envelope collision)', () => {
    it('should detect envelope collision as warning', () => {
      // First call (body) returns no collision
      // Second call (envelope) returns collision
      mockDetectAllCollisions
        .mockReturnValueOnce([]) // body check
        .mockReturnValueOnce([
          {
            type: 'CABINET' as const,
            targetId: 'other-cab-2',
            reason: 'Envelope overlap',
          },
        ]); // envelope check

      useLiveValidationStore.getState().validateDragPosition(
        'cab-1',
        makeBodyShape('cab-1'),
        makeEnvelopeShape(),
        makeCollisionContext()
      );

      const state = useLiveValidationStore.getState();
      expect(state.dragCollisions).toHaveLength(1);
      expect(state.dragCollisions[0].severity).toBe('warning');
      expect(state.dragWarnings).toHaveLength(1);
      expect(state.dragWarnings[0]).toContain('clearance');
      expect(state.lastDragResult!.warningCount).toBe(1);
    });

    it('should detect both body and envelope collisions', () => {
      // Body collision
      mockDetectAllCollisions
        .mockReturnValueOnce([
          {
            type: 'CABINET' as const,
            targetId: 'other-cab-1',
            reason: 'Body hit',
          },
        ])
        .mockReturnValueOnce([
          {
            type: 'CABINET' as const,
            targetId: 'other-cab-2',
            reason: 'Envelope hit',
          },
        ]);

      useLiveValidationStore.getState().validateDragPosition(
        'cab-1',
        makeBodyShape('cab-1'),
        makeEnvelopeShape(),
        makeCollisionContext()
      );

      const state = useLiveValidationStore.getState();
      expect(state.dragCollisions).toHaveLength(2);
      expect(state.lastDragResult!.errorCount).toBe(1);
      expect(state.lastDragResult!.warningCount).toBe(1);
    });

    it('should skip envelope check when no envelope shape', () => {
      mockDetectAllCollisions.mockReturnValue([]);

      useLiveValidationStore.getState().validateDragPosition(
        'cab-1',
        makeBodyShape('cab-1'),
        undefined,
        makeCollisionContext()
      );

      // Should only be called once (body check only)
      expect(mockDetectAllCollisions).toHaveBeenCalledTimes(1);
    });

    it('should skip envelope check when envelope has no OBBs', () => {
      mockDetectAllCollisions.mockReturnValue([]);

      useLiveValidationStore.getState().validateDragPosition(
        'cab-1',
        makeBodyShape('cab-1'),
        { obbs: [] },
        makeCollisionContext()
      );

      // Should only be called once (body check only)
      expect(mockDetectAllCollisions).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // CLEAR DRAG VALIDATION
  // ──────────────────────────────────────────────────────────────────────────

  describe('clearDragValidation', () => {
    it('should clear all drag state', () => {
      mockDetectAllCollisions.mockReturnValue([
        { type: 'CABINET' as const, targetId: 'x', reason: 'test' },
      ]);

      // First validate to populate state
      useLiveValidationStore.getState().validateDragPosition(
        'cab-1',
        makeBodyShape(),
        undefined,
        makeCollisionContext()
      );

      // Clear
      useLiveValidationStore.getState().clearDragValidation();

      const state = useLiveValidationStore.getState();
      expect(state.isDragValidating).toBe(false);
      expect(state.dragCollisions).toEqual([]);
      expect(state.dragWarnings).toEqual([]);
      expect(state.lastDragResult).toBeNull();
      expect(state.dragCabinetId).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // CONTINUOUS VALIDATION
  // ──────────────────────────────────────────────────────────────────────────

  describe('Continuous Validation', () => {
    it('should toggle continuous validation', () => {
      useLiveValidationStore.getState().setContinuousValidation(true);
      expect(useLiveValidationStore.getState().continuousValidationEnabled).toBe(true);

      useLiveValidationStore.getState().setContinuousValidation(false);
      expect(useLiveValidationStore.getState().continuousValidationEnabled).toBe(false);
    });

    it('should clear static collisions when disabling', () => {
      // Manually set some static collisions
      useLiveValidationStore.setState({
        staticCollisions: [
          {
            hit: { type: 'CABINET' as const, targetId: 'x', reason: 'test' },
            severity: 'error' as const,
            detectedAt: Date.now(),
          },
        ],
      });

      useLiveValidationStore.getState().setContinuousValidation(false);
      expect(useLiveValidationStore.getState().staticCollisions).toEqual([]);
    });

    it('should validate all static cabinets', () => {
      mockDetectAllCollisions.mockReturnValue([
        { type: 'CABINET' as const, targetId: 'cab-2', reason: 'Overlap' },
      ]);

      useLiveValidationStore.getState().validateAllStatic(
        [
          { id: 'cab-1', bodyShape: makeBodyShape('cab-1') },
          { id: 'cab-2', bodyShape: makeBodyShape('cab-2') },
        ],
        makeCollisionContext()
      );

      const state = useLiveValidationStore.getState();
      expect(state.staticCollisions.length).toBeGreaterThan(0);
    });

    it('should clear static collisions', () => {
      useLiveValidationStore.setState({
        staticCollisions: [
          {
            hit: { type: 'CABINET' as const, targetId: 'x', reason: 'test' },
            severity: 'error' as const,
            detectedAt: Date.now(),
          },
        ],
      });

      useLiveValidationStore.getState().clearStaticCollisions();
      expect(useLiveValidationStore.getState().staticCollisions).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SELECTOR HELPERS
  // ──────────────────────────────────────────────────────────────────────────

  describe('Selector Helpers', () => {
    it('hasDragCollisions returns false when empty', () => {
      expect(hasDragCollisions()).toBe(false);
    });

    it('hasDragCollisions returns true when collisions exist', () => {
      useLiveValidationStore.setState({
        dragCollisions: [
          {
            hit: { type: 'CABINET' as const, targetId: 'x', reason: 'test' },
            severity: 'error',
            detectedAt: Date.now(),
          },
        ],
      });
      expect(hasDragCollisions()).toBe(true);
    });

    it('hasDragErrors returns true only for error severity', () => {
      // Only warnings
      useLiveValidationStore.setState({
        dragCollisions: [
          {
            hit: { type: 'CABINET' as const, targetId: 'x', reason: 'test' },
            severity: 'warning',
            detectedAt: Date.now(),
          },
        ],
      });
      expect(hasDragErrors()).toBe(false);

      // With errors
      useLiveValidationStore.setState({
        dragCollisions: [
          {
            hit: { type: 'CABINET' as const, targetId: 'x', reason: 'test' },
            severity: 'error',
            detectedAt: Date.now(),
          },
        ],
      });
      expect(hasDragErrors()).toBe(true);
    });

    it('getDragCollisionTargetIds returns target IDs', () => {
      useLiveValidationStore.setState({
        dragCollisions: [
          {
            hit: { type: 'CABINET' as const, targetId: 'cab-a', reason: 'hit' },
            severity: 'error',
            detectedAt: Date.now(),
          },
          {
            hit: { type: 'OBSTACLE' as const, targetId: 'wall-1', targetKind: 'WALL', reason: 'hit' },
            severity: 'error',
            detectedAt: Date.now(),
          },
        ],
      });

      const ids = getDragCollisionTargetIds();
      expect(ids).toEqual(['cab-a', 'wall-1']);
    });

    it('getLastValidationTime returns 0 when no result', () => {
      expect(getLastValidationTime()).toBe(0);
    });

    it('getLastValidationTime returns time from last result', () => {
      useLiveValidationStore.setState({
        lastDragResult: {
          hasCollisions: false,
          errorCount: 0,
          warningCount: 0,
          collisions: [],
          validationTimeMs: 12.5,
        },
      });
      expect(getLastValidationTime()).toBe(12.5);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // RESET
  // ──────────────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('should reset all state', () => {
      // Populate some state
      useLiveValidationStore.setState({
        isDragValidating: true,
        dragCollisions: [
          {
            hit: { type: 'CABINET' as const, targetId: 'x', reason: 'test' },
            severity: 'error',
            detectedAt: Date.now(),
          },
        ],
        dragWarnings: ['warning'],
        lastDragResult: {
          hasCollisions: true,
          errorCount: 1,
          warningCount: 0,
          collisions: [],
          validationTimeMs: 5,
        },
        dragCabinetId: 'cab-1',
        continuousValidationEnabled: true,
        staticCollisions: [
          {
            hit: { type: 'CABINET' as const, targetId: 'y', reason: 'test' },
            severity: 'error',
            detectedAt: Date.now(),
          },
        ],
      });

      useLiveValidationStore.getState().reset();

      const state = useLiveValidationStore.getState();
      expect(state.isDragValidating).toBe(false);
      expect(state.dragCollisions).toEqual([]);
      expect(state.dragWarnings).toEqual([]);
      expect(state.lastDragResult).toBeNull();
      expect(state.dragCabinetId).toBeNull();
      expect(state.continuousValidationEnabled).toBe(false);
      expect(state.staticCollisions).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DEBOUNCED VALIDATOR
  // ──────────────────────────────────────────────────────────────────────────

  describe('createDebouncedDragValidator', () => {
    it('should run immediately on first call (real timers)', () => {
      mockDetectAllCollisions.mockReturnValue([]);

      // Use real timers — first call should always execute immediately
      // since lastRunTime starts at 0 and performance.now() >> 0
      const validate = createDebouncedDragValidator(100);

      validate('cab-1', makeBodyShape(), undefined, makeCollisionContext());

      // The debounced validator calls validateDragPosition on the store,
      // which in turn calls detectAllCollisions
      expect(mockDetectAllCollisions).toHaveBeenCalled();
    });

    it('should debounce rapid calls', () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      mockDetectAllCollisions.mockReturnValue([]);

      // Mock performance.now to control timing
      let mockNow = 1000;
      const originalPerformanceNow = performance.now;
      vi.spyOn(performance, 'now').mockImplementation(() => mockNow);

      try {
        const validate = createDebouncedDragValidator(100);

        // First call at t=1000 (should run immediately since lastRunTime=0)
        validate('cab-1', makeBodyShape(), undefined, makeCollisionContext());
        const callCount1 = mockDetectAllCollisions.mock.calls.length;
        expect(callCount1).toBeGreaterThan(0);

        // Second call at t=1020 (within 100ms interval, should defer)
        mockNow = 1020;
        validate('cab-1', makeBodyShape(), undefined, makeCollisionContext());
        const callCount2 = mockDetectAllCollisions.mock.calls.length;

        // Should not have run again immediately
        expect(callCount2).toBe(callCount1);

        // Advance timer past the debounce interval
        mockNow = 1200;
        vi.advanceTimersByTime(100);

        // Should have run now via the deferred setTimeout
        expect(mockDetectAllCollisions.mock.calls.length).toBeGreaterThan(callCount1);
      } finally {
        vi.spyOn(performance, 'now').mockRestore();
        vi.useRealTimers();
      }
    });
  });
});
