/**
 * SPEC-MINIFIX-JOINT-LOGIC v1.0
 * Minifix Placement Resolver
 *
 * Core decision logic for determining CAM and BOLT positions based on:
 * - Joint style (INSET vs OVERLAY)
 * - Joint position (TOP vs BOTTOM)
 * - Panel geometry from topology API
 */

import {
  MinifixPlacement,
  MinifixJointConfig,
  MinifixJointResolution,
  MinifixSpec,
  JointStyle,
  JointPosition,
  FaceRef,
  EdgeRef,
  EdgeFaceRef,
  Vec3,
  DEFAULT_MINIFIX_SPEC,
} from "../../../contracts/minifixJointContracts";
import { validatePlacements } from "../../../contracts/minifixJointGuards";

// ─────────────────────────────────────────────────────────────────────────────
// Topology API Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Panel bounding box in world coordinates
 */
export interface PanelBounds {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  dimensions: Vec3; // [width, height, depth]
}

/**
 * Panel orientation in space
 */
export interface PanelOrientation {
  /** Is this a horizontal panel (top/bottom/shelf)? */
  isHorizontal: boolean;
  /** Is this a vertical panel (side/partition)? */
  isVertical: boolean;
  /** Panel up vector */
  up: Vec3;
  /** Panel right vector */
  right: Vec3;
  /** Panel forward vector (thickness direction) */
  forward: Vec3;
}

/**
 * Topology API for accessing cabinet geometry
 * This interface abstracts the cabinet data model
 */
export interface MinifixTopologyApi {
  /**
   * Get panel bounds in world coordinates
   */
  getPanelBounds(panelId: string): PanelBounds | null;

  /**
   * Get panel orientation
   */
  getPanelOrientation(panelId: string): PanelOrientation | null;

  /**
   * Get panel thickness in mm
   */
  getPanelThickness(panelId: string): number;

  /**
   * Get face reference for a panel
   * @param panelId Panel identifier
   * @param face Which face: "TOP" or "BOTTOM"
   */
  getFaceRef(panelId: string, face: "TOP" | "BOTTOM"): FaceRef | null;

  /**
   * Get edge reference for a panel (DEPRECATED - use getEdgeFaceRef)
   * @param panelId Panel identifier
   * @param edge Which edge: "TOP", "BOTTOM", "FRONT", or "BACK"
   */
  getEdgeRef(panelId: string, edge: "TOP" | "BOTTOM" | "FRONT" | "BACK"): EdgeRef | null;

  /**
   * Get edge-FACE reference for a panel
   * CRITICAL: This returns the edge as a FACE (2D), not a LINE (1D)
   *
   * For BOLT placement:
   * - The edge-face is the surface of the edge that faces the CAM
   * - Its normal points outward from this face
   * - BOLT axis = -normal (drilling INTO the face)
   *
   * @param panelId Panel identifier
   * @param edge Which edge: "TOP" or "BOTTOM" (for vertical panels)
   * @param facingDirection Direction toward the CAM (to pick correct face)
   */
  getEdgeFaceRef(
    panelId: string,
    edge: "TOP" | "BOTTOM",
    facingDirection: Vec3
  ): EdgeFaceRef | null;

