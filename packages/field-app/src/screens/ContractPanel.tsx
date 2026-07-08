// สัญญาจากข้อมูลก้อนเดียว (0117/0130 — มติ Sale-3): generate → ส่งการ์ด → บันทึกรูปเซ็น = งวดมัดจำยิงเอง
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Contract {
  doc_id: string; version: number; status: 'draft' | 'sent' | 'signed' | 'superseded';
  body: string; total: string | null; sent_at: string | null; signed_at: string | null;
}

const STATUS_TH: Record<Contract['status'], string> = {
  draft: '📝 ร่าง — รอส่ง', sent: '📨 ส่งแล้ว รอเซ็น', signed: '✅ เซ็นแล้ว', superseded: 'ฉบับเก่า',
};

export function ContractPanel({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<Contract[]>([]);
  const [showBody, setShowBody] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_field_list_contracts', { p_project_id: projectId })
      .then(({ data }) => setDocs((data ?? []) as Contract[]));
  }, [projectId]);
  useEffect(load, [load]);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setErr(''); setMsg('');
    const { error } = await fn();
    if (error) { setErr(error.message); return; }
    setMsg(ok);
    load();
  }

  const current = docs.filter((d) => d.status !== 'superseded');

  return (
    <div className="card">
      <strong>สัญญา</strong>
      {current.length === 0 && <p className="muted">ยังไม่มีสัญญา — generate จากใบ requirement + แผนงวดจริง</p>}
      {current.map((d) => (
        <div key={d.doc_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <div>ฉบับที่ {d.version} · {STATUS_TH[d.status]}{d.total ? ` · ${Number(d.total).toLocaleString('th-TH')} บาท` : ''}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            <button className="btn btn-ghost" style={{ minHeight: 40, width: 'auto' }}
              onClick={() => setShowBody(showBody === d.doc_id ? null : d.doc_id)}>
              {showBody === d.doc_id ? 'ซ่อนตัวสัญญา' : 'ดูตัวสัญญา'}
            </button>
            {d.status === 'draft' && (
              <button className="btn btn-primary" style={{ minHeight: 40, width: 'auto', flex: 1 }}
                onClick={() => run(() => supabase().rpc('rpc_field_send_contract', { p_doc_id: d.doc_id }),
                  'แจ้งลูกค้าแล้ว — นำสัญญาไปให้เซ็นตอนนัดพบ 📨')}>
                ส่งแจ้งลูกค้า
              </button>
            )}
            {d.status === 'sent' && (
              <button className="btn btn-accent" style={{ minHeight: 40, width: 'auto', flex: 1 }}
                onClick={() => run(() => supabase().rpc('rpc_field_submit_signed_contract', {
                  p_project_id: projectId, p_client_key: crypto.randomUUID(),
                }), 'บันทึกเซ็นแล้ว ✅ — การ์ดงวดมัดจำส่งเข้ากลุ่มอัตโนมัติ')}>
                ลูกค้าเซ็นแล้ว (บันทึก)
              </button>
            )}
          </div>
          {showBody === d.doc_id && (
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 15, background: 'var(--line)', padding: 10, borderRadius: 8, marginTop: 8 }}>{d.body}</pre>
          )}
        </div>
      ))}
      <button className="btn btn-ghost" style={{ marginTop: 8 }}
        onClick={() => run(() => supabase().rpc('rpc_field_generate_contract', { p_project_id: projectId }),
          'สร้างฉบับใหม่แล้ว — ตรวจแล้วกดส่งแจ้งลูกค้า')}>
        {current.length === 0 ? 'สร้างสัญญา (จากข้อมูลจริงในระบบ)' : 'สร้างฉบับใหม่ (แก้สัญญา)'}
      </button>
      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>{msg}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
