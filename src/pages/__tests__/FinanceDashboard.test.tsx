/**
 * FinanceDashboard render tests (S18 l4-finance-tax Slice 2) — RPC mock ผ่าน prop fetchHome
 * read-only dashboard: ยอดค้างรวม · งวดใกล้ถึง · รับแล้ววันนี้ · ลิงก์ไป Field App
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FinanceDashboard, type FinanceHomeData } from '../FinanceDashboard';

const HOME: FinanceHomeData = {
  awaiting: [
    {
      installment_id: 'i-1', project_id: 'p-1', name: 'บ้านคุณสมชาย รามอินทรา',
      seq: 1, label: 'มัดจำ (เซ็นสัญญา)', amount: 100000, days_waiting: 3, has_slip: true,
    },
    {
      installment_id: 'i-2', project_id: 'p-2', name: 'บ้านคุณสมหญิง บางนา',
      seq: 2, label: 'ก่อนผลิต (เซ็นแบบ final)', amount: 25000, days_waiting: 9,
    },
  ],
  overdue: [
    {
      installment_id: 'i-2', project_id: 'p-2', name: 'บ้านคุณสมหญิง บางนา',
      seq: 2, label: 'ก่อนผลิต (เซ็นแบบ final)', amount: 25000, days_waiting: 9,
    },
  ],
  received_today: { count: 2, total: 80000 },
};

describe('FinanceDashboard (read-only, rpc_finance_home mock)', () => {
  it('แสดงยอดค้างรวม งวดใกล้ถึง รับแล้ววันนี้ และลิงก์ไป Field App', async () => {
    render(
      <FinanceDashboard
        fetchHome={async () => HOME}
        fieldAppUrl="https://example.test/field/"
      />,
    );

    // ยอดค้างรวม = ผลรวมงวดที่แจ้งแล้วยังไม่จ่าย (100,000 + 25,000)
    expect(await screen.findByText('125,000 บาท')).toBeInTheDocument();

    // งวดใกล้ถึง: รายละเอียดครบ (ชื่อบ้าน · งวด · ยอด · จำนวนวัน · มีสลิป)
    expect(screen.getByText('บ้านคุณสมชาย รามอินทรา')).toBeInTheDocument();
    expect(screen.getByText(/งวด 1 · มัดจำ \(เซ็นสัญญา\)/)).toBeInTheDocument();
    expect(screen.getByText(/แจ้งแล้ว 3 วัน/)).toBeInTheDocument();
    expect(screen.getByText(/มีสลิปแล้ว/)).toBeInTheDocument();

    // ค้างนาน (overdue) โผล่พร้อมจำนวนวัน
    expect(screen.getByText(/ค้าง 9 วัน/)).toBeInTheDocument();

    // รับแล้ววันนี้
    expect(screen.getByText('80,000 บาท')).toBeInTheDocument();
    expect(screen.getByText('2 งวด')).toBeInTheDocument();

    // ลิงก์ไป field-app (หน้าเงินเต็ม — บันทึกรับ/แนบสลิปทำที่นั่น)
    const link = screen.getByRole('link', { name: /Field App/ });
    expect(link).toHaveAttribute('href', 'https://example.test/field/');
  });

  it('read-only: ไม่มีปุ่มบันทึกรับ/แนบสลิปบน dashboard', async () => {
    render(<FinanceDashboard fetchHome={async () => HOME} fieldAppUrl="#" />);
    await screen.findByText('125,000 บาท');
    expect(screen.queryByText(/บันทึกรับ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/แนบสลิป/)).not.toBeInTheDocument();
  });

  it('โชว์ข้อความ error เมื่อโหลด rpc_finance_home ไม่สำเร็จ', async () => {
    render(
      <FinanceDashboard
        fetchHome={async () => {
          throw new Error('ยังไม่มี session — เปิด Field App แล้วล็อกอินก่อน');
        }}
        fieldAppUrl="#"
      />,
    );
    expect(
      await screen.findByText(/ยังไม่มี session — เปิด Field App แล้วล็อกอินก่อน/),
    ).toBeInTheDocument();
  });

  it('ห้องว่างจริง (ไม่มีงวดค้าง) แสดง empty state ไม่ใช่จอเปล่า', async () => {
    render(
      <FinanceDashboard
        fetchHome={async () => ({
          awaiting: [], overdue: [], received_today: { count: 0, total: 0 },
        })}
        fieldAppUrl="#"
      />,
    );
    expect(await screen.findByText(/ไม่มีงวดค้าง/)).toBeInTheDocument();
  });
});
