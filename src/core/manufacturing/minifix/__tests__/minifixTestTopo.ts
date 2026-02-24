/**
 * SPEC-MINIFIX-JOINT-LOGIC v1.0
 * Test Topology Stub
 *
 * Provides deterministic topology for unit testing placement logic
 * without depending on real mesh geometry.
 */

import {
  FaceRef,
  EdgeRef,
  EdgeFaceRef,
  Vec3,
  JointPosition,
  JointStyle,
  MinifixSpec,
  DEFAULT_MINIFIX_SPEC,
} from '../../../../contracts/minifixJointContracts';
import {
  MinifixTopologyApi,
  PanelBounds,
  PanelOrientation,
} from '../resolveMinifixPlacement';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create Vec3 tuple
 */
const V = (x: number, y: number, z: number): Vec3 => [x, y, z];

/**
 * Create test FaceRef
 */
export function makeTestFaceRef(args: {
  panelId: string;
  face: 'TOP' | 'BOTTOM';
  normal: Vec3;
  center?: Vec3;
}): FaceRef {
  return {
    kind: 'FACE_REF',
    panelId: args.panelId,
    face: args.face,
    normal: args.normal,
    center: args.center ?? V(0, 0, 0),
  };
}

/**
 * Create test EdgeRef
 */
export function makeTestEdgeRef(args: {
  panelId: string;
  edge: 'TOP' | 'BOTTOM' | 'FRONT' | 'BACK';
  direction: Vec3;
  start?: Vec3;
  end?: Vec3;
}): EdgeRef {
  return {
    kind: 'EDGE_REF',
    panelId: args.panelId,
    edge: args.edge,
    direction: args.direction,
    start: args.start ?? V(0, 0, 0),
    end: args.end ?? V(0, 0, 500),
  };
}

/**
 * Create test EdgeFaceRef
 */
