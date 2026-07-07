// แผนติดตั้งฉบับลูกค้า (0112 — ADR-041 มติ 4): E7 ร่าง → D1 PM กดยืนยันส่งคลิกเดียว
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Plan {
  plan_id: string; version: number; status: 'draft' | 'sent' | 'superseded';
  start_date: string; finish_date: string; handover_date: string;
  note: string | null; sent_at: string | null;
}

const D = (iso: string) => new Date(iso).toLocaleDateString('th-TH');
const STATUS_TH: Record<Plan['status'], string> = { draft: '📝 ร่าง', sent: '📨 ส่งลูกค้าแล้ว', superseded: 'ฉบับเก่า' };

export function PlanPanel({ projectId }: { projectId: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [start, setStart] = useState('');
  const [finish, setFinish] = useState('');
  const [handover, setHandover] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_field_list_install_plans', { p_project_id: projectId })
      .then(({ data }) => setPlans((data ?? []) as Plan[]));
  }, [projectId]);
  useEffect(load, [load]);

  async function draft() {
    setErr(''); setMsg('');
    const { error } = await supabase().rpc('rpc_field_draft_install_plan', {
      p_project_id: projectId, p_start: start, p_finish: finish, p_handover: handover, p_note: note.trim() || null,
    });
    if (error) { setErr(error.message); return; }
    setMsg('ร่างแผนแล้ว — รอ PM กดยืนยันส่ง');
    setStart(''); setFinish(''); setHandover(''); setNote('');
    load();
  }

  async function send(planId: string) {
    setErr(''); setMsg('');
    const { error } = await supabase().rpc('rpc_field_send_install_plan', { p_plan_id: planId });
    if (error) { setErr(error.message); return; }
    setMsg('ส่งแผนติดตั้งเข้ากลุ่มลูกค้าแล้ว 🗓️');
    load();
  }

  const current = plans.filter((p) => p.status !== 'superseded');

  return (
    <div className="card">
      <strong>แผนติดตั้ง (ฉบับลูกค้า)</strong>
      {current.length === 0 && <p className="muted">ยังไม่มีแผน — E7 ร่างจากคิวส่งของจริง</p>}
      {current.map((p) => (
        <div key={p.plan_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <div>ฉบับที่ {p.version} · {STATUS_TH[p.status]}</div>
          <div className="muted">เริ่ม {D(p.start_date)} → เสร็จ {D(p.finish_date)} → ส่งมอบ {D(p.handover_date)}{p.note ? ` · ${p.note}` : ''}</div>
          {p.status === 'draft' && (
            <button className="btn btn-primary" style={{ minHeight: 40, marginTop: 6 }} onClick={() => send(p.plan_id)}>
              ยืนยันส่งให้ลูกค้า (PM)
            </button>
          )}
        </div>
      ))}
      {plans.length > current.length && <p className="muted">เลื่อน/แก้แผนแล้ว {plans.length - current.length} ครั้ง (ทุกฉบับอยู่ใน audit)</p>}
      <div style={{ marginTop: 10 }}>
        <div className="muted">ร่างแผนใหม่ (วันเริ่ม → เสร็จ → ส่งมอบ)</div>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="date" value={finish} onChange={(e) => setFinish(e.target.value)} />
        <input type="date" value={handover} onChange={(e) => setHandover(e.target.value)} />
        <input placeholder="หมายเหตุ (คิวรถ/ทีม)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-accent" disabled={!start || !finish || !handover} onClick={draft}>ร่างแผน</button>
      </div>
      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>{msg}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
