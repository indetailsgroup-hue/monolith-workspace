// src/core/manufacturing/post/ir/buildIrProgram.ts
/**
 * IR Program Builder.
 *
 * Builds IRProgram from ToolChangePlan and compiled toolpaths.
 * Bridges 10.6.9 (tool change plan) with 10.7.1 (G-code IR).
 *
 * Algorithm:
 * 1. Emit IR header (units, abs, plane)
 * 2. For each node in order:
 *    - Tool change if needed (retract + spindle off + M6 + spindle on)
 *    - For each toolpath: rapid to start, entry, cut segments, exit, retract
 * 3. Emit spindle off + program end
 *
 * v0.10.7.2 - Post-Processor Profiles
 */

import { IRProgram, IRMove } from "../../gcode/ir/gcodeIr.v1";
import { MachineProfile, getToolNumber } from "../profile/postProfile.v1";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Compiled segment (G1/G2/G3).
 */
export type CompiledSegment =
  | { kind: "G1"; x: number; y: number; z?: number; feed?: number }
  | { kind: "G2"; x: number; y: number; i: number; j: number; feed?: number }
  | { kind: "G3"; x: number; y: number; i: number; j: number; feed?: number };

/**
 * Compiled toolpath.
 */
export interface CompiledPath {
  /** Path identifier */
  pathId: string;

  /** Start point */
  start: { x: number; y: number };

  /** Path segments */
  segs: CompiledSegment[];

  /** End point */
  end: { x: number; y: number };
}

/**
 * Compiled node (one pass at one Z level).
 */
export interface CompiledNode {
  /** Tool ID */
  toolId: string;

  /** Compiled toolpaths */
  toolpaths: CompiledPath[];

  /** Safe Z height for this node */
  safeZ: number;

  /** Cut Z (zBottom) */
  cutZ: number;

  /** Spindle RPM */
  rpm: number;

  /** Feed rates */
  feeds: {
    cut: number;
    plunge: number;
  };

  /** Pre-compiled entry moves */
  entryMoves: IRMove[];

  /** Pre-compiled exit moves */
  exitMoves: IRMove[];
}

/**
 * IR build request.
 */
export interface BuildIrRequest {
  /** Machine profile */
  profile: MachineProfile;

  /** Job ID */
  jobId: string;

  /** Sheet ID */
  sheetId: string;

  /** Plan fingerprint (sha256 of ToolChangePlan) */
  planFp: string;

  /** Compiled nodes by node ID */
  compiled: Record<string, CompiledNode>;

  /** Ordered node IDs (from ToolChangePlan blocks flatten) */
  orderedNodeIds: string[];

  /** Tool sequence (for reference) */
  orderedToolIds: string[];
}

// =============================================================================
// IR BUILDER
// =============================================================================

/**
 * Build IR program from compiled nodes.
 *
 * @param req Build request
 * @returns IR program
 */
export function buildIrProgram(req: BuildIrRequest): IRProgram {
  const { profile, jobId, sheetId, planFp, compiled, orderedNodeIds } = req;
  const safeZ = profile.kinematics.safeZ;
  const moves: IRMove[] = [];

  // Emit IR-level header
  moves.push({ kind: "SET_UNITS", unit: "MM" });
  moves.push({ kind: "SET_ABS", abs: true });
  moves.push({ kind: "SET_PLANE", plane: "XY" });
  moves.push({ kind: "COMMENT", text: `JOB ${jobId} SHEET ${sheetId}` });

  // Track current state
  let currentTool: string | null = null;
  let spindleOn = false;

  // Process nodes in order
  for (const nodeId of orderedNodeIds) {
    const node = compiled[nodeId];
    if (!node) {
      throw new Error(`Missing compiled node: ${nodeId}`);
    }

    // Tool change if needed
    if (currentTool !== node.toolId) {
      // Safety: retract to safeZ
      moves.push({ kind: "RAPID", z: safeZ });

      // Spindle off before tool change
      if (spindleOn) {
        moves.push({ kind: "SPINDLE_OFF" });
        spindleOn = false;
      }

      // Tool change
      const toolNumber = getToolNumber(profile, node.toolId);
      moves.push({
        kind: "TOOL_CHANGE",
        toolNumber,
        toolId: node.toolId,
      });

      // Spindle on
      moves.push({
        kind: "SPINDLE_ON",
        rpm: node.rpm,
        cw: profile.kinematics.spindleCW,
      });
      spindleOn = true;

      currentTool = node.toolId;
    }

    // Process each toolpath
    for (const tp of node.toolpaths) {
      // Ensure at safeZ
      moves.push({ kind: "RAPID", z: Math.max(safeZ, node.safeZ) });

      // Rapid to path start
      moves.push({ kind: "RAPID", x: tp.start.x, y: tp.start.y });

      // Entry moves (ramp, lead-in, etc.)
      for (const em of node.entryMoves) {
        moves.push(em);
      }

      // Set cut feed
      moves.push({ kind: "SET_FEED", feed: node.feeds.cut });

      // Emit path segments
      for (const seg of tp.segs) {
        if (seg.kind === "G1") {
          moves.push({
            kind: "LINEAR",
            x: seg.x,
            y: seg.y,
            z: seg.z,
            feed: seg.feed,
          });
        } else if (seg.kind === "G2") {
          moves.push({
            kind: "ARC_CW",
            x: seg.x,
            y: seg.y,
            i: seg.i,
            j: seg.j,
            feed: seg.feed,
          });
        } else if (seg.kind === "G3") {
          moves.push({
            kind: "ARC_CCW",
            x: seg.x,
            y: seg.y,
            i: seg.i,
            j: seg.j,
            feed: seg.feed,
          });
        }
      }

      // Exit moves (lead-out, etc.)
      for (const em of node.exitMoves) {
        moves.push(em);
      }

      // Retract to safeZ
      moves.push({ kind: "RAPID", z: Math.max(safeZ, node.safeZ) });
    }
  }

  // Program end
  if (spindleOn) {
    moves.push({ kind: "SPINDLE_OFF" });
  }
  moves.push({ kind: "PROGRAM_END" });

  // Calculate IR fingerprint
  const irFp = calculateIrFingerprint(moves);

  return {
    version: "1.0",
    jobId,
    sheetId,
    moves,
    audit: {
      planFp,
      irFp,
      generatedAt: new Date().toISOString(),
      builderVersion: "0.10.7.2",
    },
  };
}

