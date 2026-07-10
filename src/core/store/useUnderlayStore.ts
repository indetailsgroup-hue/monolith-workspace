/**
 * Underlay Store — FP-1 (ADR-062): แปลนอ้างอิงรองพื้นฉาก Designer
 *
 * หลักเหล็ก human-in-loop: underlay = ภาพอ้างอิงเท่านั้น **ไม่ใช่ขนาดผลิต**
 * — ไม่มีทางไหลเข้า drill map / packet / cutlist (render-only, ไม่แตะ manufacturing state)
 * ขนาดจริงต้องมาจากการวัดหน้างาน (SiteSurveyZone verified record) + คนอนุมัติทุกขั้น
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const UNDERLAY_MAX_BYTES = 10 * 1024 * 1024; // 10MB กัน dataURL บวม

export interface UnderlayState {
  /** dataURL ของภาพแปลน (null = ไม่มี underlay) */
  imageDataUrl: string | null;
  /** ชื่อไฟล์เดิม (แสดงใน UI) */
  fileName: string | null;
  /** สัดส่วนภาพ height/width (จากไฟล์จริง) */
  aspect: number;
  /** ความกว้างในฉาก (mm) — ผู้ใช้เทียบสเกลเอง */
  widthMm: number;
  /** ความโปร่งใส 0.05–1 */
  opacity: number;
  /** ตำแหน่งบนพื้น (mm) */
  position: [number, number];
  /** หมุนรอบแกนตั้ง (องศา) */
  rotationDeg: number;
  /** ล็อกกันแก้โดยไม่ตั้งใจ */
  locked: boolean;
  /** ซ่อน/แสดง */
  visible: boolean;
}

export interface UnderlayActions {
  setImage: (dataUrl: string, fileName: string, aspect: number) => void;
  clearImage: () => void;
  setWidthMm: (w: number) => void;
  setOpacity: (o: number) => void;
  setPosition: (x: number, z: number) => void;
  setRotationDeg: (d: number) => void;
  setLocked: (l: boolean) => void;
  setVisible: (v: boolean) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const useUnderlayStore = create<UnderlayState & UnderlayActions>()(
  persist(
    (set, get) => ({
      imageDataUrl: null,
      fileName: null,
      aspect: 1,
      widthMm: 4000,
      opacity: 0.5,
      position: [0, 0],
      rotationDeg: 0,
      locked: false,
      visible: true,

      setImage: (dataUrl, fileName, aspect) =>
        set({
          imageDataUrl: dataUrl,
          fileName,
          aspect: aspect > 0 && Number.isFinite(aspect) ? aspect : 1,
          visible: true,
        }),
      clearImage: () => set({ imageDataUrl: null, fileName: null }),
      setWidthMm: (w) => {
        if (get().locked) return;
        set({ widthMm: clamp(Number.isFinite(w) ? w : 4000, 100, 100000) });
      },
      setOpacity: (o) => set({ opacity: clamp(o, 0.05, 1) }),
      setPosition: (x, z) => {
        if (get().locked) return;
        set({ position: [Number.isFinite(x) ? x : 0, Number.isFinite(z) ? z : 0] });
      },
      setRotationDeg: (d) => {
        if (get().locked) return;
        set({ rotationDeg: Number.isFinite(d) ? ((d % 360) + 360) % 360 : 0 });
      },
      setLocked: (l) => set({ locked: l }),
      setVisible: (v) => set({ visible: v }),
    }),
    { name: 'monolith-underlay' },
  ),
);
