/**
 * SYSTEM 32 — CROSS-CONSUMER AGREEMENT TEST
 * =========================================
 *
 * WHAT THIS TEST IS FOR
 * ---------------------
 * The 32mm drilling grid used to be declared independently in four modules.
 * They agreed, but nothing enforced that they keep agreeing. A drift does not
 * throw and does not fail a type check — it silently emits a boring program
 * whose holes do not line up with the hardware destined for them, discovered
 * on the shop floor after the panel has already been cut.
 *
 * This file is the enforcement. It has two layers:
 *   1. VALUE AGREEMENT — every consumer's exposed grid values equal
 *      SYSTEM_32_GRID. Catches a consumer that starts computing its own.
 *   2. LITERAL GUARD — a static scan proving no consumer has re-introduced a
 *      bare 32/37/5 literal for a grid dimension. Layer 1 alone cannot catch
 *      this, because a re-hard-coded literal that happens to still equal 32
 *      passes every value assertion while re-creating the exact drift risk
 *      this work exists to remove.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  SYSTEM_32_GRID,
  nearestSystem32Position,
  isOnSystem32Grid,
} from '../System32';
import { DEFAULT_SYSTEM_32_CONFIG } from '../ShelfPinCatalog';
import { CONSTRUCTION_TYPES, get32mmHolePositions, calculateInteriorWidth } from '../CabinetTaxonomy';
import { generateMinifixArrayPattern } from '../MinifixHardware';
import {
  SYSTEM_32,
  isAlignedToSystem32,
  getNearestSystem32Position,
} from '../../designer/policy';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../..');

describe('System 32 — the grid itself', () => {
  it('carries the defining constants of the 32mm system', () => {
    // These are the physical numbers the whole system is named after. If this
    // test is ever "fixed" by changing these, that is a change to what
    // MONOLITH drills, not a test maintenance chore.
    expect(SYSTEM_32_GRID.pitch).toBe(32);
    expect(SYSTEM_32_GRID.frontSetback).toBe(37);
    expect(SYSTEM_32_GRID.holeDiameter).toBe(5);
    expect(SYSTEM_32_GRID.holeDepth).toBe(13);
  });

  it('marks the front setback as convention, not a published standard', () => {
    // Honesty gate: pitch and diameter ARE the standard; 37mm setback is an
    // industry convention. Consumers that need a standards-backed number must
    // be able to tell the difference.
    expect(SYSTEM_32_GRID.provenance.pitch).toBe('SYSTEM_32_DEFINING');
    expect(SYSTEM_32_GRID.provenance.holeDiameter).toBe('SYSTEM_32_DEFINING');
    expect(SYSTEM_32_GRID.provenance.frontSetback).toBe('INDUSTRY_CONVENTION');
  });

  it('snaps positions onto the grid', () => {
    expect(nearestSystem32Position(37)).toBe(37);
    expect(nearestSystem32Position(69)).toBe(69); // 37 + 32
    expect(nearestSystem32Position(70)).toBe(69);
    expect(nearestSystem32Position(101)).toBe(101); // 37 + 64
  });

  it('reports off-grid positions as off-grid', () => {
    expect(isOnSystem32Grid(37)).toBe(true);
    expect(isOnSystem32Grid(38)).toBe(true); // within default 2mm tolerance
    expect(isOnSystem32Grid(50)).toBe(false); // 13mm off the nearest hole
    expect(isOnSystem32Grid(38, 0)).toBe(false); // zero tolerance is strict
  });
});

describe('System 32 — VALUE AGREEMENT across all four consumers', () => {
  it('designer/policy.ts SYSTEM_32 matches the grid', () => {
    expect(SYSTEM_32.pitch).toBe(SYSTEM_32_GRID.pitch);
    // firstHoleZ is policy.ts's historical name for frontSetback.
    expect(SYSTEM_32.firstHoleZ).toBe(SYSTEM_32_GRID.frontSetback);
    expect(SYSTEM_32.holeDiameter).toBe(SYSTEM_32_GRID.holeDiameter);
    expect(SYSTEM_32.holeDepth).toBe(SYSTEM_32_GRID.holeDepth);
  });

  it('ShelfPinCatalog.ts DEFAULT_SYSTEM_32_CONFIG matches the grid', () => {
    expect(DEFAULT_SYSTEM_32_CONFIG.spacing).toBe(SYSTEM_32_GRID.pitch);
    expect(DEFAULT_SYSTEM_32_CONFIG.frontSetback).toBe(SYSTEM_32_GRID.frontSetback);
    expect(DEFAULT_SYSTEM_32_CONFIG.backSetback).toBe(SYSTEM_32_GRID.frontSetback);
    expect(DEFAULT_SYSTEM_32_CONFIG.startOffset).toBe(SYSTEM_32_GRID.frontSetback);
    expect(DEFAULT_SYSTEM_32_CONFIG.endOffset).toBe(SYSTEM_32_GRID.frontSetback);
  });

  it('CabinetTaxonomy.ts FRAMELESS holePatternSpacing matches the grid', () => {
    expect(CONSTRUCTION_TYPES.FRAMELESS.holePatternSpacing).toBe(SYSTEM_32_GRID.pitch);
  });

  it('CabinetTaxonomy.ts get32mmHolePositions walks the grid', () => {
    const positions = get32mmHolePositions(760);
    expect(positions[0]).toBe(SYSTEM_32_GRID.frontSetback);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i] - positions[i - 1]).toBe(SYSTEM_32_GRID.pitch);
    }
    // Every hole must land on the canonical grid.
    for (const p of positions) {
      expect(isOnSystem32Grid(p, 0)).toBe(true);
    }
  });

  it('MinifixHardware.ts array pattern starts one front-setback in', () => {
    const result = generateMinifixArrayPattern(600, 18, 18, 'MINIFIX_15', 'S100', 128);
    expect(result.positions[0]).toBe(SYSTEM_32_GRID.frontSetback);
    expect(result.positions[result.positions.length - 1]).toBe(
      600 - SYSTEM_32_GRID.frontSetback
    );
  });

  it('policy.ts grid helpers agree with the canonical helpers', () => {
    for (const y of [0, 37, 50, 69, 100, 101, 250, 733]) {
      expect(getNearestSystem32Position(y)).toBe(nearestSystem32Position(y));
      expect(isAlignedToSystem32(y)).toBe(isOnSystem32Grid(y));
    }
  });

  it('all four consumers agree on pitch and setback simultaneously', () => {
    // The single assertion that fails if ANY one site drifts.
    const pitches = [
      SYSTEM_32.pitch,
      DEFAULT_SYSTEM_32_CONFIG.spacing,
      CONSTRUCTION_TYPES.FRAMELESS.holePatternSpacing,
      get32mmHolePositions(400)[1] - get32mmHolePositions(400)[0],
      generateMinifixArrayPattern(600, 18, 18, 'MINIFIX_15', 'S100', 128).positions[0],
    ];
    // The last entry is a setback, not a pitch — assert the two groups separately.
    const observedPitches = pitches.slice(0, 4);
    expect(new Set(observedPitches).size).toBe(1);
    expect(observedPitches[0]).toBe(SYSTEM_32_GRID.pitch);

    const observedSetbacks = [
      SYSTEM_32.firstHoleZ,
      DEFAULT_SYSTEM_32_CONFIG.frontSetback,
      get32mmHolePositions(400)[0],
      generateMinifixArrayPattern(600, 18, 18, 'MINIFIX_15', 'S100', 128).positions[0],
    ];
    expect(new Set(observedSetbacks).size).toBe(1);
    expect(observedSetbacks[0]).toBe(SYSTEM_32_GRID.frontSetback);
  });
});

describe('System 32 — NEGATIVE tests proving the agreement test can fail', () => {
  it('a drifted pitch would break the walk assertion', () => {
    const drifted = { ...SYSTEM_32_GRID, pitch: 30 };
    // Simulating what a drifted consumer would produce.
    expect(nearestSystem32Position(69, drifted)).not.toBe(
      nearestSystem32Position(69, SYSTEM_32_GRID)
    );
  });

  it('a drifted setback would break the first-hole assertion', () => {
    const drifted = { ...SYSTEM_32_GRID, frontSetback: 50 };
    expect(isOnSystem32Grid(37, 0, drifted)).toBe(false);
    expect(isOnSystem32Grid(37, 0, SYSTEM_32_GRID)).toBe(true);
  });
});

describe('System 32 — LITERAL GUARD (static source scan)', () => {
  /**
   * Layer 1 cannot catch a re-hard-coded literal that still happens to equal
   * 32. This layer can. It reads each consumer's source and asserts that the
   * grid dimensions are not assigned from bare numbers.
   *
   * If this test fails on a legitimate change: import SYSTEM_32_GRID and
   * derive the value. Do not add the line to an exemption list.
   */
  const CONSUMERS = [
    'core/designer/policy.ts',
    'core/catalog/ShelfPinCatalog.ts',
    'core/catalog/CabinetTaxonomy.ts',
    'core/catalog/MinifixHardware.ts',
  ];

  /**
   * Grid POSITIONING property names, assigned from a bare number literal.
   *
   * DELIBERATE SCOPE — holeDiameter and holeDepth are NOT guarded here, and
   * that is a real limitation rather than an oversight. Those two names are
   * also legitimate per-part properties: a Minifix 15 housing has its own
   * 15mm boring depth, each shelf pin its own pin diameter. Those numbers
   * belong to the individual piece of hardware and correctly differ from the
   * grid's 5mm/13mm shelf-pin default. Guarding the names would flag 16 valid
   * hardware specs. The grid's own holeDiameter/holeDepth are still covered by
   * the value-agreement layer above; only the static guard is narrower.
   *
   * The positioning names below have no such second meaning: a pitch or a
   * setback in these files is always the System 32 grid.
   */
  const BARE_LITERAL_ASSIGNMENT =
    /^\s*(pitch|spacing|frontSetback|backSetback|startOffset|endOffset|firstHoleZ|holePatternSpacing)\s*:\s*-?\d+(\.\d+)?\s*,?\s*$/;

  const stripComments = (src: string): string =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join('\n');

  for (const relative of CONSUMERS) {
    it(`${relative} imports the grid rather than re-declaring it`, () => {
      const source = readFileSync(resolve(SRC, relative), 'utf8');
      expect(source).toContain('SYSTEM_32_GRID');
    });

    it(`${relative} assigns no grid dimension from a bare literal`, () => {
      const source = stripComments(readFileSync(resolve(SRC, relative), 'utf8'));
      const offenders = source
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => BARE_LITERAL_ASSIGNMENT.test(line));

      expect(
        offenders.map(({ line, n }) => `${relative}:${n}: ${line.trim()}`)
      ).toEqual([]);
    });
  }

  it('the guard regex actually matches a re-hard-coded literal', () => {
    // Proves the guard is live and not silently matching nothing.
    expect(BARE_LITERAL_ASSIGNMENT.test('  pitch: 32,')).toBe(true);
    expect(BARE_LITERAL_ASSIGNMENT.test('  frontSetback: 37,')).toBe(true);
    expect(BARE_LITERAL_ASSIGNMENT.test('  spacing: SYSTEM_32_GRID.pitch,')).toBe(false);
    // Documents the narrowed scope: per-part hardware dimensions are not flagged.
    expect(BARE_LITERAL_ASSIGNMENT.test('  holeDepth: 15,')).toBe(false);
  });
});

