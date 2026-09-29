'use client';

import React, { useState } from 'react';
import { Employee, AiStage } from './types';

// ─────────────────────────────────────────────────────────────
// Stage Configuration
// ─────────────────────────────────────────────────────────────

interface StageConfig {
  stage: AiStage;
  label: string;
  description: string;
  percentage: number;
  icon: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  ringColor: string;
}

const STAGE_CONFIGS: StageConfig[] = [
  {
    stage: 'AI_UNAWARE',
    label: 'ยังไม่รู้จัก AI',
    description: 'พนักงานยังไม่ได้ใช้หรือรู้จักเครื่องมือ AI ในบริบทการทำงาน',
    percentage: 0,
    icon: '🌱',
    textColor: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-300',
    ringColor: 'ring-gray-300',
  },
  {
    stage: 'AI_AWARE',
    label: 'รู้จัก AI',
    description: 'รู้จักและใช้งาน AI พื้นฐานได้ มีความเข้าใจในความสามารถของ AI',
    percentage: 25,
    icon: '👀',
    textColor: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-300',
    ringColor: 'ring-yellow-300',
  },
  {
    stage: 'AI_ASSISTED',
    label: 'ใช้ AI ช่วยงาน',
    description: 'ใช้ AI ช่วยเพิ่มประสิทธิภาพในงานประจำวันได้อย่างสม่ำเสมอ',
    percentage: 50,
    icon: '🤝',
    textColor: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    ringColor: 'ring-blue-300',
  },
  {
    stage: 'AI_PARTNER',
    label: 'คู่คิด AI',
    description: 'ทำงานร่วมกับ AI อย่างลื่นไหล ออกแบบ workflow และ prompt ได้เอง',
    percentage: 75,
    icon: '🚀',
    textColor: 'text-indigo-700',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-300',
    ringColor: 'ring-indigo-300',
  },
  {
    stage: 'SUPER_EMPLOYEE',
    label: 'Super Employee',
    description: 'ผสานทักษะมนุษย์และ AI ได้อย่างสมบูรณ์ เป็นต้นแบบและโค้ชให้ทีม',
    percentage: 100,
    icon: '⭐',
    textColor: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-400',
    ringColor: 'ring-purple-400',
  },
];

const STAGE_ORDER: AiStage[] = [
  'AI_UNAWARE',
  'AI_AWARE',
  'AI_ASSISTED',
  'AI_PARTNER',
  'SUPER_EMPLOYEE',
];

function getStageIndex(stage: AiStage): number {
  return STAGE_ORDER.indexOf(stage);
}

function getConfig(stage: AiStage): StageConfig {
  return STAGE_CONFIGS.find((c) => c.stage === stage) ?? STAGE_CONFIGS[0];
}

function buildProgressGradient(percentage: number): string {
  if (percentage === 0) return '#d1d5db';
  if (percentage <= 25) return 'linear-gradient(90deg, #d1d5db 0%, #eab308 100%)';
  if (percentage <= 50) return 'linear-gradient(90deg, #eab308 0%, #3b82f6 100%)';
  if (percentage <= 75) return 'linear-gradient(90deg, #3b82f6 0%, #6366f1 100%)';
  return 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)';
}

// ─────────────────────────────────────────────────────────────
// DB Trigger Flow Panel
// ─────────────────────────────────────────────────────────────

interface TriggerFlowPanelProps {
  currentStage: AiStage;
  employeeId: string;
}

