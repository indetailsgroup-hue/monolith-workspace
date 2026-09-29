/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// ============================================================================
// Feature 1: Real Auth — supabaseAuth tests
// ============================================================================

import { deriveRoleFromUser, deriveRoleFromToken } from '../core/auth/supabaseAuth';
import type { User } from '@supabase/supabase-js';

describe('supabaseAuth — deriveRoleFromUser', () => {
  afterEach(() => cleanup());

  it('returns DESIGNER for null user', () => {
    expect(deriveRoleFromUser(null)).toBe('DESIGNER');
  });

  it('extracts role from app_metadata', () => {
    const user = { app_metadata: { role: 'FINANCE' }, user_metadata: {} } as unknown as User;
    expect(deriveRoleFromUser(user)).toBe('FINANCE');
  });

  it('falls back to user_metadata if app_metadata has no role', () => {
    const user = { app_metadata: {}, user_metadata: { role: 'FACTORY' } } as unknown as User;
    expect(deriveRoleFromUser(user)).toBe('FACTORY');
  });

  it('returns DESIGNER for invalid role string', () => {
    const user = { app_metadata: { role: 'SUPERUSER' }, user_metadata: {} } as unknown as User;
    expect(deriveRoleFromUser(user)).toBe('DESIGNER');
  });

  it('returns ADMIN correctly', () => {
    const user = { app_metadata: { role: 'ADMIN' }, user_metadata: {} } as unknown as User;
    expect(deriveRoleFromUser(user)).toBe('ADMIN');
  });
});

describe('supabaseAuth — deriveRoleFromToken', () => {
  it('extracts role from JWT payload', () => {
    const payload = { app_metadata: { role: 'FINANCE' }, sub: '123' };
    const token = `header.${btoa(JSON.stringify(payload))}.signature`;
    expect(deriveRoleFromToken(token)).toBe('FINANCE');
  });

  it('returns DESIGNER for malformed token', () => {
    expect(deriveRoleFromToken('not.a.valid.token')).toBe('DESIGNER');
    expect(deriveRoleFromToken('')).toBe('DESIGNER');
  });

  it('returns DESIGNER if no role in payload', () => {
    const payload = { sub: '123', app_metadata: {} };
    const token = `x.${btoa(JSON.stringify(payload))}.y`;
    expect(deriveRoleFromToken(token)).toBe('DESIGNER');
  });
});

// ============================================================================
// Feature 2: Job Lifecycle — types + store tests
// ============================================================================

import {
  canTransition,
  getNextStatuses,
  isTerminal,
  isActive,
  generateJobCode,
  resetJobCodeCounter,
  type CreateJobInput,
} from '../jobs/types';
import { useJobStore } from '../jobs/jobStore';

describe('Job types — canTransition', () => {
  it('DRAFT → QUOTED is valid', () => {
    expect(canTransition('DRAFT', 'QUOTED')).toBe(true);
  });

  it('DRAFT → APPROVED is invalid', () => {
    expect(canTransition('DRAFT', 'APPROVED')).toBe(false);
  });

  it('IN_PRODUCTION → QC is valid', () => {
    expect(canTransition('IN_PRODUCTION', 'QC')).toBe(true);
  });

  it('CLOSED has no transitions', () => {
    expect(getNextStatuses('CLOSED')).toEqual([]);
  });

  it('isTerminal returns true for CLOSED', () => {
    expect(isTerminal('CLOSED')).toBe(true);
    expect(isTerminal('DRAFT')).toBe(false);
  });

  it('isActive returns false for CLOSED/DELIVERED/INVOICED', () => {
    expect(isActive('CLOSED')).toBe(false);
    expect(isActive('INVOICED')).toBe(false);
    expect(isActive('IN_PRODUCTION')).toBe(true);
  });

  it('QC can go back to IN_PRODUCTION', () => {
    expect(canTransition('QC', 'IN_PRODUCTION')).toBe(true);
  });
});

