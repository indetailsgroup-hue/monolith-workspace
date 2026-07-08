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
              <EstimateCard packageId={open.package_id} />
              <AddonCard packageId={open.package_id} />
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

// ADR-051/052: ประเมินต้นทุน = ชั่วโมงขั้นผลิต × เรทจริง + วัสดุ BOM + machine allowance → เทียบกรอบตลาด
const EST_STAGES = [
  { key: 'machining', label: 'ตัด/แมชชีน' },
  { key: 'assembly', label: 'ประกอบ' },
  { key: 'finishing', label: 'ทำสี/ผิว' },
  { key: 'qc_shop', label: 'QC โรงงาน' },
];
interface Band { category: string; grade_label: string; unit: string; price_min: number; price_max: number }

function EstimateCard({ packageId }: { packageId: string }) {
  const [show, setShow] = useState(false);
  const [hours, setHours] = useState<Record<string, string>>({});
  const [material, setMaterial] = useState('');
  const [allowance, setAllowance] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [cat, setCat] = useState('');
  const [lengthM, setLengthM] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!show) return;
    supabase().rpc('rpc_field_market_bands', { p_unit: 'm' }).then(({ data }) => {
      const bands = (data ?? []) as Band[];
      setCats([...new Set(bands.map((b) => b.category))]);
    });
  }, [show]);

  async function estimate() {
    setErr(''); setMsg('');
    const stageHours: Record<string, number> = {};
    EST_STAGES.forEach((s) => {
      const v = Number((hours[s.key] ?? '').replace(/[, ]/g, ''));
      if (v > 0) stageHours[s.key] = v;
    });
    const mat = Number(material.replace(/[, ]/g, ''));
    const len = Number(lengthM.replace(/[, ]/g, ''));
    const { data, error } = await supabase().rpc('rpc_factory_estimate_package', {
      p_package_id: packageId,
      p_stage_hours: stageHours,
      p_material_est: mat > 0 ? mat : null,
      p_machine_allowance: Number(allowance.replace(/[, ]/g, '')) || 0,
      p_band_category: cat && len > 0 ? cat : null,
      p_length_m: cat && len > 0 ? len : null,
    });
    if (error) { setErr(error.message); return; }
    const r = data as { total_est: number; material: number; labor: number; material_source: string; band_warning: string | null };
    const THB = (n: number) => Number(n).toLocaleString('th-TH');
    setMsg(`ประเมิน ${THB(r.total_est)} บาท (วัสดุ ${THB(r.material)}${r.material_source === 'bom' ? ' จาก BOM' : ''} + แรง ${THB(r.labor)})${r.band_warning ? ` ⚠️ ${r.band_warning}` : ' ✅'}`);
  }

  if (!show) {
    return <button className="btn btn-ghost" style={{ minHeight: 40, marginTop: 6 }}
      onClick={() => setShow(true)}>💰 ประเมินต้นทุน (B4) →</button>;
  }
  return (
    <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--line)', borderRadius: 10 }}>
      <strong>ชั่วโมงประเมินต่อขั้นผลิต</strong>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {EST_STAGES.map((s) => (
          <input key={s.key} placeholder={s.label + ' (ชม.)'} inputMode="decimal" style={{ flex: '1 1 45%' }}
            value={hours[s.key] ?? ''} onChange={(e) => setHours({ ...hours, [s.key]: e.target.value })} />
        ))}
      </div>
      <input placeholder="วัสดุ (บาท) — เว้นว่าง = ใช้ราคาจาก BOM ที่รับแล้ว" inputMode="numeric"
        value={material} onChange={(e) => setMaterial(e.target.value)} />
      <input placeholder="ค่าเครื่อง/allowance (บาท) — ไม่มีใส่ 0" inputMode="numeric"
        value={allowance} onChange={(e) => setAllowance(e.target.value)} />
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ flex: 1 }}>
          <option value="">— เทียบกรอบตลาด (ไม่บังคับ) —</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="ยาว (ม.)" inputMode="decimal" style={{ flex: '0 0 90px' }}
          value={lengthM} onChange={(e) => setLengthM(e.target.value)} />
      </div>
      <button className="btn btn-primary" onClick={estimate}>คำนวณ + บันทึกประเมิน</button>
      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600, margin: '6px 0 0' }}>{msg}</p>}
      {err && <p className="err" style={{ margin: '6px 0 0' }}>{err}</p>}
    </div>
  );
}

// ADR-054: smart add-on upsell — เสนอท้าย quote ทุกใบ (ticket +10–25% ไม่เพิ่มงานไม้)
interface Addon { code: string; name: string; description: string; price: number }
interface Attached { code: string; name: string; qty: number; price_each: number }

function AddonCard({ packageId }: { packageId: string }) {
  const [show, setShow] = useState(false);
  const [catalog, setCatalog] = useState<Addon[]>([]);
  const [attached, setAttached] = useState<Attached[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState('');
  const THB = (n: number) => Number(n).toLocaleString('th-TH');

  function load() {
    supabase().rpc('rpc_field_addon_catalog').then(({ data }) => setCatalog((data ?? []) as Addon[]));
    supabase().rpc('rpc_field_package_addons', { p_package_id: packageId }).then(({ data }) => {
      const r = data as { items: Attached[]; total: number } | null;
      setAttached(r?.items ?? []); setTotal(Number(r?.total ?? 0));
    });
  }

  async function toggle(code: string) {
    setErr('');
    const { error } = await supabase().rpc('rpc_field_toggle_package_addon', {
      p_package_id: packageId, p_code: code,
    });
    if (error) { setErr(error.message); return; }
    load();
  }

  if (!show) {
    return <button className="btn btn-ghost" style={{ minHeight: 40, marginTop: 6 }}
      onClick={() => { setShow(true); load(); }}>✨ Smart add-on (เสนอลูกค้าเพิ่ม) →</button>;
  }
  const on = new Set(attached.map((a) => a.code));
  return (
    <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--line)', borderRadius: 10 }}>
      <strong>Smart add-on — เสนอท้าย quote ทุกใบ</strong>
      {catalog.map((a) => (
        <label key={a.code} style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 400, margin: '8px 0' }}>
          <input type="checkbox" style={{ width: 22, height: 22, minHeight: 0 }}
            checked={on.has(a.code)} onChange={() => toggle(a.code)} />
          <span style={{ flex: 1 }}>{a.name} <span className="muted">— {a.description}</span></span>
          <span style={{ fontWeight: 700 }}>{THB(a.price)}</span>
        </label>
      ))}
      {total > 0 && <p style={{ fontWeight: 700, margin: '6px 0 0' }}>รวม add-on: {THB(total)} บาท</p>}
      {err && <p className="err" style={{ margin: '6px 0 0' }}>{err}</p>}
    </div>
  );
}
