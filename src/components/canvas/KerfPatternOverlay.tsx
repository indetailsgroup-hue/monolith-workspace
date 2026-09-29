/**
 * KerfPatternOverlay — Phase 5
 *
 * Renders kerf cut lines for curved panels in 3-D canvas space.
 *
 * Each KerfPattern describes parallel slot cuts along a panel edge. This
 * component converts pattern positions (mm along-edge) → 3-D line segments
 * in the panel's local centered coordinate space, then renders them as a
 * single LineSegments draw-call for performance.
 *
 * Coordinate conventions (panel local space, origin at panel centre):
 *
 *   SIDE  (LEFT_SIDE / RIGHT_SIDE / DIVIDER)
 *     X = thickness  [-t/2 … +t/2]
 *     Y = height     [-H/2 … +H/2]
 *     Z = width      [-W/2 … +W/2]
 *
 *   HORIZ (TOP / BOTTOM / SHELF / WORKTOP)
 *     X = width      [-W/2 … +W/2]
 *     Y = thickness  [-t/2 … +t/2]
 *     Z = height     [-H/2 … +H/2]
 *
 *   BACK  (BACK / KICKBOARD / and all other roles)
 *     X = width      [-W/2 … +W/2]
 *     Y = height     [-H/2 … +H/2]
 *     Z = thickness  [-t/2 … +t/2]
 *
 * Visible only when `visible=true` AND there is at least one KerfPattern.
 *
 * Spec: .kiro/specs/curved-panel-system/tasks.md §Phase 5
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { CabinetPanel, PanelRole } from '../../core/types/Cabinet';
import type { KerfPattern } from '../../core/manufacturing/curve/kerfPatternGenerator';

// ============================================
// TYPES & CONSTANTS
// ============================================

type RoleGroup = 'SIDE' | 'HORIZ' | 'BACK';

/** Slight stand-off from panel face to avoid z-fighting */
const FACE_OFFSET = 0.5; // mm

const KERF_COLOR = '#ff6600';

// ============================================
// PROPS
// ============================================

export interface KerfPatternOverlayProps {
  panel: CabinetPanel;
  patterns: KerfPattern[];
  visible: boolean;
}

// ============================================
// HELPERS
// ============================================

/**
 * Classify a PanelRole into a coordinate group.
 *
 * SIDE  → thickness on X, height on Y, width on Z
 * HORIZ → width on X, thickness on Y, height on Z
 * BACK  → width on X, height on Y, thickness on Z
 */
function getRoleGroup(role: PanelRole): RoleGroup {
  switch (role) {
    case 'LEFT_SIDE':
    case 'RIGHT_SIDE':
    case 'DIVIDER':
    case 'DRAWER_SIDE':
      return 'SIDE';
    case 'TOP':
    case 'BOTTOM':
    case 'SHELF':
    case 'WORKTOP':
    case 'DRAWER_BOTTOM':
      return 'HORIZ';
    case 'BACK':
    case 'KICKBOARD':
    case 'FRONT':
    case 'DRAWER_FRONT':
    case 'DRAWER_BACK':
    case 'DOOR':
    case 'DOOR_LEFT':
    case 'DOOR_RIGHT':
    default:
      return 'BACK';
  }
}

/**
 * Map one kerf cut → a pair of 3-D points (start, end) in panel local space.
 *
 * @param pattern  - KerfPattern (provides edge, source.arcLengthOuter as zoneDepth)
 * @param position - Cut position (mm) along the edge direction
 * @param group    - Role group of the owning panel
 * @param W        - Panel finish width (mm)
 * @param H        - Panel finish height (mm)
 * @param t        - Panel real thickness (mm)
 * @returns [x1, y1, z1, x2, y2, z2] in panel local centred coordinates
 */
