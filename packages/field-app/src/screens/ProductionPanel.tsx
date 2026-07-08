// ความคืบหน้าโรงงาน 6 สถานี (0107/0143) — FYI ทุกสถานี + gate ดีไซเนอร์ 2 จุด (Assembly/Packing)
// 0143: รายงานจบสถานีพร้อม checklist จาก Control Plan จริง + ค่า SC ลามิเนต (กดทับ ≥3 ชม. / ซ้อน ≤5 แผ่น)
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Milestone {
  id: string; station: string; is_gate: boolean; note: string | null;
  reported_at: string; approved_at: string | null;
}
interface CheckItem { station: string; seq: number; item: string; is_sc: boolean }

const STATIONS: { key: string; label: string; gate: boolean }[] = [
  { key: 'laminate', label: 'ปิดผิว', gate: false },
  { key: 'cutting', label: 'ตัด', gate: false },
  { key: 'edging', label: 'ปิดขอบ', gate: false },
  { key: 'cnc', label: 'CNC/เจาะ', gate: false },
  { key: 'assembly', label: 'ประกอบ', gate: true },
  { key: 'packing', label: 'แพ็ค', gate: true },
];

export function ProductionPanel({ projectId }: { projectId: string }) {
  const [ms, setMs] = useState<Milestone[]>([]);
  const [reporting, setReporting] = useState<string | null>(null);

  function load() {
    supabase().rpc('rpc_factory_list_milestones', { p_project_id: projectId })
      .then(({ data }) => setMs((data ?? []) as Milestone[]));
  }
  useEffect(load, [projectId]);

  const bySt = new Map(ms.map((m) => [m.station, m]));
  const started = ms.length > 0;

  return (
    <div className="card">
      <strong>การผลิต (โรงงาน)</strong>
      {!started && <p className="muted">ยังไม่เริ่มผลิต — รายงานจบสถานีแรกได้เลย</p>}
      {STATIONS.map((s) => {
        const m = bySt.get(s.key);
        const state = !m ? '⬜ รอ'
          : s.gate ? (m.approved_at ? '✅ ดีไซเนอร์ตรวจผ่าน' : '🟡 รอดีไซเนอร์ตรวจ')
          : '✅ เสร็จ';
        return (
          <div key={s.key} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{s.label}{s.gate ? ' (จุดตรวจ)' : ''}</span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className={m ? '' : 'muted'}>{state}</span>
                {!m && (
                  <button className="btn btn-primary" style={{ minHeight: 36, width: 'auto', padding: '2px 14px' }}
                    onClick={() => setReporting(reporting === s.key ? null : s.key)}>รายงานจบ</button>
                )}
              </span>
            </div>
            {reporting === s.key && (
              <StationReportForm projectId={projectId} station={s.key} label={s.label}
                onDone={() => { setReporting(null); load(); }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// 0143: checklist จาก Control Plan (soft — ค้าง = ลง audit) + SC ลามิเนตบังคับกรอก
function StationReportForm({ projectId, station, label, onDone }: {
  projectId: string; station: string; label: string; onDone: () => void;
}) {
  const [items, setItems] = useState<CheckItem[]>([]);
  const [ticks, setTicks] = useState<Record<number, boolean>>({});
  const [press, setPress] = useState('');
  const [stack, setStack] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    supabase().from('factory_station_checklists').select('station,seq,item,is_sc')
      .eq('station', station).order('seq')
      .then(({ data }) => setItems((data ?? []) as CheckItem[]));
  }, [station]);

  async function submit() {
    setErr(''); setMsg('');
    const checklist: Record<string, boolean> = {};
    items.forEach((i) => { checklist[String(i.seq)] = ticks[i.seq] ?? false; });
    const scValues = station === 'laminate'
      ? { press_hours: Number(press.replace(/[, ]/g, '')), stack_count: Number(stack.replace(/[, ]/g, '')) }
      : null;
    const { data, error } = await supabase().rpc('rpc_factory_report_station', {
      p_project_id: projectId, p_station: station, p_note: note.trim() || null,
      p_checklist: checklist, p_sc_values: scValues,
    });
    if (error) { setErr(error.message); return; }
    const r = data as { gate: boolean; checklist_warning: string | null; sc_warning: string | null };
    const warns = [r.checklist_warning, r.sc_warning].filter(Boolean).join(' · ');
    setMsg(warns ? `บันทึกแล้ว ⚠️ ${warns}` : `จบสถานี${label}แล้ว ✅${r.gate ? ' — ส่งดีไซเนอร์ตรวจ' : ''}`);
    setTimeout(onDone, 1200);
  }

  return (
    <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--line)', borderRadius: 10 }}>
      {items.map((i) => (
        <label key={i.seq} style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: i.is_sc ? 700 : 400, margin: '8px 0' }}>
          <input type="checkbox" style={{ width: 22, height: 22, minHeight: 0 }}
            checked={ticks[i.seq] ?? false} onChange={(e) => setTicks({ ...ticks, [i.seq]: e.target.checked })} />
          {i.item}{i.is_sc ? ' ⭐' : ''}
        </label>
      ))}
      {station === 'laminate' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input placeholder="กดทับกี่ ชม. (≥3)" inputMode="decimal" value={press} onChange={(e) => setPress(e.target.value)} />
          <input placeholder="ซ้อนกี่แผ่น (≤5)" inputMode="numeric" value={stack} onChange={(e) => setStack(e.target.value)} />
        </div>
      )}
      <input placeholder="หมายเหตุ (ถ้ามี)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn btn-primary" onClick={submit}>ยืนยันจบสถานี{label}</button>
      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600, margin: '6px 0 0' }}>{msg}</p>}
      {err && <p className="err" style={{ margin: '6px 0 0' }}>{err}</p>}
    </div>
  );
}
