// src/core/manufacturing/verify/toolpathVerifier.ts
/**
 * Toolpath Verifier.
 *
 * Manufacturing-grade verification beyond kinematic simulation.
 * Validates against material thickness, tool constraints, tab integrity,
 * and fixture collision.
 *
 * Requires TraceMap for semantic context (opId, stage, s-param).
 *
 * v0.10.8.1 - Toolpath Verifier
 */

import { IRProgram, IRMove } from "../gcode/ir/gcodeIr.v1";
import { TraceMap, IRTrace } from "../post/ir/traceMap.v1";
import { MachineProfile } from "../post/profile/postProfile.v1";
import {
  VerifierReport,
  VerifyIssue,
  VerifyIssueCode,
  calculateBadge,
} from "./verifierReport.v1";
import {
  VerifyConfig,
  DEFAULT_VERIFY_CONFIG,
  getEffectiveVerifySeverity,
  VERIFY_RULES_VERSION,
} from "./verifyRules";
import { stableStringify, simpleHash } from "../audit/hashing";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Operation kind.
 */
export type OpKind = "PROFILE" | "POCKET" | "GROOVE" | "DRILL";

/**
 * Operation limits/constraints.
 */
export interface OpLimits {
  /** Operation ID */
  opId: string;

  /** Operation kind */
  kind: OpKind;

  /** Finished material thickness (mm) */
  finishedThicknessMm: number;

  /** Spoilboard penetration (mm) */
  spoilExtraMm?: number;

  /** Onion skin thickness (mm) */
  onionSkinMm?: number;

  /** Pocket/groove/drill depth (mm) */
  depthMm?: number;

  /** Tab intervals as [a,b] pairs in 0..1 perimeter parameter */
  tabIntervals01?: Array<{ a: number; b: number }>;

  /** Slot/groove width (mm) */
  slotWidthMm?: number;

  /** Minimum feature radius (mm) */
  featureMinRadiusMm?: number;
}

/**
 * Tool specification.
 */
export interface ToolSpec {
  /** Tool ID */
  toolId: string;

  /** Tool diameter (mm) */
  diameterMm: number;

  /** Flute length (mm) */
  fluteLenMm?: number;

  /** Maximum stepdown (mm) */
  maxStepdownMm: number;

  /** Tool radius (computed) */
  radiusMm?: number;
}

/**
 * Forbidden zone for clamp/fixture.
 */
export interface ForbiddenZone {
  /** Zone ID */
  id: string;

  /** Zone rectangle */
  rect: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };

  /** Minimum Z (clamp height above spoilboard) */
  zMin?: number;
}

/**
 * Verification request.
 */
export interface VerifyRequest {
  /** IR program */
  program: IRProgram;

  /** Trace map (aligned with IR moves) */
  traceMap: TraceMap;

  /** Machine profile */
  profile: MachineProfile;

  /** Operation limits by opId */
  opLimits: Record<string, OpLimits>;

  /** Tool specifications by toolId */
  toolSpecs: Record<string, ToolSpec>;

  /** Forbidden zones (clamps, keep-out) */
  forbiddenZones?: ForbiddenZone[];

