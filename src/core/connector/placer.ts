/**
 * Connector OS v1.1 - Placer (S-Position Generator)
 *
 * Calculates connector positions along a joint using System 32 grid
 * and load class constraints.
 *
 * @see docs/connector-os/compiler-pipeline.md
 */

import type { ConnectorPlacementProfile, LoadClass } from './types';

/**
 * Calculate connector S-positions along a joint.
 *
 * Walks the System 32 grid starting from `firstHole`, stepping by `pitch`,
 * respecting `endOffset` safety margins, and ensuring enough connectors
 * for the declared load class.
 *
 * @param jointLen - Length of the joint in mm
 * @param profile - Placement profile with System 32 params and constraints
 * @param load - Load class determining max spacing
 * @returns Array of S-positions (mm from front edge), sorted ascending, unique
 */
export function getConnectorPositions(
  jointLen: number,
  profile: ConnectorPlacementProfile,
  load: LoadClass,
): number[] {
  const sys = profile.system32;
  const constraints = profile.constraints;
  const maxSpacing = constraints.loadOverrides[load].maxSpacingMm;

  const usableLen = jointLen - sys.endOffset * 2;
  if (usableLen <= 0) {
    // Joint too short for any connectors with end offsets
    // Place at least minPerJoint at available grid positions
    const positions: number[] = [];
    let s = sys.firstHole;
    while (s <= jointLen && positions.length < constraints.minPerJoint) {
      positions.push(s);
      s += sys.pitch;
    }
    return positions.length > 0 ? positions : [jointLen / 2];
  }

  const requiredCount = Math.max(
    constraints.minPerJoint,
    Math.ceil(usableLen / maxSpacing) + 1,
  );

  const positions: number[] = [];
  let s = sys.firstHole;
  while (s <= jointLen - sys.endOffset && positions.length < requiredCount) {
    if (s >= sys.endOffset) {
      positions.push(s);
    }
    s += sys.pitch;
  }

  // Fallback: add end position to meet minimum count
  if (positions.length < requiredCount) {
    const endPos = jointLen - sys.endOffset;
    if (endPos > 0 && !positions.includes(endPos)) {
      positions.push(endPos);
    }
  }

  return Array.from(new Set(positions)).sort((a, b) => a - b);
}