describe('Job types — generateJobCode', () => {
  beforeEach(() => resetJobCodeCounter());

  it('generates sequential codes', () => {
    expect(generateJobCode()).toMatch(/^DAPH-\d{4}-0001$/);
    expect(generateJobCode()).toMatch(/^DAPH-\d{4}-0002$/);
  });

  it('uses custom prefix', () => {
    expect(generateJobCode('TEST')).toMatch(/^TEST-\d{4}-0001$/);
  });
});

describe('jobStore', () => {
  beforeEach(() => {
    useJobStore.setState({ jobs: [], selectedJobId: null });
    resetJobCodeCounter();
  });

  const mockInput: CreateJobInput = {
    title: 'ตู้ครัว คอนโด IDEO',
    customer: { customerId: 'c1', name: 'คุณสมชาย', phone: '081-xxx-xxxx' },
    panels: [
      { panelId: 'p1', name: 'ฝาตู้บน', material: 'MDF 18mm White', width: 600, height: 400, qty: 4, isCurved: false },
    ],
    priority: 'NORMAL',
    materialGroup: 'MDF 18mm White',
    deadline: '2026-09-15',
  };

  it('creates a job in DRAFT status', () => {
    const job = useJobStore.getState().createJob(mockInput, 'user1');
    expect(job.status).toBe('DRAFT');
    expect(job.title).toBe('ตู้ครัว คอนโด IDEO');
    expect(job.totalPanelCount).toBe(4);
    expect(job.jobCode).toMatch(/^DAPH-/);
  });

  it('transitions status correctly', () => {
    const job = useJobStore.getState().createJob(mockInput, 'user1');
    const result = useJobStore.getState().transitionStatus(job.jobId, 'QUOTED');
    expect(result.success).toBe(true);
    expect(useJobStore.getState().getJob(job.jobId)?.status).toBe('QUOTED');
  });

  it('rejects invalid transitions', () => {
    const job = useJobStore.getState().createJob(mockInput, 'user1');
    const result = useJobStore.getState().transitionStatus(job.jobId, 'DELIVERED');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot transition');
  });

  it('deletes DRAFT jobs', () => {
    const job = useJobStore.getState().createJob(mockInput, 'user1');
    const result = useJobStore.getState().deleteJob(job.jobId);
    expect(result.success).toBe(true);
    expect(useJobStore.getState().jobs).toHaveLength(0);
  });

  it('cannot delete IN_PRODUCTION jobs', () => {
    const job = useJobStore.getState().createJob(mockInput, 'user1');
    useJobStore.getState().transitionStatus(job.jobId, 'QUOTED');
    useJobStore.getState().transitionStatus(job.jobId, 'APPROVED');
    useJobStore.getState().transitionStatus(job.jobId, 'IN_PRODUCTION');
    const result = useJobStore.getState().deleteJob(job.jobId);
    expect(result.success).toBe(false);
  });

  it('getActiveJobs filters out CLOSED/DELIVERED/INVOICED', () => {
    useJobStore.getState().createJob(mockInput, 'user1');
    useJobStore.getState().createJob({ ...mockInput, title: 'job2' }, 'user1');
    expect(useJobStore.getState().getActiveJobs()).toHaveLength(2);
  });

  it('links quotation to job', () => {
    const job = useJobStore.getState().createJob(mockInput, 'user1');
    useJobStore.getState().linkQuotation(job.jobId, 'qt-001');
    expect(useJobStore.getState().getJob(job.jobId)?.quotationId).toBe('qt-001');
  });
});

// ============================================================================
// Feature 3: Quotation + Invoice — types + store tests
// ============================================================================

import {
  calculateLineAmount,
  calculateQuotationTotals,
  calculateInvoiceRemaining,
  isInvoiceOverdue,
  resetQuotationCounter,
  resetInvoiceCounter,
  type QuotationLineItem,
  type Invoice,
  type InvoicePayment,
} from '../quotation/types';
import { useQuotationStore, estimateUnitPrice } from '../quotation/quotationStore';
import type { Job, JobPanel } from '../jobs/types';

