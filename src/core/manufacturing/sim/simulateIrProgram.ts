// src/core/manufacturing/sim/simulateIrProgram.ts
/**
 * IR Program Simulator.
 *
 * Deterministic simulation of IRProgram for safety verification.
 * Tracks CNC kinematics state and validates against factory rules.
 *
 * Key checks:
 * - Safety invariants (rapid below safeZ, spindle/tool ordering)
 * - Geometry continuity (jumps without retract)
 * - Bounds checking (sheet limits, forbidden zones)
 * - Time and distance estimation
 *
 * v0.10.7.3 - Simulation Kernel
 */

import { IRProgram, IRMove } from "../gcode/ir/gcodeIr.v1";
import {
  SimulationReport,
  SimIssue,
  SimStats,
  SheetBounds,
  ForbiddenZone,
  SimIssueCode,
  isInBounds,
  isInRect,
} from "./simReport.v1";
import {
  SimConfig,
  DEFAULT_SIM_CONFIG,
  getEffectiveSeverity,
  RULES_VERSION,
} from "./simRules";
import {
  Point3D,
  dist3D,
  distOptional,
  calculateArcGeometry,
} from "./arcUtils";
import { stableStringify, simpleHash } from "../audit/hashing";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Simulation request.
 */
export interface SimulationRequest {
  /** IR program to simulate */
  program: IRProgram;

  /** Safe Z height (mm) */
  safeZ: number;

  /** Sheet bounds */
  sheetBounds: SheetBounds;

  /** Forbidden zones (clamps, keep-out areas) */
  forbiddenZones?: ForbiddenZone[];

  /** Rapid feed rate (mm/min) from machine profile */
  rapidFeedMmPerMin: number;

  /** Simulation configuration */
  config?: SimConfig;
}

/**
 * Simulator state.
 */
interface SimState {
  /** Current X position */
  x: number;

  /** Current Y position */
  y: number;

  /** Current Z position */
  z: number;

  /** Current feed rate */
  feed: number;

  /** Spindle on/off */
  spindleOn: boolean;

  /** Current tool number */
  currentTool: number | null;
}

// =============================================================================
// SIMULATOR
// =============================================================================

/**
 * Simulate IR program.
 *
 * @param req Simulation request
 * @returns Simulation report with verdict and issues
 */
