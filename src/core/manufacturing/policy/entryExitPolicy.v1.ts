// src/core/manufacturing/policy/entryExitPolicy.v1.ts
/**
 * Entry/Exit Strategy Policy Types.
 *
 * Material-driven entry/exit strategies for CNC toolpath generation.
 *
 * Key concepts:
 * - Entry mode: How tool enters material (ramp, arc, plunge)
 * - Exit mode: How tool exits (lead-out, lift)
 * - Material-aware: Laminate surfaces need gentle entry
 * - Tool-aware: Compression bits vs up/down cut
 * - Geometry-aware: Open spans (tabs) vs closed loops
 *
 * Integration:
 * - 10.6.5 tabs: Re-entry after rapid across gap
 * - 10.6.4 direction: Entry respects cutting direction
 * - 10.7.x dialect: Maps to machine-specific G-code
 *
 * v0.10.6.6 - Entry/Exit Strategy per Material
 */

// =============================================================================
// ENTRY/EXIT MODES
// =============================================================================

/**
 * Entry mode - how tool enters material.
 *
 * - RAMP_LINE: Linear ramp along tangent direction
 * - RAMP_ARC: Arc lead-in with Z ramp (cleanest for laminates)
 * - PLUNGE_PECK: Peck plunge (rare for routing, used in drilling)
 * - PLUNGE_SOFT: Slow linear plunge (fallback)
 */
export type EntryMode = "RAMP_LINE" | "RAMP_ARC" | "PLUNGE_PECK" | "PLUNGE_SOFT";

/**
 * Exit mode - how tool exits material.
 *
 * - LEAD_OUT: Lead-out arc or line before retract
 * - NONE: Direct retract (OK for open spans)
 */
export type ExitMode = "LEAD_OUT" | "NONE";

// =============================================================================
// TUNING PARAMETERS
// =============================================================================

/**
 * Entry/exit tuning parameters.
 *
 * These control the geometry and feeds for entry/exit moves.
 */
export interface EntryExitTuning {
  /** Lead-in/out length in XY plane (mm) */
  leadLenMm: number;

  /** Arc radius for arc lead-in (mm) */
  leadArcRadMm?: number;

  /** Z ramp angle (degrees, e.g., 3°) */
  rampAngleDeg: number;

  /** Maximum ramp length cap (mm) */
  rampMaxLenMm: number;

  /** Feed rate for plunge/ramp entry (mm/min) */
  plungeFeed: number;

  /** Main cutting feed rate (mm/min) */
  cutFeed: number;

  /** Small lift before rapid (mm) - reduces drag marks */
  exitLiftMm: number;
}

/**
 * Default tuning for general materials.
 */
export const DEFAULT_ENTRY_EXIT_TUNING: EntryExitTuning = {
  leadLenMm: 10,
  leadArcRadMm: 8,
  rampAngleDeg: 3.0,
  rampMaxLenMm: 30,
  plungeFeed: 1000,
  cutFeed: 5000,
  exitLiftMm: 0.5,
};

// =============================================================================
// CONTEXT
// =============================================================================

/**
 * Material specification for entry/exit decisions.
 */
export interface MaterialSpec {
  /** Core material type */
  core: "MDF" | "HMR" | "HPL" | "MELAMINE" | "PLYWOOD" | "SOLID_WOOD" | "PARTICLE";

  /** Surface A material (top) */
  surfaceA?: "HPL" | "MELAMINE" | "VENEER" | "RAW";

  /** Surface B material (bottom) */
  surfaceB?: "HPL" | "MELAMINE" | "VENEER" | "RAW";

  /** Pre-computed: has any laminate surface */
  hasLaminate: boolean;

  /** Panel thickness (mm) - affects ramp calculations */
  thicknessMm?: number;
}

/**
 * Geometry context for entry/exit decisions.
 */
export interface GeometrySpec {
  /** Is this an open span (tabs mode) vs closed loop */
  isOpenSpan: boolean;

  /** Unit tangent vector at start point */
  startTangent: { x: number; y: number };

  /** Unit tangent vector at end point */
  endTangent: { x: number; y: number };

  /** Kerf risk level (derived from material + pass) */
  kerfRisk: "HIGH" | "NORMAL" | "LOW";

  /** Start point coordinates */
  startPoint?: { x: number; y: number };

  /** End point coordinates */
  endPoint?: { x: number; y: number };
}

/**
 * Machine capabilities for entry/exit decisions.
 */
export interface MachineSpec {
  /** Supports arc interpolation (G2/G3) */
  supportsArc: boolean;

  /** Supports helical interpolation (arc with Z) */
  supportsHelical?: boolean;

  /** Safe Z height for rapid moves (mm) */
  safeZ: number;

  /** Clearance Z for transitions (mm) */
  clearanceZ?: number;

  /** Maximum plunge feed the machine allows (mm/min) */
  maxPlungeFeed?: number;
}

/**
 * Tool class for entry/exit decisions.
 */
