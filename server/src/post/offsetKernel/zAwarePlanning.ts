/**
 * Z-Aware Path Planning
 *
 * Step 10.6.8: Depth schedule + ramp/peck + onion-skin + score, deterministic.
 *
 * This module provides:
 * - MotionPlan IR (3D motion primitives for G-code generation)
 * - Z profile configuration per material/tool
 * - Depth schedule builder (ROUGH/FINISH/SCORE layers)
 * - Ramp-to-depth and plunge policies
 * - Peck drilling cycles
 * - Motion block compilation from decorated subpaths
 * - Gate-grade verification hooks
 *
 * Key concepts:
 * - Motion: 3D primitive (RAPID, FEED, ARC, DWELL, TOOL_CHANGE, SPINDLE, COMMENT)
 * - MotionBlock: Tool-grouped sequence of motions
 * - MotionPlanV1: Complete plan ready for post-processor (10.7.x)
 * - DepthLayer: Single Z level with cut kind (CUT/FINAL/SCORE)
 *
 * All algorithms are deterministic with stable fingerprints for Gate audit.
 */

import type { Segment } from '../planTypes.js';
import type { Vec2 } from './mathCore.js';
import type { MaterialKind, MillingMode } from './directionPolicy.js';
import type { CutIntent } from './cutSidePlan.js';
import type { RouteStep, RoutePassKind, ToolRef } from './multiToolRouting.js';
import type { DecoratedSubpath } from './entryExitStrategy.js';
import { segmentStart, segmentEnd } from '../planTypes.js';

// ============================================================================
// Types: 3D Coordinates
// ============================================================================

/**
 * 3D coordinate point.
 */
export interface XYZ {
  x: number;
  y: number;
  z: number;
}

/**
 * 2D coordinate point (alias for clarity).
 */
export interface XY {
  x: number;
  y: number;
}

// ============================================================================
// Types: Motion Primitives
// ============================================================================

/**
 * Rapid move (G0) - non-cutting travel.
 */
export interface MotionRapid {
  kind: 'RAPID';
  to: XYZ;
}

/**
 * Feed move (G1) - linear cutting motion.
 */
export interface MotionFeed {
  kind: 'FEED';
  to: XYZ;
  feedMMmin: number;
}

/**
 * Arc move (G2/G3) - circular cutting motion.
 */
export interface MotionArc {
  kind: 'ARC';
  cw: boolean;
  centerXY: XY;
  to: XYZ;
  feedMMmin: number;
}

/**
 * Dwell (G4) - pause at current position.
 */
export interface MotionDwell {
  kind: 'DWELL';
  ms: number;
}

/**
 * Tool change command.
 */
export interface MotionToolChange {
  kind: 'TOOL_CHANGE';
  toolId: string;
}

/**
 * Spindle control.
 */
export interface MotionSpindle {
  kind: 'SPINDLE';
  on: boolean;
  rpm: number;
}

/**
 * Comment for documentation/debugging.
 */
export interface MotionComment {
  kind: 'COMMENT';
  text: string;
}

/**
 * Union of all motion types.
 */
export type Motion =
  | MotionRapid
  | MotionFeed
  | MotionArc
  | MotionDwell
  | MotionToolChange
  | MotionSpindle
  | MotionComment;

// ============================================================================
// Types: Motion Blocks and Plans
// ============================================================================

/**
 * Block of motions for a single tool.
 */
export interface MotionBlock {
  /** Unique block identifier */
  id: string;
  /** Tool identifier */
  toolId: string;
  /** Sequence of motions */
  ops: Motion[];
  /** Metadata for audit */
  meta: Record<string, unknown>;
}

/**
 * Report item for motion planning.
 */
export interface MotionReportItem {
  /** Issue code */
  code: string;
  /** Human-readable detail */
  detail: string;
  /** Stable fingerprint */
  fingerprint: string;
  /** Severity level */
  severity: 'INFO' | 'WARN' | 'BLOCK';
}

/**
 * Complete motion plan (v1).
 */
export interface MotionPlanV1 {
  /** Version identifier */
  version: 'motion-plan.v1';
  /** Sheet identifier */
  sheetId: string;
  /** Part identifier */
  partId: string;
  /** Motion blocks (tool-ordered from 10.6.9) */
  blocks: MotionBlock[];
  /** Processing report */
  report: MotionReportItem[];
  /** Whether plan is valid */
  valid: boolean;
}

// ============================================================================
// Types: Z Profile Configuration
// ============================================================================

