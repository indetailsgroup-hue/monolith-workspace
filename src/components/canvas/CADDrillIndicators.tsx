/**
 * CADDrillIndicators.tsx - CAD-Style Drill Point Annotations
 *
 * Renders 2D CAD-style indicators for drill points:
 * - Center crosshairs (+) at drill locations
 * - Circle outlines showing drill diameter
 * - Diameter callouts (Ø15, Ø10, Ø5, etc.)
 * - Depth annotations
 *
 * Uses Three.js Line and Circle primitives for crisp 2D rendering.
 *
 * @version 1.0.0
 */

import React, { useMemo, useCallback } from 'react';
import { Line, Circle, Html, Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import type {
  DrillMap,
  DrillMapPoint,
  DrillPurpose,
  Vec3Tuple,
} from '../../core/manufacturing/drillMap/types';
import { useConnectorVisibilityStore } from '../ui/ConnectorList';

// ============================================
// CONSTANTS
// ============================================

/** CAD line colors by drill purpose */
const CAD_COLORS: Record<DrillPurpose, string> = {
  CAM_LOCK: '#fbbf24',     // Amber - cam housing (Ø15)
  BOLT: '#60a5fa',         // Blue - bolt/sleeve (??10)
  BOLT_ENTRY: '#06b6d4',   // Cyan - hidden in merged display (debug only)
  BOLT_THREAD: '#c4b5fd',  // Light purple - thread pilot (??5)
  DOWEL: '#a78bfa',        // Purple - dowel (Ø8)
  SHELF_PIN: '#4ade80',    // Green - shelf pin (Ø5)
  HINGE: '#f87171',        // Red - hinge cup (Ø35)
  MINIFIX: '#fbbf24',      // Amber - minifix (same as CAM_LOCK)
  DRAWER_SLIDE: '#22d3ee', // Cyan - drawer slide (Ø5)
  OTHER: '#9ca3af',        // Gray - other
};

/** Crosshair arm length as ratio of diameter */
const CROSSHAIR_RATIO = 0.7;

/** Circle segments for smooth appearance */
const CIRCLE_SEGMENTS = 32;

/** Offset to render indicators at panel surface (0 = flush with surface) */
const SURFACE_OFFSET = 0; // mm - flush with panel face

// ============================================
// PROFESSIONAL ANNOTATION STYLE (ISO 128-22)
// ============================================

/** Base vertical distance from bore center to first label (mm) */
const PRO_BASE_OFFSET = 30;
/** Vertical spacing between stacked labels in the same corner group (mm) */
const PRO_STACK_SPACING = 22;
/** Horizontal reference line (shelf) length (mm) */
const PRO_SHELF_LENGTH = 24;
/** Diagonal angle ratio: tan(11°) ≈ 0.194 → 79° from horizontal */
const PRO_DIAG_RATIO = 0.194;

/**
 * Bore-type color coding (ISO convention):
 *   Face bore = Blue (#4488ff) — drills into panel face
 *   Edge bore = Green (#22cc44) — drills into panel edge
 *   Through/Dowel = Red (#ff5555) — drills through
 */
const BORE_COLOR: Record<string, string> = {
  CAM_LOCK: '#4488ff',     // Face → Blue
  MINIFIX: '#4488ff',      // Face → Blue
  BOLT_ENTRY: '#22cc44',   // Edge → Green
  BOLT_THREAD: '#4488ff',  // Face → Blue
  BOLT: '#22cc44',         // Edge → Green
  DOWEL: '#ff5555',        // Through → Red
  SHELF_PIN: '#44ddcc',    // Shelf → Teal
  HINGE: '#ff8844',        // Hinge → Orange
  DRAWER_SLIDE: '#44ddcc', // Drawer → Teal
  OTHER: '#9ca3af',        // Gray
};

/** Shorten full hardware name to compact display (max ~8 chars) */
function shortenHwName(name: string): string {
  if (/minifix/i.test(name)) return 'Minifix';
  if (/S200/i.test(name)) return 'S200';
  if (/connecting\s*bolt/i.test(name)) return 'Bolt';
  if (/dowel/i.test(name)) return 'Dowel';
  if (/cam/i.test(name)) return 'Cam';
  if (/hinge/i.test(name)) return 'Hinge';
  if (/shelf\s*pin/i.test(name)) return 'Pin';
  if (/drawer/i.test(name)) return 'Slide';
  // Fallback: first word, max 8 chars
  return name.split(/[\s(®]/)[0].slice(0, 8);
}

/** Map drill purpose → single-letter glyph (matching CSGDrillOverlay style) */
const PURPOSE_GLYPH: Record<string, string> = {
  CAM_LOCK: 'Cam',
  MINIFIX: 'Cam',
  BOLT_ENTRY: 'B',
  BOLT: 'B',
  BOLT_THREAD: 'L',
  DOWEL: 'D',
  SHELF_PIN: 'S',
  HINGE: 'H',
  DRAWER_SLIDE: 'DS',
  OTHER: '?',
};

// ============================================
// TYPES
// ============================================

interface CADDrillIndicatorsProps {
  drillMap: DrillMap | null;
  visible: boolean;
  /** Show diameter callouts */
  showDiameter?: boolean;
  /** Show depth callouts */
  showDepth?: boolean;
  /** Show center crosshairs */
  showCrosshairs?: boolean;
  /** Line width for indicators */
  lineWidth?: number;
  /** Filter by purpose (show only specific types) */
  filterPurpose?: DrillPurpose[];
  /** Selected drill point ID for highlighting */
  selectedId?: string | null;
  /** Callback when clicking a drill point */
  onPointClick?: (point: DrillMapPoint) => void;
  /** Set of panel IDs that are hidden — drill points from these panels will be filtered out */
  hiddenPanelIds?: Set<string>;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get rotation quaternion to align indicator with drill normal
 */
function getOrientationFromNormal(normal: Vec3Tuple): THREE.Euler {
  const up = new THREE.Vector3(0, 0, 1); // Default indicator faces +Z
  const normalVec = new THREE.Vector3(...normal).normalize();

  // Calculate rotation to align Z-up with the normal direction
  const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normalVec);
  return new THREE.Euler().setFromQuaternion(quaternion);
}

/**
 * Get offset position along normal for surface rendering.
 * Offset is AWAY from the material (opposite to drill direction)
 * so indicators render above the surface and avoid z-fighting.
 *
 * Example for LEFT panel BOLT:
 * - position = inner face (maxX)
 * - normal = [-1, 0, 0] (drilling INTO material, toward -X)
 * - offset AWAY from material = +X direction = -normal
 * - result: position - normal * offset = maxX - (-1) * 0.5 = maxX + 0.5
 */
function getOffsetPosition(position: Vec3Tuple, normal: Vec3Tuple, offset: number): Vec3Tuple {
  return [
    position[0] - normal[0] * offset,
    position[1] - normal[1] * offset,
    position[2] - normal[2] * offset,
  ];
}

// ============================================
// LABEL DEDUP — Cross-panel merge (v4.4)
// ============================================
// When multiple drill points from different panels land at the same
// world position (e.g. BOLT on side + BOLT_THREAD on side after
// display normalization), we show only ONE label per (position, diameter).
// Circle/crosshair still renders for every point; only labels merge.

const LABEL_SNAP = 1; // mm tolerance for position grouping

function snapV(v: number): number {
  return Math.round(v / LABEL_SNAP) * LABEL_SNAP;
}

function labelPosKey(pos: Vec3Tuple): string {
  return `${snapV(pos[0])},${snapV(pos[1])},${snapV(pos[2])}`;
}

/** Higher score = higher priority to "own" the label at that position */
const PURPOSE_LABEL_PRIORITY: Record<string, number> = {
  CAM_LOCK: 100,
  MINIFIX: 100,
  BOLT: 90,
  BOLT_THREAD: 80,
  DOWEL: 70,
  SHELF_PIN: 60,
  HINGE: 50,
  DRAWER_SLIDE: 40,
  OTHER: 0,
};

interface LabelWinnerInfo {
  winnerId: string;
  score: number;
  count: number;   // how many points share this label slot
}

interface LabelOwnerMap {
  /** key → winner info for diameter labels: one per (position, diameter) */
  dia: Map<string, LabelWinnerInfo>;
  /** key → winner info for depth labels: one per (position, diameter×depth) */
  dep: Map<string, LabelWinnerInfo>;
}

/**
 * For each cluster of overlapping points, pick one "winner" per
 * (position, diameter) to show the diameter label, and one per
 * (position, diameter×depth) to show the depth label.
 * Winner = highest purpose priority, tie-break by id (stable).
 * Also counts how many points share each label slot for (×n) display.
 */
function buildLabelOwnerMap(points: DrillMapPoint[]): LabelOwnerMap {
  const dia = new Map<string, LabelWinnerInfo>();
  const dep = new Map<string, LabelWinnerInfo>();

  for (const p of points) {
    const base = labelPosKey(p.position);
    const score = PURPOSE_LABEL_PRIORITY[p.purpose] ?? 0;

    // Diameter label: one per (position, diameter)
    const kDia = `${base}|${p.diameter}`;
    const w1 = dia.get(kDia);
    if (!w1) {
      dia.set(kDia, { winnerId: p.id, score, count: 1 });
    } else {
      const better = score > w1.score || (score === w1.score && p.id < w1.winnerId);
      dia.set(kDia, {
        winnerId: better ? p.id : w1.winnerId,
        score: Math.max(w1.score, score),
        count: w1.count + 1,
      });
    }

    // Depth label: one per (position, diameter×depth)
    const kDep = `${base}|${p.diameter}x${p.depth}`;
    const w2 = dep.get(kDep);
    if (!w2) {
      dep.set(kDep, { winnerId: p.id, score, count: 1 });
    } else {
      const better = score > w2.score || (score === w2.score && p.id < w2.winnerId);
      dep.set(kDep, {
        winnerId: better ? p.id : w2.winnerId,
        score: Math.max(w2.score, score),
        count: w2.count + 1,
      });
    }
  }

  return { dia, dep };
}

/** Build the label key for a point (used by both buildLabelOwnerMap and render loop) */
function diaKey(p: DrillMapPoint): string {
  return `${labelPosKey(p.position)}|${p.diameter}`;
}
function depKey(p: DrillMapPoint): string {
  return `${labelPosKey(p.position)}|${p.diameter}x${p.depth}`;
}

function buildDisplayPoints(points: DrillMapPoint[]): DrillMapPoint[] {
  // v7.0: Per baseline spec §3 — "BOLT ต้องอยู่ฝั่ง Bolt (ไม่ใช่ฝั่งเกลียว)"
  // Hide BOLT (side panel thread hole) and show BOLT_ENTRY (horizontal panel
  // edge where bolt physically enters). BOLT_ENTRY has Ø10 × 24mm which
  // matches the spec: "ใช้รูหลักเป็น BOLT (Ø10) ความลึก 24mm".
  // BOLT is still in the drill map for CNC panel-specific operations.
  const filtered = points.filter((p) => p.purpose !== 'BOLT');

  // v4.4: Deduplicate by (panelId, purpose, X, Y, Z) within 1mm tolerance.
  // Each panel's points are independent — never merge across panels.
  // All 3 coordinates checked to preserve DOWEL ±32mm Z offsets.
  const deduped: DrillMapPoint[] = [];
  for (const point of filtered) {
    const isDupe = deduped.some(
      (r) =>
        r.panelId === point.panelId &&
        r.purpose === point.purpose &&
        Math.abs(r.position[0] - point.position[0]) < 1 &&
        Math.abs(r.position[1] - point.position[1]) < 1 &&
        Math.abs(r.position[2] - point.position[2]) < 1
    );
    if (!isDupe) deduped.push(point);
  }
  return deduped;
}
// ============================================
// SUB-COMPONENTS
// ============================================

interface DrillIndicatorProps {
  point: DrillMapPoint;
  showDiameter: boolean;
  showDepth: boolean;
  showCrosshairs: boolean;
  lineWidth: number;
  isSelected: boolean;
  /** Whether this point "owns" the diameter label at its position (label dedup) */
  isLabelOwnerDia?: boolean;
  /** How many points share this diameter label slot (for ×n display) */
  diaCount?: number;
  /** Whether this point "owns" the depth label at its position (label dedup) */
  isLabelOwnerDep?: boolean;
  /** How many points share this depth label slot (for ×n display) */
  depCount?: number;
  /** Show catalog-style label (Name + Part no.) instead of simple Ø diameter */
  showCatalogLabel?: boolean;
  onClick?: () => void;
}

/**
 * Individual CAD-style drill indicator
 */
function DrillIndicator({
  point,
  showDiameter,
  showDepth,
  showCrosshairs,
  lineWidth,
  isSelected,
  isLabelOwnerDia = true,
  diaCount = 1,
  isLabelOwnerDep = true,
  depCount = 1,
  showCatalogLabel = false,
  onClick,
}: DrillIndicatorProps) {
  const color = CAD_COLORS[point.purpose] || CAD_COLORS.OTHER;
  const selectedColor = '#ffffff';
  const activeColor = isSelected ? selectedColor : color;

  // Get indicator orientation from drill normal
  const rotation = useMemo(
    () => getOrientationFromNormal(point.normal),
    [point.normal]
  );

  // Calculate offset position (slightly above surface)
  const position = useMemo(
    () => getOffsetPosition(point.position, point.normal, SURFACE_OFFSET),
    [point.position, point.normal]
  );

  // Scale factor for mm to world units
  const radius = point.diameter / 2;
  const crosshairArm = radius * CROSSHAIR_RATIO;

  // Leader line direction per purpose — avoid label overlap at junctions.
  // Each junction has BOLT_ENTRY + DOWEL side by side (~32mm apart).
  // We spread labels far apart: DOWEL far-left + higher, BOLT far-right + lower.
  const leaderOffset = useMemo(() => {
    switch (point.purpose) {
      case 'DOWEL':        return { x: -25, y: 30 };   // far upper-left
      case 'BOLT':
      case 'BOLT_ENTRY':
      case 'BOLT_THREAD':  return { x: 25,  y: 15 };   // far right, lower
      case 'CAM_LOCK':
      case 'MINIFIX':      return { x: 0,   y: 35 };   // straight up, highest
      default:             return { x: 20,  y: 20 };   // upper-right
    }
  }, [point.purpose]);

  // Generate circle points
  const circlePoints = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
      const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      pts.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0
      ));
    }
    return pts;
  }, [radius]);

  // Crosshair line points
  const crosshairPoints = useMemo(() => ({
    horizontal: [
      new THREE.Vector3(-crosshairArm, 0, 0),
      new THREE.Vector3(crosshairArm, 0, 0),
    ],
    vertical: [
      new THREE.Vector3(0, -crosshairArm, 0),
      new THREE.Vector3(0, crosshairArm, 0),
    ],
  }), [crosshairArm]);

  return (
    <group
      position={position}
      rotation={rotation}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {/* Invisible click target circle */}
      <mesh>
        <circleGeometry args={[radius, CIRCLE_SEGMENTS]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Diameter circle outline */}
      <Line
        points={circlePoints}
        color={activeColor}
        lineWidth={isSelected ? lineWidth * 1.5 : lineWidth}
        transparent
        opacity={isSelected ? 1 : 0.8}
      />

      {/* Center crosshairs */}
      {showCrosshairs && (
        <>
          <Line
            points={crosshairPoints.horizontal}
            color={activeColor}
            lineWidth={lineWidth * 0.8}
            transparent
            opacity={isSelected ? 1 : 0.7}
          />
          <Line
            points={crosshairPoints.vertical}
            color={activeColor}
            lineWidth={lineWidth * 0.8}
            transparent
            opacity={isSelected ? 1 : 0.7}
          />
        </>
      )}

      {/* Diameter / Catalog callout — only rendered by the label "owner" at this position */}
      {showDiameter && isLabelOwnerDia && (
        showCatalogLabel ? (
          /* Catalog-style label (TARGET J10): Leader line + dot + Name + Part no. */
          <>
            {/* Leader line: straight from bore center to label position */}
            <Line
              points={[
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(leaderOffset.x, leaderOffset.y, 0),
              ]}
              color={activeColor}
              lineWidth={1.2}
              transparent
              opacity={0.7}
            />
            {/* Filled dot at bore center */}
            <mesh position={[0, 0, 0.01]}>
              <circleGeometry args={[1.2, 16]} />
              <meshBasicMaterial color={activeColor} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            {/* Label box at end of leader line */}
            <Html
              position={[leaderOffset.x, leaderOffset.y, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <div style={{
                background: 'rgba(0, 0, 0, 0.85)',
                padding: '3px 6px',
                borderRadius: '3px',
                border: `1px solid ${activeColor}`,
                whiteSpace: 'nowrap',
                lineHeight: '1.3',
                transform: leaderOffset.x < 0
                  ? 'translate(-100%, -50%)'   /* left-pointing: anchor right edge */
                  : leaderOffset.x === 0
                    ? 'translate(-50%, -100%)'  /* straight up: anchor bottom-center */
                    : 'translate(0, -50%)',      /* right-pointing: anchor left edge */
              }}>
                <div style={{
                  color: '#ffffff',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                }}>
                  {point.hardwareName || `Ø${point.diameter}×${point.depth}`}
                </div>
                <div style={{
                  color: activeColor,
                  fontSize: '9px',
                  fontFamily: 'monospace',
                  fontWeight: 'normal',
                }}>
                  {point.catalogNo ? `Part no. ${point.catalogNo}` : `Ø${point.diameter}mm`}
                </div>
              </div>
            </Html>
          </>
        ) : (
          /* Simple diameter label */
          <Html
            position={[radius + 3, radius + 3, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div style={{
              background: 'rgba(0, 0, 0, 0.75)',
              color: activeColor,
              fontSize: '10px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              padding: '2px 4px',
              borderRadius: '2px',
              border: `1px solid ${activeColor}`,
              whiteSpace: 'nowrap',
            }}>
              Ø{point.diameter}{diaCount > 1 ? ` ×${diaCount}` : ''}
            </div>
          </Html>
        )
      )}

      {/* Depth callout - show globally when showDepth=true, or per-point when selected */}
      {(showDepth || isSelected) && isLabelOwnerDep && (
        <Html
          position={[radius + 3, -radius - 3, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: isSelected ? 'rgba(30, 58, 95, 0.95)' : 'rgba(0, 0, 0, 0.6)',
            color: isSelected ? '#60a5fa' : '#9ca3af',
            fontSize: isSelected ? '11px' : '9px',
            fontFamily: 'monospace',
            fontWeight: isSelected ? 'bold' : 'normal',
            padding: isSelected ? '2px 6px' : '1px 3px',
            borderRadius: '2px',
            border: isSelected ? '1px solid #3b82f6' : 'none',
            whiteSpace: 'nowrap',
          }}>
            Ø{point.diameter}×{point.depth}mm{depCount > 1 ? ` ×${depCount}` : ''}
          </div>
        </Html>
      )}
    </group>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

/**
 * CAD-style drill point indicators for 3D cabinet visualization.
 */
export function CADDrillIndicators({
  drillMap,
  visible,
  showDiameter = true,
  showDepth = false,
  showCrosshairs = true,
  lineWidth = 2,
  filterPurpose,
  selectedId = null,
  onPointClick,
  hiddenPanelIds,
}: CADDrillIndicatorsProps) {
  // ConnectorList label visibility: hide labels for specific connector sets
  const hiddenLabels = useConnectorVisibilityStore((s) => s.hiddenLabels);

  // Collect all drill points from all panels
  const allPoints = useMemo(() => {
    if (!drillMap?.panels) return [];

    const rawPoints: DrillMapPoint[] = [];
    for (const panel of drillMap.panels) {
      if (panel.points) {
        rawPoints.push(...panel.points);
      }
    }

    const points = buildDisplayPoints(rawPoints);

    // Apply purpose filter if specified
    let filtered = points;
    if (filterPurpose && filterPurpose.length > 0) {
      filtered = filtered.filter(p => filterPurpose.includes(p.purpose));
    }

    // ConnectorList visibility: when a junction is hidden, hide ALL its points
    // (bore circles + Ø labels + catalog labels — everything disappears)
    if (hiddenLabels.size > 0) {
      filtered = filtered.filter(p => {
        if (!p.pairKeyV2) return true; // keep points without pairKeyV2 (e.g. shelf pins)
        const base = p.pairKeyV2
          .replace(/-dowel-(brun-)?(side|horiz|shelf|back)$/, '')
          .replace(/-bolt-(entry|thread)$/, '');
        return !hiddenLabels.has(base);
      });
    }

    // Panel visibility filter: hide drill points from hidden panels
    if (hiddenPanelIds && hiddenPanelIds.size > 0) {
      filtered = filtered.filter(p => !hiddenPanelIds.has(p.panelId));
    }

    return filtered;
  }, [drillMap, filterPurpose, hiddenPanelIds, hiddenLabels]);

  // Helper: check if catalog label should show for a given junction group
  // Default (hiddenLabels empty) = show catalog labels for all
  // When L pressed (key in hiddenLabels) = show simple Ø label
  const isCatalogLabel = useCallback((pk?: string) => {
    if (!pk || hiddenLabels.size === 0) return true;
    const base = pk.replace(/-dowel-(brun-)?(side|horiz|shelf|back)$/, '');
    return !hiddenLabels.has(base);
  }, [hiddenLabels]);

  // v4.4: Label dedup — merge labels across panels at same position.
  // Circle/crosshair still renders for every point; only labels deduplicate.
  // Also tracks count per slot so we can show (×n) when multiple points overlap.
  const labelOwners = useMemo(() => buildLabelOwnerMap(allPoints), [allPoints]);

  // ── Häfele-catalog-style individual labels ──
  // Each hardware component gets its own leader line + dot + label box,
  // positioned at different angles from the bore center to avoid overlap.
  // Layout matches Häfele catalog drawings (e.g. P10.18 up, J10.M6 down-sides).

  // ── Professional ISO 128-22 label system ──
  // Compact format: Ø{dia}×{depth} {shortName}
  // Parallel 45° dog-leg leaders, stacked with uniform spacing
  // Color-coded by bore type (Face=Blue, Edge=Green, Through=Red)

  interface HardwareLabel {
    id: string;
    position: Vec3Tuple;    // bore center in world space
    normal: Vec3Tuple;
    name: string;           // full hardware name (for tooltip)
    shortName: string;      // compact name for display
    catalogNo: string;
    color: string;          // bore-type color
    purpose: DrillPurpose;
    diameter: number;
    depth: number;
    cornerType: string;
    // Dog-leg leader geometry — computed 3D positions in local space
    elbowLocal: [number, number, number];   // elbow (end of diagonal leader)
    shelfEndLocal: [number, number, number]; // end of shelf line
    labelLocal: [number, number, number];    // midpoint of shelf (label anchor)
    isBack: boolean;
    isBottom: boolean;
  }

  const hardwareLabels = useMemo(() => {
    // === Step 1: Build raw labels with position dedup ===
    interface RawLabel {
      id: string;
      position: Vec3Tuple;
      normal: Vec3Tuple;
      name: string;
      shortName: string;
      catalogNo: string;
      color: string;
      purpose: DrillPurpose;
      diameter: number;
      depth: number;
      cornerType: string;
      junctionBase: string;   // junction group key for per-junction stacking
    }

    const rawLabels: RawLabel[] = [];
    const seen = new Set<string>();
    for (const p of allPoints) {
      if (!p.hardwareName) continue;
      if (!p.pairKeyV2) continue;

      // Check if catalog labels are hidden for this junction
      if (!isCatalogLabel(p.pairKeyV2)) continue;

      // Dedup by purpose + position
      const posKey = `${p.purpose}|${snapV(p.position[0])},${snapV(p.position[1])},${snapV(p.position[2])}`;
      if (seen.has(posKey)) continue;
      seen.add(posKey);

      // Extract junction base key (strip dowel/bolt suffixes)
      const jBase = p.pairKeyV2
        .replace(/-dowel-(brun-)?(side|horiz|shelf|back)$/, '')
        .replace(/-bolt-(entry|thread)$/, '');

      rawLabels.push({
        id: `hlabel-${p.id}`,
        position: p.position,
        normal: p.normal,
        name: p.hardwareName,
        shortName: shortenHwName(p.hardwareName),
        catalogNo: p.catalogNo || '',
        color: BORE_COLOR[p.purpose] || BORE_COLOR.OTHER || '#9ca3af',
        purpose: p.purpose,
        diameter: p.diameter,
        depth: p.depth,
        cornerType: p.cornerType || 'TOP_LEFT',
        junctionBase: jBase,
      });
    }

    // === Step 2: Group by JUNCTION (not cornerType) ===
    // Each junction (connector set) has 3-4 bores that need stacking.
    // Different junctions are spatially separated and don't need to avoid each other.
    const junctionGroups = new Map<string, RawLabel[]>();
    for (const rl of rawLabels) {
      const key = rl.junctionBase;
      if (!junctionGroups.has(key)) junctionGroups.set(key, []);
      junctionGroups.get(key)!.push(rl);
    }

    // === Step 3: Sort within each junction by purpose priority ===
    // Cam/Minifix first (biggest bore, most important), then Bolt, then Dowel
    const PURPOSE_SORT: Record<string, number> = {
      CAM_LOCK: 0, MINIFIX: 0,
      BOLT_ENTRY: 1, BOLT: 1, BOLT_THREAD: 1,
      DOWEL: 2,
      SHELF_PIN: 3, HINGE: 3, DRAWER_SLIDE: 3, OTHER: 4,
    };
    for (const [, group] of junctionGroups) {
      group.sort((a, b) => (PURPOSE_SORT[a.purpose] ?? 4) - (PURPOSE_SORT[b.purpose] ?? 4));
    }

    // === Step 4: Assign stacked dog-leg leader positions PER JUNCTION ===
    // Within each junction: stack 3-4 labels with uniform spacing.
    // Stack resets for each junction (max ~4 labels per junction, not 12+).
    const labels: HardwareLabel[] = [];
    // Collect Cam face bores to process separately after main loop
    const deferredCamBores: RawLabel[] = [];

    for (const [jKey, group] of junctionGroups) {
      // Use cornerType from first point in group
      const corner = group[0]?.cornerType || 'TOP_LEFT';
      const isBottom = corner === 'BOTTOM_LEFT' || corner === 'BOTTOM_RIGHT';
      const isBack = corner === 'BACK_LEFT' || corner === 'BACK_RIGHT';
      // Save original first-bore normal BEFORE any filtering.
      // Cam sorts first (priority 0) so group[0] is Cam in BACK junctions.
      // The BACK path invQuat MUST use this original normal to keep D/B labels correct.
      const origNormal = group[0]?.normal || [0, 1, 0];

      // Filter out CAM_LOCK/MINIFIX face bores when the junction has MIXED
      // normal alignments (X-aligned Cam + Z-aligned D/B bores).
      // This happens at back edge junctions regardless of cornerType
      // (cornerType may be TOP_RIGHT/BOTTOM_RIGHT instead of BACK_RIGHT).
      const hasZAligned = group.some(rl => Math.abs(rl.normal[2]) > 0.5);
      const hasXAligned = group.some(rl => Math.abs(rl.normal[0]) > 0.5);
      const isMixedNormals = hasZAligned && hasXAligned;
      const isCamFaceBore = (rl: RawLabel) =>
        isMixedNormals && (rl.purpose === 'CAM_LOCK' || rl.purpose === 'MINIFIX')
        && Math.abs(rl.normal[0]) > 0.5;
      const workGroup = group.filter(rl => !isCamFaceBore(rl));
      // Defer Cam face bores for separate processing
      for (const rl of group) {
        if (isCamFaceBore(rl)) deferredCamBores.push(rl);
      }
      if (workGroup.length === 0) continue;

      // Use origNormal (from group[0] including Cam) for BACK path
      // to preserve the exact same invQuat that produced correct D/B labels.
      // For non-BACK, use workGroup[0] normal as before.
      const n = isBack ? origNormal : (workGroup[0]?.normal || [0, 1, 0]);
      const nVec = new THREE.Vector3(n[0], n[1], n[2]);

      // Compute centroid of bore positions in this group
      const centroid = new THREE.Vector3(0, 0, 0);
      for (const g of workGroup) {
        centroid.add(new THREE.Vector3(g.position[0], g.position[1], g.position[2]));
      }
      centroid.divideScalar(workGroup.length);

      if (isBack) {
        // =========================================================
        // BACK junctions — Two sub-paths:
        // A) Back PANEL itself (origNormal Z-aligned): straight-line style,
        //    direction from centroid.x (outward from panel edge).
        // B) Side panels at BACK edge (origNormal X-aligned): diagonal+shelf
        //    style with per-bore invQuat.
        // =========================================================
        const isBackPanel = Math.abs(origNormal[2]) > 0.5 || Math.abs(origNormal[0]) < 0.1;

        if (isBackPanel) {
          // --- Sub-path A: BACK PANEL — straight horizontal leaders ---
          const outwardSign = centroid.x < 0 ? -1 : 1;
          const backLeaderW = new THREE.Vector3(outwardSign, 0, 0);

          const pendingLabels: { rl: typeof workGroup[0]; sideIdx: number }[] = [];
          for (let i = 0; i < workGroup.length; i++) {
            pendingLabels.push({ rl: workGroup[i], sideIdx: i });
          }

          for (const { rl, sideIdx } of pendingLabels) {
            const boreRot = getOrientationFromNormal(rl.normal as Vec3Tuple);
            const boreQuat = new THREE.Quaternion().setFromEuler(boreRot);
            const boreInvQuat = boreQuat.clone().invert();
            const boreLeaderL = backLeaderW.clone().applyQuaternion(boreInvQuat).normalize();

            const dowelBoost = rl.purpose === 'DOWEL' ? PRO_STACK_SPACING : 0;
            const stackOffset = PRO_BASE_OFFSET + sideIdx * PRO_STACK_SPACING + dowelBoost;
            // Pure horizontal leader only — no shelf, no diagonal
            const elbowVec = boreLeaderL.clone().multiplyScalar(stackOffset);

            labels.push({
              ...rl,
              elbowLocal: [elbowVec.x, elbowVec.y, elbowVec.z],
              shelfEndLocal: [elbowVec.x, elbowVec.y, elbowVec.z],
              labelLocal: [elbowVec.x, elbowVec.y, elbowVec.z],
              isBack: true,
              isBottom: false,
            });
          }
        } else {
          // --- Sub-path B: SIDE PANELS at BACK edge — straight outward from back edge ---
          // Leader goes in -Z direction (outward from back edge), which is always
          // visible from side views. The old X-direction leader was invisible
          // because it went into the screen when viewed from the side.
          const backOutwardW = new THREE.Vector3(0, 0, -1);

          const pendingLabels: { rl: typeof workGroup[0]; sideIdx: number }[] = [];
          for (let i = 0; i < workGroup.length; i++) {
            pendingLabels.push({ rl: workGroup[i], sideIdx: i });
          }

          for (const { rl, sideIdx } of pendingLabels) {
            const boreRot = getOrientationFromNormal(rl.normal as Vec3Tuple);
            const boreQuat = new THREE.Quaternion().setFromEuler(boreRot);
            const boreInvQuat = boreQuat.clone().invert();
            const boreLeaderL = backOutwardW.clone().applyQuaternion(boreInvQuat).normalize();

            const dowelBoost = rl.purpose === 'DOWEL' ? PRO_STACK_SPACING : 0;
            const stackOffset = PRO_BASE_OFFSET + sideIdx * PRO_STACK_SPACING + dowelBoost;
            // Pure straight leader — no shelf, no diagonal
            const elbowVec = boreLeaderL.clone().multiplyScalar(stackOffset);

            labels.push({
              ...rl,
              elbowLocal: [elbowVec.x, elbowVec.y, elbowVec.z],
              shelfEndLocal: [elbowVec.x, elbowVec.y, elbowVec.z],
              labelLocal: [elbowVec.x, elbowVec.y, elbowVec.z],
              isBack: true,
              isBottom: false,
            });
          }
        }
      } else if (Math.abs(nVec.y) > 0.9) {
        // =========================================================
        // TOP / BOTTOM panels with Y-aligned bore normals.
        // The simple [diagDx, diagDy, 0] approach puts leaders along
        // the panel edge (Z-axis) instead of outward (X-axis).
        // Use per-bore invQuat with world-space directions to ensure
        // labels always go OUTWARD from the panel edge.
        // =========================================================
        const outwardSign = centroid.x < 0 ? -1 : 1;
        const leaderWorld = new THREE.Vector3(outwardSign, 0, 0);
        const shelfWorld2 = new THREE.Vector3(0, 0, 1); // along depth axis

        // Classify bores along shelf direction (Z) for stacking
        const sideCount: Record<number, number> = { [-1]: 0, [1]: 0 };
        const pendingLabels: { rl: typeof workGroup[0]; hSign: number; sideIdx: number }[] = [];
        for (let i = 0; i < workGroup.length; i++) {
          const borePos = new THREE.Vector3(
            workGroup[i].position[0], workGroup[i].position[1], workGroup[i].position[2]);
          const proj = borePos.clone().sub(centroid).dot(shelfWorld2);
          const hSign = proj > 0.5 ? 1 : proj < -0.5 ? -1 : 0;
          if (hSign !== 0) {
            const sideIdx = sideCount[hSign] || 0;
            sideCount[hSign] = sideIdx + 1;
            pendingLabels.push({ rl: workGroup[i], hSign, sideIdx });
          }
        }
        for (let i = 0; i < workGroup.length; i++) {
          const borePos = new THREE.Vector3(
            workGroup[i].position[0], workGroup[i].position[1], workGroup[i].position[2]);
          const proj = borePos.clone().sub(centroid).dot(shelfWorld2);
          const hSign = proj > 0.5 ? 1 : proj < -0.5 ? -1 : 0;
          if (hSign === 0) {
            const assignedSign = (sideCount[-1] || 0) <= (sideCount[1] || 0) ? -1 : 1;
            const sideIdx = sideCount[assignedSign] || 0;
            sideCount[assignedSign] = sideIdx + 1;
            pendingLabels.push({ rl: workGroup[i], hSign: assignedSign, sideIdx });
          }
        }

        for (const { rl, hSign, sideIdx } of pendingLabels) {
          const boreRot = getOrientationFromNormal(rl.normal as Vec3Tuple);
          const boreQuat = new THREE.Quaternion().setFromEuler(boreRot);
          const boreInvQuat = boreQuat.clone().invert();

          // Cam/Minifix goes INWARD (opposite direction from D/B)
          const isCam = rl.purpose === 'CAM_LOCK' || rl.purpose === 'MINIFIX';
          const actualLeader = isCam
            ? leaderWorld.clone().negate()   // inward
            : leaderWorld.clone();           // outward
          const boreLeaderL = actualLeader.applyQuaternion(boreInvQuat).normalize();
          const boreShelfL = shelfWorld2.clone().applyQuaternion(boreInvQuat).normalize();

          const dowelBoost = rl.purpose === 'DOWEL' ? PRO_STACK_SPACING : 0;
          const stackOffset = PRO_BASE_OFFSET + sideIdx * PRO_STACK_SPACING + dowelBoost;
          // Pure horizontal leader only — no shelf, no diagonal
          const elbowVec = boreLeaderL.clone().multiplyScalar(stackOffset);
          const shelfEndVec = elbowVec.clone();
          const labelVec = elbowVec.clone();

          labels.push({
            ...rl,
            elbowLocal: [elbowVec.x, elbowVec.y, elbowVec.z],
            shelfEndLocal: [shelfEndVec.x, shelfEndVec.y, shelfEndVec.z],
            labelLocal: [labelVec.x, labelVec.y, labelVec.z],
            isBack: false,
            isBottom,
          });
        }
      } else if (Math.abs(nVec.z) > 0.5) {
        // =========================================================
        // Z-aligned bore normals on side panels — BACK EDGE bores
        // These bores drill from the back into the side panel.
        // cornerType may be TOP_RIGHT/BOTTOM_RIGHT (not BACK_RIGHT)
        // so they fall through here instead of the BACK path above.
        // Leader direction is panel-side-aware:
        //   Right Side (centroid.x > 0): D/B go -Z (LEFT), Cam go +Z (RIGHT)
        //   Left Side  (centroid.x < 0): D/B go +Z (RIGHT), Cam go -Z (LEFT)
        // =========================================================
        const isRightSide = centroid.x > 0;
        const backOutwardW = new THREE.Vector3(0, 0, isRightSide ? -1 : 1);

        const pendingLabels: { rl: typeof workGroup[0]; sideIdx: number }[] = [];
        for (let i = 0; i < workGroup.length; i++) {
          pendingLabels.push({ rl: workGroup[i], sideIdx: i });
        }

        for (const { rl, sideIdx } of pendingLabels) {
          const boreRot = getOrientationFromNormal(rl.normal as Vec3Tuple);
          const boreQuat = new THREE.Quaternion().setFromEuler(boreRot);
          const boreInvQuat = boreQuat.clone().invert();

          // Cam/Minifix goes INWARD (opposite from D/B)
          const isCam = rl.purpose === 'CAM_LOCK' || rl.purpose === 'MINIFIX';
          const actualLeader = isCam
            ? backOutwardW.clone().negate()   // +Z inward
            : backOutwardW.clone();           // -Z outward
          const boreLeaderL = actualLeader.applyQuaternion(boreInvQuat).normalize();

          const dowelBoost = rl.purpose === 'DOWEL' ? PRO_STACK_SPACING : 0;
          const stackOffset = PRO_BASE_OFFSET + sideIdx * PRO_STACK_SPACING + dowelBoost;
          // Pure straight leader — no shelf, no diagonal
          const elbowVec = boreLeaderL.clone().multiplyScalar(stackOffset);

          labels.push({
            ...rl,
            elbowLocal: [elbowVec.x, elbowVec.y, elbowVec.z],
            shelfEndLocal: [elbowVec.x, elbowVec.y, elbowVec.z],
            labelLocal: [elbowVec.x, elbowVec.y, elbowVec.z],
            isBack: true,
            isBottom: false,
          });
        }
      } else {
        // =========================================================
        // SIDE panels (X-aligned bore normals) — ORIGINAL WORKING CODE
        // Leader in local Y, shelf in local X
        // =========================================================
        const dirSign = isBottom ? -1 : 1;

        const up = Math.abs(nVec.y) < 0.9
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(1, 0, 0);
        const tangent = new THREE.Vector3().crossVectors(nVec, up).normalize();

        // Classify each bore along tangent axis
        const boreClassify: number[] = [];
        for (const rl of workGroup) {
          const borePos = new THREE.Vector3(rl.position[0], rl.position[1], rl.position[2]);
          const proj = borePos.clone().sub(centroid).dot(tangent);
          boreClassify.push(proj > 0.5 ? -1 : proj < -0.5 ? 1 : 0);
        }

        const sideCount: Record<number, number> = { [-1]: 0, [1]: 0 };
        const pendingLabels: { rl: typeof workGroup[0]; hSign: number; sideIdx: number }[] = [];
        for (let i = 0; i < workGroup.length; i++) {
          if (boreClassify[i] !== 0) {
            const hSign = boreClassify[i];
            const sideIdx = sideCount[hSign] || 0;
            sideCount[hSign] = sideIdx + 1;
            pendingLabels.push({ rl: workGroup[i], hSign, sideIdx });
          }
        }
        for (let i = 0; i < workGroup.length; i++) {
          if (boreClassify[i] === 0) {
            const hSign = (sideCount[-1] || 0) <= (sideCount[1] || 0) ? -1 : 1;
            const sideIdx = sideCount[hSign] || 0;
            sideCount[hSign] = sideIdx + 1;
            pendingLabels.push({ rl: workGroup[i], hSign, sideIdx });
          }
        }

        for (const { rl, hSign, sideIdx } of pendingLabels) {
          const stackOffset = PRO_BASE_OFFSET + sideIdx * PRO_STACK_SPACING;
          const diagDy = stackOffset * dirSign;
          const diagDx = stackOffset * PRO_DIAG_RATIO * hSign;
          const shelfEndX = diagDx + PRO_SHELF_LENGTH * hSign;
          const shelfMidX = diagDx + (PRO_SHELF_LENGTH / 2) * hSign;

          labels.push({
            ...rl,
            elbowLocal: [diagDx, diagDy, 0],
            shelfEndLocal: [shelfEndX, diagDy, 0],
            labelLocal: [shelfMidX, diagDy, 0],
            isBack: false,
            isBottom,
          });
        }
      }
    }

    // =========================================================
    // DEFERRED CAM face bores — processed independently
    // Cam labels go INWARD from back edge (+Z = toward front of cabinet),
    // opposite from D/B labels which go OUTWARD (-Z = toward back).
    // This prevents overlap and makes Cam visible from side views.
    // Use invQuat to convert world-space directions to LOCAL coords.
    // =========================================================
    for (const rl of deferredCamBores) {
      const n = rl.normal;

      // Build invQuat from Cam bore's own normal
      const camRot = getOrientationFromNormal(n as Vec3Tuple);
      const camQuat = new THREE.Quaternion().setFromEuler(camRot);
      const camInvQuat = camQuat.clone().invert();

      // Cam goes INWARD — opposite of D/B direction (panel-side-aware)
      //   Right Side (position.x > 0): Cam go +Z (RIGHT)
      //   Left Side  (position.x < 0): Cam go -Z (LEFT)
      const camIsRightSide = rl.position[0] > 0;
      const camLeaderW = new THREE.Vector3(0, 0, camIsRightSide ? 1 : -1);
      const camLeaderL = camLeaderW.clone().applyQuaternion(camInvQuat).normalize();

      const stackOffset = PRO_BASE_OFFSET * 2; // doubled to clear bore circle
      // Pure straight leader — no shelf, no diagonal
      const elbowVec = camLeaderL.clone().multiplyScalar(stackOffset);

      labels.push({
        ...rl,
        elbowLocal: [elbowVec.x, elbowVec.y, elbowVec.z],
        shelfEndLocal: [elbowVec.x, elbowVec.y, elbowVec.z],
        labelLocal: [elbowVec.x, elbowVec.y, elbowVec.z],
        isBack: true,
        isBottom: false,
      });
    }

    return labels;
  }, [allPoints, isCatalogLabel]);

  if (!visible || allPoints.length === 0) {
    return null;
  }

  return (
    <group name="cad-drill-indicators">
      {/* Bore circles + crosshairs + simple Ø labels (per-point) */}
      {allPoints.map((point) => {
        const diaInfo = labelOwners.dia.get(diaKey(point));
        const depInfo = labelOwners.dep.get(depKey(point));
        return (
          <DrillIndicator
            key={point.id}
            point={point}
            showDiameter={hardwareLabels.length > 0 ? false : showDiameter}
            showDepth={hardwareLabels.length > 0 ? false : showDepth}
            showCrosshairs={showCrosshairs}
            lineWidth={lineWidth}
            isSelected={point.id === selectedId}
            isLabelOwnerDia={diaInfo?.winnerId === point.id}
            diaCount={diaInfo?.count ?? 1}
            isLabelOwnerDep={depInfo?.winnerId === point.id}
            depCount={depInfo?.count ?? 1}
            showCatalogLabel={false}
            onClick={() => onPointClick?.(point)}
          />
        );
      })}

      {/* CSGDrillOverlay-style labels: diagonal leader + 2-line stacked (glyph + Ø) */}
      {hardwareLabels.map((hl) => {
        // Always use bore normal rotation — offsets are in LOCAL space.
        const rotation = getOrientationFromNormal(hl.normal);
        const pos = getOffsetPosition(hl.position, hl.normal, SURFACE_OFFSET);
        const { elbowLocal, shelfEndLocal, labelLocal, isBottom } = hl;

        const glyph = PURPOSE_GLYPH[hl.purpose] || '?';
        // Text positioning: BOTTOM panels → text below, others → text above
        const textBelow = isBottom;

        return (
          <group key={hl.id} position={pos} rotation={rotation}>
            {/* NOTE: No filled dot here — DrillIndicator already renders bore circle + dot */}

            {/* Diagonal leader: bore center → elbow */}
            <Line
              points={[
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(...elbowLocal),
              ]}
              color={hl.color}
              lineWidth={0.75}
              transparent
              opacity={0.8}
            />

            {/* Shelf: elbow → shelf end */}
            <Line
              points={[
                new THREE.Vector3(...elbowLocal),
                new THREE.Vector3(...shelfEndLocal),
              ]}
              color={hl.color}
              lineWidth={0.75}
              transparent
              opacity={0.8}
            />

            {/* 2-line stacked label — Billboard+Text scales with 3D scene */}
            <Billboard position={labelLocal}>
              {/* Purpose glyph (colored) */}
              <Text
                fontSize={9.6}
                color={hl.color}
                anchorX="center"
                anchorY={textBelow ? 'top' : 'bottom'}
                outlineWidth={0.5}
                outlineColor="#000000"
                position={[0, textBelow ? -10.2 : 10.2, 0]}
              >
                {glyph}
              </Text>
              {/* Ø dimension (white) — sits just off shelf line */}
              <Text
                fontSize={9.6}
                color="#ffffff"
                anchorX="center"
                anchorY={textBelow ? 'top' : 'bottom'}
                outlineWidth={0.5}
                outlineColor="#000000"
                position={[0, textBelow ? -0.5 : 0.5, 0]}
              >
                {`Ø${hl.diameter}×${hl.depth}`}
              </Text>
            </Billboard>
          </group>
        );
      })}
    </group>
  );
}

// ============================================
// LEGEND COMPONENT
// ============================================

interface CADDrillLegendProps {
  visible: boolean;
}

/**
 * Legend showing drill purpose colors
 */
export function CADDrillLegend({ visible }: CADDrillLegendProps) {
  if (!visible) return null;

  const legendItems: { purpose: DrillPurpose; label: string; diameter: number; boreType: string }[] = [
    { purpose: 'CAM_LOCK', label: 'Cam Housing (Face)', diameter: 15, boreType: 'Face' },
    { purpose: 'BOLT_ENTRY', label: 'Bolt Entry (Edge)', diameter: 10, boreType: 'Edge' },
    { purpose: 'BOLT_THREAD', label: 'Bolt Thread (Face)', diameter: 5, boreType: 'Face' },
    { purpose: 'DOWEL', label: 'Dowel (Through)', diameter: 8, boreType: 'Through' },
    { purpose: 'SHELF_PIN', label: 'Shelf Pin', diameter: 5, boreType: 'Other' },
    { purpose: 'DRAWER_SLIDE', label: 'Drawer Slide', diameter: 5, boreType: 'Other' },
    { purpose: 'HINGE', label: 'Hinge Cup', diameter: 35, boreType: 'Other' },
  ];

  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      left: '20px',
      background: 'rgba(0, 0, 0, 0.8)',
      border: '1px solid #3a3a5a',
      borderRadius: '6px',
      padding: '8px 12px',
      fontFamily: 'monospace',
      fontSize: '11px',
    }}>
      <div style={{
        color: '#9ca3af',
        fontWeight: 'bold',
        marginBottom: '6px',
        borderBottom: '1px solid #3a3a5a',
        paddingBottom: '4px',
      }}>
        Drill Legend
      </div>
      {legendItems.map(({ purpose, label, diameter }) => (
        <div
          key={purpose}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '3px',
          }}
        >
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: `2px solid ${BORE_COLOR[purpose] || CAD_COLORS[purpose]}`,
            background: 'transparent',
          }} />
          <span style={{ color: '#d1d5db' }}>{label}</span>
          <span style={{ color: '#6b7280', marginLeft: 'auto' }}>Ø{diameter}</span>
        </div>
      ))}
    </div>
  );
}

export default CADDrillIndicators;

