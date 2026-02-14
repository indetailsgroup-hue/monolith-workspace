// src/core/cutDirection/cutDirectionPolicy.ts
/**
 * Default Cut Direction Policy Implementation.
 *
 * Material-driven climb/conventional milling direction engine.
 *
 * Decision rules (priority order):
 * 1. Compression bit → CLIMB (tool handles both directions)
 * 2. Laminate TOP + DOWNCUT → CONVENTIONAL (protect surface)
 * 3. Laminate TOP + UPCUT → CLIMB (exit into substrate)
 * 4. Raw material → CLIMB (better finish, default)
 *
 * Path winding (spindle CW standard):
 * - CLIMB outside: CCW
 * - CLIMB inside: CW
 * - CONVENTIONAL: inverse
 *
 * v0.10.6.4 - Climb / Conventional Policy Engine
 */

import {
  CutContext,
  CutDirectionPolicy,
  DirectionDecision,
  MaterialTag,
  MillMode,
  LAMINATE_MATERIALS,
  DIRECTION_NEUTRAL_TOOLS,
} from "./cutDirectionTypes";

// =============================================================================
// DEFAULT POLICY IMPLEMENTATION
// =============================================================================

/**
 * Default cut direction policy with standard rules.
 *
 * This policy implements industry-standard practices for:
 * - Laminate surface protection
 * - Tool-specific overrides
 * - Inside/outside path winding
 */
export class DefaultCutDirectionPolicy implements CutDirectionPolicy {
  readonly name = "DefaultCutDirectionPolicy";
  readonly version = "0.10.6.4";

  /**
   * Make direction decision for given context.
   *
   * Decision flow:
   * 1. Check tool overrides (compression → climb)
   * 2. Check laminate rules (surface protection)
   * 3. Default to climb for raw materials
   */
  decide(ctx: CutContext): DirectionDecision {
    const warnings: string[] = [];

    // Determine spindle direction (default CW)
    const spindleCW = (ctx.spindleDirection ?? "CW") === "CW";

    // Rule 1: Compression bit → always CLIMB
    if (DIRECTION_NEUTRAL_TOOLS.has(ctx.tool)) {
      return this._buildDecision(
        "CLIMB",
        ctx.side,
        spindleCW,
        "COMPRESSION_TOOL_CLIMB",
        "HIGH"
      );
    }

    // Rule 2: Laminate materials need surface protection
    if (LAMINATE_MATERIALS.has(ctx.material)) {
      return this._decideLaminate(ctx, spindleCW, warnings);
    }

    // Rule 3: Raw materials → default CLIMB for better finish
    return this._buildDecision(
      "CLIMB",
      ctx.side,
      spindleCW,
      "RAW_MATERIAL_DEFAULT_CLIMB",
      "HIGH"
    );
  }

  /**
   * Handle laminate material direction decisions.
   *
   * Key principle: Tool should exit into substrate, not laminate.
   *
   * For laminate on TOP:
   * - DOWNCUT tool pushes down → use CONVENTIONAL to avoid tearout
   * - UPCUT tool pulls up → use CLIMB (safe, exits into substrate)
   *
   * For laminate on BOTTOM:
   * - Inverse of above
   */
  private _decideLaminate(
    ctx: CutContext,
    spindleCW: boolean,
    warnings: string[]
  ): DirectionDecision {
    const laminateFace = ctx.laminateFace ?? "TOP";

    // Double-sided laminate: conservative approach
    if (laminateFace === "BOTH") {
      warnings.push("Double-sided laminate: using conservative CONVENTIONAL");
      return this._buildDecision(
        "CONVENTIONAL",
        ctx.side,
        spindleCW,
        "LAMINATE_BOTH_SIDES_CONSERVATIVE",
        "MEDIUM",
        warnings
      );
    }

    // No laminate specified: treat as raw
    if (laminateFace === "NONE") {
      return this._buildDecision(
        "CLIMB",
        ctx.side,
        spindleCW,
        "LAMINATE_NONE_DEFAULT_CLIMB",
        "MEDIUM"
      );
    }

    // Laminate on TOP (most common)
    if (laminateFace === "TOP") {
      return this._decideLaminateTop(ctx, spindleCW, warnings);
    }

    // Laminate on BOTTOM
    return this._decideLaminateBottom(ctx, spindleCW, warnings);
  }

