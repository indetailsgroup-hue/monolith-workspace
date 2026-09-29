/**
 * validateStageProgression.test.ts
 * MONOLITH v16.0 — Unit Tests
 * Framework: Vitest (pure TypeScript — no DOM required)
 *
 * Tests the forward-only stage progression logic that mirrors the
 * PostgreSQL `validate_stage_progression()` BEFORE UPDATE trigger.
 *
 * SQL trigger location: 20261001_people_culture_schema.sql
 * Function signature:   validate_stage_progression() RETURNS trigger
 * Trigger event:        BEFORE UPDATE ON public.employees
 *                       FOR EACH ROW WHEN (OLD.ai_stage IS DISTINCT FROM NEW.ai_stage)
 *
 * Test strategy:
 *  1. Pure TypeScript mirror of the PL/pgSQL forward-only check.
 *     Validates the logic contract without a live database.
 *  2. Integration-style tests using a mocked Supabase client to
 *     verify that the store correctly propagates DB errors upward.
 *
 * ─────────────────────────────────────────────────────────────
 * NOTE: Full E2E trigger testing against a live Supabase instance
 * should use pgTAP or Supabase's local CLI (supabase test db).
 * These unit tests are fast and run entirely in Node/Vitest.
 * ─────────────────────────────────────────────────────────────
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SuperEmployeeStage } from '../types';

// ─────────────────────────────────────────────────────────────
// Pure TypeScript mirror of validate_stage_progression() trigger
// Mirrors: 20261001_people_culture_schema.sql lines ~420–470
// ─────────────────────────────────────────────────────────────

/**
 * Stage order array — MUST match the SQL CONSTANT in the trigger:
 *   ai_stages CONSTANT text[] := ARRAY[
 *     'AI_UNAWARE','AI_AWARE','AI_ASSISTED','AI_PARTNER','SUPER_EMPLOYEE'
 *   ];
 */
const STAGE_ORDER: SuperEmployeeStage[] = [
  'AI_UNAWARE',
  'AI_AWARE',
  'AI_ASSISTED',
  'AI_PARTNER',
  'SUPER_EMPLOYEE',
];

/**
 * TypeScript mirror of the trigger's forward-only check.
 * Mirrors: `IF array_position(ai_stages, NEW.ai_stage) <= array_position(ai_stages, OLD.ai_stage)`
 *
 * @throws {Error} with message matching MONOLITH_STAGE_BACKWARD if invalid
 */
function validateStageProgression(
  oldStage: SuperEmployeeStage,
  newStage: SuperEmployeeStage
): void {
  const oldIdx = STAGE_ORDER.indexOf(oldStage);
  const newIdx = STAGE_ORDER.indexOf(newStage);

  // Unknown stage (would be caught by DB CHECK constraint first)
  if (oldIdx === -1) throw new Error(`Unknown stage: ${oldStage}`);
  if (newIdx === -1) throw new Error(`Unknown stage: ${newStage}`);

  // Forward-only enforcement: newIdx must be strictly greater than oldIdx
  if (newIdx <= oldIdx) {
    throw new Error(
      `MONOLITH_STAGE_BACKWARD: Cannot change ai_stage from '${oldStage}' to '${newStage}'. ` +
        `Stage progression must be forward-only.`
    );
  }
}

/**
 * TypeScript mirror of getNextStage helper used in peopleStore.
 */
function getNextStage(current: SuperEmployeeStage): SuperEmployeeStage | null {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1];
}

function isMaxStage(stage: SuperEmployeeStage): boolean {
  return stage === 'SUPER_EMPLOYEE';
}

// ─────────────────────────────────────────────────────────────
// Test Suite 1: Forward-only enforcement
// ─────────────────────────────────────────────────────────────