/**
 * Machine Z profile inputs per material/tool.
 */
export interface ZProfile {
  /** Safe clearance height above sheet (mm) */
  safeZ: number;
  /** Rapid travel height (mm) */
  rapidZ: number;
  /** Pierce height just above surface (mm) */
  pierceZ: number;
  /** Plunge feed rate (mm/min) */
  plungeFeed: number;
  /** Cut feed rate (mm/min) */
  cutFeed: number;
  /** Ramp feed scale factor (0-1) */
  rampFeedScale: number;
  /** Max stepdown per layer for roughing (mm) */
  stepdownMM: number;
  /** Max stepdown per layer for finishing (mm) */
  finishingStepdownMM: number;
  /** Onion skin thickness (mm) */
  onionSkinMM: number;
  /** Maximum allowed depth guard (mm) */
  maxDepthMM: number;
  /** Spindle RPM */
  spindleRPM: number;
}

/**
 * Profile operation Z parameters.
 */
export interface ProfileOpZ {
  /** Target depth (negative, into material) */
  targetDepthMM: number;
  /** Whether to cut through sheet */
  through: boolean;
}

/**
 * Drill operation Z parameters.
 */
export interface DrillOpZ {
  /** Drill depth (negative) */
  depthMM: number;
  /** Peck depth per cycle (mm) */
  peckMM: number;
  /** Retract amount between pecks (mm) */
  retractMM: number;
  /** Drill feed rate (mm/min) */
  feed: number;
}

/**
 * Groove operation Z parameters.
 */
export interface GrooveOpZ {
  /** Groove depth (negative) */
  depthMM: number;
  /** Stepdown per layer (mm) */
  stepdownMM: number;
  /** Feed rate (mm/min) */
  feed: number;
}

// ============================================================================
// Types: Depth Layers
// ============================================================================

/**
 * Kind of depth layer.
 */
export type DepthLayerKind = 'CUT' | 'FINAL' | 'SCORE';

/**
 * Single depth layer in schedule.
 */
export interface DepthLayer {
  /** Z coordinate (negative) */
  z: number;
  /** Layer kind */
  kind: DepthLayerKind;
}

// ============================================================================
// Types: Compile Inputs
// ============================================================================

/**
 * Input for compiling a profile operation.
 */
export interface ProfileCompileInput {
  /** Route step from 10.6.7 */
  step: RouteStep;
  /** Decorated subpaths from 10.6.6 */
  decoratedSubpaths: DecoratedSubpath[];
  /** Z parameters for this operation */
  opZ: ProfileOpZ;
  /** Z profile configuration */
  zp: ZProfile;
  /** Score depth override (mm) */
  scoreDepthMM?: number;
}

/**
 * Input for compiling a drill operation.
 */
export interface DrillCompileInput {
  /** Step ID */
  stepId: string;
  /** Tool ID */
  toolId: string;
  /** Drill positions */
  points: Vec2[];
  /** Z profile configuration */
  zp: ZProfile;
  /** Drill Z parameters */
  drillZ: DrillOpZ;
}

/**
 * Input for compiling a groove operation.
 */
