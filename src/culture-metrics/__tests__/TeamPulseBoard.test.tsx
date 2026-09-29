import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const client = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../../core/supabase', () => ({ supabase: client }));
import TeamPulseBoard from '../TeamPulseBoard';
import { useTpcStore } from '../teamPulseStore';
import type { TpcPulseSession, TpcPulseSummary } from '../teamPulseTypes';

const base: TpcPulseSession = {
  id: 'active', orgId: 'org-a', title: 'รอบเปิด', status: 'ACTIVE', periodLabel: 'W12',
  openedAt: '2027-03-22T00:00:00Z', closedAt: null, createdAt: '2027-03-20T00:00:00Z',
};
const sessions = [base, { ...base, id: 'draft', title: 'รอบร่าง', status: 'DRAFT' as const },
  { ...base, id: 'closed', title: 'รอบปิด', status: 'CLOSED' as const }];
const summary: TpcPulseSummary = {
  orgId: 'org-a', sessionId: 'active', sessionTitle: base.title, sessionStatus: 'ACTIVE',
  periodLabel: 'W12', topic: 'WORKLOAD', avgScore: 4.5, responseCount: 2, healthStatus: null,
};
const props = { orgId: 'org-a', plan: 'ENTERPRISE' as const, isAdmin: true, userId: 'user-a' };
const actualFetchSummary = useTpcStore.getState().fetchSummary;
const fetchSessions = vi.fn(async () => { useTpcStore.setState({ sessions }); return true; });
const fetchSummary = vi.fn(async () => { useTpcStore.setState({ summaries: [summary] }); return true; });
const createSession = vi.fn(async () => true);
const activateSession = vi.fn(async () => true);
const closeSession = vi.fn(async () => true);
const submitResponse = vi.fn(async () => true);
const fetchConfigs = vi.fn(async () => true);

beforeEach(() => {
  vi.clearAllMocks();
  fetchSessions.mockImplementation(async () => { useTpcStore.setState({ sessions }); return true; });
  fetchSummary.mockImplementation(async () => { useTpcStore.setState({ summaries: [summary] }); return true; });
  createSession.mockResolvedValue(true); activateSession.mockResolvedValue(true);
  closeSession.mockResolvedValue(true); submitResponse.mockResolvedValue(true);
  useTpcStore.getState().setContext(null, null);
  useTpcStore.setState({ fetchSessions, fetchSummary, fetchConfigs, createSession, activateSession, closeSession, submitResponse });
});

