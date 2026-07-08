// หน้าแรก Sale "งานขายของฉันวันนี้" (0118 — มติ Sale-5): ระบบสแกนแล้วสรุปว่าคุณค้างอะไร
// ① lead ต้องตาม (เงียบนานสุดก่อน) ② บ้านที่รอ Sale ③ ปุ่มใหญ่เปิดใบใหม่
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Lead { conversation_id: string; days_silent: number; last_activity_at: string }
interface House { project_id: string; name: string; waiting_on: { key: string; label: string }[] }
interface Home { leads: Lead[]; houses: House[] }

const LOST_REASONS = [
  { key: 'too_expensive', label: 'แพงไป' },
  { key: 'went_quiet', label: 'เงียบหายเอง' },
  { key: 'competitor', label: 'ไปเจ้าอื่น' },
  { key: 'other', label: 'อื่นๆ' },
];

export function SaleHome({ onOpenProject, onNewRequirement, onSummary }: {
  onOpenProject: (id: string) => void; onNewRequirement: () => void; onSummary: () => void;
}) {
  const [home, setHome] = useState<Home | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_field_sale_home').then(({ data, error }) => {
      if (error) setErr(error.message); else setHome(data as Home);
    });
  }, []);
  useEffect(load, [load]);

  async function closeLead(id: string, reason: string) {
    setErr('');
    const { error } = await supabase().rpc('rpc_field_close_lead', { p_conversation_id: id, p_reason: reason });
    if (error) { setErr(error.message); return; }
    setClosing(null);
    load();
  }

  if (err && !home) return <div className="page"><p className="err">{err}</p></div>;
  if (!home) return <div className="page muted">กำลังโหลด…</div>;

  return (
    <div className="page">
      <h2 style={{ margin: '4px 0 12px' }}>งานขายของฉันวันนี้</h2>

      <div className="card">
        <strong>① Lead ต้องตาม {home.leads.length > 0 && <span className="badge">{home.leads.length}</span>}</strong>
        {home.leads.length === 0 && <p className="muted">ไม่มี lead ค้างตาม 🎉</p>}
        {home.leads.map((l) => (
          <div key={l.conversation_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div>ลูกค้าเงียบมา <strong>{l.days_silent} วัน</strong> — ทักไปหน่อยครับ</div>
            {closing !== l.conversation_id ? (
              <button className="btn btn-ghost" style={{ minHeight: 40, marginTop: 6 }}
                onClick={() => setClosing(l.conversation_id)}>ปิด lead นี้</button>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {LOST_REASONS.map((r) => (
                  <button key={r.key} className="btn btn-ghost" style={{ minHeight: 40, width: 'auto', flex: '1 1 40%' }}
                    onClick={() => closeLead(l.conversation_id, r.key)}>{r.label}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <strong>② บ้านที่รอคุณ {home.houses.length > 0 && <span className="badge">{home.houses.length}</span>}</strong>
        {home.houses.length === 0 && <p className="muted">ทุกบ้านเดินหน้าตามปกติ ✅</p>}
        {home.houses.map((h) => (
          <div key={h.project_id} onClick={() => onOpenProject(h.project_id)}
            style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
            <div style={{ fontWeight: 700 }}>{h.name} →</div>
            {h.waiting_on.map((w) => <div key={w.key} className="muted">• {w.label}</div>)}
          </div>
        ))}
      </div>

      <PriceEstimateCard />

      <button className="btn btn-primary" style={{ fontSize: 19 }} onClick={onNewRequirement}>
        + เปิดใบความต้องการใหม่
      </button>
      <button className="btn btn-ghost" style={{ minHeight: 40, marginTop: 8 }} onClick={onSummary}>
        ดูสรุปทีมขายเดือนนี้ (H1) →
      </button>
      {err && <p className="err">{err}</p>}
    </div>
  );
}

// เคาะช่วงราคาเบื้องต้น (0109/0147 — มติ Sale-1: ทุกตัวเลขที่ถึงหูลูกค้ามี snapshot ใน audit)
interface EstResult { min: number; max: number; message: string; hidden_cost_note: string; market_bands_sqm: { category: string; min: number; max: number }[] }

function PriceEstimateCard() {
  const [grades, setGrades] = useState<string[]>([]);
  const [grade, setGrade] = useState('');
  const [sqm, setSqm] = useState('');
  const [context, setContext] = useState('');
  const [result, setResult] = useState<EstResult | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    supabase().from('price_rates').select('material_grade')
      .then(({ data }) => setGrades(((data ?? []) as { material_grade: string }[]).map((r) => r.material_grade)));
  }, []);

  async function estimate() {
    setErr(''); setResult(null);
    const area = Number(sqm.replace(/[, ]/g, ''));
    if (!area || area <= 0 || !grade) { setErr('ใส่พื้นที่ + เลือกเกรดก่อนครับ'); return; }
    const { data, error } = await supabase().rpc('rpc_field_price_estimate', {
      p_sqm: area, p_grade: grade, p_context: context.trim() || null,
    });
    if (error) { setErr(error.message); return; }
    setResult(data as EstResult);
  }

  return (
    <div className="card">
      <strong>💬 เคาะช่วงราคาเบื้องต้น</strong>
      <p className="muted" style={{ margin: '4px 0 0' }}>ตัวเลขบันทึกลง audit อัตโนมัติ — ใช้ตอบลูกค้าได้เลย</p>
      <div style={{ display: 'flex', gap: 6 }}>
        <input placeholder="พื้นที่ (ตร.ม.)" inputMode="decimal" style={{ flex: 1 }}
          value={sqm} onChange={(e) => setSqm(e.target.value)} />
        <select value={grade} onChange={(e) => setGrade(e.target.value)} style={{ flex: 1 }}>
          <option value="">— เกรดวัสดุ —</option>
          {grades.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <input placeholder="งานอะไร เช่น ครัว L-shape คอนโด (เก็บใน audit)" value={context} onChange={(e) => setContext(e.target.value)} />
      <button className="btn btn-accent" onClick={estimate}>เคาะราคา</button>
      {result && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontWeight: 700, margin: 0 }}>{result.message}</p>
          <p className="muted" style={{ margin: '6px 0 0' }}>⚠️ {result.hidden_cost_note}</p>
          {result.market_bands_sqm.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary className="muted" style={{ cursor: 'pointer' }}>กรอบตลาด (ตร.ม.) เทียบ →</summary>
              {result.market_bands_sqm.map((b) => (
                <div key={b.category} className="muted" style={{ padding: '2px 0' }}>
                  {b.category}: {Number(b.min).toLocaleString('th-TH')}–{Number(b.max).toLocaleString('th-TH')}
                </div>
              ))}
            </details>
          )}
        </div>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
