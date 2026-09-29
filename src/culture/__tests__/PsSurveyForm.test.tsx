/**
 * PsSurveyForm.test.tsx
 * MONOLITH v16.0 — Culture Module
 *
 * Vitest + @testing-library/react tests for PsSurveyForm.
 *
 * Coverage:
 *  • No Active Survey guard
 *  • Already-Submitted guard (hasSubmittedThisPeriod)
 *  • Submit Disabled state (partial / zero answers)
 *  • Anonymous Token Generation (getOrCreateAnonymousToken)
 *  • Submit Success flow
 *  • Error state banner
 *  • Anonymity Notice banner
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PsSurveyForm } from '../PsSurveyForm';

// ─── Hoisted mock state ───────────────────────────────────────────────────────
// vi.hoisted ensures mockState is available inside the vi.mock factory,
// which is hoisted before imports by Vitest's transform.
const { mockState } = vi.hoisted(() => {
  const mockState = {
    activeSurvey: null as any,
    periodLabel: '2568-Q2' as string,
    submittingResponse: false,
    error: null as string | null,
    submitSurveyResponse: vi.fn(),
    hasSubmittedThisPeriod: vi.fn(),
    getOrCreateAnonymousToken: vi.fn(),
  };
  return { mockState };
});

vi.mock('../cultureStore', () => ({
  useCultureStore: vi.fn((selector: any) => selector(mockState)),
  selectActiveSurvey: (s: any) => s.activeSurvey,
  selectCurrentPeriodLabel: (s: any) => s.periodLabel,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const MOCK_ORG_ID = 'org-test-001';
const MOCK_PERIOD = '2568-Q2';

const MOCK_QUESTIONS = [
  {
    id: 'q1',
    survey_id: 'survey-001',
    dimension: 'SPEAK_UP' as const,
    text_th: 'คุณรู้สึกสบายใจที่จะพูดแสดงความเห็นในที่ประชุม',
    text_en: 'You feel comfortable speaking up in meetings',
    order_index: 1,
    reverse_scored: false,
  },
  {
    id: 'q2',
    survey_id: 'survey-001',
    dimension: 'HELP_SEEKING' as const,
    text_th: 'คุณกล้าขอความช่วยเหลือจากเพื่อนร่วมงานเมื่อติดปัญหา',
    text_en: 'You dare to ask for help from colleagues when stuck',
    order_index: 2,
    reverse_scored: false,
  },
];

const MOCK_SURVEY = {
  id: 'survey-001',
  org_id: MOCK_ORG_ID,
  title: 'แบบสำรวจ PS รายไตรมาส',
  description: 'แบบประเมินความปลอดภัยทางจิตวิทยา',
  is_active: true,
  questions: MOCK_QUESTIONS,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function resetMockState() {
  mockState.activeSurvey = null;
  mockState.periodLabel = MOCK_PERIOD;
  mockState.submittingResponse = false;
  mockState.error = null;
  mockState.submitSurveyResponse.mockResolvedValue(true);
  mockState.hasSubmittedThisPeriod.mockReturnValue(false);
  mockState.getOrCreateAnonymousToken.mockReturnValue('test-anon-uuid-001');
}

/**
 * Click Likert value 4 ("เป็นกลาง") for every question in the active survey.
 *
 * Likert scale renders 7 buttons per question with aria-label matching /^\d —/.
 * They are laid out sequentially: [q0b0, q0b1, ..., q0b6, q1b0, ...].
 * Index 3 (0-based within each group of 7) corresponds to value 4 (neutral).
 */
function answerAllQuestions() {
  const buttons = screen.getAllByRole('button', { name: /^\d —/ });
  const numQuestions = mockState.activeSurvey?.questions?.length ?? 0;
  for (let qi = 0; qi < numQuestions; qi++) {
    fireEvent.click(buttons[qi * 7 + 3]); // 0-indexed group * 7 + 3 → value 4
  }
}

