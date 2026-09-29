/**
 * Supabase Edge Function: generate-quotation-pdf
 *
 * Generates a professionally formatted quotation PDF with Thai locale (TH/EN bilingual).
 * Uses jsPDF for PDF generation with Thai number formatting.
 *
 * Request body:
 * {
 *   quotation: Quotation object,
 *   options?: { companyName, companyAddress, ... }
 * }
 *
 * Returns: PDF binary (application/pdf)
 *
 * Deploy: supabase functions deploy generate-quotation-pdf
 *
 * @version 15.2.0
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { jsPDF } from 'https://esm.sh/jspdf@2.5.1';

// ============================================================================
// Types
// ============================================================================

interface QuotationLineItem {
  lineId: string;
  description: string;
  material: string;
  dimensions?: string;
  qty: number;
  unitPrice: number;
  amount: number;
  isCurved?: boolean;
}

interface Quotation {
  quotationId: string;
  quotationCode: string;
  jobId: string;
  customerName: string;
  customerAddress?: string;
  customerPhone?: string;
  customerTaxId?: string;
  lines: QuotationLineItem[];
  subtotal: number;
  discount?: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  status: string;
  validUntil?: string;
  terms?: string;
  notes?: string;
  createdAt: string;
}

interface PdfOptions {
  companyName?: string;
  companyNameTh?: string;
  companyAddress?: string;
  companyAddressTh?: string;
  companyPhone?: string;
  companyTaxId?: string;
  bankName?: string;
  bankAccount?: string;
  paymentTermsDays?: number;
}

// ============================================================================
// Thai Locale Helpers
// ============================================================================

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const THAI_DIGITS = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];

/** Convert number to Thai digits */
function toThaiDigits(num: number | string): string {
  return String(num).replace(/\d/g, (d) => THAI_DIGITS[parseInt(d)]);
}

/** Format number as Thai Baht with commas */
function formatBaht(amount: number): string {
  return amount.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format date as Thai date string */
function formatThaiDate(isoDate: string): string {
  const d = new Date(isoDate);
  const day = d.getDate();
  const month = THAI_MONTHS[d.getMonth()];
  const year = d.getFullYear() + 543; // Buddhist Era
  return `${day} ${month} ${year}`;
}

/** Convert number to Thai Baht text (for checks/receipts) */
function numberToThaiText(num: number): string {
  if (num === 0) return 'ศูนย์บาทถ้วน';

  const units = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const positions = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);

  function convertGroup(n: number): string {
    if (n === 0) return '';
    const digits = String(n).split('').map(Number);
    let result = '';

    for (let i = 0; i < digits.length; i++) {
      const pos = digits.length - 1 - i;
      const digit = digits[i];

      if (digit === 0) continue;
      if (pos === 0 && digit === 1 && digits.length > 1) {
        result += 'เอ็ด';
      } else if (pos === 1 && digit === 1) {
        result += 'สิบ';
      } else if (pos === 1 && digit === 2) {
        result += 'ยี่สิบ';
      } else {
        result += units[digit] + positions[pos];
      }
    }
    return result;
  }

  let text = convertGroup(intPart) + 'บาท';
  if (decPart > 0) {
    text += convertGroup(decPart) + 'สตางค์';
  } else {
    text += 'ถ้วน';
  }

  return text;
}

// ============================================================================
// PDF Generation
// ============================================================================

