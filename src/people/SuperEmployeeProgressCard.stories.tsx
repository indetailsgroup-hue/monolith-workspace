/**
 * SuperEmployeeProgressCard.stories.tsx
 * Storybook 8.x stories for SuperEmployeeProgressCard component.
 *
 * Component prop: employee: Employee, defaultShowTrigger?: boolean, className?: string
 *
 * TYPE MISMATCH NOTE (by design — do NOT fix):
 * The component reads employee.aiStage, employee.firstName, employee.lastName,
 * employee.employeeCode — but the Employee type only has superEmployeeStage, name,
 * and no employeeCode. Mock objects must be cast as `as unknown as Employee`.
 *
 * AiStage alias: AiStage = SuperEmployeeStage (both are valid).
 * Stage order: AI_UNAWARE → AI_AWARE → AI_ASSISTED → AI_PARTNER → SUPER_EMPLOYEE
 * Progress bars:  0%         25%         50%           75%          100%
 */
import type { Meta, StoryObj } from '@storybook/react';
import { within, expect } from '@storybook/test';
import { SuperEmployeeProgressCard } from './SuperEmployeeProgressCard';
import type { Employee, SuperEmployeeStage } from './types';

// ─── Mock employee factory ────────────────────────────────────────────────────

/**
 * Builds a minimal mock object that satisfies SuperEmployeeProgressCard's
 * actual field access pattern (not the Employee TypeScript type).
 * Must cast to `unknown as Employee` due to intentional field mismatches.
 */
function makeMockEmployee(
  overrides: {
    id?: string;
    aiStage?: SuperEmployeeStage;
    firstName?: string;
    lastName?: string;
    employeeCode?: string;
    department?: string;
    role?: string;
    orgId?: string;
    isActive?: boolean;
  } = {}
): Employee {
  return {
    // Fields the component actually reads (type mismatch — cast below)
    id: overrides.id ?? 'emp-stories-001',
    aiStage: overrides.aiStage ?? 'AI_UNAWARE',
    firstName: overrides.firstName ?? 'สมชาย',
    lastName: overrides.lastName ?? 'ใจดี',
    employeeCode: overrides.employeeCode ?? 'EMP-0042',
    // Fields required by Employee type (populated for completeness)
    orgId: overrides.orgId ?? 'org-stories-001',
    userId: 'user-stories-001',
    name: `${overrides.firstName ?? 'สมชาย'} ${overrides.lastName ?? 'ใจดี'}`,
    role: overrides.role ?? 'พนักงานฝ่ายผลิต',
    department: overrides.department ?? 'การผลิต',
    hireDate: '2022-03-15',
    avatarUrl: null,
    isActive: overrides.isActive ?? true,
    superEmployeeStage: overrides.aiStage ?? 'AI_UNAWARE',
    notes: null,
    createdAt: '2022-03-15T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  } as unknown as Employee;
}

// ─── Pre-built employee mocks for each stage ──────────────────────────────────

const employeeAiUnaware = makeMockEmployee({
  id: 'emp-unaware',
  aiStage: 'AI_UNAWARE',
  firstName: 'สมชาย',
  lastName: 'ใจดี',
  employeeCode: 'EMP-0001',
  department: 'การผลิต',
});

const employeeAiAware = makeMockEmployee({
  id: 'emp-aware',
  aiStage: 'AI_AWARE',
  firstName: 'วิภา',
  lastName: 'แสงเดือน',
  employeeCode: 'EMP-0015',
  department: 'QC',
});

const employeeAiAssisted = makeMockEmployee({
  id: 'emp-assisted',
  aiStage: 'AI_ASSISTED',
  firstName: 'ธนกร',
  lastName: 'มั่นคง',
  employeeCode: 'EMP-0028',
  department: 'วิศวกรรม',
});

const employeeAiPartner = makeMockEmployee({
  id: 'emp-partner',
  aiStage: 'AI_PARTNER',
  firstName: 'นิภา',
  lastName: 'ปิยะมิตร',
  employeeCode: 'EMP-0034',
  department: 'HR',
});

const employeeSuperEmployee = makeMockEmployee({
  id: 'emp-super',
  aiStage: 'SUPER_EMPLOYEE',
  firstName: 'ชนิดา',
  lastName: 'ศรีสุขสม',
  employeeCode: 'EMP-0007',
  department: 'ผู้จัดการโรงงาน',
});

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<typeof SuperEmployeeProgressCard> = {
  title: 'People/SuperEmployeeProgressCard',
  component: SuperEmployeeProgressCard,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
**SuperEmployeeProgressCard** แสดงความก้าวหน้าของพนักงานตาม Super Employee Framework
ใน MONOLITH Manufacturing OS (DAPH Decor, Thailand).

**5 ขั้นตอน:**
| Stage | Label | Progress |
|-------|-------|----------|
| AI_UNAWARE | ไม่รู้จัก AI | 0% |
| AI_AWARE | รับรู้เรื่อง AI | 25% |
| AI_ASSISTED | ใช้ AI ช่วยงาน | 50% |
| AI_PARTNER | ร่วมงานกับ AI | 75% |
| SUPER_EMPLOYEE | Super Employee | 100% |

**หมายเหตุด้านประเภท:** component ใช้ \`employee.aiStage\`, \`employee.firstName\`,
\`employee.lastName\`, \`employee.employeeCode\` ซึ่งไม่ตรงกับ \`Employee\` type.
mock objects ต้อง cast ด้วย \`as unknown as Employee\`.
        `,
      },
    },
  },
  argTypes: {
    defaultShowTrigger: {
      description: 'Open the DB Trigger Flow panel on mount',
      control: 'boolean',
    },
    className: {
      description: 'Additional CSS class names',
      control: 'text',
    },
  },
};

