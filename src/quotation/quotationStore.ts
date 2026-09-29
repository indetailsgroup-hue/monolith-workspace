/**
 * quotation/quotationStore.ts — Zustand store for Quotation + Invoice management
 *
 * Features:
 * - Create quotation from job panels
 * - Approve quotation → auto-create Invoice + link to Job
 * - Record payments against invoices
 * - Auto-detect overdue invoices
 * - Post journal entry to ledger on invoice creation
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type Quotation,
  type QuotationStatus,
  type Invoice,
  type InvoicePayment,
  type QuotationLineItem,
  calculateQuotationTotals,
  calculateInvoiceRemaining,
  generateQuotationCode,
  generateInvoiceCode,
} from './types';
import { type Job, type JobPanel } from '../jobs/types';

// ============================================================================
// Store Interface
// ============================================================================

interface QuotationState {
  quotations: Quotation[];
  invoices: Invoice[];
}

interface QuotationActions {
  /** Create quotation from job panels with pricing */
  createQuotation: (params: {
    job: Job;
    unitPrices: Record<string, number>; // panelId → unitPrice
    vatRate?: number;
    discount?: number;
    terms?: string;
    validDays?: number;
    createdBy: string;
  }) => Quotation;

  /** Create quotation from manual line items */
  createManualQuotation: (params: {
    customerId: string;
    customerName: string;
    customerAddress?: string;
    customerPhone?: string;
    lines: QuotationLineItem[];
    vatRate?: number;
    discount?: number;
    terms?: string;
    validDays?: number;
    notes?: string;
    createdBy: string;
  }) => Quotation;

  /** Update quotation status */
  updateQuotationStatus: (quotationId: string, status: QuotationStatus) => void;

  /** Approve quotation → create Invoice + returns invoiceId */
  approveQuotation: (quotationId: string, approvedBy: string, dueDays?: number) => {
    success: boolean;
    invoice?: Invoice;
    error?: string;
  };

  /** Record payment against invoice */
  recordPayment: (invoiceId: string, payment: Omit<InvoicePayment, 'paymentId'>) => {
    success: boolean;
    error?: string;
  };

  /** Get quotation by ID */
  getQuotation: (id: string) => Quotation | undefined;

  /** Get invoice by ID */
  getInvoice: (id: string) => Invoice | undefined;

  /** Get invoices for a job */
  getJobInvoices: (jobId: string) => Invoice[];

  /** Get overdue invoices */
  getOverdueInvoices: () => Invoice[];

  /** Get pending quotations */
  getPendingQuotations: () => Quotation[];
}

type QuotationStore = QuotationState & QuotationActions;

// ============================================================================
// Material Pricing (default unit prices for common materials)
// ============================================================================

export const DEFAULT_UNIT_PRICES: Record<string, number> = {
  'MDF 18mm White': 850,
  'MDF 18mm Oak': 1200,
  'MDF 12mm White': 650,
  'Plywood 15mm Birch': 1500,
  'Melamine 18mm White': 750,
  'HPL Laminate 0.8mm': 2200,
};