export type ToolClass =
  | "COMPRESSION"
  | "DOWNCUT"
  | "UPCUT"
  | "STRAIGHT"
  | "VBIT"
  | "BALLNOSE";

/**
 * Operation kind for entry/exit decisions.
 */
export type OpKind = "PROFILE" | "GROOVE" | "POCKET" | "DRILL";

/**
 * Pass type for entry/exit decisions.
 */
export type PassKind = "ROUGH" | "FINISH";

/**
 * Complete context for entry/exit decision.
 */
export interface EntryExitContext {
  /** Operation type */
  opKind: OpKind;

  /** Pass type (rough vs finish) */
  pass: PassKind;

  /** Tool classification */
  toolClass: ToolClass;

  /** Material specification */
  material: MaterialSpec;

  /** Geometry specification */
  geometry: GeometrySpec;

  /** Machine capabilities */
  machine: MachineSpec;

  /** Cut depth (negative Z, mm) */
  cutZ?: number;

  /** Span index (for multi-span jobs) */
  spanIndex?: number;

  /** Total span count */
  totalSpans?: number;
}

// =============================================================================
// DECISION
// =============================================================================

/**
 * Entry configuration.
 */
export interface EntryConfig {
  /** Entry mode */
  mode: EntryMode;

  /** Tuning parameters */
  tuning: EntryExitTuning;
}

/**
 * Exit configuration.
 */
export interface ExitConfig {
  /** Exit mode */
  mode: ExitMode;

  /** Exit-specific tuning */
  tuning: Pick<EntryExitTuning, "leadLenMm" | "exitLiftMm">;
}

/**
 * Complete entry/exit decision.
 */
export interface EntryExitDecision {
  /** Entry configuration */
  entry: EntryConfig;

  /** Exit configuration */
  exit: ExitConfig;

  /** Reason codes for audit trail */
  reasonCodes: string[];

  /** Confidence level */
  confidence: "HIGH" | "MEDIUM" | "LOW";

  /** Warnings for operator review */
  warnings?: string[];
}

// =============================================================================
// POLICY INTERFACE
// =============================================================================

/**
 * Entry/exit policy interface.
 *
 * Implementations provide material-aware entry/exit strategies.
 */
export interface EntryExitPolicy {
  /** Policy version */
  readonly version: string;

  /** Policy name */
  readonly name: string;

  /**
   * Make entry/exit decision for given context.
   *
   * @param ctx Context with material, tool, geometry info
   * @returns Entry/exit decision with modes, tuning, and reasons
   */
  decide(ctx: EntryExitContext): EntryExitDecision;

  /**
   * Check if policy supports given material.
   *
   * @param material Material specification
   * @returns True if policy has rules for this material
   */
  supportsMaterial(material: MaterialSpec): boolean;

  /**
   * Get default entry mode for unknown contexts.
   */
  getDefaultEntryMode(): EntryMode;
}

// =============================================================================
// GATE ISSUE CODES
// =============================================================================

/**
 * Entry/exit related gate issue codes.
 */
export type EntryExitIssueCode =
  | "ENTRY_STRATEGY_MISSING"
  | "ENTRY_FEED_TOO_HIGH_FOR_LAMINATE"
  | "LEADIN_COLLIDES_TAB_ZONE"
  | "LEADIN_OUTSIDE_MATERIAL"
  | "EXIT_STRATEGY_MISSING"
  | "RAMP_ANGLE_TOO_STEEP"
  | "PLUNGE_FEED_EXCEEDS_LIMIT";

/**
 * Entry/exit issue for gate checks.
 */
export interface EntryExitIssue {
  code: EntryExitIssueCode;
  severity: "BLOCK" | "WARN" | "INFO";
  message: string;
  data?: Record<string, unknown>;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if material has laminate surface.
 */
export function hasLaminateSurface(material: MaterialSpec): boolean {
  const isLam = (t?: string) =>
    t === "HPL" || t === "MELAMINE" || t === "VENEER";
  return (
    material.hasLaminate ||
    isLam(material.surfaceA) ||
    isLam(material.surfaceB)
  );
}

/**
 * Determine kerf risk level from material and pass.
 */
export function determineKerfRisk(
  material: MaterialSpec,
  pass: PassKind
): "HIGH" | "NORMAL" | "LOW" {
  if (hasLaminateSurface(material) && pass === "FINISH") {
    return "HIGH";
  }
  if (hasLaminateSurface(material)) {
    return "NORMAL";
  }
  return "LOW";
}

/**
 * Create material spec with automatic laminate detection.
 */
export function createMaterialSpec(
  core: MaterialSpec["core"],
  surfaceA?: MaterialSpec["surfaceA"],
  surfaceB?: MaterialSpec["surfaceB"],
  thicknessMm?: number
): MaterialSpec {
  const isLam = (t?: string) =>
    t === "HPL" || t === "MELAMINE" || t === "VENEER";

  return {
    core,
    surfaceA,
    surfaceB,
    hasLaminate: isLam(surfaceA) || isLam(surfaceB),
    thicknessMm,
  };
}
