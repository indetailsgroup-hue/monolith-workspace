// การเงิน 4 งวด (0108 — default 50/30/15/5, ADR-041 มติ 5): ตั้งแผน → เซ็นสัญญา → การ์ดงวดยิงอัตโนมัติ → F3 บันทึกรับ
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Installment {
  id: string; seq: number; label: string; percent: number; amount: number;
  status: 'pending' | 'notified' | 'paid'; notified_at: string | null; paid_at: string | null;
}

const THB = (n: number) => n.toLocaleString('th-TH');
const STATUS_TH: Record<Installment['status'], string> = {
  pending: 'รอถึงงวด', notified: '📨 แจ้งลูกค้าแล้ว', paid: '✅ รับแล้ว',
};

export function MoneyPanel({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Installment[]>([]);
  const [total, setTotal] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_field_payment_status', { p_project_id: projectId })
      .then(({ data }) => setItems((data ?? []) as Installment[]));
  }, [projectId]);
  useEffect(load, [load]);

  async function setPlan() {
    setErr(''); setMsg('');
    const amount = Number(total.replace(/[, ]/g, ''));
    if (!amount || amount <= 0) { setErr('ใส่มูลค่าสัญญาก่อนครับ'); return; }
    const { error } = await supabase().rpc('rpc_field_set_payment_plan', { p_project_id: projectId, p_total: amount });
    if (error) { setErr(error.message); return; }
    setMsg('ตั้งแผน 4 งวด (50/30/15/5) แล้ว ✅');
    load();
  }

  async function contractSigned() {
    setErr(''); setMsg('');
    const { error } = await supabase().rpc('rpc_field_mark_contract_signed', { p_project_id: projectId });
    if (error) { setErr(error.message); return; }
    setMsg('บันทึกเซ็นสัญญาแล้ว — การ์ดงวดมัดจำส่งเข้ากลุ่มลูกค้าอัตโนมัติ 📨');
    load();
  }

  async function recordPaid(id: string) {
    setErr(''); setMsg('');
    const { error } = await supabase().rpc('rpc_finance_record_payment', { p_installment_id: id });
    if (error) { setErr(error.message); return; }
    load();
  }

  return (
    <div className="card">
      <strong>การเงิน (4 งวด)</strong>
      {items.length === 0 ? (
        <>
          <p className="muted">ยังไม่ตั้งแผนชำระ — ใส่มูลค่าสัญญาแล้วระบบแบ่ง 50/30/15/5 ให้</p>
          <input inputMode="numeric" placeholder="มูลค่าสัญญา (บาท)" value={total}
            onChange={(e) => setTotal(e.target.value)} />
          <button className="btn btn-accent" onClick={setPlan}>ตั้งแผนชำระ 4 งวด</button>
        </>
      ) : (
        <>
          {items.map((i) => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <div>
                <div>งวด {i.seq} · {i.label} ({i.percent}%)</div>
                <div className="muted">{THB(i.amount)} บาท — {STATUS_TH[i.status]}</div>
              </div>
              {i.status === 'notified' && (
                <button className="btn btn-ghost" style={{ minHeight: 40 }} onClick={() => recordPaid(i.id)}>รับเงินแล้ว</button>
              )}
            </div>
          ))}
          {items.every((i) => i.status === 'pending') && (
            <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={contractSigned}>ลูกค้าเซ็นสัญญาแล้ว (เริ่มงวดมัดจำ)</button>
          )}
        </>
      )}
      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>{msg}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
