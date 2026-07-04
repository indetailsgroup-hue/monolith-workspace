/**
 * CSGDrillOverlay - v5.1 (TARGET J10-style Technical Drawing + Dimension Lines)
 *
 * Renders drill holes as clean technical annotations matching
 * Italiana Ferramenta TARGET J10 documentation style:
 *
 *   - Bore shown as ellipse (entry solid, back dashed)
 *   - Center cross mark at entry face
 *   - Thin leader line from bore to dimension text
 *   - Clean "Ø{dia}×{depth}" annotation — no background box
 *   - Purpose letter as compact prefix (Cam/B/L/D/S)
 *   - Engineering dimension lines with arrows (spacing + edge distance)
 *
 * Color coding per purpose:
 *   Cam (CAM_LOCK/MINIFIX) — #ddaa00
 *   B   (BOLT_ENTRY)       — #22cc44
 *   L   (BOLT_THREAD)      — #4488ff
 *   D   (DOWEL)            — #cc55ff
 *   S   (SHELF_PIN)        — #44ddcc
 *
 * All lines are always-on-top (depthTest=false) for inspection readability.
 */

import React, { useMemo, useCallback } from 'react';
import { Line, Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import type {
  DrillMap,
  DrillMapPoint,
  DrillMapPanel,
  DrillPurpose,
} from '../../core/manufacturing/drillMap/types';
import { useConnectorVisibilityStore } from '../ui/ConnectorList';
import { useCabinetStore } from '../../core/store/useCabinetStore';

// ============================================
// PURPOSE-BASED VISUAL CONFIG
// ============================================

interface GlyphStyle {
  /** Primary line color */
  color: string;
  /** Hidden/back line color (dimmer) */
  hiddenColor: string;
  /** Short label text */
  label: string;
  /** Entry ellipse line width */
  lineWidth: number;
  /** Whether to use dashed generators */
  dashedGenerators: boolean;
}

const GLYPH_STYLES: Record<string, GlyphStyle> = {
  CAM_LOCK: {
    color: '#ddaa00',
    hiddenColor: '#aa8800',
    label: 'Cam',
    lineWidth: 1.5,
    dashedGenerators: false,
  },
  MINIFIX: {
    color: '#ddaa00',
    hiddenColor: '#aa8800',
    label: 'Cam',
    lineWidth: 1.5,
    dashedGenerators: false,
  },
  BOLT_ENTRY: {
    color: '#22cc44',
    hiddenColor: '#119933',
    label: 'B',
    lineWidth: 1.2,
    dashedGenerators: true,
  },
  BOLT_THREAD: {
    color: '#4488ff',
    hiddenColor: '#3366cc',
    label: 'L',
    lineWidth: 1.2,
    dashedGenerators: true,
  },
  DOWEL: {
    color: '#cc55ff',
    hiddenColor: '#9933cc',
    label: 'D',
    lineWidth: 1.2,
    dashedGenerators: false,
  },
  SHELF_PIN: {
    color: '#44ddcc',
    hiddenColor: '#22aa99',
    label: 'S',
    lineWidth: 1.0,
    dashedGenerators: false,
  },
  HINGE: {
    color: '#ff4444',
    hiddenColor: '#cc2222',
    label: 'H',
    lineWidth: 1.0,
    dashedGenerators: false,
  },
  DRAWER_SLIDE: {
    color: '#44ccbb',
    hiddenColor: '#229988',
    label: 'DS',
    lineWidth: 1.0,
    dashedGenerators: false,
  },
};

const DEFAULT_STYLE: GlyphStyle = {
  color: '#ddaa00',
  hiddenColor: '#aa8800',
  label: '?',
  lineWidth: 1.0,
  dashedGenerators: false,
};

function getGlyphStyle(purpose: DrillPurpose): GlyphStyle {
  return GLYPH_STYLES[purpose] || DEFAULT_STYLE;
}

/**
 * Per-purpose label offset angle (radians from +t1 axis).
 * Spreads labels around the bore to avoid overlap when multiple
 * holes share a corner position.
 */
const LABEL_ANGLE: Record<string, number> = {
  CAM_LOCK: -Math.PI * 0.75,     // upper-left
  MINIFIX: -Math.PI * 0.75,
  BOLT_ENTRY: -Math.PI * 0.25,   // upper-right
  BOLT_THREAD: -Math.PI * 0.25,  // upper-right (same direction as DOWEL)
  DOWEL: -Math.PI * 0.25,        // upper-right
  SHELF_PIN: -Math.PI * 0.5,     // straight up
  HINGE: -Math.PI * 0.75,
  DRAWER_SLIDE: -Math.PI * 0.25,
};

/** Leader line: diagonal segment length from arrowhead to elbow (mm) */
const LEADER_DIAG_LENGTH = 25;
/** Leader line: horizontal shelf length from elbow to text anchor (mm) */
const LEADER_SHELF_LENGTH = 15;
/** Arrow head length at bore edge (mm) */
const LEADER_ARROW_LEN = 3.0;
/** Arrow head half-width (mm) */
const LEADER_ARROW_WIDTH = 1.2;

// ============================================
// CONSTANTS
// ============================================

const ELLIPSE_SEGMENTS = 32;
const CROSS_OVERSHOOT = 1.4;
const MIN_DISPLAY_RADIUS = 0;  // v5.1: show TRUE bore diameter (no inflation)
const CENTER_LINE_WIDTH = 0.8;

// Dimension line constants
const DIM_OFFSET = 10;           // mm offset from bore centers for dimension line
const DIM_EXTENSION_OVERSHOOT = 2; // mm beyond the dimension line
const ARROW_HEAD_LEN = 2.0;     // mm arrow head length
const ARROW_HEAD_WIDTH = 0.8;   // mm arrow head half-width
const DIM_LINE_COLOR = '#888888';  // gray for dimension lines
const DIM_TEXT_COLOR = '#cccccc';  // light gray for dimension text
const EDGE_DIM_COLOR = '#888888';  // same gray as spacing dimensions — unified style

// ============================================
// TYPES
// ============================================

interface CSGDrillOverlayProps {
  drillMap: DrillMap | null;
  visible: boolean;
  filterPurpose?: DrillPurpose[];
  colorByPurpose?: boolean;
  opacity?: number;
  /** Set of panel IDs that are hidden — drill points from these panels will be filtered out */
  hiddenPanelIds?: Set<string>;
}

/** Computed dimension line data for rendering */
interface DimLineData {
  start: THREE.Vector3;
  end: THREE.Vector3;
  offsetDir: THREE.Vector3;   // unit vector perpendicular to line, away from feature
  value: string;              // display text (e.g. "32", "B=24")
  color: string;
  key: string;
  /** Multiplier for DIM_OFFSET (default 1). Use >1 to push dim line further out */
  offsetScale?: number;
}

// ============================================
// GEOMETRY HELPERS
// ============================================

function computeTangentBasis(normal: [number, number, number]): { t1: THREE.Vector3; t2: THREE.Vector3 } {
  const n = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
  const ref = Math.abs(n.y) < 0.99
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const t1 = new THREE.Vector3().crossVectors(n, ref).normalize();
  const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
  return { t1, t2 };
}

function generateEllipsePoints(
  center: [number, number, number],
  t1: THREE.Vector3,
  t2: THREE.Vector3,
  radius: number,
  segments: number,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const cos = Math.cos(angle) * radius;
    const sin = Math.sin(angle) * radius;
    points.push(new THREE.Vector3(
      center[0] + t1.x * cos + t2.x * sin,
      center[1] + t1.y * cos + t2.y * sin,
      center[2] + t1.z * cos + t2.z * sin,
    ));
  }
  return points;
}

