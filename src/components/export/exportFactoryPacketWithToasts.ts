/**
 * exportFactoryPacketWithToasts — S18 Slice 4
 *
 * Export factory packet + upload ขึ้น packet store (ADR-061)
 * พร้อม toast feedback บนจอ — ผลลัพธ์ต้องไม่เงียบอยู่ใน console:
 * - สำเร็จ → toast success (ชื่อไฟล์ + ขนาด)
 * - upload ล้มเหลว → toast error (เดิม console.warn เงียบ)
 * - export ล้มเหลว → toast error (เดิม alert)
 *
 * ADR-066: ฝั่ง client เรียก API ปกติเท่านั้น — ไม่มีการ apply อะไรขึ้น hosted จากโค้ดนี้
 */

import { toastSuccess, toastError } from '../../core/store/useToastStore';
import { useProjectStore } from '../../core/store/useProjectStore';

export interface ExportFactoryPacketResult {
  /** Packet ถูกสร้าง+ดาวน์โหลดสำเร็จ */
  ok: boolean;
  /** Packet ถูก upload ขึ้น factory store สำเร็จ */
  uploaded: boolean;
}

export async function exportFactoryPacketWithToasts(): Promise<ExportFactoryPacketResult> {
  const serverJobId = useProjectStore.getState().metadata?.id;
  let projectChanged = false;
  // Keep invalidation sticky: switching A -> B -> A still abandons this export.
  const unsubscribe = useProjectStore.subscribe((state, previous) => {
    if (state.metadata?.id !== previous.metadata?.id) projectChanged = true;
  });
  try {
    // Dynamic import: packet builder เป็น chunk แยก (T018 code splitting)
    const { generateFactoryPacketFromStores } = await import('../../factory/packet');
    if (projectChanged) {
      toastError('โครงการเปลี่ยนระหว่างเตรียมส่งออก กรุณาเริ่มใหม่จากโครงการที่ต้องการ');
      return { ok: false, uploaded: false };
    }
    const result = await generateFactoryPacketFromStores();

    const sizeKb = (result.compressedSize / 1024).toFixed(1);
    toastSuccess(`Export สำเร็จ: ${result.filename} (${sizeKb} KB)`);
    console.log('[Export] Factory packet generated successfully:', {
      filename: result.filename,
      compressedSize: `${sizeKb} KB`,
      uncompressedSize: `${(result.uncompressedSize / 1024).toFixed(1)} KB`,
    });

    // ADR-061 packet store: ส่ง packet ขึ้น server ให้โรงงานดึง (hash-anchored)
    // job key ฝั่ง server = project id (ตัวเดียวกับ freeze)
    if (projectChanged) {
      toastError('โครงการเปลี่ยนระหว่างส่งออก — ไฟล์ดาวน์โหลดแล้ว แต่ยังไม่ได้อัปโหลด กรุณาเริ่มใหม่จากโครงการที่ต้องการ');
      return { ok: true, uploaded: false };
    }
    if (!serverJobId) {
      return { ok: true, uploaded: false };
    }

    const { uploadPacket } = await import('../../core/api/stateApi');
    if (projectChanged) {
      toastError('โครงการเปลี่ยนระหว่างส่งออก — ไฟล์ดาวน์โหลดแล้ว แต่ยังไม่ได้อัปโหลด กรุณาเริ่มใหม่จากโครงการที่ต้องการ');
      return { ok: true, uploaded: false };
    }
    const up = await uploadPacket(serverJobId, result.blob);
    if (up.ok) {
      console.log('[Export] Packet uploaded to factory store:', up.packetSha256?.slice(0, 12), up.storagePath);
      return { ok: true, uploaded: true };
    }

    toastError(`อัปโหลด packet ไม่สำเร็จ: ${up.error ?? 'unknown error'} — ไฟล์ดาวน์โหลดแล้ว แต่โรงงานยังดึงไม่ได้`);
    return { ok: true, uploaded: false };
  } catch (error) {
    toastError(`Export ไม่สำเร็จ: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('[Export] Failed to export factory packet:', error);
    return { ok: false, uploaded: false };
  } finally {
    unsubscribe();
  }
}
