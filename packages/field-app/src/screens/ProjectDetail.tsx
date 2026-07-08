import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { LeadPanel } from './LeadPanel';
import { MoneyPanel } from './MoneyPanel';
import { ProductionPanel } from './ProductionPanel';
import { RosterPanel } from './RosterPanel';
import { PlanPanel } from './PlanPanel';
import { ContractPanel } from './ContractPanel';
import { PackagePanel } from './PackagePanel';
import { PhotoSendCard } from './PhotoSendCard';

interface Lane { id: string; lane: number; assignee_employee_id: string | null; status: string }
interface Room { id: string; display_name: string; lanes: Lane[] }
interface Detail {
  id: string; name: string; status: string;
  rooms: Room[];
  bind_codes: { code: string; expires_at: string; uses_left: number }[];
  groups: { type: string; status: string }[];
}

export function ProjectDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_field_project_detail', { p_project_id: id }).then(({ data, error }) => {
      if (error) setErr(error.message); else setD(data as Detail);
    });
  }, [id]);
  useEffect(load, [load]);

  async function issueCode() {
    const { data, error } = await supabase().rpc('rpc_field_issue_bind_code', { p_project_id: id });
    if (error) { setErr(error.message); return; }
    alert(`รหัสผูกกลุ่ม: ${data}\n\nส่งให้หัวหน้างาน/Sale พิมพ์ในกลุ่ม LINE:\n#ผูก ${data} ทีม  หรือ  #ผูก ${data} ลูกค้า`);
    load();
  }

  if (err) return <div className="page"><p className="err">{err}</p><button className="btn btn-ghost" onClick={onBack}>ย้อนกลับ</button></div>;
  if (!d) return <div className="page muted">กำลังโหลด…</div>;

  return (
    <div className="page">
      <button className="btn btn-ghost" onClick={onBack}>← ทุกบ้าน</button>
      <div style={{ height: 12 }} />
      <div className="card">
        <h2 style={{ margin: 0 }}>{d.name}</h2>
        <div className="muted">
          กลุ่ม: {d.groups.length === 0 ? 'ยังไม่ผูก' : d.groups.map((g) => `${g.type === 'customer' ? 'ลูกค้า' : 'ทีม'}(${g.status === 'active' ? '✅' : 'ปิด'})`).join(' · ')}
        </div>
        {d.bind_codes.length > 0 && (
          <p>รหัสผูกที่ใช้ได้: {d.bind_codes.map((c) => <span key={c.code} className="badge" style={{ marginRight: 6 }}>{c.code} (เหลือ {c.uses_left})</span>)}</p>
        )}
        <button className="btn btn-accent" onClick={issueCode}>ออกรหัสผูกกลุ่ม LINE</button>
      </div>
      <MoneyPanel projectId={id} />
      <ContractPanel projectId={id} />
      <PackagePanel projectId={id} />
      <ProductionPanel projectId={id} />
      <RosterPanel projectId={id} />
      <PlanPanel projectId={id} />
      <PhotoSendCard projectId={id} />
      <LeadPanel projectId={id} onChanged={load} />
      {d.rooms.map((r) => (
        <div key={r.id} className="card">
          <strong>{r.display_name}</strong>
          {r.lanes.map((l) => (
            <div key={l.id} className="muted" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span>ช่างคนที่ {l.lane}</span>
              <span>{l.assignee_employee_id ? 'มอบแล้ว ✅' : 'ยังไม่มอบ'}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
