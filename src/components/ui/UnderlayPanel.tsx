/**
 * UnderlayPanel — FP-1 (ADR-062): จัดการแปลนอ้างอิง (แท็บ Decor)
 *
 * ป้าย "REFERENCE — ไม่ใช่ขนาดผลิต" บังคับแสดงเสมอ (หลักเหล็ก human-in-loop)
 */

import React, { useRef, useState } from 'react';
import { useUnderlayStore, UNDERLAY_MAX_BYTES } from '../../core/store/useUnderlayStore';
import { parseDxf } from '../../core/underlay/dxfParse';

/** FP-2: rasterize หน้าแรกของ PDF -> dataURL (lazy-load pdfjs เฉพาะตอนใช้) */
async function pdfFirstPageToDataUrl(file: File): Promise<{ dataUrl: string; aspect: number }> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas 2d context');
  await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
  return { dataUrl: canvas.toDataURL('image/png'), aspect: canvas.height / canvas.width };
}

export function UnderlayPanel() {
  const s = useUnderlayStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // FP-3 (ADR-062): DWG = ฟอร์แมตปิด — แนะนำทางที่ทุก CAD ทำได้แทนการเดา
    if (/\.dwg$/i.test(file.name)) {
      setError('DWG เป็นฟอร์แมตปิด — กรุณา export เป็น DXF จากโปรแกรม CAD (AutoCAD: SAVEAS → DXF) แล้วโหลดใหม่');
      return;
    }
    // FP-2: DXF -> reference layer เส้น
    if (/\.dxf$/i.test(file.name)) {
      file.text().then((text) => {
        const parsed = parseDxf(text);
        if (parsed.segments.length === 0) {
          setError('ไม่พบเส้นที่รองรับใน DXF (LINE/LWPOLYLINE/CIRCLE/ARC)');
          return;
        }
        s.setDxf(parsed.segments, file.name, parsed.skippedEntities);
      }).catch(() => setError('อ่าน DXF ไม่สำเร็จ'));
      return;
    }
    // FP-2: PDF -> rasterize หน้าแรกเป็นภาพ underlay
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      pdfFirstPageToDataUrl(file)
        .then(({ dataUrl, aspect }) => s.setImage(dataUrl, file.name, aspect))
        .catch(() => setError('อ่าน PDF ไม่สำเร็จ'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('รองรับ PNG/JPG/WebP/PDF/DXF');
      return;
    }
    if (file.size > UNDERLAY_MAX_BYTES) {
      setError(`ไฟล์ใหญ่เกิน ${Math.round(UNDERLAY_MAX_BYTES / 1024 / 1024)}MB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const img = new Image();
      img.onload = () => s.setImage(dataUrl, file.name, img.naturalHeight / img.naturalWidth);
      img.onerror = () => setError('อ่านไฟล์ภาพไม่สำเร็จ');
      img.src = dataUrl;
    };
    reader.onerror = () => setError('อ่านไฟล์ไม่สำเร็จ');
    reader.readAsDataURL(file);
  };

  const num = (v: string, fallback: number) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <div className="rounded-lg border border-[#333] bg-surface-2 p-2 space-y-2" data-testid="underlay-panel">
      <div className="flex items-center gap-2">
        <span>🗺️</span>
        <span className="text-xs font-medium text-white">แปลนอ้างอิง (Underlay)</span>
      </div>

      {/* ป้ายหลักเหล็ก — แสดงเสมอ */}
      <div className="px-2 py-1 rounded bg-amber-500/15 text-amber-400 text-[10px]">
        ⚠ REFERENCE — ไม่ใช่ขนาดผลิต · ขนาดจริงต้องวัดหน้างาน (verified record) และคนอนุมัติทุกขั้น
      </div>

      {!s.imageDataUrl ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full px-2 py-2 rounded text-[11px] bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
        >
          📂 เลือกแปลน (PNG/JPG/PDF/DXF)
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span className="truncate max-w-[140px]" title={s.fileName ?? ''}>{s.fileName}</span>
            <button onClick={() => s.clearImage()} className="text-red-400 hover:text-red-300">ลบ</button>
          </div>

          <label className="block text-[10px] text-gray-400">
            ความโปร่งใส {Math.round(s.opacity * 100)}%
            <input type="range" min={5} max={100} value={Math.round(s.opacity * 100)}
              onChange={(e) => s.setOpacity(num(e.target.value, 50) / 100)} className="w-full" />
          </label>

          <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-400">
            <label>กว้าง (mm)
              <input type="number" value={s.widthMm} disabled={s.locked}
                onChange={(e) => s.setWidthMm(num(e.target.value, s.widthMm))}
                className="w-full bg-black/30 rounded px-1 py-0.5 text-white" />
            </label>
            <label>หมุน (°)
              <input type="number" value={s.rotationDeg} disabled={s.locked}
                onChange={(e) => s.setRotationDeg(num(e.target.value, s.rotationDeg))}
                className="w-full bg-black/30 rounded px-1 py-0.5 text-white" />
            </label>
            <label>X (mm)
              <input type="number" value={s.position[0]} disabled={s.locked}
                onChange={(e) => s.setPosition(num(e.target.value, s.position[0]), s.position[1])}
                className="w-full bg-black/30 rounded px-1 py-0.5 text-white" />
            </label>
            <label>Z (mm)
              <input type="number" value={s.position[1]} disabled={s.locked}
                onChange={(e) => s.setPosition(s.position[0], num(e.target.value, s.position[1]))}
                className="w-full bg-black/30 rounded px-1 py-0.5 text-white" />
            </label>
          </div>

          <div className="flex gap-2">
            <button onClick={() => s.setVisible(!s.visible)}
              className="flex-1 px-2 py-1 rounded text-[10px] bg-zinc-700 text-zinc-300 hover:bg-zinc-600">
              {s.visible ? '👁 ซ่อน' : '👁 แสดง'}
            </button>
            <button onClick={() => s.setLocked(!s.locked)}
              className={`flex-1 px-2 py-1 rounded text-[10px] ${s.locked ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'}`}>
              {s.locked ? '🔒 ล็อกอยู่' : '🔓 ล็อก'}
            </button>
          </div>
        </>
      )}

      {s.dxfSegments && (
        <div className="pt-2 border-t border-[#333] space-y-2" data-testid="dxf-controls">
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span className="truncate max-w-[120px]" title={s.dxfFileName ?? ''}>📐 {s.dxfFileName}</span>
            <span>{s.dxfSegments.length} เส้น{s.dxfSkipped > 0 ? ` · ข้าม ${s.dxfSkipped}` : ''}</span>
            <button onClick={() => s.clearDxf()} className="text-red-400 hover:text-red-300">ลบ</button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-400">
            <label>สเกล (×mm)
              <input type="number" step="any" value={s.dxfScale} disabled={s.dxfLocked}
                onChange={(e) => s.setDxfScale(num(e.target.value, s.dxfScale))}
                className="w-full bg-black/30 rounded px-1 py-0.5 text-white" />
            </label>
            <label>หมุน (°)
              <input type="number" value={s.dxfRotationDeg} disabled={s.dxfLocked}
                onChange={(e) => s.setDxfRotationDeg(num(e.target.value, s.dxfRotationDeg))}
                className="w-full bg-black/30 rounded px-1 py-0.5 text-white" />
            </label>
            <label>X (mm)
              <input type="number" value={s.dxfPosition[0]} disabled={s.dxfLocked}
                onChange={(e) => s.setDxfPosition(num(e.target.value, s.dxfPosition[0]), s.dxfPosition[1])}
                className="w-full bg-black/30 rounded px-1 py-0.5 text-white" />
            </label>
            <label>Z (mm)
              <input type="number" value={s.dxfPosition[1]} disabled={s.dxfLocked}
                onChange={(e) => s.setDxfPosition(s.dxfPosition[0], num(e.target.value, s.dxfPosition[1]))}
                className="w-full bg-black/30 rounded px-1 py-0.5 text-white" />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={() => s.setDxfVisible(!s.dxfVisible)}
              className="flex-1 px-2 py-1 rounded text-[10px] bg-zinc-700 text-zinc-300 hover:bg-zinc-600">
              {s.dxfVisible ? '👁 ซ่อนเส้น' : '👁 แสดงเส้น'}
            </button>
            <button onClick={() => s.setDxfLocked(!s.dxfLocked)}
              className={`flex-1 px-2 py-1 rounded text-[10px] ${s.dxfLocked ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'}`}>
              {s.dxfLocked ? '🔒 ล็อกอยู่' : '🔓 ล็อก'}
            </button>
          </div>
        </div>
      )}

      {error && <div className="text-[10px] text-red-400">{error}</div>}
      <input ref={fileRef} type="file" accept="image/*,.pdf,.dxf" onChange={onFile} className="hidden" data-testid="underlay-file" />
    </div>
  );
}
