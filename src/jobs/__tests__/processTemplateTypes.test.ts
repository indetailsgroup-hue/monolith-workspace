/**
 * processTemplateTypes.test.ts
 * MONOLITH v17.0 — Process Templates Module
 * Framework: Vitest (pure TypeScript — no DOM required)
 *
 * Tests:
 *  - meetsplanGate() — plan rank comparison
 *  - getBottleneckSeverity() — severity thresholds
 *  - PLAN_GATE_RANK — ordering contract
 *  - DEFAULT_TEMPLATE_FILTERS — defaults
 *  - JOB_TEMPLATE_CATEGORY_LABELS / ICONS — completeness (all categories covered)
 *  - BOTTLENECK_SEVERITY_COLORS / LABELS — completeness
 */

import { describe, it, expect } from 'vitest';
import {
  meetsplanGate,
  getBottleneckSeverity,
  PLAN_GATE_RANK,
  DEFAULT_TEMPLATE_FILTERS,
  JOB_TEMPLATE_CATEGORY_LABELS,
  JOB_TEMPLATE_CATEGORY_ICONS,
  BOTTLENECK_SEVERITY_COLORS,
  BOTTLENECK_SEVERITY_LABELS,
  type JobTemplateCategory,
  type BottleneckSeverity,
} from '../processTemplateTypes';

// ============================================================================
// meetsplanGate
// ============================================================================

describe('meetsplanGate', () => {
  it('FREE meets FREE gate', () => {
    expect(meetsplanGate('FREE', 'FREE')).toBe(true);
  });

  it('STARTER meets FREE gate', () => {
    expect(meetsplanGate('STARTER', 'FREE')).toBe(true);
  });

  it('STARTER meets STARTER gate', () => {
    expect(meetsplanGate('STARTER', 'STARTER')).toBe(true);
  });

  it('FREE does NOT meet STARTER gate', () => {
    expect(meetsplanGate('FREE', 'STARTER')).toBe(false);
  });

  it('PROFESSIONAL meets STARTER gate', () => {
    expect(meetsplanGate('PROFESSIONAL', 'STARTER')).toBe(true);
  });

  it('PROFESSIONAL meets PROFESSIONAL gate', () => {
    expect(meetsplanGate('PROFESSIONAL', 'PROFESSIONAL')).toBe(true);
  });

  it('STARTER does NOT meet PROFESSIONAL gate', () => {
    expect(meetsplanGate('STARTER', 'PROFESSIONAL')).toBe(false);
  });

  it('FREE does NOT meet PROFESSIONAL gate', () => {
    expect(meetsplanGate('FREE', 'PROFESSIONAL')).toBe(false);
  });

  it('ENTERPRISE meets all gates', () => {
    expect(meetsplanGate('ENTERPRISE', 'FREE')).toBe(true);
    expect(meetsplanGate('ENTERPRISE', 'STARTER')).toBe(true);
    expect(meetsplanGate('ENTERPRISE', 'PROFESSIONAL')).toBe(true);
    expect(meetsplanGate('ENTERPRISE', 'ENTERPRISE')).toBe(true);
  });

  it('PROFESSIONAL does NOT meet ENTERPRISE gate', () => {
    expect(meetsplanGate('PROFESSIONAL', 'ENTERPRISE')).toBe(false);
  });
});

// ============================================================================
// PLAN_GATE_RANK ordering contract
// ============================================================================

describe('PLAN_GATE_RANK', () => {
  it('ranks FREE < STARTER < PROFESSIONAL < ENTERPRISE', () => {
    expect(PLAN_GATE_RANK['FREE']).toBeLessThan(PLAN_GATE_RANK['STARTER']);
    expect(PLAN_GATE_RANK['STARTER']).toBeLessThan(PLAN_GATE_RANK['PROFESSIONAL']);
    expect(PLAN_GATE_RANK['PROFESSIONAL']).toBeLessThan(PLAN_GATE_RANK['ENTERPRISE']);
  });

  it('all values are non-negative integers', () => {
    for (const rank of Object.values(PLAN_GATE_RANK)) {
      expect(rank).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(rank)).toBe(true);
    }
  });
});

// ============================================================================
// getBottleneckSeverity
// ============================================================================