function generateCenterCross(
  center: [number, number, number],
  t1: THREE.Vector3,
  t2: THREE.Vector3,
  size: number,
): [THREE.Vector3, THREE.Vector3][] {
  const halfSize = size / 2;
  return [
    [
      new THREE.Vector3(center[0] - t1.x * halfSize, center[1] - t1.y * halfSize, center[2] - t1.z * halfSize),
      new THREE.Vector3(center[0] + t1.x * halfSize, center[1] + t1.y * halfSize, center[2] + t1.z * halfSize),
    ],
    [
      new THREE.Vector3(center[0] - t2.x * halfSize, center[1] - t2.y * halfSize, center[2] - t2.z * halfSize),
      new THREE.Vector3(center[0] + t2.x * halfSize, center[1] + t2.y * halfSize, center[2] + t2.z * halfSize),
    ],
  ];
}

// ============================================
// DISPLAY POINT BUILDER
// ============================================

function buildDisplayPoints(points: DrillMapPoint[]): DrillMapPoint[] {
  const filtered = points.filter((p) => p.purpose !== 'BOLT');
  const deduped: DrillMapPoint[] = [];
  for (const point of filtered) {
    const isDupe = deduped.some(
      (r) =>
        r.panelId === point.panelId &&
        r.purpose === point.purpose &&
        Math.abs(r.position[0] - point.position[0]) < 1 &&
        Math.abs(r.position[1] - point.position[1]) < 1 &&
        Math.abs(r.position[2] - point.position[2]) < 1,
    );
    if (!isDupe) deduped.push(point);
  }
  return deduped;
}

// ============================================
// DIMENSION LINE COMPONENT — Engineering arrow-style
// ============================================

/**
 * DimensionLine3D — TARGET J10-style dimension annotation:
 * - Extension lines from measured points to dimension line
 * - Main dimension line with arrow heads at both ends
 * - Centered text label showing measurement
 */
