// สรุปทีมขายให้ H1 (0119 — มติ Sale-4): สัญญา/เดือน ต่อ Sale + มูลค่า + lost-reason — ไม่มี target/commission v1
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface BySale { sale: string; houses_opened: number; contracts_signed: number; signed_value: number }
interface Lost { reason: string; n: number }
interface Summary {
  period: { from: string; to: string };
  by_sale: BySale[]; lost_reasons: Lost[];
  totals: { houses_opened: number; contracts_signed: number; signed_value: number };
}

const THB = (n: number) => Number(n).toLocaleString('th-TH');
const REASON_TH: Record<string, string> = {
  too_expensive: 'แพงไป', went_quiet: 'เงียบหายเอง', competitor: 'ไปเจ้าอื่น', other: 'อื่นๆ',
};

export function SalesSummary({ onBack }: { onBack: () => void }) {
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_field_sales_summary').then(({ data, error }) => {
      if (error) setErr(error.message); else setS(data as Summary);
    });
  }, []);
  useEffect(load, [load]);

  if (err) return <div className="page"><p className="err">{err}</p><button className="btn btn-ghost" onClick={onBack}>ย้อนกลับ</button></div>;
  if (!s) return <div className="page muted">กำลังโหลด…</div>;

  return (
    <div className="page">
      <button className="btn btn-ghost" onClick={onBack}>← กลับ</button>
      <h2 style={{ margin: '10px 0' }}>สรุปทีมขาย (เดือนนี้)</h2>

      <div className="card">
        <strong>ภาพรวม</strong>
        <p style={{ margin: '8px 0 0' }}>
          บ้านเปิดใหม่ {s.totals.houses_opened} · สัญญาเซ็น {s.totals.contracts_signed} · มูลค่าเซ็น <strong>{THB(s.totals.signed_value)} บาท</strong>
        </p>
      </div>

      <div className="card">
        <strong>ต่อ Sale</strong>
        {s.by_sale.length === 0 && <p className="muted">ยังไม่มีข้อมูลเดือนนี้</p>}
        {s.by_sale.map((r) => (
          <div key={r.sale} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontWeight: 700 }}>{r.sale}</div>
            <div className="muted">เปิด {r.houses_opened} บ้าน · เซ็น {r.contracts_signed} สัญญา · {THB(r.signed_value)} บาท</div>
          </div>
        ))}
      </div>

      <div className="card">
        <strong>Lead ที่ปิด แยกเหตุผล (ให้ทีมการตลาด)</strong>
        {s.lost_reasons.length === 0 && <p className="muted">ไม่มี lead ปิดเดือนนี้</p>}
        {s.lost_reasons.map((r) => (
          <div key={r.reason} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <span>{REASON_TH[r.reason] ?? r.reason}</span><span>{r.n} ราย</span>
          </div>
        ))}
      </div>
    </div>
  );
}
