'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { usePeopleStore } from './peopleStore';
import {
  Employee,
  Skill,
  SuperEmployeeStage,
  SUPER_EMPLOYEE_STAGE_LABEL_TH,
  DEFAULT_EMPLOYEE_FILTERS,
} from './types';
import { SuperEmployeeProgressCard } from './SuperEmployeeProgressCard';

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

export interface PeopleDirectoryProps {
  orgId: string;
  /** Called when a row is clicked — parent handles navigation / drawer */
  onSelectEmployee?: (employee: Employee) => void;
}

// ─────────────────────────────────────────────────────────────
// Stage badge colours
// ─────────────────────────────────────────────────────────────

const STAGE_BADGE_CLASS: Record<SuperEmployeeStage, string> = {
  AI_UNAWARE: 'bg-gray-100 text-gray-600',
  AI_AWARE: 'bg-blue-100 text-blue-700',
  AI_ASSISTED: 'bg-indigo-100 text-indigo-700',
  AI_PARTNER: 'bg-violet-100 text-violet-700',
  SUPER_EMPLOYEE: 'bg-amber-100 text-amber-800',
};

const ALL_STAGES: SuperEmployeeStage[] = [
  'AI_UNAWARE',
  'AI_AWARE',
  'AI_ASSISTED',
  'AI_PARTNER',
  'SUPER_EMPLOYEE',
];

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

interface StageBadgeProps {
  stage: SuperEmployeeStage;
  /** Show ⭐ star prefix for SUPER_EMPLOYEE */
  withIcon?: boolean;
}

const StageBadge: React.FC<StageBadgeProps> = ({ stage, withIcon = true }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_BADGE_CLASS[stage]}`}
    data-testid={stage === 'SUPER_EMPLOYEE' ? 'super-employee-badge' : undefined}
  >
    {withIcon && stage === 'SUPER_EMPLOYEE' && (
      <span aria-hidden="true">⭐</span>
    )}
    {SUPER_EMPLOYEE_STAGE_LABEL_TH[stage]}
  </span>
);

interface AvatarProps {
  name: string;
  avatarUrl: string | null;
  size?: 'sm' | 'md';
}

const Avatar: React.FC<AvatarProps> = ({ name, avatarUrl, size = 'md' }) => {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

  const sizeClass = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClass} rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} flex items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700`}
    >
      {initials}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Skeleton row
// ─────────────────────────────────────────────────────────────

const SkeletonRow: React.FC = () => (
  <div className="flex animate-pulse items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
    <div className="h-10 w-10 rounded-full bg-gray-200" />
    <div className="flex-1 space-y-2">
      <div className="h-4 w-1/3 rounded bg-gray-200" />
      <div className="h-3 w-1/4 rounded bg-gray-100" />
    </div>
    <div className="h-5 w-20 rounded-full bg-gray-200" />
  </div>
);

// ─────────────────────────────────────────────────────────────
// Employee row card
// ─────────────────────────────────────────────────────────────

interface EmployeeRowProps {
  employee: Employee;
  employeeSkills: string[]; // skill names for this employee
  onSelect?: (employee: Employee) => void;
}

