/**
 * IIMOS Bridge — Phase 1 (ADR-057)
 *
 * ส่ง cutlist จาก FactoryPacket เข้า IIMOS (rpc_bridge_import_cutlist, 0153):
 *   - aggregate cutlist rows ตาม materialId (จำนวน = ชิ้นตัดรวม) — เป็นข้อมูลช่วยสั่งของ
 *   - แนบ manifest.contentHash (SHA-256) → ลง audit ฝั่ง IIMOS = ID-chain เริ่มต้น
 *   - idempotent: clientKey ต่อการส่งหนึ่งครั้ง (retry ปลอดภัย)
 *
 * ยังไม่ผูก UI ในเฟสนี้ (รอ auth story ฝั่ง MONOLITH — เฟส 2)
 * work_item id รับผ่าน deep link ?work_item= (ดู readWorkItemFromUrl)
 */
import type { FactoryPacket } from '../factory/packet/types';

export interface BridgeItem {
  name: string;
  qty: number;
  unit?: string;
}

export interface BridgePayload {
  p_work_item_id: string;
  p_package_code: string;
  p_package_name: string | null;
  p_items: BridgeItem[];
  p_content_hash: string | null;
  p_client_key: string;
}

export interface BridgeTarget {
  /** Supabase project URL เช่น https://xxxx.supabase.co */
  url: string;
  /** anon key (public) */
  anonKey: string;
  /** access token ของผู้ใช้ที่ล็อกอิน IIMOS แล้ว */
  accessToken: string;
}

export const IIMOS_WORK_ITEM_KEY = 'iimos_work_item';

/** อ่าน ?work_item= จาก URL (deep link จาก DesignerHome) แล้วจำใน sessionStorage */
export function readWorkItemFromUrl(
  href: string = typeof location !== 'undefined' ? location.href : '',
  storage: Pick<Storage, 'getItem' | 'setItem'> | null =
    typeof sessionStorage !== 'undefined' ? sessionStorage : null,
): string | null {
  try {
    const u = new URL(href);
    const wi = u.searchParams.get('work_item');
    if (wi && storage) storage.setItem(IIMOS_WORK_ITEM_KEY, wi);
    return wi ?? storage?.getItem(IIMOS_WORK_ITEM_KEY) ?? null;
  } catch {
    return storage?.getItem(IIMOS_WORK_ITEM_KEY) ?? null;
  }
}

/** aggregate cutlist ตาม material → รายการวัสดุสำหรับ IIMOS */
export function buildBridgePayload(
  packet: FactoryPacket,
  workItemId: string,
  packageCode: string,
  packageName?: string,
  clientKey?: string,
): BridgePayload {
  const byMaterial = new Map<string, number>();
  for (const row of packet.cutList.rows) {
    byMaterial.set(row.materialId, (byMaterial.get(row.materialId) ?? 0) + row.qty);
  }
  const items: BridgeItem[] = [...byMaterial.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, qty]) => ({ name, qty, unit: 'ชิ้น(ตัด)' }));
  return {
    p_work_item_id: workItemId,
    p_package_code: packageCode.trim().toUpperCase(),
    p_package_name: packageName?.trim() || null,
    p_items: items,
    p_content_hash: packet.manifest.contentHash ?? null,
    p_client_key: clientKey ?? `${packet.manifest.jobId}:${packet.manifest.contentHash}`,
  };
}

/** ยิงเข้า IIMOS — คืน {package_id, imported, skipped, already} */
export async function sendCutListToIimos(
  target: BridgeTarget,
  payload: BridgePayload,
  fetchImpl: typeof fetch = fetch,
): Promise<{ package_id?: string; imported?: number; skipped?: number; already: boolean }> {
  const res = await fetchImpl(`${target.url}/rest/v1/rpc/rpc_bridge_import_cutlist`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: target.anonKey,
      authorization: `Bearer ${target.accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `iimos_bridge_failed (${res.status})`);
  }
  return res.json();
}