export function simulateIrProgram(req: SimulationRequest): SimulationReport {
  const config = req.config ?? DEFAULT_SIM_CONFIG;
  const tol = config.thresholds.boundsTolerance;
  const issues: SimIssue[] = [];

  // Initialize state
  const state: SimState = {
    x: 0,
    y: 0,
    z: req.safeZ,
    feed: 0,
    spindleOn: false,
    currentTool: null,
  };

  // Statistics
  let rapidDist = 0;
  let cutDist = 0;
  let timeSec = 0;
  let toolChanges = 0;
  let arcCount = 0;
  let tinySegmentCount = 0;

  // Bounds tracking
  let minX = state.x,
    minY = state.y,
    maxX = state.x,
    maxY = state.y;
  let minZ = state.z,
    maxZ = state.z;

  // Helper: add issue
  function addIssue(
    code: SimIssueCode,
    message: string,
    moveIndex: number,
    context?: Record<string, unknown>
  ): void {
    const severity = getEffectiveSeverity(code, config);
    if (severity === null) return; // Rule disabled

    issues.push({
      code,
      severity,
      message,
      atMoveIndex: moveIndex,
      context,
    });
  }

  // Helper: update bounds
  function updateBounds(nx: number, ny: number, nz: number): void {
    minX = Math.min(minX, nx);
    minY = Math.min(minY, ny);
    maxX = Math.max(maxX, nx);
    maxY = Math.max(maxY, ny);
    minZ = Math.min(minZ, nz);
    maxZ = Math.max(maxZ, nz);
  }

  // Helper: check sheet bounds
  function checkSheetBounds(nx: number, ny: number, moveIndex: number): void {
    if (!isInBounds(nx, ny, req.sheetBounds, tol)) {
      addIssue(
        "OUT_OF_SHEET_BOUNDS",
        `Position out of bounds: X${nx.toFixed(3)} Y${ny.toFixed(3)}`,
        moveIndex,
        { x: nx, y: ny, bounds: req.sheetBounds }
      );
    }
  }

  // Helper: check forbidden zones
  function checkForbiddenZones(
    nx: number,
    ny: number,
    nz: number,
    moveIndex: number
  ): void {
    if (!req.forbiddenZones) return;

    for (const zone of req.forbiddenZones) {
      // Check XY bounds
      if (isInRect(nx, ny, zone.rect)) {
        // Check Z if zone has height
        if (zone.zMin !== undefined && nz < zone.zMin) {
          // Below clamp height - collision
          addIssue(
            "ENTER_FORBIDDEN_ZONE",
            `Entered forbidden zone: ${zone.id} (${zone.kind})`,
            moveIndex,
            { zone, x: nx, y: ny, z: nz }
          );
        } else if (zone.zMin === undefined) {
          // Full height zone - always collision
          addIssue(
            "ENTER_FORBIDDEN_ZONE",
            `Entered forbidden zone: ${zone.id} (${zone.kind})`,
            moveIndex,
            { zone, x: nx, y: ny, z: nz }
          );
        }
      }
    }
  }

  // Helper: add time from distance and feed
  function addTime(distMm: number, feedMmPerMin: number): void {
    if (feedMmPerMin <= 0) return;
    timeSec += (distMm / feedMmPerMin) * 60;
  }

  // Process moves
  const moves = req.program.moves;

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];

    // SET_FEED
    if (move.kind === "SET_FEED") {
      state.feed = move.feed;
      if (move.feed <= 0) {
        addIssue("FEED_ZERO_OR_NEG", `Feed <= 0: ${move.feed}`, i, {
          feed: move.feed,
        });
      }
      continue;
    }

    // SPINDLE_ON
    if (move.kind === "SPINDLE_ON") {
      state.spindleOn = true;
      continue;
    }

    // SPINDLE_OFF
    if (move.kind === "SPINDLE_OFF") {
      state.spindleOn = false;
      continue;
    }

    // TOOL_CHANGE
    if (move.kind === "TOOL_CHANGE") {
      if (state.spindleOn) {
        addIssue(
          "TOOLCHANGE_WITH_SPINDLE_ON",
          `Tool change to T${move.toolNumber} while spindle on`,
          i,
          { toolNumber: move.toolNumber }
        );
      }
      state.currentTool = move.toolNumber;
      toolChanges++;
      continue;
    }

    // RAPID
    if (move.kind === "RAPID") {
      const nx = move.x ?? state.x;
      const ny = move.y ?? state.y;
      const nz = move.z ?? state.z;

      // Safety: rapid XY below safeZ
      if (
        (move.x !== undefined || move.y !== undefined) &&
        state.z < req.safeZ - tol
      ) {
        addIssue(
          "RAPID_XY_BELOW_SAFEZ",
          `Rapid XY at Z=${state.z.toFixed(3)} below safeZ=${req.safeZ}`,
          i,
          { z: state.z, safeZ: req.safeZ }
        );
      }

      // Calculate distance and time
      const d = distOptional(state, { x: nx, y: ny, z: nz });
      rapidDist += d;
      addTime(d, req.rapidFeedMmPerMin);

      // Update state
      state.x = nx;
      state.y = ny;
      state.z = nz;

      updateBounds(state.x, state.y, state.z);
      checkSheetBounds(state.x, state.y, i);
      checkForbiddenZones(state.x, state.y, state.z, i);
      continue;
    }

    // LINEAR
    if (move.kind === "LINEAR") {
      const nx = move.x ?? state.x;
      const ny = move.y ?? state.y;
      const nz = move.z ?? state.z;

      // Safety: cut without spindle
      if (!state.spindleOn) {
        addIssue(
          "CUT_MOVE_WITHOUT_SPINDLE",
          "Linear cut while spindle off",
          i
        );
      }

      // Calculate distance
      const d = distOptional(state, { x: nx, y: ny, z: nz });
      cutDist += d;

      // Tiny segment check
      if (d < config.thresholds.minSegmentLength) {
        tinySegmentCount++;
      }

      // Feed and time
      const effectiveFeed = move.feed ?? state.feed;
      addTime(d, effectiveFeed);

      // Jump detection: large XY move at low Z
      const xyJump = Math.hypot(nx - state.x, ny - state.y);
      if (
        xyJump > config.thresholds.maxJumpAtLowZ &&
        Math.max(state.z, nz) < req.safeZ - tol
      ) {
        addIssue(
          "JUMP_WITHOUT_RETRACT",
          `Large XY jump (${xyJump.toFixed(1)}mm) at low Z`,
          i,
          { xyJump, z: state.z, nz }
        );
      }

      // Plunge rate check
      const zDelta = state.z - nz;
      if (zDelta > 0 && effectiveFeed > 0) {
        // Plunging down
        const plungeRate = (zDelta / d) * effectiveFeed;
        if (plungeRate > config.thresholds.maxPlungeRate) {
          addIssue(
            "EXCESSIVE_PLUNGE_RATE",
            `Plunge rate ${plungeRate.toFixed(0)} mm/min exceeds limit`,
            i,
            { plungeRate, zDelta, feed: effectiveFeed }
          );
        }
      }

      // Update state
      state.x = nx;
      state.y = ny;
      state.z = nz;

      updateBounds(state.x, state.y, state.z);
      checkSheetBounds(state.x, state.y, i);
      checkForbiddenZones(state.x, state.y, state.z, i);
      continue;
    }

    // ARC_CW / ARC_CCW
    if (move.kind === "ARC_CW" || move.kind === "ARC_CCW") {
      const nx = move.x;
      const ny = move.y;
      const isClockwise = move.kind === "ARC_CW";

      // Safety: cut without spindle
      if (!state.spindleOn) {
        addIssue(
          "CUT_MOVE_WITHOUT_SPINDLE",
          `Arc cut while spindle off`,
          i
        );
      }

      // Calculate arc geometry
      const geo = calculateArcGeometry(
        { x: state.x, y: state.y },
        { x: nx, y: ny },
        move.i,
        move.j,
        isClockwise
      );

      cutDist += geo.length;
      arcCount++;

      // Arc radius consistency
      if (geo.radiusMismatch > config.thresholds.arcRadiusTolerance) {
        addIssue(
          "ARC_RADIUS_MISMATCH",
          `Arc radius mismatch: start=${geo.startRadius.toFixed(3)} end=${geo.endRadius.toFixed(3)}`,
          i,
          { startRadius: geo.startRadius, endRadius: geo.endRadius }
        );
      }

      // Time
      const effectiveFeed = move.feed ?? state.feed;
      addTime(geo.length, effectiveFeed);

      // Update state (Z unchanged in IJ arc)
      state.x = nx;
      state.y = ny;

      updateBounds(state.x, state.y, state.z);
      checkSheetBounds(state.x, state.y, i);
      checkForbiddenZones(state.x, state.y, state.z, i);
      continue;
    }

    // DWELL
    if (move.kind === "DWELL") {
      timeSec += move.ms / 1000;
      continue;
    }

    // Other moves (COMMENT, SET_UNITS, etc.) - no geometry
  }

  // Post-simulation checks
  if (tinySegmentCount > config.thresholds.tinySegmentThreshold) {
    addIssue(
      "TINY_SEGMENTS",
      `${tinySegmentCount} tiny segments detected (< ${config.thresholds.minSegmentLength}mm)`,
      -1,
      { count: tinySegmentCount }
    );
  }

  if (moves.length > config.thresholds.maxMoves) {
    addIssue(
      "TOO_MANY_MOVES",
      `Program has ${moves.length} moves (limit: ${config.thresholds.maxMoves})`,
      -1,
      { moveCount: moves.length }
    );
  }

  // Build stats
  const stats: SimStats = {
    totalMoves: moves.length,
    rapidDistanceMm: Math.round(rapidDist * 1000) / 1000,
    cutDistanceMm: Math.round(cutDist * 1000) / 1000,
    estimatedTimeSec: Math.round(timeSec * 1000) / 1000,
    minZ: Math.round(minZ * 1000) / 1000,
    maxZ: Math.round(maxZ * 1000) / 1000,
    bounds: {
      minX: Math.round(minX * 1000) / 1000,
      minY: Math.round(minY * 1000) / 1000,
      maxX: Math.round(maxX * 1000) / 1000,
      maxY: Math.round(maxY * 1000) / 1000,
    },
    toolChanges,
    arcCount,
  };

  // Determine verdict
  const hasErrors = issues.some((i) => i.severity === "ERROR");
  const verdict = hasErrors ? "FAIL" : "PASS";

  // Build report (without fingerprint first)
  const reportBase: Omit<SimulationReport, "audit"> & {
    audit: Omit<SimulationReport["audit"], "reportFp">;
  } = {
    version: "1.0",
    jobId: req.program.jobId,
    sheetId: req.program.sheetId,
    programFp: req.program.audit.irFp,
    issues,
    stats,
    verdict,
    audit: {
      rulesVersion: RULES_VERSION,
      simulatedAt: new Date().toISOString(),
      simulatorVersion: "0.10.7.3",
    },
  };

  // Calculate report fingerprint
  const reportFp = simpleHash(stableStringify(reportBase));

  return {
    ...reportBase,
    audit: {
      ...reportBase.audit,
      reportFp,
    },
  } as SimulationReport;
}

