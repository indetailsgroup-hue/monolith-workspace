/**
 * specPolicy.test.ts - Tests for spec policy enforcement
 *
 * Tests policy guards:
 * - assertExportAllowedBySpec: Export requires RELEASED
 * - assertEditAllowedBySpec: Edits only in DRAFT
 * - assertFreezeAllowed: Freeze from DRAFT only
 * - assertReleaseAllowed: Release from FROZEN only
 * - assertUnfreezeAllowed: Unfreeze from FROZEN only
 */

import { describe, it, expect } from 'vitest';
import {
  getSpecStatusFromHead,
  getSpecStateFromHead,
  assertExportAllowedBySpec,
  assertEditAllowedBySpec,
  assertFreezeAllowed,
  assertReleaseAllowed,
  assertUnfreezeAllowed,
  assertExportAllowed,
  getStateDescription,
  getStateColor,
  type PolicyResult,
} from '../specPolicy';
import type { SpecState, SpecStatus } from '../specState';
import type { SignedJobManifest } from '../../trust/manifestChainTypes';

describe('specPolicy', () => {
  // Helper to create mock SignedJobManifest with spec status
  function createMockManifest(state: SpecState, gateOk: boolean = true): SignedJobManifest {
    return {
      version: '1.0',
      jobId: 'test-job',
      prevManifestHashHex: null,
      manifestHashHex: 'abc123',
      signedTrust: {
        trust: {
          spec: { state },
          gate: { ok: gateOk, errorCount: gateOk ? 0 : 1 },
        },
      } as SignedJobManifest['signedTrust'],
      exports: [],
      manifestSignatureHex: 'sig123',
      manifestKeyId: 'key123',
      algo: 'Ed25519',
      createdIso: new Date().toISOString(),
    };
  }

  describe('getSpecStatusFromHead', () => {
    it('should extract spec status from manifest head', () => {
      const manifest = createMockManifest('FROZEN');
      const status = getSpecStatusFromHead(manifest);
      expect(status.state).toBe('FROZEN');
    });

    it('should return DRAFT status if no spec in manifest', () => {
      const manifest = {
        version: '1.0',
        jobId: 'test',
        prevManifestHashHex: null,
        manifestHashHex: 'abc',
        signedTrust: {
          trust: {},
          trustHashHex: 'mock-hash',
          signatureHex: 'mock-sig',
          keyId: 'mock-key',
          algo: 'Ed25519',
        },
        exports: [],
        manifestSignatureHex: 'sig',
        manifestKeyId: 'key',
        algo: 'Ed25519',
        createdIso: new Date().toISOString(),
      } as unknown as SignedJobManifest;

      const status = getSpecStatusFromHead(manifest);
      expect(status.state).toBe('DRAFT');
    });
  });

  describe('getSpecStateFromHead', () => {
    it('should extract spec state from manifest head', () => {
      const manifest = createMockManifest('RELEASED');
      const state = getSpecStateFromHead(manifest);
      expect(state).toBe('RELEASED');
    });
  });

  describe('assertExportAllowedBySpec', () => {
    it('should return ok for RELEASED state', () => {
      const manifest = createMockManifest('RELEASED');
      const result = assertExportAllowedBySpec(manifest);
      expect(result.ok).toBe(true);
    });

    it('should return not ok for DRAFT state', () => {
      const manifest = createMockManifest('DRAFT');
      const result = assertExportAllowedBySpec(manifest);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('RELEASED');
      }
    });

    it('should return not ok for FROZEN state', () => {
      const manifest = createMockManifest('FROZEN');
      const result = assertExportAllowedBySpec(manifest);
      expect(result.ok).toBe(false);
    });

    it('should include helpful message in reason', () => {
      const manifest = createMockManifest('DRAFT');
      const result = assertExportAllowedBySpec(manifest);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('RELEASED');
        expect(result.reason).toContain('DRAFT');
      }
    });
  });

  describe('assertEditAllowedBySpec', () => {
    it('should return ok for DRAFT state', () => {
      const manifest = createMockManifest('DRAFT');
      const result = assertEditAllowedBySpec(manifest);
      expect(result.ok).toBe(true);
    });

    it('should return not ok for FROZEN state', () => {
      const manifest = createMockManifest('FROZEN');
      const result = assertEditAllowedBySpec(manifest);
      expect(result.ok).toBe(false);
    });

    it('should return not ok for RELEASED state', () => {
      const manifest = createMockManifest('RELEASED');
      const result = assertEditAllowedBySpec(manifest);
      expect(result.ok).toBe(false);
    });
  });

  describe('assertFreezeAllowed', () => {
    it('should return ok for DRAFT state', () => {
      const manifest = createMockManifest('DRAFT');
      const result = assertFreezeAllowed(manifest);
      expect(result.ok).toBe(true);
    });

    it('should return not ok for FROZEN state', () => {
      const manifest = createMockManifest('FROZEN');
      const result = assertFreezeAllowed(manifest);
      expect(result.ok).toBe(false);
    });

    it('should return not ok for RELEASED state', () => {
      const manifest = createMockManifest('RELEASED');
      const result = assertFreezeAllowed(manifest);
      expect(result.ok).toBe(false);
    });
  });

  describe('assertReleaseAllowed', () => {
    it('should return ok for FROZEN state', () => {
      const manifest = createMockManifest('FROZEN');
      const result = assertReleaseAllowed(manifest);
      expect(result.ok).toBe(true);
    });

    it('should return not ok for DRAFT state', () => {
      const manifest = createMockManifest('DRAFT');
      const result = assertReleaseAllowed(manifest);
      expect(result.ok).toBe(false);
    });

    it('should return not ok for RELEASED state', () => {
      const manifest = createMockManifest('RELEASED');
      const result = assertReleaseAllowed(manifest);
      expect(result.ok).toBe(false);
    });
  });

  describe('assertUnfreezeAllowed', () => {
    it('should return ok for FROZEN state', () => {
      const manifest = createMockManifest('FROZEN');
      const result = assertUnfreezeAllowed(manifest);
      expect(result.ok).toBe(true);
    });

    it('should return not ok for DRAFT state', () => {
      const manifest = createMockManifest('DRAFT');
      const result = assertUnfreezeAllowed(manifest);
      expect(result.ok).toBe(false);
    });

    it('should return not ok for RELEASED state', () => {
      const manifest = createMockManifest('RELEASED');
      const result = assertUnfreezeAllowed(manifest);
      expect(result.ok).toBe(false);
    });
  });

  describe('assertExportAllowed (combined check)', () => {
    it('should return ok for RELEASED spec with valid gate', () => {
      const manifest = createMockManifest('RELEASED', true);
      const result = assertExportAllowed(manifest);
      expect(result.ok).toBe(true);
    });

    it('should return not ok for non-RELEASED spec even with valid gate', () => {
      const manifest = createMockManifest('FROZEN', true);
      const result = assertExportAllowed(manifest);
      expect(result.ok).toBe(false);
    });

    it('should return not ok for RELEASED spec with failed gate', () => {
      const manifest = createMockManifest('RELEASED', false);
      const result = assertExportAllowed(manifest);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Gate');
      }
    });
  });

  describe('getStateDescription', () => {
    it('should return description for DRAFT', () => {
      const desc = getStateDescription('DRAFT');
      expect(desc).toBeTruthy();
      expect(desc.toLowerCase()).toContain('draft');
    });

    it('should return description for FROZEN', () => {
      const desc = getStateDescription('FROZEN');
      expect(desc).toBeTruthy();
      expect(desc.toLowerCase()).toContain('frozen');
    });

    it('should return description for RELEASED', () => {
      const desc = getStateDescription('RELEASED');
      expect(desc).toBeTruthy();
      expect(desc.toLowerCase()).toContain('released');
    });
  });

  describe('getStateColor', () => {
    it('should return different colors for each state', () => {
      const draftColor = getStateColor('DRAFT');
      const frozenColor = getStateColor('FROZEN');
      const releasedColor = getStateColor('RELEASED');

      expect(draftColor).toBeTruthy();
      expect(frozenColor).toBeTruthy();
      expect(releasedColor).toBeTruthy();

      // Colors should be different
      const colors = [draftColor, frozenColor, releasedColor];
      const uniqueColors = new Set(colors);
      expect(uniqueColors.size).toBe(3);
    });

    it('should return valid color strings', () => {
      const states: SpecState[] = ['DRAFT', 'FROZEN', 'RELEASED'];

      for (const state of states) {
        const color = getStateColor(state);
        // Should be a valid CSS color (hex, rgb, or named)
        expect(typeof color).toBe('string');
        expect(color.length).toBeGreaterThan(0);
      }
    });
  });

  describe('policy workflow scenarios', () => {
    it('should allow edit → freeze → release workflow', () => {
      // Start editing in DRAFT
      const draftManifest = createMockManifest('DRAFT');
      expect(assertEditAllowedBySpec(draftManifest).ok).toBe(true);

      // Freeze for review
      expect(assertFreezeAllowed(draftManifest).ok).toBe(true);
      const frozenManifest = createMockManifest('FROZEN');

      // Cannot edit when frozen
      expect(assertEditAllowedBySpec(frozenManifest).ok).toBe(false);

      // Release for factory
      expect(assertReleaseAllowed(frozenManifest).ok).toBe(true);
      const releasedManifest = createMockManifest('RELEASED');

      // Can export when released
      expect(assertExportAllowedBySpec(releasedManifest).ok).toBe(true);
    });

    it('should allow unfreeze → edit → refreeze workflow', () => {
      // Frozen spec needs edits
      const frozenManifest = createMockManifest('FROZEN');

      // Unfreeze
      expect(assertUnfreezeAllowed(frozenManifest).ok).toBe(true);
      const unfrozenManifest = createMockManifest('DRAFT');

      // Edit
      expect(assertEditAllowedBySpec(unfrozenManifest).ok).toBe(true);

      // Refreeze
      expect(assertFreezeAllowed(unfrozenManifest).ok).toBe(true);
    });

    it('should prevent editing released spec', () => {
      const releasedManifest = createMockManifest('RELEASED');

      expect(assertEditAllowedBySpec(releasedManifest).ok).toBe(false);
      expect(assertFreezeAllowed(releasedManifest).ok).toBe(false);
      expect(assertUnfreezeAllowed(releasedManifest).ok).toBe(false);
    });
  });
});
