// src/ai-quotation/AiQuotationDraftBoard.tsx
// MONOLITH v18.0 — AI Quotation Draft Board (ENTERPRISE-gated)

import React, { useEffect, useState } from 'react';

import type { OrgPlan } from '../tenant/types';
import { useAiQuotationDraftStore } from './aiQuotationDraftStore';
import {
  canAccessAiQuotation,
  getDraftStatusLabel,
  getLineItemTypeLabel,
  AQD_DRAFT_STATUS_LABELS,
  AQD_LINE_ITEM_TYPE_LABELS,
  type AiQuotationDraft,
  type AiQuotationLineItem,
  type AqdDraftStatus,
  type AqdLineItemType,
  type CreateAqdDraftPayload,
  type CreateAqdLineItemPayload,
} from './aiQuotationDraftTypes';

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────

interface AiQuotationDraftBoardProps {
  orgId:   string;
  orgPlan: OrgPlan;
  /** User id for reviewer-level workflow buttons */
  userId?:  string;
  isAdmin?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_ACCENT: Record<AqdDraftStatus, string> = {
  DRAFT:          '#6b7280',
  PENDING_REVIEW: '#f59e0b',
  APPROVED:       '#22c55e',
  REJECTED:       '#ef4444',
};

const STATUS_BG: Record<AqdDraftStatus, string> = {
  DRAFT:          '#f3f4f6',
  PENDING_REVIEW: '#fef3c7',
  APPROVED:       '#dcfce7',
  REJECTED:       '#fee2e2',
};

const LINE_ITEM_TYPES: AqdLineItemType[] = [
  'PRODUCT', 'SERVICE', 'MATERIAL', 'LABOR', 'DISCOUNT', 'CUSTOM',
];

const DRAFT_STATUSES: AqdDraftStatus[] = [
  'DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED',
];

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// ── StatusBadge ─────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: AqdDraftStatus;
}

function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      data-testid={`aqd-status-badge-${status}`}
      style={{
        display:      'inline-block',
        padding:      '2px 10px',
        borderRadius: 12,
        fontSize:     12,
        fontWeight:   600,
        color:        STATUS_ACCENT[status],
        background:   STATUS_BG[status],
      }}
    >
      {getDraftStatusLabel(status)}
    </span>
  );
}

// ── SummaryBar ───────────────────────────────────────────────────────────────

