/**
 * buildOffsetSpec.test.ts - Tests for offset spec builder
 *
 * Tests offset calculation for:
 * - PROFILE operations (outside/inside cuts)
 * - GROOVE operations (centerline)
 * - POCKET operations (clearing/finish)
 * - ROUGH vs FINISH passes
 */

import { describe, it, expect } from 'vitest';
import {
  buildOffsetSpec,
  BuildOffsetRequest,
} from '../buildOffsetSpec';

describe('buildOffsetSpec', () => {
  describe('PROFILE operations', () => {
    describe('OUTSIDE cuts', () => {
      it('should calculate finish pass offset = R + user + kerf', () => {
        const req: BuildOffsetRequest = {
          opKind: 'PROFILE',
          pass: 'FINISH',
          cutSide: 'OUTSIDE',
          pathWinding: 'CCW',
          toolDiameterMm: 6,
          userAllowanceMm: 0.1,
          kerfAllowanceMm: 0,
        };

        const result = buildOffsetSpec(req);

        // R = 3, user = 0.1, kerf = 0 → dist = 3.1
        expect(result.spec.distanceMm).toBeCloseTo(3.1, 4);
        expect(result.spec.side).toBe('RIGHT'); // CCW + OUTSIDE → RIGHT
        expect(result.spec.why).toContain('PROFILE_OUTSIDE');
        expect(result.spec.why).toContain('RADIUS_COMP');
      });

      it('should calculate rough pass offset = max(0, R + user + kerf - stock)', () => {
        const req: BuildOffsetRequest = {
          opKind: 'PROFILE',
          pass: 'ROUGH',
          cutSide: 'OUTSIDE',
          pathWinding: 'CCW',
          toolDiameterMm: 6,
          stockToLeaveMm: 0.5,
        };

        const result = buildOffsetSpec(req);

        // R = 3, stock = 0.5 → dist = 2.5
        expect(result.spec.distanceMm).toBeCloseTo(2.5, 4);
        expect(result.spec.why).toContain('FINISH_ALLOWANCE');
      });

      it('should clamp rough offset to 0 when stock >= base', () => {
        const req: BuildOffsetRequest = {
          opKind: 'PROFILE',
          pass: 'ROUGH',
          cutSide: 'OUTSIDE',
          pathWinding: 'CCW',
          toolDiameterMm: 6,
          stockToLeaveMm: 10, // More than R (3)
        };

        const result = buildOffsetSpec(req);

        expect(result.spec.distanceMm).toBe(0);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain('centerline');
      });
    });

    describe('INSIDE cuts (holes)', () => {
      it('should offset LEFT for CCW inside cut', () => {
        const req: BuildOffsetRequest = {
          opKind: 'PROFILE',
          pass: 'FINISH',
          cutSide: 'INSIDE',
          pathWinding: 'CCW',
          toolDiameterMm: 6,
        };

        const result = buildOffsetSpec(req);

        expect(result.spec.side).toBe('LEFT');
        expect(result.spec.why).toContain('PROFILE_INSIDE');
      });

      it('should offset RIGHT for CW inside cut', () => {
        const req: BuildOffsetRequest = {
          opKind: 'PROFILE',
          pass: 'FINISH',
          cutSide: 'INSIDE',
          pathWinding: 'CW',
          toolDiameterMm: 6,
        };

        const result = buildOffsetSpec(req);

        expect(result.spec.side).toBe('RIGHT');
      });
    });

    it('should throw if cutSide missing for PROFILE', () => {
      const req: BuildOffsetRequest = {
        opKind: 'PROFILE',
        pass: 'FINISH',
        pathWinding: 'CCW',
        toolDiameterMm: 6,
        // cutSide missing
      };

      expect(() => buildOffsetSpec(req)).toThrow('cutSide is required');
    });
  });

  describe('GROOVE operations', () => {
    it('should return zero offset for centerline groove', () => {
      const req: BuildOffsetRequest = {
        opKind: 'GROOVE',
        pass: 'FINISH',
        pathWinding: 'CCW',
        toolDiameterMm: 6,
      };

      const result = buildOffsetSpec(req);

      expect(result.spec.distanceMm).toBe(0);
      expect(result.spec.why).toContain('GROOVE_CENTERLINE');
      expect(result.spec.formula).toContain('centerline');
    });

    it('should apply offset for offset grooves', () => {
      const req: BuildOffsetRequest = {
        opKind: 'GROOVE',
        pass: 'FINISH',
        pathWinding: 'CCW',
        toolDiameterMm: 6,
        grooveSide: 'LEFT',
        grooveWidthMm: 10, // If groove width specified, offset may be calculated
      };

      const result = buildOffsetSpec(req);

      // Offset grooves use GROOVE_OFFSET reason, not GROOVE_CENTERLINE
      expect(result.spec.why).toContain('GROOVE_OFFSET');
    });
  });

  describe('POCKET operations', () => {
    it('should calculate pocket clearing offset', () => {
      const req: BuildOffsetRequest = {
        opKind: 'POCKET',
        pass: 'ROUGH',
        pathWinding: 'CCW',
        toolDiameterMm: 6,
        stockToLeaveMm: 0.3,
      };

      const result = buildOffsetSpec(req);

      // Pocket clears toward interior
      expect(result.spec.side).toBe('LEFT'); // CCW interior
      expect(result.spec.why).toContain('POCKET_CLEAR');
    });

    it('should calculate pocket finish offset', () => {
      const req: BuildOffsetRequest = {
        opKind: 'POCKET',
        pass: 'FINISH',
        pathWinding: 'CCW',
        toolDiameterMm: 6,
      };

      const result = buildOffsetSpec(req);

      expect(result.spec.why).toContain('POCKET_FINISH');
    });
  });

  describe('input validation', () => {
    it('should throw error for zero tool diameter', () => {
      const req: BuildOffsetRequest = {
        opKind: 'PROFILE',
        pass: 'FINISH',
        cutSide: 'OUTSIDE',
        pathWinding: 'CCW',
        toolDiameterMm: 0,
      };

      // Implementation throws error for invalid tool diameter
      expect(() => buildOffsetSpec(req)).toThrow('Invalid tool diameter');
    });

    it('should record all inputs in spec', () => {
      const req: BuildOffsetRequest = {
        opKind: 'PROFILE',
        pass: 'ROUGH',
        cutSide: 'OUTSIDE',
        pathWinding: 'CCW',
        toolDiameterMm: 8,
        userAllowanceMm: 0.2,
        kerfAllowanceMm: 0.1,
        stockToLeaveMm: 0.5,
      };

      const result = buildOffsetSpec(req);

      expect(result.spec.inputs.toolDiameterMm).toBe(8);
      expect(result.spec.inputs.toolRadiusMm).toBe(4);
      expect(result.spec.inputs.userAllowanceMm).toBe(0.2);
      expect(result.spec.inputs.kerfAllowanceMm).toBe(0.1);
      expect(result.spec.inputs.stockToLeaveMm).toBe(0.5);
    });

    it('should handle negative user allowance', () => {
      const req: BuildOffsetRequest = {
        opKind: 'PROFILE',
        pass: 'FINISH',
        cutSide: 'OUTSIDE',
        pathWinding: 'CCW',
        toolDiameterMm: 6,
        userAllowanceMm: -0.1, // Undercut
      };

      const result = buildOffsetSpec(req);

      // R = 3, user = -0.1 → dist = 2.9
      expect(result.spec.distanceMm).toBeCloseTo(2.9, 4);
      expect(result.spec.why).toContain('USER_ALLOWANCE');
    });
  });

  describe('formula documentation', () => {
    it('should include formula in spec', () => {
      const req: BuildOffsetRequest = {
        opKind: 'PROFILE',
        pass: 'FINISH',
        cutSide: 'OUTSIDE',
        pathWinding: 'CCW',
        toolDiameterMm: 6,
      };

      const result = buildOffsetSpec(req);

      expect(result.spec.formula).toBeTruthy();
      expect(result.spec.formula).toContain('=');
    });

    it('should have different formulas for rough vs finish', () => {
      const baseReq: Omit<BuildOffsetRequest, 'pass'> = {
        opKind: 'PROFILE',
        cutSide: 'OUTSIDE',
        pathWinding: 'CCW',
        toolDiameterMm: 6,
        stockToLeaveMm: 0.5,
      };

      const roughResult = buildOffsetSpec({ ...baseReq, pass: 'ROUGH' });
      const finishResult = buildOffsetSpec({ ...baseReq, pass: 'FINISH' });

      expect(roughResult.spec.formula).not.toBe(finishResult.spec.formula);
      expect(roughResult.spec.formula).toContain('stock');
    });
  });

  describe('version field', () => {
    it('should always be "1.0"', () => {
      const req: BuildOffsetRequest = {
        opKind: 'PROFILE',
        pass: 'FINISH',
        cutSide: 'OUTSIDE',
        pathWinding: 'CCW',
        toolDiameterMm: 6,
      };

      const result = buildOffsetSpec(req);

      expect(result.spec.version).toBe('1.0');
    });
  });
});