  /** Verification configuration */
  config?: VerifyConfig;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if point is in rectangle.
 */
function inRect(
  x: number,
  y: number,
  rect: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

/**
 * Check if s-parameter is in any tab interval.
 */
function inTabIntervals(
  s: number,
  intervals: Array<{ a: number; b: number }>
): boolean {
  for (const { a, b } of intervals) {
    if (s >= a && s <= b) return true;
  }
  return false;
}

// =============================================================================
// VERIFIER
// =============================================================================

/**
 * Verify toolpath.
 *
 * @param req Verification request
 * @returns Verifier report with badge and issues
 */
export function verifyToolpath(req: VerifyRequest): VerifierReport {
  const config = req.config ?? DEFAULT_VERIFY_CONFIG;
  const tol = config.thresholds.positionTolerance;
  const depthTol = config.thresholds.depthTolerance;
  const safeZ = req.profile.kinematics.safeZ;
  const issues: VerifyIssue[] = [];

  // Helper: add issue
  function addIssue(
    code: VerifyIssueCode,
    message: string,
    opts?: {
      atMoveIndex?: number;
      opId?: string;
      passId?: string;
      toolId?: string;
      partId?: string;
      context?: Record<string, unknown>;
    }
  ): void {
    const severity = getEffectiveVerifySeverity(code, config);
    if (severity === null) return;

    issues.push({
      code,
      severity,
      message,
      ...opts,
    });
  }

  // Validate trace map alignment
  const moves = req.program.moves;
  const traces = req.traceMap.traces;

  if (traces.length !== moves.length) {
    addIssue("TRACE_MAP_MISMATCH", "TraceMap length does not match IR moves", {
      context: { traceLen: traces.length, moveLen: moves.length },
    });

    // Return early if trace map is invalid
    return buildReport(req, issues);
  }

  // State tracking
  let x = 0,
    y = 0,
    z = safeZ;
  let lastCutPos: { x: number; y: number; z: number } | null = null;
  let lastZ = z;

  // Process moves
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const trace = traces[i];

    // RAPID
    if (move.kind === "RAPID") {
      const nx = move.x ?? x;
      const ny = move.y ?? y;
      const nz = move.z ?? z;

      // Rapid XY below safeZ in forbidden zone
      if (
        req.forbiddenZones &&
        (move.x !== undefined || move.y !== undefined) &&
        nz < safeZ - config.thresholds.safeZThreshold
      ) {
        for (const zone of req.forbiddenZones) {
          if (inRect(nx, ny, zone.rect)) {
            addIssue(
              "RAPID_IN_CLAMP_ZONE_BELOW_SAFEZ",
              `Rapid through zone ${zone.id} at Z=${nz.toFixed(2)}`,
              { atMoveIndex: i, context: { zone, nx, ny, nz } }
            );
          }
        }
      }

      x = nx;
      y = ny;
      z = nz;
      lastCutPos = null; // Reset cut continuity
      continue;
    }

    // LINEAR
    if (move.kind === "LINEAR") {
      const nx = move.x ?? x;
      const ny = move.y ?? y;
      const nz = move.z ?? z;

      // Is this a cut move?
      const isCut = trace?.kind === "CUT" || nz < safeZ - config.thresholds.safeZThreshold;

      if (isCut) {
        const opId = trace?.opId;
        const toolId = trace?.toolId;
        const stage = trace?.stage;

        // Depth verification
        if (opId && req.opLimits[opId]) {
          const lim = req.opLimits[opId];
          const T = lim.finishedThicknessMm;

          if (lim.kind === "PROFILE") {
            const spoil = lim.spoilExtraMm ?? 0.6;
            const onion = lim.onionSkinMm ?? 0;

            if (stage === "THROUGH") {
              // THROUGH can go to -(T + spoil)
              const allowedMinZ = -(T + spoil) - depthTol;
              if (nz < allowedMinZ) {
                addIssue(
                  "Z_BELOW_ALLOWED",
                  `THROUGH cut too deep: Z=${nz.toFixed(2)} < ${allowedMinZ.toFixed(2)}`,
                  { atMoveIndex: i, opId, toolId, context: { nz, allowedMinZ, T, spoil } }
                );
              }
            } else {
              // ROUGH/FINISH must stay above onion plane
              const zOnion = -(T - onion);
              if (nz < zOnion - depthTol) {
                addIssue(
                  "Z_BELOW_ONION_PLANE",
                  `Stage ${stage} below onion plane: Z=${nz.toFixed(2)} < ${zOnion.toFixed(2)}`,
                  { atMoveIndex: i, opId, toolId, context: { nz, zOnion, T, onion, stage } }
                );
              }
            }
          } else {
            // POCKET/GROOVE/DRILL
            const depth = lim.depthMm ?? 0;
            const zTarget = -depth;
            if (nz < zTarget - depthTol) {
              addIssue(
                "Z_BELOW_ALLOWED",
                `Cut exceeds op depth: Z=${nz.toFixed(2)} < ${zTarget.toFixed(2)}`,
                { atMoveIndex: i, opId, toolId, context: { nz, zTarget, depth } }
              );
            }
          }

          // Tab zone enforcement
          if (
            lim.kind === "PROFILE" &&
            lim.tabIntervals01?.length &&
            stage !== "THROUGH" &&
            trace?.s !== undefined
          ) {
            if (inTabIntervals(trace.s, lim.tabIntervals01)) {
              addIssue(
                "TAB_ZONE_VIOLATION",
                `Cut in tab zone (s=${trace.s.toFixed(3)}) before THROUGH`,
                { atMoveIndex: i, opId, toolId, context: { s: trace.s, intervals: lim.tabIntervals01 } }
              );
            }
          }
        }

        // Flute length check
        if (toolId && req.toolSpecs[toolId]?.fluteLenMm !== undefined) {
          const flute = req.toolSpecs[toolId].fluteLenMm!;
          const margin = config.thresholds.fluteSafetyMargin;
          if (Math.abs(nz) > flute - margin) {
            addIssue(
              "FLUTE_TOO_SHORT",
              `Z=${Math.abs(nz).toFixed(2)} exceeds flute ${flute.toFixed(2)}`,
              { atMoveIndex: i, opId, toolId, context: { nz, flute, margin } }
            );
          }
        }

        // Stepdown check
        if (toolId && req.toolSpecs[toolId]) {
          const tool = req.toolSpecs[toolId];
          const stepdown = lastZ - nz;
          if (stepdown > 0 && stepdown > tool.maxStepdownMm * config.thresholds.stepdownWarningFactor) {
            addIssue(
              "STEPDOWN_EXCEEDS_LIMIT",
              `Stepdown ${stepdown.toFixed(2)} > max ${tool.maxStepdownMm}`,
              { atMoveIndex: i, opId, toolId, context: { stepdown, maxStepdown: tool.maxStepdownMm } }
            );
          }
        }

        // Forbidden zone check
        if (req.forbiddenZones) {
          for (const zone of req.forbiddenZones) {
            const zMin = zone.zMin ?? 0;
            if (inRect(nx, ny, zone.rect) && nz < zMin + tol) {
              addIssue(
                "CUT_IN_CLAMP_ZONE",
                `Cut enters zone ${zone.id} at Z=${nz.toFixed(2)}`,
                { atMoveIndex: i, opId, toolId, context: { zone, nx, ny, nz, zMin } }
              );
            }
          }
        }

        // Continuity check (jump without retract)
        if (lastCutPos) {
          const dxy = Math.hypot(nx - lastCutPos.x, ny - lastCutPos.y);
          if (dxy > config.thresholds.maxPathJump && Math.max(lastCutPos.z, nz) < safeZ - config.thresholds.safeZThreshold) {
            addIssue(
              "DISCONTINUITY_WITHOUT_RETRACT",
              `Path jump ${dxy.toFixed(1)}mm without retract`,
              { atMoveIndex: i, opId, toolId, context: { dxy, from: lastCutPos, to: { x: nx, y: ny, z: nz } } }
            );
          }
        }

        lastCutPos = { x: nx, y: ny, z: nz };
      }

      lastZ = z;
      x = nx;
      y = ny;
      z = nz;
      continue;
    }

    // ARC
    if (move.kind === "ARC_CW" || move.kind === "ARC_CCW") {
      const nx = move.x;
      const ny = move.y;

      const isCut = trace?.kind === "CUT" || z < safeZ - config.thresholds.safeZThreshold;

      if (isCut) {
        const opId = trace?.opId;
        const toolId = trace?.toolId;
        const stage = trace?.stage;

        // Forbidden zone check (endpoint only for MVP)
        if (req.forbiddenZones) {
          for (const zone of req.forbiddenZones) {
            const zMin = zone.zMin ?? 0;
            if (inRect(nx, ny, zone.rect) && z < zMin + tol) {
              addIssue(
                "CUT_IN_CLAMP_ZONE",
                `Arc enters zone ${zone.id}`,
                { atMoveIndex: i, opId, toolId, context: { zone, nx, ny, z } }
              );
            }
          }
        }

        // Tab zone check for arcs
        if (
          opId &&
          req.opLimits[opId]?.tabIntervals01?.length &&
          stage !== "THROUGH" &&
          trace?.s !== undefined
        ) {
          if (inTabIntervals(trace.s, req.opLimits[opId].tabIntervals01!)) {
            addIssue(
              "TAB_ZONE_VIOLATION",
              `Arc in tab zone (s=${trace.s.toFixed(3)}) before THROUGH`,
              { atMoveIndex: i, opId, toolId, context: { s: trace.s } }
            );
          }
        }

        // Continuity check
        if (lastCutPos) {
          const dxy = Math.hypot(nx - lastCutPos.x, ny - lastCutPos.y);
          if (dxy > config.thresholds.maxPathJump && z < safeZ - config.thresholds.safeZThreshold) {
            addIssue(
              "DISCONTINUITY_WITHOUT_RETRACT",
              `Arc discontinuity ${dxy.toFixed(1)}mm`,
              { atMoveIndex: i, opId, toolId, context: { dxy } }
            );
          }
        }

        lastCutPos = { x: nx, y: ny, z };
      }

      x = nx;
      y = ny;
      continue;
    }

    // Other moves - no geometry tracking needed
  }

  // Post-scan: feature compatibility checks
  for (const opId of Object.keys(req.opLimits)) {
    const lim = req.opLimits[opId];

    // Slot/groove width vs tool diameter
    if (lim.kind === "GROOVE" && lim.slotWidthMm !== undefined) {
      const toolIds = new Set(
        traces
          .filter((t) => t.opId === opId)
          .map((t) => t.toolId)
          .filter(Boolean) as string[]
      );

      for (const toolId of toolIds) {
        const tool = req.toolSpecs[toolId];
        if (!tool) continue;

        if (lim.slotWidthMm < tool.diameterMm - tol) {
          addIssue(
            "FEATURE_TOO_SMALL_FOR_TOOL",
            `Slot ${lim.slotWidthMm}mm < tool ${tool.diameterMm}mm`,
            { opId, toolId, context: { slotWidth: lim.slotWidthMm, toolDia: tool.diameterMm } }
          );
        }
      }
    }

    // Inner radius check
    if (lim.featureMinRadiusMm !== undefined) {
      const toolIds = new Set(
        traces
          .filter((t) => t.opId === opId)
          .map((t) => t.toolId)
          .filter(Boolean) as string[]
      );

      for (const toolId of toolIds) {
        const tool = req.toolSpecs[toolId];
        if (!tool) continue;

        const toolRadius = tool.diameterMm / 2;
        if (lim.featureMinRadiusMm < toolRadius * config.thresholds.innerRadiusTolerance) {
          addIssue(
            "INNER_RADIUS_LIMIT",
            `Feature radius ${lim.featureMinRadiusMm}mm < tool radius ${toolRadius}mm`,
            { opId, toolId, context: { featureRadius: lim.featureMinRadiusMm, toolRadius } }
          );
        }
      }
    }
  }

  return buildReport(req, issues);
}

/**
 * Build verifier report.
 */
function buildReport(req: VerifyRequest, issues: VerifyIssue[]): VerifierReport {
  const badge = calculateBadge(issues);

  const reportBase = {
    version: "1.0" as const,
    jobId: req.program.jobId,
    sheetId: req.program.sheetId,
    irFp: req.program.audit.irFp,
    issues,
    badge,
    audit: {
      rulesVersion: VERIFY_RULES_VERSION,
      verifiedAt: new Date().toISOString(),
      verifierVersion: "0.10.8.1",
      reportFp: "",
    },
  };

  // Calculate fingerprint
  const reportFp = simpleHash(
    stableStringify({ ...reportBase, audit: { ...reportBase.audit, reportFp: undefined } })
  );

  return {
    ...reportBase,
    audit: { ...reportBase.audit, reportFp },
  };
}

// =============================================================================
// QUICK VERIFICATION
// =============================================================================

/**
 * Quick verification (returns pass/fail only).
 */
export function quickVerify(req: VerifyRequest): boolean {
  const report = verifyToolpath(req);
  return report.badge.status === "PASS";
}

/**
 * Get blocking issues only.
 */
export function getBlockingIssuesOnly(req: VerifyRequest): VerifyIssue[] {
  const report = verifyToolpath(req);
  return report.issues.filter((i) => i.severity === "BLOCK");
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create op limits for profile operation.
 */
export function createProfileOpLimits(
  opId: string,
  finishedThicknessMm: number,
  spoilExtraMm: number = 0.6,
  onionSkinMm: number = 0,
  tabIntervals01?: Array<{ a: number; b: number }>
): OpLimits {
  return {
    opId,
    kind: "PROFILE",
    finishedThicknessMm,
    spoilExtraMm,
    onionSkinMm,
    tabIntervals01,
  };
}

/**
 * Create op limits for pocket operation.
 */
export function createPocketOpLimits(
  opId: string,
  finishedThicknessMm: number,
  depthMm: number
): OpLimits {
  return {
    opId,
    kind: "POCKET",
    finishedThicknessMm,
    depthMm,
  };
}

/**
 * Create op limits for groove/slot operation.
 */
export function createGrooveOpLimits(
  opId: string,
  finishedThicknessMm: number,
  depthMm: number,
  slotWidthMm: number
): OpLimits {
  return {
    opId,
    kind: "GROOVE",
    finishedThicknessMm,
    depthMm,
    slotWidthMm,
  };
}

/**
 * Create op limits for drill operation.
 */
export function createDrillOpLimits(
  opId: string,
  finishedThicknessMm: number,
  depthMm: number
): OpLimits {
  return {
    opId,
    kind: "DRILL",
    finishedThicknessMm,
    depthMm,
  };
}

/**
 * Create tool spec from profile tool.
 */
export function createToolSpec(
  toolId: string,
  diameterMm: number,
  maxStepdownMm: number,
  fluteLenMm?: number
): ToolSpec {
  return {
    toolId,
    diameterMm,
    maxStepdownMm,
    fluteLenMm,
    radiusMm: diameterMm / 2,
  };
}