function cutToSegment(
  pattern: KerfPattern,
  position: number,
  group: RoleGroup,
  W: number,
  H: number,
  t: number
): [number, number, number, number, number, number] {
  const edge = pattern.edge;
  // zoneDepth ≈ outer arc length — used as cut depth perpendicular to the edge
  const D = pattern.source.cncParams.endPosition - pattern.source.cncParams.startPosition
    // Fallback: use arcLengthOuter when cncParams span is unreliable
    || pattern.source.arcLengthOuter;
  // Guard: D must be positive
  const depth = Math.max(D, 1);

  const P = position; // along-edge position (mm)

  if (group === 'SIDE') {
    // X=thickness, Y=height, Z=width
    const faceX = t / 2 + FACE_OFFSET;
    switch (edge) {
      case 'TOP':
        return [faceX, H / 2 - depth, P - W / 2,
                faceX, H / 2,         P - W / 2];
      case 'BOTTOM':
        return [faceX, -H / 2,         P - W / 2,
                faceX, -H / 2 + depth, P - W / 2];
      case 'LEFT':
        return [faceX, P - H / 2, -W / 2,
                faceX, P - H / 2, -W / 2 + depth];
      case 'RIGHT':
        return [faceX, P - H / 2, W / 2 - depth,
                faceX, P - H / 2, W / 2];
    }
  } else if (group === 'HORIZ') {
    // X=width, Y=thickness, Z=height
    const faceY = t / 2 + FACE_OFFSET;
    switch (edge) {
      case 'TOP':
        return [P - W / 2, faceY, H / 2 - depth,
                P - W / 2, faceY, H / 2];
      case 'BOTTOM':
        return [P - W / 2, faceY, -H / 2,
                P - W / 2, faceY, -H / 2 + depth];
      case 'LEFT':
        return [-W / 2,         faceY, P - H / 2,
                -W / 2 + depth, faceY, P - H / 2];
      case 'RIGHT':
        return [W / 2 - depth, faceY, P - H / 2,
                W / 2,         faceY, P - H / 2];
    }
  } else {
    // BACK: X=width, Y=height, Z=thickness
    const faceZ = -(t / 2 + FACE_OFFSET);
    switch (edge) {
      case 'TOP':
        return [P - W / 2, H / 2 - depth, faceZ,
                P - W / 2, H / 2,         faceZ];
      case 'BOTTOM':
        return [P - W / 2, -H / 2,         faceZ,
                P - W / 2, -H / 2 + depth, faceZ];
      case 'LEFT':
        return [-W / 2,         P - H / 2, faceZ,
                -W / 2 + depth, P - H / 2, faceZ];
      case 'RIGHT':
        return [W / 2 - depth, P - H / 2, faceZ,
                W / 2,         P - H / 2, faceZ];
    }
  }

  // Should never reach here — TypeScript union is exhaustive above
  return [0, 0, 0, 0, 0, 1];
}

// ============================================
// COMPONENT
// ============================================

/**
 * KerfPatternOverlay
 *
 * Renders all kerf cut lines for a curved panel as a single LineSegments mesh.
 * Should be placed as a child inside the panel's `<group>` in Cabinet3D so it
 * inherits the panel's world position and rotation.
 *
 * @example
 * // Inside Cabinet3D panel group render:
 * <KerfPatternOverlay panel={panel} patterns={kerfPatterns} visible={xrayMode} />
 */
export const KerfPatternOverlay: React.FC<KerfPatternOverlayProps> = ({
  panel,
  patterns,
  visible,
}) => {
  const W = panel.finishWidth;
  const H = panel.finishHeight;
  const t = panel.computed.realThickness;
  const group = getRoleGroup(panel.role);

  const geometry = useMemo(() => {
    if (!visible || patterns.length === 0) return null;

    // Pre-count total segment count: each KerfCut → 2 vertices (6 floats)
    const totalCuts = patterns.reduce((acc, p) => acc + p.cuts.length, 0);
    if (totalCuts === 0) return null;

    const positions = new Float32Array(totalCuts * 6); // 2 pts × 3 coords
    let idx = 0;

    for (const pattern of patterns) {
      for (const cut of pattern.cuts) {
        const seg = cutToSegment(pattern, cut.position, group, W, H, t);
        positions[idx++] = seg[0];
        positions[idx++] = seg[1];
        positions[idx++] = seg[2];
        positions[idx++] = seg[3];
        positions[idx++] = seg[4];
        positions[idx++] = seg[5];
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [visible, patterns, group, W, H, t]);

  if (!visible || !geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color={KERF_COLOR}
        depthTest={false}
        transparent
        opacity={0.85}
        toneMapped={false}
      />
    </lineSegments>
  );
};

export default KerfPatternOverlay;
