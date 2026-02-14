/**
 * Bolt Orientation Policy
 *
 * Defines joint mode types and angle conversion for hardware placement.
 */

/** Joint mode for hardware mounting */
export type JointMode = 'INSET' | 'OVERLAY';

/** Convert degrees to radians */
export function degToRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/** Convert radians to degrees */
export function radToDeg(radians: number): number {
  return radians * (180 / Math.PI);
}

/** Seam-driven twist calculation parameters */
export interface SeamDrivenTwistParams {
  jointPosition: 'TOP' | 'BOTTOM';
  jointMode: JointMode;
  panelSide: 'LEFT' | 'RIGHT';
  cornerType: string;
  boltDir: { x: number; y: number; z: number };
  boltPanelNormal: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
  targetPocketCenter: { x: number; y: number; z: number };
}

/** Result of seam-driven twist calculation */
export interface SeamDrivenTwistResult {
  twistDeg: number;
  seamAxis: 'X' | 'Y' | 'Z';
}

/**
 * Resolve bolt twist angle based on seam orientation.
 * For INSET joints: fins horizontal (parallel to seam/depth)
 * For OVERLAY joints: fins vertical (perpendicular to seam)
 */
export function resolveSeamDrivenTwist(params: SeamDrivenTwistParams): SeamDrivenTwistResult {
  const { jointMode, panelSide, jointPosition } = params;

  if (jointMode === 'INSET') {
    // INSET: fins parallel to depth (seam runs along Z)
    const baseTwist = panelSide === 'LEFT' ? 0 : 180;
    const positionAdjust = jointPosition === 'TOP' ? 0 : 0;
    return { twistDeg: baseTwist + positionAdjust, seamAxis: 'Z' };
  }

  // OVERLAY: fins perpendicular to seam
  const baseTwist = panelSide === 'LEFT' ? 90 : 270;
  return { twistDeg: baseTwist, seamAxis: 'Y' };
}
