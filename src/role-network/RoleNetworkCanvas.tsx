// =============================================================================
// RoleNetworkCanvas.tsx — v18.0 Role Network View UI
// Plan gate: ENTERPRISE only (canAccessRoleNetwork)
// Sub-components: RoleNodeCard, RelationshipEdgesSvg, RoleDetailPanel
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import type { OrgPlan } from '../tenant/types';
import {
  type RnvRole,
  type RnvRoleRelationship,
  type RnvRelationshipType,
  type RnvSeniority,
  canAccessRoleNetwork,
  RNV_RELATIONSHIP_TYPE_LABEL_TH,
  RNV_SENIORITY_LABEL_TH,
} from './roleNetworkTypes';
import { useRoleNetworkStore } from './roleNetworkStore';

// ─── Layout constants ─────────────────────────────────────────────────────────

const SENIORITY_RANK: Record<RnvSeniority, number> = {
  PRINCIPAL: 0,
  LEAD: 1,
  SENIOR: 2,
  MID: 3,
  JUNIOR: 4,
};

const NODE_W = 180;
const NODE_H = 90;
const H_GAP = 40;
const V_GAP = 80;
const PADDING = 40;
const BASE_CANVAS_W = 800;

// ─── Position map ─────────────────────────────────────────────────────────────

interface NodePosition {
  x: number;
  y: number;
}

/**
 * Assigns (x, y) coordinates to every role.
 * Roles are grouped by seniority rank (PRINCIPAL → JUNIOR),
 * laid out horizontally within each row, and rows stacked vertically.
 */
function computeNodePositions(roles: RnvRole[]): Map<string, NodePosition> {
  // Build rank → roles groups, sorted by name within each rank
  const groups = new Map<number, RnvRole[]>();
  for (const role of roles) {
    const rank = SENIORITY_RANK[role.seniority] ?? 99;
    const group = groups.get(rank) ?? [];
    group.push(role);
    groups.set(rank, group);
  }

  const sortedRanks = [...groups.keys()].sort((a, b) => a - b);
  const positions = new Map<string, NodePosition>();

  let rowY = PADDING;
  for (const rank of sortedRanks) {
    const rowRoles = groups.get(rank)!;
    const totalRowWidth =
      rowRoles.length * NODE_W + (rowRoles.length - 1) * H_GAP;
    // Centre the row within the base canvas width
    let x = PADDING + Math.max(0, (BASE_CANVAS_W - totalRowWidth) / 2);
    for (const role of rowRoles) {
      positions.set(role.id, { x, y: rowY });
      x += NODE_W + H_GAP;
    }
    rowY += NODE_H + V_GAP;
  }

  return positions;
}

function computeCanvasSize(
  positions: Map<string, NodePosition>
): { width: number; height: number } {
  if (positions.size === 0) return { width: BASE_CANVAS_W, height: 400 };
  let maxX = 0;
  let maxY = 0;
  for (const { x, y } of positions.values()) {
    if (x + NODE_W > maxX) maxX = x + NODE_W;
    if (y + NODE_H > maxY) maxY = y + NODE_H;
  }
  return { width: maxX + PADDING, height: maxY + PADDING };
}

// ─── RoleNodeCard ─────────────────────────────────────────────────────────────

interface RoleNodeCardProps {
  role: RnvRole;
  position: NodePosition;
  isSelected: boolean;
  headcount: number;
  onClick: () => void;
}

function RoleNodeCard({
  role,
  position,
  isSelected,
  headcount,
  onClick,
}: RoleNodeCardProps) {
  const seniorityLabel =
    RNV_SENIORITY_LABEL_TH[role.seniority] ?? role.seniority;
  const borderColor = isSelected ? '#6366f1' : '#e5e7eb';
  const bgColor = isSelected ? '#eef2ff' : '#ffffff';
  const badgeBg = isSelected ? '#6366f1' : '#f3f4f6';
  const badgeFg = isSelected ? '#ffffff' : '#6b7280';
  const displayName =
    role.name.length > 20 ? `${role.name.slice(0, 18)}…` : role.name;

  return (
    <g
      transform={`translate(${position.x}, ${position.y})`}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
      data-testid="rnv-role-node"
      data-role-id={role.id}
      role="button"
      aria-pressed={isSelected}
      aria-label={role.name}
    >
      {/* Card background */}
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={8}
        ry={8}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={isSelected ? 2 : 1}
        filter="url(#rnv-card-shadow)"
      />

      {/* Seniority badge — top-left */}
      <g transform="translate(8, 8)">
        <rect width={74} height={20} rx={4} ry={4} fill={badgeBg} />
        <text
          x={37}
          y={14}
          textAnchor="middle"
          fontSize={10}
          fontFamily="sans-serif"
          fill={badgeFg}
          data-testid="rnv-seniority-badge"
        >
          {seniorityLabel}
        </text>
      </g>

      {/* Headcount badge — top-right */}
      <g transform={`translate(${NODE_W - 36}, 8)`}>
        <rect width={28} height={20} rx={10} ry={10} fill="#dcfce7" />
        <text
          x={14}
          y={14}
          textAnchor="middle"
          fontSize={10}
          fontFamily="sans-serif"
          fill="#16a34a"
          data-testid="rnv-headcount-badge"
        >
          {headcount}
        </text>
      </g>

      {/* Role name */}
      <text
        x={NODE_W / 2}
        y={50}
        textAnchor="middle"
        fontSize={12}
        fontWeight="600"
        fontFamily="sans-serif"
        fill="#111827"
      >
        {displayName}
      </text>

      {/* Relationship count — bottom centre */}
      {role.relationship_count > 0 && (
        <text
          x={NODE_W / 2}
          y={NODE_H - 10}
          textAnchor="middle"
          fontSize={10}
          fontFamily="sans-serif"
          fill="#9ca3af"
        >
          {role.relationship_count} ความสัมพันธ์
        </text>
      )}
    </g>
  );
}

