/**
 * dimensionalStandards.test.ts — widths, depths and ranges must describe real catalogues.
 *
 * THE DEFECT THIS PINS
 * `width: { min: 300, max: 1200, default: 600, step: 50 }` claims that every 50mm
 * increment is a real cabinet. It is not: 650/750/850 are offered by nobody and fit no
 * appliance. A step is a CLAIM about a grid; a catalogue is a LIST. Where the real world
 * is a list, the data must be a list.
 */

import { describe, it, expect } from 'vitest';
import {
  BASE_CABINET_STANDARDS,
  WALL_CABINET_STANDARDS,
  TALL_CABINET_STANDARDS,
  CORNER_CABINET_STANDARDS,
  CABINET_TYPES,
  CABINET_WIDTH_SET_MM,
  BASE_DEPTH_SET_MM,
  WALL_DEPTH_SET_MM,
  WALL_DEPTHS_EXCEEDING_JIS_CEILING_MM,
  OVEN_HOUSING_MIN_DEPTH_MM,
  JIS_A0017_2018,
  validateDimensions,
  type CabinetStandards,
  type DimensionalStandard,
} from '../CabinetTaxonomy';

describe('widths — a discrete catalogue, not a 50mm grid', () => {
  it('publishes the sourced width set', () => {
    expect([...CABINET_WIDTH_SET_MM]).toEqual([300, 400, 450, 500, 600, 800, 900, 1000, 1200]);
  });

  it('excludes the widths the old 50mm step invented', () => {
    // These are the three the audit called out by name.
    for (const phantom of [650, 750, 850]) {
      expect(CABINET_WIDTH_SET_MM).not.toContain(phantom);
    }
  });

  it('carries no `step` where a discrete set exists', () => {
    // Leaving `step: 50` alongside `discrete` would keep advertising the false grid.
    for (const std of [
      BASE_CABINET_STANDARDS.width,
      WALL_CABINET_STANDARDS.width,
      TALL_CABINET_STANDARDS.width,
      CORNER_CABINET_STANDARDS.width,
    ]) {
      expect(std.discrete).toBeDefined();
      expect(std.step).toBeUndefined();
    }
  });

  it('warns (does not reject) an off-catalogue width', () => {
    const r = validateDimensions('BASE_STANDARD', 650, 720, 600);
    expect(r.valid).toBe(true); // bespoke widths are legitimate
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(' ')).toContain('650mm is not a catalogue size');
  });

  it('accepts every catalogue width without warning', () => {
    for (const w of BASE_CABINET_STANDARDS.width.discrete!) {
      const r = validateDimensions('BASE_STANDARD', w, 720, 600);
      expect(r.valid).toBe(true);
      expect(r.warnings.filter((x) => x.startsWith('Width'))).toEqual([]);
    }
  });

  it('every type default is itself a catalogue value', () => {
    for (const [id, type] of Object.entries(CABINET_TYPES)) {
      for (const axis of ['width', 'height', 'depth'] as const) {
        const std: DimensionalStandard = (type.standards as CabinetStandards)[axis];
        if (!std.discrete) continue;
        expect(std.discrete, `${id}.${axis} default must be a catalogue value`).toContain(
          std.default
        );
      }
    }
  });
});

