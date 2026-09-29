/**
 * jobs/useJobDetailPdf.ts — PDF export for Job Detail page
 *
 * Two export modes:
 * 1. window.print() — uses print CSS for browser-native PDF (quick, high fidelity)
 * 2. jsPDF generation — programmatic PDF with Thai locale (for automation/API)
 *
 * Site supervisors use mode 1 (print button) for field use.
 *
 * @version 15.3.0
 */

import { useCallback, useState } from 'react';
import { type Job, JOB_STATUSES, JOB_STATUS_LABELS } from './types';

// ============================================================================
// Types
// ============================================================================

export interface JobPdfExportState {
  isExporting: boolean;
  error: string | null;
  lastExportedAt: string | null;
}

export interface UseJobDetailPdfReturn extends JobPdfExportState {
  /** Print via browser (uses @media print CSS) */
  printJobDetail: () => void;
  /** Generate programmatic PDF */
  exportPdf: (job: Job) => Promise<void>;
}

// ============================================================================
// Thai Locale Helpers (shared with Edge Function)
// ============================================================================

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.',
  'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.',
  'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function formatThaiDateShort(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// ============================================================================
// Hook
// ============================================================================

export function useJobDetailPdf(): UseJobDetailPdfReturn {
  const [state, setState] = useState<JobPdfExportState>({
    isExporting: false,
    error: null,
    lastExportedAt: null,
  });

  // ── Mode 1: Browser print (print CSS) ──────────────────────────────────

  const printJobDetail = useCallback(() => {
    // Inject print header/footer if not already present
    let header = document.querySelector('.print-header');
    if (!header) {
      header = document.createElement('div');
      header.className = 'print-header';
      header.innerHTML = `
        <p class="print-header__company">DAPH Decor Co., Ltd.</p>
        <p class="print-header__subtitle">บริษัท ดาฟ เดคอร์ จำกัด | Manufacturing OS</p>
        <p class="print-header__doc-title">ใบสั่งงาน / Job Order</p>
      `;
      const container = document.querySelector('[data-testid="job-detail-page"]');
      if (container) {
        container.insertBefore(header, container.firstChild);
      }
    }

    let footer = document.querySelector('.print-footer');
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'print-footer';
      footer.textContent = `พิมพ์เมื่อ: ${formatThaiDateShort(new Date().toISOString())} — MONOLITH Manufacturing OS — DAPH Decor`;
      document.body.appendChild(footer);
    }

    window.print();
  }, []);

  // ── Mode 2: Programmatic PDF ───────────────────────────────────────────

  const exportPdf = useCallback(async (job: Job) => {
    setState({ isExporting: true, error: null, lastExportedAt: null });

    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = doc.internal.pageSize.getWidth();
      const margin = 15;
      let y = 18;

      // ── Header ──
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('JOB ORDER', pw / 2, y, { align: 'center' });
      y += 6;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('DAPH Decor Co., Ltd. — Manufacturing OS', pw / 2, y, { align: 'center' });
      y += 8;
      doc.setDrawColor(180);
      doc.line(margin, y, pw - margin, y);
      y += 8;

      // ── Job info ──
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`${job.jobCode}`, margin, y);
      doc.text(`Status: ${JOB_STATUS_LABELS[job.status]}`, pw - margin, y, { align: 'right' });
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.text(job.title, margin, y);
      y += 6;

      doc.setFontSize(9);
      doc.text(`Customer: ${job.customer.name}`, margin, y);
      if (job.customer.phone) {
        doc.text(`Tel: ${job.customer.phone}`, pw - margin, y, { align: 'right' });
      }
      y += 5;
      doc.text(`Material: ${job.materialGroup}`, margin, y);
      doc.text(`Priority: ${job.priority}`, pw - margin, y, { align: 'right' });
      y += 5;
      if (job.deadline) {
        doc.text(`Deadline: ${formatThaiDateShort(job.deadline)}`, margin, y);
        y += 5;
      }
      y += 4;

      // ── Status Timeline ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Status Timeline:', margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);

      const currentIdx = JOB_STATUSES.indexOf(job.status);
      const timelineText = JOB_STATUSES.map((s, i) => {
        const marker = i < currentIdx ? '✓' : i === currentIdx ? '●' : '○';
        return `${marker} ${JOB_STATUS_LABELS[s]}`;
      }).join('  →  ');
      doc.text(timelineText, margin, y, { maxWidth: pw - margin * 2 });
      y += 8;

      // ── Panel List ──
      doc.setDrawColor(200);
      doc.line(margin, y, pw - margin, y);
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`Panels (${job.panels.length} items, ${job.totalPanelCount} pcs)`, margin, y);
      y += 6;

      // Table header
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y - 3, pw - margin * 2, 6, 'F');
      doc.setFontSize(8);
      const cols = [margin + 2, margin + 10, margin + 60, margin + 95, margin + 120, margin + 140];
      ['#', 'Name', 'Material', 'Size (mm)', 'Qty', 'Type'].forEach((h, i) => {
        doc.text(h, cols[i], y);
      });
      y += 6;

      // Table rows
      doc.setFont('helvetica', 'normal');
      for (let i = 0; i < job.panels.length; i++) {
        if (y > 265) {
          doc.addPage();
          y = 20;
        }
        const p = job.panels[i];
        doc.text(String(i + 1), cols[0], y);
        doc.text(p.name.substring(0, 25), cols[1], y);
        doc.text(p.material.substring(0, 15), cols[2], y);
        doc.text(`${p.width}×${p.height}${p.arcRadius ? ` R${p.arcRadius}` : ''}`, cols[3], y);
        doc.text(String(p.qty), cols[4], y);
        doc.text(p.isCurved ? 'Curved' : 'Flat', cols[5], y);
        y += 5;
      }

      y += 6;
      // Notes
      if (job.notes) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Notes:', margin, y);
        y += 4;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const noteLines = doc.splitTextToSize(job.notes, pw - margin * 2);
        doc.text(noteLines, margin, y);
        y += noteLines.length * 4;
      }

      // Footer
      doc.setFontSize(7);
      doc.setTextColor(128);
      doc.text(
        `Generated: ${new Date().toISOString()} — MONOLITH Manufacturing OS`,
        pw / 2,
        285,
        { align: 'center' },
      );

      // Save
      doc.save(`${job.jobCode}-job-order.pdf`);

      setState({
        isExporting: false,
        error: null,
        lastExportedAt: new Date().toISOString(),
      });
    } catch (err) {
      setState({
        isExporting: false,
        error: err instanceof Error ? err.message : 'PDF export failed',
        lastExportedAt: null,
      });
    }
  }, []);

  return {
    ...state,
    printJobDetail,
    exportPdf,
  };
}
