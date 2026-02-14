/**
 * SPEC-MINIFIX-JOINT-LOGIC v1.0
 * Minifix Joint Guards - Validation functions
 */

import {
  MinifixPlacement,
  MinifixSpec,
  ValidationResult,
  ValidationIssue,
  FaceRef,
  EdgeRef,
  EdgeFaceRef,
  Vec3,
  DEFAULT_MINIFIX_SPEC,
} from "./minifixJointContracts";

// ─────────────────────────────────────────────────────────────────────────────
// Vector Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate dot product of two Vec3
 */
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Calculate magnitude of Vec3
 */
export function magnitude(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

/**
 * Normalize Vec3
 */
export function normalize(v: Vec3): Vec3 {
  const mag = magnitude(v);
  if (mag === 0) return [0, 0, 0];
  return [v[0] / mag, v[1] / mag, v[2] / mag];
}

/**
 * Check if two vectors are perpendicular (within tolerance)
 */
export function isPerpendicular(a: Vec3, b: Vec3, tolerance = 0.001): boolean {
  return Math.abs(dot(normalize(a), normalize(b))) < tolerance;
}

/**
 * Check if two vectors are parallel (within tolerance)
 * Returns true for both same direction AND opposite direction
 */
export function isParallel(a: Vec3, b: Vec3, tolerance = 0.001): boolean {
  const d = Math.abs(dot(normalize(a), normalize(b)));
  return d > 1 - tolerance;
}

/**
 * Check if two vectors point in the SAME direction (not opposite)
 * This is stricter than isParallel - requires positive dot product
 */
export function isSameDirection(a: Vec3, b: Vec3, tolerance = 0.001): boolean {
  const d = dot(normalize(a), normalize(b));
  return d > 1 - tolerance; // Must be close to +1 (same direction)
}

/**
 * Distance between two points
 */
export function distance(a: Vec3, b: Vec3): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Guards
// ─────────────────────────────────────────────────────────────────────────────

export function isFaceRef(obj: unknown): obj is FaceRef {
  if (!obj || typeof obj !== "object") return false;
  const ref = obj as FaceRef;
  return (
    ref.kind === "FACE_REF" &&
    typeof ref.panelId === "string" &&
    (ref.face === "TOP" || ref.face === "BOTTOM") &&
    Array.isArray(ref.normal) &&
    ref.normal.length === 3 &&
    Array.isArray(ref.center) &&
    ref.center.length === 3
  );
}

export function isEdgeRef(obj: unknown): obj is EdgeRef {
  if (!obj || typeof obj !== "object") return false;
  const ref = obj as EdgeRef;
  return (
    ref.kind === "EDGE_REF" &&
    typeof ref.panelId === "string" &&
    ["TOP", "BOTTOM", "FRONT", "BACK"].includes(ref.edge) &&
    Array.isArray(ref.direction) &&
    ref.direction.length === 3 &&
    Array.isArray(ref.start) &&
    ref.start.length === 3 &&
    Array.isArray(ref.end) &&
    ref.end.length === 3
  );
}

export function isEdgeFaceRef(obj: unknown): obj is EdgeFaceRef {
  if (!obj || typeof obj !== "object") return false;
  const ref = obj as EdgeFaceRef;
  return (
    ref.kind === "EDGE_FACE_REF" &&
    typeof ref.panelId === "string" &&
    ["TOP", "BOTTOM"].includes(ref.edge) &&
    Array.isArray(ref.normal) &&
    ref.normal.length === 3 &&
    Array.isArray(ref.center) &&
    ref.center.length === 3 &&
    ref.bounds !== undefined &&
    Array.isArray(ref.bounds.depthStart) &&
    Array.isArray(ref.bounds.depthEnd)
  );
}

export function isMinifixPlacement(obj: unknown): obj is MinifixPlacement {
  if (!obj || typeof obj !== "object") return false;
  const p = obj as MinifixPlacement;
  return (
    p.kind === "MINIFIX_PLACEMENT" &&
    (p.style === "INSET" || p.style === "OVERLAY") &&
    (p.position === "TOP" || p.position === "BOTTOM") &&
    p.cam !== undefined &&
    p.bolt !== undefined
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate that CAM axis is opposite to face normal (drilling into face)
 */
export function validateCamAxis(placement: MinifixPlacement): ValidationIssue | null {
  const { cam } = placement;

  // CAM axis should be opposite to face normal (drilling into the panel)
  // The expected axis is -normal (pointing into the panel)
  const expectedAxis: Vec3 = [
    -cam.face.normal[0],
    -cam.face.normal[1],
    -cam.face.normal[2],
  ];

  // Use isSameDirection to ensure the axis points in the SAME direction as expected
  // (not just parallel, which would allow opposite direction)
  if (!isSameDirection(cam.axis, expectedAxis)) {
    return {
      code: "CAM_AXIS_INVALID",
      severity: "error",
      message: `CAM drill axis must be opposite to face normal. Expected ${JSON.stringify(expectedAxis)}, got ${JSON.stringify(cam.axis)}`,
      location: { placement },
    };
  }

  return null;
}

/**
 * Validate that BOLT axis is opposite to edge-face normal (drilling INTO face)
 *
 * The BOLT drills INTO the edge-face, so:
 * - axis should be opposite to edgeFace.normal (same direction as -normal)
 */
export function validateBoltAxis(placement: MinifixPlacement): ValidationIssue | null {
  const { bolt } = placement;

  // If we have edgeFace (new format), validate axis = -edgeFace.normal
  if (bolt.edgeFace) {
    const expectedAxis: Vec3 = [
      -bolt.edgeFace.normal[0],
      -bolt.edgeFace.normal[1],
      -bolt.edgeFace.normal[2],
    ];

    if (!isSameDirection(bolt.axis, expectedAxis)) {
      return {
        code: "BOLT_AXIS_INVALID",
        severity: "error",
        message: `BOLT drill axis must be opposite to edge-face normal. Expected ${JSON.stringify(expectedAxis)}, got ${JSON.stringify(bolt.axis)}`,
        location: { placement },
      };
    }
  } else if (bolt.edge) {
    // Legacy fallback: BOLT axis should be perpendicular to edge direction
    if (!isPerpendicular(bolt.axis, bolt.edge.direction)) {
      return {
        code: "BOLT_AXIS_INVALID",
        severity: "error",
        message: `BOLT drill axis must be perpendicular to edge direction`,
        location: { placement },
      };
    }
  }

  return null;
}

/**
 * Validate CAM and BOLT are properly aligned for connection
 */
export function validateAlignment(placement: MinifixPlacement): ValidationIssue | null {
  const { cam, bolt } = placement;

  // The CAM center and BOLT origin should be close enough for the hardware to connect
  const maxDistance = cam.spec.boltDepth + 10; // Allow some tolerance
  const dist = distance(cam.origin, bolt.origin);

  if (dist > maxDistance) {
    return {
      code: "ALIGNMENT_TOO_FAR",
      severity: "error",
      message: `CAM and BOLT origins are ${dist.toFixed(1)}mm apart, max allowed is ${maxDistance}mm`,
      location: { placement },
    };
  }

  return null;
}

/**
 * Validate spec dimensions are within reasonable bounds
 */
export function validateSpec(spec: MinifixSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (spec.camDiameter < 10 || spec.camDiameter > 25) {
    issues.push({
      code: "CAM_DIAMETER_OUT_OF_RANGE",
      severity: "warning",
      message: `CAM diameter ${spec.camDiameter}mm is outside typical range (10-25mm)`,
    });
  }

  if (spec.camDepth < 8 || spec.camDepth > 20) {
    issues.push({
      code: "CAM_DEPTH_OUT_OF_RANGE",
      severity: "warning",
      message: `CAM depth ${spec.camDepth}mm is outside typical range (8-20mm)`,
    });
  }

  if (spec.boltDiameter < 4 || spec.boltDiameter > 8) {
    issues.push({
      code: "BOLT_DIAMETER_OUT_OF_RANGE",
      severity: "warning",
      message: `BOLT diameter ${spec.boltDiameter}mm is outside typical range (4-8mm)`,
    });
  }

  if (spec.boltDepth < 20 || spec.boltDepth > 50) {
    issues.push({
      code: "BOLT_DEPTH_OUT_OF_RANGE",
      severity: "warning",
      message: `BOLT depth ${spec.boltDepth}mm is outside typical range (20-50mm)`,
    });
  }

  return issues;
}

/**
 * Validate panel role consistency
 */
export function validatePanelRoles(placement: MinifixPlacement): ValidationIssue | null {
  const { position, cam, bolt } = placement;

  // For TOP position, CAM should be on TOP panel (drilled from bottom face)
  // For BOTTOM position, CAM should be on BOTTOM panel (drilled from top face)
  if (position === "TOP" && cam.panelRole !== "TOP") {
    return {
      code: "CAM_PANEL_ROLE_MISMATCH",
      severity: "error",
      message: `For TOP joint, CAM should be on TOP panel, got ${cam.panelRole}`,
      location: { placement },
    };
  }

  if (position === "BOTTOM" && cam.panelRole !== "BOTTOM") {
    return {
      code: "CAM_PANEL_ROLE_MISMATCH",
      severity: "error",
      message: `For BOTTOM joint, CAM should be on BOTTOM panel, got ${cam.panelRole}`,
      location: { placement },
    };
  }

  // BOLT should always be on a side panel
  if (bolt.panelRole !== "LEFT_SIDE" && bolt.panelRole !== "RIGHT_SIDE") {
    return {
      code: "BOLT_PANEL_ROLE_INVALID",
      severity: "error",
      message: `BOLT should be on LEFT_SIDE or RIGHT_SIDE panel, got ${bolt.panelRole}`,
      location: { placement },
    };
  }

  return null;
}

/**
 * Full validation of a MinifixPlacement
 */
export function validatePlacement(placement: MinifixPlacement): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Validate CAM axis
  const camAxisIssue = validateCamAxis(placement);
  if (camAxisIssue) issues.push(camAxisIssue);

  // Validate BOLT axis
  const boltAxisIssue = validateBoltAxis(placement);
  if (boltAxisIssue) issues.push(boltAxisIssue);

  // Validate alignment
  const alignmentIssue = validateAlignment(placement);
  if (alignmentIssue) issues.push(alignmentIssue);

  // Validate panel roles
  const roleIssue = validatePanelRoles(placement);
  if (roleIssue) issues.push(roleIssue);

  // Validate specs
  issues.push(...validateSpec(placement.cam.spec));
  issues.push(...validateSpec(placement.bolt.spec));

  return {
    valid: !issues.some((i) => i.severity === "error"),
    issues,
  };
}

/**
 * Validate multiple placements for conflicts
 */
export function validatePlacements(placements: MinifixPlacement[]): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Validate each placement individually
  for (const placement of placements) {
    const result = validatePlacement(placement);
    issues.push(...result.issues);
  }

  // Check for overlapping drill positions
  const minClearance = 20; // Minimum mm between drill centers

  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i];
      const b = placements[j];

      // Check CAM-CAM distance on same panel
      if (a.cam.face.panelId === b.cam.face.panelId) {
        const dist = distance(a.cam.origin, b.cam.origin);
        if (dist < minClearance) {
          issues.push({
            code: "CAM_TOO_CLOSE",
            severity: "error",
            message: `CAM positions are only ${dist.toFixed(1)}mm apart, minimum is ${minClearance}mm`,
            location: { placement: a },
          });
        }
      }

      // Check BOLT-BOLT distance on same panel
      const aPanelId = a.bolt.edgeFace?.panelId ?? a.bolt.edge?.panelId;
      const bPanelId = b.bolt.edgeFace?.panelId ?? b.bolt.edge?.panelId;
      if (aPanelId && bPanelId && aPanelId === bPanelId) {
        const dist = distance(a.bolt.origin, b.bolt.origin);
        if (dist < minClearance) {
          issues.push({
            code: "BOLT_TOO_CLOSE",
            severity: "error",
            message: `BOLT positions are only ${dist.toFixed(1)}mm apart, minimum is ${minClearance}mm`,
            location: { placement: a },
          });
        }
      }
    }
  }

  return {
    valid: !issues.some((i) => i.severity === "error"),
    issues,
  };
}
