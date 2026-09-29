/**
 * PeopleDirectory.stories.tsx
 *
 * Storybook CSF3 stories for <PeopleDirectory> covering:
 *   • All 5 SuperEmployee stage badge variants
 *   • Skill filter (play-function interaction)
 *   • Stage filter (pre-set store state)
 *   • Search filter (play-function interaction)
 *   • Loading skeleton state
 *   • Empty-result state
 *   • Inactive employee badge
 *   • onSelectEmployee callback
 *
 * ──────────────────────────────────────────────────────────
 * Store mocking strategy
 * ──────────────────────────────────────────────────────────
 * PeopleDirectory reads all data from `usePeopleStore`.  Because Zustand
 * stores are module-level singletons we inject mock state via
 * `usePeopleStore.setState()` inside a per-story decorator instead of
 * patching the module.  The decorator:
 *   1. Replaces `loadEmployees` / `loadSkills` with no-ops so no Supabase
 *      calls are made.
 *   2. Seeds `employees`, `skills`, `filters`, and
 *      `employeeSkillsByEmployee` with deterministic mock data.
 *   3. Leaves the original `getFilteredEmployees`, `setFilters`, and
 *      `resetFilters` actions intact (they use `get()` and keep working
 *      correctly against the injected state).
 */

import type { Meta, StoryFn, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import React from 'react';

import { PeopleDirectory, PeopleDirectoryProps } from './PeopleDirectory';
import { usePeopleStore } from './peopleStore';
import type { Employee, EmployeeSkill, Skill } from './types';
import { DEFAULT_EMPLOYEE_FILTERS } from './types';

// ──────────────────────────────────────────────────────────────────────────────
// Mock data factories
// ──────────────────────────────────────────────────────────────────────────────

const ORG_ID = 'org-daph-th';

function makeEmployee(
  id: string,
  name: string,
  overrides: Partial<Employee> = {},
): Employee {
  return {
    id,
    orgId: ORG_ID,
    userId: null,
    name,
    role: 'FACTORY',
    department: 'โรงงานผลิต',
    hireDate: '2022-03-01',
    avatarUrl: null,
    isActive: true,
    superEmployeeStage: 'AI_UNAWARE',
    notes: null,
    createdAt: '2022-03-01T00:00:00Z',
    updatedAt: '2024-08-28T00:00:00Z',
    ...overrides,
  };
}

function makeSkill(id: string, name: string, isAiSkill = false): Skill {
  return {
    id,
    orgId: ORG_ID,
    name,
    description: null,
    category: isAiSkill ? 'AI_TOOL' : 'TECHNICAL',
    roleRelevance: ['FACTORY', 'ADMIN'],
    isAiSkill,
    aiPartnerThreshold: isAiSkill ? 'INTERMEDIATE' : null,
    createdAt: '2022-03-01T00:00:00Z',
  };
}

function makeEmpSkill(employeeId: string, skillId: string): EmployeeSkill {
  return {
    id: `${employeeId}-${skillId}`,
    employeeId,
    skillId,
    level: 'INTERMEDIATE',
    assessedBy: null,
    assessedAt: null,
    notes: null,
  };
}

// ── Skills catalogue ──────────────────────────────────────────────────────────

const SKILL_PYTHON = makeSkill('sk-python', 'Python / AI', true);
const SKILL_EXCEL  = makeSkill('sk-excel',  'Excel & Power BI');
const SKILL_QC     = makeSkill('sk-qc',     'ควบคุมคุณภาพ (QC)');

const ALL_SKILLS: Skill[] = [SKILL_PYTHON, SKILL_EXCEL, SKILL_QC];

// ── Employees (one per SuperEmployee stage) ───────────────────────────────────

const EMP_UNAWARE   = makeEmployee('emp-1', 'สมชาย ใจดี',    { superEmployeeStage: 'AI_UNAWARE',   role: 'FACTORY',    department: 'ตัดผ้า' });
const EMP_AWARE     = makeEmployee('emp-2', 'สมหญิง แสนสวย', { superEmployeeStage: 'AI_AWARE',     role: 'DESIGNER',   department: 'ออกแบบ' });
const EMP_ASSISTED  = makeEmployee('emp-3', 'วิชัย คงคา',    { superEmployeeStage: 'AI_ASSISTED',  role: 'ADMIN',      department: 'ฝ่ายบริหาร' });
const EMP_PARTNER   = makeEmployee('emp-4', 'นิภา ทองดี',    { superEmployeeStage: 'AI_PARTNER',   role: 'FINANCE',    department: 'การเงิน' });
const EMP_SUPER     = makeEmployee('emp-5', 'อาทิตย์ สว่าง', { superEmployeeStage: 'SUPER_EMPLOYEE', role: 'OWNER',    department: 'ผู้บริหาร' });
const EMP_INACTIVE  = makeEmployee('emp-6', 'มานะ หยุดงาน',  { superEmployeeStage: 'AI_AWARE',     isActive: false,  department: 'ตัดผ้า' });

const ALL_EMPLOYEES: Employee[] = [
  EMP_UNAWARE,
  EMP_AWARE,
  EMP_ASSISTED,
  EMP_PARTNER,
  EMP_SUPER,
];

const EMPLOYEES_WITH_INACTIVE: Employee[] = [...ALL_EMPLOYEES, EMP_INACTIVE];

// ── Employee → skill mappings ─────────────────────────────────────────────────

const EMPLOYEE_SKILLS: Record<string, EmployeeSkill[]> = {
  'emp-1': [makeEmpSkill('emp-1', 'sk-qc')],
  'emp-2': [makeEmpSkill('emp-2', 'sk-excel')],
  'emp-3': [makeEmpSkill('emp-3', 'sk-python'), makeEmpSkill('emp-3', 'sk-excel')],
  'emp-4': [makeEmpSkill('emp-4', 'sk-python'), makeEmpSkill('emp-4', 'sk-qc')],
  'emp-5': [
    makeEmpSkill('emp-5', 'sk-python'),
    makeEmpSkill('emp-5', 'sk-excel'),
    makeEmpSkill('emp-5', 'sk-qc'),
  ],
  'emp-6': [makeEmpSkill('emp-6', 'sk-qc')],
};

// ──────────────────────────────────────────────────────────────────────────────
// Store decorator helper
// ──────────────────────────────────────────────────────────────────────────────

type StoreOverride = {
  employees?: Employee[];
  skills?: Skill[];
  filters?: typeof DEFAULT_EMPLOYEE_FILTERS;
  employeeSkillsByEmployee?: Record<string, EmployeeSkill[]>;
  loadingEmployees?: boolean;
  loadingSkills?: boolean;
};

/**
 * Returns a Storybook decorator that seeds `usePeopleStore` with the given
 * overrides before the Story renders.  async actions are replaced with no-ops
 * so no real Supabase calls are made.
 */
const withPeopleStore =
  (overrides: StoreOverride = {}): ((Story: StoryFn) => React.ReactElement) =>
  (Story) => {
    // Merge baseline + per-story overrides, stub out async side effects
    usePeopleStore.setState({
      employees: ALL_EMPLOYEES,
      skills: ALL_SKILLS,
      filters: { ...DEFAULT_EMPLOYEE_FILTERS, isActive: 'ALL' as const },
      employeeSkillsByEmployee: EMPLOYEE_SKILLS,
      loadingEmployees: false,
      loadingSkills: false,
      // ── Stub Supabase actions ──────────────────────────────────────────────
      loadEmployees: async () => {},
      loadSkills: async () => {},
      // ── Per-story overrides ───────────────────────────────────────────────
      ...overrides,
    });

    return <Story />;
  };

// ──────────────────────────────────────────────────────────────────────────────
// Meta
// ──────────────────────────────────────────────────────────────────────────────

const meta: Meta<PeopleDirectoryProps> = {
  title: 'People/PeopleDirectory',
  component: PeopleDirectory,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `
**PeopleDirectory** แสดงรายชื่อพนักงานทั้งหมดในองค์กรพร้อม:
- **SuperEmployee badge** แสดง stage ตาม \`SUPER_EMPLOYEE_STAGE_LABEL_TH\`
- **Stage filter** — กรองตาม SuperEmployee stage
- **Skill filter** — กรองตามทักษะที่พนักงานถือครอง
- **Search** — ค้นหาตามชื่อหรือ role
- **Expanded panel** — แสดง skill tags + SuperEmployeeProgressCard

ข้อมูลทั้งหมดอ่านจาก \`usePeopleStore\` (Zustand).
        `.trim(),
      },
    },
  },
  args: {
    orgId: ORG_ID,
  },
  argTypes: {
    orgId: {
      control: 'text',
      description: 'Supabase org UUID — triggers `loadEmployees(orgId)` on mount',
    },
    onSelectEmployee: {
      action: 'onSelectEmployee',
      description: 'Fired when the user clicks an employee row',
    },
  },
};

