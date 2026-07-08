// หน้าแรก B4 "คิวโรงงานวันนี้" (0139 — ADR-047): คิวตามคำสัญญา + วัสดุ + คอขวด
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface QRow {
  package_id: string; code: string; name: string; project_id: string; project_name: string;
  install_date: string | null; current_stage: string | null;
  materials_ready: boolean; material_count: number; queue_override: number | null;
}
interface MRow { material_id: string; name: string; qty: number; unit: string; status: string; package_code: string; project_name: string }
interface Home { queue: QRow[]; materials_pending: MRow[]; load: Record<string, number> }

const D = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('th-TH') : null);

export function FactoryHome({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const [home, setHome] = useState<Home | null>(null);
  const [rankPick, setRankPick] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_factory_home').then(({ data, error }) => {
      if (error) setErr(error.message); else setHome(data as Home);
    });
  }, []);
  useEffect(load, [load]);

  async function bump(pkgId: string) {
    setErr(''); setMsg('');
    if (!reason.trim()) { setErr('override คิวต้องมีเหตุผล (ลง audit)'); return; }
    const { error } = await supabase().rpc('rpc_factory_set_queue_rank', {
      p_package_id: pkgId, p_rank: 1, p_reason: reason.trim(),
    });
    if (error) { setErr(error.message); return; }
    setMsg('เลื่อนคิวแล้ว — เหตุผลลง audit ✅');
    setRankPick(null); setReason('');
    load();
  }

  async function materialStatus(id: string, status: string) {
    setErr('');
    let cost: number | null = null;
    let confirmed = false;
    if (status === 'received') {
      const v = prompt('ราคาที่จ่ายจริง (บาท) — เว้นว่างถ้ายังไม่ทราบ (เข้า Job Cost อัตโนมัติ)');
      if (v && Number(v.replace(/[, ]/g, '')) > 0) cost = Number(v.replace(/[, ]/g, ''));
    }
    if (status === 'ordered') {
      // 0143: สั่งวัสดุ = SEV 10 — ต้องยืนยันว่าเช็คสเปกกับแบบ/Master Matrix แล้วจริง
      confirmed = confirm('ยืนยันว่าเช็คสเปกวัสดุกับแบบแล้วก่อนสั่งจริง?\n(สั่งผิด = scrap 100% — SEV 10)');
      if (!confirmed) return;
    }
    const { error } = await supabase().rpc('rpc_factory_material_status', {
      p_material_id: id, p_status: status, p_cost: cost, p_order_confirmed: confirmed,
    });
    if (error) { setErr(error.message); return; }
    load();
  }

  async function shortage(id: string) {
    setErr(''); setMsg('');
    const { error } = await supabase().rpc('rpc_factory_material_shortage', { p_material_id: id });
    if (error) { setErr(error.message); return; }
    setMsg('แจ้งของขาดแล้ว — route ถึง E6/E2/E7 อัตโนมัติ 🔩');
    load();
  }

  if (err && !home) return <div className="page"><p className="err">{err}</p></div>;
  if (!home) return <div className="page muted">กำลังโหลด…</div>;
  const maxLoad = Math.max(1, ...Object.values(home.load));

  return (
    <div className="page">
      <h2 style={{ margin: '4px 0 12px' }}>คิวโรงงานวันนี้</h2>

      {Object.keys(home.load).length > 0 && (
        <div className="card">
          <strong>โหลดต่อสถานี (คอขวด)</strong>
          {Object.entries(home.load).map(([st, n]) => (
            <div key={st} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
              <span style={{ flex: '0 0 110px' }}>{st}</span>
              <div style={{ flex: 1, background: 'var(--line)', borderRadius: 6, height: 18 }}>
                <div style={{ width: `${(n / maxLoad) * 100}%`, height: '100%', borderRadius: 6,
                  background: n === maxLoad && n > 1 ? '#b3403a' : 'var(--brand)' }} />
              </div>
              <span style={{ flex: '0 0 24px', textAlign: 'right', fontWeight: 700 }}>{n}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <strong>① คิวผลิต {home.queue.length > 0 && <span className="badge">{home.queue.length}</span>}</strong>
        <p className="muted" style={{ margin: '4px 0 0' }}>เรียงตามวันติดตั้งที่สัญญากับลูกค้า — เลื่อนคิวได้พร้อมเหตุผล</p>
        {home.queue.length === 0 && <p className="muted">ไม่มี package ค้างผลิต</p>}
        {home.queue.map((q, i) => (
          <div key={q.package_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div onClick={() => onOpenProject(q.project_id)} style={{ cursor: 'pointer' }}>
              <strong>{i + 1}. {q.project_name}</strong> · {q.code} {q.name}
              {q.queue_override != null && ' ⚡'}
            </div>
            <div className="muted">
              {q.install_date ? `ติดตั้ง ${D(q.install_date)}` : 'ยังไม่มีแผนติดตั้ง'}
              {q.current_stage ? ` · ขั้น: ${q.current_stage}` : ' · ครบ 12 ขั้น'}
              {q.material_count > 0 && (q.materials_ready ? ' · วัสดุครบ ✅' : ' · วัสดุไม่ครบ ⚠️')}
            </div>
            {rankPick !== q.package_id ? (
              i > 0 && <button className="btn btn-ghost" style={{ minHeight: 36, marginTop: 4 }}
                onClick={() => setRankPick(q.package_id)}>เลื่อนขึ้นคิวแรก</button>
            ) : (
              <div style={{ marginTop: 4 }}>
                <input placeholder="เหตุผล (บังคับ — ลง audit)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary" style={{ flex: 1, minHeight: 40 }} onClick={() => bump(q.package_id)}>ยืนยันเลื่อนคิว</button>
                  <button className="btn btn-ghost" style={{ minHeight: 40, width: 'auto' }} onClick={() => setRankPick(null)}>ปิด</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <strong>② วัสดุรอสั่ง/รอรับ {home.materials_pending.length > 0 && <span className="badge">{home.materials_pending.length}</span>}</strong>
        {home.materials_pending.length === 0 && <p className="muted">วัสดุครบทุก package ✅</p>}
        {home.materials_pending.map((m) => (
          <div key={m.material_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div>{m.package_code} · {m.name} — {m.qty} {m.unit} <span className="muted">({m.project_name})</span></div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {m.status === 'pending' && (
                <button className="btn btn-ghost" style={{ flex: 1, minHeight: 40 }}
                  onClick={() => materialStatus(m.material_id, 'ordered')}>สั่งแล้ว</button>
              )}
              <button className="btn btn-primary" style={{ flex: 1, minHeight: 40 }}
                onClick={() => materialStatus(m.material_id, 'received')}>รับของแล้ว</button>
              <button className="btn btn-ghost" style={{ minHeight: 40, width: 'auto' }}
                onClick={() => shortage(m.material_id)}>ของขาด 🔩</button>
            </div>
          </div>
        ))}
      </div>

      <CalibrationCard />

      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>{msg}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}

// ADR-051: เทียบประเมิน vs จริงของ package ที่จบ — B4 เห็นว่าตัวเองเพี้ยนทางไหน แม่นขึ้นทุกบ้าน
interface CalibRow { code: string; project_name: string; total_est: number; material_est: number; labor_est: number; actual_material: number; actual_rework: number }
interface Calib { note: string; packages: CalibRow[]; material_bias_ratio: number | null }

function CalibrationCard() {
  const [c, setC] = useState<Calib | null>(null);
  const [open, setOpen] = useState(false);
  const THB = (n: number) => Number(n).toLocaleString('th-TH');

  function load() {
    supabase().rpc('rpc_factory_estimate_calibration').then(({ data }) => setC(data as Calib));
  }

  return (
    <div className="card">
      <strong>📏 ความแม่นการประเมิน (estimate vs จริง)</strong>
      {!open ? (
        <button className="btn btn-ghost" style={{ minHeight: 40, marginTop: 6 }}
          onClick={() => { setOpen(true); load(); }}>ดูผลเทียบ →</button>
      ) : !c ? <p className="muted">กำลังโหลด…</p> : (
        <>
          {c.material_bias_ratio != null && (
            <p style={{ fontWeight: 700, margin: '6px 0' }}>
              bias วัสดุ: {c.material_bias_ratio}
              <span className="muted" style={{ fontWeight: 400 }}>
                {' '}({c.material_bias_ratio > 1 ? 'ประเมินวัสดุต่ำไป — เผื่อเพิ่ม' : c.material_bias_ratio < 1 ? 'เผื่อวัสดุเยอะไป' : 'ตรงเป๊ะ'})
              </span>
            </p>
          )}
          {c.packages.length === 0 && <p className="muted">ยังไม่มี package ที่จบพร้อมตัวเลขประเมิน</p>}
          {c.packages.map((p) => (
            <div key={p.code + p.project_name} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <div><strong>{p.code}</strong> {p.project_name}</div>
              <div className="muted">
                วัสดุ: ประเมิน {THB(p.material_est)} → จริง {THB(p.actual_material)}
                {p.actual_rework > 0 ? ` · แก้งาน ${THB(p.actual_rework)}` : ''} · ค่าแรงประเมิน {THB(p.labor_est)}
              </div>
            </div>
          ))}
          <p className="muted" style={{ marginBottom: 0 }}>{c.note}</p>
        </>
      )}
    </div>
  );
}