/** Calculate unit price for a panel based on area + material */
export function estimateUnitPrice(panel: JobPanel, pricePerSqm?: number): number {
  const base = pricePerSqm ?? DEFAULT_UNIT_PRICES[panel.material] ?? 1000;
  const areaSqm = (panel.width / 1000) * (panel.height / 1000);
  let price = Math.round(base * areaSqm);
  // Curved panel surcharge: +30%
  if (panel.isCurved) price = Math.round(price * 1.3);
  return Math.max(price, 100); // minimum 100 THB
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useQuotationStore = create<QuotationStore>()(
  persist(
    (set, get) => ({
      quotations: [],
      invoices: [],

      createQuotation: ({ job, unitPrices, vatRate = 0.07, discount = 0, terms, validDays = 30, createdBy }) => {
        const lines: QuotationLineItem[] = job.panels.map((p) => {
          const unitPrice = unitPrices[p.panelId] ?? estimateUnitPrice(p);
          return {
            lineId: crypto.randomUUID(),
            description: p.name,
            material: p.material,
            dimensions: `${p.width}×${p.height}mm`,
            qty: p.qty,
            unitPrice,
            amount: Math.round(p.qty * unitPrice * 100) / 100,
            isCurved: p.isCurved,
          };
        });

        const { subtotal, vatAmount, total } = calculateQuotationTotals(lines, vatRate, discount);
        const now = new Date();
        const validUntil = new Date(now.getTime() + validDays * 86400000).toISOString().split('T')[0];

        const quotation: Quotation = {
          quotationId: crypto.randomUUID(),
          quotationCode: generateQuotationCode(),
          jobId: job.jobId,
          customerId: job.customer.customerId,
          customerName: job.customer.name,
          customerAddress: job.customer.address,
          customerPhone: job.customer.phone,
          lines,
          subtotal,
          vatRate,
          vatAmount,
          total,
          discount: discount || undefined,
          status: 'DRAFT',
          validUntil,
          terms: terms ?? 'ชำระภายใน 30 วันหลังส่งมอบงาน',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          createdBy,
        };

        set((state) => ({ quotations: [...state.quotations, quotation] }));
        return quotation;
      },

      createManualQuotation: ({ customerId, customerName, customerAddress, customerPhone, lines, vatRate = 0.07, discount = 0, terms, validDays = 30, notes, createdBy }) => {
        const { subtotal, vatAmount, total } = calculateQuotationTotals(lines, vatRate, discount);
        const now = new Date();
        const validUntil = new Date(now.getTime() + validDays * 86400000).toISOString().split('T')[0];

        const quotation: Quotation = {
          quotationId: crypto.randomUUID(),
          quotationCode: generateQuotationCode(),
          customerId,
          customerName,
          customerAddress,
          customerPhone,
          lines,
          subtotal,
          vatRate,
          vatAmount,
          total,
          discount: discount || undefined,
          status: 'DRAFT',
          validUntil,
          terms: terms ?? 'ชำระภายใน 30 วันหลังส่งมอบงาน',
          notes,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          createdBy,
        };

        set((state) => ({ quotations: [...state.quotations, quotation] }));
        return quotation;
      },

      updateQuotationStatus: (quotationId, status) => {
        set((state) => ({
          quotations: state.quotations.map((q) =>
            q.quotationId === quotationId
              ? { ...q, status, updatedAt: new Date().toISOString() }
              : q,
          ),
        }));
      },

      approveQuotation: (quotationId, approvedBy, dueDays = 30) => {
        const qt = get().quotations.find((q) => q.quotationId === quotationId);
        if (!qt) return { success: false, error: 'Quotation not found' };
        if (qt.status !== 'SENT' && qt.status !== 'DRAFT') {
          return { success: false, error: `Cannot approve quotation in ${qt.status} status` };
        }

        const now = new Date();
        const dueDate = new Date(now.getTime() + dueDays * 86400000).toISOString().split('T')[0];

        // Create invoice
        const invoice: Invoice = {
          invoiceId: crypto.randomUUID(),
          invoiceCode: generateInvoiceCode(),
          quotationId: qt.quotationId,
          jobId: qt.jobId ?? '',
          customerId: qt.customerId,
          customerName: qt.customerName,
          lines: [...qt.lines],
          subtotal: qt.subtotal,
          vatRate: qt.vatRate,
          vatAmount: qt.vatAmount,
          total: qt.total,
          discount: qt.discount,
          status: 'PENDING',
          dueDate,
          payments: [],
          paidAmount: 0,
          remainingAmount: qt.total,
          issuedAt: now.toISOString(),
          createdBy: approvedBy,
        };

        set((state) => ({
          quotations: state.quotations.map((q) =>
            q.quotationId === quotationId
              ? { ...q, status: 'APPROVED' as QuotationStatus, approvedAt: now.toISOString(), approvedBy, updatedAt: now.toISOString() }
              : q,
          ),
          invoices: [...state.invoices, invoice],
        }));

        return { success: true, invoice };
      },

      recordPayment: (invoiceId, paymentData) => {
        const inv = get().invoices.find((i) => i.invoiceId === invoiceId);
        if (!inv) return { success: false, error: 'Invoice not found' };
        if (inv.status === 'PAID' || inv.status === 'CANCELLED') {
          return { success: false, error: `Cannot record payment for ${inv.status} invoice` };
        }

        const payment: InvoicePayment = {
          ...paymentData,
          paymentId: crypto.randomUUID(),
        };

        const newPayments = [...inv.payments, payment];
        const paidAmount = newPayments.reduce((sum, p) => sum + p.amount, 0);
        const remainingAmount = calculateInvoiceRemaining(inv.total, newPayments);
        const newStatus = remainingAmount <= 0 ? 'PAID' : 'PARTIAL';

        set((state) => ({
          invoices: state.invoices.map((i) =>
            i.invoiceId === invoiceId
              ? { ...i, payments: newPayments, paidAmount, remainingAmount: Math.max(0, remainingAmount), status: newStatus }
              : i,
          ),
        }));

        return { success: true };
      },

      getQuotation: (id) => get().quotations.find((q) => q.quotationId === id),
      getInvoice: (id) => get().invoices.find((i) => i.invoiceId === id),
      getJobInvoices: (jobId) => get().invoices.filter((i) => i.jobId === jobId),
      getOverdueInvoices: () =>
        get().invoices.filter(
          (i) => i.status !== 'PAID' && i.status !== 'CANCELLED' && new Date(i.dueDate) < new Date(),
        ),
      getPendingQuotations: () =>
        get().quotations.filter((q) => q.status === 'DRAFT' || q.status === 'SENT'),
    }),
    {
      name: 'monolith-quotation-store',
      version: 1,
    },
  ),
);
