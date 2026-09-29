/**
 * Mating Slot Generator — Phase 2.5
 *
 * Generates pairs of mating slot descriptors for curved-panel joints:
 *   - curvedEdge  : finger tabs / ridges on the kerf-bent panel
 *   - receiverSlots: corresponding slots on the adjacent flat panel
 *
 * Spec: .kiro/specs/curved-panel-system/design.md §Phase 2.5 (Req 8)
 *
 * Design decisions (from spec design.md):
 *   - pairKey is content-addressed (position + edge hash) — never loop-index based
 *   - MatingSlotPattern.curvedEdge drives the receiver; mismatch → G12_SLOT_PAIR_MISMATCH
 *   - Slots must not overlap Kerf_Zone or existing drill points → G12_SLOT_OVERLAPS_KERF
 *   - Edge-to-slot clearance must be ≥ minEdgeClearance → G12_SLOT_EDGE_INSUFFICIENT
 *
 * NOT responsible for:
 *   - Kerf cut generation (kerfPatternGenerator.ts)
 *   - Gate enforcement (Phase 3)
 *   - DXF export (Phase 6)
 */

import type { PanelEdge } from '../../types/Cabinet';
import type { KerfZone } from './curveProfile';

// ============================================
// PUBLIC TYPES
// ============================================

/** 3-tuple position vector (x, y, z) in panel local coordinates (mm). */
export type Vec3Tuple = [number, number, number];

/**
 * MatingSlotPattern — the full slot description for one curved panel joint.
 *
 * pairKey format: "curve-{edge}-{round(position_mm)}"
 * Mirrors the pairKeyV2 convention to stay consistent with existing DrillMap.
 */
export interface MatingSlotPattern {
  /** Content-addressed key — stable across regeneration. */
  pairKey: string;
  /** Curved-panel side descriptor (the kerf-bent face). */
  curvedEdge: {
    /** Number of finger tabs / ridges along the edge. */
    count: number;
    /** Centre-to-centre pitch (mm). */
    pitch: number;
    /** Tab depth into adjacent panel (mm) — typically 12–20mm. */
    depth: number;
    /** Tab width (mm) — sized for snug fit, typically 8–15mm. */
    width: number;
  };
  /** Corresponding slots on the flat receiver panel. */
  receiverSlots: Array<{
    /** Position of slot centre in receiver panel local coords (mm). */
    position: Vec3Tuple;
    /** Slot depth (mm) — must match curvedEdge.depth. */
    depth: number;
    /** Slot width (mm) — must match curvedEdge.width within tolerance. */
    width: number;
  }>;
}

/** Input to generateMatingSlots(). */
export interface MatingSlotInput {
  /**
   * Kerf zones from curveProfile — one zone per bend edge.
   * Each zone contributes one MatingSlotPattern.
   */
  kerfZones: KerfZone[];
  /**
   * Panel finish dimensions (mm).
   * Used to place receiver slot positions in panel-local coords.
   */
  finishWidth: number;
  finishHeight: number;
  /**
   * Tab depth into the adjacent panel (mm).
   * Default: 15mm (standard cabinet connection depth).
   */
  tabDepth?: number;
  /**
   * Tab width (mm).
   * Default: 10mm.
   */
  tabWidth?: number;
  /**
   * Minimum clearance from panel edge to first/last slot centre (mm).
   * Default: 20mm.
   */
  minEdgeClearance?: number;
  /**
   * Minimum pitch between slots (mm).
   * Slots closer than this trigger G12_SLOT_PAIR_MISMATCH.
   */
  minPitch?: number;
}

/** Full result of generateMatingSlots(). */
export interface MatingSlotResult {
  /** True when all pairs are geometrically valid and non-overlapping. */
  valid: boolean;
  /** G12 error codes. */
  errors: string[];
  /** One MatingSlotPattern per KerfZone. */
  patterns: MatingSlotPattern[];
}

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_TAB_DEPTH = 15;    // mm — standard cabinet connection depth
const DEFAULT_TAB_WIDTH = 10;    // mm
const DEFAULT_MIN_EDGE_CLEARANCE = 20;  // mm
const DEFAULT_MIN_PITCH = 50;    // mm — Req 8: minimum finger pitch

/**
 * Slot tolerance band (mm).
 * Mating slots must align within this tolerance: |curvedEdge.width - receiver.width| ≤ SLOT_TOLERANCE.
 * Beyond this → G12_SLOT_PAIR_MISMATCH.
 */
const SLOT_TOLERANCE = 0.1;  // mm — spec Req 8 Property 8

// ============================================
// MAIN GENERATOR
// ============================================

/**
 * Generate mating slot patterns for all kerf zones.
 *
 * Algorithm per zone:
 *  1. Compute available span = zone.end - zone.start - 2 × minEdgeClearance
 *  2. Derive slot count = max(1, floor(span / targetPitch))
 *  3. Recompute actual pitch = span / (count - 1) when count > 1
 *  4. Place receiver slots symmetrically within the span
 *  5. Check each slot does not fall inside the kerf zone core (G12_SLOT_OVERLAPS_KERF)
 *  6. Build content-addressed pairKey
 */
