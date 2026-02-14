/**
 * flatPartFromPacket.ts - FlatPart Builder from Manufacturing Packet
 *
 * Converts manufacturing packet data to FlatPart v1 format.
 * Used by DXF per-part exporter.
 *
 * @version P14A.3
 */

import type {
  FlatPart,
  ManufacturingPacket,
  PacketPanel,
  PacketCabinet,
  DrillFeature,
  PocketFeature,
  GrooveFeature,
  EdgeBand,
  EdgeSide,
} from './flatPartTypes.js';

// ============================================================================
// Configuration
// ============================================================================

const BUILDER_VERSION = 'FLATPART_BUILDER_V1';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique feature ID
 */
function generateId(prefix: string, index: number): string {
  return `${prefix}_${index.toString().padStart(3, '0')}`;
}

/**
 * Calculate cut size from finish size and edge bands
 */
function calculateCutSize(
  finishWidth: number,
  finishHeight: number,
  edges: EdgeBand[]
): { cutWidth: number; cutHeight: number } {
  const leftEdge = edges.find((e) => e.side === 'left')?.thickness ?? 0;
  const rightEdge = edges.find((e) => e.side === 'right')?.thickness ?? 0;
  const topEdge = edges.find((e) => e.side === 'top')?.thickness ?? 0;
  const bottomEdge = edges.find((e) => e.side === 'bottom')?.thickness ?? 0;

  return {
    cutWidth: finishWidth - leftEdge - rightEdge,
    cutHeight: finishHeight - topEdge - bottomEdge,
  };
}

// ============================================================================
// Panel to FlatPart Conversion
// ============================================================================

/**
 * Convert a single PacketPanel to FlatPart
 */
function panelToFlatPart(
  panel: PacketPanel,
  cabinetId: string,
  cabinetName: string
): FlatPart {
  // Build edge bands
  const edges: EdgeBand[] = [];
  const edgeSides: EdgeSide[] = ['top', 'bottom', 'left', 'right'];

  for (const side of edgeSides) {
    const edgeData = panel.edges?.[side];
    if (edgeData && edgeData.thickness > 0) {
      edges.push({
        side,
        materialCode: edgeData.code ?? `EB_${side.toUpperCase()}`,
        thickness: edgeData.thickness,
      });
    }
  }

  // Calculate cut size
  const finishWidth = panel.width;
  const finishHeight = panel.height;
  const { cutWidth, cutHeight } = calculateCutSize(finishWidth, finishHeight, edges);

  // Build drills
  const drills: DrillFeature[] = (panel.drills ?? []).map((d, i) => ({
    id: d.id ?? generateId('drill', i),
    x: d.x,
    y: d.y,
    diameter: d.diameter,
    depth: d.depth,
    isThrough: d.through ?? false,
  }));

  // Build pockets
  const pockets: PocketFeature[] = (panel.pockets ?? []).map((p, i) => ({
    id: p.id ?? generateId('pocket', i),
    x: p.x,
    y: p.y,
    width: p.width,
    height: p.height,
    depth: p.depth,
  }));

  // Build grooves
  const grooves: GrooveFeature[] = (panel.grooves ?? []).map((g, i) => ({
    id: g.id ?? generateId('groove', i),
    axis: g.axis,
    position: g.position,
    start: g.start,
    length: g.length,
    width: g.width,
    depth: g.depth,
  }));

  // Build part number
  const partNumber = `${cabinetName}_${panel.name}`.replace(/\s+/g, '_').toUpperCase();

  return {
    version: 'FLATPART_V1',
    id: panel.id,
    name: panel.name,
    partNumber,
    cabinetId,
    panelId: panel.id,

    cutWidth,
    cutHeight,
    finishWidth,
    finishHeight,

    outer: {
      type: 'rect',
      width: cutWidth,
      height: cutHeight,
    },

    drills,
    pockets,
    grooves,
    edges,

    composite: {
      totalThickness: panel.thickness,
      core: {
        materialName: panel.material?.name ?? 'Unknown',
        thickness: panel.thickness,
        materialCode: panel.material?.code,
      },
    },

    createdAt: new Date().toISOString(),
    builderVersion: BUILDER_VERSION,
  };
}

/**
 * Convert a PacketCabinet to FlatParts
 */
function cabinetToFlatParts(cabinet: PacketCabinet): FlatPart[] {
  return cabinet.panels.map((panel) =>
    panelToFlatPart(panel, cabinet.id, cabinet.name)
  );
}

// ============================================================================
// Main Builder Function
// ============================================================================

export interface BuildFlatPartsResult {
  ok: boolean;
  parts: FlatPart[];
  partCount: number;
  cabinetCount: number;
  error?: string;
}

/**
 * Build FlatParts from a manufacturing packet
 *
 * @param jobId - Export job ID
 * @param packet - Manufacturing packet data
 * @returns Build result with FlatParts array
 */
export function buildFlatPartsFromPacket(
  jobId: string,
  packet: ManufacturingPacket
): BuildFlatPartsResult {
  try {
    const parts: FlatPart[] = [];

    for (const cabinet of packet.cabinets) {
      const cabinetParts = cabinetToFlatParts(cabinet);
      parts.push(...cabinetParts);
    }

    return {
      ok: true,
      parts,
      partCount: parts.length,
      cabinetCount: packet.cabinets.length,
    };
  } catch (err) {
    return {
      ok: false,
      parts: [],
      partCount: 0,
      cabinetCount: 0,
      error: err instanceof Error ? err.message : 'Build failed',
    };
  }
}

/**
 * Build FlatParts from JSON string
 *
 * @param jobId - Export job ID
 * @param packetJson - Manufacturing packet as JSON string
 * @returns Build result with FlatParts array
 */
export function buildFlatPartsFromJson(
  jobId: string,
  packetJson: string
): BuildFlatPartsResult {
  try {
    const packet = JSON.parse(packetJson) as ManufacturingPacket;
    return buildFlatPartsFromPacket(jobId, packet);
  } catch (err) {
    return {
      ok: false,
      parts: [],
      partCount: 0,
      cabinetCount: 0,
      error: err instanceof Error ? err.message : 'JSON parse failed',
    };
  }
}

/**
 * Build FlatParts from bundle flatparts.json file
 *
 * @param jobId - Export job ID
 * @param flatpartsJson - flatparts.json content as string
 * @returns Build result with FlatParts array
 */
export function buildFlatPartsFromBundle(
  jobId: string,
  flatpartsJson: string
): BuildFlatPartsResult {
  try {
    // Bundle format: direct array of FlatParts (already built by client)
    const parts = JSON.parse(flatpartsJson) as FlatPart[];

    if (!Array.isArray(parts)) {
      return {
        ok: false,
        parts: [],
        partCount: 0,
        cabinetCount: 0,
        error: 'flatparts.json must be an array',
      };
    }

    // Validate version
    for (const part of parts) {
      if (part.version !== 'FLATPART_V1') {
        return {
          ok: false,
          parts: [],
          partCount: 0,
          cabinetCount: 0,
          error: `Invalid FlatPart version: ${part.version}`,
        };
      }
    }

    // Count unique cabinet IDs
    const cabinetIds = new Set(parts.map((p) => p.cabinetId).filter(Boolean));

    return {
      ok: true,
      parts,
      partCount: parts.length,
      cabinetCount: cabinetIds.size,
    };
  } catch (err) {
    return {
      ok: false,
      parts: [],
      partCount: 0,
      cabinetCount: 0,
      error: err instanceof Error ? err.message : 'Bundle parse failed',
    };
  }
}
