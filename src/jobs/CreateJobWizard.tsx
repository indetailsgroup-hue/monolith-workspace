/**
 * CreateJobWizard.tsx — Multi-step job creation wizard
 *
 * Steps:
 * 1. Customer info (name, phone, email, address)
 * 2. Job details (title, material, priority, deadline)
 * 3. Panel list (add panels with dimensions)
 * 4. Review & confirm
 *
 * Creates job in DRAFT status, then navigates to the job board.
 */

import React, { useState, useCallback } from 'react';
import {
  type CreateJobInput,
  type JobPanel,
  type JobCustomer,
  type Job,
} from './types';
import { useJobStore } from './jobStore';

// ============================================================================
// Props
// ============================================================================

export interface CreateJobWizardProps {
  /** Called when job is created successfully */
  onComplete?: (job: Job) => void;
  /** Called when wizard is cancelled */
  onCancel?: () => void;
  /** Current user ID for createdBy field */
  userId?: string;
}

// ============================================================================
// Wizard Steps
// ============================================================================

type WizardStep = 'customer' | 'details' | 'panels' | 'review';
const STEPS: WizardStep[] = ['customer', 'details', 'panels', 'review'];
const STEP_LABELS: Record<WizardStep, string> = {
  customer: 'ลูกค้า',
  details: 'รายละเอียดงาน',
  panels: 'แผ่นงาน',
  review: 'ตรวจสอบ',
};

// ============================================================================
// Component
// ============================================================================