function renderForm(props: Partial<React.ComponentProps<typeof PsSurveyForm>> = {}) {
  return render(<PsSurveyForm orgId={MOCK_ORG_ID} {...props} />);
}

// ─── Global beforeEach ────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  resetMockState();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. No Active Survey
// ─────────────────────────────────────────────────────────────────────────────
describe('PsSurveyForm — No Active Survey', () => {
  it('renders the no-survey placeholder when activeSurvey is null', () => {
    renderForm();
    expect(
      screen.getByText('ไม่มีแบบสำรวจที่เปิดอยู่ในขณะนี้')
    ).toBeInTheDocument();
  });

  it('does NOT render Likert buttons when activeSurvey is null', () => {
    renderForm();
    expect(screen.queryAllByRole('button', { name: /^\d —/ })).toHaveLength(0);
  });

  it('does NOT render the submit button when activeSurvey is null', () => {
    renderForm();
    expect(
      screen.queryByText(/ส่งแบบสำรวจแบบไม่ระบุตัวตน/)
    ).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Already Submitted Guard
// ─────────────────────────────────────────────────────────────────────────────
describe('PsSurveyForm — Already Submitted Guard', () => {
  beforeEach(() => {
    mockState.activeSurvey = MOCK_SURVEY;
    mockState.hasSubmittedThisPeriod.mockReturnValue(true);
  });

  it('shows "ส่งแบบสำรวจแล้ว" heading when already submitted', () => {
    renderForm();
    expect(screen.getByText('ส่งแบบสำรวจแล้ว')).toBeInTheDocument();
  });

  it('displays the current period label inside the already-submitted card', () => {
    renderForm();
    expect(screen.getByText(MOCK_PERIOD)).toBeInTheDocument();
  });

  it('does NOT render Likert scale buttons when already submitted', () => {
    renderForm();
    expect(screen.queryAllByRole('button', { name: /^\d —/ })).toHaveLength(0);
  });

  it('calls hasSubmittedThisPeriod with (surveyId, periodLabel)', () => {
    renderForm();
    expect(mockState.hasSubmittedThisPeriod).toHaveBeenCalledWith(
      MOCK_SURVEY.id,
      MOCK_PERIOD
    );
  });

  it('does NOT call submitSurveyResponse when already submitted', () => {
    renderForm();
    expect(mockState.submitSurveyResponse).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Submit Disabled State
// ─────────────────────────────────────────────────────────────────────────────
describe('PsSurveyForm — Submit Disabled State', () => {
  beforeEach(() => {
    mockState.activeSurvey = MOCK_SURVEY;
  });

  it('submit button is disabled before any answers are given', () => {
    renderForm();
    const btn = screen.getByRole('button', {
      name: /กรุณาตอบให้ครบทุกข้อ/,
    });
    expect(btn).toBeDisabled();
  });

  it('shows incomplete progress text "ตอบแล้ว 0/N ข้อ" on initial render', () => {
    renderForm();
    expect(
      screen.getByText(`ตอบแล้ว 0/${MOCK_QUESTIONS.length} ข้อ`)
    ).toBeInTheDocument();
  });

  it('submit button remains disabled after only partial answers', () => {
    renderForm();
    const buttons = screen.getAllByRole('button', { name: /^\d —/ });
    fireEvent.click(buttons[3]); // answer only q1
    expect(
      screen.getByRole('button', { name: /กรุณาตอบให้ครบทุกข้อ/ })
    ).toBeDisabled();
  });

  it('progress counter updates to "ตอบแล้ว 1/N ข้อ" after one answer', () => {
    renderForm();
    const buttons = screen.getAllByRole('button', { name: /^\d —/ });
    fireEvent.click(buttons[3]); // answer q1
    expect(
      screen.getByText(`ตอบแล้ว 1/${MOCK_QUESTIONS.length} ข้อ`)
    ).toBeInTheDocument();
  });

  it('shows "✓ ตอบครบทุกข้อแล้ว พร้อมส่ง" once all questions are answered', () => {
    renderForm();
    answerAllQuestions();
    expect(
      screen.getByText('✓ ตอบครบทุกข้อแล้ว พร้อมส่ง')
    ).toBeInTheDocument();
  });

  it('submit button becomes enabled after all questions are answered', () => {
    renderForm();
    answerAllQuestions();
    expect(
      screen.getByRole('button', { name: '🔒 ส่งแบบสำรวจแบบไม่ระบุตัวตน' })
    ).toBeEnabled();
  });

  it('submit button shows "กำลังส่ง..." spinner text while submittingResponse=true', () => {
    mockState.submittingResponse = true;
    renderForm();
    expect(screen.getByText('กำลังส่ง...')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Anonymous Token Generation
// ─────────────────────────────────────────────────────────────────────────────
describe('PsSurveyForm — Anonymous Token Generation', () => {
  beforeEach(() => {
    mockState.activeSurvey = MOCK_SURVEY;
  });

  it('does NOT call getOrCreateAnonymousToken on initial render (only on submit)', () => {
    renderForm();
    expect(mockState.getOrCreateAnonymousToken).not.toHaveBeenCalled();
  });

  it('calls getOrCreateAnonymousToken with (surveyId, periodLabel) on submit', async () => {
    renderForm();
    answerAllQuestions();
    fireEvent.click(
      screen.getByRole('button', { name: '🔒 ส่งแบบสำรวจแบบไม่ระบุตัวตน' })
    );
    await waitFor(() => {
      expect(mockState.getOrCreateAnonymousToken).toHaveBeenCalledWith(
        MOCK_SURVEY.id,
        MOCK_PERIOD
      );
    });
  });

  it('passes the token returned by getOrCreateAnonymousToken in the submit payload', async () => {
    const TOKEN = 'fixed-anon-token-abc123';
    mockState.getOrCreateAnonymousToken.mockReturnValue(TOKEN);
    renderForm();
    answerAllQuestions();
    fireEvent.click(
      screen.getByRole('button', { name: '🔒 ส่งแบบสำรวจแบบไม่ระบุตัวตน' })
    );
    await waitFor(() => {
      const [, payload] = mockState.submitSurveyResponse.mock.calls[0];
      expect(payload.anonymousToken).toBe(TOKEN);
    });
  });

  it('submit payload does NOT contain a userId field', async () => {
    renderForm();
    answerAllQuestions();
    fireEvent.click(
      screen.getByRole('button', { name: '🔒 ส่งแบบสำรวจแบบไม่ระบุตัวตน' })
    );
    await waitFor(() => {
      const [, payload] = mockState.submitSurveyResponse.mock.calls[0];
      expect(payload).not.toHaveProperty('userId');
    });
  });

  it('submit payload includes correct surveyId, periodLabel, orgId, and answers', async () => {
    renderForm();
    answerAllQuestions();
    fireEvent.click(
      screen.getByRole('button', { name: '🔒 ส่งแบบสำรวจแบบไม่ระบุตัวตน' })
    );
    await waitFor(() => {
      const [calledOrgId, payload] = mockState.submitSurveyResponse.mock.calls[0];
      expect(calledOrgId).toBe(MOCK_ORG_ID);
      expect(payload.surveyId).toBe(MOCK_SURVEY.id);
      expect(payload.periodLabel).toBe(MOCK_PERIOD);
      expect(payload.answers).toHaveLength(MOCK_QUESTIONS.length);
      // answerAllQuestions clicks index 3 per group → Likert value 4
      expect(payload.answers[0]).toMatchObject({ questionId: 'q1', value: 4 });
      expect(payload.answers[1]).toMatchObject({ questionId: 'q2', value: 4 });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Submit Success
// ─────────────────────────────────────────────────────────────────────────────
describe('PsSurveyForm — Submit Success', () => {
  beforeEach(() => {
    mockState.activeSurvey = MOCK_SURVEY;
    mockState.submitSurveyResponse.mockResolvedValue(true);
  });

  it('shows "ขอบคุณสำหรับคำตอบของคุณ" after successful submission', async () => {
    renderForm();
    answerAllQuestions();
    fireEvent.click(
      screen.getByRole('button', { name: '🔒 ส่งแบบสำรวจแบบไม่ระบุตัวตน' })
    );
    await waitFor(() => {
      expect(screen.getByText('ขอบคุณสำหรับคำตอบของคุณ')).toBeInTheDocument();
    });
  });

  it('hides the question form (Likert buttons gone) after successful submission', async () => {
    renderForm();
    answerAllQuestions();
    fireEvent.click(
      screen.getByRole('button', { name: '🔒 ส่งแบบสำรวจแบบไม่ระบุตัวตน' })
    );
    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /^\d —/ })).toHaveLength(0);
    });
  });

  it('calls onSuccess callback after successful submission', async () => {
    const onSuccess = vi.fn();
    renderForm({ onSuccess });
    answerAllQuestions();
    fireEvent.click(
      screen.getByRole('button', { name: '🔒 ส่งแบบสำรวจแบบไม่ระบุตัวตน' })
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('does NOT call onSuccess when submitSurveyResponse returns false', async () => {
    mockState.submitSurveyResponse.mockResolvedValue(false);
    const onSuccess = vi.fn();
    renderForm({ onSuccess });
    answerAllQuestions();
    fireEvent.click(
      screen.getByRole('button', { name: '🔒 ส่งแบบสำรวจแบบไม่ระบุตัวตน' })
    );
    await waitFor(() =>
      expect(mockState.submitSurveyResponse).toHaveBeenCalled()
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Error State
// ─────────────────────────────────────────────────────────────────────────────
describe('PsSurveyForm — Error State', () => {
  beforeEach(() => {
    mockState.activeSurvey = MOCK_SURVEY;
  });

  it('displays "เกิดข้อผิดพลาด" banner and error detail when storeError is set', () => {
    mockState.error = 'เซิร์ฟเวอร์ไม่ตอบสนอง กรุณาลองใหม่อีกครั้ง';
    renderForm();
    expect(screen.getByText('เกิดข้อผิดพลาด')).toBeInTheDocument();
    expect(
      screen.getByText('เซิร์ฟเวอร์ไม่ตอบสนอง กรุณาลองใหม่อีกครั้ง')
    ).toBeInTheDocument();
  });

  it('does NOT display error banner when error is null', () => {
    mockState.error = null;
    renderForm();
    expect(screen.queryByText('เกิดข้อผิดพลาด')).not.toBeInTheDocument();
  });

  it('hides error banner while submittingResponse=true (spinner takes precedence)', () => {
    mockState.error = 'previous error';
    mockState.submittingResponse = true;
    renderForm();
    expect(screen.queryByText('เกิดข้อผิดพลาด')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Anonymity Notice
// ─────────────────────────────────────────────────────────────────────────────
describe('PsSurveyForm — Anonymity Notice', () => {
  beforeEach(() => {
    mockState.activeSurvey = MOCK_SURVEY;
  });

  it('renders the anonymity notice banner in the main form', () => {
    renderForm();
    expect(
      screen.getByText('คำตอบของคุณเป็นความลับและไม่ระบุตัวตน')
    ).toBeInTheDocument();
  });

  it('anonymity notice is visible immediately (no interaction needed)', () => {
    renderForm();
    const notice = screen.getByText('คำตอบของคุณเป็นความลับและไม่ระบุตัวตน');
    expect(notice).toBeVisible();
  });

  it('anonymity notice is NOT rendered on the no-survey placeholder', () => {
    mockState.activeSurvey = null;
    renderForm();
    expect(
      screen.queryByText('คำตอบของคุณเป็นความลับและไม่ระบุตัวตน')
    ).not.toBeInTheDocument();
  });
});
