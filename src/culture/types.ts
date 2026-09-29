// =============================================================================
// src/culture/types.ts
// MONOLITH v16.0 — Culture Module: Psychological Safety Types
// Evidence basis: SLR Culture dimension 85% weight
// Context: High Power Distance Thai manufacturing (DAPH Decor)
// Scale: Likert 1–7 (Amy Edmondson, 1999)
// ANONYMITY GUARANTEE: No user_id stored anywhere in this module's DB tables
// =============================================================================

// ============================================================
// CONSTANTS
// ============================================================

/** Thai manufacturing industry PS benchmark score (SLR-derived, normalized 0–100) */
export const THAI_MANUFACTURING_PS_BENCHMARK = 55;

/** Minimum responses required before PS score is computed (privacy threshold) */
export const PS_MINIMUM_RESPONSE_COUNT = 3;

/** Likert scale lower bound */
export const PS_SCALE_MIN = 1;

/** Likert scale upper bound */
export const PS_SCALE_MAX = 7;

// ============================================================
// UNION TYPES / ENUMS
// ============================================================

/**
 * Four dimensions of Psychological Safety (Edmondson 1999)
 * mapped to Thai manufacturing context.
 */
export type PsDimension =
  | 'SPEAK_UP'
  | 'HELP_SEEKING'
  | 'RISK_TAKING'
  | 'INCLUSION';

/** Category for anonymous feedback submissions */
export type FeedbackCategory =
  | 'SAFETY'
  | 'PROCESS'
  | 'MANAGEMENT'
  | 'ENVIRONMENT'
  | 'OTHER';

/** Sentiment polarity for anonymous feedback */
export type FeedbackSentiment =
  | 'POSITIVE'
  | 'NEGATIVE'
  | 'NEUTRAL';

/** Lifecycle status of a PS survey template */
export type SurveyStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'CLOSED'
  | 'ARCHIVED';

/** Period granularity for PS scoring */
export type PeriodType =
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'ANNUALLY';

/**
 * Thai-language labels for PS score bands.
 * Thresholds: <30 ต่ำมาก | <45 ต่ำ | <60 ปานกลาง | <75 ดี | ≥75 ดีมาก
 */
export type PsScoreLabel =
  | 'ต่ำมาก'
  | 'ต่ำ'
  | 'ปานกลาง'
  | 'ดี'
  | 'ดีมาก';

/** Lifecycle status for anonymous feedback items */
export type FeedbackActionStatus =
  | 'PENDING'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'DISMISSED';

// ============================================================
// SURVEY QUESTION
// ============================================================

export interface PsSurveyQuestion {
  /** Stable unique identifier e.g. 'ps_q1' */
  id: string;
  /** Which PS dimension this question measures */
  dimension: PsDimension;
  /** Thai text (primary display language) */
  text_th: string;
  /** English text (secondary / admin reference) */
  text_en: string;
  /**
   * If true, scoring is reversed: scored = MAX + MIN - raw_value.
   * Used for negatively-worded items (e.g. "จะถูกตำหนิ").
   */
  reverse_scored: boolean;
  /** Relative weight when computing dimension averages. Default 1.0. */
  weight: number;
}

/**
 * 7-item Psychological Safety scale (Edmondson, 1999)
 * adapted for Thai manufacturing / High Power Distance context.
 */
