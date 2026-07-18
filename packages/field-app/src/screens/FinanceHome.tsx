// หน้าแรก F3 "งานเงินของฉันวันนี้" (0137 — ADR-046 มติ 4): ระบบสแกนแล้วบอกว่าคุณค้างอะไร
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
// S18 Slice 3: ใบเสร็จแยก VAT (ACC-8 — composeFromNet ผ่าน src/tax/receipt ของ workspace)
import { buildReceiptVatBreakdown } from '../../../../src/tax/receipt';

interface Row {
  installment_id: string; project_id: string; name: string;
  seq: number; label: string; amount: number; days_waiting: number; has_slip?: boolean;
}
interface Home {
  awaiting: Row[]; overdue: Row[];
  received_today: { count: number; total: number };
}

const THB = (n: number) => Number(n).toLocaleString('th-TH');

export function FinanceHome({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const [home, setHome] = useState<Home | null>(null);
  const [note, setNote] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_finance_home').then(({ data, error }) => {
      if (error) setErr(error.message); else setHome(data as Home);
    });
  }, []);
  useEffect(load, [load]);

  async function record(id: string) {
    setErr(''); setMsg('');
    const { error } = await supabase().rpc('rpc_finance_record_payment', {
      p_installment_id: id, p_note: note.trim() || null,
    });
    if (error) { setErr(error.message); return; }
    setMsg('บันทึกรับแล้ว — ใบเสร็จ + การ์ดขอบคุณส่งเข้ากลุ่มอัตโนมัติ 🧾');
    setPick(null); setNote('');
    load();
  }

  // S8-2: อัปโหลดรูปสลิปจริง (path ใต้ field/finance/ ตาม storage policy 0106) แล้วผูกกับงวด
  async function attachSlip(id: string, file: File | null) {
    setErr(''); setMsg('');
    let storagePath: string | null = null;
    if (file) {
      storagePath = `field/finance/${id}/${crypto.randomUUID()}.jpg`;
      const up = await supabase().storage.from('installation-media')
        .upload(storagePath, file, { contentType: file.type || 'image/jpeg', upsert: true });
      if (up.error) { setErr(up.error.message); return; }
    }
    const { error } = await supabase().rpc('rpc_finance_submit_slip', {
      p_installment_id: id, p_storage_path: storagePath,
      p_client_key: crypto.randomUUID(), p_note: note.trim() || null,
    });
    if (error) { setErr(error.message); return; }
    setMsg('ผูกสลิปกับงวดแล้ว ✅ — เช็คยอดแบงก์แล้วค่อยกดบันทึกรับ');
    load();
  }

  if (err && !home) return <div className="page"><p className="err">{err}</p></div>;
  if (!home) return <div className="page muted">กำลังโหลด…</div>;

  return (
    <div className="page">
      <h2 style={{ margin: '4px 0 12px' }}>งานเงินของฉันวันนี้</h2>

      <div className="card">
        <strong>① งวดรอตรวจ/บันทึกรับ {home.awaiting.length > 0 && <span className="badge">{home.awaiting.length}</span>}</strong>
        {home.awaiting.length === 0 && <p className="muted">ไม่มีงวดค้างตรวจ 🎉</p>}
        {home.awaiting.map((r) => (
          <div key={r.installment_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div onClick={() => onOpenProject(r.project_id)} style={{ cursor: 'pointer' }}>
              <strong>{r.name}</strong> · งวด {r.seq} {r.label} — {THB(r.amount)} บาท
              <span className="muted"> · แจ้งแล้ว {r.days_waiting} วัน{r.has_slip ? ' · 🧾 มีสลิปแล้ว' : ''}</span>
            </div>
            {pick !== r.installment_id ? (
              <button className="btn btn-primary" style={{ minHeight: 40, marginTop: 6 }}
                onClick={() => setPick(r.installment_id)}>ตรวจ/บันทึกรับ</button>
            ) : (
              <div style={{ marginTop: 6 }}>
                {/* S18 Slice 3: ใบเสร็จแยก VAT (สมมติยอดงวด = ฐานก่อน VAT — รอบัญชียืนยัน ดู src/tax/receipt) */}
                <div className="muted" style={{ margin: '4px 0 6px' }}>
                  🧾 ใบเสร็จแยก VAT:
                  {buildReceiptVatBreakdown(r.amount).text.split('\n').map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
                <input placeholder="หมายเหตุ (เช่น โอน KBank 12:30)" value={note} onChange={(e) => setNote(e.target.value)} />
                <div style={{ display: 'flex', gap: 6 }}>
                  {!r.has_slip && (
                    <label className="btn btn-ghost" style={{ flex: 1, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      📷 แนบสลิป
                      <input type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={(e) => attachSlip(r.installment_id, e.target.files?.[0] ?? null)} />
                    </label>
                  )}
                  <button className="btn btn-accent" style={{ flex: 1, minHeight: 44 }}
                    onClick={() => record(r.installment_id)}>ยอดตรง — บันทึกรับ ✅</button>
                </div>
                <button className="btn btn-ghost" style={{ minHeight: 36, marginTop: 4 }} onClick={() => setPick(null)}>ปิด</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <strong>② ค้างชำระนาน {home.overdue.length > 0 && <span className="badge">{home.overdue.length}</span>}</strong>
        {home.overdue.length === 0 && <p className="muted">ไม่มีงวดค้างเกินกำหนด ✅</p>}
        {home.overdue.map((r) => (
          <div key={r.installment_id} onClick={() => onOpenProject(r.project_id)}
            style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
            🔴 <strong>{r.name}</strong> · งวด {r.seq} — {THB(r.amount)} บาท ค้าง {r.days_waiting} วัน →
            <div className="muted">ระบบเตือนสุภาพในกลุ่มแล้ว 1 ครั้ง — เกินขั้นสองประสาน Sale โทรตาม</div>
          </div>
        ))}
      </div>

      <div className="card">
        <strong>③ รับแล้ววันนี้</strong>
        <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700 }}>
          {THB(home.received_today.total)} บาท <span className="muted" style={{ fontSize: 15 }}>({home.received_today.count} งวด)</span>
        </p>
      </div>

      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>{msg}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
