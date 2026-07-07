// ความคืบหน้าโรงงาน 6 สถานี (0107) — FYI ทุกสถานี + gate ดีไซเนอร์ 2 จุด (Assembly/Packing)
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Milestone {
  id: string; station: string; is_gate: boolean; note: string | null;
  reported_at: string; approved_at: string | null;
}

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

  useEffect(() => {
    supabase().rpc('rpc_factory_list_milestones', { p_project_id: projectId })
      .then(({ data }) => setMs((data ?? []) as Milestone[]));
  }, [projectId]);

  const bySt = new Map(ms.map((m) => [m.station, m]));
  const started = ms.length > 0;

  return (
    <div className="card">
      <strong>การผลิต (โรงงาน)</strong>
      {!started && <p className="muted">ยังไม่เริ่มผลิต</p>}
      {started && STATIONS.map((s) => {
        const m = bySt.get(s.key);
        const state = !m ? '⬜ รอ'
          : s.gate ? (m.approved_at ? '✅ ดีไซเนอร์ตรวจผ่าน' : '🟡 รอดีไซเนอร์ตรวจ')
          : '✅ เสร็จ';
        return (
          <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <span>{s.label}{s.gate ? ' (จุดตรวจ)' : ''}</span>
            <span className={m ? '' : 'muted'}>{state}</span>
          </div>
        );
      })}
    </div>
  );
}