function DimensionLine3D({ dim }: { dim: DimLineData }) {
  const data = useMemo(() => {
    const effectiveOffset = DIM_OFFSET * (dim.offsetScale ?? 1);
    const offset = dim.offsetDir.clone().multiplyScalar(effectiveOffset);

    // Dimension line endpoints (offset from actual measured points)
    const dimStart = dim.start.clone().add(offset);
    const dimEnd = dim.end.clone().add(offset);

    // Extension lines (from actual points to dim line, with overshoot beyond)
    const overshoot = dim.offsetDir.clone().multiplyScalar(DIM_EXTENSION_OVERSHOOT);
    const extStartFrom = dim.start.clone().add(dim.offsetDir.clone().multiplyScalar(2));
    const extStartTo = dimStart.clone().add(overshoot);
    const extEndFrom = dim.end.clone().add(dim.offsetDir.clone().multiplyScalar(2));
    const extEndTo = dimEnd.clone().add(overshoot);

    // Direction along dimension line
    const dir = new THREE.Vector3().subVectors(dimEnd, dimStart);
    const len = dir.length();
    if (len < 0.1) return null;
    dir.normalize();

    // Arrow head perpendicular (within the offset plane)
    const arrowPerp = dim.offsetDir.clone().multiplyScalar(ARROW_HEAD_WIDTH);

    // Arrow at dimStart (pointing inward → toward dimEnd)
    const a1Tip = dimStart.clone();
    const a1Left = dimStart.clone().add(dir.clone().multiplyScalar(ARROW_HEAD_LEN)).add(arrowPerp);
    const a1Right = dimStart.clone().add(dir.clone().multiplyScalar(ARROW_HEAD_LEN)).sub(arrowPerp);

    // Arrow at dimEnd (pointing inward → toward dimStart)
    const a2Tip = dimEnd.clone();
    const a2Left = dimEnd.clone().sub(dir.clone().multiplyScalar(ARROW_HEAD_LEN)).add(arrowPerp);
    const a2Right = dimEnd.clone().sub(dir.clone().multiplyScalar(ARROW_HEAD_LEN)).sub(arrowPerp);

    // Label position: midpoint of dimension line, offset outward slightly
    const labelOffset = dim.offsetDir.clone().multiplyScalar(3);
    const mid: [number, number, number] = [
      (dimStart.x + dimEnd.x) / 2 + labelOffset.x,
      (dimStart.y + dimEnd.y) / 2 + labelOffset.y,
      (dimStart.z + dimEnd.z) / 2 + labelOffset.z,
    ];

    return {
      dimStart, dimEnd,
      extStart: [extStartFrom, extStartTo] as [THREE.Vector3, THREE.Vector3],
      extEnd: [extEndFrom, extEndTo] as [THREE.Vector3, THREE.Vector3],
      mid,
      arrow1: [a1Left, a1Tip, a1Right] as [THREE.Vector3, THREE.Vector3, THREE.Vector3],
      arrow2: [a2Left, a2Tip, a2Right] as [THREE.Vector3, THREE.Vector3, THREE.Vector3],
    };
  }, [dim]);

  if (!data) return null;

  const color = dim.color;

  return (
    <group>
      {/* Extension lines — thin, from measured point to dim line */}
      <Line
        points={data.extStart}
        color={color}
        lineWidth={0.5}
        depthTest={false}
        depthWrite={false}
        renderOrder={1010}
      />
      <Line
        points={data.extEnd}
        color={color}
        lineWidth={0.5}
        depthTest={false}
        depthWrite={false}
        renderOrder={1010}
      />

      {/* Main dimension line */}
      <Line
        points={[data.dimStart, data.dimEnd]}
        color={color}
        lineWidth={0.4}
        depthTest={false}
        depthWrite={false}
        renderOrder={1011}
      />

      {/* Arrow head at start */}
      <Line
        points={data.arrow1}
        color={color}
        lineWidth={0.5}
        depthTest={false}
        depthWrite={false}
        renderOrder={1012}
      />

      {/* Arrow head at end */}
      <Line
        points={data.arrow2}
        color={color}
        lineWidth={0.5}
        depthTest={false}
        depthWrite={false}
        renderOrder={1012}
      />

      {/* Dimension text — uses Billboard+Text for correct scaling in orthographic views */}
      <Billboard position={data.mid}>
        <Text
          fontSize={5}
          color={DIM_TEXT_COLOR}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.3}
          outlineColor="#000000"
        >
          {dim.value}
        </Text>
      </Billboard>
    </group>
  );
}

// ============================================
// DIMENSION LINE COMPUTATION
// ============================================

/**
 * Compute dimension lines for a set of display points:
 *
 * 1. Spacing dimensions: Between ALL adjacent connector positions on each panel
 *    (grouped by panelId, sorted by depthPosition — spans across corners)
 *
 * 2. Edge distance B: From mating edge to bore center
 *    (shown for ALL purpose types at each unique depthPosition)
 */
/** Panel AABB info for edge distance computation */
interface PanelAABBInfo {
  aabbMin: [number, number, number];
  aabbMax: [number, number, number];
  role: string;
}

