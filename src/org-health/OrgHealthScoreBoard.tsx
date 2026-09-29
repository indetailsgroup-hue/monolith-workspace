// src/org-health/OrgHealthScoreBoard.tsx
// MONOLITH v18.5 — 2S2P1C Org Health Score Board
//
// ENTERPRISE-gated dashboard:
//   - Composite score gauge + grade badge
//   - 5 dimension breakdown cards (SAFETY / SATISFACTION / PERFORMANCE / PROCESS / CULTURE)
//   - Snapshot history trend list
//   - Scoring config panel (admin can update weights)
//   - Compute-now button

import React, { useEffect, useState } from 'react';
import type { OrgPlan } from '../tenant/types';
import { useOrgHealthScoreStore } from './orgHealthScoreStore';
import {
  canAccessOrgHealthScore,
  ALL_OHS_DIMENSIONS,
  OHS_DIMENSION_LABELS,
  OHS_GRADE_LABELS,
  OHS_GRADE_ACCENT,
  DEFAULT_OHS_SCORING_CONFIG,
  type OhsDimension,
  type OhsScoreGrade,
} from './orgHealthScoreTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface OrgHealthScoreBoardProps {
  orgId:   string;
  orgPlan: OrgPlan;
  isAdmin?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// DimensionCard sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface DimensionCardProps {
  dimension:  OhsDimension;
  rawScore:   number;
  weight:     number;
  hasData:    boolean;
}