  /**
   * Handle laminate on TOP surface.
   *
   * DOWNCUT tool + CLIMB = chip ejection toward TOP = bad for laminate
   * DOWNCUT tool + CONVENTIONAL = chip ejection toward BOTTOM = safe
   *
   * UPCUT tool + CLIMB = chip ejection toward BOTTOM = safe
   * UPCUT tool + CONVENTIONAL = chip ejection toward TOP = bad
   */
  private _decideLaminateTop(
    ctx: CutContext,
    spindleCW: boolean,
    warnings: string[]
  ): DirectionDecision {
    switch (ctx.tool) {
      case "DOWNCUT":
        // Downcut + laminate top → CONVENTIONAL protects surface
        return this._buildDecision(
          "CONVENTIONAL",
          ctx.side,
          spindleCW,
          "LAMINATE_TOP_DOWNCUT_CONVENTIONAL",
          "HIGH"
        );

      case "UPCUT":
        // Upcut + laminate top → CLIMB is safe (exits into substrate)
        return this._buildDecision(
          "CLIMB",
          ctx.side,
          spindleCW,
          "LAMINATE_TOP_UPCUT_CLIMB",
          "HIGH"
        );

      case "STRAIGHT":
        // Straight flute: conservative approach
        warnings.push("Straight flute on laminate: consider compression bit");
        return this._buildDecision(
          "CONVENTIONAL",
          ctx.side,
          spindleCW,
          "LAMINATE_TOP_STRAIGHT_CONSERVATIVE",
          "MEDIUM",
          warnings
        );

      case "VBIT":
      case "BALLNOSE":
        // Engraving tools: climb for cleaner edges
        return this._buildDecision(
          "CLIMB",
          ctx.side,
          spindleCW,
          "LAMINATE_TOP_ENGRAVE_CLIMB",
          "MEDIUM"
        );

      default:
        // Unknown tool: conservative
        return this._buildDecision(
          "CONVENTIONAL",
          ctx.side,
          spindleCW,
          "LAMINATE_TOP_UNKNOWN_CONSERVATIVE",
          "LOW",
          ["Unknown tool type: using conservative CONVENTIONAL"]
        );
    }
  }

  /**
   * Handle laminate on BOTTOM surface.
   *
   * Inverse of TOP rules.
   */
  private _decideLaminateBottom(
    ctx: CutContext,
    spindleCW: boolean,
    warnings: string[]
  ): DirectionDecision {
    switch (ctx.tool) {
      case "DOWNCUT":
        // Downcut + laminate bottom → CLIMB is safe
        return this._buildDecision(
          "CLIMB",
          ctx.side,
          spindleCW,
          "LAMINATE_BOTTOM_DOWNCUT_CLIMB",
          "HIGH"
        );

      case "UPCUT":
        // Upcut + laminate bottom → CONVENTIONAL protects surface
        return this._buildDecision(
          "CONVENTIONAL",
          ctx.side,
          spindleCW,
          "LAMINATE_BOTTOM_UPCUT_CONVENTIONAL",
          "HIGH"
        );

      case "STRAIGHT":
        warnings.push("Straight flute on laminate: consider compression bit");
        return this._buildDecision(
          "CLIMB",
          ctx.side,
          spindleCW,
          "LAMINATE_BOTTOM_STRAIGHT_CLIMB",
          "MEDIUM",
          warnings
        );

      default:
        return this._buildDecision(
          "CLIMB",
          ctx.side,
          spindleCW,
          "LAMINATE_BOTTOM_DEFAULT_CLIMB",
          "MEDIUM"
        );
    }
  }

