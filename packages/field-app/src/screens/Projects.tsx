import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface ProjectRow {
  id: string; name: string; status: string;
  rooms: number; lanes_assigned: number;
  groups: { type: string; status: string }[];
}

export function Projects({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    supabase().rpc('rpc_field_list_projects').then(({ data, error }) => {
      if (error) setErr(error.message); else setRows((data ?? []) as ProjectRow[]);
    });
  }, []);

  return (
    <div className="page">
      <button className="btn btn-accent" onClick={onNew}>+ เปิดบ้านใหม่</button>
      <div style={{ height: 14 }} />
      {err && <p className="err">{err}</p>}
      {rows === null && !err && <p className="muted">กำลังโหลด…</p>}
      {rows?.length === 0 && <p className="muted">ยังไม่มีบ้านในระบบ — เริ่มจากปุ่มด้านบนได้เลยครับ</p>}
      {rows?.map((p) => (
        <div key={p.id} className="card" onClick={() => onOpen(p.id)} style={{ cursor: 'pointer' }}>
          <strong>{p.name}</strong>
          <div className="muted">
            {p.rooms} ห้อง · มอบช่างแล้ว {p.lanes_assigned} เลน
            {p.groups.some((g) => g.type === 'customer' && g.status === 'active') ? ' · กลุ่มลูกค้า ✅' : ' · ยังไม่ผูกกลุ่มลูกค้า'}
          </div>
          <span className="badge">{p.status === 'active' ? 'กำลังดำเนินการ' : p.status === 'customer_review' ? 'รอลูกค้าตรวจรับ' : p.status === 'completed' ? 'ส่งมอบแล้ว' : 'ยกเลิก'}</span>
        </div>
      ))}
    </div>
  );
}