function DimensionCard({ dimension, rawScore, weight, hasData }: DimensionCardProps) {
  const label     = OHS_DIMENSION_LABELS[dimension];
  const barWidth  = hasData ? `${Math.max(0, Math.min(100, rawScore))}%` : '0%';
  const scoreColor =
    rawScore >= 75 ? '#22c55e' :
    rawScore >= 50 ? '#f59e0b' :
    '#ef4444';

  return (
    <div
      data-testid={`ohs-dimension-card-${dimension}`}
      style={{
        background:   '#ffffff',
        borderRadius: 8,
        border:       '1px solid #e5e7eb',
        padding:      '16px 20px',
        minWidth:     160,
        flex:         '1 1 0',
        boxShadow:    '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      <div
        style={{
          fontSize:   12,
          color:      '#6b7280',
          fontWeight: 500,
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>

      <div
        data-testid={`ohs-dim-score-${dimension}`}
        style={{
          fontSize:   28,
          fontWeight: 700,
          color:      hasData ? scoreColor : '#d1d5db',
          lineHeight: 1,
          marginBottom: 8,
        }}
      >
        {hasData ? rawScore.toFixed(1) : '—'}
      </div>

      {/* Progress bar */}
      <div
        style={{
          height:       6,
          background:   '#f3f4f6',
          borderRadius: 4,
          overflow:     'hidden',
          marginBottom: 6,
        }}
      >
        <div
          data-testid={`ohs-dim-bar-${dimension}`}
          style={{
            height:     '100%',
            width:      barWidth,
            background: scoreColor,
            borderRadius: 4,
            transition: 'width 0.4s ease',
          }}
        />
      </div>

      <div style={{ fontSize: 11, color: '#9ca3af' }}>
        น้ำหนัก: {(weight * 100).toFixed(0)}%
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GradeCircle sub-component
// ─────────────────────────────────────────────────────────────────────────────

function GradeCircle({ grade, accent }: { grade: OhsScoreGrade; accent: string }) {
  return (
    <div
      data-testid="ohs-grade-badge"
      style={{
        width:          64,
        height:         64,
        borderRadius:   '50%',
        background:     accent,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        color:          '#ffffff',
        fontSize:       28,
        fontWeight:     800,
        flexShrink:     0,
        boxShadow:      `0 0 0 4px ${accent}33`,
      }}
    >
      {grade}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function OrgHealthScoreBoard({
  orgId,
  orgPlan,
  isAdmin = false,
}: OrgHealthScoreBoardProps) {
  // ── Plan gate (before hook to satisfy Rules-of-Hooks) ────────────────────
  if (!canAccessOrgHealthScore(orgPlan)) {
    return (
      <div
        data-testid="ohs-plan-gate-wall"
        style={{
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        64,
          gap:            12,
          color:          '#6b7280',
          textAlign:      'center',
        }}
      >
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>
          2S2P1C Org Health Score
        </div>
        <div style={{ fontSize: 14, maxWidth: 320, lineHeight: 1.6 }}>
          ฟีเจอร์นี้ต้องการแผน <strong>ENTERPRISE</strong>
          <br />อัปเกรดเพื่อเข้าถึงแดชบอร์ด Org Health Score แบบครบวงจร
        </div>
      </div>
    );
  }

  return <OrgHealthScoreBoardInner orgId={orgId} orgPlan={orgPlan} isAdmin={isAdmin} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inner component (hooks live here, after plan gate)
// ─────────────────────────────────────────────────────────────────────────────

function OrgHealthScoreBoardInner({ orgId, orgPlan, isAdmin }: Required<OrgHealthScoreBoardProps>) {
  const {
    currentScore,
    history,
    scoringConfig,
    isLoading,
    isComputing,
    isConfigLoading,
    error,
    fetchLatestScore,
    fetchHistory,
    fetchScoringConfig,
    computeScore,
    updateScoringConfig,
    clearError,
  } = useOrgHealthScoreStore();

  // Local state for inline weight editing
  const [editWeights, setEditWeights] = useState<Partial<Record<OhsDimension, string>>>({});
  const [editingDim, setEditingDim]   = useState<OhsDimension | null>(null);

  useEffect(() => {
    fetchLatestScore(orgId, orgPlan);
    fetchHistory(orgId, orgPlan);
    fetchScoringConfig(orgId, orgPlan);
  }, [orgId, orgPlan]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        data-testid="ohs-loading"
        style={{ padding: 48, textAlign: 'center', color: '#9ca3af', fontSize: 15 }}
      >
        กำลังโหลด Org Health Score...
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const grade       = currentScore?.grade ?? null;
  const gradeAccent = grade ? OHS_GRADE_ACCENT[grade] : '#d1d5db';
  const gradeLabel  = grade ? OHS_GRADE_LABELS[grade] : '—';

  // Build a weight map from scoringConfig (falls back to DEFAULT)
  const weightMap: Record<OhsDimension, number> = { ...DEFAULT_OHS_SCORING_CONFIG };
  for (const cfg of scoringConfig) {
    weightMap[cfg.dimension] = cfg.weight;
  }

  function handleSaveWeight(dim: OhsDimension) {
    const raw  = parseFloat(editWeights[dim] ?? '');
    const cfg  = scoringConfig.find((c) => c.dimension === dim);
    if (!cfg || isNaN(raw) || raw < 0 || raw > 1) return;
    updateScoringConfig(cfg.id, raw, undefined, orgPlan).then(() => {
      setEditingDim(null);
    });
  }

  function handleComputeNow() {
    const today = new Date().toISOString().split('T')[0];
    computeScore(orgId, today, orgPlan);
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      data-testid="ohs-board"
      style={{ padding: '28px 36px', fontFamily: 'sans-serif', maxWidth: 1280 }}
    >
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   24,
          flexWrap:       'wrap',
          gap:            12,
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>
          2S2P1C Org Health Score
        </h2>

        <button
          data-testid="ohs-compute-btn"
          onClick={handleComputeNow}
          disabled={isComputing}
          style={{
            background:   isComputing ? '#e5e7eb' : '#111827',
            color:        isComputing ? '#6b7280' : '#ffffff',
            border:       'none',
            borderRadius: 6,
            padding:      '8px 18px',
            fontSize:     13,
            fontWeight:   600,
            cursor:       isComputing ? 'not-allowed' : 'pointer',
            transition:   'background 0.15s',
          }}
        >
          {isComputing ? (
            <span data-testid="ohs-is-computing">กำลังคำนวณ...</span>
          ) : (
            'คำนวณ Score ตอนนี้'
          )}
        </button>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && (
        <div
          data-testid="ohs-error-banner"
          style={{
            background:     '#fef2f2',
            border:         '1px solid #fca5a5',
            borderRadius:   6,
            padding:        '10px 16px',
            marginBottom:   20,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            color:          '#b91c1c',
            fontSize:       14,
          }}
        >
          <span>{error}</span>
          <button
            data-testid="ohs-clear-error-btn"
            onClick={clearError}
            style={{
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              fontSize:   18,
              color:      '#b91c1c',
              padding:    '0 4px',
            }}
            aria-label="ปิดข้อความแจ้งเตือน"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Composite score gauge ──────────────────────────────────────────── */}
      {currentScore ? (
        <div
          data-testid="ohs-score-gauge"
          style={{
            background:   '#ffffff',
            borderRadius: 12,
            border:       `2px solid ${gradeAccent}`,
            padding:      '24px 32px',
            marginBottom: 24,
            display:      'flex',
            alignItems:   'center',
            gap:          28,
            boxShadow:    '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <GradeCircle grade={currentScore.grade} accent={gradeAccent} />
          <div>
            <div
              style={{
                fontSize:   48,
                fontWeight: 800,
                color:      gradeAccent,
                lineHeight: 1,
              }}
            >
              {currentScore.composite_score.toFixed(1)}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
              {gradeLabel} — Composite Score
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              {currentScore.snapshot_date}
            </div>
          </div>
        </div>
      ) : (
        <div
          data-testid="ohs-empty-score"
          style={{
            background:   '#f9fafb',
            borderRadius: 10,
            border:       '1px dashed #d1d5db',
            padding:      '32px',
            marginBottom: 24,
            textAlign:    'center',
            color:        '#6b7280',
            fontSize:     14,
          }}
        >
          ยังไม่มี Org Health Score — กด &ldquo;คำนวณ Score ตอนนี้&rdquo; เพื่อสร้าง snapshot แรก
        </div>
      )}

      {/* ── Dimension breakdown cards ─────────────────────────────────────── */}
      <div
        data-testid="ohs-dimension-cards"
        style={{
          display:   'flex',
          gap:       12,
          flexWrap:  'wrap',
          marginBottom: 28,
        }}
      >
        {ALL_OHS_DIMENSIONS.map((dim) => {
          const dimScore  = currentScore?.dimensionMap?.[dim];
          const rawScore  = dimScore?.raw_score ?? 0;
          const weight    = weightMap[dim];
          return (
            <DimensionCard
              key={dim}
              dimension={dim}
              rawScore={rawScore}
              weight={weight}
              hasData={!!dimScore}
            />
          );
        })}
      </div>

      {/* ── Main two-column: history + config ─────────────────────────────── */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* ── Snapshot history ──────────────────────────────────────────── */}
        <div
          data-testid="ohs-history-section"
          style={{
            flex:         '2 1 0',
            minWidth:     0,
            background:   '#ffffff',
            borderRadius: 8,
            border:       '1px solid #e5e7eb',
            padding:      '16px 20px',
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 14, marginTop: 0 }}>
            ประวัติ Score
          </h3>

          {history.length === 0 ? (
            <div
              data-testid="ohs-history-empty"
              style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '20px 0' }}
            >
              ยังไม่มีประวัติ snapshot
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.map((snap) => {
                const snapGrade  = snap.grade;
                const snapAccent = OHS_GRADE_ACCENT[snapGrade];
                return (
                  <li
                    key={snap.id}
                    data-testid="ohs-snapshot-row"
                    style={{
                      display:        'flex',
                      alignItems:     'center',
                      gap:            12,
                      padding:        '8px 12px',
                      borderRadius:   6,
                      background:     '#f9fafb',
                      fontSize:       13,
                    }}
                  >
                    <span
                      style={{
                        fontWeight:   700,
                        color:        snapAccent,
                        fontSize:     15,
                        minWidth:     20,
                        textAlign:    'center',
                      }}
                    >
                      {snapGrade}
                    </span>
                    <span style={{ fontWeight: 600, color: snapAccent, minWidth: 48 }}>
                      {snap.composite_score.toFixed(1)}
                    </span>
                    <span style={{ color: '#6b7280', flex: 1 }}>{snap.snapshot_date}</span>
                    {/* Trend bar */}
                    <div
                      style={{
                        width:        80,
                        height:       6,
                        background:   '#f3f4f6',
                        borderRadius: 3,
                        overflow:     'hidden',
                      }}
                    >
                      <div
                        style={{
                          height:     '100%',
                          width:      `${snap.composite_score}%`,
                          background: snapAccent,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Scoring config panel ──────────────────────────────────────── */}
        <div
          data-testid="ohs-config-panel"
          style={{
            flex:         '1 1 0',
            minWidth:     220,
            background:   '#f9fafb',
            borderRadius: 8,
            border:       '1px solid #e5e7eb',
            padding:      '16px 20px',
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 14, marginTop: 0 }}>
            น้ำหนักมิติ
            {isConfigLoading && (
              <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>กำลังโหลด...</span>
            )}
          </h3>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ALL_OHS_DIMENSIONS.map((dim) => {
              const currentWeight = weightMap[dim];
              const isEditing     = editingDim === dim;

              return (
                <li
                  key={dim}
                  data-testid={`ohs-config-row-${dim}`}
                  style={{
                    background:     '#ffffff',
                    border:         '1px solid #e5e7eb',
                    borderRadius:   6,
                    padding:        '10px 12px',
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'space-between',
                    fontSize:       13,
                    gap:            8,
                  }}
                >
                  <span style={{ color: '#374151', fontWeight: 500 }}>
                    {OHS_DIMENSION_LABELS[dim]}
                  </span>

                  {isAdmin && isEditing ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        data-testid={`ohs-config-weight-input-${dim}`}
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={editWeights[dim] ?? String(currentWeight)}
                        onChange={(e) =>
                          setEditWeights((prev) => ({ ...prev, [dim]: e.target.value }))
                        }
                        style={{
                          width:        64,
                          padding:      '3px 6px',
                          borderRadius: 4,
                          border:       '1px solid #d1d5db',
                          fontSize:     12,
                        }}
                      />
                      <button
                        data-testid={`ohs-config-save-btn-${dim}`}
                        onClick={() => handleSaveWeight(dim)}
                        style={{
                          background:   '#111827',
                          color:        '#fff',
                          border:       'none',
                          borderRadius: 4,
                          padding:      '3px 8px',
                          fontSize:     11,
                          cursor:       'pointer',
                        }}
                      >
                        บันทึก
                      </button>
                      <button
                        data-testid={`ohs-config-cancel-btn-${dim}`}
                        onClick={() => setEditingDim(null)}
                        style={{
                          background:   '#f3f4f6',
                          color:        '#374151',
                          border:       'none',
                          borderRadius: 4,
                          padding:      '3px 8px',
                          fontSize:     11,
                          cursor:       'pointer',
                        }}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ color: '#6b7280', fontWeight: 600 }}>
                        {(currentWeight * 100).toFixed(0)}%
                      </span>
                      {isAdmin && (
                        <button
                          data-testid={`ohs-config-edit-btn-${dim}`}
                          onClick={() => {
                            setEditWeights((prev) => ({
                              ...prev,
                              [dim]: String(currentWeight),
                            }));
                            setEditingDim(dim);
                          }}
                          style={{
                            background:   'none',
                            border:       '1px solid #d1d5db',
                            borderRadius: 4,
                            padding:      '2px 7px',
                            fontSize:     11,
                            color:        '#6b7280',
                            cursor:       'pointer',
                          }}
                        >
                          แก้ไข
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default OrgHealthScoreBoard;
