'use client';

/**
 * PsSurveyForm.tsx
 * MONOLITH v16.0 — Culture Module
 *
 * Anonymous Psychological Safety survey submission form.
 *
 * ANONYMITY GUARANTEE:
 *  • No user_id is included in the submitted payload.
 *  • The anonymous_token is generated client-side via crypto.randomUUID()
 *    and stored ONLY in localStorage — never linked to user identity on the server.
 *  • The DB schema enforces anonymity at the column level (no user_id column).
 *
 * Scale: Likert 1–7 (Edmondson, 1999) — adapted for Thai manufacturing context.
 * Context: High Power Distance Thai manufacturing (DAPH Decor, MONOLITH v16.0)
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  useCultureStore,
  selectActiveSurvey,
  selectCurrentPeriodLabel,
} from './cultureStore';
import type {
  PsSurveyQuestion,
  PsSurveyAnswer,
  PsDimension,
} from './types';
import {
  PS_SCALE_MIN,
  PS_SCALE_MAX,
} from './types';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const LIKERT_LABELS: Record<number, string> = {
  1: 'ไม่เห็นด้วยอย่างยิ่ง',
  2: 'ไม่เห็นด้วย',
  3: 'ไม่ค่อยเห็นด้วย',
  4: 'เป็นกลาง',
  5: 'ค่อนข้างเห็นด้วย',
  6: 'เห็นด้วย',
  7: 'เห็นด้วยอย่างยิ่ง',
};

const DIMENSION_LABELS: Record<PsDimension, string> = {
  SPEAK_UP:     'พูดออกมาได้',
  HELP_SEEKING: 'ขอความช่วยเหลือ',
  RISK_TAKING:  'กล้าลองสิ่งใหม่',
  INCLUSION:    'การยอมรับความต่าง',
};

const DIMENSION_COLORS: Record<PsDimension, { bg: string; text: string; border: string }> = {
  SPEAK_UP:     { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  HELP_SEEKING: { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  RISK_TAKING:  { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  INCLUSION:    { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
};

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

interface LikertScaleProps {
  questionId: string;
  value: number | null;
  onChange: (value: number) => void;
  disabled: boolean;
}

const LikertScale: React.FC<LikertScaleProps> = ({
  questionId,
  value,
  onChange,
  disabled,
}) => {
  const scale = Array.from(
    { length: PS_SCALE_MAX - PS_SCALE_MIN + 1 },
    (_, i) => i + PS_SCALE_MIN
  );

  return (
    <div className="mt-3 space-y-2">
      {/* Scale labels (endpoints) */}
      <div className="flex items-center justify-between text-[11px] text-gray-400 px-1">
        <span>{LIKERT_LABELS[1]}</span>
        <span>{LIKERT_LABELS[7]}</span>
      </div>

      {/* Radio buttons row */}
      <div className="flex items-center justify-between gap-1">
        {scale.map((num) => {
          const isSelected = value === num;
          return (
            <button
              key={num}
              type="button"
              disabled={disabled}
              onClick={() => onChange(num)}
              aria-label={`${num} — ${LIKERT_LABELS[num]}`}
              aria-pressed={isSelected}
              className={[
                'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full',
                'text-sm font-semibold transition-all duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                isSelected
                  ? 'bg-indigo-600 text-white shadow-md scale-110'
                  : 'bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-700',
              ].join(' ')}
            >
              {num}
            </button>
          );
        })}
      </div>

      {/* Selected label */}
      <div className="h-5 text-center text-[11px] font-medium text-indigo-600">
        {value !== null ? LIKERT_LABELS[value] : ''}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────

