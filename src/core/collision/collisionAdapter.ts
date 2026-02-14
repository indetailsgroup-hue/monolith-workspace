/**
 * collisionAdapter.ts - Cabinet Instance for Collision/Gate Checking
 *
 * Minimal cabinet representation used by gate bundle and collision systems.
 *
 * @version 1.0.0
 */

/**
 * Minimal cabinet instance for gate checking and collision detection.
 * This is the smallest representation needed to evaluate placement validity.
 */
export interface CabinetInstanceMinimal {
  /** Cabinet unique ID */
  id: string;
  /** Position in world space */
  position: { x: number; y: number; z: number };
  /** Cabinet dimensions in mm */
  dimensions: { width: number; height: number; depth: number };
  /** Rotation in radians (Y-axis) */
  rotationY?: number;
  /** Cabinet type identifier */
  type?: string;
}
