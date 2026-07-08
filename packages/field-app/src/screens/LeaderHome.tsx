// หน้าแรกหัวหน้า "บ้านของฉันทั้งหมด" (0123 — มติ D4-1/D4-5)
// การ์ดต่อบ้านเรียงเร่งด่วน + ปุ่มเดียวตามสถานะ — เปิดมา 3 วินาทีรู้ว่ากดอะไร
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface RosterRow { roster_id: string; phase: string; employee_id: string; display_name: string; status: string }
interface House {
  project_id: string; name: string; status: string;
  open_issues: number; unacked_issues: number;
  lanes_done: number; lanes_total: number;
  next_action: { key: string; label: string };
}

export function LeaderHome({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const [houses, setHouses] = useState<House[] | null>(null);
  const [expand, setExpand] = useState<string | null>(null);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [remark, setRemark] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_field_lead_home').then(({ data, error }) => {
      if (error) setErr(error.message); else setHouses(data as House[]);
    });
  }, []);
  useEffect(load, [load]);

  async function startCheckin(projectId: string) {
    setErr(''); setMsg('');
    const { data } = await supabase().rpc('rpc_field_roster_status', { p_project_id: projectId });
    const rows = ((data as { roster: RosterRow[] })?.roster ?? [])
      .filter((r) => r.phase === 'installation' && ['approved', 'active'].includes(r.status));
    setRoster(rows);
    setTicks(Object.fromEntries(rows.map((r) => [r.employee_id, true])));
    setExpand(projectId);
  }

  async function confirmCheckin(projectId: string) {
    const members = roster.filter((r) => ticks[r.employee_id])
      .map((r) => ({ employee_id: r.employee_id, display_name: r.display_name }));
    if (members.length === 0) { setErr('ติ๊กทีมที่มาอย่างน้อย 1 คน'); return; }
    const { error } = await supabase().rpc('rpc_field_team_checkin', { p_project_id: projectId, p_members: members });
    if (error) { setErr(error.message); return; }
    setMsg('เข้างานแล้ว ✅ ทีม ' + members.length + ' คน');
    setExpand(null);
    load();
  }

  async function checkoutAndReport(projectId: string) {
    setErr(''); setMsg('');
    const out = await supabase().rpc('rpc_field_team_checkout', { p_project_id: projectId });
    if (out.error && !out.error.message.includes('ยังไม่ได้กดเข้างาน')) { setErr(out.error.message); return; }
    const d = await supabase().rpc('rpc_field_draft_daily_report', { p_project_id: projectId });
    if (d.error) { setErr(d.error.message); return; }
    const reportId = (d.data as { report_id: string }).report_id;
    const s = await supabase().rpc('rpc_field_send_daily_report', { p_report_id: reportId, p_remark: remark.trim() || null });
    if (s.error) { setErr(s.error.message); return; }
    setMsg('เลิกงาน + ส่งรายงานแล้ว 📋');
    setExpand(null); setRemark('');
    load();
  }

  if (err && !houses) return <div className="page"><p className="err">{err}</p></div>;
  if (!houses) return <div className="page muted">กำลังโหลด…</div>;

  return (
    <div className="page">
      <h2 style={{ margin: '4px 0 12px' }}>บ้านของฉันทั้งหมด</h2>
      {houses.length === 0 && <p className="muted">ยังไม่มีบ้านที่รับผิดชอบ</p>}
      {houses.map((h) => (
        <div key={h.project_id} className="card">
          <div onClick={() => onOpenProject(h.project_id)} style={{ cursor: 'pointer' }}>
            <strong>{h.name} →</strong>
            <div className="muted">
              เลน {h.lanes_done}/{h.lanes_total}
              {h.open_issues > 0 && <> · ปัญหาค้าง {h.open_issues}</>}
            </div>
          </div>
          {h.next_action.key === 'checkin' && expand !== h.project_id && (
            <button className="btn btn-primary" onClick={() => startCheckin(h.project_id)}>{h.next_action.label}</button>
          )}
          {h.next_action.key === 'checkin' && expand === h.project_id && (
            <div>
              {roster.length === 0 && <p className="muted">ยังไม่มี roster เฟสติดตั้ง — มอบทีมในหน้าบ้านก่อน</p>}
              {roster.map((r) => (
                <label key={r.employee_id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 400, margin: '8px 0' }}>
                  <input type="checkbox" style={{ width: 24, height: 24, minHeight: 0 }}
                    checked={ticks[r.employee_id] ?? false}
                    onChange={(e) => setTicks({ ...ticks, [r.employee_id]: e.target.checked })} />
                  {r.display_name}
                </label>
              ))}
              {roster.length > 0 && <button className="btn btn-primary" onClick={() => confirmCheckin(h.project_id)}>ยืนยันเข้างาน</button>}
              <button className="btn btn-ghost" style={{ minHeight: 40 }} onClick={() => setExpand(null)}>ปิด</button>
            </div>
          )}
          {(h.next_action.key === 'checkout_report' || h.next_action.key === 'send_report') && (
            expand !== h.project_id ? (
              <button className="btn btn-accent" onClick={() => setExpand(h.project_id)}>{h.next_action.label}</button>
            ) : (
              <div>
                <input placeholder="หมายเหตุหัวหน้า 1-2 บรรทัด (เช่น พรุ่งนี้ทำอะไรต่อ)" value={remark}
                  onChange={(e) => setRemark(e.target.value)} />
                <button className="btn btn-accent" onClick={() => checkoutAndReport(h.project_id)}>ส่งรายงาน + จบวัน</button>
                <button className="btn btn-ghost" style={{ minHeight: 40 }} onClick={() => setExpand(null)}>ปิด</button>
              </div>
            )
          )}
          {['issues', 'close_house'].includes(h.next_action.key) && (
            <button className={h.next_action.key === 'issues' ? 'btn btn-primary' : 'btn btn-accent'}
              onClick={() => onOpenProject(h.project_id)}>{h.next_action.label}</button>
          )}
          {h.next_action.key === 'ok' && <p style={{ color: 'var(--ok)', fontWeight: 600, margin: '8px 0 0' }}>{h.next_action.label}</p>}
        </div>
      ))}
      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>{msg}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