describe('getBottleneckSeverity', () => {
  describe('OK threshold (≤ 110%)', () => {
    it('returns OK for 0%', () => {
      expect(getBottleneckSeverity(0)).toBe('OK');
    });

    it('returns OK for 100%', () => {
      expect(getBottleneckSeverity(100)).toBe('OK');
    });

    it('returns OK at exact boundary 110%', () => {
      expect(getBottleneckSeverity(110)).toBe('OK');
    });
  });

  describe('WARNING threshold (111–150%)', () => {
    it('returns WARNING at 111%', () => {
      expect(getBottleneckSeverity(111)).toBe('WARNING');
    });

    it('returns WARNING at 130%', () => {
      expect(getBottleneckSeverity(130)).toBe('WARNING');
    });

    it('returns WARNING at exact boundary 150%', () => {
      expect(getBottleneckSeverity(150)).toBe('WARNING');
    });
  });

  describe('CRITICAL threshold (> 150%)', () => {
    it('returns CRITICAL at 151%', () => {
      expect(getBottleneckSeverity(151)).toBe('CRITICAL');
    });

    it('returns CRITICAL at 200%', () => {
      expect(getBottleneckSeverity(200)).toBe('CRITICAL');
    });

    it('returns CRITICAL at very large value', () => {
      expect(getBottleneckSeverity(9999)).toBe('CRITICAL');
    });
  });
});

// ============================================================================
// BOTTLENECK_SEVERITY_COLORS / LABELS — completeness
// ============================================================================

describe('BOTTLENECK_SEVERITY_COLORS', () => {
  const severities: BottleneckSeverity[] = ['OK', 'WARNING', 'CRITICAL'];

  it('has a color for every severity', () => {
    for (const s of severities) {
      expect(BOTTLENECK_SEVERITY_COLORS[s]).toBeTruthy();
    }
  });

  it('colors are valid hex strings', () => {
    for (const color of Object.values(BOTTLENECK_SEVERITY_COLORS)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('BOTTLENECK_SEVERITY_LABELS', () => {
  const severities: BottleneckSeverity[] = ['OK', 'WARNING', 'CRITICAL'];

  it('has a Thai label for every severity', () => {
    for (const s of severities) {
      expect(BOTTLENECK_SEVERITY_LABELS[s]).toBeTruthy();
    }
  });
});

// ============================================================================
// JOB_TEMPLATE_CATEGORY_LABELS / ICONS — completeness
// ============================================================================

const ALL_CATEGORIES: JobTemplateCategory[] = [
  'CABINET', 'DOOR', 'DRAWER', 'LABEL', 'SITE', 'CNC', 'QUOTATION', 'CUSTOM',
];

describe('JOB_TEMPLATE_CATEGORY_LABELS', () => {
  it('has a Thai label for every category', () => {
    for (const cat of ALL_CATEGORIES) {
      expect(JOB_TEMPLATE_CATEGORY_LABELS[cat]).toBeTruthy();
      expect(typeof JOB_TEMPLATE_CATEGORY_LABELS[cat]).toBe('string');
    }
  });

  it('covers exactly the defined categories (no missing, no extra)', () => {
    const keys = Object.keys(JOB_TEMPLATE_CATEGORY_LABELS) as JobTemplateCategory[];
    expect(keys.sort()).toEqual([...ALL_CATEGORIES].sort());
  });
});

describe('JOB_TEMPLATE_CATEGORY_ICONS', () => {
  it('has an emoji icon for every category', () => {
    for (const cat of ALL_CATEGORIES) {
      expect(JOB_TEMPLATE_CATEGORY_ICONS[cat]).toBeTruthy();
    }
  });

  it('covers exactly the defined categories', () => {
    const keys = Object.keys(JOB_TEMPLATE_CATEGORY_ICONS) as JobTemplateCategory[];
    expect(keys.sort()).toEqual([...ALL_CATEGORIES].sort());
  });
});

// ============================================================================
// DEFAULT_TEMPLATE_FILTERS
// ============================================================================

describe('DEFAULT_TEMPLATE_FILTERS', () => {
  it('has isActive = true by default', () => {
    expect(DEFAULT_TEMPLATE_FILTERS.isActive).toBe(true);
  });

  it('has null category by default (no filter)', () => {
    expect(DEFAULT_TEMPLATE_FILTERS.category).toBeNull();
  });

  it('has null planGate by default', () => {
    expect(DEFAULT_TEMPLATE_FILTERS.planGate).toBeNull();
  });

  it('has empty search string by default', () => {
    expect(DEFAULT_TEMPLATE_FILTERS.search).toBe('');
  });

  it('has undefined isGlobal by default (no filter)', () => {
    expect(DEFAULT_TEMPLATE_FILTERS.isGlobal).toBeUndefined();
  });
});
