// Phase Roster "สั่ง-เช็ค-ตาม" (0110) + เลือกดีไซเนอร์ manual v1 (มติ B2-3)
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface RosterRow {
  roster_id: string; phase: string; employee_id: string;
  display_name: string; role_ref: string; status: string;
}
interface Status { roster: RosterRow[]; missing: number; unexpected_guests: number }
interface Candidate { employee_id: string; display_name: string; active_houses: number }

const PHASE_TH: Record<string, string> = { survey: 'วัดหน้างาน', design: 'ออกแบบ', installation: 'ติดตั้ง' };
const STATUS_TH: Record<string, string> = {
  requested: '⏳ รออนุมัติ', approved: '📨 แจ้งแล้ว รอเข้ากลุ่ม', active: '✅ อยู่ในกลุ่ม',
  left_due: '👋 จบเฟส', removed: 'เอาออก', rejected: 'ไม่อนุมัติ',
};

export function RosterPanel({ projectId }: { projectId: string }) {
  const [st, setSt] = useState<Status | null>(null);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [showPick, setShowPick] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_field_roster_status', { p_project_id: projectId })
      .then(({ data, error }) => { if (!error) setSt(data as Status); });
  }, [projectId]);
  useEffect(load, [load]);

  async function openPick() {
    const { data, error } = await supabase().rpc('rpc_field_designer_candidates');
    if (error) { setErr(error.message); return; }
    setCands((data ?? []) as Candidate[]);
    setShowPick(true);
  }

  async function pickDesigner(c: Candidate) {
    setErr('');
    const { error } = await supabase().rpc('rpc_field_request_assignment', {
      p_project_id: projectId, p_phase: 'design',
      p_employee_id: c.employee_id, p_display_name: c.display_name, p_role_ref: 'B2',
    });
    if (error) { setErr(error.message); return; }
    setShowPick(false);
    load();
  }

  async function approve(rosterId: string, ok: boolean) {
    setErr('');
    const { error } = await supabase().rpc('rpc_field_approve_assignment', { p_roster_id: rosterId, p_approve: ok });
    if (error) { setErr(error.message); return; }
    load();
  }

  async function closePhase(phase: string) {
    setErr('');
    const { error } = await supabase().rpc('rpc_field_close_phase', { p_project_id: projectId, p_phase: phase });
    if (error) { setErr(error.message); return; }
    load();
  }

  if (!st) return null;
  const phases = ['survey', 'design', 'installation'];

  return (
    <div className="card">
      <strong>ทีมของบ้านนี้ {st.unexpected_guests > 0 && <span className="badge">⚠️ คนแปลกหน้าในกลุ่ม {st.unexpected_guests}</span>}</strong>
      {st.roster.length === 0 && <p className="muted">ยังไม่มอบหมายทีม</p>}
      {phases.map((ph) => {
        const rows = st.roster.filter((r) => r.phase === ph);
        if (rows.length === 0) return null;
        const anyActive = rows.some((r) => r.status === 'active' || r.status === 'approved');
        return (
          <div key={ph} style={{ marginTop: 8 }}>
            <div className="muted">ช่วง{PHASE_TH[ph]}</div>
            {rows.map((r) => (
              <div key={r.roster_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span>{r.display_name} ({r.role_ref})</span>
                {r.status === 'requested' ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-primary" style={{ minHeight: 40 }} onClick={() => approve(r.roster_id, true)}>อนุมัติ</button>
                    <button className="btn btn-ghost" style={{ minHeight: 40 }} onClick={() => approve(r.roster_id, false)}>ไม่</button>
                  </span>
                ) : <span className="muted">{STATUS_TH[r.status] ?? r.status}</span>}
              </div>
            ))}
            {anyActive && (
              <button className="btn btn-ghost" style={{ minHeight: 40, marginTop: 6 }} onClick={() => closePhase(ph)}>
                จบช่วง{PHASE_TH[ph]} (เตือนทีมออกจากกลุ่ม)
              </button>
            )}
          </div>
        );
      })}
      {!showPick ? (
        <button className="btn btn-accent" style={{ marginTop: 10 }} onClick={openPick}>เลือกดีไซเนอร์ให้บ้านนี้</button>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div className="muted">เรียงจากงานในมือน้อยสุด — แตะเพื่อเลือก</div>
          {cands.length === 0 && <p className="muted">ยังไม่มีดีไซเนอร์ผูก LINE ในระบบ</p>}
          {cands.map((c) => (
            <button key={c.employee_id} className="btn btn-ghost" style={{ display: 'block', width: '100%', marginTop: 6 }}
              onClick={() => pickDesigner(c)}>
              {c.display_name} — งานในมือ {c.active_houses} บ้าน
            </button>
          ))}
          <button className="btn btn-ghost" style={{ minHeight: 40, marginTop: 6 }} onClick={() => setShowPick(false)}>ปิด</button>
        </div>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