describe('TeamPulseBoard access and sessions', () => {
  it.each(['FREE', 'STARTER'] as const)('gates %s without fetching', plan => {
    render(<TeamPulseBoard {...props} plan={plan} />);
    expect(screen.getByTestId('tpc-plan-gate')).toBeInTheDocument();
    expect(fetchSessions).not.toHaveBeenCalled();
    expect(fetchSummary).not.toHaveBeenCalled();
  });

  it('shows admin lifecycle controls only for valid source states', async () => {
    render(<TeamPulseBoard {...props} />);
    expect(await screen.findByTestId('tpc-create-form')).toBeInTheDocument();
    expect(screen.getAllByTestId('tpc-activate')).toHaveLength(1);
    expect(screen.getAllByTestId('tpc-close')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('tpc-activate'));
    await act(async () => {});
    expect(activateSession).toHaveBeenCalledWith('draft', 'org-a', 'ENTERPRISE');
    fireEvent.click(screen.getByTestId('tpc-close'));
    await act(async () => {});
    expect(closeSession).toHaveBeenCalledWith('active', 'org-a', 'ENTERPRISE');
    expect(fetchSummary).toHaveBeenCalledTimes(2);
  });

  it('keeps member results/config private and filters draft sessions defensively', async () => {
    render(<TeamPulseBoard {...props} isAdmin={false} />);
    expect(await screen.findByTestId('tpc-response-form')).toBeInTheDocument();
    expect(screen.queryByText('รอบร่าง')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tpc-create-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tpc-summary')).not.toBeInTheDocument();
    expect(fetchSummary).not.toHaveBeenCalled(); expect(fetchConfigs).not.toHaveBeenCalled();
  });

  it('does not offer response submission for a closed session', async () => {
    render(<TeamPulseBoard {...props} isAdmin={false} />);
    fireEvent.click(await screen.findByRole('button', { name: /รอบปิด/ }));
    expect(screen.queryByTestId('tpc-response-form')).not.toBeInTheDocument();
    expect(screen.getByText('รอบนี้ปิดรับคำตอบแล้ว')).toBeInTheDocument();
  });

  it('preserves existing small-count summary semantics', async () => {
    render(<TeamPulseBoard {...props} />);
    const result = await screen.findByTestId('tpc-summary');
    expect(within(result).getByText('4.5')).toBeInTheDocument();
    expect(within(result).getByText('2 คำตอบ')).toBeInTheDocument();
    expect(within(result).getByText('ข้อมูลไม่เพียงพอสำหรับสถานะ')).toBeInTheDocument();
  });

  it('shows an empty state while retaining admin creation', async () => {
    fetchSessions.mockImplementation(async () => { useTpcStore.setState({ sessions: [] }); return true; });
    render(<TeamPulseBoard {...props} />);
    expect(await screen.findByText('ยังไม่มีรอบ Team Pulse')).toBeInTheDocument();
    expect(screen.getByTestId('tpc-create-form')).toBeInTheDocument();
  });
});

describe('TeamPulseBoard form outcomes', () => {
  it('rejects whitespace-only creation before sending', async () => {
    render(<TeamPulseBoard {...props} />);
    fireEvent.change(await screen.findByLabelText('ชื่อรอบ'), { target: { value: '   ' } });
    fireEvent.submit(screen.getByTestId('tpc-create-form'));
    expect(createSession).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('กรุณากรอกชื่อรอบและช่วงเวลา');
  });

  it.each([false, true])('creation result %s preserves or clears entered values', async success => {
    createSession.mockResolvedValue(success);
    render(<TeamPulseBoard {...props} />);
    fireEvent.change(await screen.findByLabelText('ชื่อรอบ'), { target: { value: ' สัปดาห์ใหม่ ' } });
    fireEvent.change(screen.getByLabelText('ช่วงเวลา'), { target: { value: ' W13 ' } });
    await act(async () => { fireEvent.submit(screen.getByTestId('tpc-create-form')); });
    expect(createSession).toHaveBeenCalledWith({ orgId: 'org-a', title: 'สัปดาห์ใหม่', periodLabel: 'W13' }, 'ENTERPRISE');
    expect(screen.getByLabelText('ชื่อรอบ')).toHaveValue(success ? '' : ' สัปดาห์ใหม่ ');
    expect(screen.getByLabelText('ช่วงเวลา')).toHaveValue(success ? '' : ' W13 ');
  });

  it.each(['', '0', '6', '2.5'])('rejects invalid response score %s', async score => {
    render(<TeamPulseBoard {...props} isAdmin={false} />);
    fireEvent.change(await screen.findByLabelText('คะแนน (1–5)'), { target: { value: score } });
    fireEvent.submit(screen.getByTestId('tpc-response-form'));
    expect(submitResponse).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('จำนวนเต็ม');
  });

  it.each([false, true])('response result %s preserves or clears the comment', async success => {
    submitResponse.mockResolvedValue(success);
    render(<TeamPulseBoard {...props} />);
    fireEvent.change(await screen.findByLabelText('ความคิดเห็น (ไม่บังคับ)'), { target: { value: 'ปรับปรุงการสื่อสาร' } });
    await act(async () => { fireEvent.submit(screen.getByTestId('tpc-response-form')); });
    expect(submitResponse).toHaveBeenCalledWith({ orgId: 'org-a', sessionId: 'active', topic: 'WORKLOAD', score: 3, comment: 'ปรับปรุงการสื่อสาร' });
    expect(screen.getByLabelText('ความคิดเห็น (ไม่บังคับ)')).toHaveValue(success ? '' : 'ปรับปรุงการสื่อสาร');
    expect(fetchSummary).toHaveBeenCalledTimes(success ? 2 : 1);
  });

  it('keeps pending inputs visible and prevents duplicate submission', async () => {
    let complete!: (success: boolean) => void;
    submitResponse.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    render(<TeamPulseBoard {...props} isAdmin={false} />);
    const form = await screen.findByTestId('tpc-response-form');
    fireEvent.submit(form); fireEvent.submit(form);
    expect(submitResponse).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'ส่งคำตอบ' })).toBeDisabled();
    await act(async () => { complete(false); });
    expect(screen.getByRole('button', { name: 'ส่งคำตอบ' })).toBeEnabled();
  });
});