export default meta;
type Story = StoryObj<PeopleDirectoryProps>;

// ──────────────────────────────────────────────────────────────────────────────
// Stories
// ──────────────────────────────────────────────────────────────────────────────

// ── 1. Default ────────────────────────────────────────────────────────────────

/**
 * แสดงพนักงาน 5 คน ครอบคลุมทุก SuperEmployee stage
 * ไม่มีตัวกรองที่ active — นี่คือ initial state เมื่อเปิดหน้า Directory
 */
export const Default: Story = {
  name: 'Default — All Employees',
  decorators: [withPeopleStore()],
  parameters: {
    docs: {
      description: {
        story:
          'Initial view with 5 employees across all 5 SuperEmployee stages. No filters active.',
      },
    },
  },
};

// ── 2. All Stage Badges Showcase ──────────────────────────────────────────────

/**
 * แสดงทุก badge สี 5 แบบในหน้าจอเดียว เพื่อตรวจสอบ design token ทั้งหมด:
 * AI_UNAWARE (gray) → AI_AWARE (blue) → AI_ASSISTED (indigo) → AI_PARTNER (violet) → SUPER_EMPLOYEE (amber + ⭐)
 */
export const AllStageBadges: Story = {
  name: 'Stage Badges — All 5 Variants',
  decorators: [
    withPeopleStore({
      employees: ALL_EMPLOYEES,
      filters: { ...DEFAULT_EMPLOYEE_FILTERS, isActive: 'ALL' as const },
    }),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'One employee per stage to visually verify all 5 badge colour variants in a single view: gray (AI_UNAWARE), blue (AI_AWARE), indigo (AI_ASSISTED), violet (AI_PARTNER), amber+⭐ (SUPER_EMPLOYEE).',
      },
    },
  },
};