interface QuestionCardProps {
  question: PsSurveyQuestion;
  index: number;
  total: number;
  value: number | null;
  onChange: (questionId: string, value: number) => void;
  disabled: boolean;
}

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  index,
  total,
  value,
  onChange,
  disabled,
}) => {
  const dimColors = DIMENSION_COLORS[question.dimension];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Question number */}
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
            {index + 1}
          </span>
          {/* Dimension badge */}
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide
              ${dimColors.bg} ${dimColors.text} ${dimColors.border}`}
          >
            {DIMENSION_LABELS[question.dimension]}
          </span>
        </div>
        {/* Reverse-scored indicator */}
        {question.reverse_scored && (
          <span className="shrink-0 rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[9px] font-medium text-orange-600">
            คำถามย้อนกลับ
          </span>
        )}
      </div>

      {/* Question text */}
      <p className="mb-1 text-sm font-medium leading-relaxed text-gray-800">
        {question.text_th}
      </p>
      <p className="mb-2 text-[11px] text-gray-400 italic">
        {question.text_en}
      </p>

      {/* Likert scale */}
      <LikertScale
        questionId={question.id}
        value={value}
        onChange={(v) => onChange(question.id, v)}
        disabled={disabled}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Progress Indicator
// ─────────────────────────────────────────────────────────────

interface SurveyProgressProps {
  answered: number;
  total: number;
}

const SurveyProgress: React.FC<SurveyProgressProps> = ({ answered, total }) => {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  const isComplete = answered === total;

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">
          ตอบแล้ว {answered}/{total} ข้อ
        </span>
        <span
          className={`text-xs font-semibold ${
            isComplete ? 'text-green-600' : 'text-indigo-600'
          }`}
        >
          {pct}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isComplete ? 'bg-green-500' : 'bg-indigo-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isComplete && (
        <p className="mt-1.5 text-center text-[11px] font-medium text-green-600">
          ✓ ตอบครบทุกข้อแล้ว พร้อมส่ง
        </p>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Anonymity Notice Banner
// ─────────────────────────────────────────────────────────────

const AnonymityNotice: React.FC = () => (
  <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4">
    <span className="mt-0.5 text-xl shrink-0" aria-hidden="true">🔒</span>
    <div className="space-y-1">
      <p className="text-sm font-semibold text-teal-800">
        คำตอบของคุณเป็นความลับและไม่ระบุตัวตน
      </p>
      <p className="text-xs leading-relaxed text-teal-700">
        ระบบ MONOLITH ไม่บันทึก ID ผู้ใช้งานใดๆ ลงในคำตอบของแบบสำรวจนี้
        ข้อมูลจะถูกรวบรวมเป็นคะแนน Psychological Safety รายทีมเท่านั้น
        ไม่สามารถย้อนกลับมาระบุตัวคุณได้
      </p>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Already Submitted State
// ─────────────────────────────────────────────────────────────

interface AlreadySubmittedProps {
  periodLabel: string;
}

const AlreadySubmitted: React.FC<AlreadySubmittedProps> = ({ periodLabel }) => (
  <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
    <div className="mb-3 text-4xl">✅</div>
    <p className="mb-1 text-base font-bold text-green-800">
      ส่งแบบสำรวจแล้ว
    </p>
    <p className="text-sm text-green-700">
      คุณได้ส่งแบบประเมินสำหรับรอบ{' '}
      <span className="font-semibold">{periodLabel}</span> แล้ว
    </p>
    <p className="mt-2 text-xs text-green-600">
      ผลจะถูกรวบรวมเป็นคะแนนทีมเมื่อครบตามจำนวนผู้ตอบขั้นต่ำ
    </p>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Success State
// ─────────────────────────────────────────────────────────────

const SubmitSuccess: React.FC = () => (
  <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-6 text-center">
    <div className="mb-3 text-4xl">🎉</div>
    <p className="mb-1 text-base font-bold text-indigo-800">
      ขอบคุณสำหรับคำตอบของคุณ
    </p>
    <p className="text-sm text-indigo-700">
      คำตอบถูกส่งเรียบร้อยแล้วโดยไม่ระบุตัวตน
    </p>
    <p className="mt-2 text-xs text-indigo-600">
      ผลสำรวจจะถูกรวบรวมและแสดงบน Culture Dashboard เมื่อมีผู้ตอบครบ 3 คนขึ้นไป
    </p>
  </div>
);

// ─────────────────────────────────────────────────────────────
// No Active Survey State
// ─────────────────────────────────────────────────────────────

const NoActiveSurvey: React.FC = () => (
  <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
    <div className="mb-3 text-4xl">📋</div>
    <p className="mb-1 text-sm font-semibold text-gray-700">
      ไม่มีแบบสำรวจที่เปิดอยู่ในขณะนี้
    </p>
    <p className="text-xs text-gray-500">
      โปรดรอการแจ้งเตือนจากผู้ดูแลระบบเมื่อมีการเปิดแบบสำรวจรอบใหม่
    </p>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Main: PsSurveyForm
// ─────────────────────────────────────────────────────────────

interface PsSurveyFormProps {
  /** Org ID for scoped submission (required for multi-tenant isolation) */
  orgId: string;
  /** Optional callback after successful submission */
  onSuccess?: () => void;
  className?: string;
}

export const PsSurveyForm: React.FC<PsSurveyFormProps> = ({
  orgId,
  onSuccess,
  className = '',
}) => {
  // ── Store ──────────────────────────────────────────────────
  const activeSurvey         = useCultureStore(selectActiveSurvey);
  const periodLabel          = useCultureStore(selectCurrentPeriodLabel);
  const submittingResponse   = useCultureStore((s) => s.submittingResponse);
  const storeError           = useCultureStore((s) => s.error);
  const submitSurveyResponse = useCultureStore((s) => s.submitSurveyResponse);
  const hasSubmittedThisPeriod = useCultureStore((s) => s.hasSubmittedThisPeriod);
  const getOrCreateAnonymousToken = useCultureStore((s) => s.getOrCreateAnonymousToken);

  // ── Local State ────────────────────────────────────────────
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  // ── Derived ────────────────────────────────────────────────
  const questions = useMemo(
    () => activeSurvey?.questions ?? [],
    [activeSurvey]
  );

  const answeredCount = useMemo(
    () => Object.keys(answers).length,
    [answers]
  );

  const isComplete = answeredCount === questions.length && questions.length > 0;

  const alreadySubmitted = useMemo(() => {
    if (!activeSurvey || !periodLabel) return false;
    return hasSubmittedThisPeriod(activeSurvey.id, periodLabel);
  }, [activeSurvey, periodLabel, hasSubmittedThisPeriod]);

  // ── Handlers ───────────────────────────────────────────────
  const handleAnswer = useCallback((questionId: string, value: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!activeSurvey || !periodLabel || !isComplete || submittingResponse) return;

    const answerArray: PsSurveyAnswer[] = questions.map((q) => ({
      questionId: q.id,
      value: answers[q.id],
    }));

    // Get or create anonymous token (stored in localStorage only)
    const anonymousToken = getOrCreateAnonymousToken(activeSurvey.id, periodLabel);

    const success = await submitSurveyResponse(orgId, {
      surveyId:       activeSurvey.id,
      periodLabel,
      answers:        answerArray,
      anonymousToken,
    });

    if (success) {
      setSubmitted(true);
      onSuccess?.();
    }
  }, [
    activeSurvey,
    periodLabel,
    isComplete,
    submittingResponse,
    questions,
    answers,
    getOrCreateAnonymousToken,
    submitSurveyResponse,
    orgId,
    onSuccess,
  ]);

  // ── Render guard: no active survey ─────────────────────────
  if (!activeSurvey) {
    return (
      <div className={className}>
        <NoActiveSurvey />
      </div>
    );
  }

  // ── Render guard: already submitted this period ────────────
  if (alreadySubmitted && periodLabel) {
    return (
      <div className={className}>
        <AlreadySubmitted periodLabel={periodLabel} />
      </div>
    );
  }

  // ── Render guard: just submitted ──────────────────────────
  if (submitted) {
    return (
      <div className={className}>
        <SubmitSuccess />
      </div>
    );
  }

  // ── Main Form ─────────────────────────────────────────────
  return (
    <div className={`space-y-4 ${className}`}>
      {/* ── Survey Header ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              แบบประเมิน Psychological Safety
            </p>
            <h2 className="mt-0.5 text-base font-bold text-gray-900 leading-snug">
              {activeSurvey.title}
            </h2>
            {activeSurvey.description && (
              <p className="mt-1 text-xs text-gray-500">{activeSurvey.description}</p>
            )}
          </div>
          {periodLabel && (
            <div className="shrink-0 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-center">
              <p className="text-[9px] font-medium uppercase tracking-wide text-indigo-500">รอบ</p>
              <p className="text-xs font-bold text-indigo-700">{periodLabel}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Anonymity Notice ── */}
      <AnonymityNotice />

      {/* ── Progress ── */}
      <SurveyProgress answered={answeredCount} total={questions.length} />

      {/* ── Question Cards ── */}
      <div className="space-y-3">
        {questions.map((question, idx) => (
          <QuestionCard
            key={question.id}
            question={question}
            index={idx}
            total={questions.length}
            value={answers[question.id] ?? null}
            onChange={handleAnswer}
            disabled={submittingResponse}
          />
        ))}
      </div>

      {/* ── Error Message ── */}
      {storeError && !submittingResponse && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700">เกิดข้อผิดพลาด</p>
          <p className="mt-0.5 text-xs text-red-600">{storeError}</p>
        </div>
      )}

      {/* ── Submit Button ── */}
      <div className="pb-2">
        <button
          type="button"
          disabled={!isComplete || submittingResponse}
          onClick={handleSubmit}
          className={[
            'w-full rounded-xl px-6 py-3.5 text-sm font-bold',
            'transition-all duration-200 focus-visible:outline-none',
            'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
            isComplete && !submittingResponse
              ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700 active:scale-[0.98]'
              : 'cursor-not-allowed bg-gray-200 text-gray-400',
          ].join(' ')}
        >
          {submittingResponse ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-4 w-4 animate-spin text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              กำลังส่ง...
            </span>
          ) : isComplete ? (
            '🔒 ส่งแบบสำรวจแบบไม่ระบุตัวตน'
          ) : (
            `กรุณาตอบให้ครบทุกข้อ (${answeredCount}/${questions.length})`
          )}
        </button>

        <p className="mt-2 text-center text-[10px] text-gray-400">
          คำตอบจะถูกส่งโดยไม่มีข้อมูลผู้ใช้งานแนบไป • ปลอดภัย 100%
        </p>
      </div>
    </div>
  );
};

export default PsSurveyForm;
