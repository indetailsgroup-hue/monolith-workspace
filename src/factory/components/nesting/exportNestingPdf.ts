/**
 * exportNestingPdf.ts
 *
 * Exports the NestingSheetReport SVG layout to a downloadable PDF.
 * Uses jsPDF with SVG-to-canvas rendering.
 *
 * @module factory/components/nesting/exportNestingPdf
 */

import { jsPDF } from 'jspdf';

/**
 * Render an HTML container (containing SVGs) to a PDF and trigger download.
 *
 * Strategy:
 * 1. Collect all <svg> elements inside the container
 * 2. Serialize each SVG to a data-URL PNG via off-screen canvas
 * 3. Add each as a page in jsPDF
 * 4. Download the PDF
 */
export async function exportNestingPdf(
  container: HTMLElement,
  jobId?: string
): Promise<void> {
  const svgs = container.querySelectorAll('svg');
  if (svgs.length === 0) return;

  // A4 landscape-ish proportions (mm)
  const pageW = 297;
  const pageH = 210;
  const margin = 10;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  for (let i = 0; i < svgs.length; i++) {
    if (i > 0) doc.addPage();

    const svg = svgs[i];
    const imgDataUrl = await svgToDataUrl(svg, pageW * 3, pageH * 3);

    doc.addImage(imgDataUrl, 'PNG', margin, margin, pageW - margin * 2, pageH - margin * 2);

    // Sheet label footer
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Sheet ${i + 1} / ${svgs.length}${jobId ? `  —  ${jobId}` : ''}`, margin, pageH - 4);
  }

  const filename = `nesting_report_${jobId ?? 'export'}.pdf`;
  doc.save(filename);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Render an SVG element to a PNG data-URL via canvas.
 */
async function svgToDataUrl(svg: SVGElement, width: number, height: number): Promise<string> {
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svg);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0f172a'; // dark background matching report
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error(`SVG render failed: ${e}`));
    };
    img.src = url;
  });
}
