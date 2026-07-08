// หน้าแรก Designer "คิวของฉันวันนี้" (0126 — มติ B2-4)
// เรียงตามราคาการรอ: ไลน์ผลิต (27 คน) > ตรวจหน้างานร่วม > ลูกค้าเงียบ > ทีม
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Gate { milestone_id: string; project_id: string; name: string; station: string; waiting_minutes: number; sla_minutes: number; work_item_id: string | null }
interface Row { project_id: string; name: string; work_item_id: string | null; age_days?: number }
interface Issue { issue_id: string; project_id: string; name: string; description: string; acked: boolean }
interface Home { gates: Gate[]; verify_pending: Row[]; awaiting_sign: Row[]; design_issues: Issue[] }

const MONOLITH_URL = import.meta.env.VITE_MONOLITH_URL as string | undefined;
const STATION_TH: Record<string, string> = { assembly: 'ประกอบ', packing: 'แพ็ค' };

function MonolithBtn({ workItemId }: { workItemId: string | null }) {
  if (!MONOLITH_URL || !workItemId) return null;
  return (
    <button className="btn btn-ghost" style={{ minHeight: 40, width: 'auto' }}
      onClick={() => window.open(`${MONOLITH_URL}?work_item=${workItemId}`, '_blank')}>
      เปิดใน MONOLITH ↗
    </button>
  );
}

export function DesignerHome({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const [home, setHome] = useState<Home | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_field_designer_home').then(({ data, error }) => {
      if (error) setErr(error.message); else setHome(data as Home);
    });
  }, []);
  useEffect(load, [load]);

  async function approveGate(id: string) {
    setErr(''); setMsg('');
    const { error } = await supabase().rpc('rpc_factory_approve_gate', { p_milestone_id: id });
    if (error) { setErr(error.message); return; }
    setMsg('ตรวจผ่านแล้ว ✅ — ไลน์เดินต่อ + การ์ดถึงลูกค้าอัตโนมัติ');
    load();
  }

  async function ackIssue(id: string) {
    await supabase().rpc('rpc_field_ack_issue', { p_issue_id: id });
    load();
  }

  if (err && !home) return <div className="page"><p className="err">{err}</p></div>;
  if (!home) return <div className="page muted">กำลังโหลด…</div>;
  const empty = home.gates.length + home.verify_pending.length + home.awaiting_sign.length + home.design_issues.length === 0;

  return (
    <div className="page">
      <h2 style={{ margin: '4px 0 12px' }}>คิวของฉันวันนี้</h2>
      {empty && <div className="card"><p style={{ color: 'var(--ok)', fontWeight: 600, margin: 0 }}>✅ ไม่มีใครรอคุณตอนนี้</p></div>}

      {home.gates.length > 0 && (
        <div className="card">
          <strong>🏭 ไลน์ผลิตรอคุณตรวจ <span className="badge">{home.gates.length}</span></strong>
          {home.gates.map((g) => (
            <div key={g.milestone_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <div>{g.name} · สถานี{STATION_TH[g.station] ?? g.station}
                <span className={g.waiting_minutes > g.sla_minutes ? 'err' : 'muted'} style={{ marginLeft: 6 }}>
                  รอ {g.waiting_minutes >= 60 ? `${Math.floor(g.waiting_minutes / 60)} ชม.` : `${g.waiting_minutes} นาที`}
                  {g.waiting_minutes > g.sla_minutes ? ' ⚠️ เกิน SLA' : ` / SLA ${Math.floor(g.sla_minutes / 60)} ชม.`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => approveGate(g.milestone_id)}>ตรวจผ่าน ✅</button>
                <MonolithBtn workItemId={g.work_item_id} />
              </div>
            </div>
          ))}
        </div>
      )}

      {home.verify_pending.length > 0 && (
        <div className="card">
          <strong>📍 ต้องนัดตรวจหน้างานร่วม (ก่อนส่งแบบให้เซ็น) <span className="badge">{home.verify_pending.length}</span></strong>
          {home.verify_pending.map((v) => (
            <div key={v.project_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={() => onOpenProject(v.project_id)} style={{ cursor: 'pointer' }}>{v.name} →</span>
              <MonolithBtn workItemId={v.work_item_id} />
            </div>
          ))}
        </div>
      )}

      {home.awaiting_sign.length > 0 && (
        <div className="card">
          <strong>✍️ แบบรอลูกค้าเซ็น <span className="badge">{home.awaiting_sign.length}</span></strong>
          {home.awaiting_sign.map((s) => (
            <div key={s.project_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={() => onOpenProject(s.project_id)} style={{ cursor: 'pointer' }}>
                {s.name} <span className="muted">· งานอายุ {s.age_days} วัน</span> →
              </span>
              <MonolithBtn workItemId={s.work_item_id} />
            </div>
          ))}
          <p className="muted">ลูกค้าเงียบนาน → บอก Sale เจ้าของบ้านช่วยสะกิดครับ</p>
        </div>
      )}

      {home.design_issues.length > 0 && (
        <div className="card">
          <strong>📐 หน้างานตามแบบไม่ได้ <span className="badge">{home.design_issues.length}</span></strong>
          {home.design_issues.map((i) => (
            <div key={i.issue_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <div onClick={() => onOpenProject(i.project_id)} style={{ cursor: 'pointer' }}>{i.name}: {i.description}</div>
              {!i.acked && (
                <button className="btn btn-ghost" style={{ minHeight: 40, marginTop: 6 }} onClick={() => ackIssue(i.issue_id)}>รับเรื่อง (ack)</button>
              )}
            </div>
          ))}
        </div>
      )}

      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>{msg}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
