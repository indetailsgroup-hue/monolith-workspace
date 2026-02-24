/**
 * SPEC-MINIFIX-JOINT-LOGIC v1.0
 * Cabinet Topology API Implementation
 *
 * Implements MinifixTopologyApi for the Cabinet data model
 */

import { Cabinet, CabinetPanel, PanelRole } from "../../types/Cabinet";
import {
  Vec3,
  FaceRef,
  EdgeRef,
  EdgeFaceRef,
  JointStyle,
  MinifixJointConfig,
} from "../../../contracts/minifixJointContracts";
import {
  MinifixTopologyApi,
  PanelBounds,
  PanelOrientation,
} from "./resolveMinifixPlacement";

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get panel by ID from cabinet
 */
function getPanelById(cabinet: Cabinet, panelId: string): CabinetPanel | null {
  return cabinet.panels.find((p) => p.id === panelId) ?? null;
}

/**
 * Get panel by role from cabinet
 */
function getPanelByRole(cabinet: Cabinet, role: PanelRole): CabinetPanel | null {
  return cabinet.panels.find((p) => p.role === role) ?? null;
}

/**
 * Check if a panel role is horizontal (top, bottom, shelf)
 */
function isHorizontalRole(role: PanelRole): boolean {
  return ["TOP", "BOTTOM", "SHELF"].includes(role);
}

/**
 * Check if a panel role is vertical (sides, dividers)
 */
function isVerticalRole(role: PanelRole): boolean {
  return ["LEFT_SIDE", "RIGHT_SIDE", "DIVIDER"].includes(role);
}

/**
 * Calculate panel bounds from position and dimensions
 * Panel position is at the center of the panel
 */
function calculatePanelBounds(panel: CabinetPanel): PanelBounds {
  const thickness = panel.computed.realThickness;
  const width = panel.finishWidth;
  const height = panel.finishHeight;

  // Determine panel orientation based on role
  const isHorizontal = isHorizontalRole(panel.role);

  // Panel dimensions in world space
  // For horizontal panels (top/bottom): width=X, thickness=Y, height=Z (depth)
  // For vertical panels (sides): thickness=X, height=Y, width=Z (depth)

  let worldDimensions: Vec3;
  if (isHorizontal) {
    // Horizontal panel: lies flat
    // finishWidth = X dimension (cabinet width)
    // realThickness = Y dimension (panel thickness)
    // finishHeight = Z dimension (cabinet depth)
    worldDimensions = [width, thickness, height];
  } else {
    // Vertical panel: stands upright
    // realThickness = X dimension (panel thickness)
    // finishHeight = Y dimension (cabinet height)
    // finishWidth = Z dimension (cabinet depth)
    worldDimensions = [thickness, height, width];
  }

  const halfDims: Vec3 = [
    worldDimensions[0] / 2,
    worldDimensions[1] / 2,
    worldDimensions[2] / 2,
  ];

  const pos = panel.position;

  return {
    min: [pos[0] - halfDims[0], pos[1] - halfDims[1], pos[2] - halfDims[2]],
    max: [pos[0] + halfDims[0], pos[1] + halfDims[1], pos[2] + halfDims[2]],
    center: [pos[0], pos[1], pos[2]],
    dimensions: worldDimensions,
  };
}

/**
 * Get panel orientation vectors
 */