function computeDimensionLines(
  allPoints: DrillMapPoint[],
  panelInfoMap: Map<string, PanelAABBInfo>,
): DimLineData[] {
  const dims: DimLineData[] = [];

  // Safety: only use points whose panelId exists in panelInfoMap (i.e. visible panels)
  const visiblePoints = panelInfoMap.size > 0
    ? allPoints.filter(p => panelInfoMap.has(p.panelId))
    : allPoints;

  // ─── 1. DATUM CHAIN DIMENSIONS (full edge→bore→bore→edge chain per corner) ───
  //
  // Group by panelId + cornerType, then build a complete datum chain along
  // the panel depth axis (Z for side panels, Z for horiz panels).
  // Uses ACTUAL world position (not depthPosition) to correctly include
  // ALL hardware points (bolts + dowels) at their true locations.
  // Includes panel edge → first point and last point → panel edge.

  const cornerKey = (p: DrillMapPoint) => `${p.panelId}::${p.cornerType ?? 'NONE'}`;
  const cornerGroups = new Map<string, DrillMapPoint[]>();
  for (const p of visiblePoints) {
    const key = cornerKey(p);
    const arr = cornerGroups.get(key) ?? [];
    arr.push(p);
    cornerGroups.set(key, arr);
  }

  for (const [gKey, pts] of cornerGroups) {
    if (pts.length === 0) continue;
    const panelId = pts[0].panelId;
    const pInfo = panelInfoMap.get(panelId);

    // Determine depth axis index: Z (index 2) for both side and horizontal panels
    // Side panels: depth runs along Z; Horizontal panels: depth runs along Z
    const depthIdx = 2;  // Z axis for depth

    // Panel front/back edges along depth axis
    const panelMinZ = pInfo ? pInfo.aabbMin[depthIdx] : -Infinity;
    const panelMaxZ = pInfo ? pInfo.aabbMax[depthIdx] : Infinity;

    // Sort by actual Z position (front = maxZ, back = minZ for standard orientation)
    // Use descending order so front edge → first point
    const sortedPts = [...pts].sort((a, b) => b.position[depthIdx] - a.position[depthIdx]);

    // Deduplicate by Z position (within 0.5mm tolerance), keep higher priority purpose
    const uniquePts: DrillMapPoint[] = [];
    for (const pt of sortedPts) {
      const lastPt = uniquePts[uniquePts.length - 1];
      if (!lastPt || Math.abs(pt.position[depthIdx] - lastPt.position[depthIdx]) > 0.5) {
        uniquePts.push(pt);
      } else if (purposePriority(pt.purpose) > purposePriority(lastPt.purpose)) {
        uniquePts[uniquePts.length - 1] = pt; // Replace with higher priority
      }
    }

    if (uniquePts.length === 0) continue;

    // Reference point for dimension line placement (use first point's position)
    const refPt = uniquePts[0];
    const normal = new THREE.Vector3(refPt.normal[0], refPt.normal[1], refPt.normal[2]);
    // Offset direction: perpendicular to depth axis and drill normal
    const depthDir = new THREE.Vector3(0, 0, -1); // Front→Back = -Z
    let offsetDir = new THREE.Vector3().crossVectors(depthDir, normal).normalize();
    if (offsetDir.lengthSq() < 0.01) {
      offsetDir = new THREE.Vector3(0, -1, 0); // Fallback: downward
    }

    // Dimension lines must go INSIDE the panel (toward panel center):
    // TOP corners: offsetDir should point downward (-Y, toward center)
    // BOTTOM corners: offsetDir should point upward (+Y, toward center)
    // Check cornerType and ensure offsetDir.y has correct sign
    const isBottomDim = refPt.cornerType === 'BOTTOM_LEFT' || refPt.cornerType === 'BOTTOM_RIGHT';
    const isTopDim = refPt.cornerType === 'TOP_LEFT' || refPt.cornerType === 'TOP_RIGHT';
    if (isBottomDim && offsetDir.y < 0) {
      offsetDir.negate(); // flip: push dims upward (inside) for BOTTOM corners
    } else if (isTopDim && offsetDir.y > 0) {
      offsetDir.negate(); // flip: push dims downward (inside) for TOP corners
    }

    const pid = panelId.slice(0, 8);

    // Front edge → first point
    if (pInfo) {
      const frontEdgeZ = panelMaxZ;
      const firstZ = uniquePts[0].position[depthIdx];
      const edgeDist = Math.abs(frontEdgeZ - firstZ);
      if (edgeDist > 0.5 && edgeDist < 300) {
        dims.push({
          start: new THREE.Vector3(refPt.position[0], refPt.position[1], frontEdgeZ),
          end: new THREE.Vector3(refPt.position[0], refPt.position[1], firstZ),
          offsetDir,
          value: `${Math.round(edgeDist)}`,
          color: DIM_LINE_COLOR,
          key: `chain-${pid}-${gKey}-front`,
        });
      }
    }

    // Point-to-point spacing
    for (let i = 0; i < uniquePts.length - 1; i++) {
      const pt1 = uniquePts[i];
      const pt2 = uniquePts[i + 1];

      const p1 = new THREE.Vector3(pt1.position[0], pt1.position[1], pt1.position[2]);
      const p2 = new THREE.Vector3(pt2.position[0], pt2.position[1], pt2.position[2]);

      const dist = Math.abs(pt1.position[depthIdx] - pt2.position[depthIdx]);
      if (dist < 1) continue;

      dims.push({
        start: p1,
        end: p2,
        offsetDir,
        value: `${Math.round(dist)}`,
        color: DIM_LINE_COLOR,
        key: `chain-${pid}-${gKey}-${i}`,
      });
    }

    // Last point → back edge
    if (pInfo) {
      const backEdgeZ = panelMinZ;
      const lastZ = uniquePts[uniquePts.length - 1].position[depthIdx];
      const edgeDist = Math.abs(lastZ - backEdgeZ);
      if (edgeDist > 0.5 && edgeDist < 300) {
        dims.push({
          start: new THREE.Vector3(refPt.position[0], refPt.position[1], lastZ),
          end: new THREE.Vector3(refPt.position[0], refPt.position[1], backEdgeZ),
          offsetDir,
          value: `${Math.round(edgeDist)}`,
          color: DIM_LINE_COLOR,
          key: `chain-${pid}-${gKey}-back`,
        });
      }
    }
  }

  // ─── 2. PANEL EDGE DISTANCES (Ø center → panel's own edges) ───
  //
  // For each unique bore group (per cornerType + depthPosition), show:
  //   a) Distance from bore center to nearest edge along panel HEIGHT (top/bottom)
  //   b) Distance from bore center to nearest edge along panel DEPTH (front/back)
  //
  // Uses panel AABB computed from DrillMapPanel.worldPosition + dimensions.

  if (panelInfoMap.size > 0) {
    // Collect unique bore positions per panel (deduplicate by cornerType + depthPosition)
    const edgePointsByPanel = new Map<string, DrillMapPoint[]>();
    for (const p of visiblePoints) {
      const arr = edgePointsByPanel.get(p.panelId) ?? [];
      arr.push(p);
      edgePointsByPanel.set(p.panelId, arr);
    }

    for (const [panelId, pts] of edgePointsByPanel) {
      const pInfo = panelInfoMap.get(panelId);
      if (!pInfo) continue;

      const { aabbMin, aabbMax, role } = pInfo;

      // Deduplicate: one edge dimension per (cornerType + depthPosition) within each panel
      const seenKey = new Set<string>();

      for (const pt of pts) {
        const roundZ = pt.depthPosition != null ? Math.round(pt.depthPosition * 10) / 10 : 0;
        const locKey = `${pt.cornerType ?? 'X'}::${roundZ}`;
        if (seenKey.has(locKey)) continue;
        seenKey.add(locKey);

        // Use panelId prefix for unique React keys (prevents duplicates across panels)
        const pid = panelId.slice(0, 8);

        const pos = new THREE.Vector3(pt.position[0], pt.position[1], pt.position[2]);
        const normal = new THREE.Vector3(pt.normal[0], pt.normal[1], pt.normal[2]);

        // ── 2a. Distance to nearest HEIGHT edge (top or bottom of panel) ──
        // For SIDE panels: Y axis; For TOP/BOTTOM panels: depends on orientation
        const isSidePanel = role.includes('SIDE') || role === 'DIVIDER';
        const isHorizPanel = role === 'TOP' || role === 'BOTTOM' || role === 'SHELF';

        if (isSidePanel) {
          // Side panel: bore Y relative to panel top/bottom
          const distToTop = aabbMax[1] - pos.y;
          const distToBottom = pos.y - aabbMin[1];
          const nearestYDist = Math.min(distToTop, distToBottom);
          const nearestYEdge = distToTop < distToBottom
            ? new THREE.Vector3(pos.x, aabbMax[1], pos.z)
            : new THREE.Vector3(pos.x, aabbMin[1], pos.z);

          if (nearestYDist > 2 && nearestYDist < 200) {
            // Offset along Z axis (toward front of panel) so the dim line is
            // visible when viewing the panel face from the front
            const offsetDir = new THREE.Vector3(0, 0, 1);

            dims.push({
              start: pos.clone(),
              end: nearestYEdge,
              offsetDir,
              value: `${Math.round(nearestYDist)}`,
              color: EDGE_DIM_COLOR,
              key: `edgeY-${pid}-${locKey}`,
              offsetScale: 2,  // push further out so it doesn't overlap panel edge
            });
          }

          // NOTE: Side panel edgeZ (bore→front/back) is now handled by
          // Section 1 datum chain (edge→bore→bore→edge along Z axis)
        } else if (isHorizPanel) {
          // Horizontal panel (TOP/BOTTOM/SHELF): bore Z relative to panel front/back edge
          const distToFront = aabbMax[2] - pos.z;
          const distToBack = pos.z - aabbMin[2];
          const nearestZDist = Math.min(distToFront, distToBack);
          const nearestZEdge = distToFront < distToBack
            ? new THREE.Vector3(pos.x, pos.y, aabbMax[2])
            : new THREE.Vector3(pos.x, pos.y, aabbMin[2]);

          if (nearestZDist > 2 && nearestZDist < 200) {
            let offsetDir = normal.clone().negate().normalize();
            if (offsetDir.lengthSq() < 0.01) offsetDir = new THREE.Vector3(0, 1, 0);

            dims.push({
              start: pos.clone(),
              end: nearestZEdge,
              offsetDir,
              value: `${Math.round(nearestZDist)}`,
              color: EDGE_DIM_COLOR,
              key: `edgeZ-${pid}-${locKey}`,
              offsetScale: 2,
            });
          }

          // Horizontal panel: bore X relative to panel left/right edge
          const distToLeft = pos.x - aabbMin[0];
          const distToRight = aabbMax[0] - pos.x;
          const nearestXDist = Math.min(distToLeft, distToRight);
          const nearestXEdge = distToLeft < distToRight
            ? new THREE.Vector3(aabbMin[0], pos.y, pos.z)
            : new THREE.Vector3(aabbMax[0], pos.y, pos.z);

          if (nearestXDist > 2 && nearestXDist < 200) {
            const offsetDir = new THREE.Vector3(0, -1, 0);

            dims.push({
              start: pos.clone(),
              end: nearestXEdge,
              offsetDir,
              value: `${Math.round(nearestXDist)}`,
              color: EDGE_DIM_COLOR,
              key: `edgeX-${pid}-${locKey}`,
              offsetScale: 2,
            });
          }
        }
      }
    }
  }

  return dims;
}