// ── 3. Stage Filter — SUPER_EMPLOYEE ─────────────────────────────────────────

/**
 * Stage filter pre-set to **SUPER_EMPLOYEE** — store `filters.superEmployeeStage`
 * is already set so `getFilteredEmployees()` returns only the 1 matching employee.
 * The stage `<select>` will display "Super Employee" as selected value.
 */
export const StageFilterSuperEmployee: Story = {
  name: 'Stage Filter — SUPER_EMPLOYEE only',
  decorators: [
    withPeopleStore({
      employees: ALL_EMPLOYEES,
      filters: {
        ...DEFAULT_EMPLOYEE_FILTERS,
        isActive: 'ALL' as const,
        superEmployeeStage: 'SUPER_EMPLOYEE',
      },
    }),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'Store filter pre-set to `superEmployeeStage: "SUPER_EMPLOYEE"`. Only อาทิตย์ สว่าง is visible and the stage `<select>` reflects the active filter.',
      },
    },
  },
};

// ── 4. Stage Filter — AI_ASSISTED (play interaction) ─────────────────────────

/**
 * ผู้ใช้เลือก **"ใช้ AI ช่วยงาน"** ใน stage filter ผ่าน play function
 * เพื่อทดสอบว่า `setFilters({ superEmployeeStage })` อัปเดต list ได้ถูกต้อง
 */
export const StageFilterInteraction: Story = {
  name: 'Stage Filter — Interaction (AI_ASSISTED)',
  decorators: [withPeopleStore()],
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    const stageSelect = canvas.getByRole('combobox', { name: /กรองตาม Stage/i });
    await userEvent.selectOptions(stageSelect, 'AI_ASSISTED');

    // After selecting, only วิชัย คงคา (AI_ASSISTED) should be visible
    await expect(canvas.getByText('วิชัย คงคา')).toBeInTheDocument();
    await expect(canvas.queryByText('อาทิตย์ สว่าง')).not.toBeInTheDocument();
  },
  parameters: {
    docs: {
      description: {
        story:
          'Play function selects AI_ASSISTED in the stage filter select.  Verifies that only the matching employee remains in the list.',
      },
    },
  },
};

// ── 5. Skill Filter — Python / AI (play interaction) ─────────────────────────

/**
 * ผู้ใช้เลือก **"Python / AI"** ใน skill filter ซึ่งเป็น local state (`useState`)
 * ใน component — ต้องใช้ play function เพื่อ simulate การคลิก select
 *
 * พนักงานที่มีทักษะ Python / AI: วิชัย (emp-3), นิภา (emp-4), อาทิตย์ (emp-5)
 */