/**
 * Calculate IR fingerprint (simple hash).
 */
function calculateIrFingerprint(moves: IRMove[]): string {
  // Simple deterministic hash
  const str = JSON.stringify(moves);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create empty compiled node (for testing).
 */
export function createEmptyCompiledNode(
  toolId: string,
  safeZ: number,
  cutZ: number,
  rpm: number,
  feeds: { cut: number; plunge: number }
): CompiledNode {
  return {
    toolId,
    toolpaths: [],
    safeZ,
    cutZ,
    rpm,
    feeds,
    entryMoves: [],
    exitMoves: [],
  };
}

/**
 * Create linear entry moves (simple plunge).
 */
export function createLinearEntryMoves(
  startZ: number,
  targetZ: number,
  plungeFeed: number
): IRMove[] {
  return [
    { kind: "LINEAR", z: targetZ, feed: plungeFeed },
  ];
}

/**
 * Create ramp entry moves.
 */
export function createRampEntryMoves(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  targetZ: number,
  plungeFeed: number
): IRMove[] {
  return [
    { kind: "LINEAR", x: endX, y: endY, z: targetZ, feed: plungeFeed },
  ];
}

/**
 * Create lead-out exit moves.
 */
export function createLeadOutMoves(
  endX: number,
  endY: number,
  leadLen: number,
  tangentAngle: number,
  cutFeed: number
): IRMove[] {
  const leadX = endX + leadLen * Math.cos(tangentAngle);
  const leadY = endY + leadLen * Math.sin(tangentAngle);
  return [
    { kind: "LINEAR", x: leadX, y: leadY, feed: cutFeed },
  ];
}

/**
 * Estimate IR program time (rough estimate).
 *
 * @param program IR program
 * @param rapidFeed Rapid feed rate (mm/min)
 * @returns Estimated time in seconds
 */
export function estimateIrProgramTime(
  program: IRProgram,
  rapidFeed: number = 15000
): number {
  let totalTime = 0;
  let currentFeed = 1000;
  let lastPos = { x: 0, y: 0, z: 0 };

  for (const move of program.moves) {
    if (move.kind === "SET_FEED") {
      currentFeed = move.feed;
    } else if (move.kind === "RAPID") {
      const dist = calculateDistance(lastPos, move);
      totalTime += (dist / rapidFeed) * 60; // seconds
      if (move.x !== undefined) lastPos.x = move.x;
      if (move.y !== undefined) lastPos.y = move.y;
      if (move.z !== undefined) lastPos.z = move.z;
    } else if (move.kind === "LINEAR") {
      const dist = calculateDistance(lastPos, move);
      const feed = move.feed ?? currentFeed;
      totalTime += (dist / feed) * 60;
      if (move.x !== undefined) lastPos.x = move.x;
      if (move.y !== undefined) lastPos.y = move.y;
      if (move.z !== undefined) lastPos.z = move.z;
    } else if (move.kind === "ARC_CW" || move.kind === "ARC_CCW") {
      // Approximate arc length
      const dist = calculateDistance(lastPos, move) * 1.5; // rough arc estimate
      const feed = move.feed ?? currentFeed;
      totalTime += (dist / feed) * 60;
      lastPos.x = move.x;
      lastPos.y = move.y;
    } else if (move.kind === "TOOL_CHANGE") {
      totalTime += 30; // 30 seconds per tool change
    } else if (move.kind === "DWELL") {
      totalTime += move.ms / 1000;
    }
  }

  return Math.round(totalTime);
}

function calculateDistance(
  from: { x: number; y: number; z: number },
  to: { x?: number; y?: number; z?: number }
): number {
  const dx = (to.x ?? from.x) - from.x;
  const dy = (to.y ?? from.y) - from.y;
  const dz = (to.z ?? from.z) - from.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
