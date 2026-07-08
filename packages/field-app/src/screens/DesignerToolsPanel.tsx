// เครื่องมือดีไซเนอร์ 3 ตัว (0143/0144/0148 — ADR-050/052)
// ① ส่งมอบแบบเข้าผลิต (3D final + แบบ/3D ตรงกัน — ต้องครบทั้งคู่)
// ② แจ้งแก้ shop drawing (rev ใหม่ + หยุดใช้ rev เดิมทั้งไลน์)
// ③ Cabinet & Wall list 7 fields ตาม Master Matrix (+ห้อง — PB/MDF ธรรมดาห้ามครัว/ห้องน้ำ ระบบ block เอง)
import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function DesignerToolsPanel({ projectId }: { projectId: string }) {
  return (
    <div className="card">
      <strong>เครื่องมือดีไซเนอร์</strong>
      <DesignHandoffCard projectId={projectId} />
      <ShopDrawingCard projectId={projectId} />
      <CabinetListCard projectId={projectId} />
    </div>
  );
}

function DesignHandoffCard({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [final3d, setFinal3d] = useState(false);
  const [synced, setSynced] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function submit() {
    setErr(''); setMsg('');
    const { error } = await supabase().rpc('rpc_field_design_handoff', {
      p_project_id: projectId, p_summary: summary.trim(),
      p_is_3d_final: final3d, p_drawing_3d_synced: synced,
      p_client_key: crypto.randomUUID(),
    });
    if (error) { setErr(error.message); return; }
    setMsg('ส่งมอบแบบเข้าผลิตแล้ว ✅ — แจ้ง B4 อัตโนมัติ');
    setSummary(''); setFinal3d(false); setSynced(false);
  }

  if (!open) return <button className="btn btn-ghost" style={{ minHeight: 40, marginTop: 6 }} onClick={() => setOpen(true)}>📐 ส่งมอบแบบเข้าผลิต →</button>;
  return (
    <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--line)', borderRadius: 10 }}>
      <input placeholder="สรุปแบบที่ส่งมอบ เช่น ครัว+ตู้เสื้อผ้า rev.3" value={summary} onChange={(e) => setSummary(e.target.value)} />
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 400, margin: '8px 0' }}>
        <input type="checkbox" style={{ width: 22, height: 22, minHeight: 0 }} checked={final3d} onChange={(e) => setFinal3d(e.target.checked)} />
        3D เป็นไฟล์ final (ลูกค้าเซ็นแล้ว)
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 400, margin: '8px 0' }}>
        <input type="checkbox" style={{ width: 22, height: 22, minHeight: 0 }} checked={synced} onChange={(e) => setSynced(e.target.checked)} />
        แบบ 2D กับ 3D ตรงกันทุกจุด (ตรวจแล้ว)
      </label>
      <button className="btn btn-primary" onClick={submit}>ส่งมอบเข้าผลิต</button>
      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600, margin: '6px 0 0' }}>{msg}</p>}
      {err && <p className="err" style={{ margin: '6px 0 0' }}>{err}</p>}
    </div>
  );
}

function ShopDrawingCard({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [summary, setSummary] = useState('');
  const [matches, setMatches] = useState(false);
  const [updatedBoth, setUpdatedBoth] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function submit() {
    setErr(''); setMsg('');
    const { data, error } = await supabase().rpc('rpc_field_shop_drawing_revision', {
      p_project_id: projectId, p_bible_code: code.trim(), p_change_summary: summary.trim(),
      p_matches_signed_spec: matches, p_updated_both: updatedBoth,
    });
    if (error) { setErr(error.message); return; }
    const r = data as { next_rev: number };
    setMsg(`ออก rev.${r.next_rev} แล้ว ✅ — แจ้งโรงงานหยุดใช้ rev เดิมอัตโนมัติ`);
    setCode(''); setSummary(''); setMatches(false); setUpdatedBoth(false);
  }

  if (!open) return <button className="btn btn-ghost" style={{ minHeight: 40, marginTop: 6 }} onClick={() => setOpen(true)}>✏️ แจ้งแก้ shop drawing →</button>;
  return (
    <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--line)', borderRadius: 10 }}>
      <input placeholder="รหัสชิ้นงาน (bible code) เช่น MW-001" value={code} onChange={(e) => setCode(e.target.value)} />
      <input placeholder="แก้อะไร เช่น ขยับช่องเสียบปลั๊ก 5 ซม." value={summary} onChange={(e) => setSummary(e.target.value)} />
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 400, margin: '8px 0' }}>
        <input type="checkbox" style={{ width: 22, height: 22, minHeight: 0 }} checked={matches} onChange={(e) => setMatches(e.target.checked)} />
        ยังตรงกับสเปกที่ลูกค้าเซ็น (ไม่ตรง = เข้าเส้น VO)
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 400, margin: '8px 0' }}>
        <input type="checkbox" style={{ width: 22, height: 22, minHeight: 0 }} checked={updatedBoth} onChange={(e) => setUpdatedBoth(e.target.checked)} />
        อัปเดตทั้งแบบ 2D และ 3D แล้ว (บังคับ)
      </label>
      <button className="btn btn-primary" onClick={submit}>ออก revision ใหม่</button>
      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600, margin: '6px 0 0' }}>{msg}</p>}
      {err && <p className="err" style={{ margin: '6px 0 0' }}>{err}</p>}
    </div>
  );
}