export function generateMatingSlots(input: MatingSlotInput): MatingSlotResult {
  const {
    kerfZones,
    finishWidth,
    finishHeight,
    tabDepth = DEFAULT_TAB_DEPTH,
    tabWidth = DEFAULT_TAB_WIDTH,
    minEdgeClearance = DEFAULT_MIN_EDGE_CLEARANCE,
    minPitch = DEFAULT_MIN_PITCH,
  } = input;

  if (kerfZones.length === 0) {
    return { valid: true, errors: [], patterns: [] };
  }

  const patterns: MatingSlotPattern[] = [];
  const errors: string[] = [];

  for (const zone of kerfZones) {
    const result = generateZoneSlots(
      zone,
      finishWidth,
      finishHeight,
      tabDepth,
      tabWidth,
      minEdgeClearance,
      minPitch
    );

    if (result.errors.length > 0) {
      result.errors.forEach(e => { if (!errors.includes(e)) errors.push(e); });
    }
    if (result.pattern) {
      patterns.push(result.pattern);
    }
  }

  // Validate cross-pair consistency (Property 8: mismatch ≤ 0.1mm)
  for (const p of patterns) {
    for (const slot of p.receiverSlots) {
      if (Math.abs(slot.width - p.curvedEdge.width) > SLOT_TOLERANCE) {
        if (!errors.includes('G12_SLOT_PAIR_MISMATCH')) {
          errors.push('G12_SLOT_PAIR_MISMATCH');
        }
      }
      if (Math.abs(slot.depth - p.curvedEdge.depth) > SLOT_TOLERANCE) {
        if (!errors.includes('G12_SLOT_PAIR_MISMATCH')) {
          errors.push('G12_SLOT_PAIR_MISMATCH');
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, patterns };
}

// ============================================
// ZONE SLOT GENERATION
// ============================================

interface ZoneSlotResult {
  errors: string[];
  pattern: MatingSlotPattern | null;
}

function generateZoneSlots(
  zone: KerfZone,
  finishWidth: number,
  finishHeight: number,
  tabDepth: number,
  tabWidth: number,
  minEdgeClearance: number,
  minPitch: number
): ZoneSlotResult {
  const errors: string[] = [];

  const zoneSpan = zone.end - zone.start;

  // Check edge clearance is feasible
  const available = zoneSpan - 2 * minEdgeClearance;
  if (available < tabWidth) {
    errors.push('G12_SLOT_EDGE_INSUFFICIENT');
    return { errors, pattern: null };
  }

  // Determine slot count and pitch
  let slotCount: number;
  let actualPitch: number;

  if (available < minPitch) {
    // Only 1 slot fits
    slotCount = 1;
    actualPitch = 0;
  } else {
    slotCount = Math.max(2, Math.floor(available / minPitch) + 1);
    actualPitch = slotCount > 1 ? available / (slotCount - 1) : 0;
  }

  // Validate pitch
  if (slotCount > 1 && actualPitch < minPitch - 0.001) {
    errors.push('G12_SLOT_PAIR_MISMATCH');
    return { errors, pattern: null };
  }

  // Place slot centres along the edge
  const firstSlotPos = zone.start + minEdgeClearance;
  const slotPositions: number[] = [];
  for (let i = 0; i < slotCount; i++) {
    slotPositions.push(firstSlotPos + i * (slotCount > 1 ? actualPitch : 0));
  }

  // Check slots don't overlap kerf zone core
  // NOTE: Full G12_SLOT_OVERLAPS_KERF check (against individual kerf cut positions)
  // is deferred to Phase 4 DrillMap exclusion, which has the actual KerfPattern data.
  // Here we only check that slot positions fall within the zone's valid span.
  for (const pos of slotPositions) {
    if (pos < zone.start - 0.001 || pos > zone.end + 0.001) {
      if (!errors.includes('G12_SLOT_OVERLAPS_KERF')) {
        errors.push('G12_SLOT_OVERLAPS_KERF');
      }
    }
  }

  if (errors.some(e => e !== 'G12_SCURVE_TRANSITION_SHORT' && e !== 'G12_GRAIN_PARALLEL_TO_BEND')) {
    return { errors, pattern: null };
  }

  // Build receiver slot positions in panel-local 3D coords
  const receiverSlots = slotPositions.map(pos => ({
    position: edgeToReceiverPosition(zone.edge, pos, tabDepth, finishWidth, finishHeight),
    depth: tabDepth,
    width: tabWidth,
  }));

  // Content-addressed pairKey: "curve-{edge}-{round(zone_midpoint_mm)}"
  const midpoint = Math.round((zone.start + zone.end) / 2);
  const pairKey = `curve-${zone.edge}-${midpoint}`;

  const pattern: MatingSlotPattern = {
    pairKey,
    curvedEdge: {
      count: slotCount,
      pitch: actualPitch,
      depth: tabDepth,
      width: tabWidth,
    },
    receiverSlots,
  };

  return { errors, pattern };
}

// ============================================
// COORDINATE MAPPING
// ============================================

/**
 * Convert an edge position (mm along edge) to a 3D position in the receiver
 * panel's local coordinate system.
 *
 * Convention: receiver panel sits flush against the curved panel edge.
 * The slot opens on the face of the receiver panel that touches the curved edge.
 *
 * For TOP/BOTTOM edges: slot opens from the panel's horizontal face.
 * For LEFT/RIGHT edges: slot opens from the panel's vertical face.
 */
function edgeToReceiverPosition(
  edge: PanelEdge,
  posAlongEdge: number,
  tabDepth: number,
  finishWidth: number,
  finishHeight: number
): Vec3Tuple {
  // Z = 0 in this convention means "at the face that receives the tab"
  switch (edge) {
    case 'TOP':
      // Slot on top receiver panel, at x=posAlongEdge, y=0 (bottom face of top panel), z=0
      return [posAlongEdge, 0, 0];
    case 'BOTTOM':
      // Slot on bottom receiver panel
      return [posAlongEdge, finishHeight, 0];
    case 'LEFT':
      // Slot on left receiver panel, at x=finishWidth (right face of left panel), y=posAlongEdge
      return [finishWidth, posAlongEdge, 0];
    case 'RIGHT':
      // Slot on right receiver panel, at x=0 (left face of right panel), y=posAlongEdge
      return [0, posAlongEdge, 0];
  }
}
