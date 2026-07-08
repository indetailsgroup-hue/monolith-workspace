// Turnkey Package (0151 — ADR-055): เลือก tier → stamp ราคา+วันส่งมอบสัญญา+ประกัน ลง audit
// ตอบ Time-based Risk ของ Gen Y/Z — ราคานิ่ง เห็นวันส่งมอบตั้งแต่วันแรก; เซ็นสัญญาแล้วเปลี่ยน = เข้าเส้น VO
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Offer { tier: string; name: string; price: number; scope: string[]; delivery_days: number; warranty_years: number }
interface Attached { tier: string; price: number; scope: string[]; promised_date: string; warranty_years: number }

const THB = (n: number) => Number(n).toLocaleString('th-TH');
const D = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

export function TurnkeyCard({ projectId }: { projectId: string }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [attached, setAttached] = useState<Attached | null>(null);
  const [pick, setPick] = useState<Offer | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_field_turnkey_offers').then(({ data }) => setOffers((data ?? []) as Offer[]));
    supabase().rpc('rpc_field_project_turnkey', { p_project_id: projectId })
      .then(({ data }) => setAttached(data as Attached | null));
  }, [projectId]);
  useEffect(load, [load]);

  async function attach(tier: string) {
    setErr(''); setMsg('');
    const { data, error } = await supabase().rpc('rpc_field_attach_turnkey', {
      p_project_id: projectId, p_tier: tier,
    });
    if (error) { setErr(error.message); return; }
    const r = data as Attached;
    setMsg(`ล็อก package แล้ว ✅ ส่งมอบภายใน ${D(r.promised_date)} — ใช้ตัวเลขนี้คุยลูกค้าได้เลย`);
    setPick(null);
    load();
  }

  return (
    <div className="card">
      <strong>📦 Turnkey Package (คอนโด/ห้องเล็ก)</strong>
      {attached && (
        <p style={{ margin: '6px 0 0', fontWeight: 600 }}>
          {attached.tier.toUpperCase()} · {THB(attached.price)} บาท · ส่งมอบใน {D(attached.promised_date)} · ประกัน {attached.warranty_years} ปี
        </p>
      )}
      {!attached && <p className="muted" style={{ margin: '4px 0 0' }}>ราคานิ่ง + วันส่งมอบชัด — ปิดลูกค้า Gen Y/Z ที่กลัวงบบาน/งานช้า</p>}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        {offers.map((o) => (
          <button key={o.tier} className="btn btn-ghost"
            style={{ flex: 1, minHeight: 48, borderColor: (pick?.tier === o.tier || attached?.tier === o.tier) ? 'var(--brand)' : undefined, fontWeight: attached?.tier === o.tier ? 700 : 400 }}
            onClick={() => setPick(pick?.tier === o.tier ? null : o)}>
            {o.name.split(' — ')[0]}<br />{THB(o.price)}
          </button>
        ))}
      </div>
      {pick && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--line)', borderRadius: 10 }}>
          <strong>{pick.name}</strong> — {THB(pick.price)} บาท · ส่งมอบ {pick.delivery_days} วัน · ประกัน {pick.warranty_years} ปี
          {pick.scope.map((s) => <div key={s} className="muted">• {s}</div>)}
          <button className="btn btn-primary" style={{ marginTop: 6 }} onClick={() => attach(pick.tier)}>
            {attached ? `เปลี่ยนเป็น ${pick.tier}` : 'ล็อก package นี้ให้บ้านนี้'}
          </button>
        </div>
      )}
      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>{msg}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