export const DEFAULT_PS_QUESTIONS: PsSurveyQuestion[] = [
  {
    id: 'ps_q1',
    dimension: 'SPEAK_UP',
    text_th: 'หากคุณทำผิดพลาดในทีมนี้ จะถูกตำหนิหรือถูกมองในแง่ลบ',
    text_en: 'If you make a mistake in this team, it is often held against you.',
    reverse_scored: true,
    weight: 1.0,
  },
  {
    id: 'ps_q2',
    dimension: 'SPEAK_UP',
    text_th: 'สมาชิกในทีมสามารถพูดถึงปัญหาและเรื่องยากๆ ได้อย่างตรงไปตรงมา',
    text_en: 'Members of this team can bring up problems and tough issues.',
    reverse_scored: false,
    weight: 1.0,
  },
  {
    id: 'ps_q3',
    dimension: 'INCLUSION',
    text_th: 'บางครั้งสมาชิกในทีมปฏิเสธหรือกีดกันผู้อื่นเพราะมีความแตกต่าง',
    text_en: 'People in this team sometimes reject others for being different.',
    reverse_scored: true,
    weight: 1.0,
  },
  {
    id: 'ps_q4',
    dimension: 'RISK_TAKING',
    text_th: 'ในทีมนี้ ปลอดภัยที่จะลองทำสิ่งใหม่หรือรับความเสี่ยง',
    text_en: 'It is safe to take a risk on this team.',
    reverse_scored: false,
    weight: 1.0,
  },
  {
    id: 'ps_q5',
    dimension: 'HELP_SEEKING',
    text_th: 'รู้สึกยากที่จะขอความช่วยเหลือจากสมาชิกคนอื่นในทีมนี้',
    text_en: 'It is difficult to ask other members of this team for help.',
    reverse_scored: true,
    weight: 1.0,
  },
  {
    id: 'ps_q6',
    dimension: 'INCLUSION',
    text_th: 'ไม่มีใครในทีมจะจงใจทำสิ่งที่ขัดขวางหรือบั่นทอนความพยายามของคุณ',
    text_en: 'No one on this team would deliberately act in a way that undermines your efforts.',
    reverse_scored: false,
    weight: 1.0,
  },
  {
    id: 'ps_q7',
    dimension: 'HELP_SEEKING',
    text_th: 'ทักษะและความสามารถพิเศษของคุณได้รับการยอมรับและนำมาใช้ในทีมนี้',
    text_en: 'Your unique skills and talents are valued and utilized in this team.',
    reverse_scored: false,
    weight: 1.0,
  },
];

// ============================================================
// SURVEY TEMPLATE
// ============================================================

