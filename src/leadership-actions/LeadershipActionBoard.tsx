// src/leadership-actions/LeadershipActionBoard.tsx
// MONOLITH v18.0 — Leadership Action Tracker UI (ENTERPRISE-gated)

import React, { useEffect, useState } from 'react';

import type { OrgPlan } from '../tenant/types';
import { useLeadershipActionStore } from './leadershipActionStore';
import {
  canAccessLeadershipActions,
  LAT_STATUS_LABELS,
  LAT_PRIORITY_LABELS,
  LAT_CATEGORY_LABELS,
  type LatActionStatus,
  type LatActionPriority,
  type LatActionCategory,
} from './leadershipActionTypes';

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────

interface LeadershipActionBoardProps {
  orgId:    string;
  orgPlan:  OrgPlan;
  userId?:  string;
  isAdmin?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_ACCENT: Record<LatActionStatus, string> = {
  OPEN:        '#3b82f6',
  IN_PROGRESS: '#f59e0b',
  BLOCKED:     '#ef4444',
  COMPLETED:   '#22c55e',
  CANCELLED:   '#6b7280',
};

const PRIORITY_ACCENT: Record<LatActionPriority, string> = {
  LOW:      '#6b7280',
  MEDIUM:   '#f59e0b',
  HIGH:     '#f97316',
  CRITICAL: '#ef4444',
};

const LAT_STATUSES: LatActionStatus[] = [
  'OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED',
];
const LAT_PRIORITIES: LatActionPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const LAT_CATEGORIES: LatActionCategory[] = [
  'STRATEGY', 'OPERATIONS', 'PEOPLE', 'FINANCE',
  'COMPLIANCE', 'QUALITY', 'SAFETY', 'CUSTOM',
];

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: SummaryPill
// ─────────────────────────────────────────────────────────────────────────────

interface SummaryPillProps {
  label:  string;
  value:  number;
  accent: string;
}

function SummaryPill({ label, value, accent }: SummaryPillProps) {
  return (
    <div
      style={{
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        padding:       '10px 20px',
        borderRadius:  8,
        background:    accent + '18',
        minWidth:      100,
      }}
    >
      <span style={{ fontSize: 26, fontWeight: 700, color: accent }}>{value}</span>
      <span style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function LeadershipActionBoard({
  orgId,
  orgPlan,
  userId,
  isAdmin,
}: LeadershipActionBoardProps) {
  // ── Plan gate ────────────────────────────────────────────────────────────
  if (!canAccessLeadershipActions(orgPlan)) {
    return (
      <div data-testid="lat-plan-gate-wall" style={gateWallStyle}>
        <h2 style={{ margin: 0, color: '#1e293b' }}>Leadership Action Tracker</h2>
        <p style={{ color: '#64748b', margin: '8px 0 0' }}>
          ฟีเจอร์นี้ต้องการแผน ENTERPRISE กรุณาอัปเกรดเพื่อเข้าถึง
        </p>
        <span style={planBadgeStyle}>ENTERPRISE</span>
      </div>
    );
  }

  // ── Store ────────────────────────────────────────────────────────────────
  const {
    actions,
    updates,
    isLoading,
    isUpdateLoading,
    filters,
    error,
    selectedActionId,
    fetchActions,
    createAction,
    deleteAction,
    postUpdate,
    completeAction,
    cancelAction,
    reassignOwner,
    selectAction,
    setFilters,
    clearError,
  } = useLeadershipActionStore();

  // ── Local state ──────────────────────────────────────────────────────────
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle,    setNewTitle]    = useState('');
  const [newOwner,    setNewOwner]    = useState('');
  const [updateBody,  setUpdateBody]  = useState('');

  // ── Mount fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchActions(orgId, orgPlan).catch(() => {
      // error captured in store state
    });
  }, [orgId, orgPlan]);

  // ── Loading guard ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div data-testid="lat-loading" style={loadingStyle}>
        กำลังโหลด Leadership Actions…
      </div>
    );
  }

  // ── Derived values ───────────────────────────────────────────────────────
  const openCount       = actions.filter((a) => a.status === 'OPEN').length;
  const inProgressCount = actions.filter((a) => a.status === 'IN_PROGRESS').length;
  const blockedCount    = actions.filter((a) => a.status === 'BLOCKED').length;
  const completedCount  = actions.filter((a) => a.status === 'COMPLETED').length;

  const filteredActions = actions.filter((a) => {
    if (filters.status   !== 'ALL' && a.status   !== filters.status)   return false;
    if (filters.priority !== 'ALL' && a.priority !== filters.priority) return false;
    if (filters.category !== 'ALL' && a.category !== filters.category) return false;
    if (filters.ownerId  !== 'ALL' && a.owner_id !== filters.ownerId)  return false;
    return true;
  });

  const selectedAction  = actions.find((a) => a.id === selectedActionId) ?? null;
  const actionUpdates   = updates.filter((u) => u.action_id === selectedActionId);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleCreateAction() {
    if (!newTitle.trim() || !newOwner.trim()) return;
    createAction(
      { org_id: orgId, title: newTitle.trim(), owner_id: newOwner.trim() },
      orgPlan,
    ).catch(() => {});
    setNewTitle('');
    setNewOwner('');
    setShowNewForm(false);
  }

  function handlePostUpdate() {
    if (!selectedActionId || !updateBody.trim()) return;
    postUpdate(
      { action_id: selectedActionId, org_id: orgId, body: updateBody.trim() },
      orgPlan,
    ).catch(() => {});
    setUpdateBody('');
  }

  function handleComplete() {
    if (!selectedActionId) return;
    completeAction(selectedActionId, userId ?? 'system', orgPlan).catch(() => {});
  }

  function handleCancelAction() {
    if (!selectedActionId) return;
    cancelAction(selectedActionId, orgPlan).catch(() => {});
  }

  function handleReassign() {
    if (!selectedActionId) return;
    const newOwnerId = window.prompt('Enter new owner ID:');
    if (newOwnerId?.trim()) {
      reassignOwner(selectedActionId, newOwnerId.trim(), orgPlan).catch(() => {});
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={containerStyle}>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && (
        <div data-testid="lat-error-banner" style={errorBannerStyle}>
          <span>{error}</span>
          <button
            data-testid="lat-clear-error-btn"
            onClick={clearError}
            style={clearBtnStyle}
            aria-label="clear error"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Summary bar ───────────────────────────────────────────────────── */}
      <div data-testid="lat-summary-bar" style={summaryBarStyle}>
        <SummaryPill label="เปิด"            value={openCount}       accent="#3b82f6" />
        <SummaryPill label="กำลังดำเนินการ"  value={inProgressCount} accent="#f59e0b" />
        <SummaryPill label="ติดขัด"           value={blockedCount}    accent="#ef4444" />
        <SummaryPill label="เสร็จสิ้น"        value={completedCount}  accent="#22c55e" />
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div data-testid="lat-filter-bar" style={filterBarStyle}>
        <select
          data-testid="lat-filter-status"
          value={filters.status}
          onChange={(e) =>
            setFilters({ status: e.target.value as LatActionStatus | 'ALL' })
          }
          style={selectStyle}
        >
          <option value="ALL">สถานะทั้งหมด</option>
          {LAT_STATUSES.map((s) => (
            <option key={s} value={s}>{LAT_STATUS_LABELS[s]}</option>
          ))}
        </select>

        <select
          data-testid="lat-filter-priority"
          value={filters.priority}
          onChange={(e) =>
            setFilters({ priority: e.target.value as LatActionPriority | 'ALL' })
          }
          style={selectStyle}
        >
          <option value="ALL">ความสำคัญทั้งหมด</option>
          {LAT_PRIORITIES.map((p) => (
            <option key={p} value={p}>{LAT_PRIORITY_LABELS[p]}</option>
          ))}
        </select>

        <select
          data-testid="lat-filter-category"
          value={filters.category}
          onChange={(e) =>
            setFilters({ category: e.target.value as LatActionCategory | 'ALL' })
          }
          style={selectStyle}
        >
          <option value="ALL">หมวดหมู่ทั้งหมด</option>
          {LAT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{LAT_CATEGORY_LABELS[c]}</option>
          ))}
        </select>

        <button
          data-testid="lat-new-action-btn"
          onClick={() => setShowNewForm(true)}
          style={newActionBtnStyle}
        >
          + สร้าง Action ใหม่
        </button>
      </div>

      {/* ── New action form ───────────────────────────────────────────────── */}
      {showNewForm && (
        <div data-testid="lat-new-action-form" style={newFormStyle}>
          <input
            data-testid="lat-action-title-input"
            placeholder="ชื่อ Action"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            style={inputStyle}
          />
          <input
            data-testid="lat-action-owner-input"
            placeholder="Owner ID"
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              data-testid="lat-create-action-submit-btn"
              onClick={handleCreateAction}
              style={submitBtnStyle}
            >
              สร้าง
            </button>
            <button
              data-testid="lat-cancel-new-action-btn"
              onClick={() => {
                setShowNewForm(false);
                setNewTitle('');
                setNewOwner('');
              }}
              style={cancelBtnStyle}
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* ── Main layout ───────────────────────────────────────────────────── */}
      <div style={mainLayoutStyle}>

        {/* ── Action list ─────────────────────────────────────────────────── */}
        <div data-testid="lat-action-list" style={actionListStyle}>
          {filteredActions.length === 0 ? (
            <div data-testid="lat-action-empty" style={emptyStyle}>
              ไม่มี Action ที่ตรงกับเงื่อนไข
            </div>
          ) : (
            filteredActions.map((action) => (
              <div
                key={action.id}
                data-testid={`lat-action-item-${action.id}`}
                onClick={() => selectAction(action.id)}
                style={{
                  ...actionItemStyle,
                  background:  selectedActionId === action.id ? '#eff6ff' : '#ffffff',
                  borderColor: selectedActionId === action.id ? '#3b82f6' : '#e5e7eb',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6, color: '#1e293b' }}>
                  {action.title}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    data-testid={`lat-status-badge-${action.status}`}
                    style={{
                      ...badgePillStyle,
                      background: STATUS_ACCENT[action.status] + '22',
                      color:      STATUS_ACCENT[action.status],
                    }}
                  >
                    {LAT_STATUS_LABELS[action.status]}
                  </span>

                  <span
                    data-testid={`lat-priority-badge-${action.priority}`}
                    style={{
                      ...badgePillStyle,
                      background: PRIORITY_ACCENT[action.priority] + '22',
                      color:      PRIORITY_ACCENT[action.priority],
                    }}
                  >
                    {LAT_PRIORITY_LABELS[action.priority]}
                  </span>
                </div>

                {(isAdmin || action.owner_id === userId) && (
                  <button
                    data-testid={`lat-delete-action-${action.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteAction(action.id, orgPlan).catch(() => {});
                    }}
                    style={deleteBtnStyle}
                    aria-label={`delete action ${action.id}`}
                  >
                    ลบ
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* ── Detail panel / no-selection ───────────────────────────────── */}
        {selectedAction ? (
          <div data-testid="lat-action-detail-panel" style={detailPanelStyle}>
            <h3 style={{ margin: '0 0 6px', color: '#1e293b' }}>
              {selectedAction.title}
            </h3>
            {selectedAction.description && (
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
                {selectedAction.description}
              </p>
            )}

            {/* Action control buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              <button
                data-testid="lat-complete-btn"
                onClick={handleComplete}
                disabled={
                  selectedAction.status === 'COMPLETED' ||
                  selectedAction.status === 'CANCELLED'
                }
                style={{
                  ...completeBtnStyle,
                  opacity:
                    selectedAction.status === 'COMPLETED' ||
                    selectedAction.status === 'CANCELLED'
                      ? 0.4
                      : 1,
                  cursor:
                    selectedAction.status === 'COMPLETED' ||
                    selectedAction.status === 'CANCELLED'
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                เสร็จสิ้น
              </button>

              <button
                data-testid="lat-cancel-action-btn"
                onClick={handleCancelAction}
                disabled={
                  selectedAction.status === 'COMPLETED' ||
                  selectedAction.status === 'CANCELLED'
                }
                style={{
                  ...cancelBtnStyle,
                  opacity:
                    selectedAction.status === 'COMPLETED' ||
                    selectedAction.status === 'CANCELLED'
                      ? 0.4
                      : 1,
                  cursor:
                    selectedAction.status === 'COMPLETED' ||
                    selectedAction.status === 'CANCELLED'
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                ยกเลิก Action
              </button>

              {isAdmin && (
                <button
                  data-testid="lat-reassign-btn"
                  onClick={handleReassign}
                  style={reassignBtnStyle}
                >
                  มอบหมายใหม่
                </button>
              )}
            </div>

            {/* Updates section */}
            <div data-testid="lat-updates-section" style={updatesSectionStyle}>
              <h4 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: 14 }}>
                บันทึกความคืบหน้า
              </h4>

              {actionUpdates.length === 0 ? (
                <div data-testid="lat-updates-empty" style={emptyStyle}>
                  ยังไม่มีบันทึก
                </div>
              ) : (
                actionUpdates.map((u) => (
                  <div
                    key={u.id}
                    data-testid={`lat-update-row-${u.id}`}
                    style={updateRowStyle}
                  >
                    <div style={{ fontSize: 13, color: '#1e293b' }}>{u.body}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                      {u.createdAt}
                    </div>
                  </div>
                ))
              )}

              {/* Post-update form */}
              <div data-testid="lat-post-update-form" style={{ marginTop: 16 }}>
                <textarea
                  data-testid="lat-update-body-input"
                  placeholder="เพิ่มบันทึกความคืบหน้า…"
                  value={updateBody}
                  onChange={(e) => setUpdateBody(e.target.value)}
                  rows={3}
                  style={textareaStyle}
                />
                <button
                  data-testid="lat-post-update-submit-btn"
                  onClick={handlePostUpdate}
                  disabled={isUpdateLoading || !updateBody.trim()}
                  style={{
                    ...submitBtnStyle,
                    opacity: isUpdateLoading || !updateBody.trim() ? 0.5 : 1,
                    cursor:  isUpdateLoading || !updateBody.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isUpdateLoading ? 'กำลังบันทึก…' : 'บันทึก'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div data-testid="lat-no-selection" style={noSelectionStyle}>
            เลือก Action เพื่อดูรายละเอียด
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  fontFamily:  '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  background:  '#f8fafc',
  minHeight:   '100vh',
  padding:     24,
};

const gateWallStyle: React.CSSProperties = {
  display:        'flex',
  flexDirection:  'column',
  alignItems:     'center',
  justifyContent: 'center',
  padding:        48,
  background:     '#f8fafc',
  borderRadius:   12,
  textAlign:      'center',
};

const planBadgeStyle: React.CSSProperties = {
  display:      'inline-block',
  background:   '#7c3aed20',
  color:        '#7c3aed',
  borderRadius: 4,
  padding:      '4px 10px',
  fontSize:     12,
  fontWeight:   700,
  marginTop:    12,
};

const loadingStyle: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  minHeight:      200,
  color:          '#64748b',
  fontSize:       16,
};

const errorBannerStyle: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'space-between',
  background:     '#fef2f2',
  border:         '1px solid #fca5a5',
  borderRadius:   8,
  padding:        '12px 16px',
  marginBottom:   16,
  color:          '#dc2626',
  fontSize:       14,
};

const clearBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border:     'none',
  cursor:     'pointer',
  color:      '#dc2626',
  fontSize:   16,
  padding:    '0 4px',
};

const summaryBarStyle: React.CSSProperties = {
  display:      'flex',
  gap:          12,
  marginBottom: 20,
  flexWrap:     'wrap',
};

const filterBarStyle: React.CSSProperties = {
  display:     'flex',
  gap:         12,
  marginBottom: 20,
  flexWrap:    'wrap',
  alignItems:  'center',
};

const selectStyle: React.CSSProperties = {
  padding:      '8px 12px',
  borderRadius: 6,
  border:       '1px solid #d1d5db',
  background:   '#ffffff',
  fontSize:     14,
  color:        '#374151',
  cursor:       'pointer',
};

const newActionBtnStyle: React.CSSProperties = {
  padding:    '8px 16px',
  borderRadius: 6,
  border:     'none',
  background: '#3b82f6',
  color:      '#ffffff',
  fontSize:   14,
  fontWeight: 600,
  cursor:     'pointer',
  marginLeft: 'auto',
};

const newFormStyle: React.CSSProperties = {
  background:    '#ffffff',
  border:        '1px solid #e5e7eb',
  borderRadius:  8,
  padding:       16,
  marginBottom:  20,
  display:       'flex',
  flexDirection: 'column',
  gap:           8,
};

const inputStyle: React.CSSProperties = {
  padding:      '8px 12px',
  borderRadius: 6,
  border:       '1px solid #d1d5db',
  fontSize:     14,
  color:        '#374151',
  outline:      'none',
};

const textareaStyle: React.CSSProperties = {
  width:      '100%',
  padding:    '8px 12px',
  borderRadius: 6,
  border:     '1px solid #d1d5db',
  fontSize:   13,
  resize:     'vertical',
  fontFamily: 'inherit',
  marginBottom: 8,
  boxSizing:  'border-box',
};

const submitBtnStyle: React.CSSProperties = {
  padding:      '8px 16px',
  borderRadius: 6,
  border:       'none',
  background:   '#22c55e',
  color:        '#ffffff',
  fontSize:     14,
  fontWeight:   600,
  cursor:       'pointer',
};

const cancelBtnStyle: React.CSSProperties = {
  padding:      '8px 16px',
  borderRadius: 6,
  border:       '1px solid #d1d5db',
  background:   '#ffffff',
  color:        '#374151',
  fontSize:     14,
  cursor:       'pointer',
};

const completeBtnStyle: React.CSSProperties = {
  padding:      '8px 14px',
  borderRadius: 6,
  border:       'none',
  background:   '#22c55e',
  color:        '#ffffff',
  fontSize:     13,
  fontWeight:   600,
  cursor:       'pointer',
};

const reassignBtnStyle: React.CSSProperties = {
  padding:      '8px 14px',
  borderRadius: 6,
  border:       '1px solid #7c3aed',
  background:   '#7c3aed10',
  color:        '#7c3aed',
  fontSize:     13,
  cursor:       'pointer',
};

const mainLayoutStyle: React.CSSProperties = {
  display: 'flex',
  gap:     24,
};

const actionListStyle: React.CSSProperties = {
  flex:          1,
  display:       'flex',
  flexDirection: 'column',
  gap:           10,
  minWidth:      0,
};

const actionItemStyle: React.CSSProperties = {
  background:   '#ffffff',
  border:       '1px solid #e5e7eb',
  borderRadius: 8,
  padding:      '12px 16px',
  cursor:       'pointer',
  position:     'relative',
};

const emptyStyle: React.CSSProperties = {
  color:     '#94a3b8',
  fontSize:  14,
  textAlign: 'center',
  padding:   32,
};

const badgePillStyle: React.CSSProperties = {
  display:      'inline-block',
  padding:      '2px 8px',
  borderRadius: 12,
  fontSize:     12,
  fontWeight:   600,
};

const deleteBtnStyle: React.CSSProperties = {
  position:   'absolute',
  top:        10,
  right:      12,
  background: 'transparent',
  border:     'none',
  color:      '#ef4444',
  cursor:     'pointer',
  fontSize:   12,
};

const detailPanelStyle: React.CSSProperties = {
  width:      360,
  flexShrink: 0,
  background: '#ffffff',
  border:     '1px solid #e5e7eb',
  borderRadius: 8,
  padding:    20,
  alignSelf:  'flex-start',
};

const noSelectionStyle: React.CSSProperties = {
  width:          360,
  flexShrink:     0,
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  color:          '#94a3b8',
  fontSize:       14,
  padding:        48,
};

const updatesSectionStyle: React.CSSProperties = {
  borderTop:  '1px solid #e5e7eb',
  paddingTop: 16,
};

const updateRowStyle: React.CSSProperties = {
  background:   '#f8fafc',
  borderRadius: 6,
  padding:      '8px 12px',
  marginBottom: 8,
};
