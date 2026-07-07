// มุมหัวหน้าทีม (Wave B — ADR-039/040): T0 → ส่งปิดบ้าน → ส่งตรวจรับ → ปัญหา/punch
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// T0 จาก SOP จริง (form_templates inst_site_readiness — 0091; ค่าคงที่ใช้จริง 5 ปี)
const T0 = ['เช็คแบบ 3D final จากฝ่ายวางแผน', 'เช็คพื้น', 'เช็ค Defect', 'เช็คระบบไฟ', 'เช็คระบบน้ำ', 'เช็คผนัง', 'เช็คประตู', 'เช็คฝ้า'];

interface Issue { id: string; description: string; status: string; source: string }

export function LeadPanel({ projectId, onChanged }: { projectId: string; onChanged: () => void }) {
  const [t0, setT0] = useState<Record<string, boolean>>({});
  const [issues, setIssues] = useState<Issue[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  function loadIssues() {
    supabase().rpc('rpc_field_list_issues', { p_project_id: projectId })
      .then(({ data }) => setIssues((data ?? []) as Issue[]));
  }
  useEffect(loadIssues, [projectId]);

  async function saveT0() {
    setErr(''); setMsg('');
    const { error } = await supabase().rpc('rpc_field_t0_snapshot', { p_project_id: projectId, p_checklist: t0 });
    if (error) { setErr(error.message); return; }
    setMsg('บันทึกความพร้อมหน้างานแล้ว ✅');
  }

  async function closeHouse() {
    setErr(''); setMsg('');
    const { data, error } = await supabase().rpc('rpc_field_close_house', {
      p_project_id: projectId, p_client_key: crypto.randomUUID(),
    });
    if (error) { setErr(error.message); return; }
    const warn = (data as { rooms_without_proof: number }).rooms_without_proof;
    setMsg(warn > 0 ? `ปิดบ้านแล้ว ✅ (มี ${warn} ห้องที่ยังไม่มีรูป — บันทึกไว้ใน audit แล้ว)` : 'ปิดบ้านเรียบร้อย ✅');
    onChanged();
  }

  async function requestAcceptance() {
    setErr(''); setMsg('');
    const { error } = await supabase().rpc('rpc_request_customer_acceptance', { p_project_id: projectId });
    if (error) { setErr(error.message); return; }
    setMsg('ส่งการ์ดตรวจรับเข้ากลุ่มลูกค้าแล้ว 🏠');
    onChanged();
  }

  async function resolveIssue(id: string) {
    await supabase().rpc('rpc_field_resolve_issue', { p_issue_id: id });
    loadIssues();
  }

  const open = issues.filter((i) => i.status !== 'resolved');

  return (
    <>
      <div className="card">
        <strong>ความพร้อมหน้างาน (ก่อนเริ่มติดตั้ง)</strong>
        {T0.map((label) => (
          <label key={label} style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 400, margin: '10px 0' }}>
            <input type="checkbox" style={{ width: 24, height: 24, minHeight: 0 }}
              checked={t0[label] ?? false} onChange={(e) => setT0({ ...t0, [label]: e.target.checked })} />
            {label}
          </label>
        ))}
        <button className="btn btn-ghost" onClick={saveT0}>บันทึกความพร้อม</button>
      </div>

      <div className="card">
        <strong>ปัญหาหน้างาน {open.length > 0 && <span className="badge">{open.length} เรื่องค้าง</span>}</strong>
        {issues.length === 0 && <p className="muted">ยังไม่มีปัญหาแจ้งเข้ามา</p>}
        {issues.map((i) => (
          <div key={i.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div>{i.status === 'resolved' ? '✅ ' : '🔴 '}{i.description}</div>
            {i.status !== 'resolved' && (
              <button className="btn btn-ghost" style={{ minHeight: 40, marginTop: 6 }} onClick={() => resolveIssue(i.id)}>ปิดเรื่องนี้ (แก้แล้ว)</button>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <strong>จบงาน</strong>
        <p className="muted">ปิดบ้านได้เฉพาะหัวหน้าทีมติดตั้ง — ระบบตรวจสิทธิ์ให้เอง</p>
        <button className="btn btn-primary" onClick={closeHouse}>ส่งปิดบ้าน (งานช่างเสร็จครบ)</button>
        <button className="btn btn-accent" onClick={requestAcceptance} disabled={open.length > 0}
          title={open.length > 0 ? 'ปิดปัญหาค้างให้หมดก่อน' : ''}>
          ส่งตรวจรับให้ลูกค้า {open.length > 0 ? `(ปิด ${open.length} เรื่องค้างก่อน)` : ''}
        </button>
        {msg && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>{msg}</p>}
        {err && <p className="err">{err}</p>}
      </div>
    </>
  );
}