export function makeTestEdgeFaceRef(args: {
  panelId: string;
  edge: 'TOP' | 'BOTTOM';
  normal: Vec3;
  center: Vec3;
  depthStart: Vec3;
  depthEnd: Vec3;
  depthLength: number;
}): EdgeFaceRef {
  return {
    kind: 'EDGE_FACE_REF',
    panelId: args.panelId,
    edge: args.edge,
    normal: args.normal,
    center: args.center,
    bounds: {
      depthStart: args.depthStart,
      depthEnd: args.depthEnd,
      depthLength: args.depthLength,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Cabinet Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard test cabinet dimensions (mm)
 */
export const TEST_CABINET = {
  width: 600,
  height: 720,
  depth: 560,
  thickness: 18,
};

/**
 * Panel IDs for test cabinet
 */
export const TEST_PANEL_IDS = {
  top: 'test-panel-top',
  bottom: 'test-panel-bottom',
  leftSide: 'test-panel-left',
  rightSide: 'test-panel-right',
};

// ─────────────────────────────────────────────────────────────────────────────
// Test Topology Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a test topology API with predictable geometry
 *
 * Canonical coordinate system for tests:
 * - X: Width (left = negative, right = positive)
 * - Y: Height (bottom = 0, top = positive)
 * - Z: Depth (back = 0, front = positive)
 *
 * Panel positions:
 * - TOP panel: Y = height - thickness/2
 * - BOTTOM panel: Y = thickness/2
 * - LEFT_SIDE: X = -width/2 + thickness/2
 * - RIGHT_SIDE: X = +width/2 - thickness/2
 */
export function createTestTopologyApi(config: {
  width?: number;
  height?: number;
  depth?: number;
  thickness?: number;
} = {}): MinifixTopologyApi {
  const {
    width = TEST_CABINET.width,
    height = TEST_CABINET.height,
    depth = TEST_CABINET.depth,
    thickness = TEST_CABINET.thickness,
  } = config;

  // Pre-calculate panel positions
  const panelPositions = {
    [TEST_PANEL_IDS.top]: V(0, height - thickness / 2, depth / 2),
    [TEST_PANEL_IDS.bottom]: V(0, thickness / 2, depth / 2),
    [TEST_PANEL_IDS.leftSide]: V(-width / 2 + thickness / 2, height / 2, depth / 2),
    [TEST_PANEL_IDS.rightSide]: V(width / 2 - thickness / 2, height / 2, depth / 2),
  };

  // Panel bounds
  const panelBounds: Record<string, PanelBounds> = {
    [TEST_PANEL_IDS.top]: {
      min: V(-width / 2, height - thickness, 0),
      max: V(width / 2, height, depth),
      center: panelPositions[TEST_PANEL_IDS.top],
      dimensions: V(width, thickness, depth),
    },
    [TEST_PANEL_IDS.bottom]: {
      min: V(-width / 2, 0, 0),
      max: V(width / 2, thickness, depth),
      center: panelPositions[TEST_PANEL_IDS.bottom],
      dimensions: V(width, thickness, depth),
    },
    [TEST_PANEL_IDS.leftSide]: {
      min: V(-width / 2, 0, 0),
      max: V(-width / 2 + thickness, height, depth),
      center: panelPositions[TEST_PANEL_IDS.leftSide],
      dimensions: V(thickness, height, depth),
    },
    [TEST_PANEL_IDS.rightSide]: {
      min: V(width / 2 - thickness, 0, 0),
      max: V(width / 2, height, depth),
      center: panelPositions[TEST_PANEL_IDS.rightSide],
      dimensions: V(thickness, height, depth),
    },
  };

  // Panel orientations
  const panelOrientations: Record<string, PanelOrientation> = {
    [TEST_PANEL_IDS.top]: {
      isHorizontal: true,
      isVertical: false,
      up: V(0, 1, 0),
      right: V(1, 0, 0),
      forward: V(0, 0, 1),
    },
    [TEST_PANEL_IDS.bottom]: {
      isHorizontal: true,
      isVertical: false,
      up: V(0, 1, 0),
      right: V(1, 0, 0),
      forward: V(0, 0, 1),
    },
    [TEST_PANEL_IDS.leftSide]: {
      isHorizontal: false,
      isVertical: true,
      up: V(0, 1, 0),
      right: V(0, 0, 1),
      forward: V(1, 0, 0), // Points inward (toward center)
    },
    [TEST_PANEL_IDS.rightSide]: {
      isHorizontal: false,
      isVertical: true,
      up: V(0, 1, 0),
      right: V(0, 0, 1),
      forward: V(-1, 0, 0), // Points inward (toward center)
    },
  };

  return {
    getPanelBounds(panelId: string): PanelBounds | null {
      return panelBounds[panelId] ?? null;
    },

    getPanelOrientation(panelId: string): PanelOrientation | null {
      return panelOrientations[panelId] ?? null;
    },

    getPanelThickness(_panelId: string): number {
      return thickness;
    },

    getFaceRef(panelId: string, face: 'TOP' | 'BOTTOM'): FaceRef | null {
      const bounds = panelBounds[panelId];
      if (!bounds) return null;

      // For horizontal panels: TOP face normal = +Y, BOTTOM face normal = -Y
      // For vertical panels: This doesn't apply (no face drilling on sides)
      const normal: Vec3 = face === 'TOP' ? V(0, 1, 0) : V(0, -1, 0);
      const center: Vec3 = V(
        bounds.center[0],
        face === 'TOP' ? bounds.max[1] : bounds.min[1],
        bounds.center[2]
      );

      return makeTestFaceRef({ panelId, face, normal, center });
    },

    getEdgeRef(panelId: string, edge: 'TOP' | 'BOTTOM' | 'FRONT' | 'BACK'): EdgeRef | null {
      const bounds = panelBounds[panelId];
      const orientation = panelOrientations[panelId];
      if (!bounds || !orientation || !orientation.isVertical) return null;

      // For vertical panels, edges are on the boundaries
      const x = bounds.center[0];
      let start: Vec3;
      let end: Vec3;
      const direction: Vec3 = V(0, 0, 1); // Edges run along depth

      if (edge === 'TOP') {
        start = V(x, bounds.max[1], bounds.min[2]);
        end = V(x, bounds.max[1], bounds.max[2]);
      } else if (edge === 'BOTTOM') {
        start = V(x, bounds.min[1], bounds.min[2]);
        end = V(x, bounds.min[1], bounds.max[2]);
      } else {
        // FRONT/BACK edges - not typically used for Minifix
        return null;
      }

      return makeTestEdgeRef({ panelId, edge, direction, start, end });
    },

    getEdgeFaceRef(
      panelId: string,
      edge: 'TOP' | 'BOTTOM',
      _facingDirection: Vec3
    ): EdgeFaceRef | null {
      const bounds = panelBounds[panelId];
      const orientation = panelOrientations[panelId];
      if (!bounds || !orientation || !orientation.isVertical) return null;

      // For vertical panels (sides):
      // The edge-face is the NARROW FACE at the edge that faces INWARD toward the CAM
      // This is NOT the top/bottom surface - it's the end-grain face!
      //
      // For LEFT_SIDE panel: edge-face normal points RIGHT (+X) toward cabinet center
      // For RIGHT_SIDE panel: edge-face normal points LEFT (-X) toward cabinet center
      // BOLT drills horizontally INTO this face (axis = -normal)

      const isLeftSide = panelId === TEST_PANEL_IDS.leftSide;

      // The inward-facing X position (inner edge of the side panel)
      const innerX = isLeftSide ? bounds.max[0] : bounds.min[0];

      // Normal points INWARD toward cabinet center
      const normal: Vec3 = isLeftSide ? V(1, 0, 0) : V(-1, 0, 0);

      let center: Vec3;
      let depthStart: Vec3;
      let depthEnd: Vec3;

      if (edge === 'TOP') {
        // TOP edge-face: narrow face at the TOP that faces inward
        center = V(innerX, bounds.max[1], bounds.center[2]);
        depthStart = V(innerX, bounds.max[1], bounds.min[2]);
        depthEnd = V(innerX, bounds.max[1], bounds.max[2]);
      } else {
        // BOTTOM edge-face: narrow face at the BOTTOM that faces inward
        center = V(innerX, bounds.min[1], bounds.center[2]);
        depthStart = V(innerX, bounds.min[1], bounds.min[2]);
        depthEnd = V(innerX, bounds.min[1], bounds.max[2]);
      }

      return makeTestEdgeFaceRef({
        panelId,
        edge,
        normal,
        center,
        depthStart,
        depthEnd,
        depthLength: depth,
      });
    },

    getEdgeLength(panelId: string, edge: 'TOP' | 'BOTTOM' | 'FRONT' | 'BACK'): number {
      if (edge === 'TOP' || edge === 'BOTTOM') {
        return depth;
      }
      return height;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Spec Configurations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard Minifix 15 spec for testing
 */
export const TEST_SPEC_MINIFIX_15: MinifixSpec = {
  ...DEFAULT_MINIFIX_SPEC,
  camDiameter: 15,
  camDepth: 13.5,
  boltDiameter: 5,
  boltDepth: 34,
  edgeOffset: 37,
  endSetback: 50,
};

/**
 * S200 Minifix spec for testing
 */
export const TEST_SPEC_S200: MinifixSpec = {
  ...DEFAULT_MINIFIX_SPEC,
  camDiameter: 15,
  camDepth: 13.5,       // 13.5mm for 18mm wood per Häfele FF 3.10
  boltDiameter: 10,
  boltDepth: 17.5,
  edgeOffset: 9,
  endSetback: 50,
};
