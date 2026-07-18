// S18 l4-finance-tax Slice 3 — ใบเสร็จแยก VAT ในแผงตรวจ/บันทึกรับ (caller จริงของ composeFromNet)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const HOME = {
  awaiting: [
    {
      installment_id: 'i-1', project_id: 'p-1', name: 'บ้านคุณสมชาย รามอินทรา',
      seq: 1, label: 'มัดจำ (เซ็นสัญญา)', amount: 100000, days_waiting: 3, has_slip: false,
    },
  ],
  overdue: [],
  received_today: { count: 0, total: 0 },
};

// payload เปลี่ยนได้ต่อเทส (default = HOME) — ใช้เทสเคส amount ผิดปกติจาก DB
let homePayload: unknown = HOME;

vi.mock('../lib/supabase', () => ({
  supabase: () => ({
    rpc: (fn: string) =>
      Promise.resolve(fn === 'rpc_finance_home' ? { data: homePayload, error: null } : { data: null, error: null }),
  }),
}));

beforeEach(() => { homePayload = HOME; });

import { FinanceHome } from './FinanceHome';

describe('FinanceHome receipt VAT breakdown (S18 Slice 3)', () => {
  it('เปิดแผงตรวจ/บันทึกรับแล้วเห็น VAT แยกถูกต้อง (ฐาน 100,000 → VAT 7,000 → รวม 107,000)', async () => {
    render(<FinanceHome onOpenProject={() => {}} />);
    fireEvent.click(await screen.findByText('ตรวจ/บันทึกรับ'));

    expect(screen.getByText('ฐานก่อน VAT: 100,000.00 บาท')).toBeInTheDocument();
    expect(screen.getByText('VAT 7%: 7,000.00 บาท')).toBeInTheDocument();
    expect(screen.getByText('รวมทั้งสิ้น: 107,000.00 บาท')).toBeInTheDocument();
  });

  // Defense-in-depth (review S18): payment_installments.amount เป็น numeric NULL ได้
  // และ field-app ไม่มี ErrorBoundary → ถ้า breakdown throw ตอน render = จอขาวทั้งหน้า
  it('งวดที่ amount เป็น null ต้องไม่ crash — แสดง fallback แทน breakdown', async () => {
    homePayload = { ...HOME, awaiting: [{ ...HOME.awaiting[0], amount: null }] };
    render(<FinanceHome onOpenProject={() => {}} />);
    fireEvent.click(await screen.findByText('ตรวจ/บันทึกรับ'));

    // ไม่ crash: แผงยังอยู่ (ปุ่มบันทึกรับ render ได้) + ไม่มีตัวเลข breakdown มั่ว ๆ
    expect(screen.getByText('ยอดตรง — บันทึกรับ ✅')).toBeInTheDocument();
    expect(screen.queryByText(/ฐานก่อน VAT/)).toBeNull();
    expect(screen.getByText(/ยอดงวดไม่พร้อมคำนวณ/)).toBeInTheDocument();
  });

  it('งวดที่ amount ติดลบ (ข้อมูลผิดปกติ) ต้องไม่ crash เช่นกัน — fallback เดียวกัน', async () => {
    homePayload = { ...HOME, awaiting: [{ ...HOME.awaiting[0], amount: -1 }] };
    render(<FinanceHome onOpenProject={() => {}} />);
    fireEvent.click(await screen.findByText('ตรวจ/บันทึกรับ'));

    expect(screen.queryByText(/ฐานก่อน VAT/)).toBeNull();
    expect(screen.getByText(/ยอดงวดไม่พร้อมคำนวณ/)).toBeInTheDocument();
  });
});
