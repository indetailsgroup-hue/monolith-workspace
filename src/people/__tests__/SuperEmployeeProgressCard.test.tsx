/**
 * SuperEmployeeProgressCard.test.tsx
 * MONOLITH v16.0 — Unit Tests
 * Framework: Vitest + @testing-library/react
 *
 * Tests cover:
 *  - Stage label & percentage rendering for all 5 stages
 *  - Progress bar width computation
 *  - Stage stepper active/completed/future states
 *  - TriggerFlowPanel toggle behaviour (default closed + open)
 *  - Next-stage hint presence / absence
 *  - Employee info display (name, employee code)
 *  - Max-stage (SUPER_EMPLOYEE) special state
 */

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SuperEmployeeProgressCard from '../SuperEmployeeProgressCard';
import type { SuperEmployeeStage } from '../types';

// ─────────────────────────────────────────────────────────────
// Test Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Creates a minimal Employee-compatible mock that matches the
 * shape expected by SuperEmployeeProgressCard (uses aiStage alias).
 */
function makeEmployee(stage: SuperEmployeeStage, overrides: Record<string, unknown> = {}) {
  return {
    id: 'emp-1234-5678-abcd-efgh',
    orgId: 'org-daph-decor-001',
    userId: 'user-uuid-001',
    name: 'สมชาย ใจดี',
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    employeeCode: 'EMP001',
    role: 'FACTORY' as const,
    department: 'Factory Floor',
    hireDate: '2024-01-15',
    avatarUrl: null,
    isActive: true,
    superEmployeeStage: stage,
    // SuperEmployeeProgressCard reads employee.aiStage (AiStage alias)
    aiStage: stage,
    notes: null,
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
    ...overrides,
  } as any; // Cast: component uses aiStage alias field; Employee type uses superEmployeeStage
}

// Expected stage display values per stage
const STAGE_EXPECTATIONS: Array<{
  stage: SuperEmployeeStage;
  label: string;
  percentage: number;
  nextLabel: string | null;
}> = [
  { stage: 'AI_UNAWARE',     label: 'ยังไม่รู้จัก AI',   percentage: 0,   nextLabel: 'รู้จัก AI' },
  { stage: 'AI_AWARE',       label: 'รู้จัก AI',          percentage: 25,  nextLabel: 'ใช้ AI ช่วยงาน' },
  { stage: 'AI_ASSISTED',    label: 'ใช้ AI ช่วยงาน',    percentage: 50,  nextLabel: 'คู่คิด AI' },
  { stage: 'AI_PARTNER',     label: 'คู่คิด AI',          percentage: 75,  nextLabel: 'Super Employee' },
  { stage: 'SUPER_EMPLOYEE', label: 'Super Employee',     percentage: 100, nextLabel: null },
];

// ─────────────────────────────────────────────────────────────
// Test Suite: Rendering
// ─────────────────────────────────────────────────────────────

