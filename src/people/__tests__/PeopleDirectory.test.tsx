/**
 * PeopleDirectory.test.tsx
 * MONOLITH v16.0 — People Module
 *
 * Vitest + @testing-library/react tests for PeopleDirectory.
 *
 * Coverage:
 *  • Initial load — loadEmployees + loadSkills called on mount with orgId
 *  • SuperEmployee badge — correct Thai label rendered per stage
 *  • SUPER_EMPLOYEE stage — ⭐ star rendered; other stages do NOT render ⭐
 *  • Search filter — setFilters called with { search } on input change
 *  • Stage filter — setFilters called with { superEmployeeStage } on select change
 *  • Skill filter — local state filters employee list by employeeSkillsByEmployee
 *  • Skill filter options — skill names appear in dropdown
 *  • Reset filters button — appears only when a filter is active; hidden otherwise
 *  • Reset filters — calls setFilters(DEFAULT_EMPLOYEE_FILTERS) + clears skill filter
 *  • Loading state — skeleton shown when loadingEmployees is true
 *  • Loading state — skeleton shown when loadingSkills is true
 *  • Empty state — "ไม่พบพนักงานที่ตรงกับเงื่อนไข" when no employees match
 *  • Employee count header — shows correct count
 *  • Super Employee count in header — ⭐ N Super Employee shown when present
 *  • onSelectEmployee callback — invoked when a row button is clicked
 *  • Inactive badge — "ไม่ active" rendered for isActive=false employees
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PeopleDirectory } from '../PeopleDirectory';
import { DEFAULT_EMPLOYEE_FILTERS } from '../types';
import type { Employee, EmployeeFilters, Skill } from '../types';

// ─── Hoisted mock state ───────────────────────────────────────────────────────
const { mockPeopleState } = vi.hoisted(() => {
  const mockPeopleState = {
    employees: [] as Employee[],
    skills: [] as Skill[],
    filters: { search: '', role: 'ALL', department: 'ALL', superEmployeeStage: 'ALL', isActive: true } as EmployeeFilters,
    loadingEmployees: false,
    loadingSkills: false,
    loadEmployees: vi.fn(),
    loadSkills: vi.fn(),
    setFilters: vi.fn(),
    resetFilters: vi.fn(),
    // Returns employees as-is by default — store-level filtering is tested separately
    getFilteredEmployees: vi.fn(() => mockPeopleState.employees),
    employeeSkillsByEmployee: {} as Record<string, { skillId: string }[]>,
  };
  return { mockPeopleState };
});

vi.mock('../peopleStore', () => ({
  usePeopleStore: vi.fn((selector: any) => selector(mockPeopleState)),
}));

// SuperEmployeeProgressCard is shown only in the expanded panel —
// mock it to isolate PeopleDirectory render logic
vi.mock('../SuperEmployeeProgressCard', () => ({
  SuperEmployeeProgressCard: () => (
    <div data-testid="super-employee-progress-card" />
  ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const ORG_ID = 'org-test-001';

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-001',
    orgId: ORG_ID,
    userId: 'user-001',
    name: 'สมชาย ใจดี',
    role: 'FACTORY',
    department: 'โรงงาน',
    hireDate: '2024-01-15',
    avatarUrl: null,
    isActive: true,
    superEmployeeStage: 'AI_UNAWARE',
    notes: null,
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
    ...overrides,
  };
}

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-001',
    orgId: ORG_ID,
    name: 'AutoCAD',
    description: 'Computer-aided design',
    category: 'TECHNICAL',
    roleRelevance: ['DESIGNER'],
    isAiSkill: false,
    aiPartnerThreshold: null,
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

const ALL_STAGE_EMPLOYEES: Employee[] = [
  makeEmployee({ id: 'emp-1', name: 'พนักงาน A', superEmployeeStage: 'AI_UNAWARE' }),
  makeEmployee({ id: 'emp-2', name: 'พนักงาน B', superEmployeeStage: 'AI_AWARE' }),
  makeEmployee({ id: 'emp-3', name: 'พนักงาน C', superEmployeeStage: 'AI_ASSISTED' }),
  makeEmployee({ id: 'emp-4', name: 'พนักงาน D', superEmployeeStage: 'AI_PARTNER' }),
  makeEmployee({ id: 'emp-5', name: 'พนักงาน E', superEmployeeStage: 'SUPER_EMPLOYEE' }),
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function renderDirectory(props?: Partial<React.ComponentProps<typeof PeopleDirectory>>) {
  return render(<PeopleDirectory orgId={ORG_ID} {...props} />);
}

function resetMockState() {
  mockPeopleState.employees = [];
  mockPeopleState.skills = [];
  mockPeopleState.filters = { ...DEFAULT_EMPLOYEE_FILTERS };
  mockPeopleState.loadingEmployees = false;
  mockPeopleState.loadingSkills = false;
  mockPeopleState.loadEmployees = vi.fn();
  mockPeopleState.loadSkills = vi.fn();
  mockPeopleState.setFilters = vi.fn();
  mockPeopleState.resetFilters = vi.fn();
  mockPeopleState.getFilteredEmployees = vi.fn(() => mockPeopleState.employees);
  mockPeopleState.employeeSkillsByEmployee = {};
}

// ─────────────────────────────────────────────────────────────────────────────
describe('PeopleDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  // ── Initial data load ──────────────────────────────────────────────────────
  describe('initial data load', () => {
    it('calls loadEmployees with orgId on mount', () => {
      renderDirectory();
      expect(mockPeopleState.loadEmployees).toHaveBeenCalledOnce();
      expect(mockPeopleState.loadEmployees).toHaveBeenCalledWith(ORG_ID);
    });

    it('calls loadSkills with orgId on mount', () => {
      renderDirectory();
      expect(mockPeopleState.loadSkills).toHaveBeenCalledOnce();
      expect(mockPeopleState.loadSkills).toHaveBeenCalledWith(ORG_ID);
    });

    it('calls both loadEmployees and loadSkills in the same effect', () => {
      renderDirectory();
      expect(mockPeopleState.loadEmployees).toHaveBeenCalledWith(ORG_ID);
      expect(mockPeopleState.loadSkills).toHaveBeenCalledWith(ORG_ID);
    });
  });

  // ── SuperEmployee badge render ─────────────────────────────────────────────
  describe('SuperEmployee badge render', () => {
    it('renders "ยังไม่รู้จัก AI" badge for AI_UNAWARE', () => {
      mockPeopleState.employees = [makeEmployee({ superEmployeeStage: 'AI_UNAWARE' })];
      renderDirectory();
      // Scope to employee button — the same label also appears as a dropdown option
      const btn = screen.getByRole('button');
      expect(within(btn).getByText('ยังไม่รู้จัก AI')).toBeInTheDocument();
    });

    it('renders "รู้จัก AI แล้ว" badge for AI_AWARE', () => {
      mockPeopleState.employees = [makeEmployee({ superEmployeeStage: 'AI_AWARE' })];
      renderDirectory();
      const btn = screen.getByRole('button');
      expect(within(btn).getByText('รู้จัก AI แล้ว')).toBeInTheDocument();
    });

    it('renders "ใช้ AI ช่วยงาน" badge for AI_ASSISTED', () => {
      mockPeopleState.employees = [makeEmployee({ superEmployeeStage: 'AI_ASSISTED' })];
      renderDirectory();
      const btn = screen.getByRole('button');
      expect(within(btn).getByText('ใช้ AI ช่วยงาน')).toBeInTheDocument();
    });

    it('renders "ทำงานร่วมกับ AI" badge for AI_PARTNER', () => {
      mockPeopleState.employees = [makeEmployee({ superEmployeeStage: 'AI_PARTNER' })];
      renderDirectory();
      const btn = screen.getByRole('button');
      expect(within(btn).getByText('ทำงานร่วมกับ AI')).toBeInTheDocument();
    });

    it('renders "Super Employee" badge for SUPER_EMPLOYEE', () => {
      mockPeopleState.employees = [makeEmployee({ superEmployeeStage: 'SUPER_EMPLOYEE' })];
      renderDirectory();
      const btn = screen.getByRole('button');
      expect(btn.textContent).toContain('Super Employee');
    });

    it('renders ⭐ icon for SUPER_EMPLOYEE badge', () => {
      mockPeopleState.employees = [makeEmployee({ superEmployeeStage: 'SUPER_EMPLOYEE' })];
      renderDirectory();
      const btn = screen.getByRole('button');
      expect(btn.querySelector('[aria-hidden="true"]')?.textContent).toBe('⭐');
    });

    it('does NOT render ⭐ icon for AI_PARTNER badge', () => {
      mockPeopleState.employees = [makeEmployee({ superEmployeeStage: 'AI_PARTNER' })];
      renderDirectory();
      const btn = screen.getByRole('button');
      expect(btn.querySelector('[aria-hidden="true"]')).toBeNull();
    });

    it('does NOT render ⭐ icon for AI_UNAWARE badge', () => {
      mockPeopleState.employees = [makeEmployee({ superEmployeeStage: 'AI_UNAWARE' })];
      renderDirectory();
      const btn = screen.getByRole('button');
      expect(btn.querySelector('[aria-hidden="true"]')).toBeNull();
    });

    it('renders all 5 stage badges for a mixed employee list', () => {
      mockPeopleState.employees = ALL_STAGE_EMPLOYEES;
      renderDirectory();
      const btns = screen.getAllByRole('button');
      expect(within(btns[0]).getByText('ยังไม่รู้จัก AI')).toBeInTheDocument();
      expect(within(btns[1]).getByText('รู้จัก AI แล้ว')).toBeInTheDocument();
      expect(within(btns[2]).getByText('ใช้ AI ช่วยงาน')).toBeInTheDocument();
      expect(within(btns[3]).getByText('ทำงานร่วมกับ AI')).toBeInTheDocument();
      expect(btns[4].textContent).toContain('Super Employee');
    });
  });

  // ── Search filter ──────────────────────────────────────────────────────────
  describe('search filter', () => {
    it('calls setFilters with { search } when user types in search input', () => {
      renderDirectory();
      const input = screen.getByRole('textbox', { name: /ค้นหาพนักงาน/i });
      fireEvent.change(input, { target: { value: 'สมชาย' } });
      expect(mockPeopleState.setFilters).toHaveBeenCalledWith({ search: 'สมชาย' });
    });

    it('calls setFilters with empty string when search is cleared', () => {
      mockPeopleState.filters = { ...DEFAULT_EMPLOYEE_FILTERS, search: 'สมชาย' };
      renderDirectory();
      const input = screen.getByRole('textbox', { name: /ค้นหาพนักงาน/i });
      fireEvent.change(input, { target: { value: '' } });
      expect(mockPeopleState.setFilters).toHaveBeenCalledWith({ search: '' });
    });

    it('search input reflects current filters.search value', () => {
      mockPeopleState.filters = { ...DEFAULT_EMPLOYEE_FILTERS, search: 'ช่าง' };
      renderDirectory();
      const input = screen.getByRole('textbox', { name: /ค้นหาพนักงาน/i }) as HTMLInputElement;
      expect(input.value).toBe('ช่าง');
    });
  });

  // ── Stage filter ───────────────────────────────────────────────────────────
  describe('stage filter', () => {
    it('calls setFilters with { superEmployeeStage } when user selects a stage', () => {
      renderDirectory();
      const select = screen.getByRole('combobox', { name: /กรองตาม Stage/i });
      fireEvent.change(select, { target: { value: 'SUPER_EMPLOYEE' } });
      expect(mockPeopleState.setFilters).toHaveBeenCalledWith({
        superEmployeeStage: 'SUPER_EMPLOYEE',
      });
    });

    it('calls setFilters with { superEmployeeStage: "AI_PARTNER" }', () => {
      renderDirectory();
      const select = screen.getByRole('combobox', { name: /กรองตาม Stage/i });
      fireEvent.change(select, { target: { value: 'AI_PARTNER' } });
      expect(mockPeopleState.setFilters).toHaveBeenCalledWith({
        superEmployeeStage: 'AI_PARTNER',
      });
    });

    it('stage select shows "ทุก Stage" as default option', () => {
      renderDirectory();
      const select = screen.getByRole('combobox', { name: /กรองตาม Stage/i }) as HTMLSelectElement;
      expect(select.value).toBe('ALL');
    });

    it('stage select reflects current filters.superEmployeeStage', () => {
      mockPeopleState.filters = {
        ...DEFAULT_EMPLOYEE_FILTERS,
        superEmployeeStage: 'AI_AWARE',
      };
      renderDirectory();
      const select = screen.getByRole('combobox', { name: /กรองตาม Stage/i }) as HTMLSelectElement;
      expect(select.value).toBe('AI_AWARE');
    });

    it('renders all 5 stage options in the stage filter dropdown', () => {
      renderDirectory();
      const select = screen.getByRole('combobox', { name: /กรองตาม Stage/i });
      expect(within(select).getByText('ยังไม่รู้จัก AI')).toBeInTheDocument();
      expect(within(select).getByText('รู้จัก AI แล้ว')).toBeInTheDocument();
      expect(within(select).getByText('ใช้ AI ช่วยงาน')).toBeInTheDocument();
      expect(within(select).getByText('ทำงานร่วมกับ AI')).toBeInTheDocument();
      expect(within(select).getByText('Super Employee')).toBeInTheDocument();
    });
  });

  // ── Skill filter ───────────────────────────────────────────────────────────
  describe('skill filter', () => {
    it('renders skill names as options in skill filter dropdown', () => {
      mockPeopleState.skills = [
        makeSkill({ id: 'sk-1', name: 'AutoCAD' }),
        makeSkill({ id: 'sk-2', name: 'AI Estimator' }),
      ];
      renderDirectory();
      const select = screen.getByRole('combobox', { name: /กรองตามทักษะ/i });
      expect(within(select).getByText('AutoCAD')).toBeInTheDocument();
      expect(within(select).getByText('AI Estimator')).toBeInTheDocument();
    });

    it('shows "ทุกทักษะ" as default option', () => {
      renderDirectory();
      const select = screen.getByRole('combobox', { name: /กรองตามทักษะ/i }) as HTMLSelectElement;
      expect(select.value).toBe('ALL');
    });

    it('filters employee list to only employees with the selected skill', () => {
      const emp1 = makeEmployee({ id: 'emp-1', name: 'มี AutoCAD' });
      const emp2 = makeEmployee({ id: 'emp-2', name: 'ไม่มี AutoCAD' });
      mockPeopleState.employees = [emp1, emp2];
      mockPeopleState.skills = [makeSkill({ id: 'sk-autocad', name: 'AutoCAD' })];
      mockPeopleState.employeeSkillsByEmployee = {
        'emp-1': [{ skillId: 'sk-autocad' }],
        'emp-2': [],
      };
      renderDirectory();

      // Select the AutoCAD skill
      const select = screen.getByRole('combobox', { name: /กรองตามทักษะ/i });
      fireEvent.change(select, { target: { value: 'sk-autocad' } });

      // Only emp-1 should be visible
      expect(screen.getByText('มี AutoCAD')).toBeInTheDocument();
      expect(screen.queryByText('ไม่มี AutoCAD')).not.toBeInTheDocument();
    });

    it('shows all employees when skill filter is reset to ALL', () => {
      const emp1 = makeEmployee({ id: 'emp-1', name: 'มี AutoCAD' });
      const emp2 = makeEmployee({ id: 'emp-2', name: 'ไม่มี AutoCAD' });
      mockPeopleState.employees = [emp1, emp2];
      mockPeopleState.skills = [makeSkill({ id: 'sk-autocad', name: 'AutoCAD' })];
      mockPeopleState.employeeSkillsByEmployee = {
        'emp-1': [{ skillId: 'sk-autocad' }],
        'emp-2': [],
      };
      renderDirectory();

      const select = screen.getByRole('combobox', { name: /กรองตามทักษะ/i });

      // Apply filter
      fireEvent.change(select, { target: { value: 'sk-autocad' } });
      expect(screen.queryByText('ไม่มี AutoCAD')).not.toBeInTheDocument();

      // Reset to ALL
      fireEvent.change(select, { target: { value: 'ALL' } });
      expect(screen.getByText('มี AutoCAD')).toBeInTheDocument();
      expect(screen.getByText('ไม่มี AutoCAD')).toBeInTheDocument();
    });

    it('shows empty state when skill filter matches no employees', () => {
      mockPeopleState.employees = [makeEmployee({ id: 'emp-1', name: 'ช่างไม้' })];
      mockPeopleState.skills = [makeSkill({ id: 'sk-ai', name: 'AI Estimator' })];
      mockPeopleState.employeeSkillsByEmployee = { 'emp-1': [] };
      renderDirectory();

      fireEvent.change(
        screen.getByRole('combobox', { name: /กรองตามทักษะ/i }),
        { target: { value: 'sk-ai' } },
      );

      expect(screen.getByText('ไม่พบพนักงานที่ตรงกับเงื่อนไข')).toBeInTheDocument();
    });
  });

  // ── Reset filters ──────────────────────────────────────────────────────────
  describe('reset filters button', () => {
    it('is NOT visible when all filters are at defaults', () => {
      renderDirectory();
      expect(screen.queryByText('ล้างตัวกรอง')).not.toBeInTheDocument();
    });

    it('appears when filters.search is non-empty', () => {
      mockPeopleState.filters = { ...DEFAULT_EMPLOYEE_FILTERS, search: 'ทดสอบ' };
      renderDirectory();
      expect(screen.getByText('ล้างตัวกรอง')).toBeInTheDocument();
    });

    it('appears when filters.superEmployeeStage is not ALL', () => {
      mockPeopleState.filters = {
        ...DEFAULT_EMPLOYEE_FILTERS,
        superEmployeeStage: 'AI_PARTNER',
      };
      renderDirectory();
      expect(screen.getByText('ล้างตัวกรอง')).toBeInTheDocument();
    });

    it('appears when skill filter is not ALL', () => {
      mockPeopleState.skills = [makeSkill({ id: 'sk-1', name: 'AutoCAD' })];
      renderDirectory();
      fireEvent.change(
        screen.getByRole('combobox', { name: /กรองตามทักษะ/i }),
        { target: { value: 'sk-1' } },
      );
      expect(screen.getByText('ล้างตัวกรอง')).toBeInTheDocument();
    });

    it('calls setFilters with DEFAULT_EMPLOYEE_FILTERS when reset is clicked', () => {
      mockPeopleState.filters = { ...DEFAULT_EMPLOYEE_FILTERS, search: 'ทดสอบ' };
      renderDirectory();
      fireEvent.click(screen.getByText('ล้างตัวกรอง'));
      expect(mockPeopleState.setFilters).toHaveBeenCalledWith(DEFAULT_EMPLOYEE_FILTERS);
    });

    it('resets skill filter dropdown to ALL when reset is clicked', () => {
      mockPeopleState.skills = [makeSkill({ id: 'sk-1', name: 'AutoCAD' })];
      renderDirectory();

      const skillSelect = screen.getByRole('combobox', { name: /กรองตามทักษะ/i }) as HTMLSelectElement;
      fireEvent.change(skillSelect, { target: { value: 'sk-1' } });
      expect(skillSelect.value).toBe('sk-1');

      fireEvent.click(screen.getByText('ล้างตัวกรอง'));
      expect(skillSelect.value).toBe('ALL');
    });

    it('hides reset button after reset is clicked', () => {
      // Start with active search filter
      mockPeopleState.filters = { ...DEFAULT_EMPLOYEE_FILTERS, search: 'ทดสอบ' };
      const { rerender } = renderDirectory();
      expect(screen.getByText('ล้างตัวกรอง')).toBeInTheDocument();

      // Simulate the store updating filters back to default after setFilters is called
      mockPeopleState.filters = { ...DEFAULT_EMPLOYEE_FILTERS };
      rerender(<PeopleDirectory orgId={ORG_ID} />);
      expect(screen.queryByText('ล้างตัวกรอง')).not.toBeInTheDocument();
    });
  });

  // ── Loading state ──────────────────────────────────────────────────────────
  describe('loading state', () => {
    it('renders skeleton area when loadingEmployees is true', () => {
      mockPeopleState.loadingEmployees = true;
      renderDirectory();
      expect(screen.getByLabelText('กำลังโหลด')).toBeInTheDocument();
    });

    it('renders skeleton area when loadingSkills is true', () => {
      mockPeopleState.loadingSkills = true;
      renderDirectory();
      expect(screen.getByLabelText('กำลังโหลด')).toBeInTheDocument();
    });

    it('shows "กำลังโหลด…" in header paragraph while loading', () => {
      mockPeopleState.loadingEmployees = true;
      renderDirectory();
      expect(screen.getByText('กำลังโหลด…')).toBeInTheDocument();
    });

    it('does NOT show employee list when loading', () => {
      mockPeopleState.loadingEmployees = true;
      mockPeopleState.employees = [makeEmployee({ name: 'ไม่ควรเห็น' })];
      renderDirectory();
      expect(screen.queryByText('ไม่ควรเห็น')).not.toBeInTheDocument();
    });
  });

  // ── Empty state ────────────────────────────────────────────────────────────
  describe('empty state', () => {
    it('shows empty-state message when employee list is empty', () => {
      mockPeopleState.employees = [];
      renderDirectory();
      expect(screen.getByText('ไม่พบพนักงานที่ตรงกับเงื่อนไข')).toBeInTheDocument();
    });

    it('shows hint text below empty-state message', () => {
      mockPeopleState.employees = [];
      renderDirectory();
      expect(screen.getByText('ลองเปลี่ยนตัวกรองหรือล้างการค้นหา')).toBeInTheDocument();
    });

    it('does NOT show empty state when employees exist', () => {
      mockPeopleState.employees = [makeEmployee()];
      renderDirectory();
      expect(screen.queryByText('ไม่พบพนักงานที่ตรงกับเงื่อนไข')).not.toBeInTheDocument();
    });
  });

  // ── Employee count header ──────────────────────────────────────────────────
  describe('employee count header', () => {
    it('shows correct employee count in header', () => {
      mockPeopleState.employees = [makeEmployee(), makeEmployee({ id: 'emp-2' })];
      renderDirectory();
      expect(screen.getByText(/^2 คน/)).toBeInTheDocument();
    });

    it('shows ⭐ Super Employee count when present', () => {
      mockPeopleState.employees = [
        makeEmployee({ id: 'emp-1', superEmployeeStage: 'SUPER_EMPLOYEE' }),
        makeEmployee({ id: 'emp-2', superEmployeeStage: 'AI_PARTNER' }),
      ];
      renderDirectory();
      expect(screen.getByText(/⭐ 1 Super Employee/)).toBeInTheDocument();
    });

    it('does NOT show Super Employee count when none exist', () => {
      mockPeopleState.employees = [makeEmployee({ superEmployeeStage: 'AI_UNAWARE' })];
      renderDirectory();
      expect(screen.queryByText(/⭐ \d+ Super Employee/)).not.toBeInTheDocument();
    });

    it('shows "ทีมงาน" as the page heading', () => {
      renderDirectory();
      expect(screen.getByRole('heading', { name: 'ทีมงาน' })).toBeInTheDocument();
    });
  });

  // ── onSelectEmployee callback ──────────────────────────────────────────────
  describe('onSelectEmployee callback', () => {
    it('calls onSelectEmployee with the employee when a row is clicked', () => {
      const emp = makeEmployee({ id: 'emp-001', name: 'สมชาย ใจดี' });
      mockPeopleState.employees = [emp];
      const onSelect = vi.fn();
      renderDirectory({ onSelectEmployee: onSelect });

      fireEvent.click(screen.getByText('สมชาย ใจดี').closest('button')!);
      expect(onSelect).toHaveBeenCalledOnce();
      expect(onSelect).toHaveBeenCalledWith(emp);
    });

    it('does not crash when onSelectEmployee is not provided', () => {
      mockPeopleState.employees = [makeEmployee()];
      expect(() => {
        renderDirectory();
        fireEvent.click(screen.getByText('สมชาย ใจดี').closest('button')!);
      }).not.toThrow();
    });
  });

  // ── Inactive employee badge ────────────────────────────────────────────────
  describe('inactive employee badge', () => {
    it('renders "ไม่ active" badge for isActive=false employees', () => {
      mockPeopleState.employees = [makeEmployee({ isActive: false })];
      renderDirectory();
      expect(screen.getByText('ไม่ active')).toBeInTheDocument();
    });

    it('does NOT render "ไม่ active" badge for active employees', () => {
      mockPeopleState.employees = [makeEmployee({ isActive: true })];
      renderDirectory();
      expect(screen.queryByText('ไม่ active')).not.toBeInTheDocument();
    });
  });
});