export function CreateJobWizard({
  onComplete,
  onCancel,
  userId = 'anonymous',
}: CreateJobWizardProps): React.ReactElement {
  const createJob = useJobStore((s) => s.createJob);
  const [step, setStep] = useState<WizardStep>('customer');
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [customer, setCustomer] = useState<JobCustomer>({
    customerId: crypto.randomUUID(),
    name: '',
    phone: '',
    email: '',
    address: '',
  });

  const [title, setTitle] = useState('');
  const [materialGroup, setMaterialGroup] = useState('MDF 18mm White');
  const [priority, setPriority] = useState<CreateJobInput['priority']>('NORMAL');
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');

  const [panels, setPanels] = useState<JobPanel[]>([]);
  const [panelDraft, setPanelDraft] = useState<Partial<JobPanel>>({
    name: '',
    width: 600,
    height: 400,
    qty: 1,
    isCurved: false,
  });

  // Navigation
  const currentIndex = STEPS.indexOf(step);
  const canNext = currentIndex < STEPS.length - 1;
  const canBack = currentIndex > 0;

  const next = useCallback(() => {
    if (step === 'customer' && !customer.name.trim()) {
      setError('กรุณาระบุชื่อลูกค้า');
      return;
    }
    if (step === 'details' && !title.trim()) {
      setError('กรุณาระบุชื่องาน');
      return;
    }
    setError(null);
    if (canNext) setStep(STEPS[currentIndex + 1]);
  }, [step, customer.name, title, canNext, currentIndex]);

  const back = useCallback(() => {
    setError(null);
    if (canBack) setStep(STEPS[currentIndex - 1]);
  }, [canBack, currentIndex]);

  // Panel management
  const addPanel = useCallback(() => {
    if (!panelDraft.name?.trim()) return;
    const panel: JobPanel = {
      panelId: crypto.randomUUID(),
      name: panelDraft.name!.trim(),
      material: materialGroup,
      width: panelDraft.width ?? 600,
      height: panelDraft.height ?? 400,
      qty: panelDraft.qty ?? 1,
      isCurved: panelDraft.isCurved ?? false,
      arcRadius: panelDraft.arcRadius,
    };
    setPanels((prev) => [...prev, panel]);
    setPanelDraft({ name: '', width: 600, height: 400, qty: 1, isCurved: false });
  }, [panelDraft, materialGroup]);

  const removePanel = useCallback((panelId: string) => {
    setPanels((prev) => prev.filter((p) => p.panelId !== panelId));
  }, []);

  // Submit
  const handleSubmit = useCallback(() => {
    if (panels.length === 0) {
      setError('กรุณาเพิ่มแผ่นงานอย่างน้อย 1 รายการ');
      return;
    }

    const input: CreateJobInput = {
      title: title.trim(),
      customer,
      panels,
      priority,
      deadline: deadline || undefined,
      materialGroup,
      notes: notes || undefined,
    };

    const job = createJob(input, userId);
    onComplete?.(job);
  }, [panels, title, customer, priority, deadline, materialGroup, notes, createJob, userId, onComplete]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div style={styles.container} data-testid="create-job-wizard">
      {/* Progress */}
      <div style={styles.progress}>
        {STEPS.map((s, i) => (
          <div
            key={s}
            data-testid={`wizard-step-${i + 1}`}
            aria-current={i === currentIndex ? 'step' : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <div
              style={{
                ...styles.stepDot,
                background: i <= currentIndex ? '#4ade80' : '#374151',
                color: i <= currentIndex ? '#000' : '#9ca3af',
              }}
            >
              {i + 1}
            </div>
            <span style={{ fontSize: '12px', color: i === currentIndex ? '#fff' : '#6b7280' }}>
              {STEP_LABELS[s]}
            </span>
            {i < STEPS.length - 1 && <div style={styles.stepLine} />}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && <div role="alert" style={styles.error}>{error}</div>}

      {/* Step: Customer */}
      {step === 'customer' && (
        <div style={styles.section}>
          <h3 style={styles.heading}>ข้อมูลลูกค้า</h3>
          <div style={styles.field}>
            <label style={styles.label}>ชื่อลูกค้า *</label>
            <input
              style={styles.input}
              value={customer.name}
              onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
              placeholder="บริษัท / ชื่อ-นามสกุล"
              data-testid="input-customer-name"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>โทรศัพท์</label>
            <input
              style={styles.input}
              value={customer.phone ?? ''}
              onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
              placeholder="0xx-xxx-xxxx"
              data-testid="input-customer-phone"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>อีเมล</label>
            <input
              style={styles.input}
              type="email"
              value={customer.email ?? ''}
              onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
              placeholder="customer@email.com"
              data-testid="input-customer-email"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>ที่อยู่</label>
            <textarea
              style={{ ...styles.input, minHeight: '60px', resize: 'vertical' }}
              value={customer.address ?? ''}
              onChange={(e) => setCustomer((c) => ({ ...c, address: e.target.value }))}
              placeholder="ที่อยู่สำหรับจัดส่ง"
            />
          </div>
        </div>
      )}

      {/* Step: Details */}
      {step === 'details' && (
        <div style={styles.section}>
          <h3 style={styles.heading}>รายละเอียดงาน</h3>
          <div style={styles.field}>
            <label style={styles.label}>ชื่องาน *</label>
            <input
              style={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น ตู้ครัว คอนโด IDEO"
              data-testid="input-job-title"
            />
          </div>
          <div style={styles.row}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>กลุ่มวัสดุ</label>
              <select
                style={styles.input}
                value={materialGroup}
                onChange={(e) => setMaterialGroup(e.target.value)}
              >
                <option>MDF 18mm White</option>
                <option>MDF 18mm Oak</option>
                <option>MDF 12mm White</option>
                <option>Plywood 15mm Birch</option>
                <option>Melamine 18mm White</option>
                <option>HPL Laminate 0.8mm</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>ระดับความเร่งด่วน</label>
              <select
                style={styles.input}
                value={priority}
                onChange={(e) => setPriority(e.target.value as CreateJobInput['priority'])}
                data-testid="select-priority"
              >
                <option value="LOW">ต่ำ</option>
                <option value="NORMAL">ปกติ</option>
                <option value="HIGH">สูง</option>
                <option value="URGENT">เร่งด่วน</option>
              </select>
            </div>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>กำหนดส่ง</label>
            <input
              style={styles.input}
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>หมายเหตุ</label>
            <textarea
              style={{ ...styles.input, minHeight: '60px', resize: 'vertical' }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ข้อมูลเพิ่มเติม..."
            />
          </div>
        </div>
      )}

      {/* Step: Panels */}
      {step === 'panels' && (
        <div style={styles.section}>
          <h3 style={styles.heading}>แผ่นงาน ({panels.length} รายการ)</h3>

          {/* Panel list */}
          {panels.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              {panels.map((p, i) => (
                <div key={p.panelId} style={styles.panelRow}>
                  <span style={{ flex: 1, color: '#e5e7eb', fontSize: '13px' }}>
                    {i + 1}. {p.name} — {p.width}×{p.height}mm ×{p.qty}
                    {p.isCurved && ' 🔄'}
                  </span>
                  <button
                    style={styles.removeBtn}
                    onClick={() => removePanel(p.panelId)}
                    aria-label={`remove ${p.name}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add panel form */}
          <div style={styles.addPanelBox}>
            <div style={styles.row}>
              <input
                style={{ ...styles.input, flex: 2 }}
                value={panelDraft.name ?? ''}
                onChange={(e) => setPanelDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="ชื่อแผ่น"
                data-testid="panel-name"
              />
              <input
                style={{ ...styles.input, flex: 1 }}
                type="number"
                value={panelDraft.width ?? ''}
                onChange={(e) => setPanelDraft((d) => ({ ...d, width: +e.target.value }))}
                placeholder="กว้าง"
                data-testid="input-panel-width"
              />
              <input
                style={{ ...styles.input, flex: 1 }}
                type="number"
                value={panelDraft.height ?? ''}
                onChange={(e) => setPanelDraft((d) => ({ ...d, height: +e.target.value }))}
                placeholder="สูง"
                data-testid="input-panel-height"
              />
              <input
                style={{ ...styles.input, flex: 0.5 }}
                type="number"
                min={1}
                value={panelDraft.qty ?? 1}
                onChange={(e) => setPanelDraft((d) => ({ ...d, qty: +e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
              <label style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="checkbox"
                  checked={panelDraft.isCurved ?? false}
                  onChange={(e) => setPanelDraft((d) => ({ ...d, isCurved: e.target.checked }))}
                />
                Curved Panel
              </label>
              <button style={styles.addBtn} onClick={addPanel} data-testid="btn-add-panel">
                + เพิ่มแผ่น
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step: Review */}
      {step === 'review' && (
        <div style={styles.section}>
          <h3 style={styles.heading}>ตรวจสอบก่อนสร้างงาน</h3>
          <div style={styles.reviewGrid}>
            <div style={styles.reviewItem}>
              <span style={styles.reviewLabel}>ลูกค้า</span>
              <span style={styles.reviewValue} data-testid="review-customer-name">{customer.name}</span>
            </div>
            <div style={styles.reviewItem}>
              <span style={styles.reviewLabel}>ชื่องาน</span>
              <span style={styles.reviewValue} data-testid="review-job-title">{title}</span>
            </div>
            <div style={styles.reviewItem}>
              <span style={styles.reviewLabel}>วัสดุ</span>
              <span style={styles.reviewValue}>{materialGroup}</span>
            </div>
            <div style={styles.reviewItem}>
              <span style={styles.reviewLabel}>แผ่นงาน</span>
              <span style={styles.reviewValue} data-testid="review-panel-count">{panels.length} รายการ ({panels.reduce((s, p) => s + p.qty, 0)} ชิ้น)</span>
            </div>
            <div style={styles.reviewItem}>
              <span style={styles.reviewLabel}>ระดับ</span>
              <span style={styles.reviewValue}>{priority}</span>
            </div>
            {deadline && (
              <div style={styles.reviewItem}>
                <span style={styles.reviewLabel}>กำหนดส่ง</span>
                <span style={styles.reviewValue}>{deadline}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div style={styles.nav}>
        {onCancel && (
          <button style={styles.cancelBtn} onClick={onCancel}>
            ยกเลิก
          </button>
        )}
        <div style={{ flex: 1 }} />
        {canBack && (
          <button style={styles.backBtn} onClick={back} data-testid="btn-prev-step">
            ← ย้อนกลับ
          </button>
        )}
        {step !== 'review' ? (
          <button
            style={styles.nextBtn}
            onClick={next}
            data-testid="btn-next-step"
            disabled={(step === 'customer' && !customer.name.trim()) || (step === 'details' && !title.trim())}
          >
            ถัดไป →
          </button>
        ) : (
          <button style={styles.submitBtn} onClick={handleSubmit} data-testid="btn-submit-job">
            ✓ สร้างงาน
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: '680px', margin: '0 auto', padding: '24px', fontFamily: 'Inter, system-ui, sans-serif' },
  progress: { display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' },
  stepDot: { width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 },
  stepLine: { width: '20px', height: '2px', background: '#374151' },
  section: { background: '#111827', borderRadius: '12px', padding: '24px', border: '1px solid #1f2937', marginBottom: '16px' },
  heading: { margin: '0 0 16px', fontSize: '16px', fontWeight: 600, color: '#f3f4f6' },
  field: { marginBottom: '14px' },
  label: { display: 'block', fontSize: '12px', fontWeight: 500, color: '#9ca3af', marginBottom: '4px' },
  input: { width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #374151', background: '#1f2937', color: '#f3f4f6', fontSize: '13px', boxSizing: 'border-box' as const },
  row: { display: 'flex', gap: '12px' },
  panelRow: { display: 'flex', alignItems: 'center', padding: '8px 12px', background: '#1f2937', borderRadius: '6px', marginBottom: '6px' },
  removeBtn: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' },
  addPanelBox: { background: '#0d1117', borderRadius: '8px', padding: '12px', border: '1px dashed #374151' },
  addBtn: { padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#4ade80', color: '#000', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  nav: { display: 'flex', gap: '12px', alignItems: 'center', marginTop: '16px' },
  cancelBtn: { padding: '10px 16px', borderRadius: '6px', border: '1px solid #374151', background: 'none', color: '#9ca3af', fontSize: '13px', cursor: 'pointer' },
  backBtn: { padding: '10px 16px', borderRadius: '6px', border: '1px solid #374151', background: 'none', color: '#d1d5db', fontSize: '13px', cursor: 'pointer' },
  nextBtn: { padding: '10px 20px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  submitBtn: { padding: '10px 24px', borderRadius: '6px', border: 'none', background: '#4ade80', color: '#000', fontSize: '13px', fontWeight: 700, cursor: 'pointer' },
  error: { background: '#7f1d1d', border: '1px solid #991b1b', borderRadius: '8px', padding: '10px 14px', color: '#fca5a5', fontSize: '13px', marginBottom: '16px' },
  reviewGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  reviewItem: { display: 'flex', flexDirection: 'column' as const, gap: '2px' },
  reviewLabel: { fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  reviewValue: { fontSize: '14px', color: '#e5e7eb', fontWeight: 500 },
};

export default CreateJobWizard;
