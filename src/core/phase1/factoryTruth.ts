/**
 * factoryTruth.ts - B1: Factory Truth Mode API
 *
 * NORTH STAR: "Factory เปิดแล้วเชื่อได้"
 * Shows what the CNC machine will actually do
 *
 * Data comes from OperationGraph, NOT mesh
 * Same data used for overlay AND export (trust chain)
 *
 * @version 1.0.0 - Phase 1
 */

import { useCabinetStore } from '../store/useCabinetStore';
import { useDrillMapStore } from '../store/useDrillMapStore';
import type { Cabinet, CabinetPanel } from '../types/Cabinet';
import type {
  FactoryTruthSnapshot,
  FactoryTruthPoint,
  FactoryTruthFilters,
  FactoryTruthStats,
  OverlayOpKind,
  PanelFace,
  GateSnapshot,
} from './types';
import { runPhase1Gate } from './gate';

// ============================================
// OPERATION KIND MAPPING
// ============================================

/**
 * Map drill hole purpose to overlay op kind
 */
function purposeToOpKind(purpose: string): OverlayOpKind {
  const mapping: Record<string, OverlayOpKind> = {
    minifix_cam: 'BORE',
    minifix_bolt: 'DRILL',
    cam_housing: 'BORE',
    dowel: 'DRILL',
    shelf_pin: 'DRILL',
    hinge_cup: 'BORE',
    hinge_screw: 'DRILL',
    confirmat: 'DRILL',
    back_groove: 'ROUTE',
    edge_band: 'EDGE_BAND',
  };
  return mapping[purpose] || 'DRILL';
}

/**
 * Determine risk level for a point based on gate issues
 */
function getRiskLevel(
  panelId: string,
  opId: string,
  gate: GateSnapshot
): 'NONE' | 'WARN' | 'FAIL' {
  for (const issue of gate.issues) {
    if (issue.entityId === panelId || issue.entityId === opId || issue.opId === opId) {
      if (issue.severity === 'FAIL') return 'FAIL';
      if (issue.severity === 'WARN') return 'WARN';
    }
  }
  return 'NONE';
}

// ============================================
// MAIN FACTORY TRUTH FUNCTION
// ============================================

/**
 * Build factory truth snapshot from current drill map and cabinet
 *
 * @param filters - Optional filters to apply
 * @returns FactoryTruthSnapshot with all points and stats
 *
 * @example
 * ```ts
 * // Get all factory truth points
 * const snapshot = buildFactoryTruthSnapshot();
 *
 * // Get only drill operations on face A
 * const filtered = buildFactoryTruthSnapshot({
 *   kinds: ['DRILL'],
 *   faces: ['A'],
 * });
 *
 * // Get only risk items
 * const risks = buildFactoryTruthSnapshot({ riskOnly: true });
 * ```
 */
export function buildFactoryTruthSnapshot(
  filters?: FactoryTruthFilters
): FactoryTruthSnapshot {
  const cabinet = useCabinetStore.getState().cabinet;
  const drillMapState = useDrillMapStore.getState();

  if (!cabinet) {
    return createEmptySnapshot();
  }

  // Run gate to get risk levels
  const gate = runPhase1Gate(cabinet.id);

  // Collect all points
  const allPoints: FactoryTruthPoint[] = [];

  // Get points from drill map
  const drillPoints = collectDrillPoints(cabinet, drillMapState, gate);
  allPoints.push(...drillPoints);

  // Get edge banding points
  const edgePoints = collectEdgePoints(cabinet, gate);
  allPoints.push(...edgePoints);

  // Apply filters
  const filteredPoints = applyFilters(allPoints, filters);

  // Calculate stats
  const stats = calculateStats(filteredPoints);

  return {
    gate,
    points: filteredPoints,
    stats,
    timestamp: Date.now(),
  };
}

// ============================================
// POINT COLLECTION
// ============================================

/**
 * Collect drill points from drill map store
 */
function collectDrillPoints(
  cabinet: Cabinet,
  drillMapState: ReturnType<typeof useDrillMapStore.getState>,
  gate: GateSnapshot
): FactoryTruthPoint[] {
  const points: FactoryTruthPoint[] = [];

  // Access the global drill map
  const drillMap = drillMapState.drillMap;
  if (!drillMap) return points;

  // Process each panel in the drill map
  for (const drillMapPanel of drillMap.panels) {
    // Match drill map panel to cabinet panel
    const cabinetPanel = cabinet.panels.find(p => p.id === drillMapPanel.panelId);
    if (!cabinetPanel) continue;

    // Process each point in the drill map panel
    for (const drillPoint of drillMapPanel.points || []) {
      // Determine face from drill direction (normal pointing into panel = face A)
      const face: PanelFace = drillPoint.normal[2] < 0 ? 'A' : 'B';

      const point: FactoryTruthPoint = {
        id: `drill-${drillMapPanel.panelId}-${drillPoint.id || Math.random().toString(36).slice(2)}`,
        opId: drillPoint.id || '',
        kind: purposeToOpKind(drillPoint.purpose || 'drill'),
        panelId: drillMapPanel.panelId,
        face,
        position: drillPoint.position,
        diameter: drillPoint.diameter,
        depth: drillPoint.depth,
        purpose: drillPoint.purpose,
        risk: getRiskLevel(drillMapPanel.panelId, drillPoint.id || '', gate),
      };
      points.push(point);
    }
  }

  return points;
}