export default meta;
type Story = StoryObj<typeof SuperEmployeeProgressCard>;

// ─── All 5 Stage Stories ──────────────────────────────────────────────────────

/**
 * Stage 1: AI_UNAWARE — 0% progress.
 * Shows first stage highlighted in stepper; next-stage hint visible.
 */
export const AiUnaware: Story = {
  name: 'Stage 1 — AI_UNAWARE (0%)',
  args: {
    employee: employeeAiUnaware,
  },
  parameters: {
    docs: {
      description: {
        story: 'Lowest stage (0%). Next-stage hint should point toward AI_AWARE.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Employee name should be visible
    await expect(canvas.getByText(/สมชาย/i)).toBeVisible();
    await expect(canvas.getByText(/ใจดี/i)).toBeVisible();
    // Should NOT show the no-next-stage hint (which only appears at SUPER_EMPLOYEE)
    await expect(canvas.queryByText(/ขั้นสูงสุดแล้ว/i)).not.toBeInTheDocument();
  },
};

/**
 * Stage 2: AI_AWARE — 25% progress.
 * Shows second step active; next-stage hint describes AI_ASSISTED skills.
 */
export const AiAware: Story = {
  name: 'Stage 2 — AI_AWARE (25%)',
  args: {
    employee: employeeAiAware,
  },
  parameters: {
    docs: {
      description: {
        story:
          '25% progress. The card shows the AI_AWARE stage description and hints toward AI_ASSISTED.',
      },
    },
  },
};

/**
 * Stage 3: AI_ASSISTED — 50% progress.
 * Mid-point of the journey. Gradient progress bar at 50%.
 */
export const AiAssisted: Story = {
  name: 'Stage 3 — AI_ASSISTED (50%)',
  args: {
    employee: employeeAiAssisted,
  },
};

/**
 * Stage 4: AI_PARTNER — 75% progress.
 * Near the top. Next-stage hint describes SUPER_EMPLOYEE criteria.
 */
export const AiPartner: Story = {
  name: 'Stage 4 — AI_PARTNER (75%)',
  args: {
    employee: employeeAiPartner,
  },
};

/**
 * Stage 5: SUPER_EMPLOYEE — 100% progress.
 * Maximum stage: next-stage hint is HIDDEN (no higher stage exists).
 */
export const SuperEmployee: Story = {
  name: 'Stage 5 — SUPER_EMPLOYEE (100%) — no next-stage hint',
  args: {
    employee: employeeSuperEmployee,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Final stage (100%). The next-stage hint panel must NOT be rendered since there is no higher stage.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/ชนิดา/i)).toBeVisible();
    // Progress bar should reflect 100%
    const progressBar = canvasElement.querySelector('[role="progressbar"]');
    if (progressBar) {
      const ariaVal = progressBar.getAttribute('aria-valuenow');
      if (ariaVal !== null) await expect(Number(ariaVal)).toBe(100);
    }
  },
};

// ─── Interaction / Variant Stories ───────────────────────────────────────────

/**
 * DB Trigger Flow panel open on mount (defaultShowTrigger=true).
 * Used to verify the collapsible panel renders correctly by default.
 */
export const WithTriggerPanelOpen: Story = {
  name: 'AI_ASSISTED + Trigger Panel Open (defaultShowTrigger=true)',
  args: {
    employee: employeeAiAssisted,
    defaultShowTrigger: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Sets `defaultShowTrigger=true` so the DB Trigger Flow panel is visible on load without interaction.',
      },
    },
  },
};

/**
 * Skill gap display at AI_AWARE stage.
 * The card should show the current stage description and the gap to AI_ASSISTED.
 */
export const SkillGapAtAiAware: Story = {
  name: 'Skill Gap — AI_AWARE → AI_ASSISTED description',
  args: {
    employee: employeeAiAware,
    defaultShowTrigger: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Focuses on the stage description box showing what skills are needed to advance from AI_AWARE to AI_ASSISTED.',
      },
    },
  },
};

/**
 * Custom className applied — verifies className prop is forwarded to root element.
 */
export const WithCustomClassName: Story = {
  name: 'Custom className (border-dashed ring-2)',
  args: {
    employee: employeeAiPartner,
    className: 'border-dashed ring-2 ring-blue-400',
  },
};

// ─── Template: All Stages ─────────────────────────────────────────────────────

/**
 * AllStages — renders all 5 stage cards side-by-side for visual comparison.
 * Each card is an independent instance of the component with a different stage.
 */
export const AllStages: Story = {
  name: 'All 5 Stages — side-by-side comparison',
  render: () => (
    <div className="flex flex-col gap-6 p-6 bg-slate-100 min-h-screen">
      <h2 className="text-xl font-bold text-slate-800">
        Super Employee Framework — All 5 Stages
      </h2>
      {(
        [
          { employee: employeeAiUnaware, label: '0% — AI_UNAWARE' },
          { employee: employeeAiAware, label: '25% — AI_AWARE' },
          { employee: employeeAiAssisted, label: '50% — AI_ASSISTED' },
          { employee: employeeAiPartner, label: '75% — AI_PARTNER' },
          { employee: employeeSuperEmployee, label: '100% — SUPER_EMPLOYEE' },
        ] as { employee: Employee; label: string }[]
      ).map(({ employee, label }) => (
        <div key={label} className="space-y-1">
          <p className="text-xs font-mono text-slate-500 uppercase tracking-wide">
            {label}
          </p>
          <SuperEmployeeProgressCard employee={employee} />
        </div>
      ))}
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story:
          'Renders all 5 stage variants stacked vertically for a full visual regression baseline.',
      },
    },
  },
};
