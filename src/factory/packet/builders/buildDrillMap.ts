/**
 * buildDrillMap - v2.0 (Clean Rebuild)
 *
 * Builds drill map data for factory packet.
 * Converts DrillMap to PacketDrillMap format for manufacturing export.
 *
 * DETERMINISM:
 * - Panels sorted by panelId
 * - Points sorted by id within each panel
 * - Numbers rounded to 3 decimal places
 *
 * @version 2.0.0 - Phase B2: Factory Packet Generator MVP
 */

import type { DrillMap, DrillMapPanel, DrillMapPoint } from '../../../core/manufacturing/drillMap/types';
import type { PacketDrillMap, PacketDrillPanel, PacketDrillPoint } from '../types';
import { roundToPrecision, serializeDeterministicPretty } from '../manifestHash';

// ============================================
// POINT CONVERTER
// ============================================

/**
 * Convert DrillMapPoint to PacketDrillPoint
 *
 * @param point - Source drill map point
 * @returns Packet-formatted drill point
 */
function convertPoint(point: DrillMapPoint): PacketDrillPoint {
  return {
    id: point.id,
    panelId: point.panelId,
    position: [
      roundToPrecision(point.position[0]),
      roundToPrecision(point.position[1]),
      roundToPrecision(point.position[2]),
    ],
    normal: [
      roundToPrecision(point.normal[0]),
      roundToPrecision(point.normal[1]),
      roundToPrecision(point.normal[2]),
    ],
    diameter: roundToPrecision(point.diameter),
    depth: roundToPrecision(point.depth),
    throughHole: point.throughHole ?? false,
    purpose: point.purpose,
    face: point.face ?? 'A',
    pairedHoleId: point.pairedHoleId,
  };
}

// ============================================
// PANEL CONVERTER
// ============================================

/**
 * Convert DrillMapPanel to PacketDrillPanel
 *
 * @param panel - Source drill map panel
 * @returns Packet-formatted drill panel with sorted points
 */
function convertPanel(panel: DrillMapPanel): PacketDrillPanel {
  // Sort points by id for determinism
  const sortedPoints = [...panel.points]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(convertPoint);

  return {
    panelId: panel.panelId,
    cabinetId: panel.cabinetId ?? '',
    role: panel.role,
    dimensions: [
      roundToPrecision(panel.dimensions.width),
      roundToPrecision(panel.dimensions.height),
      roundToPrecision(panel.dimensions.thickness),
    ],
    points: sortedPoints,
  };
}

// ============================================
// SUMMARY CALCULATOR
// ============================================

/**
 * Calculate summary statistics from panels
 *
 * @param panels - Converted packet panels
 * @returns Summary object with counts
 */
function calculateSummary(panels: PacketDrillPanel[]): PacketDrillMap['summary'] {
  const byPurpose: Record<string, number> = {};
  const byDiameter: Record<string, number> = {};
  let totalDrills = 0;
  let totalBores = 0;

  for (const panel of panels) {
    for (const point of panel.points) {
      totalDrills++;

      // Bore = large holes (diameter > 10mm)
      if (point.diameter > 10) {
        totalBores++;
      }

      // Count by purpose
      const purpose = point.purpose;
      byPurpose[purpose] = (byPurpose[purpose] ?? 0) + 1;

      // Count by diameter (use string key for JSON determinism)
      const diameterKey = String(point.diameter);
      byDiameter[diameterKey] = (byDiameter[diameterKey] ?? 0) + 1;
    }
  }

  return {
    totalDrills,
    totalBores,
    byPurpose,
    byDiameter,
  };
}

// ============================================
// TOOLS EXTRACTOR
// ============================================

/**
 * Extract unique tools from drill map
 *
 * @param drillMap - Source drill map
 * @param panels - Converted packet panels
 * @returns Array of tool objects
 */
function extractTools(
  drillMap: DrillMap,
  panels: PacketDrillPanel[]
): PacketDrillMap['tools'] {
  // If drillMap has tools, use them directly (sorted)
  if (drillMap.tools && Array.isArray(drillMap.tools) && drillMap.tools.length > 0) {
    return (drillMap.tools as Array<{
      toolId: string;
      name: string;
      diameter: number;
      type: string;
      usageCount: number;
      totalLength?: number;
    }>)
      .map((tool) => ({
        toolId: tool.toolId,
        name: tool.name,
        diameter: roundToPrecision(tool.diameter),
        type: tool.type,
        usageCount: tool.usageCount,
      }))
      .sort((a, b) => a.toolId.localeCompare(b.toolId));
  }

  // Otherwise, derive tools from drill points
  const toolMap = new Map<number, { usageCount: number; type: string; purpose: string }>();

  for (const panel of panels) {
    for (const point of panel.points) {
      const existing = toolMap.get(point.diameter);
      if (existing) {
        existing.usageCount++;
      } else {
        // Determine tool type from diameter/purpose
        const type = point.diameter > 10 ? 'BORE' : 'DRILL';
        toolMap.set(point.diameter, {
          usageCount: 1,
          type,
          purpose: point.purpose,
        });
      }
    }
  }

  // Convert to array and sort by diameter
  const tools: PacketDrillMap['tools'] = [];
  const sortedDiameters = Array.from(toolMap.keys()).sort((a, b) => a - b);

  for (const diameter of sortedDiameters) {
    const info = toolMap.get(diameter)!;
    const toolId = `tool-${diameter}mm`;
    const name = `${diameter}mm ${info.type === 'BORE' ? 'Boring' : 'Drill'}`;

    tools.push({
      toolId,
      name,
      diameter: roundToPrecision(diameter),
      type: info.type,
      usageCount: info.usageCount,
    });
  }

  return tools;
}

// ============================================
// MAIN BUILDER
// ============================================

/**
 * Build PacketDrillMap from DrillMap
 *
 * @param drillMap - Source DrillMap from store (can be null)
 * @returns PacketDrillMap for factory packet
 */
export function buildDrillMapData(drillMap: DrillMap | null): PacketDrillMap {
  // Handle null case - return empty structure
  if (!drillMap) {
    return {
      version: 'drillmap.v1',
      panels: [],
      summary: {
        totalDrills: 0,
        totalBores: 0,
        byPurpose: {},
        byDiameter: {},
      },
      tools: [],
    };
  }

  // Convert and sort panels by panelId for determinism
  const panels = drillMap.panels
    .map(convertPanel)
    .sort((a, b) => a.panelId.localeCompare(b.panelId));

  // Calculate summary from converted panels
  const summary = calculateSummary(panels);

  // Extract tools
  const tools = extractTools(drillMap, panels);

  return {
    version: 'drillmap.v1',
    panels,
    summary,
    tools,
  };
}

/**
 * Build DrillMap JSON string
 *
 * @param drillMap - Source DrillMap from store
 * @returns Deterministic JSON string
 */
export function buildDrillMapJson(drillMap: DrillMap | null): string {
  const data = buildDrillMapData(drillMap);
  return serializeDeterministicPretty(data);
}
