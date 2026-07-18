// S18 l4-finance-tax Slice 3 — ใบเสร็จแยก VAT ในแผงตรวจ/บันทึกรับ (caller จริงของ composeFromNet)
import { describe, expect, it, vi } from 'vitest';
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

vi.mock('../lib/supabase', () => ({
  supabase: () => ({
    rpc: (fn: string) =>
      Promise.resolve(fn === 'rpc_finance_home' ? { data: HOME, error: null } : { data: null, error: null }),
  }),
}));

import { FinanceHome } from './FinanceHome';

describe('FinanceHome receipt VAT breakdown (S18 Slice 3)', () => {
  it('เปิดแผงตรวจ/บันทึกรับแล้วเห็น VAT แยกถูกต้อง (ฐาน 100,000 → VAT 7,000 → รวม 107,000)', async () => {
    render(<FinanceHome onOpenProject={() => {}} />);
    fireEvent.click(await screen.findByText('ตรวจ/บันทึกรับ'));

    expect(screen.getByText('ฐานก่อน VAT: 100,000.00 บาท')).toBeInTheDocument();
    expect(screen.getByText('VAT 7%: 7,000.00 บาท')).toBeInTheDocument();
    expect(screen.getByText('รวมทั้งสิ้น: 107,000.00 บาท')).toBeInTheDocument();
  });
});
