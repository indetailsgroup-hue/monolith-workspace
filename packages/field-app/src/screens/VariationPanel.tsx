// Variation Order (0132/0133/0143 — มติ D4): งานเพิ่ม/เปลี่ยนแบบต้องมี VO เซ็นก่อนทำ ห้ามตกลงปากเปล่า
// ดีเลย์ >0 วัน ต้องระบุสาเหตุ 1 ใน 6 (ADR-050) — เข้าเนื้อความ VO อัตโนมัติ
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Vo {
  vo_id: string; vo_number: number; reason: string; status: string;
  price_impact: number; time_impact_days: number; sent_at: string | null; approved_at: string | null;
}

const DELAY_CATS = [
  { key: 'weather', label: '🌧️ ฝน/อากาศ' },
  { key: 'client_decision', label: '🤔 ลูกค้าตัดสินใจ' },
  { key: 'lead_time', label: '📦 ของรอนาน' },
  { key: 'hidden_condition', label: '🧱 หน้างานซ่อนอยู่' },
  { key: 'subcontractor', label: '👷 ผู้รับเหมาช่วง' },
  { key: 'permit', label: '📋 ใบอนุญาต' },
];
const STATUS_TH: Record<string, string> = {
  draft: 'ร่าง', sent: '📨 ส่งให้ลูกค้าแล้ว', signed: '✅ เซ็นแล้ว', approved: '✅ อนุมัติแล้ว',
};
const THB = (n: number) => Number(n).toLocaleString('th-TH');

export function VariationPanel({ projectId }: { projectId: string }) {
  const [vos, setVos] = useState<Vo[]>([]);
  const [creating, setCreating] = useState(false);
  const [reason, setReason] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [days, setDays] = useState('');
  const [delayCat, setDelayCat] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_field_list_variations', { p_project_id: projectId })
      .then(({ data }) => setVos((data ?? []) as Vo[]));
  }, [projectId]);
  useEffect(load, [load]);

  const nDays = Number(days.replace(/[, ]/g, '')) || 0;

  async function create() {
    setErr(''); setMsg('');
    const { data, error } = await supabase().rpc('rpc_field_create_variation', {
      p_project_id: projectId, p_reason: reason.trim(), p_description: desc.trim(),
      p_price_impact: Number(price.replace(/[, ]/g, '')) || 0,
      p_time_impact_days: nDays,
      p_delay_category: nDays > 0 ? delayCat || null : null,
      p_notice_date: nDays > 0 ? new Date().toISOString().slice(0, 10) : null,
    });
    if (error) { setErr(error.message); return; }
    const r = data as { vo_number: number };
    setMsg(`สร้าง VO #${r.vo_number} แล้ว — กด "ส่งให้ลูกค้าเซ็น" ก่อนเริ่มงานเพิ่ม`);
    setCreating(false); setReason(''); setDesc(''); setPrice(''); setDays(''); setDelayCat('');
    load();
  }

  async function send(voId: string) {
    setErr(''); setMsg('');
    const { error } = await supabase().rpc('rpc_field_send_variation', { p_vo_id: voId });
    if (error) { setErr(error.message); return; }
    setMsg('ส่ง VO เข้ากลุ่มลูกค้าแล้ว 📨 — รอเซ็นก่อนเริ่มงาน');
    load();
  }

  async function markSigned(voNumber: number) {
    setErr(''); setMsg('');
    const { error } = await supabase().rpc('rpc_field_submit_signed_variation', {
      p_project_id: projectId, p_client_key: crypto.randomUUID(), p_vo_number: voNumber,
    });
    if (error) { setErr(error.message); return; }
    setMsg(`บันทึก VO #${voNumber} เซ็นแล้ว ✅ — เริ่มงานเพิ่มได้`);
    load();
  }

  return (
    <div className="card">
      <strong>งานเพิ่ม/เปลี่ยนแบบ (VO) {vos.length > 0 && <span className="badge">{vos.length}</span>}</strong>
      <p className="muted" style={{ margin: '4px 0 0' }}>ลูกค้าขอเพิ่ม = สร้าง VO ให้เซ็นก่อนทำ — ห้ามตกลงปากเปล่า</p>
      {vos.map((v) => (
        <div key={v.vo_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <div><strong>VO #{v.vo_number}</strong> {v.reason} · {STATUS_TH[v.status] ?? v.status}</div>
          <div className="muted">
            {v.price_impact !== 0 ? `+${THB(v.price_impact)} บาท` : 'ไม่กระทบราคา'}
            {v.time_impact_days > 0 ? ` · +${v.time_impact_days} วัน` : ''}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            {!v.sent_at && !v.approved_at && (
              <button className="btn btn-primary" style={{ flex: 1, minHeight: 40 }} onClick={() => send(v.vo_id)}>ส่งให้ลูกค้าเซ็น 📨</button>
            )}
            {v.sent_at && !v.approved_at && (
              <button className="btn btn-accent" style={{ flex: 1, minHeight: 40 }} onClick={() => markSigned(v.vo_number)}>ลูกค้าเซ็นแล้ว ✅</button>
            )}
          </div>
        </div>
      ))}

      {!creating ? (
        <button className="btn btn-ghost" style={{ minHeight: 40, marginTop: 6 }} onClick={() => setCreating(true)}>+ สร้าง VO ใหม่</button>
      ) : (
        <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--line)', borderRadius: 10 }}>
          <input placeholder="เรื่อง เช่น เพิ่มตู้รองเท้าหน้าบ้าน" value={reason} onChange={(e) => setReason(e.target.value)} />
          <input placeholder="รายละเอียด/ขอบเขตที่เปลี่ยน" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <div style={{ display: 'flex', gap: 6 }}>
            <input placeholder="ราคาเพิ่ม (บาท)" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
            <input placeholder="เวลาเพิ่ม (วัน)" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          {nDays > 0 && (
            <>
              <p className="muted" style={{ margin: '6px 0 2px' }}>เวลาเพิ่ม &gt; 0 — เลือกสาเหตุ (บังคับ ลง VO + audit):</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DELAY_CATS.map((c) => (
                  <button key={c.key} className="btn btn-ghost"
                    style={{ minHeight: 40, width: 'auto', flex: '1 1 45%', borderColor: delayCat === c.key ? 'var(--brand)' : undefined, fontWeight: delayCat === c.key ? 700 : 400 }}
                    onClick={() => setDelayCat(c.key)}>{c.label}</button>
                ))}
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={!reason.trim() || !desc.trim()} onClick={create}>สร้าง VO</button>
            <button className="btn btn-ghost" style={{ minHeight: 44, width: 'auto' }} onClick={() => setCreating(false)}>ปิด</button>
          </div>
        </div>
      )}
      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>{msg}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