/** Priority for picking representative point per depthPosition */
function purposePriority(purpose: DrillPurpose): number {
  switch (purpose) {
    case 'CAM_LOCK':
    case 'MINIFIX':
      return 5;
    case 'BOLT_ENTRY':
      return 4;
    case 'BOLT_THREAD':
      return 3;
    case 'DOWEL':
      return 2;
    default:
      return 1;
  }
}

// ============================================
// DRILL GLYPH — TARGET J10-style annotation
// ============================================

/**
 * DrillGlyph v5.1 — Technical dimension-style annotation:
 * - Entry ellipse (solid, thin) + back ellipse (dashed)
 * - 2 generator lines (cylinder silhouette)
 * - Center cross mark
 * - Thin leader line from bore edge → label anchor
 * - Clean dimension text: "Ø{dia}×{depth}" (no background box)
 */
function DrillGlyph({ point }: { point: DrillMapPoint }) {
  const style = getGlyphStyle(point.purpose);
  const displayRadius = Math.max(point.diameter / 2, MIN_DISPLAY_RADIUS);
  const depth = point.depth;

  const { t1, t2 } = useMemo(() => computeTangentBasis(point.normal), [point.normal]);

  const entryCenter = point.position;

  const backCenter = useMemo((): [number, number, number] => [
    entryCenter[0] + point.normal[0] * depth,
    entryCenter[1] + point.normal[1] * depth,
    entryCenter[2] + point.normal[2] * depth,
  ], [entryCenter, point.normal, depth]);

  // Entry ellipse
  const entryEllipse = useMemo(
    () => generateEllipsePoints(entryCenter, t1, t2, displayRadius, ELLIPSE_SEGMENTS),
    [entryCenter, t1, t2, displayRadius],
  );

  // Back ellipse
  const backEllipse = useMemo(
    () => generateEllipsePoints(backCenter, t1, t2, displayRadius, ELLIPSE_SEGMENTS),
    [backCenter, t1, t2, displayRadius],
  );

  // 2 generator lines
  const generators = useMemo(() => {
    const pairs: [THREE.Vector3, THREE.Vector3][] = [];
    for (let i = 0; i < 2; i++) {
      const angle = (i / 2) * Math.PI;
      const cos = Math.cos(angle) * displayRadius;
      const sin = Math.sin(angle) * displayRadius;
      const start = new THREE.Vector3(
        entryCenter[0] + t1.x * cos + t2.x * sin,
        entryCenter[1] + t1.y * cos + t2.y * sin,
        entryCenter[2] + t1.z * cos + t2.z * sin,
      );
      const end = new THREE.Vector3(
        backCenter[0] + t1.x * cos + t2.x * sin,
        backCenter[1] + t1.y * cos + t2.y * sin,
        backCenter[2] + t1.z * cos + t2.z * sin,
      );
      pairs.push([start, end]);
    }
    return pairs;
  }, [entryCenter, backCenter, t1, t2, displayRadius]);

  // Center cross
  const crossSize = displayRadius * CROSS_OVERSHOOT * 2;
  const crossLines = useMemo(
    () => generateCenterCross(entryCenter, t1, t2, crossSize),
    [entryCenter, t1, t2, crossSize],
  );

  // Leader line: bore edge → label position
  // Each purpose gets a different angle to avoid overlap.
  // BOTTOM corners: flip angle so labels point outward (downward, away from panel center)
  const isBottomCorner = point.cornerType === 'BOTTOM_LEFT' || point.cornerType === 'BOTTOM_RIGHT';
  const isTopCorner = point.cornerType === 'TOP_LEFT' || point.cornerType === 'TOP_RIGHT';
  const isBackRight = point.cornerType === 'BACK_RIGHT';
  const isBackLeft = point.cornerType === 'BACK_LEFT';
  const baseAngle = LABEL_ANGLE[point.purpose] ?? Math.PI * 0.5;
  // BOTTOM + BACK_RIGHT: flip angle (labels go downward)
  // TOP + BACK_LEFT: keep angle (labels go upward)
  const labelAngle = (isBottomCorner || isBackRight) ? -baseAngle : baseAngle;
  const leaderData = useMemo(() => {
    // Point on bore edge at the label angle
    const edgeCos = Math.cos(labelAngle) * displayRadius;
    const edgeSin = Math.sin(labelAngle) * displayRadius;
    const edgePoint = new THREE.Vector3(
      entryCenter[0] + t1.x * edgeCos + t2.x * edgeSin,
      entryCenter[1] + t1.y * edgeCos + t2.y * edgeSin,
      entryCenter[2] + t1.z * edgeCos + t2.z * edgeSin,
    );

    // Direction outward from bore center through edge point
    const dir = new THREE.Vector3().subVectors(edgePoint,
      new THREE.Vector3(entryCenter[0], entryCenter[1], entryCenter[2])
    ).normalize();

    // Force-correct Y direction for corner types:
    // TOP / BACK_LEFT → labels must go upward (Y > 0)
    // BOTTOM / BACK_RIGHT → labels must go downward (Y < 0)
    // This handles cases where the tangent basis produces a nearly-horizontal
    // direction (e.g., vertical bore normals) or where angle negation alone
    // doesn't produce sufficient vertical displacement.
    if (isBottomCorner || isBackRight) {
      if (dir.y > 0) dir.y = -dir.y;           // flip if pointing inward
      if (dir.y > -0.3) dir.y = -0.5;           // ensure minimum downward bias
      dir.normalize();
    } else if (isTopCorner || isBackLeft) {
      if (dir.y < 0) dir.y = -dir.y;            // flip if pointing inward
      if (dir.y < 0.3) dir.y = 0.5;             // ensure minimum upward bias
      dir.normalize();
    }

    // Arrowhead tip = bore edge, arrowhead base = slightly outward
    const arrowTip = edgePoint.clone();
    const arrowBase = edgePoint.clone().add(dir.clone().multiplyScalar(LEADER_ARROW_LEN));

    // Perpendicular in the tangent plane for arrowhead wings
    const normal = new THREE.Vector3(point.normal[0], point.normal[1], point.normal[2]);
    const arrowPerp = new THREE.Vector3().crossVectors(dir, normal).normalize().multiplyScalar(LEADER_ARROW_WIDTH);
    const arrowLeft = arrowBase.clone().add(arrowPerp);
    const arrowRight = arrowBase.clone().sub(arrowPerp);

    // Elbow point: end of diagonal segment
    const elbowPoint = edgePoint.clone().add(dir.clone().multiplyScalar(LEADER_DIAG_LENGTH));

    // Shelf direction: horizontal (along Z axis for side panels = world right)
    // Use t1 (first tangent) projected onto XZ plane for consistent horizontal direction
    let shelfDir = new THREE.Vector3(t1.x, 0, t1.z).normalize();
    if (shelfDir.lengthSq() < 0.01) shelfDir = new THREE.Vector3(0, 0, 1);
    // Make shelf go rightward (positive Z for side panels)
    if (shelfDir.z < 0) shelfDir.negate();

    const shelfEnd = elbowPoint.clone().add(shelfDir.multiplyScalar(LEADER_SHELF_LENGTH));

    // Label anchor at shelf midpoint (text centered on shelf)
    const shelfMid: [number, number, number] = [
      (elbowPoint.x + shelfEnd.x) / 2,
      (elbowPoint.y + shelfEnd.y) / 2,
      (elbowPoint.z + shelfEnd.z) / 2,
    ];

    return {
      arrowTip, arrowLeft, arrowRight,
      arrowBase, elbowPoint, shelfEnd,
      shelfMid,
    };
  }, [entryCenter, t1, t2, displayRadius, labelAngle, point.normal, isBottomCorner, isTopCorner, isBackLeft, isBackRight]);

  // Display actual bore depth (each bore shows its own drilling depth)
  const displayDepth = point.depth;

  // Hole cylinder geometry: positioned at midpoint between entry and back, oriented along normal
  const holeGeomData = useMemo(() => {
    const radius = point.diameter / 2;
    const n = new THREE.Vector3(point.normal[0], point.normal[1], point.normal[2]);
    // Center of cylinder (midpoint between entry and back face)
    const cx = entryCenter[0] + n.x * depth * 0.5;
    const cy = entryCenter[1] + n.y * depth * 0.5;
    const cz = entryCenter[2] + n.z * depth * 0.5;
    // Quaternion to align cylinder Y-axis with drill normal
    const yAxis = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion();
    if (Math.abs(n.dot(yAxis)) < 0.999) {
      quat.setFromUnitVectors(yAxis, n);
    } else if (n.y < 0) {
      quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    }
    const euler = new THREE.Euler().setFromQuaternion(quat);
    return {
      position: [cx, cy, cz] as [number, number, number],
      rotation: [euler.x, euler.y, euler.z] as [number, number, number],
      radius,
      height: depth,
    };
  }, [entryCenter, point.normal, depth, point.diameter]);

  return (
    <group>
      {/* Solid hole cylinder — dark fill to visualize the bore */}
      <mesh
        position={holeGeomData.position}
        rotation={holeGeomData.rotation}
        renderOrder={995}
      >
        <cylinderGeometry args={[holeGeomData.radius, holeGeomData.radius, holeGeomData.height, 24]} />
        <meshBasicMaterial
          color={style.color}
          transparent
          opacity={0.15}
          depthTest={false}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Entry ellipse — solid, thin */}
      <Line
        points={entryEllipse}
        color={style.color}
        lineWidth={style.lineWidth}
        depthTest={false}
        depthWrite={false}
        renderOrder={1000}
      />

      {/* Back ellipse — dashed */}
      <Line
        points={backEllipse}
        color={style.hiddenColor}
        lineWidth={style.lineWidth * 0.6}
        dashed
        dashScale={1}
        dashSize={2}
        gapSize={1.5}
        depthTest={false}
        depthWrite={false}
        renderOrder={999}
      />

      {/* Generator lines — 2 silhouette edges */}
      {generators.map((pair, i) => (
        <Line
          key={`gen-${i}`}
          points={pair}
          color={style.hiddenColor}
          lineWidth={style.lineWidth * 0.6}
          dashed
          dashScale={1}
          dashSize={3}
          gapSize={2}
          depthTest={false}
          depthWrite={false}
          renderOrder={998}
        />
      ))}

      {/* Center cross — thin solid lines */}
      {crossLines.map((pair, i) => (
        <Line
          key={`cross-${i}`}
          points={pair}
          color={style.color}
          lineWidth={CENTER_LINE_WIDTH}
          depthTest={false}
          depthWrite={false}
          renderOrder={1001}
        />
      ))}

      {/* Leader line — elbow style: V-arrowhead → diagonal → horizontal shelf */}
      {/* Open V-shape arrowhead at bore edge (same style as dimension arrows) */}
      <Line
        points={[leaderData.arrowLeft, leaderData.arrowTip, leaderData.arrowRight]}
        color={style.color}
        lineWidth={0.5}
        depthTest={false}
        depthWrite={false}
        renderOrder={1002}
      />

      {/* Diagonal segment: arrowhead → elbow */}
      <Line
        points={[leaderData.arrowTip, leaderData.elbowPoint]}
        color={style.color}
        lineWidth={0.4}
        depthTest={false}
        depthWrite={false}
        renderOrder={1001}
      />

      {/* Horizontal shelf: elbow → shelf end */}
      <Line
        points={[leaderData.elbowPoint, leaderData.shelfEnd]}
        color={style.color}
        lineWidth={0.4}
        depthTest={false}
        depthWrite={false}
        renderOrder={1001}
      />

      {/* Annotation text — purpose label + Ø dimension on shelf line */}
      <Billboard position={leaderData.shelfMid}>
        {/* Purpose label (D/L/etc.) — above the dimension text */}
        <Text
          fontSize={5}
          color={style.color}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.3}
          outlineColor="#000000"
          position={[0, 5.5, 0]}
        >
          {style.label}
        </Text>
        {/* Ø dimension — bottom edge sits on the shelf line */}
        <Text
          fontSize={5}
          color="#ffffff"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.3}
          outlineColor="#000000"
          position={[0, 0, 0]}
        >
          {`Ø${point.diameter}×${displayDepth}`}
        </Text>
      </Billboard>
    </group>
  );
}

