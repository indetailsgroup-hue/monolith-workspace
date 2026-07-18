/**
 * FinanceDashboard — dashboard การเงิน read-only ฝั่ง Designer (S18 l4-finance-tax Slice 2)
 *
 * เรียก rpc_finance_home (0137 — "งานเงินของฉันวันนี้") ผ่านช่องทางเดิมของ bridge (ADR-058):
 *   - auth: reuse session ของ Field App (origin เดียวกันบน Pages → localStorage แชร์ — readFieldSession)
 *   - endpoint: VITE_SUPABASE_URL + /rest/v1/rpc/rpc_finance_home (pattern เดียวกับ sendCutListToIimos)
 * แสดง: ยอดค้างรวม · งวดใกล้ถึง (แจ้งแล้วรอชำระ) · ค้างนาน · รับแล้ววันนี้ · ลิงก์ไป Field App
 * read-only เท่านั้น — บันทึกรับ/แนบสลิปทำใน Field App (FinanceHome ของ F3)
 * routing: L7 เป็นคน wire เข้า /finance — lane นี้ห้ามแก้ routes (ดูหมายเหตุ PR)
 */
import { useEffect, useMemo, useState } from 'react';
import { readFieldSession } from '../bridge/fieldBridge';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
const FIELD_APP_URL = (import.meta.env.VITE_FIELD_APP_URL as string | undefined) ?? '../';

export interface FinanceHomeRow {
  installment_id: string;
  project_id: string;
  name: string;
  seq: number;
  label: string;
  amount: number;
  days_waiting: number;
  has_slip?: boolean;
}

export interface FinanceHomeData {
  awaiting: FinanceHomeRow[];
  overdue: FinanceHomeRow[];
  received_today: { count: number; total: number };
}

export interface FinanceDashboardProps {
  /** override สำหรับเทส/embed — default: fetch ผ่าน session Field App (client เดิม) */
  fetchHome?: () => Promise<FinanceHomeData>;
  /** ปลายทางลิงก์ "เปิด Field App" — default: VITE_FIELD_APP_URL (Pages origin เดียวกัน) */
  fieldAppUrl?: string;
}

const THB = (n: number) => Number(n).toLocaleString('th-TH');

/** client เดิม: session จาก Field App + REST rpc (เหมือน fieldBridge — ไม่สร้าง client ใหม่) */
async function fetchHomeViaFieldSession(): Promise<FinanceHomeData> {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error('ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  }
  const session = readFieldSession();
  if (!session) throw new Error('ยังไม่มี session — เปิด Field App แล้วล็อกอินก่อน');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_finance_home`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_ANON,
      authorization: `Bearer ${session.accessToken}`,
    },
    body: '{}',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `rpc_finance_home failed (${res.status})`);
  }
  return res.json();
}

export function FinanceDashboard({
  fetchHome = fetchHomeViaFieldSession,
  fieldAppUrl = FIELD_APP_URL,
}: FinanceDashboardProps) {
  const [home, setHome] = useState<FinanceHomeData | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    fetchHome().then(
      (data) => { if (alive) setHome(data); },
      (e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { alive = false; };
  }, [fetchHome]);

  const outstanding = useMemo(
    () => (home ? home.awaiting.reduce((sum, r) => sum + Number(r.amount), 0) : 0),
    [home],
  );

  if (err) {
    return (
      <div className="p-4 text-sm text-textc-primary">
        <div className="text-red-400">{err}</div>
      </div>
    );
  }
  if (!home) return <div className="p-4 text-sm opacity-70 text-textc-primary">กำลังโหลด…</div>;

  return (
    <div className="p-4 space-y-4 text-sm text-textc-primary max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">การเงินวันนี้</h2>
        <a
          href={fieldAppUrl}
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-surface-2 hover:bg-surface-3 border border-oi-border"
          title="บันทึกรับ/แนบสลิปทำใน Field App (หน้าเงินของ F3)"
        >
          เปิด Field App — หน้าเงิน ↗
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-4 rounded-lg bg-surface-1 border border-oi-border">
          <div className="text-xs opacity-70">ยอดค้างรวม (แจ้งแล้วรอชำระ)</div>
          <div className="text-xl font-bold">{THB(outstanding)} บาท</div>
          <div className="text-xs opacity-70">{home.awaiting.length} งวดรอชำระ</div>
        </div>
        <div className="p-4 rounded-lg bg-surface-1 border border-oi-border">
          <div className="text-xs opacity-70">รับแล้ววันนี้</div>
          <div className="text-xl font-bold">{THB(home.received_today.total)} บาท</div>
          <div className="text-xs opacity-70">{home.received_today.count} งวด</div>
        </div>
      </div>

      <div className="p-4 rounded-lg bg-surface-1 border border-oi-border space-y-2">
        <div className="font-semibold">งวดใกล้ถึง (แจ้งลูกค้าแล้ว รอชำระ)</div>
        {home.awaiting.length === 0 && (
          <div className="opacity-70">ไม่มีงวดค้าง 🎉</div>
        )}
        {home.awaiting.map((r) => (
          <div key={r.installment_id} className="py-2 border-b border-oi-border last:border-b-0">
            <div className="font-medium">{r.name}</div>
            <div className="opacity-80">งวด {r.seq} · {r.label} — {THB(r.amount)} บาท</div>
            <div className="text-xs opacity-70">
              แจ้งแล้ว {r.days_waiting} วัน{r.has_slip ? ' · 🧾 มีสลิปแล้ว' : ''}
            </div>
          </div>
        ))}
      </div>

      {home.overdue.length > 0 && (
        <div className="p-4 rounded-lg bg-surface-1 border border-oi-border space-y-2">
          <div className="font-semibold">ค้างนานเกินกำหนดเตือน</div>
          {home.overdue.map((r) => (
            <div key={r.installment_id} className="py-1">
              🔴 {r.name} · งวด {r.seq} — {THB(r.amount)} บาท ค้าง {r.days_waiting} วัน
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
