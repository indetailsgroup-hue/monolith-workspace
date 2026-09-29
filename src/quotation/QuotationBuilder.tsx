/**
 * quotation/QuotationBuilder.tsx — UI for creating quotations from job panels
 *
 * Features:
 * - Auto-calculate from job panels with editable unit prices
 * - VAT 7% toggle, discount field
 * - Payment terms
 * - Preview totals in real-time
 * - Submit → create quotation in store
 */

import React, { useState, useMemo, useCallback } from 'react';
import { type Job } from '../jobs/types';
import {
  type QuotationLineItem,
  calculateQuotationTotals,
  calculateLineAmount,
} from './types';
import { useQuotationStore, estimateUnitPrice } from './quotationStore';

// ============================================================================
// Props
// ============================================================================

export interface QuotationBuilderProps {
  /** Job to create quotation for */
  job: Job;
  /** Called when quotation is created */
  onComplete?: (quotationId: string) => void;
  /** Called on cancel */
  onCancel?: () => void;
  /** Current user ID */
  userId?: string;
}

// ============================================================================
// Component
// ============================================================================

export function QuotationBuilder({
  job,
  onComplete,
  onCancel,
  userId = 'anonymous',
}: QuotationBuilderProps): React.ReactElement {
  const createQuotation = useQuotationStore((s) => s.createQuotation);

  // Initialize unit prices from panel estimates
  const [unitPrices, setUnitPrices] = useState<Record<string, number>>(() => {
    const prices: Record<string, number> = {};
    for (const panel of job.panels) {
      prices[panel.panelId] = estimateUnitPrice(panel);
    }
    return prices;
  });

  const [vatRate] = useState(0.07);
  const [includeVat, setIncludeVat] = useState(true);
  const [discount, setDiscount] = useState(0);
  const [terms, setTerms] = useState('ชำระภายใน 30 วันหลังส่งมอบงาน');
  const [validDays, setValidDays] = useState(30);

  // Build line items
  const lines: QuotationLineItem[] = useMemo(() => {
    return job.panels.map((p) => {
      const unitPrice = unitPrices[p.panelId] ?? 0;
      return {
        lineId: p.panelId,
        description: p.name,
        material: p.material,
        dimensions: `${p.width}×${p.height}mm`,
        qty: p.qty,
        unitPrice,
        amount: calculateLineAmount(p.qty, unitPrice),
        isCurved: p.isCurved,
      };
    });
  }, [job.panels, unitPrices]);

  // Totals
  const { subtotal, vatAmount, total } = useMemo(
    () => calculateQuotationTotals(lines, includeVat ? vatRate : 0, discount),
    [lines, vatRate, includeVat, discount],
  );

  // Update unit price
  const updatePrice = useCallback((panelId: string, price: number) => {
    setUnitPrices((prev) => ({ ...prev, [panelId]: price }));
  }, []);

  // Submit
  const handleSubmit = useCallback(() => {
    const quotation = createQuotation({
      job,
      unitPrices,
      vatRate: includeVat ? vatRate : 0,
      discount,
      terms,
      validDays,
      createdBy: userId,
    });
    onComplete?.(quotation.quotationId);
  }, [createQuotation, job, unitPrices, vatRate, includeVat, discount, terms, validDays, userId, onComplete]);

  return (
    <div style={styles.container} data-testid="quotation-builder">
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>สร้างใบเสนอราคา</h2>
        <p style={styles.subtitle}>
          {job.jobCode} • {job.customer.name} • {job.title}
        </p>
      </div>

      {/* Line items table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>รายการ</th>
              <th style={styles.th}>วัสดุ</th>
              <th style={styles.th}>ขนาด</th>
              <th style={styles.th}>จำนวน</th>
              <th style={styles.th}>ราคา/หน่วย (฿)</th>
              <th style={styles.th}>รวม (฿)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.lineId}>
                <td style={styles.td}>
                  {line.description}
                  {line.isCurved && <span style={styles.curvedTag}> 🔄 Curved</span>}
                </td>
                <td style={styles.td}>{line.material}</td>
                <td style={styles.td}>{line.dimensions}</td>
                <td style={styles.td}>{line.qty}</td>
                <td style={styles.td}>
                  <input
                    type="number"
                    style={styles.priceInput}
                    value={unitPrices[line.lineId] ?? 0}
                    onChange={(e) => updatePrice(line.lineId, +e.target.value)}
                    min={0}
                    data-testid={`price-${line.lineId}`}
                  />
                </td>
                <td style={{ ...styles.td, fontWeight: 600 }}>
                  {line.amount.toLocaleString('th-TH')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals + Settings */}
      <div style={styles.bottomSection}>
        <div style={styles.settings}>
          <div style={styles.field}>
            <label style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={includeVat}
                onChange={(e) => setIncludeVat(e.target.checked)}
              />
              รวม VAT {(vatRate * 100).toFixed(0)}%
            </label>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>ส่วนลด (฿)</label>
            <input
              type="number"
              style={styles.smallInput}
              value={discount}
              onChange={(e) => setDiscount(+e.target.value)}
              min={0}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>เงื่อนไขชำระ</label>
            <input
              style={styles.input}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>ใบเสนอราคามีผล (วัน)</label>
            <input
              type="number"
              style={styles.smallInput}
              value={validDays}
              onChange={(e) => setValidDays(+e.target.value)}
              min={1}
            />
          </div>
        </div>

        <div style={styles.totals}>
          <div style={styles.totalRow}>
            <span>ยอดรวมก่อน VAT</span>
            <span data-testid="quotation-subtotal">฿{subtotal.toLocaleString('th-TH')}</span>
          </div>
          {discount > 0 && (
            <div style={styles.totalRow}>
              <span>ส่วนลด</span>
              <span style={{ color: '#ef4444' }}>-฿{discount.toLocaleString('th-TH')}</span>
            </div>
          )}
          {includeVat && (
            <div style={styles.totalRow}>
              <span>VAT {(vatRate * 100).toFixed(0)}%</span>
              <span data-testid="quotation-vat">฿{vatAmount.toLocaleString('th-TH')}</span>
            </div>
          )}
          <div style={{ ...styles.totalRow, borderTop: '2px solid #4ade80', paddingTop: '8px', marginTop: '8px' }}>
            <span style={{ fontSize: '16px', fontWeight: 700 }}>ยอดรวมสุทธิ</span>
            <span data-testid="quotation-total" style={{ fontSize: '18px', fontWeight: 700, color: '#4ade80' }}>
              ฿{total.toLocaleString('th-TH')}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={styles.actions}>
        {onCancel && (
          <button style={styles.cancelBtn} onClick={onCancel}>
            ยกเลิก
          </button>
        )}
        <button style={styles.submitBtn} onClick={handleSubmit} data-testid="submit-quotation">
          ✓ สร้างใบเสนอราคา
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: '800px', margin: '0 auto', padding: '24px', fontFamily: 'Inter, system-ui, sans-serif', color: '#f3f4f6' },
  header: { marginBottom: '24px' },
  title: { margin: '0 0 4px', fontSize: '20px', fontWeight: 700, color: '#f3f4f6' },
  subtitle: { margin: 0, fontSize: '13px', color: '#9ca3af' },
  tableWrap: { overflowX: 'auto', marginBottom: '24px' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  th: { textAlign: 'left' as const, padding: '10px 8px', borderBottom: '2px solid #374151', color: '#9ca3af', fontSize: '11px', textTransform: 'uppercase' as const },
  td: { padding: '10px 8px', borderBottom: '1px solid #1f2937' },
  curvedTag: { fontSize: '10px', color: '#06b6d4' },
  priceInput: { width: '90px', padding: '6px 8px', borderRadius: '4px', border: '1px solid #374151', background: '#1f2937', color: '#f3f4f6', fontSize: '13px' },
  bottomSection: { display: 'flex', gap: '24px', flexWrap: 'wrap' as const },
  settings: { flex: 1, minWidth: '240px' },
  totals: { flex: 1, minWidth: '240px', background: '#111827', borderRadius: '8px', padding: '16px', border: '1px solid #1f2937' },
  totalRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px', color: '#d1d5db' },
  field: { marginBottom: '12px' },
  label: { display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' },
  checkLabel: { fontSize: '13px', color: '#d1d5db', display: 'flex', alignItems: 'center', gap: '6px' },
  input: { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #374151', background: '#1f2937', color: '#f3f4f6', fontSize: '13px', boxSizing: 'border-box' as const },
  smallInput: { width: '100px', padding: '8px 10px', borderRadius: '6px', border: '1px solid #374151', background: '#1f2937', color: '#f3f4f6', fontSize: '13px' },
  actions: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' },
  cancelBtn: { padding: '10px 20px', borderRadius: '6px', border: '1px solid #374151', background: 'none', color: '#9ca3af', fontSize: '13px', cursor: 'pointer' },
  submitBtn: { padding: '10px 24px', borderRadius: '6px', border: 'none', background: '#4ade80', color: '#000', fontSize: '14px', fontWeight: 700, cursor: 'pointer' },
};

export default QuotationBuilder;
