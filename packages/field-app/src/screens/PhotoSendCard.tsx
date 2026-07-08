// ส่งรูป curated เข้ากลุ่มลูกค้า (0134/0135 — ADR-045 Wave 1/2): office/designer เลือกรูปจริงของบ้าน
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Photo { photo_id: string; storage_path: string; room: string | null; created_at: string }

export function PhotoSendCard({ projectId }: { projectId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<Photo | null>(null);
  const [caption, setCaption] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    supabase().rpc('rpc_field_list_photos', { p_project_id: projectId }).then(async ({ data }) => {
      const list = (data ?? []) as Photo[];
      setPhotos(list);
      const t: Record<string, string> = {};
      for (const p of list.slice(0, 12)) {
        const { data: s } = await supabase().storage.from('installation-media')
          .createSignedUrl(p.storage_path, 3600);
        if (s?.signedUrl) t[p.photo_id] = s.signedUrl;
      }
      setThumbs(t);
    });
  }, [projectId]);
  useEffect(load, [load]);

  async function send() {
    if (!pick) return;
    setErr(''); setMsg('');
    const { error } = await supabase().rpc('rpc_field_send_photo_to_customer', {
      p_project_id: projectId, p_photo_id: pick.photo_id, p_caption: caption.trim() || null,
    });
    if (error) { setErr(error.message); return; }
    setMsg('ส่งรูปเข้ากลุ่มลูกค้าแล้ว 📸');
    setPick(null); setCaption('');
  }

  if (photos.length === 0) return null;

  return (
    <div className="card">
      <strong>ส่งรูปให้ลูกค้า (curated)</strong>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
        {photos.slice(0, 12).map((p) => (
          <div key={p.photo_id} onClick={() => setPick(pick?.photo_id === p.photo_id ? null : p)}
            style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden', aspectRatio: '1',
              border: pick?.photo_id === p.photo_id ? '3px solid var(--brand)' : '1px solid var(--line)',
              background: 'var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {thumbs[p.photo_id]
              ? <img src={thumbs[p.photo_id]} alt={p.room ?? 'รูปงาน'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span className="muted" style={{ fontSize: 12 }}>…</span>}
          </div>
        ))}
      </div>
      {pick && (
        <>
          <input placeholder="แคปชันถึงลูกค้า (ไม่บังคับ)" value={caption} onChange={(e) => setCaption(e.target.value)} />
          <button className="btn btn-accent" onClick={send}>ส่งรูปนี้เข้ากลุ่มลูกค้า</button>
        </>
      )}
      {msg && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>{msg}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
