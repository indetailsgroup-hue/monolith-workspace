// มุมช่าง — "งานของฉันวันนี้" (Wave C; UX tenet: เลนตัวเอง ชื่อห้องภาษาคน ไม่มีศัพท์ระบบ)
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { enqueuePhoto, flushPhotos, pendingPhotoCount } from '../lib/photoQueue';

// checklist ต่อ template (SOP จริงจาก 0091 — ครัว/ห้องทั่วไป ต่อเลน)
const ITEMS: Record<string, string[]> = {
  inst_kitchen_tech1: ['เช็คพื้น','ตรวจสอบ Defect','ตรวจสอบฝ้า','ประกอบอลูมิเนียม','ติดตั้งอลูมิเนียม','ตรวจสอบขนาดตู้','จัดตู้วางตำแหน่งแต่ละจุด','ติดตั้งผนังระหว่างตู้','ติดตั้งงาน Top','ติดตั้งอุปกรณ์ภายในตู้','ระบบไฟฟ้า','เก็บงานซิลิโคน','ตรวจสอบหน้าบานให้เรียบร้อย','ทำความสะอาด','Wrapping 📷'],
  inst_kitchen_tech2: ['ไฟฟ้าผนัง','ระบบน้ำประปา','ตรวจสอบผนัง','ตรวจสอบประตู','ประกอบอลูมิเนียม','ติดตั้งอลูมิเนียม','ติดตั้งตู้','จัดตู้วางตำแหน่งแต่ละจุด','ติดตั้งผนังระหว่างตู้','ติดตั้งงาน Top','ติดตั้งอุปกรณ์ภายในตู้','ระบบไฟฟ้าภายในตู้','เก็บงานซิลิโคน','ตรวจสอบระบบไฟอีกรอบ','ทำความสะอาด','Wrapping 📷'],
  inst_kitchen_tech3: ['Check point of measure','Offset point','Point of x=0,y=0','ตรวจสอบขนาดอลูมิเนียม','ประกอบอลูมิเนียม','ติดตั้งอลูมิเนียม','ติดตั้งตู้','ปรับประตูตู้','ติดตั้งงาน Top','ระบบน้ำประปา','เก็บงานฝ้า','เก็บงานซิลิโคน TOP','เช็คอุปกรณ์ภายในตู้','ทำความสะอาด','Wrapping 📷'],
  inst_room_tech1: ['เช็คพื้น','ตรวจสอบ Defect','ตรวจสอบฝ้า','ประกอบอลูมิเนียม','ติดตั้งอลูมิเนียม','ตรวจสอบขนาดตู้','จัดตู้วางตำแหน่งแต่ละจุด','ติดตั้งผนังระหว่างตู้','ติดตั้งอุปกรณ์ภายในตู้','ระบบไฟฟ้า','เก็บงานซิลิโคน','ทำความสะอาด','Wrapping 📷'],
  inst_room_tech2: ['ไฟฟ้าผนัง','ระบบน้ำประปา (ถ้ามี)','ตรวจสอบผนัง','ตรวจสอบประตู','ประกอบอลูมิเนียม','ติดตั้งอลูมิเนียม','ติดตั้งตู้','จัดตู้วางตำแหน่งแต่ละจุด','ติดตั้งผนังระหว่างตู้','ติดตั้งอุปกรณ์ภายในตู้','ระบบไฟฟ้าภายในตู้','เก็บงานซิลิโคน','ทำความสะอาด','Wrapping 📷'],
  inst_room_tech3: ['Check point of measure','Offset point','Point of x=0,y=0','ตรวจสอบขนาดอลูมิเนียม','ประกอบอลูมิเนียม','ติดตั้งอลูมิเนียม','ติดตั้งตู้','ปรับประตูตู้','เก็บงานฝ้า','ตรวจสอบประตูตู้อีกรอบ','ตรวจสอบระบบไฟอีกรอบ','เช็คอุปกรณ์ภายในตู้','ทำความสะอาด','Wrapping 📷'],
};

interface Lane { task_id: string; lane: number; template_ref: string; checklist_state: Record<string, boolean>; room: string; project: string }

export function MyWork() {
  const [lanes, setLanes] = useState<Lane[] | null>(null);
  const [err, setErr] = useState('');
  const [pending, setPending] = useState(0);
  const refreshPending = () => { void pendingPhotoCount().then(setPending); };

  useEffect(() => {
    supabase().rpc('rpc_field_my_lanes').then(({ data, error }) => {
      if (error) setErr(error.message); else setLanes((data ?? []) as Lane[]);
    });
    refreshPending();
    const t = setInterval(refreshPending, 4000);
    return () => clearInterval(t);
  }, []);

  async function toggle(l: Lane, item: string, done: boolean) {
    setLanes((ls) => ls!.map((x) => x.task_id === l.task_id
      ? { ...x, checklist_state: { ...x.checklist_state, [item]: done } } : x));
    const { error } = await supabase().rpc('rpc_field_toggle_lane_item', {
      p_task_id: l.task_id, p_item: item, p_done: done,
    });
    if (error) setErr(error.message);
  }

  async function takePhoto(l: Lane, file: File | null) {
    if (!file) return;
    await enqueuePhoto(l.task_id, file);
    refreshPending();
    void flushPhotos().then(refreshPending);
  }
  if (err) return <div className="page"><p className="err">{err}</p></div>;
  if (lanes === null) return <div className="page muted">กำลังโหลดงานของคุณ…</div>;
  if (lanes.length === 0) return <div className="page"><div className="card">วันนี้ยังไม่มีงานมอบหมายครับ 🙂</div></div>;

  return (
    <div className="page">
      {pending > 0 && <div className="card" style={{ background: '#FFF6E5' }}>📤 ค้างส่ง {pending} รายการ — จะส่งเองเมื่อมีสัญญาณ</div>}
      {lanes.map((l) => {
        const items = ITEMS[l.template_ref] ?? [];
        const doneCount = items.filter((i) => l.checklist_state?.[i]).length;
        return (
          <div key={l.task_id} className="card">
            <strong>{l.project} · {l.room}</strong>
            <div className="muted">งานของคุณ (ช่างคนที่ {l.lane}) · เสร็จ {doneCount}/{items.length}</div>
            {items.map((item) => (
              <label key={item} style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 400, margin: '10px 0' }}>
                <input type="checkbox" style={{ width: 26, height: 26, minHeight: 0 }}
                  checked={l.checklist_state?.[item] ?? false}
                  onChange={(e) => toggle(l, item, e.target.checked)} />
                <span>{item}</span>
              </label>
            ))}
            <label className="btn btn-accent" style={{ textAlign: 'center' }}>
              📷 ถ่ายรูปงานห้องนี้
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                onChange={(e) => { void takePhoto(l, e.target.files?.[0] ?? null); e.target.value = ''; }} />
            </label>
            <p className="muted">ถ่ายตรงนี้ หรือส่งในกลุ่ม LINE ก็ได้ — ระบบเก็บให้เหมือนกัน 📷 เน็ตหลุดก็ถ่ายได้ เดี๋ยวส่งให้เอง</p>
          </div>
        );
      })}
    </div>
  );
}