// ─── RelationshipEdgesSvg ─────────────────────────────────────────────────────

interface RelationshipEdgesSvgProps {
  relationships: RnvRoleRelationship[];
  positions: Map<string, NodePosition>;
}

function RelationshipEdgesSvg({
  relationships,
  positions,
}: RelationshipEdgesSvgProps) {
  const MARKER_ID = 'rnv-arrow';

  return (
    <g data-testid="rnv-edges-svg">
      <defs>
        <marker
          id={MARKER_ID}
          markerWidth={10}
          markerHeight={7}
          refX={9}
          refY={3.5}
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#9ca3af" />
        </marker>
      </defs>

      {relationships.map(rel => {
        const fromPos = positions.get(rel.from_role_id);
        const toPos = positions.get(rel.to_role_id);
        if (!fromPos || !toPos) return null;

        // Connect centre-right of from-node → centre-left of to-node
        // For same-row nodes, use a curved path via the bottom
        const x1 = fromPos.x + NODE_W;
        const y1 = fromPos.y + NODE_H / 2;
        const x2 = toPos.x;
        const y2 = toPos.y + NODE_H / 2;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        const label =
          RNV_RELATIONSHIP_TYPE_LABEL_TH[rel.relationship_type] ??
          rel.relationship_type;

        return (
          <g key={rel.id}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#9ca3af"
              strokeWidth={1.5}
              strokeDasharray={
                rel.relationship_type === 'DEPENDS_ON' ? '4 3' : undefined
              }
              markerEnd={`url(#${MARKER_ID})`}
            />
            {/* Thai mid-line label */}
            <rect
              x={midX - 38}
              y={midY - 10}
              width={76}
              height={18}
              rx={4}
              fill="#ffffff"
              stroke="#e5e7eb"
              strokeWidth={1}
            />
            <text
              x={midX}
              y={midY + 4}
              textAnchor="middle"
              fontSize={9}
              fontFamily="sans-serif"
              fill="#6b7280"
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ─── RoleDetailPanel ──────────────────────────────────────────────────────────

interface RoleDetailPanelProps {
  role: RnvRole;
  allRoles: RnvRole[];
  orgId: string;
  orgPlan: OrgPlan;
  isAdmin: boolean;
  onClose: () => void;
}

function RoleDetailPanel({
  role,
  allRoles,
  orgId,
  orgPlan,
  isAdmin,
  onClose,
}: RoleDetailPanelProps) {
  const { addRelationship, removeRelationship, isRelationshipLoading } =
    useRoleNetworkStore();

  const [targetRoleId, setTargetRoleId] = useState('');
  const [relType, setRelType] = useState<RnvRelationshipType>(
    Object.keys(RNV_RELATIONSHIP_TYPE_LABEL_TH)[0] as RnvRelationshipType
  );

  const otherRoles = allRoles.filter(r => r.id !== role.id);
  const headcount = role.employeeRoles.length;

  const handleAdd = async () => {
    if (!targetRoleId) return;
    await addRelationship(orgId, orgPlan, {
      from_role_id: role.id,
      to_role_id: targetRoleId,
      relationship_type: relType,
    });
    setTargetRoleId('');
  };

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 280,
    height: '100%',
    background: '#ffffff',
    color: '#111827',
    borderLeft: '1px solid #e5e7eb',
    padding: 16,
    overflowY: 'auto',
    zIndex: 10,
    boxSizing: 'border-box',
  };

  return (
    <aside data-testid="rnv-role-detail-panel" style={panelStyle}>
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 12,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
            {role.name}
          </h3>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            {RNV_SENIORITY_LABEL_TH[role.seniority]} · {headcount} คน
          </span>
        </div>
        <button
          data-testid="rnv-close-detail-btn"
          onClick={onClose}
          aria-label="ปิดแผง"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 20,
            lineHeight: 1,
            color: '#9ca3af',
            padding: '0 4px',
          }}
        >
          ×
        </button>
      </div>

      {/* ── Description ── */}
      {role.description && (
        <p style={{ fontSize: 12, color: '#374151', marginBottom: 12 }}>
          {role.description}
        </p>
      )}

      {/* ── Relationship list ── */}
      <h4
        style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px 0' }}
      >
        ความสัมพันธ์ ({role.relationships.length})
      </h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px 0' }}>
        {role.relationships.map(rel => {
          const isFrom = rel.from_role_id === role.id;
          const otherId = isFrom ? rel.to_role_id : rel.from_role_id;
          const otherRole = allRoles.find(r => r.id === otherId);
          const label =
            RNV_RELATIONSHIP_TYPE_LABEL_TH[rel.relationship_type] ??
            rel.relationship_type;

          return (
            <li
              key={rel.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 0',
                borderBottom: '1px solid #f3f4f6',
                fontSize: 12,
              }}
            >
              <span>
                <span style={{ color: '#6366f1', fontWeight: 600 }}>
                  {label}
                </span>
                {' → '}
                {otherRole?.name ?? otherId}
              </span>
              {isAdmin && (
                <button
                  data-testid="rnv-remove-relationship-btn"
                  onClick={() =>
                    removeRelationship(orgId, orgPlan, rel.id)
                  }
                  disabled={isRelationshipLoading}
                  aria-label={`ลบความสัมพันธ์ ${label}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: isRelationshipLoading
                      ? 'not-allowed'
                      : 'pointer',
                    color: '#ef4444',
                    fontSize: 18,
                    lineHeight: 1,
                    padding: '0 4px',
                    opacity: isRelationshipLoading ? 0.5 : 1,
                  }}
                >
                  −
                </button>
              )}
            </li>
          );
        })}
        {role.relationships.length === 0 && (
          <li style={{ fontSize: 12, color: '#9ca3af', padding: '4px 0' }}>
            ยังไม่มีความสัมพันธ์
          </li>
        )}
      </ul>

      {/* ── Add relationship (admin only) ── */}
      {isAdmin && (
        <div>
          <h4 style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px 0' }}>
            เพิ่มความสัมพันธ์
          </h4>

          {/* Target role selector */}
          <select
            value={targetRoleId}
            onChange={e => setTargetRoleId(e.target.value)}
            aria-label="เลือกตำแหน่งปลายทาง"
            style={{
              background: '#ffffff',
              color: '#111827',
              colorScheme: 'light',
              width: '100%',
              marginBottom: 8,
              padding: '4px 8px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid #d1d5db',
            }}
          >
            <option value="">— เลือกตำแหน่ง —</option>
            {otherRoles.map(r => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          {/* Relationship type selector */}
          <select
            value={relType}
            onChange={e => setRelType(e.target.value as RnvRelationshipType)}
            aria-label="เลือกประเภทความสัมพันธ์"
            style={{
              background: '#ffffff',
              color: '#111827',
              colorScheme: 'light',
              width: '100%',
              marginBottom: 8,
              padding: '4px 8px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid #d1d5db',
            }}
          >
            {(
              Object.entries(
                RNV_RELATIONSHIP_TYPE_LABEL_TH
              ) as [RnvRelationshipType, string][]
            ).map(([key, lbl]) => (
              <option key={key} value={key}>
                {lbl}
              </option>
            ))}
          </select>

          {/* Add button — disabled when no target or loading */}
          <button
            data-testid="rnv-add-relationship-btn"
            onClick={handleAdd}
            disabled={!targetRoleId || isRelationshipLoading}
            style={{
              width: '100%',
              padding: '6px 0',
              fontSize: 12,
              fontWeight: 600,
              background:
                !targetRoleId || isRelationshipLoading
                  ? '#e5e7eb'
                  : '#6366f1',
              color:
                !targetRoleId || isRelationshipLoading
                  ? '#9ca3af'
                  : '#ffffff',
              border: 'none',
              borderRadius: 4,
              cursor:
                !targetRoleId || isRelationshipLoading
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {isRelationshipLoading ? 'กำลังบันทึก…' : '+ เพิ่มความสัมพันธ์'}
          </button>
        </div>
      )}
    </aside>
  );
}

// ─── RoleNetworkCanvas ────────────────────────────────────────────────────────

export interface RoleNetworkCanvasProps {
  orgId: string;
  orgPlan: OrgPlan;
  isAdmin?: boolean;
}

export function RoleNetworkCanvas({
  orgId,
  orgPlan,
  isAdmin = false,
}: RoleNetworkCanvasProps) {
  // ── All hooks at the top — Rules of Hooks ─────────────────────────────────
  const {
    roles,
    relationships,
    employeeRoles,
    selectedRoleId,
    isLoading,
    error,
    fetchNetwork,
    selectRole,
  } = useRoleNetworkStore();

  const isGated = !canAccessRoleNetwork(orgPlan);

  useEffect(() => {
    if (isGated) return;
    fetchNetwork(orgId, orgPlan);
  }, [orgId, orgPlan, isGated]);

  const positions = useMemo(() => computeNodePositions(roles), [roles]);
  const { width, height } = useMemo(
    () => computeCanvasSize(positions),
    [positions]
  );

  const selectedRole =
    selectedRoleId !== null
      ? (roles.find(r => r.id === selectedRoleId) ?? null)
      : null;

  // ── Plan gate wall ─────────────────────────────────────────────────────────
  if (isGated) {
    return (
      <div
        data-testid="rnv-plan-gate-wall"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 400,
          gap: 12,
          background: '#f9fafb',
          borderRadius: 8,
          border: '1px dashed #d1d5db',
        }}
      >
        <svg
          width={48}
          height={48}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x={3}
            y={11}
            width={18}
            height={11}
            rx={2}
            stroke="#9ca3af"
            strokeWidth={1.5}
          />
          <path
            d="M7 11V7a5 5 0 0110 0v4"
            stroke="#9ca3af"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </svg>
        <p
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#374151',
            margin: 0,
          }}
        >
          ต้องการแผน ENTERPRISE
        </p>
        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
          Role Network View สำหรับแผน ENTERPRISE เท่านั้น
        </p>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
          แผนปัจจุบัน: {orgPlan}
        </p>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        data-testid="rnv-loading"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 400,
          fontSize: 14,
          color: '#6b7280',
        }}
      >
        กำลังโหลด Role Network…
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div
        data-testid="rnv-error"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 400,
          gap: 8,
        }}
      >
        <p
          style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#ef4444' }}
        >
          เกิดข้อผิดพลาด
        </p>
        <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>{error}</p>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (roles.length === 0) {
    return (
      <div
        data-testid="rnv-empty"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 400,
          gap: 8,
          background: '#f9fafb',
          borderRadius: 8,
          border: '1px dashed #d1d5db',
        }}
      >
        <p
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#374151',
            margin: 0,
          }}
        >
          ยังไม่มีตำแหน่งงาน
        </p>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
          เพิ่มตำแหน่งงานเพื่อเริ่มสร้าง Role Network
        </p>
      </div>
    );
  }

  // ── Canvas ─────────────────────────────────────────────────────────────────
  return (
    <div
      data-testid="rnv-canvas"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        borderRadius: 8,
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        minHeight: 400,
      }}
    >
      {/* Scrollable canvas area — shrinks when detail panel is open */}
      <div
        data-testid="rnv-canvas-area"
        style={{
          overflowX: 'auto',
          overflowY: 'auto',
          flex: 1,
          marginRight: selectedRole ? 280 : 0,
          transition: 'margin-right 150ms ease',
        }}
      >
        <svg
          width={width}
          height={height}
          style={{ display: 'block' }}
          role="img"
          aria-label="Role Network Diagram"
        >
          <defs>
            {/* Drop-shadow for node cards */}
            <filter
              id="rnv-card-shadow"
              x="-5%"
              y="-5%"
              width="110%"
              height="110%"
            >
              <feDropShadow
                dx={0}
                dy={1}
                stdDeviation={2}
                floodColor="#00000018"
              />
            </filter>
          </defs>

          {/* Edges rendered behind nodes */}
          <RelationshipEdgesSvg
            relationships={relationships}
            positions={positions}
          />

          {/* Role nodes */}
          {roles.map(role => {
            const pos = positions.get(role.id);
            if (!pos) return null;
            const headcount = employeeRoles.filter(
              er => er.role_id === role.id
            ).length;
            return (
              <RoleNodeCard
                key={role.id}
                role={role}
                position={pos}
                isSelected={role.id === selectedRoleId}
                headcount={headcount}
                onClick={() =>
                  selectRole(role.id === selectedRoleId ? null : role.id)
                }
              />
            );
          })}
        </svg>
      </div>

      {/* Role detail panel — slides in when a node is selected */}
      {selectedRole && (
        <RoleDetailPanel
          role={selectedRole}
          allRoles={roles}
          orgId={orgId}
          orgPlan={orgPlan}
          isAdmin={isAdmin}
          onClose={() => selectRole(null)}
        />
      )}
    </div>
  );
}

export default RoleNetworkCanvas;