describe('Quotation types — calculations', () => {
  it('calculateLineAmount multiplies qty × unitPrice', () => {
    expect(calculateLineAmount(3, 500)).toBe(1500);
    expect(calculateLineAmount(2, 333.33)).toBeCloseTo(666.66, 1);
  });

  it('calculateQuotationTotals with VAT 7%', () => {
    const lines: QuotationLineItem[] = [
      { lineId: '1', description: 'A', material: 'X', qty: 2, unitPrice: 1000, amount: 2000 },
      { lineId: '2', description: 'B', material: 'Y', qty: 1, unitPrice: 500, amount: 500 },
    ];
    const { subtotal, vatAmount, total } = calculateQuotationTotals(lines, 0.07, 0);
    expect(subtotal).toBe(2500);
    expect(vatAmount).toBe(175);
    expect(total).toBe(2675);
  });

  it('calculateQuotationTotals with discount', () => {
    const lines: QuotationLineItem[] = [
      { lineId: '1', description: 'A', material: 'X', qty: 1, unitPrice: 1000, amount: 1000 },
    ];
    const { subtotal, vatAmount, total } = calculateQuotationTotals(lines, 0.07, 200);
    expect(subtotal).toBe(1000);
    // VAT on (1000 - 200) = 800 → 56
    expect(vatAmount).toBe(56);
    expect(total).toBe(856);
  });

  it('calculateInvoiceRemaining', () => {
    const payments: InvoicePayment[] = [
      { paymentId: '1', amount: 500, method: 'TRANSFER', paidAt: '2026-01-01' },
      { paymentId: '2', amount: 300, method: 'CASH', paidAt: '2026-01-02' },
    ];
    expect(calculateInvoiceRemaining(1000, payments)).toBe(200);
  });

  it('isInvoiceOverdue returns true for past due', () => {
    const inv = { status: 'PENDING', dueDate: '2020-01-01' } as Invoice;
    expect(isInvoiceOverdue(inv)).toBe(true);
  });

  it('isInvoiceOverdue returns false for PAID', () => {
    const inv = { status: 'PAID', dueDate: '2020-01-01' } as Invoice;
    expect(isInvoiceOverdue(inv)).toBe(false);
  });
});

describe('estimateUnitPrice', () => {
  it('calculates area-based price', () => {
    const panel: JobPanel = { panelId: 'p1', name: 'test', material: 'MDF 18mm White', width: 1000, height: 1000, qty: 1, isCurved: false };
    // 1m² × 850 = 850
    expect(estimateUnitPrice(panel)).toBe(850);
  });

  it('applies 30% surcharge for curved panels', () => {
    const panel: JobPanel = { panelId: 'p1', name: 'test', material: 'MDF 18mm White', width: 1000, height: 1000, qty: 1, isCurved: true };
    // 850 × 1.3 = 1105
    expect(estimateUnitPrice(panel)).toBe(1105);
  });

  it('minimum price is 100', () => {
    const panel: JobPanel = { panelId: 'p1', name: 'tiny', material: 'MDF 18mm White', width: 10, height: 10, qty: 1, isCurved: false };
    expect(estimateUnitPrice(panel)).toBe(100);
  });
});