export const SkillFilterPythonAI: Story = {
  name: 'Skill Filter — Python / AI',
  decorators: [withPeopleStore()],
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    const skillSelect = canvas.getByRole('combobox', { name: /กรองตามทักษะ/i });
    await userEvent.selectOptions(skillSelect, 'sk-python');

    // Employees with Python / AI: วิชัย, นิภา, อาทิตย์
    await expect(canvas.getByText('วิชัย คงคา')).toBeInTheDocument();
    await expect(canvas.getByText('นิภา ทองดี')).toBeInTheDocument();
    await expect(canvas.getByText('อาทิตย์ สว่าง')).toBeInTheDocument();

    // Employees without Python / AI: สมชาย, สมหญิง
    await expect(canvas.queryByText('สมชาย ใจดี')).not.toBeInTheDocument();
    await expect(canvas.queryByText('สมหญิง แสนสวย')).not.toBeInTheDocument();
  },
  parameters: {
    docs: {
      description: {
        story:
          'Play function selects Python / AI in the skill filter (local component state). 3 of 5 employees have this skill — สมชาย and สมหญิง drop out of the list.',
      },
    },
  },
};

// ── 6. Skill Filter — QC (play interaction) ───────────────────────────────────

/**
 * ผู้ใช้เลือก **"ควบคุมคุณภาพ (QC)"** — พนักงานที่มีทักษะ QC: สมชาย, นิภา, อาทิตย์
 */
export const SkillFilterQC: Story = {
  name: 'Skill Filter — ควบคุมคุณภาพ (QC)',
  decorators: [withPeopleStore()],
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    const skillSelect = canvas.getByRole('combobox', { name: /กรองตามทักษะ/i });
    await userEvent.selectOptions(skillSelect, 'sk-qc');

    await expect(canvas.getByText('สมชาย ใจดี')).toBeInTheDocument();
    await expect(canvas.getByText('นิภา ทองดี')).toBeInTheDocument();
    await expect(canvas.getByText('อาทิตย์ สว่าง')).toBeInTheDocument();

    await expect(canvas.queryByText('สมหญิง แสนสวย')).not.toBeInTheDocument();
    await expect(canvas.queryByText('วิชัย คงคา')).not.toBeInTheDocument();
  },
};

// ── 7. Search Filter (play interaction) ───────────────────────────────────────

/**
 * ผู้ใช้พิมพ์ **"นิภา"** ในช่องค้นหา — ต้องแสดง นิภา ทองดี เพียงคนเดียว
 */
export const SearchFilter: Story = {
  name: 'Search — "นิภา"',
  decorators: [withPeopleStore()],
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    const searchInput = canvas.getByRole('textbox', { name: /ค้นหาพนักงาน/i });
    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, 'นิภา');

    await expect(canvas.getByText('นิภา ทองดี')).toBeInTheDocument();
    await expect(canvas.queryByText('สมชาย ใจดี')).not.toBeInTheDocument();
    await expect(canvas.queryByText('อาทิตย์ สว่าง')).not.toBeInTheDocument();

    // "ล้างตัวกรอง" button should appear
    await expect(canvas.getByRole('button', { name: /ล้างตัวกรอง/i })).toBeInTheDocument();
  },
  parameters: {
    docs: {
      description: {
        story:
          'Play function types "นิภา" in the search input. Only นิภา ทองดี remains and the reset-filter button appears.',
      },
    },
  },
};

// ── 8. Reset Filters (play interaction) ──────────────────────────────────────

/**
 * หลังจาก search active แล้วกด **"ล้างตัวกรอง"** — list กลับมาแสดงพนักงานทั้งหมด
 */
export const ResetFilters: Story = {
  name: 'Reset Filters',
  decorators: [withPeopleStore()],
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    // 1. Type in search to activate filter
    const searchInput = canvas.getByRole('textbox', { name: /ค้นหาพนักงาน/i });
    await userEvent.type(searchInput, 'อาทิตย์');

    await expect(canvas.getByText('อาทิตย์ สว่าง')).toBeInTheDocument();
    await expect(canvas.queryByText('สมชาย ใจดี')).not.toBeInTheDocument();

    // 2. Reset
    const resetBtn = canvas.getByRole('button', { name: /ล้างตัวกรอง/i });
    await userEvent.click(resetBtn);

    // All employees should be back
    await expect(canvas.getByText('สมชาย ใจดี')).toBeInTheDocument();
    await expect(canvas.getByText('สมหญิง แสนสวย')).toBeInTheDocument();
    await expect(canvas.getByText('วิชัย คงคา')).toBeInTheDocument();
    await expect(canvas.getByText('นิภา ทองดี')).toBeInTheDocument();
    await expect(canvas.getByText('อาทิตย์ สว่าง')).toBeInTheDocument();
  },
  parameters: {
    docs: {
      description: {
        story:
          'First types a search term, then clicks "ล้างตัวกรอง". All 5 employees reappear.',
      },
    },
  },
};

