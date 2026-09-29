// =============================================================================
// OrgChartCanvas.tsx — v18.0 Interactive OrgChart UI
// Plan gate: PROFESSIONAL+ (canAccessOrgChart)
// Sub-components: NodeCard, ReportingLinesSvg, NodeDetailPanel
// =============================================================================

import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { OrgPlan } from '../tenant/types';
import type { OcNode, OcReportingLine } from './orgChartTypes';
import {
  canAccessOrgChart,
  OC_NODE_TYPE_LABEL_TH,
  OC_LINE_TYPE_LABEL_TH,
} from './orgChartTypes';
import { useOrgChartStore } from './orgChartStore';

// ─── Props ────────────────────────────────────────────────────────────────────

interface OrgChartCanvasProps {
  orgId: string;
  orgPlan: OrgPlan;
  isAdmin?: boolean;
}

// ─── DragState (ref, not React state — avoids re-renders during drag) ─────────

interface DragState {
  nodeId: string;
  startPointerX: number;
  startPointerY: number;
  startNodeX: number;
  startNodeY: number;
  el: HTMLElement;
}

// ─── NodeCard ─────────────────────────────────────────────────────────────────

interface NodeCardProps {
  node: OcNode;
  isSelected: boolean;
  isAdmin: boolean;
  onSelect: (id: string) => void;
  onDragStart: (nodeId: string, e: React.PointerEvent<HTMLElement>) => void;
  onDeleteClick: (nodeId: string) => void;
}

const NodeCard: React.FC<NodeCardProps> = ({
  node,
  isSelected,
  isAdmin,
  onSelect,
  onDragStart,
  onDeleteClick,
}) => (
  <div
    data-testid="orgchart-node"
    data-node-id={node.id}
    style={{
      position: 'absolute',
      left: node.position_x,
      top: node.position_y,
      width: 160,
      background: isSelected ? '#dbeafe' : '#ffffff',
      border: isSelected ? '2px solid #3b82f6' : '1px solid #e5e7eb',
      borderRadius: 8,
      padding: '8px 10px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
      cursor: 'pointer',
      userSelect: 'none',
    }}
    onClick={() => onSelect(node.id)}
  >
    {/* Drag handle */}
    <div
      data-testid="node-drag-handle"
      style={{
        width: '100%',
        height: 12,
        cursor: 'grab',
        marginBottom: 4,
        display: 'flex',
        alignItems: 'center',
      }}
      onPointerDown={e => {
        e.stopPropagation();
        onDragStart(node.id, e);
      }}
    >
      <span style={{ fontSize: 10, color: '#9ca3af', letterSpacing: 2 }}>⠿⠿⠿</span>
    </div>

    <div style={{ fontWeight: 600, fontSize: 13, color: '#111827', lineHeight: 1.3 }}>
      {node.title}
    </div>
    {node.department && (
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{node.department}</div>
    )}
    <div
      style={{
        marginTop: 4,
        fontSize: 10,
        color: '#9ca3af',
        background: '#f3f4f6',
        borderRadius: 4,
        padding: '1px 5px',
        display: 'inline-block',
      }}
    >
      {OC_NODE_TYPE_LABEL_TH[node.node_type]}
    </div>

    {isAdmin && (
      <button
        data-testid="node-delete-btn"
        style={{
          position: 'absolute',
          top: 4,
          right: 6,
          background: 'none',
          border: 'none',
          color: '#ef4444',
          cursor: 'pointer',
          fontSize: 12,
          lineHeight: 1,
          padding: 2,
        }}
        onClick={e => {
          e.stopPropagation();
          onDeleteClick(node.id);
        }}
        aria-label={`Delete ${node.title}`}
      >
        ✕
      </button>
    )}
  </div>
);

// ─── ReportingLinesSvg ────────────────────────────────────────────────────────

interface ReportingLinesSvgProps {
  flatNodes: OcNode[];
  reportingLines: OcReportingLine[];
  showReportingLines: boolean;
  width: number;
  height: number;
}