  /**
   * Build direction decision with path winding calculation.
   *
   * Path winding rules for spindle CW (standard):
   *
   * CLIMB mode:
   * - OUTSIDE cut: Tool on right of path → CCW winding
   * - INSIDE cut: Tool on left of path → CW winding
   *
   * CONVENTIONAL mode:
   * - OUTSIDE cut: Tool on left of path → CW winding
   * - INSIDE cut: Tool on right of path → CCW winding
   *
   * For spindle CCW: invert all windings.
   */
  private _buildDecision(
    mode: MillMode,
    side: "OUTSIDE" | "INSIDE" | "ON",
    spindleCW: boolean,
    reason: string,
    confidence: "HIGH" | "MEDIUM" | "LOW",
    warnings?: string[]
  ): DirectionDecision {
    // Calculate path winding
    let pathWinding: "CW" | "CCW";

    if (side === "ON") {
      // Centerline cut: default to CCW (arbitrary but consistent)
      pathWinding = "CCW";
    } else if (mode === "CLIMB") {
      // CLIMB: outside=CCW, inside=CW (for spindle CW)
      pathWinding = side === "OUTSIDE" ? "CCW" : "CW";
    } else {
      // CONVENTIONAL: outside=CW, inside=CCW (for spindle CW)
      pathWinding = side === "OUTSIDE" ? "CW" : "CCW";
    }

    // Invert for spindle CCW
    if (!spindleCW) {
      pathWinding = pathWinding === "CW" ? "CCW" : "CW";
    }

    const decision: DirectionDecision = {
      mode,
      pathWinding,
      reason,
      confidence,
    };

    if (warnings && warnings.length > 0) {
      decision.warnings = warnings;
    }

    return decision;
  }

  /**
   * Check if policy supports given material.
   */
  supportsMaterial(material: MaterialTag): boolean {
    // Default policy supports all standard materials
    return [
      "HPL",
      "MELAMINE",
      "VENEER",
      "MDF",
      "HMR",
      "PLYWOOD",
      "SOLID_WOOD",
      "RAW",
    ].includes(material);
  }

  /**
   * Get default mode for unknown contexts.
   */
  getDefaultMode(): MillMode {
    return "CLIMB";
  }
}

// =============================================================================
// CONSERVATIVE POLICY (Safe Mode)
// =============================================================================

/**
 * Conservative policy that always uses CONVENTIONAL.
 *
 * Use when:
 * - Machine is not rigid enough for climb milling
 * - Material is unknown or unpredictable
 * - Safety is priority over finish quality
 */
export class ConservativeCutDirectionPolicy implements CutDirectionPolicy {
  readonly name = "ConservativeCutDirectionPolicy";
  readonly version = "0.10.6.4";

  decide(ctx: CutContext): DirectionDecision {
    const spindleCW = (ctx.spindleDirection ?? "CW") === "CW";

    // Always CONVENTIONAL for safety
    let pathWinding: "CW" | "CCW";

    if (ctx.side === "ON") {
      pathWinding = "CCW";
    } else {
      // CONVENTIONAL: outside=CW, inside=CCW
      pathWinding = ctx.side === "OUTSIDE" ? "CW" : "CCW";
    }

    if (!spindleCW) {
      pathWinding = pathWinding === "CW" ? "CCW" : "CW";
    }

    return {
      mode: "CONVENTIONAL",
      pathWinding,
      reason: "CONSERVATIVE_POLICY_ALWAYS_CONVENTIONAL",
      confidence: "HIGH",
    };
  }

  supportsMaterial(_material: MaterialTag): boolean {
    return true; // Supports all materials
  }

  getDefaultMode(): MillMode {
    return "CONVENTIONAL";
  }
}

// =============================================================================
// SINGLETON INSTANCES
// =============================================================================

/**
 * Default policy instance.
 */
export const defaultCutDirectionPolicy = new DefaultCutDirectionPolicy();

/**
 * Conservative policy instance.
 */
export const conservativeCutDirectionPolicy =
  new ConservativeCutDirectionPolicy();