describe('depths', () => {
  it('base carcass default is 600 (Thai / JIS / AU), with 560/610/650 selectable', () => {
    expect(BASE_CABINET_STANDARDS.depth.default).toBe(600);
    expect([...BASE_DEPTH_SET_MM]).toEqual([560, 600, 610, 650]);
    // JIS lists 600 and 650 and does NOT list 560; 560 is retained as shallow/UK only.
    for (const d of JIS_A0017_2018.baseDepthsMm) {
      expect(BASE_DEPTH_SET_MM).toContain(d);
    }
    expect(JIS_A0017_2018.baseDepthsMm).not.toContain(560);
  });

  it('tall cabinets match base depth', () => {
    expect(TALL_CABINET_STANDARDS.depth.default).toBe(BASE_CABINET_STANDARDS.depth.default);
  });

  it('wall cabinet default is 300, not the single-source 320', () => {
    expect(WALL_CABINET_STANDARDS.depth.default).toBe(300);
    expect([...WALL_DEPTH_SET_MM]).toEqual([300, 330, 350, 370]);
    // 320 appears exactly once in the sourced corpus, as a private Boffi option.
    expect(WALL_DEPTH_SET_MM).not.toContain(320);
  });

  it('enforces the JIS A0017:2018 400mm wall-unit ceiling as a hard bound', () => {
    expect(WALL_CABINET_STANDARDS.depth.max).toBe(JIS_A0017_2018.wallUnitMaxDepthMm);

    const ok = validateDimensions('WALL_STANDARD', 600, 720, 400);
    expect(ok.valid).toBe(true);

    const tooDeep = validateDimensions('WALL_STANDARD', 600, 720, 401);
    expect(tooDeep.valid).toBe(false);
    expect(tooDeep.errors.join(' ')).toContain('JIS A0017:2018');
  });

  it('surfaces the 410mm Poliform / JIS conflict instead of hiding it', () => {
    // Both figures are sourced and they disagree. The JIS ceiling wins, but the
    // rejection has to SAY that 410 is real, or a human cannot adjudicate it.
    expect(WALL_DEPTHS_EXCEEDING_JIS_CEILING_MM).toContain(410);
    const r = validateDimensions('WALL_STANDARD', 600, 720, 410);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toContain('Poliform');
    expect(r.errors.join(' ')).toContain('conflict between two sourced standards');
  });

  it('enforces a 560mm floor wherever an oven is housed', () => {
    expect(OVEN_HOUSING_MIN_DEPTH_MM).toBe(560);
    expect(CABINET_TYPES.APPLIANCE_OVEN.standards.depth.min).toBe(OVEN_HOUSING_MIN_DEPTH_MM);
    expect(CABINET_TYPES.APPLIANCE_OVEN.standards.depth.default).toBe(600);

    const tooShallow = validateDimensions('APPLIANCE_OVEN', 600, 720, 550);
    expect(tooShallow.valid).toBe(false);
    expect(tooShallow.errors.join(' ')).toContain('rear');

    expect(validateDimensions('APPLIANCE_OVEN', 600, 720, 560).valid).toBe(true);
  });

  it('REPORTED: the refrigerator surround stands 50mm proud of the new base run', () => {
    const fridge = CABINET_TYPES.APPLIANCE_REFRIGERATOR.standards.depth.default;
    const base = BASE_CABINET_STANDARDS.depth.default;
    expect(fridge).toBe(650);
    expect(fridge - base).toBe(50);
    // Previously 650 - 560 = 90mm proud, so the new default halves the step. Neither
    // number was written down anywhere before this test existed.
    expect(fridge - 560).toBe(90);
  });
});

describe('tall unit range', () => {
  it('reaches 3000mm so the 2710-2980 benchmark tier is expressible', () => {
    expect(TALL_CABINET_STANDARDS.height.max).toBe(3000);
    for (const h of [2710, 2980]) {
      expect(validateDimensions('TALL_PANTRY', 600, h, 600).valid).toBe(true);
    }
    expect(validateDimensions('TALL_PANTRY', 600, 3001, 600).valid).toBe(false);
  });

  it('BLOCKED, stated not faked: tall height keeps a step because no discrete set is sourced', () => {
    // Widths got a discrete set because a real catalogue list exists for them. No
    // sourced rung list exists for tall-unit heights, so inventing one to make the
    // treatment symmetrical would be precisely the fabrication this work removes.
    expect(TALL_CABINET_STANDARDS.height.discrete).toBeUndefined();
    expect(TALL_CABINET_STANDARDS.height.step).toBe(100);
  });
});

describe('validateDimensions contract', () => {
  it('keeps the legacy { valid, errors } shape and adds warnings', () => {
    const r = validateDimensions('BASE_STANDARD', 600, 720, 600);
    expect(r).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('still rejects an unknown type', () => {
    const r = validateDimensions('NOPE', 600, 720, 600);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain('Unknown cabinet type');
  });
});
