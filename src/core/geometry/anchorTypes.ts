/**
 * anchorTypes.ts — Anchor specification for hardware mesh placement
 *
 * Defines the contract between DrillMap points (Factory Truth)
 * and 3D mesh positioning in the Designer scene.
 *
 * Each hardware part has:
 * - localAxis: which axis in model-space should align with drill normal
 * - localAnchor: which point in model-space maps to the DrillMap point
 *
 * Usage flow:
 *   DrillMap point (position, normal)
 *     + AnchorSpec (localAxis, localAnchor)
 *     → placeMeshByDrillPoint()
 *     → { worldPos, worldQuat }
 *     → mesh.position, mesh.quaternion
 *
 * @version 1.0.0
 */

export type Vec3Tuple = [number, number, number];

/**
 * Anchor specification for a single hardware part.
 *
 * localAxis: The axis in model-local space that should align with
 *            the drill normal (direction INTO material).
 *            e.g., for CamHousing3D: [0, -1, 0] means model's -Y
 *            should point into the material.
 *
 * localAnchor: The point in model-local space that should be placed
 *              at the DrillMap point's world position.
 *              e.g., for CamHousing3D: [0, depth/2, 0] means the
 *              top surface of the cylinder maps to drill entry point.
 */
export interface AnchorSpec {
  /** Label for debug/logging */
  label: string;

  /**
   * Model-local axis that aligns with drill normal (into material).
   * Must be a unit vector.
   *
   * Convention: drill normal points INTO the wood.
   * So localAxis is the direction in model space that should
   * point into the material when placed.
   */
  localAxis: Vec3Tuple;

  /**
   * Model-local point that maps to the DrillMap world position.
   * This is the "anchor point" — the reference coordinate.
   *
   * For drill entry anchors: the point on the model surface
   * that sits at the panel surface (drill entry).
   *
   * For pocket center anchors: the geometric center of the
   * pocket/housing inside the material.
   */
  localAnchor: Vec3Tuple;
}

/**
 * Result of anchor-based placement calculation.
 * Apply directly to Three.js mesh: mesh.position, mesh.quaternion.
 */
export interface PlacementResult {
  /** World position for the mesh */
  worldPos: Vec3Tuple;

  /**
   * Euler angles (radians) for the mesh rotation.
   * Computed from quaternion: fromUnitVectors(localAxis, drillNormal).
   */
  worldEuler: Vec3Tuple;
}