// 7 fields ต่อชิ้นตาม Master Matrix — ขาด = ต้นทางสั่งของผิด (SEV 10); ระบบ block PB/MDF ในห้องเปียกเอง
interface CwlItem { cabinet_number: string; wall_size_number: string; material: string; functions_detail: string; drawers_detail: string; fitting_detail: string; shelves_detail: string; room: string; e_grade: string }
const EMPTY_ITEM: CwlItem = { cabinet_number: '', wall_size_number: '', material: '', functions_detail: '', drawers_detail: '', fitting_detail: '', shelves_detail: '', room: '', e_grade: '' };
const CWL_FIELDS: { key: keyof CwlItem; ph: string }[] = [
  { key: 'cabinet_number', ph: 'เลขตู้ เช่น C1' },
  { key: 'wall_size_number', ph: 'ผนัง/ขนาด เช่น W1 2.4m' },
  { key: 'room', ph: 'ห้อง เช่น ครัว / ห้องนอน' },
  { key: 'material', ph: 'วัสดุโครง เช่น HMR 15mm ลามิเนต' },
  { key: 'e_grade', ph: 'มาตรฐานไม้ E0 หรือ E1 (E2 ห้าม)' },
  { key: 'functions_detail', ph: 'ฟังก์ชัน' },
  { key: 'drawers_detail', ph: 'ลิ้นชัก (จำนวน/ราง)' },
  { key: 'fitting_detail', ph: 'ฟิตติ้ง (ยี่ห้อ/รุ่น)' },
  { key: 'shelves_detail', ph: 'ชั้นวาง' },
];

function CabinetListCard({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CwlItem[]>([]);
  const [cur, setCur] = useState<CwlItem>({ ...EMPTY_ITEM });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  function addItem() {
    setErr('');
    setItems([...items, cur]);
    setCur({ ...EMPTY_ITEM });
  }

  async function submit() {
    setErr(''); setMsg('');
    const { data, error } = await supabase().rpc('rpc_field_submit_cabinet_wall_list', {
      p_project_id: projectId, p_items: items, p_client_key: crypto.randomUUID(),
    });
    if (error) { setErr(error.message); return; }
    const r = data as { count: number; e_grade_warning: string | null };
    setMsg(r.e_grade_warning
      ? `ส่ง list ${r.count} ชิ้นแล้ว ⚠️ ${r.e_grade_warning}`
      : `ส่ง list ${r.count} ชิ้นแล้ว ✅ — เข้าระบบสั่งของ`);
    setItems([]);
  }

  if (!open) return <button className="btn btn-ghost" style={{ minHeight: 40, marginTop: 6 }} onClick={() => setOpen(true)}>🗄️ Cabinet & Wall list (7 fields) →</button>;
  return (
    <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--line)', borderRadius: 10 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
          <span>✅ {it.cabinet_number} · {it.room} · {it.material}</span>
          <button className="btn btn-ghost" style={{ minHeight: 32, width: 'auto', padding: '0 10px' }}
            onClick={() => setItems(items.filter((_, j) => j !== i))}>ลบ</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {CWL_FIELDS.map((f) => (
          <input key={f.key} placeholder={f.ph} style={{ flex: '1 1 45%' }}
            value={cur[f.key]} onChange={(e) => setCur({ ...cur, [f.key]: e.target.value })} />
        ))}
      </div>
      <button className="btn btn-accent" disabled={CWL_FIELDS.some((f) => f.key !== 'room' && f.key !== 'e_grade' && !cur[f.key].trim())}
        onClick={addItem}>+ เพิ่มชิ้นนี้</button>
      <button className="btn btn-primary" disabled={items.length === 0} onClick={submit}>
        ส่ง list ทั้งหมด ({items.length} ชิ้น)
      </button>
      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600, margin: '6px 0 0' }}>{msg}</p>}
      {err && <p className="err" style={{ margin: '6px 0 0' }}>{err}</p>}
    </div>
  );
}
