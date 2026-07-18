// S18 L3 Slice 4: การ์ดรหัสผูกกลุ่ม + ปุ่มคัดลอก แทน alert() — alert ปิดแล้วรหัสหาย จดไม่ทัน
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({ supabase: () => ({ rpc }) }));
// child panels นอกโฟกัสเทสนี้ — ตัดออกให้เหลือเรื่องรหัสผูกอย่างเดียว
vi.mock('./LeadPanel', () => ({ LeadPanel: () => null }));
vi.mock('./MoneyPanel', () => ({ MoneyPanel: () => null }));
vi.mock('./ProductionPanel', () => ({ ProductionPanel: () => null }));
vi.mock('./RosterPanel', () => ({ RosterPanel: () => null }));
vi.mock('./PlanPanel', () => ({ PlanPanel: () => null }));
vi.mock('./ContractPanel', () => ({ ContractPanel: () => null }));
vi.mock('./PackagePanel', () => ({ PackagePanel: () => null }));
vi.mock('./PhotoSendCard', () => ({ PhotoSendCard: () => null }));
vi.mock('./VariationPanel', () => ({ VariationPanel: () => null }));
vi.mock('./DesignerToolsPanel', () => ({ DesignerToolsPanel: () => null }));
vi.mock('./TurnkeyCard', () => ({ TurnkeyCard: () => null }));

import { ProjectDetail } from './ProjectDetail';

const DETAIL = { id: 'p-1', name: 'บ้านคุณเอ', status: 'active', rooms: [], bind_codes: [], groups: [] };

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockImplementation(async (fn: string) => {
    if (fn === 'rpc_field_project_detail') return { data: DETAIL, error: null };
    if (fn === 'rpc_field_issue_bind_code') return { data: 'AB12CD', error: null };
    return { data: null, error: null };
  });
});

describe('ProjectDetail — การ์ดรหัสผูกกลุ่ม + ปุ่มคัดลอก (S18 Slice 4)', () => {
  it('ออกรหัส → โชว์การ์ดรหัสค้างบนจอ (ไม่ใช่ alert) พร้อมวิธีพิมพ์ #ผูก', async () => {
    render(<ProjectDetail id="p-1" onBack={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /ออกรหัสผูกกลุ่ม LINE/ }));
    expect(await screen.findByText(/รหัสผูกกลุ่ม: AB12CD/)).toBeInTheDocument();
    expect(screen.getByText(/#ผูก AB12CD ทีม/)).toBeInTheDocument();
  });

  it('ปุ่มคัดลอก → เขียนรหัสลง clipboard + โชว์ "คัดลอกแล้ว"', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ProjectDetail id="p-1" onBack={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /ออกรหัสผูกกลุ่ม LINE/ }));
    fireEvent.click(await screen.findByRole('button', { name: /คัดลอกรหัส/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('AB12CD'));
    expect(await screen.findByText(/คัดลอกแล้ว/)).toBeInTheDocument();
  });
});