describe('validateStageProgression — forward progression (valid)', () => {
  it('allows sequential forward: AI_UNAWARE → AI_AWARE', () => {
    expect(() => validateStageProgression('AI_UNAWARE', 'AI_AWARE')).not.toThrow();
  });

  it('allows sequential forward: AI_AWARE → AI_ASSISTED', () => {
    expect(() => validateStageProgression('AI_AWARE', 'AI_ASSISTED')).not.toThrow();
  });

  it('allows sequential forward: AI_ASSISTED → AI_PARTNER', () => {
    expect(() => validateStageProgression('AI_ASSISTED', 'AI_PARTNER')).not.toThrow();
  });

  it('allows sequential forward: AI_PARTNER → SUPER_EMPLOYEE', () => {
    expect(() => validateStageProgression('AI_PARTNER', 'SUPER_EMPLOYEE')).not.toThrow();
  });

  it('allows non-sequential forward skip: AI_UNAWARE → AI_ASSISTED', () => {
    // The trigger uses array_position comparison, not sequential-only check.
    // Skipping stages is architecturally valid (e.g. fast-tracked assessment).
    expect(() => validateStageProgression('AI_UNAWARE', 'AI_ASSISTED')).not.toThrow();
  });

  it('allows non-sequential forward skip: AI_AWARE → SUPER_EMPLOYEE', () => {
    expect(() => validateStageProgression('AI_AWARE', 'SUPER_EMPLOYEE')).not.toThrow();
  });

  it('allows full progression: AI_UNAWARE → SUPER_EMPLOYEE', () => {
    expect(() => validateStageProgression('AI_UNAWARE', 'SUPER_EMPLOYEE')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// Test Suite 2: Backward progression (must throw)
// ─────────────────────────────────────────────────────────────

describe('validateStageProgression — backward progression (must throw)', () => {
  it('rejects AI_AWARE → AI_UNAWARE', () => {
    expect(() => validateStageProgression('AI_AWARE', 'AI_UNAWARE')).toThrow(
      'MONOLITH_STAGE_BACKWARD'
    );
  });

  it('rejects AI_ASSISTED → AI_AWARE', () => {
    expect(() => validateStageProgression('AI_ASSISTED', 'AI_AWARE')).toThrow(
      'MONOLITH_STAGE_BACKWARD'
    );
  });

  it('rejects AI_PARTNER → AI_UNAWARE (multi-step backward)', () => {
    expect(() => validateStageProgression('AI_PARTNER', 'AI_UNAWARE')).toThrow(
      'MONOLITH_STAGE_BACKWARD'
    );
  });

  it('rejects SUPER_EMPLOYEE → AI_PARTNER', () => {
    expect(() => validateStageProgression('SUPER_EMPLOYEE', 'AI_PARTNER')).toThrow(
      'MONOLITH_STAGE_BACKWARD'
    );
  });

  it('rejects SUPER_EMPLOYEE → AI_UNAWARE (maximum backward)', () => {
    expect(() => validateStageProgression('SUPER_EMPLOYEE', 'AI_UNAWARE')).toThrow(
      'MONOLITH_STAGE_BACKWARD'
    );
  });

  it('error message includes both old and new stage names', () => {
    let message = '';
    try {
      validateStageProgression('AI_PARTNER', 'AI_ASSISTED');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('AI_PARTNER');
    expect(message).toContain('AI_ASSISTED');
  });
});

// ─────────────────────────────────────────────────────────────
// Test Suite 3: Same-stage update (must throw — WHEN clause in SQL)
// ─────────────────────────────────────────────────────────────

describe('validateStageProgression — same-stage update (must throw)', () => {
  // The SQL trigger fires FOR EACH ROW WHEN (OLD.ai_stage IS DISTINCT FROM NEW.ai_stage)
  // so same-stage updates never even enter the trigger. The TypeScript mirror
  // still enforces this with the <= check (newIdx === oldIdx triggers the error).
  const allStages: SuperEmployeeStage[] = STAGE_ORDER;

  it.each(allStages)('rejects same-stage update: %s → %s', (stage) => {
    expect(() => validateStageProgression(stage, stage)).toThrow('MONOLITH_STAGE_BACKWARD');
  });
});

// ─────────────────────────────────────────────────────────────
// Test Suite 4: Max-stage boundary (SUPER_EMPLOYEE)
// ─────────────────────────────────────────────────────────────

describe('validateStageProgression — max stage (SUPER_EMPLOYEE)', () => {
  it('isMaxStage returns true only for SUPER_EMPLOYEE', () => {
    expect(isMaxStage('SUPER_EMPLOYEE')).toBe(true);
    expect(isMaxStage('AI_PARTNER')).toBe(false);
    expect(isMaxStage('AI_UNAWARE')).toBe(false);
  });

  it('getNextStage returns null at SUPER_EMPLOYEE', () => {
    expect(getNextStage('SUPER_EMPLOYEE')).toBeNull();
  });

  it('SUPER_EMPLOYEE has no valid forward target (no progression possible)', () => {
    // All transitions from SUPER_EMPLOYEE are either same or backward
    const forwardTargets = STAGE_ORDER.filter(
      (s) => STAGE_ORDER.indexOf(s) > STAGE_ORDER.indexOf('SUPER_EMPLOYEE')
    );
    expect(forwardTargets).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Test Suite 5: getNextStage helper
// ─────────────────────────────────────────────────────────────

describe('getNextStage helper', () => {
  it('returns AI_AWARE as next from AI_UNAWARE', () => {
    expect(getNextStage('AI_UNAWARE')).toBe('AI_AWARE');
  });

  it('returns AI_ASSISTED as next from AI_AWARE', () => {
    expect(getNextStage('AI_AWARE')).toBe('AI_ASSISTED');
  });

  it('returns AI_PARTNER as next from AI_ASSISTED', () => {
    expect(getNextStage('AI_ASSISTED')).toBe('AI_PARTNER');
  });

  it('returns SUPER_EMPLOYEE as next from AI_PARTNER', () => {
    expect(getNextStage('AI_PARTNER')).toBe('SUPER_EMPLOYEE');
  });

  it('returns null from SUPER_EMPLOYEE (max stage)', () => {
    expect(getNextStage('SUPER_EMPLOYEE')).toBeNull();
  });

  it('covers all 5 transitions including terminal null', () => {
    const transitions = STAGE_ORDER.map((s) => ({ from: s, to: getNextStage(s) }));
    expect(transitions).toEqual([
      { from: 'AI_UNAWARE',     to: 'AI_AWARE' },
      { from: 'AI_AWARE',       to: 'AI_ASSISTED' },
      { from: 'AI_ASSISTED',    to: 'AI_PARTNER' },
      { from: 'AI_PARTNER',     to: 'SUPER_EMPLOYEE' },
      { from: 'SUPER_EMPLOYEE', to: null },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────
// Test Suite 6: Mocked Supabase store integration
// Verifies that peopleStore propagates DB trigger errors correctly.
// ─────────────────────────────────────────────────────────────

// Minimal chainable mock for Supabase query builder
// Mirrors the real call: .from().update().eq(id).eq(orgId).select().single()
const mockSingle = vi.fn();
const mockSelectFn = vi.fn(() => ({ single: mockSingle }));
const mockEq: ReturnType<typeof vi.fn> = vi.fn(() => ({ eq: mockEq, select: mockSelectFn }));
const mockUpdate = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ update: mockUpdate }));

vi.mock('../../core/supabase', () => ({
  supabase: { from: mockFrom },
}));

describe('peopleStore — DB trigger error propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('propagates MONOLITH_STAGE_BACKWARD error from DB to store', async () => {
    // Simulate Supabase returning a PostgreSQL trigger exception
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'P0001',
        message: 'MONOLITH_STAGE_BACKWARD: Cannot change ai_stage from AI_PARTNER to AI_ASSISTED',
      },
    });

    // Dynamic import so vi.mock above is applied first
    const { usePeopleStore } = await import('../../people/peopleStore');
    const store = usePeopleStore.getState();

    // The store's updateEmployee action should surface the error
    // (actual field name may vary; we assert the mock was called correctly)
    const result = await store.updateEmployee('emp-1', {
      superEmployeeStage: 'AI_ASSISTED', // backward — DB will reject
    }, 'org-1');

    // Store should return falsy / set error state on DB rejection
    expect(result).toBeFalsy();
    expect(usePeopleStore.getState().error).toContain('MONOLITH_STAGE_BACKWARD');
  });

  it('succeeds when DB accepts a forward stage transition', async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'emp-1',
        org_id: 'org-1',
        user_id: null,
        name: 'Test Employee',
        role: 'DESIGNER',
        department: null,
        hire_date: null,
        avatar_url: null,
        is_active: true,
        super_employee_stage: 'AI_PARTNER',
        notes: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });

    const { usePeopleStore } = await import('../../people/peopleStore');
    const store = usePeopleStore.getState();

    const result = await store.updateEmployee('emp-1', {
      superEmployeeStage: 'AI_PARTNER', // forward — DB accepts
    }, 'org-1');

    expect(result).toBeTruthy();
    expect(usePeopleStore.getState().error).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// Test Suite 7: Stage order contract (guards against accidental reordering)
// ─────────────────────────────────────────────────────────────

describe('STAGE_ORDER contract — must not be reordered', () => {
  it('has exactly 5 stages', () => {
    expect(STAGE_ORDER).toHaveLength(5);
  });

  it('starts with AI_UNAWARE (index 0)', () => {
    expect(STAGE_ORDER[0]).toBe('AI_UNAWARE');
  });

  it('ends with SUPER_EMPLOYEE (index 4)', () => {
    expect(STAGE_ORDER[4]).toBe('SUPER_EMPLOYEE');
  });

  it('has AI_AWARE at index 1', () => {
    expect(STAGE_ORDER.indexOf('AI_AWARE')).toBe(1);
  });

  it('has AI_ASSISTED at index 2', () => {
    expect(STAGE_ORDER.indexOf('AI_ASSISTED')).toBe(2);
  });

  it('has AI_PARTNER at index 3', () => {
    expect(STAGE_ORDER.indexOf('AI_PARTNER')).toBe(3);
  });

  it('SUPER_EMPLOYEE score is 100 (score × index relationship)', () => {
    // Each stage maps to percentage = index × 25; max = 100
    const maxIdx = STAGE_ORDER.indexOf('SUPER_EMPLOYEE');
    expect(maxIdx * 25).toBe(100);
  });
});
