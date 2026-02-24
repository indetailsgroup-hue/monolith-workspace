/**
 * BreakdownTable MVP (DRAFT-only)
 *
 * - Editable per-row: FinishW/H, Composite thickness (Tcore, TsA, TsB), Edge enable + thickness + premill per side
 * - Live computes: CutW / CutH (SPEC-08 formula)
 * - Syncs to Zustand store: draftManufacturing.breakdownRows (source of truth)
 * - Intended usage: DesignerScreen (DRAFT) before Freeze
 */

import React from 'react';
import { useSpecStore } from '@/spec';
import type {
  PartBreakdownRow,
  BreakdownEdgeColumns,
} from '@/gate/builders/fromBreakdown';
import { exportCutListCsv, downloadTextFile } from '@/export/cutList';

type Props = {
  readOnly?: boolean;
};

/** Patch type that allows partial nested objects */
type RowPatch = Omit<Partial<PartBreakdownRow>, 'material' | 'edge'> & {
  material?: Partial<PartBreakdownRow['material']>;
  edge?: Partial<PartBreakdownRow['edge']>;
};

const sideLabels: Array<{ k: 'L' | 'R' | 'T' | 'B'; label: string }> = [
  { k: 'L', label: 'L' },
  { k: 'R', label: 'R' },
  { k: 'T', label: 'T' },
  { k: 'B', label: 'B' },
];

function safeNum(v: unknown, fallback = 0) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function edgeOn(edge: BreakdownEdgeColumns, s: 'L' | 'R' | 'T' | 'B') {
  return s === 'L'
    ? edge.edgeL
    : s === 'R'
      ? edge.edgeR
      : s === 'T'
        ? edge.edgeT
        : edge.edgeB;
}

function edgeT(edge: BreakdownEdgeColumns, s: 'L' | 'R' | 'T' | 'B') {
  return s === 'L' ? edge.tL : s === 'R' ? edge.tR : s === 'T' ? edge.tT : edge.tB;
}

function edgeP(edge: BreakdownEdgeColumns, s: 'L' | 'R' | 'T' | 'B') {
  return s === 'L' ? edge.pL : s === 'R' ? edge.pR : s === 'T' ? edge.pT : edge.pB;
}

function setEdgeOn(
  edge: BreakdownEdgeColumns,
  s: 'L' | 'R' | 'T' | 'B',
  on: boolean
): BreakdownEdgeColumns {
  const next = { ...edge };
  if (s === 'L') next.edgeL = on;
  else if (s === 'R') next.edgeR = on;
  else if (s === 'T') next.edgeT = on;
  else next.edgeB = on;

  // Convention: if not edged => 0 thickness & 0 premill
  if (!on) {
    if (s === 'L') {
      next.tL = 0;
      next.pL = 0;
    } else if (s === 'R') {
      next.tR = 0;
      next.pR = 0;
    } else if (s === 'T') {
      next.tT = 0;
      next.pT = 0;
    } else {
      next.tB = 0;
      next.pB = 0;
    }
  }
  return next;
}

function setEdgeT(
  edge: BreakdownEdgeColumns,
  s: 'L' | 'R' | 'T' | 'B',
  t: number
): BreakdownEdgeColumns {
  const next = { ...edge };
  const v = Math.max(0, t);
  if (s === 'L') next.tL = v;
  else if (s === 'R') next.tR = v;
  else if (s === 'T') next.tT = v;
  else next.tB = v;
  return next;
}

function setEdgeP(
  edge: BreakdownEdgeColumns,
  s: 'L' | 'R' | 'T' | 'B',
  p: number
): BreakdownEdgeColumns {
  const next = { ...edge };
  const v = Math.max(0, p);
  if (s === 'L') next.pL = v;
  else if (s === 'R') next.pR = v;
  else if (s === 'T') next.pT = v;
  else next.pB = v;
  return next;
}

/** SPEC-08: CutW = FinishW - (EdgeL + EdgeR) + (PremillL + PremillR) */
function calcCutW(row: PartBreakdownRow) {
  const e = row.edge;
  const w = safeNum(row.finishW);
  const edgeL = e.edgeL ? safeNum(e.tL) : 0;
  const edgeR = e.edgeR ? safeNum(e.tR) : 0;
  const preL = e.edgeL ? safeNum(e.pL) : 0;
  const preR = e.edgeR ? safeNum(e.pR) : 0;
  return w - (edgeL + edgeR) + (preL + preR);
}

/** SPEC-08: CutH = FinishH - (EdgeT + EdgeB) + (PremillT + PremillB) */
function calcCutH(row: PartBreakdownRow) {
  const e = row.edge;
  const h = safeNum(row.finishH);
  const edgeTop = e.edgeT ? safeNum(e.tT) : 0;
  const edgeBot = e.edgeB ? safeNum(e.tB) : 0;
  const preT = e.edgeT ? safeNum(e.pT) : 0;
  const preB = e.edgeB ? safeNum(e.pB) : 0;
  return h - (edgeTop + edgeBot) + (preT + preB);
}

