// หน้าแรก C1 "คิววัดวันนี้" (0140 — ADR-048)
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Appt { appointment_id: string; project_id: string; name: string; kind: string; scheduled_at: string; note: string | null; team_count: number }
interface Pend { roster_id: string; project_id: string; name: string; display_name: string; role_ref: string }
interface Wait { project_id: string; name: string }
interface Home { appointments: Appt[]; pending_assign: Pend[]; awaiting_handoff: Wait[] }

const KIND_TH: Record<string, string> = { survey: 'วัดหน้างาน', site_verification: 'ตรวจร่วม' };
const T = (iso: string) => new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function SurveyHome({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const [home, setHome] = useState<Home | null>(null);
  const [handoffPick, setHandoffPick] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_survey_home').then(({ data, error }) => {
      if (error) setErr(error.message); else setHome(data as Home);
    });
  }, []);
  useEffect(load, [load]);

  async function approve(rosterId: string, ok: boolean) {
    await supabase().rpc('rpc_field_approve_assignment', { p_roster_id: rosterId, p_approve: ok });
    load();
  }

  async function handoff(projectId: string) {
    setErr(''); setMsg('');
    if (!summary.trim()) { setErr('ใส่สรุปผลการวัดก่อนครับ'); return; }
    const { data, error } = await supabase().rpc('rpc_field_survey_handoff', {
      p_project_id: projectId, p_summary: summary.trim(), p_client_key: crypto.randomUUID(),
    });
    if (error) { setErr(error.message); return; }
    setMsg(`ส่งมอบให้ออกแบบแล้ว ✅ (${(data as { zones: number }).zones} โซน — แจ้งดีไซเนอร์อัตโนมัติ)`);
    setHandoffPick(null); setSummary('');
    load();
  }

  if (err && !home) return <div className="page"><p className="err">{err}</p></div>;
  if (!home) return <div className="page muted">กำลังโหลด…</div>;

  return (
    <div className="page">
      <h2 style={{ margin: '4px 0 12px' }}>คิววัดวันนี้</h2>

      <div className="card">
        <strong>① นัดวันนี้/พรุ่งนี้ {home.appointments.length > 0 && <span className="badge">{home.appointments.length}</span>}</strong>
        {home.appointments.length === 0 && <p className="muted">ไม่มีนัดใน 2 วันนี้</p>}
        {home.appointments.map((a) => (
          <div key={a.appointment_id} onClick={() => onOpenProject(a.project_id)}
            style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
            <div><strong>{T(a.scheduled_at)}</strong> · {a.name} ({KIND_TH[a.kind] ?? a.kind}) →</div>
            <div className="muted">ทีมวัดที่มอบ {a.team_count} คน{a.note ? ` · ${a.note}` : ''}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <strong>② คำขอทีมวัดรออนุมัติ {home.pending_assign.length > 0 && <span className="badge">{home.pending_assign.length}</span>}</strong>
        {home.pending_assign.length === 0 && <p className="muted">ไม่มีคำขอค้าง</p>}
        {home.pending_assign.map((r) => (
          <div key={r.roster_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <span>{r.display_name} ({r.role_ref}) → {r.name}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary" style={{ minHeight: 40 }} onClick={() => approve(r.roster_id, true)}>อนุมัติ</button>
              <button className="btn btn-ghost" style={{ minHeight: 40 }} onClick={() => approve(r.roster_id, false)}>ไม่</button>
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <strong>③ วัดแล้วรอส่งมอบ {home.awaiting_handoff.length > 0 && <span className="badge">{home.awaiting_handoff.length}</span>}</strong>
        {home.awaiting_handoff.length === 0 && <p className="muted">ไม่มีบ้านค้างส่งมอบ ✅</p>}
        {home.awaiting_handoff.map((w) => (
          <div key={w.project_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div>{w.name}</div>
            {handoffPick !== w.project_id ? (
              <button className="btn btn-accent" style={{ minHeight: 40, marginTop: 4 }}
                onClick={() => setHandoffPick(w.project_id)}>จบวัด — ส่งมอบให้ออกแบบ</button>
            ) : (
              <div style={{ marginTop: 4 }}>
                <input placeholder="สรุปผลวัด (เช่น ครบ 5 ห้อง ผนังห้องนอนเอียง 8mm)" value={summary} onChange={(e) => setSummary(e.target.value)} />
                <button className="btn btn-primary" onClick={() => handoff(w.project_id)}>ยืนยันส่งมอบ</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>{msg}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
