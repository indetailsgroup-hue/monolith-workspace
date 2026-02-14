/**
 * toolDiameterParser.test.ts - Unit tests for Tool Diameter Parser
 *
 * Tests tool diameter extraction from toolId strings.
 *
 * @version 0.1 - Phase 3 P2 implementation
 */

import { describe, it, expect } from 'vitest';
import { parseToolDiameter, getOperationDiameter } from '../toolDiameterParser';

// ============================================
// TESTS: parseToolDiameter
// ============================================

describe('parseToolDiameter', () => {
  describe('DRILL_ format', () => {
    it('parses DRILL_5 as 5mm', () => {
      expect(parseToolDiameter('DRILL_5')).toBe(5);
    });

    it('parses DRILL_8 as 8mm', () => {
      expect(parseToolDiameter('DRILL_8')).toBe(8);
    });

    it('parses DRILL_10 as 10mm', () => {
      expect(parseToolDiameter('DRILL_10')).toBe(10);
    });

    it('parses DRILL_5.5 as 5.5mm (decimal)', () => {
      expect(parseToolDiameter('DRILL_5.5')).toBe(5.5);
    });

    it('parses lowercase drill_8 as 8mm', () => {
      expect(parseToolDiameter('drill_8')).toBe(8);
    });
  });

  describe('BORE_ format', () => {
    it('parses BORE_15 as 15mm', () => {
      expect(parseToolDiameter('BORE_15')).toBe(15);
    });

    it('parses BORE_35 as 35mm', () => {
      expect(parseToolDiameter('BORE_35')).toBe(35);
    });

    it('parses bore_20 as 20mm (lowercase)', () => {
      expect(parseToolDiameter('bore_20')).toBe(20);
    });
  });

  describe('D prefix format', () => {
    it('parses D8_CARBIDE as 8mm', () => {
      expect(parseToolDiameter('D8_CARBIDE')).toBe(8);
    });

    it('parses D_10 as 10mm', () => {
      expect(parseToolDiameter('D_10')).toBe(10);
    });

    it('parses D12 as 12mm (no underscore)', () => {
      expect(parseToolDiameter('D12')).toBe(12);
    });

    it('parses d6_HSS as 6mm (lowercase)', () => {
      expect(parseToolDiameter('d6_HSS')).toBe(6);
    });
  });

  describe('edge cases', () => {
    it('returns default for empty string', () => {
      expect(parseToolDiameter('')).toBe(5);
    });

    it('returns default for null/undefined', () => {
      expect(parseToolDiameter(null as unknown as string)).toBe(5);
      expect(parseToolDiameter(undefined as unknown as string)).toBe(5);
    });

    it('returns default for non-matching format', () => {
      expect(parseToolDiameter('ROUTER_SPIRAL')).toBe(5);
    });

    it('returns default for custom tool IDs', () => {
      expect(parseToolDiameter('CUSTOM_TOOL_XYZ')).toBe(5);
    });

    it('uses custom default diameter when provided', () => {
      expect(parseToolDiameter('UNKNOWN_TOOL', 8)).toBe(8);
    });

    it('rejects zero diameter', () => {
      expect(parseToolDiameter('DRILL_0')).toBe(5);
    });

    it('rejects negative diameter patterns', () => {
      // Regex won't match negative, so returns default
      expect(parseToolDiameter('DRILL_-5')).toBe(5);
    });
  });

  describe('complex toolId formats', () => {
    it('parses DRILL_5_CARBIDE as 5mm', () => {
      expect(parseToolDiameter('DRILL_5_CARBIDE')).toBe(5);
    });

    it('parses BORE_35_FLATBOTTOM as 35mm', () => {
      expect(parseToolDiameter('BORE_35_FLATBOTTOM')).toBe(35);
    });

    it('parses D10_HSS_COATED as 10mm', () => {
      expect(parseToolDiameter('D10_HSS_COATED')).toBe(10);
    });
  });
});

// ============================================
// TESTS: getOperationDiameter
// ============================================

describe('getOperationDiameter', () => {
  describe('explicit diameter', () => {
    it('uses explicit diameter when provided', () => {
      const op = { toolId: 'DRILL_5', diameter: 8 };
      expect(getOperationDiameter(op)).toBe(8);
    });

    it('uses explicit diameter even when different from toolId', () => {
      const op = { toolId: 'DRILL_5', diameter: 10 };
      expect(getOperationDiameter(op)).toBe(10);
    });
  });

  describe('parsed from toolId', () => {
    it('parses from toolId when diameter is undefined', () => {
      const op = { toolId: 'DRILL_8' };
      expect(getOperationDiameter(op)).toBe(8);
    });

    it('parses from toolId when diameter is 0', () => {
      const op = { toolId: 'DRILL_8', diameter: 0 };
      expect(getOperationDiameter(op)).toBe(8);
    });

    it('parses from toolId when diameter is negative', () => {
      const op = { toolId: 'BORE_35', diameter: -1 };
      expect(getOperationDiameter(op)).toBe(35);
    });
  });

  describe('default fallback', () => {
    it('uses default when toolId is unparseable and no diameter', () => {
      const op = { toolId: 'CUSTOM_TOOL' };
      expect(getOperationDiameter(op)).toBe(5);
    });

    it('uses custom default when provided', () => {
      const op = { toolId: 'CUSTOM_TOOL' };
      expect(getOperationDiameter(op, 10)).toBe(10);
    });
  });
});