describe('Face frame — stock width is NOT opening reduction', () => {
  const faceFrame = CONSTRUCTION_TYPES.FACE_FRAME;

  it('carries stock width and opening reduction as separate quantities', () => {
    // The category error this work exists to fix: 38mm is the stile timber you
    // buy (1-1/2 in). It is not what the opening loses, because the stile
    // overhangs the carcass side panel.
    expect(faceFrame.faceFrameStockWidth).toBe(38);
    expect(faceFrame.faceFrameOpeningReductionPerSide).toBe(9.5);
    expect(faceFrame.faceFrameOpeningReductionPerSide).not.toBe(
      faceFrame.faceFrameStockWidth
    );
  });

  it('flags the 9.5mm value as unverified against AWI/KCMA', () => {
    // HONESTY GATE. 9.5mm rests on a single retailer article. This assertion
    // must only be changed to 'STANDARDS_VERIFIED' when someone has actually
    // checked an AWI or KCMA face-frame detail — not to make a test green.
    expect(faceFrame.faceFrameOpeningReductionProvenance).toBe(
      'SINGLE_SOURCE_UNVERIFIED'
    );
  });

  it('frameless has no frame, so both quantities are zero', () => {
    expect(CONSTRUCTION_TYPES.FRAMELESS.faceFrameStockWidth).toBe(0);
    expect(CONSTRUCTION_TYPES.FRAMELESS.faceFrameOpeningReductionPerSide).toBe(0);
    expect(CONSTRUCTION_TYPES.FRAMELESS.faceFrameOpeningReductionProvenance).toBe(
      'NOT_APPLICABLE'
    );
  });

  it('calculateInteriorWidth applies the reduction once per side', () => {
    // 600 exterior, 18mm panels: 600 - 36 = 564 carcass interior.
    // Face frame then removes 9.5 per side = 19 total -> 545.
    expect(calculateInteriorWidth(600, 18, 'FRAMELESS')).toBe(564);
    expect(calculateInteriorWidth(600, 18, 'FACE_FRAME')).toBe(545);
  });

  it('does NOT subtract the stile stock width from the opening', () => {
    // The old behaviour subtracted 38 once -> 526. The documented "per side"
    // reading of that same wrong value would have given 600-36-76 = 488.
    // Both are wrong; assert we produce neither.
    const actual = calculateInteriorWidth(600, 18, 'FACE_FRAME');
    expect(actual).not.toBe(526); // old: stock width, subtracted once
    expect(actual).not.toBe(488); // stock width, subtracted per side
    expect(actual).toBe(545);
  });
});