const EmployeeRow: React.FC<EmployeeRowProps> = ({ employee, employeeSkills, onSelect }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md"
      data-testid="employee-card"
    >
      <button
        type="button"
        className="flex w-full items-center gap-4 p-4 text-left"
        onClick={() => {
          setExpanded((prev) => !prev);
          onSelect?.(employee);
        }}
        aria-expanded={expanded}
      >
        {/* Avatar */}
        <Avatar name={employee.name} avatarUrl={employee.avatarUrl} />

        {/* Name + department */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">
            {employee.name}
          </p>
          <p className="truncate text-xs text-gray-500">
            {employee.department ?? employee.role}
          </p>
        </div>

        {/* SuperEmployee badge */}
        <StageBadge stage={employee.superEmployeeStage} />

        {/* Inactive indicator */}
        {!employee.isActive && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-500">
            ไม่ active
          </span>
        )}

        {/* Expand chevron */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Expanded: skill tags + progress card */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
          {/* Skill tags */}
          {employeeSkills.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {employeeSkills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}

          {/* Super Employee progress card */}
          <SuperEmployeeProgressCard
            employee={employee}
            className="mt-2"
          />
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export const PeopleDirectory: React.FC<PeopleDirectoryProps> = ({
  orgId,
  onSelectEmployee,
}) => {
  // ── store ──────────────────────────────────────────────────
  const employees = usePeopleStore((s) => s.employees);
  const skills = usePeopleStore((s) => s.skills);
  const filters = usePeopleStore((s) => s.filters);
  const loadingEmployees = usePeopleStore((s) => s.loadingEmployees);
  const loadingSkills = usePeopleStore((s) => s.loadingSkills);
  const fetchEmployees = usePeopleStore((s) => s.loadEmployees);
  const fetchSkills = usePeopleStore((s) => s.loadSkills);
  const setFilters = usePeopleStore((s) => s.setFilters);
  const getFilteredEmployees = usePeopleStore((s) => s.getFilteredEmployees);
  const employeeSkillsByEmployee = usePeopleStore((s) => s.employeeSkillsByEmployee);

  // ── local filter state (skill filter — not in EmployeeFilters) ──────────
  const [skillFilter, setSkillFilter] = useState<string>('ALL');

  // ── initial data load ──────────────────────────────────────
  useEffect(() => {
    fetchEmployees(orgId);
    fetchSkills(orgId);
  }, [orgId]);

  // ── derived data ───────────────────────────────────────────
  const filteredByStore = useMemo(() => getFilteredEmployees(), [
    employees,
    filters,
  ]);

  const filteredEmployees = useMemo(() => {
    if (skillFilter === 'ALL') return filteredByStore;

    return filteredByStore.filter((emp) => {
      const empSkills = employeeSkillsByEmployee[emp.id] ?? [];
      return empSkills.some((es) => es.skillId === skillFilter);
    });
  }, [filteredByStore, skillFilter, employeeSkillsByEmployee]);

  const isLoading = loadingEmployees || loadingSkills;

  // ── skill name lookup ──────────────────────────────────────
  const skillById = useMemo<Record<string, Skill>>(
    () => Object.fromEntries(skills.map((sk) => [sk.id, sk])),
    [skills],
  );

  function getSkillNames(employeeId: string): string[] {
    return (employeeSkillsByEmployee[employeeId] ?? [])
      .map((es) => skillById[es.skillId]?.name)
      .filter(Boolean) as string[];
  }

  // ── super employee count ────────────────────────────────────
  const superCount = useMemo(
    () => filteredEmployees.filter((e) => e.superEmployeeStage === 'SUPER_EMPLOYEE').length,
    [filteredEmployees],
  );

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-5" data-testid="people-directory">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">ทีมงาน</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {isLoading
              ? 'กำลังโหลด…'
              : `${filteredEmployees.length} คน${superCount > 0 ? ` · ⭐ ${superCount} Super Employee` : ''}`}
          </p>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative min-w-[200px] flex-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            placeholder="ค้นหาชื่อพนักงาน…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            aria-label="ค้นหาพนักงาน"
          />
        </div>

        {/* Stage filter */}
        <select
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={filters.superEmployeeStage}
          onChange={(e) =>
            setFilters({
              superEmployeeStage: e.target.value as SuperEmployeeStage | 'ALL',
            })
          }
          aria-label="กรองตาม Stage"
        >
          <option value="ALL">ทุก Stage</option>
          {ALL_STAGES.map((s) => (
            <option key={s} value={s}>
              {SUPER_EMPLOYEE_STAGE_LABEL_TH[s]}
            </option>
          ))}
        </select>

        {/* Skill filter */}
        <select
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={skillFilter}
          onChange={(e) => setSkillFilter(e.target.value)}
          aria-label="กรองตามทักษะ"
        >
          <option value="ALL">ทุกทักษะ</option>
          {skills.map((sk) => (
            <option key={sk.id} value={sk.id}>
              {sk.name}
            </option>
          ))}
        </select>

        {/* Reset filters */}
        {(filters.search !== '' ||
          filters.superEmployeeStage !== 'ALL' ||
          skillFilter !== 'ALL') && (
          <button
            type="button"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
            onClick={() => {
              setFilters(DEFAULT_EMPLOYEE_FILTERS);
              setSkillFilter('ALL');
            }}
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* ── List ── */}
      {isLoading ? (
        <div className="space-y-3" aria-label="กำลังโหลด">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400">
          <p className="font-medium">ไม่พบพนักงานที่ตรงกับเงื่อนไข</p>
          <p className="mt-1 text-xs">ลองเปลี่ยนตัวกรองหรือล้างการค้นหา</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEmployees.map((emp) => (
            <EmployeeRow
              key={emp.id}
              employee={emp}
              employeeSkills={getSkillNames(emp.id)}
              onSelect={onSelectEmployee}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PeopleDirectory;
