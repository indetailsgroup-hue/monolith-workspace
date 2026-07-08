// ใบบันทึกความต้องการ (Sale) — ประตูทางเข้า pipeline (0103: กรอกจบ = งานเปิด)
// 3 หมวดตาม PFMEA Sale: ติดต่อ (Scrap 100% ถ้าพลาด) · ขอบเขต 9 ฟิลด์ · ดีไซน์
import { useState } from 'react';
import { supabase } from '../lib/supabase';

const SITE = 'BKK-HQ-01';

const F = {
  customer_name: 'ชื่อลูกค้า *', phone: 'เบอร์โทร *(หรือ LINE)', line_id: 'LINE ID', email: 'อีเมล', address: 'ที่อยู่',
  project_name: 'ชื่อโครงการ/บ้าน *', unit_type: 'แบบบ้าน/ห้อง', design_scope_sqm: 'พื้นที่ออกแบบ (ตร.ม.)',
  design_scope_areas: 'ห้อง/ส่วนที่ทำ', design_style: 'สไตล์ที่ต้องการ', structure_material: 'วัสดุโครงสร้าง',
  carcass_material: 'วัสดุโครงตู้', surface_material: 'วัสดุปิดผิว', fitting_brand: 'แบรนด์อุปกรณ์',
  mood_tone: 'Mood & Tone', function_notes: 'การใช้งาน/โน้ต',
} as const;
type Key = keyof typeof F;
const GROUPS: { title: string; keys: Key[] }[] = [
  { title: '1 · ข้อมูลติดต่อ (พลาดไม่ได้)', keys: ['customer_name', 'phone', 'line_id', 'email', 'address'] },
  { title: '2 · ขอบเขตงาน', keys: ['project_name', 'unit_type', 'design_scope_sqm', 'design_scope_areas', 'design_style', 'structure_material', 'carcass_material', 'surface_material', 'fitting_brand'] },
  { title: '3 · ดีไซน์', keys: ['mood_tone', 'function_notes'] },
];

export function RequirementForm({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState<Record<string, string>>({});
  const [key] = useState(() => crypto.randomUUID()); // idempotency ต่อการเปิดฟอร์มหนึ่งครั้ง
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [bindCode, setBindCode] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const ok = (v.customer_name ?? '').trim() && ((v.phone ?? '').trim() || (v.line_id ?? '').trim()) && (v.project_name ?? '').trim();

  async function submit() {
    setBusy(true); setErr('');
    const fields = Object.fromEntries(Object.entries(v).filter(([, x]) => x.trim() !== ''));
    const { data, error } = await supabase().rpc('rpc_field_submit_requirement', {
      p_fields: fields, p_site_code: SITE, p_client_key: key,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setBindCode((data as { bind_code: string | null }).bind_code ?? null);
    setDone(true);
  }

  // J2.8: กลุ่มลูกค้าเกิดตั้งแต่ qualify — กรอกจบ = งานเปิด + บ้านเปิด + รหัสผูกออกทันที (0113)
  if (done) return (
    <div className="page"><div className="card">
      <h2 style={{ marginTop: 0 }}>เปิดงานเรียบร้อย ✅</h2>
      <p>ใบบันทึกความต้องการถูกบันทึก ระบบเปิดงานขาย + เปิดบ้านให้แล้วครับ</p>
      {bindCode && (
        <>
          <p style={{ fontWeight: 700, marginBottom: 4 }}>ตั้งกลุ่ม LINE กับลูกค้าเลย (3 ขั้น):</p>
          <ol style={{ marginTop: 0, paddingLeft: 22 }}>
            <li>สร้างกลุ่ม LINE ใหม่ ดึงลูกค้า + DAPH OA เข้ากลุ่ม</li>
            <li>พิมพ์ในกลุ่ม: <code style={{ fontSize: 20, fontWeight: 700 }}>#ผูก {bindCode} ลูกค้า</code></li>
            <li>บอทตอบยืนยันชื่อบ้าน — เช็คว่าตรงกับบ้านนี้ก่อนคุยต่อ</li>
          </ol>
          <p className="muted">รหัสใช้ได้ 48 ชม. — ออกใหม่ได้จากหน้ารายละเอียดบ้าน</p>
        </>
      )}
      <button className="btn btn-primary" onClick={onDone}>กลับหน้าหลัก</button>
    </div></div>
  );

  return (
    <div className="page">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>ใบบันทึกความต้องการ</h2>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p style={{ fontWeight: 700, color: 'var(--brand)', marginBottom: 0 }}>{g.title}</p>
            {g.keys.map((k) => (
              <div key={k}>
                <label>{F[k]}</label>
                <input value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })}
                  inputMode={k === 'phone' ? 'tel' : k === 'design_scope_sqm' ? 'decimal' : 'text'} />
              </div>
            ))}
          </div>
        ))}
        <p className="muted">ค่าที่ลูกค้ายังไม่ตัดสินใจ ให้พิมพ์ "TBD" — อย่าปล่อยว่างถ้าคุยแล้ว</p>
        <button className="btn btn-primary" onClick={submit} disabled={!ok || busy}>
          {busy ? 'กำลังบันทึก…' : 'บันทึก + เปิดงาน'}
        </button>
        {err && <p className="err">{err}</p>}
        <button className="btn btn-ghost" onClick={onDone}>ย้อนกลับ</button>
      </div>
    </div>
  );
}