export interface PsSurveyTemplate {
  id: string;
  orgId: string;
  title: string;
  description: string | null;
  /** Ordered list of questions for this survey */
  questions: PsSurveyQuestion[];
  periodType: PeriodType;
  status: SurveyStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePsSurveyTemplateInput {
  title: string;
  description?: string;
  /** Defaults to DEFAULT_PS_QUESTIONS if omitted */
  questions?: PsSurveyQuestion[];
  periodType: PeriodType;
}

export interface UpdatePsSurveyTemplateInput {
  id: string;
  title?: string;
  description?: string;
  questions?: PsSurveyQuestion[];
  periodType?: PeriodType;
  status?: SurveyStatus;
}

// ============================================================
// SURVEY RESPONSE (ANONYMOUS)
// ============================================================

/** A single Likert answer for one question in the survey */
export interface PsSurveyAnswer {
  questionId: string;
  /** Raw Likert value 1–7 */
  value: number;
}

/**
 * An aggregate-safe response record.
 * IMPORTANT: No userId field — anonymity is guaranteed at schema level.
 * The anonymous_token is stored in localStorage only and never exposed here.
 */
export interface PsSurveyResponse {
  id: string;
  orgId: string;
  surveyId: string;
  periodLabel: string;
  answers: PsSurveyAnswer[];
  submittedAt: string;
}

export interface SubmitSurveyResponseInput {
  surveyId: string;
  periodLabel: string;
  answers: PsSurveyAnswer[];
  /**
   * crypto.randomUUID() generated client-side.
   * Stored in localStorage (LocalSurveyState) — never tied to user identity on server.
   * Used only for deduplication (UNIQUE constraint: survey_id + anonymous_token + period_label).
   */
  anonymousToken: string;
}

// ============================================================
// DIMENSION SCORES & PS SCORE
// ============================================================

/** Normalized 0–100 score per dimension */
export interface DimensionScores {
  SPEAK_UP: number;
  HELP_SEEKING: number;
  RISK_TAKING: number;
  INCLUSION: number;
}

export interface PsScore {
  id: string;
  orgId: string;
  surveyId: string;
  periodLabel: string;
  periodType: PeriodType;
  /** Overall normalized PS score 0–100 */
  score: number;
  dimensionScores: DimensionScores;
  /** Number of responses that contributed to this score (must be >= PS_MINIMUM_RESPONSE_COUNT) */
  responseCount: number;
  computedAt: string;
}

// ============================================================
// ANONYMOUS FEEDBACK
// ============================================================

/**
 * An anonymous feedback item.
 * IMPORTANT: No userId / submittedBy field — anonymity guaranteed at schema level.
 */
export interface AnonymousFeedback {
  id: string;
  orgId: string;
  category: FeedbackCategory;
  sentiment: FeedbackSentiment;
  /** Free-text content (min 10 chars enforced by DB CHECK) */
  content: string;
  actionStatus: FeedbackActionStatus;
  actionNote: string | null;
  actionedBy: string | null;
  actionedAt: string | null;
  createdAt: string;
}

export interface SubmitFeedbackInput {
  category: FeedbackCategory;
  sentiment: FeedbackSentiment;
  /** Minimum 10 characters (enforced by DB CHECK constraint) */
  content: string;
}

export interface ActionFeedbackInput {
  feedbackId: string;
  actionStatus: FeedbackActionStatus;
  actionNote?: string;
}

// ============================================================
// DASHBOARD METRICS
// ============================================================

export interface PsDashboardMetrics {
  currentScore: number | null;
  previousScore: number | null;
  /** Point change: currentScore - previousScore. Null if no previous period. */
  trend: number | null;
  isAboveBenchmark: boolean;
  /** currentScore - THAI_MANUFACTURING_PS_BENCHMARK. Null if no score. */
  benchmarkGap: number | null;
  dimensionScores: DimensionScores | null;
  weakestDimension: PsDimension | null;
  strongestDimension: PsDimension | null;
  responseCount: number;
  pendingFeedbackCount: number;
  lastUpdated: string | null;
}

// ============================================================
// LOCAL SURVEY STATE (localStorage only — never synced to server)
// ============================================================

/**
 * Persisted in localStorage to prevent duplicate submissions.
 * Contains the anonymous_token used for server-side dedup,
 * but is never associated with user identity on the server.
 */
export interface LocalSurveyState {
  surveyId: string;
  periodLabel: string;
  /** The anonymous_token that was sent to the server for this submission */
  anonymousToken: string;
  submittedAt: string;
}

// ============================================================
// DB ROW TYPES (Supabase snake_case — direct table shape)
// ============================================================

export interface PsSurveyTemplateRow {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  questions: PsSurveyQuestion[];
  period_type: PeriodType;
  status: SurveyStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PsSurveyResponseRow {
  id: string;
  org_id: string;
  survey_id: string;
  period_label: string;
  answers: PsSurveyAnswer[];
  anonymous_token: string;
  submitted_at: string;
  // No user_id column — schema-level anonymity
}

export interface PsScoreRow {
  id: string;
  org_id: string;
  survey_id: string;
  period_label: string;
  period_type: PeriodType;
  score: number;
  dimension_scores: DimensionScores;
  response_count: number;
  computed_at: string;
}

export interface AnonymousFeedbackRow {
  id: string;
  org_id: string;
  category: FeedbackCategory;
  sentiment: FeedbackSentiment;
  content: string;
  action_status: FeedbackActionStatus;
  action_note: string | null;
  actioned_by: string | null;
  actioned_at: string | null;
  created_at: string;
  // No user_id column — schema-level anonymity
}

// ============================================================
// MAPPERS (DB row → application type)
// ============================================================

export function mapPsSurveyTemplateRow(row: PsSurveyTemplateRow): PsSurveyTemplate {
  return {
    id: row.id,
    orgId: row.org_id,
    title: row.title,
    description: row.description,
    questions: row.questions,
    periodType: row.period_type,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPsSurveyResponseRow(row: PsSurveyResponseRow): PsSurveyResponse {
  return {
    id: row.id,
    orgId: row.org_id,
    surveyId: row.survey_id,
    periodLabel: row.period_label,
    answers: row.answers,
    submittedAt: row.submitted_at,
    // anonymous_token intentionally NOT mapped — not exposed to application state
  };
}

export function mapPsScoreRow(row: PsScoreRow): PsScore {
  return {
    id: row.id,
    orgId: row.org_id,
    surveyId: row.survey_id,
    periodLabel: row.period_label,
    periodType: row.period_type,
    score: row.score,
    dimensionScores: row.dimension_scores,
    responseCount: row.response_count,
    computedAt: row.computed_at,
  };
}

export function mapAnonymousFeedbackRow(row: AnonymousFeedbackRow): AnonymousFeedback {
  return {
    id: row.id,
    orgId: row.org_id,
    category: row.category,
    sentiment: row.sentiment,
    content: row.content,
    actionStatus: row.action_status,
    actionNote: row.action_note,
    actionedBy: row.actioned_by,
    actionedAt: row.actioned_at,
    createdAt: row.created_at,
  };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Compute a normalized PS score (0–100) and per-dimension scores
 * from an array of survey answers.
 *
 * Algorithm:
 *  1. For each answer, look up the question to get dimension + reverse_scored + weight.
 *  2. Apply reverse scoring if needed: scored = MAX + MIN - raw
 *  3. Clamp raw value to [PS_SCALE_MIN, PS_SCALE_MAX]
 *  4. Group weighted scores by dimension, compute mean per dimension
 *  5. Normalize each dimension mean to 0–100:
 *     normalized = ((mean - MIN) / (MAX - MIN)) * 100
 *  6. Overall score = average of 4 dimension scores
 *
 * Returns null if answers array is empty.
 */
export function computePsScore(
  answers: PsSurveyAnswer[],
  questions: PsSurveyQuestion[] = DEFAULT_PS_QUESTIONS
): { score: number; dimensionScores: DimensionScores } | null {
  if (answers.length === 0) return null;

  const dimensionTotals: Record<PsDimension, number[]> = {
    SPEAK_UP: [],
    HELP_SEEKING: [],
    RISK_TAKING: [],
    INCLUSION: [],
  };

  for (const answer of answers) {
    const question = questions.find((q) => q.id === answer.questionId);
    if (!question) continue;

    const raw = Math.min(PS_SCALE_MAX, Math.max(PS_SCALE_MIN, answer.value));
    const scored = question.reverse_scored
      ? PS_SCALE_MAX + PS_SCALE_MIN - raw
      : raw;

    dimensionTotals[question.dimension].push(scored * question.weight);
  }

  const normalize = (values: number[]): number => {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.round(((mean - PS_SCALE_MIN) / (PS_SCALE_MAX - PS_SCALE_MIN)) * 100);
  };

  const dimensionScores: DimensionScores = {
    SPEAK_UP:     normalize(dimensionTotals.SPEAK_UP),
    HELP_SEEKING: normalize(dimensionTotals.HELP_SEEKING),
    RISK_TAKING:  normalize(dimensionTotals.RISK_TAKING),
    INCLUSION:    normalize(dimensionTotals.INCLUSION),
  };

  const allDimScores = Object.values(dimensionScores);
  const score = Math.round(
    allDimScores.reduce((a, b) => a + b, 0) / allDimScores.length
  );

  return { score, dimensionScores };
}

/**
 * Return the Thai-language label for a given normalized PS score.
 *
 * Thresholds (calibrated to Thai manufacturing context):
 *   <30  → ต่ำมาก
 *   <45  → ต่ำ
 *   <60  → ปานกลาง
 *   <75  → ดี
 *   ≥75  → ดีมาก
 */
export function getPsScoreLabel(score: number): PsScoreLabel {
  if (score < 30) return 'ต่ำมาก';
  if (score < 45) return 'ต่ำ';
  if (score < 60) return 'ปานกลาง';
  if (score < 75) return 'ดี';
  return 'ดีมาก';
}

/**
 * Generate a period label string in Buddhist Era (พ.ศ.).
 *
 * Examples:
 *   MONTHLY    → '2568-03'
 *   QUARTERLY  → '2568-Q2'
 *   ANNUALLY   → '2568'
 */
export function generatePeriodLabel(date: Date, periodType: PeriodType): string {
  const buddhistYear = date.getFullYear() + 543;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const quarter = Math.ceil((date.getMonth() + 1) / 3);

  switch (periodType) {
    case 'MONTHLY':
      return `${buddhistYear}-${month}`;
    case 'QUARTERLY':
      return `${buddhistYear}-Q${quarter}`;
    case 'ANNUALLY':
      return `${buddhistYear}`;
  }
}

/**
 * Format a period label for Thai-locale display.
 *
 * Examples:
 *   '2568-Q2'  → 'ไตรมาส 2/2568'
 *   '2568-03'  → 'มีนาคม 2568'
 *   '2568'     → 'ปี 2568'
 */
export function formatPeriodLabel(periodLabel: string): string {
  // Quarterly: '2568-Q2'
  const quarterMatch = periodLabel.match(/^(\d{4})-Q(\d)$/);
  if (quarterMatch) {
    return `ไตรมาส ${quarterMatch[2]}/${quarterMatch[1]}`;
  }

  // Monthly: '2568-03'
  const monthMatch = periodLabel.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const thaiMonths = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
      'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
      'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
    ];
    const monthIndex = parseInt(monthMatch[2], 10) - 1;
    return `${thaiMonths[monthIndex]} ${monthMatch[1]}`;
  }

  // Annual: '2568'
  if (/^\d{4}$/.test(periodLabel)) {
    return `ปี ${periodLabel}`;
  }

  return periodLabel;
}

/**
 * Derive PsDashboardMetrics from an array of PsScore records
 * and a pending feedback count.
 *
 * Sorts by computedAt descending to identify current and previous period.
 */
export function computeDashboardMetrics(
  scores: PsScore[],
  pendingFeedbackCount: number
): PsDashboardMetrics {
  if (scores.length === 0) {
    return {
      currentScore: null,
      previousScore: null,
      trend: null,
      isAboveBenchmark: false,
      benchmarkGap: null,
      dimensionScores: null,
      weakestDimension: null,
      strongestDimension: null,
      responseCount: 0,
      pendingFeedbackCount,
      lastUpdated: null,
    };
  }

  // Sort newest first
  const sorted = [...scores].sort(
    (a, b) => new Date(b.computedAt).getTime() - new Date(a.computedAt).getTime()
  );

  const current = sorted[0];
  const previous = sorted[1] ?? null;

  const currentScore  = current.score;
  const previousScore = previous?.score ?? null;
  const trend         = previousScore !== null ? currentScore - previousScore : null;
  const benchmarkGap  = currentScore - THAI_MANUFACTURING_PS_BENCHMARK;

  const dimEntries = Object.entries(current.dimensionScores) as [PsDimension, number][];
  const weakestDimension   = dimEntries.reduce((min, cur) => cur[1] < min[1] ? cur : min)[0];
  const strongestDimension = dimEntries.reduce((max, cur) => cur[1] > max[1] ? cur : max)[0];

  return {
    currentScore,
    previousScore,
    trend,
    isAboveBenchmark: currentScore >= THAI_MANUFACTURING_PS_BENCHMARK,
    benchmarkGap,
    dimensionScores: current.dimensionScores,
    weakestDimension,
    strongestDimension,
    responseCount: current.responseCount,
    pendingFeedbackCount,
    lastUpdated: current.computedAt,
  };
}