/** SPEC-08: T_real = Tcore + TsA + TsB */
function calcTReal(row: PartBreakdownRow) {
  const m = row.material;
  return (
    safeNum(m.coreThicknessMm) +
    safeNum(m.surfaceAThicknessMm) +
    safeNum(m.surfaceBThicknessMm)
  );
}

export function BreakdownTable({ readOnly }: Props) {
  const doc = useSpecStore((s) => s.doc);
  const rows = useSpecStore((s) => s.draftManufacturing.breakdownRows);
  const setRows = useSpecStore((s) => s.setBreakdownRows);
  const upsertRow = useSpecStore((s) => s.upsertBreakdownRow);

  const isReadOnly = readOnly || doc.state !== 'DRAFT';

  const onEditRow = (partId: string, patch: RowPatch) => {
    const cur = rows.find((r) => r.partId === partId);
    if (!cur) return;
    const next: PartBreakdownRow = {
      ...cur,
      ...patch,
      material: patch.material
        ? { ...cur.material, ...patch.material }
        : cur.material,
      edge: patch.edge ? { ...cur.edge, ...patch.edge } : cur.edge,
      tags: patch.tags ? [...patch.tags] : cur.tags,
    };
    upsertRow(next);
  };

  const addRow = () => {
    const id = `PART_${String(rows.length + 1).padStart(3, '0')}`;
    const newRow: PartBreakdownRow = {
      partId: id,
      name: 'New Part',
      finishW: 300,
      finishH: 300,
      material: {
        coreThicknessMm: 16,
        surfaceAThicknessMm: 0.3,
        surfaceBThicknessMm: 0.3,
      },
      edge: {
        edgeL: true,
        edgeR: true,
        edgeT: true,
        edgeB: true,
        tL: 0.8,
        tR: 0.8,
        tT: 0.8,
        tB: 0.8,
        pL: 0.5,
        pR: 0.5,
        pT: 0.5,
        pB: 0.5,
      },
      tags: [],
    };
    setRows([...rows, newRow]);
  };

  const deleteRow = (partId: string) => {
    if (isReadOnly) return;
    const next = rows.filter((r) => r.partId !== partId);
    setRows(next);
  };

  /** Export CSV Preview (DRAFT only) */
  const onExportPreview = () => {
    if (doc.state !== 'DRAFT') return;
    const csv = exportCutListCsv({
      mode: 'DRAFT_PREVIEW',
      rows,
      meta: {
        projectId: doc.projectId,
        revisionId: doc.revisionId,
        createdAtIso: new Date().toISOString(),
      },
    });
    downloadTextFile(
      `cutlist_preview_${doc.projectId}_${doc.revisionId}.csv`,
      csv
    );
  };

  return (
    <div className="border border-zinc-700 rounded-lg overflow-hidden bg-zinc-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-700 flex items-center gap-3 bg-zinc-800/50">
        <span className="font-semibold text-zinc-100">Part Breakdown (DRAFT)</span>
        <span className="text-xs text-zinc-500">
          {rows.length} rows | Live CutW/CutH | Freeze will lock into Snapshot.payload
        </span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={onExportPreview}
            disabled={isReadOnly || rows.length === 0}
            className="px-3 py-1.5 text-xs font-medium rounded bg-zinc-600 hover:bg-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            Export CSV (Preview)
          </button>
          <button
            onClick={addRow}
            disabled={isReadOnly}
            className="px-3 py-1.5 text-xs font-medium rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            + Add Row
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-zinc-800/30 text-zinc-400">
              <Th>Part ID</Th>
              <Th>Name</Th>
              <Th>FinishW</Th>
              <Th>FinishH</Th>
              <Th>Tcore</Th>
              <Th>TsA</Th>
              <Th>TsB</Th>
              <Th>T_real</Th>
              <Th>Edges (L/R/T/B)</Th>
              <Th>t (L/R/T/B)</Th>
              <Th>p (L/R/T/B)</Th>
              <Th>CutW</Th>
              <Th>CutH</Th>
              <Th>Tags</Th>
              <Th></Th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const cutW = calcCutW(r);
              const cutH = calcCutH(r);
              const tReal = calcTReal(r);
              const badCut = cutW <= 0 || cutH <= 0;

              return (
                <tr
                  key={r.partId}
                  className="border-t border-zinc-800 hover:bg-zinc-800/30 transition-colors"
                >
                  <TdMono className="text-emerald-400">{r.partId}</TdMono>

                  <Td>
                    <TextInput
                      value={r.name}
                      disabled={isReadOnly}
                      onChange={(v) => onEditRow(r.partId, { name: v })}
                    />
                  </Td>

                  <Td>
                    <NumInput
                      value={r.finishW}
                      disabled={isReadOnly}
                      onChange={(v) => onEditRow(r.partId, { finishW: v })}
                    />
                  </Td>

                  <Td>
                    <NumInput
                      value={r.finishH}
                      disabled={isReadOnly}
                      onChange={(v) => onEditRow(r.partId, { finishH: v })}
                    />
                  </Td>

                  <Td>
                    <NumInput
                      value={r.material.coreThicknessMm}
                      disabled={isReadOnly}
                      onChange={(v) =>
                        onEditRow(r.partId, { material: { coreThicknessMm: v } })
                      }
                    />
                  </Td>

                  <Td>
                    <NumInput
                      value={r.material.surfaceAThicknessMm}
                      disabled={isReadOnly}
                      onChange={(v) =>
                        onEditRow(r.partId, {
                          material: { surfaceAThicknessMm: v },
                        })
                      }
                    />
                  </Td>

                  <Td>
                    <NumInput
                      value={r.material.surfaceBThicknessMm}
                      disabled={isReadOnly}
                      onChange={(v) =>
                        onEditRow(r.partId, {
                          material: { surfaceBThicknessMm: v },
                        })
                      }
                    />
                  </Td>

                  <TdMono className="text-purple-400">{tReal.toFixed(2)}</TdMono>

                  {/* Edges enabled */}
                  <Td>
                    <div className="flex gap-2">
                      {sideLabels.map(({ k }) => (
                        <label
                          key={k}
                          className="inline-flex items-center gap-1 text-zinc-300"
                        >
                          <input
                            type="checkbox"
                            checked={edgeOn(r.edge, k)}
                            disabled={isReadOnly}
                            onChange={(e) => {
                              const nextEdge = setEdgeOn(
                                r.edge,
                                k,
                                e.target.checked
                              );
                              onEditRow(r.partId, { edge: nextEdge });
                            }}
                            className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
                          />
                          {k}
                        </label>
                      ))}
                    </div>
                  </Td>

                  {/* Edge thickness */}
                  <Td>
                    <div className="flex gap-1">
                      {sideLabels.map(({ k }) => (
                        <NumInputCompact
                          key={k}
                          value={edgeT(r.edge, k)}
                          disabled={isReadOnly || !edgeOn(r.edge, k)}
                          onChange={(v) =>
                            onEditRow(r.partId, { edge: setEdgeT(r.edge, k, v) })
                          }
                          title={`${k} thickness (mm)`}
                        />
                      ))}
                    </div>
                  </Td>

                  {/* Premill */}
                  <Td>
                    <div className="flex gap-1">
                      {sideLabels.map(({ k }) => (
                        <NumInputCompact
                          key={k}
                          value={edgeP(r.edge, k)}
                          disabled={isReadOnly || !edgeOn(r.edge, k)}
                          onChange={(v) =>
                            onEditRow(r.partId, { edge: setEdgeP(r.edge, k, v) })
                          }
                          title={`${k} premill (mm)`}
                        />
                      ))}
                    </div>
                  </Td>

                  <TdMono className={badCut ? 'text-red-400' : 'text-cyan-400'}>
                    {cutW.toFixed(2)}
                  </TdMono>
                  <TdMono className={badCut ? 'text-red-400' : 'text-cyan-400'}>
                    {cutH.toFixed(2)}
                  </TdMono>

                  <Td>
                    <TextInput
                      value={(r.tags ?? []).join(',')}
                      disabled={isReadOnly}
                      onChange={(v) =>
                        onEditRow(r.partId, {
                          tags: v
                            .split(',')
                            .map((x) => x.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="SHELF,BACK_PANEL"
                    />
                  </Td>

                  <Td className="text-right">
                    <button
                      onClick={() => deleteRow(r.partId)}
                      disabled={isReadOnly}
                      title="Delete row"
                      className="px-2 py-1 text-xs rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Delete
                    </button>
                  </Td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={15}
                  className="text-center py-8 text-zinc-500 italic"
                >
                  No parts yet. Click "Add Row" to start.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-zinc-700 flex justify-between text-[10px] text-zinc-500 bg-zinc-800/30">
        <span>
          Formula: CutW = FinishW - (EdgeL+EdgeR) + (PremillL+PremillR), CutH
          analogous
        </span>
        <span>Convention: if edge side unchecked → thickness=0 & premill=0</span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Small UI primitives (dark theme)
---------------------------------------------------------------------------- */

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left font-medium whitespace-nowrap border-b border-zinc-700">
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 align-top whitespace-nowrap ${className}`}>
      {children}
    </td>
  );
}

function TdMono({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 align-top whitespace-nowrap font-mono ${className}`}>
      {children}
    </td>
  );
}

function TextInput({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-36 px-2 py-1 rounded border border-zinc-600 bg-zinc-800 text-zinc-100 text-xs placeholder-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-emerald-500"
    />
  );
}

function NumInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      disabled={disabled}
      onChange={(e) => onChange(safeNum(e.target.value))}
      className="w-20 px-2 py-1 rounded border border-zinc-600 bg-zinc-800 text-zinc-100 text-xs disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-emerald-500"
    />
  );
}

function NumInputCompact({
  value,
  onChange,
  disabled,
  title,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <input
      title={title}
      type="number"
      value={Number.isFinite(value) ? value : 0}
      disabled={disabled}
      onChange={(e) => onChange(safeNum(e.target.value))}
      className="w-14 px-1.5 py-1 rounded border border-zinc-600 bg-zinc-800 text-zinc-100 text-xs disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-emerald-500"
    />
  );
}