/**
 * Collect edge banding points
 */
function collectEdgePoints(
  cabinet: Cabinet,
  gate: GateSnapshot
): FactoryTruthPoint[] {
  const points: FactoryTruthPoint[] = [];

  for (const panel of cabinet.panels) {
    // Check each edge
    const edges = ['top', 'bottom', 'left', 'right'] as const;

    for (const edge of edges) {
      if (panel.edges[edge]) {
        // Edge has banding - create visualization point
        const point: FactoryTruthPoint = {
          id: `edge-${panel.id}-${edge}`,
          opId: `edge-${panel.id}-${edge}`,
          kind: 'EDGE_BAND',
          panelId: panel.id,
          face: 'A', // Edge banding is on the edge, not face
          position: getEdgePosition(panel, edge),
          purpose: `edge_${edge}`,
          risk: getRiskLevel(panel.id, `edge-${panel.id}-${edge}`, gate),
        };
        points.push(point);
      }
    }
  }

  return points;
}

/**
 * Get center position for edge visualization
 */
function getEdgePosition(
  panel: CabinetPanel,
  edge: 'top' | 'bottom' | 'left' | 'right'
): [number, number, number] {
  const w = panel.finishWidth;
  const h = panel.finishHeight;

  switch (edge) {
    case 'top':
      return [w / 2, h, 0];
    case 'bottom':
      return [w / 2, 0, 0];
    case 'left':
      return [0, h / 2, 0];
    case 'right':
      return [w, h / 2, 0];
  }
}

// ============================================
// FILTERS
// ============================================

/**
 * Apply filters to points
 */
function applyFilters(
  points: FactoryTruthPoint[],
  filters?: FactoryTruthFilters
): FactoryTruthPoint[] {
  if (!filters) return points;

  let filtered = [...points];

  // Filter by kinds
  if (filters.kinds && filters.kinds.length > 0) {
    filtered = filtered.filter((p) => filters.kinds!.includes(p.kind));
  }

  // Filter by faces
  if (filters.faces && filters.faces.length > 0) {
    filtered = filtered.filter((p) => filters.faces!.includes(p.face));
  }

  // Filter by panel IDs
  if (filters.panelIds && filters.panelIds.length > 0) {
    filtered = filtered.filter((p) => filters.panelIds!.includes(p.panelId));
  }

  // Filter by risk only
  if (filters.riskOnly) {
    filtered = filtered.filter((p) => p.risk !== 'NONE');
  }

  // Filter by purposes
  if (filters.purposes && filters.purposes.length > 0) {
    filtered = filtered.filter((p) => p.purpose && filters.purposes!.includes(p.purpose));
  }

  return filtered;
}

// ============================================
// STATISTICS
// ============================================

/**
 * Calculate statistics for points
 */
function calculateStats(points: FactoryTruthPoint[]): FactoryTruthStats {
  const stats: FactoryTruthStats = {
    total: points.length,
    byKind: {
      DRILL: 0,
      BORE: 0,
      POCKET: 0,
      CUT: 0,
      ROUTE: 0,
      EDGE_BAND: 0,
    },
    byFace: {
      A: 0,
      B: 0,
    },
    byRisk: {
      none: 0,
      warn: 0,
      fail: 0,
    },
  };

  for (const point of points) {
    // Count by kind
    stats.byKind[point.kind]++;

    // Count by face
    stats.byFace[point.face]++;

    // Count by risk
    switch (point.risk) {
      case 'NONE':
        stats.byRisk.none++;
        break;
      case 'WARN':
        stats.byRisk.warn++;
        break;
      case 'FAIL':
        stats.byRisk.fail++;
        break;
    }
  }

  return stats;
}

// ============================================
// HELPERS
// ============================================

/**
 * Create empty snapshot
 */
function createEmptySnapshot(): FactoryTruthSnapshot {
  return {
    gate: {
      hasRun: false,
      issues: [],
      canExport: false,
      canRelease: false,
      counts: { info: 0, warn: 0, fail: 0 },
      timestamp: Date.now(),
    },
    points: [],
    stats: {
      total: 0,
      byKind: { DRILL: 0, BORE: 0, POCKET: 0, CUT: 0, ROUTE: 0, EDGE_BAND: 0 },
      byFace: { A: 0, B: 0 },
      byRisk: { none: 0, warn: 0, fail: 0 },
    },
    timestamp: Date.now(),
  };
}

/**
 * Get points for a specific panel
 */
export function getPanelFactoryTruth(panelId: string): FactoryTruthPoint[] {
  const snapshot = buildFactoryTruthSnapshot({ panelIds: [panelId] });
  return snapshot.points;
}

/**
 * Get only risk points
 */
export function getRiskPoints(): FactoryTruthPoint[] {
  const snapshot = buildFactoryTruthSnapshot({ riskOnly: true });
  return snapshot.points;
}

/**
 * Check if any FAIL-level risks exist
 */
export function hasFailRisks(): boolean {
  const snapshot = buildFactoryTruthSnapshot({ riskOnly: true });
  return snapshot.points.some((p) => p.risk === 'FAIL');
}
