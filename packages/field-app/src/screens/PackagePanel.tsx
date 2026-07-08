// Package MW-xxx + millwork 12 ขั้น (0128/0131 — ADR-043 R-1): ชิ้นงานเดิน 12 ขั้นใต้บ้าน
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Pkg { package_id: string; code: string; name: string; status: string; done_stages: number; total_stages: number; current_stage: string | null }
interface Stage { seq: number; stage: string; label: string; is_gate: boolean; status: 'pending' | 'done'; done_at: string | null }
interface Detail { package_id: string; code: string; name: string; stages: Stage[] }

export function PackagePanel({ projectId }: { projectId: string }) {
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [open, setOpen] = useState<Detail | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_field_package_status', { p_project_id: projectId })
      .then(({ data }) => setPkgs((data ?? []) as Pkg[]));
  }, [projectId]);
  useEffect(load, [load]);

  async function openPkg(id: string) {
    const { data, error } = await supabase().rpc('rpc_field_package_detail', { p_package_id: id });
    if (error) { setErr(error.message); return; }
    setOpen(data as Detail);
  }

  async function createPkg() {
    setErr('');
    const { error } = await supabase().rpc('rpc_field_create_package', {
      p_project_id: projectId, p_code: code.trim().toUpperCase(), p_name: name.trim(),
    });
    if (error) { setErr(error.message); return; }
    setCode(''); setName('');
    load();
  }

  async function tickStage(stage: string) {
    if (!open) return;
    setErr('');
    const { error } = await supabase().rpc('rpc_field_package_stage_done', {
      p_package_id: open.package_id, p_stage: stage,
    });
    if (error) { setErr(error.message); return; }
    openPkg(open.package_id);
    load();
  }

  return (
    <div className="card">
      <strong>ชิ้นงาน (Package)</strong>
      {pkgs.length === 0 && <p className="muted">ยังไม่เปิด package — B4 เปิดตามแบบผลิต</p>}
      {pkgs.map((k) => (
        <div key={k.package_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <div onClick={() => (open?.package_id === k.package_id ? setOpen(null) : openPkg(k.package_id))} style={{ cursor: 'pointer' }}>
            <span style={{ fontWeight: 700 }}>{k.code}</span> {k.name} · {k.done_stages}/{k.total_stages}
            {k.status === 'done' ? ' ✅' : k.current_stage ? <span className="muted"> · ถัดไป: {k.current_stage}</span> : ''}
          </div>
          {open?.package_id === k.package_id && (
            <div style={{ marginTop: 6 }}>
              {open.stages.map((s) => (
                <div key={s.stage} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                  <span className={s.status === 'done' ? 'muted' : ''}>
                    {s.status === 'done' ? '✅' : '⬜'} {s.seq}. {s.label}{s.is_gate ? ' 🔍' : ''}
                  </span>
                  {s.status === 'pending' && open.stages.filter((x) => x.seq < s.seq).every((x) => x.status === 'done') && (
                    <button className="btn btn-primary" style={{ minHeight: 36, width: 'auto', padding: '2px 14px' }}
                      onClick={() => tickStage(s.stage)}>เสร็จ</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input placeholder="MW-001" value={code} onChange={(e) => setCode(e.target.value)} style={{ flex: '0 0 110px' }} />
        <input placeholder="ชื่อชิ้นงาน เช่น ตู้ครัวล่าง ชุด L" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
      </div>
      <button className="btn btn-accent" disabled={!code.trim() || !name.trim()} onClick={createPkg}>เปิด package (12 ขั้น)</button>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