  /**
   * Get the length of an edge in mm
   */
  getEdgeLength(panelId: string, edge: "TOP" | "BOTTOM" | "FRONT" | "BACK"): number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Placement Resolution Logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine which face to drill CAM into based on joint configuration
 *
 * 4 Cases:
 * 1. TOP + INSET: CAM on TOP panel BOTTOM face (facing down toward side top edge)
 * 2. TOP + OVERLAY: CAM on TOP panel BOTTOM face (facing down toward side top edge)
 * 3. BOTTOM + INSET: CAM on BOTTOM panel TOP face (facing up toward side bottom edge)
 * 4. BOTTOM + OVERLAY: CAM on BOTTOM panel TOP face (facing up toward side bottom edge)
 */
function getCamFace(position: JointPosition): "TOP" | "BOTTOM" {
  // CAM is always drilled from the face that faces the vertical panel
  return position === "TOP" ? "BOTTOM" : "TOP";
}

/**
 * Determine which edge to drill BOLT into based on joint configuration
 *
 * 4 Cases:
 * 1. TOP + INSET: BOLT on side TOP edge (connecting to top panel)
 * 2. TOP + OVERLAY: BOLT on side TOP edge (connecting to top panel above it)
 * 3. BOTTOM + INSET: BOLT on side BOTTOM edge (connecting to bottom panel)
 * 4. BOTTOM + OVERLAY: BOLT on side BOTTOM edge (connecting to bottom panel below it)
 */
function getBoltEdge(position: JointPosition): "TOP" | "BOTTOM" {
  return position === "TOP" ? "TOP" : "BOTTOM";
}

/**
 * Calculate CAM rotation for proper alignment with BOLT
 * The CAM slot must be oriented so the BOLT can engage
 */
function calculateCamRotation(
  camFaceNormal: Vec3,
  boltAxis: Vec3,
  style: JointStyle
): number {
  // For INSET: CAM slot points toward the side panel
  // For OVERLAY: CAM slot points away from the side panel
  // The rotation aligns the CAM mechanism with the BOLT direction

  // Calculate angle between bolt axis projection on CAM face and reference direction
  // This determines the CAM slot orientation
  // Default: 0 degrees means slot points in +X direction
  // 90 degrees means slot points in +Z direction (depth)

  // For typical cabinet layout:
  // - BOLT comes from side panel (X direction)
  // - CAM face is horizontal (Y normal)
  // - Slot should point toward BOLT
  return style === "INSET" ? 0 : 180;
}

/**
 * Calculate positions along an edge for multiple Minifix units
 */
function calculatePositionsAlongEdge(
  edgeLength: number,
  count: number,
  endSetback: number
): number[] {
  const positions: number[] = [];
  const usableLength = edgeLength - 2 * endSetback;

  if (count === 1) {
    // Single unit: center it
    positions.push(edgeLength / 2);
  } else if (count === 2) {
    // Two units: place at setback from each end
    positions.push(endSetback);
    positions.push(edgeLength - endSetback);
  } else {
    // Multiple units: distribute evenly
    const spacing = usableLength / (count - 1);
    for (let i = 0; i < count; i++) {
      positions.push(endSetback + spacing * i);
    }
  }

  return positions;
}

/**
 * Determine the number of Minifix units needed based on edge length
 */
function calculateMinifixCount(edgeLength: number, endSetback: number): number {
  const usableLength = edgeLength - 2 * endSetback;

  if (usableLength < 100) return 1; // Short edge: single unit
  if (usableLength < 400) return 2; // Medium edge: two units
  if (usableLength < 800) return 3; // Long edge: three units
  return 4; // Very long edge: four units
}

/**
 * Interpolate position along an edge (DEPRECATED - use edge-face instead)
 */
function interpolateEdgePosition(edge: EdgeRef, t: number): Vec3 {
  return [
    edge.start[0] + t * (edge.end[0] - edge.start[0]),
    edge.start[1] + t * (edge.end[1] - edge.start[1]),
    edge.start[2] + t * (edge.end[2] - edge.start[2]),
  ];
}

/**
 * Interpolate position along an edge-FACE's depth bounds
 */
function interpolateEdgeFacePosition(edgeFace: EdgeFaceRef, t: number): Vec3 {
  const { depthStart, depthEnd } = edgeFace.bounds;
  return [
    depthStart[0] + t * (depthEnd[0] - depthStart[0]),
    depthStart[1] + t * (depthEnd[1] - depthStart[1]),
    depthStart[2] + t * (depthEnd[2] - depthStart[2]),
  ];
}

/**
 * Project a point onto a plane defined by a point and normal
 */
function projectPointToPlane(point: Vec3, planePoint: Vec3, planeNormal: Vec3): Vec3 {
  // Vector from plane point to the point
  const v: Vec3 = [
    point[0] - planePoint[0],
    point[1] - planePoint[1],
    point[2] - planePoint[2],
  ];

  // Dot product of v with normal (distance along normal)
  const dist = v[0] * planeNormal[0] + v[1] * planeNormal[1] + v[2] * planeNormal[2];

  // Project point onto plane
  return [
    point[0] - dist * planeNormal[0],
    point[1] - dist * planeNormal[1],
    point[2] - dist * planeNormal[2],
  ];
}

/**
 * Calculate CAM origin based on edge position and offset
 */
function calculateCamOrigin(
  face: FaceRef,
  edgePosition: number,
  edgeLength: number,
  edgeOffset: number,
  style: JointStyle,
  side: "left" | "right",
  bounds: PanelBounds
): Vec3 {
  // The CAM origin is on the horizontal panel face
  // Position along the joint edge (depth direction)
  const tAlongEdge = edgePosition / edgeLength;

  // For horizontal panels, the face center gives us the base position
  // We need to offset from the appropriate edge

  // Calculate position along depth (Z axis typically)
  const depthPos = bounds.min[2] + tAlongEdge * bounds.dimensions[2];

  // Calculate position perpendicular to edge (X direction for side panels)
  // edgeOffset determines how far from the panel edge
  const xOffset = side === "left" ? bounds.min[0] + edgeOffset : bounds.max[0] - edgeOffset;

  // Y position is on the face
  const yPos = face.face === "TOP" ? bounds.max[1] : bounds.min[1];

  return [xOffset, yPos, depthPos];
}

/**
 * Calculate BOLT origin on the edge-FACE
 *
 * CRITICAL FIX: Project CAM origin onto the edge-face plane, then interpolate
 * along the depth axis to get the correct position on the edge-face.
 *
 * This ensures the BOLT is positioned directly aligned with the CAM.
 */
function calculateBoltOriginFromEdgeFace(
  edgeFace: EdgeFaceRef,
  camOrigin: Vec3,
  edgePosition: number,
  edgeLength: number
): Vec3 {
  // Project CAM origin onto the edge-face plane
  const projected = projectPointToPlane(camOrigin, edgeFace.center, edgeFace.normal);

  // Interpolate along the depth direction
  const t = edgePosition / edgeLength;
  const depthPoint = interpolateEdgeFacePosition(edgeFace, t);

  // The BOLT origin is at the projected position's depth but on the edge-face
  // Use the depth (Z) from interpolation, X from edge-face center, Y from edge position
  return [
    edgeFace.center[0], // X: at edge-face center (the face of the side panel)
    depthPoint[1],      // Y: at the edge level (TOP or BOTTOM of side panel)
    depthPoint[2],      // Z: along depth matching CAM position
  ];
}

/**
 * Calculate BOLT drill axis from edge-FACE
 *
 * CRITICAL FIX: The axis is the NEGATIVE of the edge-face normal
 * (drilling INTO the face, not out of it)
 */
function calculateBoltAxisFromEdgeFace(edgeFace: EdgeFaceRef): Vec3 {
  // BOLT drills INTO the edge-face, so axis = -normal
  return [
    -edgeFace.normal[0],
    -edgeFace.normal[1],
    -edgeFace.normal[2],
  ];
}

/**
 * DEPRECATED: Calculate BOLT origin on the vertical panel edge (uses edge LINE)
 */
function calculateBoltOrigin(
  edge: EdgeRef,
  edgePosition: number,
  edgeLength: number
): Vec3 {
  const t = edgePosition / edgeLength;
  return interpolateEdgePosition(edge, t);
}

/**
 * DEPRECATED: Calculate BOLT drill axis (uses panel orientation)
 */
function calculateBoltAxis(
  edge: EdgeRef,
  panelOrientation: PanelOrientation
): Vec3 {
  return panelOrientation.forward;
}

/**
 * Resolve a single Minifix joint configuration into placements
 */
export function resolveMinifixPlacement(
  config: MinifixJointConfig,
  api: MinifixTopologyApi
): MinifixJointResolution {
  const spec: MinifixSpec = {
    ...DEFAULT_MINIFIX_SPEC,
    ...config.spec,
  };

  const placements: MinifixPlacement[] = [];

  // Get panel geometry
  const horizontalBounds = api.getPanelBounds(config.horizontalPanelId);
  const verticalBounds = api.getPanelBounds(config.verticalPanelId);
  const verticalOrientation = api.getPanelOrientation(config.verticalPanelId);

  if (!horizontalBounds || !verticalBounds || !verticalOrientation) {
    return {
      config,
      placements: [],
      validation: {
        valid: false,
        issues: [
          {
            code: "PANEL_NOT_FOUND",
            severity: "error",
            message: "Could not find panel geometry",
          },
        ],
      },
    };
  }

  // Get face and edge references
  const camFaceId = getCamFace(config.position);
  const boltEdgeId = getBoltEdge(config.position);

  const face = api.getFaceRef(config.horizontalPanelId, camFaceId);
  const edgeLegacy = api.getEdgeRef(config.verticalPanelId, boltEdgeId);

  if (!face) {
    return {
      config,
      placements: [],
      validation: {
        valid: false,
        issues: [
          {
            code: "FACE_NOT_FOUND",
            severity: "error",
            message: "Could not get face reference for CAM",
          },
        ],
      },
    };
  }

  // Calculate edge length and number of units
  const edgeLength = api.getEdgeLength(
    config.verticalPanelId,
    boltEdgeId
  );
  const count = config.count ?? calculateMinifixCount(edgeLength, spec.endSetback);
  const positions = calculatePositionsAlongEdge(edgeLength, count, spec.endSetback);

  // Calculate CAM drill axis (opposite to face normal - drilling into panel)
  const camAxis: Vec3 = [
    -face.normal[0],
    -face.normal[1],
    -face.normal[2],
  ];

  // Get edge-FACE reference (the correct 2D face, not 1D line)
  // The facing direction is TOWARD the CAM (opposite of CAM face normal)
  const facingDirection: Vec3 = [
    -face.normal[0],
    -face.normal[1],
    -face.normal[2],
  ];
  const edgeFace = api.getEdgeFaceRef(config.verticalPanelId, boltEdgeId, facingDirection);

  if (!edgeFace) {
    return {
      config,
      placements: [],
      validation: {
        valid: false,
        issues: [
          {
            code: "EDGE_FACE_NOT_FOUND",
            severity: "error",
            message: "Could not get edge-face reference for BOLT",
          },
        ],
      },
    };
  }

  // Calculate BOLT drill axis from edge-FACE normal
  const boltAxis = calculateBoltAxisFromEdgeFace(edgeFace);

  // Calculate CAM rotation
  const camRotation = calculateCamRotation(face.normal, boltAxis, config.style);

  // Create placements for each position
  for (const pos of positions) {
    const camOrigin = calculateCamOrigin(
      face,
      pos,
      edgeLength,
      spec.edgeOffset,
      config.style,
      config.side,
      horizontalBounds
    );

    // Calculate BOLT origin by projecting CAM to edge-face plane
    const boltOrigin = calculateBoltOriginFromEdgeFace(
      edgeFace,
      camOrigin,
      pos,
      edgeLength
    );

    const placement: MinifixPlacement = {
      kind: "MINIFIX_PLACEMENT",
      style: config.style,
      position: config.position,
      cam: {
        panelRole: config.position,
        face,
        axis: camAxis,
        origin: camOrigin,
        rotationDeg: camRotation,
        spec,
      },
      bolt: {
        panelRole: config.side === "left" ? "LEFT_SIDE" : "RIGHT_SIDE",
        edgeFace,
        edge: edgeLegacy ?? undefined, // Keep for backwards compatibility
        axis: boltAxis,
        origin: boltOrigin,
        spec,
      },
    };

    placements.push(placement);
  }

  // Validate placements
  const validation = validatePlacements(placements);

  return {
    config,
    placements,
    validation,
  };
}

/**
 * Resolve multiple joint configurations
 */
export function resolveAllMinifixPlacements(
  configs: MinifixJointConfig[],
  api: MinifixTopologyApi
): MinifixJointResolution[] {
  return configs.map((config) => resolveMinifixPlacement(config, api));
}

/**
 * Auto-detect joint configurations for a cabinet
 * This scans the cabinet structure and creates configs for all TOP/BOTTOM joints
 */
export function autoDetectMinifixJoints(
  cabinetId: string,
  topPanelId: string | null,
  bottomPanelId: string,
  leftSideId: string,
  rightSideId: string,
  style: JointStyle
): MinifixJointConfig[] {
  const configs: MinifixJointConfig[] = [];

  // Bottom-Left joint
  configs.push({
    id: `${cabinetId}-bottom-left`,
    style,
    position: "BOTTOM",
    horizontalPanelId: bottomPanelId,
    verticalPanelId: leftSideId,
    side: "left",
  });

  // Bottom-Right joint
  configs.push({
    id: `${cabinetId}-bottom-right`,
    style,
    position: "BOTTOM",
    horizontalPanelId: bottomPanelId,
    verticalPanelId: rightSideId,
    side: "right",
  });

  // Top joints (if top panel exists)
  if (topPanelId) {
    configs.push({
      id: `${cabinetId}-top-left`,
      style,
      position: "TOP",
      horizontalPanelId: topPanelId,
      verticalPanelId: leftSideId,
      side: "left",
    });

    configs.push({
      id: `${cabinetId}-top-right`,
      style,
      position: "TOP",
      horizontalPanelId: topPanelId,
      verticalPanelId: rightSideId,
      side: "right",
    });
  }

  return configs;
}