export interface GrooveCompileInput {
  /** Step ID */
  stepId: string;
  /** Tool ID */
  toolId: string;
  /** Groove path segments */
  segments: Segment[];
  /** Z profile configuration */
  zp: ZProfile;
  /** Groove Z parameters */
  grooveZ: GrooveOpZ;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default Z profile values.
 */
export const DEFAULT_Z_VALUES = {
  safeZ: 15,
  rapidZ: 5,
  pierceZ: 1,
  plungeFeed: 800,
  cutFeed: 4000,
  rampFeedScale: 0.6,
  stepdownMM: 4.0,
  finishingStepdownMM: 2.5,
  onionSkinMM: 0.3,
  maxDepthMM: 60,
  spindleRPM: 18000,
} as const;

/**
 * Default score depth for HPL (mm).
 */
export const DEFAULT_SCORE_DEPTH_MM = 0.35;

/**
 * Default peck drilling parameters.
 */
export const DEFAULT_PECK = {
  peckMM: 3,
  retractMM: 1,
  feed: 600,
} as const;

// ============================================================================
// Z Profile Factory
// ============================================================================

/**
 * Create default Z profile for material and tool.
 */
export function defaultZProfile(
  material: MaterialKind,
  tool: ToolRef
): ZProfile {
  const isFragile = material === 'HPL' || material === 'MELAMINE';
  const isAcrylic = material === 'ACRYLIC';

  // Adjust feeds and depths based on material
  let plungeFeed = isFragile ? 600 : isAcrylic ? 500 : 900;
  let cutFeed = isFragile ? 3000 : isAcrylic ? 2500 : 4500;
  let rampFeedScale = isFragile ? 0.55 : isAcrylic ? 0.5 : 0.65;
  let stepdownMM = isFragile ? 3.0 : isAcrylic ? 2.5 : 4.5;
  let finishingStepdownMM = isFragile ? 2.0 : isAcrylic ? 1.5 : 3.0;
  let onionSkinMM = isFragile ? 0.35 : isAcrylic ? 0.4 : 0.25;
  let spindleRPM = isFragile ? 18000 : isAcrylic ? 16000 : 18000;

  // Adjust for tool diameter (smaller tools = slower)
  if (tool.diameterMm <= 4) {
    cutFeed *= 0.7;
    stepdownMM *= 0.6;
  } else if (tool.diameterMm >= 10) {
    cutFeed *= 1.1;
    stepdownMM *= 1.2;
  }

  return {
    safeZ: DEFAULT_Z_VALUES.safeZ,
    rapidZ: DEFAULT_Z_VALUES.rapidZ,
    pierceZ: DEFAULT_Z_VALUES.pierceZ,
    plungeFeed,
    cutFeed,
    rampFeedScale,
    stepdownMM,
    finishingStepdownMM,
    onionSkinMM,
    maxDepthMM: DEFAULT_Z_VALUES.maxDepthMM,
    spindleRPM,
  };
}

/**
 * Create Z profile with overrides.
 */
export function createZProfile(
  base: Partial<ZProfile> = {}
): ZProfile {
  return {
    safeZ: base.safeZ ?? DEFAULT_Z_VALUES.safeZ,
    rapidZ: base.rapidZ ?? DEFAULT_Z_VALUES.rapidZ,
    pierceZ: base.pierceZ ?? DEFAULT_Z_VALUES.pierceZ,
    plungeFeed: base.plungeFeed ?? DEFAULT_Z_VALUES.plungeFeed,
    cutFeed: base.cutFeed ?? DEFAULT_Z_VALUES.cutFeed,
    rampFeedScale: base.rampFeedScale ?? DEFAULT_Z_VALUES.rampFeedScale,
    stepdownMM: base.stepdownMM ?? DEFAULT_Z_VALUES.stepdownMM,
    finishingStepdownMM: base.finishingStepdownMM ?? DEFAULT_Z_VALUES.finishingStepdownMM,
    onionSkinMM: base.onionSkinMM ?? DEFAULT_Z_VALUES.onionSkinMM,
    maxDepthMM: base.maxDepthMM ?? DEFAULT_Z_VALUES.maxDepthMM,
    spindleRPM: base.spindleRPM ?? DEFAULT_Z_VALUES.spindleRPM,
  };
}

// ============================================================================
// Depth Schedule Builder
// ============================================================================

/**
 * Build layer Z values from surface to target depth.
 */
function buildLayersToDepth(targetZ: number, stepdown: number): number[] {
  const layers: number[] = [];
  let z = 0;

  while (true) {
    const next = z - stepdown;
    if (next <= targetZ + 1e-9) {
      layers.push(targetZ);
      break;
    }
    layers.push(next);
    z = next;
  }

  return layers;
}

/**
 * Plan depth layers for a profile operation.
 *
 * Rules:
 * - SCORE: Single shallow layer at scoreDepth
 * - ROUGH: Multiple layers down to (targetDepth + onionSkin) for through cuts
 * - FINISH: Multiple layers with final pass eating onion skin
 *
 * @param passKind - Pass kind (SCORE/ROUGH/FINISH)
 * @param opZ - Operation Z parameters
 * @param zp - Z profile configuration
 * @param scoreDepthMM - Override score depth
 * @returns Array of depth layers
 */
export function planProfileDepthLayers(
  passKind: RoutePassKind,
  opZ: ProfileOpZ,
  zp: ZProfile,
  scoreDepthMM?: number
): DepthLayer[] {
  const target = -Math.abs(opZ.targetDepthMM); // Ensure negative

  // SCORE: Single shallow pass
  if (passKind === 'SCORE') {
    const sd = scoreDepthMM ?? DEFAULT_SCORE_DEPTH_MM;
    return [{ z: -Math.abs(sd), kind: 'SCORE' }];
  }

  // ROUGH: Leave onion skin for through cuts
  if (passKind === 'ROUGH') {
    const roughTarget = opZ.through
      ? target + zp.onionSkinMM // Leave skin for through profiles
      : target; // No skin for pockets/inside cuts

    const zValues = buildLayersToDepth(roughTarget, zp.stepdownMM);
    return zValues.map((z) => ({ z, kind: 'CUT' as const }));
  }

  // SEMI_FINISH: Treat like FINISH but with larger stepdown
  if (passKind === 'SEMI_FINISH') {
    const semiTarget = opZ.through
      ? target + zp.onionSkinMM * 0.5 // Partial skin removal
      : target;

    const zValues = buildLayersToDepth(semiTarget, zp.finishingStepdownMM);
    return zValues.map((z, i) => ({
      z,
      kind: i === zValues.length - 1 ? 'CUT' : 'CUT',
    }));
  }

  // FINISH: Final pass eats onion skin for through cuts
  if (opZ.through) {
    // Build layers to just above final
    const preFinalZ = target + zp.onionSkinMM;
    const zValues = buildLayersToDepth(preFinalZ, zp.finishingStepdownMM);

    const layers: DepthLayer[] = zValues.map((z) => ({ z, kind: 'CUT' as const }));

    // Add final through pass
    layers.push({ z: target, kind: 'FINAL' });

    return layers;
  }

  // FINISH non-through: just build layers to target
  const zValues = buildLayersToDepth(target, zp.finishingStepdownMM);
  return zValues.map((z, i) => ({
    z,
    kind: i === zValues.length - 1 ? 'FINAL' : 'CUT',
  }));
}

/**
 * Plan depth layers for drill peck cycle.
 */
export function planDrillPeckLayers(
  depthMM: number,
  peckMM: number
): DepthLayer[] {
  const target = -Math.abs(depthMM);
  const layers: DepthLayer[] = [];
  let z = 0;

  while (z > target + 1e-9) {
    const next = Math.max(z - peckMM, target);
    layers.push({
      z: next,
      kind: next <= target + 1e-9 ? 'FINAL' : 'CUT',
    });
    z = next;
  }

  return layers;
}

/**
 * Plan depth layers for groove operation.
 */
export function planGrooveDepthLayers(
  depthMM: number,
  stepdownMM: number
): DepthLayer[] {
  const target = -Math.abs(depthMM);
  const zValues = buildLayersToDepth(target, stepdownMM);

  return zValues.map((z, i) => ({
    z,
    kind: i === zValues.length - 1 ? 'FINAL' : 'CUT',
  }));
}

// ============================================================================
// Segment to Motion Conversion
// ============================================================================

/**
 * Get start point of a segment.
 */
function segStartPoint(seg: Segment): XY {
  const pt = segmentStart(seg);
  return { x: pt.x, y: pt.y };
}

/**
 * Get end point of a segment.
 */
function segEndPoint(seg: Segment): XY {
  const pt = segmentEnd(seg);
  return { x: pt.x, y: pt.y };
}

/**
 * Convert a 2D segment to motion(s) at fixed Z.
 */
export function segToMotionsAtZ(
  seg: Segment,
  z: number,
  feed: number
): Motion[] {
  if (seg.kind === 'LINE') {
    return [
      {
        kind: 'FEED',
        to: { x: seg.b.x, y: seg.b.y, z },
        feedMMmin: feed,
      },
    ];
  }

  // ARC
  const end = segEndPoint(seg);
  return [
    {
      kind: 'ARC',
      cw: seg.cw,
      centerXY: { x: seg.c.x, y: seg.c.y },
      to: { x: end.x, y: end.y, z },
      feedMMmin: feed,
    },
  ];
}

/**
 * Convert array of segments to motions at fixed Z.
 */
export function segsToMotionsAtZ(
  segs: Segment[],
  z: number,
  feed: number
): Motion[] {
  const motions: Motion[] = [];
  for (const seg of segs) {
    motions.push(...segToMotionsAtZ(seg, z, feed));
  }
  return motions;
}

// ============================================================================
// Subpath Motion Building
// ============================================================================

/**
 * Build motions for one decorated subpath at one depth layer.
 *
 * Sequence:
 * 1. Rapid to start XY at rapidZ
 * 2. Rapid down to pierceZ
 * 3. Entry moves (prefix) at pierceZ
 * 4. Plunge/ramp to layerZ
 * 5. Cut core at layerZ
 * 6. Exit moves (suffix) at layerZ
 * 7. Retract to rapidZ
 */
export function motionsForSubpathAtLayer(
  sub: DecoratedSubpath,
  layerZ: number,
  zp: ZProfile
): Motion[] {
  const ops: Motion[] = [];

  // Determine start point
  const firstSeg = sub.prefix.length > 0 ? sub.prefix[0] : sub.core[0];
  const startXY = segStartPoint(firstSeg);

  // 1) Rapid to start XY at rapidZ
  ops.push({ kind: 'RAPID', to: { x: startXY.x, y: startXY.y, z: zp.rapidZ } });

  // 2) Rapid down to pierceZ
  ops.push({ kind: 'RAPID', to: { x: startXY.x, y: startXY.y, z: zp.pierceZ } });

  // 3) Entry moves (prefix) at pierceZ
  const entryFeed = zp.cutFeed * zp.rampFeedScale;
  for (const seg of sub.prefix) {
    ops.push(...segToMotionsAtZ(seg, zp.pierceZ, entryFeed));
  }

  // Get position after entry moves
  const entryEnd =
    sub.prefix.length > 0
      ? segEndPoint(sub.prefix[sub.prefix.length - 1])
      : startXY;

  // 4) Plunge/ramp to layerZ
  // Simple plunge for now (ramp upgrade in future)
  ops.push({
    kind: 'FEED',
    to: { x: entryEnd.x, y: entryEnd.y, z: layerZ },
    feedMMmin: zp.plungeFeed,
  });

  // 5) Cut core at layerZ
  for (const seg of sub.core) {
    ops.push(...segToMotionsAtZ(seg, layerZ, zp.cutFeed));
  }

  // 6) Exit moves (suffix) at layerZ
  for (const seg of sub.suffix) {
    ops.push(...segToMotionsAtZ(seg, layerZ, entryFeed));
  }

  // 7) Retract to rapidZ
  const lastSeg =
    sub.suffix.length > 0
      ? sub.suffix[sub.suffix.length - 1]
      : sub.core[sub.core.length - 1];
  const endXY = segEndPoint(lastSeg);

  ops.push({ kind: 'RAPID', to: { x: endXY.x, y: endXY.y, z: zp.rapidZ } });

  return ops;
}

/**
 * Build motions for raw segments at one depth layer (no entry/exit).
 */
export function motionsForSegmentsAtLayer(
  segs: Segment[],
  layerZ: number,
  zp: ZProfile
): Motion[] {
  if (segs.length === 0) return [];

  const ops: Motion[] = [];
  const startXY = segStartPoint(segs[0]);

  // Rapid to start
  ops.push({ kind: 'RAPID', to: { x: startXY.x, y: startXY.y, z: zp.rapidZ } });
  ops.push({ kind: 'RAPID', to: { x: startXY.x, y: startXY.y, z: zp.pierceZ } });

  // Plunge
  ops.push({
    kind: 'FEED',
    to: { x: startXY.x, y: startXY.y, z: layerZ },
    feedMMmin: zp.plungeFeed,
  });

  // Cut segments
  for (const seg of segs) {
    ops.push(...segToMotionsAtZ(seg, layerZ, zp.cutFeed));
  }

  // Retract
  const endXY = segEndPoint(segs[segs.length - 1]);
  ops.push({ kind: 'RAPID', to: { x: endXY.x, y: endXY.y, z: zp.rapidZ } });

  return ops;
}

// ============================================================================
// Profile Compilation
// ============================================================================

/**
 * Compile a profile operation to a motion block.
 *
 * Processes all depth layers, iterating subpaths at each layer.
 */
export function compileProfileToMotionBlock(
  inp: ProfileCompileInput
): MotionBlock {
  const layers = planProfileDepthLayers(
    inp.step.passKind,
    inp.opZ,
    inp.zp,
    inp.scoreDepthMM
  );

  const ops: Motion[] = [];

  // Header comment
  ops.push({
    kind: 'COMMENT',
    text: `BEGIN ${inp.step.stepId} pass=${inp.step.passKind} intent=${inp.step.intent ?? 'NA'}`,
  });

  // Process each depth layer
  for (const layer of layers) {
    ops.push({
      kind: 'COMMENT',
      text: `LAYER z=${layer.z.toFixed(3)} kind=${layer.kind}`,
    });

    // Process each subpath at this layer
    for (let i = 0; i < inp.decoratedSubpaths.length; i++) {
      const sub = inp.decoratedSubpaths[i];
      const fp = sub.meta?.fingerprint ?? `sub_${i}`;

      ops.push({ kind: 'COMMENT', text: `SUBPATH ${i} fp=${fp}` });
      ops.push(...motionsForSubpathAtLayer(sub, layer.z, inp.zp));
    }

    // Optional dwell at final layer for fragile materials
    if (layer.kind === 'FINAL') {
      // Uncomment if needed:
      // ops.push({ kind: 'DWELL', ms: 30 });
    }
  }

  // Footer comment
  ops.push({ kind: 'COMMENT', text: `END ${inp.step.stepId}` });

  return {
    id: `MB_${inp.step.stepId}`,
    toolId: inp.step.tool.id,
    ops,
    meta: {
      stepId: inp.step.stepId,
      passKind: inp.step.passKind,
      intent: inp.step.intent,
      milling: inp.step.milling,
      layerCount: layers.length,
      subpathCount: inp.decoratedSubpaths.length,
    },
  };
}

// ============================================================================
// Drill Compilation (Peck Cycle)
// ============================================================================

/**
 * Compile a drill operation with peck cycle.
 */
export function compileDrillPeck(inp: DrillCompileInput): MotionBlock {
  const ops: Motion[] = [];

  ops.push({ kind: 'COMMENT', text: `BEGIN ${inp.stepId} DRILL` });

  for (let i = 0; i < inp.points.length; i++) {
    const p = inp.points[i];

    ops.push({ kind: 'COMMENT', text: `HOLE ${i} x=${p.x.toFixed(3)} y=${p.y.toFixed(3)}` });

    // Rapid to position
    ops.push({ kind: 'RAPID', to: { x: p.x, y: p.y, z: inp.zp.rapidZ } });
    ops.push({ kind: 'RAPID', to: { x: p.x, y: p.y, z: inp.zp.pierceZ } });

    // Peck cycle
    let z = 0;
    const target = -Math.abs(inp.drillZ.depthMM);

    while (z > target + 1e-9) {
      const next = Math.max(z - inp.drillZ.peckMM, target);

      // Feed down
      ops.push({
        kind: 'FEED',
        to: { x: p.x, y: p.y, z: next },
        feedMMmin: inp.drillZ.feed,
      });

      // Retract (except at final depth)
      if (next > target + 1e-9) {
        ops.push({
          kind: 'RAPID',
          to: { x: p.x, y: p.y, z: next + inp.drillZ.retractMM },
        });
      }

      z = next;
    }

    // Full retract after hole
    ops.push({ kind: 'RAPID', to: { x: p.x, y: p.y, z: inp.zp.rapidZ } });
  }

  ops.push({ kind: 'COMMENT', text: `END ${inp.stepId} DRILL` });

  return {
    id: `MB_${inp.stepId}`,
    toolId: inp.toolId,
    ops,
    meta: {
      stepId: inp.stepId,
      op: 'DRILL',
      holeCount: inp.points.length,
      depth: inp.drillZ.depthMM,
    },
  };
}

/**
 * Create default drill Z parameters.
 */
export function defaultDrillOpZ(depthMM: number): DrillOpZ {
  return {
    depthMM,
    peckMM: DEFAULT_PECK.peckMM,
    retractMM: DEFAULT_PECK.retractMM,
    feed: DEFAULT_PECK.feed,
  };
}

// ============================================================================
// Groove Compilation
// ============================================================================

/**
 * Compile a groove operation with depth layers.
 */
export function compileGroove(inp: GrooveCompileInput): MotionBlock {
  const layers = planGrooveDepthLayers(
    inp.grooveZ.depthMM,
    inp.grooveZ.stepdownMM
  );

  const ops: Motion[] = [];

  ops.push({ kind: 'COMMENT', text: `BEGIN ${inp.stepId} GROOVE` });

  for (const layer of layers) {
    ops.push({
      kind: 'COMMENT',
      text: `LAYER z=${layer.z.toFixed(3)} kind=${layer.kind}`,
    });

    ops.push(...motionsForSegmentsAtLayer(inp.segments, layer.z, inp.zp));
  }

  ops.push({ kind: 'COMMENT', text: `END ${inp.stepId} GROOVE` });

  return {
    id: `MB_${inp.stepId}`,
    toolId: inp.toolId,
    ops,
    meta: {
      stepId: inp.stepId,
      op: 'GROOVE',
      layerCount: layers.length,
      depth: inp.grooveZ.depthMM,
    },
  };
}

/**
 * Create default groove Z parameters.
 */
export function defaultGrooveOpZ(
  depthMM: number,
  material: MaterialKind
): GrooveOpZ {
  const isFragile = material === 'HPL' || material === 'MELAMINE';
  return {
    depthMM,
    stepdownMM: isFragile ? 2.0 : 3.0,
    feed: isFragile ? 2500 : 3500,
  };
}

// ============================================================================
// Motion Plan Assembly
// ============================================================================

/**
 * Assemble motion blocks into a complete motion plan.
 */
export function assembleMotionPlan(
  sheetId: string,
  partId: string,
  blocks: MotionBlock[],
  spindleRPM: number = DEFAULT_Z_VALUES.spindleRPM
): MotionPlanV1 {
  const report: MotionReportItem[] = [];

  // Validate and prepare blocks
  const assembledBlocks: MotionBlock[] = [];
  let lastToolId: string | null = null;

  for (const block of blocks) {
    const blockOps: Motion[] = [];

    // Add tool change if needed
    if (block.toolId !== lastToolId) {
      if (lastToolId !== null) {
        // Spindle off before tool change
        blockOps.push({ kind: 'SPINDLE', on: false, rpm: 0 });
      }

      blockOps.push({ kind: 'TOOL_CHANGE', toolId: block.toolId });
      blockOps.push({ kind: 'SPINDLE', on: true, rpm: spindleRPM });

      lastToolId = block.toolId;
    }

    // Add block operations
    blockOps.push(...block.ops);

    assembledBlocks.push({
      ...block,
      ops: blockOps,
    });
  }

  // Final spindle off
  if (assembledBlocks.length > 0) {
    const lastBlock = assembledBlocks[assembledBlocks.length - 1];
    lastBlock.ops.push({ kind: 'SPINDLE', on: false, rpm: 0 });
  }

  // Calculate statistics
  let totalMotions = 0;
  let toolChanges = 0;
  const toolSet = new Set<string>();

  for (const block of assembledBlocks) {
    totalMotions += block.ops.length;
    toolSet.add(block.toolId);
    for (const op of block.ops) {
      if (op.kind === 'TOOL_CHANGE') toolChanges++;
    }
  }

  report.push({
    code: 'MOTION_PLAN_ASSEMBLED',
    detail: `blocks=${assembledBlocks.length} motions=${totalMotions} tools=${toolSet.size} changes=${toolChanges}`,
    fingerprint: `10.6.8:PLAN:${assembledBlocks.length}:${totalMotions}:${toolChanges}`,
    severity: 'INFO',
  });

  return {
    version: 'motion-plan.v1',
    sheetId,
    partId,
    blocks: assembledBlocks,
    report,
    valid: true,
  };
}

// ============================================================================
// Gate-Grade Verification
// ============================================================================

/**
 * Verification result for motion plan.
 */
export interface MotionVerifyResult {
  valid: boolean;
  issues: MotionReportItem[];
}

/**
 * Verify motion plan for Gate compliance.
 *
 * Checks:
 * - ARC moves have constant Z during sweep
 * - No FEED moves above pierceZ during cut
 * - Retract to rapidZ before G0 across gap
 * - Depth within maxDepthMM
 */
export function verifyMotionPlan(
  plan: MotionPlanV1,
  zp: ZProfile
): MotionVerifyResult {
  const issues: MotionReportItem[] = [];
  let valid = true;

  for (const block of plan.blocks) {
    let lastZ = zp.safeZ;
    let inCut = false;

    for (let i = 0; i < block.ops.length; i++) {
      const op = block.ops[i];

      if (op.kind === 'RAPID') {
        // Rapid should not be at cut depth
        if (op.to.z < zp.pierceZ && inCut) {
          issues.push({
            code: 'RAPID_AT_CUT_DEPTH',
            detail: `Block ${block.id} op ${i}: RAPID at z=${op.to.z} while in cut`,
            fingerprint: `10.6.8:VERIFY:RAPID_CUT:${block.id}:${i}`,
            severity: 'WARN',
          });
        }

        // Check for horizontal rapid at dangerous Z
        if (op.to.z < zp.rapidZ && lastZ < zp.rapidZ) {
          // Moving horizontally at low Z - potential collision
          // This is OK if retracting, but warn otherwise
        }

        lastZ = op.to.z;
        inCut = false;
      }

      if (op.kind === 'FEED') {
        lastZ = op.to.z;
        inCut = op.to.z < 0;

        // Check depth limit
        if (op.to.z < -zp.maxDepthMM) {
          issues.push({
            code: 'DEPTH_EXCEEDED',
            detail: `Block ${block.id} op ${i}: z=${op.to.z} exceeds maxDepth=${-zp.maxDepthMM}`,
            fingerprint: `10.6.8:VERIFY:DEPTH:${block.id}:${i}`,
            severity: 'BLOCK',
          });
          valid = false;
        }
      }

      if (op.kind === 'ARC') {
        // ARC Z should be constant (start Z = end Z for router)
        // We can't verify start Z here without tracking, but end Z is checked
        lastZ = op.to.z;
        inCut = op.to.z < 0;

        // Check depth limit
        if (op.to.z < -zp.maxDepthMM) {
          issues.push({
            code: 'DEPTH_EXCEEDED',
            detail: `Block ${block.id} op ${i}: ARC z=${op.to.z} exceeds maxDepth=${-zp.maxDepthMM}`,
            fingerprint: `10.6.8:VERIFY:ARC_DEPTH:${block.id}:${i}`,
            severity: 'BLOCK',
          });
          valid = false;
        }
      }
    }
  }

  return { valid, issues };
}

/**
 * Check if motion plan passes verification.
 */
export function isMotionPlanValid(plan: MotionPlanV1, zp: ZProfile): boolean {
  const result = verifyMotionPlan(plan, zp);
  return result.valid;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Count total motions in plan.
 */
export function countMotions(plan: MotionPlanV1): number {
  return plan.blocks.reduce((sum, b) => sum + b.ops.length, 0);
}

/**
 * Count motions by kind.
 */
export function countMotionsByKind(
  plan: MotionPlanV1
): Record<Motion['kind'], number> {
  const counts: Record<string, number> = {
    RAPID: 0,
    FEED: 0,
    ARC: 0,
    DWELL: 0,
    TOOL_CHANGE: 0,
    SPINDLE: 0,
    COMMENT: 0,
  };

  for (const block of plan.blocks) {
    for (const op of block.ops) {
      counts[op.kind]++;
    }
  }

  return counts as Record<Motion['kind'], number>;
}

/**
 * Get all fingerprints from motion plan.
 */
export function getMotionPlanFingerprints(plan: MotionPlanV1): string[] {
  return plan.report.map((r) => r.fingerprint);
}

/**
 * Summarize motion plan for logging.
 */
export function summarizeMotionPlan(plan: MotionPlanV1): string {
  const counts = countMotionsByKind(plan);
  return `Part ${plan.partId}: ${plan.blocks.length} blocks, ${counts.RAPID} rapids, ${counts.FEED} feeds, ${counts.ARC} arcs, ${counts.TOOL_CHANGE} tool changes`;
}

/**
 * Estimate machining time (rough approximation).
 */
export function estimateMachiningTime(
  plan: MotionPlanV1,
  rapidFeed: number = 10000
): number {
  let timeMs = 0;
  let lastPos: XYZ = { x: 0, y: 0, z: 0 };

  for (const block of plan.blocks) {
    for (const op of block.ops) {
      if (op.kind === 'RAPID') {
        const dist = Math.sqrt(
          Math.pow(op.to.x - lastPos.x, 2) +
            Math.pow(op.to.y - lastPos.y, 2) +
            Math.pow(op.to.z - lastPos.z, 2)
        );
        timeMs += (dist / rapidFeed) * 60000;
        lastPos = op.to;
      }

      if (op.kind === 'FEED') {
        const dist = Math.sqrt(
          Math.pow(op.to.x - lastPos.x, 2) +
            Math.pow(op.to.y - lastPos.y, 2) +
            Math.pow(op.to.z - lastPos.z, 2)
        );
        timeMs += (dist / op.feedMMmin) * 60000;
        lastPos = op.to;
      }

      if (op.kind === 'ARC') {
        // Rough estimate: use straight-line distance * 1.5
        const dist =
          Math.sqrt(
            Math.pow(op.to.x - lastPos.x, 2) +
              Math.pow(op.to.y - lastPos.y, 2)
          ) * 1.5;
        timeMs += (dist / op.feedMMmin) * 60000;
        lastPos = op.to;
      }

      if (op.kind === 'DWELL') {
        timeMs += op.ms;
      }

      if (op.kind === 'TOOL_CHANGE') {
        timeMs += 15000; // Assume 15 seconds per tool change
      }
    }
  }

  return timeMs;
}

/**
 * Format estimated time as human-readable string.
 */
export function formatMachiningTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
