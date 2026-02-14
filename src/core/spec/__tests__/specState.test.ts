/**
 * specState.test.ts - Tests for spec state machine
 *
 * Tests state transitions:
 *   DRAFT → FROZEN → RELEASED
 *
 * Tests permissions per state:
 * - DRAFT: Allow geometry edits
 * - FROZEN: No geometry edits (review/calculate allowed)
 * - RELEASED: Export allowed, no edits
 */

import { describe, it, expect } from 'vitest';
import {
  SpecState,
  SpecStatus,
  SPEC_TRANSITIONS,
  canTransition,
  getAvailableTransitions,
  createDraftStatus,
  createFrozenStatus,
  createReleasedStatus,
  transitionSpec,
  canEditGeometry,
  canExport,
  canFreeze,
  canRelease,
  canUnfreeze,
  isDraft,
  isFrozen,
  isReleased,
  assertDraft,
  assertFrozen,
  assertReleased,
  SpecStateError,
} from '../specState';

describe('specState', () => {
  describe('SPEC_TRANSITIONS', () => {
    it('should allow DRAFT → FROZEN', () => {
      expect(SPEC_TRANSITIONS.DRAFT).toContain('FROZEN');
    });

    it('should allow FROZEN → DRAFT (unfreeze)', () => {
      expect(SPEC_TRANSITIONS.FROZEN).toContain('DRAFT');
    });

    it('should allow FROZEN → RELEASED', () => {
      expect(SPEC_TRANSITIONS.FROZEN).toContain('RELEASED');
    });

    it('should NOT allow RELEASED → any state (terminal)', () => {
      expect(SPEC_TRANSITIONS.RELEASED).toHaveLength(0);
    });

    it('should NOT allow DRAFT → RELEASED directly', () => {
      expect(SPEC_TRANSITIONS.DRAFT).not.toContain('RELEASED');
    });
  });

  describe('canTransition', () => {
    it('should return true for valid transitions', () => {
      expect(canTransition('DRAFT', 'FROZEN')).toBe(true);
      expect(canTransition('FROZEN', 'DRAFT')).toBe(true);
      expect(canTransition('FROZEN', 'RELEASED')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(canTransition('DRAFT', 'RELEASED')).toBe(false);
      expect(canTransition('RELEASED', 'DRAFT')).toBe(false);
      expect(canTransition('RELEASED', 'FROZEN')).toBe(false);
    });

    it('should return false for self-transitions', () => {
      expect(canTransition('DRAFT', 'DRAFT')).toBe(false);
      expect(canTransition('FROZEN', 'FROZEN')).toBe(false);
      expect(canTransition('RELEASED', 'RELEASED')).toBe(false);
    });
  });

  describe('getAvailableTransitions', () => {
    it('should return [FROZEN] for DRAFT', () => {
      expect(getAvailableTransitions('DRAFT')).toEqual(['FROZEN']);
    });

    it('should return [DRAFT, RELEASED] for FROZEN', () => {
      expect(getAvailableTransitions('FROZEN')).toEqual(['DRAFT', 'RELEASED']);
    });

    it('should return [] for RELEASED', () => {
      expect(getAvailableTransitions('RELEASED')).toEqual([]);
    });
  });

  describe('createDraftStatus', () => {
    it('should create status with DRAFT state', () => {
      const status = createDraftStatus();
      expect(status.state).toBe('DRAFT');
    });

    it('should include optional note', () => {
      const status = createDraftStatus('Initial design');
      expect(status.note).toBe('Initial design');
    });

    it('should not have timestamps', () => {
      const status = createDraftStatus();
      expect(status.frozenAtIso).toBeUndefined();
      expect(status.releasedAtIso).toBeUndefined();
    });
  });

  describe('createFrozenStatus', () => {
    it('should create status with FROZEN state', () => {
      const current = createDraftStatus();
      const frozen = createFrozenStatus(current);
      expect(frozen.state).toBe('FROZEN');
    });

    it('should set frozenAtIso timestamp', () => {
      const current = createDraftStatus();
      const frozen = createFrozenStatus(current);
      expect(frozen.frozenAtIso).toBeDefined();
      expect(new Date(frozen.frozenAtIso!).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should preserve note from current status', () => {
      const current = createDraftStatus('Design complete');
      const frozen = createFrozenStatus(current);
      expect(frozen.note).toBe('Design complete');
    });
  });

  describe('createReleasedStatus', () => {
    it('should create status with RELEASED state', () => {
      const frozen = createFrozenStatus(createDraftStatus());
      const released = createReleasedStatus(frozen);
      expect(released.state).toBe('RELEASED');
    });

    it('should set releasedAtIso timestamp', () => {
      const frozen = createFrozenStatus(createDraftStatus());
      const released = createReleasedStatus(frozen);
      expect(released.releasedAtIso).toBeDefined();
    });

    it('should preserve frozenAtIso from frozen status', () => {
      const frozen = createFrozenStatus(createDraftStatus());
      const released = createReleasedStatus(frozen);
      expect(released.frozenAtIso).toBe(frozen.frozenAtIso);
    });
  });

  describe('transitionSpec', () => {
    it('should transition DRAFT → FROZEN', () => {
      const draft = createDraftStatus();
      const result = transitionSpec(draft, 'FROZEN');
      expect(result).not.toBeNull();
      expect(result!.state).toBe('FROZEN');
    });

    it('should transition FROZEN → RELEASED', () => {
      const frozen = createFrozenStatus(createDraftStatus());
      const result = transitionSpec(frozen, 'RELEASED');
      expect(result).not.toBeNull();
      expect(result!.state).toBe('RELEASED');
    });

    it('should transition FROZEN → DRAFT (unfreeze)', () => {
      const frozen = createFrozenStatus(createDraftStatus());
      const result = transitionSpec(frozen, 'DRAFT');
      expect(result).not.toBeNull();
      expect(result!.state).toBe('DRAFT');
    });

    it('should return null for invalid transition', () => {
      const draft = createDraftStatus();
      const result = transitionSpec(draft, 'RELEASED');
      expect(result).toBeNull();
    });

    it('should return null for terminal state', () => {
      const released = createReleasedStatus(createFrozenStatus(createDraftStatus()));
      expect(transitionSpec(released, 'DRAFT')).toBeNull();
      expect(transitionSpec(released, 'FROZEN')).toBeNull();
    });
  });

  describe('permission checks', () => {
    describe('canEditGeometry', () => {
      it('should return true only for DRAFT', () => {
        expect(canEditGeometry('DRAFT')).toBe(true);
        expect(canEditGeometry('FROZEN')).toBe(false);
        expect(canEditGeometry('RELEASED')).toBe(false);
      });
    });

    describe('canExport', () => {
      it('should return true only for RELEASED', () => {
        expect(canExport('DRAFT')).toBe(false);
        expect(canExport('FROZEN')).toBe(false);
        expect(canExport('RELEASED')).toBe(true);
      });
    });

    describe('canFreeze', () => {
      it('should return true only for DRAFT', () => {
        expect(canFreeze('DRAFT')).toBe(true);
        expect(canFreeze('FROZEN')).toBe(false);
        expect(canFreeze('RELEASED')).toBe(false);
      });
    });

    describe('canRelease', () => {
      it('should return true only for FROZEN', () => {
        expect(canRelease('DRAFT')).toBe(false);
        expect(canRelease('FROZEN')).toBe(true);
        expect(canRelease('RELEASED')).toBe(false);
      });
    });

    describe('canUnfreeze', () => {
      it('should return true only for FROZEN', () => {
        expect(canUnfreeze('DRAFT')).toBe(false);
        expect(canUnfreeze('FROZEN')).toBe(true);
        expect(canUnfreeze('RELEASED')).toBe(false);
      });
    });
  });

  describe('type guards', () => {
    describe('isDraft', () => {
      it('should return true for DRAFT status', () => {
        const draft = createDraftStatus();
        const frozen = createFrozenStatus(draft);
        const released = createReleasedStatus(frozen);

        expect(isDraft(draft)).toBe(true);
        expect(isDraft(frozen)).toBe(false);
        expect(isDraft(released)).toBe(false);
      });
    });

    describe('isFrozen', () => {
      it('should return true for FROZEN status', () => {
        const draft = createDraftStatus();
        const frozen = createFrozenStatus(draft);
        const released = createReleasedStatus(frozen);

        expect(isFrozen(draft)).toBe(false);
        expect(isFrozen(frozen)).toBe(true);
        expect(isFrozen(released)).toBe(false);
      });
    });

    describe('isReleased', () => {
      it('should return true for RELEASED status', () => {
        const draft = createDraftStatus();
        const frozen = createFrozenStatus(draft);
        const released = createReleasedStatus(frozen);

        expect(isReleased(draft)).toBe(false);
        expect(isReleased(frozen)).toBe(false);
        expect(isReleased(released)).toBe(true);
      });
    });
  });

  describe('assertion functions', () => {
    describe('assertDraft', () => {
      it('should not throw for DRAFT status', () => {
        const draft = createDraftStatus();
        expect(() => assertDraft(draft)).not.toThrow();
      });

      it('should throw SpecStateError for non-DRAFT status', () => {
        const frozen = createFrozenStatus(createDraftStatus());
        const released = createReleasedStatus(frozen);

        expect(() => assertDraft(frozen)).toThrow(SpecStateError);
        expect(() => assertDraft(released)).toThrow(SpecStateError);
      });

      it('should include operation name in error message', () => {
        const frozen = createFrozenStatus(createDraftStatus());

        try {
          assertDraft(frozen, 'edit geometry');
          expect.fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(SpecStateError);
          expect((e as Error).message).toContain('edit geometry');
        }
      });
    });

    describe('assertFrozen', () => {
      it('should not throw for FROZEN status', () => {
        const frozen = createFrozenStatus(createDraftStatus());
        expect(() => assertFrozen(frozen)).not.toThrow();
      });

      it('should throw SpecStateError for non-FROZEN status', () => {
        const draft = createDraftStatus();
        const released = createReleasedStatus(createFrozenStatus(draft));

        expect(() => assertFrozen(draft)).toThrow(SpecStateError);
        expect(() => assertFrozen(released)).toThrow(SpecStateError);
      });
    });

    describe('assertReleased', () => {
      it('should not throw for RELEASED status', () => {
        const released = createReleasedStatus(createFrozenStatus(createDraftStatus()));
        expect(() => assertReleased(released)).not.toThrow();
      });

      it('should throw SpecStateError for non-RELEASED status', () => {
        const draft = createDraftStatus();
        const frozen = createFrozenStatus(draft);

        expect(() => assertReleased(draft)).toThrow(SpecStateError);
        expect(() => assertReleased(frozen)).toThrow(SpecStateError);
      });
    });
  });

  describe('SpecStateError', () => {
    it('should be instanceof Error', () => {
      const error = new SpecStateError('Test error message');
      expect(error).toBeInstanceOf(Error);
    });

    it('should have correct name', () => {
      const error = new SpecStateError('Test error');
      expect(error.name).toBe('SpecStateError');
    });

    it('should preserve message', () => {
      const error = new SpecStateError('Cannot edit: requires DRAFT state');
      expect(error.message).toBe('Cannot edit: requires DRAFT state');
    });
  });

  describe('complete workflow', () => {
    it('should support full DRAFT → FROZEN → RELEASED flow', () => {
      // Start with draft
      let status = createDraftStatus('Initial design');
      expect(status.state).toBe('DRAFT');
      expect(canEditGeometry(status.state)).toBe(true);

      // Freeze for review
      status = transitionSpec(status, 'FROZEN')!;
      expect(status.state).toBe('FROZEN');
      expect(canEditGeometry(status.state)).toBe(false);
      expect(status.frozenAtIso).toBeDefined();

      // Release for factory
      status = transitionSpec(status, 'RELEASED')!;
      expect(status.state).toBe('RELEASED');
      expect(canExport(status.state)).toBe(true);
      expect(status.releasedAtIso).toBeDefined();

      // Cannot transition from RELEASED
      const nextStatus = transitionSpec(status, 'DRAFT');
      expect(nextStatus).toBeNull();
    });

    it('should support unfreeze flow', () => {
      // Create and freeze
      let status = createDraftStatus();
      status = transitionSpec(status, 'FROZEN')!;
      expect(status.state).toBe('FROZEN');

      // Unfreeze back to DRAFT
      status = transitionSpec(status, 'DRAFT')!;
      expect(status.state).toBe('DRAFT');
      expect(canEditGeometry(status.state)).toBe(true);
    });
  });
});