function calculatePanelOrientation(panel: CabinetPanel): PanelOrientation {
  const isHorizontal = isHorizontalRole(panel.role);
  const isVertical = isVerticalRole(panel.role);

  if (isHorizontal) {
    // Horizontal panel
    return {
      isHorizontal: true,
      isVertical: false,
      up: [0, 1, 0], // Y+
      right: [1, 0, 0], // X+
      forward: [0, 0, 1], // Z+ (depth direction)
    };
  } else if (isVertical) {
    // Vertical panel (side)
    const isLeftSide = panel.role === "LEFT_SIDE";
    return {
      isHorizontal: false,
      isVertical: true,
      up: [0, 1, 0], // Y+
      right: [0, 0, 1], // Z+ (depth direction)
      forward: isLeftSide ? [1, 0, 0] : [-1, 0, 0], // X+ for left, X- for right (inward)
    };
  } else {
    // Default orientation
    return {
      isHorizontal: false,
      isVertical: false,
      up: [0, 1, 0],
      right: [1, 0, 0],
      forward: [0, 0, 1],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Topology API Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a MinifixTopologyApi for a specific cabinet
 */
export function createCabinetTopologyApi(cabinet: Cabinet): MinifixTopologyApi {
  return {
    getPanelBounds(panelId: string): PanelBounds | null {
      const panel = getPanelById(cabinet, panelId);
      if (!panel) return null;
      return calculatePanelBounds(panel);
    },

    getPanelOrientation(panelId: string): PanelOrientation | null {
      const panel = getPanelById(cabinet, panelId);
      if (!panel) return null;
      return calculatePanelOrientation(panel);
    },

    getPanelThickness(panelId: string): number {
      const panel = getPanelById(cabinet, panelId);
      if (!panel) return 18; // Default
      return panel.computed.realThickness;
    },

    getFaceRef(panelId: string, face: "TOP" | "BOTTOM"): FaceRef | null {
      const panel = getPanelById(cabinet, panelId);
      if (!panel) return null;

      const bounds = calculatePanelBounds(panel);

      // Face normal depends on which face
      // TOP face normal points up (+Y), BOTTOM face normal points down (-Y)
      const normal: Vec3 = face === "TOP" ? [0, 1, 0] : [0, -1, 0];

      // Face center is at panel center but at the appropriate Y level
      const center: Vec3 = [
        bounds.center[0],
        face === "TOP" ? bounds.max[1] : bounds.min[1],
        bounds.center[2],
      ];

      return {
        kind: "FACE_REF",
        panelId,
        face,
        normal,
        center,
      };
    },

    getEdgeRef(
      panelId: string,
      edge: "TOP" | "BOTTOM" | "FRONT" | "BACK"
    ): EdgeRef | null {
      const panel = getPanelById(cabinet, panelId);
      if (!panel) return null;

      const bounds = calculatePanelBounds(panel);
      const isVertical = isVerticalRole(panel.role);

      if (!isVertical) {
        // Horizontal panels don't have meaningful edges for Minifix
        return null;
      }

      // For vertical panels (sides):
      // TOP edge: at max Y, runs along Z (depth)
      // BOTTOM edge: at min Y, runs along Z (depth)
      // FRONT edge: at min Z, runs along Y (height)
      // BACK edge: at max Z, runs along Y (height)

      let start: Vec3;
      let end: Vec3;
      let direction: Vec3;

      switch (edge) {
        case "TOP":
          start = [bounds.center[0], bounds.max[1], bounds.min[2]];
          end = [bounds.center[0], bounds.max[1], bounds.max[2]];
          direction = [0, 0, 1];
          break;
        case "BOTTOM":
          start = [bounds.center[0], bounds.min[1], bounds.min[2]];
          end = [bounds.center[0], bounds.min[1], bounds.max[2]];
          direction = [0, 0, 1];
          break;
        case "FRONT":
          start = [bounds.center[0], bounds.min[1], bounds.min[2]];
          end = [bounds.center[0], bounds.max[1], bounds.min[2]];
          direction = [0, 1, 0];
          break;
        case "BACK":
          start = [bounds.center[0], bounds.min[1], bounds.max[2]];
          end = [bounds.center[0], bounds.max[1], bounds.max[2]];
          direction = [0, 1, 0];
          break;
      }

      return {
        kind: "EDGE_REF",
        panelId,
        edge,
        direction,
        start,
        end,
      };
    },

    /**
     * Get edge-FACE reference for a vertical panel
     *
     * CRITICAL: This returns the edge as a 2D FACE, not a 1D LINE
     *
     * The edge-face is the NARROW FACE (end-grain) at the edge of the side panel
     * that faces INWARD toward the CAM on the horizontal panel.
     *
     * For LEFT_SIDE panel:
     * - Edge-face normal points RIGHT (+X) toward cabinet center
     * - BOLT drills LEFT (-X) into the panel
     *
     * For RIGHT_SIDE panel:
     * - Edge-face normal points LEFT (-X) toward cabinet center
     * - BOLT drills RIGHT (+X) into the panel
     *
     * @param facingDirection Direction toward the CAM (used to pick correct face orientation)
     */
    getEdgeFaceRef(
      panelId: string,
      edge: "TOP" | "BOTTOM",
      facingDirection: Vec3
    ): EdgeFaceRef | null {
      const panel = getPanelById(cabinet, panelId);
      if (!panel) return null;

      const bounds = calculatePanelBounds(panel);
      const isVertical = isVerticalRole(panel.role);

      if (!isVertical) {
        // Only vertical panels have meaningful edge-faces for Minifix BOLT
        return null;
      }

      // For vertical panels (sides):
      // The edge-face is the NARROW FACE at the edge that faces INWARD toward the CAM
      // This is NOT the top/bottom surface - it's the end-grain face!
      //
      // For LEFT_SIDE panel: edge-face normal points RIGHT (+X) toward cabinet center
      // For RIGHT_SIDE panel: edge-face normal points LEFT (-X) toward cabinet center
      // BOLT drills horizontally INTO this face (axis = -normal)

      const isLeftSide = panel.role === "LEFT_SIDE";

      let normal: Vec3;
      let center: Vec3;
      let depthStart: Vec3;
      let depthEnd: Vec3;

      // The inward-facing X position (inner edge of the side panel)
      const innerX = isLeftSide ? bounds.max[0] : bounds.min[0];

      // Normal points INWARD toward cabinet center
      normal = isLeftSide ? [1, 0, 0] : [-1, 0, 0];

      if (edge === "TOP") {
        // TOP edge-face of side panel
        // The narrow face at the TOP that faces inward
        center = [innerX, bounds.max[1], bounds.center[2]];
        depthStart = [innerX, bounds.max[1], bounds.min[2]];
        depthEnd = [innerX, bounds.max[1], bounds.max[2]];
      } else {
        // BOTTOM edge-face of side panel
        // The narrow face at the BOTTOM that faces inward
        center = [innerX, bounds.min[1], bounds.center[2]];
        depthStart = [innerX, bounds.min[1], bounds.min[2]];
        depthEnd = [innerX, bounds.min[1], bounds.max[2]];
      }

      // Calculate depth length (Z dimension)
      const depthLength = bounds.dimensions[2];

      return {
        kind: "EDGE_FACE_REF",
        panelId,
        edge,
        normal,
        center,
        bounds: {
          depthStart,
          depthEnd,
          depthLength,
        },
      };
    },

    getEdgeLength(
      panelId: string,
      edge: "TOP" | "BOTTOM" | "FRONT" | "BACK"
    ): number {
      const panel = getPanelById(cabinet, panelId);
      if (!panel) return 0;

      // For vertical panels:
      // TOP/BOTTOM edges run along depth (finishWidth for side panels)
      // FRONT/BACK edges run along height (finishHeight)
      if (edge === "TOP" || edge === "BOTTOM") {
        return panel.finishWidth; // This is depth for side panels
      } else {
        return panel.finishHeight;
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cabinet Joint Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auto-detect all Minifix joint configurations for a cabinet
 */
export function detectCabinetMinifixJoints(cabinet: Cabinet): MinifixJointConfig[] {
  const configs: MinifixJointConfig[] = [];

  // Find structural panels
  const topPanel = getPanelByRole(cabinet, "TOP");
  const bottomPanel = getPanelByRole(cabinet, "BOTTOM");
  const leftSide = getPanelByRole(cabinet, "LEFT_SIDE");
  const rightSide = getPanelByRole(cabinet, "RIGHT_SIDE");

  // Determine joint style from cabinet structure
  const topStyle: JointStyle = cabinet.structure.topJoint === "INSET" ? "INSET" : "OVERLAY";
  const bottomStyle: JointStyle = cabinet.structure.bottomJoint === "INSET" ? "INSET" : "OVERLAY";

  // Bottom joints (bottom panel to side panels)
  if (bottomPanel && leftSide) {
    configs.push({
      id: `${cabinet.id}-bottom-left`,
      style: bottomStyle,
      position: "BOTTOM",
      horizontalPanelId: bottomPanel.id,
      verticalPanelId: leftSide.id,
      side: "left",
    });
  }

  if (bottomPanel && rightSide) {
    configs.push({
      id: `${cabinet.id}-bottom-right`,
      style: bottomStyle,
      position: "BOTTOM",
      horizontalPanelId: bottomPanel.id,
      verticalPanelId: rightSide.id,
      side: "right",
    });
  }

  // Top joints (top panel to side panels)
  if (topPanel && leftSide) {
    configs.push({
      id: `${cabinet.id}-top-left`,
      style: topStyle,
      position: "TOP",
      horizontalPanelId: topPanel.id,
      verticalPanelId: leftSide.id,
      side: "left",
    });
  }

  if (topPanel && rightSide) {
    configs.push({
      id: `${cabinet.id}-top-right`,
      style: topStyle,
      position: "TOP",
      horizontalPanelId: topPanel.id,
      verticalPanelId: rightSide.id,
      side: "right",
    });
  }

  // Shelf joints (each shelf to side panels)
  const shelves = cabinet.panels.filter((p) => p.role === "SHELF");
  for (const shelf of shelves) {
    if (leftSide) {
      configs.push({
        id: `${cabinet.id}-shelf-${shelf.id}-left`,
        style: "INSET", // Shelves are always inset
        position: "BOTTOM", // Shelf connects like a bottom panel (CAM on top face)
        horizontalPanelId: shelf.id,
        verticalPanelId: leftSide.id,
        side: "left",
      });
    }

    if (rightSide) {
      configs.push({
        id: `${cabinet.id}-shelf-${shelf.id}-right`,
        style: "INSET",
        position: "BOTTOM",
        horizontalPanelId: shelf.id,
        verticalPanelId: rightSide.id,
        side: "right",
      });
    }
  }

  return configs;
}

/**
 * Get panel IDs by role for a cabinet
 */
export function getCabinetPanelIds(cabinet: Cabinet): {
  topId: string | null;
  bottomId: string | null;
  leftSideId: string | null;
  rightSideId: string | null;
  shelfIds: string[];
  dividerId: string[];
} {
  const topPanel = getPanelByRole(cabinet, "TOP");
  const bottomPanel = getPanelByRole(cabinet, "BOTTOM");
  const leftSide = getPanelByRole(cabinet, "LEFT_SIDE");
  const rightSide = getPanelByRole(cabinet, "RIGHT_SIDE");

  return {
    topId: topPanel?.id ?? null,
    bottomId: bottomPanel?.id ?? null,
    leftSideId: leftSide?.id ?? null,
    rightSideId: rightSide?.id ?? null,
    shelfIds: cabinet.panels.filter((p) => p.role === "SHELF").map((p) => p.id),
    dividerId: cabinet.panels.filter((p) => p.role === "DIVIDER").map((p) => p.id),
  };
}