function generatePdf(quotation: Quotation, options: PdfOptions = {}): Uint8Array {
  const opts: Required<PdfOptions> = {
    companyName: options.companyName ?? 'DAPH Decor Co., Ltd.',
    companyNameTh: options.companyNameTh ?? 'บริษัท ดาฟ เดคอร์ จำกัด',
    companyAddress: options.companyAddress ?? '123/45 Sukhumvit Rd, Khlong Tan, Khlong Toei, Bangkok 10110',
    companyAddressTh: options.companyAddressTh ?? '123/45 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110',
    companyPhone: options.companyPhone ?? '02-xxx-xxxx',
    companyTaxId: options.companyTaxId ?? '0-1234-56789-01-2',
    bankName: options.bankName ?? 'ธนาคารกสิกรไทย (KBANK)',
    bankAccount: options.bankAccount ?? '123-4-56789-0',
    paymentTermsDays: options.paymentTermsDays ?? 30,
  };

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 18;

  // ── Company Header ──────────────────────────────────────────────────────

  // Title: ใบเสนอราคา / QUOTATION
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('QUOTATION', pageWidth / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(12);
  doc.text('ใบเสนอราคา', pageWidth / 2, y, { align: 'center' });
  y += 8;

  // Company info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(opts.companyName, pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.setFontSize(8);
  doc.text(opts.companyAddressTh, pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text(
    `โทร: ${opts.companyPhone} | เลขประจำตัวผู้เสียภาษี: ${opts.companyTaxId}`,
    pageWidth / 2,
    y,
    { align: 'center' },
  );
  y += 8;

  // Divider
  doc.setDrawColor(180);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // ── Document Info ───────────────────────────────────────────────────────

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`เลขที่ / No: ${quotation.quotationCode}`, margin, y);
  doc.text(`วันที่ / Date: ${formatThaiDate(quotation.createdAt)}`, pageWidth - margin, y, { align: 'right' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  const validUntilText = quotation.validUntil
    ? formatThaiDate(quotation.validUntil)
    : `${opts.paymentTermsDays} วันนับจากวันที่ออก`;
  doc.text(`ใช้ได้ถึง / Valid Until: ${validUntilText}`, margin, y);
  doc.text(`สถานะ / Status: ${quotation.status}`, pageWidth - margin, y, { align: 'right' });
  y += 8;

  // ── Customer Info ───────────────────────────────────────────────────────

  doc.setFont('helvetica', 'bold');
  doc.text('ลูกค้า / Customer:', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(quotation.customerName, margin + 2, y);
  y += 4;
  if (quotation.customerAddress) {
    doc.text(quotation.customerAddress, margin + 2, y);
    y += 4;
  }
  if (quotation.customerPhone) {
    doc.text(`โทร: ${quotation.customerPhone}`, margin + 2, y);
    y += 4;
  }
  if (quotation.customerTaxId) {
    doc.text(`เลขผู้เสียภาษี: ${quotation.customerTaxId}`, margin + 2, y);
    y += 4;
  }
  y += 6;

  // ── Line Items Table ────────────────────────────────────────────────────

  // Table header background
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(margin, y - 4, pageWidth - margin * 2, 8, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);

  const cols = {
    no: margin + 2,
    desc: margin + 12,
    material: margin + 75,
    size: margin + 105,
    qty: margin + 125,
    price: margin + 138,
    amount: margin + 160,
  };

  doc.text('#', cols.no, y);
  doc.text('รายการ / Description', cols.desc, y);
  doc.text('วัสดุ', cols.material, y);
  doc.text('ขนาด', cols.size, y);
  doc.text('จำนวน', cols.qty, y);
  doc.text('ราคา/หน่วย', cols.price, y);
  doc.text('จำนวนเงิน', cols.amount, y);
  y += 7;

  // Reset text color
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');

  // Table rows
  for (let i = 0; i < quotation.lines.length; i++) {
    const line = quotation.lines[i];

    // Page break check
    if (y > 255) {
      doc.addPage();
      y = 20;
    }

    // Alternating row background
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y - 3, pageWidth - margin * 2, 6, 'F');
    }

    doc.text(String(i + 1), cols.no, y);
    doc.text(line.description.substring(0, 28), cols.desc, y);
    doc.text(line.material.substring(0, 12), cols.material, y);
    doc.text(line.dimensions ?? '-', cols.size, y);
    doc.text(String(line.qty), cols.qty, y);
    doc.text(formatBaht(line.unitPrice), cols.price, y);
    doc.text(formatBaht(line.amount), cols.amount, y);
    y += 6;
  }

  y += 4;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // ── Totals ──────────────────────────────────────────────────────────────

  const totalsLabelX = pageWidth - 80;
  const totalsValueX = pageWidth - margin;
  doc.setFontSize(9);

  doc.text('รวมเงิน / Subtotal:', totalsLabelX, y);
  doc.text(`${formatBaht(quotation.subtotal)} บาท`, totalsValueX, y, { align: 'right' });
  y += 5;

  if (quotation.discount && quotation.discount > 0) {
    doc.text('ส่วนลด / Discount:', totalsLabelX, y);
    doc.text(`-${formatBaht(quotation.discount)} บาท`, totalsValueX, y, { align: 'right' });
    y += 5;
  }

  if (quotation.vatRate > 0) {
    const vatPct = (quotation.vatRate * 100).toFixed(0);
    doc.text(`ภาษีมูลค่าเพิ่ม / VAT (${vatPct}%):`, totalsLabelX, y);
    doc.text(`${formatBaht(quotation.vatAmount)} บาท`, totalsValueX, y, { align: 'right' });
    y += 5;
  }

  // Grand total
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('รวมทั้งสิ้น / Grand Total:', totalsLabelX, y + 2);
  doc.text(`${formatBaht(quotation.total)} บาท`, totalsValueX, y + 2, { align: 'right' });
  y += 8;

  // Thai text amount
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`(${numberToThaiText(quotation.total)})`, totalsLabelX, y);
  y += 10;

  // ── Payment Info ────────────────────────────────────────────────────────

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('การชำระเงิน / Payment:', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`ธนาคาร: ${opts.bankName}`, margin + 2, y);
  y += 4;
  doc.text(`เลขบัญชี: ${opts.bankAccount}`, margin + 2, y);
  y += 4;
  doc.text(`ชื่อบัญชี: ${opts.companyNameTh}`, margin + 2, y);
  y += 6;

  // Terms
  if (quotation.terms) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('เงื่อนไข / Terms:', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(quotation.terms, margin + 2, y);
    y += 6;
  }

  // Notes
  if (quotation.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('หมายเหตุ / Notes:', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const noteLines = doc.splitTextToSize(quotation.notes, pageWidth - margin * 2 - 4);
    doc.text(noteLines, margin + 2, y);
    y += noteLines.length * 4 + 6;
  }

  // ── Footer ──────────────────────────────────────────────────────────────

  const footerY = 275;
  doc.setDrawColor(200);
  doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

  doc.setFontSize(7);
  doc.setTextColor(128);
  doc.text(
    'เอกสารนี้ออกโดยระบบ MONOLITH Manufacturing OS — DAPH Decor Co., Ltd.',
    pageWidth / 2,
    footerY,
    { align: 'center' },
  );
  doc.text(
    `Generated: ${new Date().toISOString()}`,
    pageWidth / 2,
    footerY + 3,
    { align: 'center' },
  );

  // Return as binary
  return doc.output('arraybuffer') as unknown as Uint8Array;
}

// ============================================================================
// Edge Function Handler
// ============================================================================

serve(async (req: Request) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { quotation, options } = body;

    if (!quotation || !quotation.quotationCode) {
      return new Response(
        JSON.stringify({ error: 'Missing quotation data' }),
        { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } },
      );
    }

    const pdfBytes = generatePdf(quotation, options ?? {});

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${quotation.quotationCode}.pdf"`,
        'cache-control': 'no-cache',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    );
  }
});
