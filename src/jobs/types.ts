/**
 * jobs/types.ts — Job Lifecycle Types for MONOLITH
 *
 * Status machine: DRAFT → QUOTED → APPROVED → IN_PRODUCTION → QC → DELIVERED → INVOICED → CLOSED
 * Each transition requires specific role permissions.
 */

export type JobStatus =
  | 'DRAFT'
  | 'QUOTED'
  | 'APPROVED'
  | 'IN_PRODUCTION'
  | 'QC'
  | 'DELIVERED'
  | 'INVOICED'
  | 'CLOSED';

export const JOB_STATUSES: JobStatus[] = [
  'DRAFT',
  'QUOTED',
  'APPROVED',
  'IN_PRODUCTION',
  'QC',
  'DELIVERED',
  'INVOICED',
  'CLOSED',
];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  DRAFT: 'ร่าง',
  QUOTED: 'ใบเสนอราคา',
  APPROVED: 'อนุมัติ',
  IN_PRODUCTION: 'ผลิต',
  QC: 'ตรวจสอบ',
  DELIVERED: 'ส่งมอบ',
  INVOICED: 'วางบิล',
  CLOSED: 'ปิดงาน',
};

export const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  DRAFT: '#6b7280',
  QUOTED: '#8b5cf6',
  APPROVED: '#3b82f6',
  IN_PRODUCTION: '#f59e0b',
  QC: '#06b6d4',
  DELIVERED: '#22c55e',
  INVOICED: '#ec4899',
  CLOSED: '#374151',
};

/** Valid status transitions */
export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ['QUOTED'],
  QUOTED: ['APPROVED', 'DRAFT'], // can go back to draft for revision
  APPROVED: ['IN_PRODUCTION'],
  IN_PRODUCTION: ['QC'],
  QC: ['DELIVERED', 'IN_PRODUCTION'], // fail QC → back to production
  DELIVERED: ['INVOICED'],
  INVOICED: ['CLOSED'],
  CLOSED: [],
};

// ============================================================================
// Job Entity
// ============================================================================

export interface JobPanel {
  panelId: string;
  name: string;
  material: string;
  width: number;
  height: number;
  qty: number;
  isCurved: boolean;
  arcRadius?: number;
}

export interface JobCustomer {
  customerId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface Job {
  jobId: string;
  orgId?: string;              // tenant org (multi-tenant scoping)
  jobCode: string;            // e.g. "DAPH-2026-0042"
  title: string;
  customer: JobCustomer;
  panels: JobPanel[];
  status: JobStatus;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  assignedTo?: string;        // userId
  deadline?: string;          // ISO date
  materialGroup: string;      // primary material e.g. "MDF 18mm White"
  totalPanelCount: number;
  estimatedCost?: number;     // THB
  quotationId?: string;       // link to quotation
  invoiceId?: string;         // link to invoice
  notes?: string;
  createdAt: string;          // ISO
  updatedAt: string;          // ISO
  createdBy: string;          // userId
}

// ============================================================================
// Job Creation Input
// ============================================================================

export interface CreateJobInput {
  title: string;
  customer: JobCustomer;
  panels: JobPanel[];
  priority: Job['priority'];
  deadline?: string;
  materialGroup: string;
  notes?: string;
}

// ============================================================================
// Status Transition Validation
// ============================================================================

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from].includes(to);
}

export function getNextStatuses(current: JobStatus): JobStatus[] {
  return JOB_TRANSITIONS[current];
}

export function isTerminal(status: JobStatus): boolean {
  return status === 'CLOSED';
}

export function isActive(status: JobStatus): boolean {
  return !['CLOSED', 'DELIVERED', 'INVOICED'].includes(status);
}

// ============================================================================
// Job Code Generator
// ============================================================================

let _counter = 0;

export function generateJobCode(prefix: string = 'DAPH'): string {
  const year = new Date().getFullYear();
  _counter += 1;
  return `${prefix}-${year}-${String(_counter).padStart(4, '0')}`;
}

/** Reset counter (for testing) */
export function resetJobCodeCounter(): void {
  _counter = 0;
}