// =============================================================================
// QUICK SIMULATION
// =============================================================================

/**
 * Quick simulation check (returns verdict only).
 *
 * @param program IR program
 * @param safeZ Safe Z height
 * @param sheetBounds Sheet bounds
 * @param rapidFeed Rapid feed rate
 * @returns True if simulation passes
 */
export function quickSimulate(
  program: IRProgram,
  safeZ: number,
  sheetBounds: SheetBounds,
  rapidFeed: number
): boolean {
  const report = simulateIrProgram({
    program,
    safeZ,
    sheetBounds,
    rapidFeedMmPerMin: rapidFeed,
  });
  return report.verdict === "PASS";
}

/**
 * Get simulation statistics only (no issues).
 *
 * @param program IR program
 * @param safeZ Safe Z height
 * @param rapidFeed Rapid feed rate
 * @returns Simulation statistics
 */
export function getSimulationStats(
  program: IRProgram,
  safeZ: number,
  rapidFeed: number
): SimStats {
  const report = simulateIrProgram({
    program,
    safeZ,
    sheetBounds: { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity },
    rapidFeedMmPerMin: rapidFeed,
    config: {
      ...DEFAULT_SIM_CONFIG,
      // Disable all rules for stats-only
      overrides: {
        RAPID_XY_BELOW_SAFEZ: { disabled: true },
        TOOLCHANGE_WITH_SPINDLE_ON: { disabled: true },
        CUT_MOVE_WITHOUT_SPINDLE: { disabled: true },
        JUMP_WITHOUT_RETRACT: { disabled: true },
        OUT_OF_SHEET_BOUNDS: { disabled: true },
        ENTER_FORBIDDEN_ZONE: { disabled: true },
        EXCESSIVE_PLUNGE_RATE: { disabled: true },
        TINY_SEGMENTS: { disabled: true },
        ARC_RADIUS_MISMATCH: { disabled: true },
        FEED_ZERO_OR_NEG: { disabled: true },
        TOO_MANY_MOVES: { disabled: true },
      },
    },
  });
  return report.stats;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create simulation request from machine profile.
 */
export function createSimRequestFromProfile(
  program: IRProgram,
  profile: {
    kinematics: { safeZ: number; maxX?: number; maxY?: number };
  },
  sheetWidth: number,
  sheetHeight: number,
  rapidFeed: number = 24000,
  forbiddenZones?: ForbiddenZone[]
): SimulationRequest {
  return {
    program,
    safeZ: profile.kinematics.safeZ,
    sheetBounds: {
      minX: 0,
      minY: 0,
      maxX: sheetWidth,
      maxY: sheetHeight,
    },
    forbiddenZones,
    rapidFeedMmPerMin: rapidFeed,
  };
}

/**
 * Create clamp forbidden zone.
 */
export function createClampZone(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  clampHeight?: number
): ForbiddenZone {
  return {
    id,
    kind: "CLAMP",
    rect: {
      minX: x,
      minY: y,
      maxX: x + width,
      maxY: y + height,
    },
    zMin: clampHeight,
    description: `Clamp at (${x}, ${y})`,
  };
}

/**
 * Create vacuum pod zone.
 */
export function createVacuumPodZone(
  id: string,
  x: number,
  y: number,
  diameter: number
): ForbiddenZone {
  const radius = diameter / 2;
  return {
    id,
    kind: "VACUUM_POD",
    rect: {
      minX: x - radius,
      minY: y - radius,
      maxX: x + radius,
      maxY: y + radius,
    },
    description: `Vacuum pod at (${x}, ${y})`,
  };
}