const ReportingLinesSvg: React.FC<ReportingLinesSvgProps> = ({
  flatNodes,
  reportingLines,
  showReportingLines,
  width,
  height,
}) => {
  const nodePos = new Map<string, { x: number; y: number }>();
  for (const n of flatNodes) {
    nodePos.set(n.id, { x: n.position_x + 80, y: n.position_y + 30 });
  }

  return (
    <svg
      data-testid="orgchart-lines-svg"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
      width={width}
      height={height}
    >
      {/* Tree lines — parent → child */}
      {flatNodes
        .filter(n => n.parent_id !== null && nodePos.has(n.parent_id!))
        .map(n => {
          const from = nodePos.get(n.parent_id!)!;
          const to = nodePos.get(n.id)!;
          return (
            <line
              key={`tree-${n.id}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
          );
        })}

      {/* Explicit reporting lines (matrix / dotted) */}
      {showReportingLines &&
        reportingLines.map(line => {
          const from = nodePos.get(line.from_node_id);
          const to = nodePos.get(line.to_node_id);
          if (!from || !to) return null;
          return (
            <line
              key={`rl-${line.id}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray={line.line_type === 'DOTTED' ? '5,4' : undefined}
            />
          );
        })}
    </svg>
  );
};

// ─── NodeDetailPanel ──────────────────────────────────────────────────────────

interface NodeDetailPanelProps {
  node: OcNode;
  orgId: string;
  orgPlan: OrgPlan;
  isAdmin: boolean;
  allNodes: OcNode[];
  reportingLines: OcReportingLine[];
  onClose: () => void;
}

const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({
  node,
  orgId,
  orgPlan,
  isAdmin,
  allNodes,
  reportingLines,
  onClose,
}) => {
  const { updateNode, addReportingLine, removeReportingLine, deleteNode } =
    useOrgChartStore();

  const [editTitle, setEditTitle] = useState(node.title);
  const [isEditing, setIsEditing] = useState(false);
  const [connectTarget, setConnectTarget] = useState('');
  const [connectLineType, setConnectLineType] = useState<'SOLID' | 'DOTTED'>('DOTTED');

  // Sync editTitle when selected node changes
  useEffect(() => {
    setEditTitle(node.title);
    setIsEditing(false);
    setConnectTarget('');
  }, [node.id, node.title]);

  const nodeLines = reportingLines.filter(
    l => l.from_node_id === node.id || l.to_node_id === node.id
  );

  const handleSaveTitle = async () => {
    if (editTitle.trim() && editTitle.trim() !== node.title) {
      await updateNode(orgId, orgPlan, node.id, { title: editTitle.trim() });
    }
    setIsEditing(false);
  };

  const handleAddLine = async () => {
    if (!connectTarget) return;
    await addReportingLine(orgId, orgPlan, {
      from_node_id: node.id,
      to_node_id: connectTarget,
      line_type: connectLineType,
    });
    setConnectTarget('');
  };

  // Toggle line type: remove existing, re-add with opposite type
  const handleToggleLineType = async (line: OcReportingLine) => {
    const newType: 'SOLID' | 'DOTTED' = line.line_type === 'SOLID' ? 'DOTTED' : 'SOLID';
    await removeReportingLine(orgId, orgPlan, line.id);
    await addReportingLine(orgId, orgPlan, {
      from_node_id: line.from_node_id,
      to_node_id: line.to_node_id,
      line_type: newType,
    });
  };

  const handleDelete = async () => {
    await deleteNode(orgId, orgPlan, node.id);
    onClose();
  };

  return (
    <div
      data-testid="node-detail-panel"
      style={{
        width: 280,
        flexShrink: 0,
        background: '#ffffff',
        borderLeft: '1px solid #e5e7eb',
        padding: 16,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <strong style={{ fontSize: 14, color: '#111827' }}>ข้อมูลโหนด</strong>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: '#6b7280',
          }}
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      {/* Title edit */}
      <div style={{ marginBottom: 12 }}>
        <label
          style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}
        >
          ชื่อ
        </label>
        {isEditing ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              style={{
                flex: 1,
                fontSize: 13,
                border: '1px solid #d1d5db',
                borderRadius: 4,
                padding: '4px 8px',
              }}
            />
            <button
              onClick={handleSaveTitle}
              style={{
                fontSize: 12,
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '4px 10px',
                cursor: 'pointer',
              }}
            >
              บันทึก
            </button>
          </div>
        ) : (
          <div
            style={{
              fontSize: 13,
              color: '#111827',
              cursor: isAdmin ? 'pointer' : 'default',
            }}
            onClick={() => isAdmin && setIsEditing(true)}
          >
            {node.title}
            {isAdmin && (
              <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>
                (แก้ไข)
              </span>
            )}
          </div>
        )}
      </div>

      {node.department && (
        <div style={{ marginBottom: 8, fontSize: 12, color: '#374151' }}>
          <strong>แผนก:</strong> {node.department}
        </div>
      )}
      <div style={{ marginBottom: 12, fontSize: 12, color: '#374151' }}>
        <strong>ประเภท:</strong> {OC_NODE_TYPE_LABEL_TH[node.node_type]}
      </div>

      {/* Existing reporting lines */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}
        >
          สายรายงาน
        </div>
        {nodeLines.length === 0 && (
          <div style={{ fontSize: 11, color: '#9ca3af' }}>ไม่มีสายรายงาน</div>
        )}
        {nodeLines.map(line => {
          const peerId =
            line.from_node_id === node.id ? line.to_node_id : line.from_node_id;
          const peer = allNodes.find(n => n.id === peerId);
          return (
            <div
              key={line.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 11,
                color: '#374151',
                marginBottom: 4,
                padding: '3px 6px',
                background: '#f9fafb',
                borderRadius: 4,
              }}
            >
              <span>
                {peer?.title ?? peerId} — {OC_LINE_TYPE_LABEL_TH[line.line_type]}
              </span>
              {isAdmin && (
                <button
                  data-testid="reporting-line-toggle"
                  onClick={() => handleToggleLineType(line)}
                  style={{
                    fontSize: 10,
                    background: 'none',
                    border: '1px solid #d1d5db',
                    borderRadius: 3,
                    cursor: 'pointer',
                    padding: '2px 6px',
                    color: '#6b7280',
                  }}
                >
                  สลับประเภท
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add reporting line */}
      {isAdmin && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}
          >
            เพิ่มสายรายงาน
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <select
              value={connectTarget}
              onChange={e => setConnectTarget(e.target.value)}
              style={{
                flex: 1,
                fontSize: 11,
                border: '1px solid #d1d5db',
                borderRadius: 4,
                padding: '3px 6px',
              }}
            >
              <option value="">เลือกโหนด…</option>
              {allNodes
                .filter(n => n.id !== node.id)
                .map(n => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
            </select>
            <select
              value={connectLineType}
              onChange={e =>
                setConnectLineType(e.target.value as 'SOLID' | 'DOTTED')
              }
              style={{
                fontSize: 11,
                border: '1px solid #d1d5db',
                borderRadius: 4,
                padding: '3px 4px',
              }}
            >
              <option value="SOLID">หลัก</option>
              <option value="DOTTED">เสริม</option>
            </select>
          </div>
          <button
            data-testid="node-add-line-btn"
            onClick={handleAddLine}
            disabled={!connectTarget}
            style={{
              fontSize: 12,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '5px 14px',
              cursor: connectTarget ? 'pointer' : 'not-allowed',
              opacity: connectTarget ? 1 : 0.5,
            }}
          >
            เพิ่มสาย
          </button>
        </div>
      )}

      {/* Delete node */}
      {isAdmin && (
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 4 }}>
          <button
            onClick={handleDelete}
            style={{
              fontSize: 12,
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '5px 14px',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            ลบโหนด
          </button>
        </div>
      )}
    </div>
  );
};

// ─── OrgChartCanvas (main export) ─────────────────────────────────────────────

const OrgChartCanvas: React.FC<OrgChartCanvasProps> = ({
  orgId,
  orgPlan,
  isAdmin = false,
}) => {
  const {
    flatNodes,
    reportingLines,
    selectedNodeId,
    isLoading,
    error,
    selectNode,
    moveNode,
    deleteNode,
    setDragging,
    clearError,
  } = useOrgChartStore();

  const [showReportingLines, setShowReportingLines] = useState(true);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  /** dragState is a ref — mutations never trigger re-renders during drag */
  const dragState = useRef<DragState | null>(null);

  useEffect(() => {
    useOrgChartStore.getState().fetchChart(orgId, orgPlan);
  }, [orgId, orgPlan]);

  // ── Plan gate ───────────────────────────────────────────────────────────────
  if (!canAccessOrgChart(orgPlan)) {
    return (
      <div
        data-testid="plan-gate-wall"
        style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}
      >
        <div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>
          ฟีเจอร์นี้ต้องการแผน PROFESSIONAL ขึ้นไป
        </div>
        <div style={{ fontSize: 13 }}>
          กรุณาอัปเกรดเพื่อใช้งาน Interactive OrgChart
        </div>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        data-testid="orgchart-loading"
        style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}
      >
        กำลังโหลด…
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div data-testid="orgchart-error" style={{ padding: 20, color: '#ef4444' }}>
        <strong>เกิดข้อผิดพลาด:</strong> {error}
        <button
          onClick={clearError}
          style={{
            marginLeft: 12,
            fontSize: 12,
            background: 'none',
            border: '1px solid #ef4444',
            color: '#ef4444',
            borderRadius: 4,
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          ล้างข้อผิดพลาด
        </button>
      </div>
    );
  }

  // ── Empty ───────────────────────────────────────────────────────────────────
  if (flatNodes.length === 0) {
    return (
      <div
        data-testid="orgchart-empty"
        style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}
      >
        ยังไม่มีโหนดในแผนผัง
      </div>
    );
  }

  // ── Drag handlers ───────────────────────────────────────────────────────────

  const handleDragStart = (nodeId: string, e: React.PointerEvent<HTMLElement>) => {
    const node = flatNodes.find(n => n.id === nodeId);
    if (!node || !canvasAreaRef.current) return;

    const nodeEl = canvasAreaRef.current.querySelector<HTMLElement>(
      `[data-node-id="${nodeId}"]`
    );
    if (!nodeEl) return;

    dragState.current = {
      nodeId,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startNodeX: node.position_x,
      startNodeY: node.position_y,
      el: nodeEl,
    };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragState.current;
    if (!ds) return;
    const dx = e.clientX - ds.startPointerX;
    const dy = e.clientY - ds.startPointerY;
    // Direct DOM update — no React re-render on every mousemove
    ds.el.style.left = `${ds.startNodeX + dx}px`;
    ds.el.style.top = `${ds.startNodeY + dy}px`;
  };

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const ds = dragState.current;
      if (!ds) return;

      const dx = e.clientX - ds.startPointerX;
      const dy = e.clientY - ds.startPointerY;
      dragState.current = null;
      setDragging(false);

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        const node = flatNodes.find(n => n.id === ds.nodeId);
        moveNode(orgId, orgPlan, {
          nodeId: ds.nodeId,
          parentId: node?.parent_id ?? null,
          position_x: Math.round(ds.startNodeX + dx),
          position_y: Math.round(ds.startNodeY + dy),
        });
      }
    },
    [flatNodes, moveNode, orgId, orgPlan, setDragging]
  );

  // ── Derived ─────────────────────────────────────────────────────────────────
  const selectedNode = flatNodes.find(n => n.id === selectedNodeId) ?? null;

  const canvasW = Math.max(800, ...flatNodes.map(n => n.position_x + 200));
  const canvasH = Math.max(600, ...flatNodes.map(n => n.position_y + 120));

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      data-testid="orgchart-canvas"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#f8fafc',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#ffffff',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: '#111827', flex: 1 }}>
          แผนผังองค์กร
        </span>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: '#374151',
            cursor: 'pointer',
          }}
        >
          <input
            data-testid="reporting-line-toggle"
            type="checkbox"
            checked={showReportingLines}
            onChange={e => setShowReportingLines(e.target.checked)}
          />
          แสดงสายรายงาน matrix
        </label>
      </div>

      {/* Canvas row + detail panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Scrollable canvas area */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div
            data-testid="orgchart-canvas-area"
            ref={canvasAreaRef}
            style={{ position: 'relative', width: canvasW, height: canvasH }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <ReportingLinesSvg
              flatNodes={flatNodes}
              reportingLines={reportingLines}
              showReportingLines={showReportingLines}
              width={canvasW}
              height={canvasH}
            />

            {flatNodes.map(node => (
              <NodeCard
                key={node.id}
                node={node}
                isSelected={node.id === selectedNodeId}
                isAdmin={isAdmin}
                onSelect={selectNode}
                onDragStart={handleDragStart}
                onDeleteClick={nodeId => deleteNode(orgId, orgPlan, nodeId)}
              />
            ))}
          </div>
        </div>

        {/* Node detail panel */}
        {selectedNode !== null && (
          <NodeDetailPanel
            node={selectedNode}
            orgId={orgId}
            orgPlan={orgPlan}
            isAdmin={isAdmin}
            allNodes={flatNodes}
            reportingLines={reportingLines}
            onClose={() => selectNode(null)}
          />
        )}
      </div>
    </div>
  );
};

export default OrgChartCanvas;