describe('TeamPulseBoard identity lifecycle', () => {
  it('drops a pending real-store admin summary after a same-org role change', async () => {
    let complete!: (value: unknown) => void;
    const response = new Promise(resolve => { complete = resolve; });
    const query = { select: () => query, eq: () => query, order: () => response };
    client.from.mockReturnValue(query);
    useTpcStore.setState({ fetchSummary: actualFetchSummary });
    const view = render(<TeamPulseBoard {...props} />);
    await act(async () => { useTpcStore.setState({ summaries: [summary] }); });
    expect(screen.getByText('4.5')).toBeInTheDocument();
    view.rerender(<TeamPulseBoard {...props} isAdmin={false} userId="replacement-user" />);
    expect(screen.queryByTestId('tpc-summary')).not.toBeInTheDocument();
    await act(async () => { complete({ data: [{ org_id: 'org-a', session_id: 'active', avg_score: 4.5 }], error: null }); });
    expect(useTpcStore.getState().summaries).toEqual([]);
    expect(screen.queryByText('4.5')).not.toBeInTheDocument();
  });

  it.each([
    { userId: 'user-b', isAdmin: true, orgId: 'org-a', plan: 'ENTERPRISE' as const },
    { userId: 'user-b', isAdmin: false, orgId: 'org-a', plan: 'ENTERPRISE' as const },
    { userId: 'user-a', isAdmin: false, orgId: 'org-a', plan: 'ENTERPRISE' as const },
    { userId: 'user-a', isAdmin: true, orgId: 'org-b', plan: 'ENTERPRISE' as const },
    { userId: 'user-a', isAdmin: true, orgId: 'org-a', plan: 'FREE' as const },
  ])('clears previous data and suppresses late local success for $userId/$isAdmin/$orgId/$plan', async next => {
    let complete!: (success: boolean) => void;
    submitResponse.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const view = render(<TeamPulseBoard {...props} />);
    fireEvent.change(await screen.findByLabelText('ความคิดเห็น (ไม่บังคับ)'), { target: { value: 'OLD USER TEXT' } });
    fireEvent.submit(screen.getByTestId('tpc-response-form'));
    fetchSessions.mockResolvedValue(true); fetchSummary.mockResolvedValue(true);
    view.rerender(<TeamPulseBoard {...next} />);
    expect(screen.queryByDisplayValue('OLD USER TEXT')).not.toBeInTheDocument();
    expect(screen.queryByText('4.5')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /รอบเปิด/ })).not.toBeInTheDocument();
    await act(async () => { complete(true); });
    expect(screen.queryByText('บันทึกคำตอบแล้ว')).not.toBeInTheDocument();
    expect(useTpcStore.getState().summaries).toEqual([]);
  });

  it('clears the store context when unmounted', async () => {
    const view = render(<TeamPulseBoard {...props} />);
    await screen.findByTestId('tpc-response-form');
    view.unmount();
    expect(useTpcStore.getState()).toMatchObject({ contextOrgId: null, sessions: [], summaries: [] });
  });
});