// ============================================
// PANEL GROUP
// ============================================

function DrillPanelGlyphs({ panel }: { panel: DrillMapPanel }) {
  if (!panel.points || panel.points.length === 0) {
    return null;
  }

  return (
    <group name={`drill-glyphs-${panel.panelId}`}>
      {panel.points.map((point) => (
        <DrillGlyph key={point.id} point={point} />
      ))}
    </group>
  );
}

// ============================================
// DIMENSION LINES GROUP
// ============================================

function DimensionLinesGroup({ allPoints, panels }: { allPoints: DrillMapPoint[]; panels: DrillMapPanel[] }) {
  const dims = useMemo(() => {
    // Build panelInfoMap: panel AABB from worldPosition + dimensions
    const panelInfoMap = new Map<string, PanelAABBInfo>();
    for (const panel of panels) {
      const wp = panel.worldPosition;
      const d = panel.dimensions;
      // Panel AABB: worldPosition is the CENTER of the panel box
      // Use worldPosition + dimensions directly (no bore-position refinement)
      const halfW = d.width / 2;
      const halfH = d.height / 2;
      const halfT = d.thickness / 2;

      const role = panel.role;
      let aabbMin: [number, number, number];
      let aabbMax: [number, number, number];

      if (role.includes('SIDE') || role === 'DIVIDER') {
        // Side panel: oriented with face in YZ plane
        // dimensions: width=panelDepth(Z), height=panelHeight(Y), thickness=18mm(X)
        // Use worldPosition directly — it IS the center of the panel box
        aabbMin = [wp[0] - halfT, wp[1] - halfH, wp[2] - halfW];
        aabbMax = [wp[0] + halfT, wp[1] + halfH, wp[2] + halfW];
      } else {
        // Horizontal panel (TOP/BOTTOM/SHELF): face in XZ plane
        // dimensions: width=panelWidth(X), height=panelDepth(Z), thickness=18mm(Y)
        aabbMin = [wp[0] - halfW, wp[1] - halfT, wp[2] - halfH];
        aabbMax = [wp[0] + halfW, wp[1] + halfT, wp[2] + halfH];
      }

      panelInfoMap.set(panel.panelId, { aabbMin, aabbMax, role });
    }

    const result = computeDimensionLines(allPoints, panelInfoMap);
    return result;
  }, [allPoints, panels]);

  if (dims.length === 0) return null;

  return (
    <group name="dimension-lines">
      {dims.map((dim) => (
        <DimensionLine3D key={dim.key} dim={dim} />
      ))}
    </group>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

/**
 * CSGDrillOverlay v5.1 — TARGET J10-style technical drill annotations.
 * Clean dimension labels with leader lines + engineering dimension lines.
 */
export function CSGDrillOverlay({
  drillMap,
  visible,
  filterPurpose,
  hiddenPanelIds,
}: CSGDrillOverlayProps) {
  const hiddenDrillOverlay = useConnectorVisibilityStore((s) => s.hiddenDrillOverlay);
  const isDrillHidden = useCallback((pk?: string) => {
    if (!pk || hiddenDrillOverlay.size === 0) return false;
    const base = pk.replace(/-dowel-(brun-)?(side|horiz|shelf|back)$/, '');
    return hiddenDrillOverlay.has(base);
  }, [hiddenDrillOverlay]);

  // Per-panel filtering: only show drill overlay for the selected panel
  const selectedPanelId = useCabinetStore((s) => s.selectedPanelId);

  const { panelsWithHoles, allDisplayPoints } = useMemo(() => {
    if (!drillMap) return { panelsWithHoles: [], allDisplayPoints: [] };

    const allPoints = drillMap.panels.flatMap((panel) => panel.points ?? []);
    let displayPoints = buildDisplayPoints(allPoints);
    if (filterPurpose && filterPurpose.length > 0) {
      displayPoints = displayPoints.filter((p) => filterPurpose.includes(p.purpose));
    }
    if (hiddenDrillOverlay.size > 0) {
      displayPoints = displayPoints.filter((p) => !isDrillHidden(p.pairKeyV2));
    }
    // Panel visibility filter: hide drill points from hidden panels (prop from Cabinet3D)
    if (hiddenPanelIds && hiddenPanelIds.size > 0) {
      displayPoints = displayPoints.filter((p) => !hiddenPanelIds.has(p.panelId));
    }
    // Per-panel filter: when a panel is selected, show only drill points for that panel
    if (selectedPanelId) {
      displayPoints = displayPoints.filter((p) => p.panelId === selectedPanelId);
    }

    const pointsByPanelId = new Map<string, DrillMapPoint[]>();
    for (const point of displayPoints) {
      const bucket = pointsByPanelId.get(point.panelId);
      if (bucket) bucket.push(point);
      else pointsByPanelId.set(point.panelId, [point]);
    }

    const panels = drillMap.panels
      .map((panel) => ({
        ...panel,
        points: pointsByPanelId.get(panel.panelId) ?? [],
      }))
      .filter((panel) => panel.points.length > 0);

    return { panelsWithHoles: panels, allDisplayPoints: displayPoints };
  }, [drillMap, filterPurpose, hiddenDrillOverlay, isDrillHidden, hiddenPanelIds, selectedPanelId]);

  if (!visible || !drillMap || panelsWithHoles.length === 0) {
    return null;
  }

  return (
    <group name="drill-drawing-overlay-v5.1">
      {/* Per-bore glyphs: ellipse + cross + leader line + label */}
      {panelsWithHoles.map((panel) => (
        <DrillPanelGlyphs key={panel.panelId} panel={panel} />
      ))}

      {/* Engineering dimension lines: spacing + panel edge distances */}
      <DimensionLinesGroup allPoints={allDisplayPoints} panels={panelsWithHoles} />
    </group>
  );
}

export default CSGDrillOverlay;