function SummaryBar() {
  const summaries = useAiQuotationDraftStore((s) => s.summaries);

  const totalDrafts   = summaries.reduce((n, s) => n + s.draftCount, 0);
  const totalValue    = summaries.reduce((n, s) => n + s.totalValueThb, 0);
  const approvedCount = summaries.find((s) => s.status === 'APPROVED')?.draftCount ?? 0;
  const pendingCount  = summaries.find((s) => s.status === 'PENDING_REVIEW')?.draftCount ?? 0;

  return (
    <div
      data-testid="aqd-summary-bar"
      style={{
        display:  'flex',
        gap:      16,
        flexWrap: 'wrap',
        marginBottom: 24,
      }}
    >
      {[
        { label: 'ร่างทั้งหมด',    value: totalDrafts,                     accent: '#6366f1', testId: 'aqd-summary-total' },
        { label: 'รอตรวจสอบ',      value: pendingCount,                    accent: '#f59e0b', testId: 'aqd-summary-pending' },
        { label: 'อนุมัติแล้ว',    value: approvedCount,                   accent: '#22c55e', testId: 'aqd-summary-approved' },
        { label: 'มูลค่ารวม (฿)',   value: totalValue.toLocaleString('th'), accent: '#0ea5e9', testId: 'aqd-summary-value' },
      ].map(({ label, value, accent, testId }) => (
        <div
          key={testId}
          data-testid={testId}
          style={{
            borderLeft:   `4px solid ${accent}`,
            background:   '#ffffff',
            borderRadius: 8,
            padding:      '14px 20px',
            minWidth:     130,
            boxShadow:    '0 1px 4px rgba(0,0,0,0.08)',
          }}
        >
          <div style={{ fontSize: 26, fontWeight: 700, color: accent }}>{value}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── DraftListItem ────────────────────────────────────────────────────────────

interface DraftListItemProps {
  draft:      AiQuotationDraft;
  isSelected: boolean;
  onSelect:   () => void;
  onDelete:   () => void;
  isAdmin:    boolean;
  orgPlan:    OrgPlan;
}

function DraftListItem({
  draft,
  isSelected,
  onSelect,
  onDelete,
  isAdmin,
  orgPlan,
}: DraftListItemProps) {
  return (
    <div
      data-testid={`aqd-draft-item-${draft.id}`}
      onClick={onSelect}
      style={{
        padding:      '12px 16px',
        borderRadius: 8,
        cursor:       'pointer',
        background:   isSelected ? '#eef2ff' : '#fafafa',
        border:       isSelected ? '1.5px solid #6366f1' : '1px solid #e5e7eb',
        marginBottom: 8,
        position:     'relative',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div
            data-testid={`aqd-draft-title-${draft.id}`}
            style={{ fontWeight: 600, fontSize: 14, color: '#111827', marginBottom: 4 }}
          >
            {draft.title}
          </div>
          {draft.customer_name && (
            <div style={{ fontSize: 12, color: '#6b7280' }}>{draft.customer_name}</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <StatusBadge status={draft.status} />
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0ea5e9' }}>
            ฿{draft.total_thb.toLocaleString('th')}
          </div>
        </div>
      </div>
      {draft.generated_by_ai && (
        <div
          data-testid={`aqd-ai-badge-${draft.id}`}
          style={{
            marginTop: 6,
            fontSize:   11,
            background: '#f0fdf4',
            color:      '#15803d',
            display:    'inline-block',
            padding:    '1px 8px',
            borderRadius: 10,
            fontWeight: 500,
          }}
        >
          AI Generated
        </div>
      )}
      {isAdmin && (
        <button
          data-testid={`aqd-delete-draft-${draft.id}`}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            position:   'absolute',
            top:        8,
            right:      8,
            background: 'none',
            border:     'none',
            cursor:     'pointer',
            fontSize:   14,
            color:      '#9ca3af',
            padding:    '2px 4px',
          }}
          aria-label={`Delete draft ${draft.title}`}
        >
          ×
        </button>
      )}
    </div>
  );
}

// ── WorkflowButtons ──────────────────────────────────────────────────────────

interface WorkflowButtonsProps {
  draft:   AiQuotationDraft;
  orgPlan: OrgPlan;
  isAdmin: boolean;
  onSubmit:  () => void;
  onApprove: () => void;
  onReject:  () => void;
}

function WorkflowButtons({
  draft,
  isAdmin,
  onSubmit,
  onApprove,
  onReject,
}: WorkflowButtonsProps) {
  const { status } = draft;

  return (
    <div
      data-testid="aqd-workflow-buttons"
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}
    >
      {/* Submit for review — visible when DRAFT */}
      {status === 'DRAFT' && (
        <button
          data-testid="aqd-submit-review-btn"
          onClick={onSubmit}
          style={{
            background:   '#6366f1',
            color:        '#ffffff',
            border:       'none',
            borderRadius: 6,
            padding:      '8px 18px',
            fontSize:     13,
            fontWeight:   600,
            cursor:       'pointer',
          }}
        >
          ส่งตรวจสอบ
        </button>
      )}

      {/* Approve / Reject — visible when PENDING_REVIEW and isAdmin */}
      {status === 'PENDING_REVIEW' && isAdmin && (
        <>
          <button
            data-testid="aqd-approve-btn"
            onClick={onApprove}
            style={{
              background:   '#22c55e',
              color:        '#ffffff',
              border:       'none',
              borderRadius: 6,
              padding:      '8px 18px',
              fontSize:     13,
              fontWeight:   600,
              cursor:       'pointer',
            }}
          >
            อนุมัติ
          </button>
          <button
            data-testid="aqd-reject-btn"
            onClick={onReject}
            style={{
              background:   '#ef4444',
              color:        '#ffffff',
              border:       'none',
              borderRadius: 6,
              padding:      '8px 18px',
              fontSize:     13,
              fontWeight:   600,
              cursor:       'pointer',
            }}
          >
            ปฏิเสธ
          </button>
        </>
      )}

      {/* Terminal state labels */}
      {status === 'APPROVED' && (
        <span
          data-testid="aqd-approved-label"
          style={{ color: '#15803d', fontSize: 13, fontWeight: 600, alignSelf: 'center' }}
        >
          ✓ อนุมัติแล้ว — ไม่สามารถแก้ไขได้
        </span>
      )}
      {status === 'REJECTED' && (
        <span
          data-testid="aqd-rejected-label"
          style={{ color: '#b91c1c', fontSize: 13, fontWeight: 600, alignSelf: 'center' }}
        >
          ✗ ปฏิเสธแล้ว
        </span>
      )}
    </div>
  );
}

// ── LineItemRow ──────────────────────────────────────────────────────────────

interface LineItemRowProps {
  item:      AiQuotationLineItem;
  editable:  boolean;
  onUpdate:  (payload: { quantity?: number; unit_price_thb?: number; description?: string }) => void;
  onRemove:  () => void;
}

function LineItemRow({ item, editable, onUpdate, onRemove }: LineItemRowProps) {
  return (
    <tr data-testid={`aqd-line-item-row-${item.id}`}>
      <td style={{ padding: '8px 10px', fontSize: 13, color: '#374151' }}>
        <span
          style={{
            background:   '#f3f4f6',
            borderRadius: 4,
            padding:      '2px 8px',
            fontSize:     12,
            color:        '#6b7280',
          }}
        >
          {getLineItemTypeLabel(item.item_type)}
        </span>
      </td>
      <td style={{ padding: '8px 10px', fontSize: 13 }}>
        {editable ? (
          <input
            data-testid={`aqd-li-desc-input-${item.id}`}
            defaultValue={item.description}
            onBlur={(e) => onUpdate({ description: e.target.value })}
            style={{
              border:       '1px solid #d1d5db',
              borderRadius: 4,
              padding:      '4px 8px',
              fontSize:     13,
              width:        '100%',
              minWidth:     160,
            }}
          />
        ) : (
          item.description
        )}
      </td>
      <td style={{ padding: '8px 10px', fontSize: 13, textAlign: 'center' }}>
        {editable ? (
          <input
            data-testid={`aqd-li-qty-input-${item.id}`}
            type="number"
            defaultValue={item.quantity}
            min={0}
            onBlur={(e) => onUpdate({ quantity: Number(e.target.value) })}
            style={{
              border:       '1px solid #d1d5db',
              borderRadius: 4,
              padding:      '4px 6px',
              fontSize:     13,
              width:        64,
              textAlign:    'center',
            }}
          />
        ) : (
          item.quantity
        )}
      </td>
      <td style={{ padding: '8px 10px', fontSize: 13, textAlign: 'right' }}>
        {editable ? (
          <input
            data-testid={`aqd-li-price-input-${item.id}`}
            type="number"
            defaultValue={item.unit_price_thb}
            min={0}
            onBlur={(e) => onUpdate({ unit_price_thb: Number(e.target.value) })}
            style={{
              border:       '1px solid #d1d5db',
              borderRadius: 4,
              padding:      '4px 6px',
              fontSize:     13,
              width:        96,
              textAlign:    'right',
            }}
          />
        ) : (
          `฿${item.unit_price_thb.toLocaleString('th')}`
        )}
      </td>
      <td
        data-testid={`aqd-li-total-${item.id}`}
        style={{ padding: '8px 10px', fontSize: 13, textAlign: 'right', fontWeight: 600, color: '#0ea5e9' }}
      >
        ฿{item.line_total_thb.toLocaleString('th')}
      </td>
      {editable && (
        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
          <button
            data-testid={`aqd-remove-li-btn-${item.id}`}
            onClick={onRemove}
            style={{
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              fontSize:   16,
              color:      '#9ca3af',
            }}
            aria-label={`Remove ${item.description}`}
          >
            ×
          </button>
        </td>
      )}
    </tr>
  );
}

// ── AddLineItemForm ──────────────────────────────────────────────────────────

interface AddLineItemFormProps {
  draftId: string;
  orgId:   string;
  orgPlan: OrgPlan;
}

function AddLineItemForm({ draftId, orgId, orgPlan }: AddLineItemFormProps) {
  const addLineItem = useAiQuotationDraftStore((s) => s.addLineItem);
  const isLineItemLoading = useAiQuotationDraftStore((s) => s.isLineItemLoading);

  const [type,     setType]     = useState<AqdLineItemType>('PRODUCT');
  const [desc,     setDesc]     = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price,    setPrice]    = useState(0);

  async function handleAdd() {
    if (!desc.trim()) return;
    const payload: CreateAqdLineItemPayload = {
      draft_id:       draftId,
      org_id:         orgId,
      item_type:      type,
      description:    desc.trim(),
      quantity,
      unit_price_thb: price,
    };
    await addLineItem(payload, orgPlan);
    setDesc('');
    setQuantity(1);
    setPrice(0);
  }

  return (
    <div
      data-testid="aqd-add-line-item-form"
      style={{
        display:      'flex',
        gap:          8,
        alignItems:   'flex-end',
        flexWrap:     'wrap',
        background:   '#f9fafb',
        border:       '1px dashed #d1d5db',
        borderRadius: 8,
        padding:      '12px 16px',
        marginTop:    12,
      }}
    >
      <div>
        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 2 }}>
          ประเภท
        </label>
        <select
          data-testid="aqd-new-li-type-select"
          value={type}
          onChange={(e) => setType(e.target.value as AqdLineItemType)}
          style={{
            border: '1px solid #d1d5db', borderRadius: 4, padding: '5px 8px', fontSize: 13,
          }}
        >
          {LINE_ITEM_TYPES.map((t) => (
            <option key={t} value={t}>{AQD_LINE_ITEM_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 2 }}>
          รายละเอียด
        </label>
        <input
          data-testid="aqd-new-li-desc-input"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="ชื่อสินค้า / บริการ..."
          style={{
            border: '1px solid #d1d5db', borderRadius: 4, padding: '5px 8px', fontSize: 13, width: '100%',
          }}
        />
      </div>
      <div>
        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 2 }}>
          จำนวน
        </label>
        <input
          data-testid="aqd-new-li-qty-input"
          type="number"
          value={quantity}
          min={1}
          onChange={(e) => setQuantity(Number(e.target.value))}
          style={{
            border: '1px solid #d1d5db', borderRadius: 4, padding: '5px 6px', fontSize: 13, width: 70,
          }}
        />
      </div>
      <div>
        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 2 }}>
          ราคาต่อหน่วย (฿)
        </label>
        <input
          data-testid="aqd-new-li-price-input"
          type="number"
          value={price}
          min={0}
          onChange={(e) => setPrice(Number(e.target.value))}
          style={{
            border: '1px solid #d1d5db', borderRadius: 4, padding: '5px 6px', fontSize: 13, width: 100,
          }}
        />
      </div>
      <button
        data-testid="aqd-add-li-submit-btn"
        onClick={handleAdd}
        disabled={isLineItemLoading || !desc.trim()}
        style={{
          background:   isLineItemLoading ? '#c7d2fe' : '#6366f1',
          color:        '#ffffff',
          border:       'none',
          borderRadius: 6,
          padding:      '7px 16px',
          fontSize:     13,
          fontWeight:   600,
          cursor:       isLineItemLoading ? 'not-allowed' : 'pointer',
        }}
      >
        {isLineItemLoading ? 'กำลังเพิ่ม...' : '+ เพิ่มรายการ'}
      </button>
    </div>
  );
}

// ── GenerationLogPanel ───────────────────────────────────────────────────────

interface GenerationLogPanelProps {
  draftId: string;
  orgId:   string;
  orgPlan: OrgPlan;
}

function GenerationLogPanel({ draftId, orgId, orgPlan }: GenerationLogPanelProps) {
  const [logs,      setLogs]      = useState<Array<{
    id: string; prompt: string; model: string; tokens_used: number | null;
    duration_ms: number | null; success: boolean; error_message: string | null; created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Lazy import supabase only when needed
    import('../core/supabase').then(({ supabase }) => {
      supabase
        .from('aqd_generation_logs')
        .select('*')
        .eq('draft_id', draftId)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .then(({ data, error: err }: { data: unknown; error: { message: string } | null }) => {
          if (cancelled) return;
          if (err) { setError(err.message); setLoading(false); return; }
          setLogs((data ?? []) as typeof logs);
          setLoading(false);
        });
    });

    return () => { cancelled = true; };
  }, [draftId, orgId]);

  return (
    <div
      data-testid="aqd-generation-log-panel"
      style={{
        marginTop:    24,
        background:   '#f8fafc',
        border:       '1px solid #e2e8f0',
        borderRadius: 8,
        padding:      '16px 20px',
      }}
    >
      <h4 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
        Generation Log (AI)
      </h4>
      {loading && (
        <div data-testid="aqd-gen-log-loading" style={{ color: '#9ca3af', fontSize: 13 }}>
          กำลังโหลด...
        </div>
      )}
      {error && (
        <div data-testid="aqd-gen-log-error" style={{ color: '#b91c1c', fontSize: 13 }}>
          {error}
        </div>
      )}
      {!loading && !error && logs.length === 0 && (
        <div data-testid="aqd-gen-log-empty" style={{ color: '#9ca3af', fontSize: 13 }}>
          ไม่มี Generation Log
        </div>
      )}
      {logs.map((log) => (
        <div
          key={log.id}
          data-testid={`aqd-gen-log-row-${log.id}`}
          style={{
            borderBottom: '1px solid #e5e7eb',
            padding:      '8px 0',
            fontSize:     12,
            color:        '#374151',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontWeight: 600 }}>{log.model}</span>
            <span
              data-testid={`aqd-gen-log-success-${log.id}`}
              style={{ color: log.success ? '#15803d' : '#b91c1c' }}
            >
              {log.success ? '✓ สำเร็จ' : '✗ ล้มเหลว'}
            </span>
          </div>
          <div style={{ color: '#6b7280', fontStyle: 'italic', marginBottom: 2 }}>
            {log.prompt.length > 120 ? `${log.prompt.slice(0, 120)}…` : log.prompt}
          </div>
          <div style={{ display: 'flex', gap: 12, color: '#9ca3af' }}>
            {log.tokens_used != null && <span>Tokens: {log.tokens_used}</span>}
            {log.duration_ms != null && <span>{log.duration_ms} ms</span>}
            <span>{new Date(log.created_at).toLocaleString('th-TH')}</span>
          </div>
          {log.error_message && (
            <div style={{ color: '#b91c1c', marginTop: 4 }}>{log.error_message}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function AiQuotationDraftBoard({
  orgId,
  orgPlan,
  userId,
  isAdmin = false,
}: AiQuotationDraftBoardProps) {
  const {
    drafts,
    lineItems,
    selectedDraftId,
    isLoading,
    filters,
    error,
    fetchDrafts,
    createDraft,
    updateDraft,
    deleteDraft,
    updateLineItem,
    removeLineItem,
    submitForReview,
    approveDraft,
    rejectDraft,
    selectDraft,
    setFilters,
    clearError,
  } = useAiQuotationDraftStore();

  // New draft form state
  const [showNewDraftForm, setShowNewDraftForm] = useState(false);
  const [newTitle,   setNewTitle]   = useState('');
  const [newCustomer, setNewCustomer] = useState('');

  useEffect(() => {
    fetchDrafts(orgId, orgPlan);
  }, [orgId, orgPlan]);

  // ── Plan gate ──────────────────────────────────────────────────────────────
  if (!canAccessAiQuotation(orgPlan)) {
    return (
      <div
        data-testid="aqd-plan-gate-wall"
        style={{
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        64,
          gap:            12,
          textAlign:      'center',
        }}
      >
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: '#111827' }}>
          AI Quotation Draft
        </div>
        <div style={{ fontSize: 14, color: '#6b7280' }}>
          ฟีเจอร์นี้ต้องการแผน ENTERPRISE
        </div>
        <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
          แผนปัจจุบัน: <strong>{orgPlan}</strong>
        </div>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        data-testid="aqd-loading"
        style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 15 }}
      >
        กำลังโหลด AI Quotation Draft...
      </div>
    );
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedDraft = drafts.find((d) => d.id === selectedDraftId) ?? null;
  const draftLineItems = lineItems.filter((li) => li.draft_id === selectedDraftId);

  const filteredDrafts = drafts.filter((d) => {
    if (filters.status !== 'ALL' && d.status !== filters.status) return false;
    if (filters.generatedByAi !== 'ALL' && d.generated_by_ai !== filters.generatedByAi) return false;
    return true;
  });

  const isEditable = selectedDraft?.status === 'DRAFT';

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleCreateDraft() {
    if (!newTitle.trim()) return;
    const payload: CreateAqdDraftPayload = {
      org_id:        orgId,
      title:         newTitle.trim(),
      customer_name: newCustomer.trim() || undefined,
    };
    await createDraft(payload, orgPlan);
    setNewTitle('');
    setNewCustomer('');
    setShowNewDraftForm(false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      data-testid="aqd-board"
      style={{ padding: '24px 32px', fontFamily: 'sans-serif', maxWidth: 1400 }}
    >
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: '#111827' }}>
        AI Quotation Draft
      </h2>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && (
        <div
          data-testid="aqd-error-banner"
          style={{
            background:     '#fef2f2',
            border:         '1px solid #fca5a5',
            borderRadius:   6,
            padding:        '10px 16px',
            marginBottom:   16,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            color:          '#b91c1c',
            fontSize:       14,
          }}
        >
          <span>{error}</span>
          <button
            data-testid="aqd-clear-error-btn"
            onClick={clearError}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#b91c1c',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* ── Summary bar ───────────────────────────────────────────────────── */}
      <SummaryBar />

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div
        data-testid="aqd-filter-bar"
        style={{
          display:      'flex',
          gap:          12,
          marginBottom: 20,
          flexWrap:     'wrap',
          alignItems:   'center',
        }}
      >
        <label style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>สถานะ:</label>
        <select
          data-testid="aqd-filter-status-select"
          value={filters.status}
          onChange={(e) => setFilters({ status: e.target.value as typeof filters.status })}
          style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 10px', fontSize: 13 }}
        >
          <option value="ALL">ทั้งหมด</option>
          {DRAFT_STATUSES.map((s) => (
            <option key={s} value={s}>{AQD_DRAFT_STATUS_LABELS[s]}</option>
          ))}
        </select>

        <label style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>สร้างโดย AI:</label>
        <select
          data-testid="aqd-filter-ai-select"
          value={String(filters.generatedByAi)}
          onChange={(e) =>
            setFilters({
              generatedByAi:
                e.target.value === 'ALL' ? 'ALL' : e.target.value === 'true',
            })
          }
          style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 10px', fontSize: 13 }}
        >
          <option value="ALL">ทั้งหมด</option>
          <option value="true">AI Generated</option>
          <option value="false">Manual</option>
        </select>

        <button
          data-testid="aqd-new-draft-btn"
          onClick={() => setShowNewDraftForm((v) => !v)}
          style={{
            marginLeft:   'auto',
            background:   '#6366f1',
            color:        '#ffffff',
            border:       'none',
            borderRadius: 6,
            padding:      '7px 16px',
            fontSize:     13,
            fontWeight:   600,
            cursor:       'pointer',
          }}
        >
          + สร้างร่างใหม่
        </button>
      </div>

      {/* ── New draft form ────────────────────────────────────────────────── */}
      {showNewDraftForm && (
        <div
          data-testid="aqd-new-draft-form"
          style={{
            display:      'flex',
            gap:          12,
            alignItems:   'flex-end',
            background:   '#f0f9ff',
            border:       '1px solid #bae6fd',
            borderRadius: 8,
            padding:      '14px 18px',
            marginBottom: 20,
            flexWrap:     'wrap',
          }}
        >
          <div>
            <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 2 }}>
              ชื่อร่าง *
            </label>
            <input
              data-testid="aqd-new-draft-title-input"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="ชื่อใบเสนอราคา..."
              style={{
                border: '1px solid #d1d5db', borderRadius: 4, padding: '6px 10px', fontSize: 13, width: 220,
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 2 }}>
              ชื่อลูกค้า
            </label>
            <input
              data-testid="aqd-new-draft-customer-input"
              value={newCustomer}
              onChange={(e) => setNewCustomer(e.target.value)}
              placeholder="ชื่อลูกค้า..."
              style={{
                border: '1px solid #d1d5db', borderRadius: 4, padding: '6px 10px', fontSize: 13, width: 180,
              }}
            />
          </div>
          <button
            data-testid="aqd-create-draft-submit-btn"
            onClick={handleCreateDraft}
            disabled={!newTitle.trim()}
            style={{
              background:   !newTitle.trim() ? '#c7d2fe' : '#6366f1',
              color:        '#ffffff',
              border:       'none',
              borderRadius: 6,
              padding:      '8px 18px',
              fontSize:     13,
              fontWeight:   600,
              cursor:       !newTitle.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            สร้าง
          </button>
          <button
            data-testid="aqd-cancel-new-draft-btn"
            onClick={() => setShowNewDraftForm(false)}
            style={{
              background: 'none', border: '1px solid #d1d5db', borderRadius: 6,
              padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#374151',
            }}
          >
            ยกเลิก
          </button>
        </div>
      )}

      {/* ── Main layout — left list + right detail ────────────────────────── */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* ── Draft list ────────────────────────────────────────────────── */}
        <div
          data-testid="aqd-draft-list"
          style={{ width: 300, flexShrink: 0 }}
        >
          {filteredDrafts.length === 0 && (
            <div
              data-testid="aqd-draft-empty"
              style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', paddingTop: 40 }}
            >
              ไม่มีร่างใบเสนอราคา
            </div>
          )}
          {filteredDrafts.map((d) => (
            <DraftListItem
              key={d.id}
              draft={d}
              isSelected={d.id === selectedDraftId}
              onSelect={() => selectDraft(d.id)}
              onDelete={() => deleteDraft(d.id, orgPlan)}
              isAdmin={isAdmin}
              orgPlan={orgPlan}
            />
          ))}
        </div>

        {/* ── Detail panel ──────────────────────────────────────────────── */}
        {selectedDraft ? (
          <div
            data-testid="aqd-draft-detail-panel"
            style={{ flex: 1, minWidth: 0 }}
          >
            {/* Header */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <h3
                  data-testid="aqd-detail-title"
                  style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}
                >
                  {selectedDraft.title}
                </h3>
                <StatusBadge status={selectedDraft.status} />
              </div>
              {selectedDraft.customer_name && (
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  ลูกค้า: {selectedDraft.customer_name}
                </div>
              )}
            </div>

            {/* Edit title if DRAFT */}
            {isEditable && (
              <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
                <input
                  data-testid="aqd-edit-title-input"
                  defaultValue={selectedDraft.title}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== selectedDraft.title) {
                      updateDraft(selectedDraft.id, { title: e.target.value.trim() }, orgPlan);
                    }
                  }}
                  style={{
                    border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 14, width: 280,
                  }}
                />
                <input
                  data-testid="aqd-edit-notes-input"
                  defaultValue={selectedDraft.notes ?? ''}
                  placeholder="หมายเหตุ..."
                  onBlur={(e) =>
                    updateDraft(selectedDraft.id, { notes: e.target.value.trim() || undefined }, orgPlan)
                  }
                  style={{
                    border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 14, width: 240,
                  }}
                />
              </div>
            )}

            {/* ── Line items table ────────────────────────────────────────── */}
            <div
              data-testid="aqd-line-items-section"
              style={{
                background:   '#ffffff',
                border:       '1px solid #e5e7eb',
                borderRadius: 8,
                overflow:     'hidden',
                marginBottom: isEditable ? 0 : 16,
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {['ประเภท', 'รายละเอียด', 'จำนวน', 'ราคา/หน่วย', 'รวม', ...(isEditable ? [''] : [])].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding:   '10px 10px',
                          fontSize:  12,
                          fontWeight: 600,
                          color:     '#374151',
                          textAlign: h === 'รวม' || h === 'ราคา/หน่วย' ? 'right' : h === 'จำนวน' ? 'center' : 'left',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draftLineItems.length === 0 && (
                    <tr>
                      <td
                        colSpan={isEditable ? 6 : 5}
                        data-testid="aqd-line-items-empty"
                        style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}
                      >
                        ยังไม่มีรายการ
                      </td>
                    </tr>
                  )}
                  {draftLineItems.map((item) => (
                    <LineItemRow
                      key={item.id}
                      item={item}
                      editable={isEditable}
                      onUpdate={(payload) => updateLineItem(item.id, payload, orgPlan)}
                      onRemove={() => removeLineItem(item.id, orgPlan)}
                    />
                  ))}
                </tbody>
                {draftLineItems.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f9fafb' }}>
                      <td
                        colSpan={isEditable ? 4 : 3}
                        style={{ padding: '10px 10px', fontSize: 13, fontWeight: 600, color: '#374151' }}
                      >
                        ยอดรวมก่อนภาษี
                      </td>
                      <td
                        data-testid="aqd-subtotal"
                        style={{ padding: '10px 10px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: '#0ea5e9' }}
                      >
                        ฿{selectedDraft.subtotal_thb.toLocaleString('th')}
                      </td>
                      {isEditable && <td />}
                    </tr>
                    <tr style={{ background: '#f9fafb' }}>
                      <td
                        colSpan={isEditable ? 4 : 3}
                        style={{ padding: '6px 10px', fontSize: 13, color: '#6b7280' }}
                      >
                        ภาษี ({(selectedDraft.tax_rate * 100).toLocaleString('th', { maximumFractionDigits: 2 })}%)
                      </td>
                      <td
                        data-testid="aqd-tax-amount"
                        style={{ padding: '6px 10px', textAlign: 'right', fontSize: 13, color: '#6b7280' }}
                      >
                        ฿{selectedDraft.tax_amount_thb.toLocaleString('th')}
                      </td>
                      {isEditable && <td />}
                    </tr>
                    <tr style={{ borderTop: '1px solid #d1d5db', background: '#eef2ff' }}>
                      <td
                        colSpan={isEditable ? 4 : 3}
                        style={{ padding: '12px 10px', fontSize: 15, fontWeight: 700, color: '#111827' }}
                      >
                        ยอดรวมสุทธิ
                      </td>
                      <td
                        data-testid="aqd-total"
                        style={{
                          padding: '12px 10px', textAlign: 'right', fontSize: 16,
                          fontWeight: 800, color: '#6366f1',
                        }}
                      >
                        ฿{selectedDraft.total_thb.toLocaleString('th')}
                      </td>
                      {isEditable && <td />}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* ── Add line item form (DRAFT only) ─────────────────────── */}
            {isEditable && (
              <AddLineItemForm draftId={selectedDraft.id} orgId={orgId} orgPlan={orgPlan} />
            )}

            {/* ── Workflow buttons ────────────────────────────────────── */}
            <WorkflowButtons
              draft={selectedDraft}
              orgPlan={orgPlan}
              isAdmin={isAdmin}
              onSubmit={() => submitForReview(selectedDraft.id, orgPlan)}
              onApprove={() => approveDraft(selectedDraft.id, orgPlan)}
              onReject={() => rejectDraft(selectedDraft.id, orgPlan)}
            />

            {/* ── Generation log (AI-generated drafts only) ────────────── */}
            {selectedDraft.generated_by_ai && (
              <GenerationLogPanel draftId={selectedDraft.id} orgId={orgId} orgPlan={orgPlan} />
            )}
          </div>
        ) : (
          <div
            data-testid="aqd-no-selection"
            style={{
              flex:    1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color:   '#d1d5db',
              fontSize: 14,
              paddingTop: 80,
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 36 }}>📄</div>
            <div>เลือกร่างใบเสนอราคาเพื่อดูรายละเอียด</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AiQuotationDraftBoard;
