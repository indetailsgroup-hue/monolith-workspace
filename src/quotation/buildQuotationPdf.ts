/**
 * quotation/buildQuotationPdf.ts — PDF export for quotations using jsPDF
 *
 * Generates a professional Thai/English quotation PDF with:
 * - Company header (DAPH Decor)
 * - Customer info
 * - Line items table
 * - Totals with VAT
 * - Terms and conditions
 * - QR code placeholder for payment
 */

import { jsPDF } from 'jspdf';
import { type Quotation } from './types';

// ============================================================================
// PDF Generation
// ============================================================================

export interface QuotationPdfOptions {
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxId?: string;
  logoUrl?: string;
}

const DEFAULT_OPTIONS: QuotationPdfOptions = {
  companyName: 'DAPH Decor Co., Ltd.',
  companyAddress: '123/45 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110',
  companyPhone: '02-xxx-xxxx',
  companyTaxId: '0-1234-56789-01-2',
};

export function buildQuotationPdf(
  quotation: Quotation,
  options: QuotationPdfOptions = {},
): jsPDF {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // ── Header ──────────────────────────────────────────────────────────────

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('QUOTATION', pageWidth / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(opts.companyName!, pageWidth / 2, y, { align: 'center' });
  y += 5;
  doc.setFontSize(8);
  doc.text(opts.companyAddress!, pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text(`Tel: ${opts.companyPhone} | Tax ID: ${opts.companyTaxId}`, pageWidth / 2, y, { align: 'center' });
  y += 10;

  // ── Quotation Info ──────────────────────────────────────────────────────

  doc.setDrawColor(200);
  doc.line(15, y, pageWidth - 15, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Quotation No: ${quotation.quotationCode}`, 15, y);
  doc.text(`Date: ${quotation.createdAt.split('T')[0]}`, pageWidth - 15, y, { align: 'right' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(`Valid Until: ${quotation.validUntil ?? 'N/A'}`, 15, y);
  doc.text(`Status: ${quotation.status}`, pageWidth - 15, y, { align: 'right' });
  y += 8;

  // ── Customer ────────────────────────────────────────────────────────────

  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', 15, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(quotation.customerName, 15, y);
  y += 4;
  if (quotation.customerAddress) {
    doc.text(quotation.customerAddress, 15, y);
    y += 4;
  }
  if (quotation.customerPhone) {
    doc.text(`Tel: ${quotation.customerPhone}`, 15, y);
    y += 4;
  }
  y += 6;

  // ── Line Items Table ────────────────────────────────────────────────────

  const colX = [15, 80, 110, 128, 153, 180];
  const headers = ['Description', 'Material', 'Size', 'Qty', 'Unit Price', 'Amount'];

  // Table header
  doc.setFillColor(240, 240, 240);
  doc.rect(15, y - 3, pageWidth - 30, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  headers.forEach((h, i) => {
    doc.text(h, colX[i], y);
  });
  y += 7;

  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  for (const line of quotation.lines) {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.text(line.description.substring(0, 30), colX[0], y);
    doc.text(line.material.substring(0, 15), colX[1], y);
    doc.text(line.dimensions ?? '', colX[2], y);
    doc.text(String(line.qty), colX[3], y);
    doc.text(line.unitPrice.toLocaleString(), colX[4], y);
    doc.text(line.amount.toLocaleString(), colX[5], y);
    y += 5;
  }

  y += 4;
  doc.line(15, y, pageWidth - 15, y);
  y += 8;

  // ── Totals ──────────────────────────────────────────────────────────────

  const totalsX = pageWidth - 60;
  doc.setFontSize(9);

  doc.text('Subtotal:', totalsX - 30, y);
  doc.text(`${quotation.subtotal.toLocaleString()} THB`, totalsX + 20, y, { align: 'right' });
  y += 5;

  if (quotation.discount) {
    doc.text('Discount:', totalsX - 30, y);
    doc.text(`-${quotation.discount.toLocaleString()} THB`, totalsX + 20, y, { align: 'right' });
    y += 5;
  }

  if (quotation.vatRate > 0) {
    doc.text(`VAT (${(quotation.vatRate * 100).toFixed(0)}%):`, totalsX - 30, y);
    doc.text(`${quotation.vatAmount.toLocaleString()} THB`, totalsX + 20, y, { align: 'right' });
    y += 5;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Total:', totalsX - 30, y + 2);
  doc.text(`${quotation.total.toLocaleString()} THB`, totalsX + 20, y + 2, { align: 'right' });
  y += 12;

  // ── Terms ───────────────────────────────────────────────────────────────

  if (quotation.terms) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Payment Terms:', 15, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(quotation.terms, 15, y);
    y += 8;
  }

  if (quotation.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Notes:', 15, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(quotation.notes, 15, y);
  }

  return doc;
}

/** Generate and trigger download */
export function downloadQuotationPdf(quotation: Quotation, options?: QuotationPdfOptions): void {
  const doc = buildQuotationPdf(quotation, options);
  doc.save(`${quotation.quotationCode}.pdf`);
}