describe('quotationStore', () => {
  beforeEach(() => {
    useQuotationStore.setState({ quotations: [], invoices: [] });
    resetQuotationCounter();
    resetInvoiceCounter();
  });

  const mockJob: Job = {
    jobId: 'j1',
    jobCode: 'DAPH-2026-0001',
    title: 'Test Job',
    customer: { customerId: 'c1', name: 'Customer A' },
    panels: [
      { panelId: 'p1', name: 'Panel A', material: 'MDF 18mm White', width: 1000, height: 500, qty: 2, isCurved: false },
      { panelId: 'p2', name: 'Panel B', material: 'MDF 18mm White', width: 600, height: 400, qty: 3, isCurved: true },
    ],
    status: 'DRAFT',
    priority: 'NORMAL',
    materialGroup: 'MDF 18mm White',
    totalPanelCount: 5,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    createdBy: 'user1',
  };

  it('creates quotation from job with calculated totals', () => {
    const qt = useQuotationStore.getState().createQuotation({
      job: mockJob,
      unitPrices: { p1: 500, p2: 700 },
      createdBy: 'user1',
    });
    expect(qt.status).toBe('DRAFT');
    expect(qt.quotationCode).toMatch(/^QT-\d{4}-0001$/);
    expect(qt.lines).toHaveLength(2);
    expect(qt.lines[0].amount).toBe(1000); // 2 × 500
    expect(qt.lines[1].amount).toBe(2100); // 3 × 700
    expect(qt.subtotal).toBe(3100);
    expect(qt.total).toBeGreaterThan(qt.subtotal); // includes VAT
  });

  it('approves quotation and creates invoice', () => {
    const qt = useQuotationStore.getState().createQuotation({
      job: mockJob,
      unitPrices: { p1: 500, p2: 700 },
      createdBy: 'user1',
    });

    const result = useQuotationStore.getState().approveQuotation(qt.quotationId, 'admin1', 30);
    expect(result.success).toBe(true);
    expect(result.invoice).toBeDefined();
    expect(result.invoice!.invoiceCode).toMatch(/^INV-/);
    expect(result.invoice!.status).toBe('PENDING');
    expect(result.invoice!.total).toBe(qt.total);

    // Quotation updated
    const updatedQt = useQuotationStore.getState().getQuotation(qt.quotationId);
    expect(updatedQt?.status).toBe('APPROVED');
    expect(updatedQt?.approvedBy).toBe('admin1');
  });

  it('records payment and updates invoice status', () => {
    const qt = useQuotationStore.getState().createQuotation({
      job: mockJob,
      unitPrices: { p1: 500, p2: 700 },
      createdBy: 'user1',
    });
    const { invoice } = useQuotationStore.getState().approveQuotation(qt.quotationId, 'admin1');

    // Partial payment
    const r1 = useQuotationStore.getState().recordPayment(invoice!.invoiceId, {
      amount: 1000,
      method: 'TRANSFER',
      paidAt: '2026-08-27T10:00:00Z',
    });
    expect(r1.success).toBe(true);
    let inv = useQuotationStore.getState().getInvoice(invoice!.invoiceId)!;
    expect(inv.status).toBe('PARTIAL');
    expect(inv.paidAmount).toBe(1000);

    // Full payment
    const r2 = useQuotationStore.getState().recordPayment(invoice!.invoiceId, {
      amount: inv.remainingAmount,
      method: 'TRANSFER',
      paidAt: '2026-08-28T10:00:00Z',
    });
    expect(r2.success).toBe(true);
    inv = useQuotationStore.getState().getInvoice(invoice!.invoiceId)!;
    expect(inv.status).toBe('PAID');
    expect(inv.remainingAmount).toBe(0);
  });

  it('cannot approve already-approved quotation', () => {
    const qt = useQuotationStore.getState().createQuotation({
      job: mockJob,
      unitPrices: { p1: 500, p2: 700 },
      createdBy: 'user1',
    });
    useQuotationStore.getState().approveQuotation(qt.quotationId, 'admin1');
    const result = useQuotationStore.getState().approveQuotation(qt.quotationId, 'admin1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot approve');
  });

  it('getOverdueInvoices detects past-due', () => {
    const qt = useQuotationStore.getState().createQuotation({
      job: mockJob,
      unitPrices: { p1: 500, p2: 700 },
      createdBy: 'user1',
    });
    useQuotationStore.getState().approveQuotation(qt.quotationId, 'admin1', 0); // due today
    // Hack: manually set past due date
    useQuotationStore.setState((s) => ({
      invoices: s.invoices.map((i) => ({ ...i, dueDate: '2020-01-01' })),
    }));
    expect(useQuotationStore.getState().getOverdueInvoices()).toHaveLength(1);
  });

  it('getPendingQuotations returns DRAFT and SENT', () => {
    useQuotationStore.getState().createQuotation({
      job: mockJob,
      unitPrices: { p1: 500, p2: 700 },
      createdBy: 'user1',
    });
    expect(useQuotationStore.getState().getPendingQuotations()).toHaveLength(1);
  });
});