const TriggerFlowPanel: React.FC<TriggerFlowPanelProps> = ({ currentStage, employeeId }) => {
  const currentIndex = getStageIndex(currentStage);
  const nextStage =
    currentIndex < STAGE_ORDER.length - 1 ? STAGE_ORDER[currentIndex + 1] : null;
  const shortId = employeeId.substring(0, 8);

  return (
    <div className="rounded-lg bg-slate-900 p-4 font-mono text-xs text-slate-300 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          DB Trigger — validate_stage_progression()
        </p>
        <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">
          BEFORE UPDATE
        </span>
      </div>

      {/* Step 1 */}
      <div className="flex gap-2.5">
        <span className="mt-0.5 shrink-0 text-indigo-400">①</span>
        <div>
          <span className="text-yellow-300">SELECT ... FOR UPDATE</span>
          <span className="text-slate-400"> — lock row (prevent race condition)</span>
          <br />
          <span className="text-slate-500">WHERE employees.id = </span>
          <span className="text-green-400">'{shortId}...'</span>
        </div>
      </div>

      {/* Step 2 */}
      <div className="flex gap-2.5">
        <span className="mt-0.5 shrink-0 text-indigo-400">②</span>
        <div>
          <span className="text-yellow-300">array_position</span>
          <span className="text-slate-400">(stages[], NEW.ai_stage)</span>
          <br />
          <span className="text-slate-300">&gt; </span>
          <span className="text-yellow-300">array_position</span>
          <span className="text-slate-400">(stages[], OLD.ai_stage)</span>
          <br />
          <span className="text-slate-500">— enforce forward-only progression</span>
          <br />
          <span className="text-slate-500">— RAISE EXCEPTION if backward/same</span>
        </div>
      </div>

      {/* Step 3 */}
      <div className="flex gap-2.5">
        <span className="mt-0.5 shrink-0 text-indigo-400">③</span>
        <div>
          <span className="text-yellow-300">UPDATE employees</span>
          <span className="text-slate-400"> SET ai_stage = </span>
          {nextStage ? (
            <span className="text-green-400">'{nextStage}'</span>
          ) : (
            <span className="text-purple-400">'{currentStage}'</span>
          )}
          {!nextStage && (
            <>
              <br />
              <span className="text-slate-500">— already at maximum stage</span>
            </>
          )}
        </div>
      </div>

      {/* Step 4 */}
      <div className="flex gap-2.5">
        <span className="mt-0.5 shrink-0 text-indigo-400">④</span>
        <div>
          <span className="text-yellow-300">INSERT INTO super_employee_progress</span>
          <br />
          <span className="text-slate-400">(employee_id, from_stage, to_stage,</span>
          <br />
          <span className="text-slate-400">&nbsp;validated_at, validated_by)</span>
          <br />
          <span className="text-slate-500">— immutable milestone + audit trail</span>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-700 pt-2 text-[10px] text-slate-500 font-sans space-y-0.5">
        <p>SECURITY: SECURITY DEFINER (runs as table owner)</p>
        <p>CONSTRAINT: UNIQUE (employee_id, to_stage) — prevents duplicate milestones</p>
        <p>IMMUTABILITY: deny_immutable_table() trigger on super_employee_progress</p>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Stage Stepper
// ─────────────────────────────────────────────────────────────

interface StageStepperProps {
  currentStage: AiStage;
}

const StageStepper: React.FC<StageStepperProps> = ({ currentStage }) => {
  const currentIndex = getStageIndex(currentStage);

  return (
    <div className="flex items-start justify-between gap-1">
      {STAGE_CONFIGS.map((config, idx) => {
        const isCompleted = idx < currentIndex;
        const isCurrent = idx === currentIndex;
        const isFuture = idx > currentIndex;

        return (
          <div key={config.stage} className="flex min-w-0 flex-1 flex-col items-center">
            {/* Connector line (left side except first) */}
            <div className="relative flex w-full items-center justify-center">
              {idx > 0 && (
                <div
                  className={`absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 ${
                    isCompleted || isCurrent ? 'bg-indigo-400' : 'bg-gray-200'
                  }`}
                />
              )}

              {/* Step circle */}
              <div
                className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all
                  ${isCompleted ? 'bg-indigo-600 text-white shadow-sm' : ''}
                  ${isCurrent ? `${config.bgColor} border-2 ${config.borderColor} shadow-md` : ''}
                  ${isFuture ? 'bg-gray-100 border border-gray-200' : ''}
                `}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <span className={isFuture ? 'grayscale opacity-40' : ''}>
                    {config.icon}
                  </span>
                )}
              </div>
            </div>

            {/* Stage label */}
            <p
              className={`mt-1.5 text-center text-[10px] font-medium leading-tight
                ${isCurrent ? config.textColor : isFuture ? 'text-gray-300' : 'text-indigo-600'}
              `}
            >
              {config.label}
            </p>

            {/* Percentage */}
            <p className={`mt-0.5 text-[9px] ${isFuture ? 'text-gray-300' : 'text-gray-400'}`}>
              {config.percentage}%
            </p>
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main: SuperEmployeeProgressCard
// ─────────────────────────────────────────────────────────────

interface SuperEmployeeProgressCardProps {
  /** Employee record from peopleStore */
  employee: Employee;
  /** Show trigger flow panel by default (default: false) */
  defaultShowTrigger?: boolean;
  className?: string;
}

export const SuperEmployeeProgressCard: React.FC<SuperEmployeeProgressCardProps> = ({
  employee,
  defaultShowTrigger = false,
  className = '',
}) => {
  const [triggerOpen, setTriggerOpen] = useState(defaultShowTrigger);

  const currentStage = employee.superEmployeeStage;
  const config = getConfig(currentStage);
  const fillPercentage = config.percentage;
  const isMaxStage = currentStage === 'SUPER_EMPLOYEE';

  return (
    <div
      className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ${className}`}
    >
      {/* ── Card Header ── */}
      <div className={`border-b px-4 py-3 ${config.bgColor} ${config.borderColor}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{config.icon}</span>
            <div>
              <p className="text-xs font-medium text-gray-500">AI Stage Progression</p>
              <p className={`text-sm font-bold ${config.textColor}`}>{config.label}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-black ${config.textColor}`}>{fillPercentage}%</p>
            {isMaxStage && (
              <p className="text-xs font-medium text-purple-600">สูงสุด 🎉</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* ── Progress Bar ── */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[10px] text-gray-400">
            <span>เริ่มต้น</span>
            <span>Super Employee</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.max(fillPercentage, 2)}%`,
                background: buildProgressGradient(fillPercentage),
              }}
            />
          </div>
        </div>

        {/* ── Stage Stepper ── */}
        <StageStepper currentStage={currentStage} />

        {/* ── Current Stage Description ── */}
        <div
          className={`rounded-lg border px-3 py-2.5 ${config.bgColor} ${config.borderColor}`}
        >
          <p className={`mb-0.5 text-xs font-semibold ${config.textColor}`}>สถานะปัจจุบัน</p>
          <p className="text-xs text-gray-600">{config.description}</p>
        </div>

        {/* ── Employee Info ── */}
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span className="font-medium text-gray-700">
            {employee.name}
          </span>
          {employee.employeeCode && (
            <span className="rounded border border-gray-100 bg-gray-50 px-2 py-0.5 font-mono">
              {employee.employeeCode}
            </span>
          )}
        </div>

        {/* ── Next Stage hint ── */}
        {!isMaxStage && (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="font-medium">ขั้นต่อไป: </span>
            {getConfig(STAGE_ORDER[getStageIndex(currentStage) + 1]).label}
            {' · '}
            {getConfig(STAGE_ORDER[getStageIndex(currentStage) + 1]).description}
          </div>
        )}

        {/* ── DB Trigger Flow Toggle ── */}
        <button
          onClick={() => setTriggerOpen((prev) => !prev)}
          className="flex w-full items-center justify-between border-t border-gray-100 pt-3 text-xs font-medium text-gray-500 transition-colors hover:text-indigo-600"
        >
          <span>ดู DB Trigger Flow (validate_stage_progression)</span>
          <svg
            className={`h-4 w-4 transition-transform ${triggerOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* ── Trigger Flow Panel ── */}
        {triggerOpen && (
          <TriggerFlowPanel currentStage={currentStage} employeeId={employee.id} />
        )}
      </div>
    </div>
  );
};

export default SuperEmployeeProgressCard;
