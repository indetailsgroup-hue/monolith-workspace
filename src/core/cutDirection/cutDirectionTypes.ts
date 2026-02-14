// src/core/cutDirection/cutDirectionTypes.ts
/**
 * Cut Direction Policy Types.
 *
 * Material-driven climb/conventional milling direction engine
 * for CNC toolpath generation.
 *
 * Key concepts:
 * - Spindle CW (standard) → CLIMB: outside=CCW, inside=CW
 * - Material surface protection (laminate face-up)
 * - Tool class overrides (compression bits)
 *
 * v0.10.6.4 - Climb / Conventional Policy Engine
 */

// =============================================================================
// MATERIAL & TOOL ENUMS
// =============================================================================

/**
 * Material surface tag for direction decisions.
 *
 * Laminates (HPL, MELAMINE, VENEER) need surface protection:
 * - Tool should exit into substrate, not laminate
 * - Affects climb vs conventional choice
 */
export type MaterialTag =
  | "HPL"
  | "MELAMINE"
  | "VENEER"
  | "MDF"
  | "HMR"
  | "PLYWOOD"
  | "SOLID_WOOD"
  | "RAW";

/**
 * CNC tool classification affecting direction choice.
 *
 * - COMPRESSION: Both up/down cut, good for laminates
 * - DOWNCUT: Pushes chips down, clean top surface
 * - UPCUT: Pulls chips up, clean bottom surface
 * - STRAIGHT: Neutral, follows material preference
 */
export type ToolClass =
  | "COMPRESSION"
  | "DOWNCUT"
  | "UPCUT"
  | "STRAIGHT"
  | "VBIT"
  | "BALLNOSE";

/**
 * Operation type for context-aware decisions.
 */
export type OpKind = "PROFILE" | "GROOVE" | "POCKET" | "DRILL";

/**
 * Cut side relative to material.
 *
 * - OUTSIDE: Tool on exterior of closed path (part remains)
 * - INSIDE: Tool on interior of closed path (cutout)
 * - ON: Tool follows path centerline (groove/engrave)
 */
export type CutSide = "OUTSIDE" | "INSIDE" | "ON";

/**
 * Pass type for multi-pass strategies.
 *
 * - ROUGH: Material removal pass (speed over finish)
 * - FINISH: Final pass (quality over speed)
 */
export type PassKind = "ROUGH" | "FINISH";

/**
 * Milling direction mode.
 *
 * - CLIMB: Tool feeds in same direction as rotation
 *   - Pros: Better finish, less heat, longer tool life
 *   - Cons: Can grab/climb on loose material
 *
 * - CONVENTIONAL: Tool feeds against rotation
 *   - Pros: Safer for manual machines, no climb tendency
 *   - Cons: More friction, rougher finish
 */
export type MillMode = "CLIMB" | "CONVENTIONAL";

// =============================================================================
// CUT CONTEXT
// =============================================================================

/**
 * Context for cut direction decision.
 *
 * Provides all information needed by policy to determine
 * optimal milling direction.
 */
export interface CutContext {
  /** Material surface tag */
  material: MaterialTag;

  /** Tool classification */
  tool: ToolClass;

  /** Operation type */
  op: OpKind;

  /** Cut side relative to material */
  side: CutSide;

  /** Pass type (rough vs finish) */
  pass: PassKind;

  /**
   * Laminate face orientation.
   * - "TOP": Laminate on top surface (common)
   * - "BOTTOM": Laminate on bottom surface
   * - "BOTH": Double-sided laminate
   * - "NONE": No laminate (raw material)
   */
  laminateFace?: "TOP" | "BOTTOM" | "BOTH" | "NONE";

  /**
   * Spindle rotation direction.
   * - "CW": Clockwise (standard, default)
   * - "CCW": Counter-clockwise (rare)
   */
  spindleDirection?: "CW" | "CCW";
}

// =============================================================================
// DIRECTION DECISION
// =============================================================================

/**
 * Result of cut direction policy decision.
 */
export interface DirectionDecision {
  /** Chosen milling mode */
  mode: MillMode;

  /**
   * Path winding order for this cut.
   *
   * For spindle CW (standard):
   * - CLIMB outside cut: CCW path winding
   * - CLIMB inside cut: CW path winding
   * - CONVENTIONAL: inverse of above
   */
  pathWinding: "CW" | "CCW";

  /**
   * Reason code for decision (debugging/audit).
   */
  reason: string;

  /**
   * Confidence level.
   * - "HIGH": Clear rule match
   * - "MEDIUM": Heuristic/fallback
   * - "LOW": Default/uncertain
   */
  confidence: "HIGH" | "MEDIUM" | "LOW";

  /**
   * Warnings for operator review.
   */
  warnings?: string[];
}

// =============================================================================
// POLICY INTERFACE
// =============================================================================

/**
 * Cut direction policy interface.
 *
 * Implementations can be:
 * - DefaultCutDirectionPolicy: Standard rules
 * - MaterialOverridePolicy: Factory-specific overrides
 * - ConservativePolicy: Always conventional (safe mode)
 */
export interface CutDirectionPolicy {
  /**
   * Policy name for identification.
   */
  readonly name: string;

  /**
   * Policy version for compatibility.
   */
  readonly version: string;

  /**
   * Make direction decision for given context.
   *
   * @param ctx Cut context with material, tool, operation info
   * @returns Direction decision with mode, winding, and reason
   */
  decide(ctx: CutContext): DirectionDecision;

  /**
   * Check if policy supports given material.
   *
   * @param material Material tag to check
   * @returns True if policy has rules for this material
   */
  supportsMaterial(material: MaterialTag): boolean;

  /**
   * Get default mode for unknown contexts.
   */
  getDefaultMode(): MillMode;
}

// =============================================================================
// PATH TYPES (for reversal utility)
// =============================================================================

/**
 * Line segment in path.
 */
export interface LineSegment {
  kind: "LINE";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Arc segment in path.
 */
export interface ArcSegment {
  kind: "ARC";
  cx: number;
  cy: number;
  r: number;
  startDeg: number;
  endDeg: number;
  cw: boolean;
}

/**
 * Path segment (LINE or ARC).
 */
export type PathSegment = LineSegment | ArcSegment;

/**
 * Path with segments for toolpath generation.
 */
export interface ToolPath {
  /** Unique path identifier */
  id?: string;

  /** Path segments */
  segs: PathSegment[];

  /** Current winding direction (if known) */
  winding?: "CW" | "CCW";

  /** Signed area (positive = CCW, negative = CW) */
  signedArea?: number;
}

// =============================================================================
// HELPER CONSTANTS
// =============================================================================

/**
 * Materials that have laminate surfaces requiring protection.
 */
export const LAMINATE_MATERIALS: ReadonlySet<MaterialTag> = new Set([
  "HPL",
  "MELAMINE",
  "VENEER",
]);

/**
 * Materials that are "raw" (no surface protection needed).
 */
export const RAW_MATERIALS: ReadonlySet<MaterialTag> = new Set([
  "MDF",
  "HMR",
  "PLYWOOD",
  "SOLID_WOOD",
  "RAW",
]);

/**
 * Tools that override material preference.
 */
export const DIRECTION_NEUTRAL_TOOLS: ReadonlySet<ToolClass> = new Set([
  "COMPRESSION",
]);