// ── 9. Loading State ──────────────────────────────────────────────────────────

/**
 * `loadingEmployees: true` — แสดง skeleton rows 4 แถว ไม่แสดง employee cards
 */
export const Loading: Story = {
  name: 'Loading — Skeleton Rows',
  decorators: [
    withPeopleStore({
      employees: [],
      loadingEmployees: true,
    }),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'Store `loadingEmployees` is `true`. The component renders 4 animated skeleton rows instead of employee cards, and the header shows "กำลังโหลด…".',
      },
    },
  },
};

// ── 10. Empty State ───────────────────────────────────────────────────────────

/**
 * ไม่มีพนักงานที่ผ่านตัวกรอง — แสดง empty state card พร้อมข้อความไทย
 */
export const EmptyState: Story = {
  name: 'Empty State — No Results',
  decorators: [
    withPeopleStore({
      employees: [],
      loadingEmployees: false,
    }),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'No employees match current filters. Shows the Thai empty-state card with dashed border.',
      },
    },
  },
};

// ── 11. Inactive Employee Badge ───────────────────────────────────────────────

/**
 * แสดง badge **"ไม่ active"** (สีแดง) สำหรับพนักงานที่ `isActive: false`
 * โดย filter `isActive: 'ALL'` ให้เห็นทั้งที่ active และ inactive
 */
export const WithInactiveEmployee: Story = {
  name: 'Inactive Employee Badge',
  decorators: [
    withPeopleStore({
      employees: EMPLOYEES_WITH_INACTIVE,
      employeeSkillsByEmployee: {
        ...EMPLOYEE_SKILLS,
        'emp-6': [makeEmpSkill('emp-6', 'sk-qc')],
      },
      filters: {
        ...DEFAULT_EMPLOYEE_FILTERS,
        isActive: 'ALL' as const,
      },
    }),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'Includes มานะ หยุดงาน (`isActive: false`). The red "ไม่ active" pill appears alongside the normal stage badge. Filter `isActive: "ALL"` so both active and inactive rows are visible.',
      },
    },
  },
};

// ── 12. onSelectEmployee Callback ─────────────────────────────────────────────

/**
 * คลิกแถวพนักงาน → `onSelectEmployee` callback ถูกเรียก และ Actions panel แสดง
 * employee object ที่ถูกส่ง (ใช้ Storybook Actions addon ดู)
 */
export const OnSelectCallback: Story = {
  name: 'onSelectEmployee Callback',
  args: { onSelectEmployee: fn() },
  decorators: [withPeopleStore()],
  play: async ({ canvasElement, args }: { canvasElement: HTMLElement; args: PeopleDirectoryProps }) => {
    const canvas = within(canvasElement);

    const superEmpRow = await canvas.findByRole('button', {
      name: /อาทิตย์ สว่าง/i,
      // The button contains name + department text; use partial match
    });
    await userEvent.click(superEmpRow);

    // Callback must be a fn() spy — assert it was invoked with the SUPER_EMPLOYEE
    await expect(args.onSelectEmployee).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'emp-5',
        superEmployeeStage: 'SUPER_EMPLOYEE',
      }),
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Clicking an employee row fires `onSelectEmployee(employee)`. Check the **Actions** panel in Storybook for the full employee object. Play function clicks อาทิตย์ สว่าง (SUPER_EMPLOYEE) and asserts the callback was called.',
      },
    },
  },
};

// ── 13. Single Super Employee ─────────────────────────────────────────────────

/**
 * แสดงเฉพาะ Super Employee 1 คน — เน้น amber badge + ⭐ icon ใน header counter
 */
export const SingleSuperEmployee: Story = {
  name: 'Single SUPER_EMPLOYEE — Header Counter',
  decorators: [
    withPeopleStore({
      employees: [EMP_SUPER],
      filters: { ...DEFAULT_EMPLOYEE_FILTERS, isActive: 'ALL' as const },
    }),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'Only one employee — อาทิตย์ สว่าง (SUPER_EMPLOYEE). The header displays "1 คน · ⭐ 1 Super Employee" and the amber badge is prominent.',
      },
    },
  },
};
