/**
 * quotation/types.ts — Quotation & Invoice types for MONOLITH
 *
 * Flow: Quotation (DRAFT → SENT → APPROVED → EXPIRED/REJECTED)
 *       → on APPROVED: auto-create Job + Invoice
 */

export type QuotationStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type InvoiceStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export const QUOTATION_STATUSES: QuotationStatus[] = ['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED'];
export const INVOICE_STATUSES: InvoiceStatus[] = ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'];

// ============================================================================
// Quotation Line Item
// ============================================================================

export interface QuotationLineItem {
  lineId: string;
  description: string;
  material: string;
  dimensions?: string;   // e.g. "600×400mm"
  qty: number;
  unitPrice: number;     // THB per unit
  amount: number;        // qty × unitPrice
  isCurved?: boolean;
}

// ============================================================================
// Quotation
// ============================================================================

export interface Quotation {
  quotationId: string;
  quotationCode: string;  // e.g. "QT-2026-0015"
  jobId?: string;         // linked job (set on approval)
  customerId: string;
  customerName: string;
  customerAddress?: string;
  customerPhone?: string;
  
  lines: QuotationLineItem[];
  
  subtotal: number;       // sum of line amounts
  vatRate: number;        // e.g. 0.07 for 7%
  vatAmount: number;      // subtotal × vatRate
  total: number;          // subtotal + vatAmount
  discount?: number;      // flat discount before VAT
  
  status: QuotationStatus;
  validUntil?: string;    // ISO date — auto-expire after this
  notes?: string;
  terms?: string;         // payment terms
  
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  approvedAt?: string;
  approvedBy?: string;
}

// ============================================================================
// Invoice
// ============================================================================

export interface InvoicePayment {
  paymentId: string;
  amount: number;
  method: 'TRANSFER' | 'CASH' | 'CHEQUE' | 'CREDIT';
  reference?: string;
  paidAt: string;
}

export interface Invoice {
  invoiceId: string;
  invoiceCode: string;    // e.g. "INV-2026-0015"
  quotationId: string;
  jobId: string;
  customerId: string;
  customerName: string;
  
  lines: QuotationLineItem[];  // copied from quotation
  
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  discount?: number;
  
  status: InvoiceStatus;
  dueDate: string;        // ISO date
  payments: InvoicePayment[];
  paidAmount: number;     // sum of payments
  remainingAmount: number; // total - paidAmount
  
  issuedAt: string;
  createdBy: string;
  notes?: string;
}

// ============================================================================
// Calculation Helpers
// ============================================================================

export function calculateLineAmount(qty: number, unitPrice: number): number {
  return Math.round(qty * unitPrice * 100) / 100;
}

export function calculateQuotationTotals(
  lines: QuotationLineItem[],
  vatRate: number = 0.07,
  discount: number = 0,
): { subtotal: number; vatAmount: number; total: number } {
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const afterDiscount = Math.max(0, subtotal - discount);
  const vatAmount = Math.round(afterDiscount * vatRate * 100) / 100;
  const total = Math.round((afterDiscount + vatAmount) * 100) / 100;
  return { subtotal: Math.round(subtotal * 100) / 100, vatAmount, total };
}

export function calculateInvoiceRemaining(total: number, payments: InvoicePayment[]): number {
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  return Math.round((total - paid) * 100) / 100;
}

export function isInvoiceOverdue(invoice: Invoice): boolean {
  if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') return false;
  return new Date(invoice.dueDate) < new Date();
}

// ============================================================================
// Code Generators
// ============================================================================

let _qtCounter = 0;
let _invCounter = 0;

export function generateQuotationCode(): string {
  _qtCounter += 1;
  return `QT-${new Date().getFullYear()}-${String(_qtCounter).padStart(4, '0')}`;
}

export function generateInvoiceCode(): string {
  _invCounter += 1;
  return `INV-${new Date().getFullYear()}-${String(_invCounter).padStart(4, '0')}`;
}

export function resetQuotationCounter(): void { _qtCounter = 0; }
export function resetInvoiceCounter(): void { _invCounter = 0; }
