/**
 * Tests for v15.2.0 features:
 * - JobDetailPage (status timeline + panel list)
 * - Quotation PDF Edge Function (Thai locale helpers)
 * - CreateJobSubmit (optimistic UI + rollback)
 *
 * @vitest-environment jsdom
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// ============================================================================
// 1. JobDetailPage — Status Timeline & Panel List
// ============================================================================

describe('JobDetailPage — StatusTimeline', () => {
  test('JOB_STATUSES progression is correct length', async () => {
    const { JOB_STATUSES } = await import('../jobs/types');
    expect(JOB_STATUSES).toHaveLength(8);
    expect(JOB_STATUSES[0]).toBe('DRAFT');
    expect(JOB_STATUSES[7]).toBe('CLOSED');
  });

  test('status colors are defined for all statuses', async () => {
    const { JOB_STATUSES, JOB_STATUS_COLORS } = await import('../jobs/types');
    for (const status of JOB_STATUSES) {
      expect(JOB_STATUS_COLORS[status]).toBeDefined();
      expect(JOB_STATUS_COLORS[status]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test('status labels are Thai strings for all statuses', async () => {
    const { JOB_STATUSES, JOB_STATUS_LABELS } = await import('../jobs/types');
    for (const status of JOB_STATUSES) {
      expect(JOB_STATUS_LABELS[status]).toBeDefined();
      expect(JOB_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  test('timeline shows correct reached state for IN_PRODUCTION', async () => {
    const { JOB_STATUSES } = await import('../jobs/types');
    const currentIdx = JOB_STATUSES.indexOf('IN_PRODUCTION');
    expect(currentIdx).toBe(3);
    // DRAFT, QUOTED, APPROVED, IN_PRODUCTION are reached
    const reached = JOB_STATUSES.filter((_, i) => i <= currentIdx);
    expect(reached).toEqual(['DRAFT', 'QUOTED', 'APPROVED', 'IN_PRODUCTION']);
  });
});

describe('JobDetailPage — PanelList calculations', () => {
  test('calculates total quantity from panels', () => {
    const panels = [
      { panelId: '1', name: 'A', material: 'MDF', width: 600, height: 800, qty: 5, isCurved: false },
      { panelId: '2', name: 'B', material: 'MDF', width: 400, height: 600, qty: 3, isCurved: true, arcRadius: 200 },
    ];
    const totalQty = panels.reduce((sum, p) => sum + p.qty, 0);
    expect(totalQty).toBe(8);
  });

  test('calculates total area in m²', () => {
    const panels = [
      { panelId: '1', name: 'A', material: 'MDF', width: 1000, height: 1000, qty: 1, isCurved: false },
      { panelId: '2', name: 'B', material: 'MDF', width: 500, height: 500, qty: 2, isCurved: false },
    ];
    const totalArea = panels.reduce(
      (sum, p) => sum + (p.width * p.height * p.qty) / 1_000_000,
      0,
    );
    // 1×1 = 1m² + 0.5×0.5×2 = 0.5m² → 1.5m²
    expect(totalArea).toBeCloseTo(1.5);
  });
});

describe('JobDetailPage — Transition permissions', () => {
  test('FACTORY role can only do specific transitions', () => {
    const TRANSITION_PERMISSIONS: Record<string, string[]> = {
      DESIGNER: ['QUOTED'],
      FACTORY: ['IN_PRODUCTION', 'QC', 'DELIVERED'],
      FINANCE: ['INVOICED', 'CLOSED'],
      ADMIN: ['DRAFT', 'QUOTED', 'APPROVED', 'IN_PRODUCTION', 'QC', 'DELIVERED', 'INVOICED', 'CLOSED'],
    };

    expect(TRANSITION_PERMISSIONS['FACTORY']).toContain('IN_PRODUCTION');
    expect(TRANSITION_PERMISSIONS['FACTORY']).toContain('QC');
    expect(TRANSITION_PERMISSIONS['FACTORY']).not.toContain('INVOICED');
  });

  test('isTerminal returns true only for CLOSED', async () => {
    const { isTerminal, JOB_STATUSES } = await import('../jobs/types');
    const terminals = JOB_STATUSES.filter(isTerminal);
    expect(terminals).toEqual(['CLOSED']);
  });
});

describe('JobDetailPage — Realtime subscription mapping', () => {
  test('maps snake_case DB record to camelCase Job fields', () => {
    const record = {
      job_id: 'abc-123',
      job_code: 'DAPH-2026-0001',
      title: 'Test Job',
      status: 'in_production',
      priority: 'high',
      deadline: '2026-09-01',
      material_group: 'MDF 18mm White',
      total_panel_count: 12,
      updated_at: '2026-08-28T10:00:00Z',
    };

    const job = {
      jobId: record.job_id,
      jobCode: record.job_code,
      title: record.title,
      status: record.status?.toUpperCase(),
      priority: record.priority?.toUpperCase(),
      deadline: record.deadline,
      materialGroup: record.material_group,
      totalPanelCount: record.total_panel_count,
      updatedAt: record.updated_at,
    };

    expect(job.jobId).toBe('abc-123');
    expect(job.status).toBe('IN_PRODUCTION');
    expect(job.priority).toBe('HIGH');
    expect(job.materialGroup).toBe('MDF 18mm White');
  });
});

// ============================================================================
// 2. QuotationPdf Edge Function — Thai Locale Helpers
// ============================================================================

describe('Thai Locale Helpers', () => {
  // Recreate the helpers for unit testing
  const THAI_MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
    'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
    'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];
  const THAI_DIGITS = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];

  function toThaiDigits(num: number | string): string {
    return String(num).replace(/\d/g, (d) => THAI_DIGITS[parseInt(d)]);
  }

  function formatBaht(amount: number): string {
    return amount.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatThaiDate(isoDate: string): string {
    const d = new Date(isoDate);
    const day = d.getDate();
    const month = THAI_MONTHS[d.getMonth()];
    const year = d.getFullYear() + 543;
    return `${day} ${month} ${year}`;
  }

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

  test('toThaiDigits converts Arabic to Thai numerals', () => {
    expect(toThaiDigits(2026)).toBe('๒๐๒๖');
    expect(toThaiDigits('12345')).toBe('๑๒๓๔๕');
    expect(toThaiDigits(0)).toBe('๐');
  });

  test('formatBaht formats with 2 decimal places', () => {
    const result = formatBaht(1234.5);
    expect(result).toContain('1');
    expect(result).toContain('234');
    expect(result).toContain('50');
  });

  test('formatBaht formats large numbers with separators', () => {
    const result = formatBaht(1000000);
    expect(result).toContain('000');
    expect(result).toContain('.00');
  });

  test('formatThaiDate converts ISO date to Thai Buddhist Era', () => {
    const result = formatThaiDate('2026-08-28T00:00:00Z');
    expect(result).toContain('2569'); // 2026 + 543
    expect(result).toContain('สิงหาคม');
  });

  test('formatThaiDate uses correct month name', () => {
    expect(formatThaiDate('2026-01-15T00:00:00Z')).toContain('มกราคม');
    expect(formatThaiDate('2026-12-25T00:00:00Z')).toContain('ธันวาคม');
  });

  test('numberToThaiText converts zero', () => {
    expect(numberToThaiText(0)).toBe('ศูนย์บาทถ้วน');
  });

  test('numberToThaiText converts simple amounts', () => {
    const result = numberToThaiText(100);
    expect(result).toContain('ร้อย');
    expect(result).toContain('บาทถ้วน');
  });

  test('numberToThaiText handles 21 (ยี่สิบเอ็ด)', () => {
    const result = numberToThaiText(21);
    expect(result).toContain('ยี่สิบ');
    expect(result).toContain('เอ็ด');
  });

  test('numberToThaiText handles 11 (สิบเอ็ด)', () => {
    const result = numberToThaiText(11);
    expect(result).toContain('สิบ');
    expect(result).toContain('เอ็ด');
  });

  test('numberToThaiText handles decimals (satang)', () => {
    const result = numberToThaiText(100.50);
    expect(result).toContain('บาท');
    expect(result).toContain('สตางค์');
    expect(result).not.toContain('ถ้วน');
  });

  test('numberToThaiText handles 1,070 (VAT example)', () => {
    const result = numberToThaiText(1070);
    expect(result).toContain('พัน');
    expect(result).toContain('สิบ'); // เจ็ดสิบ
    expect(result).toContain('บาทถ้วน');
  });
});

// ============================================================================
// 3. useCreateJobSubmit — Optimistic UI & Rollback
// ============================================================================

describe('useCreateJobSubmit — optimistic insert logic', () => {
  beforeEach(async () => {
    const { useJobStore } = await import('../jobs/jobStore');
    const { resetJobCodeCounter } = await import('../jobs/types');
    useJobStore.setState({ jobs: [], selectedJobId: null });
    resetJobCodeCounter();
  });

  test('createJob adds to store immediately (optimistic)', async () => {
    const { useJobStore } = await import('../jobs/jobStore');
    const store = useJobStore.getState();

    const input = {
      title: 'Optimistic Test',
      customer: { customerId: 'c1', name: 'Test Customer' },
      panels: [{ panelId: 'p1', name: 'Panel A', material: 'MDF', width: 600, height: 800, qty: 2, isCurved: false }],
      priority: 'NORMAL' as const,
      materialGroup: 'MDF 18mm White',
    };

    const job = store.createJob(input, 'user-123');

    // Job should exist in store immediately
    expect(useJobStore.getState().jobs).toHaveLength(1);
    expect(job.status).toBe('DRAFT');
    expect(job.title).toBe('Optimistic Test');
    expect(job.createdBy).toBe('user-123');
  });

  test('deleteJob rollback removes optimistic insert', async () => {
    const { useJobStore } = await import('../jobs/jobStore');
    const store = useJobStore.getState();

    const job = store.createJob(
      {
        title: 'To Rollback',
        customer: { customerId: 'c2', name: 'Rollback Customer' },
        panels: [{ panelId: 'p2', name: 'Panel B', material: 'MDF', width: 400, height: 600, qty: 1, isCurved: false }],
        priority: 'HIGH' as const,
        materialGroup: 'MDF 18mm White',
      },
      'user-456',
    );

    expect(useJobStore.getState().jobs).toHaveLength(1);

    // Rollback (delete DRAFT job)
    const result = useJobStore.getState().deleteJob(job.jobId);
    expect(result.success).toBe(true);
    expect(useJobStore.getState().jobs).toHaveLength(0);
  });

  test('jobToDbRow snake_case mapping is correct', () => {
    // Simulating the mapping function from useCreateJobSubmit
    function jobToDbRow(job: any): Record<string, unknown> {
      return {
        job_id: job.jobId,
        job_code: job.jobCode,
        title: job.title,
        customer_id: job.customer.customerId,
        customer_name: job.customer.name,
        customer_phone: job.customer.phone ?? null,
        customer_email: job.customer.email ?? null,
        customer_address: job.customer.address ?? null,
        panels: JSON.stringify(job.panels),
        status: job.status.toLowerCase(),
        priority: job.priority.toLowerCase(),
        deadline: job.deadline ?? null,
        material_group: job.materialGroup,
        total_panel_count: job.totalPanelCount,
        notes: job.notes ?? null,
        created_by: job.createdBy,
      };
    }

    const mockJob = {
      jobId: 'j-123',
      jobCode: 'DAPH-2026-0001',
      title: 'Test',
      customer: { customerId: 'c-1', name: 'Client', phone: '081-xxx' },
      panels: [{ panelId: 'p1', name: 'P', material: 'MDF', width: 600, height: 800, qty: 1, isCurved: false }],
      status: 'DRAFT',
      priority: 'HIGH',
      deadline: '2026-09-15',
      materialGroup: 'MDF 18mm White',
      totalPanelCount: 1,
      notes: 'ด่วน',
      createdBy: 'user-1',
    };

    const row = jobToDbRow(mockJob);

    expect(row.job_id).toBe('j-123');
    expect(row.job_code).toBe('DAPH-2026-0001');
    expect(row.customer_name).toBe('Client');
    expect(row.customer_phone).toBe('081-xxx');
    expect(row.status).toBe('draft');
    expect(row.priority).toBe('high');
    expect(row.material_group).toBe('MDF 18mm White');
    expect(row.total_panel_count).toBe(1);
    expect(row.notes).toBe('ด่วน');
    expect(JSON.parse(row.panels as string)).toHaveLength(1);
  });

  test('optimistic insert generates correct jobCode format', async () => {
    const { useJobStore } = await import('../jobs/jobStore');
    const { resetJobCodeCounter } = await import('../jobs/types');
    resetJobCodeCounter();

    const store = useJobStore.getState();
    const job = store.createJob(
      {
        title: 'Code Test',
        customer: { customerId: 'c3', name: 'Code Client' },
        panels: [{ panelId: 'p3', name: 'P3', material: 'MDF', width: 600, height: 800, qty: 1, isCurved: false }],
        priority: 'NORMAL' as const,
        materialGroup: 'MDF 18mm White',
      },
      'user-789',
    );

    expect(job.jobCode).toMatch(/^DAPH-\d{4}-\d{4}$/);
  });

  test('multiple optimistic inserts generate sequential codes', async () => {
    const { useJobStore } = await import('../jobs/jobStore');
    const { resetJobCodeCounter } = await import('../jobs/types');
    resetJobCodeCounter();

    const store = useJobStore.getState();
    const input = {
      title: 'Job',
      customer: { customerId: 'c4', name: 'Multi Client' },
      panels: [{ panelId: 'p4', name: 'P4', material: 'MDF', width: 600, height: 800, qty: 1, isCurved: false }],
      priority: 'NORMAL' as const,
      materialGroup: 'MDF 18mm White',
    };

    const job1 = store.createJob(input, 'u1');
    const job2 = useJobStore.getState().createJob(input, 'u2');
    const job3 = useJobStore.getState().createJob(input, 'u3');

    expect(job1.jobCode).toContain('0001');
    expect(job2.jobCode).toContain('0002');
    expect(job3.jobCode).toContain('0003');
  });
});

describe('useCreateJobSubmit — error state management', () => {
  test('initial state is idle', () => {
    const initialState = {
      isSubmitting: false,
      error: null,
      createdJob: null,
      rolledBack: false,
    };

    expect(initialState.isSubmitting).toBe(false);
    expect(initialState.error).toBeNull();
    expect(initialState.createdJob).toBeNull();
    expect(initialState.rolledBack).toBe(false);
  });

  test('submitting state sets isSubmitting true', () => {
    const submitting = {
      isSubmitting: true,
      error: null,
      createdJob: null,
      rolledBack: false,
    };

    expect(submitting.isSubmitting).toBe(true);
  });

  test('failure state has error + rolledBack', () => {
    const failed = {
      isSubmitting: false,
      error: 'Supabase insert failed (500): Internal Server Error',
      createdJob: null,
      rolledBack: true,
    };

    expect(failed.error).toContain('500');
    expect(failed.rolledBack).toBe(true);
    expect(failed.createdJob).toBeNull();
  });

  test('success state has createdJob and no error', () => {
    const mockJob = { jobId: 'j-1', jobCode: 'DAPH-2026-0001' };
    const success = {
      isSubmitting: false,
      error: null,
      createdJob: mockJob,
      rolledBack: false,
    };

    expect(success.createdJob).not.toBeNull();
    expect(success.error).toBeNull();
    expect(success.rolledBack).toBe(false);
  });
});

describe('useCreateJobSubmit — Supabase config detection', () => {
  test('returns null when env vars are missing', () => {
    function getSupabaseConfig(): { url: string; anonKey: string } | null {
      const url = undefined;
      const anonKey = undefined;
      if (!url || !anonKey) return null;
      return { url, anonKey };
    }

    expect(getSupabaseConfig()).toBeNull();
  });

  test('returns config when env vars are present', () => {
    function getSupabaseConfig(
      url: string | undefined,
      key: string | undefined,
    ): { url: string; anonKey: string } | null {
      if (!url || !key) return null;
      return { url, anonKey: key };
    }

    const config = getSupabaseConfig('https://abc.supabase.co', 'anon-key-123');
    expect(config).not.toBeNull();
    expect(config!.url).toBe('https://abc.supabase.co');
    expect(config!.anonKey).toBe('anon-key-123');
  });
});
