/**
 * FieldBridgeButton — MONOLITH Bridge เฟส 2 (ADR-058)
 *
 * ปุ่ม "🌉 ส่งเข้าหน้างาน" ใน header: ส่ง cutlist ของ scene ปัจจุบันเข้า IIMOS
 *   - auth: reuse session ของ Field App (origin เดียวกันบน Pages → localStorage แชร์)
 *   - work_item: จาก deep link ?work_item= (DesignerHome) หรือพิมพ์เอง
 *   - contentHash: sha256 ของ cutlist JSON จริง (ID-chain — ADR-051 spine ข้อ 1)
 *   - idempotent: clientKey = hash → ส่งซ้ำแบบเดิม = ระบบไม่ import ซ้ำ
 */
import { useEffect, useMemo, useState } from 'react';
import { useCabinetStore } from '../core/store/useCabinetStore';
import { buildCutListData } from '../factory/packet/builders/buildCutList';
import {
  buildPayloadFromCutList,
  readFieldSession,
  readWorkItemFromUrl,
  sendCutListToIimos,
  sha256Hex,
} from './fieldBridge';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export function FieldBridgeButton() {
  const [open, setOpen] = useState(false);
  const [workItem, setWorkItem] = useState('');
  const [pkgCode, setPkgCode] = useState('MW-001');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cabinets = useCabinetStore((s) => s.cabinets);

  const session = useMemo(() => readFieldSession(), [open]);
  const configured = SUPABASE_URL.length > 0 && SUPABASE_ANON.length > 0;

  useEffect(() => {
    const wi = readWorkItemFromUrl();
    if (wi) setWorkItem(wi);
  }, []);

  const partCount = useMemo(
    () => (open ? buildCutListData(cabinets).summary.totalParts : 0),
    [open, cabinets],
  );

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      if (!session) throw new Error('ยังไม่มี session — เปิด Field App แล้วล็อกอินก่อน');
      const cutList = buildCutListData(cabinets);
      if (cutList.rows.length === 0) throw new Error('scene ยังไม่มีชิ้นงาน — ออกแบบตู้ก่อน');
      const hash = 'sha256:' + (await sha256Hex(JSON.stringify(cutList)));
      const payload = buildPayloadFromCutList(
        cutList, workItem.trim(), pkgCode, undefined, hash, hash,
      );
      const r = await sendCutListToIimos(
        { url: SUPABASE_URL, anonKey: SUPABASE_ANON, accessToken: session.accessToken },
        payload,
      );
      setMsg({
        ok: true,
        text: r.already
          ? 'ชุดนี้เคยส่งแล้ว (idempotent) — ไม่ import ซ้ำ ✅'
          : `ส่งเข้าหน้างานแล้ว ✅ วัสดุใหม่ ${r.imported ?? 0} · ซ้ำข้าม ${r.skipped ?? 0}`,
      });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-1.5 rounded-md text-sm font-medium bg-surface-2 hover:bg-surface-3 border border-oi-border text-textc-primary"
        title="ส่ง cutlist ของ scene นี้เข้าระบบหน้างาน MONOLITH"
      >
        🌉 ส่งเข้าหน้างาน
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 p-4 rounded-lg bg-surface-1 border border-oi-border shadow-xl text-sm text-textc-primary space-y-3">
          <div className="font-semibold">ส่ง cutlist เข้าระบบหน้างาน</div>
          {!configured && (
            <div className="text-amber-400">ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / ANON_KEY</div>
          )}
          <div className="text-xs opacity-70">
            {session
              ? `ล็อกอินเป็น ${session.email} (session จาก Field App)`
              : '⚠️ ยังไม่ล็อกอิน — เปิด Field App ล็อกอินก่อน แล้วกลับมากดใหม่'}
          </div>
          <label className="block space-y-1">
            <span className="text-xs opacity-70">Work Item (จากปุ่ม "เปิดใน MONOLITH" หรือวางเอง)</span>
            <input
              value={workItem}
              onChange={(e) => setWorkItem(e.target.value)}
              placeholder="uuid ของ work item"
              className="w-full px-2 py-1.5 rounded bg-surface-0 border border-oi-border"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs opacity-70">รหัส Package</span>
            <input
              value={pkgCode}
              onChange={(e) => setPkgCode(e.target.value)}
              placeholder="MW-001"
              className="w-full px-2 py-1.5 rounded bg-surface-0 border border-oi-border"
            />
          </label>
          <div className="text-xs opacity-70">scene ปัจจุบัน: {cabinets.length} ตู้ · {partCount} ชิ้นตัด</div>
          <button
            onClick={send}
            disabled={busy || !configured || !session || !workItem.trim() || !pkgCode.trim()}
            className="w-full py-2 rounded-md font-medium bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'กำลังส่ง…' : 'ส่ง cutlist เข้าระบบหน้างาน'}
          </button>
          {msg && (
            <div className={msg.ok ? 'text-emerald-400' : 'text-red-400'}>{msg.text}</div>
          )}
        </div>
      )}
    </div>
  );
}