describe('SuperEmployeeProgressCard — stage rendering', () => {
  it.each(STAGE_EXPECTATIONS)(
    'renders label "$label" and percentage "$percentage%" for stage $stage',
    ({ stage, label, percentage }) => {
      render(<SuperEmployeeProgressCard employee={makeEmployee(stage)} />);
      // Stage label in header
      expect(screen.getAllByText(label)[0]).toBeTruthy();
      // Percentage value
      expect(screen.getAllByText(`${percentage}%`)[0]).toBeTruthy();
    }
  );

  it('renders employee full name', () => {
    const emp = makeEmployee('AI_AWARE');
    render(<SuperEmployeeProgressCard employee={emp} />);
    // Component renders firstName + ' ' + lastName
    expect(screen.getByText('สมชาย ใจดี')).toBeTruthy();
  });

  it('renders employee code in monospace badge', () => {
    render(<SuperEmployeeProgressCard employee={makeEmployee('AI_ASSISTED')} />);
    expect(screen.getByText('EMP001')).toBeTruthy();
  });

  it('does NOT render employee code when undefined', () => {
    const emp = makeEmployee('AI_AWARE', { employeeCode: undefined });
    render(<SuperEmployeeProgressCard employee={emp} />);
    // No EMP prefix text expected
    const badge = screen.queryByText(/^EMP/);
    expect(badge).toBeNull();
  });

  it('renders "สถานะปัจจุบัน" label for current stage', () => {
    render(<SuperEmployeeProgressCard employee={makeEmployee('AI_PARTNER')} />);
    expect(screen.getByText('สถานะปัจจุบัน')).toBeTruthy();
  });

  it('renders the current stage description text', () => {
    render(<SuperEmployeeProgressCard employee={makeEmployee('AI_ASSISTED')} />);
    expect(
      screen.getByText('ใช้ AI ช่วยเพิ่มประสิทธิภาพในงานประจำวันได้อย่างสม่ำเสมอ')
    ).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// Test Suite: Progress Bar
// ─────────────────────────────────────────────────────────────

describe('SuperEmployeeProgressCard — progress bar', () => {
  it.each([
    { stage: 'AI_UNAWARE' as const,     expectedWidth: '2%' },   // Math.max(0, 2) = 2
    { stage: 'AI_AWARE' as const,       expectedWidth: '25%' },
    { stage: 'AI_ASSISTED' as const,    expectedWidth: '50%' },
    { stage: 'AI_PARTNER' as const,     expectedWidth: '75%' },
    { stage: 'SUPER_EMPLOYEE' as const, expectedWidth: '100%' },
  ])(
    'sets progress bar width to correct % for stage $stage',
    ({ stage, expectedWidth }) => {
      const { container } = render(<SuperEmployeeProgressCard employee={makeEmployee(stage)} />);
      // Find the progress fill div (has inline style with width)
      const progressFill = container.querySelector<HTMLElement>('[style*="width"]');
      expect(progressFill).not.toBeNull();
      expect(progressFill!.style.width).toMatch(expectedWidth);
    }
  );
});

// ─────────────────────────────────────────────────────────────
// Test Suite: Next-Stage Hint
// ─────────────────────────────────────────────────────────────

describe('SuperEmployeeProgressCard — next-stage hint', () => {
  it.each(STAGE_EXPECTATIONS.filter((s) => s.nextLabel !== null))(
    'shows next-stage hint "$nextLabel" when stage is $stage',
    ({ stage, nextLabel }) => {
      render(<SuperEmployeeProgressCard employee={makeEmployee(stage)} />);
      expect(screen.getAllByText('ขั้นต่อไป:')[0]).toBeTruthy();
      expect(screen.getAllByText(new RegExp(nextLabel!))[0]).toBeTruthy();
    }
  );

  it('hides next-stage hint at SUPER_EMPLOYEE (max stage)', () => {
    render(<SuperEmployeeProgressCard employee={makeEmployee('SUPER_EMPLOYEE')} />);
    expect(screen.queryByText('ขั้นต่อไป:')).toBeNull();
  });

  it('shows "สูงสุด 🎉" badge at SUPER_EMPLOYEE', () => {
    render(<SuperEmployeeProgressCard employee={makeEmployee('SUPER_EMPLOYEE')} />);
    expect(screen.getByText('สูงสุด 🎉')).toBeTruthy();
  });

  it('does NOT show "สูงสุด 🎉" badge for non-max stages', () => {
    render(<SuperEmployeeProgressCard employee={makeEmployee('AI_PARTNER')} />);
    expect(screen.queryByText('สูงสุด 🎉')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// Test Suite: TriggerFlowPanel Toggle
// ─────────────────────────────────────────────────────────────

describe('SuperEmployeeProgressCard — TriggerFlowPanel toggle', () => {
  it('hides TriggerFlowPanel by default (defaultShowTrigger = false)', () => {
    render(<SuperEmployeeProgressCard employee={makeEmployee('AI_AWARE')} />);
    // The panel content is unique — should not be visible
    expect(screen.queryByText('DB Trigger — validate_stage_progression()')).toBeNull();
  });

  it('shows TriggerFlowPanel when defaultShowTrigger = true', () => {
    render(
      <SuperEmployeeProgressCard
        employee={makeEmployee('AI_AWARE')}
        defaultShowTrigger={true}
      />
    );
    expect(screen.getByText('DB Trigger — validate_stage_progression()')).toBeTruthy();
  });

  it('opens TriggerFlowPanel on toggle button click', () => {
    render(<SuperEmployeeProgressCard employee={makeEmployee('AI_PARTNER')} />);
    // Panel should be hidden initially
    expect(screen.queryByText('DB Trigger — validate_stage_progression()')).toBeNull();

    const toggleBtn = screen.getByText('ดู DB Trigger Flow (validate_stage_progression)');
    fireEvent.click(toggleBtn);

    expect(screen.getByText('DB Trigger — validate_stage_progression()')).toBeTruthy();
  });

  it('closes TriggerFlowPanel on second toggle click', () => {
    render(
      <SuperEmployeeProgressCard
        employee={makeEmployee('AI_PARTNER')}
        defaultShowTrigger={true}
      />
    );
    // Panel is open
    expect(screen.getByText('DB Trigger — validate_stage_progression()')).toBeTruthy();

    const toggleBtn = screen.getByText('ดู DB Trigger Flow (validate_stage_progression)');
    fireEvent.click(toggleBtn);

    expect(screen.queryByText('DB Trigger — validate_stage_progression()')).toBeNull();
  });

  it('shows BEFORE UPDATE label in TriggerFlowPanel', () => {
    render(
      <SuperEmployeeProgressCard
        employee={makeEmployee('AI_ASSISTED')}
        defaultShowTrigger={true}
      />
    );
    expect(screen.getByText('BEFORE UPDATE')).toBeTruthy();
  });

  it('shows SELECT ... FOR UPDATE step in TriggerFlowPanel', () => {
    render(
      <SuperEmployeeProgressCard
        employee={makeEmployee('AI_AWARE')}
        defaultShowTrigger={true}
      />
    );
    expect(screen.getByText('SELECT ... FOR UPDATE')).toBeTruthy();
  });

  it('shows SUPER_EMPLOYEE as target stage in TriggerFlowPanel at AI_PARTNER', () => {
    render(
      <SuperEmployeeProgressCard
        employee={makeEmployee('AI_PARTNER')}
        defaultShowTrigger={true}
      />
    );
    // Next stage from AI_PARTNER is SUPER_EMPLOYEE
    expect(screen.getByText("'SUPER_EMPLOYEE'")).toBeTruthy();
  });

  it('shows "already at maximum stage" comment in TriggerFlowPanel at SUPER_EMPLOYEE', () => {
    render(
      <SuperEmployeeProgressCard
        employee={makeEmployee('SUPER_EMPLOYEE')}
        defaultShowTrigger={true}
      />
    );
    expect(screen.getByText('— already at maximum stage')).toBeTruthy();
  });

  it('shows truncated employee ID in TriggerFlowPanel', () => {
    const emp = makeEmployee('AI_AWARE');
    render(
      <SuperEmployeeProgressCard employee={emp} defaultShowTrigger={true} />
    );
    // Component uses employeeId.substring(0, 8) = 'emp-1234'
    expect(screen.getByText(/'emp-1234\.\.\.'/)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// Test Suite: Stage Stepper
// ─────────────────────────────────────────────────────────────

describe('SuperEmployeeProgressCard — StageStepper', () => {
  it('renders all 5 stage labels in the stepper', () => {
    render(<SuperEmployeeProgressCard employee={makeEmployee('AI_UNAWARE')} />);
    // All 5 stages are rendered (stepper shows all steps always)
    expect(screen.getAllByText('ยังไม่รู้จัก AI').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('รู้จัก AI')).toBeTruthy();
    expect(screen.queryByText('ใช้ AI ช่วยงาน')).toBeTruthy();
    expect(screen.queryByText('คู่คิด AI')).toBeTruthy();
    // 'Super Employee' appears in stepper AND possibly in stage header — just check it's present
    expect(screen.queryAllByText('Super Employee').length).toBeGreaterThanOrEqual(1);
  });

  it('renders correct percentage labels in the stepper (0%, 25%, 50%, 75%, 100%)', () => {
    render(<SuperEmployeeProgressCard employee={makeEmployee('AI_AWARE')} />);
    // 25% is in both header and stepper; 0%, 50%, 75%, 100% only in stepper
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// Test Suite: Custom className
// ─────────────────────────────────────────────────────────────

describe('SuperEmployeeProgressCard — custom className', () => {
  it('applies custom className to root element', () => {
    const { container } = render(
      <SuperEmployeeProgressCard
        employee={makeEmployee('AI_AWARE')}
        className="test-custom-class"
      />
    );
    expect(container.firstChild).toHaveClass('test-custom-class');
  });
});
