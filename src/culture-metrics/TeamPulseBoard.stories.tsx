import React from 'react';
import type { Meta, StoryFn, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import TeamPulseBoard from './TeamPulseBoard';
import { useTpcStore } from './teamPulseStore';
import type { TpcPulseSession, TpcPulseSummary } from './teamPulseTypes';

// Entirely synthetic fixtures. Store actions never contact Supabase in stories.
const session: TpcPulseSession = {
  id: 'demo-active', orgId: 'demo-org', title: 'รอบตัวอย่างประจำสัปดาห์', status: 'ACTIVE',
  periodLabel: '2027-W12', openedAt: '2027-03-22T00:00:00Z', closedAt: null,
  createdAt: '2027-03-20T00:00:00Z',
};
const sessions: TpcPulseSession[] = [session,
  { ...session, id: 'demo-draft', title: 'รอบตัวอย่างถัดไป', status: 'DRAFT' },
  { ...session, id: 'demo-closed', title: 'รอบตัวอย่างที่ปิดแล้ว', status: 'CLOSED' }];
const summaries: TpcPulseSummary[] = [{
  orgId: session.orgId, sessionId: session.id, sessionTitle: session.title,
  sessionStatus: 'ACTIVE', periodLabel: session.periodLabel, topic: 'WORKLOAD',
  avgScore: 4, responseCount: 8, healthStatus: 'NORMAL',
}];

function withPulseData(rows = sessions) {
  const loadSessions = fn(async () => { useTpcStore.setState({ sessions: rows }); return true; });
  const loadSummary = fn(async () => { useTpcStore.setState({ summaries }); return true; });
  const create = fn(async (payload: { orgId: string; title: string; periodLabel: string }) => {
    useTpcStore.setState(state => ({ sessions: [{ ...session, ...payload, id: 'demo-created', status: 'DRAFT', openedAt: null }, ...state.sessions] }));
    return true;
  });
  const activate = fn(async (id: string) => {
    useTpcStore.setState(state => ({ sessions: state.sessions.map(row => row.id === id ? { ...row, status: 'ACTIVE' } : row) }));
    return true;
  });
  const close = fn(async (id: string) => {
    useTpcStore.setState(state => ({ sessions: state.sessions.map(row => row.id === id ? { ...row, status: 'CLOSED' } : row) }));
    return true;
  });
  const submit = fn(async () => true);
  return (Story: StoryFn) => {
    useTpcStore.setState({ fetchSessions: loadSessions, fetchSummary: loadSummary,
      createSession: create, activateSession: activate, closeSession: close, submitResponse: submit });
    return <Story />;
  };
}

const meta: Meta<typeof TeamPulseBoard> = {
  title: 'CultureMetrics/TeamPulseBoard', component: TeamPulseBoard,
  args: { orgId: 'demo-org', plan: 'ENTERPRISE', isAdmin: true, userId: 'demo-user' },
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof TeamPulseBoard>;

export const Administrator: Story = { decorators: [withPulseData()] };
export const Member: Story = { args: { isAdmin: false }, decorators: [withPulseData()] };
export const ClosedSession: Story = { args: { isAdmin: false }, decorators: [withPulseData([sessions[2]])] };
export const Empty: Story = { decorators: [withPulseData([])] };
export const PlanGate: Story = { args: { plan: 'FREE' }, decorators: [withPulseData([])] };
export const MemberSubmission: Story = {
  args: { isAdmin: false }, decorators: [withPulseData()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const comment = await canvas.findByLabelText('ความคิดเห็น (ไม่บังคับ)');
    await userEvent.type(comment, 'ข้อความตัวอย่างสำหรับทดสอบ');
    await userEvent.click(canvas.getByRole('button', { name: 'ส่งคำตอบ' }));
    await expect(canvas.getByText('บันทึกคำตอบแล้ว')).toBeVisible();
    await expect(comment).toHaveValue('');
    await expect(canvas.queryByTestId('tpc-summary')).not.toBeInTheDocument();
  },
};
