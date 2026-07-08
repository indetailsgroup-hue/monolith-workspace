// หน้าแรก E2 "โรงงานวันนี้" (0141 — ADR-049): เดินงานตามคิว B4 + gate รอ + เข้างานโรงงานรวม
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface QRow { package_id: string; code: string; name: string; project_id: string; project_name: string; current_stage: string | null; materials_ready: boolean; material_count: number }
interface Gate { milestone_id: string; name: string; station: string; waiting_minutes: number }
interface Report { name: string; station: string; reported_by: string; reported_at: string }
interface Checkin { checkin_id: string; member_count: number; checked_out: boolean; man_hours: number | null }
interface Home { queue: QRow[]; gates_waiting: Gate[]; today_reports: Report[]; checkin: Checkin | null; site_code: string }

export function FactoryOpsHome({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const [home, setHome] = useState<Home | null>(null);
  const [count, setCount] = useState('10');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_factory_ops_home').then(({ data, error }) => {
      if (error) setErr(error.message); else setHome(data as Home);
    });
  }, []);
  useEffect(load, [load]);

  async function checkin() {
    setErr(''); setMsg('');
    const n = Math.max(1, Number(count) || 0);
    const members = Array.from({ length: n }, (_, i) => ({ display_name: `ช่างโรงงาน ${i + 1}` }));
    const { error } = await supabase().rpc('rpc_factory_team_checkin', {
      p_site_code: home?.site_code, p_members: members,
    });
    if (error) { setErr(error.message); return; }
    setMsg(`เข้างานโรงงานแล้ว ${n} คน 🌅`);
    load();
  }

  async function checkout() {
    setErr(''); setMsg('');
    const { data, error } = await supabase().rpc('rpc_factory_team_checkout', { p_site_code: home?.site_code });
    if (error) { setErr(error.message); return; }
    setMsg(`เลิกงานแล้ว — ${(data as { man_hours: number }).man_hours} man-hours (overhead กลางเข้า C6) 🌇`);
    load();
  }

  if (err && !home) return <div className="page"><p className="err">{err}</p></div>;
  if (!home) return <div className="page muted">กำลังโหลด…</div>;

  return (
    <div className="page">
      <h2 style={{ margin: '4px 0 12px' }}>โรงงานวันนี้</h2>

      <div className="card">
        <strong>เข้างานโรงงาน</strong>
        {!home.checkin ? (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)}
              style={{ flex: '0 0 90px' }} placeholder="กี่คน" />
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={checkin}>🌅 เข้างาน (ทั้งโรงงาน)</button>
          </div>
        ) : !home.checkin.checked_out ? (
          <div>
            <p className="muted" style={{ margin: '6px 0' }}>เข้างานแล้ว {home.checkin.member_count} คน</p>
            <button className="btn btn-accent" onClick={checkout}>🌇 เลิกงานโรงงาน</button>
          </div>
        ) : (
          <p style={{ color: 'var(--ok)', fontWeight: 600, margin: '6px 0 0' }}>
            ✅ จบวัน — {home.checkin.member_count} คน · {home.checkin.man_hours} man-hours
          </p>
        )}
      </div>

      {home.gates_waiting.length > 0 && (
        <div className="card">
          <strong>🔍 gate รอดีไซเนอร์ตรวจ <span className="badge">{home.gates_waiting.length}</span></strong>
          {home.gates_waiting.map((g) => (
            <div key={g.milestone_id} className="muted" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              {g.name} · {g.station} — รอ {g.waiting_minutes >= 60 ? `${Math.floor(g.waiting_minutes / 60)} ชม.` : `${g.waiting_minutes} นาที`}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <strong>คิวผลิต (ภาพเดียวกับ planner)</strong>
        {home.queue.length === 0 && <p className="muted">ไม่มี package ค้างผลิต</p>}
        {home.queue.slice(0, 10).map((q, i) => (
          <div key={q.package_id} onClick={() => onOpenProject(q.project_id)}
            style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
            {i + 1}. <strong>{q.project_name}</strong> · {q.code}
            <span className="muted"> — {q.current_stage ?? 'ครบ 12 ขั้น'}{q.material_count > 0 && !q.materials_ready ? ' · วัสดุไม่ครบ ⚠️' : ''}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <strong>รายงานวันนี้ {home.today_reports.length > 0 && <span className="badge">{home.today_reports.length}</span>}</strong>
        {home.today_reports.length === 0 && <p className="muted">ยังไม่มีรายงานสถานีวันนี้</p>}
        {home.today_reports.map((r, i) => (
          <div key={i} className="muted" style={{ padding: '4px 0' }}>
            {r.name} · {r.station} — {r.reported_by}
          </div>
        ))}
      </div>

      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>{msg}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
