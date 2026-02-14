/**
 * Build Connectors JSON - B2 MVP
 *
 * Extracts Minifix connector pairs from DrillMap.
 * Uses pairedHoleId for deterministic pairing.
 *
 * DETERMINISM:
 * - Pairs sorted by cam point ID
 * - Numbers rounded to 3 decimal places
 *
 * @version 1.0.0 - Phase B2: Factory Packet Generator MVP
 */

import type { DrillMap, DrillMapPoint } from '../../../core/manufacturing/drillMap/types';
import type { PacketConnectors, PacketMinifixPair } from '../types';
import { roundToPrecision, serializeDeterministicPretty } from '../manifestHash';
import { findMinifixPairs } from '../../../gate/rules/connectors/drillMapToMinifixPair';

// ============================================
// PAIR STATUS EVALUATION
// ============================================

/**
 * Evaluate pair validation status
 *
 * Quick validation for packet export. Full validation is done by Gate.
 */
function evaluatePairStatus(
  cam: DrillMapPoint,
  bolt: DrillMapPoint
): { status: 'VALID' | 'WARNING' | 'ERROR'; issues: string[] } {
  const issues: string[] = [];

  // Check cam status
  if (cam.status === 'ERROR') {
    issues.push(`Cam ${cam.id}: ${cam.issues?.join(', ') || 'validation error'}`);
  } else if (cam.status === 'WARNING') {
    issues.push(`Cam ${cam.id}: ${cam.issues?.join(', ') || 'warning'}`);
  }

  // Check bolt status
  if (bolt.status === 'ERROR') {
    issues.push(`Bolt ${bolt.id}: ${bolt.issues?.join(', ') || 'validation error'}`);
  } else if (bolt.status === 'WARNING') {
    issues.push(`Bolt ${bolt.id}: ${bolt.issues?.join(', ') || 'warning'}`);
  }

  // Determine overall status
  const hasErrors = issues.some(i => i.includes('error'));
  const hasWarnings = issues.some(i => i.includes('warning'));

  return {
    status: hasErrors ? 'ERROR' : hasWarnings ? 'WARNING' : 'VALID',
    issues: issues.length > 0 ? issues : undefined as unknown as string[],
  };
}

// ============================================
// PAIR CONVERTER
// ============================================

/**
 * Convert cam-bolt pair to PacketMinifixPair
 */
function convertPair(
  cam: DrillMapPoint,
  bolt: DrillMapPoint,
  panelIdMap: Map<string, string>
): PacketMinifixPair {
  const { status, issues } = evaluatePairStatus(cam, bolt);

  // Get panel IDs from the point's context
  const camPanelId = panelIdMap.get(cam.id) || 'unknown';
  const boltPanelId = panelIdMap.get(bolt.id) || 'unknown';

  return {
    id: `pair-${cam.id}-${bolt.id}`,
    cam: {
      pointId: cam.id,
      panelId: camPanelId,
      position: [
        roundToPrecision(cam.position[0]),
        roundToPrecision(cam.position[1]),
        roundToPrecision(cam.position[2]),
      ],
      diameter: roundToPrecision(cam.diameter),
      depth: roundToPrecision(cam.depth),
    },
    bolt: {
      pointId: bolt.id,
      panelId: boltPanelId,
      position: [
        roundToPrecision(bolt.position[0]),
        roundToPrecision(bolt.position[1]),
        roundToPrecision(bolt.position[2]),
      ],
      diameter: roundToPrecision(bolt.diameter),
      depth: roundToPrecision(bolt.depth),
    },
    status,
    issues: issues?.length > 0 ? issues : undefined,
  };
}

// ============================================
// MAIN BUILDER
// ============================================

/**
 * Build PacketConnectors from DrillMap
 *
 * @param drillMap - Source DrillMap from store
 * @returns PacketConnectors for factory packet
 */
export function buildConnectorsData(drillMap: DrillMap | null): PacketConnectors {
  if (!drillMap || drillMap.panels.length === 0) {
    return {
      version: 'connectors.v1',
      minifix: [],
      summary: {
        totalPairs: 0,
        validPairs: 0,
        warningPairs: 0,
        errorPairs: 0,
      },
    };
  }

  // Collect all points and build panel ID map
  const allPoints: DrillMapPoint[] = [];
  const panelIdMap = new Map<string, string>();

  for (const panel of drillMap.panels) {
    for (const point of panel.points) {
      allPoints.push(point);
      panelIdMap.set(point.id, panel.panelId);
    }
  }

  // Find minifix pairs
  const pairs = findMinifixPairs(allPoints);

  // Convert to packet format and sort by cam ID for determinism
  const minifixPairs = pairs
    .map(({ cam, bolt }) => convertPair(cam, bolt, panelIdMap))
    .sort((a, b) => a.cam.pointId.localeCompare(b.cam.pointId));

  // Calculate summary
  const summary = {
    totalPairs: minifixPairs.length,
    validPairs: minifixPairs.filter(p => p.status === 'VALID').length,
    warningPairs: minifixPairs.filter(p => p.status === 'WARNING').length,
    errorPairs: minifixPairs.filter(p => p.status === 'ERROR').length,
  };

  return {
    version: 'connectors.v1',
    minifix: minifixPairs,
    summary,
  };
}

/**
 * Build Connectors JSON string
 *
 * @param drillMap - Source DrillMap from store
 * @returns Deterministic JSON string
 */
export function buildConnectorsJson(drillMap: DrillMap | null): string {
  const data = buildConnectorsData(drillMap);
  return serializeDeterministicPretty(data);
}
